import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Agentling, Job } from '@agentlings/shared';
import {
  TOOL_CANDIDATE_RUNS,
  readRecipes,
  readToolCandidates,
  writeRecipes,
  type Recipe,
} from '../recipes';
import type { SearchResult } from '../search';
import { STALE_MS, writeIndex } from '../store';
import { RUN_SCRIPT, VERIFY_SCRIPT, readTools, toolDir, writeTool } from '../tools';
import { CANCELLED, SessionFailure } from './claude';
import type { Executor, ExecutorResult, RunHint } from './executor';
import { RoutedExecutor } from './routed';

/**
 * The routed layer is the seam between free work and paid work, so what these
 * tests watch is which side of it a job lands on: every case asserts whether a
 * session ran at all, and what the recipes file looks like afterwards.
 */

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'A job',
    prompt: 'do something nobody has done before',
    status: 'queued',
    slot: 0,
    createdAt: 0,
    ...over,
  };
}

const PIP: Agentling = {
  id: 'a1',
  name: 'Pip',
  color: 0x8ab060,
  state: 'working',
  x: 0,
  targetX: 0,
  role: 'worker',
  jobsDone: 0,
  jobsFailed: 0,
};

const KNOWLEDGE = [
  '2026-07-01 · Ivy (scribe) delivered "Document the payment flow" — the retry logic lives in queue.ts',
  '2026-07-02 · Pip (worker) delivered "Fix login" — sessions expire after 30 days',
];

/** Stands in for the session executor: records what it was handed, runs nothing. */
class FakeSession implements Executor {
  runs: { job: Job; sandboxDir: string; agentling?: Agentling; hint?: RunHint }[] = [];
  cancelled: string[] = [];

  constructor(
    private result: ExecutorResult = { summary: 'a session did it' },
    private cancelResult: boolean | null = null,
  ) {}

  async run(
    j: Job,
    sandboxDir: string,
    _onProgress?: (detail: string) => void,
    agentling?: Agentling,
    hint?: RunHint,
  ): Promise<ExecutorResult> {
    this.runs.push({ job: j, sandboxDir, agentling, hint });
    return this.result;
  }

  cancel(jobId: string): boolean {
    if (this.cancelResult === null) throw new Error('this fake has no cancel');
    this.cancelled.push(jobId);
    return this.cancelResult;
  }
}

/** A session that spent its turns and died still holding what it wrote down. */
class DyingSession implements Executor {
  runs: Job[] = [];

  constructor(private failure: SessionFailure) {}

  async run(j: Job): Promise<ExecutorResult> {
    this.runs.push(j);
    throw this.failure;
  }
}

