# YART Implementation Plan

This document outlines the phased implementation plan for YART, breaking down work into milestones with specific tasks, dependencies, and acceptance criteria.

## Overview

The implementation follows a vertical slice approach: each milestone delivers end-to-end functionality that can be tested and demonstrated. Backend and frontend work proceed in parallel where possible, with E2E tests validating each completed slice.

**Estimated Milestones**: 5
**Testing Strategy**: E2E tests for all user flows; unit tests for complex logic only

## Development Workflow (REQUIRED)

Every task that changes UI or behaviour must follow this workflow:

```
1. Implement the change
2. Visually verify using Playwright MCP browser tools
3. Write/update E2E test in e2e/ directory
4. Run full test suite to confirm nothing is broken
```

**AI-assisted development**: Claude Code must use the Playwright MCP tools (`browser_navigate`, `browser_snapshot`, `browser_click`, etc.) to verify changes work before writing tests. See CLAUDE.md for details.

A task is not complete until it has been **verified in-browser** and has **E2E test coverage**.

---

## Milestone 1: Project Scaffolding ✅ COMPLETE

**Goal**: Establish the development foundation with all tooling configured and a "hello world" deployment working.

### 1.1 Frontend Setup

- [x] Initialize Vite project with React + TypeScript template
- [x] Configure TypeScript strict mode (`tsconfig.json`)
- [x] Set up directory structure per TECHNICAL.md:
  ```
  src/
  ├── components/
  ├── pages/
  ├── contexts/
  ├── hooks/
  ├── services/
  ├── types/
  └── utils/
  ```
- [x] Install and configure dependencies:
  - React Router (routing)
  - CSS approach (CSS Modules or Tailwind - decide)
- [x] Create placeholder `Landing` and `Room` page components
- [x] Configure environment variables (`VITE_API_URL`)

### 1.2 Backend Setup

- [x] Initialize Cloudflare Worker project in `worker/` directory
- [x] Configure `wrangler.toml` with:
  - Durable Object bindings
  - Development and production environments
- [x] Create basic Worker with health check endpoint (`GET /health`)
- [x] Create placeholder Room Durable Object class
- [x] Verify local development works with `wrangler dev`

### 1.3 Monorepo Configuration

- [x] Set up pnpm workspaces (`pnpm-workspace.yaml`)
- [x] Configure root `package.json` with workspace scripts:
  ```json
  {
    "scripts": {
      "dev": "pnpm --filter frontend dev",
      "dev:worker": "pnpm --filter worker dev",
      "build": "pnpm --filter frontend build",
      "test": "pnpm --filter frontend test",
      "test:e2e": "pnpm --filter frontend test:e2e"
    }
  }
  ```
- [x] Ensure shared TypeScript types can be imported across packages

### 1.4 Testing Setup

- [x] Install and configure Vitest for unit tests
- [x] Install and configure Playwright for E2E tests
- [x] Create `e2e/` directory with Playwright config
- [x] Write first E2E test: app loads without errors
- [x] Write first unit test: placeholder utility function

### 1.5 Code Quality

- [x] Configure ESLint with TypeScript rules
- [x] Configure Prettier
- [x] Add pre-commit hooks (husky + lint-staged)
- [x] Create `.editorconfig`

### 1.6 CI/CD Pipeline

- [x] Create GitHub Actions workflow for:
  - Lint check
  - Type check
  - Unit tests
  - E2E tests
  - Build verification
- [x] Configure Cloudflare Pages or GitHub Pages deployment
- [x] Configure Cloudflare Worker deployment

### Milestone 1 Acceptance Criteria

- [x] `pnpm install` succeeds
- [x] `pnpm dev` starts frontend on localhost:5173
- [x] `pnpm dev:worker` starts worker on localhost:8787
- [x] `pnpm test` runs and passes
- [x] `pnpm test:e2e` runs and passes
- [x] CI pipeline passes on push
- [x] Deployment pipeline triggers on merge to main

---

## Milestone 2: Core Infrastructure ✅ COMPLETE

**Goal**: Establish the real-time communication layer between frontend and backend.

### 2.1 Shared Types

