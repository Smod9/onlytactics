## Only Tactics Colyseus Server

Lightweight Colyseus Cloud game server scaffold. It exposes:

- `GET /` – JSON banner describing the active hard-coded room.
- `GET /health` – uptime + status payload for health checks.

### Local development

```bash
cd frontend/server
npm install
npm run dev
```

The server listens on `http://127.0.0.1:2567` (overridable with `PORT` / `HOST`).

### Smoke test

With the dev server running, open a second terminal:

```bash
cd frontend/server
npm run smoke
```

This script hits `GET /health` and prints the JSON payload. You can also curl manually:

```bash
curl http://127.0.0.1:2567/health
```

Both steps confirm the Colyseus host is reachable before we wire up the real race state sync.

