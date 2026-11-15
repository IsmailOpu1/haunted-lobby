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

/**
 * A download of the hotel's art that fails on the way (a dropped connection, a busy server, the
 * browser's cache failing to write) is tried again, waiting a little longer each time, instead of
 * leaving a room grey (owner, 2026-11-15). Every loader below fetches through here.
 */
const DOWNLOAD_TRIES = 6;
const FIRST_RETRY_WAIT_MS = 500;
const ASSET_URL = /\/(?:assets|basis)\//;
let retryInstalled = false;
export function installDownloadRetry() {
  if (retryInstalled || typeof window === "undefined") return;
  retryInstalled = true;
  const plain = window.fetch.bind(window);
  window.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = typeof input === "string" ? input : input instanceof URL ? input.href : input.url;
    if (!ASSET_URL.test(url)) return plain(input, init);
    for (let attempt = 1; ; attempt++) {
      const request = input instanceof Request ? input.clone() : input;
      // After a failure, skip the browser's cache: a cache that failed to write can fail again.
      const options: RequestInit | undefined = attempt === 1 ? init : { ...init, cache: "no-store" };
      try {
        const response = await plain(request, options);
        // A missing file (404) will not appear by asking again; a server error might pass.
        if (response.ok || response.status < 500 || attempt >= DOWNLOAD_TRIES) return response;
        console.warn(`Download of ${url} failed (${response.status}); trying again`);
      } catch (err) {
        if (attempt >= DOWNLOAD_TRIES || init?.signal?.aborted) throw err;
        console.warn(`Download of ${url} failed; trying again`, err);
      }
      await new Promise((r) => setTimeout(r, FIRST_RETRY_WAIT_MS * 2 ** (attempt - 1)));
    }
  };
}

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
  /** Stops the texture workers once everything is loaded (the room textures too). */
  dispose(): void;
  /** The rooms' textures, all in before the game is ready (textureStream.ts). */
  stream: TextureStream;
  /** A loader for one room: its textures are stand-ins until the stream brings them. */
  roomLoader(group: StreamGroup): GLTFLoader;
}

export function modelLoaders(renderer: THREE.WebGLRenderer, lowTextures: boolean, onProgress?: LoadProgress): ModelLoaders {
  installDownloadRetry();
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
