import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';
import type { WorkProfile } from '@agentlings/shared';
import { BOUNDARIES, POWERS, coverage, coverageLine, gradeTask, rosterState, type CoverageContext } from './coverage';
import { MIN_CONFIDENCE, MatchIndex } from './match';
import { RoleRegistry, listSkills } from './roles';
import { planWork, runnerRole } from './work';
import { readProfiles } from './workprofile';

/** The real installed catalog, so the grades track what a user actually gets (D-177, D-229). */
const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const registry = new RoleRegistry(path.join(ROOT, 'roles'));
registry.load();
const roles = registry.list();
const index = new MatchIndex(registry.loaded(), listSkills(path.join(ROOT, 'skills')));
const fixtures = readProfiles(path.join(ROOT, 'fixtures/workprofiles/profiles.json'));
const profile = (id: string): WorkProfile => fixtures.find((p) => p.id === id)!;

const SHIPS_ON = [{ name: 'web', open: true }, { name: 'render', open: true }];
const CLOSED = ['github', 'search', 'bls', 'calendar', 'mail', 'browser', 'telegram', 'google', 'whatsapp-business', 'slack'].map(
  (name) => ({ name, open: false }),
);
/** Every installed role hired, only the default doors open: the catalog measured on its own. */
const fullHouse: CoverageContext = { index, roles, doors: [...SHIPS_ON, ...CLOSED] };

describe('the ledgers', () => {
  it('name only installed roles and catalog doors, and every entry says why', () => {
    const installed = new Set(roles.map((r) => r.name));
    const doors = new Set([...SHIPS_ON, ...CLOSED].map((d) => d.name));
    for (const p of POWERS) {
      expect(p.why.length, p.id).toBeGreaterThan(20);
      for (const r of p.roles) if (r !== '*') expect(installed.has(r), `${p.id} names ${r}`).toBe(true);
      for (const d of p.needs ?? []) expect(doors.has(d), `${p.id} needs ${d}`).toBe(true);
    }
    for (const b of BOUNDARIES) {
      expect(b.why.length, b.id).toBeGreaterThan(20);
      if (b.door) expect(doors.has(b.door), `${b.id} door ${b.door}`).toBe(true);
    }
  });
});

describe('strong coverage', () => {
  const r = coverage(fullHouse, profile('fixture:technical-writer'));

  it('is covered by the scribe on power evidence, every grade with a reason', () => {
    expect(r.role).toBe('scribe');
    expect(r.counts).toEqual({ covered: 3, partial: 0, uncovered: 0 });
    for (const t of r.tasks) {
      expect(t.evidence).toBe('power');
      expect(t.reasons.length).toBeGreaterThan(0);
      expect(t.notThisCrew).toBe(false);
    }
    expect(r.notThisCrew).toBe(false);
    expect(coverageLine(r)).toBe('This is covered by scribe.');
  });

  it('carries the source identity through', () => {
    expect(r.profileId).toBe('fixture:technical-writer');
    expect(r.source).toBe('fixture');
    expect(r.sourceVersion).toBe('2026-08-23');
    expect(r.occupationId).toBe('fixture-tw');
    expect(r.tasks.map((t) => t.sourceId)).toEqual(['tw-1', 'tw-2', 'tw-3']);
  });
});

describe('partial coverage', () => {
  it('names the closed door as the missing piece, and it stops being a gap once the door is open', () => {
    const r = coverage(fullHouse, profile('fixture:research-analyst'));
    expect(r.role).toBe('researcher');
    expect(r.counts.covered).toBe(2);
    const search = r.tasks.find((t) => t.sourceId === 'ra-2')!;
    expect(search.grade).toBe('partial');
    expect(search.gap).toBe('door');
    expect(search.doorExists).toBe(true);
    expect(search.missing.connections).toEqual(['search']);
    expect(search.notThisCrew).toBe(false);
    expect(coverageLine(r)).toBe('This is partly covered by researcher; the missing piece is the search door.');

    const open = coverage({ ...fullHouse, doors: fullHouse.doors.map((d) => ({ ...d, open: true })) }, profile('fixture:research-analyst'));
    expect(open.counts).toEqual({ covered: 3, partial: 0, uncovered: 0 });
    expect(coverageLine(open)).toBe('This is covered by researcher.');
  });
});

