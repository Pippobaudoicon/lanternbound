// Lanternbound audio — everything synthesized with WebAudio, no samples.
// Bus layout: voices -> sfx / music / hum -> master -> compressor -> out,
// plus a shared convolver reverb fed by per-voice "wet" sends.

const BPM = 84;
const STEP = 60 / BPM / 4; // one 16th note
const LOOKAHEAD = 0.2;

const mtof = (m) => 440 * 2 ** ((m - 69) / 12);
const rand = (a, b) => a + Math.random() * (b - a);
const pick = (arr) => arr[Math.floor(Math.random() * arr.length)];
const clamp01 = (x) => (x < 0 ? 0 : x > 1 ? 1 : x);
const ramp = (a, b, x) => clamp01((x - a) / (b - a));

// D minor pentatonic (enemy / pickup sparkle) and D major pentatonic (triumph)
const MINOR_PENT = [74, 77, 79, 81, 84, 86, 89, 91, 93, 96];
const MAJOR_PENT = [74, 76, 78, 81, 83, 86, 88, 90, 93, 95, 98];

// --- music data: 8 bars, chords repeat every 4 (Dm | Bb | F | C) --------------
const CHORDS = [
  [50, 57, 60, 64], // Dm9
  [46, 53, 57, 62], // Bbmaj7
  [53, 57, 60, 64], // Fmaj7
  [48, 55, 59, 64], // Cmaj7
];
const ROOTS = [38, 34, 41, 36];
const MELODY = [ // eight 8th-note slots per bar, 0 = rest
  [74, 0, 77, 0, 81, 0, 79, 77],
  [82, 0, 81, 0, 77, 0, 74, 0],
  [77, 0, 81, 0, 84, 0, 81, 79],
  [79, 0, 76, 0, 72, 0, 76, 79],
  [81, 0, 79, 0, 77, 0, 74, 0],
  [74, 0, 77, 0, 82, 0, 81, 77],
  [84, 0, 81, 0, 77, 0, 81, 0],
  [79, 0, 0, 76, 0, 72, 0, 0],
];
const OSTINATO = [0, 12, 0, 12, 7, 12, 0, 13, 0, 12, 0, 12, 7, 12, 6, 7];

let ctx = null;
let sfx, musicBus, reverbIn, noiseBuf;
let hum = null;
let music = null;
let intensity = 0;
let tether = 0;
const lastPlayed = {};

function init() {
  if (ctx) {
    if (ctx.state === 'suspended') ctx.resume();
    return;
  }
  const AC = window.AudioContext || window.webkitAudioContext;
  if (!AC) return;
  ctx = new AC();

  const comp = ctx.createDynamicsCompressor();
  comp.threshold.value = -18;
  comp.knee.value = 24;
  comp.ratio.value = 3;
  comp.attack.value = 0.01;
  comp.release.value = 0.25;
  comp.connect(ctx.destination);
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp);

  sfx = ctx.createGain();
  sfx.gain.value = 0.9;
  sfx.connect(master);
  musicBus = ctx.createGain();
  musicBus.gain.value = 0.55;
  musicBus.connect(master);

  // reverb: stereo decaying noise, darker as it fades
  const len = Math.floor(ctx.sampleRate * 2.8);
  const ir = ctx.createBuffer(2, len, ctx.sampleRate);
  for (let c = 0; c < 2; c++) {
    const d = ir.getChannelData(c);
    let lp = 0;
    for (let i = 0; i < len; i++) {
      const x = i / len;
      lp += (Math.random() * 2 - 1 - lp) * (0.7 - 0.55 * x);
      d[i] = lp * (1 - x) ** 2.5;
    }
  }
  const verb = ctx.createConvolver();
  verb.buffer = ir;
  const verbOut = ctx.createGain();
  verbOut.gain.value = 0.7;
  reverbIn = ctx.createGain();
  reverbIn.connect(verb);
  verb.connect(verbOut);
  verbOut.connect(master);

  noiseBuf = ctx.createBuffer(1, ctx.sampleRate * 3, ctx.sampleRate);
  const nd = noiseBuf.getChannelData(0);
  for (let i = 0; i < nd.length; i++) nd[i] = Math.random() * 2 - 1;

  initHum(master);
  setTether(tether, true);
}

// --- voice helpers -----------------------------------------------------------

function route(node, dest, wet) {
  node.connect(dest);
  if (wet > 0) {
    const send = ctx.createGain();
    send.gain.value = wet;
    node.connect(send);
    send.connect(reverbIn);
  }
}

