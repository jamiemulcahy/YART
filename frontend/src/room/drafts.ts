import { useCallback, useMemo, useSyncExternalStore } from "react";

/**
 * Draft cards live only in this browser (localStorage) until they're published, so nothing
 * private ever reaches the server. They survive refreshes.
 */

export interface Draft {
  id: string;
  text: string;
  /** Set while a publish is in flight; cleared if it doesn't land. */
  publishingAt?: number;
}

type DraftStore = Record<string, Draft[]>;

const MAX_DRAFTS_PER_LANE = 50;
const memory = new Map<string, string>();
const listeners = new Set<() => void>();

// crypto.randomUUID needs a secure context, which a LAN dev URL isn't.
function newDraftId(): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}`;
}

function key(code: string): string {
  return `yart:drafts:${code}`;
}

function readRaw(code: string): string {
  try {
    return window.localStorage.getItem(key(code)) ?? "{}";
  } catch {
    return memory.get(key(code)) ?? "{}";
  }
}

function write(code: string, store: DraftStore): void {
  const raw = JSON.stringify(store);
  try {
    window.localStorage.setItem(key(code), raw);
  } catch {
    memory.set(key(code), raw);
  }
  listeners.forEach((l) => l());
}

function parse(raw: string): DraftStore {
  try {
    const value = JSON.parse(raw) as unknown;
    return value && typeof value === "object" ? (value as DraftStore) : {};
  } catch {
    return {};
  }
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  const onStorage = (e: StorageEvent) => e.key?.startsWith("yart:drafts:") && listener();
  window.addEventListener("storage", onStorage);
  return () => {
    listeners.delete(listener);
    window.removeEventListener("storage", onStorage);
  };
}

export function useDrafts(code: string, laneId: string) {
  const raw = useSyncExternalStore(subscribe, () => readRaw(code));
  const drafts = useMemo(() => parse(raw)[laneId] ?? [], [raw, laneId]);

  const change = useCallback(
    (fn: (list: Draft[]) => Draft[]) => {
      const store = parse(readRaw(code));
      store[laneId] = fn(store[laneId] ?? []);
      write(code, store);
    },
    [code, laneId]
  );

  return useMemo(
    () => ({
      drafts,
      canAdd: drafts.length < MAX_DRAFTS_PER_LANE,
      add: (text: string) =>
        change((list) => (list.length >= MAX_DRAFTS_PER_LANE ? list : [...list, { id: newDraftId(), text }])),
      update: (id: string, text: string) =>
        change((list) => list.map((d) => (d.id === id ? { ...d, text } : d))),
      remove: (id: string) => change((list) => list.filter((d) => d.id !== id)),
      markPublishing: (ids: string[]) =>
        change((list) => list.map((d) => (ids.includes(d.id) ? { ...d, publishingAt: Date.now() } : d))),
      clearPublishing: (ids: string[]) =>
        change((list) => list.map((d) => (ids.includes(d.id) ? { ...d, publishingAt: undefined } : d))),
    }),
    [drafts, change]
  );
}
