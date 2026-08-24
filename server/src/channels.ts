import { existsSync, readFileSync } from 'node:fs';
import type { Outbox, OutboxMessage, OutboxTemplate } from '@agentlings/shared';
import { missingSecrets, type Connection } from './connections';
import { accessTokenFromRefresh, base64url } from './google';
import { outboxFilePath } from './outbox';
import { contentTypeFor } from './outputs';
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
  /**
   * The job's sandbox, where a message's `files` bytes live (D-159). The
   * bytes are read here at send — never stored on the job — so what leaves
   * is what the sandbox holds at the moment of Approve, the same moment the
   * reviewer just looked at it.
   */
  dir?: string;
  /**
   * The thread a `reply: true` message threads into (D-248) — supplied by the
   * send site from the job's own `mailTrigger` stamp, never by the session.
   * The one thread a job can reach is the one whose mail queued it.
   */
  mailThread?: { threadId: string; msgId?: string };
}

export interface ChannelClient {
  /** The connection whose Settings switch and secret gate this channel. */
  connection: string;
  send(message: OutboxMessage, deps: ChannelDeps): Promise<void>;
}

const SEND_TIMEOUT_MS = 15_000;
/** File posts get longer: 10 MB on a slow uplink is minutes, not seconds. */
const SEND_FILE_TIMEOUT_MS = 120_000;

/**
 * The bytes a message's `files` name, read from the sandbox at send.
 *
 * The contract verified these existed when the outbox was parsed; a file
 * gone *since* — moved, deleted, a OneDrive hiccup — fails the send with the
 * file's own name, because silently delivering fewer attachments than the
 * review card showed is the review lying.
 */
function readOutboxFiles(
  message: OutboxMessage,
  deps: ChannelDeps,
): { name: string; data: Buffer }[] {
  if (!message.files?.length) return [];
  if (!deps.dir) throw new Error('this message carries files but no sandbox directory was given');
  return message.files.map((name) => {
    const full = outboxFilePath(deps.dir!, name);
    if (!full || !existsSync(full)) {
      throw new Error(`"${name}" is no longer in the sandbox — nothing was sent to this recipient`);
    }
    return { name, data: readFileSync(full) };
  });
}

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
    // Bytes first: a vanished file fails this recipient before any part of
    // the message has moved, so a retry starts from nothing half-delivered.
    const files = readOutboxFiles(message, deps);
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
    /**
     * Each file as its own document under the text (D-159) — never a caption,
     * whose 1024-char cap would refuse bodies the contract's 2000 allows.
     * A failure here throws with the text already delivered, so the whole
     * recipient reads failed and a retry re-sends text and files both: a
     * duplicate message is recoverable at the far end, a missing attachment
     * the card promised is not.
     */
    for (const file of files) {
      const form = new FormData();
      form.append('chat_id', message.to);
      form.append('document', new Blob([new Uint8Array(file.data)]), file.name.split('/').pop()!);
      const sent = await doFetch(`https://api.telegram.org/bot${token}/sendDocument`, {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(SEND_FILE_TIMEOUT_MS),
      });
      if (!sent.ok) {
        let reason = `HTTP ${sent.status}`;
        try {
          const body = (await sent.json()) as { description?: string };
          if (body?.description) reason = body.description;
        } catch {
          // keep the status
        }
        throw new Error(`the message went, then "${file.name}" failed: ${reason}`);
      }
    }
  },
};

/** RFC 2047's encoded word, for header values with anything beyond printable ASCII. */
function encodedWord(value: string): string {
  if (!/[^\x20-\x7e]/.test(value)) return value;
  return `=?UTF-8?B?${Buffer.from(value, 'utf8').toString('base64')}?=`;
}

/**
 * The whole RFC 822 message as text. Without files it is exactly the
 * single-part shape that has sent live since D-080; with them it is
 * multipart/mixed, each file a base64 part under its own name (D-159).
 * Body stays UTF-8 — the API takes bytes, so no transfer encoding is needed —
 * and a message without a subject simply has no Subject header rather than an
 * invented one.
 */
