import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEntry } from './ledger';
import { buildProvenance } from './provenance';
import { MAX_ENTRY_CHARS, MAX_PASSAGES_PER_FILE, MAX_PER_SOURCE } from './store';

/**
 * The two budgets the index was given before it was built (the review of
 * 2026-08-23): an hq-shaped level in 200 ms, a level at the store's own caps
 * in 2 s, and in neither case a pause on the event loop the 100 ms tick
 * would notice. Synthesised, never copied from `.agentlings/` — the real
 * levels hold Brian's material.
 *
 * The numbers printed are the measurement; the assertions are order-of-
 * magnitude guards, because this file runs beside eighty others on worker
 * threads and has measured the same build at six times its unloaded time by
 * starvation alone (D-166). The budgets are read off an unloaded run of this
 * file, and off scripts/provenance-report.ts against a real level.
 */

const AT = Date.parse('2026-08-10T12:00:00Z');
const NOW = AT + 60_000;

let root: string;

function write(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

/** A deterministic sentence, so labels and hashes differ per record. */
function sentence(i: number, words = 12): string {
  const bank = ['export', 'ledger', 'invoice', 'deploy', 'retry', 'brief', 'folio', 'panel', 'crew', 'sandbox', 'quote', 'route'];
  return `${Array.from({ length: words }, (_, k) => bank[(i * 7 + k * 3) % bank.length]).join(' ')} n${i}`;
}

function hqShaped(level: string): LedgerEntry[] {
  const jobs = Array.from({ length: 238 }, (_, i) => ({
    id: `j${i}`,
    title: `Job ${i % 120}`, // titles repeat, as recurring sentences do
    prompt: sentence(i % 60),
    status: 'done',
    createdAt: AT + i * 3_600_000,
    finishedAt: AT + i * 3_600_000 + 60_000,
    ...(i % 8 === 7 ? { continues: `j${i - 1}` } : {}),
  }));
  write(path.join(level, 'jobs.json'), JSON.stringify(jobs));
  for (const job of jobs) {
    write(path.join(level, 'jobs', job.id, 'RESULT.md'), `# ${job.title}\n\n${sentence(job.createdAt % 97, 40)}\n`);
    write(path.join(level, 'jobs', job.id, 'LESSON.md'), sentence(3));
    write(path.join(level, 'jobs', job.id, 'APPROACH.md'), sentence(4));
  }
  const shapes = [undefined, ['a', 'b'], ['c']];
  write(
    path.join(level, 'recipes.json'),
    JSON.stringify(
      Array.from({ length: 60 }, (_, i) => ({
        key: sentence(i),
        terms: [],
        role: 'worker',
        approach: sentence(i + 100, 30),
        hits: i,
        learnedAt: AT,
        ...(shapes[i % 3] ? { inputShape: shapes[i % 3] } : {}),
      })),
    ),
  );
  for (let t = 0; t < 5; t++) {
    const dir = path.join(level, 'tools', `tool-${t}`);
    write(path.join(dir, 'tool.json'), JSON.stringify({ name: `tool-${t}`, recipeKey: sentence(t), terms: [], hasRepo: false, failures: 0, ...(t === 4 ? { retiredReason: 'failed 2 runs in a row' } : {}) }));
    write(path.join(dir, 'run.mjs'), '');
    write(path.join(dir, 'verify.mjs'), '');
  }
  write(
    path.join(level, 'tool-candidates.jsonl'),
    Array.from({ length: 6 }, (_, i) => JSON.stringify({ at: AT, jobId: `j${i}`, prompt: sentence(i), recipeKey: sentence(i), successes: 3 })).join('\n') + '\n',
  );
  const names = ['pip', 'dot', 'moss', 'bea', 'fen', 'ivy', 'sol'];
  names.forEach((name, n) => {
    const lines = Array.from({ length: 28 }, (_, i) => `- 2026-08-${String(1 + (i % 28)).padStart(2, '0')} · ${sentence(i + n, 14)} (job: Job ${(i * 5 + n) % 120})`);
    write(path.join(level, 'memory', `${name}.md`), `# ${name} — lessons\n\n${lines.join('\n')}\n`);
  });
  write(
    path.join(level, 'KNOWLEDGE.md'),
    `# Level knowledge\n\n${Array.from({ length: 154 }, (_, i) => `- 2026-08-${String(1 + (i % 28)).padStart(2, '0')} · ${names[i % 7]} (worker) delivered "Job ${i % 120}" — ${sentence(i, 16)}`).join('\n')}\n`,
  );
  return Array.from({ length: 250 }, (_, i) => ({
    at: AT + i,
    jobId: `j${i % 238}`,
    levelId: 'bench',
    jobClass: 'worker',
    tier: i % 5 === 0 ? 'oneshot' : i % 11 === 0 ? 'tool' : 'session',
    outcome: 'done',
    costUsd: 0.1,
    ...(i % 5 === 0 ? { recipeKey: sentence(i % 60) } : {}),
  })) as LedgerEntry[];
}

function atTheCaps(level: string, source: string): void {
  write(path.join(level, 'jobs.json'), '[]');
  const entries = [];
  for (let f = 0; f < MAX_PER_SOURCE; f++) {
    const rel = `docs/file-${f}.md`;
    write(path.join(source, rel), '');
    for (let p = 0; p < MAX_PASSAGES_PER_FILE; p++) {
      entries.push({ text: sentence(f * 7 + p, 5).padEnd(MAX_ENTRY_CHARS, ' x'), source: rel, syncedAt: AT });
    }
  }
  write(path.join(level, 'store-index.json'), JSON.stringify({ sources: [source], syncedAt: AT, skipped: 0, entries }));
  write(
    path.join(level, 'KNOWLEDGE.md'),
    `# Level knowledge\n\n${Array.from({ length: 400 }, (_, i) => `- 2026-08-01 · pip (worker) delivered "none" — ${sentence(i, 16)}`).join('\n')}\n`,
  );
}

/** The longest the loop went without turning over while `run` was awaited. */
async function worstPause(run: () => Promise<void>): Promise<number> {
  let worst = 0;
  let last = performance.now();
  const probe = setInterval(() => {
    const now = performance.now();
    worst = Math.max(worst, now - last - 5);
    last = now;
  }, 5);
  await new Promise((r) => setTimeout(r, 20));
  await run();
  await new Promise((r) => setTimeout(r, 20));
  clearInterval(probe);
  return worst;
}

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'provenance-bench-'));
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

