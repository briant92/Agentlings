import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import type { LedgerEntry } from './ledger';
import { buildProvenance, countByKind, neighbourhood, type Provenance } from './provenance';

/**
 * One level on disk with one record of every kind and one identifier of every
 * `via`, so each resolver is exercised by a record it can name.
 */
const DAY = '2026-08-10';
const AT = Date.parse(`${DAY}T12:00:00Z`);
const NOW = AT + 60_000;

let root: string;
let level: string;
let source: string;

function write(file: string, text: string): void {
  mkdirSync(path.dirname(file), { recursive: true });
  writeFileSync(file, text);
}

function seed(): void {
  // jobs: j1 ran the recipe; j2 continues j1; j3 shares j1's title on another day.
  write(
    path.join(level, 'jobs.json'),
    JSON.stringify([
      { id: 'j1', title: 'Tidy the exports', prompt: 'Tidy the exports', status: 'done', createdAt: AT, finishedAt: AT },
      { id: 'j2', title: 'Tidy the exports (again)', prompt: 'Tidy the exports', status: 'done', createdAt: AT, continues: 'j1' },
      { id: 'j3', title: 'Tidy the exports', prompt: 'Something else', status: 'done', createdAt: AT + 86_400_000, finishedAt: AT + 86_400_000 },
      { id: 'j4', title: 'Reconcile October', prompt: 'Reconcile these', status: 'done', createdAt: AT },
    ]),
  );
  write(path.join(level, 'jobs', 'j1', 'RESULT.md'), '# Exports tidied\n\nDone.\n');
  write(path.join(level, 'jobs', 'j9', 'RESULT.md'), '# A sandbox the queue forgot\n');
  write(
    path.join(level, 'jobs', 'j4', 'PRIOR-RECONCILIATION.json'),
    JSON.stringify({ jobId: 'j0', approvedAt: AT - 1, reconciliation: { balances: true } }),
  );
  write(
    path.join(level, 'recipes.json'),
    JSON.stringify([
      { key: 'tidy the exports', terms: [], role: 'worker', approach: 'look in src/', hits: 3, learnedAt: AT },
    ]),
  );
  write(
    path.join(level, 'tools', 'tidy-export', 'tool.json'),
    JSON.stringify({ name: 'tidy-export', recipeKey: 'tidy the exports', terms: [], hasRepo: false, failures: 0 }),
  );
  write(path.join(level, 'tools', 'tidy-export', 'run.mjs'), '');
  write(path.join(level, 'tools', 'tidy-export', 'verify.mjs'), '');
  write(
    path.join(level, 'tool-candidates.jsonl'),
    `${JSON.stringify({ at: AT, jobId: 'j1', prompt: 'Tidy the exports', recipeKey: 'tidy the exports', successes: 3 })}\n` +
      `${JSON.stringify({ at: AT, jobId: 'j1', prompt: 'Gone', recipeKey: 'a method since dropped', successes: 3 })}\n`,
  );
  write(
    path.join(level, 'memory', 'pip.md'),
    `# Pip — lessons\n\n- ${DAY} · exports live under src/ (job: Tidy the exports)\n- ${DAY} · a bare note with no stamp\n- ${DAY} · stamped with a title nobody has (job: Never Ran)\n`,
  );
  write(
    path.join(level, 'KNOWLEDGE.md'),
    `# Level knowledge\n\n- ${DAY} · Pip (worker) delivered "Tidy the exports" — exports live under src/\n- ${DAY} · Pip (worker) had "Tidy the exports" discarded — what was asked: "not those"\n- ${DAY} · Zed (worker) delivered "Never Ran" — orphan\n- a line that is not a note at all\n`,
  );
  write(path.join(source, 'notes', 'deploy.md'), '# Deploy\n\nPush then pray.\n');
  write(
    path.join(level, 'store-index.json'),
    JSON.stringify({
      sources: [source],
      syncedAt: AT,
      skipped: 0,
      entries: [
        { text: 'Deploy Push then pray.', source: 'notes/deploy.md', syncedAt: AT },
        { text: 'Second passage', source: 'notes/deploy.md', syncedAt: AT, scanned: true },
        { text: 'From a file since deleted', source: 'notes/gone.md', syncedAt: AT },
      ],
    }),
  );
  write(
    path.join(level, 'reconciliations', 'j4.json'),
    JSON.stringify({ jobId: 'j4', approvedAt: AT, inputShape: ['a'], reconciliation: { balances: true, period: '2026-10' } }),
  );
}

const ledger: LedgerEntry[] = [
  { at: AT, jobId: 'j1', levelId: 'lvl', jobClass: 'worker', tier: 'oneshot', outcome: 'done', costUsd: 0.1, recipeKey: 'tidy the exports' } as LedgerEntry,
  { at: AT, jobId: 'j2', levelId: 'lvl', jobClass: 'worker', tier: 'tool', outcome: 'done', costUsd: 0 } as LedgerEntry,
  { at: AT, jobId: 'j8', levelId: 'lvl', jobClass: 'worker', tier: 'session', outcome: 'failed', costUsd: 0.3, recipeKey: 'a method since dropped' } as LedgerEntry,
];

