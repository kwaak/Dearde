# Samen 💞

A small co-op puzzle world for two phones, inspired by *It Takes Two*. Two
characters with different powers can only get through it together:

- **Mini** (player 1) is small: fits through mouse holes and over cracked floor.
- **Maxi** (player 2) is strong: pushes crates, also into water as a bridge.

The world is one journey through six zones, each adding something new:
the Garden (buttons and doors), the Ice Plain (you slide until something
stops you, and a partner makes a fine stopper), the Cave (mouse holes,
cracked floor, crates), the Lake (crate bridges), the Castle (keys, locks and
levers) and the Heart, where everything comes together. When both players
stand on the hearts of an area they walk over a little bridge into the next
one. There are no level screens in between.

Areas live in `world.js`. The tests run a solver over every area: each one
must be solvable, impossible for either player alone, and every zone must
peak harder than the one before.

Progress is saved after every step, in `DATA_DIR` (default `./data`) on the
server, and in the browser for the one-phone mode. Opening the game later
offers *Verder spelen*. On another phone you enter the code and pick who you
are.

The board is an isometric 3D diorama drawn with three.js (vendored in
`public/vendor`, MIT), with textures painted procedurally at start-up
(`public/textures.js`, so there are no image files). The arrow buttons point the way the characters walk
on screen. Phones without WebGL get a flat 2D board. Each phone only shows
its own player's hint, behind a 💡 button, so you have to talk to each other.

## Local development

```bash
cd samen
npm start          # http://localhost:8080  (PORT=... to change)
npm test           # rules + solver over the whole world
```

## Deploy

Quizly's deploy page (koechi-quiz) builds this folder as part of a Quizly
deploy. See `deploy-games/` in koechi-quiz. It runs on port 8095.
