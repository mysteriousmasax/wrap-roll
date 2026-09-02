import { WebSocketServer } from 'ws';

let wss = null;

export function initWebSocket(server) {
  wss = new WebSocketServer({ server, path: '/ws' });
  wss.on('connection', (socket) => {
    socket.send(JSON.stringify({ event: 'connected', data: { ok: true } }));
  });
}

export function broadcast(event, data) {
  if (!wss) return;
  const message = JSON.stringify({ event, data });
  for (const client of wss.clients) {
    if (client.readyState === 1) client.send(message);
  }
}