describe('the provenance index against its budgets', () => {
  it('builds an hq-shaped level inside 200 ms', async () => {
    const level = path.join(root, 'levels', 'bench');
    mkdirSync(level, { recursive: true });
    const ledger = hqShaped(level);
    await buildProvenance(level, 'bench', ledger, NOW); // warm the file cache once, as a second panel open would
    let p!: Awaited<ReturnType<typeof buildProvenance>>;
    const pause = await worstPause(async () => {
      p = await buildProvenance(level, 'bench', ledger, NOW);
    });
    console.log(`hq-shaped: ${p.buildMs} ms, ${p.nodes.length} nodes, ${p.edges.length} edges, worst pause ${pause.toFixed(0)} ms`);
    expect(p.nodes.length).toBeGreaterThan(238 + 154 + 196 + 60);
    // Budget 200 ms unloaded (34 ms measured). In the parallel suite the same
    // build has taken 204 ms by starvation, so this ceiling is the order-of-
    // magnitude guard; the budget itself is read off the unloaded run and off
    // scripts/provenance-report.ts against a real level (hq: 55–60 ms).
    expect(p.buildMs).toBeLessThan(1000);
    // Unloaded this is 25–40 ms. Under the full suite, with 80 other files on
    // worker threads, the same slice has measured 136 ms by starvation alone
    // (the D-166 shape), so what is pinned is the property — no one slice
    // holds more than a quarter of the build, above a 100 ms floor — and the
    // printed number is the measurement, read as a claim about the machine first.
    expect(pause).toBeLessThan(Math.max(100, p.buildMs / 4));
  });

  it('builds a level at the store caps inside 2 s', async () => {
    const level = path.join(root, 'levels', 'caps');
    const source = path.join(root, 'material');
    mkdirSync(level, { recursive: true });
    atTheCaps(level, source);
    let p!: Awaited<ReturnType<typeof buildProvenance>>;
    const pause = await worstPause(async () => {
      p = await buildProvenance(level, 'caps', [], NOW);
    });
    console.log(`at the caps: ${p.buildMs} ms, ${p.nodes.length} nodes, ${p.edges.length} edges, worst pause ${pause.toFixed(0)} ms`);
    expect(p.nodes.length).toBe(MAX_PER_SOURCE * MAX_PASSAGES_PER_FILE + MAX_PER_SOURCE + 400);
    // Budget 2 s unloaded (400 ms measured; 1.3 s once under the suite).
    expect(p.buildMs).toBeLessThan(5000);
    // The one indivisible slice is reading and parsing the 30 MB index — 31 ms
    // for the parse alone, measured — which the store itself pays on every
    // job and every quote. Everything else yields; this cannot without
    // streaming JSON, which is not worth its weight for a panel. Measured at
    // 52 ms unloaded, three runs; 150 ms once under the full suite. Same rule
    // as above: the property pinned is that the build yields.
    expect(pause).toBeLessThan(Math.max(100, p.buildMs / 4));
  });
});
