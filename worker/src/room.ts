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

interface VoteSettings {
  totalVotesLimit?: number;
  votesPerColumnLimit?: number;
}

interface RoomState {
  name: string;
  ownerKey: string;
  mode: "edit" | "publish" | "group" | "vote" | "focus" | "overview";
  columns: Array<{
    id: string;
    name: string;
    description?: string;
    order: number;
  }>;
  cards: Card[];
  groups: CardGroup[];
  focusedCardId: string | null;
  voteSettings: VoteSettings;
  userVotes: Record<string, Record<string, boolean>>; // userId -> targetId -> voted
  userNames: Record<string, string>; // userId -> last known name
  createdAt: string;
}

interface User {
  id: string;
  name: string;
  isOwner: boolean;
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
        voteSettings: {},
        userVotes: {},
        userNames: {},
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

      // Check for userId and ownerKey in URL for identity restoration
      const requestedUserId = url.searchParams.get("userId");
      const requestedOwnerKey = url.searchParams.get("ownerKey");

      // Try to restore user identity from stored userId
      let user: User;
      const isOwner =
        !!requestedOwnerKey && this.validateOwnerKey(requestedOwnerKey);

      if (requestedUserId) {
        // Check if this userId is already connected (prevent duplicates)
        const existingConnections = this.state.getWebSockets();
        const alreadyConnected = existingConnections.some((ws) => {
          const existingUser = this.getUser(ws);
          return existingUser?.id === requestedUserId;
        });

        if (!alreadyConnected) {
          // Restore user name: prefer stored name, fall back to card author name
          const storedName = (this.room.userNames || {})[requestedUserId];
          const userCard = this.room.cards.find(
            (c) => c.authorId === requestedUserId
          );
          const restoredName = storedName || userCard?.authorName;
          if (restoredName) {
            // Restore user with their previous name
            user = {
              id: requestedUserId,
              name: restoredName,
              isOwner,
            };
          } else {
            // User ID exists but no stored name - create new user with requested ID
            user = {
              id: requestedUserId,
              name: generateAnonymousName(),
              isOwner,
            };
          }
        } else {
          // User already connected, create new identity
          user = {
            id: generateId(16),
            name: generateAnonymousName(),
            isOwner,
          };
        }
      } else {
        // No userId provided, generate new anonymous user
        user = {
          id: generateId(16),
          name: generateAnonymousName(),
          isOwner,
        };
      }

      // Accept WebSocket with hibernation API and attach user data
      this.state.acceptWebSocket(server);
      this.setUser(server, user);

      // Track user name for reconnection
      if (!this.room.userNames) this.room.userNames = {};
      this.room.userNames[user.id] = user.name;
      await this.state.storage.put("room", this.room);

      // Get all users including the new one
      const allUsers = this.getAllUsers();

