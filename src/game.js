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
const TETHER_DPS = 45;
const FLARE_WINDOW = 0.35, FLARE_COOLDOWN = 6, FLARE_RADIUS = 4.5, FLARE_DAMAGE = 120;
const REVIVE_RANGE = 2.4, REVIVE_TIME = 1.8;
const COMBO_WINDOW = 2;

const _v = new THREE.Vector3();
const _proj = new THREE.Vector3();

// Distance in XZ from point p to segment ab.
function segDist(p, a, b) {
  const abx = b.x - a.x, abz = b.z - a.z;
  const len2 = abx * abx + abz * abz || 1e-6;
  const k = Math.max(0, Math.min(1, ((p.x - a.x) * abx + (p.z - a.z) * abz) / len2));
  return Math.hypot(p.x - (a.x + abx * k), p.z - (a.z + abz * k));
}

export function createGame({ scene, camera, world, fx, ui, audio }) {
  const players = createPlayers(scene);
  const tether = createTether(scene);
  const enemies = createEnemies(scene, fx);
  const fire = world.campfire;

  // Heart pickups
  const heartGeo = new THREE.OctahedronGeometry(0.35);
  const heartMat = new THREE.MeshBasicMaterial({ color: 0xff5c8a });
  const pickups = [];

  let wave, phase, phaseTime, spawnQueue, spawnTimer, waveTotal, waveKilled;
  let fireHp, score, combo, comboTimer, flareCd, dashTimes, dawn, result;

  function start() {
    enemies.clear();
    for (const p of pickups) scene.remove(p.mesh);
    pickups.length = 0;
    players[0].reset(new THREE.Vector3(-3, 0, 4));
    players[1].reset(new THREE.Vector3(3, 0, 4));
    wave = 0;
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

  function toScreen(pos) {
    _proj.copy(pos).setY(pos.y + 1.5).project(camera);
    return [(_proj.x * 0.5 + 0.5) * innerWidth, (-_proj.y * 0.5 + 0.5) * innerHeight];
  }

  function onKill(e) {
    waveKilled++;
    combo = comboTimer > 0 ? combo + 1 : 1;
    comboTimer = COMBO_WINDOW;
    const mult = Math.min(5, 1 + Math.floor(combo / 4));
    const pts = e.score * mult;
    score += pts;
    const [x, y] = toScreen(e.position);
    ui.floatText(x, y, `+${pts}`, mult > 1 ? '#ffd27a' : '#ffffff');
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
    tether.flare(a.position, b.position);
    _v.addVectors(a.position, b.position).multiplyScalar(0.5);
    fx.ring(_v, 0xfff2c0, 10);
    fx.burst(_v, 0xfff2c0, 60, 14);
    fx.shake(0.6);
    audio.play('flare');
    const [x, y] = toScreen(_v);
    ui.floatText(x, y, 'FLARE!', '#fff2c0');
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
        p.setDowned(false);
        fx.ring(p.position, p.color.getHex(), 5);
        fx.burst(p.position, p.color.getHex(), 40, 8);
        audio.play('revive');
        const [x, y] = toScreen(p.position);
        ui.floatText(x, y, 'REVIVED!', '#' + p.color.getHexString());
      }
    }

    // --- tether
    const dist = a.position.distanceTo(b.position);
    const strength = a.downed || b.downed ? 0 :
      THREE.MathUtils.clamp(1 - (dist - TETHER_FULL) / (TETHER_MAX - TETHER_FULL), 0, 1);
    tether.update(dt, a.position, b.position, strength, t);
    audio.setTether(strength);

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
      if (strength > 0 && segDist(e.position, a.position, b.position) < e.radius + 0.35) {
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
          p.hit();
          _v.subVectors(e.position, p.position).setY(0).normalize().multiplyScalar(12);
          e.velocity.add(_v);
          fx.shake(0.35);
          fx.burst(p.position, p.color.getHex(), 16, 6);
          audio.play('playerHurt');
          if (p.hp <= 0) {
            p.hp = 0; p.downed = true; p.reviveProgress = 0;
            p.setDowned(true);
            audio.play('down');
            const [x, y] = toScreen(p.position);
            ui.floatText(x, y, `${p.name} is down!`, '#ff7a7a');
          }
        }
      }
      if (e.dead) continue;
      const fd = Math.hypot(e.position.x - fire.position.x, e.position.z - fire.position.z);
      if (fd < e.radius + fire.radius) {
        fire.hurt();
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

    ui.update({
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
    start, update, focus,
    get score() { return score; },
    get wave() { return wave + 1; },
    get dawn() { return dawn ?? 0; },
  };
}
