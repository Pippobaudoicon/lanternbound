const words = ['EMBER', 'MOSS', 'FERN', 'OWL', 'MOTH', 'PINE', 'BRAMBLE', 'WILLOW', 'CINDER', 'HEARTH'];
const reasons = {
  4001: 'That room is already hosted',
  4003: 'That room is full',
  4004: 'No game with that code',
};

export function makeRoomCode() {
  return `${words[Math.floor(Math.random() * words.length)]}-${String(Math.floor(Math.random() * 100)).padStart(2, '0')}`;
}

export function createNet() {
  let socket = null;
  let latency = 0;
  let messageHandler = () => {};
  let peerHandler = () => {};
  let closeHandler = () => {};
  let stop = () => {};

  const net = {
    connect(code, role) {
      net.close();
      latency = 0;
      return new Promise((resolve, reject) => {
        const protocol = location.protocol === 'https:' ? 'wss' : 'ws';
        let ws;
        try {
          ws = new WebSocket(`${protocol}://${location.host}/ws/${encodeURIComponent(code.trim().toUpperCase())}?role=${encodeURIComponent(role)}`);
        } catch {
          reject(new Error("Couldn't reach the server"));
          return;
        }
        socket = ws;
        let settled = false;
        let intentional = false;
        let pingTimer;
        let openTimer;
        const timeout = setTimeout(() => {
          if (settled) return;
          settled = true;
          reject(new Error("Couldn't reach the server"));
          net.close();
        }, 10000);

        function cleanup() {
          clearTimeout(timeout);
          clearTimeout(openTimer);
          clearInterval(pingTimer);
        }
        stop = () => {
          intentional = true;
          cleanup();
          if (!settled) {
            settled = true;
            reject(new Error('Connection cancelled'));
          }
          ws.close();
        };

        ws.onopen = () => {
          // Rejected rooms upgrade first, then immediately send a close frame.
          openTimer = setTimeout(() => {
            if (settled || ws.readyState !== WebSocket.OPEN) return;
            settled = true;
            clearTimeout(timeout);
            resolve();
          }, 100);
          pingTimer = setInterval(() => {
            if (socket === ws) net.send({ t: 'ping', s: performance.now() });
          }, 2000);
        };
        ws.onmessage = event => {
          if (socket !== ws) return;
          let obj;
          try { obj = JSON.parse(event.data); } catch { return; }
          if (!obj || typeof obj !== 'object') return;
          if (obj.t === 'peer') {
            peerHandler(obj.on);
          } else if (obj.t === 'ping') {
            net.send({ t: 'pong', s: obj.s });
          } else if (obj.t === 'pong') {
            if (typeof obj.s !== 'number') return;
            const sample = performance.now() - obj.s;
            if (sample < 0 || !Number.isFinite(sample)) return;
            latency = latency ? latency * 0.8 + sample * 0.2 : sample;
          } else {
            messageHandler(obj);
          }
        };
        ws.onerror = () => {
          if (!settled) {
            settled = true;
            cleanup();
            reject(new Error("Couldn't reach the server"));
          }
        };
        ws.onclose = event => {
          cleanup();
          if (socket === ws) socket = null;
          const reason = reasons[event.code] || (event.code === 1006 ? "Couldn't reach the server" : 'Connection closed');
          if (!settled) {
            settled = true;
            reject(new Error(reason));
          }
          if (!intentional) closeHandler(reason);
        };
      });
    },
    send(obj) {
      if (socket?.readyState === WebSocket.OPEN) socket.send(JSON.stringify(obj));
    },
    onMessage(fn) { messageHandler = fn; },
    onPeer(fn) { peerHandler = fn; },
    onClose(fn) { closeHandler = fn; },
    close() {
      stop();
      stop = () => {};
      socket = null;
    },
    get connected() { return socket !== null && socket.readyState === WebSocket.OPEN; },
    get rtt() { return latency; },
  };
  return net;
}
