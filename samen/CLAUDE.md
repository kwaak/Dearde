# CLAUDE.md — Samen

Notes for future sessions working on this folder. The rest of the Dearde repo
(Flutter app in `lib/`, `server/`, ...) is a separate project; leave it alone.

## What this is

**Samen** is a co-op puzzle game for two, inspired by *It Takes Two*. The
owner plays it with their girlfriend, side by side on the couch: each on their
own phone (online room, joined by QR code), or both on one phone. She is not
technical, so the UI must stay simple, friendly and pretty. **All user-facing
text is Dutch**; code and comments are English.

- **Mini** (seat 0) is small: fits through mouse holes and over cracked floor,
  but needs stairs to go up.
- **Maxi** (seat 1) is strong: pushes crates, smashes brick blocks, climbs one
  step.
- One seamless world of 27 areas in 8 zones. Both players standing on the
  hearts solves an area, and they warp on to the next one. Every zone ends
  with a boss.
- Isometric 3D (three.js), with a flat 2D fallback when WebGL is missing.
  Music and sounds are synthesised, landscape mode has floating joypads, and
  progress is saved automatically.

## Files

| File | Role |
|---|---|
| `game.js` | **The rules.** Pure, deterministic and shared: the server `require`s it and the browser loads it as `window.Samen`. `loadLevel`, `move`, `view`, `stateKey`, `cloneState`, `controlledBy`. |
| `world.js` | **The world data.** `ZONES` and `AREAS` (map strings, optional `heights`, optional `boss`, Dutch `tips` for Mini and Maxi). |
| `solver.js` | BFS solver used by the tests (and for level design). |
| `game.test.js` | Every area is solvable and impossible alone; regular zone peaks rise; every zone ends with a boss; unit tests per mechanic. |
| `server.js` | Zero-dependency Node HTTP server: rooms, SSE, persistence, static files (gzip + ETag), `/api/time`. |
| `public/index.html` | All UI and app logic (one inline module): lobby, start-area picker, QR invite, game screen, joypads, local mode, online prediction, landscape and fullscreen, boss HUD. |
| `public/board3d.js` | three.js world. It builds each area from a `view`, then handles characters, bosses, attacks, effects, the follow camera and the safe area between the joypads. |
| `public/textures.js` | Procedural canvas textures (no image files). |
| `public/sound.js` | Web Audio synth: 8 zone tunes plus a boss theme, and every sound effect. |
| `public/vendor/` | three.js r160 and qrcode.js, vendored (MIT). |

## Commands

```bash
cd samen
npm start                      # http://localhost:8080 (PORT, DATA_DIR env vars)
npm test                       # node --test — slow (~6–7 min): solves all 27 areas
node --test --test-name-pattern="boss" game.test.js   # quick subset
```

The zone-peak test reads results from the per-area tests. Run with a
`--test-name-pattern` that skips those, and it fails with `NaN`. That is
expected.

## Deploy (important)

- Production runs on the owner's VPS. The game is at
  `http://85.214.101.170:8095`.
- The VPS is **not reachable from the sandbox**. Only the owner deploys, by
  hand, through the Quizly deploy page at `http://85.214.101.170:9090`. It
  needs basic auth that only the owner has.
- They pick the branch **`ccr-6db8e7aa-ffj7e2`** of `kwaak/koechi-quiz`.

How a game change reaches production:

1. Commit and push in Dearde, on branch `ccr-6db8e7aa-ffj7e2`.
2. In `kwaak/koechi-quiz`, set `ARG DEARDE_COMMIT=<new sha>` in
   `deploy-games/samen/Dockerfile`, on the same branch name. Commit and push.
   That Dockerfile fetches Dearde at exactly that SHA.
3. Tell the owner to deploy that branch.

Production details:

- The compose service and container are still called **`vier-op-een-rij`**
  (port `8095:8080`) so they replace the old container. Volume `samen_data`
  is mounted at `/data`, which holds `rooms.json`.
- The koechi-quiz branch is not merged to `main` yet. The owner merges when
  they want.

Hard rules (these were explicitly settled):

- Never commit secrets. The owner pasted tokens and passwords in chat once;
  they must not end up anywhere.
- No auto-updater, backdoor or remote-shell endpoint on the VPS. The owner
  chose manual deploys.
- Don't modify Claude settings files, and don't push to other branches.

## The rules engine (`game.js`)

**Map legend**

- Basics:
  - `#` wall, `.` floor, `E` heart
  - `m` / `M` start of Mini / Maxi, `$` crate
- Mini only:
  - `o` mouse hole, `x` cracked floor
- Water and ice:
  - `~` water (a crate fills it and becomes a bridge)
  - `%` deep water (crates sink without a trace)
  - `_` ice: slide until stopped; the partner works as a stopper
- Buttons, doors and levers:
  - `a`–`d` buttons, `A`–`D` doors (open while the button is pressed)
  - `u` / `v` levers toggle gates `U` / `V`
  - `k` key, `K` lock
- From Mario:
  - `1`–`4` warp pipes, used in pairs
  - `r` brick (Maxi smashes it)
  - `j` springboard: jumps over one tile, one level up at most
  - `*` coin; `S` star door opens once all coins are collected
  - `p` P-switch: makes the dotted blocks `q` solid for 8 moves
- Heights:
  - optional `heights` rows of digits, one per tile
  - `/` stairs: the only way up for Mini
  - crates fall down ledges, never up
- Bosses:
  - `G` boss start (`boss.under` sets the tile below it)
  - `Z` cage: opens once the boss is beaten
  - `T` flower trap: snaps when the last pink `a` goes down
  - `Q` crumbly bridge: falls away while the P-switch runs