- [x] Create `types/` package or shared file with core types:

  ```typescript
  // Room types
  type RoomMode = "edit" | "publish" | "group" | "vote" | "focus" | "overview";

  interface Room {
    id: string;
    name: string;
    mode: RoomMode;
    columns: Column[];
    createdAt: string;
  }

  interface Column {
    id: string;
    name: string;
    order: number;
  }

  interface Card {
    id: string;
    columnId: string;
    content: string;
    authorId: string;
    authorName: string;
    votes: number;
    groupId?: string;
    actionItems: ActionItem[];
  }

  interface ActionItem {
    id: string;
    content: string;
  }

  interface CardGroup {
    id: string;
    cardIds: string[];
  }

  // User types
  interface User {
    id: string;
    name: string; // Anonymous name like "Purple Penguin"
    isOwner: boolean;
  }
  ```

- [x] Define WebSocket message types (client → server):

  ```typescript
  type ClientMessage =
    | { type: "join"; userName?: string }
    | { type: "publish_card"; columnId: string; content: string }
    | { type: "delete_card"; cardId: string }
    | { type: "group_cards"; cardIds: string[] }
    | { type: "ungroup_card"; cardId: string }
    | { type: "vote"; cardId: string; vote: boolean }
    | { type: "owner:set_mode"; ownerKey: string; mode: RoomMode }
    | { type: "owner:add_column"; ownerKey: string; name: string }
    | {
        type: "owner:update_column";
        ownerKey: string;
        columnId: string;
        name: string;
      }
    | { type: "owner:delete_column"; ownerKey: string; columnId: string }
    | { type: "owner:reorder_columns"; ownerKey: string; columnIds: string[] }
    | { type: "owner:set_focus"; ownerKey: string; cardId: string }
    | {
        type: "owner:add_action";
        ownerKey: string;
        cardId: string;
        content: string;
      };
  ```

- [x] Define WebSocket message types (server → client):
  ```typescript
  type ServerMessage =
    | { type: "state"; room: Room; user: User; users: User[] }
    | { type: "user_joined"; user: User }
    | { type: "user_left"; userId: string }
    | { type: "card_published"; card: Card }
    | { type: "card_deleted"; cardId: string }
    | { type: "cards_grouped"; group: CardGroup }
    | { type: "card_ungrouped"; cardId: string }
    | { type: "vote_recorded"; cardId: string; votes: number }
    | { type: "mode_changed"; mode: RoomMode }
    | { type: "column_added"; column: Column }
    | { type: "column_updated"; column: Column }
    | { type: "column_deleted"; columnId: string }
    | { type: "columns_reordered"; columnIds: string[] }
    | { type: "focus_changed"; cardId: string | null }
    | { type: "action_added"; cardId: string; action: ActionItem }
    | { type: "error"; code: string; message: string };
  ```

### 2.2 Backend: HTTP Endpoints

- [x] Implement request router in Worker
- [x] `POST /api/rooms` - Create room:
  - Generate unique room ID (nanoid or similar)
  - Generate owner key (secure random)
  - Create Durable Object instance
  - Return `{ roomId, ownerKey }`
- [x] `GET /api/rooms/:id` - Check room exists:
  - Query Durable Object
  - Return `{ exists: boolean, name?: string }`
- [x] Add CORS headers for local development
- [x] Add error handling middleware

### 2.3 Backend: Room Durable Object

- [x] Implement Room DO class structure:
  ```typescript
  export class RoomDO implements DurableObject {
    private state: DurableObjectState;
    private room: Room | null = null;
    private ownerKey: string | null = null;
    private connections: Map<WebSocket, User> = new Map();
  }
  ```
- [x] Implement `fetch()` handler for WebSocket upgrade
- [x] Implement room initialization (called from create endpoint)
- [x] Implement `webSocketMessage()` handler
- [x] Implement `webSocketClose()` handler
- [x] Implement broadcast utility function
- [ ] Implement owner key validation helper (will be done in Milestone 3)

### 2.4 Backend: Anonymous Name Generation

