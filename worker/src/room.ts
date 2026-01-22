import type { DurableObjectState } from "@cloudflare/workers-types";

interface Card {
  id: string;
  columnId: string;
  content: string;
  authorId: string;
  authorName: string;
  votes: number;
  groupId?: string;
  actionItems: Array<{ id: string; content: string }>;
}

interface CardGroup {
  id: string;
  cardIds: string[];
}

interface RoomState {
  name: string;
  ownerKey: string;
  mode: "edit" | "publish" | "group" | "vote" | "focus" | "overview";
  columns: Array<{ id: string; name: string; order: number }>;
  cards: Card[];
  groups: CardGroup[];
  focusedCardId: string | null;
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  isOwner: boolean;
  votesCount: number;
}

export class RoomDO {
  private state: DurableObjectState;
  private room: RoomState | null = null;

  constructor(state: DurableObjectState) {
    this.state = state;
    // Load room state from storage on construction
    this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<RoomState>("room")) ?? null;
    });
  }

  // Get user from WebSocket attachment (survives hibernation)
  private getUser(ws: WebSocket): User | null {
    try {
      return ws.deserializeAttachment() as User | null;
    } catch {
      return null;
    }
  }

  // Set user on WebSocket attachment
  private setUser(ws: WebSocket, user: User): void {
    ws.serializeAttachment(user);
  }

  // Get all connected users
  private getAllUsers(): User[] {
    const webSockets = this.state.getWebSockets();
    const users: User[] = [];
    for (const ws of webSockets) {
      const user = this.getUser(ws);
      if (user) {
        users.push(user);
      }
    }
    return users;
  }

  async fetch(request: Request): Promise<Response> {
    const url = new URL(request.url);

    // Internal: Initialize room
    if (url.pathname === "/init" && request.method === "POST") {
      const { name, ownerKey } = (await request.json()) as {
        name: string;
        ownerKey: string;
      };

      this.room = {
        name,
        ownerKey,
        mode: "edit",
        columns: [],
        cards: [],
        groups: [],
        focusedCardId: null,
        createdAt: new Date().toISOString(),
      };

      await this.state.storage.put("room", this.room);

      return new Response("OK");
    }

    // Internal: Get room info
    if (url.pathname === "/info") {
      if (!this.room) {
        return new Response(JSON.stringify({ exists: false }), {
          headers: { "Content-Type": "application/json" },
        });
      }

      return new Response(
        JSON.stringify({ exists: true, name: this.room.name }),
        { headers: { "Content-Type": "application/json" } }
      );
    }

    // WebSocket upgrade
    if (request.headers.get("Upgrade") === "websocket") {
      if (!this.room) {
        return new Response("Room not found", { status: 404 });
      }

      const pair = new WebSocketPair();
      const [client, server] = Object.values(pair);

      // Generate anonymous user
      const user: User = {
        id: generateId(16),
        name: generateAnonymousName(),
        isOwner: false,
        votesCount: 0,
      };

      // Accept WebSocket with hibernation API and attach user data
      this.state.acceptWebSocket(server);
      this.setUser(server, user);

      // Get all users including the new one
      const allUsers = this.getAllUsers();

      // Send initial state
      server.send(
        JSON.stringify({
          type: "state",
          room: {
            id: "",
            name: this.room.name,
            mode: this.room.mode,
            columns: this.room.columns,
            cards: this.room.cards,
            groups: this.room.groups,
            focusedCardId: this.room.focusedCardId,
            createdAt: this.room.createdAt,
          },
          user,
          users: allUsers,
        })
      );

      // Broadcast user joined to others
      this.broadcast(JSON.stringify({ type: "user_joined", user }), server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(
    ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") return;
    if (!this.room) return;

    try {
      const data = JSON.parse(message);
      await this.handleMessage(ws, data);
    } catch {
      console.error("Failed to parse WebSocket message");
    }
  }

  private async handleMessage(
    ws: WebSocket,
    data: Record<string, unknown>
  ): Promise<void> {
    if (!this.room) return;

    const type = data.type as string;

    // Owner actions require owner key validation
    if (type.startsWith("owner:")) {
      const ownerKey = data.ownerKey as string;
      if (!this.validateOwnerKey(ownerKey)) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "UNAUTHORIZED",
            message: "Invalid owner key",
          })
        );
        return;
      }
    }

    switch (type) {
      case "ping":
        ws.send(JSON.stringify({ type: "pong" }));
        return;

      case "owner:add_column":
        await this.handleAddColumn(data.name as string);
        break;

      case "owner:update_column":
        await this.handleUpdateColumn(
          data.columnId as string,
          data.name as string
        );
        break;

      case "owner:delete_column":
        await this.handleDeleteColumn(data.columnId as string);
        break;

      case "owner:reorder_columns":
        await this.handleReorderColumns(data.columnIds as string[]);
        break;

      case "owner:set_mode":
        await this.handleSetMode(
          data.mode as
            | "edit"
            | "publish"
            | "group"
            | "vote"
            | "focus"
            | "overview"
        );
        break;

      case "publish_card":
        await this.handlePublishCard(
          ws,
          data.columnId as string,
          data.content as string
        );
        break;

      case "delete_card":
        await this.handleDeleteCard(ws, data.cardId as string);
        break;

      case "group_cards":
        await this.handleGroupCards(data.cardIds as string[]);
        break;

      case "ungroup_card":
        await this.handleUngroupCard(data.cardId as string);
        break;

      case "vote":
        await this.handleVote(ws, data.cardId as string, data.vote as boolean);
        break;

      case "owner:set_focus":
        await this.handleSetFocus(data.cardId as string | null);
        break;

      case "owner:add_action":
        await this.handleAddAction(
          data.cardId as string,
          data.content as string
        );
        break;

      default:
        console.log("Unknown message type:", type);
    }
  }

  private validateOwnerKey(key: string): boolean {
    return this.room?.ownerKey === key;
  }

  private async handleAddColumn(name: string): Promise<void> {
    if (!this.room || !name?.trim()) return;

    const column = {
      id: generateId(8),
      name: name.trim(),
      order: this.room.columns.length,
    };

    this.room.columns.push(column);
    await this.state.storage.put("room", this.room);

    this.broadcast(JSON.stringify({ type: "column_added", column }));
  }

  private async handleUpdateColumn(
    columnId: string,
    name: string
  ): Promise<void> {
    if (!this.room || !columnId || !name?.trim()) return;

    const column = this.room.columns.find((c) => c.id === columnId);
    if (!column) return;

    column.name = name.trim();
    await this.state.storage.put("room", this.room);

    this.broadcast(JSON.stringify({ type: "column_updated", column }));
  }

  private async handleDeleteColumn(columnId: string): Promise<void> {
    if (!this.room || !columnId) return;

    const index = this.room.columns.findIndex((c) => c.id === columnId);
    if (index === -1) return;

    this.room.columns.splice(index, 1);

    // Re-order remaining columns
    this.room.columns.forEach((col, i) => {
      col.order = i;
    });

    await this.state.storage.put("room", this.room);

    this.broadcast(JSON.stringify({ type: "column_deleted", columnId }));
  }

  private async handleReorderColumns(columnIds: string[]): Promise<void> {
    if (!this.room || !columnIds?.length) return;

    // Validate all column IDs exist
    const existingIds = new Set(this.room.columns.map((c) => c.id));
    if (!columnIds.every((id) => existingIds.has(id))) return;

    // Update order based on the new array
    const columnMap = new Map(this.room.columns.map((c) => [c.id, c]));
    this.room.columns = columnIds
      .map((id, index) => {
        const col = columnMap.get(id);
        if (col) {
          col.order = index;
          return col;
        }
        return null;
      })
      .filter((c): c is NonNullable<typeof c> => c !== null);

    await this.state.storage.put("room", this.room);

    this.broadcast(JSON.stringify({ type: "columns_reordered", columnIds }));
  }

  private async handleSetMode(
    mode: "edit" | "publish" | "group" | "vote" | "focus" | "overview"
  ): Promise<void> {
    if (!this.room || !mode) return;

    this.room.mode = mode;
    await this.state.storage.put("room", this.room);

    this.broadcast(JSON.stringify({ type: "mode_changed", mode }));
  }

  private async handlePublishCard(
    ws: WebSocket,
    columnId: string,
    content: string
  ): Promise<void> {
    if (!this.room || !columnId || !content?.trim()) return;

    // Validate column exists
    const column = this.room.columns.find((c) => c.id === columnId);
    if (!column) return;

    // Validate content length
    const trimmedContent = content.trim();
    if (trimmedContent.length > 1000) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "CONTENT_TOO_LONG",
          message: "Card content cannot exceed 1000 characters",
        })
      );
      return;
    }

    // Get the user who sent this message
    const user = this.getUser(ws);
    if (!user) return;

    const card: Card = {
      id: generateId(8),
      columnId,
      content: trimmedContent,
      authorId: user.id,
      authorName: user.name,
      votes: 0,
      actionItems: [],
    };

    this.room.cards.push(card);
    await this.state.storage.put("room", this.room);

    this.broadcast(JSON.stringify({ type: "card_published", card }));
  }

  private async handleDeleteCard(ws: WebSocket, cardId: string): Promise<void> {
    if (!this.room || !cardId) return;

    // Get the user who sent this message
    const user = this.getUser(ws);
    if (!user) return;

    // Find the card
    const cardIndex = this.room.cards.findIndex((c) => c.id === cardId);
    if (cardIndex === -1) return;

    const card = this.room.cards[cardIndex];

    // Only allow users to delete their own cards
    if (card.authorId !== user.id) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "UNAUTHORIZED",
          message: "You can only delete your own cards",
        })
      );
      return;
    }

    // Remove from any groups
    if (card.groupId) {
      const group = this.room.groups.find((g) => g.id === card.groupId);
      if (group) {
        group.cardIds = group.cardIds.filter((id) => id !== cardId);
        // Remove group if less than 2 cards remain
        if (group.cardIds.length < 2) {
          this.room.groups = this.room.groups.filter((g) => g.id !== group.id);
          // Clear groupId from remaining card if any
          if (group.cardIds.length === 1) {
            const remainingCard = this.room.cards.find(
              (c) => c.id === group.cardIds[0]
            );
            if (remainingCard) {
              remainingCard.groupId = undefined;
            }
          }
        }
      }
    }

    // Remove the card
    this.room.cards.splice(cardIndex, 1);
    await this.state.storage.put("room", this.room);

    this.broadcast(JSON.stringify({ type: "card_deleted", cardId }));
  }

  private async handleGroupCards(cardIds: string[]): Promise<void> {
    if (!this.room || !cardIds || cardIds.length < 2) return;

    // Validate all cards exist and are in the same column
    const cards = cardIds
      .map((id) => this.room!.cards.find((c) => c.id === id))
      .filter((c): c is Card => c !== undefined);

    if (cards.length !== cardIds.length) return;

    const columnId = cards[0].columnId;
    if (!cards.every((c) => c.columnId === columnId)) return;

    // Check if any card is already in a group
    const existingGroupId = cards.find((c) => c.groupId)?.groupId;

    if (existingGroupId) {
      // Add cards to existing group
      const group = this.room.groups.find((g) => g.id === existingGroupId);
      if (group) {
        for (const card of cards) {
          if (!group.cardIds.includes(card.id)) {
            group.cardIds.push(card.id);
          }
          card.groupId = group.id;
        }
        await this.state.storage.put("room", this.room);
        this.broadcast(JSON.stringify({ type: "cards_grouped", group }));
      }
    } else {
      // Create new group
      const group: CardGroup = {
        id: generateId(8),
        cardIds: cardIds,
      };
      this.room.groups.push(group);

      // Update card groupIds
      for (const card of cards) {
        card.groupId = group.id;
      }

      await this.state.storage.put("room", this.room);
      this.broadcast(JSON.stringify({ type: "cards_grouped", group }));
    }
  }

  private async handleUngroupCard(cardId: string): Promise<void> {
    if (!this.room || !cardId) return;

    const card = this.room.cards.find((c) => c.id === cardId);
    if (!card || !card.groupId) return;

    const group = this.room.groups.find((g) => g.id === card.groupId);
    if (!group) return;

    // Remove card from group
    group.cardIds = group.cardIds.filter((id) => id !== cardId);
    card.groupId = undefined;

    // If only one card remains in group, dissolve the group
    if (group.cardIds.length < 2) {
      if (group.cardIds.length === 1) {
        const lastCard = this.room.cards.find((c) => c.id === group.cardIds[0]);
        if (lastCard) {
          lastCard.groupId = undefined;
        }
      }
      this.room.groups = this.room.groups.filter((g) => g.id !== group.id);
    }

    await this.state.storage.put("room", this.room);
    this.broadcast(JSON.stringify({ type: "card_ungrouped", cardId }));
  }

  private async handleVote(
    ws: WebSocket,
    cardId: string,
    vote: boolean
  ): Promise<void> {
    if (!this.room || !cardId) return;

    const card = this.room.cards.find((c) => c.id === cardId);
    if (!card) return;

    // Increment votes if yes, do nothing if no
    if (vote) {
      card.votes += 1;
    }

    await this.state.storage.put("room", this.room);
    this.broadcast(
      JSON.stringify({
        type: "vote_recorded",
        cardId,
        votes: card.votes,
      })
    );

    // Update user's vote progress count
    const user = this.getUser(ws);
    if (user) {
      user.votesCount = (user.votesCount || 0) + 1;
      this.setUser(ws, user);
      // Broadcast vote progress to all users
      this.broadcast(
        JSON.stringify({
          type: "vote_progress",
          userId: user.id,
          votesCount: user.votesCount,
        })
      );
    }
  }

  private async handleSetFocus(cardId: string | null): Promise<void> {
    if (!this.room) return;

    // Validate card exists if cardId is provided
    if (cardId !== null) {
      const card = this.room.cards.find((c) => c.id === cardId);
      if (!card) return;
    }

    this.room.focusedCardId = cardId;
    await this.state.storage.put("room", this.room);
    this.broadcast(JSON.stringify({ type: "focus_changed", cardId }));
  }

  private async handleAddAction(
    cardId: string,
    content: string
  ): Promise<void> {
    if (!this.room || !cardId || !content?.trim()) return;

    const card = this.room.cards.find((c) => c.id === cardId);
    if (!card) return;

    const action = {
      id: generateId(8),
      content: content.trim(),
    };

    card.actionItems.push(action);
    await this.state.storage.put("room", this.room);
    this.broadcast(JSON.stringify({ type: "action_added", cardId, action }));
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const user = this.getUser(ws);

    if (user) {
      this.broadcast(
        JSON.stringify({ type: "user_left", userId: user.id }),
        ws
      );
    }
  }

  async webSocketError(ws: WebSocket, error: unknown): Promise<void> {
    console.error("WebSocket error:", error);
    // The close handler will be called after this
  }

  private broadcast(message: string, exclude?: WebSocket): void {
    const webSockets = this.state.getWebSockets();
    for (const ws of webSockets) {
      if (ws !== exclude) {
        try {
          ws.send(message);
        } catch {
          // Connection might be closed
        }
      }
    }
  }
}

