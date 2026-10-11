'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { AREAS, loadLevel, move, view } = require('./game');

const PORT = Number(process.env.PORT) || 8080;
const PUBLIC_DIR = path.join(__dirname, 'public');
// Progress is kept on disk so a game can be continued days later, also
// after a redeploy. Rooms nobody touched for this long are forgotten.
const DATA_FILE = path.join(process.env.DATA_DIR || path.join(__dirname, 'data'), 'rooms.json');
const ROOM_TTL_MS = 60 * 24 * 60 * 60 * 1000;
const ADVANCE_DELAY_MS = 1800;
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
    game: loadLevel(0),
    finished: false, // the whole world is done
    totalMoves: 0,
    clients: new Set(), // { res, seat }
    touched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

// ---------- Persistence ----------

let saveTimer = null;
function scheduleSave() {
  if (saveTimer) return;
  saveTimer = setTimeout(() => {
    saveTimer = null;
    const data = [...rooms.values()].map((r) => ({
      code: r.code,
      players: r.players,
      game: r.game,
      area: AREAS[r.game.level].title,
      finished: r.finished,
      totalMoves: r.totalMoves,
      touched: r.touched,
    }));
    try {
      fs.mkdirSync(path.dirname(DATA_FILE), { recursive: true });
      fs.writeFileSync(DATA_FILE + '.tmp', JSON.stringify(data));
      fs.renameSync(DATA_FILE + '.tmp', DATA_FILE);
    } catch (err) {
      console.error('could not save progress:', err.message);
    }
  }, 1000);
}

function loadRooms() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return;
  }
  for (const d of data) {
    let game = d.game;
    // The world may have changed since this was saved: keep the area number
    // but restart that area when its map is no longer the same one.
    let level = Math.min(Math.max(0, game.level | 0), AREAS.length - 1);
    if (game.solved && !d.finished && level + 1 < AREAS.length) level += 1;
    if (level !== game.level || AREAS[level].title !== d.area) game = loadLevel(level);
    rooms.set(d.code, {
      code: d.code,
      players: d.players,
      game,
      finished: !!d.finished,
      totalMoves: d.totalMoves || 0,
      clients: new Set(),
      touched: d.touched || Date.now(),
    });
  }
  console.log(`restored ${rooms.size} saved games`);
}

// Solving an area leads straight on to the next one after a short beat, so
// the world plays as one long journey instead of separate levels.
function scheduleAdvance(room) {
  const level = room.game.level;
  setTimeout(() => {
    if (room.game.level !== level || !room.game.solved) return;
    if (level + 1 < AREAS.length) room.game = loadLevel(level + 1);
    else room.finished = true;
    broadcast(room);
  }, ADVANCE_DELAY_MS);
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
    game: view(room.game),
    finished: room.finished,
    totalMoves: room.totalMoves,
  };
}

function broadcast(room) {
  room.touched = Date.now();
  scheduleSave();
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
    room.players[0] = { name: cleanName(body.name, 'Mini'), token };
    return send(res, 201, { code: room.code, token, seat: 0 });
  }

  if (parts[1] !== 'rooms' || parts.length < 3) return send(res, 404, { error: 'not found' });
  const room = rooms.get(String(parts[2]).toUpperCase());
  if (!room) return send(res, 404, { error: 'Dit spel bestaat niet (meer)' });

  // Lets an invitee see who invited them, and a returning player where the
  // game is at, before joining.
  if (req.method === 'GET' && parts.length === 3) {
    const online = [false, false];
    for (const c of room.clients) if (c.seat >= 0) online[c.seat] = true;
    return send(res, 200, {
      host: room.players[0] && room.players[0].name,
      full: !!room.players[1],
      area: room.game.level + 1,
      areas: AREAS.length,
      title: AREAS[room.game.level].title,
      finished: room.finished,
      seats: room.players.map((p, i) => (p ? { name: p.name, online: online[i] } : null)),
    });
  }
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
    // Continuing on another phone: take over a seat nobody is playing on.
    const claim = Number(body.claim);
    if (room.players[1] && (claim === 0 || claim === 1)) {
      if ([...room.clients].some((c) => c.seat === claim)) {
        return send(res, 409, { error: 'Die speler is nu al aan het spelen' });
      }
      const token = crypto.randomUUID();
      room.players[claim].token = token;
      broadcast(room);
      return send(res, 200, { code: room.code, token, seat: claim });
    }
    if (room.players[1]) return send(res, 409, { error: 'Dit spel is al vol', full: true });
    const token = crypto.randomUUID();
    room.players[1] = { name: cleanName(body.name, 'Maxi'), token };
    broadcast(room);
    return send(res, 200, { code: room.code, token, seat: 1 });
  }

  const seat = seatOf(room, body.token);
  if (seat < 0) return send(res, 403, { error: 'Je zit niet in deze kamer' });

  if (action === 'move') {
    if (!room.players[1]) return send(res, 409, { error: 'Wacht op je maatje' });
    if (room.finished || !move(room.game, seat, String(body.dir))) return send(res, 200, { ok: false });
    room.totalMoves += 1;
    if (room.game.solved) scheduleAdvance(room);
    broadcast(room);
    return send(res, 200, { ok: true });
  }

  if (action === 'restart') {
    if (room.game.solved) return send(res, 200, { ok: false });
    room.game = loadLevel(room.game.level);
    broadcast(room);
    return send(res, 200, { ok: true });
  }

  if (action === 'again') {
    room.game = loadLevel(0);
    room.finished = false;
    room.totalMoves = 0;
    broadcast(room);
    return send(res, 200, { ok: true });
  }

  return send(res, 404, { error: 'not found' });
}

const server = http.createServer((req, res) => {
  const url = new URL(req.url, 'http://localhost');
  if (url.pathname === '/health') {
    // `clients` lets the auto-updater wait until nobody is playing.
    let clients = 0;
    for (const room of rooms.values()) clients += room.clients.size;
    return send(res, 200, { status: 'ok', rooms: rooms.size, clients, version: process.env.GAME_VERSION || 'dev' });
  }
  if (url.pathname === '/game.js' || url.pathname === '/world.js') {
    // The browser uses the same rules and world for drawing and for the
    // one-phone mode.
    return fs.readFile(path.join(__dirname, url.pathname.slice(1)), (err, data) => {
      if (err) return send(res, 500, { error: 'missing ' + url.pathname });
      res.writeHead(200, { 'Content-Type': MIME['.js'], 'Cache-Control': 'no-cache' });
      res.end(data);
    });
  }
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
    if (room.clients.size === 0 && room.touched < cutoff) {
      rooms.delete(code);
      scheduleSave();
    }
  }
}, 60 * 60 * 1000).unref();

if (require.main === module) {
  loadRooms();
  server.listen(PORT, () => console.log(`Samen listening on :${PORT}`));
}

module.exports = { server };
