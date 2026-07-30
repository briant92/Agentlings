import { useEffect, useState } from 'react';
import type { JobEvent, ServerMessage, WorldState } from '@agentlings/shared';

const CLIENT_EVENT_CAP = 300;

/** Live world state + job event feed over WebSocket, with a dumb 1s reconnect. */
export function useWorld(): {
  world: WorldState | null;
  connected: boolean;
  events: JobEvent[];
} {
  const [world, setWorld] = useState<WorldState | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<JobEvent[]>([]);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === 'world') {
          setWorld(msg.state);
        } else if (msg.type === 'events') {
          setEvents((prev) => {
            // Replays overlap with what we already have; dedupe by id.
            const byId = new Map(prev.map((e) => [e.id, e]));
            for (const e of msg.events) byId.set(e.id, e);
            return [...byId.values()].sort((a, b) => a.id - b.id).slice(-CLIENT_EVENT_CAP);
          });
        }
      };
      ws.onclose = () => {
        setConnected(false);
        if (!closed) retry = setTimeout(connect, 1000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, []);

  return { world, connected, events };
}
