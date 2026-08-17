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

  it('ships nine generalist jobs and sixteen abilities', () => {
    expect(roles.map((r) => r.name).sort()).toEqual([
      'analyst',
      'architect',
      // clerk works the reading desks (D-158): calendar briefs on Haiku, its
      // own price class from day one, uncompilable work by construction.
      'clerk',
      'designer',
      'mason',
      // researcher is P3: deep multi-source research on the default model
      // with a longer wall (timeoutMinutes 25) — scout stays the cheap
      // errand-reader on Haiku; the reach rows below keep them apart.
      'researcher',
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
      // data-analysis is EXPANSION P4: the analyst computes in a kept script
      // and draws the result as a plain SVG the review shows inline. The
      // analyst gained `write` the same day — the docx/script call shapes
      // need a real file, not a bash heredoc (the scribe precedent, D-128).
      'data-analysis',
      // The studio three (EXPANSION P2): deck-design and pdf-report ride
      // designer; document-design and pdf-report ride scribe, which gained
      // bash the same day — a role without a shell cannot run the docx
      // call shapes the brief hands it.
      'deck-design',
      'deep-research',
      'document-design',
      // organizing-folders is EXPANSION P5 (D-132): worker proposes a
      // MOVES.json reorganization of a real folder, replayed at Approve.
      'organizing-folders',
      'pdf-report',
      'plain-language',
      // plate-design is D-143: the designer authors a pre-rendered 3D
      // backdrop with three.js through render_plate, reads the PNG back,
      // and delivers it in a PACK.json world whose plates Approve copies.
      'plate-design',
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
      ['do deep research on the european drone delivery market', 'researcher'],
      ['brief me on my calendar this morning', 'clerk'],
    ];
    for (const [text, expected] of reach) {
      const result = suggest(text);
      expect(result.role, `"${text}"`).toBe(expected);
      expect(result.confidence).toBeGreaterThanOrEqual(MIN_CONFIDENCE);
    }
  });

  /**
   * The reach row above proves the clerk wins the sentence; this proves it
   * wins it on the desk's own word. Measured while writing it: with
   * "calendar" stripped from the role file the row still passed at 0.41,
   * riding on "brief" alone — researcher-adjacent vocabulary, a margin too
   * thin to survive the next catalog change. The desk trade's anchor is
   * "calendar", so a clerk that no longer says it must fail here rather
   * than coast.
   */
  it('the clerk wins its desk sentence on the calendar word, not on "brief" alone', () => {
    const result = suggest('brief me on my calendar this morning');
    expect(result.role).toBe('clerk');
    expect(result.matchedTerms).toContain('calendar');
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
