# YART Rebuild Spec

Status: **Agreed** — open questions resolved (§18). Implementation follows this spec.

## 1. Goals

- A good retro first: get everyone's thoughts out, converge on what matters, discuss it, leave with actions.
- Fun second, but never at the expense of the first. The game layer disguises voting and adds one optional, purely cosmetic battle stage.
- Anonymous, link-to-join rooms with real-time updates for everyone.
- Robust: refresh/reconnect never loses your identity; the server is the only source of truth; developers trying to break it can't.

### Non-goals (for v1)

- Accounts, logins, persistent teams, retro history across rooms.
- Multiple game themes (one theme, but art/sound kept separate from logic so themes can be added later).
- Mobile-first game play (the battle should degrade to spectating on small screens; everything else must work on mobile).

## 2. What we keep vs rebuild

| Area                                        | Decision                                                                           |
| ------------------------------------------- | ---------------------------------------------------------------------------------- |
| Domain, Cloudflare Workers, Durable Objects | **Keep** — one Durable Object (DO) per room, WebSocket Hibernation API.            |
| Worker HTTP routes                          | Keep the shape, tighten (see §13).                                                 |
| `RoomDO` logic                              | **Rewrite** against the new protocol and storage model.                            |
| Frontend                                    | **Rewrite** (React + Vite + TypeScript retained as the stack).                     |
| E2E tests                                   | Rewrite alongside new UI.                                                          |
| New: `shared/` package                      | Protocol types + validation + pure game/layout logic, used by worker and frontend. |

Proposed layout:

```
frontend/   React app
worker/     Cloudflare Worker + RoomDO
shared/     protocol.ts (message types + validators), limits.ts, battle/ (pure sim helpers), layout.ts
```

## 3. Core concepts

- **Room** — identified by a short shareable code (e.g. `K7M-QX2`, unambiguous characters only). Join link: `/r/<code>`.
- **Owner** — the participant who holds the room's **owner key**. Owner key is a secret returned on room creation, stored in the creator's browser. (Co-host / handing over facilitation is post-MVP.)
- **Participant** — anyone in the room. Gets a random made-up name ("Colourful Zebra", "Dastardly Pigeon") and a colour. Can rename themselves (within limits).
- **Viewer** — joins with "Join as viewer" (e.g. a TV in a meeting room). Sees everything public, has no cards, shields or ship, isn't counted as a participant.
- **Lane** — a column defined by the owner: title + short description.
- **Card** — a single thought in a lane, written by one participant.
- **Group** — a named stack of cards. A group behaves as one **topic** for voting, battle and discussion.
- **Topic** — a group, or a card that isn't in a group. This is what gets shields, gets attacked and gets discussed.
- **Shield** — a vote. Each participant has a fixed budget.

## 4. Identity and reconnection

This is the old app's biggest failure. Rules:

1. On first join, the client opens the WebSocket and sends `hello` with no token. The server creates a participant and returns `{ participantId, token }`. `token` is a random 32-byte secret; the server stores only its SHA-256 hash.
2. The client stores the token in `localStorage` under the room code.
3. On refresh/reconnect, the client sends `hello { token }`. If the hash matches, the socket is attached to **the same participant** — same name, colour, cards, shields, ownership.
4. Multiple tabs/sockets for one participant are allowed and all receive updates. A participant is "online" while ≥1 socket is open.
5. `participantId` is public (used to attribute things); `token` is never broadcast. Knowing someone's `participantId` grants nothing.
6. Owner proves ownership by including `ownerKey` in `hello`. Secrets go in the first message, **never in query strings** (they end up in logs).
7. Client auto-reconnects with backoff; on reconnect the server sends a full snapshot (§12), so there's no client-side "catch up" logic.

### Your rooms

The landing page lists rooms this browser can get back into (it holds their owner key or participant token): name, code, your role, current phase, who's online and last activity, most recent first. It lives in localStorage, so it's per browser — no accounts. Rooms that have expired or been deleted drop off automatically; "Forget" removes a room and its keys (with a warning when that means losing facilitator access).

## 5. Phases

Owner-controlled. Every phase change is broadcast and everyone's UI follows.

