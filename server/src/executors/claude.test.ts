import { mkdirSync, mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { LEASH_CREDIBLE_UP_TO } from '../recipes';
import {
  closeOutEvidence,
  COMPILE_TURNS,
  RECIPE_TURNS,
  repoListing,
  turnCapFor,
  turnsFor,
  turnsForBudget,
  withCostKnown,
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
    expect(turnCapFor(undefined, { oneShot: true })).toEqual({ turns: 5, firm: true });
  });

  // Still shorter than a cold run, which is the entire point of the tier.
  it('keeps the leash short even for a role that asks to explore', () => {
    expect(turnCapFor({ maxTurns: 20 }, { oneShot: true }).turns).toBe(5);
    expect(turnCapFor({ maxTurns: 20 }, { oneShot: true }).turns).toBeLessThan(
      turnCapFor({ maxTurns: 20 }, undefined).turns,
    );
  });

  // `firm: false` is the whole of D-067: a role's budget is a standing guess
  // about a trade, so a quote computed for this job outranks it. The leash and
  // a compile's own cap are decisions about this run and stay firm.
  it('leaves work without a recipe on the role’s own budget, softly', () => {
    expect(turnCapFor(undefined, {})).toEqual({ turns: 10, firm: false });
    expect(turnCapFor(undefined, undefined).turns).toBe(10);
    expect(turnCapFor({ maxTurns: 20 }, undefined)).toEqual({ turns: 20, firm: false });
  });

  it('still lets the quote tighten a recipe run further', () => {
    const cap = turnCapFor(undefined, { oneShot: true });
    expect(turnsForBudget(0.05, { samples: 3, usd: 0.025 }, cap)).toBe(2);
  });

  // A compile is long work handed to whichever role owns the recipe, so the
  // need belongs to the job rather than the worker — otherwise every role
  // would have to raise its everyday budget to accommodate one errand.
  it('lets a job that states its own need outrank the role', () => {
    expect(turnCapFor({ maxTurns: 30 }, undefined, COMPILE_TURNS)).toEqual({
      turns: COMPILE_TURNS,
      firm: true,
    });
    expect(turnCapFor({ maxTurns: 2 }, undefined, COMPILE_TURNS).turns).toBe(COMPILE_TURNS);
    expect(turnCapFor({ maxTurns: 20 }, undefined, 12).turns).toBe(12);
  });

  // A job the crew has a recipe for is one it has done before, whatever the
  // job claims to need — otherwise a compile's cap would leak into a repeat.
  it('keeps the recipe leash above a job’s own claim', () => {
    expect(turnCapFor({ maxTurns: 10 }, { oneShot: true }, COMPILE_TURNS).turns).toBe(5);
  });

  it('ignores a nonsense job cap rather than uncapping the loop', () => {
    expect(turnCapFor(undefined, undefined, 0).turns).toBe(10);
    expect(turnCapFor(undefined, undefined, -3).turns).toBe(10);
    expect(turnCapFor(undefined, undefined, Number.NaN).turns).toBe(10);
    expect(turnCapFor(undefined, undefined, 5000).turns).toBe(40);
  });

  // Measured rather than assumed: a compile at 15 ran out too and cost 40%
  // more than the one at 10 for the same outcome. The point of the constant is
  // that a compile states its own budget instead of inheriting whatever the
  // role that owns the recipe happens to ask for.
  it('pins a compile to its own budget rather than the role’s', () => {
    expect(turnCapFor({ maxTurns: 30 }, undefined, COMPILE_TURNS).turns).not.toBe(
      turnsFor({ maxTurns: 30 }),
    );
  });
});