function generateId(length: number): string {
  const chars =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  const randomValues = new Uint8Array(length);
  crypto.getRandomValues(randomValues);
  for (let i = 0; i < length; i++) {
    result += chars[randomValues[i] % chars.length];
  }
  return result;
}

function generateAnonymousName(): string {
  const adjectives = [
    "Purple",
    "Green",
    "Blue",
    "Red",
    "Golden",
    "Silver",
    "Swift",
    "Brave",
    "Clever",
    "Gentle",
    "Happy",
    "Jolly",
    "Kind",
    "Lucky",
    "Mighty",
    "Noble",
    "Quick",
    "Quiet",
    "Sleepy",
    "Sunny",
    "Tiny",
    "Wise",
    "Calm",
    "Bold",
    "Bright",
    "Cool",
    "Eager",
    "Fancy",
    "Friendly",
    "Fuzzy",
    "Graceful",
    "Grand",
    "Humble",
    "Icy",
    "Joyful",
    "Keen",
    "Lively",
    "Merry",
    "Neat",
    "Odd",
    "Patient",
    "Proud",
    "Royal",
    "Shy",
    "Smooth",
    "Snowy",
    "Soft",
    "Spry",
    "Steady",
    "Sweet",
  ];

  const animals = [
    "Penguin",
    "Giraffe",
    "Fox",
    "Owl",
    "Dolphin",
    "Tiger",
    "Panda",
    "Koala",
    "Eagle",
    "Lion",
    "Wolf",
    "Bear",
    "Rabbit",
    "Deer",
    "Falcon",
    "Hawk",
    "Otter",
    "Seal",
    "Whale",
    "Shark",
    "Turtle",
    "Parrot",
    "Crane",
    "Swan",
    "Peacock",
    "Raven",
    "Sparrow",
    "Finch",
    "Robin",
    "Badger",
    "Beaver",
    "Elk",
    "Moose",
    "Jaguar",
    "Leopard",
    "Lynx",
    "Panther",
    "Raccoon",
    "Sloth",
    "Lemur",
    "Monkey",
    "Gorilla",
    "Zebra",
    "Horse",
    "Donkey",
    "Sheep",
    "Goat",
    "Buffalo",
    "Bison",
    "Camel",
  ];

  const adjective = adjectives[Math.floor(Math.random() * adjectives.length)];
  const animal = animals[Math.floor(Math.random() * animals.length)];

  return `${adjective} ${animal}`;
}
