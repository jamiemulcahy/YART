import { RoomDO } from "./room";

export { RoomDO };

export interface Env {
  ROOM: DurableObjectNamespace;
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const path = url.pathname;

    // CORS headers for development
    const corsHeaders = {
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
      "Access-Control-Allow-Headers": "Content-Type",
    };

    // Handle CORS preflight
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }

    // Health check - quick response, no DO interaction
    if (path === "/health") {
      return new Response(JSON.stringify({ status: "ok" }), {
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // API routes
    if (path.startsWith("/api/rooms")) {
      return handleRoomRoutes(request, env, path, corsHeaders);
    }

    return new Response("Not found", { status: 404, headers: corsHeaders });
  },
};

async function handleRoomRoutes(
  request: Request,
  env: Env,
  path: string,
  corsHeaders: Record<string, string>
): Promise<Response> {
  // POST /api/rooms - Create a new room
  if (path === "/api/rooms" && request.method === "POST") {
    const { name } = (await request.json()) as { name: string };

    if (!name || typeof name !== "string") {
      return new Response(JSON.stringify({ error: "Room name is required" }), {
        status: 400,
        headers: { "Content-Type": "application/json", ...corsHeaders },
      });
    }

    // Generate room ID and owner key
    const roomId = generateId(8);
    const ownerKey = generateId(32);

    // Create Durable Object and initialize room
    const id = env.ROOM.idFromName(roomId);
    const stub = env.ROOM.get(id);

    await stub.fetch(
      new Request("http://internal/init", {
        method: "POST",
        body: JSON.stringify({ name, ownerKey }),
      })
    );

    return new Response(JSON.stringify({ roomId, ownerKey }), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  // GET /api/rooms/:id/ws - WebSocket upgrade
  const wsMatch = path.match(/^\/api\/rooms\/([^/]+)\/ws$/);
  if (wsMatch && request.headers.get("Upgrade") === "websocket") {
    const roomId = wsMatch[1];
    const id = env.ROOM.idFromName(roomId);
    const stub = env.ROOM.get(id);
    return stub.fetch(request);
  }

  // GET /api/rooms/:id - Check if room exists
  const roomMatch = path.match(/^\/api\/rooms\/([^/]+)$/);
  if (roomMatch && request.method === "GET") {
    const roomId = roomMatch[1];
    const id = env.ROOM.idFromName(roomId);
    const stub = env.ROOM.get(id);

    const response = await stub.fetch(new Request("http://internal/info"));
    const data = (await response.json()) as { exists: boolean; name?: string };

    return new Response(JSON.stringify(data), {
      headers: { "Content-Type": "application/json", ...corsHeaders },
    });
  }

  return new Response("Not found", { status: 404, headers: corsHeaders });
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
