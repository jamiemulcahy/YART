import {
  createContext,
  useContext,
  useState,
  useCallback,
  useEffect,
  type ReactNode,
} from "react";
import type { User, DraftCard } from "../types";
import { generateId } from "../utils";

const OWNER_KEY_STORAGE_PREFIX = "yart_owner_key_";
const USER_ID_STORAGE_PREFIX = "yart_user_id_";

interface UserContextValue {
  user: User | null;
  ownerKey: string | null;
  draftCards: DraftCard[];
  votedCardIds: string[];
  setUser: (user: User | null) => void;
  setOwnerKey: (key: string | null, roomId?: string) => void;
  loadOwnerKey: (roomId: string) => string | null;
  saveUserId: (roomId: string, userId: string) => void;
  loadUserId: (roomId: string) => string | null;
  addDraftCard: (columnId: string, content: string) => string;
  updateDraftCard: (id: string, content: string) => void;
  deleteDraftCard: (id: string) => void;
  getDraftCardsForColumn: (columnId: string) => DraftCard[];
  clearDraftCards: () => void;
  addVotedCard: (cardId: string) => void;
  clearVotedCards: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [ownerKey, setOwnerKeyState] = useState<string | null>(null);
  const [draftCards, setDraftCards] = useState<DraftCard[]>([]);
  const [votedCardIds, setVotedCardIds] = useState<string[]>([]);

  const setOwnerKey = useCallback((key: string | null, roomId?: string) => {
    setOwnerKeyState(key);

    if (roomId) {
      if (key) {
        try {
          localStorage.setItem(`${OWNER_KEY_STORAGE_PREFIX}${roomId}`, key);
        } catch {
          // localStorage might be unavailable
        }
      } else {
        try {
          localStorage.removeItem(`${OWNER_KEY_STORAGE_PREFIX}${roomId}`);
        } catch {
          // localStorage might be unavailable
        }
      }
    }
  }, []);

  const loadOwnerKey = useCallback((roomId: string): string | null => {
    try {
      const stored = localStorage.getItem(
        `${OWNER_KEY_STORAGE_PREFIX}${roomId}`
      );
      if (stored) {
        setOwnerKeyState(stored);
        return stored;
      }
    } catch {
      // localStorage might be unavailable
    }
    return null;
  }, []);

  const saveUserId = useCallback((roomId: string, userId: string) => {
    try {
      localStorage.setItem(`${USER_ID_STORAGE_PREFIX}${roomId}`, userId);
    } catch {
      // localStorage might be unavailable
    }
  }, []);

  const loadUserId = useCallback((roomId: string): string | null => {
    try {
      return localStorage.getItem(`${USER_ID_STORAGE_PREFIX}${roomId}`);
    } catch {
      // localStorage might be unavailable
      return null;
    }
  }, []);

  const addDraftCard = useCallback(
    (columnId: string, content: string): string => {
      const id = generateId(16);
      const newDraft: DraftCard = { id, columnId, content };
      setDraftCards((prev) => [...prev, newDraft]);
      return id;
    },
    []
  );

  const updateDraftCard = useCallback((id: string, content: string) => {
    setDraftCards((prev) =>
      prev.map((draft) => (draft.id === id ? { ...draft, content } : draft))
    );
  }, []);

  const deleteDraftCard = useCallback((id: string) => {
    setDraftCards((prev) => prev.filter((draft) => draft.id !== id));
  }, []);

  const getDraftCardsForColumn = useCallback(
    (columnId: string): DraftCard[] => {
      return draftCards.filter((draft) => draft.columnId === columnId);
    },
    [draftCards]
  );

  const clearDraftCards = useCallback(() => {
    setDraftCards([]);
  }, []);

  const addVotedCard = useCallback((cardId: string) => {
    setVotedCardIds((prev) => {
      if (prev.includes(cardId)) return prev;
      return [...prev, cardId];
    });
  }, []);

  const clearVotedCards = useCallback(() => {
    setVotedCardIds([]);
  }, []);

  // Update user.isOwner when ownerKey changes
  useEffect(() => {
    setUser((currentUser) => {
      if (!currentUser) return null;
      const shouldBeOwner = !!ownerKey;
      if (currentUser.isOwner !== shouldBeOwner) {
        return { ...currentUser, isOwner: shouldBeOwner };
      }
      return currentUser;
    });
  }, [ownerKey]);

  const value: UserContextValue = {
    user,
    ownerKey,
    draftCards,
    votedCardIds,
    setUser,
    setOwnerKey,
    loadOwnerKey,
    saveUserId,
    loadUserId,
    addDraftCard,
    updateDraftCard,
    deleteDraftCard,
    getDraftCardsForColumn,
    clearDraftCards,
    addVotedCard,
    clearVotedCards,
  };

  return <UserContext.Provider value={value}>{children}</UserContext.Provider>;
}

export function useUser(): UserContextValue {
  const context = useContext(UserContext);
  if (!context) {
    throw new Error("useUser must be used within a UserProvider");
  }
  return context;
}
