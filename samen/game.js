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
  // From the Mario games:
  //   1-4 warp pipe: stepping in pops you out of the other pipe, same number
  //   r brick block: Maxi smashes it by walking into it, Mini bumps off
  //   j springboard: bounces you over the next tile, two tiles on
  //   * coin; S star door, opens once every coin of the area is collected
  //   p P-switch: for P_TIME moves the dotted blocks q become a walkway
  // Height (an optional `heights` map of digits next to the tiles):
  //   anyone can jump down, Maxi climbs one step up, Mini needs stairs:
  //   / stairs: Mini can step up onto them from one level lower
  //   crates only go down or stay level; a springboard lifts you one level
  // Bosses (an optional `boss` next to the map), one at the end of a zone:
  //   G where a walking boss starts; it takes a step after every move
  //   Z cage around the hearts: opens once the boss is beaten
  //   T flower trap: snaps when the last pink button (a) goes down
  //   Q crumbly bridge: falls away while the P-switch runs
  //   % deep water: crates sink without a trace, swimming bosses live here
  // A boss is hit in its own way (`weak`); after a hit it goes back to
  // where it started, until it has no lives left.
  const P_TIME = 8;
  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };
  const STEPS = Object.values(DIRS);

  const parsed = new Map();
  function base(index) {
    if (!parsed.has(index)) {
      const tiles = [];
      const boxes = [];
      const players = [null, null];
      const pipes = {};
      let coins = 0;
      AREAS[index].map.forEach((line, r) => {
        tiles.push([...line].map((ch, c) => {
          if (ch >= '1' && ch <= '4') (pipes[ch] = pipes[ch] || []).push([r, c]);
          if (ch === '*') coins += 1;
          if (ch === '$') boxes.push([r, c]);
          if (ch === 'm') players[0] = [r, c];
          if (ch === 'M') players[1] = [r, c];
          return '$mM'.includes(ch) ? '.' : ch;
        }));
      });
      const h = AREAS[index].heights;
      const heights = tiles.map((row, r) => row.map((_, c) => (h ? Number(h[r][c]) || 0 : 0)));
      let bossStart = null;
      tiles.forEach((row, r) => row.forEach((t, c) => { if (t === 'G') { bossStart = [r, c]; row[c] = (AREAS[index].boss && AREAS[index].boss.under) || '.'; } }));
      const spec = AREAS[index].boss;
      if (spec && spec.path) bossStart = spec.path[0];
      parsed.set(index, { tiles, boxes, players, pipes, coins, heights, bossStart, spec });
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
      broken: [],      // "r,c" of smashed brick blocks
      coins: [],       // "r,c" of collected coins
      ptimer: 0,       // moves left before the dotted blocks vanish again
      // The boss: where it is (null once beaten), lives left, patrol step.
      boss: b.spec ? { pos: b.bossStart.slice(), hp: b.spec.hp, idx: 0 } : null,
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
      broken: s.broken.slice(),
      coins: s.coins.slice(),
      boss: s.boss && { ...s.boss, pos: s.boss.pos && s.boss.pos.slice() },
    };
  }

  // Everything that matters for the puzzle, in canonical form. Built by
  // hand because the solver calls it millions of times.
  function stateKey(s) {
    const pos = (p) => (p ? p[0] + ',' + p[1] : '-');
    let k = pos(s.players[0]) + ';' + pos(s.players[1]) + ';' + s.boxes.filter(Boolean).map(pos).sort().join(' ');
    k += ';' + s.filled.join(' ') + ';' + s.keys.join(',') + ';' + s.taken.join(' ') + ';' + s.unlocked.join(' ');
    k += ';' + Object.keys(s.levers).filter((l) => s.levers[l]).sort().join('') + ';' + s.broken.join(' ') + ';' + s.coins.join(' ') + ';' + s.ptimer;
    if (s.boss) k += ';' + pos(s.boss.pos) + ',' + s.boss.hp + ',' + s.boss.idx + ',' + (s.boss.armed ? 1 : 0);
    return k;
  }

  const id = (r, c) => `${r},${c}`;
  const tileOf = (s, r, c) => { const row = base(s.level).tiles[r]; return row ? row[c] : undefined; };
  const heightOf = (s, r, c) => { const row = base(s.level).heights[r]; return row && row[c] !== undefined ? row[c] : 0; };
  const boxAt = (s, r, c) => s.boxes.findIndex((b) => b && b[0] === r && b[1] === c);
  const playerAt = (s, r, c) => s.players.findIndex((p) => p[0] === r && p[1] === c);
  const bossAt = (s, r, c) => !!(s.boss && s.boss.pos && s.boss.pos[0] === r && s.boss.pos[1] === c);
  const occupied = (s, r, c) => boxAt(s, r, c) >= 0 || playerAt(s, r, c) >= 0 || bossAt(s, r, c);
  const beaten = (s) => !s.boss || s.boss.hp <= 0;
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
  const isPipe = (t) => t >= '1' && t <= '4';
  const starOpen = (s) => s.coins.length >= base(s.level).coins;

  // May `who` step from (r, c) to the neighbour (nr, nc), height-wise?
  function canStep(s, who, r, c, nr, nc) {
    const dh = heightOf(s, nr, nc) - heightOf(s, r, c);
    if (dh <= 0) return true;
    if (dh > 1) return false;
    return who === 1 || (who === 0 && tileOf(s, nr, nc) === '/');
  }

  // Doors and gates also stay open while something stands in them, so they
  // never close on a player or a crate.
  function doorOpen(s, r, c) {
    const t = tileOf(s, r, c);
    if (occupied(s, r, c)) return true;
    if (isDoor(t)) return platePressed(s, t.toLowerCase());
    if (isGate(t)) return !!s.levers[t.toLowerCase()];
    if (t === 'S') return starOpen(s);
    if (t === 'Z') return beaten(s);
    if (t === 'q') return s.ptimer > 0;
    return true;
  }

  // Can `who` (seat 0/1, or 'box') stand on (r, c), ignoring what is there?
  function walkable(s, r, c, who) {
    const t = tileOf(s, r, c);
    if (!t || t === '#') return false;
    if (t === 'x' && s.broken.includes(id(r, c))) return false; // a hole now
    if (t === 'o' || t === 'x') return who === 0;
    if (t === '~') return s.filled.includes(id(r, c));
    if (t === 'K') return s.unlocked.includes(id(r, c));
    if (t === 'r') return s.broken.includes(id(r, c));
    if (t === '%') return false;
    if (t === 'Q') return s.ptimer === 0 || occupied(s, r, c);
    if (isDoor(t) || isGate(t) || t === 'S' || t === 'q' || t === 'Z') {
      if (who === 'box' && t === 'q') return false;
      return doorOpen(s, r, c);
    }
    if (who === 'box' && (isLever(t) || t === 'k' || t === '*' || t === 'p' || t === 'j' || t === '/' || isPipe(t))) return false;
    return true;
  }

  function enter(s, seat, r, c) {
    const t = tileOf(s, r, c);
    if (t === 'k' && !s.taken.includes(id(r, c))) {
      addSorted(s.taken, id(r, c));
      s.keys[seat] += 1;
    } else if (isLever(t)) {
      s.levers[t] = !s.levers[t];
    } else if (t === '*' && !s.coins.includes(id(r, c))) {
      addSorted(s.coins, id(r, c));
    } else if (t === 'p') {
      s.pressed = true;
    }
  }

  // Can you sail over (r, c) on a springboard? Anything low: water, crates,
  // your partner. Not walls, bricks or anything that is shut.
  function jumpable(s, r, c) {
    const t = tileOf(s, r, c);
    if (!t || t === '#' || t === 'o') return false;
    if (t === 'r') return s.broken.includes(id(r, c));
    if (t === 'K') return s.unlocked.includes(id(r, c));
    if (isDoor(t) || isGate(t) || t === 'S' || t === 'Z') return doorOpen(s, r, c);
    return true;
  }

  // What happens after `seat` lands on a tile while moving along `d`: pipes
  // warp, springboards bounce, ice keeps you sliding. A partner in the way
  // makes a perfect stopper.
  function arrive(s, seat, d) {
    for (let guard = 0; guard < 64; guard++) {
      const [r, c] = s.players[seat];
      const t = tileOf(s, r, c);
      if (isPipe(t)) {
        const other = base(s.level).pipes[t].find(([pr, pc]) => pr !== r || pc !== c);
        if (other && !occupied(s, other[0], other[1])) s.players[seat] = other.slice();
        return;
      }
      let nr = r + d[0];
      let nc = c + d[1];
      const top = heightOf(s, r, c);
      if (t === 'j') {
        // The bounce reaches one level higher than the springboard.
        if (!jumpable(s, nr, nc) || heightOf(s, nr, nc) > top + 1) return;
        nr += d[0];
        nc += d[1];
        if (heightOf(s, nr, nc) > top + 1) return;
      } else if (t !== '_' || heightOf(s, nr, nc) !== top) {
        return;
      }
      if (occupied(s, nr, nc) || !walkable(s, nr, nc, seat)) return;
      s.players[seat] = [nr, nc];
      enter(s, seat, nr, nc);
    }
  }

  // Slides a crate that sits on ice further along `d` until it stops.
  function slideBox(s, i, d) {
    for (;;) {
      const [r, c] = s.boxes[i];
      if (tileOf(s, r, c) !== '_') return;
      const nr = r + d[0];
      const nc = c + d[1];
      if (heightOf(s, nr, nc) > heightOf(s, r, c)) return;
      if (bossAt(s, nr, nc)) { if (weakTo(s, 'crate')) hitBoss(s); return; }
      if (tileOf(s, nr, nc) === '~' && !s.filled.includes(id(nr, nc)) && !occupied(s, nr, nc)) {
        s.boxes[i] = null;
        addSorted(s.filled, id(nr, nc));
        return;
      }
      if (!walkable(s, nr, nc, 'box') || occupied(s, nr, nc) || heightOf(s, nr, nc) !== heightOf(s, r, c)) return;
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
    if (playerAt(s, nr, nc) >= 0 || !canStep(s, seat, r, c, nr, nc)) return false;

    const box = boxAt(s, nr, nc);
    if (box >= 0) {
      if (seat !== 1 || !walkable(s, nr, nc, seat)) return false;
      const br = nr + d[0];
      const bc = nc + d[1];
      // Crates slide off ledges, but nobody lifts them up one.
      if (heightOf(s, br, bc) > heightOf(s, nr, nc)) return false;
      if (bossAt(s, br, bc)) {
        // The boss's weak spot: a crate in the face, from above, or in the water.
        const fromAbove = heightOf(s, br, bc) < heightOf(s, nr, nc);
        if (weakTo(s, 'crate')) { hitBoss(s); return finish(s); }
        if ((weakTo(s, 'drop') && fromAbove) || (weakTo(s, 'water') && tileOf(s, br, bc) === '%')) {
          s.boxes[box] = null;
          hitBoss(s);
          return finish(s);
        }
        return false;
      }
      if (occupied(s, br, bc)) return false;
      if (tileOf(s, br, bc) === '%') {
        s.boxes[box] = null; // gone in the deep
      } else if (tileOf(s, br, bc) === '~' && !s.filled.includes(id(br, bc))) {
        s.boxes[box] = null;
        addSorted(s.filled, id(br, bc));
      } else if (walkable(s, br, bc, 'box')) {
        s.boxes[box] = [br, bc];
        slideBox(s, box, d);
      } else {
        return false;
      }
    } else if (tileOf(s, nr, nc) === 'r' && !s.broken.includes(id(nr, nc))) {
      // Only Maxi is strong enough; the block breaks, Maxi stays put.
      if (seat !== 1) return false;
      addSorted(s.broken, id(nr, nc));
      return finish(s);
    } else if (tileOf(s, nr, nc) === 'K' && !s.unlocked.includes(id(nr, nc))) {
      if (s.keys[seat] < 1) return false;
      s.keys[seat] -= 1;
      addSorted(s.unlocked, id(nr, nc));
    } else if (!walkable(s, nr, nc, seat)) {
      return false;
    }

    s.players[seat] = [nr, nc];
    enter(s, seat, nr, nc);
    arrive(s, seat, d);
    return finish(s);
  }

  // Bookkeeping after every move: the P-switch clock and the win check.
  function finish(s) {
    if (s.pressed) s.ptimer = P_TIME;
    else if (s.ptimer > 0) s.ptimer -= 1;
    delete s.pressed;
    s.moves += 1;
    if (s.boss && s.boss.pos) {
      checkBoss(s);
      if (s.boss.pos && s.moves % (base(s.level).spec.every || 1) === 0) bossTurn(s);
      if (s.boss.pos) checkBoss(s);
    }
    s.solved = s.players.every(([pr, pc]) => tileOf(s, pr, pc) === 'E');
    return true;
  }

  // ---------- Bosses ----------

  const weakTo = (s, kind) => {
    const spec = base(s.level).spec;
    if (!spec) return false;
    // A boss can change its weak spot as it loses lives.
    const weak = Array.isArray(spec.weak) ? spec.weak[spec.hp - s.boss.hp] : spec.weak;
    return weak === kind;
  };

  function hitBoss(s) {
    const b = s.boss;
    b.hp -= 1;
    b.hits = (b.hits || 0) + 1;
    b.idx = 0;
    b.pos = b.hp > 0 ? base(s.level).bossStart.slice() : null;
  }

  // Where may the boss go? Swimmers stay in deep water, walkers on plain
  // ground at their own height (no buttons, holes, pickups or water).
  function bossCanEnter(s, r, c, fromH) {
    const t = tileOf(s, r, c);
    if (base(s.level).spec.swim) return t === '%';
    if (heightOf(s, r, c) !== fromH) return false;
    if (t === 'Q') return s.ptimer === 0;
    if (t === 'x') return !s.broken.includes(id(r, c));
    if (isDoor(t)) return doorOpen(s, r, c);
    return t === '.' || t === 'T' || t === '_';
  }

  // The boss bumps a player out of its way, if there is room behind them.
  function shove(s, seat, d) {
    const [r, c] = s.players[seat];
    const nr = r + d[0];
    const nc = c + d[1];
    if (occupied(s, nr, nc) || !walkable(s, nr, nc, seat) || heightOf(s, nr, nc) > heightOf(s, r, c)) return false;
    s.players[seat] = [nr, nc];
    enter(s, seat, nr, nc);
    return true;
  }

  // Steps the boss onto (nr, nc), shoving a player if needed; then it may
  // slide on ice or crash through cracked floor.
  function bossMove(s, nr, nc) {
    const b = s.boss;
    const d = [Math.sign(nr - b.pos[0]), Math.sign(nc - b.pos[1])];
    const seat = playerAt(s, nr, nc);
    if (boxAt(s, nr, nc) >= 0) return false;
    if (seat >= 0 && !shove(s, seat, d)) return false;
    b.pos = [nr, nc];
    for (let guard = 0; guard < 64; guard++) {
      const [r, c] = b.pos;
      if (tileOf(s, r, c) === 'x') {
        // Too heavy: it crashes through and leaves a hole.
        if (weakTo(s, 'fall')) { addSorted(s.broken, id(r, c)); hitBoss(s); }
        return true;
      }
      if (tileOf(s, r, c) !== '_') return true;
      const sr = r + d[0];
      const sc = c + d[1];
      if (occupied(s, sr, sc) || !bossCanEnter(s, sr, sc, heightOf(s, r, c))) return true;
      b.pos = [sr, sc];
    }
    return true;
  }

  function bossTurn(s) {
    const spec = base(s.level).spec;
    const b = s.boss;
    if (spec.path) {
      // Patrol: the next stop of its round, waiting when the way is blocked.
      const next = spec.path[(b.idx + 1) % spec.path.length];
      if (bossMove(s, next[0], next[1]) && b.pos) b.idx = (b.idx + 1) % spec.path.length;
      return;
    }
    // Chase: one step towards the nearest player; with nobody in reach it
    // heads back home. Distances on a flat array, as the solver runs this a lot.
    const h = heightOf(s, b.pos[0], b.pos[1]);
    const W = base(s.level).tiles[0].length;
    const H = base(s.level).tiles.length;
    const open = (r, c) => r >= 0 && c >= 0 && r < H && c < W && boxAt(s, r, c) < 0 && (bossCanEnter(s, r, c, h) || bossAt(s, r, c));
    const flood = (sources) => {
      const dist = new Int16Array(W * H).fill(-1);
      let queue = [];
      for (const [r, c] of sources) { dist[r * W + c] = 0; queue.push(r * W + c); }
      for (let qi = 0; qi < queue.length; qi++) {
        const cell = queue[qi];
        const r = (cell / W) | 0;
        const c = cell % W;
        for (let k = 0; k < 4; k++) {
          const nr = r + STEPS[k][0];
          const nc = c + STEPS[k][1];
          if (!open(nr, nc) || dist[nr * W + nc] >= 0) continue;
          dist[nr * W + nc] = dist[cell] + 1;
          queue.push(nr * W + nc);
        }
      }
      return dist;
    };
    let dist = flood(s.players);
    let here = dist[b.pos[0] * W + b.pos[1]];
    if (here < 0) {
      const home = base(s.level).bossStart;
      if (b.pos[0] === home[0] && b.pos[1] === home[1]) return;
      dist = flood([home]);
      here = dist[b.pos[0] * W + b.pos[1]];
      if (here < 0) return;
    }
    for (let k = 0; k < 4; k++) {
      const nr = b.pos[0] + STEPS[k][0];
      const nc = b.pos[1] + STEPS[k][1];
      if (nr < 0 || nc < 0 || nr >= H || nc >= W || dist[nr * W + nc] !== here - 1) continue;
      if ((playerAt(s, nr, nc) >= 0 || bossCanEnter(s, nr, nc, h)) && bossMove(s, nr, nc)) return;
    }
  }

  // Hits that come from where the boss and the players stand.
  function checkBoss(s) {
    const b = s.boss;
    if (!b.pos) return;
    const [r, c] = b.pos;
    const t = tileOf(s, r, c);
    const allPressed = (letter) => base(s.level).tiles.every((row, rr) => row.every((tt, cc) => tt !== letter || occupied(s, rr, cc)));
    // The flower snaps at the moment the last pink button goes down.
    const armed = allPressed('a');
    const snap = armed && !b.armed;
    b.armed = armed;
    if (weakTo(s, 'trap') && t === 'T' && snap) return hitBoss(s);
    if (weakTo(s, 'collapse') && t === 'Q' && s.ptimer > 0) return hitBoss(s);
    if (weakTo(s, 'squeeze')) {
      const at = (dr, dc) => playerAt(s, r + dr, c + dc) >= 0;
      if ((at(0, 1) && at(0, -1)) || (at(1, 0) && at(-1, 0))) return hitBoss(s);
    }
  }

  // Read-only view for the renderers. Tile codes:
  //   '#' '.' 'o' 'x' '_' 'E'   '~' water / '=' water filled with a crate
  //   'a'..'d' button           'A'..'D' shut door, 'A+'.. open door
  //   'u0'/'u1' lever           'U0'/'U1' shut / open gate
  //   'k' key (gone: '.')       'K' lock, 'K+' opened lock
  //   '1'..'4' pipe             'r' brick (smashed: '.')    'j' springboard
  //   '*' coin (taken: '.')     'S' / 'S+' shut / open star door
  //   'p' P-switch              'q0' / 'q1' dotted block off / solid
  //   '/' stairs                `heights` holds the level of every tile
  //   'h' hole (cracked floor a boss fell through)   'Z' / 'Z+' cage
  //   'Q1' / 'Q0' crumbly bridge up / fallen away
  function view(s) {
    const tiles = base(s.level).tiles.map((row, r) => row.map((t, c) => {
      if (t === '~') return s.filled.includes(id(r, c)) ? '=' : '~';
      if (t === 'k') return s.taken.includes(id(r, c)) ? '.' : 'k';
      if (t === 'K') return s.unlocked.includes(id(r, c)) ? 'K+' : 'K';
      if (isDoor(t)) return doorOpen(s, r, c) ? t + '+' : t;
      if (isGate(t)) return t + (doorOpen(s, r, c) ? '1' : '0');
      if (isLever(t)) return t + (s.levers[t] ? '1' : '0');
      if (t === 'r') return s.broken.includes(id(r, c)) ? '.' : 'r';
      if (t === 'x' && s.broken.includes(id(r, c))) return 'h';
      if (t === '*') return s.coins.includes(id(r, c)) ? '.' : '*';
      if (t === 'S') return doorOpen(s, r, c) ? 'S+' : 'S';
      if (t === 'q') return doorOpen(s, r, c) ? 'q1' : 'q0';
      if (t === 'Q') return s.ptimer > 0 ? 'Q0' : 'Q1';
      if (t === 'Z') return beaten(s) ? 'Z+' : 'Z';
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
      heights: base(s.level).heights,
      // Copies, so a view stays as it was while the game moves on.
      boxes: s.boxes.map((b) => b && b.slice()),
      players: s.players.map((p) => p.slice()),
      keys: s.keys.slice(),
      coins: [s.coins.length, base(s.level).coins],
      ptimer: s.ptimer,
      boss: s.boss && {
        ...base(s.level).spec, path: undefined,
        pos: s.boss.pos && s.boss.pos.slice(), hp: s.boss.hp, maxHp: base(s.level).spec.hp, hits: s.boss.hits || 0,
        weakNow: s.boss.hp > 0 ? (Array.isArray(base(s.level).spec.weak) ? base(s.level).spec.weak[base(s.level).spec.hp - s.boss.hp] : base(s.level).spec.weak) : null,
      },
      ptime: P_TIME,
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
