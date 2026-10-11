'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { AREAS, ZONES, loadLevel, cloneState, stateKey, move } = require('./game');
const { solve } = require('./solver');

// Can `seat` reach a heart while the partner stays at the start?
function reachesHeartAlone(level, seat) {
  const start = loadLevel(level);
  const seen = new Set([stateKey(start)]);
  let frontier = [start];
  while (frontier.length) {
    const next = [];
    for (const s of frontier) {
      for (const dir of ['up', 'down', 'left', 'right']) {
        const n = cloneState(s);
        if (!move(n, seat, dir)) continue;
        const [r, c] = n.players[seat];
        if (AREAS[level].map[r][c] === 'E') return true;
        const k = stateKey(n);
        if (!seen.has(k)) { seen.add(k); next.push(n); }
      }
    }
    frontier = next;
  }
  return false;
}

// A tiny extra area for rule tests. Each gets its own index, because
// parsed maps are cached per index.
function scratch(map, heights) {
  AREAS.push({ zone: 'test', title: 'test', tips: ['', ''], map, heights });
  return { s: loadLevel(AREAS.length - 1) };
}

const steps = [];
for (let i = 0; i < AREAS.length; i++) {
  test(`area ${i + 1} "${AREAS[i].title}" is solvable and needs both players`, () => {
    const path = solve(i);
    assert.ok(path, 'unsolvable');
    steps[i] = path.length;
    // The very first area is a warm-up where Mini may walk to a heart.
    if (i > 0) assert.strictEqual(reachesHeartAlone(i, 0), false, 'Mini reaches a heart alone');
    assert.strictEqual(reachesHeartAlone(i, 1), false, 'Maxi reaches a heart alone');
  });
}

test('every zone peaks harder than the zone before it', () => {
  let previous = 0;
  for (const zone of ZONES) {
    const peak = Math.max(...AREAS.map((a, i) => (a.zone === zone.id ? steps[i] : 0)));
    assert.ok(peak > previous, `${zone.name} peaks at ${peak}, not above ${previous}`);
    previous = peak;
  }
});

test('ice: you slide until something stops you, a partner included', () => {
  const { s } = scratch(['#######', '#m____#', '#.....#', '#M....#', '#######']);
  move(s, 0, 'right');
  assert.deepStrictEqual(s.players[0], [1, 5]);
  s.players[0] = [1, 1];
  s.players[1] = [1, 4];
  move(s, 0, 'right');
  assert.deepStrictEqual(s.players[0], [1, 3]);
});

test('water: a crate pushed in becomes a bridge', () => {
  const { s } = scratch(['######', '#M$~.#', '#m...#', '######']);
  assert.ok(move(s, 1, 'right'));
  assert.deepStrictEqual(s.boxes, [null]);
  assert.deepStrictEqual(s.filled, ['1,3']);
  assert.ok(move(s, 1, 'right'));
  assert.ok(move(s, 1, 'right'));
  assert.deepStrictEqual(s.players[1], [1, 4]);
});

test('cracked floor and mouse holes are for Mini only', () => {
  const { s } = scratch(['#####', '#mx.#', '#Mo.#', '#####']);
  assert.ok(move(s, 0, 'right'));
  assert.strictEqual(move(s, 1, 'right'), false);
});

test('levers flip their gate every time you step on them', () => {
  const { s } = scratch(['#######', '#mu.U.#', '#M....#', '#######']);
  move(s, 0, 'right');
  assert.strictEqual(s.levers.u, true);
  move(s, 0, 'right');
  assert.ok(move(s, 0, 'right'), 'gate open');
  move(s, 0, 'left');
  move(s, 0, 'left');
  move(s, 0, 'left');
  assert.strictEqual(s.levers.u, false);
});