function envelope(param, t, vol, attack, decay) {
  param.setValueAtTime(0.0001, t);
  param.linearRampToValueAtTime(vol, t + attack);
  param.exponentialRampToValueAtTime(0.0001, t + attack + decay);
}

function tone(type, f0, t, { dur = 0.3, vol = 0.1, attack = 0.005, f1 = 0, detune = 0, dest = sfx, wet = 0 } = {}) {
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type;
  o.detune.value = detune;
  o.frequency.setValueAtTime(f0, t);
  if (f1) o.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  envelope(g.gain, t, vol, attack, dur);
  o.connect(g);
  route(g, dest, wet);
  o.start(t);
  o.stop(t + attack + dur + 0.05);
}

function noise(t, { dur = 0.2, type = 'bandpass', f0 = 1000, f1 = 0, q = 1, vol = 0.1, attack = 0.005, dest = sfx, wet = 0 } = {}) {
  const src = ctx.createBufferSource(), f = ctx.createBiquadFilter(), g = ctx.createGain();
  src.buffer = noiseBuf;
  f.type = type;
  f.Q.value = q;
  f.frequency.setValueAtTime(f0, t);
  if (f1) f.frequency.exponentialRampToValueAtTime(f1, t + attack + dur);
  envelope(g.gain, t, vol, attack, dur);
  src.connect(f);
  f.connect(g);
  route(g, dest, wet);
  src.start(t, rand(0, 3 - dur - 0.1));
  src.stop(t + attack + dur + 0.05);
}

// inharmonic glassy partials: music box / chime / bell
const PARTIALS = [1, 2.76, 5.4];
const PARTIAL_AMP = [1, 0.3, 0.08];
const PARTIAL_DECAY = [1, 0.45, 0.2];
function bell(freq, t, vol, decay, dest = sfx, wet = 0) {
  const mix = ctx.createGain();
  for (let i = 0; i < 3; i++) {
    const o = ctx.createOscillator(), g = ctx.createGain();
    const d = decay * PARTIAL_DECAY[i];
    o.frequency.value = freq * PARTIALS[i];
    envelope(g.gain, t, vol * PARTIAL_AMP[i], 0.003, d);
    o.connect(g);
    g.connect(mix);
    o.start(t);
    o.stop(t + d + 0.1);
  }
  route(mix, dest, wet);
}

// warm sine+triangle chord, notes optionally staggered
function softChord(notes, t, { vol = 0.06, attack = 0.04, decay = 1.8, stagger = 0, wet = 0.6 } = {}) {
  notes.forEach((m, i) => {
    const f = mtof(m), ti = t + i * stagger;
    tone('sine', f, ti, { vol, attack, dur: decay, wet });
    tone('triangle', f, ti, { vol: vol * 0.5, attack, dur: decay, detune: 6, wet });
  });
}

function brass(freq, t, dur, vol) {
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(2400, t + 0.12);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(vol, t + 0.04);
  g.gain.setValueAtTime(vol, t + dur);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur + 0.5);
  for (const detune of [-8, 8]) {
    const o = ctx.createOscillator();
    o.type = 'sawtooth';
    o.frequency.value = freq;
    o.detune.value = detune;
    o.connect(f);
    o.start(t);
    o.stop(t + dur + 0.55);
  }
  f.connect(g);
  route(g, sfx, 0.4);
}

function sparkles(t, count, span, notes, vol, wet = 0.7) {
  for (let i = 0; i < count; i++) {
    bell(mtof(pick(notes)), t + rand(0, span), vol, 0.9, sfx, wet);
  }
}

// --- one-shots ---------------------------------------------------------------

