import { useEffect, useRef, useState, useCallback } from "react";
import type { ClientMessage, ServerMessage } from "../types";
import { getWebSocketUrl } from "../services/api";

interface UseWebSocketOptions {
  onMessage?: (message: ServerMessage) => void;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Event) => void;
  userId?: string;
  ownerKey?: string;
}

interface UseWebSocketReturn {
  send: (message: ClientMessage) => void;
  isConnected: boolean;
  lastMessage: ServerMessage | null;
  disconnect: () => void;
}

const RECONNECT_DELAY_BASE = 1000;
const RECONNECT_DELAY_MAX = 30000;
const PING_INTERVAL = 20000; // 20 seconds - more aggressive to prevent timeouts

export function useWebSocket(
  roomId: string | null,
  options: UseWebSocketOptions = {}
): UseWebSocketReturn {
  const { onMessage, onConnect, onDisconnect, onError, userId, ownerKey } =
    options;

  const [isConnected, setIsConnected] = useState(false);
  const [lastMessage, setLastMessage] = useState<ServerMessage | null>(null);

  const wsRef = useRef<WebSocket | null>(null);
  const reconnectAttempts = useRef(0);
  const reconnectTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(
    null
  );
  const pingIntervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const messageQueueRef = useRef<ClientMessage[]>([]);
  const shouldReconnect = useRef(true);
  const isCleaningUp = useRef(false);

  // Use refs for callbacks to avoid reconnection when callbacks change
  const onMessageRef = useRef(onMessage);
  const onConnectRef = useRef(onConnect);
  const onDisconnectRef = useRef(onDisconnect);
  const onErrorRef = useRef(onError);

  // Update refs when callbacks change (synchronously during render for immediate availability)
  onMessageRef.current = onMessage;
  onConnectRef.current = onConnect;
  onDisconnectRef.current = onDisconnect;
  onErrorRef.current = onError;

  const clearPingInterval = useCallback(() => {
    if (pingIntervalRef.current) {
      clearInterval(pingIntervalRef.current);
      pingIntervalRef.current = null;
    }
  }, []);

  const clearReconnectTimeout = useCallback(() => {
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
  }, []);

  // Store userId and ownerKey in refs to use during reconnection
  const userIdRef = useRef(userId);
  userIdRef.current = userId;
  const ownerKeyRef = useRef(ownerKey);
  ownerKeyRef.current = ownerKey;

  const connect = useCallback(
    (targetRoomId: string) => {
      if (!targetRoomId || isCleaningUp.current) {
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

      const url = getWebSocketUrl(
        targetRoomId,
        userIdRef.current,
        ownerKeyRef.current
      );
      const ws = new WebSocket(url);

      ws.onopen = () => {
        // Don't proceed if we're cleaning up
        if (isCleaningUp.current) {
          ws.close();
          return;
        }

        setIsConnected(true);
        reconnectAttempts.current = 0;
        onConnectRef.current?.();

        // Send queued messages
        while (messageQueueRef.current.length > 0) {
          const msg = messageQueueRef.current.shift();
          if (msg && ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify(msg));
          }
        }

        // Clear any existing ping interval
        clearPingInterval();

        // Send initial ping immediately to establish keepalive
        if (ws.readyState === WebSocket.OPEN) {
          ws.send(JSON.stringify({ type: "ping" }));
        }

        // Start ping interval to keep connection alive
        pingIntervalRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: "ping" }));
          }
        }, PING_INTERVAL);
      };

      ws.onmessage = (event) => {
        try {
          const message = JSON.parse(event.data) as ServerMessage;
          // Ignore pong messages
          if (message.type === "pong") return;
          setLastMessage(message);
          onMessageRef.current?.(message);
        } catch {
          console.error("Failed to parse WebSocket message");
        }
      };

      ws.onclose = () => {
        setIsConnected(false);

        // Only clear wsRef if it's still pointing to this WebSocket
        if (wsRef.current === ws) {
          wsRef.current = null;
        }

        // Clear ping interval
        clearPingInterval();

        // Don't call disconnect callback or reconnect during cleanup
        if (isCleaningUp.current) {
          return;
        }

        onDisconnectRef.current?.();

        // Attempt reconnection with exponential backoff
        if (shouldReconnect.current && targetRoomId) {
          const delay = Math.min(
            RECONNECT_DELAY_BASE * Math.pow(2, reconnectAttempts.current),
            RECONNECT_DELAY_MAX
          );
          reconnectAttempts.current++;

          clearReconnectTimeout();
          reconnectTimeoutRef.current = setTimeout(() => {
            if (!isCleaningUp.current) {
              connect(targetRoomId);
            }
          }, delay);
        }
      };

      ws.onerror = (error) => {
        if (!isCleaningUp.current) {
          onErrorRef.current?.(error);
        }
      };

      wsRef.current = ws;
    },
    [clearPingInterval, clearReconnectTimeout]
  );

  const disconnect = useCallback(() => {
    isCleaningUp.current = true;
    shouldReconnect.current = false;

    clearReconnectTimeout();
    clearPingInterval();

    if (wsRef.current) {
      // Remove handlers to prevent callbacks during close
      wsRef.current.onopen = null;
      wsRef.current.onmessage = null;
      wsRef.current.onclose = null;
      wsRef.current.onerror = null;

      if (
        wsRef.current.readyState === WebSocket.OPEN ||
        wsRef.current.readyState === WebSocket.CONNECTING
      ) {
        wsRef.current.close();
      }
      wsRef.current = null;
    }

    setIsConnected(false);
  }, [clearReconnectTimeout, clearPingInterval]);

  const send = useCallback((message: ClientMessage) => {
    if (wsRef.current?.readyState === WebSocket.OPEN) {
      wsRef.current.send(JSON.stringify(message));
    } else {
      // Queue message if not connected - will be sent on reconnect
      messageQueueRef.current.push(message);
    }
  }, []);

  useEffect(() => {
    if (roomId) {
      // Reset cleanup flag when connecting
      isCleaningUp.current = false;
      shouldReconnect.current = true;
      reconnectAttempts.current = 0;
      connect(roomId);
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
