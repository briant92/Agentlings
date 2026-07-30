import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { MemoryStore } from './memory';
import { installSkill, listSkills, parseFrontmatter, RoleRegistry, toRawUrl } from './roles';

const SCOUT = `---
name: scout
description: Research and reconnaissance
tools: [read, grep, web_fetch]
skills: [concise-reports]
---
You are a scout agentling.`;

describe('parseFrontmatter', () => {
  it('parses keys, inline arrays, and the body', () => {
    const parsed = parseFrontmatter(SCOUT)!;
    expect(parsed.meta.name).toBe('scout');
    expect(parsed.meta.tools).toEqual(['read', 'grep', 'web_fetch']);
    expect(parsed.body).toBe('You are a scout agentling.');
  });

  it('returns null without frontmatter', () => {
    expect(parseFrontmatter('# just markdown')).toBeNull();
  });
});

describe('RoleRegistry', () => {
  let dir: string;
  let registry: RoleRegistry;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-roles-'));
    registry = new RoleRegistry(dir);
    registry.load();
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('installs a role and lists it', () => {
    const role = registry.install(SCOUT);
    expect(role.name).toBe('scout');
    expect(role.prompt).toContain('scout agentling');
    registry.load();
    expect(registry.list().map((r) => r.name)).toEqual(['scout']);
  });

  it('accepts comma-separated tools (common in Claude subagent files)', () => {
    registry.install(`---\nname: mason\ndescription: Builds\ntools: Read, Edit, Bash\n---\nBody`);
    expect(registry.get('mason')!.tools).toEqual(['Read', 'Edit', 'Bash']);
  });

  it('rejects definitions without a valid name', () => {
    expect(() => registry.install(`---\ndescription: nameless\n---\nBody`)).toThrow(/name/);
    expect(() => registry.install('no frontmatter at all')).toThrow(/frontmatter/);
  });
});

describe('skills and memory', () => {
  let dir: string;

  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-skills-'));
  });

  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('installs and lists SKILL.md folders', () => {
    installSkill(dir, `---\nname: concise-reports\ndescription: Tight RESULT.md files\n---\nKeep it short.`);
    expect(listSkills(dir)).toEqual([
      { name: 'concise-reports', description: 'Tight RESULT.md files' },
    ]);
  });

  it('appends and reads lessons', () => {
    const memory = new MemoryStore(path.join(dir, 'memory'));
    expect(memory.lessons('Pip')).toEqual([]);
    memory.append('Pip', 'delivered "Test job"');
    memory.append('Pip', 'failed "Other job"');
    expect(memory.lessons('Pip')).toEqual(['delivered "Test job"', 'failed "Other job"']);
  });
});

describe('toRawUrl', () => {
  it('rewrites GitHub blob links to raw links', () => {
    expect(toRawUrl('https://github.com/o/r/blob/main/roles/scout.md')).toBe(
      'https://raw.githubusercontent.com/o/r/main/roles/scout.md',
    );
    expect(toRawUrl('https://example.com/x.md')).toBe('https://example.com/x.md');
  });
});
