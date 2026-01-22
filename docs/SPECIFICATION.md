# YART Specification

This document describes the functional specification for YART, including user flows, features, and room modes.

## Overview

YART facilitates team retrospective meetings through a structured, collaborative workflow. Teams progress through distinct phases: setup, card creation, grouping, voting, and focused discussion.

## Core Concepts

### Rooms

A room represents a single retrospective session. Each room has:

- A unique Room ID (shareable with participants)
- A Room Name (displayed to all participants)
- An Owner Key (secret, used to authorise owner actions)
- One or more Columns
- A current Mode

### Columns

Columns represent discussion topics or categories. Common patterns include:

- Mad / Sad / Glad
- Start / Stop / Continue
- What went well / What could improve / Ideas
- Custom topics relevant to your team

### Cards

Cards are individual discussion points added by participants. Each card has:

- Text content (the discussion point)
- An author (displayed as anonymous name)
- A column assignment
- A published/draft status
- Vote count (after voting phase)
- Action items (after discussion phase)

### Card Groups

During the grouping phase, related cards can be combined into groups. A group:

- Contains two or more cards
- Is treated as a single unit for voting and discussion
- Displays all contained cards together

### Users

Users are identified by:

- A session-based anonymous name (e.g., "Purple Penguin", "Green Giraffe")
- Anonymous names are visible to all room members
- Card authorship is shown via an icon with tooltip on hover

### Room Owner

The room creator is the owner and has special privileges:

- Identified by a secret Owner Key (assigned at room creation)
- Can add, edit, reorder, and delete columns
- Can transition the room between modes
- Can select how many cards to discuss per column
- Can add action items during focus mode
- Owner Key is never exposed in URLs to prevent accidental sharing

---

## Landing Page

The landing page is the entry point for all users.

### Actions Available

**Join Existing Room**

- Input: Room ID
- Action: Navigates to the room if it exists
- Error handling: Display message if room not found

**Create New Room**

- Input: Room Name
- Action: Creates room and navigates to it
- Output: User receives Room ID (to share) and Owner Key (to keep secret)

### Wireframe Reference

See `spec/wireframe-landing-page.png`

---

## Room Modes

### Edit Mode

**Purpose**: Room owner configures the room structure before the retro begins.

**Available to**: Room owner only

**Features**:

- Add new columns
- Rename existing columns
- Reorder columns (drag and drop)
- Delete columns
- Set room name

**Transitions to**: Publish Mode (owner action)

### Publish Mode

**Purpose**: All participants add their cards to columns.

**Available to**: All room members

**Features**:

- View all columns
- Add cards to the draft area of any column
- Edit draft cards
- Delete draft cards
- Publish draft cards (makes them visible to all)
- View other members' published cards
- See anonymous author indicator on cards

**Draft Area**:

- Located at the bottom of each column
- Completely private to each user
- Cards only become visible to others when explicitly published

**Wireframe Reference**: See `spec/wireframe-room-publish-mode.png`

**Transitions to**: Group Mode (owner action)

### Group Mode

**Purpose**: Collaboratively group related cards together.

**Available to**: All room members

**Features**:

- View all columns with published cards
- Drag and drop cards onto other cards to create groups
- Groups can only contain cards from the same column
- Drag cards onto existing groups to add them
- Click the "x" button on grouped cards to ungroup them
- Groups are visually distinct with a stacked appearance and card count badge

**Grouping Rules**:

- Only cards within the same column can be grouped together
- Dropping a card on a card from a different column has no effect
- Groups display all contained cards with the option to remove individual cards

**Wireframe Reference**: See `spec/wireframe-room-publish-mode.png` (similar layout)

**Transitions to**: Vote Mode (owner action)

### Vote Mode

**Purpose**: Prioritise which cards/groups to discuss.

**Available to**: All room members

**UI Approach**: Tinder-style swipe interface with keyboard support

**Features**:

- Columns are hidden
- Cards/groups are presented one at a time
- Each card is enlarged to fill most of the vertical space
- Source column title is displayed near the top for context
- Progress indicator shows remaining cards (e.g., "0 / 5 cards voted")
- Card entrance animation when transitioning between cards

