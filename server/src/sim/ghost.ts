import { config, ghostParams, normalizeAngle, type DoorDef, type GhostDifficulty, type HidingSpotDef, type NightPart } from "@haunted/shared";
import type { NavMap, Point } from "./navmap.ts";

// The ghost (GDD Section 12). Runs only on the server. It knows only what its senses tell it.

export type GhostState = "asleep" | "wander" | "investigate" | "prehunt" | "hunt" | "retreat" | "gone";

/** What the ghost may sense about a player this tick. */
export interface GhostTarget {
  id: string;
  x: number;
  z: number;
  health: "alive" | "downed" | "dead";
  hidingSpot: string | null;
  flashlightOn: boolean;
  /** How far this player's noise carried this tick (movement, breathing while hidden). */
  noiseM: number;
  /** Recently revived players cannot be hit (GDD Section 7). */
  immune: boolean;
}

export interface GhostWorld {
  players(): GhostTarget[];
  lineOfSight(a: Point, b: Point, height: number): boolean;
  doors: DoorDef[];
  isDoorOpen(id: string): boolean;
  openDoor(id: string): void;
  hidingSpots: HidingSpotDef[];
  /** Noises not made by a player's body this tick, for example a door slamming. */
  takeNoises(): { x: number; z: number; radiusM: number }[];
  /** The ghost caught this player. */
  hit(playerId: string): void;
  /** Hunt warning (2 s of silence), hunt start and hunt end. */
  huntEvent(phase: "warning" | "start" | "end"): void;
}

const ARRIVE_M = 0.15;
const SIGHT_HEIGHT_M = 1.5;
const WANDER_PAUSE_SEC = 1.5;

export class Ghost {
  state: GhostState = "asleep";
  x: number;
  z: number;
  yaw = 0;
  /** Times the ghost had to give up a route because it stopped making progress (tests watch this). */
  stuckCount = 0;

  private path: Point[] = [];
  private goal: Point | null = null;
  private stateTimer = 0;
  private huntTimer = 0;
  private repathTimer = 0;
  private pauseTimer = 0;
  private targetId: string | null = null;
  private lastKnown: Point | null = null;
  private checkedSpots = new Set<string>();
  private inspecting: { spot: HidingSpotDef; timeLeft: number } | null = null;
  /** A hiding spot the ghost is walking to so it can look inside. */
  private pendingInspect: HidingSpotDef | null = null;
  private lastInvestigated: Point | null = null;
  private ignoreTimer = 0;
  /** Time between hunts for the current part of the night, set every update. */
  private betweenHuntsSec: number = config.ghost.parts.calm.betweenHuntsSec;
  private progressAnchor: Point;
  private progressTimer = 0;

  constructor(private nav: NavMap, private world: GhostWorld, start: Point, private difficulty: GhostDifficulty = "normal") {
    const p = nav.closest(start);
    this.x = p.x;
    this.z = p.z;
    this.progressAnchor = { ...p };
  }

  /** The ghost can be seen only while it hunts. */
  get visible(): boolean {
    return this.state === "hunt";
  }

  get hunting(): boolean {
    return this.state === "hunt";
  }

  update(dt: number, part: NightPart, playerCount: number) {
    if (part === "dawn") {
      if (this.state === "hunt" || this.state === "prehunt") this.world.huntEvent("end");
      this.state = "gone";
      return;
    }
    if (part === "quiet") {
      this.state = "asleep";
      return;
    }
    const params = ghostParams(part, this.difficulty, playerCount);
    this.betweenHuntsSec = params.betweenHuntsSec;
    if (this.state === "asleep") {
      this.state = "wander";
      this.huntTimer = params.betweenHuntsSec;
    }

    if (this.state === "wander" || this.state === "investigate" || this.state === "retreat") {
      this.huntTimer -= dt;
    }

    switch (this.state) {
      case "wander":
      case "investigate":
        this.updateCalm(dt, params.wander);
        if (this.huntTimer <= 0) {
          this.state = "prehunt";
          this.stateTimer = config.ghost.preHuntSilenceSec;
          this.world.huntEvent("warning");
        }
        break;
      case "prehunt":
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.startHunt(params.huntSec);
        break;
      case "hunt":
        this.stateTimer -= dt;
        this.updateHunt(dt, params.hunt);
        if (this.state === "hunt" && this.stateTimer <= 0) this.endHunt();
        break;
      case "retreat":
        this.stateTimer -= dt;
        if (this.stateTimer <= 0) this.reappear();
        break;
    }
    this.openNearbyDoors();
  }

  /** Test shortcut (HAUNTED_DEBUG only): start the hunt countdown from this many seconds. */
  debugHuntIn(seconds: number) {
    this.huntTimer = seconds;
  }

  // ---------- Senses (GDD Section 12.2) ----------

