import { spawn } from 'node:child_process';
import { mkdtempSync, readFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, describe, expect, it } from 'vitest';
import { closeOpenRows, interruptedRow, ledgerFile, readLedger, totals } from './ledger';
import { INTERRUPTED, JobQueue } from './queue';

/**
 * The vanish mode, reproduced and closed (D-199): a process hard-killed
 * under a running session used to leave no ledger row at all, because the
 * only write was the completion callback. Tested with a real kill rather
 * than by unit-testing the pieces apart, as dev-logged.test.ts does, since
 * "the bytes were on disk before the death" is the entire claim.
 */
const FIXTURE = fileURLToPath(new URL('./ledger.died.fixture.ts', import.meta.url));
const SERVER = fileURLToPath(new URL('..', import.meta.url));

describe('a run the process dies under', () => {
  let root: string;
  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('leaves its row, which the next start closes as interrupted', async () => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-died-'));
    // One process, not tsx's CLI wrapping a child: the kill must reach the
    // process holding the session, or an orphan keeps it alive.
    const child = spawn(process.execPath, ['--import', 'tsx', FIXTURE, root], {
      cwd: SERVER,
      stdio: ['ignore', 'pipe', 'pipe'],
    });
    const jobId = await new Promise<string>((resolve, reject) => {
      let out = '';
      let err = '';
      child.stdout.on('data', (chunk: Buffer) => {
        out += chunk.toString();
        const match = /^open (\S+)/m.exec(out);
        if (match) resolve(match[1]);
      });
      child.stderr.on('data', (chunk: Buffer) => {
        err += chunk.toString();
      });
      child.on('exit', (code) =>
        reject(new Error(`fixture exited ${code} before opening a row\n${err}`)),
      );
    });
    const exited = new Promise((resolve) => child.on('exit', resolve));
    // A hard kill: no signal handler, no close-out, nothing the process can do.
    child.kill('SIGKILL');
    await exited;

    // The row is on disk and open; readers see nothing yet.
    const raw = readFileSync(ledgerFile(root), 'utf8').trim().split('\n');
    expect(raw).toHaveLength(1);
    expect(JSON.parse(raw[0])).toMatchObject({ jobId, open: true, costUnknown: true });
    expect(readLedger(root)).toEqual([]);

    // The next start. The job store marks the run interrupted, as it always
    // has...
    const queue = new JobQueue(path.join(root, 'levels', 'lvl'));
    const job = queue.get(jobId)!;
    expect(job.status).toBe('failed');
    expect(job.error).toBe(INTERRUPTED);
    // ...and now the ledger closes its row to match — the same row the
    // backfill writes for the runs that vanished before this existed.
    expect(closeOpenRows(root)).toBe(1);
    const [row] = readLedger(root);
    expect(row).toEqual(interruptedRow(job, 'lvl', 'worker', row.at));
    expect(row).toMatchObject({ outcome: 'failed', costUsd: 0, priceUsd: 0, agentlingId: 'a1' });
    expect(totals([row]).unmeasured).toBe(1);
    expect(closeOpenRows(root)).toBe(0);
  }, 60_000);
});
