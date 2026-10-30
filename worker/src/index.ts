import { LIMITS, cleanLine } from "@yart/shared";
import { RoomDO } from "./room";
import { newRoomCode, newSecret, normaliseRoomCode, sha256 } from "./util";

export { RoomDO };

export interface Env {
  ROOM: DurableObjectNamespace<RoomDO>;
  /** Comma-separated list of origins allowed to call the API. */
  ALLOWED_ORIGINS?: string;
  CREATE_LIMITER?: RateLimit;
  /** Set by the E2E suite, which creates many rooms from one IP. */
  DISABLE_CREATE_LIMIT?: string;
}

function corsHeaders(request: Request, env: Env): Record<string, string> {
  const origin = request.headers.get("Origin");
  const allowed = (env.ALLOWED_ORIGINS ?? "")
    .split(",")
    .map((o) => o.trim())
    .filter(Boolean);
  if (!origin || !allowed.includes(origin)) return {};
  return {
    "Access-Control-Allow-Origin": origin,
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers": "Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

function json(body: unknown, status: number, headers: Record<string, string>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...headers },
  });
}

async function createRoom(request: Request, env: Env, cors: Record<string, string>): Promise<Response> {
  if (env.CREATE_LIMITER && env.DISABLE_CREATE_LIMIT !== "true") {
    const ip = request.headers.get("CF-Connecting-IP") ?? "unknown";
    const { success } = await env.CREATE_LIMITER.limit({ key: ip });
    if (!success) return json({ error: "Too many rooms created, try again shortly" }, 429, cors);
  }
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return json({ error: "Invalid JSON" }, 400, cors);
  }
  const input = body as { name?: unknown; lanes?: unknown };
  const name = typeof input.name === "string" ? cleanLine(input.name, LIMITS.roomName) : null;
  if (!name) return json({ error: `Room name must be 1–${LIMITS.roomName} characters` }, 400, cors);
  const rawLanes = Array.isArray(input.lanes) ? input.lanes.slice(0, LIMITS.lanes) : [];
  const lanes: { title: string; description: string }[] = [];
  for (const raw of rawLanes) {
    const lane = raw as { title?: unknown; description?: unknown };
    const title = typeof lane.title === "string" ? cleanLine(lane.title, LIMITS.laneTitle) : null;
    if (!title) continue;
    const description =
      typeof lane.description === "string" ? (cleanLine(lane.description, LIMITS.laneDescription) ?? "") : "";
    lanes.push({ title, description });
  }

  const ownerKey = newSecret();
  const ownerKeyHash = await sha256(ownerKey);
  for (let attempt = 0; attempt < 5; attempt++) {
    const code = newRoomCode();
    const stub = env.ROOM.get(env.ROOM.idFromName(code));
    const res = await stub.fetch("http://room/init", {
      method: "POST",
      body: JSON.stringify({ code, name, ownerKeyHash, lanes }),
    });
    if (res.ok) return json({ code, ownerKey }, 201, cors);
  }
  return json({ error: "Couldn't allocate a room code" }, 503, cors);
}

export default {
  async fetch(request: Request, env: Env): Promise<Response> {
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);

    if (request.method === "OPTIONS") return new Response(null, { status: 204, headers: cors });

    if (url.pathname === "/health") return json({ status: "ok" }, 200, cors);

    if (url.pathname === "/api/rooms" && request.method === "POST") return createRoom(request, env, cors);

    const match = url.pathname.match(/^\/api\/rooms\/([^/]+)(\/ws)?$/);
    if (match) {
      const code = normaliseRoomCode(decodeURIComponent(match[1] as string));
      if (!code) return json({ exists: false }, 404, cors);
      const stub = env.ROOM.get(env.ROOM.idFromName(code));
      if (match[2]) {
        if (request.headers.get("Upgrade") !== "websocket")
          return json({ error: "Expected WebSocket" }, 426, cors);
        return stub.fetch(request);
      }
      if (request.method === "GET") {
        const info = (await (await stub.fetch("http://room/info")).json()) as {
          exists: boolean;
          name?: string;
        };
        return json({ ...info, code }, info.exists ? 200 : 404, cors);
      }
    }

    return json({ error: "Not found" }, 404, cors);
  },
} satisfies ExportedHandler<Env>;
