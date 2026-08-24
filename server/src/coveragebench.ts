import type { CatalogEntry, CoverageResult, GapKind, TaskCoverage, TaskGrade, WorkProfile } from '@agentlings/shared';
import { boundaryById, coverage, coverageLine, type CoverageContext } from './coverage';
import { searchEntries, tokenize } from './match';

/**
 * The coverage benchmark: every profile graded, then the grades added up
 * into the questions the roster is balanced on — what is covered, what is
 * merely not understood, what stops at a door or a decision, what nobody
 * here holds, and what repeats often enough to be a role's worth of work.
 *
 * Deterministic: same profiles, same catalog, same doors → the same report
 * byte for byte (sorted throughout, no clock, no randomness). Every line of
 * the report carries the task ids it was counted from, so an aggregate can
 * be traced back to the record that produced it.
 *
 * It never substitutes the worker. A duty nobody here holds is a roster gap
 * with the fallback the queue *would* make written beside it (D-200), and
 * the execution path is untouched.
 */

export interface Example {
  taskId: string;
  profileId: string;
  text: string;
}

export interface Counted {
  key: string;
  count: number;
  /** Distinct profiles it was seen in. */
  profiles: number;
  examples: Example[];
}

export interface RoleCluster {
  /** The term the cluster is named for. */
  term: string;
  /** Terms that travel with it in the same duties, most frequent first. */
  with: string[];
  tasks: number;
  profiles: number;
  occupations: string[];
  examples: Example[];
  /** Boundaries that fired in the same profiles — what the role would still not do. */
  stillNot: string[];
  /** The bar a candidate must clear (D-229's rule): repeated across profiles, coherent, not a word gap, not a roster gap. */
  meetsBar: boolean;
}

/**
 * How much of an occupation's core work must rest on recorded evidence
 * before the board may call the position hireable. 70 % is the bar the
 * expansion plan proposed; it is a threshold rather than a measurement, so
 * it lives here as one named constant and the report carries it out.
 */
export const HIREABLE_SHARE = 0.7;

/**
 * A duty counts toward a hireable position only when its grade rests on
 * **recorded evidence** — a power that vouches, or a boundary that says
 * which half the crew takes. That is narrower than "covered or partial",
 * and deliberately so: `partial` also holds the matcher's unverified word
 * matches, and D-229's whole rule is that a word match between a duty and a
 * role's prompt is not evidence the role can do it. Counting those would
 * build the headline number out of exactly what the grader refuses to claim.
 */
export const vouchedFor = (t: TaskCoverage): boolean =>
  t.grade === 'covered' || (t.grade === 'partial' && t.evidence !== 'lexical' && t.evidence !== 'none');

export interface HireableCount {
  /** The bar applied, so a report says what it measured against. */
  share: number;
  /** Positions clearing the bar on evidence-backed duties. */
  positions: number;
  /** Positions with core duties to grade at all. */
  of: number;
  /** The stricter read: clearing the same bar on `covered` alone. */
  onCoveredAlone: number;
  /** Which ones, for a human read; the whole list, sorted. */
  titles: string[];
}

export interface CoverageReport {
  totals: { profiles: number; tasks: number; required: number };
  /** How many real positions the crew could actually hold down (§the plan's KPI). */
  hireable: HireableCount;
  grades: Record<TaskGrade, number>;
  requiredGrades: Record<TaskGrade, number>;
  gaps: Record<GapKind, number>;
  /** A matcher gap split: words nothing knows, vs words that reach a role no power vouches for. */
  matcher: { notUnderstood: number; unverified: number; understoodUnclaimed: number };
  bySource: { source: string; version?: string; profiles: number; tasks: number; grades: Record<TaskGrade, number> }[];
  byOccupation: {
    profileId: string;
    occupationId?: string;
    title: string;
    role: string | null;
    confidence: number;
    grades: Record<TaskGrade, number>;
    gaps: Record<GapKind, number>;
    notThisCrew: boolean;
    fallbackRole: string | null;
    line: string;
  }[];
  rolesByWork: { role: string; tasks: number; covered: number; profiles: number }[];
  fallbacks: { role: string; to: string; profiles: number; examples: string[] }[];
  uncoveredTerms: Counted[];
  uncoveredSkills: Counted[];
  uncoveredTools: Counted[];
  doors: Counted[];
  policies: Counted[];
  capabilities: Counted[];
  rosterGaps: { role: string; tasks: number; profiles: number; resting: number }[];
  /** Library templates the uncovered duties reach, and how often; empty without a synced library. */
  suggested: Counted[];
  clusters: RoleCluster[];
  /** Pairs of roles that keep taking the same duties on the same power evidence. */
  overlaps: { roles: [string, string]; tasks: number; powers: string[]; examples: Example[] }[];
  notThisCrew: { profileId: string; title: string; why: string }[];
}

