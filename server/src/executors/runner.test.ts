import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Job, ReconciliationRollForward } from '@agentlings/shared';
import { MemoryStore } from '../memory';
import { outputNames } from '../outputs';
import { RoleRegistry } from '../roles';
import { TRAJECTORY_FILE } from '../trajectory';
import { CANCELLED, ClaudeAgentExecutor, SessionFailure } from './claude';

/**
 * The runner's stdout protocol, wired. `toolCalls`, `toolsUsed` and the trail
 * are all read off the child's lines in `runSession`, and until this file
 * nothing but a live run ever exercised that — the wiring this repo keeps
 * finding unpinned (D-167's mutation lesson, D-211). A stand-in runner speaks
 * the same lines and calls no model.
 */
function fakeRunner(dir: string, body: string): string {
  const file = path.join(dir, 'fake-runner.mjs');
  writeFileSync(
    file,
    [
      "import { readFileSync, writeFileSync } from 'node:fs';",
      "const emit = (o) => process.stdout.write(JSON.stringify(o) + String.fromCharCode(10));",
      "const config = JSON.parse(readFileSync(process.argv[2], 'utf8'));",
      body,
      '',
    ].join('\n'),
  );
  return file;
}

function setUp(body: string): { exec: ClaudeAgentExecutor; sandbox: string } {
  const dir = mkdtempSync(path.join(tmpdir(), 'runner-'));
  const exec = new ClaudeAgentExecutor(
    new RoleRegistry(path.join(dir, 'roles')),
    new MemoryStore(path.join(dir, 'memory')),
    path.join(dir, 'skills'),
  );
  exec.runner = fakeRunner(dir, body);
  const sandbox = path.join(dir, 'sandbox');
  mkdirSync(sandbox);
  return { exec, sandbox };
}

const job = (id: string): Job =>
  ({ id, title: 'Probe', prompt: 'read the attachment and build it' }) as unknown as Job;

function trail(sandbox: string): Record<string, unknown>[] {
  return readFileSync(path.join(sandbox, TRAJECTORY_FILE), 'utf8')
    .trim()
    .split('\n')
    .map((line) => JSON.parse(line));
}

async function until(check: () => boolean, ms = 5000): Promise<void> {
  const start = Date.now();
  while (!check()) {
    if (Date.now() - start > ms) throw new Error('gave up waiting');
    await new Promise((r) => setTimeout(r, 25));
  }
}

describe('the runner protocol, wired', () => {
  it('keeps every call, result and remark, counts the calls, and tags the write-up apart', async () => {
    const { exec, sandbox } = setUp(`
      writeFileSync(config.cwd + '/RESULT.md', 'did it');
      emit({ type: 'said', turn: 1, head: 'Reading the attachment first.' });
      emit({ type: 'progress', name: 'Read', input: { file_path: 'input/deck.pdf' }, id: 't1', turn: 1 });
      emit({ type: 'observation', id: 't1', turn: 1, ok: true, head: 'page 1 of 3' });
      emit({ type: 'progress', name: 'Bash', input: { command: 'node build.mjs' }, id: 't2', turn: 2 });
      emit({ type: 'observation', id: 't2', turn: 2, ok: false, head: 'Error: ENOENT' });
      emit({ type: 'result', summary: 'Done.', meter: { costUsd: 0.05, turns: 3, inputTokens: 100, outputTokens: 20 } });
    `);
    const result = await exec.run(job('j1'), sandbox);

    // The meter the ledger will read, off the same lines (D-052, D-100).
    expect(result.summary).toBe('Done.');
    expect(result.meter?.toolCalls).toBe(2);
    expect(result.meter?.toolsUsed).toEqual(['Bash', 'Read']);
    expect(result.meter?.lastTool).toBe('Bash');
    // RESULT.md made the close-out run, through the same stand-in: its cost joins.
    expect(result.meter?.costUsd).toBeCloseTo(0.1, 6);
    expect(result.meter?.closeOutUsd).toBeCloseTo(0.05, 6);

    const lines = trail(sandbox);
    const session = lines.filter((l) => l.pass === 'session');
    const closeout = lines.filter((l) => l.pass === 'closeout');
    expect(session.map((l) => l.kind)).toEqual(['said', 'call', 'result', 'call', 'result', 'end']);
    expect(closeout.map((l) => l.kind)).toEqual(['said', 'call', 'result', 'call', 'result', 'end']);
    expect(session[1]).toMatchObject({ name: 'Read', args: '{"file_path":"input/deck.pdf"}', id: 't1', turn: 1 });
    expect(session[4]).toMatchObject({ id: 't2', ok: false, head: 'Error: ENOENT' });
    expect(session[5]).toMatchObject({ outcome: 'result', toolCalls: 2, costUsd: 0.05, turns: 3 });

    // Invisible to everything that lists deliverables: the review, the
    // close-out's evidence, a continuation's carry-forward (D-208's gate).
    expect(outputNames(sandbox)).toEqual(['RESULT.md']);
  });

  it('writes how a run that crashed ended, with what it had called', async () => {
    const { exec, sandbox } = setUp(`
      emit({ type: 'progress', name: 'Read', input: {}, id: 't1', turn: 1 });
      process.stderr.write('boom' + String.fromCharCode(10));
      process.exit(3);
    `);
    const failure = await exec.run(job('j2'), sandbox).catch((err) => err);
    expect(failure).toBeInstanceOf(SessionFailure);
    expect(failure.message).toBe('boom');
    expect(failure.meter.toolCalls).toBe(1);

    const lines = trail(sandbox);
    expect(lines.map((l) => l.kind)).toEqual(['call', 'end']);
    expect(lines[1]).toMatchObject({ outcome: 'exit', toolCalls: 1, message: 'boom' });
  });

  it('writes a cancellation as one, not as whatever the dying child said', async () => {
    const { exec, sandbox } = setUp(`
      emit({ type: 'progress', name: 'Bash', input: { command: 'sleep 30' }, id: 't1', turn: 1 });
      setTimeout(() => process.exit(0), 30000);
    `);
    const running = exec.run(job('j3'), sandbox).catch((err) => err);
    await until(() => existsSync(path.join(sandbox, TRAJECTORY_FILE)));
    expect(exec.cancel('j3')).toBe(true);
    const failure = await running;
    expect(failure).toBeInstanceOf(SessionFailure);
    expect(failure.message).toBe(CANCELLED);

    const lines = trail(sandbox);
    expect(lines.at(-1)).toMatchObject({ kind: 'end', outcome: 'cancelled', toolCalls: 1 });
    expect(lines.at(-1)).not.toHaveProperty('message');
  });
});

