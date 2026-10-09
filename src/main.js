import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';
import { createWorld } from './world.js';
import { createFX } from './fx.js';
import { createUI } from './ui.js';
import { createInput } from './input.js';
import { createGame } from './game.js';
import { audio } from './audio.js';
import { createNet, makeRoomCode } from './net.js';

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
document.getElementById('app').appendChild(renderer.domElement);

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(45, innerWidth / innerHeight, 0.1, 400);

const composer = new EffectComposer(renderer);
composer.addPass(new RenderPass(scene, camera));
const bloom = new UnrealBloomPass(new THREE.Vector2(innerWidth, innerHeight), 0.9, 0.6, 0.75);
composer.addPass(bloom);
composer.addPass(new OutputPass());

addEventListener('resize', () => {
  camera.aspect = innerWidth / innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(innerWidth, innerHeight);
  composer.setSize(innerWidth, innerHeight);
});

const world = createWorld(scene, renderer);
const fx = createFX(scene);
const ui = createUI(document.getElementById('ui'));
const input = createInput();
const game = createGame({ scene, camera, world, fx, ui, audio });
if (import.meta.env.DEV) window.__lb = { game, state: () => state }; // playtest hook

// Camera follows the players' midpoint and pulls back as they spread apart.
const camTarget = new THREE.Vector3();
const camFocus = new THREE.Vector3();
function updateCamera(dt, t, playing) {
  if (playing) {
    const spread = game.focus(camFocus);
    const dist = 24 + spread * 0.6;
    camTarget.set(camFocus.x * 0.5, dist * 0.78, camFocus.z * 0.5 + dist * 0.66);
  } else {
    // slow orbit on title / end screens
    camFocus.set(0, 0, 0);
    camTarget.set(Math.sin(t * 0.08) * 30, 20, Math.cos(t * 0.08) * 30);
  }
  camera.position.lerp(camTarget, 1 - Math.exp(-dt * 3));
  camera.position.add(fx.cameraOffset);
  camera.lookAt(camFocus.x * 0.5, 0, camFocus.z * 0.5);
}

// state: title | lobby | playing | end.  mode: couch | host | guest
let state = 'title', mode = 'couch';
let net = null, peerOn = false, endDelay = 0, sendTick = 0, statusT = 0;
const remote = { x: 0, z: 0, dash: false };  // guest's latest input, applied by the host
let remoteDash = 0;                           // guest's dash counter last seen by the host
let localDash = 0, lastSent = '';             // guest side

// Browsers only allow audio after a gesture; joining via a link may skip the click.
addEventListener('keydown', () => audio.init());
addEventListener('pointerdown', () => audio.init());

function toTitle(message) {
  if (net) { net.close(); net = null; }
  peerOn = false;
  mode = 'couch';
  state = 'title';
  game.hosting = false;
  audio.stopMusic();
  audio.setTether(0);
  ui.hideLobby(); ui.hideEnd(); ui.setNetStatus(null);
  ui.showTitle({ couch: () => start('couch'), host: hostGame, join: joinGame });
  if (message) ui.banner(message);
  if (location.hash) history.replaceState(null, '', location.pathname + location.search);
}

function start(m) {
  mode = m;
  audio.init();
  audio.play('uiStart');
  audio.startMusic();
  ui.hideTitle(); ui.hideEnd(); ui.hideLobby();
  if (mode === 'guest') game.startGuest();
  else {
    game.hosting = mode === 'host';
    game.start();
    if (mode === 'host') net.send({ t: 'start' });
  }
  state = 'playing';
}

function end(victory, score, wave) {
  state = 'end';
  endDelay = 1.5;
  audio.stopMusic();
  audio.setTether(0);
  audio.play(victory ? 'victory' : 'gameOver');
  ui.showEnd({ victory, score, wave }, restart);
}
const restart = () => (mode === 'guest' ? net.send({ t: 'go' }) : start(mode));

function hostGame() {
  const code = makeRoomCode();
  const link = `${location.origin}${location.pathname}#${code}`;
  const lobby = (status, message) => ui.showLobby({ role: 'host', code, link, status, message },
    { start: () => peerOn && start('host'), cancel: () => toTitle() });
  goOnline('host', code, lobby, (on) => {
    if (on) { if (state === 'lobby') lobby('ready'); return; }
    // Friend left: keep the room open so they can rejoin with the same code.
    state = 'lobby';
    game.hosting = false;
    remote.x = remote.z = 0;
    audio.stopMusic(); audio.setTether(0);
    ui.hideEnd();
    lobby('waiting');
    ui.banner("Your friend's light went out", 'Waiting for them to rejoin…');
  });
}

