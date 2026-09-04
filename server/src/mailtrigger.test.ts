import { describe, expect, it } from 'vitest';
import type { Http } from './library';
import type { Schedule } from './schedules';
import {
  localDay,
  MAX_TRIGGER_FIRES_PER_DAY,
  pollTrigger,
  triggerQuery,
} from './mailtrigger';

/**
 * The mail fake from mail.test.ts: routes by message id, list otherwise —
 * and since D-286 an attachment answers under `att:<id>` and a thread under
 * `thread:<id>`; one Gmail has not been told about is a 404, as Gmail's is.
 */
function fake(routes: Record<string, unknown>): {
  http: Http;
  calls: { url: string }[];
} {
  const calls: { url: string }[] = [];
  const http: Http = async (url) => {
    calls.push({ url });
    const pathname = new URL(url).pathname;
    const att = /\/attachments\/([^/?]+)/.exec(pathname)?.[1];
    const thr = /\/threads\/([^/?]+)/.exec(pathname)?.[1];
    const id = /\/messages\/([^/?]+)/.exec(pathname)?.[1];
    if (att || thr) {
      const hit = routes[att ? `att:${att}` : `thread:${thr}`];
      return {
        ok: hit !== undefined,
        status: hit === undefined ? 404 : 200,
        text: async () => JSON.stringify(hit ?? { error: { message: 'not found' } }),
      };
    }
    return { ok: true, status: 200, text: async () => JSON.stringify(id ? routes[id] : routes.list) };
  };
  return { http, calls };
}

const mint = async () => ({ token: 'access-token' });

const ENV = {
  GOOGLE_OAUTH_CLIENT_ID: 'client-id',
  GOOGLE_OAUTH_CLIENT_SECRET: 'client-secret',
  GOOGLE_OAUTH_REFRESH_TOKEN: 'refresh-token',
};

const NOW = new Date(2026, 7, 24, 12, 0).getTime();

function schedule(over: Partial<Schedule> = {}): Schedule {
  return {
    id: 's1',
    prompt: 'read what arrived',
    trigger: { mail: 'from:banco' },
    triggerState: { sinceMs: NOW - 60_000, seen: [] },
    createdAt: NOW - 3_600_000,
    nextDueAt: 0,
    ...over,
  };
}

function message(id: string, arrivedMs: number, over: Record<string, unknown> = {}) {
  return {
    id,
    threadId: `t-${id}`,
    internalDate: String(arrivedMs),
    payload: {
      mimeType: 'text/plain',
      headers: [
        { name: 'From', value: 'Banco <cartola@banco.cl>' },
        { name: 'Subject', value: 'Estado de cuenta' },
        { name: 'Message-ID', value: `<${id}@banco.cl>` },
      ],
      body: { data: Buffer.from('saldo al día', 'utf8').toString('base64url') },
    },
    ...over,
  };
}

describe('triggerQuery', () => {
  it('always rides -from:me and the watermark — a rule cannot opt out of either', () => {
    expect(triggerQuery('from:banco', 1_756_000_000_000)).toBe(
      'from:banco -from:me after:1756000000',
    );
  });
});

describe('localDay', () => {
  it('is the local calendar day', () => {
    expect(localDay(new Date(2026, 7, 24, 0, 5).getTime())).toBe('2026-08-24');
  });
});

