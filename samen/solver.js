'use strict';
// Breadth-first solver for Samen areas, used by the tests to prove every
// area is solvable, needs both players, and to measure its difficulty.
const { loadLevel, cloneState, stateKey, move } = require('./game');

const DIRS = ['up', 'down', 'left', 'right'];

// Shortest solution as a list of [seat, dir], or null. `onlySeat` freezes
// the other player, to check that nobody can do an area alone.
function solve(level, { onlySeat = null, maxStates = 3e6 } = {}) {
  const start = loadLevel(level);
  const seen = new Map([[stateKey(start), null]]);
  let frontier = [start];
  while (frontier.length && seen.size < maxStates) {
    const next = [];
    for (const s of frontier) {
      const from = stateKey(s);
      for (const seat of [0, 1]) {
        if (onlySeat !== null && seat !== onlySeat) continue;
        for (const dir of DIRS) {
          const n = cloneState(s);
          if (!move(n, seat, dir)) continue;
          const k = stateKey(n);
          if (seen.has(k)) continue;
          seen.set(k, [from, seat, dir]);
          if (n.solved) {
            const path = [];
            for (let cur = k; seen.get(cur); cur = seen.get(cur)[0]) {
              const [prev, st, d] = seen.get(cur);
              path.unshift([st, d]);
            }
            return path;
          }
          next.push(n);
        }
      }
    }
    frontier = next;
  }
  return null;
}

module.exports = { solve };
