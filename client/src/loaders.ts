import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";
import { type StreamGroup, TextureStream } from "./textureStream.ts";

// Loaders for the built art (tools/art): glTF with KTX2 textures and Meshopt-compressed meshes.

const TRANSCODER = `${import.meta.env.BASE_URL}basis/`;
/**
 * Low quality loads every room texture from the 1K set, which has the same file names
 * (tools/art/build-room.ts). Rooms point at "../textures/<name>.ktx2".
 */
const ROOM_TEXTURE = /\/textures\/([0-9a-f]+\.ktx2)$/;
/** A room's or the doors' own file ("rooms/ballroom.bin"), however its URL was written. */
const ROOM_FILE = /(?:^|\/)((?:rooms|doors)\/[^/?#]+)(?:[?#].*)?$/;
/** A downloaded file's path under assets/ ("textures/ab12.ktx2"), however its URL was written. */
const ASSET_KEY = /(?:^|\/)((?:rooms|doors|textures|textures-1k)\/[^/?#]+)(?:[?#].*)?$/;

/** How much of the hotel has downloaded, in bytes. */
export type LoadProgress = (loaded: number, total: number) => void;

export interface ModelLoaders {
  gltf: GLTFLoader;
  ktx2: KTX2Loader;
  /** Every file these loaders fetch passes through here; its onProgress hears each one finish. */
  manager: THREE.LoadingManager;
  /** Whether the room textures come from the 1K set. */
  lowTextures: boolean;
  /**
   * A version for each room or door file ("rooms/ballroom.bin" → n), added to its URL. A rebuilt
   * room keeps its file names, so without it a browser could keep showing the build it saw before.
   */
  roomVersions: Map<string, number>;
  /**
   * Adds files to the loading bar (paths under assets/ → bytes, from a build's manifest). Files of
   * the texture set not being loaded are left out, and a file named twice (shared textures) counts once.
   */
  expect(files: Record<string, number>): void;
  /** Ends the loading bar (files that failed to load still end it). */
  finishProgress(): void;
  /** Stops the texture workers once everything is loaded (the streamed room textures too). */
  dispose(): void;
  /** The rooms' textures, which arrive after the match can start (textureStream.ts). */
  stream: TextureStream;
  /** A loader for one room: its textures are stand-ins until the stream brings them. */
  roomLoader(group: StreamGroup): GLTFLoader;
}

export function modelLoaders(renderer: THREE.WebGLRenderer, lowTextures: boolean, onProgress?: LoadProgress): ModelLoaders {
  const manager = new THREE.LoadingManager();
  // The loading bar: every expected file, counted once when it finishes.
  const skip = lowTextures ? "textures/" : "textures-1k/";
  const expected = new Set<string>();
  const pending = new Map<string, number>();
  let total = 0;
  let loaded = 0;
  const expect = (files: Record<string, number>) => {
    for (const [path, bytes] of Object.entries(files)) {
      if (path.startsWith(skip) || expected.has(path)) continue;
      expected.add(path);
      pending.set(path, bytes);
      total += bytes;
    }
    onProgress?.(loaded, total);
  };
  manager.onProgress = (url) => {
    const key = ASSET_KEY.exec(url)?.[1];
    const bytes = key === undefined ? undefined : pending.get(key);
    if (key === undefined || bytes === undefined) return;
    pending.delete(key);
    loaded += bytes;
    onProgress?.(loaded, total);
  };
  const finishProgress = () => onProgress?.(total, total);
  const roomVersions = new Map<string, number>();
  manager.setURLModifier((url) => {
    if (lowTextures) url = url.replace(ROOM_TEXTURE, "/textures-1k/$1");
    const key = ROOM_FILE.exec(url)?.[1];
    const version = key ? roomVersions.get(key) : undefined;
    return version === undefined ? url : `${url}${url.includes("?") ? "&" : "?"}v=${version}`;
  });
  const ktx2 = new KTX2Loader(manager).setTranscoderPath(TRANSCODER).detectSupport(renderer);
  const gltf = new GLTFLoader(manager).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  const stream = new TextureStream();
  const roomLoader = (group: StreamGroup) => {
    const loader = new GLTFLoader(manager).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
    // Ahead of the loader's own KTX2 handling, so it is asked first.
    (loader as unknown as { pluginCallbacks: unknown[] }).pluginCallbacks.unshift(stream.plugin(group));
    return loader;
  };
  return { gltf, ktx2, manager, lowTextures, roomVersions, expect, finishProgress, dispose: () => ktx2.dispose(), stream, roomLoader };
}