function joinGame(raw) {
  const code = String(raw || '').trim().toUpperCase();
  if (!code) return;
  const link = `${location.origin}${location.pathname}#${code}`;
  const lobby = (status, message) => ui.showLobby({ role: 'guest', code, link, status, message },
    { start() {}, cancel: () => toTitle() });
  goOnline('guest', code, lobby, (on) => { if (!on) toTitle('The host left the game'); });
}

function goOnline(role, code, lobby, onPeer) {
  if (net) net.close();
  mode = role;
  state = 'lobby';
  ui.hideTitle();
  lobby('connecting');
  const n = net = createNet();
  n.onPeer((on) => { peerOn = on; onPeer(on); });
  n.onMessage(role === 'host' ? hostMessage : guestMessage);
  n.onClose(() => { if (net === n) toTitle('Lost connection'); });
  n.connect(code, role)
    .then(() => { if (net === n) lobby(role === 'host' ? (peerOn ? 'ready' : 'waiting') : 'ready'); })
    .catch((err) => { if (net === n) lobby('error', err.message); });
}

function hostMessage(m) {
  if (m.t === 'in') {
    remote.x = m.x; remote.z = m.z;
    if (m.d !== remoteDash) { remoteDash = m.d; remote.dash = true; }
  } else if (m.t === 'go' && state === 'end' && endDelay < 0) start('host');
}

function guestMessage(m) {
  if (m.t === 'start') start('guest');
  else if (m.t === 's' && state === 'playing') game.receive(m);
  else if (m.t === 'end') end(m.victory, m.score, m.wave);
}

// Online, each player may use either key set (or pad 1).
function merged([a, b]) {
  const x = Math.max(-1, Math.min(1, a.x + b.x)), z = Math.max(-1, Math.min(1, a.z + b.z));
  return { x, z, dash: a.dash || b.dash };
}

const timer = new THREE.Timer();
let t = 0;
function frame(now) {
  timer.update(now);
  const dt = Math.min(timer.getDelta(), 1 / 20);
  t += dt;
  const inputs = input.poll();
  const startPressed = input.anyStart();

  if (state === 'title') {
    game.idle(dt, t);
    if (startPressed) start('couch');
  } else if (state === 'lobby') {
    game.idle(dt, t);
    if (startPressed && mode === 'host' && peerOn) start('host');
  } else if (state === 'playing' && mode === 'guest') {
    const me = merged(inputs);
    if (me.dash) localDash++;
    const msg = { t: 'in', x: Math.round(me.x * 100) / 100, z: Math.round(me.z * 100) / 100, d: localDash };
    const key = `${msg.x},${msg.z},${msg.d}`;
    if (key !== lastSent || (sendTick = (sendTick + 1) % 20) === 0) { net.send(msg); lastSent = key; }
    game.follow(dt, t);
  } else if (state === 'playing') {
    const ins = mode === 'host' ? [merged(inputs), { ...remote }] : inputs;
    remote.dash = false;
    const result = game.update(dt, ins, t);
    if (mode === 'host' && ((sendTick = (sendTick + 1) % 2) === 0 || result !== 'playing')) net.send(game.snapshot());
    if (result !== 'playing') {
      const victory = result === 'victory';
      if (mode === 'host') net.send({ t: 'end', victory, score: game.score, wave: game.wave });
      end(victory, game.score, game.wave);
    }
  } else if (state === 'end') {
    endDelay -= dt;
    if (endDelay < 0 && startPressed) restart();
  }

  if (net && (statusT -= dt) < 0) {
    statusT = 0.5;
    ui.setNetStatus(net.connected ? `Online · ${Math.round(net.rtt)} ms` : 'Offline');
  }

  // ease so the night stays dark for most waves and the sunrise rushes in at the end
  world.update(dt, t, state === 'title' || state === 'lobby' ? 0 : Math.pow(game.dawn, 2.2));
  fx.update(dt);
  updateCamera(dt, t, state === 'playing' || state === 'end');
  composer.render();
  requestAnimationFrame(frame);
}

// A shared link (…/#EMBER-42) joins that room straight away.
const linked = /^#[A-Za-z0-9-]{3,16}$/.test(location.hash) ? location.hash.slice(1) : '';
toTitle();
if (linked) joinGame(linked);
frame();
