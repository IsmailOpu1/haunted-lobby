import { Room, type Client } from "colyseus";
import {
  cleanPlayerName,
  config,
  generateRoomCode,
  initialMoveState,
  initPhysics,
  PhysicsWorld,
  sanitizeInput,
  SIM_DT,
  stepMovement,
  type CollideFn,
  type JoinOptions,
  type MapData,
  type MoveInput,
  type MoveState,
  type RosterEntry,
  type ServerMessages,
} from "@haunted/shared";
import { defaultMap } from "@haunted/maps";
import { Door, GameState, Player } from "./state.ts";

// Codes in use by rooms on this server process. One process is enough for v1
// (PRD Section 9: one 2 vCPU server holds 5 rooms).
const activeCodes = new Set<string>();

function uniqueRoomCode(): string {
  let code = generateRoomCode();
  while (activeCodes.has(code)) code = generateRoomCode();
  activeCodes.add(code);
  return code;
}

/** Server-only data for one connected player. */
interface PlayerSim {
  move: MoveState;
  collide: CollideFn;
  removeBody: () => void;
  inputs: MoveInput[];
  /** Seconds of input this player may still apply (anti speed-hack, see tick()). */
  budget: number;
}

export class HauntedRoom extends Room<{ state: GameState }> {
  maxClients = config.players.max;
  state = new GameState();
  patchRate = 1000 / config.net.tickRate;

  private map: MapData = defaultMap;
  private physics!: PhysicsWorld;
  private sims = new Map<string, PlayerSim>();
  private spawnIndex = 0;

  async onCreate() {
    // The 5-letter room code is the Colyseus room id, so friends join with joinById(code).
    this.roomId = uniqueRoomCode();

    await initPhysics();
    this.physics = new PhysicsWorld(this.map);
    for (const door of this.map.doors) this.state.doors.set(door.id, new Door({ open: false }));

    this.onMessage("input", (client, raw: unknown) => {
      const sim = this.sims.get(client.sessionId);
      const input = sanitizeInput(raw);
      if (!sim || !input) return;
      sim.inputs.push(input);
      // A client that floods inputs only loses its oldest ones.
      if (sim.inputs.length > config.net.maxQueuedInputs) sim.inputs.shift();
    });

    this.onMessage("flashlight", (client) => {
      const player = this.state.players.get(client.sessionId);
      if (player) player.flashlightOn = !player.flashlightOn;
    });

    this.onMessage("interact", (client) => this.toggleNearestDoor(client.sessionId));

    this.setSimulationInterval((deltaMs) => this.tick(deltaMs / 1000), 1000 / config.net.tickRate);
  }

  onJoin(client: Client, options?: JoinOptions) {
    const name = cleanPlayerName(options?.name);
    if (!name) throw new Error(`Name must be 1 to ${config.room.nameMaxLength} characters`);

    const spawn = this.map.spawns[this.spawnIndex++ % this.map.spawns.length]!;
    const body = this.physics.addBody();
    const move = initialMoveState(spawn.x, spawn.z);
    this.sims.set(client.sessionId, { move, collide: body.collide, removeBody: body.remove, inputs: [], budget: 0 });

    this.state.players.set(
      client.sessionId,
      new Player({
        name,
        x: move.x,
        z: move.z,
        yaw: 0,
        pitch: 0,
        crouching: false,
        flashlightOn: true,
        stamina: move.stamina,
        regenWait: 0,
        lastSeq: 0,
      }),
    );
    this.announce("join", name, `${name} joined the room`);
  }

  onLeave(client: Client) {
    this.sims.get(client.sessionId)?.removeBody();
    this.sims.delete(client.sessionId);
    const player = this.state.players.get(client.sessionId);
    if (!player) return;
    this.state.players.delete(client.sessionId);
    this.announce("leave", player.name, `${player.name} left the room`);
  }

  onDispose() {
    activeCodes.delete(this.roomId);
  }

  /**
   * Applies queued movement inputs. Each player earns input time equal to the real time that
   * passed (server timers often fire late, so counting ticks would fall behind the client),
   * and may bank at most maxInputAheadSec, so a hacked client sending extra inputs
   * cannot move faster than the rules allow.
   */
  private tick(elapsedSec: number) {
    for (const [sessionId, sim] of this.sims) {
      sim.budget = Math.min(sim.budget + elapsedSec, config.net.maxInputAheadSec);
      const player = this.state.players.get(sessionId);
      if (!player) continue;

      while (sim.inputs.length > 0 && sim.budget >= SIM_DT - 1e-9) {
        const input = sim.inputs.shift()!;
        if (input.seq <= player.lastSeq) continue; // duplicate or old
        sim.move = stepMovement(sim.move, input, SIM_DT, sim.collide);
        sim.budget -= SIM_DT;
        player.lastSeq = input.seq;
        player.yaw = input.yaw;
        player.pitch = input.pitch;
      }

      player.x = sim.move.x;
      player.z = sim.move.z;
      player.crouching = sim.move.crouching;
      player.stamina = sim.move.stamina;
      player.regenWait = sim.move.regenWait;
    }
  }

  private toggleNearestDoor(sessionId: string) {
    const sim = this.sims.get(sessionId);
    if (!sim) return;
    let nearest: { id: string; dist: number } | undefined;
    for (const door of this.map.doors) {
      const dist = Math.hypot(door.x - sim.move.x, door.z - sim.move.z);
      if (dist <= config.interact.rangeM && (!nearest || dist < nearest.dist)) nearest = { id: door.id, dist };
    }
    if (!nearest) return;
    const state = this.state.doors.get(nearest.id)!;
    state.open = !state.open;
    this.physics.setDoorOpen(nearest.id, state.open);
  }

  private announce(kind: ServerMessages["system"]["kind"], name: string, text: string) {
    const system: ServerMessages["system"] = { kind, name, text };
    this.broadcast("system", system);

    const players: RosterEntry[] = [];
    this.state.players.forEach((p, sessionId) => players.push({ sessionId, name: p.name }));
    const roster: ServerMessages["roster"] = { players };
    this.broadcast("roster", roster);
  }
}
