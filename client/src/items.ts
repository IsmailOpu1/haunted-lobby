import * as THREE from "three";
import { config, saltLineEnds, toWorld, type MapData } from "@haunted/shared";
import { liftToFloor } from "./place.ts";

// Placeholder looks for items until the Phase 8 art pass.
const SALT_COLOR = 0xf2efe6;
const SALT_LINE_THICKNESS_M = 0.18;
const FLASH_INTENSITY = 60;
const FLASH_SEC = 0.15;

/** Salt lines on the floor and salt jars in the rooms, drawn from the server state. */
export class ItemsView {
  private lines = new Map<string, THREE.Mesh>();
  private jars = new Map<string, THREE.Mesh>();
  private saltMat = new THREE.MeshLambertMaterial({ color: SALT_COLOR });

  constructor(private scene: THREE.Scene, private map: MapData) {
    const jarGeo = new THREE.CylinderGeometry(0.09, 0.1, 0.22, 10);
    const jarMat = new THREE.MeshLambertMaterial({ color: 0xd9d4c7 });
    for (const jar of map.saltJars) {
      const mesh = new THREE.Mesh(jarGeo, jarMat);
      // Jars sit on a small shelf height so they are easy to spot with a flashlight.
      mesh.position.set(jar.x, 0.9, jar.z);
      scene.add(liftToFloor(map, mesh));
      this.jars.set(jar.id, mesh);
    }
  }

  update(state: any) {
    state.saltJars?.forEach((jar: { taken: boolean }, id: string) => {
      const mesh = this.jars.get(id);
      if (mesh) mesh.visible = !jar.taken;
    });

    const seen = new Set<string>();
    state.saltLines?.forEach((line: { x: number; z: number; yaw: number }, id: string) => {
      seen.add(id);
      if (this.lines.has(id)) return;
      const [a, b] = saltLineEnds(line);
      const mesh = new THREE.Mesh(new THREE.BoxGeometry(config.salt.lineWidthM, 0.02, SALT_LINE_THICKNESS_M), this.saltMat);
      const mid = toWorld(this.map, (a.x + b.x) / 2, (a.z + b.z) / 2);
      mesh.position.set(mid.x, mid.y + 0.011, mid.z);
      mesh.rotation.y = line.yaw;
      this.scene.add(mesh);
      this.lines.set(id, mesh);
    });
    for (const [id, mesh] of this.lines) {
      if (seen.has(id)) continue;
      this.scene.remove(mesh);
      mesh.geometry.dispose();
      this.lines.delete(id);
    }
  }

  /** Someone else's camera flash: a short burst of light where they stand. */
  flashAt(x: number, z: number) {
    const light = new THREE.PointLight(0xffffff, FLASH_INTENSITY, config.camera.flashVisibleM, 1.5);
    const at = toWorld(this.map, x, z);
    light.position.set(at.x, at.y + 1.6, at.z);
    this.scene.add(light);
    setTimeout(() => this.scene.remove(light), FLASH_SEC * 1000);
  }
}