describe('a door or policy boundary', () => {
  const r = coverage(fullHouse, profile('fixture:accounts-payable'));

  it('is graded off the boundary, never off the words, and earns the visible not-this-crew', () => {
    expect(r.counts.covered).toBe(0);
    const pay = r.tasks.find((t) => t.sourceId === 'ap-1')!;
    expect(pay.grade).toBe('uncovered');
    expect(pay.gap).toBe('policy');
    expect(pay.evidence).toBe('boundary');
    expect(pay.boundaries).toContain('money');
    expect(pay.notThisCrew).toBe(true);
    expect(r.notThisCrew).toBe(true);
    expect(coverageLine(r)).toMatch(/^This is not this crew: Never moves money/);
  });

  it('separates the policy from a door the app has no door for', () => {
    const t = gradeTask(fullHouse, { id: 'x', text: 'Post the journals into the accounting system.', required: true });
    expect(t.gap).toBe('door');
    expect(t.doorExists).toBe(false);
    expect(t.missing.connections).toEqual(['(no door exists)']);
    expect(t.notThisCrew).toBe(true);
  });

  it('keeps the approval-time half partial rather than red', () => {
    const t = gradeTask(fullHouse, { id: 'x', text: 'Draft a reply and email the customer the invoice.', required: true });
    expect(t.grade).toBe('partial');
    expect(t.gap).toBe('door');
    expect(t.boundaries).toContain('send');
    expect(t.notThisCrew).toBe(false);
  });
});

describe('no suitable current role', () => {
  it('is uncovered on capability evidence with the boundary named', () => {
    const r = coverage(fullHouse, profile('fixture:forklift-operator'));
    expect(r.role).toBeNull();
    expect(r.counts).toEqual({ covered: 0, partial: 0, uncovered: 2 });
    expect(r.gaps.capability).toBe(2);
    expect(r.tasks.every((t) => t.boundaries.includes('physical'))).toBe(true);
    expect(r.notThisCrew).toBe(true);
    expect(coverageLine(r)).toMatch(/^This is not this crew: No body/);
  });
});

describe('a matcher vocabulary gap', () => {
  const r = coverage(fullHouse, profile('fixture:sommelier'));

  it('stays a matcher gap, with the words nobody knows listed', () => {
    const [t] = r.tasks;
    expect(t.grade).toBe('uncovered');
    expect(t.gap).toBe('matcher');
    expect(t.evidence).toBe('none');
    expect(t.confidence).toBeLessThan(MIN_CONFIDENCE);
    expect(t.uncoveredTerms).toEqual(expect.arrayContaining(['tannin', 'appellation']));
    expect(t.boundaries).toEqual([]);
  });

  it('is never reported as not this crew, and never as a capability gap', () => {
    expect(r.tasks[0].notThisCrew).toBe(false);
    expect(r.notThisCrew).toBe(false);
    expect(r.gaps.capability).toBe(0);
    expect(coverageLine(r)).toBe('The matcher does not understand these terms yet.');
  });

  it('keeps a confident word match that no power vouches for unverified, not covered', () => {
    const t = gradeTask(fullHouse, { id: 'x', text: 'Receive, record, and bank cash, checks, and vouchers.', required: true });
    expect(t.evidence).toBe('lexical');
    expect(t.grade).toBe('partial');
    expect(t.gap).toBe('matcher');
    expect(t.role).not.toBeNull();
    expect(t.reasons[0]).toMatch(/no recorded power vouches/);
  });
});

/**
 * The Wave 1 trades (D-235). Each power is pinned by a duty it vouches for
 * *and* by one it must not: these four were added to reach duties nothing
 * understood, and the way that goes wrong is claiming the doing of the work
 * rather than the record of it. The boundary half of each pair is the test
 * that matters — a hard boundary outranks any power (gradeTask step 1), and
 * these assert that rule still holds with the new vocabulary in the ledger.
 */
