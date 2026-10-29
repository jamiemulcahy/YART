export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/** Parses "5" (minutes), "1:30", "0:45" or "45s" into milliseconds. */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase();
  let match = text.match(/^(\d{1,2}):(\d{1,2})$/);
  if (match) {
    const s = Number(match[2]);
    return s < 60 ? (Number(match[1]) * 60 + s) * 1000 : null;
  }
  match = text.match(/^(\d{1,4})\s*s(ec(ond)?s?)?$/);
  if (match) return Number(match[1]) * 1000;
  match = text.match(/^(\d{1,2})\s*(m(in(ute)?s?)?)?$/);
  if (match) return Number(match[1]) * 60_000;
  return null;
}
