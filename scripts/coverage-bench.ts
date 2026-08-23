// How much of a real-world job the crew covers, measured against a source
// of occupations rather than against sentences someone thought to write.
//
//   npm run bench:coverage                          the checked-in fixtures
//   npm run bench:coverage -- --onet <dir>          a downloaded O*NET text release
//   npm run bench:coverage -- --esco <dir>          a downloaded ESCO CSV release
//   npm run bench:coverage -- --profiles <file>     normalised WorkProfile JSON
//       --only 15-1252.00,43-3031.00               narrow to some occupation ids
//       --level <id>                               grade against that level's crew
//                                                  (default: every installed role held)
//       --open web,render,search                   which doors count as open
//                                                  (default: what is live in Settings)
//       --library                                  also search the synced library
//       --json <file>                              write the whole report
//       --top 40                                   rows per list (default 25)
//
// Reads no network and writes nothing unless --json names a file. The roles,
// skills, catalog of doors and library index are the real installed ones;
// the source release is whatever directory is named, downloaded beforehand
// (O*NET: onetcenter.org/database.html, the "text" zip; ESCO: the CSV
// bundle from esco.ec.europa.eu). The test suite runs the same code on the
// slices under fixtures/workprofiles.
//
// It calls the real grader and the real matcher rather than restating them
// (D-024), and it is deterministic: the same inputs print the same report.
// Every aggregate carries task ids, so a line here can be traced to the
// record that produced it. It never substitutes the worker: a role nobody
// holds is reported as a roster gap with the fallback the queue would make
// beside it, and nothing in the execution path is touched.
import { existsSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { benchmark, type Counted, type CoverageReport } from '../server/src/coveragebench';
import type { CoverageContext, Door } from '../server/src/coverage';
import { readConnections } from '../server/src/connections';
import { readRoster, levelDir } from '../server/src/levels';
import { loadIndex } from '../server/src/library';
import { MatchIndex } from '../server/src/match';
import { RoleRegistry, listSkills } from '../server/src/roles';
import { enabledNames, readSettings } from '../server/src/settings';
import { readEsco, readOnet, readProfiles } from '../server/src/workprofile';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const SANDBOX_ROOT = path.join(ROOT, '.agentlings');

const args = process.argv.slice(2);
const flag = (name: string): string | undefined => {
  const i = args.indexOf(`--${name}`);
  return i >= 0 ? args[i + 1] : undefined;
};
const has = (name: string) => args.includes(`--${name}`);

const registry = new RoleRegistry(path.join(ROOT, 'roles'));
registry.load();
const roles = registry.list();
const index = new MatchIndex(registry.loaded(), listSkills(path.join(ROOT, 'skills')));

// Doors: the catalog's connections, open when Settings and .env say so — or as named.
const connections = readConnections(path.join(ROOT, 'catalog', 'connections.json'));
// The same secrets store the server boots from (D-078), read the same way.
if (existsSync(path.join(ROOT, '.env'))) process.loadEnvFile(path.join(ROOT, '.env'));
const env = process.env;
const live = new Set(flag('open')?.split(',') ?? enabledNames(connections, readSettings(SANDBOX_ROOT), env));
const doors: Door[] = connections.map((c) => ({ name: c.name, open: live.has(c.name) }));

// Crew: a level's roster, or every installed role held.
const level = flag('level');
let crew: CoverageContext['crew'];
if (level) {
  const roster = readRoster(levelDir(SANDBOX_ROOT, level));
  crew = {
    awake: roster.filter((s) => !s.resting).map((s) => ({ role: s.role, state: 'idle' })),
    resting: roster.filter((s) => s.resting).map((s) => ({ role: s.role })),
  };
}

// Profiles.
const only = flag('only')?.split(',');
const profiles = flag('onet')
  ? readOnet(flag('onet')!, only)
  : flag('esco')
    ? readEsco(flag('esco')!, undefined, only)
    : flag('profiles')
      ? readProfiles(flag('profiles')!)
      : [...readProfiles(path.join(ROOT, 'fixtures/workprofiles/profiles.json')), ...readOnet(path.join(ROOT, 'fixtures/workprofiles/onet'))];

const library = has('library') ? loadIndex(SANDBOX_ROOT)?.entries : undefined;
const top = Number(flag('top') ?? 25);
const ctx: CoverageContext = { index, roles, doors, crew };
const started = Date.now();
const report = benchmark(ctx, profiles, { library, top });
const elapsed = Date.now() - started;

print(report);
if (flag('json')) {
  writeFileSync(flag('json')!, JSON.stringify(report, null, 2));
  console.log(`\nwritten: ${flag('json')}`);
}
console.log(`\n${profiles.length} profiles, ${report.totals.tasks} duties, ${elapsed} ms`);

function print(r: CoverageReport): void {
  const pct = (n: number, of: number) => (of ? `${Math.round((100 * n) / of)}%` : '–');
  const T = r.totals.tasks;
  console.log(`COVERAGE — ${r.totals.profiles} profiles, ${T} duties (${r.totals.required} core)`);
  console.log(`  sources: ${r.bySource.map((s) => `${s.source}${s.version ? ` ${s.version}` : ''} ×${s.profiles}`).join(', ')}`);
  console.log(`  crew: ${crew ? `level ${level} (${crew.awake.length} awake, ${crew.resting?.length ?? 0} resting)` : 'every installed role held'}; doors open: ${doors.filter((d) => d.open).map((d) => d.name).join(', ') || 'none'}`);
  console.log('');
  console.log(`  covered    ${pad(r.grades.covered)}  ${pct(r.grades.covered, T)}   (core ${pct(r.requiredGrades.covered, r.totals.required)})`);
  console.log(`  partial    ${pad(r.grades.partial)}  ${pct(r.grades.partial, T)}`);
  console.log(`  uncovered  ${pad(r.grades.uncovered)}  ${pct(r.grades.uncovered, T)}`);
  console.log('');
  console.log('  why less than covered');
  console.log(`    matcher     ${pad(r.gaps.matcher)}  not understood ${r.matcher.notUnderstood} · unverified word match ${r.matcher.unverified} · understood, unclaimed ${r.matcher.understoodUnclaimed}`);
  console.log(`    capability  ${pad(r.gaps.capability)}`);
  console.log(`    door        ${pad(r.gaps.door)}`);
  console.log(`    policy      ${pad(r.gaps.policy)}`);
  console.log(`    roster      ${pad(r.gaps.roster)}`);

  section('roles receiving the most work', r.rolesByWork.map((x) => `${x.role.padEnd(11)} ${pad(x.tasks)} duties, ${pad(x.covered)} covered, in ${x.profiles} profiles`));
  section('falling back to another role (D-200)', r.fallbacks.map((f) => `${f.role} → ${f.to}: ${f.profiles} profiles (${f.examples.join(', ')})`));
  section('roster gaps (covered by a role nobody here holds)', r.rosterGaps.map((g) => `${g.role}: ${g.tasks} duties in ${g.profiles} profiles${g.resting ? `, ${g.resting} resting` : ''}`));
  section('door and policy limitations', [...r.doors, ...r.policies].map(counted));
  section('capability boundaries', r.capabilities.map(counted));
  section('most frequent words nothing installed understands', r.uncoveredTerms.map(counted));
  section('source skills no power names', r.uncoveredSkills.slice(0, 12).map((c) => `${c.key}: ${c.profiles} profiles`));
  section('source tools no power names', r.uncoveredTools.slice(0, 12).map((c) => `${c.key}: ${c.profiles} profiles`));
  section('library templates the uncovered duties reach', r.suggested.map(counted));
  section(
    'candidate role clusters (evidence for review — nothing is created)',
    r.clusters.map((c) => `${c.meetsBar ? '●' : '○'} ${c.term}: ${c.tasks} duties in ${c.profiles} profiles, with ${c.with.slice(0, 4).join('/')}; still not: ${c.stillNot.join(', ') || '—'}\n        e.g. ${c.examples[0]?.text.slice(0, 100)} (${c.examples[0]?.taskId})`),
  );
  section('overlapping roles (same duties, same power evidence)', r.overlaps.slice(0, 8).map((o) => `${o.roles.join(' + ')}: ${o.tasks} duties on ${o.powers.join(', ')}`));
  section('not this crew', r.notThisCrew.map((n) => `${n.title} (${n.profileId}): ${n.why}`));
  if (r.byOccupation.length <= 40) {
    section('by occupation', r.byOccupation.map((o) => `${o.title.padEnd(40).slice(0, 40)} ${o.role ?? '—'} ${pad(o.grades.covered)}/${pad(o.grades.partial)}/${pad(o.grades.uncovered)}  ${o.line}`));
  }
}

function counted(c: Counted): string {
  return `${c.key}: ${c.count} duties in ${c.profiles} profiles — e.g. "${c.examples[0]?.text.slice(0, 80)}" (${c.examples[0]?.taskId})`;
}

function section(title: string, lines: string[]): void {
  if (lines.length === 0) return;
  console.log(`\n  ${title}`);
  for (const l of lines) console.log(`    ${l}`);
}

function pad(n: number): string {
  return String(n).padStart(6);
}

