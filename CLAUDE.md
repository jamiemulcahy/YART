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

YART (Yet Another Retro Tool) is a real-time retrospective facilitation tool for software teams. It's a React + TypeScript frontend with Cloudflare Workers backend using Durable Objects for persistent state and WebSocket for real-time synchronization.

## Commands

```bash
# Install dependencies
pnpm install

# Development (run both in separate terminals)
pnpm dev              # Frontend dev server (Vite) - localhost:5173
pnpm dev:worker       # Worker dev server (Wrangler) - localhost:8787

# Testing
pnpm test             # Unit tests (Vitest)
pnpm test --watch     # Unit tests watch mode
pnpm test:e2e         # E2E tests (Playwright) - auto-starts both servers
pnpm test:e2e --ui    # E2E tests with debugging UI
pnpm test:e2e e2e/room-creation.spec.ts  # Run specific E2E test
```

> **Note**: E2E tests automatically start both the frontend and worker servers. For manual development, run both `pnpm dev` and `pnpm dev:worker` in separate terminals.

## Architecture

**Real-time data flow:**

```
Browser → WebSocket → Cloudflare Worker → Durable Objects
```

**State Management:**

- React Context API (RoomContext for room state, UserContext for user identity)
- Real-time sync via WebSocket to Cloudflare Worker
- Each room managed by dedicated Durable Object instance

**Backend Endpoints:**

- `POST /api/rooms` - Create new room
- `GET /api/rooms/:id` - Check if room exists
- `GET /api/rooms/:id/ws` - WebSocket upgrade

**Room Modes (retrospective phases):**

1. Edit - Owner configures columns
2. Publish - Participants add cards
3. Group - Collaboratively group related cards
4. Vote - Swipe voting to prioritize
5. Focus - Discuss prioritized cards
6. Overview - Review and export summary

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

- Favour E2E tests (Playwright) for user flow coverage
- Use accessible selectors: `getByRole`, `getByLabel`, `getByText`
- Unit tests (Vitest) for complex logic, edge cases, or utilities
- Each test independent (no shared state)

**Commit Messages (Conventional Commits):**

```
feat(scope): description
fix(scope): description
docs/style/refactor/test/chore(scope): description
```

## Key Concepts

- **Owner Key**: Server-validated authentication for privileged room actions
- **Draft Cards**: Private cards until explicitly published
- **Anonymous Identity**: Session-based names (e.g., "Purple Penguin"), no user accounts