/**
 * The roll-forward, wired (D-223): the thunk is asked with the job's own
 * shape, the state lands in the sandbox as PRIOR-RECONCILIATION.json, and
 * the brief the run reads names it — none of which a unit on the module
 * could see, and all of which mutation 4 proved unpinned.
 */
/**
 * The stdio connections' secrets travel on stdin rather than in the config
 * file, because that file lives in the sandbox the agentling reads all job
 * long (D-240's seam). The unit tests pin what the config no longer carries;
 * what only a wired test can see is that the channel is **written and ended**
 * — the runner reads stdin to EOF, so a caller that opened the pipe and never
 * closed it would leave every job hanging forever with no error to read.
 */
describe('the secrets channel, wired', () => {
  it('hands the runner a JSON object on stdin and closes it, even with nothing to send', async () => {
    const { exec, sandbox } = setUp(`
      const chunks = [];
      for await (const c of process.stdin) chunks.push(c);
      const raw = Buffer.concat(chunks).toString('utf8').trim();
      writeFileSync(config.cwd + '/RESULT.md', 'did it');
      emit({ type: 'result', summary: 'stdin:' + raw, meter: { costUsd: 0.01, turns: 1 } });
    `);
    const result = await exec.run(job('j-secrets'), sandbox);

    // It finished at all, which is the hang check: this await would time out
    // rather than fail if stdin were left open.
    expect(result.summary).toBe('stdin:{}');

    // And the config beside it names no secret, because there is none to name.
    const config = JSON.parse(readFileSync(path.join(sandbox, '.session.json'), 'utf8'));
    expect(config.mcpServers).toEqual({});
  });
});

