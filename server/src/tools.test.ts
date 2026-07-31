import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { terms } from './recipes';
import {
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
});

describe('a tool on disk', () => {
  let levelDir: string;
  beforeEach(() => {
    levelDir = mkdtempSync(path.join(tmpdir(), 'agentlings-tools-'));
  });
  afterEach(() => rmSync(levelDir, { recursive: true, force: true }));

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
});

describe('recordToolRun', () => {
  let levelDir: string;
  beforeEach(() => {
    levelDir = mkdtempSync(path.join(tmpdir(), 'agentlings-strikes-'));
    writeTool(levelDir, manifest());
  });
  afterEach(() => rmSync(levelDir, { recursive: true, force: true }));

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
    afterEach(() => rmSync(levelDir, { recursive: true, force: true }));

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
});
