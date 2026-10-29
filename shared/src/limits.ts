export const LIMITS = {
  roomName: 80,
  lanes: 10,
  laneTitle: 40,
  laneDescription: 140,
  cardText: 500,
  cardsPerParticipant: 50,
  cardsPerRoom: 500,
  groupTitle: 80,
  participantName: 32,
  participants: 50,
  viewers: 20,
  noteText: 500,
  notesPerTopic: 50,
  actionText: 500,
  actionAssignee: 60,
  actionsPerRoom: 100,
  messageBytes: 4096,
  timerMinMs: 10_000,
  timerMaxMs: 60 * 60_000,
  shieldsPerPersonMin: 1,
  shieldsPerPersonMax: 20,
  battleDurationMinSec: 60,
  battleDurationMaxSec: 180,
  /** Sustained inbound messages per second, per socket. */
  ratePerSec: 20,
  rateBurst: 40,
  battleRatePerSec: 12,
  /** A socket breaching limits this many times gets closed. */
  strikesBeforeClose: 50,
  holdMs: 10_000,
  roomExpiryMs: 30 * 24 * 60 * 60_000,
} as const;

export const DEFAULT_SETTINGS = {
  hideCards: true,
  allowLateCards: false,
  shieldsPerPerson: 5,
  maxShieldsPerTopic: 3,
  showShieldTotals: false,
  battleDurationSec: 90,
  showBattleStats: true,
} as const;

const INVISIBLE_CHARS = new RegExp(
  // eslint-disable-next-line no-control-regex -- stripping control characters is the point
  "[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\uFEFF]",
  "g"
);

/** Normalise user text: NFC, strip control chars (keeping newlines), trim, cap blank lines. */
export function cleanText(input: string, maxLength: number): string | null {
  const text = input
    .normalize("NFC")
    .replace(INVISIBLE_CHARS, "")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (text.length === 0 || text.length > maxLength) return null;
  return text;
}

/** Single-line variant for names and titles. */
export function cleanLine(input: string, maxLength: number): string | null {
  const text = cleanText(input.replace(/\s+/g, " "), maxLength);
  return text;
}
