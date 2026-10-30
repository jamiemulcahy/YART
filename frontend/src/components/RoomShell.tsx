import { useState } from "react";
import { Link } from "react-router-dom";
import { PHASES, PHASE_LABELS } from "@yart/shared";
import type { Phase } from "@yart/shared";
import { formatCode } from "../lib/api";
import { isMuted, setMuted } from "../lib/sounds";
import { storage } from "../lib/storage";
import { useRoom } from "../room/RoomContext";
import type { ConnectionStatus } from "../room/state";
import { Timer } from "./Timer";
import { OwnerBar } from "./OwnerBar";
import { Participants } from "./Participants";
import { InlineEdit } from "./InlineEdit";
import { ShipPicker } from "./ShipPicker";
import { SetupPhase } from "../phases/SetupPhase";
import { WritePhase } from "../phases/WritePhase";
import { GroupPhase } from "../phases/GroupPhase";
import { DefendPhase } from "../phases/DefendPhase";
import { BattlePhase } from "../phases/BattlePhase";
import { DiscussPhase } from "../phases/DiscussPhase";
import { WrapupPhase } from "../phases/WrapupPhase";

const PHASE_VIEWS: Record<Phase, () => React.JSX.Element> = {
  setup: SetupPhase,
  write: WritePhase,
  group: GroupPhase,
  defend: DefendPhase,
  battle: BattlePhase,
  discuss: DiscussPhase,
  wrapup: WrapupPhase,
};

export function RoomShell(props: { connection: ConnectionStatus }) {
  const { room, me, isOwner, isViewer, send } = useRoom();
  const [copied, setCopied] = useState(false);
  const [muted, setMutedState] = useState(isMuted());
  const [showPeople, setShowPeople] = useState(false);
  const View = PHASE_VIEWS[room.phase];
  const online = room.participants.filter((p) => p.online && p.role !== "viewer").length;

  const copyLink = async () => {
    const url = `${window.location.origin}/r/${room.code}`;
    try {
      await navigator.clipboard.writeText(url);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      window.prompt("Copy this link", url);
    }
  };

  return (
    <div className={`room phase-${room.phase}`}>
      <header className="room-header">
        <Link to="/" className="logo small" aria-label="YART home">
          YART<span className="logo-dot">.</span>
        </Link>
        <div className="room-title">
          {isOwner ? (
            <InlineEdit
              label="Room name"
              value={room.name}
              onSave={(name) => send({ t: "room.rename", name })}
              className="room-name"
            />
          ) : (
            <h1 className="room-name">{room.name}</h1>
          )}
          <button className="code-chip" onClick={copyLink} title="Copy invite link">
            <span className="code-label">Room</span> {formatCode(room.code)}
            <span className="code-copy">{copied ? "Link copied!" : "Copy invite link"}</span>
          </button>
        </div>
        <nav className="stepper" aria-label="Retro phases">
          <ol>
            {PHASES.map((p, i) => {
              const current = PHASES.indexOf(room.phase);
              const state = i < current ? "done" : i === current ? "current" : "todo";
              return (
                <li
                  key={p}
                  className={`step ${state}`}
                  aria-current={state === "current" ? "step" : undefined}
                >
                  <span className="step-num">{i + 1}</span>
                  <span className="step-label">{PHASE_LABELS[p]}</span>
                </li>
              );
            })}
          </ol>
        </nav>
        <div className="header-right">
          <Timer />
          <button
            className="icon-btn"
            aria-pressed={muted}
            aria-label={muted ? "Unmute sounds" : "Mute sounds"}
            title={muted ? "Unmute sounds" : "Mute sounds"}
            onClick={() => {
              setMuted(!muted);
              setMutedState(!muted);
            }}
          >
            {muted ? "🔇" : "🔊"}
          </button>
          {isViewer && (
            <button
              className="btn small ghost"
              onClick={() => {
                // Forget the viewer identity and go back to the join screen.
                storage.setToken(room.code, null);
                window.location.reload();
              }}
            >
              Join as participant
            </button>
          )}
          <button
            className="people-btn"
            onClick={() => setShowPeople((s) => !s)}
            aria-expanded={showPeople}
            aria-controls="people-panel"
          >
            <span className="dot" style={{ background: me.colour }} aria-hidden="true" />
            <span className="me-name">{me.name}</span>
            <span className="people-count" aria-label={`${online} online`}>
              👥 {online}
            </span>
          </button>
        </div>
      </header>

      {props.connection === "reconnecting" && (
        <div className="banner warn" role="status">
          Connection lost — reconnecting…
        </div>
      )}

      {isOwner && <OwnerBar />}

      <div className="room-body">
        <main className="room-main" id="main">
          <View />
        </main>
        {showPeople && <Participants onClose={() => setShowPeople(false)} />}
      </div>
      {!isViewer && !me.ship && <ChooseShip />}
    </div>
  );
}

/** Anyone without a ship (the owner, or people who joined before ships existed) picks one first. */
function ChooseShip() {
  const { me, send } = useRoom();
  return (
    <div className="modal-backdrop">
      <div className="panel modal" role="dialog" aria-modal="true" aria-labelledby="choose-ship">
        <h2 id="choose-ship">Choose your ship</h2>
        <p className="muted">
          Used in the optional battle stage. Each ship has its own weapon and a special move that charges as
          you hit things. You can change it any time before the battle.
        </p>
        <ShipPicker value={undefined} colour={me.colour} onChange={(ship) => send({ t: "ship.set", ship })} />
      </div>
    </div>
  );
}