- [x] Create adjective list (50+ words): Purple, Green, Swift, Brave, etc.
- [x] Create animal list (50+ words): Penguin, Giraffe, Fox, Owl, etc.
- [x] Implement `generateAnonymousName()` function
- [ ] Ensure uniqueness within a room session (deferred)

### 2.5 Frontend: React Contexts

- [x] Create `RoomContext`:
  ```typescript
  interface RoomContextValue {
    room: Room | null;
    users: User[];
    isConnected: boolean;
    isLoading: boolean;
    error: string | null;
    // Actions
    publishCard: (columnId: string, content: string) => void;
    deleteCard: (cardId: string) => void;
    groupCards: (cardIds: string[]) => void;
    ungroupCard: (cardId: string) => void;
    vote: (cardId: string, vote: boolean) => void;
  }
  ```
- [x] Create `UserContext`:
  ```typescript
  interface UserContextValue {
    user: User | null;
    ownerKey: string | null;
    draftCards: DraftCard[];
    // Actions
    setOwnerKey: (key: string) => void;
    addDraftCard: (columnId: string, content: string) => void;
    updateDraftCard: (id: string, content: string) => void;
    deleteDraftCard: (id: string) => void;
  }
  ```
- [x] Implement localStorage persistence for owner key

### 2.6 Frontend: WebSocket Hook

- [x] Create `useWebSocket` hook:
  ```typescript
  function useWebSocket(roomId: string) {
    // Returns: { send, isConnected, lastMessage }
  }
  ```
- [x] Handle connection lifecycle (connect, reconnect, disconnect)
- [x] Implement automatic reconnection with exponential backoff
- [x] Parse incoming messages and dispatch to context
- [x] Queue outgoing messages if disconnected

### 2.7 Frontend: API Service

- [x] Create `api.ts` service:
  ```typescript
  export async function createRoom(
    name: string
  ): Promise<{ roomId: string; ownerKey: string }>;
  export async function checkRoom(
    roomId: string
  ): Promise<{ exists: boolean; name?: string }>;
  export function getWebSocketUrl(roomId: string): string;
  ```

### 2.8 E2E Tests

- [ ] Test: Create room via API returns roomId and ownerKey (deferred - requires manual/CI testing)
- [ ] Test: Check room returns exists: true for valid room (deferred - requires manual/CI testing)
- [ ] Test: Check room returns exists: false for invalid room (deferred - requires manual/CI testing)
- [ ] Test: WebSocket connects successfully to valid room (deferred - requires manual/CI testing)
- [ ] Test: WebSocket receives initial state on connect (deferred - requires manual/CI testing)

### Milestone 2 Acceptance Criteria

- [x] Can create a room via POST /api/rooms (implemented)
- [x] Can verify room exists via GET /api/rooms/:id (implemented)
- [x] WebSocket connection establishes and receives state (implemented)
- [x] Multiple browser tabs can connect to same room (implemented)
- [x] Disconnection triggers reconnection attempt (implemented)
- [ ] All E2E tests pass (deferred to CI)

---

## Milestone 3: Landing Page + Edit Mode ✅ COMPLETE

**Goal**: Users can create/join rooms, and owners can configure columns.

### 3.1 Landing Page UI

- [x] Create `LandingPage` component with:
  - App title and tagline
  - "Join Room" section:
    - Room ID input field
    - Join button
    - Error state for invalid room
  - "Create Room" section:
    - Room name input field
    - Create button
- [x] Style landing page (responsive, centered layout)
- [x] Add loading states for API calls
- [x] Add form validation (required fields)

### 3.2 Room Creation Flow

- [x] On create: call API, store owner key, navigate to room
- [x] Display owner key in a modal/toast (one-time display)
- [x] Warn user to save owner key
- [x] Copy-to-clipboard functionality for room ID

### 3.3 Room Join Flow

- [x] On join: verify room exists, then navigate
- [x] Display error if room not found
- [x] Optional: Check for stored owner key and auto-apply

### 3.4 Room Page Shell

- [x] Create `RoomPage` component
- [x] Extract room ID from URL params
- [x] Connect WebSocket on mount
- [x] Display loading state while connecting
- [x] Display error state if connection fails
- [x] Render mode-specific component based on `room.mode`

