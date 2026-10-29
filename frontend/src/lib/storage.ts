// localStorage can throw (private mode, blocked storage); everything here degrades to "not stored".

function get(key: string): string | null {
  try {
    return window.localStorage.getItem(key);
  } catch {
    return null;
  }
}

function set(key: string, value: string | null): void {
  try {
    if (value === null) window.localStorage.removeItem(key);
    else window.localStorage.setItem(key, value);
  } catch {
    // ignore
  }
}

export const storage = {
  token: (code: string) => get(`yart:token:${code}`),
  setToken: (code: string, token: string | null) => set(`yart:token:${code}`, token),
  ownerKey: (code: string) => get(`yart:owner:${code}`),
  setOwnerKey: (code: string, key: string | null) => set(`yart:owner:${code}`, key),
  muted: () => get("yart:muted") === "1",
  setMuted: (muted: boolean) => set("yart:muted", muted ? "1" : null),
};
