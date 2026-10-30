import type { Phase } from "@yart/shared";

const API_URL = (import.meta.env.VITE_API_URL ?? "").replace(/\/$/, "");

export interface CreatedRoom {
  code: string;
  ownerKey: string;
}

export async function createRoom(
  name: string,
  lanes: { title: string; description: string }[]
): Promise<CreatedRoom> {
  const res = await fetch(`${API_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name, lanes }),
  });
  const body = (await res.json().catch(() => ({}))) as Partial<CreatedRoom> & { error?: string };
  if (!res.ok || !body.code || !body.ownerKey) throw new Error(body.error ?? "Couldn't create the room");
  return { code: body.code, ownerKey: body.ownerKey };
}

export interface RoomInfo {
  exists: boolean;
  name?: string;
  phase?: Phase;
  lastActivity?: number;
  online?: number;
}

export async function roomInfo(code: string): Promise<RoomInfo> {
  const res = await fetch(`${API_URL}/api/rooms/${encodeURIComponent(code)}`);
  if (res.status === 404) return { exists: false };
  if (!res.ok) throw new Error("Couldn't reach the server");
  return (await res.json()) as RoomInfo;
}

export function socketUrl(code: string): string {
  const base = API_URL || window.location.origin;
  return `${base.replace(/^http/, "ws")}/api/rooms/${encodeURIComponent(code)}/ws`;
}

/** "AB3CD4" -> "AB3-CD4" */
export function formatCode(code: string): string {
  return code.length === 6 ? `${code.slice(0, 3)}-${code.slice(3)}` : code;
}

/** Accepts a code ("k7m-qx2") or a pasted invite link (".../r/K7MQX2"). */
export function normaliseCode(input: string): string {
  const fromLink = input.match(/\/r\/([^/?#\s]+)/);
  return (fromLink?.[1] ?? input).toUpperCase().replace(/[^A-Z0-9]/g, "");
}
