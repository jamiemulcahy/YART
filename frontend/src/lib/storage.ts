import type { Role } from "@yart/shared";

// localStorage can throw (private mode, blocked storage); everything here degrades to "not stored".

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export interface KnownRoom {
  code: string;
  name: string;
  role: Role;
  /** When this browser last opened the room (ms). 0 if only found via a stored key. */
  lastSeen: number;
}

const ROOMS_KEY = "yart:rooms";

function readRooms(): Record<string, KnownRoom> {
  try {
    const value = JSON.parse(get(ROOMS_KEY) ?? "{}") as unknown;
    return value && typeof value === "object" ? (value as Record<string, KnownRoom>) : {};
  } catch {
    return {};
  }
}

/** Codes this browser holds an owner key or participant token for. */
function codesWithKeys(): { code: string; owner: boolean }[] {
  const out = new Map<string, boolean>();
  try {
    for (let i = 0; i < window.localStorage.length; i++) {
      const key = window.localStorage.key(i) ?? "";
      const m = key.match(/^yart:(owner|token):([A-Z0-9]{6})$/);
      if (m) out.set(m[2] as string, (out.get(m[2] as string) ?? false) || m[1] === "owner");
    }
  } catch {
    // storage unavailable
  }
  return [...out].map(([code, owner]) => ({ code, owner }));
}

export const storage = {
  token: (code: string) => get(`yart:token:${code}`),
  setToken: (code: string, token: string | null) => set(`yart:token:${code}`, token),
  ownerKey: (code: string) => get(`yart:owner:${code}`),
  setOwnerKey: (code: string, key: string | null) => set(`yart:owner:${code}`, key),
  /** Rooms this browser can get back into, most recently opened first. */
  knownRooms(): KnownRoom[] {
    const rooms = readRooms();
    const keyed = codesWithKeys();
    for (const { code, owner } of keyed) {
      const known = rooms[code];
      if (!known) rooms[code] = { code, name: "", role: owner ? "owner" : "participant", lastSeen: 0 };
      else if (owner) known.role = "owner";
    }
    // Index entries whose keys have gone (e.g. cleared by hand) can't be reopened.
    const withKeys = new Set(keyed.map((c) => c.code));
    return Object.values(rooms)
      .filter((r) => withKeys.has(r.code))
      .sort((a, b) => b.lastSeen - a.lastSeen || a.code.localeCompare(b.code));
  },
  rememberRoom(code: string, name: string, role: Role) {
    const rooms = readRooms();
    rooms[code] = { code, name, role, lastSeen: Date.now() };
    set(ROOMS_KEY, JSON.stringify(rooms));
  },
  /** Drop everything this browser knows about a room, including owner access. */
  forgetRoom(code: string) {
    const rooms = Object.fromEntries(Object.entries(readRooms()).filter(([c]) => c !== code));
    set(ROOMS_KEY, JSON.stringify(rooms));
    set(`yart:token:${code}`, null);
    set(`yart:owner:${code}`, null);
    set(`yart:drafts:${code}`, null);
  },
  muted: () => get("yart:muted") === "1",
  setMuted: (muted: boolean) => set("yart:muted", muted ? "1" : null),
};
