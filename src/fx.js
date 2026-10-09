import * as THREE from 'three';

const MAX_PARTICLES = 3000;
const MAX_RINGS = 16;
const GRAVITY = 14;
const DRAG = 2.2;
const RING_TIME = 0.45;
const MAX_SHAKE = 1.1;

const particleVert = /* glsl */ `
  attribute float size;
  attribute float alpha;
  attribute vec3 color;
  uniform float scale;
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    vAlpha = alpha;
    vColor = color;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = size * scale / -mv.z;
    gl_Position = projectionMatrix * mv;
  }
`;

const particleFrag = /* glsl */ `
  varying float vAlpha;
  varying vec3 vColor;
  void main() {
    float d = length(gl_PointCoord - 0.5) * 2.0;
    float a = pow(max(1.0 - d, 0.0), 2.0) * vAlpha;
    gl_FragColor = vec4(vColor * a, 1.0);
  }
`;

const ringVert = /* glsl */ `
  varying vec2 vUv;
  void main() {
    vUv = uv;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`;

const ringFrag = /* glsl */ `
  uniform vec3 color;
  uniform float fade;
  varying vec2 vUv;
  void main() {
    float d = length(vUv - 0.5) * 2.0;
    float edge = smoothstep(0.86, 0.97, d) * (1.0 - smoothstep(0.97, 1.0, d));
    float inner = d * d * d * 0.18 * (1.0 - smoothstep(0.97, 1.0, d));
    gl_FragColor = vec4(color * (edge * 3.0 + inner) * fade, 1.0);
  }
`;

// smooth 1D noise from a few incommensurate sines, in -1..1
function wobble(t, seed) {
  return (Math.sin(t * 17.3 + seed) + Math.sin(t * 29.1 + seed * 2.7) * 0.6 + Math.sin(t * 7.9 + seed * 5.1) * 0.4) / 2;
}

