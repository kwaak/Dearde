# Galactic Conflict

A Flutter game for Android, inspired by classic persistent browser-based
empire games such as *Imperial Conflict*: found a space empire, develop your
planets, raise fleets, and conquer the galaxy from rival empires — on a world
that keeps ticking even while the app is closed.

Two ways to play:

- **Local empire** — everything runs on your phone against three AI rivals.
  No server, no account; the galaxy is simulated on-device with offline
  catch-up when you return.
- **Online galaxy** — connect to a self-hosted
  [Galactic Conflict server](server/README.md) and compete with other
  players in one shared, persistent galaxy that ticks server-side.

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

1. Open the repository's **Actions** tab and pick the latest **CI** run.
2. Download the **galactic-conflict-apk** artifact and unzip it to get
   `app-release.apk`.
3. Copy it to your phone (or download it there directly), open it, and allow
   installing from unknown sources when Android asks.

## Host your own galaxy (multiplayer)

The multiplayer server lives in [`server/`](server/README.md) and shares the
exact same engine as the app. Quick start:

```sh
cd server && dart pub get && dart run bin/server.dart
```

Then pick **Online galaxy** in the app and enter the server address.
Ready-made deploy configs are included for **Fly.io** (`fly.toml`, free tier
with a persistent volume) and **Render** (`render.yaml`), plus a
`server/Dockerfile` for any Docker host; CI publishes a prebuilt image to
GHCR on every push. See [server/README.md](server/README.md) for the
step-by-step guide and the REST API.

## Develop locally

```sh
flutter pub get
flutter test                                  # app widget tests
(cd packages/game_core && dart test)          # engine tests
(cd server && dart test)                      # server/API tests
flutter run                                   # on a device or emulator
flutter build apk                             # release APK
```

## Project layout

```
packages/game_core/   shared pure-Dart engine: models, galaxy generation,
                      ticks, combat, AI, validated player actions
server/               multiplayer server: shared galaxy, REST API, Docker
lib/game/             sessions: local (on-device sim) and remote (API client),
                      session manager with stored credentials
lib/ui/               screens: start, empire overview, starmap, planet,
                      fleets, news
```
