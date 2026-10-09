import * as THREE from 'three';

export function createWorld(scene, renderer) {
  const TAU = Math.PI * 2;
  let seed = 2371;
  const random = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  const clock = { value: 0 };
  const daylight = { value: 0 };
  const fireHealth = { value: 1 };
  const dummy = new THREE.Object3D();
  const color = new THREE.Color();
  const nightFog = new THREE.Color('#121932');
  const dawnFog = new THREE.Color('#b88b9c');
  scene.fog = new THREE.FogExp2(nightFog, 0.008);
  scene.background = nightFog.clone();

  function mesh(geometry, material, x = 0, y = 0, z = 0) {
    const object = new THREE.Mesh(geometry, material);
    object.position.set(x, y, z);
    scene.add(object);
    return object;
  }
  const stone = new THREE.MeshStandardMaterial({ color: '#4b5368', roughness: 1, flatShading: true });
  const bark = new THREE.MeshStandardMaterial({ color: '#493849', roughness: 1, flatShading: true });
  const moss = new THREE.MeshStandardMaterial({ color: '#365c53', roughness: 1, flatShading: true });
  const glow = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.4, 1.6, 1.35) });

  // A broad, level floor keeps silhouettes and the tether easy to read.
  const groundGeo = new THREE.CircleGeometry(23, 96, 1);
  groundGeo.rotateX(-Math.PI / 2);
  const vertices = groundGeo.attributes.position;
  const groundColors = new Float32Array(vertices.count * 3);
  const centerColor = new THREE.Color('#4a6550');
  const rimColor = new THREE.Color('#263b43');
  for (let i = 0; i < vertices.count; i++) {
    const r = Math.hypot(vertices.getX(i), vertices.getZ(i));
    color.copy(centerColor).lerp(rimColor, Math.min(1, r / 25));
    color.toArray(groundColors, i * 3);
  }
  groundGeo.setAttribute('color', new THREE.BufferAttribute(groundColors, 3));
  const groundMat = new THREE.MeshStandardMaterial({ vertexColors: true, roughness: 1 });
  groundMat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <begin_vertex>', '#include <begin_vertex>\nvGround = position;');
    shader.fragmentShader = shader.fragmentShader.replace('#include <common>', '#include <common>\nvarying vec3 vGround;')
      .replace('#include <color_fragment>', `#include <color_fragment>
        float grain = sin(vGround.x * 2.7 + sin(vGround.z * 1.8)) * sin(vGround.z * 3.2 + sin(vGround.x));
        float clearing = 1.0 - smoothstep(1.8, 5.0, length(vGround.xz));
        diffuseColor.rgb *= 0.92 + 0.08 * grain;
        diffuseColor.rgb = mix(diffuseColor.rgb, vec3(0.17, 0.115, 0.075), clearing * 0.65);`);
  };
  const ground = mesh(groundGeo, groundMat);
  ground.receiveShadow = true;

  // Irregular concentric rock rings form a tapered floating underside.
  const ringCount = 5, sides = 64;
  const rockPositions = [], rockColors = [], rockIndices = [];
  const radii = [23, 23.4, 20, 13, 3];
  const heights = [-0.08, -1.8, -4.8, -8, -11.5];
  for (let ring = 0; ring < ringCount; ring++) {
    for (let i = 0; i < sides; i++) {
      const angle = i / sides * TAU;
      const r = radii[ring] + (random() - 0.5) * (ring === 0 ? 0.35 : 2.6);
      rockPositions.push(Math.cos(angle) * r, heights[ring] - random() * (ring === 0 ? 0.05 : 1), Math.sin(angle) * r);
      color.setHSL(0.65 + random() * 0.045, 0.17, 0.13 + random() * 0.09);
      rockColors.push(color.r, color.g, color.b);
      if (ring < ringCount - 1) {
        const a = ring * sides + i, b = ring * sides + (i + 1) % sides;
        rockIndices.push(a, b, a + sides, b, b + sides, a + sides);
      }
    }
  }
  const rockGeo = new THREE.BufferGeometry();
  rockGeo.setAttribute('position', new THREE.Float32BufferAttribute(rockPositions, 3));
  rockGeo.setAttribute('color', new THREE.Float32BufferAttribute(rockColors, 3));
  rockGeo.setIndex(rockIndices);
  rockGeo.computeVertexNormals();
  mesh(rockGeo, new THREE.MeshStandardMaterial({ vertexColors: true, flatShading: true, roughness: 1 }));

  const hemi = new THREE.HemisphereLight('#879fd3', '#313347', 1.6);
  scene.add(hemi);
  const moonlight = new THREE.DirectionalLight('#a7bdff', 2.2);
  moonlight.position.set(-18, 32, -16);
  moonlight.castShadow = true;
  moonlight.shadow.mapSize.set(2048, 2048);
  Object.assign(moonlight.shadow.camera, { left: -29, right: 29, top: 29, bottom: -29, near: 1, far: 90 });
  moonlight.shadow.bias = -0.0005;
  moonlight.shadow.normalBias = 0.04;
  scene.add(moonlight);

  const sky = mesh(new THREE.SphereGeometry(180, 32, 24), new THREE.ShaderMaterial({
    side: THREE.BackSide, depthWrite: false,
    uniforms: { uDawn: daylight },
    vertexShader: 'varying vec3 vDir; void main(){ vDir=position; gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0); }',
    fragmentShader: `uniform float uDawn; varying vec3 vDir;
      void main(){
        vec3 d=normalize(vDir); float h=clamp(d.y + 0.32,0.0,1.0);
        float rise=smoothstep(0.3,1.0,uDawn);
        vec3 top=mix(vec3(0.009,0.013,0.047),vec3(0.19,0.17,0.35),rise);
        vec3 horizon=mix(vec3(0.07,0.10,0.20),vec3(0.72,0.36,0.31),rise);
        vec3 sky=mix(horizon,top,pow(h,0.45));
        float east=pow(max(0.0,dot(d,normalize(vec3(0.3,0.12,-1.0)))),5.0);
        sky+=vec3(0.5,0.15,0.055)*east*rise*exp(-h*3.0);
        gl_FragColor=vec4(sky,1.0);
      }`,
  }));
  sky.renderOrder = -10;
  const moon = mesh(new THREE.SphereGeometry(5.4, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(1.5, 1.65, 2.0), fog: false }), -48, 8, -105);
  const moonHalo = mesh(new THREE.PlaneGeometry(31, 31), new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
    uniforms: { uDawn: daylight },
    vertexShader: 'varying vec2 vUv; void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: 'varying vec2 vUv; uniform float uDawn; void main(){float r=length(vUv-.5)*2.0;gl_FragColor=vec4(.45,.57,1.0,pow(max(0.0,1.0-r),3.0)*.26*(1.0-uDawn));}',
  }), -48, 8, -105);
  moonHalo.lookAt(0, 0, 0);
  const sun = mesh(new THREE.SphereGeometry(6, 24, 16), new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 1.45, 0.5), fog: false }), 36, -22, -125);

  function particles(count, spread, size, tint, kind) {
    const positions = new Float32Array(count * 3);
    const seeds = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const a = random() * TAU;
      const r = kind === 0 ? 140 : Math.sqrt(random()) * spread;
      positions[i * 3] = Math.cos(a) * r;
      positions[i * 3 + 1] = kind === 0 ? -20 + random() * 135 : random() * 4;
      positions[i * 3 + 2] = Math.sin(a) * r;
      seeds[i] = random();
    }
    const geometry = new THREE.BufferGeometry();
    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));
    geometry.setAttribute('aSeed', new THREE.BufferAttribute(seeds, 1));
    const material = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: kind === 3 ? THREE.NormalBlending : THREE.AdditiveBlending,
      uniforms: { uTime: clock, uDawn: daylight, uHealth: fireHealth, uSize: { value: size }, uColor: { value: new THREE.Color(tint) } },
      vertexShader: `uniform float uTime,uSize,uDawn,uHealth; attribute float aSeed; varying float vAlpha;
        void main(){ vec3 p=position; float life=fract(aSeed+uTime*${kind === 3 ? '0.1' : '0.2'});
        ${kind === 0 ? 'vAlpha=(.55+.45*sin(uTime*(.7+aSeed)+aSeed*90.0))*(1.0-smoothstep(.2,.85,uDawn));' : kind === 1 ? 'p.x+=sin(uTime*.35+aSeed*70.0)*1.4;p.z+=cos(uTime*.27+aSeed*80.0);p.y+=sin(uTime*.5+aSeed*30.0)*.5;vAlpha=(.35+.65*pow(.5+.5*sin(uTime*1.4+aSeed*90.0),3.0))*(1.0-uDawn*.8);' : 'p.x=sin(aSeed*70.0+life*5.0)*life*.9;p.z=cos(aSeed*90.0+life*3.0)*life*.8;p.y=.5+life*5.0;vAlpha=sin(life*3.14159)*' + (kind === 3 ? '(.12+.18*(1.0-uHealth));' : 'uHealth;')}
        vec4 mv=modelViewMatrix*vec4(p,1.0); gl_Position=projectionMatrix*mv;
        gl_PointSize=min(90.0,uSize*${Math.min(renderer?.getPixelRatio?.() || 1, 2).toFixed(1)}*100.0/max(1.0,-mv.z)); }`,
      fragmentShader: `uniform vec3 uColor; varying float vAlpha; void main(){float r=length(gl_PointCoord-.5)*2.0; float a=pow(max(0.0,1.0-r),${kind === 3 ? '2.0' : '1.5'}); gl_FragColor=vec4(uColor,a*vAlpha);}`,
    });
    const object = new THREE.Points(geometry, material);
    object.frustumCulled = false;
    scene.add(object);
    return object;
  }
  particles(650, 0, 2.1, '#c2d7ff', 0);
  particles(100, 22, 2, new THREE.Color(0.8, 1.8, 0.9), 1);
  particles(65, 1, 1.2, new THREE.Color(3, 1.25, 0.2), 2);
  particles(24, 1, 19, '#72758a', 3);

  // Trees form a loose frame beyond the playable boundary.
  const treeCount = 34;
  const trunks = new THREE.InstancedMesh(new THREE.CylinderGeometry(0.16, 0.3, 1, 5), bark, treeCount);
  const pineMat = new THREE.MeshStandardMaterial({ color: '#ffffff', flatShading: true, roughness: 1 });
  const pineLayers = new THREE.InstancedMesh(new THREE.ConeGeometry(1, 1, 6), pineMat, treeCount * 3);
  for (let i = 0; i < treeCount; i++) {
    const a = i / treeCount * TAU + random() * 0.09;
    const r = 21.7 + random() * 0.8;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    const height = 2.8 + random() * 3.2;
    dummy.position.set(x, height * 0.25, z);
    dummy.rotation.set(0, random() * TAU, 0);
    dummy.scale.set(1, height * 0.5, 1);
    dummy.updateMatrix(); trunks.setMatrixAt(i, dummy.matrix);
    for (let j = 0; j < 3; j++) {
      dummy.position.y = height * (0.4 + j * 0.23);
      dummy.scale.set(height * (0.33 - j * 0.075), height * 0.53, height * (0.33 - j * 0.075));
      dummy.updateMatrix(); pineLayers.setMatrixAt(i * 3 + j, dummy.matrix);
      color.setHSL(0.43 + random() * 0.04, 0.3, 0.14 + j * 0.025 + random() * 0.03);
      pineLayers.setColorAt(i * 3 + j, color);
    }
  }
  trunks.castShadow = pineLayers.castShadow = true;
  scene.add(trunks, pineLayers);

  const rocks = new THREE.InstancedMesh(new THREE.IcosahedronGeometry(1, 0), stone, 42);
  for (let i = 0; i < 42; i++) {
    const a = random() * TAU, r = 21.1 + random() * 1.5;
    dummy.position.set(Math.cos(a) * r, 0.2, Math.sin(a) * r);
    dummy.rotation.set(random(), random() * TAU, random());
    dummy.scale.set(0.5 + random(), 0.4 + random() * 0.7, 0.6 + random());
    dummy.updateMatrix(); rocks.setMatrixAt(i, dummy.matrix);
  }
  rocks.castShadow = rocks.receiveShadow = true;
  scene.add(rocks);

  const runeGeo = new THREE.BoxGeometry(0.035, 0.36, 0.025);
  for (let i = 0; i < 7; i++) {
    const a = (i + 0.25) / 7 * TAU, r = 21.3;
    const group = new THREE.Group();
    group.position.set(Math.cos(a) * r, 0, Math.sin(a) * r);
    group.rotation.y = -a + Math.PI / 2;
    scene.add(group);
    const standing = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 0), stone);
    standing.scale.set(0.65, 1.45, 0.45); standing.position.y = 1.1; standing.castShadow = true;
    group.add(standing);
    for (let j = 0; j < 3; j++) {
      const rune = new THREE.Mesh(runeGeo, glow);
      rune.position.set((j - 1) * 0.12, 1.2 + (j % 2) * 0.16, 0.43);
      rune.rotation.z = j % 2 ? -0.6 : 0.6;
      group.add(rune);
    }
  }

  const grassGeo = new THREE.BufferGeometry();
  grassGeo.setAttribute('position', new THREE.Float32BufferAttribute([-.1, 0, 0, .1, 0, 0, .02, .65, .06, 0, 0, -.1, 0, 0, .1, .07, .48, 0], 3));
  grassGeo.computeVertexNormals();
  const grassMat = new THREE.MeshStandardMaterial({ color: '#ffffff', side: THREE.DoubleSide, roughness: 1 });
  grassMat.onBeforeCompile = (shader) => {
    shader.uniforms.uTime = clock;
    shader.vertexShader = shader.vertexShader.replace('#include <common>', '#include <common>\nuniform float uTime;')
      .replace('#include <begin_vertex>', `#include <begin_vertex>
        vec3 root = instanceMatrix[3].xyz;
        transformed.x += sin(uTime*1.6+root.x*.45+root.z*.3)*position.y*position.y*.24;`);
  };
  const grass = new THREE.InstancedMesh(grassGeo, grassMat, 2200);
  for (let i = 0; i < 2200; i++) {
    const a = random() * TAU, r = Math.sqrt(9 + random() * (22.5 * 22.5 - 9));
    dummy.position.set(Math.cos(a) * r, 0.01, Math.sin(a) * r);
    dummy.rotation.set(0, random() * TAU, 0);
    const s = 0.4 + random() * 0.6;
    dummy.scale.set(s, s, s); dummy.updateMatrix(); grass.setMatrixAt(i, dummy.matrix);
    color.setHSL(0.36 + random() * 0.12, 0.25, 0.24 + random() * 0.12);
    grass.setColorAt(i, color);
  }
  grass.receiveShadow = true; scene.add(grass);

  const stemGeo = new THREE.CylinderGeometry(0.035, 0.055, 0.25, 5);
  const capGeo = new THREE.SphereGeometry(0.19, 8, 4, 0, TAU, 0, Math.PI / 2);
  const capMat = new THREE.MeshStandardMaterial({ color: '#63c9cd', emissive: '#43a6b2', emissiveIntensity: 1.4, roughness: 0.6 });
  for (let i = 0; i < 36; i++) {
    const a = random() * TAU, r = 17 + random() * 5;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    mesh(stemGeo, moss, x, 0.12, z);
    mesh(capGeo, capMat, x, 0.25, z);
  }

  const lanternMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(2.5, 1.4, 0.45) });
  const postGeo = new THREE.CylinderGeometry(0.075, 0.11, 2.2, 5);
  const lampGeo = new THREE.OctahedronGeometry(0.24);
  for (let i = 0; i < 5; i++) {
    const a = (i + 0.5) / 5 * TAU, r = 21.2;
    const x = Math.cos(a) * r, z = Math.sin(a) * r;
    mesh(postGeo, bark, x, 1.1, z).castShadow = true;
    mesh(lampGeo, lanternMat, x, 2.35, z);
    mesh(new THREE.ConeGeometry(0.37, 0.18, 5), stone, x, 2.66, z);
  }

  // Soft cloud banks below the island, with a nearly transparent glade veil.
  const mistMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide,
    uniforms: { uTime: clock, uDawn: daylight },
    vertexShader: 'varying vec2 vUv;void main(){vUv=uv;gl_Position=projectionMatrix*modelViewMatrix*vec4(position,1.0);}',
    fragmentShader: `varying vec2 vUv; uniform float uTime,uDawn;
      void main(){vec2 p=(vUv-.5)*2.0;float r=length(p);
      float waves=sin(p.x*13.0+uTime*.06+sin(p.y*9.0))*sin(p.y*17.0-uTime*.05);
      float a=smoothstep(.16,.34,r)*(1.0-smoothstep(.6,1.0,r))*(.16+.12*waves);
      gl_FragColor=vec4(mix(vec3(.19,.24,.38),vec3(.65,.45,.5),uDawn),a);}`,
  });
  const cloud = mesh(new THREE.PlaneGeometry(180, 180), mistMat, 0, -7, 0);
  cloud.rotation.x = -Math.PI / 2;
  const veil = mesh(new THREE.PlaneGeometry(70, 70), mistMat, 0, 0.25, 0);
  veil.rotation.x = -Math.PI / 2;

  // The campfire is the only warm light source in the arena.
  const fireLight = new THREE.PointLight('#ff923c', 95, 26, 1.5);
  fireLight.position.set(0, 1.5, 0); scene.add(fireLight);
  const ringGeo = new THREE.IcosahedronGeometry(0.29, 0);
  for (let i = 0; i < 12; i++) {
    const a = i / 12 * TAU;
    const rock = mesh(ringGeo, stone, Math.cos(a) * 1.03, 0.17, Math.sin(a) * 1.03);
    rock.scale.set(1.2, 0.7, 1); rock.rotation.y = a; rock.castShadow = true;
  }
  const logGeo = new THREE.CylinderGeometry(0.15, 0.19, 1.7, 7);
  for (let i = 0; i < 4; i++) {
    const log = mesh(logGeo, bark, 0, 0.2 + i * 0.05, 0);
    log.rotation.set(Math.PI / 2, 0, i * Math.PI / 4); log.castShadow = true;
  }
  const coals = mesh(new THREE.SphereGeometry(0.64, 12, 6), new THREE.MeshStandardMaterial({ color: '#56251d', emissive: '#ff5010', emissiveIntensity: 1.5 }), 0, 0.16, 0);
  coals.scale.y = 0.15;
  const hurtUniform = { value: 0 };
  const flameMat = new THREE.ShaderMaterial({
    transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending,
    uniforms: { uTime: clock, uHealth: fireHealth, uHurt: hurtUniform },
    vertexShader: `varying vec2 vUv; uniform float uTime;
      void main(){ vUv=uv; vec3 p=position; p.x+=sin(uTime*7.0+p.y*4.0)*.12*p.y; p.z+=cos(uTime*5.0+p.y*5.0)*.08*p.y; gl_Position=projectionMatrix*modelViewMatrix*vec4(p,1.0); }`,
    fragmentShader: `varying vec2 vUv;uniform float uTime,uHealth,uHurt;
      void main(){float width=sin(vUv.y*3.14159)*.42+.08;
      float flicker=sin(vUv.y*28.0-uTime*12.0)*.025;
      float a=(1.0-smoothstep(width*.2,width,abs(vUv.x-.5)+flicker))*(1.0-smoothstep(.65,1.0,vUv.y));
      vec3 c=mix(vec3(3.5,2.0,.45),vec3(2.5,.35,.03),vUv.y);
      c=mix(c,vec3(1.4,.15,3.2),uHurt);gl_FragColor=vec4(c,a*.75*uHealth);}`,
  });
  const flames = new THREE.Group(); scene.add(flames);
  const flameGeo = new THREE.PlaneGeometry(1.7, 2.6, 1, 12);
  flameGeo.translate(0, 1.5, 0);
  for (let i = 0; i < 3; i++) {
    const flame = new THREE.Mesh(flameGeo, flameMat); flame.rotation.y = i * Math.PI / 3; flames.add(flame);
  }
  let health = 1, hurtT = 0;
  const nightMoon = new THREE.Color('#a7bdff'), dawnMoon = new THREE.Color('#ffd2a0');
  const nightHemi = new THREE.Color('#879fd3'), dawnHemi = new THREE.Color('#e5bed2');
  const fireColor = new THREE.Color('#ff923c'), hurtColor = new THREE.Color('#b34dff');
  const campfire = {
    position: new THREE.Vector3(), radius: 1.2,
    setHealth(f) { health = THREE.MathUtils.clamp(f, 0, 1); },
    hurt() { hurtT = 0.3; },
  };

  function update(dt, t, dawn) {
    clock.value = t;
    daylight.value = THREE.MathUtils.clamp(dawn, 0, 1);
    const rise = THREE.MathUtils.smoothstep(daylight.value, 0.3, 1);
    hurtT = Math.max(0, hurtT - dt);
    hurtUniform.value = hurtT / 0.3;
    fireHealth.value = health;
    const flicker = 1 + Math.sin(t * 13) * 0.07 + Math.sin(t * 23.4) * 0.05;
    const sputter = hurtT > 0 ? 0.4 + Math.sin(t * 65) * 0.2 : 1;
    const scale = Math.sqrt(health);
    flames.scale.set(scale, scale * flicker * sputter, scale);
    flames.visible = health > 0;
    fireLight.intensity = 95 * health * flicker * sputter;
    fireLight.color.copy(fireColor).lerp(hurtColor, hurtUniform.value);
    coals.material.emissiveIntensity = health * (1.3 + flicker * 0.2);
    scene.fog.color.copy(nightFog).lerp(dawnFog, rise);
    scene.background.copy(scene.fog.color);
    hemi.color.copy(nightHemi).lerp(dawnHemi, rise);
    hemi.intensity = 1.6 + rise * 1.2;
    moonlight.color.copy(nightMoon).lerp(dawnMoon, rise);
    moonlight.intensity = 2.2 + rise * 1.2;
    moon.material.color.setRGB(1.5 - rise, 1.65 - rise, 2 - rise);
    sun.position.y = -22 + rise * 30;
  }
  update(0, 0, 0);
  return { arenaRadius: 20, campfire, update };
}
