import * as THREE from 'three';
import { createPlayers, createTether } from './players.js';
import { createEnemies } from './enemies.js';

// Wave composition: type -> count. Last wave is the boss.
const WAVES = [
  { wisp: 8 },
  { wisp: 12, dasher: 2 },
  { wisp: 12, brute: 2, splitter: 3 },
  { wisp: 14, dasher: 4, splitter: 4 },
  { wisp: 16, brute: 4, dasher: 4 },
  { wisp: 18, splitter: 6, brute: 3, dasher: 5 },
  { wisp: 22, brute: 6, splitter: 6, dasher: 6 },
  { hollow: 1, wisp: 12, dasher: 4 },
];
const WAVE_NAMES = ['Dusk', 'First Watch', 'Gloaming', 'Midnight', 'The Deep Hours',
  'Witching Hour', 'Last Dark', 'Before Dawn'];

const FIRE_MAX = 100;
const TETHER_FULL = 12, TETHER_MAX = 17; // full burn up to 12u, fades to nothing at 17u
const TETHER_DPS = 60, TETHER_WIDTH = 0.55;
const FLARE_WINDOW = 0.35, FLARE_COOLDOWN = 6, FLARE_RADIUS = 4.5, FLARE_DAMAGE = 120;
const REVIVE_RANGE = 2.4, REVIVE_TIME = 1.8;
const COMBO_WINDOW = 2;

const _v = new THREE.Vector3();
const _proj = new THREE.Vector3();
const r2 = (v) => Math.round(v * 100) / 100;

// Distance in XZ from point p to segment ab.
function segDist(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1e-6;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * k), p.z - (a.z + abz * k));
}