describe('pollTrigger', () => {
  it('refuses without Google, in a sentence the row can show', async () => {
    const { http } = fake({ list: { messages: [] } });
    const got = await pollTrigger(schedule(), NOW, { http, env: {}, mint });
    expect('error' in got && got.error).toContain('Google is not connected');
  });

  it('asks Gmail with the guarded query, never the bare rule', async () => {
    const { http, calls } = fake({ list: { messages: [] } });
    await pollTrigger(schedule(), NOW, { http, env: ENV, mint });
    const q = new URL(calls[0].url).searchParams.get('q')!;
    expect(q).toContain('from:banco');
    expect(q).toContain('-from:me');
    expect(q).toContain('after:');
  });

  it('fires fresh mail oldest first, with the identifiers the reply threads to', async () => {
    const { http } = fake({
      list: { messages: [{ id: 'b' }, { id: 'a' }] },
      a: message('a', NOW - 50_000),
      b: message('b', NOW - 10_000),
    });
    const got = await pollTrigger(schedule(), NOW, { http, env: ENV, mint });
    if ('error' in got) throw new Error(got.error);
    expect(got.fired.map((m) => m.id)).toEqual(['a', 'b']);
    expect(got.fired[0].threadId).toBe('t-a');
    expect(got.fired[0].msgId).toBe('<a@banco.cl>');
    expect(got.fired[0].from).toContain('banco.cl');
    expect(got.fired[0].text).toContain('saldo al día');
    expect(got.sinceMs).toBe(NOW - 10_000);
    expect(got.seen).toEqual(expect.arrayContaining(['a', 'b']));
  });

  // What a firing carries besides the mail (D-286).
  const pdf = (name: string, body: Record<string, unknown>) => ({ mimeType: 'application/pdf', filename: name, body });
  const withParts = (id: string, at: number, parts: unknown[]) =>
    message(id, at, {
      payload: {
        mimeType: 'multipart/mixed',
        headers: [
          { name: 'From', value: 'CPA <cpa@example.com>' },
          { name: 'Subject', value: 'Tax assessment' },
          { name: 'Message-ID', value: `<${id}@example.com>` },
        ],
        parts: [{ mimeType: 'text/plain', body: { data: Buffer.from('see attached', 'utf8').toString('base64url') } }, ...parts],
      },
    });
  const b64 = (s: string) => Buffer.from(s, 'utf8').toString('base64url');

  it("a firing carries the mail's attachments, fetched under the desk caps, and says what stayed behind", async () => {
    const { http, calls } = fake({
      list: { messages: [{ id: 'a' }] },
      a: withParts('a', NOW - 1000, [
        pdf('assessment.pdf', { attachmentId: 'att-1', size: 9 }),
        pdf('scan.zip', { attachmentId: 'att-2', size: 20 * 1024 * 1024 }),
        pdf('mail.txt', { data: b64('not the mail'), size: 12 }),
      ]),
      'att:att-1': { size: 9, data: b64('pdf-bytes') },
    });
    const got = await pollTrigger(schedule(), NOW, { http, env: ENV, mint });
    if ('error' in got) throw new Error(got.error);
    const [fired] = got.fired;
    expect(fired.files.map((f) => [f.name, f.data.toString()])).toEqual([
      ['assessment.pdf', 'pdf-bytes'],
      // The firing's own file name is reserved; the attachment takes a number.
      ['2-mail.txt', 'not the mail'],
    ]);
    expect(fired.text).toContain('Attachments beside this file: assessment.pdf (9 B), 2-mail.txt (12 B)');
    expect(fired.text).toContain('Attachment scan.zip (20.0 MB) — left behind, over 10 MB');
    // The oversize one was never asked for.
    expect(calls.some((c) => c.url.includes('att-2'))).toBe(false);
    expect(fired.text).not.toContain('never fetched');
  });

  it('a firing carries the whole conversation when the mail is not its first message, and nothing when it is', async () => {
    const older = withParts('z', NOW - 90_000, []);
    const { http } = fake({
      list: { messages: [{ id: 'a' }] },
      a: withParts('a', NOW - 1000, []),
      'thread:t-a': { messages: [withParts('a', NOW - 1000, []), older] },
    });
    const got = await pollTrigger(schedule(), NOW, { http, env: ENV, mint });
    if ('error' in got) throw new Error(got.error);
    const [fired] = got.fired;
    expect(fired.thread).toBeDefined();
    expect(fired.thread!.indexOf('message 1 of 2')).toBeLessThan(fired.thread!.indexOf('message 2 of 2'));
    expect(fired.text).toContain('a conversation of 2 messages — the whole thread, oldest first, is in input/thread.txt');

    const alone = fake({
      list: { messages: [{ id: 'a' }] },
      a: withParts('a', NOW - 1000, []),
      'thread:t-a': { messages: [withParts('a', NOW - 1000, [])] },
    });
    const one = await pollTrigger(schedule(), NOW, { http: alone.http, env: ENV, mint });
    if ('error' in one) throw new Error(one.error);
    expect(one.fired[0].thread).toBeUndefined();
    expect(one.fired[0].text).not.toContain('thread.txt');
  });

  it('a file or thread that cannot be fetched is said at the foot of the mail, and the firing still goes', async () => {
    const { http } = fake({
      list: { messages: [{ id: 'a' }] },
      a: withParts('a', NOW - 1000, [pdf('assessment.pdf', { attachmentId: 'att-1', size: 9 })]),
    });
    const got = await pollTrigger(schedule(), NOW, { http, env: ENV, mint });
    if ('error' in got) throw new Error(got.error);
    expect(got.fired).toHaveLength(1);
    expect(got.fired[0].files).toEqual([]);
    expect(got.fired[0].text).toContain('Attachment assessment.pdf — could not be fetched:');
    expect(got.fired[0].text).toContain('The conversation so far could not be read:');
    expect(got.seen).toContain('a');
  });

  it('a message already in the seen ring never fires again', async () => {
    const { http } = fake({
      list: { messages: [{ id: 'a' }, { id: 'b' }] },
      a: message('a', NOW - 50_000),
      b: message('b', NOW - 10_000),
    });
    const got = await pollTrigger(
      schedule({ triggerState: { sinceMs: NOW - 60_000, seen: ['a'] } }),
      NOW,
      { http, env: ENV, mint },
    );
    if ('error' in got) throw new Error(got.error);
    expect(got.fired.map((m) => m.id)).toEqual(['b']);
  });

  it('the daily cap holds, skipped mail is counted and never fires later', async () => {
    const ids = ['a', 'b', 'c'];
    const { http } = fake({
      list: { messages: ids.map((id) => ({ id })) },
      ...Object.fromEntries(ids.map((id, i) => [id, message(id, NOW - (3 - i) * 1000)])),
    });
    const got = await pollTrigger(
      schedule({
        triggerState: {
          sinceMs: NOW - 60_000,
          seen: [],
          day: localDay(NOW),
          count: MAX_TRIGGER_FIRES_PER_DAY - 1,
        },
      }),
      NOW,
      { http, env: ENV, mint },
    );
    if ('error' in got) throw new Error(got.error);
    expect(got.fired).toHaveLength(1);
    expect(got.skippedByCap).toBe(2);
    // Capped ids enter the ring too: past the cap means never, not at midnight.
    expect(got.seen).toEqual(expect.arrayContaining(ids));
  });

  it('yesterday\'s count does not bind today', async () => {
    const { http } = fake({
      list: { messages: [{ id: 'a' }] },
      a: message('a', NOW - 1000),
    });
    const got = await pollTrigger(
      schedule({
        triggerState: {
          sinceMs: NOW - 60_000,
          seen: [],
          day: '2026-08-23',
          count: MAX_TRIGGER_FIRES_PER_DAY,
        },
      }),
      NOW,
      { http, env: ENV, mint },
    );
    if ('error' in got) throw new Error(got.error);
    expect(got.fired).toHaveLength(1);
    expect(got.day).toBe(localDay(NOW));
  });

  // The quiet rule's steady state: Gmail answers a zero-match list as a 204
  // with a zero-byte body (measured 2026-08-24). A poll finding nothing must
  // be a clean empty poll, not an error landing on the row every two minutes.
  it('a quiet mailbox is a clean empty poll, not an error', async () => {
    const http = async () => ({ ok: true, status: 204, text: async () => '' });
    const got = await pollTrigger(schedule(), NOW, { http, env: ENV, mint });
    if ('error' in got) throw new Error(got.error);
    expect(got.fired).toEqual([]);
    expect(got.skippedByCap).toBe(0);
  });

  it('a message Gmail answers without a thread id aborts the poll whole', async () => {
    const { http } = fake({
      list: { messages: [{ id: 'a' }] },
      a: message('a', NOW - 1000, { threadId: undefined }),
    });
    const got = await pollTrigger(schedule(), NOW, { http, env: ENV, mint });
    expect('error' in got && got.error).toContain('thread id');
  });
});
