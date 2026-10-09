import * as THREE from 'three';
import { mergeGeometries } from 'three/addons/utils/BufferGeometryUtils.js';

const TYPES = {
  wisp: { radius: 0.5, hp: 20, speed: 4.5, damage: 6, score: 10, glow: 0xb697ff },
  brute: { radius: 1.1, hp: 160, speed: 2, damage: 18, score: 60, glow: 0xff9cbd },
  splitter: { radius: 0.8, hp: 50, speed: 3.2, damage: 10, score: 30, glow: 0xb8f0df },
  dasher: { radius: 0.6, hp: 35, speed: 3.5, damage: 10, score: 40, glow: 0xff7eb8 },
  hollow: { radius: 2.4, hp: 2200, speed: 1.4, damage: 12, score: 1000, glow: 0xd6b0ff },
};

// All silhouettes use local +Z as their face. Merge their fixed parts once.
function shape(geo, x, y, z, sx, sy, sz, rx = 0, rz = 0) {
  geo.scale(sx, sy, sz);
  geo.rotateX(rx);
  geo.rotateZ(rz);
  geo.translate(x, y, z);
  return geo;
}
function orb(x, y, z, sx, sy, sz) {
  return shape(new THREE.SphereGeometry(1, 12, 8), x, y, z, sx, sy, sz);
}
function horn(x, y, z, sx, sy, sz, rx = 0, rz = 0) {
  return shape(new THREE.ConeGeometry(1, 1, 5), x, y, z, sx, sy, sz, rx, rz);
}
function merged(parts) {
  const result = mergeGeometries(parts);
  for (const part of parts) part.dispose();
  return result;
}

