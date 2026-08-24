import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WorkProfile } from '@agentlings/shared';
import { type CoverageContext } from './coverage';
import { benchmark } from './coveragebench';
import { MatchIndex } from './match';
import { RoleRegistry, listSkills } from './roles';
import { readOnet, readProfiles } from './workprofile';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registry = new RoleRegistry(path.join(ROOT, 'roles'));
registry.load();
const roles = registry.list();
const index = new MatchIndex(registry.loaded(), listSkills(path.join(ROOT, 'skills')));
const doors = ['web', 'render'].map((name) => ({ name, open: true })).concat(
  ['github', 'search', 'bls', 'calendar', 'mail', 'browser', 'google'].map((name) => ({ name, open: false })),
);
const ctx: CoverageContext = { index, roles, doors };

const FIXTURES = path.join(ROOT, 'fixtures/workprofiles');
const fixtures = readProfiles(path.join(FIXTURES, 'profiles.json'));
const onet = readOnet(path.join(FIXTURES, 'onet'));

/** Three cellar jobs nobody installed understands — the same words, three profiles. */
const cellar = (n: number, text: string): WorkProfile => ({
  id: `fixture:cellar-${n}`,
  source: 'fixture',
  title: `Cellar job ${n}`,
  aliases: [],
  skills: [],
  tools: [],
  tasks: [{ id: `fixture:cellar-${n}:1`, text, required: true }],
});
const CELLAR = [
  cellar(1, 'Grade tannin and acidity of each vintage by appellation.'),
  cellar(2, 'Rate the tannin of every vintage against its appellation.'),
  cellar(3, 'Note tannin and acidity per vintage for the cellar book.'),
];

