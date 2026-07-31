import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import {
  closeOutEvidence,
  COMPILE_TURNS,
  repoListing,
  turnCapFor,
  turnsFor,
  turnsForBudget,
} from './claude';

describe('turnCapFor', () => {
  // Was 1, which cannot work: a single turn ends before the model sees any
  // tool result, so a job that must read before it writes never even starts.
  // Measured at 1 turn it produced no files and cost more than the full
  // session it replaced.
  // Was 3, and all thirteen recipe runs on record ran out of it. A run that
  // runs out never counts toward the successes a tool is promoted on, so a
  // leash that always breaks leaves the fourth tier unreachable.
  it('gives a recipe job a leash it can actually finish on', () => {
    expect(turnCapFor(undefined, { oneShot: true })).toBe(5);
  });

  // Still shorter than a cold run, which is the entire point of the tier.
  it('keeps the leash short even for a role that asks to explore', () => {
    expect(turnCapFor({ maxTurns: 20 }, { oneShot: true })).toBe(5);
    expect(turnCapFor({ maxTurns: 20 }, { oneShot: true })).toBeLessThan(
      turnCapFor({ maxTurns: 20 }, undefined),
    );
  });

  it('leaves work without a recipe on the role’s own budget', () => {
    expect(turnCapFor(undefined, {})).toBe(10);
    expect(turnCapFor(undefined, undefined)).toBe(10);
    expect(turnCapFor({ maxTurns: 20 }, undefined)).toBe(20);
  });

  it('still lets the quote tighten a recipe run further', () => {
    const cap = turnCapFor(undefined, { oneShot: true });
    expect(turnsForBudget(0.05, { samples: 3, usd: 0.025 }, cap)).toBe(2);
  });

  // A compile is long work handed to whichever role owns the recipe, so the
  // need belongs to the job rather than the worker — otherwise every role
  // would have to raise its everyday budget to accommodate one errand.
  it('lets a job that states its own need outrank the role', () => {
    expect(turnCapFor(undefined, undefined, COMPILE_TURNS)).toBe(15);
    expect(turnCapFor({ maxTurns: 10 }, undefined, COMPILE_TURNS)).toBe(15);
    expect(turnCapFor({ maxTurns: 20 }, undefined, 12)).toBe(12);
  });

  // A job the crew has a recipe for is one it has done before, whatever the
  // job claims to need — otherwise a compile's cap would leak into a repeat.
  it('keeps the recipe leash above a job’s own claim', () => {
    expect(turnCapFor({ maxTurns: 10 }, { oneShot: true }, COMPILE_TURNS)).toBe(5);
  });

  it('ignores a nonsense job cap rather than uncapping the loop', () => {
    expect(turnCapFor(undefined, undefined, 0)).toBe(10);
    expect(turnCapFor(undefined, undefined, -3)).toBe(10);
    expect(turnCapFor(undefined, undefined, Number.NaN)).toBe(10);
    expect(turnCapFor(undefined, undefined, 5000)).toBe(40);
  });

  // Both compiles on record broke a cap of 10 — the number is only useful if
  // it is meaningfully above the one that failed.
  it('gives a compile more room than the cap both compiles broke', () => {
    expect(COMPILE_TURNS).toBeGreaterThan(turnsFor(undefined));
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

  // The run that exposed all this: quoted 30c, priced off a rate pooled
  // across repo and non-repo work at 1.8c a turn, so the budget came out at
  // 17 turns, the role cap of 8 won, and it spent 59c. Priced at what its own
  // shape really costs, the ceiling bites first and the cap never applies.
  it('binds before the role cap once the rate reflects the work', () => {
    expect(turnsForBudget(0.5, { samples: 3, usd: 0.0177 }, roleTurns)).toBe(8);
    expect(turnsForBudget(0.5, { samples: 1, usd: 0.0742 }, roleTurns)).toBe(6);
  });

  it('still allows one turn when the budget cannot even buy that', () => {
    // Better to run once and fail on its own terms than to start a session
    // that is forbidden to think at all.
    expect(turnsForBudget(0.001, { samples: 3, usd: 0.5 }, roleTurns)).toBe(1);
  });
});

describe('turnsFor', () => {
  // Tight, but not tighter than the work: 8 was right while the session also
  // wrote its own notes, and one short once the close-out took that over.
  it('keeps a tight default when a role says nothing', () => {
    expect(turnsFor(undefined)).toBe(10);
    expect(turnsFor({})).toBe(10);
  });

  it('lets a role that must explore ask for more', () => {
    expect(turnsFor({ maxTurns: 20 })).toBe(20);
  });

  it('clamps a runaway value rather than trusting it', () => {
    expect(turnsFor({ maxTurns: 5000 })).toBe(40);
  });

  it('ignores nonsense instead of uncapping the loop', () => {
    expect(turnsFor({ maxTurns: 0 })).toBe(10);
    expect(turnsFor({ maxTurns: -3 })).toBe(10);
    expect(turnsFor({ maxTurns: Number.NaN })).toBe(10);
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

// Watched live, every repo run opened with `ls` before doing anything. On a
// three-turn leash that orientation turn was the difference between landing
// the edit and running out of turns.
describe('repoListing', () => {
  let root: string;

  beforeEach(() => {
    root = mkdtempSync(path.join(tmpdir(), 'agentlings-listing-'));
  });
  afterEach(() => rmSync(root, { recursive: true, force: true }));

  it('lists files, nested ones included, with repo-relative paths', () => {
    mkdirSync(path.join(root, 'src'), { recursive: true });
    writeFileSync(path.join(root, 'a.js'), '');
    writeFileSync(path.join(root, 'src', 'b.js'), '');
    expect(repoListing(root)).toEqual(['a.js', 'src/b.js']);
  });

  it('skips the noise that would fill the listing', () => {
    mkdirSync(path.join(root, '.git'), { recursive: true });
    mkdirSync(path.join(root, 'node_modules', 'x'), { recursive: true });
    writeFileSync(path.join(root, '.git', 'HEAD'), '');
    writeFileSync(path.join(root, 'node_modules', 'x', 'index.js'), '');
    writeFileSync(path.join(root, 'real.js'), '');
    expect(repoListing(root)).toEqual(['real.js']);
  });

  it('stops at the limit rather than pasting a whole repository', () => {
    for (let i = 0; i < 10; i++) writeFileSync(path.join(root, `f${i}.js`), '');
    expect(repoListing(root, 4)).toHaveLength(4);
  });

  it('returns nothing for a directory that is not there', () => {
    expect(repoListing(path.join(root, 'missing'))).toEqual([]);
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
    expect(text).toContain('RESULT.md');
  });

  it('falls back to a generic persona without a role', () => {
    expect(buildAppend(undefined, [], [], false)).toContain('general-purpose worker');
  });

  it('hands over the repo listing so the run need not go looking', () => {
    const text = buildAppend(undefined, [], [], true, [], undefined, ['a.js', 'src/b.js']);
    expect(text).toContain('repo/a.js');
    expect(text).toContain('repo/src/b.js');
    expect(text).toContain('do not list the directory');
  });

  it('says nothing about a listing when there is no repository', () => {
    expect(buildAppend(undefined, [], [], false)).not.toContain('What is in ./repo');
  });

  // A recipe run has three turns. Spending one of them writing down the
  // method it was just handed is the difference between finishing and not.
  describe('a run that came from a recipe', () => {
    const fromRecipe = () => buildAppend(undefined, [], [], true, [], 'read it, then edit it');

    it('still has to report what it did', () => {
      expect(fromRecipe()).toContain('RESULT.md');
    });

    it('is not asked to write down the method it was just given', () => {
      expect(fromRecipe()).not.toContain('APPROACH.md');
      expect(fromRecipe()).not.toContain('LESSON.md');
    });

    it('is handed the method to follow', () => {
      expect(fromRecipe()).toContain('read it, then edit it');
      expect(fromRecipe()).toContain('Do not re-explore');
    });

    // Nor is a cold job. The write-up used to compete with the work for turns
    // and lost every time — 13 of 13 recipe runs died before writing it — so
    // it moved out to a close-out pass that runs after the session, off a
    // cheap model, on what the run actually left behind.
    it('asks no job for the write-up, since that is the close-out pass now', () => {
      const cold = buildAppend(undefined, [], [], true);
      expect(cold).toContain('RESULT.md');
      expect(cold).not.toContain('LESSON.md');
      expect(cold).not.toContain('APPROACH.md');
    });
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

describe('closeOutEvidence', () => {
  let dir: string;
  beforeEach(() => {
    dir = mkdtempSync(path.join(tmpdir(), 'agentlings-closeout-'));
  });
  afterEach(() => rmSync(dir, { recursive: true, force: true }));

  it('says nothing when the run left nothing behind', () => {
    expect(closeOutEvidence(dir)).toBeNull();
  });

  it('carries the run’s own report', () => {
    writeFileSync(path.join(dir, 'RESULT.md'), '# Done\n\nAdded the tests.');
    expect(closeOutEvidence(dir)).toContain('Added the tests.');
  });

  // The names, never the patch. The whole point of a separate pass is that it
  // costs about a cent, and a diff is what makes a turn expensive.
  it('names the files it changed without quoting the diff', () => {
    writeFileSync(
      path.join(dir, 'DIFF.patch'),
      [
        'diff --git a/server/src/estimate.ts b/server/src/estimate.ts',
        '--- a/server/src/estimate.ts',
        '+++ b/server/src/estimate.ts',
        '@@ -1 +1 @@',
        '-const SECRET_SAUCE = 1;',
        '+const SECRET_SAUCE = 2;',
      ].join('\n'),
    );
    const evidence = closeOutEvidence(dir);
    expect(evidence).toContain('server/src/estimate.ts');
    expect(evidence).not.toContain('SECRET_SAUCE');
  });
});