export function createEnemies(scene, fx) {
  const list = [];
  const bodies = {}, faces = {}, cracks = {};
  bodies.wisp = merged([
    orb(0, 0.7, 0, 0.48, 0.62, 0.42),
    horn(0, 0.65, -0.48, 0.35, 1.2, 0.28, -Math.PI / 2),
    horn(0, 0.4, -0.96, 0.18, 0.7, 0.16, -2),
  ]);
  bodies.brute = merged([
    orb(0, 1.05, 0, 1.04, 1.17, 0.78), orb(-0.9, 0.7, 0, 0.42, 0.65, 0.5),
    orb(0.9, 0.7, 0, 0.42, 0.65, 0.5),
    horn(-0.7, 2.2, 0, 0.31, 1.05, 0.3, 0, 0.4),
    horn(0.7, 2.2, 0, 0.31, 1.05, 0.3, 0, -0.4),
  ]);
  bodies.splitter = merged([
    orb(-0.34, 0.77, 0, 0.52, 0.8, 0.65), orb(0.34, 0.77, 0, 0.52, 0.8, 0.65),
    horn(-0.42, 1.65, -0.1, 0.18, 0.45, 0.18, 0, -0.3),
    horn(0.42, 1.65, -0.1, 0.18, 0.45, 0.18, 0, 0.3),
  ]);
  bodies.dasher = merged([
    horn(0, 0.55, 0.15, 0.62, 1.55, 0.48, Math.PI / 2),
    horn(-0.4, 0.45, -0.38, 0.2, 0.7, 0.2, -Math.PI / 2, -0.3),
    horn(0.4, 0.45, -0.38, 0.2, 0.7, 0.2, -Math.PI / 2, 0.3),
  ]);
  const crown = [orb(0, 2.25, 0, 2.1, 2.5, 1.25), horn(0, 0.6, -0.2, 1.4, 2.2, 0.8, Math.PI)];
  for (let i = -2; i <= 2; i++) crown.push(horn(i * 0.77, 4.55 - Math.abs(i) * 0.3, -0.05,
    0.32, 1.5 - Math.abs(i) * 0.12, 0.32, -0.12, -i * 0.22));
  bodies.hollow = merged(crown);

  for (const type of Object.keys(TYPES)) {
    const eyes = [];
    if (type === 'splitter') {
      for (const x of [-0.51, -0.2, 0.2, 0.51]) eyes.push(orb(x, 1.05, 0.55, 0.09, 0.14, 0.09));
    } else if (type === 'hollow') {
      for (let i = -2; i <= 2; i++) eyes.push(orb(i * 0.55, 2.8 - Math.abs(i) * 0.23, 1.17,
        0.16, 0.29 - Math.abs(i) * 0.04, 0.1));
      eyes.push(orb(0, 3.6, 1.03, 0.11, 0.17, 0.08));
    } else {
      const brute = type === 'brute';
      for (const side of [-1, 1]) eyes.push(orb(side * (brute ? 0.38 : 0.18), brute ? 1.6 : 0.83,
        brute ? 0.69 : 0.35, brute ? 0.14 : 0.1, brute ? 0.13 : 0.16, 0.08));
    }
    faces[type] = merged(eyes);
  }
  cracks.brute = merged([horn(0, 0.94, 0.77, 0.12, 0.8, 0.035, 0, 0.18),
    horn(-0.17, 1.1, 0.76, 0.06, 0.45, 0.035, 0, -0.6)]);
  cracks.splitter = merged([orb(0, 0.75, 0.6, 0.025, 0.62, 0.025)]);
  cracks.hollow = merged([horn(0, 1.75, 1.23, 0.15, 1.6, 0.04, 0, 0.25),
    horn(-0.4, 2.2, 1.2, 0.09, 1.2, 0.04, 0, -0.65),
    horn(0.5, 1.5, 1.14, 0.07, 1.1, 0.04, 0, 0.8)]);

  const shellMat = new THREE.MeshBasicMaterial({ color: 0x6550aa, transparent: true, opacity: 0.09,
    depthWrite: false, side: THREE.BackSide });
  const puddleGeo = new THREE.CircleGeometry(1, 24);
  const puddleMat = new THREE.MeshBasicMaterial({ color: 0x181127, transparent: true, opacity: 0.55, depthWrite: false });
  const shardGeo = new THREE.OctahedronGeometry(0.32);
  const shardMat = new THREE.MeshStandardMaterial({ color: 0x302145, emissive: 0x744da8, emissiveIntensity: 0.5, roughness: 0.5 });
  const barBackMat = new THREE.SpriteMaterial({ color: 0x170c28, depthTest: false });
  const barMat = new THREE.SpriteMaterial({ color: new THREE.Color(2.5, 0.4, 1.2), depthTest: false, toneMapped: false });
  const desired = new THREE.Vector3();
  const matrix = new THREE.Object3D();

  let nextId = 1;
  function spawn(type, position) {
    const def = TYPES[type];
    const root = new THREE.Group();
    root.position.copy(position);
    const visual = new THREE.Group();
    root.add(visual);
    const bodyMat = new THREE.MeshStandardMaterial({ color: type === 'splitter' ? 0x37254f : 0x211932,
      emissive: 0x39215d, emissiveIntensity: 0.32, roughness: 0.75, transparent: true });
    const eyeMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(def.glow).multiplyScalar(3),
      transparent: true, toneMapped: false });
    visual.add(new THREE.Mesh(bodies[type], bodyMat));
    visual.add(new THREE.Mesh(faces[type], eyeMat));
    if (cracks[type]) visual.add(new THREE.Mesh(cracks[type], eyeMat));
    const smoke = new THREE.Mesh(bodies[type], shellMat);
    smoke.scale.set(1.12, 1.1, 1.12);
    visual.add(smoke);
    const puddle = new THREE.Mesh(puddleGeo, puddleMat);
    puddle.rotation.x = -Math.PI / 2;
    puddle.position.y = 0.025;
    puddle.scale.setScalar(def.radius * 1.35);
    root.add(puddle);
    const e = { id: nextId++, type, position: position.clone().setY(0), velocity: new THREE.Vector3(),
      radius: def.radius, hp: def.hp, maxHp: def.hp, damage: def.damage, score: def.score,
      boss: type === 'hollow', dead: false, speed: def.speed, mesh: root, visual, bodyMat, eyeMat,
      smoke, puddle, age: 0, flash: 0, seed: Math.random() * 30, heading: 0,
      lastVelocity: new THREE.Vector3(), charge: 0, cooldown: 2 + Math.random() * 2,
      chargeX: 0, chargeZ: 0, summon: 5, size: 1 };
    if (e.boss) {
      e.shards = new THREE.InstancedMesh(shardGeo, shardMat, 9);
      e.shards.frustumCulled = false;
      root.add(e.shards);
      const back = new THREE.Sprite(barBackMat);
      back.position.set(0, 6.2, 0);
      back.scale.set(4.3, 0.24, 1);
      back.renderOrder = 5;
      const bar = new THREE.Sprite(barMat);
      bar.position.set(0, 6.2, 0);
      bar.scale.set(4.1, 0.13, 1);
      bar.renderOrder = 6;
      root.add(back, bar);
      e.bar = bar;
    }
    scene.add(root);
    list.push(e);
    return e;
  }

  function remove(e) {
    scene.remove(e.mesh);
    e.bodyMat.dispose();
    e.eyeMat.dispose();
    if (e.shards) e.shards.dispose();
  }

  function damage(e, amount) {
    if (e.dead) return false;
    e.hp = Math.max(0, e.hp - amount);
    e.flash = 0.14;
    if (e.hp > 0) return false;
    e.dead = true;
    list.splice(list.indexOf(e), 1);
    remove(e);
    fx.burst(e.position, 0x8862c9, e.boss ? 80 : 18, e.boss ? 10 : 3.5);
    fx.burst(e.position, TYPES[e.type].glow, e.boss ? 35 : 7, 5);
    fx.ring(e.position, 0x8b5abb, e.radius * 2.3);
    if (e.type === 'splitter') {
      const angle = e.heading + Math.PI / 2;
      for (const side of [-1, 1]) {
        const child = spawn('wisp', e.position);
        child.position.x += Math.sin(angle) * 0.55 * side;
        child.position.z += Math.cos(angle) * 0.55 * side;
        child.velocity.set(Math.sin(angle) * 7 * side, 0, Math.cos(angle) * 7 * side);
        child.size = 0.75;
        child.radius = 0.38;
      }
    }
    return true;
  }

  function update(dt, { players, campfire, t = 0 }) {
    const count = list.length;
    for (let i = 0; i < count; i++) {
      const e = list[i];
      e.age += dt;
      e.flash = Math.max(0, e.flash - dt);
      let target = campfire, best = 81;
      for (const p of players) {
        const dx = p.position.x - e.position.x, dz = p.position.z - e.position.z;
        const d = dx * dx + dz * dz;
        if (!p.downed && d < best) { best = d; target = p.position; }
      }
      let dx = target.x - e.position.x, dz = target.z - e.position.z;
      const distance = Math.hypot(dx, dz);
      if (distance > 0.01) { dx /= distance; dz /= distance; }
      else { dx = 0; dz = 0; }
      desired.set(dx * e.speed, 0, dz * e.speed);
      if (e.type === 'wisp') {
        const weave = Math.sin(t * 7 + e.seed) * 1.6;
        desired.x += dz * weave;
        desired.z -= dx * weave;
      }
      if (e.type === 'dasher') {
        e.cooldown -= dt;
        if (e.cooldown <= 0 && e.charge === 0) {
          e.charge = 1.1;
          e.chargeX = dx; e.chargeZ = dz;
          e.cooldown = 3.7 + Math.random();
        }
        if (e.charge > 0) {
          const before = e.charge;
          e.charge = Math.max(0, e.charge - dt);
          if (e.charge > 0.5) desired.set(0, 0, 0);
          else {
            if (before > 0.5) fx.ring(e.position, 0xff559c, 1.4);
            desired.set(e.chargeX * 16, 0, e.chargeZ * 16);
          }
        }
      }
      // Only damp externally added impulses on the heavy creatures.
      if (e.type === 'brute' || e.boss) {
        const resistance = e.boss ? 0.12 : 0.28;
        e.velocity.x = e.lastVelocity.x + (e.velocity.x - e.lastVelocity.x) * resistance;
        e.velocity.z = e.lastVelocity.z + (e.velocity.z - e.lastVelocity.z) * resistance;
      }
      let sx = 0, sz = 0;
      for (let j = 0; j < count; j++) {
        if (i === j) continue;
        const other = list[j];
        const x = e.position.x - other.position.x, z = e.position.z - other.position.z;
        const d2 = x * x + z * z, reach = (e.radius + other.radius) * 0.9;
        if (d2 > 0.001 && d2 < reach * reach) {
          const d = Math.sqrt(d2), push = (reach - d) / reach;
          sx += x / d * push * 2; sz += z / d * push * 2;
        }
      }
      if (!(e.type === 'dasher' && e.charge > 0)) { desired.x += sx; desired.z += sz; }
      const response = e.type === 'dasher' && e.charge > 0 ? (e.charge > 0.5 ? 12 : 28) : 3;
      e.velocity.lerp(desired, 1 - Math.exp(-dt * response));
      e.velocity.y = 0;
      e.position.addScaledVector(e.velocity, dt);
      e.lastVelocity.copy(e.velocity);
      if (e.type === 'dasher' && e.charge > 0) e.heading = Math.atan2(e.chargeX, e.chargeZ);
      else if (distance > 0.01) {
        const heading = Math.atan2(dx, dz);
        e.heading += Math.atan2(Math.sin(heading - e.heading), Math.cos(heading - e.heading)) * Math.min(1, dt * 7);
      }
      animate(e, t);
      if (e.boss) {
        e.summon -= dt;
        if (e.summon <= 0 && list.length < 65) {
          e.summon = 7 - (1 - e.hp / e.maxHp) * 2;
          const n = e.hp < e.maxHp * 0.5 ? 4 : 3;
          for (let k = 0; k < n; k++) {
            const angle = k / n * Math.PI * 2 + t;
            const child = spawn('wisp', e.position);
            child.position.x += Math.cos(angle) * 3.1;
            child.position.z += Math.sin(angle) * 3.1;
          }
          fx.ring(e.position, 0xb27ce4, 4);
        }
      }
    }
  }

  // Visual state from position/heading/flash/charge/hp — shared by host and online guest.
  function animate(e, t) {
    const born = Math.min(1, e.age / 0.65);
    const hurt = e.flash / 0.14;
    const phase = t * (e.type === 'brute' ? 5 : 7) + e.seed;
    const wobble = e.type === 'splitter' ? Math.sin(phase) * 0.1 : Math.sin(phase) * 0.035;
    e.mesh.position.copy(e.position);
    e.visual.position.y = -(1 - born) * e.radius + (e.type === 'brute' ? Math.abs(Math.sin(phase)) * 0.1 : Math.sin(phase) * 0.07);
    e.visual.scale.set((1 + wobble + hurt * 0.12) * born * e.size,
      (1 - wobble - hurt * 0.18) * born * e.size, born * e.size);
    e.visual.rotation.set(0, e.heading, Math.sin(phase * 0.5) * (e.type === 'wisp' ? 0.1 : 0.025));
    const winding = e.type === 'dasher' && e.charge > 0.5;
    if (winding) e.visual.rotation.z += Math.sin(t * 65) * 0.12;
    e.bodyMat.opacity = born;
    e.bodyMat.emissive.setHex(hurt > 0 ? 0xffb8e9 : winding ? 0xff2868 : 0x39215d);
    e.bodyMat.emissiveIntensity = hurt > 0 ? hurt * 2.2 : winding ? 1.8 : 0.32;
    e.eyeMat.color.setHex(winding ? 0xff367d : TYPES[e.type].glow).multiplyScalar(3 + hurt * 2 + (e.boss ? (1 - e.hp / e.maxHp) * 3 : 0));
    e.eyeMat.opacity = born;
    e.smoke.scale.setScalar(1.1 + Math.sin(phase * 0.7) * 0.035);
    e.puddle.scale.setScalar(e.radius * (1.3 + (1 - born) * 0.6));
    if (e.boss) {
      e.bar.scale.x = 4.1 * e.hp / e.maxHp;
      for (let k = 0; k < 9; k++) {
        const angle = k / 9 * Math.PI * 2 + t * 0.5;
        matrix.position.set(Math.cos(angle) * 2.8, 2.2 + Math.sin(t * 2 + k) * 0.6, Math.sin(angle) * 2.8);
        matrix.rotation.set(t + k, angle, k);
        matrix.scale.set(0.6, 1.6, 0.6);
        matrix.updateMatrix();
        e.shards.setMatrixAt(k, matrix.matrix);
      }
      e.shards.instanceMatrix.needsUpdate = true;
    }
  }

  // Online guest: mirror the host's enemies. rows = [[id, type, x, z, heading, hp, flash, charge, size, radius], ...]
  const byId = new Map();
  function sync(rows, dt, t) {
    const k = 1 - Math.exp(-dt * 15);
    for (const r of rows) {
      let e = byId.get(r[0]);
      if (!e) {
        e = spawn(r[1], new THREE.Vector3(r[2], 0, r[3]));
        e.id = r[0];
        e.heading = r[4];
        byId.set(e.id, e);
      }
      e.position.x += (r[2] - e.position.x) * k;
      e.position.z += (r[3] - e.position.z) * k;
      e.heading += Math.atan2(Math.sin(r[4] - e.heading), Math.cos(r[4] - e.heading)) * k;
      e.hp = r[5];
      e.flash = Math.max(e.flash - dt, r[6]);
      e.charge = r[7]; e.size = r[8]; e.radius = r[9];
      e.seen = t;
      e.age += dt;
      animate(e, t);
    }
    for (let i = list.length - 1; i >= 0; i--) {
      const e = list[i];
      if (e.seen === t) continue;
      list.splice(i, 1);
      byId.delete(e.id);
      remove(e);
    }
  }

  function clear() {
    for (const e of list) { e.dead = true; remove(e); }
    list.length = 0;
    byId.clear();
  }

  return { list, spawn, damage, update, sync, clear };
}