describe('benchmark', () => {
  const report = benchmark(ctx, [...fixtures, ...onet, ...CELLAR]);

  it('counts every profile and task once, by source', () => {
    expect(report.totals.profiles).toBe(fixtures.length + onet.length + CELLAR.length);
    const tasks = [...fixtures, ...onet, ...CELLAR].reduce((n, p) => n + p.tasks.length, 0);
    expect(report.totals.tasks).toBe(tasks);
    expect(report.grades.covered + report.grades.partial + report.grades.uncovered).toBe(tasks);
    expect(report.bySource.map((s) => [s.source, s.profiles])).toEqual([
      ['fixture', fixtures.length + CELLAR.length],
      ['onet', onet.length],
    ]);
    expect(report.bySource.find((s) => s.source === 'onet')?.version).toBe('30.0');
  });

  /**
   * The headline number (D-237), and the property that keeps it honest: a
   * position may not become hireable on duties the matcher merely
   * word-matched. The technical-writer fixture is covered on power evidence
   * throughout and must count; the sommelier and the three cellar jobs are
   * pure matcher gaps and must not, however confidently their words matched.
   */
  it('counts a position hireable only on evidence, never on an unverified word match', () => {
    expect(report.hireable.share).toBe(0.7);
    expect(report.hireable.titles).toContain('Technical writer');
    for (const cellarJob of ['Cellar job 1', 'Cellar job 2', 'Cellar job 3']) {
      expect(report.hireable.titles).not.toContain(cellarJob);
    }
    expect(report.hireable.titles).not.toContain('Sommelier');
    // The strict count can never exceed the evidence-backed one: covered is a
    // subset of vouched, so a report where the low end outran the high end
    // would mean the two were measuring different populations.
    expect(report.hireable.onCoveredAlone).toBeLessThanOrEqual(report.hireable.positions);
    // Sorted and complete, so the list is the count rather than a sample.
    expect(report.hireable.titles).toEqual([...report.hireable.titles].sort());
    expect(report.hireable.titles.length).toBe(report.hireable.positions);
  });

  /**
   * A profile with no core duties is not a position that failed — there was
   * nothing to grade — so it stays out of the denominator entirely.
   */
  it('leaves an occupation with no core duties out of the count, not counted as a miss', () => {
    const supplementalOnly: WorkProfile = {
      id: 'fixture:supplemental-only',
      source: 'fixture',
      title: 'Supplemental only',
      aliases: [],
      skills: [],
      tools: [],
      tasks: [{ id: 'fixture:supplemental-only:1', text: 'Write the documentation.', required: false }],
    };
    const withIt = benchmark(ctx, [...fixtures, ...onet, ...CELLAR, supplementalOnly]);
    expect(withIt.hireable.of).toBe(report.hireable.of);
    expect(withIt.hireable.titles).not.toContain('Supplemental only');
  });

  it('is deterministic: the same bytes twice, and in any input order', () => {
    const again = benchmark(ctx, [...fixtures, ...onet, ...CELLAR]);
    expect(JSON.stringify(again)).toBe(JSON.stringify(report));
    const shuffled = benchmark(ctx, [...CELLAR, ...onet, ...fixtures].reverse());
    expect(JSON.stringify(shuffled)).toBe(JSON.stringify(report));
  });

  it('keeps matcher gaps apart from capability gaps, and door from policy', () => {
    expect(report.gaps.matcher).toBeGreaterThan(0);
    expect(report.gaps.capability).toBeGreaterThan(0);
    expect(report.matcher.notUnderstood).toBeGreaterThanOrEqual(4); // the sommelier and the cellar
    expect(report.capabilities.map((c) => c.key)).toContain('physical');
    expect(report.policies.map((c) => c.key)).toEqual(expect.arrayContaining(['money', 'people']));
    expect(report.doors.map((c) => c.key)).toEqual(expect.arrayContaining(['system', 'closed:search']));
    // Nothing a word gap touches is called not-this-crew.
    expect(report.notThisCrew.map((n) => n.profileId)).toEqual(['fixture:accounts-payable', 'fixture:forklift-operator']);
  });

  it('says which roles take the work and carries the task ids behind every count', () => {
    expect(report.rolesByWork[0].tasks).toBeGreaterThan(0);
    for (const c of [...report.uncoveredTerms, ...report.doors, ...report.policies, ...report.capabilities]) {
      expect(c.examples.length).toBeGreaterThan(0);
      expect(c.examples[0].taskId).toBeTruthy();
      expect(c.examples[0].profileId).toBeTruthy();
    }
    expect(report.uncoveredTerms.map((t) => t.key)).toEqual(expect.arrayContaining(['tannin', 'appellation']));
  });

  it('aggregates a repeated vocabulary gap into a candidate cluster, for review and nothing else', () => {
    const tannin = report.clusters.find((c) => c.term === 'tannin');
    expect(tannin).toBeDefined();
    expect(tannin!.profiles).toBe(4);
    expect(tannin!.with).toContain('vintage');
    expect(tannin!.examples.length).toBeGreaterThan(0);
    expect(tannin!.meetsBar).toBe(true);
    expect(tannin!.stillNot).toEqual([]);
    // Below the bar: one profile's words are a word, not a job.
    expect(benchmark(ctx, fixtures).clusters.find((c) => c.term === 'tannin')).toBeUndefined();
    // And the report never creates anything: no role, no skill, no file.
    expect(Object.keys(report)).not.toContain('created');
  });

  it('records the worker fallback apart from the grade without making it', () => {
    const crew = { awake: [{ role: 'worker', state: 'idle' }] };
    const thin = benchmark({ ...ctx, crew }, fixtures);
    expect(thin.fallbacks).toEqual(
      expect.arrayContaining([expect.objectContaining({ role: 'scribe', to: 'worker' }), expect.objectContaining({ role: 'researcher', to: 'worker' })]),
    );
    expect(thin.rosterGaps.map((g) => g.role)).toEqual(expect.arrayContaining(['scribe', 'researcher']));
    expect(thin.byOccupation.find((o) => o.profileId === 'fixture:technical-writer')?.role).toBe('scribe');
    expect(thin.byOccupation.find((o) => o.profileId === 'fixture:technical-writer')?.fallbackRole).toBe('worker');
    // Full house: no fallback, no roster gap.
    expect(report.fallbacks).toEqual([]);
    expect(report.rosterGaps).toEqual([]);
  });

  it('names library templates the uncovered duties reach, when a library is given', () => {
    const library = [
      { id: '1', kind: 'role' as const, name: 'wine-sommelier', description: 'Grades vintages by tannin, acidity and appellation', repo: 'r', path: 'p', sha: 's', source: 'src', trust: 'community' },
      { id: '2', kind: 'skill' as const, name: 'small-diffs', description: 'Change the least that fixes it', repo: 'r', path: 'p', sha: 's', source: 'src', trust: 'official' },
    ];
    const withLib = benchmark(ctx, [...fixtures, ...CELLAR], { library });
    expect(withLib.suggested[0].key).toBe('role:wine-sommelier');
    expect(withLib.suggested[0].profiles).toBe(4);
    expect(report.suggested).toEqual([]);
  });
});
