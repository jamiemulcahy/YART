import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { RoomMode } from "../types";

const MODE_LABELS: Record<RoomMode, string> = {
  edit: "Setup",
  publish: "Add Cards",
  group: "Group Cards",
  vote: "Vote",
  focus: "Discuss",
  overview: "Summary",
};

const NEXT_MODE: Partial<Record<RoomMode, RoomMode>> = {
  edit: "publish",
  publish: "group",
  group: "vote",
  vote: "focus",
  focus: "overview",
};

const NEXT_MODE_LABELS: Partial<Record<RoomMode, string>> = {
  edit: "Start Publishing",
  publish: "Start Grouping",
  group: "Start Voting",
  vote: "Start Discussion",
  focus: "View Summary",
};

export function RoomHeader() {
  const { room, users, setMode } = useRoom();
  const { ownerKey } = useUser();

  if (!room) return null;

  const isOwner = !!ownerKey;
  const nextMode = NEXT_MODE[room.mode];
  const nextModeLabel = NEXT_MODE_LABELS[room.mode];

  const handleModeTransition = () => {
    if (nextMode) {
      setMode(nextMode);
    }
  };

  return (
    <header className="room-header">
      <div className="room-header-left">
        <h1>{room.name}</h1>
        <span className="room-mode-badge">{MODE_LABELS[room.mode]}</span>
      </div>
      <div className="room-header-right">
        <span className="user-count">
          {users.length} {users.length === 1 ? "participant" : "participants"}
        </span>
        {isOwner && nextMode && (
          <div className="owner-controls">
            <button className="submit-btn" onClick={handleModeTransition}>
              {nextModeLabel}
            </button>
          </div>
        )}
      </div>
    </header>
  );
}