describe('the roll-forward, wired', () => {
  const prior: ReconciliationRollForward = {
    jobId: 'prior001',
    approvedAt: 1000,
    inputShape: ['csv:date|desc|amount'],
    reconciliation: {
      period: '2026-08',
      currency: 'USD',
      statement: { label: 'Bank', closing: 100, adjusted: 90 },
      records: { label: 'Ledger', closing: 80, adjusted: 90 },
      adjustments: [{ side: 'statement', kind: 'outstanding', amount: -10, what: 'Check 9' }],
      difference: 0,
      balances: true,
      counts: { matched: 1, unmatchedStatement: 0, unmatchedRecords: 0, adjustments: 1, entries: 0 },
    },
  };

  function reconcileSetUp(prompt: string): {
    exec: ClaudeAgentExecutor;
    sandbox: string;
    askedWith: (string[] | undefined)[];
    theJob: Job;
  } {
    const dir = mkdtempSync(path.join(tmpdir(), 'runner-'));
    const askedWith: (string[] | undefined)[] = [];
    const exec = new ClaudeAgentExecutor(
      new RoleRegistry(path.join(dir, 'roles')),
      new MemoryStore(path.join(dir, 'memory')),
      path.join(dir, 'skills'),
      undefined,
      undefined,
      undefined,
      undefined,
      undefined,
      (shapes) => {
        askedWith.push(shapes);
        return prior;
      },
    );
    exec.runner = fakeRunner(dir, `
      writeFileSync(config.cwd + '/RESULT.md', 'done');
      emit({ type: 'result', summary: 'Done.', meter: { costUsd: 0.01, turns: 1 } });
    `);
    const sandbox = path.join(dir, 'sandbox');
    mkdirSync(sandbox);
    const theJob = {
      id: 'r1',
      title: 'Reconcile',
      prompt,
      attachments: [{ name: 'statement.csv', bytes: 1, shape: 'csv:date|desc|amount' }],
    } as unknown as Job;
    return { exec, sandbox, askedWith, theJob };
  }

  it('asks the level with the job\'s shape, lands the state in the sandbox, and the brief names it', async () => {
    const { exec, sandbox, askedWith, theJob } = reconcileSetUp(
      'Reconcile the attached bank statement against the attached records',
    );
    await exec.run(theJob, sandbox);
    expect(askedWith).toEqual([['csv:date|desc|amount']]);
    const landed = JSON.parse(
      readFileSync(path.join(sandbox, 'PRIOR-RECONCILIATION.json'), 'utf8'),
    );
    expect(landed).toEqual(prior);
    const config = JSON.parse(readFileSync(path.join(sandbox, '.session.json'), 'utf8'));
    expect(config.append).toContain('PRIOR-RECONCILIATION.json');
    expect(config.append).toContain('90 USD');
  });

  it('a job that does not reconcile gets no prior file and never asks', async () => {
    const { exec, sandbox, askedWith, theJob } = reconcileSetUp('summarise the attached expenses');
    await exec.run(theJob, sandbox);
    expect(askedWith).toEqual([]);
    expect(existsSync(path.join(sandbox, 'PRIOR-RECONCILIATION.json'))).toBe(false);
    const config = JSON.parse(readFileSync(path.join(sandbox, '.session.json'), 'utf8'));
    expect(config.append).not.toContain('PRIOR-RECONCILIATION.json');
  });
});

/**
 * The provenance index, wired (D-225): a level that has been mapped — the
 * index built over its files, cached, searched — briefs a run byte for byte
 * as a level that has not. The index is for looking; the zero bytes is the
 * promise the review made, and it is pinned at the seam where the brief is
 * actually written, not by reading the index module's imports.
 */
describe('the provenance index, wired', () => {
  it('adds nothing to the brief: the .session.json append is identical with the level mapped', async () => {
    const { buildProvenance, ProvenanceCache, searchProvenance } = await import('../provenance');
    const dir = mkdtempSync(path.join(tmpdir(), 'runner-'));
    const level = path.join(dir, 'level');
    mkdirSync(path.join(level, 'memory'), { recursive: true });
    writeFileSync(path.join(level, 'jobs.json'), JSON.stringify([{ id: 'p1', title: 'Tidy the exports', prompt: 'Tidy the exports', status: 'done', createdAt: 1000 }]));
    writeFileSync(path.join(level, 'KNOWLEDGE.md'), '# Level knowledge\n\n- 2026-08-10 · Pip (worker) delivered "Tidy the exports" — exports live under src/\n');
    writeFileSync(path.join(level, 'memory', 'pip.md'), '# Pip — lessons\n\n- 2026-08-10 · exports live under src/ (job: Tidy the exports)\n');
    const knowledge = () => ['2026-08-10 · Pip (worker) delivered "Tidy the exports" — exports live under src/'];

    const briefFor = async (): Promise<string> => {
      const exec = new ClaudeAgentExecutor(
        new RoleRegistry(path.join(dir, 'roles')),
        new MemoryStore(path.join(level, 'memory')),
        path.join(dir, 'skills'),
        knowledge,
      );
      exec.runner = fakeRunner(dir, `
        writeFileSync(config.cwd + '/RESULT.md', 'done');
        emit({ type: 'result', summary: 'Done.', meter: { costUsd: 0.01, turns: 1 } });
      `);
      const sandbox = mkdtempSync(path.join(dir, 'sandbox-'));
      const job = { id: 'p2', title: 'Tidy the exports', prompt: 'Tidy the exports' } as unknown as Job;
      await exec.run(job, sandbox, undefined, { id: 'a1', name: 'Pip', role: 'worker' } as never);
      return JSON.parse(readFileSync(path.join(sandbox, '.session.json'), 'utf8')).append as string;
    };

    const unmapped = await briefFor();
    // Map the level the way the panel would: build, cache, search.
    const cache = new ProvenanceCache(path.join(dir, 'ledger.jsonl'), () => []);
    const built = await cache.get(level, 'lvl', 5000);
    expect(built.nodes.length).toBeGreaterThan(0);
    expect(searchProvenance(built, 'exports').length).toBeGreaterThan(0);
    expect((await buildProvenance(level, 'lvl', [], 5000)).edges.length).toBeGreaterThan(0);
    const mapped = await briefFor();

    expect(mapped).toBe(unmapped);
    expect(mapped).toContain('exports live under src/');
  });
});