      // Get the user's votes (handle missing userVotes for backwards compatibility)
      const myVotes = Object.keys(this.room.userVotes?.[user.id] || {});

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
            voteSettings: this.room.voteSettings || {},
            createdAt: this.room.createdAt,
          },
          user,
          users: allUsers,
          myVotes,
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
          data.name as string,
          data.description as string | undefined
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

      case "edit_card":
        await this.handleEditCard(
          ws,
          data.cardId as string,
          data.content as string
        );
        break;

      case "group_cards":
        await this.handleGroupCards(data.cardIds as string[]);
        break;

      case "ungroup_card":
        await this.handleUngroupCard(data.cardId as string);
        break;

      case "toggle_vote":
        await this.handleToggleVote(
          ws,
          data.targetId as string,
          data.targetType as "card" | "group"
        );
        break;

      case "owner:set_vote_settings":
        await this.handleSetVoteSettings(
          data.totalVotesLimit as number | undefined,
          data.votesPerColumnLimit as number | undefined
        );
        break;

      case "rename_user":
        await this.handleRenameUser(ws, data.newName as string);
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
    name: string,
    description?: string
  ): Promise<void> {
    if (!this.room || !columnId || !name?.trim()) return;

    const column = this.room.columns.find((c) => c.id === columnId);
    if (!column) return;

    column.name = name.trim();
    column.description = description?.trim() || undefined;
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

  private async handleEditCard(
    ws: WebSocket,
    cardId: string,
    content: string
  ): Promise<void> {
    if (!this.room || !cardId || !content?.trim()) return;

    const user = this.getUser(ws);
    if (!user) return;

    const card = this.room.cards.find((c) => c.id === cardId);
    if (!card) return;

    // Only allow users to edit their own cards
    if (card.authorId !== user.id) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "UNAUTHORIZED",
          message: "You can only edit your own cards",
        })
      );
      return;
    }

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

    card.content = trimmedContent;
    await this.state.storage.put("room", this.room);

    this.broadcast(
      JSON.stringify({ type: "card_edited", cardId, content: trimmedContent })
    );
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

  private async handleToggleVote(
    ws: WebSocket,
    targetId: string,
    targetType: "card" | "group"
  ): Promise<void> {
    if (!this.room || !targetId) return;

    const user = this.getUser(ws);
    if (!user) return;

    // Initialize userVotes if needed (backwards compatibility)
    if (!this.room.userVotes) {
      this.room.userVotes = {};
    }

    // Get or initialize user's votes
    const userVotes = this.room.userVotes[user.id] || {};
    const hasVoted = !!userVotes[targetId];

    // Determine column for the target
    let columnId: string | null = null;
    if (targetType === "card") {
      const card = this.room.cards.find((c) => c.id === targetId);
      if (!card) return;
      // Can't vote on individual cards that are grouped
      if (card.groupId) {
        ws.send(
          JSON.stringify({
            type: "error",
            code: "CARD_IS_GROUPED",
            message: "Cannot vote on individual cards that are in a group",
          })
        );
        return;
      }
      columnId = card.columnId;
    } else {
      const group = this.room.groups.find((g) => g.id === targetId);
      if (!group) return;
      const firstCard = this.room.cards.find((c) => c.id === group.cardIds[0]);
      columnId = firstCard?.columnId || null;
    }

    if (!columnId) return;

    // If adding a vote, check limits
    if (!hasVoted) {
      const { totalVotesLimit, votesPerColumnLimit } =
        this.room.voteSettings || {};

      // Check total votes limit
      if (totalVotesLimit !== undefined) {
        const totalVotes = Object.keys(userVotes).length;
        if (totalVotes >= totalVotesLimit) {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "VOTE_LIMIT_REACHED",
              message: `You have reached your maximum of ${totalVotesLimit} votes`,
            })
          );
          return;
        }
      }

      // Check per-column limit
      if (votesPerColumnLimit !== undefined) {
        const columnVotes = this.countUserVotesInColumn(user.id, columnId);
        if (columnVotes >= votesPerColumnLimit) {
          ws.send(
            JSON.stringify({
              type: "error",
              code: "COLUMN_VOTE_LIMIT_REACHED",
              message: `You have reached your maximum of ${votesPerColumnLimit} votes in this column`,
            })
          );
          return;
        }
      }
    }

    // Toggle the vote
    if (hasVoted) {
      delete userVotes[targetId];
    } else {
      userVotes[targetId] = true;
    }
    this.room.userVotes[user.id] = userVotes;

    // Calculate new vote count for the target
    const newVotes = this.getTargetVoteCount(targetId);

    await this.state.storage.put("room", this.room);

    this.broadcast(
      JSON.stringify({
        type: "vote_toggled",
        targetId,
        targetType,
        votes: newVotes,
        userId: user.id,
        action: hasVoted ? "remove" : "add",
      })
    );
  }

  private countUserVotesInColumn(userId: string, columnId: string): number {
    const userVotes = this.room?.userVotes?.[userId] || {};
    let count = 0;

    for (const targetId of Object.keys(userVotes)) {
      // Check if it's a card in this column
      const card = this.room?.cards.find((c) => c.id === targetId);
      if (card && card.columnId === columnId) {
        count++;
        continue;
      }

      // Check if it's a group in this column
      const group = this.room?.groups.find((g) => g.id === targetId);
      if (group) {
        const firstCard = this.room?.cards.find(
          (c) => c.id === group.cardIds[0]
        );
        if (firstCard?.columnId === columnId) {
          count++;
        }
      }
    }

    return count;
  }

  private getTargetVoteCount(targetId: string): number {
    if (!this.room?.userVotes) return 0;

    // Count all users who voted for this target
    let count = 0;
    for (const userVotes of Object.values(this.room.userVotes)) {
      if (userVotes[targetId]) count++;
    }
    return count;
  }

  private async handleSetVoteSettings(
    totalVotesLimit?: number,
    votesPerColumnLimit?: number
  ): Promise<void> {
    if (!this.room) return;

    // Initialize voteSettings if needed
    if (!this.room.voteSettings) {
      this.room.voteSettings = {};
    }

    this.room.voteSettings = {
      totalVotesLimit: totalVotesLimit ?? undefined,
      votesPerColumnLimit: votesPerColumnLimit ?? undefined,
    };

    await this.state.storage.put("room", this.room);
    this.broadcast(
      JSON.stringify({
        type: "vote_settings_changed",
        voteSettings: this.room.voteSettings,
      })
    );
  }

  private async handleRenameUser(
    ws: WebSocket,
    newName: string
  ): Promise<void> {
    if (!this.room || !newName) return;

    // Validate name (1-50 characters)
    const trimmedName = newName.trim();
    if (trimmedName.length < 1 || trimmedName.length > 50) {
      ws.send(
        JSON.stringify({
          type: "error",
          code: "INVALID_NAME",
          message: "Name must be between 1 and 50 characters",
        })
      );
      return;
    }

    const user = this.getUser(ws);
    if (!user) return;

    // Update user name
    user.name = trimmedName;
    this.setUser(ws, user);

    // Persist user name for reconnection
    if (!this.room.userNames) this.room.userNames = {};
    this.room.userNames[user.id] = trimmedName;

    // Update author name on all cards by this user
    for (const card of this.room.cards) {
      if (card.authorId === user.id) {
        card.authorName = trimmedName;
      }
    }
    await this.state.storage.put("room", this.room);

    // Broadcast rename to all users
    this.broadcast(
      JSON.stringify({
        type: "user_renamed",
        userId: user.id,
        newName: trimmedName,
      })
    );
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

  async webSocketError(_ws: WebSocket, error: unknown): Promise<void> {
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