export function createFX(scene) {
  // ---- sparks: one Points object, ring buffer, oldest recycled ----
  const pos = new Float32Array(MAX_PARTICLES * 3);
  const col = new Float32Array(MAX_PARTICLES * 3);
  const size = new Float32Array(MAX_PARTICLES);
  const alpha = new Float32Array(MAX_PARTICLES);
  const vel = new Float32Array(MAX_PARTICLES * 3);
  const age = new Float32Array(MAX_PARTICLES);
  const life = new Float32Array(MAX_PARTICLES); // 0 = dead
  const size0 = new Float32Array(MAX_PARTICLES);
  let head = 0;

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(pos, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('size', new THREE.BufferAttribute(size, 1).setUsage(THREE.DynamicDrawUsage));
  geo.setAttribute('alpha', new THREE.BufferAttribute(alpha, 1).setUsage(THREE.DynamicDrawUsage));
  geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 1e5); // never cull
  const sparkMat = new THREE.ShaderMaterial({
    uniforms: { scale: { value: 500 } },
    vertexShader: particleVert,
    fragmentShader: particleFrag,
    transparent: true,
    depthWrite: false,
    blending: THREE.AdditiveBlending,
  });
  const points = new THREE.Points(geo, sparkMat);
  points.frustumCulled = false;
  scene.add(points);

  const _c = new THREE.Color();

  function burst(position, color, count = 20, speed = 6) {
    _c.set(color);
    for (let n = 0; n < count; n++) {
      const i = head;
      head = (head + 1) % MAX_PARTICLES;
      const i3 = i * 3;
      // random direction on a sphere, biased upward
      const u = Math.random() * 2 - 1;
      const phi = Math.random() * Math.PI * 2;
      const r = Math.sqrt(1 - u * u);
      const s = speed * (0.35 + Math.random() * 0.65);
      pos[i3] = position.x;
      pos[i3 + 1] = position.y;
      pos[i3 + 2] = position.z;
      vel[i3] = Math.cos(phi) * r * s;
      vel[i3 + 1] = (Math.abs(u) * 0.6 + 0.4) * s;
      vel[i3 + 2] = Math.sin(phi) * r * s;
      // HDR boost, with a hot-white core on some sparks
      const b = 2 + Math.random() * 2;
      const hot = Math.random() < 0.25 ? 0.5 : 0;
      col[i3] = (_c.r + hot) * b;
      col[i3 + 1] = (_c.g + hot) * b;
      col[i3 + 2] = (_c.b + hot) * b;
      size0[i] = 0.35 + Math.random() * 0.5;
      size[i] = size0[i];
      alpha[i] = 1;
      age[i] = 0;
      life[i] = 0.4 + Math.random() * 0.5;
    }
  }

  // ---- rings: small pool of flat additive quads ----
  const ringGeo = new THREE.PlaneGeometry(2, 2).rotateX(-Math.PI / 2);
  const rings = [];
  for (let i = 0; i < MAX_RINGS; i++) {
    const mat = new THREE.ShaderMaterial({
      uniforms: { color: { value: new THREE.Color() }, fade: { value: 0 } },
      vertexShader: ringVert,
      fragmentShader: ringFrag,
      transparent: true,
      depthWrite: false,
      blending: THREE.AdditiveBlending,
      side: THREE.DoubleSide,
    });
    const mesh = new THREE.Mesh(ringGeo, mat);
    mesh.visible = false;
    mesh.frustumCulled = false;
    scene.add(mesh);
    rings.push({ mesh, mat, age: 0, radius: 1, active: false });
  }
  let nextRing = 0;

  function ring(position, color, radius = 6) {
    const r = rings[nextRing];
    nextRing = (nextRing + 1) % MAX_RINGS;
    r.active = true;
    r.age = 0;
    r.radius = radius;
    r.mat.uniforms.color.value.set(color).multiplyScalar(1.6);
    r.mesh.position.set(position.x, 0.06, position.z);
    r.mesh.scale.setScalar(0.01);
    r.mesh.visible = true;
  }

  // ---- camera shake (trauma model) ----
  let trauma = 0;
  let time = 0;
  const cameraOffset = new THREE.Vector3();

  function shake(amount) {
    trauma = Math.min(1, trauma + amount);
  }

  function update(dt) {
    time += dt;

    // sparks
    sparkMat.uniforms.scale.value = window.innerHeight * 0.5;
    const drag = Math.exp(-DRAG * dt);
    for (let i = 0; i < MAX_PARTICLES; i++) {
      if (life[i] <= 0) continue;
      age[i] += dt;
      if (age[i] >= life[i]) {
        life[i] = 0;
        size[i] = 0;
        alpha[i] = 0;
        continue;
      }
      const i3 = i * 3;
      vel[i3 + 1] -= GRAVITY * dt;
      vel[i3] *= drag;
      vel[i3 + 1] *= drag;
      vel[i3 + 2] *= drag;
      pos[i3] += vel[i3] * dt;
      pos[i3 + 1] += vel[i3 + 1] * dt;
      pos[i3 + 2] += vel[i3 + 2] * dt;
      if (pos[i3 + 1] < 0.05) { // bounce softly off the ground
        pos[i3 + 1] = 0.05;
        vel[i3 + 1] *= -0.35;
      }
      const k = 1 - age[i] / life[i];
      size[i] = size0[i] * (0.3 + 0.7 * k);
      alpha[i] = k;
    }
    geo.attributes.position.needsUpdate = true;
    geo.attributes.color.needsUpdate = true;
    geo.attributes.size.needsUpdate = true;
    geo.attributes.alpha.needsUpdate = true;

    // rings
    for (let i = 0; i < MAX_RINGS; i++) {
      const r = rings[i];
      if (!r.active) continue;
      r.age += dt;
      const t = r.age / RING_TIME;
      if (t >= 1) {
        r.active = false;
        r.mesh.visible = false;
        continue;
      }
      const e = 1 - (1 - t) * (1 - t) * (1 - t); // ease out
      r.mesh.scale.setScalar(Math.max(0.01, r.radius * e));
      r.mat.uniforms.fade.value = (1 - t) * (1 - t);
    }

    // shake
    trauma = Math.max(0, trauma - dt * 1.5);
    const s = trauma * trauma * MAX_SHAKE;
    cameraOffset.set(wobble(time, 1.3) * s, wobble(time, 7.7) * s * 0.6, wobble(time, 13.1) * s);
  }

  return { burst, ring, shake, cameraOffset, update };
}
