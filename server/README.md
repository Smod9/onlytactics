## Only Tactics Colyseus Server

Lightweight Colyseus Cloud game server scaffold. It exposes:

- `GET /` – JSON banner describing the active hard-coded room.
- `GET /health` – uptime + status payload for health checks.

### Environment variables

Create a `.env` in this directory (not checked into git). A typical local setup looks like:

```
PORT=2567
COLYSEUS_HOST=0.0.0.0
RACE_ROOM_ID=onlytactics-dev
ENABLE_MONITOR=false
```

When testing a Colyseus Cloud deploy, you can also point the smoke test at the live URL:

```
COLYSEUS_BASE_URL=https://us-sea-03139935.colyseus.cloud
```

### Local development

```bash
cd server
npm install
npm run dev
```

The server listens on `http://127.0.0.1:2567` (overridable with `PORT` / `HOST`).

### Smoke test (local or cloud)

- **Local:** start `npm run dev` in one terminal, then run `npm run smoke` in another.  
- **Cloud:** run `COLYSEUS_BASE_URL=https://us-sea-03139935.colyseus.cloud npm run smoke`.

Both variants hit `GET /health` and exit with a non-zero status if the server isn’t ready.