const SFX = {
  dash(t) {
    noise(t, { dur: 0.22, f0: 500, f1: 3500, q: 1.5, vol: 0.12, attack: 0.04, wet: 0.3 });
    tone('sine', 400, t, { f1: 900, dur: 0.18, vol: 0.03, attack: 0.03 });
  },
  flare(t) {
    softChord([50, 62, 69, 74, 78, 81, 86], t, { vol: 0.05, attack: 0.22, decay: 1.8 });
    tone('sine', 120, t, { f1: 34, dur: 0.55, vol: 0.4, attack: 0.003 });
    noise(t, { dur: 0.5, type: 'lowpass', f0: 3000, f1: 200, vol: 0.18, attack: 0.01, wet: 0.3 });
    for (let i = 0; i < 8; i++) {
      bell(mtof(pick(MAJOR_PENT) + 12), t + 0.12 + i * 0.06 + rand(0, 0.04), 0.025, 0.9, sfx, 0.7);
    }
  },
  hit(t) {
    tone('triangle', 700 * rand(0.95, 1.05), t, { f1: 450, dur: 0.05, vol: 0.08 });
    noise(t, { dur: 0.02, type: 'highpass', f0: 4000, vol: 0.04, attack: 0.001 });
  },
  enemyDie(t) {
    const f = mtof(pick(MINOR_PENT)) * 2 ** (rand(-15, 15) / 1200);
    bell(f, t, 0.07, 0.4, sfx, 0.4);
    tone('sine', 600, t, { f1: 200, dur: 0.06, vol: 0.05 });
  },
  bossDie(t) {
    tone('sine', 90, t, { f1: 28, dur: 1.4, vol: 0.5, attack: 0.005 });
    noise(t, { dur: 1.6, type: 'lowpass', f0: 3000, f1: 100, vol: 0.25, attack: 0.01, wet: 0.4 });
    for (let i = 0; i < 9; i++) {
      const f = mtof(MAJOR_PENT[MAJOR_PENT.length - 1 - i] + 12);
      const ti = t + 0.1 + i * 0.12;
      bell(f, ti, 0.05, 1.2, sfx, 0.7);
      tone('triangle', f, ti, { vol: 0.02, dur: 0.9, wet: 0.7 });
    }
  },
  playerHurt(t) {
    tone('sine', 140, t, { f1: 50, dur: 0.18, vol: 0.4 });
    noise(t, { dur: 0.1, type: 'lowpass', f0: 400, vol: 0.15 });
    tone('triangle', 520, t + 0.04, { f1: 260, dur: 0.2, vol: 0.1 });
  },
  down(t) {
    [69, 65, 62].forEach((m, i) => softChord([m], t + i * 0.28, { vol: 0.09, decay: 0.7, wet: 0.5 }));
  },
  revive(t) {
    [62, 66, 69, 74, 78, 81, 86].forEach((m, i) => {
      const ti = t + i * 0.07;
      tone('sine', mtof(m), ti, { vol: 0.07, dur: 0.5, wet: 0.5 });
      tone('triangle', mtof(m + 12), ti, { vol: 0.03, dur: 0.4, wet: 0.5 });
    });
    sparkles(t + 0.4, 5, 0.4, MAJOR_PENT, 0.025);
  },
  waveStart(t) {
    // gong partials + a low horn
    [1, 2.76, 5.4].forEach((p, i) => {
      tone('sine', 73.4 * p, t, { vol: [0.2, 0.08, 0.03][i], dur: 2.5 / (1 + i), attack: 0.004, wet: 0.5 });
    });
    const f = ctx.createBiquadFilter(), g = ctx.createGain();
    f.type = 'lowpass';
    f.frequency.value = 500;
    envelope(g.gain, t, 0.07, 0.3, 1.2);
    for (const detune of [-6, 6]) {
      const o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.value = 146.8;
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + 1.6);
    }
    f.connect(g);
    route(g, sfx, 0.4);
  },
  waveClear(t) {
    softChord([62, 66, 69, 74, 78], t, { vol: 0.07, attack: 0.03, decay: 1.8, stagger: 0.06 });
  },
  pickup(t) {
    bell(mtof(86), t, 0.08, 0.5, sfx, 0.4);
    bell(mtof(93), t + 0.07, 0.08, 0.6, sfx, 0.4);
  },
  fireHurt(t) {
    tone('sine', 90, t, { f1: 60, dur: 0.15, vol: 0.2 });
    for (let i = 0; i < 7; i++) {
      noise(t + rand(0, 0.25), { dur: rand(0.02, 0.05), type: 'bandpass', f0: rand(1500, 4000), q: 2, vol: 0.1, attack: 0.001 });
    }
  },
  gameOver(t) {
    // Gm -> A -> Dm, slow
    softChord([55, 62, 67, 70], t, { vol: 0.06, attack: 0.08, decay: 1.6 });
    softChord([57, 64, 69, 73], t + 0.9, { vol: 0.06, attack: 0.08, decay: 1.6 });
    softChord([38, 50, 57, 62, 65, 69], t + 1.8, { vol: 0.06, attack: 0.1, decay: 3.2 });
  },
  victory(t) {
    [[62, 0], [66, 0.14], [69, 0.28], [74, 0.42], [78, 0.56], [81, 0.7]].forEach(([m, dt]) => {
      brass(mtof(m), t + dt, 0.12, 0.06);
    });
    const tf = t + 0.9;
    for (const m of [50, 62, 66, 69, 74]) brass(mtof(m), tf, 1.6, 0.05);
    softChord([74, 78, 81, 86], tf, { vol: 0.05, attack: 0.1, decay: 3, wet: 0.7 });
    // sunrise shimmer: bells climbing through the major pentatonic
    for (let i = 0; i < 14; i++) {
      bell(mtof(MAJOR_PENT[Math.min(i >> 1, MAJOR_PENT.length - 1)] + 12), tf + i * 0.17 + rand(0, 0.08), 0.03, 1.1, sfx, 0.7);
    }
    noise(tf, { dur: 2.5, type: 'highpass', f0: 3000, vol: 0.03, attack: 1.8, wet: 0.5 });
  },
  uiSelect(t) {
    tone('sine', 1200, t, { f1: 800, dur: 0.04, vol: 0.06, attack: 0.001 });
    noise(t, { dur: 0.015, type: 'highpass', f0: 5000, vol: 0.03, attack: 0.001 });
  },
  uiStart(t) {
    [74, 81, 86].forEach((m, i) => bell(mtof(m), t + i * 0.09, 0.08, 0.9, sfx, 0.5));
  },
};

