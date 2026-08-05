import { describe, expect, it } from 'vitest';
import { CHANNELS, emailRaw, executeOutbox, outboxRefusal } from './channels';
import type { Connection } from './connections';

/** A fetch stand-in that records calls and answers from a script. */
function fakeFetch(respond: (url: string) => { ok: boolean; status?: number; body?: unknown }) {
  const calls: { url: string; payload: unknown }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    calls.push({ url, payload: init?.body ? JSON.parse(String(init.body)) : undefined });
    const res = respond(url);
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async () => res.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { fn, calls };
}

describe('the telegram channel', () => {
  it('posts the message to the bot API, chat id and text only', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    await CHANNELS.telegram.send(
      { to: '12345', name: 'Ana', body: 'padel on Thursday' },
      { env: { TELEGRAM_BOT_TOKEN: 'tok' }, fetchFn: fn },
    );
    expect(calls).toHaveLength(1);
    expect(calls[0].url).toBe('https://api.telegram.org/bottok/sendMessage');
    // The display name is for the review card and never reaches the channel.
    expect(calls[0].payload).toEqual({ chat_id: '12345', text: 'padel on Thursday' });
  });

  it('refuses to run without its token', async () => {
    const { fn } = fakeFetch(() => ({ ok: true }));
    await expect(
      CHANNELS.telegram.send({ to: '1', body: 'x' }, { env: {}, fetchFn: fn }),
    ).rejects.toThrow('TELEGRAM_BOT_TOKEN');
  });

  it("surfaces Telegram's own sentence for a refusal", async () => {
    const { fn } = fakeFetch(() => ({
      ok: false,
      status: 400,
      body: { description: 'chat not found' },
    }));
    await expect(
      CHANNELS.telegram.send({ to: '1', body: 'x' }, { env: { TELEGRAM_BOT_TOKEN: 't' }, fetchFn: fn }),
    ).rejects.toThrow('chat not found');
  });

  it('falls back to the HTTP status when the refusal has no sentence', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 502, body: {} }));
    await expect(
      CHANNELS.telegram.send({ to: '1', body: 'x' }, { env: { TELEGRAM_BOT_TOKEN: 't' }, fetchFn: fn }),
    ).rejects.toThrow('HTTP 502');
  });
});

describe('emailRaw', () => {
  const decode = (raw: string) =>
    Buffer.from(raw.replace(/-/g, '+').replace(/_/g, '/'), 'base64').toString('utf8');

  it('is a real RFC 822 message, base64url round-trippable', () => {
    const text = decode(
      emailRaw({ to: 'ana@example.com', subject: 'Padel Thursday', body: 'See you at 9:00' }),
    );
    expect(text).toContain('To: ana@example.com');
    expect(text).toContain('Subject: Padel Thursday');
    expect(text).toContain('charset="UTF-8"');
    expect(text.endsWith('See you at 9:00')).toBe(true);
  });

  it('encodes a subject with accents rather than mangling it', () => {
    const text = decode(emailRaw({ to: 'a@b.c', subject: 'Pádel el jueves', body: 'x' }));
    expect(text).toContain('Subject: =?UTF-8?B?');
    expect(text).not.toContain('Pádel'); // encoded, not raw, in the header
  });

  it('a message without a subject has no Subject header, not an invented one', () => {
    expect(decode(emailRaw({ to: 'a@b.c', body: 'x' }))).not.toContain('Subject:');
  });
});

