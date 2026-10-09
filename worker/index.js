import { DurableObject } from 'cloudflare:workers';

export default {
  fetch(request, env) {
    const url = new URL(request.url);
    if (!url.pathname.startsWith('/ws/')) return env.ASSETS.fetch(request);

    const code = url.pathname.slice(4).toUpperCase();
    const role = url.searchParams.get('role');
    if (!/^[A-Z0-9-]{1,16}$/.test(code) || !['host', 'guest'].includes(role)) {
      return new Response('Invalid room code or role', { status: 400 });
    }
    if (request.method !== 'GET' || request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('Expected a WebSocket upgrade', { status: 400 });
    }
    return env.ROOMS.get(env.ROOMS.idFromName(code)).fetch(request);
  },
};

export class Room extends DurableObject {
  socket(role) {
    return this.ctx.getWebSockets(role).find(ws => ws.readyState === WebSocket.OPEN);
  }

  fetch(request) {
    const role = new URL(request.url).searchParams.get('role');
    const host = this.socket('host');
    const guest = this.socket('guest');
    const [client, server] = Object.values(new WebSocketPair());
    const rejection = role === 'host'
      ? (host ? [4001, 'room taken'] : null)
      : (!host ? [4004, 'no such room'] : guest ? [4003, 'room full'] : null);

    if (rejection) {
      server.accept();
      server.close(...rejection);
    } else {
      this.ctx.acceptWebSocket(server, [role]);
      const peer = role === 'host' ? guest : host;
      if (peer) {
        const message = JSON.stringify({ t: 'peer', on: true });
        peer.send(message);
        server.send(message);
      }
    }
    return new Response(null, { status: 101, webSocket: client });
  }

  webSocketMessage(ws, message) {
    if (typeof message !== 'string' || ws.readyState !== WebSocket.OPEN) return;
    const role = this.ctx.getTags(ws)[0];
    this.socket(role === 'host' ? 'guest' : 'host')?.send(message);
  }

  notifyLeft(ws) {
    const role = this.ctx.getTags(ws)[0];
    // A late close from an old socket must not disconnect its replacement.
    if (this.ctx.getWebSockets(role).some(other => other !== ws && other.readyState === WebSocket.OPEN)) return;
    this.socket(role === 'host' ? 'guest' : 'host')?.send(JSON.stringify({ t: 'peer', on: false }));
  }

  webSocketClose(ws, code, reason) {
    if (ws.readyState !== WebSocket.CLOSED) ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    this.notifyLeft(ws);
  }

  webSocketError(ws) {
    if (ws.readyState === WebSocket.OPEN) ws.close(1011, 'connection error');
    this.notifyLeft(ws);
  }
}