describe('the Wave 1 powers', () => {
  const graded = (text: string) => gradeTask(fullHouse, { id: 'w1', text, required: true });

  it('vouches for the operations record and never for the operating', () => {
    const record = graded('Write standard operating procedures and acceptance criteria for the assembly process.');
    expect(record.grade).toBe('covered');
    expect(record.evidence).toBe('power');
    expect(record.powers).toContain('procedures');
    expect(record.role).toBe('operations');

    // The same subject, done with hands: the physical boundary decides it.
    const doing = graded('Set up and adjust machines according to the operating procedure.');
    expect(doing.grade).toBe('uncovered');
    expect(doing.gap).toBe('capability');
    expect(doing.boundaries).toContain('physical');
    expect(doing.notThisCrew).toBe(true);
  });

  it('vouches for the supply comparison and never for the buying', () => {
    const compare = graded('Compare carrier rates and lead times to recommend a distribution network.');
    expect(compare.grade).toBe('covered');
    expect(compare.powers).toContain('supply');
    expect(compare.role).toBe('logistics');

    // Ordering is money, and money is a hard policy boundary (D-219).
    const buy = graded('Order supplies and materials to maintain stock levels.');
    expect(buy.grade).toBe('uncovered');
    expect(buy.gap).toBe('policy');
    expect(buy.boundaries).toContain('money');
  });

  it('vouches for the plan on paper and never for directing the people in it', () => {
    const plan = graded('Prepare a work breakdown structure and project schedule with milestones.');
    expect(plan.grade).toBe('covered');
    expect(plan.powers).toContain('planning');
    expect(plan.role).toBe('planner');

    const direct = graded('Direct and coordinate the activities of project staff.');
    expect(direct.grade).toBe('uncovered');
    expect(direct.gap).toBe('policy');
    expect(direct.boundaries).toContain('people');
  });

  it('vouches for the audit of a copy and never for reaching a running system', () => {
    const audit = graded('Audit dependencies for known vulnerabilities and exposed credentials.');
    expect(audit.grade).toBe('covered');
    expect(audit.powers).toContain('security-audit');
    expect(audit.role).toBe('security');

    // Scanning is done to something running, and nothing here reaches one:
    // the duty may reach the trade lexically, but no power may vouch for it.
    const scan = graded('Scan networks, using vulnerability assessment tools to identify vulnerabilities.');
    expect(scan.grade).not.toBe('covered');
  });
});

describe('roster', () => {
  const tw = profile('fixture:technical-writer');

  it('reports a role in the catalog that nobody in this level holds, with the fallback the queue would make', () => {
    const crew = { awake: [{ role: 'worker', state: 'idle' }] };
    const r = coverage({ ...fullHouse, crew }, tw);
    expect(r.role).toBe('scribe');
    expect(r.roster).toEqual({ role: 'scribe', held: false, resting: false, fallbackRole: 'worker' });
    expect(r.counts).toEqual({ covered: 0, partial: 3, uncovered: 0 });
    expect(r.gaps.roster).toBe(3);
    expect(r.tasks[0].reasons.at(-1)).toMatch(/nobody in this level is a scribe — your worker would take it/);
    expect(coverageLine(r)).toBe('A suitable role exists in the library, but nobody in this level holds it: hire a scribe.');
  });

  it('says resting when the only holder is resting', () => {
    const crew = { awake: [{ role: 'worker', state: 'idle' }], resting: [{ role: 'scribe' }] };
    const r = coverage({ ...fullHouse, crew }, tw);
    expect(r.roster.resting).toBe(true);
    expect(coverageLine(r)).toBe('A suitable role exists in the library, but your scribe is resting — wake them.');
  });

  it('is no gap at all once a scribe is awake', () => {
    const crew = { awake: [{ role: 'worker', state: 'idle' }, { role: 'scribe', state: 'working' }] };
    const r = coverage({ ...fullHouse, crew }, tw);
    expect(r.roster.held).toBe(true);
    expect(r.gaps.roster).toBe(0);
    expect(rosterState({ ...fullHouse, crew }, 'scribe').fallbackRole).toBeNull();
  });

  it('leaves the work-routing fallback exactly as it was: the worker still takes the job, the plan still says so', () => {
    const crew = [{ id: 'a', name: 'Pip', color: 0, state: 'idle' as const, x: 0, targetX: 0, role: 'worker', jobsDone: 0, jobsFailed: 0 }];
    const plan = planWork(index, roles, crew, undefined, tw.tasks[0].text);
    expect(plan.role).toBe('scribe');
    expect(plan.noOneHasRole).toBe(true);
    expect(plan.agentling?.role).toBe('worker');
    expect(runnerRole(plan)).toBe('worker');
    // The benchmark records the same substitution apart from the grade, and does not make it.
    const r = coverage({ ...fullHouse, crew: { awake: crew } }, tw);
    expect(r.role).toBe('scribe');
    expect(r.roster.fallbackRole).toBe('worker');
  });
});
