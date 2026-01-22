import { useState, type FormEvent } from "react";
import { useNavigate } from "react-router-dom";
import { createRoom, checkRoom } from "../services/api";
import { useUser } from "../contexts";

interface OwnerKeyModalProps {
  roomId: string;
  ownerKey: string;
  onClose: () => void;
}

function OwnerKeyModal({ roomId, ownerKey, onClose }: OwnerKeyModalProps) {
  const [copiedField, setCopiedField] = useState<"roomId" | "ownerKey" | null>(
    null
  );

  const copyToClipboard = async (
    text: string,
    field: "roomId" | "ownerKey"
  ) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopiedField(field);
      setTimeout(() => setCopiedField(null), 2000);
    } catch {
      // Clipboard API not available
    }
  };

  return (
    <div className="modal-overlay" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <h2>Room Created Successfully!</h2>
        <p>Your room has been created. Save the information below:</p>

        <div className="owner-key-display">
          <label>Room ID (share with participants)</label>
          <div className="owner-key-value">
            <code>{roomId}</code>
            <button
              className="copy-btn"
              onClick={() => copyToClipboard(roomId, "roomId")}
            >
              {copiedField === "roomId" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="owner-key-display">
          <label>Owner Key (keep this secret!)</label>
          <div className="owner-key-value">
            <code>{ownerKey}</code>
            <button
              className="copy-btn"
              onClick={() => copyToClipboard(ownerKey, "ownerKey")}
            >
              {copiedField === "ownerKey" ? "Copied!" : "Copy"}
            </button>
          </div>
        </div>

        <div className="warning">
          <p>
            <strong>Important:</strong> The owner key cannot be recovered. Save
            it somewhere safe to maintain control of your room.
          </p>
        </div>

        <div className="modal-actions">
          <button className="submit-btn" onClick={onClose}>
            Enter Room
          </button>
        </div>
      </div>
    </div>
  );
}

export function Landing() {
  const navigate = useNavigate();
  const { setOwnerKey } = useUser();

  // Create room state
  const [roomName, setRoomName] = useState("");
  const [isCreating, setIsCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);
  const [createdRoom, setCreatedRoom] = useState<{
    roomId: string;
    ownerKey: string;
  } | null>(null);

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
      setCreatedRoom(result);
      // Store the owner key
      setOwnerKey(result.ownerKey, result.roomId);
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

  const handleModalClose = () => {
    if (createdRoom) {
      navigate(`/room/${createdRoom.roomId}`);
    }
  };

  return (
    <div className="landing-page">
      <h1>YART</h1>
      <p className="tagline">Yet Another Retro Tool</p>
      <p className="description">
        Real-time retrospective facilitation for teams.
      </p>

      <div className="landing-sections">
        <div className="landing-section">
          <h2>Join a Room</h2>
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
        </div>

        <div className="landing-section">
          <h2>Create a Room</h2>
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
        </div>
      </div>

      {createdRoom && (
        <OwnerKeyModal
          roomId={createdRoom.roomId}
          ownerKey={createdRoom.ownerKey}
          onClose={handleModalClose}
        />
      )}
    </div>
  );
}
