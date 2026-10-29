import type { BattleLive, BattleResults, Role, RoomSnapshot, ServerMessage } from "@yart/shared";

export type ConnectionStatus = "connecting" | "open" | "reconnecting" | "not_found" | "deleted" | "full";

export interface Toast {
  id: number;
  message: string;
}

export interface RoomState {
  status: ConnectionStatus;
  me: { id: string; role: Role } | null;
  room: RoomSnapshot | null;
  battle: BattleLive | null;
  /** Set when a battle ends while we're watching, so the UI can celebrate. */
  lastResults: BattleResults | null;
  toasts: Toast[];
}

export const initialState: RoomState = {
  status: "connecting",
  me: null,
  room: null,
  battle: null,
  lastResults: null,
  toasts: [],
};

export type Action =
  | { type: "status"; status: ConnectionStatus }
  | { type: "server"; msg: ServerMessage }
  | { type: "toast"; message: string }
  | { type: "dismiss"; id: number };

let toastId = 0;

function upsert<T extends { id: string }>(list: T[], item: T): T[] {
  const i = list.findIndex((x) => x.id === item.id);
  if (i === -1) return [...list, item];
  const next = list.slice();
  next[i] = item;
  return next;
}

function remove<T extends { id: string }>(list: T[], id: string): T[] {
  return list.filter((x) => x.id !== id);
}

function withRoom(state: RoomState, fn: (room: RoomSnapshot) => RoomSnapshot): RoomState {
  return state.room ? { ...state, room: fn(state.room) } : state;
}

export function reducer(state: RoomState, action: Action): RoomState {
  switch (action.type) {
    case "status":
      return { ...state, status: action.status };
    case "toast":
      return { ...state, toasts: [...state.toasts.slice(-3), { id: ++toastId, message: action.message }] };
    case "dismiss":
      return { ...state, toasts: state.toasts.filter((t) => t.id !== action.id) };
    case "server":
      return applyServer(state, action.msg);
  }
}

function applyServer(state: RoomState, msg: ServerMessage): RoomState {
  switch (msg.t) {
    case "welcome":
      return { ...state, me: { id: msg.participantId, role: msg.role } };
    case "snapshot": {
      const me = state.me && msg.room.participants.find((p) => p.id === state.me?.id);
      return {
        ...state,
        status: "open",
        room: msg.room,
        battle: msg.battle,
        me: state.me && me ? { ...state.me, role: me.role } : state.me,
      };
    }
    case "pong":
      return state;
    case "patch":
      return withRoom(state, (room) => ({ ...room, ...msg.patch }));
    case "participant":
      return withRoom(state, (room) => ({
        ...room,
        participants: upsert(room.participants, msg.participant),
      }));
    case "card":
      return withRoom(state, (room) => ({ ...room, cards: upsert(room.cards, msg.card) }));
    case "card.removed":
      return withRoom(state, (room) => ({ ...room, cards: remove(room.cards, msg.id) }));
    case "group":
      return withRoom(state, (room) => ({ ...room, groups: upsert(room.groups, msg.group) }));
    case "group.removed":
      return withRoom(state, (room) => ({ ...room, groups: remove(room.groups, msg.id) }));
    case "note":
      return withRoom(state, (room) => ({ ...room, notes: upsert(room.notes, msg.note) }));
    case "note.removed":
      return withRoom(state, (room) => ({ ...room, notes: remove(room.notes, msg.id) }));
    case "action":
      return withRoom(state, (room) => ({ ...room, actions: upsert(room.actions, msg.action) }));
    case "action.removed":
      return withRoom(state, (room) => ({ ...room, actions: remove(room.actions, msg.id) }));
    case "battle.start":
      return { ...state, battle: msg.battle, lastResults: null };
    case "battle.tick":
      return state.battle ? { ...state, battle: { ...state.battle, ...msg.tick } } : state;
    case "battle.end":
      return {
        ...withRoom(state, (room) => ({ ...room, battle: msg.results })),
        battle: null,
        lastResults: msg.results,
      };
    case "error":
      return { ...state, toasts: [...state.toasts.slice(-3), { id: ++toastId, message: msg.message }] };
    case "room.deleted":
      return { ...state, status: "deleted" };
  }
}