describe('RoutedExecutor', () => {
  let levelDir: string;
  let sandboxDir: string;
  let progress: string[];

  beforeEach(() => {
    const root = mkdtempSync(path.join(tmpdir(), 'agentlings-routed-'));
    levelDir = path.join(root, 'level');
    sandboxDir = mkdtempSync(path.join(tmpdir(), 'agentlings-sandbox-'));
    progress = [];
  });

  // rmSync cannot outwait a Windows file lock — see ./carry.test.ts.
  afterEach(async () => {
    const opts = { recursive: true, force: true, maxRetries: 10, retryDelay: 50 };
    await rm(path.dirname(levelDir), opts).catch(() => {});
    await rm(sandboxDir, opts).catch(() => {});
  });

  function build(
    fallback: Executor,
    over: {
      knowledge?: string[];
      web?: { allow?: string[]; maxChars?: number } | null;
      /** Absent by default, which is how a level with no key behaves. */
      search?: (query: string) => Promise<SearchResult>;
    } = {},
  ): RoutedExecutor {
    return new RoutedExecutor(
      levelDir,
      () => over.knowledge ?? KNOWLEDGE,
      () => over.web ?? null,
      // The fixtures declare `capabilities: []`, so a run here counts as the
      // same surface and the leash behaviour under test is unchanged.
      () => [],
      fallback,
      over.search,
    );
  }

  const result = () => readFileSync(path.join(sandboxDir, 'RESULT.md'), 'utf8');
  const run = (executor: RoutedExecutor, j: Job, agentling?: Agentling) =>
    executor.run(j, sandboxDir, (detail) => progress.push(detail), agentling);

  /**
   * The send the desk already holds whole (D-097). Both facts are in hand and
   * the words were promised to go as written, so composing is copying two
   * strings into the file a session would have written — and the job must
   * never reach one. Measured on job 470d7389: 32.4¢ and two minutes to put
   * "A DARLE" in an outbox, with an emoji added on the way through.
   */
  describe('a send the desk holds whole', () => {
    const composed = () =>
      job({
        prompt: 'I need to send a Telegram to Pepo',
        channel: 'telegram',
        send: { to: 'Jose Dussaillant — 6783316106', words: 'A DARLE' },
      });
    const outbox = () => JSON.parse(readFileSync(path.join(sandboxDir, 'OUTBOX.json'), 'utf8'));

    it('writes the outbox and never starts a session', async () => {
      const session = new FakeSession();
      const out = await run(build(session), composed(), PIP);

      expect(session.runs).toHaveLength(0);
      expect(out.meter).toEqual({ costUsd: 0, turns: 0, routed: true });
      expect(outbox()).toEqual({
        channel: 'telegram',
        messages: [{ to: '6783316106', body: 'A DARLE', name: 'Jose Dussaillant' }],
      });
    });

    /** The whole point: what goes out is what was typed, to the character. */
    it('sends the words unchanged', async () => {
      await run(build(new FakeSession()), composed(), PIP);
      expect(outbox().messages[0].body).toBe('A DARLE');
    });

    it('shows the message in RESULT.md, so review reads without opening a file', async () => {
      await run(build(new FakeSession()), composed(), PIP);
      expect(result()).toContain('A DARLE');
      expect(result()).toContain('6783316106');
    });

    it('says why it needed no session', async () => {
      await run(build(new FakeSession()), composed(), PIP);
      expect(progress.join(' ')).toContain('composed without a session');
    });

    /**
     * Nothing here sends. The outbox is written exactly as a run writes one,
     * and approval remains the send (D-075) — this tier changes who composed
     * it, not when it goes.
     */
    it('leaves the sending to approval', async () => {
      const out = await run(build(new FakeSession()), composed(), PIP);
      expect(out.summary).toContain('Ready to send');
      expect(existsSync(path.join(sandboxDir, 'sent.json'))).toBe(false);
    });

    // A contract the composer cannot satisfy is a reason to pay for a run
    // that can explain itself, not a reason to fail the job.
    it('falls through to a session when the contract refuses', async () => {
      const session = new FakeSession();
      await run(
        build(session),
        job({
          prompt: 'I need to send a Telegram to Pepo',
          channel: 'telegram',
          // Over the body cap — the one refusal a real desk can produce,
          // since the words are free text and nothing upstream limits them.
          send: { to: '6783316106', words: 'x'.repeat(5000) },
        }),
        PIP,
      );
      expect(session.runs).toHaveLength(1);
      expect(progress.join(' ')).toContain('could not compose it');
    });

    it('stays a session when the desk holds only half of it', async () => {
      const session = new FakeSession();
      await run(build(session), job({ prompt: 'I need to send a Telegram to Pepo', channel: 'telegram' }), PIP);
      expect(session.runs).toHaveLength(1);
    });
  });

  describe('work the router answers itself', () => {
    const recall = () => job({ prompt: 'what did we learn about the payment flow?' });

    it('writes the answer and never starts a session', async () => {
      const session = new FakeSession();
      await run(build(session), recall());

      expect(session.runs).toHaveLength(0);
      expect(result()).toContain('payment flow');
      expect(result().endsWith('\n')).toBe(true);
    });

    // The whole point of the tier: it is free, and the ledger must be able to
    // tell that it was free rather than unmeasured.
    it('meters it as free and routed', async () => {
      const out = await run(build(new FakeSession()), recall());
      expect(out.meter).toEqual({ costUsd: 0, turns: 0, routed: true });
      expect(out.summary).toContain('already knew');
    });

    it('says why it needed no session', async () => {
      await run(build(new FakeSession()), recall());
      expect(progress[0]).toContain('answered without a session');
    });

    it('falls through to a session when the level knows nothing about it', async () => {
      const session = new FakeSession();
      await run(build(session), job({ prompt: 'what did we learn about quantum tunnelling?' }));
      expect(session.runs).toHaveLength(1);
    });
  });

  describe('an exact repeat with a stored answer', () => {
    const PROMPT = 'name three colours of the rainbow';

    function stored(over: Partial<Recipe> = {}): void {
      writeRecipes(levelDir, [
        {
          key: PROMPT,
          terms: ['name', 'three', 'colours', 'rainbow'],
          role: 'worker',
          approach: 'just answer it',
          answer: 'red, green, blue',
          hits: 2,
          successes: 1,
          completions: 1,
          capabilities: [],
          learnedAt: 1,
          ...over,
        },
      ]);
    }

    it('replays the answer without a session', async () => {
      stored();
      const session = new FakeSession();
      const out = await run(build(session), job({ prompt: PROMPT }));

      expect(session.runs).toHaveLength(0);
      expect(result()).toContain('red, green, blue');
      expect(out.summary).toContain('exact job was done');
    });

    // A recipe nobody can see earning its keep is a recipe nobody can prune.
    it('credits the recipe it reused, on disk', async () => {
      stored();
      await run(build(new FakeSession()), job({ prompt: PROMPT }));

      const [recipe] = readRecipes(levelDir);
      expect(recipe.hits).toBe(3);
      expect(recipe.lastUsedAt).toBeGreaterThan(0);
    });

    it('will not replay an answer over a repository it cannot see', async () => {
      stored();
      const session = new FakeSession();
      await run(build(session), job({ prompt: PROMPT, repoPath: '/some/repo' }));

      expect(session.runs).toHaveLength(1);
      expect(existsSync(path.join(sandboxDir, 'RESULT.md'))).toBe(false);
    });
  });

  describe('a recipe that only saves the exploring', () => {
    function stored(): void {
      writeRecipes(levelDir, [
        {
          key: 'add a test for formatusd',
          terms: ['add', 'test', 'formatusd'],
          role: 'worker',
          approach: 'read the module, then write the test beside it',
          hits: 0,
          successes: 1,
          completions: 1,
          capabilities: [],
          learnedAt: 1,
        },
      ]);
    }

    it('hands the session the approach and a one-shot leash', async () => {
      stored();
      const session = new FakeSession();
      await run(build(session), job({ prompt: 'add a test for formatUsd' }), PIP);

      expect(session.runs).toHaveLength(1);
      expect(session.runs[0].hint).toEqual({
        oneShot: true,
        approach: 'read the module, then write the test beside it',
        // Carried so the ledger can file the run under the recipe it repeated,
        // which is what a one-shot's quote is looked up by.
        recipeKey: 'add a test for formatusd',
      });
      expect(progress[0]).toContain('less exploring');
    });

    // The session's own numbers pass through untouched; the router adds only
    // its measurement alongside them. Both halves matter — a layer that edited
    // what the session reported would corrupt the ledger it feeds.
    it('returns what the session returned, plus what it measured', async () => {
      stored();
      const session = new FakeSession({
        summary: 'wrote the test',
        lesson: 'the module was tiny',
        meter: { costUsd: 0.11, turns: 3 },
      });
      const out = await run(build(session), job({ prompt: 'add a test for formatUsd' }), PIP);

      expect(out.summary).toBe('wrote the test');
      expect(out.lesson).toBe('the module was tiny');
      expect(out.meter).toEqual({
        costUsd: 0.11,
        turns: 3,
        // Written even though this job was not a question. It is the
        // denominator: without the false rows there is no "how much paid
        // traffic was recall", only a count of the ones that were.
        asked: false,
        recallable: 0,
      });
    });

    // The run D-046 is trying to size: a question, on a level whose own notes
    // had nothing to say about it. Recorded on the row, read by nobody yet.
    it('measures a question the level had no notes for', async () => {
      stored();
      const out = await run(
        build(new FakeSession()),
        job({ prompt: 'what is our deployment process?' }),
        PIP,
      );
      expect(out.meter).toMatchObject({ asked: true, recallable: 0 });
    });

    // "Do it properly" skips the router but is still paid traffic, and a
    // question that arrives that way counts exactly like any other.
    it('measures a run that skipped the router', async () => {
      const out = await run(
        build(new FakeSession()),
        job({ prompt: 'what did we learn about login?', noRouter: true }),
        PIP,
      );
      expect(out.meter).toMatchObject({ asked: true, recallable: 1 });
    });

    /**
     * The one that would otherwise go missing. A dead run still becomes a
     * ledger row — `SessionFailure` carries a meter for exactly that reason —
     * and on a short leash most runs end this way. Measuring only the runs
     * that landed would leave the counter blind where the traffic actually is,
     * which is the bias D-017 caught in the quote.
     */
    it('measures a run that died, because that is a ledger row too', async () => {
      const dead = new SessionFailure('ran out of turns', { costUsd: 0.22 });
      await expect(
        run(build(new DyingSession(dead)), job({ prompt: 'what is our deploy process?' }), PIP),
      ).rejects.toMatchObject({
        message: 'ran out of turns',
        // The session's own numbers survive the rethrow alongside the measurement.
        meter: { costUsd: 0.22, asked: true, recallable: 0 },
      });
    });

    // Cancelling is a different question from "did anyone want this compiled",
    // which the tool-candidate counter excludes. This one only asks whether it
    // was a question, and a cancelled run was still a question that cost money.
    //
    // The prompt is the interesting population on purpose: question-shaped and
    // squarely about something the level *has* a note on, but not phrased the
    // narrow way the free recall tier insists on — so it gets paid for anyway.
    // Those are the rows that say the notes are there and are not being used.
    it('measures a cancelled run', async () => {
      await expect(
        run(
          build(new DyingSession(new SessionFailure(CANCELLED))),
          job({ prompt: 'how does the payment flow retry?' }),
          PIP,
        ),
      ).rejects.toMatchObject({ meter: { asked: true, recallable: 1 } });
    });

    it('credits the recipe even when the session taught it nothing new', async () => {
      stored();
      await run(build(new FakeSession()), job({ prompt: 'add a test for formatUsd' }), PIP);
      expect(readRecipes(levelDir)[0].hits).toBe(1);
    });

    it('lets a job that asked for a proper session skip the router entirely', async () => {
      stored();
      const session = new FakeSession();
      await run(build(session), job({ prompt: 'add a test for formatUsd', noRouter: true }), PIP);

      expect(session.runs[0].hint).toBeUndefined();
      expect(readRecipes(levelDir)[0].hits).toBe(0);
      expect(progress).toEqual([]);
    });
  });

  describe('learning from a session that finished', () => {
    const approach = 'read the module first, then write the test beside it';

    it('writes down the approach, and the answer when nothing outside fed in', async () => {
      const session = new FakeSession({ summary: 'red, green, blue', approach });
      await run(build(session), job({ prompt: 'Name three colours' }), PIP);

      const [recipe] = readRecipes(levelDir);
      expect(recipe.key).toBe('name three colours');
      expect(recipe.role).toBe('worker');
      expect(recipe.approach).toBe(approach);
      expect(recipe.answer).toBe('red, green, blue');
      expect(recipe.hits).toBe(0);
      expect(progress).toContain('noted how to do this next time');
    });

    // Same words, different repository, different answer. Storing the answer
    // here would replay it against work it was never about.
    it('keeps the approach but not the answer for a job with a repository', async () => {
      const session = new FakeSession({ summary: 'fixed it', approach });
      await run(build(session), job({ repoPath: '/some/repo' }), PIP);

      const [recipe] = readRecipes(levelDir);
      expect(recipe.approach).toBe(approach);
      expect(recipe.answer).toBeUndefined();
    });

    it('keeps the approach but not the answer for a job that went outside', async () => {
      const session = new FakeSession({ summary: 'here is what the page said', approach });
      await run(build(session), job({ prompt: 'check the changelog', tools: ['web'] }), PIP);

      expect(readRecipes(levelDir)[0].answer).toBeUndefined();
    });

    it('records nothing when the session did not say how it worked', async () => {
      await run(build(new FakeSession({ summary: 'done' })), job(), PIP);
      expect(existsSync(path.join(levelDir, 'recipes.json'))).toBe(false);
    });

    it('records nothing when no agentling ran it', async () => {
      await run(build(new FakeSession({ summary: 'done', approach })), job());
      expect(existsSync(path.join(levelDir, 'recipes.json'))).toBe(false);
    });

    // Needs a repository, and that is the whole subtlety. A repeat of a job
    // that stored an *answer* never reaches a second session at all — the
    // router replays it — so the only way an approach is ever improved is the
    // shape that cannot be replayed, which is exactly a job with a repo.
    it('updates the existing recipe rather than adding a second', async () => {
      const repo = { prompt: 'Name three colours', repoPath: '/some/repo' };
      const first = new FakeSession({ summary: 'done', approach: 'the old way' });
      await run(build(first), job(repo), PIP);
      const second = new FakeSession({ summary: 'done', approach: 'the better way' });
      // Landing means leaving something behind, not exiting politely — the same
      // narrow test the tool-candidate counter uses, and the reason a run that
      // says "I cannot do this" credits nothing (D-041).
      writeFileSync(path.join(sandboxDir, 'DIFF.patch'), 'diff --git a/x b/x\n+work\n');
      await run(build(second), job({ ...repo, prompt: 'name three colours' }), PIP);

      // The method arrives, the leash does not — nothing has yet landed *using*
      // this recipe, and a method earns the leash by having worked. The run
      // that wrote it did not use one, so it credited nothing.
      expect(second.runs[0].hint).toMatchObject({ approach: 'the old way' });
      expect(second.runs[0].hint?.oneShot).toBeUndefined();
      const recipes = readRecipes(levelDir);
      expect(recipes).toHaveLength(1);
      expect(recipes[0].approach).toBe('the better way');

      // And it does arrive, one run later: the hint-only run above landed, so
      // the recipe now has a delivery behind it. The gate costs the leash a
      // single outing rather than withholding it.
      const third = new FakeSession({ summary: 'done', approach: 'the better way' });
      await run(build(third), job({ ...repo, prompt: 'name three colours' }), PIP);
      expect(third.runs[0].hint).toMatchObject({ oneShot: true, approach: 'the better way' });
    });
  });

  // A three-turn recipe run usually spends its last turn on the work rather
  // than the write-up, so dying is its normal ending, not an edge case: all 13
  // real recipe runs ended this way. If the crew only learns from clean
  // successes it never learns from the tier built to be cheap.
  describe('learning from a session that died', () => {
    function stored(): void {
      writeRecipes(levelDir, [
        {
          key: 'add a test for formatusd',
          terms: ['add', 'test', 'formatusd'],
          role: 'worker',
          approach: 'the old way',
          hits: 0,
          capabilities: [],
          learnedAt: 1,
        },
      ]);
    }

    const dying = (approach?: string) =>
      new DyingSession(new SessionFailure('ran out of turns', {}, undefined, approach));

    it('still credits the recipe it used', async () => {
      stored();
      const session = dying();
      await expect(
        run(build(session), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow('ran out of turns');

      expect(session.runs).toHaveLength(1);
      expect(readRecipes(levelDir)[0].hits).toBe(1);
    });

    /**
     * The leash un-learning, at the seam where it is decided (D-095). The unit
     * tests pin what `creditRecipe` does with `leashCutFrom`; these two pin
     * when it is passed at all, which is the part a mutation walked straight
     * through — deleting the `oneShot` check broke nothing.
     */
    function armed(over: Partial<Recipe> = {}): void {
      writeRecipes(levelDir, [
        {
          key: 'add a test for formatusd',
          terms: ['add', 'test', 'formatusd'],
          role: 'worker',
          approach: 'the old way',
          hits: 2,
          successes: 1,
          completions: 1,
          completedInTurns: 4,
          capabilities: [],
          learnedAt: 1,
          ...over,
        },
      ]);
    }

    const cutAt = (turnsAllowed: number) =>
      new DyingSession(new SessionFailure('ran out of turns', { outOfTurns: true, turnsAllowed }));

    it('lets a leashed run cut at the wall retire the leash it disproved', async () => {
      armed();
      const session = cutAt(5);
      await expect(
        run(build(session), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow('ran out of turns');

      // It was leashed: a recipe recorded at 4 is strong, so the router hands
      // the run a one-shot rather than merely the method. `DyingSession` keeps
      // only the job it was given, so the tier is read off what the run
      // announced — the two lines are distinct on purpose.
      expect(progress.join(' ')).toContain('less exploring');
      expect(readRecipes(levelDir)[0].completedInTurns).toBe(6);
    });

    // A long run dying is not the leash being wrong about anything, and D-068
    // still holds for it: 33 stands, rather than becoming 41.
    it('leaves the bound alone when the run that died was never leashed', async () => {
      armed({ completedInTurns: 33 });
      const session = cutAt(40);
      await expect(
        run(build(session), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow('ran out of turns');

      expect(progress.join(' ')).toContain('starting from that method');
      expect(progress.join(' ')).not.toContain('less exploring');
      expect(readRecipes(levelDir)[0].completedInTurns).toBe(33);
    });

    it('writes down how it worked, from the notes it did manage', async () => {
      await expect(
        run(build(dying('the way that worked')), job({ prompt: 'Name three colours' }), PIP),
      ).rejects.toThrow();

      const [recipe] = readRecipes(levelDir);
      expect(recipe.approach).toBe('the way that worked');
    });

    it('improves the recipe it was handed rather than leaving it stale', async () => {
      stored();
      await expect(
        run(build(dying('the better way')), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow();

      const recipes = readRecipes(levelDir);
      expect(recipes).toHaveLength(1);
      expect(recipes[0].approach).toBe('the better way');
    });

    // The sharp edge. An answer is replayed to the user word for word, and a
    // failed run's summary is its error message — banking one would serve
    // "ran out of turns" as the answer to this question for ever.
    // The recipe key is the prompt, so the same sentence with a different file
    // attached would replay the first file's summary for the second.
    it('never banks an answer from a run that was given a file', async () => {
      await expect(
        run(
          build(dying('the way that worked')),
          job({
            prompt: 'summarise the attached contract',
            attachments: [{ name: 'contract.pdf', bytes: 900 }],
          }),
          PIP,
        ),
      ).rejects.toThrow();

      const [recipe] = readRecipes(levelDir);
      expect(recipe.answer).toBeUndefined();
      expect(recipe.approach).toBeDefined(); // the method is still worth keeping
    });

    it('never banks an answer from a run that failed', async () => {
      await expect(
        run(build(dying('the way that worked')), job({ prompt: 'Name three colours' }), PIP),
      ).rejects.toThrow();

      expect(readRecipes(levelDir)[0].answer).toBeUndefined();
    });

    // The counter decides whether a job is ever compiled into a tool, and it
    // was asking the wrong question. A big mechanical job is exactly what a
    // script is for, and exactly what cannot finish on a short leash — so
    // counting clean exits promoted the small jobs a script cannot do and
    // excluded the ones it could.
    it('counts a run that delivered, even though it never finished', async () => {
      stored();
      writeFileSync(path.join(sandboxDir, 'DIFF.patch'), 'diff --git a/x b/x\n+work\n');
      await expect(
        run(build(dying('the way that worked')), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow();

      expect(readRecipes(levelDir)[0]).toMatchObject({ hits: 1, successes: 1 });
    });

    // The same run, against the other counter, and the whole reason there are
    // two. It delivered, so it may one day compile into a script; it was killed,
    // so it has not shown the job fits — and the leash is only ever asked the
    // second question. Gating the leash on `successes` for a day meant a
    // gathering-bound job that delivered three times could never earn it, while
    // the same work with a clone earned it without ever finishing (D-065).
    it('does not count that same run as having fitted its budget', async () => {
      stored();
      writeFileSync(path.join(sandboxDir, 'DIFF.patch'), 'diff --git a/x b/x\n+work\n');
      await expect(
        run(build(dying('the way that worked')), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow();

      expect(readRecipes(levelDir)[0].completions ?? 0).toBe(0);
    });

    // And a run that finished credits both, which is what eventually opens the
    // leash — with no repository, so this is the shape that was locked out.
    it('counts a clean run that left files as both a landing and a fit', async () => {
      stored();
      writeFileSync(path.join(sandboxDir, 'REPORT.md'), 'the work\n');
      await run(
        build(new FakeSession({ summary: 'done' })),
        job({ prompt: 'add a test for formatUsd' }),
        PIP,
      );

      expect(readRecipes(levelDir)[0]).toMatchObject({ successes: 1, completions: 1 });
    });

    // A mid-flight run testifies to nothing beyond having happened: it
    // delivered the *remainder* of a job, not the job, so it must not say the
    // method gets the job done (three of those compile a tool that would then
    // redo the whole job from scratch) nor that the job fits a budget — a
    // continuation finishing in eight calls would license a five-turn leash
    // for work that needs twenty-four, D-068's trap by another door (D-074).
    it('counts a continuation only as usage, however well it delivered', async () => {
      stored();
      writeFileSync(path.join(sandboxDir, 'REPORT.md'), 'the remainder\n');
      await run(
        build(new FakeSession({ summary: 'done' })),
        job({ prompt: 'add a test for formatUsd', continues: 'j0' }),
        PIP,
      );

      const [recipe] = readRecipes(levelDir);
      expect(recipe.hits).toBe(1);
      expect(recipe.successes ?? 0).toBe(0);
      expect(recipe.completions ?? 0).toBe(0);
    });

    // Its close-out describes resuming, not the job, so banking it would
    // overwrite a method written by a fresh run with one about carrying on.
    it('never lets a continuation author a recipe', async () => {
      await run(
        build(new FakeSession({ summary: 'done', approach: 'the resume way' })),
        job({ prompt: 'a brand new job', continues: 'j0' }),
        PIP,
      );

      expect(readRecipes(levelDir)).toEqual([]);
    });

    // Narrower than `partial` on purpose, and the difference is the point.
    // `partial` asks whether there is something worth reviewing; this asks
    // whether the recipe gets the job done, because three of these compile it
    // into a tool that runs with no model at all.
    //
    // Measured on job 2711da49: a run wrote a working PDF generator, ran out
    // of turns before executing it, and produced no PDF. Reviewable — but not
    // evidence the job is repeatable.
    it('does not count a run that left files but never finished the job', async () => {
      stored();
      writeFileSync(path.join(sandboxDir, 'make-pdf.mjs'), '// writes a PDF when run\n');
      await expect(
        run(build(dying('the way that worked')), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow();

      const [recipe] = readRecipes(levelDir);
      expect(recipe.hits).toBe(1);
      expect(recipe.successes ?? 0).toBe(0);
    });

    it('counts nothing when the run left no work behind either', async () => {
      stored();
      await expect(
        run(build(dying('the way that worked')), job({ prompt: 'add a test for formatUsd' }), PIP),
      ).rejects.toThrow();

      const [recipe] = readRecipes(levelDir);
      expect(recipe.hits).toBe(1);
      expect(recipe.successes ?? 0).toBe(0);
    });

    /**
     * The third case, and the one that made the test read as it does. A clean
     * exit was sufficient on its own, which is the assumption D-041 removed
     * everywhere else: job 149620b5 finished politely and produced nothing —
     * a scout that read a code host and had no tool to write with — and would
     * have banked a success for it. Three of those compile a tool from a
     * method that delivers nothing.
     */
    it('does not count a run that finished politely and produced nothing', async () => {
      stored();
      await run(build(new FakeSession()), job({ prompt: 'add a test for formatUsd' }), PIP);

      const [recipe] = readRecipes(levelDir);
      expect(recipe.hits).toBe(1);
      expect(recipe.successes ?? 0).toBe(0);
    });

    it('counts a run that finished and left something behind', async () => {
      stored();
      writeFileSync(path.join(sandboxDir, 'RESULT.md'), '# did the job\n');
      await run(build(new FakeSession()), job({ prompt: 'add a test for formatUsd' }), PIP);

      expect(readRecipes(levelDir)[0]).toMatchObject({ hits: 1, successes: 1 });
    });

    it('records nothing when it died before writing anything down', async () => {
      await expect(run(build(dying()), job(), PIP)).rejects.toThrow();
      expect(existsSync(path.join(levelDir, 'recipes.json'))).toBe(false);
    });
  });

  describe('pages it can fetch itself', () => {
    let server: Server;
    let origin: string;

    beforeAll(async () => {
      server = createServer((req, res) => {
        res.writeHead(200, { 'content-type': 'text/html' });
        res.end(`<html><head><title>Page ${req.url?.slice(1)}</title></head><body><p>the body of ${req.url?.slice(1)}</p></body></html>`);
      });
      await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
      const address = server.address();
      origin = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
    });

    afterAll(() => new Promise<void>((resolve) => server.close(() => resolve())));

    const fetchJob = (prompt: string) => job({ prompt, tools: ['web'] });

    it('reads the page into RESULT.md with no session', async () => {
      const session = new FakeSession();
      const out = await run(
        build(session, { web: { allow: ['127.0.0.1'] } }),
        fetchJob(`read ${origin}/one`),
      );

      expect(session.runs).toHaveLength(0);
      expect(result()).toContain('Page one');
      expect(result()).toContain('the body of one');
      expect(result()).toContain(`Source: ${origin}/one`);
      expect(out.summary).toContain('Fetched 1 page for you');
      expect(out.meter).toEqual({ costUsd: 0, turns: 0, routed: true });
    });

    it('reads several, saying which one it is on', async () => {
      const out = await run(
        build(new FakeSession(), { web: { allow: ['127.0.0.1'] } }),
        fetchJob(`read ${origin}/one and ${origin}/two`),
      );

      expect(out.summary).toContain('Fetched 2 pages');
      expect(result()).toContain('the body of two');
      expect(progress).toEqual([`reading ${origin}/one`, `reading ${origin}/two`]);
    });

    // A blocked host is a normal outcome, not a crash: the run still delivers a
    // file, and it says plainly what it could not read.
    it('explains a page the allowlist refused instead of failing', async () => {
      const out = await run(
        build(new FakeSession(), { web: { allow: ['example.com'] } }),
        fetchJob(`read ${origin}/one`),
      );

      expect(result()).toContain('Could not read this: that address is not on the allowed list');
      expect(out.meter?.routed).toBe(true);
    });

    it('leaves the page to a session when the job asks for thought as well', async () => {
      const session = new FakeSession();
      await run(
        build(session, { web: { allow: ['127.0.0.1'] } }),
        fetchJob(`read ${origin}/one and tell me what it says`),
      );
      expect(session.runs).toHaveLength(1);
    });

    it('will not go outside for a job that never opted in', async () => {
      const session = new FakeSession();
      await run(build(session, { web: { allow: ['127.0.0.1'] } }), job({ prompt: `read ${origin}/one` }));
      expect(session.runs).toHaveLength(1);
    });
  });

  describe('cancel', () => {
    it('passes the stop down to the session that is running', () => {
      const session = new FakeSession({ summary: 'x' }, true);
      expect(build(session).cancel('j1')).toBe(true);
      expect(session.cancelled).toEqual(['j1']);
    });

    it('reports nothing stopped when the session says so', () => {
      expect(build(new FakeSession({ summary: 'x' }, false)).cancel('j1')).toBe(false);
    });

    // Work the router answered itself has no session to kill, and neither does
    // an executor without a cancel — asking must not throw.
    it('reports nothing stopped when the executor cannot cancel', () => {
      const noCancel: Executor = { run: async () => ({ summary: 'x' }) };
      expect(build(noCancel).cancel('j1')).toBe(false);
    });
  });

  describe('a recipe that only half fits', () => {
    function stored(): void {
      writeRecipes(levelDir, [
        {
          key: 'add a test for the estimate module',
          terms: ['add', 'test', 'estimate', 'module'],
          role: 'worker',
          approach: 'read the module, then write the test beside it',
          hits: 0,
          successes: 0,
          capabilities: [],
          learnedAt: 1,
        },
      ]);
    }

    it('hands the method over without cutting the leash', async () => {
      stored();
      const session = new FakeSession();
      await run(build(session), job({ prompt: 'write tests for the estimate module' }), PIP);

      expect(session.runs[0].hint).toEqual({
        approach: 'read the module, then write the test beside it',
        // Carried without the leash: the run is still a run *of this job*, and
        // a session that records nothing saying so cannot be priced as one
        // (D-072). `oneShot` is what shortens the run, and it is absent.
        recipeKey: 'add a test for the estimate module',
      });
      expect(session.runs[0].hint?.oneShot).toBeUndefined();
      expect(progress[0]).toContain('starting from that method');
    });

    it('credits the recipe it borrowed from', async () => {
      stored();
      await run(build(new FakeSession()), job({ prompt: 'write tests for the estimate module' }), PIP);
      expect(readRecipes(levelDir)[0].hits).toBe(1);
    });
  });

  /**
   * The knowledge store (D-047). What matters here is the seam: the store
   * reaches the router, and does *not* reach the counter.
   */
  describe('the knowledge store', () => {
    const indexed = (syncedAt: number): void =>
      writeIndex(levelDir, {
        sources: ['/notes'],
        syncedAt,
        entries: [{ text: 'Deploys run on Fridays.', source: 'ops/deploy.md', syncedAt }],
        skipped: 0,
      });

    it('answers a question from your own material, with no session', async () => {
      indexed(Date.now());
      const session = new FakeSession();
      await run(build(session, { knowledge: [] }), job({ prompt: 'what do we know about deploys' }), PIP);

      expect(session.runs).toHaveLength(0);
      expect(result()).toContain('Deploys run on Fridays.');
      // Provenance survives all the way to what the user reads.
      expect(result()).toContain('ops/deploy.md');
    });

    it('pays for the job once the index has gone stale', async () => {
      indexed(Date.now() - STALE_MS - 1);
      const session = new FakeSession();
      await run(build(session, { knowledge: [] }), job({ prompt: 'what do we know about deploys' }), PIP);

      expect(session.runs).toHaveLength(1);
    });

    /**
     * The counter asks whether the crew's *own* notes could have answered a
     * paid question — the figure that says whether a store was worth having.
     * If the store fed it, the counter would answer its own question yes the
     * moment the store existed, and rows before and after would not compare.
     *
     * The prompt is question-shaped but not phrased the narrow way the recall
     * tier insists on, so it reaches a session with the store indexed and
     * matching: exactly the case where the two corpora could get confused.
     */
    it('does not let the store move the counter', async () => {
      indexed(Date.now());
      const out = await run(
        build(new FakeSession(), { knowledge: [] }),
        job({ prompt: 'how often do deploys happen?' }),
        PIP,
      );
      expect(out.meter).toMatchObject({ asked: true, recallable: 0 });
    });
  });

  /**
   * The free search tier. Injected whole rather than as a key, so this runs
   * without a network — the point of that seam.
   */
  describe('a bare request for pages', () => {
    const PROMPT = 'search for typescript decorators';

    const asked: string[] = [];
    const searching = (reply: SearchResult) => async (query: string) => {
      asked.push(query);
      return reply;
    };
    beforeEach(() => {
      asked.length = 0;
    });

    it('answers it with the links, and no session', async () => {
      const session = new FakeSession();
      const found = { text: '1. A page\n   https://example.com/a' };
      const out = await run(
        build(session, { search: searching(found) }),
        job({ prompt: PROMPT, tools: ['search'] }),
        PIP,
      );

      expect(asked).toEqual(['typescript decorators']);
      expect(session.runs).toHaveLength(0);
      expect(result()).toContain('https://example.com/a');
      expect(out.meter).toMatchObject({ costUsd: 0, turns: 0, routed: true });
    });

    // The connection has to be granted to the job as well as configured.
    it('does not claim it when the job did not ask for search', async () => {
      const session = new FakeSession();
      await run(build(session, { search: searching({ text: 'links' }) }), job({ prompt: PROMPT }), PIP);

      expect(asked).toEqual([]);
      expect(session.runs).toHaveLength(1);
    });

    // A level with no key has no search to inject, so the tier cannot claim
    // work it would then be unable to do.
    it('does not claim it when the level has no way to search', async () => {
      const session = new FakeSession();
      await run(build(session), job({ prompt: PROMPT, tools: ['search'] }), PIP);
      expect(session.runs).toHaveLength(1);
    });

    /**
     * A search that failed is not an answer. Falling through costs money and
     * returns something; reporting the error for free returns nothing, and the
     * user asked for pages rather than for an apology.
     */
    it('pays for the job properly when the search itself fails', async () => {
      const session = new FakeSession();
      await run(
        build(session, { search: searching({ error: 'the search quota is used up (429)' }) }),
        job({ prompt: PROMPT, tools: ['search'] }),
        PIP,
      );

      expect(session.runs).toHaveLength(1);
      expect(progress.some((p) => p.includes('search failed'))).toBe(true);
    });

    // The guarantee that matters: a question is still a question, and the free
    // tier must never answer one with a list of links.
    it('sends a request that wants more than links to a session', async () => {
      const session = new FakeSession();
      await run(
        build(session, { search: searching({ text: 'links' }) }),
        job({ prompt: 'search for typescript decorators and explain them', tools: ['search'] }),
        PIP,
      );

      expect(asked).toEqual([]);
      expect(session.runs).toHaveLength(1);
    });
  });

  describe('a job the crew has compiled into a tool', () => {
    const PROMPT = 'total the invoices in the spreadsheet';
    const WROTE = "import {writeFileSync} from 'node:fs'; writeFileSync('RESULT.md','the tool did it');";
    const CHECKS = "import {existsSync} from 'node:fs'; process.exit(existsSync('RESULT.md') ? 0 : 1);";

    function tool(runScript: string, verifyScript: string): void {
      const name = 'tidy-invoice';
      writeTool(levelDir, {
        name,
        recipeKey: PROMPT,
        terms: ['total', 'invoice', 'spreadsheet'],
        hasRepo: false,
        description: 'compiled',
        learnedAt: 1,
        runs: 0,
        failures: 0,
      });
      writeFileSync(path.join(toolDir(levelDir, name), RUN_SCRIPT), runScript);
      writeFileSync(path.join(toolDir(levelDir, name), VERIFY_SCRIPT), verifyScript);
    }

    it('does the job with no session and no cost', async () => {
      tool(WROTE, CHECKS);
      const session = new FakeSession();
      const out = await run(build(session), job({ prompt: PROMPT }), PIP);

      expect(session.runs).toHaveLength(0);
      expect(result()).toContain('the tool did it');
      expect(out.meter).toMatchObject({ costUsd: 0, tooled: true });
    });

    // The safety argument for the entire tier. Work a tool cannot prove is
    // thrown away and the job is paid for properly — a free wrong answer is
    // the one outcome worse than a right answer that cost money.
    it('throws away work it cannot prove, and pays for the job instead', async () => {
      tool(WROTE, 'process.exit(1)');
      const session = new FakeSession();
      await run(build(session), job({ prompt: PROMPT }), PIP);

      expect(session.runs).toHaveLength(1);
      expect(progress.some((p) => p.includes('could not prove'))).toBe(true);
    });

    /**
     * The tier's promise is "if the tool cannot, do it properly". The clone was
     * the one route where that did not hold: it was unguarded, so a `git clone`
     * failure threw out of the executor and killed the job. Measured on job
     * d450afd3, which died on the clone, was filed as a `session` failure in a
     * tier it never reached, and left the tool's strikes untouched.
     *
     * A real path that cannot be cloned, rather than a mock, because the point
     * is that whatever git does the job still reaches a session.
     */
    it('falls through when the repository cannot be cloned', async () => {
      const name = 'tidy-invoice';
      writeTool(levelDir, {
        name,
        recipeKey: PROMPT,
        terms: ['total', 'invoice', 'spreadsheet'],
        hasRepo: true,
        description: 'compiled',
        learnedAt: 1,
        runs: 0,
        failures: 0,
      });
      writeFileSync(path.join(toolDir(levelDir, name), RUN_SCRIPT), WROTE);
      writeFileSync(path.join(toolDir(levelDir, name), VERIFY_SCRIPT), CHECKS);

      const session = new FakeSession();
      await run(
        build(session),
        job({ prompt: PROMPT, repoPath: path.join(levelDir, 'no-such-repository') }),
        PIP,
      );

      expect(session.runs).toHaveLength(1);
      expect(progress.some((p) => p.includes('could not clone'))).toBe(true);
      // Ours, not the tool's — a busy filesystem must not retire a working tool.
      expect(readTools(levelDir)[0].failures).toBe(0);
    });

    it('falls through when the script itself crashes', async () => {
      tool('throw new Error("nope")', CHECKS);
      const session = new FakeSession();
      await run(build(session), job({ prompt: PROMPT }), PIP);
      expect(session.runs).toHaveLength(1);
    });

    it('retires itself after two failures and stops claiming the job', async () => {
      tool(WROTE, 'process.exit(1)');
      await run(build(new FakeSession()), job({ prompt: PROMPT }), PIP);
      await run(build(new FakeSession()), job({ prompt: PROMPT }), PIP);
      expect(readTools(levelDir)[0].retiredReason).toContain('in a row');

      progress = [];
      const session = new FakeSession();
      await run(build(session), job({ prompt: PROMPT }), PIP);
      expect(session.runs).toHaveLength(1);
      expect(progress.some((p) => p.includes('no session needed'))).toBe(false);
    });
  });

  describe('counting what a compiled tool could have done', () => {
    function stored(successes: number): void {
      writeRecipes(levelDir, [
        {
          key: 'add a test for the estimate module',
          terms: ['add', 'test', 'estimate', 'module'],
          role: 'worker',
          approach: 'read the module, then write the test beside it',
          hits: successes,
          successes,
          capabilities: [],
          learnedAt: 1,
        },
      ]);
    }

    const candidates = () => readToolCandidates(levelDir);

    // Nothing acts on this yet, deliberately. It answers "would a fourth tier
    // have earned its keep" by counting, so the decision to build one rests on
    // evidence that the repeat work exists rather than on hoping it does.
    it('notes a job a proven recipe could have served', async () => {
      stored(TOOL_CANDIDATE_RUNS);
      await run(build(new FakeSession()), job({ prompt: 'add a test for the estimate module' }), PIP);

      expect(candidates()).toHaveLength(1);
      expect(candidates()[0]).toMatchObject({ recipeKey: 'add a test for the estimate module' });
    });

    it('stays quiet while the recipe has not proven itself', async () => {
      stored(TOOL_CANDIDATE_RUNS - 1);
      await run(build(new FakeSession()), job({ prompt: 'add a test for the estimate module' }), PIP);
      expect(candidates()).toHaveLength(0);
    });

    // Work stopped on purpose is not demand for a compiled version of it. The
    // note used to be written before the session ran, so a job cancelled two
    // seconds in counted exactly like one that was wanted.
    it('does not count work that was cancelled', async () => {
      stored(TOOL_CANDIDATE_RUNS);
      await run(
        build(new DyingSession(new SessionFailure(CANCELLED))),
        job({ prompt: 'add a test for the estimate module' }),
        PIP,
      ).catch(() => undefined);

      expect(candidates()).toHaveLength(0);
    });

    // …but a run that merely *failed* still counts. It was asked for and
    // attempted, and on a short leash that is how most runs end — counting
    // only clean exits is the mistake this project keeps paying for.
    it('counts a run that was attempted and failed', async () => {
      stored(TOOL_CANDIDATE_RUNS);
      await run(
        build(new DyingSession(new SessionFailure('ran out of turns'))),
        job({ prompt: 'add a test for the estimate module' }),
        PIP,
      ).catch(() => undefined);

      expect(candidates()).toHaveLength(1);
    });
  });
});
