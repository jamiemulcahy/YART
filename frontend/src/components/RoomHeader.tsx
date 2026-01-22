import { useState } from "react";
import { Link } from "react-router-dom";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { RoomMode, User } from "../types";

interface ParticipantsModalProps {
  users: User[];
  onClose: () => void;
}

function ParticipantsModal({ users, onClose }: ParticipantsModalProps) {
  return (
    <div className="modal-overlay" onClick={onClose}>
      <div
        className="participants-modal"
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-labelledby="participants-title"
      >
        <div className="participants-modal-header">
          <h2 id="participants-title">Participants ({users.length})</h2>
          <button
            className="modal-close-btn"
            onClick={onClose}
            aria-label="Close"
          >
            ×
          </button>
        </div>
        <ul className="participants-list">
          {users.map((user) => (
            <li key={user.id} className="participant-item">
              <span className="participant-name">{user.name}</span>
              {user.isOwner && (
                <span className="participant-badge owner">Owner</span>
              )}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
}

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
  const [copied, setCopied] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  if (!room) return null;

  const isOwner = !!ownerKey;
  const nextMode = NEXT_MODE[room.mode];
  const nextModeLabel = NEXT_MODE_LABELS[room.mode];

  const handleModeTransition = () => {
    if (nextMode) {
      setMode(nextMode);
    }
  };

  const handleShareRoom = async () => {
    try {
      // Copy the full URL to clipboard
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <header className="room-header">
      <div className="room-header-left">
        <Link to="/" className="yart-logo" aria-label="Go to home">
          YART
        </Link>
        <span className="header-divider">|</span>
        <h1>{room.name}</h1>
        <span className="room-mode-badge">{MODE_LABELS[room.mode]}</span>
        <span className={`role-badge ${isOwner ? "owner" : "participant"}`}>
          {isOwner ? "Owner" : "Participant"}
        </span>
      </div>
      <div className="room-header-right">
        <div className="share-room-container">
          <button
            className="share-room-btn"
            onClick={handleShareRoom}
            aria-label="Copy room link"
          >
            <span className="share-icon">&#x1F517;</span>
            {copied ? "Copied!" : "Share room"}
          </button>
          <span
            className="share-info-icon"
            title="Share the room URL or room ID with others to invite them to this retrospective"
          >
            &#x24D8;
          </span>
        </div>
        <button
          className="user-count-btn"
          onClick={() => setShowParticipants(true)}
          aria-label="View participants"
        >
          {users.length} {users.length === 1 ? "participant" : "participants"}
        </button>
        {isOwner && nextMode && (
          <div className="owner-controls">
            <button className="submit-btn" onClick={handleModeTransition}>
              {nextModeLabel}
            </button>
          </div>
        )}
      </div>
      {showParticipants && (
        <ParticipantsModal
          users={users}
          onClose={() => setShowParticipants(false)}
        />
      )}
    </header>
  );
}
