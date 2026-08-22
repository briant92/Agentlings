import { existsSync, mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { TRAJECTORY_FILE, endLine, logTrajectory, trajectoryLine } from './trajectory';

const AT = 1787000000000;

describe('the trajectory trail', () => {
  it('records a call as its name, its clipped arguments and its turn', () => {
    const line = JSON.parse(
      trajectoryLine(
        { type: 'progress', name: 'Read', input: { file_path: 'input/deck.pdf' }, id: 'toolu_1', turn: 2 },
        'session',
        AT,
      )!,
    );
    expect(line).toEqual({
      at: AT,
      pass: 'session',
      turn: 2,
      kind: 'call',
      id: 'toolu_1',
      name: 'Read',
      args: '{"file_path":"input/deck.pdf"}',
    });
  });

  it('records what came back, and whether the tool refused', () => {
    const ok = JSON.parse(
      trajectoryLine(
        { type: 'observation', id: 'toolu_1', turn: 2, ok: true, head: 'page 1 of 3\nmore' },
        'session',
        AT,
      )!,
    );
    expect(ok).toEqual({
      at: AT,
      pass: 'session',
      turn: 2,
      kind: 'result',
      id: 'toolu_1',
      ok: true,
      head: 'page 1 of 3\nmore',
    });
    const refused = JSON.parse(
      trajectoryLine({ type: 'observation', id: 'toolu_2', ok: false, head: 'Permission denied' }, 'session', AT)!,
    );
    expect(refused.ok).toBe(false);
    expect(refused.turn).toBeUndefined();
  });

  it('keeps what the run said between calls, and tags the write-up pass apart', () => {
    const said = JSON.parse(
      trajectoryLine({ type: 'said', turn: 1, head: 'I will read the attachment first.' }, 'closeout', AT)!,
    );
    expect(said).toEqual({
      at: AT,
      pass: 'closeout',
      turn: 1,
      kind: 'said',
      head: 'I will read the attachment first.',
    });
  });

  it("writes the SDK's compaction boundary as its own line, with the turn it fell on (D-212)", () => {
    const line = JSON.parse(
      trajectoryLine(
        { type: 'compact', turn: 31, trigger: 'auto', preTokens: 150000, postTokens: 20000 },
        'session',
        AT,
      )!,
    );
    expect(line).toEqual({
      at: AT,
      pass: 'session',
      turn: 31,
      kind: 'compact',
      trigger: 'auto',
      preTokens: 150000,
      postTokens: 20000,
    });
    // What the SDK did not report is simply absent — never a guessed zero.
    expect(JSON.parse(trajectoryLine({ type: 'compact', turn: 3 }, 'session', AT)!)).toEqual({
      at: AT,
      pass: 'session',
      turn: 3,
      kind: 'compact',
    });
  });

  it('keeps nothing for the lines the meter already owns', () => {
    expect(trajectoryLine({ type: 'result', name: 'x' }, 'session', AT)).toBeNull();
    expect(trajectoryLine({ type: 'error' }, 'session', AT)).toBeNull();
    expect(trajectoryLine({ type: 'progress' }, 'session', AT)).toBeNull();
    expect(trajectoryLine({}, 'session', AT)).toBeNull();
  });

  it('clips arguments and heads rather than copying the work', () => {
    const call = JSON.parse(
      trajectoryLine({ type: 'progress', name: 'Write', input: { content: 'x'.repeat(5000) } }, 'session', AT)!,
    );
    expect(call.args.length).toBeLessThanOrEqual(201);
    expect(call.args.endsWith('…')).toBe(true);
    const result = JSON.parse(trajectoryLine({ type: 'observation', head: 'y'.repeat(5000) }, 'session', AT)!);
    expect(result.head.length).toBeLessThanOrEqual(161);
    expect(result.head.endsWith('…')).toBe(true);
  });

  it('ends with how the child stopped and what the meter knew', () => {
    const end = JSON.parse(
      endLine(
        'session',
        'timeout',
        { costUsd: 0.12, turns: 7, inputTokens: 10, outputTokens: 20 },
        5,
        AT,
        'session timed out after 10 minutes',
      ),
    );
    expect(end).toEqual({
      at: AT,
      pass: 'session',
      kind: 'end',
      outcome: 'timeout',
      toolCalls: 5,
      costUsd: 0.12,
      turns: 7,
      inputTokens: 10,
      outputTokens: 20,
      message: 'session timed out after 10 minutes',
    });
    // A killed run has no meter; the line still says how it ended and what it called.
    expect(JSON.parse(endLine('session', 'cancelled', {}, 3, AT))).toEqual({
      at: AT,
      pass: 'session',
      kind: 'end',
      outcome: 'cancelled',
      toolCalls: 3,
    });
  });

  it('appends one line per event, skips null, and a bad root swallows rather than throws', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'trajectory-'));
    logTrajectory(dir, trajectoryLine({ type: 'progress', name: 'Read', input: {}, turn: 1 }, 'session', AT));
    logTrajectory(dir, trajectoryLine({ type: 'result' }, 'session', AT));
    logTrajectory(dir, endLine('session', 'result', { costUsd: 0.01 }, 1, AT + 1));
    const lines = readFileSync(path.join(dir, TRAJECTORY_FILE), 'utf8').trim().split('\n');
    expect(lines).toHaveLength(2);
    expect(JSON.parse(lines[1]).kind).toBe('end');
    expect(TRAJECTORY_FILE.startsWith('.')).toBe(true);

    const missing = path.join(dir, 'no', 'such', 'dir');
    expect(() => logTrajectory(missing, endLine('session', 'exit', {}, 0, AT))).not.toThrow();
    expect(existsSync(path.join(missing, TRAJECTORY_FILE))).toBe(false);
  });
});

