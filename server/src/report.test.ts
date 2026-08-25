import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { outboxBodyCap, type Job } from '@agentlings/shared';
import { sendToId } from './clarify';
import { ledgerFile } from './ledger';
import { OUTBOX_FILE } from './outbox';
import { JobQueue } from './queue';
import { formatRealWork, lastFullWeek, realWork, type RealWorkBlock } from './realwork';
import { fireRealWork, REALWORK_PROMPT, scoreBlock } from './report';

/** Local midnight, the way a week starts on this machine. */
const day = (y: number, m: number, d: number, h = 0) => new Date(y, m - 1, d, h).getTime();
// Tuesday 2026-08-25: the last full week is Monday the 17th to Monday the 24th.
const NOW = day(2026, 8, 25, 8);
const WINDOW = lastFullWeek(NOW);

const EMPTY: RealWorkBlock = realWork(WINDOW, [], [], []);

/** A block whose text cannot fit `channel` — one row per level, sixty levels. */
function oversized(channel: string): RealWorkBlock {
  const block = realWork(
    WINDOW,
    Array.from({ length: 60 }, (_, i) => ({
      id: `level-${String(i).padStart(2, '0')}-with-a-long-name`,
      jobs: [
        {
          id: `j${i}`,
          title: 't',
          prompt: 'x',
          status: 'promoted',
          slot: -1,
          createdAt: WINDOW.start,
          resolvedAt: WINDOW.start + 1000,
          resolvedBy: 'you',
        } satisfies Job,
      ],
    })),
    [],
    [],
  );
  expect(formatRealWork(block).length).toBeGreaterThan(outboxBodyCap(channel));
  return block;
}

describe('fireRealWork', () => {
  let root: string;
  let queue: JobQueue;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-report-'));
    queue = new JobQueue(root);
  });

  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const row = { channel: 'telegram', answers: { [sendToId('telegram')]: '8633678680' } };

  it('lands a done job whose outbox body is the block, at $0 and zero turns, holding no door', () => {
    const job = fireRealWork(queue, row, EMPTY, NOW);
    const stored = queue.get(job.id)!;
    expect(stored.status).toBe('done');
    expect(stored.prompt).toBe(REALWORK_PROMPT);
    expect(stored.channels).toEqual(['telegram']);
    expect(stored.outbox).toEqual([
      { channel: 'telegram', messages: [{ to: '8633678680', body: formatRealWork(EMPTY) }] },
    ]);
    expect(stored.outboxError).toBeUndefined();
    expect(stored.meter).toMatchObject({ costUsd: 0, turns: 0, turnsAllowed: 0 });
    expect(stored.meter?.routed).toBeUndefined();
    // Absent is "sandbox only" — the one reading every forwarder makes of it.
    expect(stored.tools ?? []).toEqual([]);
    expect(stored.assignedTo).toBeUndefined();
    expect(stored.summary).toMatch(/real work/);
  });

  it('writes the outbox into the sandbox as the file a session would have written', () => {
    const job = fireRealWork(queue, row, EMPTY, NOW);
    const file = path.join(queue.sandboxDir(job.id), OUTBOX_FILE);
    expect(existsSync(file)).toBe(true);
    expect(JSON.parse(readFileSync(file, 'utf8'))).toEqual({
      channel: 'telegram',
      messages: [{ to: '8633678680', body: formatRealWork(EMPTY) }],
    });
  });

  it('splits a picker-shaped recipient the way the desk does', () => {
    const job = fireRealWork(
      queue,
      { channel: 'telegram', answers: { [sendToId('telegram')]: 'Brian — 8633678680' } },
      EMPTY,
      NOW,
    );
    expect(queue.get(job.id)!.outbox![0].messages[0]).toMatchObject({
      to: '8633678680',
      name: 'Brian',
    });
  });

  it("refuses a body over the channel's own cap, in the contract's words, and queues nothing", () => {
    expect(() => fireRealWork(queue, row, oversized('telegram'), NOW)).toThrow(
      /"body" is \d+ characters — telegram's limit is 4096/,
    );
    expect(queue.list()).toEqual([]);
  });

  it('refuses a row with no channel or no recipient, and queues nothing', () => {
    expect(() => fireRealWork(queue, { answers: row.answers }, EMPTY, NOW)).toThrow(/channel/);
    expect(() => fireRealWork(queue, { channel: 'telegram' }, EMPTY, NOW)).toThrow(/recipient/);
    expect(queue.list()).toEqual([]);
  });
});

describe('scoreBlock', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-score-'));
  });

  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('reads every level on disk, the ledger and the refusals, for the last full week', () => {
    const level = path.join(root, 'levels', 'hq');
    mkdirSync(level, { recursive: true });
    writeFileSync(
      path.join(level, 'level.json'),
      JSON.stringify({ id: 'hq', name: 'HQ', project: 'p', theme: 'jungle-dusk', createdAt: 1 }),
    );
    const promoted: Job = {
      id: 'j1',
      title: 't',
      prompt: 'x',
      status: 'promoted',
      slot: -1,
      createdAt: WINDOW.start,
      finishedAt: WINDOW.start + 1000,
      resolvedAt: WINDOW.start + 2000,
      resolvedBy: 'you',
    };
    writeFileSync(path.join(level, 'jobs.json'), JSON.stringify([promoted]));
    writeFileSync(
      ledgerFile(root),
      `${JSON.stringify({ at: WINDOW.start + 500, jobId: 'j1', levelId: 'hq', jobClass: 'worker', tier: 'session', outcome: 'done', costUsd: 0.5, priceUsd: 0.5 })}\n`,
    );
    writeFileSync(
      path.join(root, 'refusals.jsonl'),
      `${JSON.stringify({ at: WINDOW.start + 600, levelId: 'hq', key: 'money' })}\n`,
    );
    const block = scoreBlock(root, NOW);
    expect(block.window).toEqual(WINDOW);
    expect(block.levels).toEqual([
      {
        levelId: 'hq',
        name: 'HQ',
        promoted: 1,
        autoSent: 0,
        discarded: 0,
        failed: 0,
        awaiting: 0,
        spentUsd: 0.5,
        refusals: { money: 1 },
      },
    ]);
  });

  it('is the empty block on a root with nothing in it', () => {
    expect(scoreBlock(root, NOW)).toEqual(EMPTY);
  });
});
