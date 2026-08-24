import { useEffect, useState } from 'react';
import { SOCKET_LEVEL_GONE, SOCKET_UNAUTHENTICATED } from '@agentlings/shared';
import type { JobEvent, ServerMessage, WorldState } from '@agentlings/shared';
import { sessionEnded } from './api';

const CLIENT_EVENT_CAP = 300;

/**
 * Live world + event feed for one level over WebSocket, with a 1s reconnect.
 *
 * The retry exists for the ordinary case — a dev-server restart drops every
 * socket and they all come back. It is deliberately not used when the server
 * says the level is gone: retrying that forever is how a deleted level left
 * the screen stuck on "connecting…" with no way out but the back button.
 */
export function useWorld(levelId: string): {
  world: WorldState | null;
  connected: boolean;
  events: JobEvent[];
  gone: boolean;
} {
  const [world, setWorld] = useState<WorldState | null>(null);
  const [connected, setConnected] = useState(false);
  const [events, setEvents] = useState<JobEvent[]>([]);
  const [gone, setGone] = useState(false);

  useEffect(() => {
    let ws: WebSocket | null = null;
    let retry: ReturnType<typeof setTimeout> | null = null;
    let closed = false;
    setWorld(null);
    setEvents([]);
    setGone(false);

    const connect = () => {
      const proto = location.protocol === 'https:' ? 'wss' : 'ws';
      ws = new WebSocket(`${proto}://${location.host}/ws?level=${encodeURIComponent(levelId)}`);
      ws.onopen = () => setConnected(true);
      ws.onmessage = (ev) => {
        const msg = JSON.parse(ev.data as string) as ServerMessage;
        if (msg.type === 'world') {
          // A frame carries the job list only when it changed, so keep the
          // last one otherwise. Consumers still see a whole WorldState and
          // never have to know the difference.
          const frame = msg.state;
          setWorld((prev) => ({
            tick: frame.tick,
            agentlings: frame.agentlings,
            jobs: frame.jobs ?? prev?.jobs ?? [],
          }));
        } else if (msg.type === 'events') {
          setEvents((prev) => {
            // Replays overlap with what we already have; dedupe by id.
            const byId = new Map(prev.map((e) => [e.id, e]));
            for (const e of msg.events) byId.set(e.id, e);
            return [...byId.values()].sort((a, b) => a.id - b.id).slice(-CLIENT_EVENT_CAP);
          });
        }
      };
      ws.onclose = (ev) => {
        setConnected(false);
        if (ev.code === SOCKET_LEVEL_GONE) {
          setGone(true);
          return;
        }
        // Not retried either, and for a different reason: the retry would
        // succeed the moment the user signs in, but until then it is a
        // once-a-second handshake that will be refused every time. Hand it to
        // the app instead, which shows the login screen and remounts this.
        if (ev.code === SOCKET_UNAUTHENTICATED) {
          sessionEnded();
          return;
        }
        if (!closed) retry = setTimeout(connect, 1000);
      };
    };
    connect();

    return () => {
      closed = true;
      if (retry) clearTimeout(retry);
      ws?.close();
    };
  }, [levelId]);

  return { world, connected, events, gone };
}