const MIN_GAP = { enemyDie: 0.04, hit: 0.04, fireHurt: 0.04 };

function play(name) {
  if (!ctx || !Object.hasOwn(SFX, name)) return;
  const now = ctx.currentTime;
  if (MIN_GAP[name] && now - (lastPlayed[name] ?? -1) < MIN_GAP[name]) return;
  lastPlayed[name] = now;
  SFX[name](now + 0.005);
}

// --- tether hum --------------------------------------------------------------

function initHum(master) {
  const filter = ctx.createBiquadFilter(), gain = ctx.createGain();
  filter.type = 'lowpass';
  filter.frequency.value = 180;
  gain.gain.value = 0;
  const o1 = ctx.createOscillator(), o2 = ctx.createOscillator(), g2 = ctx.createGain();
  o1.type = 'sine';
  o2.type = 'sawtooth';
  o2.detune.value = 9;
  g2.gain.value = 0.4;
  o1.connect(filter);
  o2.connect(g2);
  g2.connect(filter);
  // slow filter wobble so the hum breathes
  const lfo = ctx.createOscillator(), lfoGain = ctx.createGain();
  lfo.frequency.value = 0.35;
  lfoGain.gain.value = 40;
  lfo.connect(lfoGain);
  lfoGain.connect(filter.frequency);
  filter.connect(gain);
  gain.connect(master);
  const send = ctx.createGain();
  send.gain.value = 0.3;
  gain.connect(send);
  send.connect(reverbIn);
  for (const o of [o1, o2, lfo]) o.start();
  hum = { gain, filter, o1, o2 };
}

let appliedTether = -1;
function setTether(strength, force = false) {
  tether = clamp01(+strength || 0);
  if (!hum || (!force && Math.abs(tether - appliedTether) < 0.004)) return;
  appliedTether = tether;
  const t = ctx.currentTime;
  hum.gain.gain.setTargetAtTime(0.09 * tether, t, 0.15);
  hum.filter.frequency.setTargetAtTime(180 + 1400 * tether, t, 0.15);
  hum.o1.frequency.setTargetAtTime(140 + 12 * tether, t, 0.2);
  hum.o2.frequency.setTargetAtTime(140 + 12 * tether, t, 0.2);
}

// --- music -------------------------------------------------------------------

function levels(i) {
  return { pad: 1, melody: 1, bass: ramp(0.2, 0.45, i), perc: ramp(0.55, 0.75, i), ost: ramp(0.85, 0.98, i) };
}

function makeLayer(out, wet) {
  const g = ctx.createGain();
  g.connect(out);
  const send = ctx.createGain();
  send.gain.value = wet;
  g.connect(send);
  send.connect(reverbIn);
  return g;
}

function padChord(dest, notes, t) {
  const bar = STEP * 16;
  const f = ctx.createBiquadFilter(), g = ctx.createGain();
  f.type = 'lowpass';
  f.frequency.setValueAtTime(500, t);
  f.frequency.linearRampToValueAtTime(1200, t + bar * 0.5);
  f.frequency.linearRampToValueAtTime(600, t + bar + 0.9);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(0.045, t + 0.9);
  g.gain.setValueAtTime(0.045, t + bar);
  g.gain.linearRampToValueAtTime(0.0001, t + bar + 0.9);
  for (const m of notes) {
    for (const detune of [-8, 8]) {
      const o = ctx.createOscillator();
      o.type = 'triangle';
      o.frequency.value = mtof(m);
      o.detune.value = detune;
      o.connect(f);
      o.start(t);
      o.stop(t + bar + 1);
    }
  }
  f.connect(g);
  g.connect(dest);
}

