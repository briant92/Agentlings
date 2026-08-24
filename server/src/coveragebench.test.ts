import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WorkProfile } from '@agentlings/shared';
import { coverage, type CoverageContext } from './coverage';
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

/**
 * A position whose every core duty is a *confident word match nobody
 * vouches for* — `partial` on `lexical` evidence, which is the one thing the
 * hireable count must never treat as capability (D-237). The cellar jobs
 * cannot test this: they grade `uncovered`, so they would stay out of the
 * count under any definition. This one is only excluded by the rule itself.
 */
const WORD_MATCH_ONLY: WorkProfile = {
  id: 'fixture:word-match-only',
  source: 'fixture',
  title: 'Word match only',
  aliases: [],
  skills: [],
  tools: [],
  tasks: [
    { id: 'fixture:word-match-only:1', text: 'Receive, record, and bank cash, checks, and vouchers.', required: true },
    { id: 'fixture:word-match-only:2', text: 'Receive, record, and bank cash, checks, and vouchers.', required: true },
  ],
};

/**
 * Two positions the crew genuinely covers, with ids that sort the opposite
 * way from their titles — so the report's title list is only in order
 * because it was sorted, and a dropped `sort()` fails rather than passing on
 * a fixture set that happened to be alphabetical already.
 */
const sortProbe = (id: string, title: string): WorkProfile => ({
  id: `fixture:sort-${id}`,
  source: 'fixture',
  title,
  aliases: [],
  skills: [],
  tools: [],
  tasks: [{ id: `fixture:sort-${id}:1`, text: 'Write and maintain the user guide and the readme.', required: true }],
});
const SORT_PROBES = [sortProbe('a', 'Zulu technical author'), sortProbe('z', 'Alpha technical author')];

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
    const r = benchmark(ctx, [...fixtures, ...onet, ...CELLAR, WORD_MATCH_ONLY]);
    expect(r.hireable.share).toBe(0.7);
    expect(r.hireable.titles).toContain('Technical writer');
    for (const cellarJob of ['Cellar job 1', 'Cellar job 2', 'Cellar job 3']) {
      expect(r.hireable.titles).not.toContain(cellarJob);
    }
    expect(r.hireable.titles).not.toContain('Sommelier');

    // The load-bearing one. Every core duty here grades `partial` on
    // `lexical` evidence — the matcher reaching a role with nothing
    // vouching — so it is in the denominator, would clear 70 % if a word
    // match counted, and must not appear.
    const graded = coverage(ctx, WORD_MATCH_ONLY).tasks;
    expect(graded.every((t) => t.grade === 'partial' && t.evidence === 'lexical')).toBe(true);
    expect(r.hireable.titles).not.toContain('Word match only');

    // The strict count can never exceed the evidence-backed one: covered is a
    // subset of vouched, so a report where the low end outran the high end
    // would mean the two were measuring different populations.
    expect(r.hireable.onCoveredAlone).toBeLessThanOrEqual(r.hireable.positions);
    // Complete, so the list is the count rather than a sample.
    expect(r.hireable.titles.length).toBe(r.hireable.positions);
  });

  /**
   * The titles are sorted rather than merely arriving in order: these two
   * probes are covered work whose ids sort the opposite way from their
   * titles, so a report built without the sort fails here instead of coasting
   * on a fixture set that was alphabetical by accident.
   */
  it('sorts the title list, so the count can always be read back as names', () => {
    const r = benchmark(ctx, [...fixtures, ...onet, ...CELLAR, ...SORT_PROBES]);
    expect(r.hireable.titles).toContain('Alpha technical author');
    expect(r.hireable.titles).toContain('Zulu technical author');
    expect(r.hireable.titles.indexOf('Alpha technical author')).toBeLessThan(
      r.hireable.titles.indexOf('Zulu technical author'),
    );
    expect(r.hireable.titles).toEqual([...r.hireable.titles].sort());
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
