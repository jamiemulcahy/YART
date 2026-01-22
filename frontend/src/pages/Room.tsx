import { useParams } from "react-router-dom";

export function Room() {
  const { roomId } = useParams<{ roomId: string }>();

  return (
    <div className="room-page">
      <h1>Room: {roomId}</h1>
      <p>Room content will go here.</p>
    </div>
  );
}