| #   | Phase       | Who does what                                                                                                       |
| --- | ----------- | ------------------------------------------------------------------------------------------------------------------- |
| 0   | **Setup**   | Owner creates lanes from a template or blank; sets options (§6, §7, §9). Participants can join and wait in a lobby. |
| 1   | **Write**   | Everyone adds/edits/deletes their own cards.                                                                        |
| 2   | **Group**   | Everyone drags cards into groups; names groups.                                                                     |
| 3   | **Defend**  | Everyone places shields on topics. (This is the vote.)                                                              |
| 4   | **Battle**  | Optional, cosmetic. Everyone defends the board from invaders. Owner can skip.                                       |
| 5   | **Discuss** | Owner opens topics in shield order; everyone sees the open topic, adds notes and actions.                           |
| 6   | **Wrap-up** | Summary view + markdown export.                                                                                     |

Navigation: owner can move forward or back one phase at a time. Going back from Defend to Group keeps shields on topics that still exist; shields on a dissolved group are refunded.

Lane templates: Mad/Sad/Glad · Liked/Learned/Lacked/Longed for · Start/Stop/Continue · Went well/To improve/Actions · Blank.

## 6. Timer

A facilitation tool only — not tied to phases and never enforces anything.

- Owner sets a duration (5 s – 60 min), and can **start**, **pause**, **resume**, **reset**, **restart** at any time, any number of times.
- Compact, in the header: the owner sees `m:ss ▶ ↺` and clicks the time to change the length: digits fill in microwave style (`30` = 0:30, `130` = 1:30, `500` = 5:00), and `1:30`, `45s`, `2m` also work, with a live preview. Participants only see it while it's in use. Changing the length while paused keeps it paused at the new length.
- Server state: `{ status: 'idle' | 'running' | 'paused' | 'done', durationMs, endsAt?, remainingMs? }`.
- Clients render the countdown from `endsAt` adjusted by their measured clock offset (§12.3). Everyone sees the same time; refreshing doesn't change it.
- At zero: every client plays an alarm sound and shows a "Time's up" state. Per-user mute toggle (persisted locally). Browsers block audio until the user has interacted with the page, so the join flow must include a click (the "Join" button counts).

## 7. Card visibility

Cards start as **drafts** in a private tray at the bottom of each lane — typing (Enter or Ctrl+Enter) always saves a draft; publishing is a separate click. Drafts live only in the author's browser (localStorage, survives refresh) and never reach the server until published — one at a time or "Publish all".

Owner option for **published** cards, set in Setup and changeable during Write: **Visible** or **Face-down until revealed** (default: visible, since drafts already give privacy).

- Adding a card always produces a visible event for everyone (a face-down card appears in the lane).
- In hidden mode, other participants receive the card as `{ id, laneId, authorId, hidden: true }` — no text, no length. Rendered as a face-down card. The author always sees their own text.
- Reveal happens when the owner presses **Reveal**, or automatically when leaving Write.
- On any visibility change, the server sends each socket a fresh, **per-viewer filtered snapshot** of cards. (Simpler than "notify then client re-fetches", and the same code path as reconnect.)
- The server filters per viewer on every card message, so hidden text never leaves the DO for anyone but the author.

Lanes keep a generous minimum width (600 px) and cards flow like post-its in balanced columns of uneven heights. Lanes scroll sideways when there are many. The owner picks each lane's colour in Setup; cards are tinted by their lane.

## 8. Cards and grouping

### Cards

- Cards carry no author indicator at all (a colour would map back to a name via the people list) — not even for the owner. Your own cards are marked "yours". The server keeps authorship to permit edits.
- Owner option **Allow late cards** (default off): permits adding cards during Group.
- Author can edit or delete their own card in Write. In Group onwards, card text is frozen (edits would change what people voted for).
- Owner can remove any readable card (moderation) up to the end of Defend; after that, removing one would silently change the votes being discussed.
- Plain text only; rendered as text, never HTML. Line breaks preserved.

### Grouping

- Drag a card onto another card → creates a group of two. Drag onto a group → joins it. Drag out of a group → leaves it. A group with one card left dissolves.
- Groups live in the lane of the card they were created on; cards from other lanes may join (shown with their lane colour).
- Anyone can name a group (last write wins, shows who named it). Default name: first card's text, truncated.
- **Soft lock while dragging**: picking up a card broadcasts `held by Purple Penguin`; others can't grab it until dropped or 10 s pass. Prevents two people dragging the same card.
- The server applies moves in arrival order and broadcasts the result; clients only animate what the server confirms (with an optimistic local preview while dragging).
- Owner can **lock grouping** before moving on.