beforeEach(() => {
  root = mkdtempSync(path.join(tmpdir(), 'provenance-'));
  level = path.join(root, 'levels', 'lvl');
  source = path.join(root, 'material');
  mkdirSync(level, { recursive: true });
  mkdirSync(source, { recursive: true });
  seed();
});
afterEach(() => rmSync(root, { recursive: true, force: true }));

const edge = (p: Provenance, via: string) => p.edges.filter((e) => e.via === via);
const node = (p: Provenance, id: string) => p.nodes.find((n) => n.id === id);

describe('the provenance index', () => {
  it('makes one node per record, of every kind', () => {
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    expect(countByKind(p)).toEqual({
      job: 6, // j1..j4 listed, j9 a sandbox only, j8 a ledger row only
      note: 4, // three notes and the line that is not one — all lines are records
      lesson: 3,
      recipe: 2, // the real one and the missing one rows still name
      tool: 1,
      candidate: 2,
      source: 2,
      passage: 3,
      reconciliation: 2, // j4's, and the j0 a sandbox names but nobody banked
      agentling: 1,
    });
    expect(node(p, 'job:j9')?.flags).toEqual(['unlisted']);
    expect(node(p, 'job:j9')?.label).toBe('A sandbox the queue forgot');
    expect(node(p, 'job:j8')?.flags).toEqual(['unlisted']);
    expect(node(p, 'job:j1')?.label).toBe('Tidy the exports');
  });

  it('resolves every edge kind off the identifier it names', () => {
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    expect(edge(p, 'job.continues')).toEqual([{ from: 'job:j2', to: 'job:j1', via: 'job.continues' }]);
    expect(edge(p, 'job.prompt=recipe.key').map((e) => e.from).sort()).toEqual(['job:j1', 'job:j2']);
    expect(edge(p, 'ledger.recipeKey')).toHaveLength(2);
    expect(edge(p, 'ledger.tier=tool')).toEqual([{ from: 'job:j2', to: 'tool:tidy-export', via: 'ledger.tier=tool' }]);
    expect(edge(p, 'manifest.recipeKey')).toEqual([
      { from: 'tool:tidy-export', to: 'recipe:tidy the exports#none', via: 'manifest.recipeKey' },
    ]);
    expect(edge(p, 'candidate.recipeKey')).toHaveLength(4); // 2 candidate→recipe, 2 job→candidate
    expect(edge(p, 'entry.source')).toHaveLength(3);
    expect(edge(p, 'reconciliation.jobId')).toEqual([
      { from: 'reconciliation:j4', to: 'job:j4', via: 'reconciliation.jobId' },
    ]);
    expect(edge(p, 'prior.jobId')).toEqual([{ from: 'job:j4', to: 'reconciliation:j0', via: 'prior.jobId' }]);
    // lesson → agentling and note → agentling both ride note.agentling
    expect(edge(p, 'note.agentling').filter((e) => e.from.startsWith('lesson:'))).toHaveLength(3);
    // Pip's delivered note and the discard note; Zed's names nobody on file.
    expect(edge(p, 'note.agentling').filter((e) => e.from.startsWith('note:'))).toHaveLength(2);
  });

  it('narrows a title shared by several jobs to the one finished on the line\'s date', () => {
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    // "Tidy the exports" is j1 (on DAY) and j3 (the day after); the lesson is dated DAY.
    const stamped = edge(p, 'lesson.jobStamp');
    expect(stamped).toEqual([expect.objectContaining({ to: 'job:j1', via: 'lesson.jobStamp' })]);
    expect(stamped[0].ambiguous).toBeUndefined();
    const titled = edge(p, 'note.title');
    expect(titled).toHaveLength(2);
    expect(titled.every((e) => e.to === 'job:j1' && e.ambiguous === undefined)).toBe(true);
  });

  it('says when a title still names several jobs, pointing at the first', () => {
    // Give j3 the same day as j1, so the date cannot separate them.
    write(
      path.join(level, 'jobs.json'),
      JSON.stringify([
        { id: 'j1', title: 'Tidy the exports', prompt: 'x', status: 'done', createdAt: AT, finishedAt: AT },
        { id: 'j3', title: 'Tidy the exports', prompt: 'y', status: 'done', createdAt: AT, finishedAt: AT },
      ]),
    );
    const p = buildProvenance(level, 'lvl', [], NOW);
    expect(edge(p, 'lesson.jobStamp')).toEqual([
      { from: expect.stringMatching(/^lesson:pip:/), to: 'job:j1', via: 'lesson.jobStamp', ambiguous: 2 },
    ]);
  });

  it('counts an identifier that names nothing instead of hiding it', () => {
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    expect(p.unresolved).toEqual({
      'lesson.jobStamp': 1, // (job: Never Ran)
      'note.title': 1, // Zed delivered "Never Ran"
      'note.agentling': 1, // Zed has no memory file
    });
  });

  it('shows a recipe rows still name but the file no longer holds as missing, not as nothing', () => {
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    const gone = node(p, 'recipe:a method since dropped#none');
    expect(gone?.flags).toEqual(['missing']);
    expect(p.edges.filter((e) => e.to === gone?.id).map((e) => e.via).sort()).toEqual([
      'candidate.recipeKey',
      'ledger.recipeKey',
    ]);
  });

  it('flags a store source whose file is gone, and a scanned passage, and a stale index', () => {
    const fresh = buildProvenance(level, 'lvl', [], NOW);
    expect(node(fresh, 'source:notes/gone.md')?.flags).toEqual(['missing']);
    expect(node(fresh, 'source:notes/deploy.md')?.flags).toEqual([]);
    expect(node(fresh, 'passage:notes/deploy.md#2')?.flags).toEqual(['scanned']);
    const later = buildProvenance(level, 'lvl', [], NOW + 8 * 24 * 60 * 60 * 1000);
    expect(node(later, 'passage:notes/deploy.md#1')?.flags).toEqual(['stale']);
    expect(node(later, 'source:notes/gone.md')?.flags).toEqual(['stale', 'missing']);
  });

  it('keeps a torn file as an unparsed node and builds the rest', () => {
    write(path.join(level, 'recipes.json'), '{ not json');
    write(path.join(level, 'store-index.json'), '[[[');
    write(path.join(level, 'reconciliations', 'bad.json'), '{');
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    expect(node(p, 'recipe:recipes.json')?.flags).toEqual(['unparsed']);
    expect(node(p, 'source:store-index.json')?.flags).toEqual(['unparsed']);
    expect(node(p, 'reconciliation:bad.json')?.flags).toEqual(['unparsed']);
    expect(countByKind(p).job).toBe(6);
    expect(countByKind(p).lesson).toBe(3);
  });

  it('marks a prior a sandbox names but nobody banked as missing', () => {
    const p = buildProvenance(level, 'lvl', [], NOW);
    expect(node(p, 'reconciliation:j0')?.flags).toEqual(['missing']);
    expect(node(p, 'reconciliation:j4')?.label).toBe('reconciliation 2026-10');
  });

  it('never reads another level: two levels share no node id', () => {
    const other = path.join(root, 'levels', 'other');
    mkdirSync(other, { recursive: true });
    write(path.join(other, 'jobs.json'), JSON.stringify([{ id: 'k1', title: 'Elsewhere', prompt: 'z', status: 'done', createdAt: AT }]));
    write(path.join(other, 'KNOWLEDGE.md'), `# Level knowledge\n\n- ${DAY} · Rue (worker) delivered "Elsewhere" — a different lesson\n`);
    const a = buildProvenance(level, 'lvl', ledger, NOW);
    const b = buildProvenance(other, 'other', [], NOW);
    const ids = new Set(a.nodes.map((n) => n.id));
    expect(b.nodes.some((n) => ids.has(n.id))).toBe(false);
    expect(b.edges.some((e) => ids.has(e.from) || ids.has(e.to))).toBe(false);
  });

  it('reports the newest input mtime, so a cache can tell when to rebuild', () => {
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    expect(p.inputsMtime).toBeGreaterThan(0);
    writeFileSync(path.join(level, 'KNOWLEDGE.md'), `# Level knowledge\n\n- ${DAY} · a new line\n`);
    const q = buildProvenance(level, 'lvl', ledger, NOW);
    expect(q.inputsMtime).toBeGreaterThanOrEqual(p.inputsMtime);
  });
});

describe('a neighbourhood', () => {
  it('is the node, every edge touching it, and the nodes at the other end — capped, with the rest counted', () => {
    const p = buildProvenance(level, 'lvl', ledger, NOW);
    const around = neighbourhood(p, 'job:j1');
    expect(around?.node.id).toBe('job:j1');
    const vias = around!.edges.map((e) => e.via).sort();
    expect(vias).toEqual([
      'candidate.recipeKey',
      'candidate.recipeKey',
      'job.continues',
      'job.prompt=recipe.key',
      'ledger.recipeKey',
      'lesson.jobStamp',
      'note.title',
      'note.title',
    ]);
    expect(around!.nodes.map((n) => n.id)).not.toContain('job:j1');
    expect(around!.more).toBe(0);
    const capped = neighbourhood(p, 'job:j1', 3);
    expect(capped!.edges).toHaveLength(3);
    expect(capped!.more).toBe(5);
    expect(neighbourhood(p, 'job:nope')).toBeNull();
  });
});