export function emailRfc822(
  message: OutboxMessage,
  files: { name: string; data: Buffer }[] = [],
  /** In-Reply-To/References for a threaded reply (D-248); the caller supplies the original's Message-ID. */
  replyTo?: string,
): string {
  const subject = message.subject ? [`Subject: ${encodedWord(message.subject)}`] : [];
  // Both headers, because that is what mail clients actually thread on —
  // Gmail's threadId places it in the mailbox, these place it everywhere else.
  const threading = replyTo ? [`In-Reply-To: ${replyTo}`, `References: ${replyTo}`] : [];
  if (files.length === 0) {
    return [
      `To: ${message.to}`,
      ...subject,
      ...threading,
      'MIME-Version: 1.0',
      'Content-Type: text/plain; charset="UTF-8"',
      '',
      message.body,
    ].join('\r\n');
  }
  // Deterministic boundary, stepped past any collision with the one part a
  // model writes freely. Base64 parts cannot collide: their alphabet has no
  // '_' and no line of one starts with '--'.
  let boundary = '=_agentlings';
  for (let i = 0; message.body.includes(boundary); i++) boundary = `=_agentlings${i}`;
  const parts = files.flatMap((file) => {
    const leaf = encodedWord(file.name.split('/').pop()!);
    return [
      `--${boundary}`,
      `Content-Type: ${contentTypeFor(file.name)}; name="${leaf}"`,
      `Content-Disposition: attachment; filename="${leaf}"`,
      'Content-Transfer-Encoding: base64',
      '',
      file.data.toString('base64').replace(/(.{76})/g, '$1\r\n'),
    ];
  });
  return [
    `To: ${message.to}`,
    ...subject,
    'MIME-Version: 1.0',
    `Content-Type: multipart/mixed; boundary="${boundary}"`,
    '',
    `--${boundary}`,
    'Content-Type: text/plain; charset="UTF-8"',
    '',
    message.body,
    ...parts,
    `--${boundary}--`,
  ].join('\r\n');
}

