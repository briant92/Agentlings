import { existsSync, mkdirSync, readdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { RoleInfo, SkillInfo } from '@agentlings/shared';

/**
 * Roles use the Claude Code subagent format (YAML-ish frontmatter + prompt
 * body); skills use SKILL.md folders — so templates published for Claude
 * install verbatim, and M1 hands both straight to the Agent SDK.
 */

export interface LoadedRole extends RoleInfo {
  prompt: string;
}

export function parseFrontmatter(
  text: string,
): { meta: Record<string, string | string[]>; body: string } | null {
  const match = /^---\r?\n([\s\S]*?)\r?\n---\r?\n?([\s\S]*)$/.exec(text.trim());
  if (!match) return null;
  const meta: Record<string, string | string[]> = {};
  for (const line of match[1].split(/\r?\n/)) {
    const kv = /^([A-Za-z][\w-]*):\s*(.*)$/.exec(line.trim());
    if (!kv) continue;
    const raw = kv[2].trim();
    if (raw.startsWith('[') && raw.endsWith(']')) {
      meta[kv[1]] = raw
        .slice(1, -1)
        .split(',')
        .map((s) => s.trim().replace(/^['"]|['"]$/g, ''))
        .filter(Boolean);
    } else {
      meta[kv[1]] = raw;
    }
  }
  return { meta, body: match[2].trim() };
}

function toList(value: string | string[] | undefined): string[] {
  if (!value) return [];
  if (Array.isArray(value)) return value;
  return value
    .split(',')
    .map((s) => s.trim())
    .filter(Boolean);
}

function toText(value: string | string[] | undefined): string {
  return Array.isArray(value) ? value.join(', ') : (value ?? '');
}

const NAME_RE = /^[a-z0-9][a-z0-9-]*$/;

export class RoleRegistry {
  private roles = new Map<string, LoadedRole>();

  constructor(private rolesDir: string) {}

  load(): void {
    mkdirSync(this.rolesDir, { recursive: true });
    this.roles.clear();
    for (const entry of readdirSync(this.rolesDir)) {
      if (!entry.endsWith('.md')) continue;
      try {
        const role = roleFromText(readFileSync(path.join(this.rolesDir, entry), 'utf8'));
        this.roles.set(role.name, role);
      } catch {
        // Skip unparseable files rather than refusing to boot.
      }
    }
  }

  list(): RoleInfo[] {
    return [...this.roles.values()]
      .map(({ prompt: _prompt, ...info }) => info)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  get(name: string): LoadedRole | undefined {
    return this.roles.get(name);
  }

  /** Validates and stores a role definition; returns the loaded role. */
  install(text: string): LoadedRole {
    const role = roleFromText(text);
    writeFileSync(path.join(this.rolesDir, `${role.name}.md`), text.trim() + '\n');
    this.roles.set(role.name, role);
    return role;
  }
}

function roleFromText(text: string): LoadedRole {
  const parsed = parseFrontmatter(text);
  if (!parsed) throw new Error('not a frontmatter markdown file');
  const name = toText(parsed.meta.name).toLowerCase();
  const description = toText(parsed.meta.description);
  if (!NAME_RE.test(name)) throw new Error('frontmatter needs a kebab-case "name"');
  if (!description) throw new Error('frontmatter needs a "description"');
  return {
    name,
    description,
    tools: toList(parsed.meta.tools),
    skills: toList(parsed.meta.skills),
    model: toText(parsed.meta.model) || undefined,
    prompt: parsed.body,
  };
}

export function listSkills(skillsDir: string): SkillInfo[] {
  mkdirSync(skillsDir, { recursive: true });
  const skills: SkillInfo[] = [];
  for (const entry of readdirSync(skillsDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const file = path.join(skillsDir, entry.name, 'SKILL.md');
    if (!existsSync(file)) continue;
    const parsed = parseFrontmatter(readFileSync(file, 'utf8'));
    if (!parsed) continue;
    skills.push({
      name: toText(parsed.meta.name) || entry.name,
      description: toText(parsed.meta.description),
    });
  }
  return skills.sort((a, b) => a.name.localeCompare(b.name));
}

/** Validates and stores a SKILL.md; returns the skill info. */
export function installSkill(skillsDir: string, text: string): SkillInfo {
  const parsed = parseFrontmatter(text);
  if (!parsed) throw new Error('not a frontmatter markdown file');
  const name = toText(parsed.meta.name).toLowerCase();
  const description = toText(parsed.meta.description);
  if (!NAME_RE.test(name)) throw new Error('frontmatter needs a kebab-case "name"');
  if (!description) throw new Error('frontmatter needs a "description"');
  const dir = path.join(skillsDir, name);
  mkdirSync(dir, { recursive: true });
  writeFileSync(path.join(dir, 'SKILL.md'), text.trim() + '\n');
  return { name, description };
}

/** GitHub blob links become raw links so pasted URLs just work. */
export function toRawUrl(url: string): string {
  return url
    .replace('https://github.com/', 'https://raw.githubusercontent.com/')
    .replace('/blob/', '/');
}
