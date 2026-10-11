// Samen: a tiny co-op puzzle game for two players, inspired by It Takes Two.
// Mini (seat 0) is small and fits through tunnels; Maxi (seat 1) is strong
// and pushes crates. Plates open their door while something stands on them.
// Shared by the server (require) and the browser (window.Samen).
(function (root) {
  'use strict';

  // # wall  . floor  o tunnel (Mini only)  $ crate  a-d plate  A-D door
  // E exit  m Mini start  M Maxi start
  const LEVELS = [
    {
      title: 'Help elkaar',
      tips: [
        'Stap op de blauwe knop. Dan gaat de blauwe deur open voor Maxi.',
        'Loop door de blauwe deur en stap op de roze knop. Dan kan Mini eruit.',
      ],
      map: [
        '#########',
        '#m..#..M#',
        '#.b.#...#',
        '##A###B##',
        '#..a....#',
        '#E.....E#',
        '#########',
      ],
    },
    {
      title: 'Klein en sterk',
      tips: [
        'Kruip door het muizengat en stap op de blauwe knop voor Maxi.',
        'Duw de kist op de roze knop. Dan blijft de roze deur open.',
      ],
      map: [
        '############',
        '#m.o..b#M..#',
        '#..#...B.$.#',
        '####...#.a.#',
        '#E..A..#...#',
        '#E..########',
        '############',
      ],
    },
    {
      title: 'Vertrouwen',
      tips: [
        'Kruip door het muizengat en blijf op de blauwe knop staan.',
        'Duw de kist door de blauwe deur en op de roze knop.',
      ],
      map: [
        '############',
        '#M...#.....#',
        '#..$.B.....#',
        '#....#..a..#',
        '######.....#',
        '#m..o..b...#',
        '#...#####A##',
        '######E...E#',
        '############',
      ],
    },
    {
      title: 'Om de beurt',
      tips: [
        'Jullie gaan om de beurt. Stap op de paarse knop, en later op de groene.',
        'Als je erlangs bent: stap op de roze knop, en later op de blauwe.',
      ],
      map: [
        '##############',
        '#m.c.A.d.B..E#',
        '##############',
        '#M...C.a.D.bE#',
        '##############',
      ],
    },
    {
      title: 'Estafette',
      tips: [
        'Stap op de blauwe knop, zodat Maxi eruit kan.',
        'Stap op de roze knop voor Mini. Duw daarna de kist op de paarse knop.',
      ],
      map: [
        '###########',
        '#m..#.....#',
        '#.b.A..a..#',
        '#####.$...#',
        '#M..B.....#',
        '#...#.c...#',
        '#####C#####',
        '#E.......E#',
        '###########',
      ],
    },
    {
      title: 'Doolhof',
      tips: [
        'Zoek de weg door de muizengaten naar de roze knop.',
        'Duw de kist op de blauwe knop: eerst opzij, dan omhoog.',
      ],
      map: [
        '#############',
        '#M..A..b#...#',
        '#...#.$.B.E.#',
        '#####...#.E.#',
        '#m.o.##.#...#',
        '#.#####.#####',
        '#.o..a..#####',
        '#############',
      ],
    },
    {
      title: 'Kistenkamer',
      tips: [
        'Wacht tot Maxi je deuren openduwt. Stap dan op de paarse knop.',
        'Duw de kisten op de roze en de blauwe knop.',
      ],
      map: [
        '#############',
        '#M.....#....#',
        '#..$.$.C.c..#',
        '#a.....#..E.#',
        '#.....b#..E.#',
        '#########B###',
        '#m....A.....#',
        '#############',
      ],
    },
    {
      title: 'Samen sterk',
      tips: [
        'Blijf op de blauwe knop staan tot Maxi met de kist door de deur is.',
        'Duw een kist door de blauwe deur. Er moeten kisten op de paarse én de roze knop.',
      ],
      map: [
        '#############',
        '#M..#.......#',
        '#.$.B..$..a.#',
        '#...#..c....#',
        '#####C####A##',
        '#m.b.....#E.#',
        '#........#E.#',
        '#############',
      ],
    },
    {
      title: 'Twee kisten',
      tips: [
        'Stap op een blauwe knop, zodat Maxi met een kist naar beneden kan.',
        'Duw een kist door de blauwe deur op de andere blauwe knop. De tweede kist moet op de roze knop.',
      ],
      map: [
        '############',
        '#M.....#...#',
        '#..$.$.A..E#',
        '#...a..#..E#',
        '###B########',
        '#b.........#',
        '#..b.....m.#',
        '############',
      ],
    },
    {
      title: 'Finale',
      tips: [
        'Kruip naar de blauwe knop. Daarna mag je door de roze deur.',
        'Duw de kist naar beneden, stap op de roze knop voor Mini en duw de kist op de paarse knop.',
      ],
      map: [
        '##############',
        '#m..o..#M....#',
        '#..#.b.#..$..#',
        '##A#######B###',
        '#....a.......#',
        '#......c.....#',
        '########C#####',
        '#######E...E.#',
        '##############',
      ],
    },
  ];

  const DIRS = { up: [-1, 0], down: [1, 0], left: [0, -1], right: [0, 1] };

  function loadLevel(index) {
    const map = LEVELS[index].map;
    const tiles = [];
    const boxes = [];
    const players = [null, null];
    map.forEach((line, r) => {
      const row = [];
      [...line].forEach((ch, c) => {
        if (ch === '$') boxes.push([r, c]);
        if (ch === 'm') players[0] = [r, c];
        if (ch === 'M') players[1] = [r, c];
        row.push('$mM'.includes(ch) ? '.' : ch);
      });
      tiles.push(row);
    });
    return { level: index, tiles, boxes, players, moves: 0, solved: false };
  }

  const same = (a, b) => a[0] === b[0] && a[1] === b[1];
  const boxAt = (s, r, c) => s.boxes.findIndex((b) => b[0] === r && b[1] === c);
  const playerAt = (s, r, c) => s.players.findIndex((p) => p[0] === r && p[1] === c);
  const occupied = (s, r, c) => boxAt(s, r, c) >= 0 || playerAt(s, r, c) >= 0;

  function platePressed(s, letter) {
    for (let r = 0; r < s.tiles.length; r++) {
      for (let c = 0; c < s.tiles[r].length; c++) {
        if (s.tiles[r][c] === letter && occupied(s, r, c)) return true;
      }
    }
    return false;
  }

  // A door also stays open while something stands in the doorway, so it
  // never closes on a player or a crate.
  function doorOpen(s, r, c) {
    return platePressed(s, s.tiles[r][c].toLowerCase()) || occupied(s, r, c);
  }

  function isDoor(t) { return t >= 'A' && t <= 'D'; }

  function passable(s, r, c, seat, forBox) {
    const t = s.tiles[r] && s.tiles[r][c];
    if (!t || t === '#') return false;
    if (t === 'o') return !forBox && seat === 0;
    if (isDoor(t)) return doorOpen(s, r, c);
    return true;
  }

  // Moves `seat` one step; returns true when something changed.
  function move(s, seat, dir) {
    const d = DIRS[dir];
    if (!d || s.solved) return false;
    const [r, c] = s.players[seat];
    const nr = r + d[0];
    const nc = c + d[1];
    if (!passable(s, nr, nc, seat, false) || playerAt(s, nr, nc) >= 0) return false;
    const box = boxAt(s, nr, nc);
    if (box >= 0) {
      if (seat !== 1) return false;
      const br = nr + d[0];
      const bc = nc + d[1];
      if (!passable(s, br, bc, seat, true) || occupied(s, br, bc)) return false;
      s.boxes[box] = [br, bc];
    }
    s.players[seat] = [nr, nc];
    s.moves += 1;
    s.solved = s.players.every(([pr, pc]) => s.tiles[pr][pc] === 'E');
    return true;
  }

  // Read-only view the client renders: static tiles plus open/closed doors.
  function view(s) {
    return {
      level: s.level,
      levels: LEVELS.length,
      title: LEVELS[s.level].title,
      tips: LEVELS[s.level].tips,
      tiles: s.tiles.map((row, r) => row.map((t, c) =>
        (isDoor(t) && doorOpen(s, r, c) ? t.toLowerCase() + '_open' : t))),
      boxes: s.boxes,
      players: s.players,
      moves: s.moves,
      solved: s.solved,
    };
  }

  const api = { LEVELS, DIRS, loadLevel, move, view, same };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else root.Samen = api;
})(this);
