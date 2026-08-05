import { appendFileSync, mkdtempSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { appendSends, readSends, sendsFile } from './sends';

describe('the sends audit', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-sends-'));
  });

  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('round-trips what approval sent and what the channel refused', () => {
    appendSends(root, [
      { at: 1, levelId: 'hq', jobId: 'j1', channel: 'telegram', to: '1', ok: true },
      {
        at: 1,
        levelId: 'hq',
        jobId: 'j1',
        channel: 'telegram',
        to: '2',
        ok: false,
        reason: 'chat not found',
      },
    ]);
    appendSends(root, []); // a no-op append writes nothing and creates nothing new
    const read = readSends(root);
    expect(read).toHaveLength(2);
    expect(read[0]).toMatchObject({ jobId: 'j1', to: '1', ok: true });
    expect(read[1]).toMatchObject({ to: '2', ok: false, reason: 'chat not found' });
  });

  it('a torn last line must not lose the rest of the audit', () => {
    appendSends(root, [{ at: 1, levelId: 'hq', jobId: 'j1', channel: 'telegram', to: '1', ok: true }]);
    appendFileSync(sendsFile(root), '{"at":2,"levelId":"hq","jobId":"j2","cha');
    const read = readSends(root);
    expect(read).toHaveLength(1);
    expect(read[0].jobId).toBe('j1');
  });
});
