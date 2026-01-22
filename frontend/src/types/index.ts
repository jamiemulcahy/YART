// Room types
export type RoomMode =
  | "edit"
  | "publish"
  | "group"
  | "vote"
  | "focus"
  | "overview";

export interface Room {
  id: string;
  name: string;
  mode: RoomMode;
  columns: Column[];
  createdAt: string;
}

export interface Column {
  id: string;
  name: string;
  order: number;
}

export interface Card {
  id: string;
  columnId: string;
  content: string;
  authorId: string;
  authorName: string;
  votes: number;
  groupId?: string;
  actionItems: ActionItem[];
}

export interface ActionItem {
  id: string;
  content: string;
}

export interface CardGroup {
  id: string;
  cardIds: string[];
}

// User types
export interface User {
  id: string;
  name: string;
  isOwner: boolean;
}

export interface DraftCard {
  id: string;
  columnId: string;
  content: string;
}
