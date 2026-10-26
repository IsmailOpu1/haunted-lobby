import * as THREE from "three";
import type { RelicNear } from "@haunted/shared";

// Dropped relics on the floor (GDD 10). The server only says where one is when you are close
// enough to see it, so this shows exactly the ones in the latest relicsNear message.
// A placeholder look until the Phase 8 art pass: a small glowing gold box that bobs.

const RELIC_SIZE_M = 0.2;
const RELIC_HEIGHT_M = 0.18;
const BOB_M = 0.04;
const BOB_PER_SEC = 2.2;
const GLOW_RANGE_M = 2.5;

export class RelicsView {
  private relics = new Map<string, THREE.Group>();
  private geo = new THREE.BoxGeometry(RELIC_SIZE_M, RELIC_SIZE_M, RELIC_SIZE_M);
  private mat = new THREE.MeshBasicMaterial({ color: 0xe0b24a });

  constructor(private scene: THREE.Scene) {}

  setDropped(list: RelicNear[]) {
    const seen = new Set<string>();
    for (const r of list) {
      if (r.hidden) continue;
      seen.add(r.id);
      let group = this.relics.get(r.id);
      if (!group) {
        group = new THREE.Group();
        group.add(new THREE.Mesh(this.geo, this.mat));
        const glow = new THREE.PointLight(0xffc860, 1.2, GLOW_RANGE_M, 2);
        group.add(glow);
        this.scene.add(group);
        this.relics.set(r.id, group);
      }
      group.position.x = r.x;
      group.position.z = r.z;
    }
    for (const [id, group] of this.relics) {
      if (seen.has(id)) continue;
      this.scene.remove(group);
      this.relics.delete(id);
    }
  }

  render(time: number) {
    for (const group of this.relics.values()) {
      group.position.y = RELIC_HEIGHT_M + Math.sin(time * BOB_PER_SEC) * BOB_M;
      group.rotation.y = time * 0.8;
    }
  }
}
