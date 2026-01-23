import { useState } from "react";
import { Link } from "react-router-dom";
import { useRoom } from "../contexts/RoomContext";
import { useUser } from "../contexts/UserContext";
import type { RoomMode, User } from "../types";

interface ParticipantsModalProps {
  users: User[];
  currentUserId: string | undefined;
  onClose: () => void;
  onRename: (newName: string) => void;
}

function ParticipantsModal({
  users,
  currentUserId,
  onClose,
  onRename,
}: ParticipantsModalProps) {
  const [editingName, setEditingName] = useState(false);
  const [nameInput, setNameInput] = useState("");
  const currentUser = users.find((u) => u.id === currentUserId);

  const handleStartEdit = () => {
    if (currentUser) {
      setNameInput(currentUser.name);
      setEditingName(true);
    }
  };

  const handleSaveEdit = () => {
    const trimmed = nameInput.trim();
    if (trimmed && trimmed !== currentUser?.name) {
      onRename(trimmed);
    }
    setEditingName(false);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter") {
      handleSaveEdit();
    } else if (e.key === "Escape") {
      setEditingName(false);
    }
  };

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
            <li
              key={user.id}
              className={`participant-item${user.id === currentUserId ? " current-user" : ""}`}
            >
              {user.id === currentUserId && editingName ? (
                <input
                  type="text"
                  value={nameInput}
                  onChange={(e) => setNameInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  onBlur={handleSaveEdit}
                  autoFocus
                  className="participant-name-input"
                  maxLength={50}
                  aria-label="Edit your name"
                />
              ) : (
                <>
                  <span
                    className={`participant-name${user.id === currentUserId ? " editable" : ""}`}
                    onClick={
                      user.id === currentUserId ? handleStartEdit : undefined
                    }
                    title={
                      user.id === currentUserId
                        ? "Click to edit your name"
                        : undefined
                    }
                  >
                    {user.name}
                  </span>
                  {user.id === currentUserId && (
                    <>
                      <span className="you-badge">(You)</span>
                      <button
                        className="edit-name-btn"
                        onClick={handleStartEdit}
                        aria-label="Edit your name"
                      >
                        ✎
                      </button>
                    </>
                  )}
                </>
              )}
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

const PREV_MODE: Partial<Record<RoomMode, RoomMode>> = {
  publish: "edit",
  group: "publish",
  vote: "group",
  focus: "vote",
  overview: "focus",
};

const PREV_MODE_LABELS: Partial<Record<RoomMode, string>> = {
  publish: "Back to Setup",
  group: "Back to Publishing",
  vote: "Back to Grouping",
  focus: "Back to Voting",
  overview: "Back to Discussion",
};

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || "githy/yart";
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

function GitHubIcon() {
  return (
    <svg
      width="20"
      height="20"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

export function RoomHeader() {
  const { room, users, setMode, renameUser } = useRoom();
  const { user, ownerKey } = useUser();
  const [copied, setCopied] = useState(false);
  const [showParticipants, setShowParticipants] = useState(false);

  if (!room) return null;

  const isOwner = !!ownerKey;
  const nextMode = NEXT_MODE[room.mode];
  const nextModeLabel = NEXT_MODE_LABELS[room.mode];
  const prevMode = PREV_MODE[room.mode];
  const prevModeLabel = PREV_MODE_LABELS[room.mode];

  const handleModeTransition = () => {
    if (nextMode) {
      setMode(nextMode);
    }
  };

  const handlePreviousMode = () => {
    if (prevMode) {
      setMode(prevMode);
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
        <a
          href={GITHUB_URL}
          target="_blank"
          rel="noopener noreferrer"
          className="github-link"
          aria-label="View source on GitHub"
        >
          <GitHubIcon />
        </a>
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
        {isOwner && (prevMode || nextMode) && (
          <div className="owner-controls">
            {prevMode && (
              <button className="back-btn" onClick={handlePreviousMode}>
                {prevModeLabel}
              </button>
            )}
            {nextMode && (
              <button className="submit-btn" onClick={handleModeTransition}>
                {nextModeLabel}
              </button>
            )}
          </div>
        )}
      </div>
      {showParticipants && (
        <ParticipantsModal
          users={users}
          currentUserId={user?.id}
          onClose={() => setShowParticipants(false)}
          onRename={renameUser}
        />
      )}
    </header>
  );
}