export interface BenchOptions {
  /** Library templates to search with the uncovered duties (optional). */
  library?: CatalogEntry[];
  /** How many examples each aggregate keeps. */
  examples?: number;
  /** A cluster needs this many distinct profiles. */
  clusterProfiles?: number;
  /** How many aggregates each list keeps. */
  top?: number;
}

const zero = <K extends string>(keys: readonly K[]) =>
  Object.fromEntries(keys.map((k) => [k, 0])) as Record<K, number>;
const GRADES = ['covered', 'partial', 'uncovered'] as const;
const GAPS = ['matcher', 'capability', 'door', 'policy', 'roster'] as const;

/** Count things by key, keeping distinct profiles and the first examples. Sorted by count, then key. */
class Tally {
  private m = new Map<string, { count: number; profiles: Set<string>; examples: Example[] }>();
  constructor(private keep: number) {}
  add(key: string, ex: Example): void {
    const e = this.m.get(key) ?? { count: 0, profiles: new Set<string>(), examples: [] };
    e.count += 1;
    e.profiles.add(ex.profileId);
    if (e.examples.length < this.keep) e.examples.push(ex);
    this.m.set(key, e);
  }
  list(top: number): Counted[] {
    return [...this.m.entries()]
      .map(([key, e]) => ({ key, count: e.count, profiles: e.profiles.size, examples: e.examples }))
      .sort((a, b) => b.count - a.count || a.key.localeCompare(b.key))
      .slice(0, top);
  }
}

