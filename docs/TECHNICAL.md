# Technical Overview

This document covers YART's technology choices, architecture, and infrastructure decisions.

## Tech Stack

### Frontend

| Technology | Purpose |
|------------|---------|
| **React** | UI framework |
| **TypeScript** | Type-safe JavaScript |
| **Vite** | Build tooling and dev server |

### Backend / Infrastructure

| Technology | Purpose |
|------------|---------|
| **GitHub Pages** | Static site hosting |
| **Cloudflare** | CDN, proxy, DNS (CNAME) |
| **Cloudflare Workers** | Serverless API endpoints |
| **Cloudflare Durable Objects** | Real-time state and PubSub |

### Testing

| Technology | Purpose |
|------------|---------|
| **Playwright** | End-to-end testing |
| **Vitest** | Unit testing (where needed) |

---

## Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                         User Browser                            │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    React Application                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Pages     │  │ Components  │  │  State (Context) │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              │ WebSocket / HTTP                  │
└──────────────────────────────┼──────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                        Cloudflare Edge                          │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                    Cloudflare Worker                       │  │
│  │  ┌─────────────┐  ┌─────────────┐  ┌─────────────────┐   │  │
│  │  │   Router    │  │    Auth     │  │  Room Manager    │   │  │
│  │  └─────────────┘  └─────────────┘  └─────────────────┘   │  │
│  └───────────────────────────────────────────────────────────┘  │
│                              │                                   │
│                              ▼                                   │
│  ┌───────────────────────────────────────────────────────────┐  │
│  │                   Durable Objects                          │  │
│  │  ┌─────────────────────────────────────────────────────┐  │  │
│  │  │                    Room DO                           │  │  │
│  │  │  • Room state (columns, cards, mode)                 │  │  │
│  │  │  • Connected clients (WebSocket)                     │  │  │
│  │  │  • Broadcast updates                                 │  │  │
│  │  └─────────────────────────────────────────────────────┘  │  │
│  └───────────────────────────────────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                               │
                               ▼
┌─────────────────────────────────────────────────────────────────┐
│                       GitHub Pages                              │
│                  (Static assets: HTML, JS, CSS)                 │
└─────────────────────────────────────────────────────────────────┘
```

---

## Frontend Architecture

### Directory Structure

```
src/
├── components/           # Reusable UI components
│   ├── Card/
│   ├── Column/
│   ├── SwipeCard/
│   └── ...
├── pages/                # Route-level components
│   ├── Landing/
│   └── Room/
├── contexts/             # React contexts for state
│   ├── RoomContext.tsx
│   └── UserContext.tsx
├── hooks/                # Custom React hooks
│   ├── useRoom.ts
│   ├── useWebSocket.ts
│   └── ...
├── services/             # API and WebSocket clients
│   └── api.ts
├── types/                # TypeScript type definitions
│   └── index.ts
└── utils/                # Helper functions
```

### State Management

Room state is managed via React Context, synchronised with the server via WebSocket:

- **RoomContext**: Room configuration, columns, cards, current mode
- **UserContext**: Current user's anonymous identity, owner status, draft cards

### Real-time Updates

The frontend maintains a WebSocket connection to the Cloudflare Worker:

1. On room join, establish WebSocket connection
2. Receive current room state snapshot
3. Subscribe to room updates (new cards, mode changes, etc.)
4. Send user actions (publish card, cast vote, etc.)
5. Optimistic updates with server reconciliation

---

## Backend Architecture

### Cloudflare Worker

The Worker handles HTTP requests and routes WebSocket connections to Durable Objects.

**Endpoints**:

| Method | Path | Description |
|--------|------|-------------|
| POST | `/api/rooms` | Create a new room |
| GET | `/api/rooms/:id` | Get room info (exists check) |
| GET | `/api/rooms/:id/ws` | WebSocket upgrade |

### Durable Objects (Room DO)

Each room is a Durable Object instance, providing:

- **Persistent state**: Room configuration, columns, cards, votes
- **WebSocket hub**: Manages connected clients
- **Broadcast**: Pushes updates to all connected clients
- **Owner authentication**: Validates owner key for privileged actions

**Message Types (WebSocket)**:

```typescript
// Client → Server
type ClientMessage =
  | { type: 'join'; userId: string }
  | { type: 'publish_card'; columnId: string; content: string }
  | { type: 'group_cards'; cardIds: string[] }
  | { type: 'vote'; cardId: string; vote: boolean }
  | { type: 'owner_action'; ownerKey: string; action: OwnerAction };

// Server → Client  
type ServerMessage =
  | { type: 'state'; room: RoomState }
  | { type: 'card_published'; card: Card }
  | { type: 'cards_grouped'; group: CardGroup }
  | { type: 'mode_changed'; mode: RoomMode }
  | { type: 'focus_card'; cardId: string }
  | { type: 'action_added'; cardId: string; action: ActionItem }
  | { type: 'error'; message: string };
```

---

## Infrastructure

### Deployment Strategy

**Goal**: Minimise infrastructure code; leverage platform integrations.

**Static Frontend (GitHub Pages)**:
- Automatic deployment via GitHub Actions on push to `main`
- Built assets deployed to `gh-pages` branch

**Cloudflare Worker**:
- Deployed via Cloudflare's GitHub integration
- Automatic deployment on push to `main`
- No Terraform or infrastructure-as-code required

**DNS/Proxy**:
- Custom domain configured in Cloudflare dashboard
- CNAME to GitHub Pages
- Worker routes configured for `/api/*`

### Environment Configuration

| Environment | Static Host | Worker |
|-------------|-------------|--------|
| Production | GitHub Pages (custom domain) | Cloudflare Worker (production) |
| Preview | GitHub Pages (PR previews) | Cloudflare Worker (preview) |
| Local | Vite dev server | Wrangler dev |

---

## Security Considerations

### Owner Key

- Generated server-side when room is created
- Sent only once in the create room response
- Stored client-side (localStorage or session)
- Never included in URLs (prevents accidental sharing)
- Required for all owner-privileged actions
- Validated server-side on every owner action

### Room IDs

- Randomly generated, sufficiently long to prevent guessing
- URL-safe characters only
- No sequential IDs

### Anonymous Users

- Anonymous names assigned per session
- No persistent user identification
- Names are fun/memorable (adjective + animal pattern)

### Data Privacy

- No user accounts required
- No personal data collected
- Room data exists only for session duration
- Consider room expiry (auto-delete after X hours)

---

## Performance Considerations

### Frontend

- Code splitting by route
- Lazy loading for room pages
- Debounced WebSocket updates for high-frequency actions
- Virtual scrolling if column card counts get large

### Backend

- Durable Objects provide automatic scaling per room
- WebSocket connections are lightweight
- State updates are atomic and broadcast efficiently

---

## Local Development

### Prerequisites

- Node.js 18+
- pnpm (recommended) or npm
- Wrangler CLI (for Worker development)

### Setup

```bash
# Install dependencies
pnpm install

# Start frontend dev server
pnpm dev

# Start Worker locally (separate terminal)
pnpm wrangler dev

# Run tests
pnpm test
pnpm test:e2e
```

### Environment Variables

```bash
# .env.local (frontend)
VITE_API_URL=http://localhost:8787

# wrangler.toml (worker)
# No secrets needed for local dev
```