describe('turnsForBudget', () => {
  /** A role's standing guess about a trade. Yields to a quote. */
  const role = { turns: 8, firm: false };
  /** A decision about this run — the leash, or a compile's own need. */
  const firm = { turns: 8, firm: true };

  it('spends the ceiling at the observed rate', () => {
    expect(turnsForBudget(0.2, { samples: 3, usd: 0.02 }, role)).toBe(10);
    expect(turnsForBudget(0.12, { samples: 3, usd: 0.02 }, role)).toBe(6);
  });

  it('tightens the loop when the money is short, whatever kind of cap it is', () => {
    expect(turnsForBudget(0.1, { samples: 3, usd: 0.03 }, role)).toBe(3);
    expect(turnsForBudget(0.1, { samples: 3, usd: 0.03 }, firm)).toBe(3);
  });

  /**
   * The rule this replaced, and the four runs that bought the change.
   *
   * "Never buy more turns than the role allows" was written when the per-turn
   * rate was pooled across repo and no-repo work and predicted neither, so the
   * cap always won and the ceiling could never bind (D-018). The rate has been
   * per-shape since. What was left was a standing guess about a trade beating
   * an estimate computed for the job: four runs of one sentence, each quoted
   * $1.58, each held to `worker`'s 10, each killed having delivered (D-066).
   */
  it('lets a quote buy more turns than the role would have allowed', () => {
    expect(turnsForBudget(0.5, { samples: 3, usd: 0.02 }, role)).toBe(25);
    // The job that paid for this: $1.58 at its measured 6.6c a turn.
    expect(turnsForBudget(1.58, { samples: 3, usd: 0.066 }, { turns: 10, firm: false })).toBe(23);
  });

  // A firm cap is a decision about this run, not a guess about a trade. The
  // one-shot tier *is* its five turns; a rich quote that could stretch them
  // would dissolve the tier rather than fund it.
  it('never lets a quote stretch a firm cap', () => {
    expect(turnsForBudget(100, { samples: 5, usd: 0.001 }, firm)).toBe(8);
    expect(turnsForBudget(100, { samples: 5, usd: 0.001 }, { turns: 5, firm: true })).toBe(5);
  });

  // The clamp that stops a cheap rate and a rich quote from uncapping the loop
  // between them. 100 ÷ 0.001 is 100,000 turns.
  it('still clamps a soft cap at the hard ceiling', () => {
    expect(turnsForBudget(100, { samples: 5, usd: 0.001 }, role)).toBe(40);
  });

  it('leaves the cap in charge when there is no history to price a turn', () => {
    expect(turnsForBudget(0.2, { samples: 0, usd: 0 }, role)).toBe(8);
    expect(turnsForBudget(undefined, { samples: 3, usd: 0.02 }, role)).toBe(8);
  });

  it('still allows one turn when the budget cannot even buy that', () => {
    // Better to run once and fail on its own terms than to start a session
    // that is forbidden to think at all.
    expect(turnsForBudget(0.001, { samples: 3, usd: 0.5 }, role)).toBe(1);
  });
});

/**
 * `LEASH_CREDIBLE_UP_TO` is twice the leash, and cannot say so in code:
 * `recipes.ts` importing the executor closes a cycle (claude → router →
 * recipes) and the module initialises half-built. This test is the join — a
 * test file is a leaf and may import both.
 */
