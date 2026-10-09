import * as THREE from 'three';

const SPEED = 9, DASH_SPEED = 28, DASH_TIME = 0.15, DASH_CD = 0.6;
const ACCEL_TAU = 0.025; // ~95% of target speed after 0.08s
const FLOAT_Y = 0.95, HIT_TIME = 0.3, HOP_TIME = 0.55;
const TRAIL_N = 10, TRAIL_LIFE = 0.3, MOTE_N = 16;
const DEFS = [
  { name: 'Ember', color: 0xffa040, hatBase: 0xff6a10, hatTip: 0xfff3b0, hatGlow: 2.0, start: [-3, 0, 4] },
  { name: 'Tide', color: 0x40e0d0, hatBase: 0x1aa8c0, hatTip: 0xdafffb, hatGlow: 1.4, start: [3, 0, 4] },
];
const WHITE = new THREE.Color(1, 1, 1);
const GHOST = new THREE.Color(0xa8bce0);
const EYE_X = [-0.165, 0.165];

const _c = new THREE.Color();
const _dummy = new THREE.Object3D();

const clamp = THREE.MathUtils.clamp, lerp = THREE.MathUtils.lerp;
const wrapAngle = (a) => a - Math.PI * 2 * Math.round(a / (Math.PI * 2));
const ease = (dt, rate) => 1 - Math.exp(-dt * rate);

let glowTex;
function glowTexture() {
  if (glowTex) return glowTex;
  const cv = document.createElement('canvas');
  cv.width = cv.height = 64;
  const g = cv.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.25, 'rgba(255,255,255,0.7)');
  grd.addColorStop(0.6, 'rgba(255,255,255,0.18)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  glowTex = new THREE.CanvasTexture(cv);
  return glowTex;
}

