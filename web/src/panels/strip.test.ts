import { describe, expect, it } from 'vitest';
import type { TrajectoryLine } from '@agentlings/shared';
import { callsOf, captions, colorOf, failures, legendOf, longestRun, shortTool } from './strip';

const line = (over: Partial<TrajectoryLine>): TrajectoryLine => ({
  at: 0,
  pass: 'session',
  kind: 'call',
  ...over,
});

/** Seven session calls — four Bash in a row with the third failing — then the close-out's own pass. */
const trail: TrajectoryLine[] = [
  line({ kind: 'said', turn: 1, head: 'Starting with the PDF.' }),
  line({ turn: 2, id: 'a', name: 'Bash' }),
  line({ kind: 'result', id: 'a', ok: true }),
  line({ turn: 3, id: 'b', name: 'Bash' }),
  line({ kind: 'result', id: 'b', ok: true }),
  line({ turn: 3, id: 'c', name: 'Bash' }),
  line({ kind: 'result', id: 'c', ok: false, head: 'command not found' }),
  line({ turn: 4, id: 'd', name: 'Bash' }),
  line({ kind: 'result', id: 'd', ok: true }),
  line({ turn: 5, id: 'e', name: 'Read' }),
  line({ kind: 'result', id: 'e', ok: true }),
  line({ turn: 6, id: 'f', name: 'mcp__mail__mail_search' }),
  line({ kind: 'result', id: 'f', ok: true }),
  line({ turn: 7, id: 'g', name: 'Write' }),
  line({ kind: 'end', outcome: 'result', toolCalls: 7 }),
  line({ pass: 'closeout', turn: 1, id: 'z', name: 'Read' }),
  line({ pass: 'closeout', kind: 'result', id: 'z', ok: true }),
  line({ pass: 'closeout', kind: 'end', outcome: 'result' }),
];

describe('callsOf', () => {
  it('reads the session pass only, one call per call line, in order', () => {
    const calls = callsOf(trail);
    expect(calls.map((c) => c.tool)).toEqual(['Bash', 'Bash', 'Bash', 'Bash', 'Read', 'mail_search', 'Write']);
    expect(calls.map((c) => c.n)).toEqual([1, 2, 3, 4, 5, 6, 7]);
  });

  it('marks a call failed off its own result line, and a call with no result as fine', () => {
    const calls = callsOf(trail);
    expect(calls.filter((c) => !c.ok).map((c) => c.n)).toEqual([3]);
    expect(calls[6].ok).toBe(true);
  });

  it('keeps the turn the call was made on', () => {
    expect(callsOf(trail)[2].turn).toBe(3);
  });
});

describe('legendOf (UI.md, step 17)', () => {
  it('equals the blocks it describes, tool by tool, most used first', () => {
    const calls = callsOf(trail);
    const legend = legendOf(calls);
    expect(legend.reduce((sum, l) => sum + l.n, 0)).toBe(calls.length);
    for (const entry of legend) {
      expect(calls.filter((c) => c.tool === entry.tool).length).toBe(entry.n);
      expect(entry.color).toBe(colorOf(entry.tool));
    }
    expect(legend[0]).toEqual({ tool: 'Bash', n: 4, color: '#9badb7' });
    expect(legend.map((l) => l.tool).sort()).toEqual(['Bash', 'Read', 'Write', 'mail_search']);
  });
});

describe('the captions', () => {
  it('names the longest run and the failed call, and whether it was retried', () => {
    const calls = callsOf(trail);
    expect(longestRun(calls)).toEqual({ tool: 'Bash', n: 4 });
    expect(failures(calls)).toEqual([{ call: calls[2], retried: true }]);
    expect(captions(calls)).toEqual([
      'longest run of one tool: 4 Bash calls in a row',
      '1 failed call (call 3, Bash), retried on the next',
    ]);
  });

  it('says nothing about a run with no repeats and no failures', () => {
    const calls = callsOf([line({ id: 'a', name: 'Read' }), line({ id: 'b', name: 'Bash' })]);
    expect(longestRun(calls)).toBeNull();
    expect(captions(calls)).toEqual([]);
  });
});

describe('colours', () => {
  it('shortens a door tool to its own name and colours it the same every time', () => {
    expect(shortTool('mcp__mail__mail_search')).toBe('mail_search');
    expect(shortTool('Bash')).toBe('Bash');
    expect(colorOf('fetch_page')).toBe(colorOf('fetch_page'));
    expect(colorOf('fetch_page')).toMatch(/^#[0-9a-f]{6}$/);
  });
});
