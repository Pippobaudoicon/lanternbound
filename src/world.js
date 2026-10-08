import * as THREE from 'three';

// GREYBOX STUB — to be replaced by the world worker. Keep the contract in CONTRACT.md.
export function createWorld(scene) {
  scene.background = new THREE.Color(0x0a0c1a);
  scene.fog = new THREE.Fog(0x0a0c1a, 40, 90);
  const hemi = new THREE.HemisphereLight(0x6070c0, 0x101018, 0.6);
  scene.add(hemi);
  const ground = new THREE.Mesh(new THREE.CylinderGeometry(22, 18, 2, 48),
    new THREE.MeshStandardMaterial({ color: 0x1d2a22 }));
  ground.position.y = -1;
  ground.receiveShadow = true;
  scene.add(ground);

  const fireLight = new THREE.PointLight(0xff8a30, 40, 30, 1.5);
  fireLight.position.set(0, 1.5, 0);
  fireLight.castShadow = true;
  scene.add(fireLight);
  const flame = new THREE.Mesh(new THREE.ConeGeometry(0.7, 1.6, 8), new THREE.MeshBasicMaterial({ color: 0xffa040 }));
  flame.position.y = 0.8;
  scene.add(flame);

  let health = 1, hurtT = 0;
  const campfire = {
    position: new THREE.Vector3(),
    radius: 1.2,
    setHealth(f) { health = f; },
    hurt() { hurtT = 0.3; },
  };

  return {
    arenaRadius: 20,
    campfire,
    update(dt, t, dawn) {
      hurtT = Math.max(0, hurtT - dt);
      const s = 0.3 + health * 0.7;
      flame.scale.set(s, s * (1 + Math.sin(t * 12) * 0.08), s);
      fireLight.intensity = (20 + health * 30) * (hurtT > 0 ? 0.4 : 1);
      scene.background.setHSL(0.65, 0.4, 0.05 + dawn * 0.3);
    },
  };
}