import { writeFileSync } from 'node:fs';
import { readTrajectory } from './trajectory';

describe('readTrajectory (UI.md, step 11)', () => {
  it('reads the lines back in order, skipping kinds it does not know and torn lines', () => {
    const dir = mkdtempSync(path.join(tmpdir(), 'agentlings-trail-'));
    logTrajectory(
      dir,
      trajectoryLine({ type: 'progress', name: 'Read', input: {}, id: 't1', turn: 2 }, 'session', AT),
    );
    logTrajectory(
      dir,
      trajectoryLine({ type: 'observation', id: 't1', ok: true, head: 'ok', turn: 2 }, 'session', AT + 1),
    );
    // D-212's instrument, landed: the compaction boundary reads back as its own kind.
    logTrajectory(
      dir,
      trajectoryLine({ type: 'compact', turn: 2, trigger: 'auto', preTokens: 90000 }, 'session', AT + 2),
    );
    // A kind this reader does not know is skipped, not an error.
    logTrajectory(dir, JSON.stringify({ at: AT + 2, pass: 'session', kind: 'some_future_kind' }));
    writeFileSync(path.join(dir, TRAJECTORY_FILE), '{"torn":\n', { flag: 'a' });
    logTrajectory(dir, endLine('closeout', 'result', { costUsd: 0.05, turns: 4 }, 3, AT + 3));
    const lines = readTrajectory(dir);
    expect(lines?.map((l) => l.kind)).toEqual(['call', 'result', 'compact', 'end']);
    expect(lines?.[0]).toMatchObject({ name: 'Read', pass: 'session', turn: 2 });
    expect(lines?.[2]).toMatchObject({ kind: 'compact', turn: 2, trigger: 'auto', preTokens: 90000 });
    expect(lines?.[3]).toMatchObject({ pass: 'closeout', outcome: 'result', toolCalls: 3 });
  });

  it('is null, not empty, where a run left no trail', () => {
    expect(readTrajectory(mkdtempSync(path.join(tmpdir(), 'agentlings-notrail-')))).toBeNull();
  });
});