## 9. Defend (voting)

- Each participant gets **N shields** (owner sets, default 5, range 1–20) and may put at most **M on one topic** (default 3, range 1–N).
- Click a topic to add a shield, click your shield (or right-click/long-press) to remove. Changeable until the owner closes the phase.
- Visuals: a shield bubble around the topic grows with total shields; your own shields are highlighted.
- Owner option **Show totals live** (default off): when off, participants only see their own shields until the phase ends — avoids bandwagoning. The owner always sees totals.
- Remaining shield count is always visible to each participant.
- On leaving Defend, final totals are locked and become the discussion order.

## 10. Battle (optional, cosmetic)

**The battle cannot change the retro.** Discussion order is the shield count, full stop. The battle just gives every topic a dramatic fate (survived / fell) and gives the team two minutes of chaos.

### 10.1 Arena

- Logical coordinate space of **1000 × 1000** units, scaled to the screen. All positions in messages and scripts use these units, so every screen agrees.
- **One lane at a time is under attack.** For 15–45 s (default 25) its topics fill the arena; then that lane flies down to safety (survivors marked SAFE) while the next lane drops in. Pressure rises lane by lane: more grunts (×1.25 → ×1.8) and more bosses (none in the opening lane).
- Within a level, topics are laid out in a deterministic grid from a shared `layout(topics)` function (sorted by topic id) in `shared/`. Every client and the server compute identical positions.
- Each participant has a ship on the bottom edge, moved horizontally by mouse or ←/→ (A/D). Space or click fires. Fire rate capped (e.g. 4 shots/s).
- Topic HP = `BASE_HP + SHIELD_HP × shields`.

### 10.2 Attackers

- **Grunts**: small, low HP, fast, each targets one topic.
- **Bosses** (0 in the first lane, rising to 3 in later lanes; +1 with 6+ players): big, slow, HP scaled with player count, travel across several topics damaging each. Need the team to gang up.
- Total attacker damage and HP are tuned from player count and total shields so that, typically, unshielded topics fall and well-shielded ones survive. Tuning target (to validate in playtests): ~70 % of unshielded topics fall, top 3 topics survive ~90 % of the time.
- Ends after the last level, or early via **End battle now** (only levels that started get fates).
- Tuning: topic HP 25 + 15/shield; grunts 2 HP, `(2.7 + 1.3 × players) × lane intensity` per topic, 3 strikes of 6. `shared/src/battle-balance.test.ts` simulates teams of different size and skill and pins the curve: lane 1 holdable, later lanes harder, shields still matter.

### 10.3 Keeping everyone in sync (the important bit)

The server generates the whole battle up front as a **script** and sends it to everyone:

```ts
type AttackerScript = {
  id: number;
  kind: "grunt" | "boss";
  hp: number;
  spawnAt: number; // server ms
  // piecewise-linear path; position at time t is pure interpolation
  waypoints: { x: number; y: number; at: number }[];
  // damage events: "if I'm still alive at `at`, deal `dmg` to `topicId`"
  strikes: { topicId: string; at: number; dmg: number }[];
};
```

- Because position is a pure function of time, every client draws every attacker in the same place at the same moment. Nothing about movement is ever sent again.
- The only thing that diverges is **whether an attacker is alive**, and only the server decides that:
  - Clients detect hits locally and send claims: `{ attackerId, at }`.
  - Server validates each claim: attacker exists, spawned, not dead, `at` within the last ~1 s, player within their fire-rate budget. Valid → subtract damage.
  - Server processes due `strikes` on a ~5 Hz loop: if the attacker is alive at the strike time, the topic takes damage.
  - The script is sized for everyone online at launch. Strike damage is scaled by the share of players who are actually sending input (minimum 35 %), so a room full of idle people doesn't get flattened.
- Clients show an instant hit flash (optimistic) but only show a **death** or **topic damage** when the server confirms. No "I saw it attack A, you saw it attack B": targets are in the script; outcomes come from one authority.
- Late joiners / refreshers receive the script + current state and drop straight in.

### 10.4 Message budget

