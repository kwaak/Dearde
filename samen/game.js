// Samen: a co-op puzzle world for two players, inspired by It Takes Two.
// Mini (seat 0) is small: fits through mouse holes and over cracked floor.
// Maxi (seat 1) is strong: pushes crates (also into water, as a bridge).
// The world (world.js) is a chain of areas; both players standing on the
// hearts of an area solves it and leads on to the next one.
// Shared by the server (require) and the browser (window.Samen).
(function (root) {
  'use strict';

  const WORLD = typeof module !== 'undefined' && module.exports ? require('./world') : root.SamenWorld;
  const AREAS = WORLD.AREAS;

  // Map legend:
  //   # wall   . floor   E heart          m / M  Mini / Maxi start
  //   o mouse hole (Mini only)            x cracked floor (Mini only)
  //   $ crate (Maxi pushes)               ~ water (a crate pushed in fills it)
  //   _ ice: whatever enters slides on until something stops it
  //   a-d button: opens door A-D while a player or crate stands on it
  //   u v lever: stepping on it flips gate U / V open or shut
  //   k key: picked up by whoever steps on it; K lock: opened with a key
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

  const parsed = new Map();
  function base(index) {
    if (!parsed.has(index)) {
      const tiles = [];
      const boxes = [];
      const players = [null, null];
      AREAS[index].map.forEach((line, r) => {
        tiles.push([...line].map((ch, c) => {
          if (ch === '$') boxes.push([r, c]);
          if (ch === 'm') players[0] = [r, c];
          if (ch === 'M') players[1] = [r, c];
          return '$mM'.includes(ch) ? '.' : ch;
        }));
      });
      parsed.set(index, { tiles, boxes, players });
    }
    return parsed.get(index);
  }

  function loadLevel(index) {
    const b = base(index);
    return {
      level: index,
      boxes: b.boxes.map((p) => p.slice()), // null once sunk into water
      players: b.players.map((p) => p.slice()),
      filled: [],      // "r,c" of water tiles filled with a crate
      levers: {},      // lever letter -> true when its gate is open
      keys: [0, 0],    // keys held per seat
      taken: [],       // "r,c" of picked-up keys
      unlocked: [],    // "r,c" of opened locks
      moves: 0,
      solved: false,
    };
  }

  function cloneState(s) {
    return {
      ...s,
      boxes: s.boxes.map((p) => p && p.slice()),
      players: s.players.map((p) => p.slice()),
      filled: s.filled.slice(),
      levers: { ...s.levers },
      keys: s.keys.slice(),
      taken: s.taken.slice(),
      unlocked: s.unlocked.slice(),
    };
  }

  // Everything that matters for the puzzle, in canonical form.
  function stateKey(s) {
    return JSON.stringify([
      s.players, s.boxes.filter(Boolean).map(String).sort(), s.filled, s.keys, s.taken, s.unlocked,
      Object.keys(s.levers).filter((l) => s.levers[l]).sort(),
    ]);
  }

  const id = (r, c) => `${r},${c}`;
  const tileOf = (s, r, c) => { const row = base(s.level).tiles[r]; return row ? row[c] : undefined; };
  const boxAt = (s, r, c) => s.boxes.findIndex((b) => b && b[0] === r && b[1] === c);
  const playerAt = (s, r, c) => s.players.findIndex((p) => p[0] === r && p[1] === c);
  const occupied = (s, r, c) => boxAt(s, r, c) >= 0 || playerAt(s, r, c) >= 0;
  const addSorted = (list, v) => { list.push(v); list.sort(); };

  function platePressed(s, letter) {
    const tiles = base(s.level).tiles;
    for (let r = 0; r < tiles.length; r++) {
      for (let c = 0; c < tiles[r].length; c++) {
        if (tiles[r][c] === letter && occupied(s, r, c)) return true;
      }
    }
    return false;
  }

  const isDoor = (t) => t >= 'A' && t <= 'D';
  const isPlate = (t) => t >= 'a' && t <= 'd';
  const isGate = (t) => t === 'U' || t === 'V';
  const isLever = (t) => t === 'u' || t === 'v';

  // Doors and gates also stay open while something stands in them, so they
  // never close on a player or a crate.
  function doorOpen(s, r, c) {
    const t = tileOf(s, r, c);
    if (occupied(s, r, c)) return true;
    if (isDoor(t)) return platePressed(s, t.toLowerCase());
    if (isGate(t)) return !!s.levers[t.toLowerCase()];
    return true;
  }

  // Can `who` (seat 0/1, or 'box') stand on (r, c), ignoring what is there?
  function walkable(s, r, c, who) {
    const t = tileOf(s, r, c);
    if (!t || t === '#') return false;
    if (t === 'o' || t === 'x') return who === 0;
    if (t === '~') return s.filled.includes(id(r, c));
    if (t === 'K') return s.unlocked.includes(id(r, c));
    if (isDoor(t) || isGate(t)) return doorOpen(s, r, c);
    if (who === 'box' && (isLever(t) || t === 'k')) return false;
    return true;
  }

  function enter(s, seat, r, c) {
    const t = tileOf(s, r, c);
    if (t === 'k' && !s.taken.includes(id(r, c))) {
      addSorted(s.taken, id(r, c));
      s.keys[seat] += 1;
    } else if (isLever(t)) {
      s.levers[t] = !s.levers[t];
    }
  }

  // Slides a crate that sits on ice further along `d` until it stops.
  function slideBox(s, i, d) {
    for (;;) {
      const [r, c] = s.boxes[i];
      if (tileOf(s, r, c) !== '_') return;
      const nr = r + d[0];
      const nc = c + d[1];
      if (tileOf(s, nr, nc) === '~' && !s.filled.includes(id(nr, nc)) && !occupied(s, nr, nc)) {
        s.boxes[i] = null;
        addSorted(s.filled, id(nr, nc));
        return;
      }
      if (!walkable(s, nr, nc, 'box') || occupied(s, nr, nc)) return;
      s.boxes[i] = [nr, nc];
    }
  }

  // Moves `seat` one step (then slides on ice); true when something changed.
  function move(s, seat, dir) {
    const d = DIRS[dir];
    if (!d || s.solved) return false;
    const [r, c] = s.players[seat];
    const nr = r + d[0];
    const nc = c + d[1];
    if (playerAt(s, nr, nc) >= 0) return false;

    const box = boxAt(s, nr, nc);
    if (box >= 0) {
      if (seat !== 1 || !walkable(s, nr, nc, seat)) return false;
      const br = nr + d[0];
      const bc = nc + d[1];
      if (occupied(s, br, bc)) return false;
      if (tileOf(s, br, bc) === '~' && !s.filled.includes(id(br, bc))) {
        s.boxes[box] = null;
        addSorted(s.filled, id(br, bc));
      } else if (walkable(s, br, bc, 'box')) {
        s.boxes[box] = [br, bc];
        slideBox(s, box, d);
      } else {
        return false;
      }
    } else if (tileOf(s, nr, nc) === 'K' && !s.unlocked.includes(id(nr, nc))) {
      if (s.keys[seat] < 1) return false;
      s.keys[seat] -= 1;
      addSorted(s.unlocked, id(nr, nc));
    } else if (!walkable(s, nr, nc, seat)) {
      return false;
    }

    s.players[seat] = [nr, nc];
    enter(s, seat, nr, nc);
    // On ice, keep sliding until something is in the way. A partner makes a
    // perfect stopper.
    for (;;) {
      const [pr, pc] = s.players[seat];
      if (tileOf(s, pr, pc) !== '_') break;
      const sr = pr + d[0];
      const sc = pc + d[1];
      if (occupied(s, sr, sc) || !walkable(s, sr, sc, seat)) break;
      s.players[seat] = [sr, sc];
      enter(s, seat, sr, sc);
    }
    s.moves += 1;
    s.solved = s.players.every(([pr, pc]) => tileOf(s, pr, pc) === 'E');
    return true;
  }

  // Read-only view for the renderers. Tile codes:
  //   '#' '.' 'o' 'x' '_' 'E'   '~' water / '=' water filled with a crate
  //   'a'..'d' button           'A'..'D' shut door, 'A+'.. open door
  //   'u0'/'u1' lever           'U0'/'U1' shut / open gate
  //   'k' key (gone: '.')       'K' lock, 'K+' opened lock
  function view(s) {
    const tiles = base(s.level).tiles.map((row, r) => row.map((t, c) => {
      if (t === '~') return s.filled.includes(id(r, c)) ? '=' : '~';
      if (t === 'k') return s.taken.includes(id(r, c)) ? '.' : 'k';
      if (t === 'K') return s.unlocked.includes(id(r, c)) ? 'K+' : 'K';
      if (isDoor(t)) return doorOpen(s, r, c) ? t + '+' : t;
      if (isGate(t)) return t + (doorOpen(s, r, c) ? '1' : '0');
      if (isLever(t)) return t + (s.levers[t] ? '1' : '0');
      return t;
    }));
    const area = AREAS[s.level];
    return {
      level: s.level,
      levels: AREAS.length,
      title: area.title,
      zone: area.zone,
      tips: area.tips,
      tiles,
      boxes: s.boxes,
      players: s.players,
      keys: s.keys,
      moves: s.moves,
      solved: s.solved,
    };
  }

  // Static look of any area (used to draw the neighbouring areas).
  function preview(index) {
    return view(loadLevel(index));
  }

  const api = { AREAS, ZONES: WORLD.ZONES, LEVELS: AREAS, DIRS, loadLevel, cloneState, stateKey, move, view, preview };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Samen = api;
})(this);