describe('the leash and the bound that judges it', () => {
  it('keeps the credible bound at twice the leash', () => {
    expect(LEASH_CREDIBLE_UP_TO).toBe(RECIPE_TURNS * 2);
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
import {
  buildAppend,
  gateOutside,
  mapTools,
  parseLesson,
  sessionPrompt,
  toolLine,
} from './claude';

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

// The registry is meant to be the only door outside. It was not: allowedTools
// came from the role alone, so scout's `web_fetch` reached the network through
// the SDK's own tool whatever Settings said.
describe('gateOutside', () => {
  it('keeps the web tools when the connection was granted', () => {
    expect(gateOutside(['Read', 'WebFetch', 'WebSearch'], ['web'])).toEqual([
      'Read',
      'WebFetch',
      'WebSearch',
    ]);
  });

  it('drops them when it was not', () => {
    expect(gateOutside(['Read', 'WebFetch', 'WebSearch'], [])).toEqual(['Read']);
  });

  it('never touches a tool that stays inside the sandbox', () => {
    const inside = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob', 'Skill'];
    expect(gateOutside(inside, [])).toEqual(inside);
  });

  // Correct rather than a fault: it cannot reach anything, which is the answer.
  it('leaves a role with nothing but outside tools holding none', () => {
    expect(gateOutside(mapTools(['web_fetch']), [])).toEqual([]);
  });

  it('gates the real scout role, which is where this was found', () => {
    expect(gateOutside(mapTools(['read', 'grep', 'web_fetch']), ['web'])).toContain('WebFetch');
    expect(gateOutside(mapTools(['read', 'grep', 'web_fetch']), [])).not.toContain('WebFetch');
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
  // rmSync cannot outwait a Windows file lock — see ./carry.test.ts.
  afterEach(() =>
    rm(root, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

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

// A death before the SDK's result message leaves real money with no number
// against it. Recorded as zero, the ledger reads as though the run were free —
// and the runs that die this way are the longest ones there are.
describe('withCostKnown', () => {
  it('marks a measured run alone', () => {
    expect(withCostKnown({ costUsd: 0.42, turns: 6 })).toEqual({ costUsd: 0.42, turns: 6 });
  });

  it('flags a run nothing measured', () => {
    expect(withCostKnown({ turnsAllowed: 10 })).toEqual({
      turnsAllowed: 10,
      costUnknown: true,
    });
  });

  // Measured on job a7b277d3: ten minutes of turns, filed as costing nothing,
  // because the close-out's own spend was the only number present.
  it('is not fooled by the write-up having a cost of its own', () => {
    expect(withCostKnown({ turnsAllowed: 10, closeOutUsd: 0.02 })).toMatchObject({
      costUnknown: true,
    });
  });

  it('treats a genuine zero as measured, not missing', () => {
    expect(withCostKnown({ costUsd: 0 }).costUnknown).toBeUndefined();
  });
});

describe('sessionPrompt', () => {
  const base = {
    id: 'j1',
    title: 'Tidy the errors',
    prompt: 'tighten up the error handling',
    status: 'queued' as const,
    slot: 0,
    createdAt: 0,
  };

  it('is the title and the prompt when nothing was settled up front', () => {
    expect(sessionPrompt(base)).toBe('Job: Tidy the errors\n\ntighten up the error handling');
  });

  it('adds what the user settled, without touching the prompt itself', () => {
    const text = sessionPrompt({
      ...base,
      clarifications: ['Which file? server/src/ledger.ts', 'How far? Do the clearest cases.'],
    });
    expect(text).toContain('tighten up the error handling');
    expect(text).toContain('- Which file? server/src/ledger.ts');
    expect(text).toContain('- How far? Do the clearest cases.');
  });

  it('adds nothing at all for an empty list, so the prompt is byte-identical', () => {
    expect(sessionPrompt({ ...base, clarifications: [] })).toBe(sessionPrompt(base));
  });

  // Job ca5db1b4: the card's ellipsis reached the session, the model read it
  // as a truncated message and asked the user to repeat themselves. One turn,
  // 1.4c, no work.
  it('never shows the session a title that trails off', () => {
    const job = {
      ...base,
      title: 'I need someone to look up Buydepa and summarize…',
      prompt: 'I need someone to look up Buydepa and summarize what the company does',
    };
    expect(sessionPrompt(job)).toBe(job.prompt);
    expect(sessionPrompt(job)).not.toContain('…');
  });

  it('drops a title that only repeats the opening of the prompt', () => {
    const job = { ...base, title: 'Tighten up the error handling', prompt: base.prompt };
    expect(sessionPrompt(job)).toBe(base.prompt);
  });

  it('keeps a title someone wrote separately, which says something the prompt does not', () => {
    expect(sessionPrompt(base)).toBe('Job: Tidy the errors\n\ntighten up the error handling');
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

  // A library nobody is told about is not a capability. Watched live, an
  // agentling asked for a PDF hand-assembled the bytes over several turns
  // because it had no idea pdf-lib was installed — and it worked, which is
  // what made it expensive rather than obviously wrong.
  it('tells every job which document libraries are already there', () => {
    const text = buildAppend(undefined, [], [], false);
    for (const lib of ['docx', 'mammoth', 'exceljs', 'pptxgenjs', 'pdf-lib', 'pdf-parse']) {
      expect(text).toContain(lib);
    }
    expect(text).toContain('never npm install');
  });

  // Inputs live in ./input the way the clone lives in ./repo, and the session
  // has to be told — an attached file nobody mentions is a file nobody reads.
  it('points the session at the files the user attached', () => {
    const text = buildAppend(undefined, [], [], false, [], undefined, [], [
      { name: 'contract.pdf', bytes: 240 * 1024 },
      { name: 'figures.xlsx', bytes: 12 * 1024 },
    ]);
    expect(text).toContain('input/contract.pdf');
    expect(text).toContain('input/figures.xlsx');
    expect(text).toContain('240 KB');
    expect(text).toContain('do not go looking elsewhere');
  });

  it('says nothing about attachments when there are none', () => {
    expect(buildAppend(undefined, [], [], false)).not.toContain('Files the user attached');
  });

  // Guessing a call shape costs a turn, and pdf-parse reads like the function
  // it used to be while now being a class.
  it('gives the call shape, not just the name', () => {
    const text = buildAppend(undefined, [], [], false);
    expect(text).toContain('Packer.toBuffer');
    expect(text).toContain('new PDFParse(');
    expect(text).toContain('PDFDocument.load');
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

  // Job 97b95f10 spent all ten turns gathering and wrote nothing, so it filed
  // `failed` with an empty sandbox and no close-out ran on it. A run that is
  // never told it has a budget cannot ration one.
  describe('the turn budget', () => {
    const budgeted = () => buildAppend(undefined, [], [], false, [], undefined, [], [], 10);

    it('tells the run how many turns it has', () => {
      expect(budgeted()).toContain('You have 10 turns');
    });

    it('asks for RESULT.md early rather than at the end', () => {
      const text = budgeted();
      expect(text).toContain('as soon as you have anything worth reporting');
      // The instruction it replaced. Both at once is a brief that argues with
      // itself, which is worse than either alone.
      expect(text).not.toContain('When finished, write RESULT.md');
    });

    it('asks a run that stops short to say what is missing', () => {
      expect(budgeted()).toContain('what is still missing');
    });

    it('says nothing about turns when the budget is unknown', () => {
      const text = buildAppend(undefined, [], [], false);
      expect(text).not.toContain('turns');
      // The deliverable is still demanded — the budget is what is optional.
      expect(text).toContain('RESULT.md');
    });
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
  afterEach(() =>
    rm(dir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

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

  // Found live on job 2ff16bf2: a run with no repository wrote a working PDF
  // and spent its last turn doing it, so there was no RESULT.md and no diff —
  // and the crew banked nothing at all from a job that had delivered.
  it('names what a run produced when there is no repository', () => {
    writeFileSync(path.join(dir, 'hello-world.pdf'), '%PDF-1.4\n');
    writeFileSync(path.join(dir, 'make-pdf.cjs'), 'console.log(1)\n');
    const evidence = closeOutEvidence(dir);
    expect(evidence).toContain('hello-world.pdf');
    expect(evidence).toContain('make-pdf.cjs');
  });

  it('describes the deliverable without quoting it', () => {
    writeFileSync(path.join(dir, 'answer.md'), 'The secret is 42.');
    const evidence = closeOutEvidence(dir);
    expect(evidence).toContain('answer.md');
    expect(evidence).not.toContain('42');
  });

  it('ignores the session config every run leaves behind', () => {
    writeFileSync(path.join(dir, '.session.json'), '{}');
    expect(closeOutEvidence(dir)).toBeNull();
  });

  it('does not list the report and the diff twice', () => {
    writeFileSync(path.join(dir, 'RESULT.md'), '# Done\n');
    writeFileSync(path.join(dir, 'DIFF.patch'), 'diff --git a/x.ts b/x.ts\n');
    expect(closeOutEvidence(dir)).not.toContain('Files it produced');
  });
});
