import type { Outbox, OutboxMessage, OutboxTemplate } from '@agentlings/shared';
import { missingSecrets, type Connection } from './connections';
import { accessTokenFromRefresh, base64url } from './google';
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
  /** The outbox's template, for template-shaped channels; set by executeOutbox. */
  template?: OutboxTemplate;
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

/** RFC 2047, for a subject with anything beyond printable ASCII in it. */
function subjectHeader(subject: string): string {
  if (!/[^\x20-\x7e]/.test(subject)) return `Subject: ${subject}`;
  return `Subject: =?UTF-8?B?${Buffer.from(subject, 'utf8').toString('base64')}?=`;
}

/**
 * The Gmail API's `raw` field: the whole RFC 822 message, base64url-encoded.
 * Body stays UTF-8 — the API takes bytes, so no transfer encoding is needed —
 * and a message without a subject simply has no Subject header rather than an
 * invented one.
 */
export function emailRaw(message: OutboxMessage): string {
  const lines = [
    `To: ${message.to}`,
    ...(message.subject ? [subjectHeader(message.subject)] : []),
    'MIME-Version: 1.0',
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    message.body,
  ];
  return base64url(Buffer.from(lines.join('\r\n'), 'utf8'));
}

/**
 * Gmail, through the user's own OAuth client (D-076, D-080). `to` is an email
 * address, and the mail arrives from the user's own account — the one channel
 * that sends *as* them. The refresh token buys a short-lived access token per
 * send and nothing is kept.
 */
const gmail: ChannelClient = {
  connection: 'google',
  async send(message, deps) {
    const clientId = deps.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = deps.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = deps.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google is not connected');
    }
    const doFetch = deps.fetchFn ?? fetch;
    const access = await accessTokenFromRefresh({
      clientId,
      clientSecret,
      refreshToken,
      fetchFn: doFetch,
    });
    if ('error' in access) throw new Error(access.error);
    const res = await doFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${access.token}`,
        'content-type': 'application/json',
      },
      body: JSON.stringify({ raw: emailRaw(message) }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) reason = body.error.message;
      } catch {
        // keep the status
      }
      throw new Error(reason);
    }
  },
};

const GRAPH_VERSION = 'v20.0';

/**
 * WhatsApp Business Cloud API (D-081). Business-initiated messages are
 * pre-approved templates — Meta owns the template's text, so what travels is
 * the template name, its language and the per-recipient parameters, all of
 * which review shows. `to` is the recipient's number with country code.
 */
const whatsappBusiness: ChannelClient = {
  connection: 'whatsapp-business',
  async send(message, deps) {
    const token = deps.env.WHATSAPP_TOKEN;
    const phoneNumberId = deps.env.WHATSAPP_PHONE_NUMBER_ID;
    if (!token || !phoneNumberId) throw new Error('WhatsApp Business is not connected');
    if (!deps.template) {
      throw new Error('WhatsApp sends need a pre-approved template — this outbox carries none');
    }
    const doFetch = deps.fetchFn ?? fetch;
    const res = await doFetch(
      `https://graph.facebook.com/${GRAPH_VERSION}/${phoneNumberId}/messages`,
      {
        method: 'POST',
        headers: { authorization: `Bearer ${token}`, 'content-type': 'application/json' },
        body: JSON.stringify({
          messaging_product: 'whatsapp',
          to: message.to.replace(/^\+/, ''),
          type: 'template',
          template: {
            name: deps.template.name,
            language: { code: deps.template.language },
            ...(message.params?.length
              ? {
                  components: [
                    {
                      type: 'body',
                      parameters: message.params.map((text) => ({ type: 'text', text })),
                    },
                  ],
                }
              : {}),
          },
        }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { error?: { message?: string } };
        if (body?.error?.message) reason = body.error.message;
      } catch {
        // keep the status
      }
      throw new Error(reason);
    }
  },
};

export const CHANNELS: Record<string, ChannelClient> = {
  telegram,
  gmail,
  'whatsapp-business': whatsappBusiness,
};

/**
 * What one send costs on this channel, when the user has declared their rate.
 *
 * Meta prices per delivered template by category and country and does not
 * say so in the send response — the true figure lives in their webhooks and
 * invoices. So this is deliberately the user's own declared figure
 * (`WHATSAPP_USD_PER_MESSAGE`, from their rate card), stamped on the audit
 * as such, and nothing is recorded when they have declared none: a guessed
 * price in an audit file is worse than an absent one (D-081).
 */
export function sendPriceUsd(
  channel: string,
  env: Record<string, string | undefined>,
): number | undefined {
  if (channel !== 'whatsapp-business') return undefined;
  const rate = Number(env.WHATSAPP_USD_PER_MESSAGE);
  return Number.isFinite(rate) && rate > 0 ? rate : undefined;
}

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
  const perSend: ChannelDeps = { ...deps, template: outbox.template };
  for (const message of outbox.messages) {
    if (done.has(message.to)) continue;
    try {
      await client.send(message, perSend);
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
