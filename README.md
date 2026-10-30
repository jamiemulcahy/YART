# YART — Yet Another Retro Tool

Real-time retrospectives with a space-battle twist. Create a room, share the code, and everyone joins anonymously — no accounts.

## How a retro runs

1. **Setup** — the facilitator picks lanes (Mad/Sad/Glad, Start/Stop/Continue, … or their own) and shares the invite link.
2. **Write** — everyone adds cards. By default cards are face-down to others until the facilitator reveals them.
3. **Group** — drag similar cards together (or use a card's ⋯ menu) and name the groups.
4. **Defend** — each person places shields on the topics they most want to discuss. Shields are the vote.
5. **Battle** _(optional, just for fun)_ — invaders attack the board; shields become armour. Shoot them down together. The battle never changes the discussion order.
6. **Discuss** — the facilitator opens topics in shield order for everyone; the team adds notes and actions.
7. **Wrap-up** — copy or download a markdown summary of topics, groups, shields, notes and actions.

The facilitator also has an optional shared timer (any length, start/pause/restart at will) that plays an alarm for everyone when it runs out, and a "Join as viewer" mode for a shared meeting-room screen.

## Architecture

```
Browser ──WebSocket──▶ Cloudflare Worker ──▶ one Durable Object per room (SQLite storage)
```

| Package     | What's in it                                                                                        |
| ----------- | --------------------------------------------------------------------------------------------------- |
| `shared/`   | Protocol (zod-validated messages), limits, topic ranking, battle maths, markdown export, unit tests |
| `worker/`   | HTTP routes and the `RoomDO` Durable Object — the single source of truth for each room              |
| `frontend/` | React + Vite app and the Playwright E2E suite                                                       |

Key points:

- **The server decides everything.** Clients send requests; the Durable Object validates role, phase, limits and rate, then broadcasts the result. Hidden card text and card authorship never leave the server for anyone but the author.
- **Identity survives refreshes.** On first join the server issues a secret token kept in `localStorage`; reconnecting with it restores the same anonymous participant.
- **The battle stays in sync without streaming positions.** The server generates the whole battle as a script up front; attacker positions are a pure function of time, so every client draws the same thing. Only hits, deaths and topic damage travel over the wire, and the server is the authority on all three.

See [spec/REBUILD.md](spec/REBUILD.md) for the full design.

## Development

Requires Node 24 and pnpm (`corepack enable pnpm`).

```bash
pnpm install
pnpm dev            # worker on :8787 and frontend on :5173 (Vite proxies /api to the worker)
```

```bash
pnpm lint           # ESLint (strict TypeScript + React hooks rules)
pnpm typecheck      # all packages
pnpm test           # unit tests (shared/)
pnpm test:e2e       # Playwright; starts its own worker (:8797) and frontend (:5183)
```

E2E tests are the primary safety net: they drive several browser contexts (owner, participants, viewers) through real retros and also hit the WebSocket protocol directly to check authorization, limits and data leakage.

## Deployment

- **Worker:** `pnpm deploy` (runs `wrangler deploy` in `worker/`; needs `wrangler login`). Set `ALLOWED_ORIGINS` in `worker/wrangler.toml` to the frontend's origin.
- **Frontend:** the GitHub Pages workflow builds on push to `main`. Set the repository variable `VITE_API_URL` to the worker's URL. If the frontend and worker share an origin, leave it empty.