export function createGame({ scene, camera, world, fx: realFx, ui: realUi, audio: realAudio }) {
  const players = createPlayers(scene);
  const tether = createTether(scene);
  const fire = world.campfire;

  // One-shot effects go through recorders. When hosting online, each call is also
  // queued as [target, method, ...args] and shipped with the next snapshot so the
  // guest can replay it. Vector3 args travel as [x, y, z].
  const events = [];
  let hosting = false;
  function recorder(tag, obj, methods) {
    const out = {};
    for (const m of methods) out[m] = (...args) => {
      if (hosting) events.push([tag, m, ...args.map((a) => (a?.isVector3 ? [r2(a.x), r2(a.y), r2(a.z)] : a))]);
      return obj[m](...args);
    };
    return out;
  }
  const visuals = {
    hit: (i) => players[i].hit(),
    down: (i, d) => players[i].setDowned(d),
    flare: () => tether.flare(players[0].position, players[1].position),
    fireHurt: () => fire.hurt(),
    pop(pos, text, color) {
      _proj.copy(pos).setY(pos.y + 1.5).project(camera);
      realUi.floatText((_proj.x * 0.5 + 0.5) * innerWidth, (-_proj.y * 0.5 + 0.5) * innerHeight, text, color);
    },
  };
  const fx = recorder('fx', realFx, ['burst', 'ring', 'shake']);
  const audio = recorder('audio', realAudio, ['play', 'setIntensity']);
  const ui = recorder('ui', realUi, ['banner']);
  const g = recorder('g', visuals, ['hit', 'down', 'flare', 'fireHurt', 'pop']);
  const replayTargets = { fx: realFx, audio: realAudio, ui: realUi, g: visuals };

  const enemies = createEnemies(scene, fx);

  // Heart pickups
  const heartGeo = new THREE.OctahedronGeometry(0.35);
  const heartMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0xff5c8a).multiplyScalar(3) }); // HDR so bloom catches it
  const pickups = [];

  const START = [new THREE.Vector3(-3, 0, 4), new THREE.Vector3(3, 0, 4)];
  players.forEach((p, i) => p.reset(START[i]));

  let wave, phase, phaseTime, spawnQueue, spawnTimer, waveTotal, waveKilled;
  let fireHp, score, combo, comboTimer, flareCd, dashTimes, dawn, result;
  let tetherStrength = 0, hud = null;

  function start() {
    enemies.clear();
    for (const p of pickups) scene.remove(p.mesh);
    pickups.length = 0;
    players.forEach((p, i) => p.reset(START[i]));
    // dev-only: ?wave=N jumps straight to wave N for testing
    wave = import.meta.env.DEV ? Math.max(0, Math.min(WAVES.length, +new URLSearchParams(location.search).get('wave') || 1) - 1) : 0;
    fireHp = FIRE_MAX;
    score = 0; combo = 0; comboTimer = 0;
    flareCd = 0; dashTimes = [-9, -9];
    dawn = 0;
    result = 'playing';
    beginWave();
  }

  function beginWave() {
    phase = 'intro';
    phaseTime = 2.5;
    spawnQueue = [];
    for (const [type, n] of Object.entries(WAVES[wave])) for (let i = 0; i < n; i++) spawnQueue.push(type);
    // shuffle, but keep the boss first
    for (let i = spawnQueue.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [spawnQueue[i], spawnQueue[j]] = [spawnQueue[j], spawnQueue[i]];
    }
    const bi = spawnQueue.indexOf('hollow');
    if (bi > 0) { spawnQueue.splice(bi, 1); spawnQueue.unshift('hollow'); }
    waveTotal = spawnQueue.length;
    waveKilled = 0;
    spawnTimer = 0;
    ui.banner(`Wave ${wave + 1} — ${WAVE_NAMES[wave]}`, wave === WAVES.length - 1 ? 'Something stirs in the dark…' : 'Keep the fire alive');
    audio.play('waveStart');
    audio.setIntensity(wave === WAVES.length - 1 ? 1 : wave / WAVES.length);
  }

  function spawnNext() {
    const type = spawnQueue.shift();
    const a = Math.random() * Math.PI * 2;
    const r = world.arenaRadius + 3;
    enemies.spawn(type, new THREE.Vector3(Math.cos(a) * r, 0, Math.sin(a) * r));
  }

  function onKill(e) {
    waveKilled++;
    combo = comboTimer > 0 ? combo + 1 : 1;
    comboTimer = COMBO_WINDOW;
    const mult = Math.min(5, 1 + Math.floor(combo / 4));
    const pts = e.score * mult;
    score += pts;
    g.pop(e.position, `+${pts}`, mult > 1 ? '#ffd27a' : '#ffffff');
    audio.play(e.boss ? 'bossDie' : 'enemyDie');
    if (e.boss) { fx.shake(1); fx.ring(e.position, 0xffffff, 14); }
    const hurt = players.some((p) => !p.downed && p.hp < p.maxHp);
    if (hurt && Math.random() < 0.07) {
      const mesh = new THREE.Mesh(heartGeo, heartMat);
      mesh.position.copy(e.position).setY(0.6);
      scene.add(mesh);
      pickups.push({ mesh, life: 12 });
    }
  }

  function hurtEnemy(e, amount) {
    if (e.dead) return;
    if (enemies.damage(e, amount)) onKill(e);
  }

  function flare(a, b) {
    flareCd = FLARE_COOLDOWN;
    g.flare();
    _v.addVectors(a.position, b.position).multiplyScalar(0.5);
    fx.ring(_v, 0xfff2c0, 10);
    fx.burst(_v, 0xfff2c0, 60, 14);
    fx.shake(0.6);
    audio.play('flare');
    g.pop(_v, 'FLARE!', '#fff2c0');
    for (const e of [...enemies.list]) {
      if (segDist(e.position, a.position, b.position) < FLARE_RADIUS + e.radius) {
        _v.subVectors(e.position, a.position).setY(0).normalize().multiplyScalar(14);
        e.velocity.add(_v);
        hurtEnemy(e, FLARE_DAMAGE);
      }
    }
  }

  function update(dt, inputs, t) {
    if (result !== 'playing') return result;
    const [a, b] = players;

    // --- players
    for (const p of players) {
      if (p.update(dt, inputs[p.index], t)) {
        dashTimes[p.index] = t;
        audio.play('dash');
      }
      p.invuln = Math.max(0, p.invuln - dt);
      const len = Math.hypot(p.position.x, p.position.z);
      const max = world.arenaRadius - p.radius;
      if (len > max) { p.position.x *= max / len; p.position.z *= max / len; }
    }
    flareCd = Math.max(0, flareCd - dt);
    if (!a.downed && !b.downed && flareCd === 0 && Math.abs(dashTimes[0] - dashTimes[1]) < FLARE_WINDOW &&
        Math.max(dashTimes[0], dashTimes[1]) === t) {
      flare(a, b);
    }

    // --- revive
    for (const p of players) {
      if (!p.downed) continue;
      const q = players[1 - p.index];
      if (!q.downed && p.position.distanceTo(q.position) < REVIVE_RANGE) p.reviveProgress += dt / REVIVE_TIME;
      else p.reviveProgress = Math.max(0, p.reviveProgress - dt / 4);
      if (p.reviveProgress >= 1) {
        p.downed = false; p.hp = 2; p.invuln = 2; p.reviveProgress = 0;
        g.down(p.index, false);
        fx.ring(p.position, p.color.getHex(), 5);
        fx.burst(p.position, p.color.getHex(), 40, 8);
        audio.play('revive');
        g.pop(p.position, 'REVIVED!', '#' + p.color.getHexString());
      }
    }

    // --- tether
    const dist = a.position.distanceTo(b.position);
    const strength = a.downed || b.downed ? 0 :
      THREE.MathUtils.clamp(1 - (dist - TETHER_FULL) / (TETHER_MAX - TETHER_FULL), 0, 1);
    tether.update(dt, a.position, b.position, strength, t);
    realAudio.setTether(strength);
    tetherStrength = strength;

    // --- waves / spawning
    phaseTime -= dt;
    if (phase === 'intro' && phaseTime <= 0) phase = 'wave';
    if (phase === 'wave') {
      spawnTimer -= dt;
      if (spawnQueue.length && spawnTimer <= 0) {
        spawnNext();
        spawnTimer = Math.max(0.35, 1.1 - wave * 0.1) * (0.6 + Math.random() * 0.8);
      }
      if (!spawnQueue.length && !enemies.list.length) {
        if (wave === WAVES.length - 1) {
          result = 'victory';
          dawn = 1;
          return result;
        }
        phase = 'clear';
        phaseTime = 3;
        ui.banner('Wave cleared', 'Catch your breath');
        audio.play('waveClear');
        for (const p of players) if (!p.downed) p.hp = Math.min(p.maxHp, p.hp + 1);
      }
    }
    if (phase === 'clear' && phaseTime <= 0) { wave++; beginWave(); }

    // --- enemies
    enemies.update(dt, { players, campfire: fire.position, t });
    for (const e of [...enemies.list]) {
      if (e.dead) continue;
      if (strength > 0 && segDist(e.position, a.position, b.position) < e.radius + TETHER_WIDTH) {
        hurtEnemy(e, TETHER_DPS * strength * dt);
        if (Math.random() < dt * 20) fx.burst(e.position, 0xffe0a0, 2, 3);
        if (e.dead) continue;
      }
      for (const p of players) {
        if (p.downed || p.invuln > 0) continue;
        if (p.position.distanceTo(e.position) < p.radius + e.radius) {
          if (p.dashing) { // dashing through an enemy hurts it instead
            hurtEnemy(e, 25);
            p.invuln = 0.2;
            continue;
          }
          p.hp--;
          p.invuln = 1.2;
          g.hit(p.index);
          _v.subVectors(e.position, p.position).setY(0).normalize().multiplyScalar(12);
          e.velocity.add(_v);
          fx.shake(0.35);
          fx.burst(p.position, p.color.getHex(), 16, 6);
          audio.play('playerHurt');
          if (p.hp <= 0) {
            p.hp = 0; p.downed = true; p.reviveProgress = 0;
            g.down(p.index, true);
            audio.play('down');
            g.pop(p.position, `${p.name} is down!`, '#ff7a7a');
          }
        }
      }
      if (e.dead) continue;
      const fd = Math.hypot(e.position.x - fire.position.x, e.position.z - fire.position.z);
      if (fd < e.radius + fire.radius) {
        g.fireHurt();
        fx.shake(0.25);
        audio.play('fireHurt');
        if (e.boss) {
          fireHp -= e.damage * dt;
          _v.copy(e.position).setY(0).normalize().multiplyScalar(6);
          e.velocity.add(_v);
        } else {
          fireHp -= e.damage;
          fx.burst(e.position, 0x6a4cff, 20, 5);
          enemies.damage(e, Infinity);
          waveKilled++;
        }
      }
    }
    fire.setHealth(Math.max(0, fireHp) / FIRE_MAX);

    // --- pickups
    for (let i = pickups.length - 1; i >= 0; i--) {
      const pk = pickups[i];
      pk.life -= dt;
      pk.mesh.rotation.y += dt * 3;
      pk.mesh.scale.setScalar(pk.life < 3 ? (Math.sin(t * 20) > 0 ? 1 : 0.4) : 1 + Math.sin(t * 6) * 0.15);
      pk.mesh.position.y = 0.6 + Math.sin(t * 4 + i) * 0.15;
      const taker = players.find((p) => !p.downed && p.hp < p.maxHp && p.position.distanceTo(pk.mesh.position) < 1.3);
      if (taker || pk.life <= 0) {
        if (taker) {
          taker.hp++;
          audio.play('pickup');
          fx.burst(pk.mesh.position, 0xff5c8a, 20, 4);
        }
        scene.remove(pk.mesh);
        pickups.splice(i, 1);
      }
    }

    // --- combo, dawn, hud
    comboTimer -= dt;
    if (comboTimer <= 0) combo = 0;
    const target = (wave + (phase === 'clear' ? 1 : waveKilled / Math.max(1, waveTotal))) / WAVES.length;
    dawn += (target - dawn) * Math.min(1, dt * 0.8);

    realUi.update(hud = {
      players: players.map((p) => ({ name: p.name, color: '#' + p.color.getHexString(), hp: p.hp,
        maxHp: p.maxHp, downed: p.downed, reviveProgress: p.reviveProgress })),
      fireHealth: Math.max(0, fireHp) / FIRE_MAX,
      wave: wave + 1, totalWaves: WAVES.length, score, combo,
      flareReady: 1 - flareCd / FLARE_COOLDOWN,
    });

    if (fireHp <= 0) result = 'gameover';
    if (a.downed && b.downed) result = 'gameover';
    return result;
  }

  // Title screen: spirits bob by the fire, tether lit, no gameplay.
  const still = { x: 0, z: 0, dash: false };
  function idle(dt, t) {
    for (const p of players) p.update(dt, still, t);
    tether.update(dt, players[0].position, players[1].position, 1, t);
  }

  // --- online: host side
  function snapshot() {
    return {
      t: 's',
      p: players.map((p) => [r2(p.position.x), r2(p.position.z), r2(p.velocity.x), r2(p.velocity.z),
        p.hp, p.downed ? 1 : 0, r2(p.reviveProgress), r2(p.invuln), p.dashing ? 1 : 0]),
      ts: r2(tetherStrength),
      e: enemies.list.map((e) => [e.id, e.type, r2(e.position.x), r2(e.position.z), r2(e.heading),
        Math.ceil(e.hp), r2(e.flash), r2(e.charge), e.size, e.radius]),
      k: pickups.map((pk) => [r2(pk.mesh.position.x), r2(pk.mesh.position.z), r2(pk.life)]),
      f: r2(Math.max(0, fireHp) / FIRE_MAX), dn: r2(dawn), hud,
      ev: events.splice(0),
    };
  }

  // --- online: guest side. The host simulates; we mirror its snapshots and replay its events.
  let snap = null;
  function startGuest() {
    enemies.clear();
    for (const pk of pickups) scene.remove(pk.mesh);
    pickups.length = 0;
    players.forEach((p, i) => p.reset(START[i]));
    snap = null; dawn = 0;
  }
  function receive(s) {
    snap = s;
    for (const [tag, m, ...args] of s.ev) {
      replayTargets[tag][m](...args.map((a) => (Array.isArray(a) ? new THREE.Vector3(a[0], a[1], a[2]) : a)));
    }
  }
  function follow(dt, t) {
    if (!snap) return;
    const k = 1 - Math.exp(-dt * 15);
    players.forEach((p, i) => {
      const [x, z, vx, vz, hp, downed, revive, invuln, dashing] = snap.p[i];
      if (Math.hypot(x - p.position.x, z - p.position.z) > 6) p.position.set(x, 0, z); // restart / teleport
      p.position.x += (x - p.position.x) * k;
      p.position.z += (z - p.position.z) * k;
      p.velocity.set(vx, 0, vz);
      p.hp = hp; p.downed = !!downed; p.reviveProgress = revive; p.invuln = invuln; p.dashing = !!dashing;
      p.animate(dt, t);
    });
    tether.update(dt, players[0].position, players[1].position, snap.ts, t);
    realAudio.setTether(snap.ts);
    enemies.sync(snap.e, dt, t);
    while (pickups.length < snap.k.length) {
      const mesh = new THREE.Mesh(heartGeo, heartMat);
      scene.add(mesh);
      pickups.push({ mesh, life: 12 });
    }
    while (pickups.length > snap.k.length) scene.remove(pickups.pop().mesh);
    pickups.forEach((pk, i) => {
      const [x, z, life] = snap.k[i];
      pk.mesh.position.set(x, 0.6 + Math.sin(t * 4 + i) * 0.15, z);
      pk.mesh.rotation.y += dt * 3;
      pk.mesh.scale.setScalar(life < 3 ? (Math.sin(t * 20) > 0 ? 1 : 0.4) : 1 + Math.sin(t * 6) * 0.15);
    });
    fire.setHealth(snap.f);
    dawn = snap.dn;
    if (snap.hud) realUi.update(snap.hud);
  }

  // Midpoint of the players (alive ones preferred) into out; returns their spread.
  function focus(out) {
    const alive = players.filter((p) => !p.downed);
    const set = alive.length ? alive : players;
    out.set(0, 0, 0);
    for (const p of set) out.add(p.position);
    out.multiplyScalar(1 / set.length);
    return players[0].position.distanceTo(players[1].position);
  }

  return {
    start, update, idle, focus, players,
    snapshot, startGuest, receive, follow,
    set hosting(v) { hosting = v; events.length = 0; },
    get score() { return score; },
    get wave() { return wave + 1; },
    get dawn() { return dawn ?? 0; },
  };
}
