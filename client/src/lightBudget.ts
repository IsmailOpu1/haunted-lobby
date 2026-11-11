import * as THREE from "three";
import { config } from "@haunted/shared";

// three.js builds each material's shader for the number of point and spot lights in view, so a light
// switched on or off (a torch, the ghost's aura, a camera flash, a wisp) rebuilds every shader on
// screen: the game froze for about a quarter of a second each time (measured 2026-11-11). This keeps
// those numbers fixed: switched-off stand-in lights make up whatever is missing, so each shader is
// built once, while the match loads.

/** Room for point lights that come and go (the ghost's aura, flashes, glows, wisps) over those at the start. */
const POINT_HEADROOM = 8;
/** Stand-ins are parked here, out of every room, with no reach. */
const PARKED_Y = -1000;

export class LightBudget {
  private standIns = new Set<THREE.Light>();
  private points: THREE.PointLight[] = [];
  private spots: THREE.SpotLight[] = [];
  private pointMax: number;
  /** Every player's torch. */
  private spotMax: number = config.players.max;

  constructor(private scene: THREE.Scene) {
    this.pointMax = this.count().point + POINT_HEADROOM;
  }

  /** Call before each render: tops the counts up to the fixed numbers. */
  update() {
    const { point, spot } = this.count();
    // More than planned for: allow it (one rebuild) and keep the new number from then on.
    this.pointMax = Math.max(this.pointMax, point);
    this.spotMax = Math.max(this.spotMax, spot);
    this.fill(this.points, this.pointMax - point, () => new THREE.PointLight(0x000000, 0, 0.001));
    this.fill(this.spots, this.spotMax - spot, () => new THREE.SpotLight(0x000000, 0, 0.001));
  }

  /** Point and spot lights that will be drawn (shown, and every parent shown), not counting stand-ins. */
  private count(): { point: number; spot: number } {
    let point = 0;
    let spot = 0;
    this.scene.traverseVisible((obj) => {
      if (this.standIns.has(obj as THREE.Light)) return;
      if ((obj as THREE.PointLight).isPointLight) point++;
      else if ((obj as THREE.SpotLight).isSpotLight) spot++;
    });
    return { point, spot };
  }

  private fill<T extends THREE.Light>(list: T[], need: number, make: () => T) {
    while (list.length < need) {
      const light = make();
      light.position.y = PARKED_Y;
      this.standIns.add(light);
      this.scene.add(light);
      list.push(light);
    }
    list.forEach((light, i) => (light.visible = i < need));
  }
}
