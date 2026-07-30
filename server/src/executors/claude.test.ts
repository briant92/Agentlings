import { describe, expect, it } from 'vitest';
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
  it('includes the repo rule and past lessons', () => {
    const text = buildAppend(
      {
        name: 'scout',
        description: 'd',
        tools: [],
        skills: [],
        prompt: 'You are a scout.',
      },
      ['stay curious'],
      true,
    );
    expect(text).toContain('You are a scout.');
    expect(text).toContain('cloned at ./repo');
    expect(text).toContain('stay curious');
    expect(text).toContain('LESSON.md');
  });

  it('falls back to a generic persona without a role', () => {
    expect(buildAppend(undefined, [], false)).toContain('general-purpose worker');
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
