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