**Voting Methods**:

- Swipe right (or tap "Yes" button) to vote for discussion
- Swipe left (or tap "No" button) to skip
- Press Right Arrow key to vote yes
- Press Left Arrow key to vote no

**Behaviour**:

- Each user votes on every card/group
- Votes are recorded immediately and affect the card's vote count
- After voting on all cards, a "Voting Complete!" message is shown

**Wireframe Reference**: See `spec/wireframe-room-vote-mode.png`

**Transitions to**: Focus Mode (owner action)

### Focus/Discuss Mode

**Purpose**: Structured discussion of prioritised cards.

**Available to**: All room members (viewing), Room owner (selection and actions)

**Layout**:

- Column-based view similar to Group mode
- Cards and groups are displayed within their columns
- Items sorted by vote count (highest first) within each column
- Groups show combined vote count (sum of all cards in group)
- Vote badges displayed on each card/group

**Discussion Modal**:

- Owner clicks on any card or group to open a discussion modal
- Modal displays:
  - Column name header
  - Card content (or all cards if a group)
  - Author name(s) and vote count
  - Action items list
  - Action item input form (owner only)
- Close button (owner only) to dismiss the modal
- All participants see the same modal when owner selects a card (synchronised view)

**Features**:

- Owner can add action items during discussion
- Action items are saved to the focused card
- Participants see the discussion modal but cannot close it or add actions
- Owner can discuss any card in any order (not restricted to linear navigation)

**Transitions to**: Overview Mode (owner action)

### Overview Mode

**Purpose**: Review the complete retrospective and export.

**Available to**: All room members (viewing), Room owner (export)

**Features**:

- Returns to column-based layout (similar to Publish mode)
- All columns visible with their grouped cards
- Vote counts displayed on cards
- Action items indicated with visual indicator (icon)
- Cards that were discussed may be highlighted

**Export Function** (Owner only):

- Generates a Markdown file containing:
  - Room title
  - Summary of discussed cards with their action items (organised by column)
  - Full listing of all columns with all cards

---

## Real-time Synchronisation

All room state changes are broadcast to participants in real-time:

- New cards published
- Cards grouped/ungrouped
- Mode transitions
- Current focus card (in Focus mode)
- Action items added

Synchronisation is handled via PubSub (Cloudflare Workers/Durable Objects).

---

## Export Format

The Markdown export follows this structure:

```markdown
# [Room Name] - Retrospective Summary

## Date

[Full date, e.g., "Wednesday, January 22, 2026"]

## Discussed Items

### [Column Name]

**[Card content]** (X votes, by [Author Name])

Action Items:

- [Action item 1]
- [Action item 2]

### [Column Name]

**[Card content]** (X votes, by [Author Name])

...

## All Cards

### [Column 1 Name]

- **[Card content]** (discussed)
  - X votes, by [Author Name]
  - Actions:
    - [Action item 1]
    - [Action item 2]
- **[Card content]**
  - X votes, by [Author Name]

### [Column 2 Name]

...
```

**Export Details**:

- Cards with action items are considered "discussed"
- Cards are sorted by vote count (highest first) within each column
- The "(discussed)" tag is added to cards that have action items
- Export filename format: `[room-name]-retro-[YYYY-MM-DD].md`
- Export is triggered via "Export to Markdown" button (owner only)

---

## Error States

| Scenario           | Handling                                       |
| ------------------ | ---------------------------------------------- |
| Room not found     | Display error message, return to landing       |
| Connection lost    | Display reconnecting indicator, auto-reconnect |
| Owner key invalid  | Reject owner action, display permission error  |
| Room mode mismatch | Sync to current mode from server               |

---

## Future Considerations

These features are out of scope for initial release but worth considering:

- Timer for each phase
- Anonymous voting (hide who voted for what)
- Card reactions/emoji
- Multiple facilitators
- Room templates
- Persistent rooms (multiple sessions)
- Integration with project management tools
