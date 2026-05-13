import {useEffect, useRef, useState} from "react";
import {createActiveRoomWebSocketUrl} from "./room.ws";

type RoomSocketStatus =
  | "connecting"
  | "open"
  | "reconnecting"
  | "closed"
  | "error";

type RoomWebSocketOptions = {
  label: string;
  onInvalidSession: () => void;
  onMessage: (event: MessageEvent<string>) => void;
  onOpen?: () => void;
};

const PING_MESSAGE = JSON.stringify({type: "socket.ping"});
const PONG_TYPE = "socket.pong";
const HEARTBEAT_INTERVAL_MS = 25_000;
const HEARTBEAT_TIMEOUT_MS = 10_000;
const RECONNECT_BASE_DELAY_MS = 500;
const RECONNECT_MAX_DELAY_MS = 5_000;

const isPongMessage = (data: string) => {
  try {
    const parsed = JSON.parse(data) as {type?: unknown};
    return parsed.type === PONG_TYPE;
  } catch {
    return false;
  }
};

const getReconnectDelay = (attempt: number) =>
  Math.min(RECONNECT_BASE_DELAY_MS * 2 ** attempt, RECONNECT_MAX_DELAY_MS);

export function useRoomWebSocket({
  label,
  onInvalidSession,
  onMessage,
  onOpen,
}: RoomWebSocketOptions) {
  const [status, setStatus] = useState<RoomSocketStatus>("connecting");
  const callbacksRef = useRef({onInvalidSession, onMessage, onOpen});
  const heartbeatIntervalRef = useRef<number | null>(null);
  const heartbeatTimeoutRef = useRef<number | null>(null);
  const reconnectAttemptRef = useRef(0);
  const reconnectTimeoutRef = useRef<number | null>(null);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    callbacksRef.current = {onInvalidSession, onMessage, onOpen};
  }, [onInvalidSession, onMessage, onOpen]);

  useEffect(() => {
    let closedByHook = false;

    const clearHeartbeat = () => {
      if (heartbeatIntervalRef.current) {
        window.clearInterval(heartbeatIntervalRef.current);
        heartbeatIntervalRef.current = null;
      }

      if (heartbeatTimeoutRef.current) {
        window.clearTimeout(heartbeatTimeoutRef.current);
        heartbeatTimeoutRef.current = null;
      }
    };

    const clearReconnect = () => {
      if (reconnectTimeoutRef.current) {
        window.clearTimeout(reconnectTimeoutRef.current);
        reconnectTimeoutRef.current = null;
      }
    };

    const startHeartbeat = (socket: WebSocket) => {
      clearHeartbeat();

      heartbeatIntervalRef.current = window.setInterval(() => {
        if (socket.readyState !== WebSocket.OPEN) {
          return;
        }

        socket.send(PING_MESSAGE);
        if (heartbeatTimeoutRef.current) {
          window.clearTimeout(heartbeatTimeoutRef.current);
        }

        heartbeatTimeoutRef.current = window.setTimeout(() => {
          console.warn(`${label} websocket heartbeat timed out`);
          socket.close(4000, "Heartbeat timeout");
        }, HEARTBEAT_TIMEOUT_MS);
      }, HEARTBEAT_INTERVAL_MS);
    };

    const connect = () => {
      clearReconnect();
      setStatus(reconnectAttemptRef.current > 0 ? "reconnecting" : "connecting");

      const socket = new WebSocket(createActiveRoomWebSocketUrl());
      socketRef.current = socket;

      socket.onopen = () => {
        reconnectAttemptRef.current = 0;
        setStatus("open");
        startHeartbeat(socket);
        callbacksRef.current.onOpen?.();
      };

      socket.onmessage = (event: MessageEvent<string>) => {
        if (isPongMessage(event.data)) {
          if (heartbeatTimeoutRef.current) {
            window.clearTimeout(heartbeatTimeoutRef.current);
            heartbeatTimeoutRef.current = null;
          }
          return;
        }

        callbacksRef.current.onMessage(event);
      };

      socket.onerror = (event) => {
        console.error(`${label} websocket error`, event);
        setStatus("error");
      };

      socket.onclose = (event) => {
        clearHeartbeat();
        socketRef.current = null;

        if (closedByHook) {
          setStatus("closed");
          return;
        }

        if (event.code === 4001) {
          callbacksRef.current.onInvalidSession();
          return;
        }

        const attempt = reconnectAttemptRef.current;
        reconnectAttemptRef.current = attempt + 1;
        const delay = getReconnectDelay(attempt);
        console.warn(`${label} websocket closed; reconnecting`, {
          code: event.code,
          delay,
          reason: event.reason,
        });
        setStatus("reconnecting");
        reconnectTimeoutRef.current = window.setTimeout(connect, delay);
      };
    };

    connect();

    return () => {
      closedByHook = true;
      clearHeartbeat();
      clearReconnect();

      const socket = socketRef.current;
      if (
        socket?.readyState === WebSocket.CONNECTING ||
        socket?.readyState === WebSocket.OPEN
      ) {
        socket.close();
      }

      socketRef.current = null;
    };
  }, [label]);

  return status;
}
