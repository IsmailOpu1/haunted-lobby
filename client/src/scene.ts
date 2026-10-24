import * as THREE from "three";
import { PointerLockControls } from "three/addons/controls/PointerLockControls.js";
import { config } from "@haunted/shared";

/**
 * Phase 0 scene: a grey floor and a first-person camera with mouse look and WASD.
 * It is deliberately lit brighter than the final game so it is easy to see while testing.
 * The real darkness, flashlight and movement rules come in Phase 1.
 */
export function startScene(canvas: HTMLCanvasElement) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: false });
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));

  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x1a1c22);
  scene.fog = new THREE.Fog(0x1a1c22, 8, 45);

  const camera = new THREE.PerspectiveCamera(75, 1, 0.1, 100);
  camera.position.set(0, config.movement.eyeHeightM, 8);

  scene.add(new THREE.HemisphereLight(0xc8ccd8, 0x303030, 1.6));
  const sun = new THREE.DirectionalLight(0xffffff, 1.2);
  sun.position.set(10, 20, 8);
  scene.add(sun);

  const floor = new THREE.Mesh(
    new THREE.PlaneGeometry(60, 40),
    new THREE.MeshLambertMaterial({ color: 0x8c8c8c }),
  );
  floor.rotation.x = -Math.PI / 2;
  scene.add(floor);

  // A 2 m grid and a few pillars make movement and distance easy to judge.
  const grid = new THREE.GridHelper(60, 30, 0x5a5a5a, 0x6e6e6e);
  grid.position.y = 0.01;
  scene.add(grid);
  const pillarGeo = new THREE.BoxGeometry(0.6, 3, 0.6);
  const pillarMat = new THREE.MeshLambertMaterial({ color: 0xb0b0b0 });
  for (let x = -20; x <= 20; x += 8) {
    for (let z = -12; z <= 12; z += 8) {
      const pillar = new THREE.Mesh(pillarGeo, pillarMat);
      pillar.position.set(x, 1.5, z);
      scene.add(pillar);
    }
  }

  const controls = new PointerLockControls(camera, canvas);
  let lookEnabled = false;
  canvas.addEventListener("click", () => {
    if (lookEnabled) controls.lock();
  });

  const keys = new Set<string>();
  window.addEventListener("keydown", (e) => keys.add(e.code));
  window.addEventListener("keyup", (e) => keys.delete(e.code));

  function resize() {
    const { innerWidth: w, innerHeight: h } = window;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }
  window.addEventListener("resize", resize);
  resize();

  const timer = new THREE.Timer();
  renderer.setAnimationLoop((time) => {
    timer.update(time);
    const dt = Math.min(timer.getDelta(), 0.1);
    if (controls.isLocked) {
      const step = config.movement.walk * dt;
      const forward = (keys.has("KeyW") ? 1 : 0) - (keys.has("KeyS") ? 1 : 0);
      const right = (keys.has("KeyD") ? 1 : 0) - (keys.has("KeyA") ? 1 : 0);
      if (forward) controls.moveForward(forward * step);
      if (right) controls.moveRight(right * step);
    }
    renderer.render(scene, camera);
  });

  return {
    /** Lets a click on the scene capture the mouse (only after joining a room). */
    enableLook() {
      lookEnabled = true;
    },
    /** Called with true when the mouse is captured, false when released with Esc. */
    onLookChange(callback: (looking: boolean) => void) {
      controls.addEventListener("lock", () => callback(true));
      controls.addEventListener("unlock", () => callback(false));
    },
  };
}
