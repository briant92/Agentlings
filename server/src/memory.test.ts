import { existsSync, mkdtempSync, readFileSync, readdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from './memory';

let root: string;
let dir: string;
let memory: MemoryStore;

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'agentlings-memory-'));
  dir = path.join(root, 'memory'); // not created yet: the store must make its own
  memory = new MemoryStore(dir);
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('lessons', () => {
  it('has nothing to say about an agentling who has never been taught', () => {
    expect(memory.lessons('Pip')).toEqual([]);
    expect(existsSync(dir)).toBe(false); // reading does not create anything
  });

  it('reads them back oldest first, the order a session reads them in', () => {
    memory.append('Pip', 'first');
    memory.append('Pip', 'second');
    expect(memory.lessons('Pip')).toEqual(['first', 'second']);
  });

  // The file is a document a person can open and edit, so it holds a heading
  // and whatever notes they leave. Only "- " lines are lessons.
  it('ignores everything in the file that is not a lesson', () => {
    memory.write('Pip', ['a real lesson']);
    writeFileSync(
      path.join(dir, 'pip.md'),
      ['# Pip — lessons', '', 'Notes from a human reviewer.', '', '- a real lesson', ''].join('\n'),
    );
    expect(memory.lessons('Pip')).toEqual(['a real lesson']);
  });

  // One line, one lesson: a lesson that wraps loses its tail, which is why the
  // executor trims LESSON.md to a single line before it gets here.
  it('keeps a lesson to one line', () => {
    memory.append('Pip', 'a lesson\nwith a second line');
    expect(memory.lessons('Pip')).toEqual(['a lesson']);
  });

  it('reads a file written with windows line endings', () => {
    memory.append('Pip', 'seed'); // makes the dir
    writeFileSync(path.join(dir, 'pip.md'), '# Pip — lessons\r\n\r\n- one\r\n- two\r\n');
    expect(memory.lessons('Pip')).toEqual(['one', 'two']);
  });
});

describe('append', () => {
  it('creates the store the first time anyone learns anything', () => {
    memory.append('Pip', 'learned something');
    expect(readdirSync(dir)).toEqual(['pip.md']);
  });

  it('writes the heading once, however many lessons arrive', () => {
    memory.append('Pip', 'one');
    memory.append('Pip', 'two');
    const text = readFileSync(path.join(dir, 'pip.md'), 'utf8');
    expect(text.match(/^# Pip/gm)).toHaveLength(1);
  });

  it('keeps one agentling out of another one’s memory', () => {
    memory.append('Pip', 'pip learned this');
    memory.append('Sol', 'sol learned this');
    expect(memory.lessons('Pip')).toEqual(['pip learned this']);
    expect(memory.lessons('Sol')).toEqual(['sol learned this']);
  });

  // Memory outlives the process: each job is a fresh store over the same dir.
  it('survives the store that wrote it', () => {
    memory.append('Pip', 'from an earlier run');
    expect(new MemoryStore(dir).lessons('Pip')).toEqual(['from an earlier run']);
  });

  it('treats a name as the same agentling whatever its casing', () => {
    memory.append('PIP', 'shouted');
    memory.append('pip', 'whispered');
    expect(memory.lessons('Pip')).toEqual(['shouted', 'whispered']);
    expect(readdirSync(dir)).toEqual(['pip.md']);
  });
});

describe('write', () => {
  // A merge hands back one rewritten list, not a set of lines to add.
  it('replaces the whole memory rather than adding to it', () => {
    memory.append('Pip', 'stale');
    memory.write('Pip', ['merged one', 'merged two']);
    expect(memory.lessons('Pip')).toEqual(['merged one', 'merged two']);
  });

  it('can empty a memory and still leave a readable file', () => {
    memory.append('Pip', 'stale');
    memory.write('Pip', []);
    expect(memory.lessons('Pip')).toEqual([]);
    expect(readFileSync(path.join(dir, 'pip.md'), 'utf8')).toContain('# Pip');
  });

  it('creates the store when nothing has been appended yet', () => {
    memory.write('Pip', ['handed down']);
    expect(memory.lessons('Pip')).toEqual(['handed down']);
  });
});

describe('archive', () => {
  // Archiving is how the app forgets a name. Hiring it again must not inherit
  // the old lessons — but the archive still has to hold them.
  it('leaves a rehired name a clean memory and keeps the old one on disk', () => {
    memory.append('Bea', 'from her first life');
    const archived = memory.archive('Bea', new Date('2026-07-30'));

    memory.append('Bea', 'from her second life');
    expect(memory.lessons('Bea')).toEqual(['from her second life']);
    expect(readFileSync(archived!, 'utf8')).toContain('from her first life');
  });

  it('touches nobody else', () => {
    memory.append('Bea', 'hers');
    memory.append('Pip', 'his');
    memory.archive('Bea', new Date('2026-07-30'));
    expect(memory.lessons('Pip')).toEqual(['his']);
  });
});
