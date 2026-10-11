# Vier op een rij

Online Connect Four for two players, plus a mode for two players on one
device. Plain Node.js (no npm dependencies) and a single static page.

- **Online (two phones):** phone 1 taps *Nieuw online spel* and shows a QR
  code. Phone 2 scans it, or types the 4-letter code or opens the invite
  link (`/?r=CODE`), enters a name and taps *Meedoen*. Moves
  stream live through Server-Sent Events. If you refresh, you rejoin
  automatically. *Nog een potje* starts a rematch, and the starting player
  alternates.
- **Op één apparaat:** two players take turns on the same screen.

Rooms live in memory. A server restart clears running games, and idle rooms
are removed after 6 hours. The QR code uses the vendored MIT-licensed
[qrcode-generator](https://github.com/kazuhikoarase/qrcode-generator)
(`public/vendor/qrcode.js`).

## Local development

```bash
cd vier-op-een-rij
npm start          # http://localhost:8080  (PORT=... to change)
npm test           # game logic tests
```

## Deploy to the VPS

This folder is a self-contained Docker Compose project. The Quizly deploy
service (`koechi-quiz/deploy-web`) deploys it: pick **Vier op een rij** in its
project dropdown, choose a branch and click *Deploy Now*. The service clones
`kwaak/dearde`, then runs `docker compose build` and `docker compose up -d`
in this folder.

By default the game listens publicly on port **8095**
(`http://<vps>:8095`). To change that, create `vier-op-een-rij/.env` on the
VPS:

```env
GAME_PORT=8095
# Only reachable from the host itself (when nginx proxies to it):
# GAME_BIND=127.0.0.1
```

Manual deploy, without the deploy service:

```bash
git clone https://github.com/kwaak/dearde.git /opt/dearde
cd /opt/dearde/vier-op-een-rij && docker compose up -d --build
```
