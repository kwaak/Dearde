# Samen 💞

A small co-op puzzle world for two phones, inspired by *It Takes Two*. Two
characters with different powers can only get through it together:

- **Mini** (player 1) is small: fits through mouse holes and over cracked floor.
- **Maxi** (player 2) is strong: pushes crates, also into water as a bridge.

The world is one journey through eight zones, each adding something new:
the Garden (buttons and doors), the Ice Plain (you slide until something
stops you, and a partner makes a fine stopper), the Cave (mouse holes,
cracked floor, crates), the Lake (crate bridges), the Mushroom Kingdom
(tricks borrowed from the Mario games: warp pipes, brick blocks only Maxi can
smash, springboards, coins that open a star door and a P-switch that turns
dotted blocks solid for 8 moves), the Castle (keys, locks and levers), the
Mountains (height: Maxi climbs one step, Mini needs stairs, anyone can jump
down, crates fall off ledges, a springboard lifts you one level) and the
Heart, where everything comes together. Areas bigger than the screen get a
camera that follows the players; online, when the two are far apart, each
phone follows its own player. When both players
stand on the hearts of an area they walk over a little bridge into the next
one. There are no level screens in between.

Every zone ends with a boss guarding the hearts in a cage. Bosses take a
step after every move (walking a round, or chasing the nearest player and
shoving them aside), and each has its own weak spot that takes the two of
you:

- **Graaf Mol** (Garden): a flower trap that snaps when the last of two pink
  buttons goes down while he is on it.
- **Keizer Brrr** (Ice): a penguin sliding after you; hit him with a
  crate sliding over the ice.
- **Rommel de Rotsreus** (Cave): too heavy for cracked floor; Mini lures him
  across and he crashes through, leaving a hole.
- **Inkie de Inktvis** (Lake): swims to whoever stands at the shore; Maxi
  drops a crate on her through a chute. Missed crates sink in the deep.
- **Draak Knorbert** (Mushroom Kingdom): patrols a crumbly bridge that falls
  away when the P-switch is pressed.
- **Spookridder Boe** (Castle): only beaten by squeezing him between Mini
  and Maxi.
- **Jeti Joep** (Mountains): lured under a ledge, then a crate drops on him.
- **De Hartendief** (Heart): changes his weak spot after every hit: flower
  trap, crate, squeeze.

A chasing boss with nobody in reach walks back home, so one of you has to be
the bait while the other strikes.

Areas live in `world.js`. The tests run a solver over every area: each one
must be solvable, impossible for either player alone, and every zone must
peak harder than the one before.

The start screen lets you pick the area to begin in.

Progress is saved after every step, in `DATA_DIR` (default `./data`) on the
server, and in the browser for the one-phone mode. Opening the game later
offers *Verder spelen*. On another phone you enter the code and pick who you
are.

The board is an isometric 3D diorama drawn with three.js (vendored in
`public/vendor`, MIT), with textures painted procedurally at start-up
(`public/textures.js`, so there are no image files). The arrow buttons point the way the characters walk
on screen. Phones without WebGL get a flat 2D board. Held sideways, the world fills the
screen and the joypads float over it (one in each corner when two people
share one phone). Each phone only shows
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
