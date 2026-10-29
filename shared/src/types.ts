export const PHASES = ["setup", "write", "group", "defend", "battle", "discuss", "wrapup"] as const;
export type Phase = (typeof PHASES)[number];

export const PHASE_LABELS: Record<Phase, string> = {
  setup: "Setup",
  write: "Write",
  group: "Group",
  defend: "Defend",
  battle: "Battle",
  discuss: "Discuss",
  wrapup: "Wrap-up",
};

export type Role = "owner" | "participant" | "viewer";

export interface RoomSettings {
  /** Cards are face-down to everyone but their author until revealed. */
  hideCards: boolean;
  /** Participants may still add cards during the Group phase. */
  allowLateCards: boolean;
  shieldsPerPerson: number;
  maxShieldsPerTopic: number;
  /** Participants see shield totals while defending (owner always does). */
  showShieldTotals: boolean;
  battleDurationSec: number;
  showBattleStats: boolean;
}

export interface Lane {
  id: string;
  title: string;
  description: string;
  colour: string;
}

export interface Participant {
  id: string;
  name: string;
  colour: string;
  role: Role;
  online: boolean;
}

export interface Card {
  id: string;
  laneId: string;
  groupId: string | null;
  /** True for the viewer's own cards. */
  mine: boolean;
  /** Who wrote it; shown by name on other people's cards. */
  authorId: string;
  /** Null while hidden from this viewer. */
  text: string | null;
  createdAt: number;
}

export interface Group {
  id: string;
  laneId: string;
  /** Empty means "use the first card's text". */
  title: string;
  createdAt: number;
}

export type TimerStatus = "idle" | "running" | "paused" | "done";

export interface TimerState {
  status: TimerStatus;
  durationMs: number;
  /** Server time the countdown hits zero (running only). */
  endsAt: number | null;
  /** Time left when paused/idle. */
  remainingMs: number;
}

export interface ShieldState {
  /** topicId -> shields this viewer placed. */
  mine: Record<string, number>;
  /** topicId -> total shields, or null while hidden from this viewer. */
  totals: Record<string, number> | null;
}

export interface DiscussState {
  openTopicId: string | null;
  discussed: string[];
}

export interface Note {
  id: string;
  topicId: string;
  text: string;
  mine: boolean;
  createdAt: number;
}

export interface ActionItem {
  id: string;
  topicId: string | null;
  text: string;
  assignee: string;
  mine: boolean;
  createdAt: number;
}

export type TopicFate = "survived" | "fell";

export interface BattleStat {
  participantId: string;
  name: string;
  colour: string;
  kills: number;
  bossKills: number;
}

export interface BattleResults {
  fates: Record<string, TopicFate>;
  /** Null when the owner hides individual stats. */
  stats: BattleStat[] | null;
}

export interface RoomSnapshot {
  code: string;
  name: string;
  createdAt: number;
  phase: Phase;
  settings: RoomSettings;
  revealed: boolean;
  groupingLocked: boolean;
  lanes: Lane[];
  participants: Participant[];
  cards: Card[];
  groups: Group[];
  shields: ShieldState;
  timer: TimerState;
  discuss: DiscussState;
  notes: Note[];
  actions: ActionItem[];
  /** cardId -> participantId currently dragging it. */
  holds: Record<string, string>;
  battle: BattleResults | null;
}

/** A topic is a group, or a card not in a group. */
export interface Topic {
  id: string;
  kind: "group" | "card";
  laneId: string;
  title: string;
  cards: Card[];
  createdAt: number;
}
