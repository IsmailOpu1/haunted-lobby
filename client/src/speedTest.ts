import * as THREE from "three";

// The speed test (Options): how fast this computer really draws the hotel, at Low and High
// (PRD 9). It finds the busiest views on its own (every room's middle, four ways), then holds each
// for a few seconds and times the frames: the frame rate the screen got, and where the browser
// allows it, how long the graphics card worked on each frame. Nothing is sent anywhere: the result
// is text to copy and pass on.

/** Views tried when looking for the busiest: each room's middle, looking these ways. */
const SCAN_TURNS = 4;
/** The busiest views measured, and the ordinary ones (the middle of the list) beside them. */
const BUSIEST = 6;
const ORDINARY = 2;
/** Each view: frames first let settle (textures, shaders), then timed. */
const SETTLE_SEC = 1;
const HOLD_SEC = 3;
/** PRD 9's frame budget: 60 frames a second, and its Low limits (draws, triangles). */
const TARGET_FPS = 60;
const LOW_DRAWS = 250;
const LOW_TRIANGLES = 300_000;

export interface SpeedView {
  name: string;
  x: number;
  y: number;
  z: number;
  yaw: number;
}

interface Timed {
  view: SpeedView;
  level: "low" | "high";
  frames: number[];
  gpu: number[];
  draws: number;
  triangles: number;
}

/** What the game lends the test. */
export interface SpeedHost {
  renderer: THREE.WebGLRenderer;
  camera: THREE.PerspectiveCamera;
  /** Every candidate spot (each room's middle, at eye height, in the world). */
  spots(): { name: string; x: number; y: number; z: number }[];
  /** Draws one frame from the camera as it is now, by hand (for the scan). */
  drawOnce(): void;
  setLevel(level: "low" | "high"): void;
  /** True while Low's lighter copies are still being made. */
  busy(): boolean;
}

/** Times the graphics card's work on each frame (EXT_disjoint_timer_query_webgl2), when the browser has it. */
class GpuTimer {
  private ext: { TIME_ELAPSED_EXT: number; GPU_DISJOINT_EXT: number } | null;
  private pending: WebGLQuery[] = [];
  private current: WebGLQuery | null = null;
  private done: number[] = [];

  constructor(private gl: WebGL2RenderingContext) {
    this.ext = gl.getExtension("EXT_disjoint_timer_query_webgl2");
  }

  get works() {
    return !!this.ext;
  }

  begin() {
    if (!this.ext || this.current) return;
    this.current = this.gl.createQuery();
    if (this.current) this.gl.beginQuery(this.ext.TIME_ELAPSED_EXT, this.current);
  }

  end() {
    if (!this.ext || !this.current) return;
    this.gl.endQuery(this.ext.TIME_ELAPSED_EXT);
    this.pending.push(this.current);
    this.current = null;
    this.collect();
  }

  /** Reads the frames the card has finished; a disjoint one (the card was interrupted) is dropped. */
  private collect() {
    if (!this.ext) return;
    const gl = this.gl;
    const disjoint = gl.getParameter(this.ext.GPU_DISJOINT_EXT) as boolean;
    while (this.pending.length && gl.getQueryParameter(this.pending[0]!, gl.QUERY_RESULT_AVAILABLE)) {
      const q = this.pending.shift()!;
      if (!disjoint) this.done.push((gl.getQueryParameter(q, gl.QUERY_RESULT) as number) / 1e6);
      gl.deleteQuery(q);
    }
  }

  take(): number[] {
    this.collect();
    return this.done.splice(0);
  }
}

function quantile(values: number[], q: number) {
  if (!values.length) return NaN;
  const s = [...values].sort((a, b) => a - b);
  return s[Math.min(s.length - 1, Math.floor(q * s.length))]!;
}

const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / Math.max(1, values.length);

export class SpeedTest {
  private views: SpeedView[] = [];
  private queue: { view: SpeedView; level: "low" | "high" }[] = [];
  private at = 0;
  private frames: number[] = [];
  private gpu: GpuTimer;
  private results: Timed[] = [];
  private finish!: (text: string) => void;
  private stopped = false;
  readonly finished: Promise<string>;

  constructor(
    private host: SpeedHost,
    private say: (text: string) => void,
  ) {
    this.gpu = new GpuTimer(host.renderer.getContext() as WebGL2RenderingContext);
    this.finished = new Promise((resolve) => (this.finish = resolve));
  }

