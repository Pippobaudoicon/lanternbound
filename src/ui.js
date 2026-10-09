export function createUI(root) {
  const lantern = '<span class="lantern" aria-hidden="true"><i></i></span>';
  const playerPanel = (index, name, color) => `<section class="player-panel" style="--player:${color}" data-player="${index}" aria-label="${name} health">
    ${lantern}<div class="player-detail"><div class="player-heading"><span class="eyebrow">P${index + 1}</span><strong class="player-name">${name}</strong></div>
    <div class="hearts" aria-label="5 of 5 hearts"></div><div class="revive" hidden><span>DOWN — revive me!</span><div class="meter"><i></i></div></div></div></section>`;
  root.innerHTML = `
    <div class="hud" hidden>
      ${playerPanel(0, 'Ember', '#ffa040')}
      <section class="watch-panel" aria-label="Campfire and wave status">
        <div class="watch-heading"><span class="ornament">✦</span><span class="wave">Wave 1 / 8</span><span class="ornament">✦</span></div>
        <div class="fire-label"><span>THE LAST CAMPFIRE</span><span class="fire-percent">100%</span></div>
        <div class="meter fire-meter" role="progressbar" aria-label="Campfire health" aria-valuemin="0" aria-valuemax="100"><i></i></div>
        <div class="score-row"><span><b class="score">0</b> <small>points</small></span><span class="combo" hidden></span></div>
      </section>
      ${playerPanel(1, 'Tide', '#40e0d0')}
      <div class="flare-panel"><div class="flare-label">✧ <span>FLARE</span> <small class="flare-status">Dash together</small></div><div class="meter flare-meter"><i></i></div></div>
      <div class="hud-hint">Keep your light connected <span>·</span> Guard the fire</div>
    </div>
    <div class="banner" hidden><div class="banner-rule">✦</div><h2></h2><p></p></div>
    <section class="screen title-screen" hidden aria-labelledby="game-title">
      <div class="title-content">
        <div class="chapter-label"><span></span> A COUCH CO-OP TALE <span></span></div>
        <div class="title-mark" aria-hidden="true"><span></span>✦<span></span></div>
        <h1 id="game-title">LANTERNBOUND</h1>
        <p class="tagline">Two lights. One long night. <em>Bring a friend.</em></p>
        <div class="couch-controls">
          <section class="spirit-control ember" style="--player:#ffa040">${lantern}<div><span class="eyebrow">PLAYER ONE</span><h2>Ember</h2><div class="key-row"><span class="movement-keys"><kbd>W</kbd><span><kbd>A</kbd><kbd>S</kbd><kbd>D</kbd></span></span><span class="key-caption">move</span><span class="key-divider"></span><kbd class="wide-key">Space</kbd><span class="key-caption">dash</span></div></div></section>
          <span class="couch-tether" aria-hidden="true">✧</span>
          <section class="spirit-control tide" style="--player:#40e0d0">${lantern}<div><span class="eyebrow">PLAYER TWO</span><h2>Tide</h2><div class="key-row"><span class="movement-keys"><kbd>↑</kbd><span><kbd>←</kbd><kbd>↓</kbd><kbd>→</kbd></span></span><span class="key-caption">move</span><span class="key-divider"></span><kbd class="wide-key">Enter</kbd><span class="key-caption">dash</span></div></div></section>
        </div>
        <p class="gamepad-note">or plug in two gamepads <span>·</span> left stick to move, A / Cross to dash</p>
        <div class="how-to"><div><span class="lesson-icon">⌁</span><p><strong>Your tether burns shadows</strong><span>Stay close, but spread out.</span></p></div><div><span class="lesson-icon">✷</span><p><strong>Dash together for a FLARE</strong><span>Two sparks. One brilliant burst.</span></p></div><div><span class="lesson-icon">♡</span><p><strong>No light left behind</strong><span>Stand by a fallen friend to revive.</span></p></div></div>
        <div class="play-choices" role="group" aria-label="Choose how to play">
          <button class="start-button" type="button">Play here together <span aria-hidden="true">↗</span></button>
          <p class="start-prompt">Press Enter / Space or <span class="gamepad-a">A</span> to begin</p>
          <div class="online-choices"><button class="host-button secondary-button" type="button">Host online</button><button class="join-reveal secondary-button" type="button" aria-expanded="false" aria-controls="join-form">Join a friend</button></div>
          <p class="online-note">Online: you're Ember, your friend is Tide</p>
          <form id="join-form" class="join-form" hidden><label class="eyebrow" for="room-input">YOUR FRIEND'S ROOM CODE</label><div><input id="room-input" name="code" placeholder="EMBER-42" maxlength="16" autocomplete="off" autocapitalize="characters" spellcheck="false" required><button class="join-button" type="submit">Join <span aria-hidden="true">↗</span></button></div></form>
        </div>
        <p class="title-footnote">DEFEND THE FIRE <span>✦</span> SURVIVE EIGHT WAVES <span>✦</span> WELCOME THE DAWN</p>
      </div>
    </section>
    <section class="screen end-screen" hidden aria-labelledby="end-title"><div class="end-content"><div class="chapter-label end-chapter"></div><div class="end-symbol" aria-hidden="true">☼</div><h1 id="end-title"></h1><p class="end-message"></p><div class="end-score"><span class="eyebrow">LIGHT GATHERED</span><strong></strong><span>points, together</span></div><p class="end-wave"></p><button class="restart-button" type="button">Play again <span aria-hidden="true">↻</span></button><p class="start-prompt">Press Enter to play again</p></div></section>
    <section class="screen lobby-screen" hidden role="dialog" aria-modal="true" aria-labelledby="lobby-title">
      <div class="lobby-card" tabindex="-1">
        <div class="chapter-label"><span></span> TWO LIGHTS, ONE NIGHT <span></span></div>
        <div class="title-mark" aria-hidden="true"><span></span>✦<span></span></div>
        <h2 id="lobby-title"></h2>
        <div class="room-share" hidden><span class="eyebrow">YOUR ROOM CODE</span><p class="room-code"></p><button class="copy-button secondary-button" type="button">Copy link</button></div>
        <div class="lobby-wait" hidden aria-hidden="true"><span style="--player:#ffa040">${lantern}</span><span style="--player:#40e0d0">${lantern}</span></div>
        <p class="lobby-message" role="status" aria-live="polite"></p>
        <button class="lobby-start" type="button" hidden>Start <span aria-hidden="true">↗</span></button>
        <p class="lobby-prompt start-prompt" hidden>Press <kbd class="wide-key">Enter</kbd> to begin</p>
        <button class="lobby-cancel text-button" type="button">Leave</button>
      </div>
    </section>
    <div class="net-status" hidden></div>
    <div class="float-layer" aria-hidden="true"></div>`;

  const find = (selector) => root.querySelector(selector);
  const hud = find('.hud');
  const titleScreen = find('.title-screen');
  const endScreen = find('.end-screen');
  const bannerElement = find('.banner');
  const bannerTitle = find('.banner h2');
  const bannerSubtitle = find('.banner p');
  const floatLayer = find('.float-layer');
  const wave = find('.wave');
  const score = find('.score');
  const combo = find('.combo');
  const fireMeter = find('.fire-meter');
  const fireFill = find('.fire-meter i');
  const firePercent = find('.fire-percent');
  const watchPanel = find('.watch-panel');
  const flarePanel = find('.flare-panel');
  const flareFill = find('.flare-meter i');
  const flareStatus = find('.flare-status');
  const startButton = find('.start-button');
  const restartButton = find('.restart-button');
  const joinForm = find('.join-form');
  const joinInput = find('#room-input');
  const joinReveal = find('.join-reveal');
  const lobbyScreen = find('.lobby-screen');
  const lobbyTitle = find('#lobby-title');
  const lobbyMessage = find('.lobby-message');
  const roomShare = find('.room-share');
  const roomCode = find('.room-code');
  const copyButton = find('.copy-button');
  const lobbyWait = find('.lobby-wait');
  const lobbyStart = find('.lobby-start');
  const lobbyPrompt = find('.lobby-prompt');
  const lobbyCancel = find('.lobby-cancel');
  const netStatus = find('.net-status');
  const endTitle = find('#end-title');
  const endMessage = find('.end-message');
  const endScore = find('.end-score strong');
  const endWave = find('.end-wave');
  const endChapter = find('.end-chapter');
  const endSymbol = find('.end-symbol');
  const panels = [...root.querySelectorAll('.player-panel')].map((element) => ({
    element, name: element.querySelector('.player-name'), hearts: element.querySelector('.hearts'),
    revive: element.querySelector('.revive'), fill: element.querySelector('.revive i'), pips: [], last: {},
  }));
  const last = {};
  let bannerTimer;
  let titleActions;
  let lobbyActions;
  let lobbyState;
  let copyTimer;
  let netText = null;
  let restartAction;
  let activeFloats = 0;
  startButton.onclick = () => { const action = titleActions?.couch; titleActions = null; action?.(); };
  find('.host-button').onclick = () => titleActions?.host();
  joinReveal.onclick = () => {
    joinForm.hidden = false;
    joinReveal.setAttribute('aria-expanded', 'true');
    joinInput.focus();
  };
  joinInput.oninput = () => { joinInput.value = joinInput.value.toUpperCase(); };
  joinInput.onkeydown = (event) => {
    event.stopPropagation();
    if (event.key === 'Enter') { event.preventDefault(); joinForm.requestSubmit(); }
  };
  joinInput.onkeyup = (event) => event.stopPropagation();
  joinForm.onsubmit = (event) => {
    event.preventDefault();
    const code = joinInput.value.trim().toUpperCase();
    if (code) titleActions?.join(code);
  };
  for (const button of [find('.host-button'), joinReveal, find('.join-button'), copyButton, lobbyCancel]) {
    button.onkeydown = (event) => event.stopPropagation();
    button.onkeyup = (event) => event.stopPropagation();
  }
  lobbyStart.onclick = () => lobbyActions?.start();
  lobbyCancel.onclick = () => lobbyActions?.cancel();
  copyButton.onclick = async () => {
    await navigator.clipboard.writeText(lobbyState.link);
    copyButton.textContent = 'Copied!';
    clearTimeout(copyTimer);
    copyTimer = setTimeout(() => { copyButton.textContent = 'Copy link'; }, 1500);
  };
  restartButton.onclick = () => { const action = restartAction; restartAction = null; action?.(); };
  floatLayer.addEventListener('animationend', (event) => {
    if (event.target.classList.contains('float')) { event.target.remove(); activeFloats--; }
  });

  return {
    showTitle(actions) {
      titleActions = actions;
      titleScreen.hidden = false;
      hud.hidden = true;
      joinForm.hidden = true;
      joinReveal.setAttribute('aria-expanded', 'false');
      joinInput.value = '';
    },
    hideTitle() { titleScreen.hidden = true; titleActions = null; },
    showLobby(state, actions) {
      lobbyActions = actions;
      lobbyState = state;
      const entering = lobbyScreen.hidden;
      const host = state.role === 'host';
      const ready = state.status === 'ready';
      const error = state.status === 'error';
      const waiting = state.status === 'waiting';
      const heading = error ? 'The path went dark' : host ? 'Invite a light' : 'Join the night';
      const message = error ? state.message : host && ready ? 'Your friend is here!' : ready ? 'Connected — waiting for the host to light the night…' : waiting ? 'Waiting for your friend…' : 'Finding the fire…';
      if (lobbyTitle.textContent !== heading) lobbyTitle.textContent = heading;
      if (lobbyMessage.textContent !== message) lobbyMessage.textContent = message;
      if (roomCode.textContent !== state.code) roomCode.textContent = state.code || '';
      roomShare.hidden = !host || error || state.status === 'connecting';
      lobbyWait.hidden = error || ready;
      lobbyStart.hidden = !host || !ready;
      lobbyPrompt.hidden = !host || !ready;
      lobbyCancel.textContent = error ? 'Back' : 'Leave';
      lobbyScreen.hidden = false;
      titleScreen.hidden = true;
      hud.hidden = true;
      if (entering) find('.lobby-card').focus();
    },
    hideLobby() {
      lobbyScreen.hidden = true;
      lobbyActions = null;
      lobbyState = null;
      clearTimeout(copyTimer);
      copyButton.textContent = 'Copy link';
    },
    setNetStatus(text) {
      if (text === netText) return;
      netText = text;
      netStatus.textContent = text || '';
      netStatus.hidden = text === null;
    },
    update(h) {
      if (hud.hidden && titleScreen.hidden && endScreen.hidden && lobbyScreen.hidden) hud.hidden = false;
      for (let i = 0; i < panels.length; i++) {
        const p = h.players[i];
        const panel = panels[i];
        const prev = panel.last;
        if (prev.name !== p.name) { panel.name.textContent = p.name; prev.name = p.name; }
        if (prev.color !== p.color) { panel.element.style.setProperty('--player', p.color); prev.color = p.color; }
        const rebuilt = prev.maxHp !== p.maxHp;
        if (rebuilt) {
          panel.hearts.replaceChildren();
          panel.pips.length = 0;
          for (let j = 0; j < p.maxHp; j++) {
            const pip = document.createElement('span');
            pip.className = 'heart'; pip.textContent = '♥';
            panel.hearts.appendChild(pip); panel.pips.push(pip);
          }
          prev.maxHp = p.maxHp;
        }
        if (rebuilt || prev.hp !== p.hp) {
          for (let j = 0; j < panel.pips.length; j++) {
            const pip = panel.pips[j];
            pip.classList.toggle('empty', j >= p.hp);
            pip.classList.toggle('lost', prev.hp !== undefined && j >= p.hp && j < prev.hp);
          }
          panel.hearts.setAttribute('aria-label', `${p.hp} of ${p.maxHp} hearts`);
          prev.hp = p.hp;
        }
        if (prev.downed !== p.downed) {
          panel.element.classList.toggle('downed', p.downed);
          panel.revive.hidden = !p.downed;
          panel.hearts.hidden = p.downed;
          prev.downed = p.downed;
        }
        const revive = Math.round(Math.max(0, Math.min(1, p.reviveProgress)) * 100);
        if (prev.revive !== revive) { panel.fill.style.transform = `scaleX(${revive / 100})`; prev.revive = revive; }
      }
      if (last.wave !== h.wave || last.total !== h.totalWaves) {
        wave.textContent = `Wave ${h.wave} / ${h.totalWaves}`; last.wave = h.wave; last.total = h.totalWaves;
      }
      if (last.score !== h.score) { score.textContent = h.score.toLocaleString(); last.score = h.score; }
      if (last.combo !== h.combo) { combo.hidden = h.combo <= 1; combo.textContent = `×${h.combo} combo`; last.combo = h.combo; }
      const fire = Math.round(Math.max(0, Math.min(1, h.fireHealth)) * 100);
      if (last.fire !== fire) {
        fireFill.style.transform = `scaleX(${fire / 100})`; firePercent.textContent = `${fire}%`;
        fireMeter.setAttribute('aria-valuenow', fire); watchPanel.classList.toggle('low-fire', fire <= 25); last.fire = fire;
      }
      const flare = Math.round(Math.max(0, Math.min(1, h.flareReady)) * 100);
      const ready = h.flareReady >= 1;
      if (last.flare !== flare) { flareFill.style.transform = `scaleX(${flare / 100})`; last.flare = flare; }
      if (last.ready !== ready) {
        flarePanel.classList.toggle('ready', ready); flareStatus.textContent = ready ? 'READY — dash together!' : 'Gathering light'; last.ready = ready;
      }
    },
    banner(title, subtitle = '') {
      clearTimeout(bannerTimer);
      bannerTitle.textContent = title;
      bannerSubtitle.textContent = subtitle;
      bannerElement.hidden = false;
      bannerElement.getAnimations().forEach((animation) => animation.cancel());
      bannerElement.animate([
        { opacity: 0, transform: 'translateY(16px)' },
        { opacity: 1, transform: 'translateY(0)', offset: 0.18 },
        { opacity: 1, transform: 'translateY(0)', offset: 0.76 },
        { opacity: 0, transform: 'translateY(-12px)' },
      ], { duration: 2500, easing: 'ease', fill: 'forwards' });
      bannerTimer = setTimeout(() => { bannerElement.hidden = true; }, 2500);
    },
    floatText(x, y, text, color) {
      if (activeFloats >= 48) return;
      const el = document.createElement('div');
      el.className = 'float'; el.textContent = text;
      el.style.left = `${x}px`; el.style.top = `${y}px`; el.style.color = color;
      floatLayer.appendChild(el); activeFloats++;
    },
    showEnd({ victory, score, wave }, onRestart) {
      restartAction = onRestart;
      hud.hidden = true; bannerElement.hidden = true; clearTimeout(bannerTimer);
      endScreen.classList.toggle('victory', victory);
      endScreen.hidden = false;
      endTitle.textContent = victory ? 'Dawn breaks' : 'The fire went out';
      endMessage.textContent = victory ? 'You kept the fire alive together.' : 'Even the smallest light was worth protecting.';
      endChapter.textContent = victory ? 'AND THE WORLD WAS WARM AGAIN' : 'THE NIGHT WILL REMEMBER';
      endSymbol.textContent = victory ? '☼' : '✧';
      endScore.textContent = score.toLocaleString();
      endWave.textContent = victory ? 'Eight waves. Two spirits. One unbroken bond.' : `Wave ${wave} · A new night awaits`;
    },
    hideEnd() { endScreen.hidden = true; restartAction = null; },
  };
}
