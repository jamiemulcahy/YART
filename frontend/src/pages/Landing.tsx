import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, checkRoom } from "../services/api";
import { useUser } from "../contexts";

const GITHUB_REPO = import.meta.env.VITE_GITHUB_REPO || "githy/yart";
const GITHUB_URL = `https://github.com/${GITHUB_REPO}`;

function GitHubIcon() {
  return (
    <svg
      width="16"
      height="16"
      viewBox="0 0 24 24"
      fill="currentColor"
      aria-hidden="true"
    >
      <path d="M12 0C5.37 0 0 5.37 0 12c0 5.31 3.435 9.795 8.205 11.385.6.105.825-.255.825-.57 0-.285-.015-1.23-.015-2.235-3.015.555-3.795-.735-4.035-1.41-.135-.345-.72-1.41-1.23-1.695-.42-.225-1.02-.78-.015-.795.945-.015 1.62.87 1.845 1.23 1.08 1.815 2.805 1.305 3.495.99.105-.78.42-1.305.765-1.605-2.67-.3-5.46-1.335-5.46-5.925 0-1.305.465-2.385 1.23-3.225-.12-.3-.54-1.53.12-3.18 0 0 1.005-.315 3.3 1.23.96-.27 1.98-.405 3-.405s2.04.135 3 .405c2.295-1.56 3.3-1.23 3.3-1.23.66 1.65.24 2.88.12 3.18.765.84 1.23 1.905 1.23 3.225 0 4.605-2.805 5.625-5.475 5.925.435.375.81 1.095.81 2.22 0 1.605-.015 2.895-.015 3.3 0 .315.225.69.825.57A12.02 12.02 0 0024 12c0-6.63-5.37-12-12-12z" />
    </svg>
  );
}

type Tab = "join" | "create";

export function Landing() {
  const navigate = useNavigate();
  const { setOwnerKey } = useUser();

  // Tab state
  const [activeTab, setActiveTab] = useState<Tab>("join");

  // Create room state
  const [roomName, setRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  // Join room state
  const [joinRoomId, setJoinRoomId] = useState("");
  const [isJoining, setIsJoining] = useState(false);
  const [joinError, setJoinError] = useState<string | null>(null);

  const handleCreateRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!roomName.trim()) {
      setCreateError("Room name is required");
      return;
    }

    setIsCreating(true);
    setCreateError(null);

    try {
      const result = await createRoom(roomName.trim());
      // Store the owner key silently (no modal shown to user)
      setOwnerKey(result.ownerKey, result.roomId);
      // Navigate directly to the room
      navigate(`/room/${result.roomId}`);
    } catch {
      setCreateError("Failed to create room. Please try again.");
    } finally {
      setIsCreating(false);
    }
  };

  const handleJoinRoom = async (e: FormEvent) => {
    e.preventDefault();
    if (!joinRoomId.trim()) {
      setJoinError("Room ID is required");
      return;
    }

    setIsJoining(true);
    setJoinError(null);

    try {
      const result = await checkRoom(joinRoomId.trim());
      if (result.exists) {
        navigate(`/room/${joinRoomId.trim()}`);
      } else {
        setJoinError("Room not found. Please check the ID and try again.");
      }
    } catch {
      setJoinError("Failed to check room. Please try again.");
    } finally {
      setIsJoining(false);
    }
  };

  return (
    <div className="landing-page">
      <h1>YART</h1>
      <p className="tagline">Yet Another Retro Tool</p>
      <p className="description">
        Real-time retrospective facilitation for teams.
      </p>

      <a
        href={GITHUB_URL}
        target="_blank"
        rel="noopener noreferrer"
        className="github-link-landing"
        aria-label="View source on GitHub"
      >
        <GitHubIcon />
        <span>View on GitHub</span>
      </a>

      <div className="landing-card">
        <div className="landing-tabs">
          <button
            className={`landing-tab ${activeTab === "join" ? "active" : ""}`}
            onClick={() => setActiveTab("join")}
            type="button"
          >
            Join Room
          </button>
          <button
            className={`landing-tab ${activeTab === "create" ? "active" : ""}`}
            onClick={() => setActiveTab("create")}
            type="button"
          >
            Create Room
          </button>
        </div>

        <div className="landing-tab-content">
          {activeTab === "join" && (
            <form onSubmit={handleJoinRoom}>
              <div className="form-group">
                <label htmlFor="join-room-id">Room ID</label>
                <input
                  id="join-room-id"
                  type="text"
                  value={joinRoomId}
                  onChange={(e) => setJoinRoomId(e.target.value)}
                  placeholder="Enter room ID"
                  disabled={isJoining}
                />
              </div>
              {joinError && <p className="error-message">{joinError}</p>}
              <button
                type="submit"
                className="submit-btn"
                disabled={isJoining || !joinRoomId.trim()}
              >
                {isJoining ? "Joining..." : "Join Room"}
              </button>
            </form>
          )}

          {activeTab === "create" && (
            <form onSubmit={handleCreateRoom}>
              <div className="form-group">
                <label htmlFor="room-name">Room Name</label>
                <input
                  id="room-name"
                  type="text"
                  value={roomName}
                  onChange={(e) => setRoomName(e.target.value)}
                  placeholder="e.g., Sprint 42 Retro"
                  disabled={isCreating}
                />
              </div>
              {createError && <p className="error-message">{createError}</p>}
              <button
                type="submit"
                className="submit-btn"
                disabled={isCreating || !roomName.trim()}
              >
                {isCreating ? "Creating..." : "Create Room"}
              </button>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