function scheduleStep(m, step, t) {
  const bar = step >> 4, s = step & 15, chord = bar & 3, L = m.lvl, ly = m.layers;

  if (s === 0) padChord(ly.pad, CHORDS[chord], t);

  const note = (s & 1) ? 0 : MELODY[bar][s >> 1];
  if (note) bell(mtof(note), t + rand(0, 0.012), rand(0.05, 0.07), 1.6, ly.melody);

  if (L.bass > 0.02 && (s === 0 || s === 8 || s === 11)) {
    const root = ROOTS[chord] + (s === 11 ? 7 : 0);
    tone('triangle', mtof(root), t, { vol: 0.22, attack: 0.01, dur: 0.45, dest: ly.bass });
  }

  if (L.perc > 0.02) {
    if (s === 0 || s === 3 || s === 8 || s === 11) {
      const vol = (s === 0 || s === 8) ? 0.22 : 0.14;
      tone('sine', 70, t, { f1: 38, dur: 0.18, vol, attack: 0.005, dest: ly.perc });
    }
    if (s === 2 || s === 6 || s === 10 || s === 14) {
      noise(t, { dur: 0.04, type: 'highpass', f0: 7000, vol: 0.05, attack: 0.001, dest: ly.perc });
    }
  }

  if (L.ost > 0.02) {
    const o = ctx.createOscillator(), f = ctx.createBiquadFilter(), g = ctx.createGain();
    o.type = 'sawtooth';
    o.frequency.value = mtof(ROOTS[chord] + 12 + OSTINATO[s]);
    f.type = 'lowpass';
    f.frequency.setValueAtTime(1100, t);
    f.frequency.exponentialRampToValueAtTime(300, t + 0.14);
    envelope(g.gain, t, (s & 3) ? 0.04 : 0.07, 0.003, 0.14);
    o.connect(f);
    f.connect(g);
    g.connect(ly.ost);
    o.start(t);
    o.stop(t + 0.2);
  }
}

function tick(m) {
  const now = ctx.currentTime;
  if (m.next < now) m.next = now + 0.05; // woke up from a stalled tab
  while (m.next < now + LOOKAHEAD) {
    scheduleStep(m, m.step, m.next);
    m.next += STEP;
    m.step = (m.step + 1) % 128;
  }
}

function startMusic() {
  if (!ctx || music) return;
  const now = ctx.currentTime;
  const out = ctx.createGain();
  out.gain.setValueAtTime(0.0001, now);
  out.gain.linearRampToValueAtTime(1, now + 1.2);
  out.connect(musicBus);

  const lvl = levels(intensity);
  const layers = {
    pad: makeLayer(out, 0.5),
    melody: makeLayer(out, 0.5),
    bass: makeLayer(out, 0.1),
    perc: makeLayer(out, 0.15),
    ost: makeLayer(out, 0.25),
  };
  for (const k in layers) layers[k].gain.value = lvl[k];

  // dotted-eighth echo on the melody
  const echo = ctx.createDelay(1), fb = ctx.createGain(), lp = ctx.createBiquadFilter(), echoOut = ctx.createGain();
  echo.delayTime.value = STEP * 3;
  fb.gain.value = 0.32;
  lp.type = 'lowpass';
  lp.frequency.value = 2200;
  echoOut.gain.value = 0.35;
  layers.melody.connect(echo);
  echo.connect(lp);
  lp.connect(fb);
  fb.connect(echo);
  lp.connect(echoOut);
  echoOut.connect(out);

  const m = { out, layers, lvl, step: 0, next: now + 0.1, timer: 0 };
  m.timer = setInterval(() => tick(m), 25);
  music = m;
  tick(m);
}

function stopMusic() {
  if (!music) return;
  const m = music, now = ctx.currentTime;
  music = null;
  clearInterval(m.timer);
  m.out.gain.cancelScheduledValues(now);
  m.out.gain.setValueAtTime(m.out.gain.value, now);
  m.out.gain.linearRampToValueAtTime(0.0001, now + 1);
  setTimeout(() => m.out.disconnect(), 1300);
}

function setIntensity(f) {
  intensity = clamp01(+f || 0);
  if (!music) return;
  music.lvl = levels(intensity);
  const now = ctx.currentTime;
  for (const k in music.layers) music.layers[k].gain.setTargetAtTime(music.lvl[k], now, 0.5);
}

export const audio = { init, play, setTether, setIntensity, startMusic, stopMusic };
