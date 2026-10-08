// GREYBOX STUB — to be replaced by the ui worker. Keep the contract in CONTRACT.md.
export function createUI(root) {
  root.innerHTML = `<div class="hud"><div id="hud-l"></div><div id="hud-c"></div><div id="hud-r"></div></div>
    <div class="banner" id="banner"></div><div class="screen" id="title" hidden></div><div class="screen" id="end" hidden></div>`;
  const $ = (id) => root.querySelector('#' + id);
  let bannerTimer;
  const hearts = (p) => p.downed ? `DOWN ${Math.round(p.reviveProgress * 100)}%` : '♥'.repeat(p.hp) + '♡'.repeat(p.maxHp - p.hp);
  return {
    showTitle(onStart) {
      $('title').hidden = false;
      $('title').innerHTML = `<div><h1>LANTERNBOUND</h1><p>P1: WASD + Space · P2: Arrows + Enter</p><button>Start (Enter)</button></div>`;
      $('title').querySelector('button').onclick = onStart;
    },
    hideTitle() { $('title').hidden = true; },
    update(h) {
      $('hud-l').innerHTML = `<span style="color:${h.players[0].color}">${h.players[0].name} ${hearts(h.players[0])}</span>`;
      $('hud-r').innerHTML = `<span style="color:${h.players[1].color}">${h.players[1].name} ${hearts(h.players[1])}</span>`;
      $('hud-c').textContent = `Wave ${h.wave}/${h.totalWaves} · Fire ${Math.round(h.fireHealth * 100)}% · ${h.score} pts${h.combo > 1 ? ' x' + h.combo : ''} · Flare ${h.flareReady >= 1 ? 'READY' : Math.round(h.flareReady * 100) + '%'}`;
    },
    banner(title, sub = '') {
      $('banner').innerHTML = `${title}<div style="font-size:18px">${sub}</div>`;
      $('banner').style.opacity = 1;
      clearTimeout(bannerTimer);
      bannerTimer = setTimeout(() => ($('banner').style.opacity = 0), 2500);
    },
    floatText(x, y, text, color) {
      const el = document.createElement('div');
      el.className = 'float'; el.textContent = text; el.style.cssText = `left:${x}px;top:${y}px;color:${color}`;
      root.appendChild(el);
      requestAnimationFrame(() => { el.style.transform = 'translateY(-40px)'; el.style.opacity = 0; });
      setTimeout(() => el.remove(), 1000);
    },
    showEnd({ victory, score, wave }, onRestart) {
      $('end').hidden = false;
      $('end').innerHTML = `<div><h1>${victory ? 'DAWN BREAKS' : 'THE FIRE IS OUT'}</h1><p>Score ${score} · Wave ${wave}</p><button>Play again (Enter)</button></div>`;
      $('end').querySelector('button').onclick = onRestart;
    },
    hideEnd() { $('end').hidden = true; },
  };
}
