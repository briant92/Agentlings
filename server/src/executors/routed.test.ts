import { createServer, type Server } from 'node:http';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { Agentling, Job } from '@agentlings/shared';
import { readRecipes, writeRecipes, type Recipe } from '../recipes';
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

  afterEach(() => {
    rmSync(path.dirname(levelDir), { recursive: true, force: true });
    rmSync(sandboxDir, { recursive: true, force: true });
  });

  function build(
    fallback: Executor,
    over: { knowledge?: string[]; web?: { allow?: string[]; maxChars?: number } | null } = {},
  ): RoutedExecutor {
    return new RoutedExecutor(
      levelDir,
      () => over.knowledge ?? KNOWLEDGE,
      () => over.web ?? null,
      fallback,
    );
  }

  const result = () => readFileSync(path.join(sandboxDir, 'RESULT.md'), 'utf8');
  const run = (executor: RoutedExecutor, j: Job, agentling?: Agentling) =>
    executor.run(j, sandboxDir, (detail) => progress.push(detail), agentling);

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
      });
      expect(progress[0]).toContain('less exploring');
    });

    it('returns what the session returned, untouched', async () => {
      stored();
      const session = new FakeSession({
        summary: 'wrote the test',
        lesson: 'the module was tiny',
        meter: { costUsd: 0.11, turns: 3 },
      });
      const out = await run(build(session), job({ prompt: 'add a test for formatUsd' }), PIP);

      expect(out.summary).toBe('wrote the test');
      expect(out.lesson).toBe('the module was tiny');
      expect(out.meter).toEqual({ costUsd: 0.11, turns: 3 });
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
      await run(build(second), job({ ...repo, prompt: 'name three colours' }), PIP);

      expect(second.runs[0].hint).toMatchObject({ oneShot: true, approach: 'the old way' });
      const recipes = readRecipes(levelDir);
      expect(recipes).toHaveLength(1);
      expect(recipes[0].approach).toBe('the better way');
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
});