  /** Looks for the busiest views at Low, a few spots at a time so the page keeps showing progress. */
  async scan() {
    this.host.setLevel("low");
    while (this.host.busy()) {
      this.say("Getting Low quality ready…");
      await new Promise((r) => setTimeout(r, 200));
      if (this.stopped) return;
    }
    const tried: { view: SpeedView; cost: number }[] = [];
    const spots = this.host.spots();
    // A room made of several pieces (the Main Hall's alcoves) names each piece apart.
    const pieces = new Map<string, number>();
    for (const s of spots) pieces.set(s.name, (pieces.get(s.name) ?? 0) + 1);
    const seen = new Map<string, number>();
    for (let i = 0; i < spots.length; i++) {
      const s = spots[i]!;
      const nth = (seen.get(s.name) ?? 0) + 1;
      seen.set(s.name, nth);
      const where = pieces.get(s.name)! > 1 ? `${s.name} (part ${nth} of ${pieces.get(s.name)})` : s.name;
      for (let k = 0; k < SCAN_TURNS; k++) {
        const view = { name: `${where}, turn ${k + 1} of ${SCAN_TURNS}`, x: s.x, y: s.y, z: s.z, yaw: (k * Math.PI * 2) / SCAN_TURNS };
        this.aim(view);
        this.host.drawOnce();
        const r = this.host.renderer.info.render;
        tried.push({ view, cost: r.calls / LOW_DRAWS + r.triangles / LOW_TRIANGLES });
      }
      if (i % 4 === 3) {
        this.say(`Finding the busiest views… ${Math.round(((i + 1) / spots.length) * 100)}%`);
        await new Promise((r) => setTimeout(r, 0));
        if (this.stopped) return;
      }
    }
    tried.sort((a, b) => b.cost - a.cost);
    const middle = Math.floor(tried.length / 2);
    this.views = [...tried.slice(0, BUSIEST), ...tried.slice(middle, middle + ORDINARY)].map((t) => t.view);
    for (const level of ["low", "high"] as const) for (const view of this.views) this.queue.push({ view, level });
    this.startView();
  }

  stop() {
    this.stopped = true;
    this.queue = [];
    this.finish("Speed test stopped.");
  }

  /** True until it has finished or been stopped (while scanning too). */
  get running() {
    return !this.stopped && (this.queue.length > 0 || this.views.length === 0);
  }

  private aim(view: SpeedView) {
    const { camera } = this.host;
    camera.position.set(view.x, view.y, view.z);
    camera.rotation.set(0, view.yaw, 0, "YXZ");
    camera.updateMatrixWorld();
  }

  private startView() {
    const next = this.queue[0];
    if (!next) return;
    this.host.setLevel(next.level);
    this.at = 0;
    this.frames = [];
    this.gpu.take();
  }

  /** Each frame, before anything is drawn: where the camera is. */
  place() {
    const next = this.queue[0];
    if (next) this.aim(next.view);
  }

  beginDraw() {
    if (this.queue.length && this.at >= SETTLE_SEC) this.gpu.begin();
  }

  endDraw() {
    this.gpu.end();
  }

  /** After each frame: dt is the time since the last one, in seconds. */
  frame(dt: number) {
    const next = this.queue[0];
    if (!next || this.stopped) return;
    this.at += dt;
    if (this.at <= SETTLE_SEC) {
      if (this.host.busy()) this.at = 0; // Low's lighter copies first
      return;
    }
    this.frames.push(dt * 1000);
    const step = this.results.length + 1;
    this.say(`Measuring ${next.level === "low" ? "Low" : "High"}: view ${step} of ${this.views.length * 2}`);
    if (this.at < SETTLE_SEC + HOLD_SEC) return;
    const r = this.host.renderer.info.render;
    this.results.push({ view: next.view, level: next.level, frames: this.frames, gpu: this.gpu.take(), draws: r.calls, triangles: r.triangles });
    this.queue.shift();
    if (this.queue.length) this.startView();
    else this.finish(this.report());
  }

  private report(): string {
    const gl = this.host.renderer.getContext();
    const info = gl.getExtension("WEBGL_debug_renderer_info");
    const card = info ? String(gl.getParameter(info.UNMASKED_RENDERER_WEBGL)) : "unknown graphics";
    const canvas = this.host.renderer.domElement;
    const lines = [
      "Haunted Lobby speed test",
      `Graphics: ${card}`,
      `Picture: ${canvas.width} x ${canvas.height} pixels`,
      this.gpu.works ? "Card = how long the graphics card worked on a frame (16.7 ms or less keeps 60 FPS)." : "This browser doesn't time the graphics card; only the frame rate is shown.",
      "The frame rate can't go above the screen's own refresh rate.",
    ];
    for (const level of ["low", "high"] as const) {
      const mine = this.results.filter((t) => t.level === level);
      const all = mine.flatMap((t) => t.frames);
      lines.push("", `${level === "low" ? "Low" : "High"}: ${Math.round(1000 / mean(all))} FPS on average, slowest frames ${quantile(all, 0.95).toFixed(1)} ms`);
      for (const t of mine) {
        const fps = 1000 / mean(t.frames);
        const card = t.gpu.length ? `, card ${quantile(t.gpu, 0.5).toFixed(1)} ms` : "";
        const ok = fps >= TARGET_FPS * 0.95 ? "ok  " : "SLOW";
        lines.push(`  ${ok} ${Math.round(fps)} FPS${card}, ${t.draws} draws, ${Math.round(t.triangles / 1000)}k triangles: ${t.view.name}`);
      }
    }
    return lines.join("\n");
  }
}
