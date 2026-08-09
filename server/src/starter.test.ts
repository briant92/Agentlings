import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import { mapTools, turnCapFor, turnsForBudget } from './executors/claude';
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

  it('ships seven generalist jobs and twelve abilities', () => {
    expect(roles.map((r) => r.name).sort()).toEqual([
      'analyst',
      'architect',
      'designer',
      'mason',
      'scout',
      'scribe',
      'worker',
    ]);
    expect(skills.map((s) => s.name).sort()).toEqual([
      // architecture-blueprints is P1 of the expansion plan: C4 views as
      // mermaid fences whose every box traces to a real file.
      'architecture-blueprints',
      // authoring-a-level-pack is the first crew-authored skill: written by a
      // training-ground run from the pack sources (job 9524e59b, 2026-08-07),
      // previewed, then installed to the designer role.
      'authoring-a-level-pack',
      'check-your-work',
      'cite-sources',
      'concise-reports',
      // The studio three (EXPANSION P2): deck-design and pdf-report ride
      // designer; document-design and pdf-report ride scribe, which gained
      // bash the same day — a role without a shell cannot run the docx
      // call shapes the brief hands it.
      'deck-design',
      'document-design',
      'pdf-report',
      'plain-language',
      'see-your-work',
      'small-diffs',
      'tables-and-numbers',
    ]);
  });

  /**
   * A new job class has no cost history, and `turnsForBudget` falls back to
   * the role's own cap when it cannot price a turn — so a role that states no
   * `maxTurns` gets the 10-turn default precisely when it is newest.
   *
   * Found by running it (2026-08-07, job b0cfc30c). Giving authoring its own
   * `designer` class fixed a quote that had been 3x low, and in the same move
   * took the run's budget from 40 turns to 10, because the 40 had been coming
   * from `worker`'s fifty-odd rows of rate. The first designer run was cut
   * holding a finished, valid, rather good pack — D-095's shape through a new
   * door: the tag meant to help took away what was helping.
   *
   * 20 is above the 17 that the one uncut authoring run took. It binds only
   * while the class is new: `turnCapFor` returns a role cap as *not* firm, so
   * a funded budget outranks it in both directions the moment rows exist.
   */
  it('gives a new role enough turns to finish the work it was made for', () => {
    for (const role of roles) {
      const cap = turnCapFor(role);
      expect(cap.firm, `${role.name}'s standing cap must never outrank a quote`).toBe(false);
      // With no rate to price a turn, the standing cap is the whole budget.
      expect(turnsForBudget(2, { samples: 0, usd: 0 }, cap)).toBe(cap.turns);
    }
    expect(turnCapFor(registry.get('designer')).turns).toBe(20);
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
      ['draw an architecture blueprint of this system', 'architect'],
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