  /** Players the ghost can see or hear right now, with where it thinks they are. */
  private perceive(): GhostTarget[] {
    const found: GhostTarget[] = [];
    const halfFov = ((config.ghost.sightFovDeg / 2) * Math.PI) / 180;
    for (const p of this.world.players()) {
      if (p.health !== "alive") continue;
      const dist = Math.hypot(p.x - this.x, p.z - this.z);
      if (dist <= p.noiseM) {
        found.push(p);
        continue;
      }
      if (p.hidingSpot) continue; // hiding blocks sight completely
      const sightM = p.flashlightOn ? config.ghost.sightM.flashlightOn : config.ghost.sightM.flashlightOff;
      if (dist > sightM) continue;
      const angleTo = Math.atan2(-(p.x - this.x), -(p.z - this.z));
      if (Math.abs(normalizeAngle(angleTo - this.yaw)) > halfFov) continue;
      if (this.world.lineOfSight(this, p, SIGHT_HEIGHT_M)) found.push(p);
    }
    return found;
  }

  private hearNoise(): Point | null {
    let nearest: Point | null = null;
    let best = Infinity;
    for (const n of this.world.takeNoises()) {
      const d = Math.hypot(n.x - this.x, n.z - this.z);
      if (d <= n.radiusM && d < best) {
        best = d;
        nearest = { x: n.x, z: n.z };
      }
    }
    return nearest;
  }

  // ---------- Wander and Investigate ----------

  private updateCalm(dt: number, speed: number) {
    const noticed = this.perceive();
    const noise = this.hearNoise();
    let clue: Point | null = noticed.length > 0 ? this.nearest(noticed) : noise;
    if (this.ignoreTimer > 0) {
      this.ignoreTimer -= dt;
      const near = clue && this.lastInvestigated && Math.hypot(clue.x - this.lastInvestigated.x, clue.z - this.lastInvestigated.z) < config.ghost.investigateIgnoreRadiusM;
      if (near) clue = null;
    }
    if (clue) {
      // Go to where something was noticed, then look around (GDD 12.1 Investigate).
      if (this.state !== "investigate" || !this.goal || Math.hypot(clue.x - this.goal.x, clue.z - this.goal.z) > 1) {
        this.state = "investigate";
        this.setGoal(clue);
        this.pauseTimer = 0;
      }
    }

    if (this.pauseTimer > 0) {
      this.pauseTimer -= dt;
      return;
    }
    if (!this.goal) this.setGoal(this.nav.randomPoint());
    if (this.moveAlongPath(dt, speed)) {
      // Arrived.
      this.goal = null;
      if (this.state === "investigate") {
        this.state = "wander";
        this.pauseTimer = config.ghost.investigateLookSec;
        this.lastInvestigated = { x: this.x, z: this.z };
        this.ignoreTimer = config.ghost.investigateLookSec + config.ghost.investigateCooldownSec;
      } else {
        this.pauseTimer = WANDER_PAUSE_SEC;
      }
    }
  }

  // ---------- Hunt (GDD Sections 12.1 and 12.2) ----------

  private startHunt(huntSec: number) {
    this.state = "hunt";
    this.stateTimer = huntSec;
    this.targetId = null;
    this.lastKnown = null;
    this.checkedSpots.clear();
    this.inspecting = null;
    this.goal = null;
    this.path = [];
    this.world.huntEvent("start");
  }

  private endHunt() {
    this.world.huntEvent("end");
    this.state = "retreat";
    this.stateTimer = config.ghost.retreatSec;
    // The next hunt is counted from the end of this one, including the retreat.
    this.huntTimer = this.betweenHuntsSec;
    this.pendingInspect = null;
    this.targetId = null;
    this.inspecting = null;
    this.goal = null;
    this.path = [];
  }

