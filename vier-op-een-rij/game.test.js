'use strict';
const test = require('node:test');
const assert = require('node:assert');
const { newBoard, drop, winningLine, isFull, ROWS, COLS } = require('./game');

test('discs stack from the bottom', () => {
  const b = newBoard();
  assert.strictEqual(drop(b, 3, 0), ROWS - 1);
  assert.strictEqual(drop(b, 3, 1), ROWS - 2);
});

test('full or invalid column is rejected', () => {
  const b = newBoard();
  for (let i = 0; i < ROWS; i++) drop(b, 0, i % 2);
  assert.strictEqual(drop(b, 0, 0), -1);
  assert.strictEqual(drop(b, COLS, 0), -1);
  assert.strictEqual(drop(b, 1.5, 0), -1);
});

test('detects horizontal, vertical and diagonal wins', () => {
  let b = newBoard();
  for (let c = 0; c < 4; c++) drop(b, c, 0);
  assert.strictEqual(winningLine(b, ROWS - 1, 3).length, 4);

  b = newBoard();
  let r;
  for (let i = 0; i < 4; i++) r = drop(b, 6, 1);
  assert.strictEqual(winningLine(b, r, 6).length, 4);

  b = newBoard();
  // Staircase: column c gets c filler discs then a seat-0 disc.
  for (let c = 0; c < 4; c++) {
    for (let k = 0; k < c; k++) drop(b, c, 1);
    r = drop(b, c, 0);
  }
  assert.ok(winningLine(b, r, 3));
});

test('three in a row is not a win', () => {
  const b = newBoard();
  for (let c = 0; c < 3; c++) drop(b, c, 0);
  assert.strictEqual(winningLine(b, ROWS - 1, 2), null);
});

test('isFull', () => {
  const b = newBoard();
  assert.strictEqual(isFull(b), false);
  for (let c = 0; c < COLS; c++) for (let r = 0; r < ROWS; r++) drop(b, c, (r + c) % 2);
  assert.strictEqual(isFull(b), true);
});
