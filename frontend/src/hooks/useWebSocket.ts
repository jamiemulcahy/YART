import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientMessage, ServerMessage } from "../types";
import { getWebSocketUrl } from "../services/api";

interface UseWebSocketOptions {
  onMessage?: (message: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
}

interface UseWebSocketReturn {
  send: (message: ClientMessage) => void;
  isConnected: boolean;
  lastMessage: ServerMessage | null;
  disconnect: () => void;
}

const RECONNECT_DELAY_BASE = 1000;
const RECONNECT_DELAY_MAX = 30000;

export function useWebSocket(
  roomId: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { onMessage, onConnect, onDisconnect, onError } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const messageQueueRef = useRef<ClientMessage[]>([]);
  const shouldReconnect = useRef(true);

  const connect = useCallback(() => {
    if (!roomId) {
      return;
    }

    // Check if there's already an open or connecting WebSocket
    const currentWs = wsRef.current;
    if (
      currentWs &&
      (currentWs.readyState === WebSocket.OPEN ||
        currentWs.readyState === WebSocket.CONNECTING)
    ) {
      return;
    }

    const url = getWebSocketUrl(roomId);
    const ws = new WebSocket(url);

    ws.onopen = () => {
      setIsConnected(true);
      reconnectAttempts.current = 0;
      onConnect?.();

      // Send queued messages
      while (messageQueueRef.current.length > 0) {
        const msg = messageQueueRef.current.shift();
        if (msg) {
          ws.send(JSON.stringify(msg));
        }
      }
    };

    ws.onmessage = (event) => {
      try {
        const message = JSON.parse(event.data) as ServerMessage;
        setLastMessage(message);
        onMessage?.(message);
      } catch {
        console.error("Failed to parse WebSocket message");
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      wsRef.current = null;
      onDisconnect?.();

      // Attempt reconnection with exponential backoff
      if (shouldReconnect.current && roomId) {
        const delay = Math.min(
          RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts.current),
          RECONNECT_DELAY_MAX
        );
        reconnectAttempts.current++;

        reconnectTimeoutRef.current = setTimeout(() => {
          connect();
        }, delay);
      }
    };

    ws.onerror = (error) => {
      onError?.(error);
    };

    wsRef.current = ws;
  }, [roomId, onMessage, onConnect, onDisconnect, onError]);

  const disconnect = useCallback(() => {
    shouldReconnect.current = false;

    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }

    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    setIsConnected(false);
  }, []);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Queue message if not connected
      messageQueueRef.current.push(message);
    }
  }, []);

  useEffect(() => {
    if (roomId) {
      shouldReconnect.current = true;
      connect();
    }

    return () => {
      disconnect();
    };
  }, [roomId, connect, disconnect]);

  return {
    send,
    isConnected,
    lastMessage,
    disconnect,
  };
}