  private updateHunt(dt: number, speed: number) {
    const players = this.world.players();
    const perceived = this.perceive();

    if (perceived.length > 0) {
      const target = this.nearest(perceived);
      this.targetId = target.id;
      this.lastKnown = { x: target.x, z: target.z };
      this.inspecting = null;
      this.repathTimer -= dt;
      if (this.repathTimer <= 0 || !this.goal) {
        this.setGoal(this.lastKnown);
        this.repathTimer = config.ghost.repathSec;
      }
    }

    // Catch: a perceived, standing, not-immune target within reach (GDD Section 7).
    const target = players.find((p) => p.id === this.targetId);
    if (target && target.health === "alive" && !target.hidingSpot && !target.immune) {
      if (Math.hypot(target.x - this.x, target.z - this.z) <= config.ghost.catchRangeM) {
        this.world.hit(target.id);
        this.endHunt();
        return;
      }
    }

    if (this.inspecting) {
      this.inspecting.timeLeft -= dt;
      if (this.inspecting.timeLeft <= 0) {
        const spot = this.inspecting.spot;
        this.inspecting = null;
        const hidden = players.find((p) => p.hidingSpot === spot.id && p.health === "alive" && !p.immune);
        if (hidden) {
          this.world.hit(hidden.id);
          this.endHunt();
        }
      }
      return;
    }

    if (perceived.length === 0 && !this.goal) {
      if (this.lastKnown) {
        // Lost them where they were last seen: check nearby hiding spots (GDD 12.1).
        const spot = this.nextSpotToCheck(this.lastKnown);
        if (spot) {
          this.checkedSpots.add(spot.id);
          this.setGoal(spot.exit);
          this.pendingInspect = spot;
        } else {
          this.lastKnown = null;
          this.setGoal(this.nav.randomPoint());
        }
      } else {
        this.setGoal(this.nav.randomPoint());
      }
    }

    // On arrival at the last known position, the next tick picks a hiding spot to check.
    if (this.moveAlongPath(dt, speed)) {
      this.goal = null;
      if (this.pendingInspect) {
        this.inspecting = { spot: this.pendingInspect, timeLeft: config.ghost.hidingCheckSec };
        this.pendingInspect = null;
      }
    }
  }

  private nextSpotToCheck(near: Point): HidingSpotDef | null {
    if (this.checkedSpots.size >= config.ghost.hidingChecks) return null;
    let best: HidingSpotDef | null = null;
    let bestDist = Infinity;
    for (const s of this.world.hidingSpots) {
      if (this.checkedSpots.has(s.id)) continue;
      const d = Math.hypot(s.x - near.x, s.z - near.z);
      if (d <= config.ghost.hidingCheckRadiusM && d < bestDist) {
        best = s;
        bestDist = d;
      }
    }
    return best;
  }

  // ---------- Retreat ----------

  /** After retreating, the ghost comes back somewhere away from every player. */
  private reappear() {
    const players = this.world.players().filter((p) => p.health !== "dead");
    let spot = this.nav.randomPoint();
    for (let i = 0; i < 20; i++) {
      const far = players.every((p) => Math.hypot(p.x - spot.x, p.z - spot.z) >= config.ghost.reappearMinDistM);
      if (far) break;
      spot = this.nav.randomPoint();
    }
    this.x = spot.x;
    this.z = spot.z;
    this.progressAnchor = { ...spot };
    this.progressTimer = 0;
    this.state = "wander";
    this.goal = null;
    this.path = [];
  }

  // ---------- Movement ----------

  private setGoal(p: Point) {
    const goal = this.nav.closest(p);
    this.goal = goal;
    this.path = this.nav.path(this, goal);
    if (this.path.length === 0 && Math.hypot(goal.x - this.x, goal.z - this.z) > ARRIVE_M) {
      // Unreachable: forget it and pick something else next tick.
      this.goal = null;
    }
  }

  /** Moves toward the goal. Returns true when it arrives. */
  private moveAlongPath(dt: number, speed: number): boolean {
    if (!this.goal) return false;
    let budget = speed * dt;
    while (budget > 0 && this.path.length > 0) {
      const next = this.path[0]!;
      const dx = next.x - this.x;
      const dz = next.z - this.z;
      const d = Math.hypot(dx, dz);
      if (d > 1e-6) this.yaw = Math.atan2(-dx, -dz);
      if (d <= budget) {
        this.x = next.x;
        this.z = next.z;
        this.path.shift();
        budget -= d;
      } else {
        this.x += (dx / d) * budget;
        this.z += (dz / d) * budget;
        budget = 0;
      }
    }
    this.checkProgress(dt);
    if (this.path.length === 0) return true;
    return false;
  }

  /** If the ghost stops making progress, it drops its route instead of standing stuck. */
  private checkProgress(dt: number) {
    this.progressTimer += dt;
    if (Math.hypot(this.x - this.progressAnchor.x, this.z - this.progressAnchor.z) > 0.5) {
      this.progressAnchor = { x: this.x, z: this.z };
      this.progressTimer = 0;
    } else if (this.progressTimer > config.ghost.stuckSec) {
      this.stuckCount++;
      this.progressTimer = 0;
      this.goal = null;
      this.path = [];
    }
  }

  private openNearbyDoors() {
    if (this.state === "asleep" || this.state === "gone" || this.state === "retreat") return;
    for (const door of this.world.doors) {
      if (this.world.isDoorOpen(door.id)) continue;
      if (Math.hypot(door.x - this.x, door.z - this.z) <= config.ghost.doorOpenRangeM) this.world.openDoor(door.id);
    }
  }

  private nearest<T extends Point>(list: T[]): T {
    let best = list[0]!;
    let bestDist = Infinity;
    for (const p of list) {
      const d = Math.hypot(p.x - this.x, p.z - this.z);
      if (d < bestDist) {
        best = p;
        bestDist = d;
      }
    }
    return best;
  }
}
