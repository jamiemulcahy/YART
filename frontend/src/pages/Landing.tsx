import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, checkRoom } from "../services/api";
import { useUser } from "../contexts";

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