describe('the gmail channel', () => {
  const ENV = {
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'sec',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'rt',
  };

  /** Scripted responses in call order: the token refresh, then the send. */
  function scripted(responses: { ok: boolean; status?: number; body?: unknown }[]) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      const res = responses[Math.min(calls.length - 1, responses.length - 1)];
      return {
        ok: res.ok,
        status: res.status ?? (res.ok ? 200 : 500),
        json: async () => res.body ?? {},
      };
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('buys one short-lived token, then posts the raw message as the user', async () => {
    const { fn, calls } = scripted([
      { ok: true, body: { access_token: 'at-1' } },
      { ok: true, body: { id: 'm1' } },
    ]);
    await CHANNELS.gmail.send(
      { to: 'ana@example.com', subject: 'Padel', body: 'Thursday 9:00' },
      { env: ENV, fetchFn: fn },
    );
    expect(calls).toHaveLength(2);
    expect(calls[0].url).toBe('https://oauth2.googleapis.com/token');
    expect(calls[1].url).toBe('https://gmail.googleapis.com/gmail/v1/users/me/messages/send');
    const headers = calls[1].init?.headers as Record<string, string>;
    expect(headers.authorization).toBe('Bearer at-1');
    const sent = JSON.parse(String(calls[1].init?.body)) as { raw: string };
    expect(sent.raw).toBe(emailRaw({ to: 'ana@example.com', subject: 'Padel', body: 'Thursday 9:00' }));
  });

  it('refuses to run half-connected', async () => {
    const { fn } = scripted([{ ok: true }]);
    await expect(
      CHANNELS.gmail.send({ to: 'a@b.c', body: 'x' }, { env: {}, fetchFn: fn }),
    ).rejects.toThrow('not connected');
  });

  it("a dead refresh token surfaces the reconnect sentence, and the send never happens", async () => {
    const { fn, calls } = scripted([{ ok: false, status: 400, body: { error: 'invalid_grant' } }]);
    await expect(
      CHANNELS.gmail.send({ to: 'a@b.c', body: 'x' }, { env: ENV, fetchFn: fn }),
    ).rejects.toThrow('Connect Google again');
    expect(calls).toHaveLength(1);
  });

  it("surfaces Gmail's own refusal sentence", async () => {
    const { fn } = scripted([
      { ok: true, body: { access_token: 'at' } },
      { ok: false, status: 403, body: { error: { message: 'Request had insufficient authentication scopes.' } } },
    ]);
    await expect(
      CHANNELS.gmail.send({ to: 'a@b.c', body: 'x' }, { env: ENV, fetchFn: fn }),
    ).rejects.toThrow('insufficient authentication scopes');
  });
});

describe('executeOutbox', () => {
  const outbox = {
    channel: 'telegram',
    messages: [
      { to: '1', body: 'a' },
      { to: '2', body: 'b' },
      { to: '3', body: 'c' },
    ],
  };

  it('skips recipients already sent to — approving twice never messages twice', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    const run = await executeOutbox(outbox, ['1', '3'], {
      env: { TELEGRAM_BOT_TOKEN: 't' },
      fetchFn: fn,
    });
    expect(run).toEqual({ sentTo: ['2'], failed: [] });
    expect(calls).toHaveLength(1);
  });

  it('a failure does not stop the rest, and comes back by recipient', async () => {
    let n = 0;
    const { fn } = fakeFetch(() => {
      n += 1;
      return n === 2 ? { ok: false, status: 400, body: { description: 'chat not found' } } : { ok: true };
    });
    const run = await executeOutbox(outbox, [], { env: { TELEGRAM_BOT_TOKEN: 't' }, fetchFn: fn });
    expect(run.sentTo).toEqual(['1', '3']);
    expect(run.failed).toEqual([{ to: '2', reason: 'chat not found' }]);
  });

  it('answers in the same shape for a channel that does not exist', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    const run = await executeOutbox(
      { channel: 'carrier-pigeon', messages: [{ to: '1', body: 'x' }] },
      [],
      { env: {}, fetchFn: fn },
    );
    expect(run.sentTo).toEqual([]);
    expect(run.failed).toEqual([{ to: '1', reason: 'no channel "carrier-pigeon"' }]);
    expect(calls).toHaveLength(0);
  });
});

/**
 * The gate the resolve route asks before replaying anything. Every refusal
 * must name its fix, because the job stays reviewable behind it.
 */
describe('outboxRefusal', () => {
  const telegram: Connection = {
    name: 'telegram',
    label: 'Send Telegram messages',
    transport: 'builtin',
    tools: [],
    secrets: { TELEGRAM_BOT_TOKEN: 'why' },
  };
  const outbox = { channel: 'telegram', messages: [{ to: '1', body: 'x' }] };
  const TOKEN = { TELEGRAM_BOT_TOKEN: 't' };

  it('refuses a channel that does not exist', () => {
    expect(
      outboxRefusal({ ...outbox, channel: 'carrier-pigeon' }, [telegram], {}, TOKEN),
    ).toContain('no channel');
  });

  it('refuses when the catalog has no connection for the channel', () => {
    expect(outboxRefusal(outbox, [], {}, TOKEN)).toContain('no "telegram" connection');
  });

  it('refuses a missing secret, naming it', () => {
    expect(outboxRefusal(outbox, [telegram], { connections: { telegram: true } }, {})).toContain(
      'TELEGRAM_BOT_TOKEN',
    );
  });

  it('refuses a connection that is switched off — never switched on counts as off', () => {
    expect(outboxRefusal(outbox, [telegram], {}, TOKEN)).toContain('switched off in Settings');
  });

  it('is null when the connection is ready and on', () => {
    expect(outboxRefusal(outbox, [telegram], { connections: { telegram: true } }, TOKEN)).toBeNull();
  });
});