- Client → server: one message per ~200 ms while playing: `{ x, hits: [...] }` (ship position + hit claims batched).
- Server → clients: one broadcast per ~200 ms: ship positions, attacker HP changes, deaths, topic HP changes.
- Estimate for 10 players × 90 s: ~4,500 inbound, ~450 outbound broadcasts. Clients interpolate ship positions between updates.
- The DO stays awake for the battle only; it goes back to hibernation afterwards.

### 10.5 End of battle

- Each topic is marked **survived** or **fell** (badge only).
- Fun stats screen: most attackers destroyed, boss-killer, etc., by anonymous name. Owner option to hide individual stats.
- Owner can end a battle early (**End battle now**), replay it, or click **Discuss** to move on.

### 10.6 Presentation

- Single theme v1: space invaders vs. the board. Sprites, sounds and palette in a `theme` module separate from logic.
- Rendered on a Canvas 2D layer over the board (a few dozen sprites — no engine needed; revisit PixiJS only if perf demands).
- Small screens/touch: spectate with tap-to-fire as a stretch goal.

## 11. Discuss and wrap-up

### Discuss

- Topics listed by shields (desc). Ties: more cards in group first, then earliest created.
- Owner **opens** a topic → it opens full-screen-ish for everyone. Owner can step **next/previous** or pick any topic.
- **Notes**: append-only list of short notes on the open topic, each editable/deletable by its author (avoids collaborative-text-editing conflicts). Owner can delete any note.
- **Actions**: text + optional owner (free text). Can be added on any topic, or as general room actions.
- Owner can mark a topic **discussed**.

### Export (markdown)

Available to everyone in Wrap-up. Example:

```markdown
# Sprint 42 Retro — 2026-10-29

Participants: 8 · Shields per person: 5

## Topics (by shields)

### 1. Deploys are too slow — 🛡 14 (survived)

_Group of 3 · Sad, Mad_

- Pipeline takes 40 min (Sad)
- Flaky integration tests block deploys (Mad)
- Staging always broken (Sad)

**Notes**

- Most time is spent in the e2e stage

**Actions**

- [ ] Split e2e suite into parallel shards — Alex

### 2. ...

## Other cards (no shields)

- ...

## Actions

- [ ] Split e2e suite into parallel shards — Alex
- [ ] ...
```

## 12. Protocol

JSON over one WebSocket per tab. Every message has `t` (type). All types and validators live in `shared/protocol.ts`; the server validates every inbound message and drops (and counts) invalid ones.

### 12.1 Client → server

| Type                                                                          | Who                       | Phase            |
| ----------------------------------------------------------------------------- | ------------------------- | ---------------- |
| `hello { token?, ownerKey? }`                                                 | any                       | any              |
| `ping { clientTime }`                                                         | any                       | any              |
| `rename { name }`                                                             | any                       | any              |
| `lane.add/update/remove/reorder`                                              | owner                     | Setup            |
| `settings.update { ...partial }`                                              | owner                     | any              |
| `phase.set { phase }`                                                         | owner                     | any              |
| `timer.set { durationMs }` / `timer.start/pause/resume/reset`                 | owner                     | any              |
| `card.add { laneId, text }` / `card.edit { id, text }` / `card.remove { id }` | author (owner may remove) | Write            |
| `cards.reveal`                                                                | owner                     | Write            |
| `card.hold { id }` / `card.release { id }`                                    | any                       | Group            |
| `card.move { id, toGroupId? , toCardId? , ungroup? }`                         | any                       | Group            |
| `group.rename { id, title }`                                                  | any                       | Group            |
| `shield.add { topicId }` / `shield.remove { topicId }`                        | any                       | Defend           |
| `battle.input { x, hits: { attackerId, at }[] }`                              | any                       | Battle           |
| `topic.open { topicId }` / `topic.markDiscussed { topicId }`                  | owner                     | Discuss          |
| `note.add/edit/remove`, `action.add/edit/remove`                              | any (own) / owner (any)   | Discuss, Wrap-up |

### 12.2 Server → client

- `welcome { participantId, token?, isOwner, serverTime }` then `snapshot { ...full room state filtered for this viewer }`.
- Granular events for everything else (`card.added`, `card.updated`, `group.updated`, `phase.changed`, `timer.changed`, `shields.changed`, `participant.joined/left/renamed`, `topic.opened`, `note.*`, `action.*`).
- `battle.start { script, layout, endsAt }`, `battle.tick { ships, attackerHp, deaths, topicHp }`, `battle.end { results }`.
- `error { code, message, ref? }` for rejected requests (e.g. `LIMIT_CARD_TEXT`, `NOT_OWNER`, `WRONG_PHASE`, `RATE_LIMITED`).

