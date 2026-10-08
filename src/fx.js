import * as THREE from 'three';

// GREYBOX STUB — to be replaced by the fx worker. Keep the contract in CONTRACT.md.
export function createFX(scene) {
  let trauma = 0;
  const cameraOffset = new THREE.Vector3();
  return {
    burst() {},
    ring() {},
    shake(a) { trauma = Math.min(1, trauma + a); },
    cameraOffset,
    update(dt) {
      trauma = Math.max(0, trauma - dt * 1.5);
      const s = trauma * trauma * 0.8;
      cameraOffset.set((Math.random() - 0.5) * s, (Math.random() - 0.5) * s, (Math.random() - 0.5) * s);
    },
  };
}
