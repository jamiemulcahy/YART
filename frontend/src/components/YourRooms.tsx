import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { PHASE_LABELS } from "@yart/shared";
import { formatCode, roomInfo } from "../lib/api";
import type { RoomInfo } from "../lib/api";
import { storage } from "../lib/storage";
import type { KnownRoom } from "../lib/storage";

const MAX_LISTED = 20;

function timeAgo(ms: number): string {
  const s = Math.max(0, Math.round((Date.now() - ms) / 1000));
  if (s < 60) return "just now";
  const m = Math.round(s / 60);
  if (m < 60) return `${m} min ago`;
  const h = Math.round(m / 60);
  if (h < 24) return `${h} h ago`;
  const d = Math.round(h / 24);
  return `${d} day${d === 1 ? "" : "s"} ago`;
}

/** Rooms this browser can get back into. Lives in localStorage, so it's per browser. */
export function YourRooms() {
  const [rooms, setRooms] = useState<KnownRoom[]>(() => storage.knownRooms().slice(0, MAX_LISTED));
  const [info, setInfo] = useState<Record<string, RoomInfo | "error">>({});
  const [confirming, setConfirming] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    for (const room of rooms) {
      roomInfo(room.code)
        .then((result) => {
          if (cancelled) return;
          if (!result.exists) {
            // Expired or deleted: nothing to go back to.
            storage.forgetRoom(room.code);
            setRooms((list) => list.filter((r) => r.code !== room.code));
            return;
          }
          setInfo((all) => ({ ...all, [room.code]: result }));
        })
        .catch(() => !cancelled && setInfo((all) => ({ ...all, [room.code]: "error" })));
    }
    return () => {
      cancelled = true;
    };
    // Only look rooms up once, on load.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  if (rooms.length === 0) return null;

  const forget = (code: string) => {
    storage.forgetRoom(code);
    setRooms((list) => list.filter((r) => r.code !== code));
    setConfirming(null);
  };

  // Most recently active first, using the server's view once it's loaded.
  const recency = (r: KnownRoom) => {
    const live = info[r.code];
    return Math.max(r.lastSeen, live && live !== "error" ? (live.lastActivity ?? 0) : 0);
  };
  const sorted = [...rooms].sort((a, b) => recency(b) - recency(a));

  return (
    <section className="panel your-rooms" aria-labelledby="your-rooms-heading">
      <div className="your-rooms-head">
        <h2 id="your-rooms-heading">Your rooms</h2>
        <span className="muted">Remembered in this browser</span>
      </div>
      <ul className="your-rooms-list">
        {sorted.map((room) => {
          const details = info[room.code];
          const live = details && details !== "error" ? details : null;
          const name = live?.name || room.name || formatCode(room.code);
          return (
            <li key={room.code} className="your-room" aria-label={`Room ${name}`}>
              <Link to={`/r/${room.code}`} className="your-room-main">
                <span className="your-room-name">{name}</span>
                <span className="your-room-meta">
                  <span className="code">{formatCode(room.code)}</span>
                  <span className={`badge ${room.role}`}>
                    {room.role === "owner" ? "Facilitator" : room.role === "viewer" ? "Viewer" : "Joined"}
                  </span>
                  {live?.phase && <span>{PHASE_LABELS[live.phase]}</span>}
                  {live && live.online !== undefined && live.online > 0 && (
                    <span>👥 {live.online} here now</span>
                  )}
                  {live?.lastActivity ? (
                    <span className="muted">active {timeAgo(live.lastActivity)}</span>
                  ) : details === "error" ? (
                    <span className="muted">couldn't check</span>
                  ) : null}
                </span>
              </Link>
              {confirming === room.code ? (
                <span className="your-room-confirm">
                  <span>
                    {room.role === "owner"
                      ? "Forget it? You'll lose facilitator access in this browser."
                      : "Forget this room?"}
                  </span>
                  <button className="btn small danger" onClick={() => forget(room.code)}>
                    Forget
                  </button>
                  <button className="btn small ghost" onClick={() => setConfirming(null)}>
                    Cancel
                  </button>
                </span>
              ) : (
                <button
                  className="icon-btn"
                  aria-label={`Forget ${name}`}
                  title="Remove from this list"
                  onClick={() => setConfirming(room.code)}
                >
                  ✕
                </button>
              )}
            </li>
          );
        })}
      </ul>
    </section>
  );
}
