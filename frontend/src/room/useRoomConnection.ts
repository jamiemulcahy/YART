import { useCallback, useEffect, useReducer, useRef } from "react";
import type { ClientMessage, ServerMessage } from "@yart/shared";
import { socketUrl } from "../lib/api";
import { storage } from "../lib/storage";
import { initialState, reducer } from "./state";

const PING_INTERVAL_MS = 30_000;
const MAX_BACKOFF_MS = 10_000;

export interface Connection {
  state: ReturnType<typeof reducer>;
  send: (msg: ClientMessage) => void;
  /** Server clock estimate. */
  now: () => number;
  dismiss: (id: number) => void;
  toast: (message: string) => void;
}

export function useRoomConnection(code: string, enabled: boolean, viewer: boolean): Connection {
  const [state, dispatch] = useReducer(reducer, initialState);
  const wsRef = useRef<WebSocket | null>(null);
  // Offset estimate from the lowest-latency ping we've seen.
  const clock = useRef({ offset: 0, rtt: Infinity });

  useEffect(() => {
    if (!enabled) return;
    let stopped = false;
    let attempt = 0;
    let retryTimer: ReturnType<typeof setTimeout> | undefined;
    let pingTimer: ReturnType<typeof setInterval> | undefined;

    const ping = (ws: WebSocket) => {
      if (ws.readyState === WebSocket.OPEN) ws.send(JSON.stringify({ t: "ping", c: Date.now() }));
    };

    const connect = () => {
      dispatch({ type: "status", status: attempt === 0 ? "connecting" : "reconnecting" });
      const ws = new WebSocket(socketUrl(code));
      wsRef.current = ws;

      ws.onopen = () => {
        const hello: ClientMessage = {
          t: "hello",
          token: storage.token(code) ?? undefined,
          ownerKey: storage.ownerKey(code) ?? undefined,
          viewer,
        };
        ws.send(JSON.stringify(hello));
        clock.current.rtt = Infinity;
        for (let i = 0; i < 3; i++) setTimeout(() => ping(ws), i * 300);
        pingTimer = setInterval(() => ping(ws), PING_INTERVAL_MS);
      };

      ws.onmessage = (event) => {
        let msg: ServerMessage;
        try {
          msg = JSON.parse(String(event.data)) as ServerMessage;
        } catch {
          return;
        }
        if (msg.t === "welcome") {
          attempt = 0;
          if (msg.token) storage.setToken(code, msg.token);
          const rough = msg.serverTime - Date.now();
          if (clock.current.rtt === Infinity) clock.current.offset = rough;
        } else if (msg.t === "pong") {
          const now = Date.now();
          const rtt = now - msg.c;
          if (rtt <= clock.current.rtt) {
            clock.current = { rtt, offset: msg.s - (msg.c + rtt / 2) };
          }
          return;
        }
        dispatch({ type: "server", msg });
      };

      ws.onclose = (event) => {
        clearInterval(pingTimer);
        if (wsRef.current === ws) wsRef.current = null;
        if (stopped) return;
        if (event.code === 4404) {
          dispatch({ type: "status", status: "deleted" });
          return;
        }
        if (event.code === 4003) {
          dispatch({ type: "status", status: "full" });
          return;
        }
        attempt++;
        dispatch({ type: "status", status: "reconnecting" });
        const delay =
          Math.min(MAX_BACKOFF_MS, 400 * 2 ** Math.min(attempt, 6)) * (0.75 + Math.random() * 0.5);
        retryTimer = setTimeout(connect, delay);
      };
    };

    connect();

    // Reconnect promptly when the tab comes back or the network returns.
    const kick = () => {
      if (!wsRef.current && !stopped) {
        clearTimeout(retryTimer);
        connect();
      }
    };
    window.addEventListener("online", kick);
    document.addEventListener("visibilitychange", kick);

    return () => {
      stopped = true;
      clearTimeout(retryTimer);
      clearInterval(pingTimer);
      window.removeEventListener("online", kick);
      document.removeEventListener("visibilitychange", kick);
      wsRef.current?.close(1000);
      wsRef.current = null;
    };
  }, [code, enabled, viewer]);

  const send = useCallback((msg: ClientMessage) => {
    const ws = wsRef.current;
    if (ws && ws.readyState === WebSocket.OPEN) {
      ws.send(JSON.stringify(msg));
    } else if (msg.t !== "battle.input") {
      dispatch({ type: "toast", message: "Not connected — reconnecting…" });
    }
  }, []);

  const now = useCallback(() => Date.now() + clock.current.offset, []);
  const dismiss = useCallback((id: number) => dispatch({ type: "dismiss", id }), []);
  const toast = useCallback((message: string) => dispatch({ type: "toast", message }), []);

  return { state, send, now, dismiss, toast };
}
