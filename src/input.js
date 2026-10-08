// Keyboard + gamepad input for two players. poll() once per frame.
const KEYS = [
  { up: ['KeyW'], down: ['KeyS'], left: ['KeyA'], right: ['KeyD'], dash: ['Space', 'ShiftLeft'] },
  { up: ['ArrowUp'], down: ['ArrowDown'], left: ['ArrowLeft'], right: ['ArrowRight'],
    dash: ['Enter', 'ShiftRight', 'Numpad0', 'NumpadEnter'] },
];

export function createInput() {
  const held = new Set();
  const pressed = new Set(); // went down since last poll
  const padPrev = [false, false];
  let startPressed = false;

  addEventListener('keydown', (e) => {
    if (e.code.startsWith('Arrow') || e.code === 'Space') e.preventDefault();
    if (!held.has(e.code)) pressed.add(e.code);
    held.add(e.code);
    if (e.code === 'Enter' || e.code === 'Space') startPressed = true;
  });
  addEventListener('keyup', (e) => held.delete(e.code));
  addEventListener('blur', () => held.clear());

  const any = (codes, set) => codes.some((c) => set.has(c));

  function poll() {
    const pads = navigator.getGamepads ? [...navigator.getGamepads()].filter(Boolean) : [];
    const out = KEYS.map((k, i) => {
      let x = (any(k.right, held) ? 1 : 0) - (any(k.left, held) ? 1 : 0);
      let z = (any(k.down, held) ? 1 : 0) - (any(k.up, held) ? 1 : 0);
      let dash = any(k.dash, pressed);
      const pad = pads[i];
      if (pad) {
        const ax = pad.axes[0] || 0, az = pad.axes[1] || 0;
        if (Math.hypot(ax, az) > 0.2) { x = ax; z = az; }
        const btn = !!(pad.buttons[0]?.pressed || pad.buttons[5]?.pressed);
        if (btn && !padPrev[i]) { dash = true; startPressed = true; }
        padPrev[i] = btn;
      }
      const len = Math.hypot(x, z);
      if (len > 1) { x /= len; z /= len; }
      return { x, z, dash };
    });
    pressed.clear();
    return out;
  }

  function anyStart() {
    const s = startPressed;
    startPressed = false;
    return s;
  }

  return { poll, anyStart };
}
