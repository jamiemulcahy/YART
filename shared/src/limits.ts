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
  timerMinMs: 5_000,
  timerMaxMs: 60 * 60_000,
  shieldsPerPersonMin: 1,
  shieldsPerPersonMax: 20,
  /** Seconds each lane is under attack in the battle. */
  battleDurationMinSec: 15,
  battleDurationMaxSec: 45,
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
  // Drafts are private already, so published cards are visible by default.
  hideCards: false,
  allowLateCards: false,
  shieldsPerPerson: 5,
  maxShieldsPerTopic: 3,
  showShieldTotals: false,
  battleDurationSec: 25,
  showBattleStats: true,
} as const;

const INVISIBLE_CHARS = new RegExp(
  // Control chars (keeping \n), zero-width and bidi controls, BOM, soft hyphen, Hangul/braille
  // blanks and other "looks empty" fillers, plus Unicode tag characters (surrogate pairs).
  // eslint-disable-next-line no-control-regex, no-misleading-character-class -- stripping these is the point
  "[\\u0000-\\u0009\\u000B-\\u001F\\u007F-\\u009F\\u00AD\\u034F\\u115F\\u1160\\u17B4\\u17B5\\u180E\\u200B-\\u200F\\u2028-\\u202E\\u2060-\\u206F\\u2800\\u3164\\uFEFF\\uFFA0]|\\uDB40[\\uDC00-\\uDC7F]",
  "g"
);
/** More than two stacked combining marks is "zalgo" text, not language. */
const STACKED_MARKS = /(\p{M}{2})\p{M}+/gu;
const HAS_VISIBLE = /[^\s\p{M}]/u;

/**
 * Normalise user text: NFC, strip invisible/control chars (keeping newlines), tame stacked
 * combining marks, trim, cap blank lines. Length is counted in characters, not UTF-16 units.
 */
export function cleanText(input: string, maxLength: number): string | null {
  const text = input
    .normalize("NFC")
    .replace(INVISIBLE_CHARS, "")
    .replace(STACKED_MARKS, "$1")
    .replace(/\r\n?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
  if (!HAS_VISIBLE.test(text) || [...text].length > maxLength) return null;
  return text;
}

/** Single-line variant for names and titles. */
export function cleanLine(input: string, maxLength: number): string | null {
  const text = cleanText(input.replace(/\s+/g, " "), maxLength);
  return text;
}
