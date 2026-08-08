import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import type { SendApproval } from './approvals';
import {
  closeBlocker,
  closeLevelFiles,
  closePreview,
  describeClosedLevel,
  listClosedLevels,
  reopenLevelFiles,
} from './close';
import { createLevelFiles, levelDir, readMeta } from './levels';
import { readSchedules, schedulesFile, type Schedule } from './schedules';

const job = (id: string, status: Job['status']): Job => ({
  id,
  title: `job ${id}`,
  prompt: `do ${id}`,
  status,
  slot: -1,
  createdAt: 1,
});

const schedule = (id: string, paused?: boolean): Schedule => ({
  id,
  prompt: `run ${id}`,
  cadence: { kind: 'daily', hour: 9, minute: 0 },
  createdAt: 1,
  nextDueAt: 2,
  ...(paused ? { paused } : {}),
});

const approval = (key: string, auto: boolean): SendApproval => ({
  key,
  channel: 'telegram',
  recipients: ['8633678680'],
  approvals: auto ? 4 : 1,
  auto,
  ...(auto ? { grantedAt: 5 } : {}),
  lastAt: 5,
});

describe('closeBlocker', () => {
  it('refuses while someone is mid-job, with the house wording', () => {
    expect(closeBlocker([job('a', 'done')], 'Pip')).toBe(
      'Pip is working — let them finish first',
    );
  });

  it('refuses on a running job even when no worker is named', () => {
    expect(closeBlocker([job('a', 'running')], undefined)).toBe(
      '“job a” is still running — cancel it or let it finish first',
    );
  });

  it('refuses on a queued job, naming it', () => {
    expect(closeBlocker([job('a', 'promoted'), job('b', 'queued')], undefined)).toBe(
      '“job b” is still queued — cancel it or let it finish first',
    );
  });

  it('allows a level whose jobs are all settled or in review', () => {
    const jobs = [job('a', 'promoted'), job('b', 'discarded'), job('c', 'done'), job('d', 'failed')];
    expect(closeBlocker(jobs, undefined)).toBeNull();
  });
});

describe('closePreview', () => {
  it('counts reviews as done, partial and failed — work waiting on a decision', () => {
    const preview = closePreview({
      jobs: [
        job('a', 'promoted'),
        job('b', 'discarded'),
        job('c', 'done'),
        job('d', 'partial'),
        job('e', 'failed'),
      ],
      recipes: 30,
      notes: 52,
      crew: ['Pip', 'Dot'],
      schedules: [schedule('s1')],
      approvals: [],
    });
    expect(preview.blocker).toBeNull();
    expect(preview.jobs).toBe(5);
    expect(preview.reviews).toBe(3);
    expect(preview.recipes).toBe(30);
    expect(preview.crew).toEqual(['Pip', 'Dot']);
    expect(preview.schedules[0]?.cadenceLabel).toBe('every day at 09:00');
  });

  it('names only granted approvals — a counter still earning is not a power', () => {
    const preview = closePreview({
      jobs: [],
      recipes: 0,
      notes: 0,
      crew: [],
      schedules: [],
      approvals: [approval('send a telegram to brian', true), approval('still earning', false)],
    });
    expect(preview.approvals.map((a) => a.key)).toEqual(['send a telegram to brian']);
  });

  it('threads the blocker through, so one function answers both routes', () => {
    const preview = closePreview({
      jobs: [],
      workingName: 'Dot',
      recipes: 0,
      notes: 0,
      crew: [],
      schedules: [],
      approvals: [],
    });
    expect(preview.blocker).toBe('Dot is working — let them finish first');
  });
});

describe('closing and reopening on disk', () => {
  let root: string;
  let dir: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-close-'));
    const meta = createLevelFiles(root, { name: 'Study', project: 'P', theme: 'cave' });
    dir = levelDir(root, meta.id);
  });

  afterEach(() => rm(root, { recursive: true, force: true }));

  it('stamps closedAt and pauses every schedule through the tested path', () => {
    writeFileSync(
      schedulesFile(dir),
      JSON.stringify([schedule('s1'), schedule('s2', true)], null, 2),
    );
    closeLevelFiles(dir, 1000);
    expect(readMeta(dir).closedAt).toBe(1000);
    expect(readSchedules(dir).map((s) => !!s.paused)).toEqual([true, true]);
  });

  it('reopening clears the stamp and leaves schedules paused — no catch-up firing', () => {
    writeFileSync(schedulesFile(dir), JSON.stringify([schedule('s1')], null, 2));
    closeLevelFiles(dir, 1000);
    const meta = reopenLevelFiles(dir);
    expect(meta.closedAt).toBeUndefined();
    expect(readMeta(dir).closedAt).toBeUndefined();
    expect(readSchedules(dir)[0]?.paused).toBe(true);
  });

  it('lists only closed levels', () => {
    createLevelFiles(root, { name: 'Open one', project: 'P', theme: 'cave' });
    closeLevelFiles(dir, 1000);
    const closed = listClosedLevels(root);
    expect(closed.map((c) => c.meta.id)).toEqual(['study']);
  });

  it('describes a closed level without touching its files', () => {
    writeFileSync(
      path.join(dir, 'jobs.json'),
      JSON.stringify([job('a', 'promoted'), job('b', 'running')], null, 2),
    );
    writeFileSync(schedulesFile(dir), JSON.stringify([schedule('s1')], null, 2));
    writeFileSync(
      path.join(dir, 'send-approvals.json'),
      JSON.stringify([approval('send a telegram to brian', true), approval('earning', false)]),
    );
    closeLevelFiles(dir, 1000);

    const info = describeClosedLevel(dir, readMeta(dir));
    expect(info.closedAt).toBe(1000);
    expect(info.jobs).toBe(2);
    expect(info.reviews).toBe(0);
    expect(info.schedules).toHaveLength(1);
    expect(info.approvals.map((a) => a.key)).toEqual(['send a telegram to brian']);

    // The pin that matters: reading a closed level must not rewrite it. A
    // JobQueue would have failed the running job over and persisted — the
    // stored file keeps the status it had.
    expect(readFileSync(path.join(dir, 'jobs.json'), 'utf8')).toContain('"running"');
  });
});