No sequence numbers: a WebSocket delivers in order while connected, and every (re)connect starts with a full per-viewer snapshot, so there is nothing to reconcile.

### 12.3 Clock sync

On connect, the client sends a few `ping`s and estimates server-clock offset (NTP-style: `offset = serverTime - (sent + rtt/2)`), re-checked every ~30 s. Used by the timer and the battle.

## 13. Limits and abuse protection

All enforced server-side; mirrored client-side for nice UX. Values live in `shared/limits.ts`.

| Thing                              | Limit                          |
| ---------------------------------- | ------------------------------ |
| Room name                          | 80 chars                       |
| Lanes per room                     | 10                             |
| Lane title / description           | 40 / 140 chars                 |
| Card text                          | 500 chars                      |
| Cards per participant / per room   | 50 / 500                       |
| Group title                        | 80 chars                       |
| Participant name                   | 32 chars                       |
| Participants per room              | 50                             |
| Note / action text                 | 500 chars                      |
| Notes per topic / actions per room | 50 / 100                       |
| Inbound message size               | 4 KB                           |
| Inbound rate (non-battle)          | ~20 msg/s per socket, burst 40 |
| Inbound rate (battle)              | ~10 msg/s per socket           |

Also:

- Text is trimmed, control characters stripped, normalised (NFC); zero-width/blank-only text rejected.
- Never render user text as HTML.
- Sockets that repeatedly exceed rate limits or send invalid messages get closed.
- CORS restricted to our own origins (currently reflects any origin).
- Room creation rate-limited per IP.
- Rooms expire after 30 days of inactivity (DO alarm deletes storage).

## 14. Storage

- Use the SQLite-backed DO storage with proper tables (`participants`, `lanes`, `cards`, `groups`, `shields`, `notes`, `actions`, `settings`) instead of rewriting a single `room` blob on every change. Blob rewrites get slow and risk storage value size limits as rooms grow toward the card limits.
- Battle state is in memory only (and the final results persisted). If the DO restarts mid-battle, the battle ends with current results.

## 15. Known problems in the current code (for reference)

- **Refresh creates a new user**: on reconnect, if the old socket is still registered as open (common during refresh), the server treats the `userId` as "already connected" and mints a fresh identity (`worker/src/room.ts`, WebSocket upgrade handler).
- `userId` is used as the identity credential but is also broadcast to everyone, so anyone can impersonate anyone by connecting with their `userId`.
- `ownerKey` and `userId` travel in the WebSocket URL query string.
- CORS reflects any `Origin`.
- Whole room serialized and rewritten on every mutation.

## 16. Testing approach

Lean on end-to-end and integration testing first; unit tests only where there's genuinely intricate logic.

- **E2E (primary)**: Playwright against the real worker (`wrangler dev`) and frontend, with multiple browser contexts per test (owner + participants) covering join, refresh-keeps-identity, hidden/reveal, grouping, shields, battle start/end, discuss, export, abuse limits.
- **Integration**: protocol-level tests that open real WebSockets to `wrangler dev` to hammer validation, limits, rate limiting and phase rules faster than a browser can.
- **Unit (only where it earns it)**: battle script generation / strike resolution and anything else with tricky logic.
- **Lint/format/typecheck** enforced in CI and pre-commit.
- **Manual QA**: multi-user browser sessions trying scenarios in different orders, plus a fit-for-purpose review against §1.

## 17. Tooling to install

- `pnpm` — `corepack enable pnpm` (Node 24 is already present).
- `wrangler` — comes in via `pnpm install` (worker devDependency); `wrangler login` needs doing by you for deploys.
- Playwright browsers — `pnpm exec playwright install --with-deps chromium`.

## 18. Decisions (resolved questions)

1. Co-host link / handing over driving: **post-MVP**.
2. Card authorship: **colour only**, no names, even for the owner.
3. Late cards during Group: **owner option, off by default**.
4. Battle stats by (anonymous) name: **on**, owner can hide.
5. Room expiry: **30 days** after last activity, plus owner "delete room now".
6. Spectator: **"Join as viewer"** mode in MVP.
7. Old GitHub issues: close with a link to the rebuild PR when it merges.