export function benchmark(ctx: CoverageContext, profiles: readonly WorkProfile[], opts: BenchOptions = {}): CoverageReport {
  const keep = opts.examples ?? 3;
  const top = opts.top ?? 25;
  const minProfiles = opts.clusterProfiles ?? 3;
  const results = [...profiles]
    .sort((a, b) => a.id.localeCompare(b.id))
    .map((p) => ({ profile: p, result: coverage(ctx, p) }));

  const grades = zero(GRADES);
  const requiredGrades = zero(GRADES);
  const gaps = zero(GAPS);
  const matcher = { notUnderstood: 0, unverified: 0, understoodUnclaimed: 0 };
  const sources = new Map<string, CoverageReport['bySource'][number]>();
  const roles = new Map<string, { tasks: number; covered: number; profiles: Set<string> }>();
  const fallbacks = new Map<string, { profiles: Set<string>; examples: string[] }>();
  const terms = new Tally(keep);
  const skills = new Tally(keep);
  const tools = new Tally(keep);
  const doors = new Tally(keep);
  const policies = new Tally(keep);
  const capabilities = new Tally(keep);
  const rosterGaps = new Map<string, { tasks: number; profiles: Set<string>; resting: number }>();
  const suggested = new Tally(keep);
  const overlaps = new Map<string, { tasks: number; powers: Map<string, number>; examples: Example[] }>();
  const candidates: { task: TaskCoverage; profile: WorkProfile }[] = [];
  const notThisCrew: CoverageReport['notThisCrew'] = [];

  for (const { profile, result } of results) {
    const src = sources.get(profile.source) ?? {
      source: profile.source,
      version: profile.sourceVersion,
      profiles: 0,
      tasks: 0,
      grades: zero(GRADES),
    };
    src.profiles += 1;
    sources.set(profile.source, src);
    for (const s of result.missing.skills) skills.add(s, { taskId: '', profileId: profile.id, text: profile.title });
    for (const s of result.missing.tools) tools.add(s, { taskId: '', profileId: profile.id, text: profile.title });
    if (result.roster.role && !result.roster.held && result.roster.fallbackRole) {
      const key = `${result.roster.role}→${result.roster.fallbackRole}`;
      const f = fallbacks.get(key) ?? { profiles: new Set<string>(), examples: [] };
      f.profiles.add(profile.id);
      if (f.examples.length < keep) f.examples.push(profile.id);
      fallbacks.set(key, f);
    }
    if (result.notThisCrew) {
      const b = result.tasks.find((t) => t.notThisCrew)!;
      notThisCrew.push({ profileId: profile.id, title: profile.title, why: boundaryById(b.boundaries[0])?.why ?? b.reasons[0] });
    }

    for (const t of result.tasks) {
      const ex: Example = { taskId: t.taskId, profileId: profile.id, text: t.text };
      grades[t.grade] += 1;
      if (t.required) requiredGrades[t.grade] += 1;
      src.tasks += 1;
      src.grades[t.grade] += 1;
      if (t.gap) gaps[t.gap] += 1;
      if (t.role) {
        const r = roles.get(t.role) ?? { tasks: 0, covered: 0, profiles: new Set<string>() };
        r.tasks += 1;
        if (t.grade === 'covered') r.covered += 1;
        r.profiles.add(profile.id);
        roles.set(t.role, r);
      }
      if (t.gap === 'matcher') {
        if (t.evidence === 'lexical') matcher.unverified += 1;
        else if (t.uncoveredTerms.length > 0) matcher.notUnderstood += 1;
        else matcher.understoodUnclaimed += 1;
        // Connectives and generic verbs are matcher facts, not task concepts; the cluster step skips them too.
        for (const w of t.uncoveredTerms) if (!GENERIC.has(tokenize(w)[0] ?? w)) terms.add(w, ex);
        candidates.push({ task: t, profile });
      }
      for (const id of t.boundaries) {
        const b = boundaryById(id);
        if (!b) continue;
        if (b.gap === 'door') doors.add(id, ex);
        else if (b.gap === 'policy') policies.add(id, ex);
        else capabilities.add(id, ex);
      }
      if (t.gap === 'door' && t.evidence === 'power') {
        for (const c of t.missing.connections) doors.add(`closed:${c}`, ex);
      }
      if (t.gap === 'roster' && t.role) {
        const g = rosterGaps.get(t.role) ?? { tasks: 0, profiles: new Set<string>(), resting: 0 };
        g.tasks += 1;
        g.profiles.add(profile.id);
        if (t.reasons.some((r) => r.includes('is resting'))) g.resting += 1;
        rosterGaps.set(t.role, g);
      }
      if (t.role && t.evidence === 'power' && t.alternatives[0] && t.powers.length > 0) {
        const pair = [t.role, t.alternatives[0]].sort().join('+');
        const o = overlaps.get(pair) ?? { tasks: 0, powers: new Map<string, number>(), examples: [] };
        o.tasks += 1;
        t.powers.forEach((p) => o.powers.set(p, (o.powers.get(p) ?? 0) + 1));
        if (o.examples.length < keep) o.examples.push(ex);
        overlaps.set(pair, o);
      }
      if (opts.library && t.grade === 'uncovered' && t.gap === 'matcher') {
        for (const hit of searchEntries(opts.library, t.text, 2).hits) suggested.add(`${hit.kind}:${hit.name}`, ex);
      }
    }
  }

  // The headline: positions the crew could hold down, counted off core duties
  // whose grade rests on recorded evidence. An occupation with no core duties
  // is not a position that failed — there was nothing to grade — so it is out
  // of the denominator rather than counted as a miss.
  const hireableTitles: string[] = [];
  let onCoveredAlone = 0;
  let gradable = 0;
  for (const { profile, result } of results) {
    const core = result.tasks.filter((t) => t.required);
    if (core.length === 0) continue;
    gradable += 1;
    if (core.filter(vouchedFor).length / core.length >= HIREABLE_SHARE) hireableTitles.push(profile.title);
    if (core.filter((t) => t.grade === 'covered').length / core.length >= HIREABLE_SHARE) onCoveredAlone += 1;
  }
  hireableTitles.sort();

  return {
    totals: {
      profiles: results.length,
      tasks: results.reduce((n, r) => n + r.result.tasks.length, 0),
      required: results.reduce((n, r) => n + r.result.tasks.filter((t) => t.required).length, 0),
    },
    hireable: {
      share: HIREABLE_SHARE,
      positions: hireableTitles.length,
      of: gradable,
      onCoveredAlone,
      titles: hireableTitles,
    },
    grades,
    requiredGrades,
    gaps,
    matcher,
    bySource: [...sources.values()].sort((a, b) => a.source.localeCompare(b.source)),
    byOccupation: results.map(({ profile, result }) => ({
      profileId: profile.id,
      occupationId: profile.occupationId,
      title: profile.title,
      role: result.role,
      confidence: result.confidence,
      grades: result.counts,
      gaps: result.gaps,
      notThisCrew: result.notThisCrew,
      fallbackRole: result.roster.held ? null : result.roster.fallbackRole,
      line: coverageLine(result),
    })),
    rolesByWork: [...roles.entries()]
      .map(([role, r]) => ({ role, tasks: r.tasks, covered: r.covered, profiles: r.profiles.size }))
      .sort((a, b) => b.tasks - a.tasks || a.role.localeCompare(b.role)),
    fallbacks: [...fallbacks.entries()]
      .map(([key, f]) => {
        const [role, to] = key.split('→');
        return { role, to, profiles: f.profiles.size, examples: f.examples };
      })
      .sort((a, b) => b.profiles - a.profiles || a.role.localeCompare(b.role)),
    uncoveredTerms: terms.list(top),
    uncoveredSkills: skills.list(top),
    uncoveredTools: tools.list(top),
    doors: doors.list(top),
    policies: policies.list(top),
    capabilities: capabilities.list(top),
    rosterGaps: [...rosterGaps.entries()]
      .map(([role, g]) => ({ role, tasks: g.tasks, profiles: g.profiles.size, resting: g.resting }))
      .sort((a, b) => b.tasks - a.tasks || a.role.localeCompare(b.role)),
    suggested: suggested.list(top),
    clusters: clusters(candidates, results.map((r) => r.result), minProfiles, keep, top),
    overlaps: [...overlaps.entries()]
      .map(([pair, o]) => ({
        roles: pair.split('+') as [string, string],
        tasks: o.tasks,
        // The three powers the pair most often shares, so the line says what the overlap is made of.
        powers: [...o.powers.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 3).map(([k, n]) => `${k}×${n}`),
        examples: o.examples,
      }))
      .sort((a, b) => b.tasks - a.tasks || a.roles[0].localeCompare(b.roles[0]))
      .slice(0, top),
    notThisCrew,
  };
}