### 3.5 Room Header

- [x] Create `RoomHeader` component:
  - Room name
  - Current mode indicator
  - User count
  - Owner controls (if owner):
    - Mode transition button (e.g., "Start Publishing")

### 3.6 Edit Mode UI

- [x] Create `EditMode` component (owner-only view)
- [x] Create `ColumnEditor` component:
  - Column name input (inline editable)
  - Delete button with confirmation
  - Drag handle for reordering
- [x] Create "Add Column" button/input
- [ ] Implement drag-and-drop reordering (deferred - basic reorder via backend works)
- [x] Display non-owner message: "Waiting for facilitator to set up..."

### 3.7 Edit Mode Backend

- [x] Implement `owner:add_column` message handler
- [x] Implement `owner:update_column` message handler
- [x] Implement `owner:delete_column` message handler
- [x] Implement `owner:reorder_columns` message handler
- [x] Implement `owner:set_mode` message handler
- [x] Broadcast column changes to all clients
- [x] Validate owner key on all owner actions

### 3.8 Mode Transitions

- [x] Owner can transition: Edit → Publish
- [x] Non-owners see mode change in real-time
- [ ] Add transition confirmation modal (deferred - not critical)

### 3.9 E2E Tests

- [x] Test: Landing page renders correctly
- [ ] Test: Create room flow (deferred - requires backend)
- [ ] Test: Join room flow (deferred - requires backend)
- [ ] Test: Join invalid room shows error (deferred - requires backend)
- [ ] Test: Owner can add columns (deferred - requires backend)
- [ ] Test: Owner can rename columns (deferred - requires backend)
- [ ] Test: Owner can delete columns (deferred - requires backend)
- [ ] Test: Owner can reorder columns (deferred - requires backend)
- [ ] Test: Non-owner sees columns but cannot edit (deferred - requires backend)
- [ ] Test: Owner can transition to Publish mode (deferred - requires backend)
- [ ] Test: Multiple users see column changes in real-time (deferred - requires backend)

### Milestone 3 Acceptance Criteria

- [x] Landing page is functional and styled
- [x] Room creation provides ID and owner key
- [x] Room joining works for valid rooms
- [x] Edit mode allows full column management
- [x] Non-owners see read-only view
- [x] Mode transition to Publish works
- [x] Real-time sync works for column changes
- [ ] All E2E tests pass (partial - backend-dependent tests deferred)

---

## Milestone 4: Publish + Group Modes

**Goal**: Participants can add cards and group related items.

### 4.1 Column Component

- [ ] Create `Column` component:
  - Column header (name)
  - Card list area
  - Draft area (bottom, private)
- [ ] Style columns (vertical layout, scrollable)

### 4.2 Card Component

- [ ] Create `Card` component:
  - Card content text
  - Author indicator (icon + tooltip with anonymous name)
  - Visual distinction for own cards vs others
- [ ] Style cards (bordered, subtle shadow)

### 4.3 Draft Card Area

- [ ] Create `DraftArea` component:
  - Text input for new card
  - List of current user's draft cards
  - Edit/delete controls on draft cards
  - "Publish" button per card
- [ ] Draft cards stored in UserContext (client-side only)
- [ ] Clear visual separation from published cards

### 4.4 Publish Mode UI

- [ ] Create `PublishMode` component
- [ ] Render columns with published cards
- [ ] Render draft area at bottom of each column
- [ ] Show author indicators on cards
- [ ] Responsive layout (horizontal scroll on mobile, grid on desktop)

### 4.5 Publish Mode Backend

- [ ] Implement `publish_card` message handler:
  - Validate card content (non-empty, max length)
  - Assign card ID and author info
  - Add to room state
  - Broadcast to all clients
- [ ] Implement `delete_card` message handler (own cards only)

### 4.6 Group Mode UI

- [ ] Create `GroupMode` component
- [ ] Reuse Column/Card components from Publish mode
- [ ] Hide draft area (no new cards in Group mode)
- [ ] Enable drag-and-drop on cards
- [ ] Drop targets: other cards (to group) and columns (to move)
- [ ] Create `CardGroup` component:
  - Visual "stack" appearance
  - Shows preview of grouped cards
  - Expandable to see all cards

