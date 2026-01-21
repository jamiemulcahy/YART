# Glossary

This document defines key terms and concepts used throughout the YART project. Consistent terminology helps maintain clear communication in code, documentation, and discussions.

---

## Core Concepts

### Room

A single retrospective session. Each room is identified by a unique Room ID and contains columns, cards, and participants. A room progresses through various modes during a retrospective.

**Related**: Room ID, Room Mode, Room Owner

---

### Room ID

A unique, randomly generated identifier for a room. Shared with participants to allow them to join. URL-safe and sufficiently long to prevent guessing.

**Example**: `abc123xyz`

---

### Room Mode

The current phase of the retrospective. Determines what actions are available to participants.

| Mode | Description |
|------|-------------|
| Edit | Owner configures room structure |
| Publish | Participants add and publish cards |
| Group | Participants group related cards |
| Vote | Participants vote on cards to discuss |
| Focus | Team discusses prioritised cards |
| Overview | Review and export the retrospective |

---

### Room Owner

The user who created the room. Has elevated privileges including:
- Adding, editing, and deleting columns
- Transitioning between room modes
- Selecting cards for discussion
- Adding action items

Identified by the Owner Key.

---

### Owner Key

A secret token assigned when a room is created. Used to authenticate owner-only actions. Must be kept private and is never included in URLs.

---

## Cards and Columns

### Column

A category or topic for discussion within a room. Examples:
- "What went well"
- "What could improve"
- "Mad / Sad / Glad"

Columns contain cards and are displayed side-by-side in the room.

---

### Card

An individual discussion point created by a participant. Contains:
- **Content**: The text of the discussion point
- **Author**: The anonymous name of the creator
- **Column**: Which column the card belongs to
- **Status**: Draft or Published

---

### Draft Card

A card that has been created but not yet published. Visible only to its author in the draft area. Becomes visible to all participants when published.

---

### Published Card

A card that has been made visible to all room participants. Cannot be edited once published (in the current design).

---

### Card Group

Two or more cards that have been grouped together because they share a theme or topic. Created during Group Mode by dragging cards onto each other.

A group:
- Is treated as a single unit for voting
- Displays all contained cards together
- Can be ungrouped by dragging cards out

---

### Draft Area

A private section at the bottom of each column where a participant's unpublished cards appear. Only visible to the card author.

---

## Participants

### Participant / Member

Any user who has joined a room, including the room owner. All participants can add cards and vote.

---

### Anonymous Name

A randomly assigned display name for each participant (e.g., "Purple Penguin", "Clever Koala"). Used to identify card authors without revealing real identities. Encourages honest feedback.

---

## Voting and Discussion

### Vote

A participant's indication of whether they want to discuss a particular card or group. Cast during Vote Mode via swipe gesture (or button tap).

- **Swipe Right / Yes**: Wants to discuss
- **Swipe Left / No**: Does not want to discuss

---

### Vote Count

The number of "Yes" votes a card or group received. Used to prioritise which cards are discussed in Focus Mode.

---

### Focus Card

The card currently being discussed in Focus Mode. All participants see the same focus card simultaneously (synchronised view).

---

### Action Item

A task or follow-up captured during discussion of a card. Added by the room owner during Focus Mode. Exported with the retrospective summary.

**Example**: "[ ] Schedule follow-up meeting with team leads"

---

## Technical Terms

### PubSub

Publish-Subscribe messaging pattern. Used to broadcast real-time updates to all participants in a room. Implemented via Cloudflare Workers and Durable Objects.

---

### Durable Object

A Cloudflare serverless primitive that provides persistent state and WebSocket coordination. Each room is managed by a dedicated Durable Object instance.

---

### WebSocket

A persistent, bidirectional connection between the browser and server. Used for real-time synchronisation of room state.

---

### Optimistic Update

A UI pattern where changes are reflected immediately in the interface before server confirmation. Improves perceived responsiveness. Reconciled with server state if there's a mismatch.

---

## Modes Explained

### Edit Mode

**Who**: Room Owner only  
**Purpose**: Set up the room structure  
**Actions**: Add/edit/delete/reorder columns

---

### Publish Mode

**Who**: All participants  
**Purpose**: Add discussion points  
**Actions**: Create draft cards, edit drafts, publish cards

---

### Group Mode

**Who**: All participants  
**Purpose**: Organise related cards  
**Actions**: Drag and drop cards to create/modify groups

---

### Vote Mode

**Who**: All participants  
**Purpose**: Prioritise discussion topics  
**Actions**: Swipe left/right on each card

---

### Focus Mode

**Who**: All participants (viewing), Owner (navigating)  
**Purpose**: Discuss prioritised cards  
**Actions**: View enlarged cards, owner adds action items

---

### Overview Mode

**Who**: All participants (viewing), Owner (exporting)  
**Purpose**: Review and export  
**Actions**: View full retrospective, export to Markdown

---

## Export

### Retrospective Summary

A Markdown document generated at the end of a retrospective. Contains:
- Room title and date
- Discussed cards with their action items
- Full listing of all columns and cards

Used for sharing with stakeholders or archiving.