test('a key opens one lock, for whoever carries it', () => {
  const { s } = scratch(['#######', '#mk.KK#', '#M....#', '#######']);
  assert.ok(move(s, 0, 'right'));
  assert.deepStrictEqual(s.keys, [1, 0]);
  move(s, 0, 'right');
  assert.ok(move(s, 0, 'right'), 'first lock opens');
  assert.strictEqual(move(s, 0, 'right'), false, 'no key left');
});

test('doors open only while their button is pressed', () => {
  const s = loadLevel(0); // Maxi above door B, button b in Mini's room
  s.players[1] = [2, 5];
  assert.strictEqual(move(s, 1, 'down'), false);
  s.players[0] = [2, 2];
  assert.ok(move(s, 1, 'down'));
});

test('a warp pipe pops you out of the other pipe with the same number', () => {
  const { s } = scratch(['#######', '#m1#1.#', '#M.#..#', '#######']);
  assert.ok(move(s, 0, 'right'));
  assert.deepStrictEqual(s.players[0], [1, 4]);
  assert.ok(move(s, 0, 'right'));
  assert.ok(move(s, 0, 'left'), 'and back again');
  assert.deepStrictEqual(s.players[0], [1, 2]);
});

test('only Maxi smashes brick blocks', () => {
  const { s } = scratch(['#####', '#mr.#', '#Mr.#', '#####']);
  assert.strictEqual(move(s, 0, 'right'), false);
  assert.ok(move(s, 1, 'right'), 'the block breaks');
  assert.deepStrictEqual(s.players[1], [2, 1], 'Maxi stays put');
  assert.ok(move(s, 1, 'right'));
  assert.deepStrictEqual(s.players[1], [2, 2]);
});

test('a springboard bounces you over water, but not over walls', () => {
  const { s } = scratch(['#######', '#mj~..#', '#.j#..#', '#M....#', '#######']);
  assert.ok(move(s, 0, 'right'));
  assert.deepStrictEqual(s.players[0], [1, 4]);
  s.players[0] = [2, 1];
  assert.ok(move(s, 0, 'right'));
  assert.deepStrictEqual(s.players[0], [2, 2], 'stays on the spring');
});

test('the star door opens once every coin is collected', () => {
  const { s } = scratch(['#######', '#m*..S#', '#M.*.##', '#######']);
  move(s, 0, 'right');
  move(s, 0, 'right');
  move(s, 0, 'right');
  assert.strictEqual(move(s, 0, 'right'), false, 'one coin is not enough');
  move(s, 1, 'right');
  move(s, 1, 'right');
  assert.ok(move(s, 0, 'right'), 'all coins: open');
});

test('a P-switch makes the dotted blocks solid for a few moves', () => {
  const { s } = scratch(['#############', '#mpqqqqqqqqq#', '#M..........#', '#############']);
  assert.strictEqual(move(s, 1, 'up'), false, 'blocked by Mini');
  assert.ok(move(s, 0, 'right'));
  for (let i = 0; i < 8; i++) assert.ok(move(s, 0, 'right'), `step ${i + 1} on the blocks`);
  assert.strictEqual(move(s, 0, 'right'), false, 'time is up');
});

test('heights: Maxi climbs one step, Mini only takes stairs, anyone jumps down', () => {
  const { s } = scratch(
    ['#######', '#m./..#', '#M....#', '#######'],
    ['0000000', '0001110', '0001200', '0000000'],
  );
  assert.ok(move(s, 0, 'right'));
  assert.ok(move(s, 0, 'right'), 'onto the stairs');
  assert.ok(move(s, 0, 'right'));
  s.players[0] = [2, 2];
  assert.strictEqual(move(s, 0, 'right'), false, 'Mini cannot climb a ledge');
  s.players[0] = [1, 1];
  s.players[1] = [2, 2];
  assert.ok(move(s, 1, 'right'), 'Maxi climbs one step');
  assert.ok(move(s, 1, 'right'), 'and another');
  assert.ok(move(s, 1, 'right'), 'jumping down is fine');
  assert.strictEqual(move(s, 1, 'left'), false, 'two steps up is too high');
});
