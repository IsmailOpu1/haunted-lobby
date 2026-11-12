import * as THREE from "three";
import type { ModelLoaders } from "./loaders.ts";

// The hotel's door models (tools/art/build-doors.ts): every style of door leaf at every width the
// map uses, and the panels over the doorways, each a named piece the doors (world.ts) copy.

const MANIFEST = `${import.meta.env.BASE_URL}assets/doors/doors.json`;

interface Manifest {
  gltf: string;
  /** Every file the doors download (paths under assets/) → bytes. */
  files?: Record<string, number>;
}

export class DoorModels {
  private pieces = new Map<string, THREE.Object3D>();

  constructor(scene: THREE.Object3D) {
    for (const child of scene.children) this.pieces.set(child.name, child);
  }

  /** A copy of the named piece (shared/src/dressing.ts doorModelName), or null if it was not built. */
  get(name: string): THREE.Object3D | null {
    const piece = this.pieces.get(name);
    return piece ? piece.clone() : null;
  }
}

/** Loads the door models. Never fails: without them (not built, or a failed download) the doors are plain boxes. */
export async function loadDoorModels(loaders: ModelLoaders): Promise<DoorModels | null> {
  try {
    // Always asked again (a small file), like the rooms' list: it names the build to fetch.
    const res = await fetch(MANIFEST, { cache: "no-cache" });
    if (!res.ok) return null;
    const manifest = (await res.json()) as Manifest;
    // The doors keep their file names when rebuilt, so they are asked for under a version (the
    // sizes of their own files added up): a browser holding an older build fetches the new one.
    const own = Object.entries(manifest.files ?? {}).filter(([path]) => path.startsWith("doors/"));
    const version = own.reduce((sum, [, bytes]) => sum + bytes, 0);
    for (const [path] of own) loaders.roomVersions.set(path, version);
    loaders.expect(manifest.files ?? {}); // the loading bar
    const gltf = await loaders.gltf.loadAsync(import.meta.env.BASE_URL + manifest.gltf);
    return new DoorModels(gltf.scene);
  } catch (err) {
    console.error("The door models failed to load, so the doors are plain boxes", err);
    return null;
  }
}
