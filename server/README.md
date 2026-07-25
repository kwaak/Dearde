# Galactic Conflict server

A small Dart server that hosts one shared, persistent galaxy. It runs the
exact same engine as the app (`packages/game_core`): the galaxy ticks on the
server, players register an empire and play together from their phones.

## Run locally

```sh
cd server
dart pub get
dart run bin/server.dart
# → Galactic Conflict server on port 8080 ...
```

In the app choose **Online galaxy** and enter `http://<your-pc-ip>:8080`
(phone and PC on the same network).

Configuration via environment variables:

| Variable | Default | Meaning |
|---|---|---|
| `PORT` | `8080` | HTTP port |
| `TICK_SECONDS` | `15` | Real seconds per game tick |
| `WORLD_FILE` | `data/world.json` | Where the galaxy is persisted |
| `GALAXY_SEED` | current time | Seed used when creating a brand-new galaxy |

The world is saved every few ticks, after every registration/action, and on
shutdown. If the server was down (or a free-tier host put it to sleep), it
catches up the missed ticks on boot — the galaxy never stops.

## Deploy for free

**Fly.io** (recommended — has a persistent volume on the free allowance):

```sh
# from the repository root; install flyctl and log in first
fly launch --copy-config --no-deploy    # pick your own app name
fly volumes create gc_data --size 1
fly deploy
```

Your server is then at `https://<app-name>.fly.dev` — enter that address in
the app.

**Render.com**: connect the repo as a Blueprint; `render.yaml` at the root
configures everything. Note the free plan has no persistent disk, so the
galaxy resets on redeploys.

**Your own VPS** (via GitHub Actions — no registry needed):

1. Add repository secrets (GitHub → Settings → Secrets and variables →
   Actions): `VPS_HOST`, `VPS_USER`, and `VPS_SSH_KEY` (a private key whose
   public half is on the VPS in `~/.ssh/authorized_keys`). Optional:
   `VPS_SSH_PORT` (default 22) and a repository *variable* `VPS_HTTP_PORT`
   (default 8080). The VPS needs Docker, and the SSH user must be allowed
   to run it.
2. Run the **Deploy server to VPS** workflow from the Actions tab. It
   builds the image, streams it over SSH, starts the container with a
   persistent `gc_data` volume and `--restart unless-stopped`, and health-
   checks it.
3. Set the repository variable `SERVER_URL` to `http://<VPS_HOST>:8080` so
   new APKs come with the address pre-filled. (For HTTPS, put a reverse
   proxy like Caddy or nginx with TLS in front and use that URL instead.)

**Anywhere with Docker**:

```sh
docker build -f server/Dockerfile -t galactic-conflict .
docker run -p 8080:8080 -v gc_data:/data galactic-conflict
```

CI also publishes a prebuilt image to
`ghcr.io/<repo-owner>/dearde-server:latest` on every push.

## API

All bodies are JSON. Authenticated endpoints take
`Authorization: Bearer <token>`.

| Endpoint | Auth | Description |
|---|---|---|
| `GET /health` | no | Liveness + current tick |
| `GET /api/info` | no | Galaxy stats (tick, players, planets) |
| `POST /api/register` | no | `{empireName}` → `{token, empireId, state}` |
| `GET /api/state` | yes | Full galaxy state, personalized viewer |
| `POST /api/build` | yes | `{planetId, building}` |
| `POST /api/train` | yes | `{planetId, ship, count}` |
| `POST /api/mission` | yes | `{originPlanetId, targetPlanetId, kind, fleet}` |

The token returned by `register` is the only credential — treat it like a
password. The app can show it under ⋮ → *Show login token* so you can log in
from another device.
