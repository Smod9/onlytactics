# Sailing Simulator Frontend

This is the browser client for the sailing race rules trainer. It includes the PixiJS scene, MQTT networking, replay tooling, and connects to a shared CloudAMQP (RabbitMQ) broker.

## Getting started

```bash
cd frontend
npm install
cp env.example .env    # adjust values if needed (contains CloudAMQP defaults)
npm run dev            # starts Vite and connects to the remote broker
```

MQTT credentials are currently hardcoded inside `src/net/mqttClient.ts` while we stabilize the new broker. If you need to point at a different broker, edit the constants at the top of that file and restart `npm run dev`. The remaining variables in `.env` still control race metadata, debug HUD, etc.

## Tactician controls

The game now models Tacticat/SailX style helm commands. You set a desired heading and the physics engine steers toward it at a fixed turn rate.

Key bindings:

- `Space` – Sail by telltales (auto-set best VMG heading on current tack)
- `Enter` – Tack or gybe to the opposite close-hauled / downwind angle; the helm locks until the turn completes
- `↑` – Head up 5° (clamped to the no-go zone; forcing it triggers a stall)
- `↓` – Bear away 5° (clamped to ~140° off the wind; no dead-downwind sailing)

There are no sheet/trim controls in v1—boat speed comes entirely from angle-to-wind and the polar model.

## Other scripts

- `npm run build` – type-check and build for production
- `npm run lint` – ESLint
- `npm run format` – Prettier
- `npm run preview` – preview the production build locally
