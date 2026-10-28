import * as THREE from "three";
import { config } from "@haunted/shared";

// Look of the flashlight beam (GDD Section 8.1: 12 m cone). Visual tuning only.
const BEAM_ANGLE = (config.flashlight.coneHalfAngleDeg * Math.PI) / 180; // half-angle of the cone
const BEAM_PENUMBRA = 0.5;
const BEAM_INTENSITY = 30;
const BEAM_DECAY = 1.2;

/** A spotlight with its own target, so it can be attached to a camera or a player model. */
export function createFlashlight(): { light: THREE.SpotLight; target: THREE.Object3D } {
  const light = new THREE.SpotLight(0xfff2d6, BEAM_INTENSITY, config.flashlight.coneM, BEAM_ANGLE, BEAM_PENUMBRA, BEAM_DECAY);
  const target = new THREE.Object3D();
  target.position.set(0, 0, -1);
  light.target = target;
  return { light, target };
}