/**
 * Candidate role clusters: the duties that are neither covered, nor on a
 * boundary, nor held by nobody — the matcher-gap duties — grouped by the
 * content word they share, and reported only when the word recurs across
 * enough distinct profiles. A cluster is evidence for review, never a role:
 * `meetsBar` says whether it clears D-229's bar (repeated across profiles,
 * coherent, and not a word the catalog merely lacks), and `stillNot` names
 * the boundaries that fired in the same profiles, which a new role would
 * inherit.
 */
function clusters(
  candidates: { task: TaskCoverage; profile: WorkProfile }[],
  results: CoverageResult[],
  minProfiles: number,
  keep: number,
  top: number,
): RoleCluster[] {
  const byTerm = new Map<string, { tasks: Set<string>; profiles: Map<string, string>; with: Map<string, number>; examples: Example[] }>();
  for (const { task, profile } of candidates) {
    const toks = [...new Set(tokenize(task.text))].filter((w) => w.length > 3 && !GENERIC.has(w));
    for (const w of toks) {
      const e = byTerm.get(w) ?? { tasks: new Set<string>(), profiles: new Map<string, string>(), with: new Map<string, number>(), examples: [] };
      e.tasks.add(task.taskId);
      e.profiles.set(profile.id, profile.title);
      for (const o of toks) if (o !== w) e.with.set(o, (e.with.get(o) ?? 0) + 1);
      if (e.examples.length < keep) e.examples.push({ taskId: task.taskId, profileId: profile.id, text: task.text });
      byTerm.set(w, e);
    }
  }
  const boundariesOf = new Map<string, Set<string>>();
  for (const r of results) {
    const set = new Set<string>();
    r.tasks.forEach((t) => t.boundaries.forEach((b) => set.add(b)));
    boundariesOf.set(r.profileId, set);
  }
  return [...byTerm.entries()]
    .filter(([, e]) => e.profiles.size >= minProfiles)
    .map(([term, e]) => {
      const stillNot = new Set<string>();
      for (const pid of e.profiles.keys()) boundariesOf.get(pid)?.forEach((b) => stillNot.add(b));
      const withTerms = [...e.with.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 6).map((x) => x[0]);
      return {
        term,
        with: withTerms,
        tasks: e.tasks.size,
        profiles: e.profiles.size,
        occupations: [...e.profiles.values()].sort().slice(0, 8),
        examples: e.examples,
        stillNot: [...stillNot].sort(),
        // Coherent: the companions recur too (a cluster of one word is a word, not a job).
        meetsBar: e.profiles.size >= minProfiles && withTerms.length >= 2 && (e.with.get(withTerms[1]) ?? 0) >= Math.max(2, Math.ceil(e.tasks.size / 4)),
      };
    })
    .sort((a, b) => b.profiles - a.profiles || b.tasks - a.tasks || a.term.localeCompare(b.term))
    .slice(0, top);
}

/** Words that name no work on their own and would head every cluster. */
const GENERIC = new Set(
  'such using other various including provide provides providing perform performs performing ensure ensures maintain maintains maintaining develop develops developing prepare prepares preparing conduct conducts conducting assist assists assisting coordinate coordinates coordinating determine determines determining establish establishes establishing identify identifies identifying appropriate necessary required related specific general information activities activity procedures procedure process processes services service operations operation work works working accordance requirements needs order company organization department staff personnel customers clients people'
    .split(/\s+/)
    .map((w) => tokenize(w)[0] ?? w),
);
