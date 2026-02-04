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
  cards: Card[];
  groups: CardGroup[];
  voteSettings: VoteSettings;
  createdAt: string;
}

export interface Column {
  id: string;
  name: string;
  description?: string;
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

export interface VoteSettings {
  totalVotesLimit?: number;
  votesPerColumnLimit?: number;
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

// WebSocket message types (client → server)
export type ClientMessage =
  | { type: "join"; userName?: string; userId?: string }
  | { type: "publish_card"; columnId: string; content: string }
  | { type: "delete_card"; cardId: string }
  | { type: "group_cards"; cardIds: string[] }
  | { type: "ungroup_card"; cardId: string }
  | { type: "toggle_vote"; targetId: string; targetType: "card" | "group" }
  | { type: "rename_user"; newName: string }
  | { type: "owner:set_mode"; ownerKey: string; mode: RoomMode }
  | { type: "owner:add_column"; ownerKey: string; name: string }
  | {
      type: "owner:update_column";
      ownerKey: string;
      columnId: string;
      name: string;
      description?: string;
    }
  | { type: "owner:delete_column"; ownerKey: string; columnId: string }
  | { type: "owner:reorder_columns"; ownerKey: string; columnIds: string[] }
  | { type: "owner:set_focus"; ownerKey: string; cardId: string | null }
  | {
      type: "owner:add_action";
      ownerKey: string;
      cardId: string;
      content: string;
    }
  | {
      type: "owner:set_vote_settings";
      ownerKey: string;
      totalVotesLimit?: number;
      votesPerColumnLimit?: number;
    };

// WebSocket message types (server → client)
export type ServerMessage =
  | { type: "state"; room: Room; user: User; users: User[]; myVotes: string[] }
  | { type: "user_joined"; user: User }
  | { type: "user_left"; userId: string }
  | { type: "user_renamed"; userId: string; newName: string }
  | { type: "card_published"; card: Card }
  | { type: "card_deleted"; cardId: string }
  | { type: "cards_grouped"; group: CardGroup }
  | { type: "card_ungrouped"; cardId: string }
  | {
      type: "vote_toggled";
      targetId: string;
      targetType: "card" | "group";
      votes: number;
      userId: string;
      action: "add" | "remove";
    }
  | { type: "vote_settings_changed"; voteSettings: VoteSettings }
  | { type: "mode_changed"; mode: RoomMode }
  | { type: "column_added"; column: Column }
  | { type: "column_updated"; column: Column }
  | { type: "column_deleted"; columnId: string }
  | { type: "columns_reordered"; columnIds: string[] }
  | { type: "focus_changed"; cardId: string | null }
  | { type: "action_added"; cardId: string; action: ActionItem }
  | { type: "error"; code: string; message: string }
  | { type: "pong" };
