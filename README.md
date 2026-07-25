# Galactic Conflict

A Flutter game for Android, inspired by classic persistent browser-based
empire games such as *Imperial Conflict*: found a space empire, develop your
planets, raise fleets, and conquer the galaxy from rival empires — all on a
world that keeps ticking even while the app is closed.

Everything runs **locally on your phone**. There is no server to host and no
account needed: the galaxy is simulated on-device and saved to local storage,
with offline catch-up when you return.

## Gameplay

- **Planets** — every planet has limited building slots. Construct Living
  Quarters (population), Farms (food), Ore Mines, Cash Factories (credits),
  Research Labs, and Defense Stations.
- **Resources** — population pays taxes, farms feed people (famine shrinks
  your population!), ore and credits pay for buildings and ships, research
  unlocks technology levels that boost everything by 5% per level.
- **Fleets** — build Fighters, Bombers, Transports, and Dreadnoughts.
  Fleets travel in real ticks across the starmap; attacks need at least one
  Transport to occupy a planet after winning the battle.
- **Rivals** — three AI empires expand and raid on their own. Watch the
  Fleets tab for incoming hostiles.
- **Victory** — control 60% of the galaxy's planets.

One game tick is 5 seconds of real time. When you close the app the world
catches up when you come back (capped, so a long absence doesn't ruin you).

## Install on your phone (Android)

Every push builds an APK via GitHub Actions:

1. Open the repository's **Actions** tab and pick the latest
   **Build Android APK** run.
2. Download the **galactic-conflict-apk** artifact and unzip it to get
   `app-release.apk`.
3. Copy it to your phone (or download it there directly), open it, and allow
   installing from unknown sources when Android asks.

## Develop locally

```sh
flutter pub get
flutter test          # engine + widget tests
flutter run           # on a connected device or emulator
flutter build apk     # release APK in build/app/outputs/flutter-apk/
```

## Project layout

```
lib/
  models/    game data model (empires, planets, fleets, missions) + JSON
  engine/    deterministic game rules: galaxy generation, ticks, combat, AI
  game/      GameController: tick timer, offline catch-up, save/load, actions
  ui/        screens: empire overview, starmap, planet, fleets, news
```

## About hosting / multiplayer

This version is deliberately single-player and serverless, so nothing needs
to be hosted. The engine is isolated from the UI (`lib/engine`, pure Dart and
fully unit-tested), so a future multiplayer version could move the same tick
logic onto a small server — free tiers such as Fly.io, Render, or Cloudflare
Workers with a Dart/other backend would be enough for a hobby-scale galaxy.
