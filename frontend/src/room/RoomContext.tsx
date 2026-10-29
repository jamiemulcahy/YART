import { createContext, useContext, useMemo } from "react";
import type { ReactNode } from "react";
import { buildTopics } from "@yart/shared";
import type {
  BattleLive,
  BattleResults,
  ClientMessage,
  Participant,
  RoomSnapshot,
  Topic,
} from "@yart/shared";

export interface RoomContextValue {
  room: RoomSnapshot;
  me: Participant;
  isOwner: boolean;
  isViewer: boolean;
  topics: Topic[];
  battle: BattleLive | null;
  lastResults: BattleResults | null;
  send: (msg: ClientMessage) => void;
  now: () => number;
  toast: (message: string) => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

export function RoomProvider(props: {
  room: RoomSnapshot;
  me: Participant;
  battle: BattleLive | null;
  lastResults: BattleResults | null;
  send: (msg: ClientMessage) => void;
  now: () => number;
  toast: (message: string) => void;
  children: ReactNode;
}) {
  const { room, me, battle, lastResults, send, now, toast } = props;
  const topics = useMemo(
    () => buildTopics(room.lanes, room.groups, room.cards),
    [room.lanes, room.groups, room.cards]
  );
  const value = useMemo<RoomContextValue>(
    () => ({
      room,
      me,
      isOwner: me.role === "owner",
      isViewer: me.role === "viewer",
      topics,
      battle,
      lastResults,
      send,
      now,
      toast,
    }),
    [room, me, topics, battle, lastResults, send, now, toast]
  );
  return <RoomContext.Provider value={value}>{props.children}</RoomContext.Provider>;
}

// eslint-disable-next-line react-refresh/only-export-components
export function useRoom(): RoomContextValue {
  const ctx = useContext(RoomContext);
  if (!ctx) throw new Error("useRoom must be used inside RoomProvider");
  return ctx;
}
