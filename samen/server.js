'use strict';

const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const zlib = require('node:zlib');
const { AREAS, loadLevel, move, view, controlledBy } = require('./game');

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

function createRoom(start) {
  const room = {
    code: makeCode(),
    players: [null, null], // { name, token }
    game: loadLevel(start),
    finished: false, // the whole world is done
    totalMoves: 0,
    acked: [0, 0], // last move number processed per seat
    clients: new Set(), // { res, seat }
    touched: Date.now(),
  };
  rooms.set(room.code, room);
  return room;
}

// ---------- Persistence ----------

let saveTimer = null;
function scheduleSave() {
  if (!saveTimer) saveTimer = setTimeout(saveNow, 1000);
}

function saveNow() {
  clearTimeout(saveTimer);
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
}

function loadRooms() {
  let data;
  try {
    data = JSON.parse(fs.readFileSync(DATA_FILE, 'utf8'));
  } catch {
    return;
  }
  for (const d of data) {
    // The world may have changed since this was saved: find the area back by
    // its name (areas get added and removed), otherwise stay near the old spot.
    let level = AREAS.findIndex((a) => a.title === d.area);
    const known = level >= 0;
    if (!known) level = Math.min(Math.max(0, d.game.level | 0), AREAS.length - 1);
    if (d.game.solved && !d.finished && level + 1 < AREAS.length) level += 1;
    const game = known && !d.game.solved ? { ...loadLevel(level), ...d.game, level } : loadLevel(level);
    rooms.set(d.code, {
      code: d.code,
      players: d.players,
      game,
      finished: !!d.finished,
      totalMoves: d.totalMoves || 0,
      acked: [0, 0],
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
    room.mover = -1;
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
    state: room.game, // the full puzzle state, so phones can run their own moves ahead
    acked: room.acked,
    mover: room.mover === undefined ? -1 : room.mover, // whose move led here (for sounds)
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

// Static files are kept in memory, gzipped once, and sent with an ETag so a
// returning phone only gets a tiny "not modified" answer. The 3D library
// never changes between deploys of the same version, so it may be cached
// for a week without asking.
const fileCache = new Map(); // path -> { mtime, body, gzip, etag, type }

function loadFile(file, done) {
  fs.stat(file, (err, st) => {
    if (err || !st.isFile()) return done(err || new Error('not a file'));
    const hit = fileCache.get(file);
    if (hit && hit.mtime === st.mtimeMs) return done(null, hit);
    fs.readFile(file, (err2, body) => {
      if (err2) return done(err2);
      const type = MIME[path.extname(file)] || 'application/octet-stream';
      const entry = {
        mtime: st.mtimeMs,
        body,
        gzip: /text|javascript|json|svg/.test(type) ? zlib.gzipSync(body, { level: 9 }) : null,
        etag: '"' + crypto.createHash('sha1').update(body).digest('base64url').slice(0, 20) + '"',
        type,
      };
      fileCache.set(file, entry);
      done(null, entry);
    });
  });
}

function sendFile(req, res, file, maxAge) {
  loadFile(file, (err, f) => {
    if (err) return send(res, 404, { error: 'not found' });
    const headers = {
      'Content-Type': f.type,
      ETag: f.etag,
      'Cache-Control': maxAge ? `public, max-age=${maxAge}` : 'no-cache',
      Vary: 'Accept-Encoding',
    };
    if (req.headers['if-none-match'] === f.etag) {
      res.writeHead(304, headers);
      return res.end();
    }
    const gzip = f.gzip && /\bgzip\b/.test(req.headers['accept-encoding'] || '');
    if (gzip) headers['Content-Encoding'] = 'gzip';
    res.writeHead(200, headers);
    res.end(req.method === 'HEAD' ? undefined : gzip ? f.gzip : f.body);
  });
}

function serveStatic(req, res, pathname) {
  const rel = pathname === '/' ? 'index.html' : decodeURIComponent(pathname).replace(/^\/+/, '');
  const file = path.normalize(path.join(PUBLIC_DIR, rel));
  if (!file.startsWith(PUBLIC_DIR + path.sep)) return send(res, 404, { error: 'not found' });
  const maxAge = rel.startsWith('vendor/') ? 7 * 24 * 3600 : 0;
  fs.stat(file, (err, st) => {
    // SPA fallback so /?r=CODE style links and typos still land on the game.
    const ok = !err && st.isFile();
    sendFile(req, res, ok ? file : path.join(PUBLIC_DIR, 'index.html'), ok ? maxAge : 0);
  });
}

async function handleApi(req, res, url) {
  const parts = url.pathname.split('/').filter(Boolean); // ['api', 'rooms', code, action]

  if (req.method === 'POST' && parts.length === 2 && parts[1] === 'rooms') {
    const body = await readJson(req);
    const start = Math.min(Math.max(0, Number(body.start) | 0), AREAS.length - 1);
    const room = createRoom(start);
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
    // Phones show their own moves straight away and send every move not yet
    // confirmed, in order; `acked` tells them which ones are done.
    const moves = Array.isArray(body.moves) ? body.moves.slice(0, 20) : [{ dir: body.dir, seq: body.seq }];
    let changed = false;
    const results = moves.map((m) => {
      // Phones resend every move until it is confirmed: skip ones already done.
      if (Number.isFinite(m.seq) && m.seq <= room.acked[seat]) return null;
      // Some bosses swap the controls: then this phone moves the partner.
      const ok = !room.finished && !room.game.solved && move(room.game, controlledBy(room.game, seat), String(m.dir));
      if (Number.isFinite(m.seq)) room.acked[seat] = m.seq;
      if (ok) {
        changed = true;
        room.totalMoves += 1;
        room.mover = seat;
        if (room.game.solved) scheduleAdvance(room);
      }
      return ok;
    });
    if (changed || moves.some((m) => Number.isFinite(m.seq))) broadcast(room);
    return send(res, 200, { ok: results[results.length - 1], results });
  }

  if (action === 'restart') {
    if (room.game.solved) return send(res, 200, { ok: false });
    room.game = loadLevel(room.game.level);
    room.mover = -1;
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
    return sendFile(req, res, path.join(__dirname, url.pathname.slice(1)), 0);
  }
  if (url.pathname === '/api/time') {
    // For the music: every phone syncs its clock to this one, so they all
    // play the same beat at the same moment.
    return send(res, 200, { now: Date.now() });
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
  // A redeploy stops the container: write the last moves to disk first.
  for (const sig of ['SIGTERM', 'SIGINT']) process.on(sig, () => { saveNow(); process.exit(0); });
  server.listen(PORT, () => console.log(`Samen listening on :${PORT}`));
}

module.exports = { server };
