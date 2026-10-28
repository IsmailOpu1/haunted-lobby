import * as THREE from "three";
import type { WorldPoint } from "@haunted/shared";

// Other Wisps (GDD 17): small floating lights, seen only by the dead. Visual tuning only.
const WISP_COLOR = 0xbfe3ff;
const WISP_RADIUS_M = 0.12;
const WISP_HEIGHT_M = 1.3;
const WISP_LIGHT = 1.2;
const WISP_LIGHT_RANGE_M = 3;
const FOLLOW_PER_SEC = 12;
const BOB_M = 0.08;

export class WispsView {
  private wisps = new Map<string, { group: THREE.Group; target: WorldPoint }>();

  constructor(private scene: THREE.Scene) {}

  /** Where each Wisp is now. Pass an empty map when you are alive: you cannot see them. */
  update(positions: Map<string, WorldPoint>) {
    for (const [id, at] of positions) {
      let w = this.wisps.get(id);
      if (!w) {
        const group = new THREE.Group();
        group.add(new THREE.Mesh(new THREE.SphereGeometry(WISP_RADIUS_M, 12, 12), new THREE.MeshBasicMaterial({ color: WISP_COLOR })));
        group.add(new THREE.PointLight(WISP_COLOR, WISP_LIGHT, WISP_LIGHT_RANGE_M));
        group.position.set(at.x, at.y + WISP_HEIGHT_M, at.z);
        this.scene.add(group);
        w = { group, target: at };
        this.wisps.set(id, w);
      }
      w.target = at;
    }
    for (const [id, w] of this.wisps) {
      if (positions.has(id)) continue;
      this.scene.remove(w.group);
      this.wisps.delete(id);
    }
  }

  render(dt: number, time: number) {
    const k = Math.min(1, FOLLOW_PER_SEC * dt);
    let i = 0;
    for (const w of this.wisps.values()) {
      const p = w.group.position;
      const y = w.target.y + WISP_HEIGHT_M + Math.sin(time * 2 + i++) * BOB_M;
      p.set(p.x + (w.target.x - p.x) * k, p.y + (y - p.y) * k, p.z + (w.target.z - p.z) * k);
    }
  }
}
