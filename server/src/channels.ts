import type { Outbox, OutboxMessage } from '@agentlings/shared';
import { missingSecrets, type Connection } from './connections';
import { connectionEnabled, type StoredSettings } from './settings';

/**
 * Channel clients: what Approve replays a reviewed outbox through (D-075).
 *
 * A channel names the connection whose Settings switch and secret gate it, and
 * the secret reaches only the send call here — never a session, which has no
 * send tool to give it to. Telegram's catalog entry accordingly grants an
 * empty tool list: the connection exists to be switched on and to hold its
 * token, not to put anything in front of a model.
 */
export interface ChannelDeps {
  env: Record<string, string | undefined>;
  /** Injectable for tests; the real one is global fetch. */
  fetchFn?: typeof fetch;
}

export interface ChannelClient {
  /** The connection whose Settings switch and secret gate this channel. */
  connection: string;
  send(message: OutboxMessage, deps: ChannelDeps): Promise<void>;
}

const SEND_TIMEOUT_MS = 15_000;

/**
 * Telegram's Bot API. `to` is a chat id — a bot can only message someone who
 * has tapped Start on it, which is also why this is the safe first channel:
 * the reachable audience is exactly the people who opted in.
 */
const telegram: ChannelClient = {
  connection: 'telegram',
  async send(message, deps) {
    const token = deps.env.TELEGRAM_BOT_TOKEN;
    if (!token) throw new Error('TELEGRAM_BOT_TOKEN is not set');
    const doFetch = deps.fetchFn ?? fetch;
    const res = await doFetch(`https://api.telegram.org/bot${token}/sendMessage`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ chat_id: message.to, text: message.body }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      // Telegram explains refusals well ("chat not found", "bot was blocked
      // by the user") and that sentence is exactly what review should show.
      let reason = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { description?: string };
        if (body?.description) reason = body.description;
      } catch {
        // keep the status
      }
      throw new Error(reason);
    }
  },
};

export const CHANNELS: Record<string, ChannelClient> = { telegram };

/**
 * Why a reviewed outbox may not be sent right now, or null when it may.
 *
 * The gate the resolve route asks before replaying anything: the channel must
 * exist, and the connection that carries its secret must be ready and switched
 * on — the same switch and the same secret rule that gate every credentialed
 * connection (D-005). Every refusal names its fix, because the job stays
 * reviewable behind it and the user's next move should be obvious.
 */
export function outboxRefusal(
  outbox: Outbox,
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): string | null {
  const client = CHANNELS[outbox.channel];
  if (!client) return `no channel "${outbox.channel}" exists`;
  const connection = connections.find((c) => c.name === client.connection);
  if (!connection) {
    return `channel "${outbox.channel}" has no "${client.connection}" connection in the catalog`;
  }
  const missing = missingSecrets(connection, env);
  if (missing.length > 0) {
    return `the "${client.connection}" connection needs ${missing.join(', ')} in .env`;
  }
  if (!connectionEnabled(connection, settings, env)) {
    return `the "${client.connection}" connection is switched off in Settings`;
  }
  return null;
}

export interface OutboxRun {
  sentTo: string[];
  failed: { to: string; reason: string }[];
}

/**
 * Replays an outbox, skipping recipients already sent to — approving twice can
 * never message anyone twice. A failure does not stop the rest: a dead chat id
 * for one recipient is no reason the other two miss their reminder, and the
 * failures come back by recipient so a retry knows exactly what remains.
 */
export async function executeOutbox(
  outbox: Outbox,
  alreadySentTo: readonly string[],
  deps: ChannelDeps,
): Promise<OutboxRun> {
  const run: OutboxRun = { sentTo: [], failed: [] };
  const client = CHANNELS[outbox.channel];
  if (!client) {
    // The resolve route refuses unknown channels before ever calling this;
    // answering in the same shape anyway keeps a second caller honest.
    run.failed = outbox.messages.map((m) => ({
      to: m.to,
      reason: `no channel "${outbox.channel}"`,
    }));
    return run;
  }
  const done = new Set(alreadySentTo);
  for (const message of outbox.messages) {
    if (done.has(message.to)) continue;
    try {
      await client.send(message, deps);
      run.sentTo.push(message.to);
    } catch (err) {
      run.failed.push({
        to: message.to,
        reason: err instanceof Error ? err.message : String(err),
      });
    }
  }
  return run;
}
