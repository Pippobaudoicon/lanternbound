import * as THREE from 'three';

// GREYBOX STUB — to be replaced by the players worker. Keep the contract in CONTRACT.md.
const SPEED = 9, DASH_SPEED = 28, DASH_TIME = 0.15, DASH_CD = 0.6;
const DEFS = [{ name: 'Ember', color: 0xffa040 }, { name: 'Tide', color: 0x40e0d0 }];

export function createPlayers(scene) {
  return DEFS.map((def, index) => {
    const color = new THREE.Color(def.color);
    const mat = new THREE.MeshStandardMaterial({ color, emissive: color, emissiveIntensity: 1.5 });
    const mesh = new THREE.Mesh(new THREE.SphereGeometry(0.6, 20, 14), mat);
    mesh.castShadow = true;
    scene.add(mesh);
    let dashT = 0, cd = 0;
    const dir = new THREE.Vector3(0, 0, 1);
    const p = {
      index, name: def.name, color,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.6,
      hp: 5, maxHp: 5, downed: false, reviveProgress: 0, invuln: 0, dashing: false,
      update(dt, input, t) {
        let started = false;
        cd -= dt; dashT -= dt;
        if (!p.downed) {
          if (input.x || input.z) dir.set(input.x, 0, input.z).normalize();
          if (input.dash && cd <= 0) { dashT = DASH_TIME; cd = DASH_CD; started = true; }
          p.dashing = dashT > 0;
          if (p.dashing) p.velocity.copy(dir).multiplyScalar(DASH_SPEED);
          else p.velocity.set(input.x, 0, input.z).multiplyScalar(SPEED);
          p.position.addScaledVector(p.velocity, dt);
        }
        mesh.position.copy(p.position).setY(0.8 + Math.sin(t * 4 + index) * 0.1);
        mat.opacity = p.downed ? 0.3 : 1;
        mat.transparent = p.downed;
        mesh.visible = p.invuln > 0 && !p.downed ? Math.floor(t * 20) % 2 === 0 : true;
        return started;
      },
      hit() {},
      setDowned(d) { p.dashing = false; },
      reset(pos) { p.position.copy(pos); p.hp = p.maxHp; p.downed = false; p.reviveProgress = 0; p.invuln = 0; },
    };
    return p;
  });
}

export function createTether(scene) {
  const geo = new THREE.BufferGeometry().setFromPoints([new THREE.Vector3(), new THREE.Vector3()]);
  const mat = new THREE.LineBasicMaterial({ color: 0xfff2c0, transparent: true });
  const line = new THREE.Line(geo, mat);
  scene.add(line);
  return {
    update(dt, a, b, strength) {
      const pos = geo.attributes.position;
      pos.setXYZ(0, a.x, 0.8, a.z); pos.setXYZ(1, b.x, 0.8, b.z);
      pos.needsUpdate = true;
      line.visible = strength > 0;
      mat.opacity = strength;
    },
    flare() {},
  };
}
