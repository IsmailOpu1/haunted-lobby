import * as THREE from "three";
import { GLTFLoader } from "three/examples/jsm/loaders/GLTFLoader.js";
import { KTX2Loader } from "three/examples/jsm/loaders/KTX2Loader.js";
import { MeshoptDecoder } from "three/examples/jsm/libs/meshopt_decoder.module.js";

// Loaders for the built art (tools/art): glTF with KTX2 textures and Meshopt-compressed meshes.

const TRANSCODER = `${import.meta.env.BASE_URL}basis/`;
/**
 * Low quality loads every room texture from the 1K set, which has the same file names
 * (tools/art/build-room.ts). Rooms point at "../textures/<name>.ktx2".
 */
const ROOM_TEXTURE = /\/textures\/([0-9a-f]+\.ktx2)$/;

export interface ModelLoaders {
  gltf: GLTFLoader;
  ktx2: KTX2Loader;
  /** Every file these loaders fetch passes through here; its onProgress hears each one finish. */
  manager: THREE.LoadingManager;
  /** Whether the room textures come from the 1K set. */
  lowTextures: boolean;
  /** Stops the texture workers once everything is loaded. */
  dispose(): void;
}

export function modelLoaders(renderer: THREE.WebGLRenderer, lowTextures: boolean): ModelLoaders {
  const manager = new THREE.LoadingManager();
  if (lowTextures) manager.setURLModifier((url) => url.replace(ROOM_TEXTURE, "/textures-1k/$1"));
  const ktx2 = new KTX2Loader(manager).setTranscoderPath(TRANSCODER).detectSupport(renderer);
  const gltf = new GLTFLoader(manager).setKTX2Loader(ktx2).setMeshoptDecoder(MeshoptDecoder);
  return { gltf, ktx2, manager, lowTextures, dispose: () => ktx2.dispose() };
}
