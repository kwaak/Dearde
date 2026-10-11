# Samen 💞

A small co-op puzzle game for two phones, inspired by *It Takes Two*. Two
characters have different powers and can only reach the hearts together:

- **Mini** (player 1) is small and fits through mouse holes.
- **Maxi** (player 2) is big and pushes crates.
- A coloured **button** (pink, blue, purple or green) opens the door with the same colour, but only while
  someone (or a crate) is standing on it.

There are ten levels, getting harder as you go. It's made for two people on
the couch, each with a phone. Hints are hidden behind a 💡 button, and each
phone only shows its own player's hint, so you have to talk to each other
to get through.
Plain Node.js with no npm dependencies, and a single static page.

- **Two phones:** phone 1 taps *Start een spel* and shows a QR code. Phone 2
  scans it with the camera and taps *Speel mee!*.
- **One phone:** *Liever samen op één telefoon?* shows two sets of arrow
  buttons.

`game.js` holds the rules and the levels and is shared by the server and the
browser. The tests run a solver over every level. They check that each level
can be solved, and that neither player can solve it alone. Rooms live in
memory, so a restart clears running games.

## Local development

```bash
cd samen
npm start          # http://localhost:8080  (PORT=... to change)
npm test           # rules + level solver
```

## Deploy

Quizly's deploy page (koechi-quiz) builds this folder as part of a Quizly
deploy. See `deploy-games/` in koechi-quiz. It runs on port 8095.
