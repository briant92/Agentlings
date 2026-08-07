import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mapTools } from './executors/claude';
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
  /**
   * Every session is told "write RESULT.md in the working directory", so a
   * role that cannot write cannot finish any job at all.
   *
   * `scout` shipped with `[read, grep, web_fetch]` and a prompt promising it
   * would write RESULT.md. Found by running it (D-041): it read the code host
   * correctly, then tried `Write`, then tried `Bash cat >`, was refused both,
   * and ended by explaining it had no way to record what it had found. The
   * whole run was billed.
   *
   * Bash counts, because a role holding it can `cat >` its way to a file —
   * `analyst` delivers that way and is coherent, if inelegant.
   */
  it('gives every role some way to write its own result', () => {
    for (const role of roles) {
      const tools = mapTools(role.tools);
      expect(
        tools.includes('Write') || tools.includes('Bash'),
        `${role.name} has no way to write RESULT.md: ${tools.join(', ') || '(none)'}`,
      ).toBe(true);
    }
  });

  it('ships six generalist jobs and seven generalist abilities', () => {
    expect(roles.map((r) => r.name).sort()).toEqual([
      'analyst',
      'designer',
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
      'see-your-work',
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

  /**
   * This test is the canary for adding a role or a skill, and it earned that
   * on 2026-08-07: shipping `designer` and `see-your-work` sent "look into how
   * the payment code works" to `mason`. Nothing about scout changed — BM25's
   * idf is corpus-relative, and scout had been winning that sentence 0.750 to
   * 0.740. Either new document alone was enough to tip it.
   *
   * So the fix was not to reword the newcomer, which only postpones it until
   * the role after next. Scout now *says* it explains how existing code works,
   * and owns the sentence on its own words rather than on a hundredth of a
   * point. If you add a role and this test fails, that is the same signal:
   * some role is winning by a margin too thin to survive company.
   */
  it('every job is reachable from something a person would say', () => {
    const reach: [string, string][] = [
      ['write the documentation for my project', 'scribe'],
      ['fix the bugs in my code', 'mason'],
      ['look into how the payment code works', 'scout'],
      ['go through my spreadsheet and total the invoices', 'analyst'],
      ['someone who can do a bit of anything', 'worker'],
      ['design a world for this level', 'designer'],
      ['make the layout look better', 'designer'],
    ];
    for (const [text, expected] of reach) {
      const result = suggest(text);
      expect(result.role, `"${text}"`).toBe(expected);
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    }
  });

  /**
   * This used to be "design me a logo and pick brand colours", and that is
   * exactly what shipping a designer overturned — it now reaches `designer`,
   * correctly. The assertion is still worth keeping, so it moved to work the
   * crew genuinely has no role for.
   */
  it('still declines what the starter set genuinely cannot do', () => {
    const result = suggest('negotiate my rent with the landlord');
    expect(result.role).toBeNull();
    expect(result.gaps.length).toBeGreaterThan(0);
  });
});
