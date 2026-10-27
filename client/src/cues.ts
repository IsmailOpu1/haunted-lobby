/**
 * Which way a sound is from where you face, in radians: 0 straight ahead, positive to your
 * right, ±π behind you. Facing yaw looks along (-sin, -cos); your right hand points along (cos, -sin).
 */
export function directionTo(fromX: number, fromZ: number, yaw: number, toX: number, toZ: number): number {
  const dx = toX - fromX;
  const dz = toZ - fromZ;
  const ahead = -dx * Math.sin(yaw) - dz * Math.cos(yaw);
  const right = dx * Math.cos(yaw) - dz * Math.sin(yaw);
  return Math.atan2(right, ahead);
}
