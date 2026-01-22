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

interface UserContextValue {
  user: User | null;
  ownerKey: string | null;
  draftCards: DraftCard[];
  setUser: (user: User | null) => void;
  setOwnerKey: (key: string | null, roomId?: string) => void;
  loadOwnerKey: (roomId: string) => string | null;
  addDraftCard: (columnId: string, content: string) => string;
  updateDraftCard: (id: string, content: string) => void;
  deleteDraftCard: (id: string) => void;
  getDraftCardsForColumn: (columnId: string) => DraftCard[];
  clearDraftCards: () => void;
}

const UserContext = createContext<UserContextValue | null>(null);

interface UserProviderProps {
  children: ReactNode;
}

export function UserProvider({ children }: UserProviderProps) {
  const [user, setUser] = useState<User | null>(null);
  const [ownerKey, setOwnerKeyState] = useState<string | null>(null);
  const [draftCards, setDraftCards] = useState<DraftCard[]>([]);

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
    setUser,
    setOwnerKey,
    loadOwnerKey,
    addDraftCard,
    updateDraftCard,
    deleteDraftCard,
    getDraftCardsForColumn,
    clearDraftCards,
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