/** The Gmail API's `raw` field: the RFC 822 message, base64url-encoded. */
export function emailRaw(message: OutboxMessage, replyTo?: string): string {
  return base64url(Buffer.from(emailRfc822(message, [], replyTo), 'utf8'));
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
    // A reply threads into the mail that queued this job (D-248). The thread
    // comes from the job's own stamp through deps — a job no mail triggered
    // has none, and the refusal names that rather than sending unthreaded.
    if (message.reply && !deps.mailThread) {
      throw new Error('a reply needs the mail this job was triggered by — this job has none');
    }
    const files = readOutboxFiles(message, deps);
    const doFetch = deps.fetchFn ?? fetch;
    const access = await accessTokenFromRefresh({
      clientId,
      clientSecret,
      refreshToken,
      fetchFn: doFetch,
    });
    if ('error' in access) throw new Error(access.error);
    /**
     * Two endpoints on purpose (D-159): the JSON `raw` path is the one that
     * has sent live since D-080 and stays untouched for plain mail; a message
     * with files goes to the media-upload endpoint, whose 35 MB ceiling is
     * what the contract's 15 MB-per-message cap was sized against. One send
     * either way — a failure leaves nothing half-delivered to this recipient.
     */
    const res = files.length
      ? await doFetch(
          'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media',
          {
            method: 'POST',
            headers: {
              authorization: `Bearer ${access.token}`,
              'content-type': 'message/rfc822',
            },
            body: emailRfc822(message, files),
            signal: AbortSignal.timeout(SEND_FILE_TIMEOUT_MS),
          },
        )
      : await doFetch('https://gmail.googleapis.com/gmail/v1/users/me/messages/send', {
          method: 'POST',
          headers: {
            authorization: `Bearer ${access.token}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            raw: emailRaw(
              message,
              message.reply ? deps.mailThread?.msgId : undefined,
            ),
            // threadId is what places the reply in the Gmail conversation;
            // parse already refused reply+files, so only this path threads.
            ...(message.reply && deps.mailThread
              ? { threadId: deps.mailThread.threadId }
              : {}),
          }),
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

/**
 * Slack's Web API answers HTTP 200 with `{ok:false}` on refusals, so the
 * body is the verdict — reading `res.ok` alone would call every failure a
 * success, the same trap as grading the exit code of `head` (D-096). `to`
 * is a channel like #general or a member id; the bot must be invited to a
 * private channel before it can post there, and Slack's own error says so.
 */
const slack: ChannelClient = {
  connection: 'slack',
  async send(message, deps) {
    const token = deps.env.SLACK_BOT_TOKEN;
    if (!token) throw new Error('SLACK_BOT_TOKEN is not set');
    const doFetch = deps.fetchFn ?? fetch;
    const res = await doFetch('https://slack.com/api/chat.postMessage', {
      method: 'POST',
      headers: {
        authorization: `Bearer ${token}`,
        'content-type': 'application/json; charset=utf-8',
      },
      body: JSON.stringify({ channel: message.to, text: message.body }),
      signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const body = (await res.json().catch(() => null)) as {
      ok?: boolean;
      error?: string;
    } | null;
    if (!body?.ok) throw new Error(body?.error ?? 'Slack refused the message');
  },
};

/**
 * RFC3339 carries its own offset; a bare local time gets the machine's own
 * zone — the user said "18:00" meaning their clock, and shipping it zoneless
 * would let Google guess.
 */
export function eventTime(value: string): { dateTime: string; timeZone?: string } {
  const hasOffset = /(?:Z|[+-]\d{2}:?\d{2})$/.test(value);
  return hasOffset
    ? { dateTime: value }
    : { dateTime: value, timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone };
}

/**
 * Google Calendar, on the same consent Gmail rides (D-080 covered
 * calendar.events from the first Connect). One event per outbox by contract;
 * `to` is the calendar id — "primary" in practice — and attendees get
 * Google's own invitation mail via sendUpdates.
 */
const calendar: ChannelClient = {
  connection: 'google',
  async send(message, deps) {
    const clientId = deps.env.GOOGLE_OAUTH_CLIENT_ID;
    const clientSecret = deps.env.GOOGLE_OAUTH_CLIENT_SECRET;
    const refreshToken = deps.env.GOOGLE_OAUTH_REFRESH_TOKEN;
    if (!clientId || !clientSecret || !refreshToken) {
      throw new Error('Google is not connected');
    }
    if (!message.event) {
      throw new Error('a calendar send needs its "event" block — this outbox carries none');
    }
    const doFetch = deps.fetchFn ?? fetch;
    const access = await accessTokenFromRefresh({
      clientId,
      clientSecret,
      refreshToken,
      fetchFn: doFetch,
    });
    if ('error' in access) throw new Error(access.error);
    const res = await doFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${encodeURIComponent(message.to)}/events?sendUpdates=all`,
      {
        method: 'POST',
        headers: {
          authorization: `Bearer ${access.token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({
          summary: message.subject,
          ...(message.body ? { description: message.body } : {}),
          start: eventTime(message.event.start),
          end: eventTime(message.event.end),
          ...(message.event.attendees?.length
            ? { attendees: message.event.attendees.map((email) => ({ email })) }
            : {}),
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

const GITHUB_REF = /^([\w.-]+)\/([\w.-]+)#(\d+)$/;

/**
 * A comment on an issue or PR, posted from the user's own account at
 * approval (D-104). `to` is the reference itself — owner/repo#123 — which
 * is also what makes per-recipient idempotency mean "this comment posts
 * once per thread". Reading stays the connection's seven tools; this is the
 * first write, and it goes through review like every send. Opening a PR is
 * deliberately not here: it needs a pushed branch, which is promote-flow
 * work, not an outbox entry.
 */
const githubComment: ChannelClient = {
  connection: 'github',
  async send(message, deps) {
    const token = deps.env.GITHUB_TOKEN;
    if (!token) throw new Error('GITHUB_TOKEN is not set');
    const ref = GITHUB_REF.exec(message.to);
    if (!ref) throw new Error(`"${message.to}" is not an issue reference like owner/repo#123`);
    const [, owner, repo, number] = ref;
    const doFetch = deps.fetchFn ?? fetch;
    const res = await doFetch(
      `https://api.github.com/repos/${owner}/${repo}/issues/${number}/comments`,
      {
        method: 'POST',
        headers: {
          accept: 'application/vnd.github+json',
          'user-agent': 'agentlings',
          authorization: `Bearer ${token}`,
          'content-type': 'application/json',
        },
        body: JSON.stringify({ body: message.body }),
        signal: AbortSignal.timeout(SEND_TIMEOUT_MS),
      },
    );
    if (!res.ok) {
      let reason = `HTTP ${res.status}`;
      try {
        const body = (await res.json()) as { message?: string };
        if (body?.message) reason = body.message;
      } catch {
        // keep the status
      }
      // GitHub's 404 covers both "no such issue" and "the token cannot see
      // or write here" — say so, because the fix differs and the API won't.
      if (res.status === 404) {
        reason = `${reason} — no such issue, or the token lacks write access to ${owner}/${repo}`;
      }
      throw new Error(reason);
    }
  },
};

export const CHANNELS: Record<string, ChannelClient> = {
  telegram,
  gmail,
  'whatsapp-business': whatsappBusiness,
  slack,
  calendar,
  github: githubComment,
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
  outboxes: Outbox[],
  connections: Connection[],
  settings: StoredSettings,
  env: Record<string, string | undefined>,
): string | null {
  // Every channel or none (D-179): a job sending two ways must not send half
  // and report the other half's reason afterwards, because the half that
  // went cannot be unsent. The first reason is the whole answer.
  for (const outbox of outboxes) {
    const reason = oneOutboxRefusal(outbox, connections, settings, env);
    if (reason) return reason;
  }
  return null;
}

function oneOutboxRefusal(
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
