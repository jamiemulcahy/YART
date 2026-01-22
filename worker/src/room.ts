import type { DurableObjectState } from "@cloudflare/workers-types";

interface RoomState {
  name: string;
  ownerKey: string;
  mode: "edit" | "publish" | "group" | "vote" | "focus" | "overview";
  columns: Array<{ id: string; name: string; order: number }>;
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
  private connections: Map<WebSocket, User> = new Map();

  constructor(state: DurableObjectState) {
    this.state = state;
    // Load room state from storage on construction
    this.state.blockConcurrencyWhile(async () => {
      this.room = (await this.state.storage.get<RoomState>("room")) ?? null;
    });
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

      this.state.acceptWebSocket(server);

      // Generate anonymous user
      const user: User = {
        id: generateId(16),
        name: generateAnonymousName(),
        isOwner: false,
      };

      this.connections.set(server, user);

      // Send initial state
      server.send(
        JSON.stringify({
          type: "state",
          room: {
            id: "",
            name: this.room.name,
            mode: this.room.mode,
            columns: this.room.columns,
            createdAt: this.room.createdAt,
          },
          user,
          users: Array.from(this.connections.values()),
        })
      );

      // Broadcast user joined to others
      this.broadcast(JSON.stringify({ type: "user_joined", user }), server);

      return new Response(null, { status: 101, webSocket: client });
    }

    return new Response("Not found", { status: 404 });
  }

  async webSocketMessage(
    _ws: WebSocket,
    message: string | ArrayBuffer
  ): Promise<void> {
    if (typeof message !== "string") return;

    try {
      const data = JSON.parse(message);
      // Message handling will be implemented in later milestones
      console.log("Received message:", data);
    } catch {
      console.error("Failed to parse WebSocket message");
    }
  }

  async webSocketClose(ws: WebSocket): Promise<void> {
    const user = this.connections.get(ws);
    this.connections.delete(ws);

    if (user) {
      this.broadcast(JSON.stringify({ type: "user_left", userId: user.id }));
    }
  }

  private broadcast(message: string, exclude?: WebSocket): void {
    for (const [ws] of this.connections) {
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
