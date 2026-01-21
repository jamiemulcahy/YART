# YART - Yet Another Retro Tool

A modern, real-time retrospective facilitation tool for software engineering teams.

## What is YART?

YART helps teams run effective retrospective meetings with a streamlined, collaborative workflow. Create columns for discussion topics (like "Mad, Sad, Glad" or custom themes), add cards anonymously, group related items, vote on what matters most, and focus discussions on the topics your team cares about.

## Key Features

- **Real-time collaboration** - All participants see updates instantly via PubSub
- **Anonymous participation** - Users are assigned anonymous names to encourage honest feedback
- **Flexible column structure** - Create any discussion topics that suit your team
- **Draft cards** - Write and refine your thoughts privately before publishing
- **Card grouping** - Drag and drop to cluster related cards together
- **Tinder-style voting** - Quick, intuitive swipe voting to prioritise discussions
- **Focused discussions** - Walk through prioritised cards together as a team
- **Action tracking** - Capture action items directly on cards during discussion
- **Export to Markdown** - Generate a summary of your retro for sharing and archiving

## Quick Start

### Join an Existing Room

1. Get the Room ID from your facilitator
2. Enter the Room ID on the landing page
3. Click "Join Room"

### Create a New Room

1. Click "Create Room" on the landing page
2. Enter a name for your retro
3. Share the Room ID with your team
4. Keep your Owner Key safe (this authorises facilitator actions)

## Room Modes

YART guides your retro through several phases:

| Mode | Description |
|------|-------------|
| **Edit** | Room owner sets up columns and structure |
| **Publish** | All members add and publish cards to columns |
| **Group** | Collaboratively group related cards together |
| **Vote** | Swipe to vote on which topics to discuss |
| **Focus** | Discuss prioritised cards one-by-one as a team |
| **Overview** | Review the complete retro and export summary |

## Documentation

- [Specification](docs/SPECIFICATION.md) - Detailed feature specification
- [Technical Overview](docs/TECHNICAL.md) - Architecture and tech stack
- [Contributing Guide](docs/CONTRIBUTING.md) - How to contribute to YART
- [Glossary](docs/GLOSSARY.md) - Key terms and concepts

## Tech Stack

- **Frontend**: React + TypeScript
- **Hosting**: GitHub Pages
- **Real-time**: Cloudflare Workers / Durable Objects
- **CDN/Proxy**: Cloudflare
- **Testing**: Playwright (E2E)

## Contributing

We welcome contributions! Please read our [Contributing Guide](docs/CONTRIBUTING.md) before submitting PRs.

## License

[MIT](LICENSE)
