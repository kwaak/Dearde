'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { newBoard, drop, winningLine, isFull } = require('./game');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
const ROOM_TTL_MS = 6 * 60 * 60 * 1000;
// No I/O/0/1 so codes survive being read out loud or typed on a phone.
const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';

const rooms = new Map();

function makeCode() {
  let code;
  do {
    code = Array.from(crypto.randomBytes(4), (b) => CODE_CHARS[b % CODE_CHARS.length]).join('');
  } while (rooms.has(code));
  return code;
}

function cleanName(name, fallback) {
  const s = String(name || '').replace(/\s+/g, ' ').trim().slice(0, 20);
  return s || fallback;
}

function createRoom() {
  const room = {
    code: makeCode(),
    players: [null, null], // { name, token }
    board: newBoard(),
    turn: 0,
    starter: 0,
    winner: null, // 0 | 1 | 'draw' | null
    winLine: null,
    lastMove: null,
    scores: [0, 0],
    rematch: [false, false],
    clients: new Set(), // { res, seat }
    touched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

function seatOf(room, token) {
  if (!token) return -1;
  return room.players.findIndex((p) => p && p.token === token);
}

function publicState(room, seat) {
  const online = [false, false];
  for (const c of room.clients) if (c.seat >= 0) online[c.seat] = true;
  return {
    code: room.code,
    you: seat,
    players: room.players.map((p, i) => (p ? { name: p.name, online: online[i] } : null)),
    board: room.board,
    turn: room.turn,
    winner: room.winner,
    winLine: room.winLine,
    lastMove: room.lastMove,
    scores: room.scores,
    rematch: room.rematch,
  };
}

function broadcast(room) {
  room.touched = Date.now();
  for (const c of room.clients) {
    c.res.write(`data: ${JSON.stringify(publicState(room, c.seat))}\n\n`);
  }
}

function send(res, status, body) {
  res.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
  res.end(JSON.stringify(body));
}

function readJson(req) {
  return new Promise((resolve) => {
    let raw = '';
    req.on('data', (chunk) => {
      raw += chunk;
      if (raw.length > 10_000) req.destroy();
    });
    req.on('end', () => {
      try {
        resolve(JSON.parse(raw || '{}'));
      } catch {
        resolve({});
      }
    });
  });
}

const MIME = {
  '.html': 'text/html; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.json': 'application/json',
  '.webmanifest': 'application/manifest+json',
};

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, { error: 'not found' });
  fs.readFile(file, (err, data) => {
    if (err) {
      // SPA fallback so /?r=CODE style links and typos still land on the game.
      return fs.readFile(path.join(PUBLIC_DIR, 'index.html'), (err2, html) => {
        if (err2) return send(res, 404, { error: 'not found' });
        res.writeHead(200, { 'Content-Type': MIME['.html'] });
        res.end(html);
      });
    }
    res.writeHead(200, { 'Content-Type': MIME[path.extname(file)] || 'application/octet-stream' });
    res.end(data);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'rooms', code, action]

  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'rooms') {
    const body = await readJson(req);
    const room = createRoom();
    const token = crypto.randomUUID();
    room.players[0] = { name: cleanName(body.name, 'Speler 1'), token };
    return send(res, 201, { code: room.code, token, seat: 0 });
  }

  if (parts[1] !== 'rooms' || parts.length < 4) return send(res, 404, { error: 'not found' });
  const room = rooms.get(String(parts[2]).toUpperCase());
  if (!room) return send(res, 404, { error: 'Kamer niet gevonden' });
  const action = parts[3];

  if (req.method === 'GET' && action === 'events') {
    const seat = seatOf(room, url.searchParams.get('token'));
    res.writeHead(200, {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      Connection: 'keep-alive',
      'X-Accel-Buffering': 'no',
    });
    res.write('retry: 2000\n\n');
    const client = { res, seat };
    room.clients.add(client);
    broadcast(room);
    const ping = setInterval(() => res.write(': ping\n\n'), 20_000);
    req.on('close', () => {
      clearInterval(ping);
      room.clients.delete(client);
      broadcast(room);
    });
    return;
  }

  if (req.method !== 'POST') return send(res, 405, { error: 'method not allowed' });
  const body = await readJson(req);

  if (action === 'join') {
    const existing = seatOf(room, body.token);
    if (existing >= 0) return send(res, 200, { code: room.code, token: body.token, seat: existing });
    if (room.players[1]) return send(res, 409, { error: 'Deze kamer is al vol' });
    const token = crypto.randomUUID();
    room.players[1] = { name: cleanName(body.name, 'Speler 2'), token };
    broadcast(room);
    return send(res, 200, { code: room.code, token, seat: 1 });
  }

  const seat = seatOf(room, body.token);
  if (seat < 0) return send(res, 403, { error: 'Je zit niet in deze kamer' });

  if (action === 'move') {
    if (!room.players[1]) return send(res, 409, { error: 'Wacht op een tegenstander' });
    if (room.winner !== null) return send(res, 409, { error: 'Het spel is voorbij' });
    if (room.turn !== seat) return send(res, 409, { error: 'Je bent niet aan de beurt' });
    const col = Number(body.column);
    const row = drop(room.board, col, seat);
    if (row < 0) return send(res, 400, { error: 'Die kolom is vol' });
    room.lastMove = [row, col];
    const line = winningLine(room.board, row, col);
    if (line) {
      room.winner = seat;
      room.winLine = line;
      room.scores[seat] += 1;
    } else if (isFull(room.board)) {
      room.winner = 'draw';
    } else {
      room.turn = 1 - seat;
    }
    broadcast(room);
    return send(res, 200, { ok: true });
  }

  if (action === 'rematch') {
    if (room.winner === null) return send(res, 409, { error: 'Het spel loopt nog' });
    room.rematch[seat] = true;
    if (room.rematch[0] && room.rematch[1]) {
      room.board = newBoard();
      room.starter = 1 - room.starter;
      room.turn = room.starter;
      room.winner = null;
      room.winLine = null;
      room.lastMove = null;
      room.rematch = [false, false];
    }
    broadcast(room);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') return send(res, 200, { status: 'ok', rooms: rooms.size });
  if (url.pathname.startsWith('/api/')) {
    return handleApi(req, res, url).catch((err) => {
      console.error(err);
      if (!res.headersSent) send(res, 500, { error: 'server error' });
    });
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') return send(res, 405, { error: 'method not allowed' });
  serveStatic(req, res, url.pathname);
});

setInterval(() => {
  const cutoff = Date.now() - ROOM_TTL_MS;
  for (const [code, room] of rooms) {
    if (room.clients.size === 0 && room.touched < cutoff) rooms.delete(code);
  }
}, 10 * 60 * 1000).unref();

if (require.main === module) {
  server.listen(PORT, () => console.log(`Vier op een rij listening on :${PORT}`));
}

module.exports = { server };
