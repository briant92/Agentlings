import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  CHANNELS,
  emailRaw,
  emailRfc822,
  eventTime,
  executeOutbox,
  outboxRefusal,
  sendPriceUsd,
} from './channels';
import type { Connection } from './connections';

/** A fetch stand-in that records calls and answers from a script. */
function fakeFetch(respond: (url: string) => { ok: boolean; status?: number; body?: unknown }) {
  const calls: { url: string; payload: unknown }[] = [];
  const fn = (async (url: string, init?: RequestInit) => {
    // A document post's body is FormData, kept whole; everything else is JSON.
    calls.push({
      url,
      payload:
        init?.body instanceof FormData
          ? init.body
          : init?.body
            ? JSON.parse(String(init.body))
            : undefined,
    });
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

/**
 * Files riding a telegram message (D-159): the text as sendMessage exactly as
 * before, then each file its own sendDocument — never a caption, whose
 * 1024-char cap would refuse bodies the contract's 2000 allows.
 */
describe('telegram files', () => {
  let dir: string;
  const ENV = { TELEGRAM_BOT_TOKEN: 'tok' };

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-tg-files-'));
    mkdirSync(path.join(dir, 'input'), { recursive: true });
    writeFileSync(path.join(dir, 'report.pdf'), 'pdf bytes');
    writeFileSync(path.join(dir, 'input', 'contract.pdf'), 'contract bytes');
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
  });

  it('sends the text, then each file as a document under its leaf name', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    await CHANNELS.telegram.send(
      { to: '12345', body: 'here you go', files: ['report.pdf', 'input/contract.pdf'] },
      { env: ENV, fetchFn: fn, dir },
    );
    expect(calls.map((c) => c.url)).toEqual([
      'https://api.telegram.org/bottok/sendMessage',
      'https://api.telegram.org/bottok/sendDocument',
      'https://api.telegram.org/bottok/sendDocument',
    ]);
    const first = calls[1].payload as FormData;
    expect(first.get('chat_id')).toBe('12345');
    const doc = first.get('document') as File;
    expect(doc.name).toBe('report.pdf');
    expect(await doc.text()).toBe('pdf bytes'); // the bytes themselves ride
    expect(((calls[2].payload as FormData).get('document') as File).name).toBe('contract.pdf');
  });

  it('a vanished file fails the recipient before anything has moved', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    await expect(
      CHANNELS.telegram.send(
        { to: '1', body: 'x', files: ['ghost.pdf'] },
        { env: ENV, fetchFn: fn, dir },
      ),
    ).rejects.toThrow('no longer in the sandbox');
    expect(calls).toHaveLength(0);
  });

  it('files with no sandbox directory refuse rather than guess', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    await expect(
      CHANNELS.telegram.send({ to: '1', body: 'x', files: ['report.pdf'] }, { env: ENV, fetchFn: fn }),
    ).rejects.toThrow('no sandbox directory');
    expect(calls).toHaveLength(0);
  });

  it('a document refusal names the file and admits the text went', async () => {
    const { fn } = fakeFetch((url) =>
      url.endsWith('/sendDocument')
        ? { ok: false, status: 413, body: { description: 'Request Entity Too Large' } }
        : { ok: true },
    );
    await expect(
      CHANNELS.telegram.send(
        { to: '1', body: 'x', files: ['report.pdf'] },
        { env: ENV, fetchFn: fn, dir },
      ),
    ).rejects.toThrow('the message went, then "report.pdf" failed: Request Entity Too Large');
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

/** The multipart shape a mail with files takes (D-159). */
describe('emailRfc822 with files', () => {
  const FILES = [{ name: 'chart.png', data: Buffer.from('png bytes') }];

  it('without files it is exactly the single-part message emailRaw wraps', () => {
    const message = { to: 'a@b.c', subject: 'Padel', body: 'Thursday' };
    expect(emailRfc822(message)).not.toContain('multipart');
    expect(emailRaw(message)).toContain(
      Buffer.from(emailRfc822(message), 'utf8')
        .toString('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '')
        .slice(0, 20),
    );
  });

  it('with files it is multipart/mixed: the body, then each file base64 under its name', () => {
    const text = emailRfc822({ to: 'a@b.c', subject: 'Padel', body: 'chart attached' }, FILES);
    expect(text).toContain('Content-Type: multipart/mixed; boundary="=_agentlings"');
    expect(text).toContain('chart attached');
    expect(text).toContain('Content-Type: image/png; name="chart.png"');
    expect(text).toContain('Content-Disposition: attachment; filename="chart.png"');
    expect(text).toContain('Content-Transfer-Encoding: base64');
    expect(text).toContain(Buffer.from('png bytes').toString('base64'));
    expect(text.trimEnd().endsWith('--=_agentlings--')).toBe(true);
  });

  it('an input/ forward arrives under its leaf name', () => {
    const text = emailRfc822(
      { to: 'a@b.c', body: 'x' },
      [{ name: 'input/contract.pdf', data: Buffer.from('c') }],
    );
    expect(text).toContain('filename="contract.pdf"');
    expect(text).not.toContain('filename="input/');
  });

  it('a body holding the boundary steps past it rather than truncating the mail', () => {
    const text = emailRfc822({ to: 'a@b.c', body: 'beware --=_agentlings lines' }, FILES);
    expect(text).toContain('boundary="=_agentlings0"');
  });

  it('an accented filename is encoded in the headers, not mangled', () => {
    const text = emailRfc822({ to: 'a@b.c', body: 'x' }, [
      { name: 'niño.pdf', data: Buffer.from('n') },
    ]);
    expect(text).toContain('filename="=?UTF-8?B?');
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

  it('a message with files goes whole to the upload endpoint as rfc822 (D-159)', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agentlings-gm-files-'));
    writeFileSync(path.join(dir, 'report.pdf'), 'pdf bytes');
    try {
      const { fn, calls } = scripted([
        { ok: true, body: { access_token: 'at-1' } },
        { ok: true, body: { id: 'm1' } },
      ]);
      await CHANNELS.gmail.send(
        { to: 'ana@example.com', subject: 'Report', body: 'attached', files: ['report.pdf'] },
        { env: ENV, fetchFn: fn, dir },
      );
      expect(calls[1].url).toBe(
        'https://gmail.googleapis.com/upload/gmail/v1/users/me/messages/send?uploadType=media',
      );
      const headers = calls[1].init?.headers as Record<string, string>;
      expect(headers['content-type']).toBe('message/rfc822');
      const sent = String(calls[1].init?.body);
      expect(sent).toContain('multipart/mixed');
      expect(sent).toContain('filename="report.pdf"');
      expect(sent).toContain(Buffer.from('pdf bytes').toString('base64'));
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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

describe('the whatsapp-business channel', () => {
  const ENV = { WHATSAPP_TOKEN: 'wt', WHATSAPP_PHONE_NUMBER_ID: '123456' };
  const TEMPLATE = { name: 'padel_reminder', language: 'es' };

  function capture(res: { ok: boolean; status?: number; body?: unknown } = { ok: true }) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      calls.push({ url, init });
      return {
        ok: res.ok,
        status: res.status ?? (res.ok ? 200 : 500),
        json: async () => res.body ?? {},
      };
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('posts the template, its language and the params — never the body', async () => {
    const { fn, calls } = capture();
    await CHANNELS['whatsapp-business'].send(
      { to: '+34600111222', params: ['Ana', 'jueves 9:00'], body: 'Hola Ana — pádel el jueves' },
      { env: ENV, fetchFn: fn, template: TEMPLATE },
    );
    expect(calls[0].url).toBe('https://graph.facebook.com/v20.0/123456/messages');
    const sent = JSON.parse(String(calls[0].init?.body)) as {
      to: string;
      type: string;
      template: { name: string; language: { code: string }; components?: unknown[] };
    };
    expect(sent.to).toBe('34600111222'); // the + is Meta's to drop, not ours to send
    expect(sent.type).toBe('template');
    expect(sent.template.name).toBe('padel_reminder');
    expect(sent.template.language.code).toBe('es');
    expect(JSON.stringify(sent)).not.toContain('Hola Ana'); // body is review-only
    expect(JSON.stringify(sent.template.components)).toContain('jueves 9:00');
  });

  it('refuses an outbox with no template rather than inventing a message type', async () => {
    const { fn, calls } = capture();
    await expect(
      CHANNELS['whatsapp-business'].send({ to: '1', body: 'x' }, { env: ENV, fetchFn: fn }),
    ).rejects.toThrow('pre-approved template');
    expect(calls).toHaveLength(0);
  });

  it("surfaces Meta's own refusal sentence", async () => {
    const { fn } = capture({
      ok: false,
      status: 400,
      body: { error: { message: 'Template name does not exist in the translation' } },
    });
    await expect(
      CHANNELS['whatsapp-business'].send(
        { to: '1', params: ['x'], body: 'x' },
        { env: ENV, fetchFn: fn, template: TEMPLATE },
      ),
    ).rejects.toThrow('does not exist in the translation');
  });
});

describe('sendPriceUsd', () => {
  it('is the user’s declared rate, and only that', () => {
    expect(sendPriceUsd('whatsapp-business', { WHATSAPP_USD_PER_MESSAGE: '0.025' })).toBe(0.025);
    expect(sendPriceUsd('whatsapp-business', {})).toBeUndefined();
    expect(sendPriceUsd('whatsapp-business', { WHATSAPP_USD_PER_MESSAGE: 'garbage' })).toBeUndefined();
    expect(sendPriceUsd('whatsapp-business', { WHATSAPP_USD_PER_MESSAGE: '0' })).toBeUndefined();
  });

  it('prices no other channel — telegram and gmail sends cost nothing extra', () => {
    expect(sendPriceUsd('telegram', { WHATSAPP_USD_PER_MESSAGE: '0.025' })).toBeUndefined();
    expect(sendPriceUsd('gmail', { WHATSAPP_USD_PER_MESSAGE: '0.025' })).toBeUndefined();
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

  it('hands the outbox template to every send', async () => {
    const seen: unknown[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      seen.push(JSON.parse(String(init?.body)));
      return { ok: true, status: 200, json: async () => ({}) };
    }) as unknown as typeof fetch;
    const run = await executeOutbox(
      {
        channel: 'whatsapp-business',
        template: { name: 'padel_reminder', language: 'es' },
        messages: [{ to: '1', params: ['Ana'], body: 'x' }],
      },
      [],
      { env: { WHATSAPP_TOKEN: 't', WHATSAPP_PHONE_NUMBER_ID: '9' }, fetchFn: fn },
    );
    expect(run.sentTo).toEqual(['1']);
    expect(JSON.stringify(seen[0])).toContain('padel_reminder');
  });

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

  it('carries the sandbox dir to every send, and a files message without one fails alone', async () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agentlings-exec-files-'));
    writeFileSync(path.join(dir, 'report.pdf'), 'pdf bytes');
    try {
      const { fn } = fakeFetch(() => ({ ok: true }));
      const withFiles = {
        channel: 'telegram',
        messages: [
          { to: '1', body: 'a', files: ['report.pdf'] },
          { to: '2', body: 'b' },
        ],
      };
      const carried = await executeOutbox(withFiles, [], {
        env: { TELEGRAM_BOT_TOKEN: 't' },
        fetchFn: fn,
        dir,
      });
      expect(carried).toEqual({ sentTo: ['1', '2'], failed: [] });
      const { fn: fn2 } = fakeFetch(() => ({ ok: true }));
      const bare = await executeOutbox(withFiles, [], {
        env: { TELEGRAM_BOT_TOKEN: 't' },
        fetchFn: fn2,
      });
      expect(bare.sentTo).toEqual(['2']);
      expect(bare.failed[0].reason).toContain('no sandbox directory');
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
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
  const outbox = [{ channel: 'telegram', messages: [{ to: '1', body: 'x' }] }];
  const TOKEN = { TELEGRAM_BOT_TOKEN: 't' };

  it('refuses a channel that does not exist', () => {
    expect(
      outboxRefusal([{ ...outbox[0], channel: 'carrier-pigeon' }], [telegram], {}, TOKEN),
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

/**
 * Slack answers HTTP 200 with {ok:false} on refusals — the body is the
 * verdict, and reading res.ok alone would grade the wrong thing (D-104,
 * the same trap as the piped exit code in D-096).
 */
describe('the slack channel', () => {
  it('posts channel and text with the bot token', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, body: { ok: true } }));
    await CHANNELS.slack.send(
      { to: '#general', name: 'the team', body: 'launch is live' },
      { env: { SLACK_BOT_TOKEN: 'xoxb-1' }, fetchFn: fn },
    );
    expect(calls[0].url).toBe('https://slack.com/api/chat.postMessage');
    expect(calls[0].payload).toEqual({ channel: '#general', text: 'launch is live' });
  });

  it('reads the refusal out of a 200 body', async () => {
    const { fn } = fakeFetch(() => ({ ok: true, body: { ok: false, error: 'channel_not_found' } }));
    await expect(
      CHANNELS.slack.send({ to: '#nope', body: 'x' }, { env: { SLACK_BOT_TOKEN: 't' }, fetchFn: fn }),
    ).rejects.toThrow('channel_not_found');
  });

  it('refuses to run without its token', async () => {
    const { fn } = fakeFetch(() => ({ ok: true, body: { ok: true } }));
    await expect(
      CHANNELS.slack.send({ to: '#g', body: 'x' }, { env: {}, fetchFn: fn }),
    ).rejects.toThrow('SLACK_BOT_TOKEN');
  });
});

describe('eventTime', () => {
  it('passes an explicit offset through untouched', () => {
    expect(eventTime('2026-08-13T18:00:00Z')).toEqual({ dateTime: '2026-08-13T18:00:00Z' });
    expect(eventTime('2026-08-13T18:00:00-04:00')).toEqual({
      dateTime: '2026-08-13T18:00:00-04:00',
    });
  });

  it('gives a bare local time the machine own zone', () => {
    const got = eventTime('2026-08-13T18:00:00');
    expect(got.dateTime).toBe('2026-08-13T18:00:00');
    expect(got.timeZone).toBe(Intl.DateTimeFormat().resolvedOptions().timeZone);
  });
});

describe('the calendar channel', () => {
  const ENV = {
    GOOGLE_OAUTH_CLIENT_ID: 'id',
    GOOGLE_OAUTH_CLIENT_SECRET: 'sec',
    GOOGLE_OAUTH_REFRESH_TOKEN: 'rt',
  };
  const MESSAGE = {
    to: 'primary',
    subject: 'Dentist',
    body: 'Cleaning, Dr. Soto',
    event: {
      start: '2026-08-13T16:00:00',
      end: '2026-08-13T17:00:00',
      attendees: ['ana@example.com'],
    },
  };

  /** The token call's body is form-encoded, so store init raw and parse per assertion. */
  function scripted(responses: { ok: boolean; status?: number; body?: unknown }[]) {
    const calls: { url: string; init?: RequestInit }[] = [];
    const fn = (async (url: string, init?: RequestInit) => {
      const res = responses[Math.min(calls.length, responses.length - 1)];
      calls.push({ url, init });
      return {
        ok: res.ok,
        status: res.status ?? (res.ok ? 200 : 500),
        json: async () => res.body ?? {},
      };
    }) as unknown as typeof fetch;
    return { fn, calls };
  }

  it('inserts the event on the named calendar, invitations riding', async () => {
    const { fn, calls } = scripted([
      { ok: true, body: { access_token: 'at', expires_in: 3600 } },
      { ok: true, body: { id: 'evt' } },
    ]);
    await CHANNELS.calendar.send(MESSAGE, { env: ENV, fetchFn: fn });
    expect(calls).toHaveLength(2);
    expect(calls[1].url).toContain('/calendars/primary/events');
    expect(calls[1].url).toContain('sendUpdates=all');
    const payload = JSON.parse(String(calls[1].init?.body)) as Record<string, unknown>;
    expect(payload.summary).toBe('Dentist');
    expect(payload.description).toBe('Cleaning, Dr. Soto');
    expect(payload.start).toEqual({
      dateTime: '2026-08-13T16:00:00',
      timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone,
    });
    expect(payload.attendees).toEqual([{ email: 'ana@example.com' }]);
  });

  it('refuses a message with no event block', async () => {
    const { fn } = scripted([{ ok: true, body: { access_token: 'at' } }]);
    await expect(
      CHANNELS.calendar.send({ to: 'primary', subject: 'x', body: 'y' }, { env: ENV, fetchFn: fn }),
    ).rejects.toThrow('"event" block');
  });

  it('refuses to run without the Google connection', async () => {
    const { fn } = scripted([{ ok: true }]);
    await expect(CHANNELS.calendar.send(MESSAGE, { env: {}, fetchFn: fn })).rejects.toThrow(
      'Google is not connected',
    );
  });

  it('surfaces the Google refusal sentence', async () => {
    const { fn } = scripted([
      { ok: true, body: { access_token: 'at' } },
      { ok: false, status: 403, body: { error: { message: 'Calendar usage limits exceeded.' } } },
    ]);
    await expect(CHANNELS.calendar.send(MESSAGE, { env: ENV, fetchFn: fn })).rejects.toThrow(
      'Calendar usage limits exceeded.',
    );
  });
});

describe('the github comment channel', () => {
  it('posts the comment to the issue the reference names', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true, body: { id: 1 } }));
    await CHANNELS.github.send(
      { to: 'briant92/Agentlings#12', body: 'LGTM.' },
      { env: { GITHUB_TOKEN: 'gp' }, fetchFn: fn },
    );
    expect(calls[0].url).toBe(
      'https://api.github.com/repos/briant92/Agentlings/issues/12/comments',
    );
    expect(calls[0].payload).toEqual({ body: 'LGTM.' });
  });

  it('refuses a reference that is not owner-repo-number, before any call', async () => {
    const { fn, calls } = fakeFetch(() => ({ ok: true }));
    await expect(
      CHANNELS.github.send({ to: 'issue 12', body: 'x' }, { env: { GITHUB_TOKEN: 'g' }, fetchFn: fn }),
    ).rejects.toThrow('owner/repo#123');
    expect(calls).toHaveLength(0);
  });

  it('a 404 names both readings — missing issue, or a token that cannot write', async () => {
    const { fn } = fakeFetch(() => ({ ok: false, status: 404, body: { message: 'Not Found' } }));
    await expect(
      CHANNELS.github.send(
        { to: 'briant92/Agentlings#999', body: 'x' },
        { env: { GITHUB_TOKEN: 'g' }, fetchFn: fn },
      ),
    ).rejects.toThrow('lacks write access');
  });

  it('refuses to run without its token', async () => {
    const { fn } = fakeFetch(() => ({ ok: true }));
    await expect(
      CHANNELS.github.send({ to: 'a/b#1', body: 'x' }, { env: {}, fetchFn: fn }),
    ).rejects.toThrow('GITHUB_TOKEN');
  });
});
