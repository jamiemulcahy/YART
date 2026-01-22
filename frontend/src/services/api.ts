const API_URL = import.meta.env.VITE_API_URL || "http://localhost:8787";

export interface CreateRoomResponse {
  roomId: string;
  ownerKey: string;
}

export interface CheckRoomResponse {
  exists: boolean;
  name?: string;
}

export async function createRoom(name: string): Promise<CreateRoomResponse> {
  const response = await fetch(`${API_URL}/api/rooms`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ name }),
  });

  if (!response.ok) {
    throw new Error("Failed to create room");
  }

  return response.json();
}

export async function checkRoom(roomId: string): Promise<CheckRoomResponse> {
  const response = await fetch(`${API_URL}/api/rooms/${roomId}`);

  if (!response.ok) {
    throw new Error("Failed to check room");
  }

  return response.json();
}

export function getWebSocketUrl(roomId: string): string {
  const wsProtocol = API_URL.startsWith("https") ? "wss" : "ws";
  const wsHost = API_URL.replace(/^https?:\/\//, "");
  return `${wsProtocol}://${wsHost}/api/rooms/${roomId}/ws`;
}
