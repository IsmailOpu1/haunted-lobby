import { config } from "../config.ts";

// Player movement (GDD Section 6). This exact code runs on the server (authoritative)
// and on the client (prediction), so both always agree.

/** One fixed simulation step of player input. */
export interface MoveInput {
  /** Increases by one every step, so the server can confirm which inputs it applied. */
  seq: number;
  /** -1 back, 0, 1 forward. */
  forward: number;
  /** -1 left, 0, 1 right. */
  right: number;
  run: boolean;
  crouch: boolean;
  /** Look direction in radians. Yaw 0 looks toward -z (north). */
  yaw: number;
  pitch: number;
}

export interface MoveState {
  x: number;
  z: number;
  /** Seconds of running left. */
  stamina: number;
  /** Seconds until stamina starts refilling. */
  regenWait: number;
  crouching: boolean;
}

/** Moves a body by a desired delta and returns where it really ends up (walls stop it). */
export type CollideFn = (from: { x: number; z: number }, delta: { x: number; z: number }) => { x: number; z: number };

export const SIM_DT = 1 / config.net.tickRate;

export function initialMoveState(x: number, z: number): MoveState {
  return { x, z, stamina: config.movement.staminaSec, regenWait: 0, crouching: false };
}

/**
 * normal: walk, run and crouch. crawl: downed (GDD Section 7), slow and no running.
 * frozen: hidden or dead, no movement (stamina still recovers).
 */
export type MoveMode = "normal" | "crawl" | "frozen";

export function stepMovement(state: MoveState, input: MoveInput, dt: number, collide: CollideFn, mode: MoveMode = "normal"): MoveState {
  const m = config.movement;
  const moving = mode !== "frozen" && (input.forward !== 0 || input.right !== 0);
  const crouching = mode === "normal" && input.crouch;
  const running = mode === "normal" && moving && input.run && !crouching && state.stamina > 0;

  const speed = mode === "crawl" ? m.crawl : crouching ? m.crouch : running ? m.run : m.walk;

  // Forward is where the camera looks (yaw 0 = -z). Right is 90 degrees clockwise from it.
  const sin = Math.sin(input.yaw);
  const cos = Math.cos(input.yaw);
  let dx = input.forward * -sin + input.right * cos;
  let dz = input.forward * -cos + input.right * -sin;
  const len = moving ? Math.hypot(dx, dz) : 0;
  if (len > 0) {
    dx = (dx / len) * speed * dt;
    dz = (dz / len) * speed * dt;
  }

  let { stamina, regenWait } = state;
  if (running) {
    stamina -= dt;
    // Floating-point leftovers (like 1e-15 s) must not allow an extra running step.
    if (stamina < 1e-9) stamina = 0;
    regenWait = m.staminaRegenDelaySec;
  } else if (regenWait > 0) {
    regenWait -= dt;
    // Same floating-point guard as stamina: the wait must end on the exact step.
    if (regenWait < 1e-9) regenWait = 0;
  } else {
    stamina = Math.min(m.staminaSec, stamina + (m.staminaSec / m.staminaRefillSec) * dt);
  }

  const pos = len > 0 ? collide({ x: state.x, z: state.z }, { x: dx, z: dz }) : { x: state.x, z: state.z };
  return { x: pos.x, z: pos.z, stamina, regenWait, crouching };
}

/** Validates an input message from a client. Returns null if it is malformed. */
export function sanitizeInput(raw: unknown): MoveInput | null {
  if (typeof raw !== "object" || raw === null) return null;
  const r = raw as Record<string, unknown>;
  const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) ? v : null);
  const seq = num(r.seq);
  const forward = num(r.forward);
  const right = num(r.right);
  const yaw = num(r.yaw);
  const pitch = num(r.pitch);
  if (seq === null || forward === null || right === null || yaw === null || pitch === null) return null;
  if (!Number.isInteger(seq) || seq < 0) return null;
  return {
    seq,
    forward: Math.sign(forward),
    right: Math.sign(right),
    run: r.run === true,
    crouch: r.crouch === true,
    yaw: normalizeAngle(yaw),
    pitch: Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitch)),
  };
}

/** Wraps an angle into the range -PI..PI. */
export function normalizeAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}
