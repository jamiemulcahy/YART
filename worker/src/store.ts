import type {
  BattleResults,
  DiscussState,
  Group,
  Lane,
  Phase,
  Role,
  RoomSettings,
  TimerState,
} from "@yart/shared";

export interface Meta {
  code: string;
  name: string;
  createdAt: number;
  ownerKeyHash: string;
  phase: Phase;
  settings: RoomSettings;
  revealed: boolean;
  groupingLocked: boolean;
  lanes: Lane[];
  timer: TimerState;
  discuss: DiscussState;
  battle: BattleResults | null;
  lastActivity: number;
}

export interface ParticipantRec {
  id: string;
  name: string;
  colour: string;
  role: Role;
  tokenHash: string;
  createdAt: number;
}

export interface CardRec {
  id: string;
  laneId: string;
  groupId: string | null;
  authorId: string;
  text: string;
  createdAt: number;
}

export interface NoteRec {
  id: string;
  topicId: string;
  text: string;
  authorId: string;
  createdAt: number;
}

export interface ActionRec {
  id: string;
  topicId: string | null;
  text: string;
  assignee: string;
  authorId: string;
  createdAt: number;
}

/** participantId -> (topicId -> count) */
export type ShieldRec = Record<string, number>;

type Kind = "meta" | "participant" | "card" | "group" | "note" | "action" | "shields";

export interface RoomData {
  meta: Meta;
  participants: Map<string, ParticipantRec>;
  cards: Map<string, CardRec>;
  groups: Map<string, Group>;
  notes: Map<string, NoteRec>;
  actions: Map<string, ActionRec>;
  shields: Map<string, ShieldRec>;
}

/**
 * One row per entity in SQLite, so a change rewrites only what changed.
 * Everything is loaded into memory when the Durable Object wakes.
 */
export class Store {
  constructor(private sql: SqlStorage) {
    sql.exec(
      "CREATE TABLE IF NOT EXISTS entities (kind TEXT NOT NULL, id TEXT NOT NULL, data TEXT NOT NULL, PRIMARY KEY (kind, id))"
    );
  }

  load(): RoomData | null {
    const rows = this.sql
      .exec<{ kind: Kind; id: string; data: string }>("SELECT kind, id, data FROM entities")
      .toArray();
    const metaRow = rows.find((r) => r.kind === "meta");
    if (!metaRow) return null;
    const data: RoomData = {
      meta: JSON.parse(metaRow.data) as Meta,
      participants: new Map(),
      cards: new Map(),
      groups: new Map(),
      notes: new Map(),
      actions: new Map(),
      shields: new Map(),
    };
    for (const row of rows) {
      const value: unknown = JSON.parse(row.data);
      switch (row.kind) {
        case "participant":
          data.participants.set(row.id, value as ParticipantRec);
          break;
        case "card":
          data.cards.set(row.id, value as CardRec);
          break;
        case "group":
          data.groups.set(row.id, value as Group);
          break;
        case "note":
          data.notes.set(row.id, value as NoteRec);
          break;
        case "action":
          data.actions.set(row.id, value as ActionRec);
          break;
        case "shields":
          data.shields.set(row.id, value as ShieldRec);
          break;
        case "meta":
          break;
      }
    }
    return data;
  }

  put(kind: Kind, id: string, value: unknown): void {
    this.sql.exec(
      "INSERT INTO entities (kind, id, data) VALUES (?, ?, ?) ON CONFLICT (kind, id) DO UPDATE SET data = excluded.data",
      kind,
      id,
      JSON.stringify(value)
    );
  }

  delete(kind: Kind, id: string): void {
    this.sql.exec("DELETE FROM entities WHERE kind = ? AND id = ?", kind, id);
  }
}
