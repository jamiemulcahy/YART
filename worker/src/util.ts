const ID_CHARS = "abcdefghijklmnopqrstuvwxyz0123456789";
/** No 0/O, 1/I/L to keep codes readable aloud. */
const CODE_CHARS = "ABCDEFGHJKMNPQRSTUVWXYZ23456789";

function randomString(length: number, chars: string): string {
  const bytes = new Uint8Array(length);
  crypto.getRandomValues(bytes);
  let out = "";
  for (const b of bytes) out += chars[b % chars.length];
  return out;
}

export function newId(prefix: string): string {
  return `${prefix}_${randomString(12, ID_CHARS)}`;
}

export function newRoomCode(): string {
  return randomString(6, CODE_CHARS);
}

/** Accepts "abc-123", "ABC123", etc. Returns null when it can't be a code. */
export function normaliseRoomCode(input: string): string | null {
  const code = input.toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (code.length !== 6) return null;
  for (const ch of code) if (!CODE_CHARS.includes(ch)) return null;
  return code;
}

export function newSecret(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, "-")
    .replace(/\//g, "_")
    .replace(/=+$/, "");
}

export async function sha256(input: string): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(input));
  return [...new Uint8Array(digest)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/** Constant-time comparison of two hex digests. */
export function sameHash(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return diff === 0;
}

/** Token bucket for per-socket rate limiting. */
export class Bucket {
  private tokens: number;
  private last = Date.now();
  constructor(
    private ratePerSec: number,
    private burst: number
  ) {
    this.tokens = burst;
  }
  take(): boolean {
    const now = Date.now();
    this.tokens = Math.min(this.burst, this.tokens + ((now - this.last) / 1000) * this.ratePerSec);
    this.last = now;
    if (this.tokens < 1) return false;
    this.tokens -= 1;
    return true;
  }
}
