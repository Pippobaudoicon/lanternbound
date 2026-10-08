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

const renderer = new THREE.WebGLRenderer({ antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
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

let state = 'title';
function toTitle() {
  state = 'title';
  ui.showTitle(start);
}
function start() {
  audio.init();
  audio.play('uiStart');
  audio.startMusic();
  ui.hideTitle();
  ui.hideEnd();
  game.start();
  state = 'playing';
}

const clock = new THREE.Clock();
let t = 0;
function frame() {
  const dt = Math.min(clock.getDelta(), 1 / 20);
  t += dt;
  const inputs = input.poll();

  if (state === 'title') {
    if (input.anyStart()) start();
  } else if (state === 'playing') {
    const result = game.update(dt, inputs, t);
    if (result !== 'playing') {
      state = 'end';
      audio.stopMusic();
      audio.play(result === 'victory' ? 'victory' : 'gameOver');
      ui.showEnd({ victory: result === 'victory', score: game.score, wave: game.wave }, start);
      endDelay = 1.5;
    }
  } else if (state === 'end') {
    endDelay -= dt;
    if (endDelay < 0 && input.anyStart()) start();
    else input.anyStart();
  }

  world.update(dt, t, state === 'title' ? 0.0 : game.dawn);
  fx.update(dt);
  updateCamera(dt, t, state !== 'title');
  composer.render();
  requestAnimationFrame(frame);
}
let endDelay = 0;

toTitle();
frame();
