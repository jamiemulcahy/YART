import { useState } from "react";
import { useParams } from "react-router-dom";
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
  const { roomId } = useParams<{ roomId: string }>();
  const { room, users, setMode } = useRoom();
  const { ownerKey } = useUser();
  const [copied, setCopied] = useState(false);

  if (!room) return null;

  const isOwner = !!ownerKey;
  const nextMode = NEXT_MODE[room.mode];
  const nextModeLabel = NEXT_MODE_LABELS[room.mode];

  const handleModeTransition = () => {
    if (nextMode) {
      setMode(nextMode);
    }
  };

  const handleCopyRoomId = async () => {
    if (!roomId) return;
    try {
      await navigator.clipboard.writeText(roomId);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <header className="room-header">
      <div className="room-header-left">
        <h1>{room.name}</h1>
        <span className="room-mode-badge">{MODE_LABELS[room.mode]}</span>
        <button
          className="room-id-copy-btn"
          onClick={handleCopyRoomId}
          title="Copy Room ID to share with others"
        >
          {copied ? "Copied!" : `ID: ${roomId?.slice(0, 8)}...`}
        </button>
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
