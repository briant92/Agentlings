import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { performOutboxSend, type OutboxSendOpts } from './outboxsend';
import { readSends } from './sends';

/**
 * The race that shipped a PDF twice (D-160): two Approves one second apart
 * both read an unstamped `outboxSent` and both sent — the send in the middle
 * of read → send → stamp takes real seconds, and nothing serialized the
 * sequence. These tests hold the one door to its claim: concurrent entry
 * refused, sequential retry open, failure never locking the door.
 */

/** A fetch stand-in that answers after a delay, so the send has a real window. */
function fakeFetch(
  respond: (url: string) => { ok: boolean; status?: number; body?: unknown },
  delayMs = 0,
) {
  let calls = 0;
  const fn = (async (url: string) => {
    calls += 1;
    if (delayMs > 0) await new Promise((resolve) => setTimeout(resolve, delayMs));
    const res = respond(url);
    return {
      ok: res.ok,
      status: res.status ?? (res.ok ? 200 : 500),
      json: async () => res.body ?? {},
    };
  }) as unknown as typeof fetch;
  return { fn, count: () => calls };
}

describe('performOutboxSend', () => {
  let dir: string;
  let root: string;
  /** The job's stamp, exactly as the queue keeps it — grown by `record`. */
  let stamped: string[];

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-door-sandbox-'));
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-door-root-'));
    stamped = [];
  });

  afterEach(async () => {
    await rm(dir, { recursive: true, force: true });
    await rm(root, { recursive: true, force: true });
  });

  const opts = (fetchFn: typeof fetch, over: Partial<OutboxSendOpts> = {}): OutboxSendOpts => ({
    outbox: { channel: 'telegram', messages: [{ to: '1', name: 'Ana', body: 'the words' }] },
    jobId: 'j1',
    levelId: 'hq',
    dir,
    sandboxRoot: root,
    env: { TELEGRAM_BOT_TOKEN: 't' },
    alreadySent: () => stamped,
    record: (run) => {
      stamped = [...new Set([...stamped, ...run.sentTo])];
    },
    fetchFn,
    ...over,
  });

  it('two concurrent Approves send once — the second is refused by the claim', async () => {
    const { fn, count } = fakeFetch(() => ({ ok: true }), 50);
    const shared = opts(fn);
    const [a, b] = await Promise.all([performOutboxSend(shared), performOutboxSend(shared)]);
    const runs = [a, b].filter(Boolean);
    expect(runs).toHaveLength(1);
    expect(runs[0]!.sentTo).toEqual(['1']);
    expect(count()).toBe(1);
    // The audit shows one send, because one send happened.
    expect(readSends(root)).toHaveLength(1);
    expect(stamped).toEqual(['1']);
  });

  it('the claim releases on finish — a later Approve enters and skips the stamped', async () => {
    const { fn, count } = fakeFetch(() => ({ ok: true }));
    const shared = opts(fn);
    await performOutboxSend(shared);
    const again = await performOutboxSend(shared);
    expect(again).not.toBeNull(); // entered — the door is not locked
    expect(again!.sentTo).toEqual([]); // but the stamp, read under the claim, skips them
    expect(count()).toBe(1);
    expect(readSends(root)).toHaveLength(1);
  });

  it('the claim releases on failure — the retry door stays open', async () => {
    let attempt = 0;
    const { fn } = fakeFetch(() => {
      attempt += 1;
      return attempt === 1
        ? { ok: false, status: 400, body: { description: 'chat not found' } }
        : { ok: true };
    });
    const shared = opts(fn);
    const first = await performOutboxSend(shared);
    expect(first!.failed).toEqual([{ to: '1', reason: 'chat not found' }]);
    const second = await performOutboxSend(shared);
    expect(second).not.toBeNull();
    expect(second!.sentTo).toEqual(['1']);
    const audit = readSends(root);
    expect(audit.map((r) => r.ok)).toEqual([false, true]);
  });

  it('different jobs never block each other', async () => {
    const { fn, count } = fakeFetch(() => ({ ok: true }), 50);
    const [a, b] = await Promise.all([
      performOutboxSend(opts(fn)),
      performOutboxSend(opts(fn, { jobId: 'j2' })),
    ]);
    expect(a).not.toBeNull();
    expect(b).not.toBeNull();
    expect(count()).toBe(2);
  });

  it('the audit row records what rode: name, body and files (D-159)', async () => {
    writeFileSync(path.join(dir, 'report.pdf'), 'pdf bytes');
    const { fn } = fakeFetch(() => ({ ok: true }));
    await performOutboxSend(
      opts(fn, {
        outbox: {
          channel: 'telegram',
          messages: [{ to: '1', name: 'Ana', body: 'here', files: ['report.pdf'] }],
        },
      }),
    );
    const [row] = readSends(root);
    expect(row).toMatchObject({
      jobId: 'j1',
      levelId: 'hq',
      channel: 'telegram',
      to: '1',
      name: 'Ana',
      body: 'here',
      files: ['report.pdf'],
      ok: true,
    });
  });
});