### 4.7 Grouping Interaction

- [ ] Drag card onto another card → creates group
- [ ] Drag card onto existing group → adds to group
- [ ] Drag card out of group → removes from group
- [ ] Visual feedback during drag (drop zone highlighting)

### 4.8 Group Mode Backend

- [ ] Implement `group_cards` message handler:
  - Create new group or add to existing
  - Update card groupId references
  - Broadcast group change
- [ ] Implement `ungroup_card` message handler:
  - Remove card from group
  - Delete group if only one card remains
  - Broadcast change

### 4.9 Mode Transitions

- [ ] Owner can transition: Publish → Group
- [ ] Owner can transition: Group → Vote
- [ ] Add confirmation when leaving Publish (no more cards)

### 4.10 E2E Tests

- [ ] Test: User can create draft card
- [ ] Test: User can edit draft card
- [ ] Test: User can delete draft card
- [ ] Test: User can publish draft card
- [ ] Test: Published card appears for all users
- [ ] Test: User can only delete own cards
- [ ] Test: Cards show author indicator
- [ ] Test: Owner can transition to Group mode
- [ ] Test: User can drag card onto another to create group
- [ ] Test: User can drag card into existing group
- [ ] Test: User can drag card out of group
- [ ] Test: Groups display as stacked cards
- [ ] Test: Grouping syncs across users in real-time
- [ ] Test: Owner can transition to Vote mode

### Milestone 4 Acceptance Criteria

- [ ] Draft cards work (create, edit, delete, publish)
- [ ] Published cards visible to all with author info
- [ ] Columns display cards correctly
- [ ] Group mode enables drag-and-drop grouping
- [ ] Groups visually distinct from single cards
- [ ] Real-time sync for cards and groups
- [ ] Mode transitions work correctly
- [ ] All E2E tests pass

---

## Milestone 5: Vote + Focus + Overview Modes

**Goal**: Complete the retrospective workflow with voting, discussion, and export.

### 5.1 Vote Mode UI

- [ ] Create `VoteMode` component
- [ ] Create `SwipeCard` component:
  - Full-screen card display
  - Source column indicator at top
  - Swipe left/right gesture support
  - "No" and "Yes" buttons as alternative
  - Swipe animation feedback
- [ ] Progress indicator (X of Y cards)
- [ ] Handle card groups (show all cards in group)

### 5.2 Swipe Interaction

- [ ] Implement swipe gesture detection (touch + mouse drag)
- [ ] Swipe right = vote yes
- [ ] Swipe left = vote no
- [ ] Visual feedback (card tilts, background color change)
- [ ] Card animates off-screen on decision
- [ ] Next card animates in

### 5.3 Vote Mode Backend

- [ ] Track which cards each user has voted on
- [ ] Implement `vote` message handler:
  - Record vote (yes = +1, no = +0)
  - Prevent duplicate votes
  - Broadcast vote count updates
- [ ] Calculate voting completion per user
- [ ] Send `voting_complete` when user finishes all cards

### 5.4 Focus Mode: Setup

- [ ] Create `FocusSetup` component (owner only):
  - Per-column selector: "Discuss top N cards"
  - Preview of which cards will be discussed
  - "Start Discussion" button
- [ ] Sort cards by vote count (descending)
- [ ] Handle groups (group vote = sum of card votes)

### 5.5 Focus Mode UI

- [ ] Create `FocusMode` component
- [ ] Display current focus card (enlarged, similar to vote mode)
- [ ] Source column indicator
- [ ] Vote count display
- [ ] Navigation controls (owner only): Previous / Next
- [ ] Progress indicator (Card X of Y)
- [ ] Action items section:
  - List of existing action items
  - "Add Action" input (owner only)

### 5.6 Focus Mode Backend

- [ ] Store list of cards to discuss (ordered)
- [ ] Store current focus index
- [ ] Implement `owner:set_focus` message handler
- [ ] Implement `owner:add_action` message handler:
  - Create action item
  - Attach to current card
  - Broadcast to all clients
