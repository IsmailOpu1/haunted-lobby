// How big each room texture needs to be, from how close you can get to what it covers.
// A texture needs about one texel for every screen pixel it fills when you stand as close as you
// can: more is never seen (the GPU just averages it away) but still has to be downloaded and kept
// in graphics memory. For every surface a texture covers, this works out how many texels it has per
// metre, and from that the smallest power-of-two size that still gives every surface at least one
// texel per pixel up close on a 1440p screen at the narrowest field of view.
import { readdirSync } from "node:fs";
import { join, resolve } from "node:path";
import { NodeIO, type Texture } from "@gltf-transform/core";
import { ALL_EXTENSIONS } from "@gltf-transform/extensions";
import { MeshoptDecoder } from "meshoptimizer";

const ROOT = resolve(import.meta.dirname, "../..");
const ROOMS = join(ROOT, "client/public/assets/rooms");

/** The widest screen we plan for (1440p) and the narrowest field of view (game.ts FOV_MIN, across). */
const SCREEN_WIDTH_PX = 2560;
const NARROWEST_FOV_DEG = 70;
/** The closest your eyes get to a surface: your body (0.3 m) keeps you off walls and furniture. */
const CLOSEST_M = 0.35;
/** Screen pixels per metre of surface at that distance, facing it. */
export const NEEDED_TEXELS_PER_M = SCREEN_WIDTH_PX / 2 / (CLOSEST_M * Math.tan(((NARROWEST_FOV_DEG / 2) * Math.PI) / 180));
/** Surfaces this small (in m²) don't decide a texture's size: slivers and seams give wild numbers. */
const SHARE_IGNORED = 0.01;
/** Never smaller than this. */
const MIN_PX = 256;

export interface TextureNeed {
  file: string;
  width: number;
  height: number;
  /** The size it needs (the longer side), at most its own. */
  needPx: number;
}

/** Every room's textures with the size each needs; a texture used by several rooms takes the largest. */
export async function textureNeeds(): Promise<Map<string, TextureNeed>> {
  await MeshoptDecoder.ready;
  const io = new NodeIO().registerExtensions(ALL_EXTENSIONS).registerDependencies({ "meshopt.decoder": MeshoptDecoder });
  const needs = new Map<string, TextureNeed>();
  for (const name of readdirSync(ROOMS).filter((f) => f.endsWith(".gltf"))) {
    const doc = await io.read(join(ROOMS, name));
    for (const texture of doc.getRoot().listTextures()) {
      const file = texture.getURI().split("/").pop()!;
      const size = texture.getSize();
      if (!size) continue;
      const [width, height] = size;
      const needPx = Math.min(texturePx(texture), Math.max(width, height));
      const old = needs.get(file);
      if (!old || old.needPx < needPx) needs.set(file, { file, width, height, needPx });
    }
  }
  return needs;
}

/**
 * The longest side this texture needs (a power of two, at least MIN_PX), from the surfaces it
 * covers in its model; Infinity if it covers nothing measurable (it keeps its size).
 */
export function texturePx(texture: Texture): number {
  const size = texture.getSize();
  if (!size) return Infinity;
  const [width, height] = size;
  const density = texelsPerMetre(texture, width, height);
  if (density === null) return Infinity;
  const want = (Math.max(width, height) * NEEDED_TEXELS_PER_M) / density;
  let px = MIN_PX;
  while (px < want) px *= 2;
  return px;
}

/**
 * Texels per metre at the texture's own size over the surfaces it covers: the densest-but-one
 * percent of their area (by area, so slivers don't count). Null if it covers nothing measurable.
 */
function texelsPerMetre(texture: Texture, width: number, height: number): number | null {
  const samples: { density: number; area: number }[] = [];
  for (const material of texture.listParents()) {
    {
      if (material.propertyType !== "Material") continue;
      for (const prim of material.listParents()) {
        if (prim.propertyType !== "Primitive") continue;
        const p = prim as unknown as import("@gltf-transform/core").Primitive;
        const pos = p.getAttribute("POSITION");
        const uv = p.getAttribute("TEXCOORD_0");
        if (!pos || !uv) continue;
        const idx = p.getIndices();
        const count = idx ? idx.getCount() : pos.getCount();
        for (const mesh of p.listParents()) {
          if (mesh.propertyType !== "Mesh") continue;
          for (const node of mesh.listParents()) {
            if (node.propertyType !== "Node") continue;
            const m = (node as unknown as import("@gltf-transform/core").Node).getWorldMatrix();
            const a = [0, 0, 0];
            const b = [0, 0, 0];
            const c = [0, 0, 0];
            const ua = [0, 0];
            const ub = [0, 0];
            const uc = [0, 0];
            const world = (i: number, out: number[]) => {
              const [x, y, z] = pos.getElement(i, [0, 0, 0]);
              out[0] = m[0] * x! + m[4] * y! + m[8] * z! + m[12];
              out[1] = m[1] * x! + m[5] * y! + m[9] * z! + m[13];
              out[2] = m[2] * x! + m[6] * y! + m[10] * z! + m[14];
            };
            for (let t = 0; t + 2 < count; t += 3) {
              const i0 = idx ? idx.getScalar(t) : t;
              const i1 = idx ? idx.getScalar(t + 1) : t + 1;
              const i2 = idx ? idx.getScalar(t + 2) : t + 2;
              world(i0, a);
              world(i1, b);
              world(i2, c);
              const e1 = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
              const e2 = [c[0]! - a[0]!, c[1]! - a[1]!, c[2]! - a[2]!];
              const cx = e1[1]! * e2[2]! - e1[2]! * e2[1]!;
              const cy = e1[2]! * e2[0]! - e1[0]! * e2[2]!;
              const cz = e1[0]! * e2[1]! - e1[1]! * e2[0]!;
              const area = Math.hypot(cx, cy, cz) / 2;
              if (area < 1e-8) continue;
              uv.getElement(i0, ua);
              uv.getElement(i1, ub);
              uv.getElement(i2, uc);
              const uvArea = Math.abs((ub[0]! - ua[0]!) * (uc[1]! - ua[1]!) - (uc[0]! - ua[0]!) * (ub[1]! - ua[1]!)) / 2;
              if (uvArea < 1e-12) continue;
              samples.push({ density: Math.sqrt((uvArea * width * height) / area), area });
            }
          }
        }
      }
    }
  }
  if (samples.length === 0) return null;
  samples.sort((x, y) => y.density - x.density);
  const total = samples.reduce((s, x) => s + x.area, 0);
  let skipped = 0;
  for (const s of samples) {
    skipped += s.area;
    if (skipped >= total * SHARE_IGNORED) return s.density;
  }
  return samples[samples.length - 1]!.density;
}

if (process.argv[1]?.endsWith("texture-needs.ts")) {
  const needs = await textureNeeds();
  const sizes = new Map<string, number>();
  let smaller = 0;
  for (const n of needs.values()) {
    const key = `${Math.max(n.width, n.height)} -> ${n.needPx}`;
    sizes.set(key, (sizes.get(key) ?? 0) + 1);
    if (n.needPx < Math.max(n.width, n.height)) smaller++;
  }
  console.log(`Needed texels per metre: ${NEEDED_TEXELS_PER_M.toFixed(0)}`);
  console.log(`${needs.size} textures, ${smaller} can be smaller`);
  console.log([...sizes.entries()].sort().map(([k, v]) => `${k}: ${v}`).join("\n"));
}
