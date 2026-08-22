import { existsSync, mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
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
