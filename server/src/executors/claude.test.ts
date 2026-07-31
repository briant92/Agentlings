import { describe, expect, it } from 'vitest';
import { turnCapFor, turnsFor, turnsForBudget } from './claude';

describe('turnCapFor', () => {
  // Was 1, which cannot work: a single turn ends before the model sees any
  // tool result, so a job that must read before it writes never even starts.
  // Measured at 1 turn it produced no files and cost more than the full
  // session it replaced.
  it('gives a recipe job a short leash rather than a single turn', () => {
    expect(turnCapFor(undefined, { oneShot: true })).toBe(3);
  });

  it('keeps the leash short even for a role that asks to explore', () => {
    expect(turnCapFor({ maxTurns: 20 }, { oneShot: true })).toBe(3);
  });

  it('leaves work without a recipe on the role’s own budget', () => {
    expect(turnCapFor(undefined, {})).toBe(8);
    expect(turnCapFor(undefined, undefined)).toBe(8);
    expect(turnCapFor({ maxTurns: 20 }, undefined)).toBe(20);
  });

  it('still lets the quote tighten a recipe run further', () => {
    const cap = turnCapFor(undefined, { oneShot: true });
    expect(turnsForBudget(0.05, { samples: 3, usd: 0.025 }, cap)).toBe(2);
  });
});

describe('turnsForBudget', () => {
  const roleTurns = 8;

  it('spends the ceiling at the observed rate', () => {
    // 20c at 2c a turn is ten turns, but the role only allows eight.
    expect(turnsForBudget(0.2, { samples: 3, usd: 0.02 }, roleTurns)).toBe(8);
    expect(turnsForBudget(0.2, { samples: 3, usd: 0.02 }, 20)).toBe(10);
  });

  it('tightens the loop when the money is short', () => {
    expect(turnsForBudget(0.1, { samples: 3, usd: 0.03 }, roleTurns)).toBe(3);
  });

  // The ceiling is a cap, not a licence: a rich quote must not let a job
  // think for longer than its role says it may.
  it('never buys more turns than the role allows', () => {
    expect(turnsForBudget(100, { samples: 5, usd: 0.001 }, roleTurns)).toBe(roleTurns);
  });

  it('leaves the role in charge when there is no history to price a turn', () => {
    expect(turnsForBudget(0.2, { samples: 0, usd: 0 }, roleTurns)).toBe(roleTurns);
    expect(turnsForBudget(undefined, { samples: 3, usd: 0.02 }, roleTurns)).toBe(roleTurns);
  });

  it('still allows one turn when the budget cannot even buy that', () => {
    // Better to run once and fail on its own terms than to start a session
    // that is forbidden to think at all.
    expect(turnsForBudget(0.001, { samples: 3, usd: 0.5 }, roleTurns)).toBe(1);
  });
});

describe('turnsFor', () => {
  it('keeps a tight default when a role says nothing', () => {
    expect(turnsFor(undefined)).toBe(8);
    expect(turnsFor({})).toBe(8);
  });

  it('lets a role that must explore ask for more', () => {
    expect(turnsFor({ maxTurns: 20 })).toBe(20);
  });

  it('clamps a runaway value rather than trusting it', () => {
    expect(turnsFor({ maxTurns: 5000 })).toBe(40);
  });

  it('ignores nonsense instead of uncapping the loop', () => {
    expect(turnsFor({ maxTurns: 0 })).toBe(8);
    expect(turnsFor({ maxTurns: -3 })).toBe(8);
    expect(turnsFor({ maxTurns: Number.NaN })).toBe(8);
  });
});
import { buildAppend, mapTools, parseLesson, toolLine } from './claude';

describe('mapTools', () => {
  it('maps role tool names onto SDK tool names and dedupes', () => {
    expect(mapTools(['read', 'grep', 'glob', 'web_fetch'])).toEqual([
      'Read',
      'Grep',
      'Glob',
      'WebFetch',
    ]);
  });

  it('capitalizes unknown tool names as a fallback', () => {
    expect(mapTools(['task'])).toEqual(['Task']);
  });
});

describe('buildAppend', () => {
  it('includes the repo rule, level knowledge, and past lessons', () => {
    const text = buildAppend(
      {
        name: 'scout',
        description: 'd',
        tools: [],
        skills: [],
        prompt: 'You are a scout.',
      },
      ['stay curious'],
      ['the tunnel floods on Tuesdays'],
      true,
    );
    expect(text).toContain('You are a scout.');
    expect(text).toContain('cloned at ./repo');
    expect(text).toContain('stay curious');
    expect(text).toContain('the tunnel floods on Tuesdays');
    expect(text).toContain('LESSON.md');
  });

  it('falls back to a generic persona without a role', () => {
    expect(buildAppend(undefined, [], [], false)).toContain('general-purpose worker');
  });
});

describe('parseLesson', () => {
  it('takes the first bullet line', () => {
    expect(parseLesson('# notes\n- always run the tests\n- second')).toBe('always run the tests');
  });

  it('falls back to the first non-empty line', () => {
    expect(parseLesson('plain sentence lesson\n')).toBe('plain sentence lesson');
    expect(parseLesson('   \n')).toBeUndefined();
  });
});

describe('toolLine', () => {
  it('picks a useful detail field and truncates', () => {
    expect(toolLine('Bash', { command: 'npm test' })).toBe('Bash npm test');
    expect(toolLine('Read', { file_path: 'repo/src/index.ts' })).toBe('Read repo/src/index.ts');
    expect(toolLine('Glob', {})).toBe('Glob');
    expect(toolLine('Bash', { command: 'x'.repeat(200) })).toHaveLength(78);
  });
});
