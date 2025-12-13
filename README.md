# Only Tactics Sailing Simulator

This is the browser client for the sailing race rules trainer. It includes the PixiJS scene, MQTT networking, replay tooling, and connects to a shared CloudAMQP (RabbitMQ) broker.

## Why should this exist?

Most sailing games try to simulate the whole ocean. This one does not. Rules, tactical choices, timing, and small human errors are a huge part of racing, and they are some of the hardest things to practice on the water.

When you strip out spray, waves, sail trim, and boat handling, you can  focus on the the rules and tactics.

It is intentionally a dumb little multiplayer game because the point is to learn without friction and to laugh when you forget to hit the VMG button when you don't notice a shift.

It is open source so people can play, improve it, and teach each other.

## Before you engage with the code...

Yea ok, gpt 5.1 Codex High wrote most of this code in cursor. Be nice... Obviously it needs improving, unit tests, pipelines, so many things... The goal was to leverage AI to get to the point that the POC was interesting enough to bring in community engagement.

I can't (and won't) maintain this on my own, I've never liked sailing single handed boats much either... Jump in, be nice, make issues, ask for features, make pull requests etc.

## Getting started

```bash
npm install
cp env.example .env    # adjust values if needed (contains CloudAMQP defaults)
npm run dev            # starts Vite and connects to the remote broker
```

The dev server now serves the landing page at `/`. To jump directly into the PixiJS client, visit [`/app`](http://localhost:5173/app) (or whatever host you deploy to). MQTT credentials are currently hardcoded inside `src/net/mqttClient.ts` while we stabilize the new broker. If you need to point at a different broker, edit the constants at the top of that file and restart `npm run dev`. The remaining variables in `.env` still control race metadata, debug HUD, etc.

## Tactician controls

The game now models Tacticat/SailX style helm commands. You set a desired heading and the physics engine steers toward it at a fixed turn rate.

Key bindings:

- `Space` – Sail by telltales (auto-set best VMG heading on current tack)
- `Enter` – Tack or gybe to the opposite close-hauled / downwind angle; the helm locks until the turn completes
- `↑` – Head up 5° (clamped to the no-go zone; forcing it triggers a stall)
- `↓` – Bear away 5° (clamped to ~140° off the wind; no dead-downwind sailing)

There are no sheet/trim controls in v1—boat speed comes entirely from angle-to-wind and the polar model.

## Wind Shadow / Wake System

The simulator models wind shadow effects where boats sailing downwind create a wake that slows down boats behind them. This adds tactical depth to positioning and passing strategies.

### How It Works

- **Wake Zone**: Each boat creates a wake zone extending downwind (in the direction the wind is blowing). The wake is a trapezoid that:
  - Starts narrow near the boat (`WAKE_HALF_WIDTH_START = 18` scene units)
  - Widens as it extends downwind (`WAKE_HALF_WIDTH_END = 35` scene units)
  - Extends for `WAKE_LENGTH = 60` scene units downwind

- **Cone Angle**: The wake is limited to a downwind sector defined by `WAKE_CONE_HALF_ANGLE_DEG = 35°`. This means the wake only affects boats that are roughly downwind (within 35° of directly downwind).

- **Slowdown Calculation**: When a boat is within another boat's wake zone, its speed is reduced based on:
  - **Lateral distance**: Gaussian falloff based on distance from the wake centerline (stronger effect when directly behind, weaker when offset)
  - **Distance along wake**: Linear falloff from the source boat (strongest effect near the boat, diminishing to zero at the end of the wake)
  - **Maximum slowdown**: Up to `WAKE_MAX_SLOWDOWN = 25%` speed reduction when directly behind another boat

- **Multiple Wakes**: If a boat is in multiple wake zones simultaneously, the slowdown effects are combined (capped at the maximum).

### Visual Indicators

With debug HUD enabled (`VITE_DEBUG_HUD=true`):
- Wake zones are visualized as yellow/gold trapezoids extending downwind from each boat
- Boats affected by wakes show a yellow outline and a "Wake -X%" label indicating the slowdown percentage
- The player's speed/heading overlay shows a "Wake -X%" indicator when affected

This system encourages tactical positioning—staying out of other boats' wakes when possible, and using your wake to slow down competitors when advantageous.

## Other scripts

- `npm run build` – type-check and build for production
- `npm run lint` – ESLint
- `npm run format` – Prettier
- `npm run preview` – preview the production build locally
- `npm run deploy` – build and push the contents of `dist/` to [Only Tactics on Surge](https://onlytactics.surge.sh)

## Commit guidelines

This repo uses [`semantic-release`](https://semantic-release.gitbook.io/) to auto-generate versions, changelog entries, and release notes. Please follow the [Conventional Commits](https://www.conventionalcommits.org/) spec so your changes are categorized correctly.

- Structure: ``type(scope?): summary`` (lowercase, imperative). Example: ``feat(controls): add ipad touch overlay``.
- Common types: `feat` (new gameplay/UI), `fix` (bug fix), `docs`, `chore`, `refactor`, `test`, `build`, `ci`.
- Breaking changes: include `!` after the type/scope (e.g., `feat!: rewrite host loop`) and explain the breaking change in the commit body under a `BREAKING CHANGE:` line.
- Reference issues/PRs in the body when helpful (`Fixes #123`).
- Use `revert:` prefix when reverting a previous commit so semantic-release can detect it automatically.

Following this format keeps releases predictable and avoids manual version bumps.

## Landing page

The marketing page now loads by default at `/`. The game client lives at `/app`, so you can keep the front door focused on why the project exists while still linking people straight into races when needed. The hero includes GitHub links, testimonials, and the story from this README; feel free to style or extend it further before pointing a public DNS record at it.

## Attribution & License

Only Tactics is authored by **Sebastien Gouin-Davis**. The full source is available under the terms of the [MIT License](./LICENSE); any redistributions should keep the copyright notice and include a clear link back to this repository so downstream users know where the project originates.
