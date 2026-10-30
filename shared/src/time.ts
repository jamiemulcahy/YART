export function formatDuration(ms: number): string {
  const total = Math.max(0, Math.ceil(ms / 1000));
  const m = Math.floor(total / 60);
  const s = total % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

/**
 * Parses a timer length into milliseconds:
 * - "1:30", ":45", "0:05"
 * - digits only, microwave style: "30" = 0:30, "130" = 1:30, "500" = 5:00, "90" = 1:30
 * - with units: "45s", "2m", "2m30s", "1.5 min"
 */
export function parseDuration(input: string): number | null {
  const text = input.trim().toLowerCase().replace(/\s+/g, "");
  if (!text) return null;
  let match = text.match(/^(\d{0,3}):(\d{1,2})$/);
  if (match) {
    const s = Number(match[2]);
    return s < 60 ? (Number(match[1] || 0) * 60 + s) * 1000 : null;
  }
  match = text.match(/^(\d{1,4})$/);
  if (match) {
    const digits = match[1] as string;
    const secs = Number(digits.slice(-2));
    const mins = Number(digits.slice(0, -2) || 0);
    return (mins * 60 + secs) * 1000;
  }
  match = text.match(/^(?:(\d+(?:\.\d+)?)m(?:in(?:ute)?s?)?)?(?:(\d+)s(?:ec(?:ond)?s?)?)?$/);
  if (match && (match[1] || match[2])) {
    return Math.round((Number(match[1] ?? 0) * 60 + Number(match[2] ?? 0)) * 1000);
  }
  return null;
}
