'use strict';

const ROWS = 6;
const COLS = 7;

function newBoard() {
  return Array.from({ length: ROWS }, () => Array(COLS).fill(null));
}

// Returns the row the disc landed in, or -1 when the column is full/invalid.
function drop(board, col, seat) {
  if (!Number.isInteger(col) || col < 0 || col >= COLS) return -1;
  for (let r = ROWS - 1; r >= 0; r--) {
    if (board[r][col] === null) {
      board[r][col] = seat;
      return r;
    }
  }
  return -1;
}

// Winning line through (row, col) as [[r, c], ...], or null.
function winningLine(board, row, col) {
  const seat = board[row][col];
  if (seat === null) return null;
  for (const [dr, dc] of [[0, 1], [1, 0], [1, 1], [1, -1]]) {
    const line = [[row, col]];
    for (const sign of [1, -1]) {
      let r = row + dr * sign;
      let c = col + dc * sign;
      while (r >= 0 && r < ROWS && c >= 0 && c < COLS && board[r][c] === seat) {
        line.push([r, c]);
        r += dr * sign;
        c += dc * sign;
      }
    }
    if (line.length >= 4) return line;
  }
  return null;
}

function isFull(board) {
  return board[0].every((cell) => cell !== null);
}

module.exports = { ROWS, COLS, newBoard, drop, winningLine, isFull };
