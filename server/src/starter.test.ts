import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { MatchIndex, MIN_CONFIDENCE, suggestSetup } from './match';
import { listSkills, RoleRegistry } from './roles';

/**
 * The shipped starter set, loaded from disk rather than a fixture. The fixture
 * tests in match.test.ts pin the algorithm; these pin what a new user actually
 * gets on their first hire — the two drifted apart once roles gained skills.
 */
const ROOT = fileURLToPath(new URL('../..', import.meta.url));
const registry = new RoleRegistry(path.join(ROOT, 'roles'));
registry.load();
const roles = registry.list();
const skills = listSkills(path.join(ROOT, 'skills'));
const index = new MatchIndex(registry.loaded(), skills);
const suggest = (text: string) => suggestSetup(index, roles, text);

describe('shipped starter set', () => {
  it('ships five generalist jobs and six generalist abilities', () => {
    expect(roles.map((r) => r.name).sort()).toEqual([
      'analyst',
      'mason',
      'scout',
      'scribe',
      'worker',
    ]);
    expect(skills.map((s) => s.name).sort()).toEqual([
      'check-your-work',
      'cite-sources',
      'concise-reports',
      'plain-language',
      'small-diffs',
      'tables-and-numbers',
    ]);
  });

  it('gives every job abilities that exist', () => {
    const available = new Set(skills.map((s) => s.name));
    for (const role of roles) {
      for (const skill of role.skills) {
        expect(available, `${role.name} wants "${skill}"`).toContain(skill);
      }
    }
  });

  it('every job is reachable from something a person would say', () => {
    const reach: [string, string][] = [
      ['write the documentation for my project', 'scribe'],
      ['fix the bugs in my code', 'mason'],
      ['look into how the payment code works', 'scout'],
      ['go through my spreadsheet and total the invoices', 'analyst'],
      ['someone who can do a bit of anything', 'worker'],
    ];
    for (const [text, expected] of reach) {
      const result = suggest(text);
      expect(result.role, `"${text}"`).toBe(expected);
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    }
  });

  it('still declines what the starter set genuinely cannot do', () => {
    const result = suggest('design me a logo and pick brand colours');
    expect(result.role).toBeNull();
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});
