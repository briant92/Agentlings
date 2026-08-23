import { mkdtempSync, writeFileSync } from 'node:fs';
import { rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { terms } from './recipes';
import {
  DOORS_ENV,
  RUN_SCRIPT,
  STRIKES_ALLOWED,
  VERIFY_SCRIPT,
  findTool,
  freeToolName,
  isComplete,
  promotionPrompt,
  readTools,
  recordToolRun,
  toolDir,
  toolNameFor,
  usableTools,
  writeTool,
  type ToolManifest,
} from './tools';

function manifest(over: Partial<ToolManifest> = {}): ToolManifest {
  return {
    name: 'tidy-invoice',
    recipeKey: 'total the invoices in the spreadsheet',
    terms: terms('total the invoices in the spreadsheet'),
    hasRepo: false,
    description: 'compiled',
    learnedAt: 1,
    runs: 0,
    failures: 0,
    ...over,
  };
}

describe('findTool', () => {
  const tools = [manifest()];

  it('claims the job it was compiled from', () => {
    expect(findTool(tools, 'Total the invoices in the spreadsheet', false)?.name).toBe(
      'tidy-invoice',
    );
  });

  // The bar is the strong one and only the strong one. A weak recipe match
  // costs a paragraph the session can ignore; a weak tool match runs a
  // generated script over the job instead of doing it.
  it('will not claim a job that merely resembles it', () => {
    expect(findTool(tools, 'write the quarterly board report', false)).toBeNull();
  });

  // The words can be identical and the work completely different: a script
  // written against a clone has nothing to edit when there is no clone.
  it('will not claim the same words in the other shape', () => {
    expect(findTool(tools, 'total the invoices in the spreadsheet', true)).toBeNull();
    expect(findTool([manifest({ hasRepo: true })], 'total the invoices in the spreadsheet', true))
      .not.toBeNull();
  });

  it('never claims anything once retired', () => {
    const retired = [manifest({ retiredReason: 'failed twice' })];
    expect(findTool(retired, 'total the invoices in the spreadsheet', false)).toBeNull();
  });

  /**
   * The other half of giving tools doors: a tool compiled against a connection
   * is refused when the job does not hold it.
   *
   * Not a nicety. A tool that reaches a door it was not granted fails, and two
   * failures retire it — so without this, switching `github` off in Settings
   * would silently destroy a working compiled tool and bill two fallback
   * sessions on the way. The same capability-surface rule recipes have carried
   * since D-036, arriving at the tier that until now could not need it.
   */
  const needsGithub = [manifest({ connections: ['github'] })];
  const ask = 'total the invoices in the spreadsheet';

  it('claims its job when the doors it needs are open', () => {
    expect(findTool(needsGithub, ask, false, ['github', 'web'])?.name).toBe('tidy-invoice');
  });

  it('refuses its own job when a door it needs is shut', () => {
    expect(findTool(needsGithub, ask, false, ['web'])).toBeNull();
    expect(findTool(needsGithub, ask, false, [])).toBeNull();
  });

  it('needs every door it was compiled against, not merely one', () => {
    const both = [manifest({ connections: ['github', 'search'] })];
    expect(findTool(both, ask, false, ['github'])).toBeNull();
    expect(findTool(both, ask, false, ['github', 'search'])).not.toBeNull();
  });

  /**
   * Every tool compiled before doors existed. Its manifest has no such field,
   * it requires nothing, and it must keep running for jobs that grant nothing
   * — which is the whole reason the grant is its own field and not the
   * capability surface, where ambient `web` rides almost every recipe.
   */
  it('asks nothing of a tool compiled under the old contract', () => {
    expect(findTool(tools, ask, false, [])?.name).toBe('tidy-invoice');
    expect(findTool([manifest({ connections: [] })], ask, false, [])).not.toBeNull();
  });
});

describe('a tool on disk', () => {
  let levelDir: string;
  beforeEach(() => {
    levelDir = mkdtempSync(path.join(tmpdir(), 'agentlings-tools-'));
  });
  // rmSync cannot outwait a Windows file lock — see executors/carry.test.ts.
  afterEach(() =>
    rm(levelDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  const complete = (name = 'tidy-invoice') => {
    writeTool(levelDir, manifest({ name }));
    writeFileSync(path.join(toolDir(levelDir, name), RUN_SCRIPT), 'process.exit(0)');
    writeFileSync(path.join(toolDir(levelDir, name), VERIFY_SCRIPT), 'process.exit(0)');
  };

  it('survives a round trip', () => {
    complete();
    expect(readTools(levelDir).map((t) => t.name)).toEqual(['tidy-invoice']);
  });

  // The manifest is written before the promotion session runs, so between the
  // two there is a tool with nothing to execute. It must not win a job.
  it('is not usable until both halves exist', () => {
    writeTool(levelDir, manifest());
    expect(isComplete(levelDir, manifest())).toBe(false);
    expect(usableTools(levelDir)).toEqual([]);

    complete();
    expect(usableTools(levelDir)).toHaveLength(1);
  });

  it('is not usable once retired, however complete it is', () => {
    complete();
    recordToolRun(levelDir, readTools(levelDir)[0], false);
    recordToolRun(levelDir, readTools(levelDir)[0], false);
    expect(usableTools(levelDir)).toEqual([]);
  });

  /**
   * The surface the method was found under, which is knowable only at compile
   * time. Recorded and read by nobody — a tool is Node built-ins only plus the
   * doors it was granted, and refusing on a moved surface would drop a free
   * proven answer into a paid session to buy nothing.
   *
   * This comment used to end "giving tools the gated doors would make it
   * load-bearing". That day came, and it did not: a surface is what the method
   * *could* reach, so it carries ambient `web` whether the method touched it or
   * not, and gating a run on it would refuse a tool over a connection it never
   * called. The grant is `connections` below, which records what was used.
   */
  it('carries the capability surface it was compiled under', () => {
    const surface = ['conn:web', 'lib:pdf-lib', 'tool:Bash'];
    writeTool(levelDir, manifest({ capabilities: surface }));
    expect(readTools(levelDir)[0].capabilities).toEqual(surface);
  });

  /**
   * The doors, which unlike every other provenance field here is read: the
   * router refuses the tool when the job does not grant them. Absent on every
   * tool compiled before doors existed, which is exactly right — those require
   * nothing — so there is nothing to backfill.
   */
  it('carries the doors it was compiled against, and none by default', () => {
    writeTool(levelDir, manifest({ name: 'commits', connections: ['github'] }));
    expect(readTools(levelDir).find((t) => t.name === 'commits')?.connections).toEqual(['github']);

    complete();
    expect(readTools(levelDir).find((t) => t.name === 'tidy-invoice')?.connections).toBeUndefined();
  });

  // Who compiled it and where, recorded at the only moment either is knowable
  // and read by nobody. The round trip is the whole contract: the fields have
  // to survive the write so they are there to be read the day something wants
  // them, since a manifest cannot be given provenance it never wrote.
  it('carries the agentling and level that earned it', () => {
    writeTool(levelDir, manifest({ earnedBy: 'Pip', earnedIn: 'hq' }));
    expect(readTools(levelDir)[0]).toMatchObject({ earnedBy: 'Pip', earnedIn: 'hq' });
  });

  // Four of the five tools on this machine predate the surface existing, and
  // the honest record of that is an absent field rather than a plausible one.
  it('is still usable when it predates the surface being recorded', () => {
    complete();
    expect(readTools(levelDir)[0].capabilities).toBeUndefined();
    expect(usableTools(levelDir)).toHaveLength(1);
  });
});

describe('recordToolRun', () => {
  let levelDir: string;
  beforeEach(() => {
    levelDir = mkdtempSync(path.join(tmpdir(), 'agentlings-strikes-'));
    writeTool(levelDir, manifest());
  });
  afterEach(() =>
    rm(levelDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(() => {}),
  );

  it('counts a clean run and forgets old failures', () => {
    const once = recordToolRun(levelDir, manifest({ failures: 1 }), true);
    expect(once).toMatchObject({ runs: 1, failures: 0 });
    expect(once.retiredReason).toBeUndefined();
  });

  // Two, because one failure is noise and three is a habit the user has now
  // paid a fallback session for twice.
  it('retires a tool that fails twice running', () => {
    let current = recordToolRun(levelDir, manifest(), false);
    expect(current.retiredReason).toBeUndefined();
    current = recordToolRun(levelDir, current, false);
    expect(current.failures).toBe(STRIKES_ALLOWED);
    expect(current.retiredReason).toContain('in a row');
  });

  it('persists the verdict rather than keeping it in memory', () => {
    recordToolRun(levelDir, manifest(), false);
    expect(readTools(levelDir)[0].failures).toBe(1);
  });
});

describe('promotion', () => {
  it('names a tool after the job it was compiled from', () => {
    expect(toolNameFor('total the invoices in the spreadsheet')).toBe(
      'total-invoice-spreadsheet',
    );
  });

  it('falls back to a name rather than an empty one', () => {
    expect(toolNameFor('the a of')).toBe('tool');
  });

  // Compiling the same recipe twice used to write straight over the first
  // attempt, destroying the retired scripts and the reason they were retired
  // at exactly the moment they become worth reading.
  describe('naming a second attempt', () => {
    let levelDir: string;
    beforeEach(() => {
      levelDir = mkdtempSync(path.join(tmpdir(), 'agentlings-names-'));
    });
    afterEach(() =>
      rm(levelDir, { recursive: true, force: true, maxRetries: 10, retryDelay: 50 }).catch(
        () => {},
      ),
    );

    it('keeps the plain name while it is free', () => {
      expect(freeToolName(levelDir, 'tidy-invoice')).toBe('tidy-invoice');
    });

    it('steps aside for every attempt already on disk', () => {
      writeTool(levelDir, manifest({ name: 'tidy-invoice' }));
      expect(freeToolName(levelDir, 'tidy-invoice')).toBe('tidy-invoice-2');

      writeTool(levelDir, manifest({ name: 'tidy-invoice-2' }));
      expect(freeToolName(levelDir, 'tidy-invoice')).toBe('tidy-invoice-3');
    });

    it('leaves the earlier attempt exactly where it was', () => {
      writeTool(levelDir, manifest({ name: 'tidy-invoice', retiredReason: 'halves disagreed' }));
      writeTool(levelDir, manifest({ name: freeToolName(levelDir, 'tidy-invoice') }));

      const all = readTools(levelDir);
      expect(all.map((t) => t.name).sort()).toEqual(['tidy-invoice', 'tidy-invoice-2']);
      expect(all.find((t) => t.name === 'tidy-invoice')?.retiredReason).toBe('halves disagreed');
    });
  });

  // The check is the whole safety argument for the tier, so the brief has to
  // insist on it: without one, a tool is only a faster way to be wrong.
  /**
   * The one fact about the run a compile cannot discover for itself.
   *
   * While the scripts are being written they sit together in the sandbox, so a
   * verify that reads `run.mjs` by a bare relative path passes every test the
   * session can run — and then fails on the first real run, because installing
   * moves the scripts to the tool's own directory while the working directory
   * stays the sandbox. Measured on the first tool ever compiled against a door:
   * its verify could not find the `run.mjs` it had just finished checking, and
   * the tool took a strike for our omission.
   */
  it('warns that the scripts separate once installed', () => {
    const prompt = promotionPrompt({ key: 'x', approach: 'y', role: 'analyst' });
    expect(prompt).toContain('import.meta.dirname');
    expect(prompt).toContain("from the tool's own directory");
    expect(prompt).toMatch(/never as a bare/i);
  });

  it('asks for the check as firmly as the script', () => {
    const prompt = promotionPrompt(
      { key: 'total the invoices', approach: 'sum column D', role: 'analyst' },
    );
    expect(prompt).toContain(RUN_SCRIPT);
    expect(prompt).toContain(VERIFY_SCRIPT);
    expect(prompt).toContain('sum column D');
    expect(prompt).toMatch(/exit 0/i);
    expect(prompt).toContain('not merely check a file exists');
  });

  // A second attempt that is not told how the first failed is an identical
  // first try, and costs the same to discover that.
  it('says nothing about earlier attempts when there were none', () => {
    const prompt = promotionPrompt({ key: 'x', approach: 'y', role: 'analyst' });
    expect(prompt).not.toMatch(/retired/i);
  });

  it('hands a repeat compile the faults it must not reproduce', () => {
    const prompt = promotionPrompt({ key: 'x', approach: 'y', role: 'analyst' }, [
      'its verify rejects a multi-line export its run correctly lists',
    ]);
    expect(prompt).toContain('compiled before and the result was retired');
    expect(prompt).toContain('multi-line export');
    expect(prompt).toContain('disagreeing about the same input');
  });

  /**
   * The contract a tool with doors is written against. Every assertion here is
   * something a script cannot be expected to guess — the variable it reads, the
   * literal endpoint, and which of the two body shapes that door takes.
   */
  describe('a compile that was granted doors', () => {
    const recipe = { key: 'last 10 commits', approach: 'ask the code host', role: 'worker' };
    const withDoors = () =>
      promotionPrompt(recipe, [], [
        { name: 'github', endpoint: 'http://127.0.0.1:4600/internal/github', tools: ['list_commits'] },
      ]);

    it('names the variable, the endpoint and the tools it may call there', () => {
      const prompt = withDoors();
      expect(prompt).toContain(DOORS_ENV);
      expect(prompt).toContain('http://127.0.0.1:4600/internal/github');
      expect(prompt).toContain('list_commits');
      expect(prompt).toContain('{"tool": "...", "args": {...}}');
    });

    /**
     * The one rule that keeps a networked tool a method rather than a cache.
     * D-045 caught a compile whose `run.mjs` held the answer as a string
     * literal and whose `verify.mjs` then checked that same literal — a check
     * written by the session that wrote what it checks. A door makes that trap
     * both easier to fall into and worse, since the answer now goes stale.
     */
    it('forbids baking the answer in, and says why', () => {
      expect(withDoors()).toContain('cache rather than a method');
      expect(withDoors()).toContain('D-045');
    });

    it('relaxes the no-network rule only as far as the doors', () => {
      const prompt = withDoors();
      expect(prompt).toContain(`no network except the ${DOORS_ENV} doors`);
      expect(prompt).toContain('No dependencies, no shell commands');
    });

    /** A method that never went outside is told exactly what it always was. */
    it('leaves the original contract untouched when nothing was granted', () => {
      const plain = promotionPrompt(recipe);
      expect(plain).toContain('No dependencies, no shell commands, no network. Node built-ins only.');
      expect(plain).not.toContain(DOORS_ENV);
      expect(plain).not.toMatch(/internal\//);
    });
  });
});

describe('attachment shape on a tool (D-221)', () => {
  const ask = 'total the invoices in the spreadsheet';

  it('claims only a job of the shape it was compiled for', () => {
    const tool = manifest({ inputShape: ['csv:invoice|total'] });
    expect(findTool([tool], ask, false, [], ['csv:invoice|total'])).not.toBeNull();
    expect(findTool([tool], ask, false, [], ['csv:folio|rut|total'])).toBeNull();
    expect(findTool([tool], ask, false, [])).toBeNull();
  });

  it('a tool compiled before shapes were recorded keeps its unattached jobs and loses the attached ones', () => {
    expect(findTool([manifest()], ask, false, [])).not.toBeNull();
    expect(findTool([manifest()], ask, false, [], ['csv:invoice|total'])).toBeNull();
  });
});
