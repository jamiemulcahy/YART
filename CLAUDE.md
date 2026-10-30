# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## CRITICAL: Test-Driven Development Workflow

**Every code change MUST be verified using the Playwright MCP browser tools.**

### Required Workflow

1. **Make the change** - Write or modify code
2. **Visually verify** - Use Playwright MCP to interact with the running app:
   - `browser_navigate` to the relevant page
   - `browser_snapshot` to inspect the current state
   - `browser_click`, `browser_type`, etc. to test interactions
   - Confirm the change works as expected
3. **Write/update E2E test** - Add a Playwright test that covers the change:
   - Create or update a test file in `e2e/`
   - Use accessible selectors (`getByRole`, `getByLabel`, `getByText`)
   - Test the user-visible behaviour, not implementation details
4. **Run the test suite** - Ensure all tests pass before considering the task complete

### Playwright MCP Tools Available

Use these tools to verify changes in the browser:

| Tool                       | Purpose                                               |
| -------------------------- | ----------------------------------------------------- |
| `browser_navigate`         | Go to a URL                                           |
| `browser_snapshot`         | Capture accessibility tree (preferred for inspection) |
| `browser_click`            | Click an element                                      |
| `browser_type`             | Type into an input                                    |
| `browser_fill_form`        | Fill multiple form fields                             |
| `browser_press_key`        | Press keyboard keys                                   |
| `browser_take_screenshot`  | Capture visual screenshot                             |
| `browser_console_messages` | Check for errors                                      |

### Example Workflow

```
1. Edit src/components/Card.tsx to add delete button
2. Use browser_navigate to go to http://localhost:5173/room/test
3. Use browser_snapshot to verify the delete button appears
4. Use browser_click to test the delete interaction
5. Create e2e/card-deletion.spec.ts with test coverage
6. Run pnpm test:e2e to confirm tests pass
```

**Do NOT consider a task complete until it has been visually verified AND has test coverage.**

### Test it yourself, don't lean on the suite

Passing E2E tests are not enough. Before calling a change done, drive the real app in a browser yourself (Playwright MCP, or a throwaway `playwright` script in a scratch directory if MCP isn't available) and try everything you touched **and the edge cases around it**: other roles (owner, participant, viewer), refresh/reconnect, ending or leaving things early, empty and extreme inputs, mobile width. Look at screenshots, not just assertions. Fix what you find, then cover the user-visible behaviour in E2E.

Test priorities: **E2E first** for everything a user can see. Add unit tests only for logic that is both important and hard to reach from an E2E test (e.g. battle maths, scoring thresholds, text cleaning).

## CRITICAL: Git Workflow

**NEVER commit directly to main. Always use feature branches.**

### Branch Rules

1. **Create a feature branch** before making any changes:
   ```bash
   git checkout -b feat/short-description
   ```
2. **Branch naming convention**:
   - `feat/description` - New features
   - `fix/description` - Bug fixes
   - `refactor/description` - Code refactoring
   - `test/description` - Test additions/changes
   - `docs/description` - Documentation only
   - `chore/description` - Build, config, dependencies

3. **Never push directly to main** - Always create a PR

### Commit Standards

**Commit logical, atomic units of work.** Each commit should:

- **Do one thing** - A single logical change that could be reverted independently
- **Be complete** - Include the code change AND its test in the same commit
- **Pass tests** - Never commit code that breaks the build or tests

**Good commit granularity:**

```
feat(room): add Column component with drag handle
test(room): add E2E tests for column reordering
fix(room): prevent duplicate column names
```

**Bad commit granularity:**

```
WIP
fix stuff
add column component and tests and also fix bug and update docs
```

### When to Commit

Commit after completing a logical unit:

- A single component + its tests
- A single bug fix + its test
- A refactor that doesn't change behaviour
- Related type definitions

**Do NOT batch unrelated changes into one commit.**

## Project Overview

YART (Yet Another Retro Tool) is a real-time retrospective facilitation tool for software teams, with an optional space-battle stage. React + TypeScript frontend, Cloudflare Workers backend with one Durable Object per room, WebSocket for real-time sync. The design lives in `spec/REBUILD.md` — read it before changing behaviour.

## Commands

```bash
pnpm install
pnpm dev              # Worker (localhost:8787) + frontend (localhost:5173); Vite proxies /api to the worker

pnpm lint             # ESLint
pnpm typecheck        # All packages
pnpm test             # Unit tests (Vitest, shared/)
pnpm test:e2e         # E2E tests (Playwright) - starts its own servers on :8797 / :5183
pnpm test:e2e e2e/full-retro.spec.ts  # Run a specific E2E file
```

## Architecture

```
Browser → WebSocket → Cloudflare Worker → RoomDO (Durable Object, SQLite)
```

- `shared/` — protocol types + zod validation (`protocol.ts`), limits and text cleaning, topic building/ranking, battle maths, markdown export. Used by both worker and frontend.
- `worker/` — `index.ts` HTTP routes; `room.ts` the `RoomDO`; `store.ts` row-per-entity SQLite persistence.
- `frontend/` — `room/` connection + state reducer + context; `phases/` one view per phase; `game/` battle canvas.

**Server is authoritative.** Every client message is validated (zod), then checked for role, phase, ownership, limits and rate. Card text and authorship are filtered per viewer before sending.

**Backend Endpoints:**

- `POST /api/rooms` - Create a room (`{ name, lanes }` → `{ code, ownerKey }`)
- `GET /api/rooms/:code` - Check if a room exists
- `GET /api/rooms/:code/ws` - WebSocket upgrade (first message must be `hello`)

**Phases:** Setup → Write → Group → Vote → Discuss → Battle (optional, cosmetic; votes become shields) → Wrap-up

## Code Conventions

**Naming:**

- Components: PascalCase (CardList.tsx)
- Hooks: camelCase with 'use' prefix (useRoom.ts)
- Types/Interfaces: PascalCase (RoomState)
- Constants: SCREAMING_SNAKE_CASE
- CSS classes: kebab-case

**TypeScript:**

- Strict mode enabled
- Prefer explicit types over `any`; use `unknown` when type is truly unknown

**Testing Philosophy:**

- Favour E2E tests (Playwright) for user flow coverage; use separate browser contexts for separate people
- Protocol-level tests (raw WebSockets in `e2e/protocol.spec.ts`) for authorization, limits and leakage
- Use accessible selectors: `getByRole`, `getByLabel`, `getByText`
- Unit tests (Vitest) only for intricate logic (battle maths, text cleaning)
- Each test independent (no shared state)

**Commit Messages (Conventional Commits):**

```
feat(scope): description
fix(scope): description
docs/style/refactor/test/chore(scope): description
```

## Key Concepts

- **Owner Key**: Secret returned on room creation; proves facilitator rights. Never sent in URLs.
- **Participant token**: Secret issued on first join, stored in localStorage; reconnecting with it restores the same identity.
- **Hidden cards**: Face-down to everyone but their author until the owner reveals them (or Write ends).
- **Topic**: A group, or a card that isn't in a group. Topics get votes, get discussed, get attacked.
- **Anonymous Identity**: Random names (e.g. "Dastardly Pigeon"), no accounts. Card authorship is never shown.
