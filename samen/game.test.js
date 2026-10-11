'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { LEVELS, loadLevel, move } = require('./game');

const key = (s) => JSON.stringify([s.players, [...s.boxes].map(String).sort()]);
const clone = (s) => ({ ...s, players: s.players.map((p) => p.slice()), boxes: s.boxes.map((b) => b.slice()) });

// Breadth-first search over both players' moves; returns the shortest
// solution length, or -1. Optionally freeze one seat to prove co-op is needed.
function solve(level, onlySeat = null) {
  const start = loadLevel(level);
  const seen = new Set([key(start)]);
  let frontier = [start];
  for (let depth = 1; frontier.length && depth < 200; depth++) {
    const next = [];
    for (const s of frontier) {
      for (const seat of [0, 1]) {
        if (onlySeat !== null && seat !== onlySeat) continue;
        for (const dir of ['up', 'down', 'left', 'right']) {
          const n = clone(s);
          if (!move(n, seat, dir)) continue;
          if (n.solved) return depth;
          const k = key(n);
          if (!seen.has(k)) { seen.add(k); next.push(n); }
        }
      }
    }
    frontier = next;
  }
  return -1;
}

for (let i = 0; i < LEVELS.length; i++) {
  test(`level ${i + 1} "${LEVELS[i].title}" is solvable and needs both players`, () => {
    const steps = solve(i);
    assert.ok(steps > 0, 'unsolvable');
    // Neither player can even leave their start area alone: freezing the
    // other one must make the level unsolvable.
    assert.strictEqual(solve(i, 0), -1, 'Mini can solve it alone');
    assert.strictEqual(solve(i, 1), -1, 'Maxi can solve it alone');
    console.log(`level ${i + 1}: ${steps} moves minimum`);
  });
}

test('Mini fits through tunnels, Maxi does not; only Maxi pushes crates', () => {
  const s = loadLevel(1); // Mini at (1,1), tunnel at (1,3)
  assert.ok(move(s, 0, 'right'));
  assert.ok(move(s, 0, 'right')); // into the tunnel
  const t = loadLevel(1);
  t.players[1] = [1, 2];
  assert.strictEqual(move(t, 1, 'right'), false);

  const b = loadLevel(1); // crate at (2,9)
  b.players[1] = [1, 9];
  assert.ok(move(b, 1, 'down'));
  assert.deepStrictEqual(b.boxes[0], [3, 9]);
  b.players[0] = [2, 9];
  b.players[1] = [1, 8];
  assert.strictEqual(move(b, 0, 'down'), false); // Mini can't push
});

test('doors open only while their plate is pressed', () => {
  const s = loadLevel(0); // Maxi above door B, plate b in Mini's room
  s.players[1] = [2, 6];
  assert.strictEqual(move(s, 1, 'down'), false);
  s.players[0] = [2, 2]; // Mini on plate b
  assert.ok(move(s, 1, 'down'));
});