// Lathed teardrop: blunt round bottom at y=0, pointed tip at y=height, colored base -> tip.
function teardrop(radius, height, base, tip) {
  const pts = [];
  for (let i = 0; i <= 12; i++) {
    const s = i / 12;
    pts.push(new THREE.Vector2(radius * Math.max(0, Math.sin(Math.PI * Math.pow(s, 0.6))), s * height));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 3);
  const a = new THREE.Color(base), b = new THREE.Color(tip);
  for (let i = 0; i < pos.count; i++) {
    const k = pos.getY(i) / height;
    _c.lerpColors(a, b, k * k).toArray(col, i * 3);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
  return geo;
}

// Ghostly tail hanging below the body, fading to transparent at the tip (RGBA vertex colors).
function tailGeometry() {
  const pts = [];
  for (let i = 0; i <= 10; i++) {
    const s = 1 - i / 10; // tip first
    pts.push(new THREE.Vector2(0.34 * Math.pow(1 - s, 1.4), -s * 0.8));
  }
  const geo = new THREE.LatheGeometry(pts, 16);
  const pos = geo.attributes.position, col = new Float32Array(pos.count * 4);
  for (let i = 0; i < pos.count; i++) {
    col.set([1, 1, 1, 0.9 * Math.pow(Math.max(0, 1 + pos.getY(i) / 0.8), 1.3)], i * 4);
  }
  geo.setAttribute('color', new THREE.BufferAttribute(col, 4));
  return geo;
}

const AURA_VS = /* glsl */`
varying vec3 vN; varying vec3 vV;
void main() {
  vN = normalize(normalMatrix * normal);
  vec4 mv = modelViewMatrix * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  gl_Position = projectionMatrix * mv;
}`;
const AURA_FS = /* glsl */`
uniform vec3 uColor; uniform float uStrength;
varying vec3 vN; varying vec3 vV;
void main() {
  float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
  gl_FragColor = vec4(uColor * pow(f, 2.5) * uStrength, 1.0);
}`;

// dash after-images: soft see-through echoes, brighter at the rim
const GHOST_VS = /* glsl */`
varying vec3 vN; varying vec3 vV; varying vec3 vC;
void main() {
  mat4 mvm = modelViewMatrix * instanceMatrix;
  vN = normalize(mat3(mvm) * normal);
  vec4 mv = mvm * vec4(position, 1.0);
  vV = normalize(-mv.xyz);
  vC = instanceColor;
  gl_Position = projectionMatrix * mv;
}`;
const GHOST_FS = /* glsl */`
varying vec3 vN; varying vec3 vV; varying vec3 vC;
void main() {
  float f = 1.0 - max(dot(normalize(vN), normalize(vV)), 0.0);
  gl_FragColor = vec4(vC * (0.04 + 1.8 * f * f * f), 1.0);
}`;

const RING_VS = /* glsl */`
varying vec2 vP;
void main() { vP = position.xy; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const RING_FS = /* glsl */`
uniform vec3 uColor; uniform float uProgress; uniform float uOpacity; uniform float uTime;
varying vec2 vP;
void main() {
  float r = length(vP);
  float edge = sin(3.14159265 * clamp((r - 1.75) / 0.4, 0.0, 1.0));
  float a = fract(0.25 - atan(vP.y, vP.x) / 6.2831853); // clockwise from the top
  float filled = step(a, uProgress);
  float la = (a - uProgress) * 40.0;
  float lead = exp(-la * la) * step(0.001, uProgress);
  float idle = 0.22 + 0.1 * sin(uTime * 4.0 - r * 3.0);
  vec3 c = uColor * (filled * 1.6 + (1.0 - filled) * idle + lead * 3.0);
  gl_FragColor = vec4(c * edge * uOpacity, 1.0);
}`;

export function createPlayers(scene) {
  const sphereGeo = new THREE.SphereGeometry(0.5, 32, 24);
  const eyeGeo = new THREE.SphereGeometry(0.085, 14, 10);
  const shineGeo = new THREE.SphereGeometry(0.022, 8, 6);
  const xGeo = new THREE.BoxGeometry(0.15, 0.03, 0.02);
  const handGeo = new THREE.SphereGeometry(0.085, 12, 10);
  const tailGeo = tailGeometry();
  const decalGeo = new THREE.PlaneGeometry(3.4, 3.4).rotateX(-Math.PI / 2);
  const ringGeo = new THREE.RingGeometry(1.75, 2.15, 96, 1);
  const shineMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(1.6, 1.6, 1.6) });

  return DEFS.map((def, index) => {
    const color = new THREE.Color(def.color);
    const partner = new THREE.Color(DEFS[1 - index].color);
    const bodyBase = color.clone().lerp(WHITE, 0.25);

    // --- hierarchy: root (ground xz) > float (height) > yawG > lean > squash
    const root = new THREE.Group();
    const float = new THREE.Group();
    const yawG = new THREE.Group();
    const lean = new THREE.Group();
    const squash = new THREE.Group();
    root.add(float); float.add(yawG); yawG.add(lean); lean.add(squash);
    scene.add(root);

    const bodyMat = new THREE.MeshStandardMaterial({
      color: bodyBase, emissive: color, emissiveIntensity: 0.3, roughness: 0.55, transparent: true,
    });
    const body = new THREE.Mesh(sphereGeo, bodyMat);
    body.scale.y = 1.06;
    body.castShadow = true;
    squash.add(body);

    const auraMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: color.clone().multiplyScalar(1.4) }, uStrength: { value: 1 } },
      vertexShader: AURA_VS, fragmentShader: AURA_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const aura = new THREE.Mesh(sphereGeo, auraMat);
    aura.scale.set(1.16, 1.22, 1.16);
    squash.add(aura);

    // lantern core: a glowing orb in the belly
    const coreMat = new THREE.MeshBasicMaterial({ color: color.clone(), transparent: true });
    const core = new THREE.Mesh(sphereGeo, coreMat);
    core.scale.setScalar(0.22);
    core.position.set(0, -0.2, 0.4);
    squash.add(core);

    // eyes: pupil+shine (blinks) and an "x" (downed)
    const eyeMat = new THREE.MeshBasicMaterial({ color: 0x1b1230, transparent: true });
    const eyes = [], pupils = [], xs = [];
    for (let i = 0; i < 2; i++) {
      const eye = new THREE.Group();
      const pupil = new THREE.Group();
      const ball = new THREE.Mesh(eyeGeo, eyeMat);
      ball.scale.set(0.8, 1.1, 0.45);
      const shine = new THREE.Mesh(shineGeo, shineMat);
      shine.position.set(0.025, 0.04, 0.035);
      pupil.add(ball, shine);
      const x = new THREE.Group();
      const x1 = new THREE.Mesh(xGeo, eyeMat), x2 = new THREE.Mesh(xGeo, eyeMat);
      x1.rotation.z = Math.PI / 4; x2.rotation.z = -Math.PI / 4;
      x.add(x1, x2);
      x.visible = false;
      eye.add(pupil, x);
      eye.rotation.y = EYE_X[i] * 1.6;
      squash.add(eye);
      eyes.push(eye); pupils.push(pupil); xs.push(x);
    }
    const cheekMat = new THREE.MeshBasicMaterial({ color: 0xff6f91, transparent: true, opacity: 0.45, depthWrite: false });
    for (const side of [-1, 1]) {
      const cheek = new THREE.Mesh(eyeGeo, cheekMat);
      cheek.scale.set(0.6, 0.35, 0.2);
      cheek.position.set(side * 0.27, -0.04, 0.415);
      cheek.rotation.y = side * 0.55;
      squash.add(cheek);
    }

    // silhouette: Ember gets a flame tuft, Tide a fin and a floating droplet
    const hatMat = new THREE.MeshBasicMaterial({ vertexColors: true, transparent: true });
    hatMat.color.setScalar(def.hatGlow);
    const hat = new THREE.Group();
    hat.position.set(0, 0.4, -0.03);
    squash.add(hat);
    let droplet = null;
    if (index === 0) {
      const big = new THREE.Mesh(teardrop(0.13, 0.46, def.hatBase, def.hatTip), hatMat);
      const smallGeo = teardrop(0.08, 0.27, def.hatBase, def.hatTip);
      const l = new THREE.Mesh(smallGeo, hatMat), r = new THREE.Mesh(smallGeo, hatMat);
      l.position.set(-0.1, -0.03, 0.02); l.rotation.z = 0.55;
      r.position.set(0.1, -0.03, 0.02); r.rotation.z = -0.55;
      hat.add(big, l, r);
    } else {
      const fin = new THREE.Mesh(teardrop(0.18, 0.5, def.hatBase, def.hatTip), hatMat);
      fin.scale.set(0.35, 1, 1);
      hat.add(fin);
      droplet = new THREE.Mesh(teardrop(0.065, 0.17, def.hatBase, def.hatTip), hatMat);
      squash.add(droplet);
    }

    const tailMat = new THREE.MeshBasicMaterial({
      color: color.clone().lerp(WHITE, 0.2), vertexColors: true, transparent: true, depthWrite: false,
    });
    const tail = new THREE.Mesh(tailGeo, tailMat);
    tail.position.set(0, -0.08, -0.06);
    squash.add(tail);

    const hands = [new THREE.Mesh(handGeo, bodyMat), new THREE.Mesh(handGeo, bodyMat)];
    lean.add(hands[0], hands[1]);

    // light + ground glow + revive ring
    const light = new THREE.PointLight(color, 7, 7, 1.6);
    root.add(light);
    const decalMat = new THREE.MeshBasicMaterial({
      map: glowTexture(), color, transparent: true, opacity: 0.35, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const decal = new THREE.Mesh(decalGeo, decalMat);
    decal.position.y = 0.03;
    root.add(decal);
    const ringMat = new THREE.ShaderMaterial({
      uniforms: { uColor: { value: partner }, uProgress: { value: 0 }, uOpacity: { value: 0 }, uTime: { value: 0 } },
      vertexShader: RING_VS, fragmentShader: RING_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    });
    const ring = new THREE.Mesh(ringGeo, ringMat);
    ring.rotation.x = -Math.PI / 2;
    ring.position.y = 0.05;
    ring.visible = false;
    root.add(ring);

    // dash after-images (world space)
    const trail = new THREE.InstancedMesh(sphereGeo, new THREE.ShaderMaterial({
      vertexShader: GHOST_VS, fragmentShader: GHOST_FS,
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }), TRAIL_N);
    trail.frustumCulled = false;
    const tPos = new Float32Array(TRAIL_N * 3), tYaw = new Float32Array(TRAIL_N), tLife = new Float32Array(TRAIL_N);
    let tNext = 0;
    _dummy.scale.setScalar(0);
    _dummy.updateMatrix();
    for (let i = 0; i < TRAIL_N; i++) { trail.setMatrixAt(i, _dummy.matrix); trail.setColorAt(i, _c.setRGB(0, 0, 0)); }
    scene.add(trail);

    // little motes drifting up off the spirit (embers / bubbles), world space
    const mPos = new Float32Array(MOTE_N * 3), mCol = new Float32Array(MOTE_N * 3);
    const mVel = new Float32Array(MOTE_N * 3), mLife = new Float32Array(MOTE_N);
    let mNext = 0, moteClock = 0;
    const moteGeo = new THREE.BufferGeometry();
    moteGeo.setAttribute('position', new THREE.BufferAttribute(mPos, 3).setUsage(THREE.DynamicDrawUsage));
    moteGeo.setAttribute('color', new THREE.BufferAttribute(mCol, 3).setUsage(THREE.DynamicDrawUsage));
    const motes = new THREE.Points(moteGeo, new THREE.PointsMaterial({
      size: 0.11, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    }));
    motes.frustumCulled = false;
    scene.add(motes);
    const moteTip = new THREE.Color(def.hatTip);

    // --- animation state
    const dashDir = new THREE.Vector3(0, 0, 1);
    let cd = 0, dashT = 0, trailClock = 0;
    let yaw = 0, yawRate = 0, turn = 0;
    let stretch = 0, stretchV = 0, vsq = 0, vsqV = 0, leanX = 0, bank = 0;
    let down = 0, hitT = 0, hopT = 0, flicker = false, ringShown = 0;
    let blinkT = 1 + Math.random() * 3, blinkDur = 0;
    let glanceT = 1, glanceX = 0, glanceY = 0, lookX = 0, lookY = 0;

    function animate(dt, t) {
      const speed = Math.hypot(p.velocity.x, p.velocity.z);
      const sp = Math.min(speed / SPEED, 1);

      // face the movement direction; yaw rate drives banking and eye lead
      turn = 0;
      if (speed > 0.6 && !p.downed) {
        turn = wrapAngle(Math.atan2(p.velocity.x, p.velocity.z) - yaw);
        const step = turn * ease(dt, 14);
        yaw = wrapAngle(yaw + step);
        if (dt > 0) yawRate += (step / dt - yawRate) * Math.min(1, dt * 12);
      } else yawRate *= 1 - ease(dt, 8);

      // squash & stretch springs: `stretch` along facing, `vsq` vertical
      const stretchTarget = p.dashing ? 0.25 : sp * 0.1;
      stretchV += ((stretchTarget - stretch) * 260 - stretchV * 16) * dt;
      stretch += stretchV * dt;
      const breathe = Math.sin(t * 2.4 + index) * 0.03;
      vsqV += ((breathe - vsq) * 200 - vsqV * 10) * dt;
      vsq += vsqV * dt;
      const s1 = 1 + clamp(stretch, -0.5, 0.8), q1 = 1 + clamp(vsq, -0.5, 0.8);
      squash.scale.set(1 / Math.sqrt(s1 * q1), q1 / Math.sqrt(s1), s1 / Math.sqrt(q1));

      down += ((p.downed ? 1 : 0) - down) * ease(dt, 5);
      leanX += ((p.downed ? 0 : p.dashing ? 0.4 : sp * 0.3) - leanX) * ease(dt, 10);
      bank += (clamp(-yawRate * 0.05, -0.45, 0.45) - bank) * ease(dt, 8);
      lean.rotation.set(leanX - down * 0.25, 0, bank + down * 0.55);

      // revive hop with a happy spin
      let hopY = 0, spin = 0;
      if (hopT > 0) {
        hopT = Math.max(0, hopT - dt);
        const k = 1 - hopT / HOP_TIME;
        hopY = Math.sin(Math.PI * k) * 1.2;
        spin = k * Math.PI * 2;
      }
      yawG.rotation.y = yaw + spin;

      const flash = hitT > 0 ? hitT / HIT_TIME : 0;
      hitT = Math.max(0, hitT - dt);
      const bob = Math.sin(t * 3.2 + index * 1.7) * (0.07 + sp * 0.03);
      root.position.set(p.position.x, 0, p.position.z);
      float.position.set(
        (Math.random() - 0.5) * 0.24 * flash,
        lerp(FLOAT_Y + bob, 0.42 + Math.sin(t * 1.3) * 0.04, down) + hopY,
        (Math.random() - 0.5) * 0.24 * flash,
      );

      // eyes: random blinks, idle glances, lead into turns, squeeze on hit, "x" when downed
      blinkT -= dt; blinkDur -= dt;
      if (blinkT <= 0) { blinkDur = 0.13; blinkT = Math.random() < 0.2 ? 0.25 : 1.8 + Math.random() * 3.5; }
      glanceT -= dt;
      if (glanceT <= 0) { glanceT = 0.8 + Math.random() * 2; glanceX = (Math.random() - 0.5) * 0.07; glanceY = (Math.random() - 0.5) * 0.04; }
      const moving = sp > 0.15;
      lookX += ((moving ? clamp(turn * 0.08, -0.05, 0.05) : glanceX) - lookX) * ease(dt, 12);
      lookY += ((moving ? -0.01 : glanceY) - lookY) * ease(dt, 12);
      const lid = flash > 0.3 ? 0.15 : blinkDur > 0 ? 0.12 : p.dashing ? 0.6 : 1;
      const xEyes = down > 0.5;
      for (let i = 0; i < 2; i++) {
        eyes[i].position.set(EYE_X[i] + lookX, 0.1 + lookY, 0.445);
        pupils[i].scale.y = lid;
        pupils[i].visible = !xEyes;
        xs[i].visible = xEyes;
      }

      // hands float at the sides, trail behind when moving, droop when downed
      for (let i = 0; i < 2; i++) {
        const side = i ? 1 : -1;
        hands[i].position.set(
          side * (0.56 - down * 0.06 + (p.dashing ? -0.08 : 0)),
          -0.12 + Math.sin(t * 3.2 + index * 1.7 + 1 + i * 0.7) * 0.05 - down * 0.18 - sp * 0.05,
          0.06 - sp * 0.22 - (p.dashing ? 0.2 : 0),
        );
      }
      tail.rotation.set(0.25 + sp * 0.6 + (p.dashing ? 0.4 : 0), 0, Math.sin(t * 5 + index) * 0.18);
      tail.scale.y = 1 + sp * 0.3 - down * 0.3;
      if (index === 0) {
        hat.rotation.set(-0.25 - sp * 0.35, 0, Math.sin(t * 7) * 0.05);
        hat.scale.set(1, 1 + Math.sin(t * 13) * 0.06 + Math.sin(t * 21.7) * 0.04 - down * 0.4, 1);
      } else {
        hat.rotation.set(-0.45 - sp * 0.3, 0, Math.sin(t * 2.2) * 0.12);
        hat.scale.y = 1 - down * 0.3;
        droplet.position.set(0, 0.72 + Math.sin(t * 2.5) * 0.05 - down * 0.2, 0.12 - sp * 0.15);
      }

      // materials: ghost fade when downed, white flash on hit, pulse while invulnerable
      if (flicker && (p.invuln <= 0 || p.downed)) flicker = false;
      const flick = flicker ? (Math.sin(t * 42) > 0 ? 1 : 0.45) : 1;
      const op = lerp(1, 0.38 + 0.06 * Math.sin(t * 2.5), down) * flick;
      bodyMat.opacity = op;
      bodyMat.color.lerpColors(bodyBase, GHOST, down * 0.7);
      bodyMat.emissive.lerpColors(color, WHITE, flash);
      bodyMat.emissiveIntensity = lerp(0.3, 0.15, down) + flash * 2.5 + (flicker && flick === 1 ? 0.4 : 0);
      tailMat.opacity = op;
      hatMat.opacity = op;
      hatMat.color.setScalar(lerp(def.hatGlow, 0.5, down) + flash * 2);
      eyeMat.opacity = lerp(1, 0.6, down);
      cheekMat.opacity = 0.45 * op * (1 - down);
      coreMat.opacity = op;
      coreMat.color.copy(color).multiplyScalar((3 + Math.sin(t * 5) * 0.6) * (1 - down * 0.8) + flash * 4);
      auraMat.uniforms.uStrength.value = (0.6 + 0.15 * Math.sin(t * 3)) * (1 - down * 0.6) * flick + flash * 2;
      light.intensity = lerp(7, 1.5, down) * (1 + flash);
      light.position.y = float.position.y;
      decalMat.opacity = (0.32 + 0.05 * Math.sin(t * 3)) * (1 - down * 0.6) / (1 + hopY);

      ringShown += ((p.downed ? 1 : 0) - ringShown) * ease(dt, 6);
      ring.visible = ringShown > 0.01;
      const ru = ringMat.uniforms;
      ru.uOpacity.value = ringShown;
      ru.uTime.value = t;
      if (p.downed) ru.uProgress.value += (p.reviveProgress - ru.uProgress.value) * Math.min(1, dt * 15);

      // dash after-images
      if (p.dashing) {
        trailClock -= dt;
        if (trailClock <= 0) {
          trailClock = 0.022;
          tPos[tNext * 3] = p.position.x;
          tPos[tNext * 3 + 1] = float.position.y;
          tPos[tNext * 3 + 2] = p.position.z;
          tYaw[tNext] = yaw;
          tLife[tNext] = TRAIL_LIFE;
          tNext = (tNext + 1) % TRAIL_N;
        }
      }
      for (let i = 0; i < TRAIL_N; i++) {
        tLife[i] = Math.max(0, tLife[i] - dt);
        const f = tLife[i] / TRAIL_LIFE;
        _dummy.position.set(tPos[i * 3], tPos[i * 3 + 1], tPos[i * 3 + 2]);
        _dummy.rotation.set(0, tYaw[i], 0);
        _dummy.scale.set(0.7, 0.7, 1.1).multiplyScalar(f > 0 ? 0.4 + 0.6 * f : 0);
        _dummy.updateMatrix();
        trail.setMatrixAt(i, _dummy.matrix);
        trail.setColorAt(i, _c.copy(color).multiplyScalar(f * f * 0.9));
      }
      trail.instanceMatrix.needsUpdate = true;
      trail.instanceColor.needsUpdate = true;

      // motes
      moteClock -= dt;
      if (moteClock <= 0 && dt > 0) {
        moteClock = p.downed ? 0.3 : 0.11;
        const j = mNext * 3;
        mPos[j] = p.position.x + (Math.random() - 0.5) * 0.6;
        mPos[j + 1] = float.position.y + (Math.random() - 0.3) * 0.5;
        mPos[j + 2] = p.position.z + (Math.random() - 0.5) * 0.6;
        mVel[j] = (Math.random() - 0.5) * 0.4;
        mVel[j + 1] = 0.5 + Math.random() * 0.5;
        mVel[j + 2] = (Math.random() - 0.5) * 0.4;
        mLife[mNext] = 1;
        mNext = (mNext + 1) % MOTE_N;
      }
      for (let i = 0; i < MOTE_N; i++) {
        const j = i * 3;
        mLife[i] = Math.max(0, mLife[i] - dt * 0.8);
        mPos[j] += (mVel[j] + Math.sin(t * 3 + i) * 0.2) * dt;
        mPos[j + 1] += mVel[j + 1] * dt;
        mPos[j + 2] += mVel[j + 2] * dt;
        const f = mLife[i] * (1 - mLife[i]) * 4 * (1 - down * 0.6);
        _c.lerpColors(moteTip, color, 1 - mLife[i]).multiplyScalar(f * 2);
        mCol[j] = _c.r; mCol[j + 1] = _c.g; mCol[j + 2] = _c.b;
      }
      moteGeo.attributes.position.needsUpdate = true;
      moteGeo.attributes.color.needsUpdate = true;
    }

    const p = {
      index, name: def.name, color,
      position: new THREE.Vector3(), velocity: new THREE.Vector3(), radius: 0.6,
      hp: 5, maxHp: 5, downed: false, reviveProgress: 0, invuln: 0, dashing: false,
      mesh: root,
      animate, // online guest: state comes from the host, only animate
      update(dt, input, t) {
        let started = false;
        cd -= dt; dashT -= dt;
        if (!p.downed) {
          let ix = input.x || 0, iz = input.z || 0;
          const il = Math.hypot(ix, iz);
          if (il > 1) { ix /= il; iz /= il; }
          if (input.dash && cd <= 0) {
            if (il > 0.1) dashDir.set(ix, 0, iz).normalize();
            else dashDir.set(Math.sin(yaw), 0, Math.cos(yaw));
            dashT = DASH_TIME; cd = DASH_CD; started = true;
            stretchV += 5; trailClock = 0;
          }
          p.dashing = dashT > 0;
          if (p.dashing) p.velocity.copy(dashDir).multiplyScalar(DASH_SPEED);
          else {
            const k = 1 - Math.exp(-dt / ACCEL_TAU);
            p.velocity.x += (ix * SPEED - p.velocity.x) * k;
            p.velocity.z += (iz * SPEED - p.velocity.z) * k;
          }
          p.position.addScaledVector(p.velocity, dt);
        } else {
          p.velocity.set(0, 0, 0);
          p.dashing = false;
        }
        animate(dt, t);
        return started;
      },
      hit() {
        hitT = HIT_TIME;
        vsqV -= 9; stretchV -= 3;
        flicker = true;
      },
      setDowned(d) {
        if (d) {
          p.dashing = false; dashT = 0;
          p.velocity.set(0, 0, 0);
          ringMat.uniforms.uProgress.value = 0;
          vsqV -= 4;
        } else {
          hopT = HOP_TIME;
          vsqV += 7;
          flicker = true;
        }
      },
      reset(pos) {
        p.position.copy(pos);
        p.velocity.set(0, 0, 0);
        p.hp = p.maxHp; p.downed = false; p.reviveProgress = 0; p.invuln = 0; p.dashing = false;
        cd = dashT = 0;
        yaw = yawRate = 0;
        stretch = stretchV = vsq = vsqV = leanX = bank = 0;
        down = hitT = hopT = ringShown = 0;
        flicker = false;
        ringMat.uniforms.uProgress.value = 0;
        tLife.fill(0); mLife.fill(0);
        animate(0, 0);
      },
    };
    p.reset(new THREE.Vector3().fromArray(def.start));
    return p;
  });
}

// ---------------------------------------------------------------- tether

const BEAM_VS = /* glsl */`
uniform vec3 uA; uniform vec3 uB;
uniform float uTime; uniform float uWidth; uniform float uWobble; uniform float uFlare; uniform float uFront;
varying float vU; varying float vLen; varying float vFacing; varying vec2 vRing;
void main() {
  float u = position.x;
  vec3 d = uB - uA; d.y = 0.0;
  float len = max(length(d), 0.001);
  vec3 dir = d / len;
  vec3 side = vec3(-dir.z, 0.0, dir.x);
  vec3 up = vec3(0.0, 1.0, 0.0);
  float env = max(sin(3.14159265 * u), 0.0);
  vec3 c = mix(uA, uB, u);
  c.y += 0.8;
  float w = uWobble * env;
  c += side * sin(u * len * 0.8 - uTime * 6.0) * w;
  c += up * sin(u * len * 1.4 + uTime * 4.3) * w * 0.5;
  float bd = (abs(u - 0.5) * 2.0 - uFront) * 5.0;
  float band = exp(-bd * bd);
  float r = uWidth * (0.4 + 0.6 * sqrt(env)) * (1.0 + uFlare * (0.6 + band * 2.0));
  vec3 n = side * position.y + up * position.z;
  vec3 p = c + n * r;
  vFacing = abs(dot(n, normalize(cameraPosition - p)));
  vU = u; vLen = len; vRing = position.yz;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;
const BEAM_FS = /* glsl */`
uniform vec3 uColA; uniform vec3 uColB;
uniform float uTime; uniform float uStrength; uniform float uFlare; uniform float uFront;
uniform float uIntensity; uniform float uGlow; uniform float uBright;
varying float vU; varying float vLen; varying float vFacing; varying vec2 vRing;
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p); vec2 f = fract(p);
  f = f * f * (3.0 - 2.0 * f);
  return mix(mix(hash(i), hash(i + vec2(1.0, 0.0)), f.x), mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), f.x), f.y);
}
void main() {
  float x = vU * vLen;
  float ring = vRing.x * 1.3 + vRing.y * 0.7;
  // energy flows in from both spirits toward the middle
  float n = mix(noise(vec2(x * 2.0 - uTime * 8.0, ring)), noise(vec2(x * 2.0 + uTime * 8.0 + 17.0, ring + 5.0)), vU);
  float v = noise(vec2(x * 3.5 - uTime * 11.0, uTime * 2.7 + ring * 0.5));
  float vein = pow(max(1.0 - abs(v * 2.0 - 1.0), 0.0), 12.0);
  float core = pow(vFacing, uGlow > 0.5 ? 2.5 : 1.2);
  vec3 col = mix(uColA, uColB, smoothstep(0.1, 0.9, vU));
  float th = (1.0 - uStrength) * 0.75 - 0.3; // weak beam breaks into sputtering segments
  float gap = smoothstep(th, th + 0.2, noise(vec2(x * 1.2 - uTime * 7.0, uTime * 1.7)));
  vec3 c = col * core * (0.55 + 0.7 * n) * uBright;
  c += mix(col, vec3(1.0), 0.6) * vein * core * 1.5 * uBright;
  c += vec3(1.0, 0.95, 0.85) * pow(core, 6.0) * uStrength * 0.5 * (1.0 - uGlow);
  float bd = (abs(vU - 0.5) * 2.0 - uFront) * 5.0;
  float band = exp(-bd * bd);
  c += vec3(1.0, 0.82, 0.5) * core * uFlare * (0.6 + band * 3.0);
  gl_FragColor = vec4(c * gap * uIntensity, 1.0);
}`;

const FLARE_TIME = 0.55, SPARK_N = 80;
const GOLD = new THREE.Color(1, 0.85, 0.55).multiplyScalar(3);

export function createTether(scene) {
  // unit tube in parameter space: x = u along the beam, (y, z) = unit circle
  const SEG = 64, RAD = 10, verts = [], idx = [];
  for (let i = 0; i <= SEG; i++) {
    for (let j = 0; j <= RAD; j++) {
      const a = (j / RAD) * Math.PI * 2;
      verts.push(i / SEG, Math.cos(a), Math.sin(a));
    }
  }
  for (let i = 0; i < SEG; i++) {
    for (let j = 0; j < RAD; j++) {
      const a = i * (RAD + 1) + j, b = a + RAD + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(verts, 3));
  geo.setIndex(idx);

  const colA = new THREE.Color(DEFS[0].color), colB = new THREE.Color(DEFS[1].color);
  const U = {
    uA: { value: new THREE.Vector3() }, uB: { value: new THREE.Vector3() },
    uTime: { value: 0 }, uStrength: { value: 0 }, uWobble: { value: 0 }, uFlare: { value: 0 }, uFront: { value: 0 },
    uColA: { value: colA }, uColB: { value: colB }, uBright: { value: 1 },
  };
  const beamMat = (glow) => new THREE.ShaderMaterial({
    uniforms: { ...U, uWidth: { value: 0.1 }, uGlow: { value: glow }, uIntensity: { value: 1 } },
    vertexShader: BEAM_VS, fragmentShader: BEAM_FS,
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  });
  const glow = new THREE.Mesh(geo, beamMat(1));
  const core = new THREE.Mesh(geo, beamMat(0));
  glow.frustumCulled = core.frustumCulled = false;
  scene.add(glow, core);

  // sparks shed along the beam
  const sPos = new Float32Array(SPARK_N * 3), sCol = new Float32Array(SPARK_N * 3);
  const sOff = new Float32Array(SPARK_N * 3), sVel = new Float32Array(SPARK_N * 3), sBase = new Float32Array(SPARK_N * 3);
  const sU = new Float32Array(SPARK_N), sLife = new Float32Array(SPARK_N), sMax = new Float32Array(SPARK_N);
  let sNext = 0, spawnAcc = 0;
  const sparkGeo = new THREE.BufferGeometry();
  sparkGeo.setAttribute('position', new THREE.BufferAttribute(sPos, 3).setUsage(THREE.DynamicDrawUsage));
  sparkGeo.setAttribute('color', new THREE.BufferAttribute(sCol, 3).setUsage(THREE.DynamicDrawUsage));
  const sparks = new THREE.Points(sparkGeo, new THREE.PointsMaterial({
    size: 0.16, map: glowTexture(), vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
  }));
  sparks.frustumCulled = false;
  scene.add(sparks);

  function spawnSpark(u, speed, gold) {
    const i = sNext, j = i * 3;
    sNext = (sNext + 1) % SPARK_N;
    sU[i] = u;
    sOff[j] = sOff[j + 1] = sOff[j + 2] = 0;
    const a = Math.random() * Math.PI * 2, e = (Math.random() - 0.3) * 1.2;
    sVel[j] = Math.cos(a) * Math.cos(e) * speed;
    sVel[j + 1] = Math.sin(e) * speed + speed * 0.3;
    sVel[j + 2] = Math.sin(a) * Math.cos(e) * speed;
    sMax[i] = sLife[i] = 0.3 + Math.random() * 0.4;
    if (gold) _c.copy(GOLD);
    else _c.lerpColors(colA, colB, u).lerp(WHITE, Math.random() * 0.5).multiplyScalar(3);
    sBase[j] = _c.r; sBase[j + 1] = _c.g; sBase[j + 2] = _c.b;
  }

  let sDisp = 0, prevStrength = 0, flareT = 0, flickT = 0, flickTarget = 1, flick = 1;

  return {
    update(dt, a, b, strength, t) {
      sDisp += (strength - sDisp) * ease(dt, 14);
      if (strength === 0 && sDisp < 0.02) sDisp = 0;
      if (prevStrength > 0.15 && strength === 0) for (let i = 0; i < 14; i++) spawnSpark(Math.random(), 3, false);
      prevStrength = strength;

      flareT = Math.max(0, flareT - dt);
      const fk = flareT / FLARE_TIME;
      const flareAmt = fk * fk;
      const vis = Math.max(sDisp, flareAmt);

      // weak beam sputters: randomly dip in brightness, more often the weaker it is
      flickT -= dt;
      if (flickT <= 0) {
        flickT = 0.03 + Math.random() * 0.06;
        flickTarget = Math.random() < 0.6 - sDisp ? 0.15 + Math.random() * 0.35 : 1;
      }
      flick += (flickTarget - flick) * Math.min(1, dt * 40);
      const f = Math.max(flick, flareAmt);

      U.uA.value.copy(a); U.uB.value.copy(b);
      U.uTime.value = t;
      U.uStrength.value = vis;
      U.uWobble.value = 0.05 + (1 - vis) * 0.4;
      U.uFlare.value = flareAmt;
      U.uFront.value = (1 - fk) * 1.3;
      U.uBright.value = 0.9 + 1.2 * vis;
      const w = 0.025 + 0.075 * vis;
      core.material.uniforms.uWidth.value = w;
      core.material.uniforms.uIntensity.value = f;
      glow.material.uniforms.uWidth.value = w * 3.5;
      glow.material.uniforms.uIntensity.value = 0.16 * f;
      core.visible = glow.visible = vis > 0.01;

      if (vis > 0.01) {
        spawnAcc += dt * 40 * sDisp * Math.min(2, a.distanceTo(b) / 8);
        while (spawnAcc >= 1) { spawnAcc -= 1; spawnSpark(Math.random(), 1.5, false); }
      }
      for (let i = 0; i < SPARK_N; i++) {
        const j = i * 3;
        sLife[i] = Math.max(0, sLife[i] - dt);
        const drag = 1 - Math.min(1, dt * 2.5);
        sVel[j] *= drag; sVel[j + 2] *= drag;
        sVel[j + 1] = sVel[j + 1] * drag - 3 * dt;
        sOff[j] += sVel[j] * dt; sOff[j + 1] += sVel[j + 1] * dt; sOff[j + 2] += sVel[j + 2] * dt;
        sPos[j] = a.x + (b.x - a.x) * sU[i] + sOff[j];
        sPos[j + 1] = 0.8 + sOff[j + 1];
        sPos[j + 2] = a.z + (b.z - a.z) * sU[i] + sOff[j + 2];
        const k = sMax[i] > 0 ? sLife[i] / sMax[i] : 0;
        sCol[j] = sBase[j] * k; sCol[j + 1] = sBase[j + 1] * k; sCol[j + 2] = sBase[j + 2] * k;
      }
      sparkGeo.attributes.position.needsUpdate = true;
      sparkGeo.attributes.color.needsUpdate = true;
    },
    flare() {
      flareT = FLARE_TIME;
      for (let i = 0; i < 40; i++) spawnSpark(Math.random(), 5 + Math.random() * 5, true);
    },
  };
}
