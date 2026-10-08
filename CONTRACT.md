# Lanternbound — module contract

Couch co-op three.js game. Two lantern spirits (P1 "Ember", orange; P2 "Tide", teal)
defend the last campfire through one night (8 waves) until dawn. A light **tether**
between them burns shadow creatures. Both dashing within 0.35s = **Flare** shockwave.
A downed player is revived by the partner standing next to them. Both down, or the
campfire going out = game over.

Stack: Vite + three (`import * as THREE from 'three'`, addons via `three/addons/...`).
Vanilla ES modules, no other runtime deps. No external assets — everything is
procedural (geometry, canvas textures, shaders, WebAudio).

World space: XZ is the ground plane, +Y up, ground at y = 0. Campfire at origin.
Playable arena is a disc of radius `world.arenaRadius` (20). Camera looks down at
~50° from +Z side, following the players' midpoint.

`src/main.js` (renderer, bloom composer, camera, state machine) and `src/game.js`
(rules, collisions, waves) are the glue — owned by the coordinator. Every other
module must keep the exact exported names/signatures below. You may add internal
helpers and extra *optional* fields freely; never rename or remove listed ones.
Performance budget: the whole game must hold 60fps on a laptop — prefer
InstancedMesh / shared geometries+materials, no per-frame allocations in hot loops.

---

## world.js
```js
export function createWorld(scene, renderer) => {
  arenaRadius: number,              // 20
  campfire: {
    position: THREE.Vector3,        // (0,0,0)
    radius: number,                 // collision radius ~1.2
    setHealth(f),                   // f 0..1 — flame size/brightness follows it
    hurt(),                         // called when an enemy hits the fire: flicker/flash
  },
  update(dt, t, dawn),              // dawn 0..1: 0 = deep night, 1 = sunrise (sky, fog, lights)
}
```
Owns: sky, fog, all scene lights, ground/island, decorations, ambient particles, campfire.

## players.js
```js
export function createPlayers(scene) => [Player, Player]
Player = {
  index: 0|1, name: 'Ember'|'Tide', color: THREE.Color,
  position: THREE.Vector3, velocity: THREE.Vector3, radius: 0.6,
  hp: number, maxHp: 5, downed: boolean, reviveProgress: 0..1,
  invuln: number,                   // seconds of i-frames left (game decrements)
  dashing: boolean,                 // true during dash burst
  update(dt, input, t),             // input = {x, z, dash} (see input.js). Moves
                                    // position (speed ~9 u/s, dash burst ~28 u/s for
                                    // 0.15s, cooldown 0.6s), animates mesh. When downed:
                                    // no movement, show a dim ghost + revive ring.
                                    // Returns true on the frame a dash starts.
  hit(),                            // visual+state feedback on damage (flash, squash)
  setDowned(bool),                  // enter/leave downed visuals
  reset(position),                  // full hp, not downed, at position
}
export function createTether(scene) => {
  update(dt, a, b, strength, t),    // a,b = Vector3 player positions; strength 0..1
                                    // (0 = broken/hidden, 1 = full burn). Beam glows.
  flare(a, b),                      // one-shot surge effect along the beam
}
```

## enemies.js
```js
export function createEnemies(scene, fx) => {
  list: Enemy[],                    // live enemies (game iterates this)
  spawn(type, position) => Enemy,   // type: 'wisp'|'brute'|'splitter'|'dasher'|'hollow'
  damage(enemy, amount) => boolean, // apply damage, hit flash; true if it died.
                                    // Handles death fx + removal + splitter children.
  update(dt, ctx),                  // ctx = { players, campfire: Vector3, t }
                                    // AI + movement + animation. Enemies chase the
                                    // nearest non-downed player or the campfire.
  clear(),                          // remove all (restart)
}
Enemy = { type, position: THREE.Vector3, velocity: THREE.Vector3, radius, hp, maxHp,
          damage /* to campfire */, score, dead: boolean, boss?: boolean }
```
Roles: wisp = fast weak chaser; brute = slow tank; splitter = splits into 2 small
wisps on death; dasher = winds up then charges; hollow = wave-8 boss (big, lots of hp,
spawns wisps). game.js knocks enemies back by writing `enemy.velocity`.

## fx.js
```js
export function createFX(scene) => {
  burst(position, color, count = 20, speed = 6),   // spark particles
  ring(position, color, radius = 6),               // expanding shockwave ring
  shake(amount),                                    // camera trauma 0..1 (adds up)
  cameraOffset: THREE.Vector3,                      // main.js adds this to camera
  update(dt),
}
```

## audio.js
```js
export const audio = {
  init(),                 // create AudioContext on first user gesture (idempotent)
  play(name),             // one-shot SFX, names below; unknown names are ignored
  setTether(strength),    // 0..1 continuous hum level/pitch
  setIntensity(f),        // 0..1 music intensity (wave progress / boss)
  startMusic(), stopMusic(),
}
```
SFX names: dash, flare, hit, enemyDie, bossDie, playerHurt, down, revive, waveStart,
waveClear, pickup, fireHurt, gameOver, victory, uiSelect, uiStart.

## ui.js
```js
export function createUI(root /* #ui div over the canvas */) => {
  showTitle(onStart),                 // title screen; calls onStart() once both ready / Enter
  hideTitle(),
  update(hud),                        // every frame, hud = see below
  banner(title, subtitle = ''),       // big centered text, auto-fades ~2.5s
  floatText(x, y, text, color),       // screen-space px popup (score, "REVIVED!")
  showEnd({ victory, score, wave }, onRestart),
  hideEnd(),
}
hud = { players: [{ name, color /* css string */, hp, maxHp, downed, reviveProgress }],
        fireHealth /* 0..1 */, wave, totalWaves, score, combo, flareReady /* 0..1 */ }
```

## input.js (coordinator-owned)
`createInput()` => `{ poll() => [{x, z, dash}, {x, z, dash}], anyStart() }`.
x/z in -1..1 (z+ = toward camera/down-screen). dash = pressed this frame.
P1: WASD + Space (or Shift-left). P2: Arrows + Enter (or Shift-right / Numpad0).
Gamepad 0 → P1, gamepad 1 → P2 (left stick, A/Cross to dash).
