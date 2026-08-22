import { describe, expect, it } from 'vitest';
import type { Job } from '@agentlings/shared';
import { factsOf, replyFromPending } from './facts';

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'Draw the plans',
    prompt: 'Draw the plans',
    status: 'discarded',
    slot: -1,
    createdAt: 0,
    finishedAt: Date.UTC(2026, 7, 22, 3, 2),
    ...over,
  };
}

const line = (job: Job, who?: { name: string; role?: string }) =>
  factsOf(job, who)
    .map((f) => [f.pre, f.value, f.post].filter(Boolean).join(' '))
    .join(' | ');

describe('factsOf', () => {
  it('says a cut as a cut, with the turn it ended at', () => {
    const cut = job({
      quotedUsd: 5,
      meter: {
        costUsd: 4.679,
        turns: 41,
        turnsAllowed: 40,
        outOfTurns: true,
        durationMs: 1201756,
        toolCalls: 52,
        toolsUsed: ['Bash', 'Read', 'Write'],
      },
    });
    expect(line(cut, { name: 'Ash', role: 'drafter' })).toMatch(
      /^Ash · drafter \| \$4\.68 of \$5\.00 quoted \| cut at turn 41 of 40 \| 20 min \| 52 tool calls · Bash, Read, Write \| Aug 2\d \d\d:\d\d$/,
    );
  });

  it('never reads turns over the cap as a cut (D-022, D-212)', () => {
    const finished = job({ status: 'done', meter: { costUsd: 4.91, turns: 51, turnsAllowed: 40 } });
    expect(line(finished)).toContain('51 turns');
    expect(line(finished)).not.toContain('of 40');
  });

  it('says what it can when the meter is thin', () => {
    expect(line(job({ meter: { outOfTurns: true } }))).toContain('cut at the turn ceiling');
    expect(line(job({ meter: { timedOut: true, turns: 30 } }))).toContain('cut by the clock');
    expect(line(job({ meter: { costUsd: 0.3, turns: 1 } }))).toContain('$0.30 spent | 1 turn');
    expect(line(job({ meter: { routed: true, costUsd: 0 } }))).toContain('answered without a session');
    expect(line(job({ meter: { costUnknown: true } }))).toContain('cost unknown');
  });

  it('rounds a short run to under a minute rather than to zero', () => {
    expect(line(job({ meter: { durationMs: 20000 } }))).toContain('<1 min');
  });
});

describe('replyFromPending', () => {
  it('lists what is left as something the next leg can work down', () => {
    expect(replyFromPending({ state: 'Cut before the PDF.', items: ['Render the PDF', 'Report residuals'] })).toBe(
      'Pick up from what is left: Render the PDF; Report residuals.',
    );
  });

  it('invents nothing when there is no account', () => {
    expect(replyFromPending(undefined)).toBe('');
    expect(replyFromPending({ state: 'Finished.', items: [] })).toBe('');
  });
});
