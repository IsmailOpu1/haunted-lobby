import * as THREE from "three";
import { describe, expect, it } from "vitest";
import type { GLTFParser } from "three/examples/jsm/loaders/GLTFLoader.js";
import { type StreamGroup, TextureStream } from "./textureStream.ts";

/** A pretend glTF with one texture per file name, and a log of which files were really loaded. */
function room(stream: TextureStream, group: StreamGroup, files: string[], loaded: string[]) {
  const json = {
    textures: files.map((_, i) => ({ extensions: { KHR_texture_basisu: { source: i } } })),
    images: files.map((uri) => ({ uri })),
    materials: files.map((_, i) => ({ pbrMetallicRoughness: { baseColorTexture: { index: i } } })),
  };
  const parser = {
    json,
    plugins: {
      KHR_texture_basisu: {
        loadTexture: (i: number) => {
          loaded.push(files[i]!);
          const real = new THREE.CompressedTexture([{ data: new Uint8Array(16), width: 4, height: 4 }], 4, 4, THREE.RGBA_BPTC_Format);
          real.name = files[i]!;
          return Promise.resolve(real);
        },
      },
    },
  } as unknown as GLTFParser;
  const plugin = stream.plugin(group)(parser);
  return files.map((_, i) => plugin.loadTexture!(i) as Promise<THREE.Texture>);
}

const settle = () => new Promise((r) => setTimeout(r, 0));

describe("room textures arrive after the match can start", () => {
  it("gives stand-ins at once and loads nothing until started", async () => {
    const stream = new TextureStream();
    const loaded: string[] = [];
    const [t] = room(stream, { centre: new THREE.Vector3(), pending: new Set() }, ["a.ktx2"], loaded);
    const standIn = await t!;
    expect((standIn.image as { width: number }).width).toBe(1);
    await settle();
    expect(loaded).toEqual([]);
  });

  it("loads the nearest room first, and puts each real texture into its stand-in", async () => {
    const stream = new TextureStream();
    const loaded: string[] = [];
    const far: StreamGroup = { centre: new THREE.Vector3(50, 0, 0), pending: new Set() };
    const near: StreamGroup = { centre: new THREE.Vector3(2, 0, 0), pending: new Set() };
    let nearDone = false;
    near.onDone = () => (nearDone = true);
    const farTextures = room(stream, far, Array.from({ length: 6 }, (_, i) => `far${i}.ktx2`), loaded);
    const [nearTexture] = room(stream, near, ["near.ktx2"], loaded);
    let finished = false;
    stream.start(() => new THREE.Vector3(), () => (finished = true));
    expect(loaded[0]).toBe("near.ktx2");
    for (let i = 0; i < 5; i++) await settle();
    expect(nearDone).toBe(true);
    expect(finished).toBe(true);
    expect((await nearTexture!).name).toBe("near.ktx2");
    expect(((await nearTexture!).image as { width: number }).width).toBe(4);
    expect(((await farTextures[0]!).image as { width: number }).width).toBe(4);
  });

  it("loads a texture used by two rooms once, and both rooms share it", async () => {
    const stream = new TextureStream();
    const loaded: string[] = [];
    const [a] = room(stream, { centre: new THREE.Vector3(), pending: new Set() }, ["sofa.ktx2"], loaded);
    const [b] = room(stream, { centre: new THREE.Vector3(9, 0, 0), pending: new Set() }, ["sofa.ktx2"], loaded);
    stream.start(() => new THREE.Vector3(), () => {});
    for (let i = 0; i < 5; i++) await settle();
    expect(loaded).toEqual(["sofa.ktx2"]);
    expect(await a!).toBe(await b!);
  });
});
