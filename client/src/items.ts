import * as THREE from "three";
import { config, saltLineEnds, toWorld, type MapData } from "@haunted/shared";
import { liftToFloor } from "./place.ts";
import { facingYaw } from "./stations.ts";
import { comfort } from "./comfort.ts";

// Salt lines and the camera flash.
const SALT_COLOR = 0xf2efe6;
const SALT_LINE_THICKNESS_M = 0.18;
const FLASH_INTENSITY = 60;
const FLASH_SEC = 0.15;
/** Photosensitivity mode: the flash rises and falls over this long, at this share of its strength. */
const GENTLE_FLASH_SEC = 1.2;
const GENTLE_FLASH_SHARE = 0.3;

const JAR_FOOT_M = 0.79;

/** A salt crock: cream stoneware with its top dipped in brown glaze, a turned wooden lid, and a
 *  paper label lettered SALT. 0.22 m tall, its foot at the origin. Shared by every jar. */
function saltCrockParts(): { geometry: THREE.BufferGeometry; material: THREE.Material }[] {
  const pts = (p: [number, number][]) => p.map(([r, y]) => new THREE.Vector2(r, y));
  const stoneware = new THREE.MeshStandardMaterial({ color: 0xc9bc9c, roughness: 0.45 });
  const glaze = new THREE.MeshStandardMaterial({ color: 0x4e3018, roughness: 0.3 });
  const wood = new THREE.MeshStandardMaterial({ color: 0x3b2616, roughness: 0.75 });
  // The body to the glaze line, then the glazed shoulder and rim.
  const body = new THREE.LatheGeometry(pts([[0, 0], [0.078, 0], [0.084, 0.006], [0.092, 0.05], [0.094, 0.1], [0.093, 0.125]]), 28);
  const top = new THREE.LatheGeometry(pts([[0.093, 0.125], [0.09, 0.16], [0.078, 0.18], [0.072, 0.188], [0.074, 0.196], [0.066, 0.198]]), 28);
  // The lid sits in the rim: a flat disc with a turned knob.
  const lid = new THREE.LatheGeometry(pts([[0, 0.2], [0.072, 0.2], [0.072, 0.208], [0.03, 0.212], [0.016, 0.218], [0.014, 0.228], [0.02, 0.236], [0, 0.24]]), 24);
  // The label: a band of paper round the front of the belly.
  const canvas = document.createElement("canvas");
  canvas.width = 256;
  canvas.height = 96;
  const c = canvas.getContext("2d")!;
  c.fillStyle = "#cdbf98";
  c.fillRect(0, 0, 256, 96);
  c.strokeStyle = "#3a2a18";
  c.lineWidth = 3;
  c.strokeRect(10, 10, 236, 76);
  c.fillStyle = "#2a1c10";
  c.font = "bold 52px Georgia, serif";
  c.textAlign = "center";
  c.textBaseline = "middle";
  c.fillText("SALT", 128, 52);
  const map = new THREE.CanvasTexture(canvas);
  map.colorSpace = THREE.SRGBColorSpace;
  const label = new THREE.CylinderGeometry(0.0955, 0.0955, 0.055, 24, 1, true, -0.75, 1.5);
  label.translate(0, 0.075, 0);
  const paper = new THREE.MeshStandardMaterial({ map, roughness: 0.85 });
  return [
    { geometry: body, material: stoneware },
    { geometry: top, material: glaze },
    { geometry: lid, material: wood },
    { geometry: label, material: paper },
  ];
}

/** Salt lines on the floor and salt jars in the rooms, drawn from the server state. */
export class ItemsView {
  private lines = new Map<string, THREE.Mesh>();
  private jars = new Map<string, THREE.Object3D>();
  private saltMat = new THREE.MeshLambertMaterial({ color: SALT_COLOR });

  constructor(private scene: THREE.Scene, private map: MapData) {
    const parts = saltCrockParts();
    for (const jar of map.saltJars) {
      const crock = new THREE.Group();
      for (const p of parts) crock.add(new THREE.Mesh(p.geometry, p.material));
      // Jars stand on a sideboard (its top 0.79 m up) so they are easy to spot with a flashlight.
      crock.position.set(jar.x, JAR_FOOT_M, jar.z);
      crock.rotation.y = facingYaw(map, jar); // the label toward the room
      scene.add(liftToFloor(map, crock));
      this.jars.set(jar.id, crock);
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
    if (!comfort.photosensitive) {
      setTimeout(() => this.scene.remove(light), FLASH_SEC * 1000);
      return;
    }
    // Photosensitivity mode (GDD 23): a soft glow that fades, never a flash.
    const start = performance.now();
    const fade = () => {
      const t = (performance.now() - start) / (GENTLE_FLASH_SEC * 1000);
      if (t >= 1) {
        this.scene.remove(light);
        return;
      }
      light.intensity = FLASH_INTENSITY * GENTLE_FLASH_SHARE * Math.sin(Math.PI * t);
      requestAnimationFrame(fade);
    };
    light.intensity = 0;
    fade();
  }
}