**Bosses** (`area.boss`)

- Fields: `{ name, look, hp: 3, weak, path? | chase, swim?, every?, phases: [...] }`.
- `look` picks the 3D model and 2D emoji: `mol pinguin golem inktvis draak spook jeti dief`.
- `weak` is one of `trap crate fall water collapse squeeze drop`.
- One phase per life. Each phase merges over the spec and can set:
  - `weak`, `path`, `home`
  - `set: { tileChar: [[r,c],...] }` (cumulative arena changes)
  - `boxes` (new crates)
  - `attack: { every, aim: 'row'|'col'|'plus' }`
  - `hide`, `swap`, `say` (Dutch announcement)
- Patrol bosses follow `path`. Chasing bosses step towards the nearest
  player and shove them. With nobody in reach they walk home, which is why
  one player must be the bait.
- Attacks: one turn of warning (`warn` cells), then a strike sends players on
  those cells back to their start (`knocked`).
- `controlledBy(s, seat)` handles swapped controls. The server, the client
  prediction **and test bots** must map seats through it.

**Invariants and gotchas**

- `view()` must return **copies** (players, boxes, boss pos). Local mode
  diffs successive views for sounds and animations; shared arrays made
  everything look unchanged.
- Letters are global. `B` is door B, so the boss start is `G`. Check the
  legend before adding a tile character.
- `stateKey` must contain everything that matters for the puzzle, but no
  ever-growing counters (the boss attack timer is kept modulo 2×`every`).
  Otherwise the BFS never ends.
- Patrol bosses must check `bossCanEnter` for the next stop. One once walked
  onto a collapsed bridge and got hit three times by a single press.

## Level design workflow

- Each area needs:
  - a solution, found by the solver;
  - Mini alone and Maxi alone can't reach a heart (area 0 is exempt for
    Mini);
  - regular-area zone peaks that keep rising: tuin < ijs < grot < meer <
    paddo < kasteel < berg < hart (bosses are excluded).
- Prototype in the scratchpad, not in `world.js`. Write
  `module.exports = [{ title, map, heights?, boss? }]` and a small harness
  that pushes the area onto `G.AREAS`. Then run `solve()` and a
  single-seat BFS for the "alone" check.
- **Keep arenas small and corridor-like.** Open rooms with two free players
  plus a chasing boss blow past `maxStates` (3e6) or take many minutes.
  Bosses already make the suite slow.
- Areas are found back in saves **by title**. Renaming a title restarts that
  area for saved games, so rename only on purpose.

## Server and online play

- Rooms have 4-character codes and a token per seat (stored in `localStorage`
  as `samen.room.<code>`). A third phone can claim a free seat.
- Persistence: `DATA_DIR/rooms.json`, written with a 1 s debounce and an
  atomic rename, and flushed on SIGTERM. Rooms expire after 60 days.
- **Client prediction.** The phone runs its own player's move at once with
  `game.js`. It keeps `pending` moves and sends every unconfirmed move with a
  rising `seq`. The server skips `seq <= acked[seat]` and broadcasts
  `{ state, acked, mover }`, and the phone replays its pending moves on top.
  Only plain walls bump locally; any other failed move is still sent,
  because the partner may just have opened the way.
- Sounds online: each phone plays effects only for `mover === you`, so two
  phones on the couch don't echo.

## Music sync (`sound.js`)

- Songs loop on a grid hung off the **server clock**. The phone syncs via
  `/api/time` (lowest round trip of 5 pings, re-synced each minute) and
  schedules notes on the AudioContext clock, corrected for output latency.
  Measured difference between two phones: 1–3 ms.
- Audio starts on the first tap (browser rule). The 🔊 button cycles
  between all / sounds only / off (`samen.sound`).

## Testing in a browser (Playwright)

- Playwright lives at `/opt/node22/lib/node_modules/playwright`. Start a
  scratch server with `PORT=8126 DATA_DIR=<scratch> node server.js`, from
  the `samen/` folder. `pkill`/`pgrep` can kill your own shell, so use pid
  files.
- For the fast 2D path, launch Chromium with `--disable-webgl`. For 3D, use
  `--use-gl=swiftshader --enable-webgl --ignore-gpu-blocklist` and
  `page.clock.install()` / `clock.runFor()` for deterministic animation
  shots.
- Chrome's network throttling **doesn't apply to localhost**. To simulate bad
  wifi, put a small TCP proxy in between that delays every chunk.
- A useful end-to-end check: play every area with `solve()` paths, using
  WASD for Mini and the arrow keys for Maxi, mapped through
  `controlledBy`. Expect the 🏆 overlay ("Alle 27 gebieden ...").
- `board3d.js` must time animations with `performance.now()`, not the rAF
  timestamp; that lag once made steps run backwards.

## Conventions

- The owner reads Dutch, so reply in Dutch. Keep summaries short, and
  always end with the deploy instruction (branch + deploy page).
- Commits are one focused change with a real subject and a body explaining
  why. Never put model names in commits or code.
- Before calling something done: `node --test` (or the relevant subset),
  plus a browser run for UI changes, with screenshots checked.

## Open points

- Boe's "only the nearest player sees him" is computed, but has not been
  verified on two real phones.
- Bosses that depend on exact timing (Graaf Mol's flower trap) can feel
  off on very slow connections: the order of moves at the server decides.
- The test suite takes ~6–7 minutes, mostly the boss areas. Speeding up the
  solver (e.g. typed-array state keys) would help.
