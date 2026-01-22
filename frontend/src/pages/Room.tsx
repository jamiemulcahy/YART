import { useParams, Link } from "react-router-dom";
import { RoomProvider, useRoom } from "../contexts";
import { RoomHeader } from "../components/RoomHeader";
import { EditMode } from "../components/EditMode";

function RoomContent() {
  const { room, isLoading, isConnected, error } = useRoom();

  if (isLoading) {
    return (
      <div className="room-loading">
        <div className="spinner" />
        <p>Connecting to room...</p>
      </div>
    );
  }

  if (error) {
    return (
      <div className="room-error">
        <p>Error: {error}</p>
        <Link to="/">Return to Home</Link>
      </div>
    );
  }

  if (!room) {
    return (
      <div className="room-error">
        <p>Room not found</p>
        <Link to="/">Return to Home</Link>
      </div>
    );
  }

  return (
    <>
      <RoomHeader />
      <main>
        {!isConnected && (
          <div className="room-loading">
            <div className="spinner" />
            <p>Reconnecting...</p>
          </div>
        )}
        {isConnected && room.mode === "edit" && <EditMode />}
        {isConnected && room.mode === "publish" && (
          <div className="room-loading">
            <p>Publish mode coming soon...</p>
          </div>
        )}
        {isConnected && room.mode === "group" && (
          <div className="room-loading">
            <p>Group mode coming soon...</p>
          </div>
        )}
        {isConnected && room.mode === "vote" && (
          <div className="room-loading">
            <p>Vote mode coming soon...</p>
          </div>
        )}
        {isConnected && room.mode === "focus" && (
          <div className="room-loading">
            <p>Focus mode coming soon...</p>
          </div>
        )}
        {isConnected && room.mode === "overview" && (
          <div className="room-loading">
            <p>Overview mode coming soon...</p>
          </div>
        )}
      </main>
    </>
  );
}

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();

  if (!roomId) {
    return (
      <div className="room-error">
        <p>Invalid room URL</p>
        <Link to="/">Return to Home</Link>
      </div>
    );
  }

  return (
    <div className="room-page">
      <RoomProvider roomId={roomId}>
        <RoomContent />
      </RoomProvider>
    </div>
  );
}
