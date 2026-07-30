import { describe, expect, it } from 'vitest';
import { turnsFor } from './claude';

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