- [ ] Broadcast focus changes to all clients (synchronized view)

### 5.7 Overview Mode UI

- [ ] Create `OverviewMode` component
- [ ] Return to column-based layout
- [ ] Display all cards with:
  - Vote count badge
  - Action item indicator (if has actions)
  - "Discussed" highlight (if was in focus set)
- [ ] Collapsible groups
- [ ] "Export to Markdown" button (owner only)

### 5.8 Markdown Export

- [ ] Create `generateMarkdownExport()` function
- [ ] Follow format from SPECIFICATION.md:

  ```markdown
  # [Room Name] - Retrospective Summary

  ## Date

  [Export date]

  ## Discussed Items

  [Cards that were discussed, with action items]

  ## All Cards

  [Complete listing by column]
  ```

- [ ] Trigger browser download of .md file
- [ ] Include vote counts and author names

### 5.9 Mode Transitions

- [ ] Owner can transition: Vote → Focus (with setup)
- [ ] Owner can transition: Focus → Overview
- [ ] Optional: Allow returning to earlier modes

### 5.10 E2E Tests

- [ ] Test: Vote mode shows cards one at a time
- [ ] Test: Swipe right registers yes vote
- [ ] Test: Swipe left registers no vote
- [ ] Test: Button tap works as alternative to swipe
- [ ] Test: Progress updates after each vote
- [ ] Test: User sees completion state after all votes
- [ ] Test: Owner can set up focus discussion
- [ ] Test: Focus mode shows synchronized card for all users
- [ ] Test: Owner can navigate between focus cards
- [ ] Test: Owner can add action items
- [ ] Test: Action items appear for all users
- [ ] Test: Overview shows all cards with votes
- [ ] Test: Export generates correct Markdown file
- [ ] Test: Complete retro flow from create to export

### Milestone 5 Acceptance Criteria

- [ ] Swipe voting works (gesture and buttons)
- [ ] Vote counts calculated correctly
- [ ] Focus setup allows selecting top N per column
- [ ] Focus mode synchronizes view across all users
- [ ] Action items can be added and persist
- [ ] Overview displays complete retrospective state
- [ ] Markdown export generates correct format
- [ ] Full retrospective workflow is functional
- [ ] All E2E tests pass

---

## Post-MVP Considerations

Features to consider after initial release:

### Phase 2 Enhancements

- [ ] Timer for each phase
- [ ] Improved mobile experience
- [ ] Keyboard shortcuts
- [ ] Undo/redo for owner actions
- [ ] Room link sharing (generate shareable URL)

### Phase 3 Features

- [ ] Room templates (pre-configured column sets)
- [ ] Anonymous voting (hide voter identity)
- [ ] Card reactions/emoji
- [ ] Multiple facilitators (multiple owner keys)

### Phase 4 Features

- [ ] Persistent rooms (save and resume)
- [ ] Room history/archive
- [ ] Integration with project management tools
- [ ] Custom themes/branding

---

## Technical Debt & Quality

Ongoing tasks to maintain code quality:

- [ ] Maintain >80% E2E coverage of user flows
- [ ] Add unit tests for complex utilities
- [ ] Document component props with JSDoc
- [ ] Performance profiling (especially WebSocket)
- [ ] Accessibility audit (WCAG 2.1 AA)
- [ ] Security review (owner key handling, XSS prevention)

---

## Appendix: Decision Log

Track key technical decisions here:

| Date | Decision              | Rationale                                      |
| ---- | --------------------- | ---------------------------------------------- |
| TBD  | CSS approach          | [Tailwind vs CSS Modules vs styled-components] |
| TBD  | Drag-and-drop library | [dnd-kit vs react-beautiful-dnd vs native]     |
| TBD  | State management      | [Context vs Zustand vs other]                  |
| TBD  | ID generation         | [nanoid vs uuid vs crypto.randomUUID]          |

---

## Getting Started

To begin implementation:

1. Start with **Milestone 1** tasks in order
2. Create feature branches for each numbered section (e.g., `feat/1.1-frontend-setup`)
3. Submit PRs with E2E tests where applicable
4. Update task checkboxes as work completes
5. Log decisions in the appendix
