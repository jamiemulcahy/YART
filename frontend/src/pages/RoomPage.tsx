import { useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import { formatCode, normaliseCode, roomInfo } from "../lib/api";
import { storage } from "../lib/storage";
import { unlockAudio } from "../lib/sounds";
import { useRoomConnection } from "../room/useRoomConnection";
import { RoomProvider } from "../room/RoomContext";
import { RoomShell } from "../components/RoomShell";
import { Toasts } from "../components/Toasts";

type Lookup =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "error" }
  | { state: "found"; name: string };

export function RoomPage() {
  const code = normaliseCode(useParams().code ?? "");
  const [lookup, setLookup] = useState<Lookup>({ state: "loading" });
  const hasIdentity = !!(storage.token(code) || storage.ownerKey(code));
  const [joinAs, setJoinAs] = useState<"participant" | "viewer" | null>(hasIdentity ? "participant" : null);

  useEffect(() => {
    let cancelled = false;
    roomInfo(code)
      .then((info) => {
        if (cancelled) return;
        setLookup(info.exists ? { state: "found", name: info.name ?? "" } : { state: "missing" });
      })
      .catch(() => !cancelled && setLookup({ state: "error" }));
    return () => {
      cancelled = true;
    };
  }, [code]);

  const enabled = lookup.state === "found" && joinAs !== null;
  const conn = useRoomConnection(code, enabled, joinAs === "viewer");
  const { state } = conn;

  // Remember this room so it shows under "Your rooms" on the landing page.
  const roomName = state.room?.name;
  const myRole = state.me?.role;
  useEffect(() => {
    if (roomName !== undefined && myRole) storage.rememberRoom(code, roomName, myRole);
  }, [code, roomName, myRole]);

  // A room that's gone can't be reopened, so stop listing it.
  const gone = lookup.state === "missing" || state.status === "deleted";
  useEffect(() => {
    if (gone) storage.forgetRoom(code);
  }, [gone, code]);

  useEffect(() => {
    const name = state.room?.name ?? (lookup.state === "found" ? lookup.name : "");
    document.title = name ? `${name} · YART` : "YART";
  }, [state.room?.name, lookup]);

  if (lookup.state === "loading") return <CenterMessage title="Finding room…" />;
  if (lookup.state === "error")
    return <CenterMessage title="Can't reach the server" body="Check your connection and refresh." />;
  if (lookup.state === "missing" || state.status === "not_found")
    return (
      <CenterMessage
        title="Room not found"
        body={`There's no room ${formatCode(code)}. It may have expired.`}
      />
    );
  if (state.status === "deleted") return <CenterMessage title="This room has been deleted" />;
  if (state.status === "full")
    return <CenterMessage title="This room is full" body="Ask the owner to make space." />;

  if (joinAs === null) {
    return (
      <div className="center-page">
        <div className="stars" aria-hidden="true" />
        <div className="panel join-panel">
          <p className="eyebrow">Room {formatCode(code)}</p>
          <h1>{lookup.name}</h1>
          <p>You'll get a random anonymous name. You can change it once you're in.</p>
          <div className="join-actions">
            <button
              className="btn primary big"
              onClick={() => {
                unlockAudio();
                setJoinAs("participant");
              }}
            >
              Join retro
            </button>
            <button
              className="btn ghost"
              onClick={() => {
                unlockAudio();
                setJoinAs("viewer");
              }}
            >
              Join as viewer (shared screen)
            </button>
          </div>
        </div>
      </div>
    );
  }

  const me = state.me && state.room?.participants.find((p) => p.id === state.me?.id);
  if (!state.room || !me) return <CenterMessage title="Connecting…" />;

  return (
    <RoomProvider
      room={state.room}
      me={me}
      battle={state.battle}
      lastResults={state.lastResults}
      send={conn.send}
      now={conn.now}
      toast={conn.toast}
    >
      <RoomShell connection={state.status} />
      <Toasts toasts={state.toasts} dismiss={conn.dismiss} />
    </RoomProvider>
  );
}

function CenterMessage(props: { title: string; body?: string }) {
  return (
    <div className="center-page">
      <div className="stars" aria-hidden="true" />
      <div className="panel join-panel">
        <h1>{props.title}</h1>
        {props.body && <p>{props.body}</p>}
        <Link className="btn" to="/">
          Back to start
        </Link>
      </div>
    </div>
  );
}
