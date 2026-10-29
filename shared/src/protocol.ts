import { z } from "zod";
import { LIMITS } from "./limits";
import { PHASES } from "./types";
import type {
  ActionItem,
  BattleResults,
  Card,
  DiscussState,
  Group,
  Lane,
  Note,
  Participant,
  Phase,
  RoomSettings,
  RoomSnapshot,
  ShieldState,
  TimerState,
} from "./types";
import type { AttackerScript, TopicTile } from "./battle";

const id = z.string().min(1).max(40);
// Text limits are enforced after cleaning; this only bounds the raw payload.
const rawText = (max: number) => z.string().max(max * 2 + 100);

const laneInput = z.object({
  id: id.optional(),
  title: rawText(LIMITS.laneTitle),
  description: rawText(LIMITS.laneDescription),
});

const settingsPatch = z
  .object({
    hideCards: z.boolean(),
    allowLateCards: z.boolean(),
    shieldsPerPerson: z.number().int().min(LIMITS.shieldsPerPersonMin).max(LIMITS.shieldsPerPersonMax),
    maxShieldsPerTopic: z.number().int().min(1).max(LIMITS.shieldsPerPersonMax),
    showShieldTotals: z.boolean(),
    battleDurationSec: z.number().int().min(LIMITS.battleDurationMinSec).max(LIMITS.battleDurationMaxSec),
    showBattleStats: z.boolean(),
  })
  .partial()
  .strict();

const moveTarget = z.discriminatedUnion("kind", [
  z.object({ kind: z.literal("card"), id }),
  z.object({ kind: z.literal("group"), id }),
  z.object({ kind: z.literal("none") }),
]);

export const clientMessage = z.discriminatedUnion("t", [
  z.object({
    t: z.literal("hello"),
    token: z.string().max(100).optional(),
    ownerKey: z.string().max(100).optional(),
    viewer: z.boolean().optional(),
  }),
  z.object({ t: z.literal("ping"), c: z.number() }),
  z.object({ t: z.literal("rename"), name: rawText(LIMITS.participantName) }),
  z.object({ t: z.literal("room.rename"), name: rawText(LIMITS.roomName) }),
  z.object({ t: z.literal("room.delete") }),
  z.object({ t: z.literal("lanes.set"), lanes: z.array(laneInput).max(LIMITS.lanes) }),
  z.object({ t: z.literal("settings.update"), settings: settingsPatch }),
  z.object({ t: z.literal("phase.set"), phase: z.enum(PHASES) }),
  z.object({
    t: z.literal("timer.set"),
    durationMs: z.number().int().min(LIMITS.timerMinMs).max(LIMITS.timerMaxMs),
  }),
  z.object({ t: z.literal("timer.start") }),
  z.object({ t: z.literal("timer.pause") }),
  z.object({ t: z.literal("timer.resume") }),
  z.object({ t: z.literal("timer.reset") }),
  z.object({ t: z.literal("card.add"), laneId: id, text: rawText(LIMITS.cardText) }),
  z.object({ t: z.literal("card.edit"), id, text: rawText(LIMITS.cardText) }),
  z.object({ t: z.literal("card.remove"), id }),
  z.object({ t: z.literal("cards.reveal") }),
  z.object({ t: z.literal("card.hold"), id }),
  z.object({ t: z.literal("card.release"), id }),
  z.object({ t: z.literal("card.move"), id, target: moveTarget }),
  z.object({ t: z.literal("group.merge"), id, into: moveTarget }),
  z.object({ t: z.literal("group.rename"), id, title: z.string().max(LIMITS.groupTitle * 2 + 100) }),
  z.object({ t: z.literal("grouping.lock"), locked: z.boolean() }),
  z.object({ t: z.literal("shield.add"), topicId: id }),
  z.object({ t: z.literal("shield.remove"), topicId: id }),
  z.object({ t: z.literal("battle.launch") }),
  z.object({ t: z.literal("battle.stop") }),
  z.object({
    t: z.literal("battle.input"),
    x: z.number().min(0).max(10_000),
    hits: z.array(z.object({ a: z.number().int().min(0), at: z.number() })).max(20),
  }),
  z.object({ t: z.literal("topic.open"), topicId: id.nullable() }),
  z.object({ t: z.literal("topic.discussed"), topicId: id, value: z.boolean() }),
  z.object({ t: z.literal("note.add"), topicId: id, text: rawText(LIMITS.noteText) }),
  z.object({ t: z.literal("note.edit"), id, text: rawText(LIMITS.noteText) }),
  z.object({ t: z.literal("note.remove"), id }),
  z.object({
    t: z.literal("action.add"),
    topicId: id.nullable(),
    text: rawText(LIMITS.actionText),
    assignee: z.string().max(LIMITS.actionAssignee * 2 + 100),
  }),
  z.object({
    t: z.literal("action.edit"),
    id,
    text: rawText(LIMITS.actionText),
    assignee: z.string().max(LIMITS.actionAssignee * 2 + 100),
  }),
  z.object({ t: z.literal("action.remove"), id }),
]);

export type ClientMessage = z.infer<typeof clientMessage>;
export type ClientMessageType = ClientMessage["t"];
export type SettingsPatch = z.infer<typeof settingsPatch>;
export type MoveTarget = z.infer<typeof moveTarget>;

export type ErrorCode =
  | "BAD_MESSAGE"
  | "NOT_JOINED"
  | "NOT_OWNER"
  | "VIEWER"
  | "WRONG_PHASE"
  | "NOT_FOUND"
  | "FORBIDDEN"
  | "INVALID_TEXT"
  | "LIMIT"
  | "RATE_LIMITED"
  | "ROOM_FULL";

export interface BattleLive {
  startsAt: number;
  endsAt: number;
  tiles: TopicTile[];
  script: AttackerScript[];
  /** topicId -> current hp */
  topicHp: Record<string, number>;
  topicMaxHp: Record<string, number>;
  /** attacker id -> current hp (only attackers that have taken damage) */
  attackerHp: Record<number, number>;
  dead: number[];
  ships: Record<string, number>;
}

export interface BattleTick {
  ships: Record<string, number>;
  attackerHp: Record<number, number>;
  dead: number[];
  topicHp: Record<string, number>;
}

export type RoomPatch = Partial<{
  name: string;
  phase: Phase;
  settings: RoomSettings;
  revealed: boolean;
  groupingLocked: boolean;
  timer: TimerState;
  discuss: DiscussState;
  shields: ShieldState;
  holds: Record<string, string>;
  lanes: Lane[];
  battle: BattleResults | null;
}>;

export type ServerMessage =
  | { t: "welcome"; participantId: string; token: string; role: Participant["role"]; serverTime: number }
  | { t: "snapshot"; room: RoomSnapshot; battle: BattleLive | null }
  | { t: "pong"; c: number; s: number }
  | { t: "patch"; patch: RoomPatch }
  | { t: "participant"; participant: Participant }
  | { t: "card"; card: Card }
  | { t: "card.removed"; id: string }
  | { t: "group"; group: Group }
  | { t: "group.removed"; id: string }
  | { t: "note"; note: Note }
  | { t: "note.removed"; id: string }
  | { t: "action"; action: ActionItem }
  | { t: "action.removed"; id: string }
  | { t: "battle.start"; battle: BattleLive }
  | { t: "battle.tick"; tick: BattleTick }
  | { t: "battle.end"; results: BattleResults }
  | { t: "error"; code: ErrorCode; message: string }
  | { t: "room.deleted" };
