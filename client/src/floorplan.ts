import { levelOf, type LevelDef, type MapData, type StairDef } from "@haunted/shared";

// The floor plan on the Tab panel (GDD 6 "Map and status", 26.10): every floor side by side,
// rooms in their colours with names, your tasks' rooms outlined, and you as an arrow.
// It never shows other players, the ghost or relics.

const SVG_NS = "http://www.w3.org/2000/svg";
/** Space between two floors' drawings, and around them, in meters. */
const GAP_M = 4;
/** Height of a floor's title above its drawing, in meters. */
const TITLE_M = 3;
/** Rooms narrower than this have no name on the plan (corridors). */
const LABEL_MIN_M = 4;
const NO_COLOR = "#555555";
const DIRS: Record<StairDef["dir"], { x: number; z: number }> = { "+x": { x: 1, z: 0 }, "-x": { x: -1, z: 0 }, "+z": { x: 0, z: 1 }, "-z": { x: 0, z: -1 } };

interface Bounds {
  minX: number;
  maxX: number;
  minZ: number;
  maxZ: number;
}

function svg<K extends keyof SVGElementTagNameMap>(tag: K, attrs: Record<string, string | number>, parent?: Element): SVGElementTagNameMap[K] {
  const node = document.createElementNS(SVG_NS, tag);
  for (const [k, v] of Object.entries(attrs)) node.setAttribute(k, String(v));
  parent?.append(node);
  return node;
}

/** A flight of stairs' footprint in the lower floor's simulation coordinates. */
function stairRect(s: StairDef): Bounds {
  const u = DIRS[s.dir];
  const endX = s.x + u.x * s.lengthM;
  const endZ = s.z + u.z * s.lengthM;
  const w = s.widthM / 2;
  return {
    minX: Math.min(s.x, endX) - (u.x === 0 ? w : 0),
    maxX: Math.max(s.x, endX) + (u.x === 0 ? w : 0),
    minZ: Math.min(s.z, endZ) - (u.z === 0 ? w : 0),
    maxZ: Math.max(s.z, endZ) + (u.z === 0 ? w : 0),
  };
}

export class FloorPlan {
  readonly element: SVGSVGElement;
  private you: SVGGElement;
  private titles = new Map<string, SVGTextElement>();
  private roomRects = new Map<string, SVGRectElement[]>();
  /** Where each floor's drawing starts: plan x = sim x + dx. */
  private offsets = new Map<string, { dx: number; dz: number }>();
  private youLevel = "";

  constructor(private map: MapData) {
    // Lowest floor on the left, highest on the right.
    const levels = [...map.levels].sort((a, b) => a.y - b.y);
    const bounds = new Map<LevelDef, Bounds>();
    for (const level of levels) {
      const rooms = map.rooms.filter((r) => levelOf(map, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2) === level);
      bounds.set(level, {
        minX: Math.min(...rooms.map((r) => r.minX)),
        maxX: Math.max(...rooms.map((r) => r.maxX)),
        minZ: Math.min(...rooms.map((r) => r.minZ)),
        maxZ: Math.max(...rooms.map((r) => r.maxZ)),
      });
    }
    const height = Math.max(...[...bounds.values()].map((b) => b.maxZ - b.minZ));
    let left = GAP_M;
    for (const level of levels) {
      const b = bounds.get(level)!;
      this.offsets.set(level.id, { dx: left - b.minX, dz: GAP_M + TITLE_M - b.minZ });
      left += b.maxX - b.minX + GAP_M;
    }
    this.element = svg("svg", { viewBox: `0 0 ${left} ${height + 2 * GAP_M + TITLE_M}`, class: "floor-plan" });

    for (const level of levels) {
      const b = bounds.get(level)!;
      const { dx, dz } = this.offsets.get(level.id)!;
      const g = svg("g", { transform: `translate(${dx} ${dz})` }, this.element);
      const title = svg("text", { x: (b.minX + b.maxX) / 2, y: b.minZ - 1, class: "plan-floor" }, g);
      title.textContent = level.name;
      this.titles.set(level.id, title);

      const rooms = map.rooms.filter((r) => levelOf(map, (r.minX + r.maxX) / 2, (r.minZ + r.maxZ) / 2) === level);
      for (const r of rooms) {
        const rect = svg("rect", { x: r.minX, y: r.minZ, width: r.maxX - r.minX, height: r.maxZ - r.minZ, fill: map.roomColors?.[r.name] ?? NO_COLOR, class: "plan-room" }, g);
        const list = this.roomRects.get(r.name) ?? [];
        list.push(rect);
        this.roomRects.set(r.name, list);
      }
      for (const s of map.stairs) {
        const lower = map.levels.find((l) => l.id === s.lower)!;
        const upper = map.levels.find((l) => l.id === s.upper)!;
        // On the upper floor, the same flight sits in that floor's area of the plane.
        const shift = level === lower ? 0 : level === upper ? lower.shiftX - upper.shiftX : null;
        if (shift === null) continue;
        const f = stairRect(s);
        svg("rect", { x: f.minX + shift, y: f.minZ, width: f.maxX - f.minX, height: f.maxZ - f.minZ, class: "plan-stairs" }, g);
      }
      for (const [x1, z1, x2, z2] of map.walls) {
        if (levelOf(map, (x1 + x2) / 2, (z1 + z2) / 2) !== level) continue;
        svg("line", { x1, y1: z1, x2, y2: z2, class: "plan-wall" }, g);
      }
      // Each room's name once, on its biggest rectangle.
      const names = new Set(rooms.map((r) => r.name));
      for (const name of names) {
        const biggest = rooms.filter((r) => r.name === name).sort((a, c) => (c.maxX - c.minX) * (c.maxZ - c.minZ) - (a.maxX - a.minX) * (a.maxZ - a.minZ))[0]!;
        if (Math.min(biggest.maxX - biggest.minX, biggest.maxZ - biggest.minZ) < LABEL_MIN_M) continue;
        const label = svg("text", { x: (biggest.minX + biggest.maxX) / 2, y: (biggest.minZ + biggest.maxZ) / 2, class: "plan-label" }, g);
        label.textContent = name;
      }
    }

    // You: an arrow pointing the way you face (drawn facing north, then turned).
    this.you = svg("g", { class: "plan-you" }, this.element);
    svg("polygon", { points: "0,-1.6 1.1,1.2 0,0.5 -1.1,1.2" }, this.you);
  }

  /** Outlines the rooms that hold your unfinished tasks. */
  setTaskRooms(rooms: Iterable<string>) {
    const want = new Set(rooms);
    for (const [name, rects] of this.roomRects) for (const rect of rects) rect.classList.toggle("task", want.has(name));
  }

  /** Moves your arrow: simulation position and facing (yaw 0 looks north, toward -z). */
  setYou(x: number, z: number, yaw: number) {
    const level = levelOf(this.map, x, z);
    const offset = this.offsets.get(level.id);
    if (!offset) return;
    const deg = (-yaw * 180) / Math.PI;
    this.you.setAttribute("transform", `translate(${x + offset.dx} ${z + offset.dz}) rotate(${deg})`);
    if (this.youLevel !== level.id) {
      for (const [id, title] of this.titles) title.classList.toggle("here", id === level.id);
      this.youLevel = level.id;
    }
  }
}
