import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type {
  Room,
  User,
  Card,
  CardGroup,
  RoomMode,
  Column,
  ServerMessage,
  ClientMessage,
} from "../types";
import { useWebSocket } from "../hooks";
import { useUser } from "./UserContext";

interface RoomContextValue {
  room: Room | null;
  users: User[];
  cards: Card[];
  groups: CardGroup[];
  focusedCardId: string | null;
  isConnected: boolean;
  isLoading: boolean;
  error: string | null;
  // Participant actions
  publishCard: (columnId: string, content: string) => void;
  deleteCard: (cardId: string) => void;
  groupCards: (cardIds: string[]) => void;
  ungroupCard: (cardId: string) => void;
  vote: (cardId: string, vote: boolean) => void;
  // Owner actions
  setMode: (mode: RoomMode) => void;
  addColumn: (name: string) => void;
  updateColumn: (columnId: string, name: string) => void;
  deleteColumn: (columnId: string) => void;
  reorderColumns: (columnIds: string[]) => void;
  setFocus: (cardId: string | null) => void;
  addAction: (cardId: string, content: string) => void;
}

const RoomContext = createContext<RoomContextValue | null>(null);

interface RoomProviderProps {
  roomId: string;
  children: ReactNode;
}

export function RoomProvider({ roomId, children }: RoomProviderProps) {
  const { setUser, ownerKey, loadOwnerKey } = useUser();

  const [room, setRoom] = useState<Room | null>(null);
  const [users, setUsers] = useState<User[]>([]);
  const [cards, setCards] = useState<Card[]>([]);
  const [groups, setGroups] = useState<CardGroup[]>([]);
  const [focusedCardId, setFocusedCardId] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load stored owner key for this room
  useEffect(() => {
    loadOwnerKey(roomId);
  }, [roomId, loadOwnerKey]);

  const handleMessage = useCallback(
    (message: ServerMessage) => {
      switch (message.type) {
        case "state":
          setRoom(message.room);
          setCards(message.room.cards || []);
          setGroups(message.room.groups || []);
          // eslint-disable-next-line @typescript-eslint/no-explicit-any
          setFocusedCardId((message.room as any).focusedCardId ?? null);
          setUser(message.user);
          setUsers(message.users);
          setIsLoading(false);
          setError(null);
          break;

        case "user_joined":
          setUsers((prev) => {
            // Prevent duplicates (can happen with StrictMode remounts)
            if (prev.some((u) => u.id === message.user.id)) {
              return prev;
            }
            return [...prev, message.user];
          });
          break;

        case "user_left":
          setUsers((prev) => prev.filter((u) => u.id !== message.userId));
          break;

        case "card_published":
          setCards((prev) => {
            // Prevent duplicates (can happen with StrictMode remounts)
            if (prev.some((c) => c.id === message.card.id)) {
              return prev;
            }
            return [...prev, message.card];
          });
          break;

        case "card_deleted":
          setCards((prev) => prev.filter((c) => c.id !== message.cardId));
          break;

        case "cards_grouped":
          setGroups((prev) => {
            const existing = prev.find((g) => g.id === message.group.id);
            if (existing) {
              return prev.map((g) =>
                g.id === message.group.id ? message.group : g
              );
            }
            return [...prev, message.group];
          });
          // Update card groupIds
          setCards((prev) =>
            prev.map((card) =>
              message.group.cardIds.includes(card.id)
                ? { ...card, groupId: message.group.id }
                : card
            )
          );
          break;

        case "card_ungrouped":
          setCards((prev) =>
            prev.map((card) =>
              card.id === message.cardId
                ? { ...card, groupId: undefined }
                : card
            )
          );
          // Remove empty groups
          setGroups((prev) =>
            prev
              .map((g) => ({
                ...g,
                cardIds: g.cardIds.filter((id) => id !== message.cardId),
              }))
              .filter((g) => g.cardIds.length > 1)
          );
          break;

        case "vote_recorded":
          setCards((prev) =>
            prev.map((card) =>
              card.id === message.cardId
                ? { ...card, votes: message.votes }
                : card
            )
          );
          break;

        case "mode_changed":
          setRoom((prev) => (prev ? { ...prev, mode: message.mode } : null));
          break;

        case "column_added":
          setRoom((prev) => {
            if (!prev) return null;
            // Prevent duplicates (can happen with StrictMode remounts)
            if (prev.columns.some((c) => c.id === message.column.id)) {
              return prev;
            }
            return { ...prev, columns: [...prev.columns, message.column] };
          });
          break;

        case "column_updated":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  columns: prev.columns.map((col) =>
                    col.id === message.column.id ? message.column : col
                  ),
                }
              : null
          );
          break;

        case "column_deleted":
          setRoom((prev) =>
            prev
              ? {
                  ...prev,
                  columns: prev.columns.filter(
                    (col) => col.id !== message.columnId
                  ),
                }
              : null
          );
          // Also remove cards in deleted column
          setCards((prev) =>
            prev.filter((card) => card.columnId !== message.columnId)
          );
          break;

        case "columns_reordered":
          setRoom((prev) => {
            if (!prev) return null;
            const columnMap = new Map(prev.columns.map((c) => [c.id, c]));
            const reordered = message.columnIds
              .map((id, index) => {
                const col = columnMap.get(id);
                return col ? { ...col, order: index } : null;
              })
              .filter((c): c is Column => c !== null);
            return { ...prev, columns: reordered };
          });
          break;

        case "focus_changed":
          setFocusedCardId(message.cardId);
          break;

        case "action_added":
          setCards((prev) =>
            prev.map((card) =>
              card.id === message.cardId
                ? {
                    ...card,
                    actionItems: [...card.actionItems, message.action],
                  }
                : card
            )
          );
          break;

        case "error":
          setError(message.message);
          break;
      }
    },
    [setUser]
  );

  const handleConnect = useCallback(() => {
    setError(null);
  }, []);

  const handleDisconnect = useCallback(() => {
    // Don't set error immediately - reconnection will be attempted
  }, []);

  const handleError = useCallback(() => {
    setError("Connection error");
  }, []);

  const { send, isConnected } = useWebSocket(roomId, {
    onMessage: handleMessage,
    onConnect: handleConnect,
    onDisconnect: handleDisconnect,
    onError: handleError,
  });

  // Helper to send messages
  const sendMessage = useCallback(
    (message: ClientMessage) => {
      send(message);
    },
    [send]
  );

  // Participant actions
  const publishCard = useCallback(
    (columnId: string, content: string) => {
      sendMessage({ type: "publish_card", columnId, content });
    },
    [sendMessage]
  );

  const deleteCard = useCallback(
    (cardId: string) => {
      sendMessage({ type: "delete_card", cardId });
    },
    [sendMessage]
  );

  const groupCardsAction = useCallback(
    (cardIds: string[]) => {
      sendMessage({ type: "group_cards", cardIds });
    },
    [sendMessage]
  );

  const ungroupCard = useCallback(
    (cardId: string) => {
      sendMessage({ type: "ungroup_card", cardId });
    },
    [sendMessage]
  );

  const voteAction = useCallback(
    (cardId: string, vote: boolean) => {
      sendMessage({ type: "vote", cardId, vote });
    },
    [sendMessage]
  );

  // Owner actions
  const setMode = useCallback(
    (mode: RoomMode) => {
      if (!ownerKey) return;
      sendMessage({ type: "owner:set_mode", ownerKey, mode });
    },
    [sendMessage, ownerKey]
  );

  const addColumn = useCallback(
    (name: string) => {
      if (!ownerKey) return;
      sendMessage({ type: "owner:add_column", ownerKey, name });
    },
    [sendMessage, ownerKey]
  );

  const updateColumn = useCallback(
    (columnId: string, name: string) => {
      if (!ownerKey) return;
      sendMessage({ type: "owner:update_column", ownerKey, columnId, name });
    },
    [sendMessage, ownerKey]
  );

  const deleteColumn = useCallback(
    (columnId: string) => {
      if (!ownerKey) return;
      sendMessage({ type: "owner:delete_column", ownerKey, columnId });
    },
    [sendMessage, ownerKey]
  );

  const reorderColumns = useCallback(
    (columnIds: string[]) => {
      if (!ownerKey) return;
      sendMessage({ type: "owner:reorder_columns", ownerKey, columnIds });
    },
    [sendMessage, ownerKey]
  );

  const setFocus = useCallback(
    (cardId: string | null) => {
      if (!ownerKey) return;
      sendMessage({ type: "owner:set_focus", ownerKey, cardId });
    },
    [sendMessage, ownerKey]
  );

  const addAction = useCallback(
    (cardId: string, content: string) => {
      if (!ownerKey) return;
      sendMessage({ type: "owner:add_action", ownerKey, cardId, content });
    },
    [sendMessage, ownerKey]
  );

  const value: RoomContextValue = {
    room,
    users,
    cards,
    groups,
    focusedCardId,
    isConnected,
    isLoading,
    error,
    publishCard,
    deleteCard,
    groupCards: groupCardsAction,
    ungroupCard,
    vote: voteAction,
    setMode,
    addColumn,
    updateColumn,
    deleteColumn,
    reorderColumns,
    setFocus,
    addAction,
  };

  return <RoomContext.Provider value={value}>{children}</RoomContext.Provider>;
}

export function useRoom(): RoomContextValue {
  const context = useContext(RoomContext);
  if (!context) {
    throw new Error("useRoom must be used within a RoomProvider");
  }
  return context;
}
