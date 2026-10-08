import * as THREE from 'three';

// GREYBOX STUB — to be replaced by the enemies worker. Keep the contract in CONTRACT.md.
const TYPES = {
  wisp: { radius: 0.5, hp: 20, speed: 4.5, damage: 6, score: 10, color: 0x6a4cff },
  brute: { radius: 1.1, hp: 160, speed: 2, damage: 18, score: 60, color: 0x3a2a88 },
  splitter: { radius: 0.8, hp: 50, speed: 3.2, damage: 10, score: 30, color: 0x9a4cff },
  dasher: { radius: 0.6, hp: 35, speed: 3.5, damage: 10, score: 40, color: 0xff4c9a },
  hollow: { radius: 2.4, hp: 2200, speed: 1.4, damage: 12, score: 1000, color: 0x20103a },
};

export function createEnemies(scene, fx) {
  const list = [];
  const geo = new THREE.IcosahedronGeometry(1, 1);
  const _d = new THREE.Vector3();

  function spawn(type, position) {
    const def = TYPES[type];
    const mesh = new THREE.Mesh(geo, new THREE.MeshStandardMaterial({ color: def.color, emissive: def.color, emissiveIntensity: 0.6 }));
    mesh.scale.setScalar(def.radius);
    scene.add(mesh);
    const e = { type, mesh, position: position.clone(), velocity: new THREE.Vector3(), radius: def.radius,
      hp: def.hp, maxHp: def.hp, damage: def.damage, score: def.score, speed: def.speed, dead: false,
      boss: type === 'hollow', flash: 0 };
    list.push(e);
    return e;
  }

  function damage(e, amount) {
    if (e.dead) return false;
    e.hp -= amount;
    e.flash = 0.08;
    if (e.hp > 0) return false;
    e.dead = true;
    scene.remove(e.mesh);
    e.mesh.material.dispose();
    list.splice(list.indexOf(e), 1);
    fx.burst(e.position, TYPES[e.type].color, 24, 6);
    if (e.type === 'splitter') for (let i = 0; i < 2; i++) {
      spawn('wisp', e.position.clone().add(new THREE.Vector3(Math.random() - 0.5, 0, Math.random() - 0.5)));
    }
    return true;
  }

  function update(dt, { players, campfire }) {
    for (const e of list) {
      let target = campfire, best = Infinity;
      for (const p of players) {
        const d = p.position.distanceTo(e.position);
        if (!p.downed && d < 9 && d < best) { best = d; target = p.position; }
      }
      _d.subVectors(target, e.position).setY(0).normalize().multiplyScalar(e.speed);
      e.velocity.lerp(_d, Math.min(1, dt * 3));
      e.position.addScaledVector(e.velocity, dt);
      e.flash -= dt;
      e.mesh.position.copy(e.position).setY(e.radius);
      e.mesh.material.emissiveIntensity = e.flash > 0 ? 3 : 0.6;
    }
  }

  function clear() {
    for (const e of [...list]) { scene.remove(e.mesh); e.mesh.material.dispose(); }
    list.length = 0;
  }

  return { list, spawn, damage, update, clear };
}
