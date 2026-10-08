// GREYBOX STUB — to be replaced by the audio worker. Keep the contract in CONTRACT.md.
let ctx = null;
function beep(freq, dur = 0.08, type = 'square', vol = 0.05) {
  if (!ctx) return;
  const o = ctx.createOscillator(), g = ctx.createGain();
  o.type = type; o.frequency.value = freq;
  g.gain.setValueAtTime(vol, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + dur);
  o.connect(g).connect(ctx.destination);
  o.start(); o.stop(ctx.currentTime + dur);
}
const SFX = { dash: 600, flare: 200, enemyDie: 300, playerHurt: 120, revive: 880, pickup: 1200, waveStart: 440 };
export const audio = {
  init() { if (!ctx) ctx = new AudioContext(); if (ctx.state === 'suspended') ctx.resume(); },
  play(name) { if (SFX[name]) beep(SFX[name]); },
  setTether() {}, setIntensity() {}, startMusic() {}, stopMusic() {},
};
