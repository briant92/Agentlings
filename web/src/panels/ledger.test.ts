import { describe, expect, it } from 'vitest';
import type { CrewMember, Job } from '@agentlings/shared';
import {
  badgeOf,
  cutChip,
  entriesFor,
  groupsFor,
  matches,
  outcomeOf,
  producedBy,
  rootOf,
  tally,
} from './ledger';

function job(over: Partial<Job> = {}): Job {
  return {
    id: 'j1',
    title: 'Add tests',
    prompt: 'add tests',
    status: 'done',
    slot: -1,
    createdAt: 0,
    finishedAt: 1000,
    ...over,
  };
}

function member(over: Partial<CrewMember> = {}): CrewMember {
  return {
    id: 'a1',
    name: 'Pip',
    color: 0x6abe30,
    role: 'worker',
    jobsDone: 1,
    jobsFailed: 0,
    hiredAt: 0,
    resting: false,
    busy: false,
    lessons: 0,
    ...over,
  };
}

describe('outcomeOf', () => {
  it('groups by what the user still has to do about it', () => {
    expect(outcomeOf('done')).toBe('to review');
    expect(outcomeOf('partial')).toBe('to review');
    expect(outcomeOf('promoted')).toBe('kept');
    expect(outcomeOf('discarded')).toBe('closed');
    expect(outcomeOf('failed')).toBe('closed');
  });

  it('excludes work that has not finished', () => {
    expect(outcomeOf('queued')).toBeNull();
    expect(outcomeOf('running')).toBeNull();
  });
});

describe('carried-on legs (D-139 in the record)', () => {
  it('files a continued to-review job under closed, badged as carried on', () => {
    const [entry] = entriesFor([job({ status: 'partial', continuedBy: 'x' })], []);
    expect(entry.outcome).toBe('closed');
    expect(entry.carriedOn).toBe(true);
  });

  it('leaves an unclaimed delivery pending, and keeps it out of no tallies', () => {
    const waiting = entriesFor([job({ status: 'partial' })], []);
    expect(waiting[0].outcome).toBe('to review');
    expect(waiting[0].carriedOn).toBe(false);
    // The header's "still to review" follows the outcome, so a carried-on
    // leg stops inflating it.
    const both = entriesFor(
      [job({ status: 'partial' }), job({ id: 'j2', status: 'partial', continuedBy: 'x' })],
      [],
    );
    expect(tally(both).toReview).toBe(1);
  });

  it('never rebrands a promoted or discarded job', () => {
    const [kept] = entriesFor([job({ status: 'promoted', continuedBy: 'x' })], []);
    expect(kept.outcome).toBe('kept');
    expect(kept.carriedOn).toBe(false);
  });
});

describe('producedBy', () => {
  const stamp = (files: number, pdf: number, images: number, dirs: { name: string; files: number; bytes: number }[] = []) => ({
    files,
    pdf,
    images,
    dirs,
  });

  it('counts a diff', () => {
    const changes = { files: 3, added: 40, removed: 2, names: [] };
    expect(producedBy(job({ changes }))).toBe('3 files · +40 −2');
    expect(producedBy(job({ changes: { ...changes, files: 1 } }))).toBe('1 file · +40 −2');
  });

  it('reads what a run left off the stamp, PDFs and images named (UI.md, step 16)', () => {
    expect(producedBy(job({ delivered: stamp(75, 1, 14) }))).toBe('PDF, 14 images + 60 files');
    expect(producedBy(job({ delivered: stamp(2, 2, 0) }))).toBe('2 PDFs');
    expect(producedBy(job({ delivered: stamp(1, 0, 1) }))).toBe('1 image');
    expect(producedBy(job({ delivered: stamp(3, 0, 0) }))).toBe('3 files');
    expect(producedBy(job({ delivered: stamp(1, 0, 0) }))).toBe('1 file');
  });

  it('never calls a kept run with a PDF nothing on disk', () => {
    // 29ddccb7 on Home Chores: promoted, no summary, a PDF and 14 images —
    // the old reading of diffs and summaries said "nothing on disk".
    const kept = job({
      status: 'promoted',
      delivered: stamp(75, 1, 14, [{ name: 'input', files: 1, bytes: 152989 }]),
    });
    expect(producedBy(kept)).toBe('PDF, 14 images + 60 files');
  });

  it('says a stamped run left nothing, with the folder its evidence sits in', () => {
    const given = { name: 'input', files: 1, bytes: 152989 };
    const work = { name: 'work', files: 68, bytes: 51903668 };
    expect(producedBy(job({ delivered: stamp(0, 0, 0, [given, work]) }))).toBe('nothing delivered · work/ 68');
    // The given files are not something the run left.
    expect(producedBy(job({ delivered: stamp(0, 0, 0, [given]) }))).toBe('nothing delivered');
  });

  it('still calls a report a report when the stamp counts no files', () => {
    expect(producedBy(job({ summary: 'A favicon is…', delivered: stamp(0, 0, 0) }))).toBe('a written answer');
  });

  it('says the patch first when a repo job also left a file', () => {
    const changes = { files: 3, added: 40, removed: 2, names: [] };
    expect(producedBy(job({ changes, delivered: stamp(1, 1, 0) }))).toBe('3 files · +40 −2 · PDF');
  });

  it('keeps the old reading for a job from before the stamp', () => {
    expect(producedBy(job({ summary: 'A favicon is…' }))).toBe('a written answer');
    expect(producedBy(job({ changes: { files: 0, added: 0, removed: 0, names: [] } }))).toBe(
      'nothing on disk',
    );
  });

  it('gives the reason a failure left nothing', () => {
    expect(producedBy(job({ status: 'failed', error: 'cancelled' }))).toBe('cancelled');
  });
});

describe('entriesFor', () => {
  it('leaves live work to the terminal', () => {
    const jobs = [job({ id: 'a', status: 'queued' }), job({ id: 'b', status: 'running' })];
    expect(entriesFor(jobs, [])).toEqual([]);
  });

  it('puts the newest first', () => {
    const jobs = [
      job({ id: 'old', finishedAt: 100 }),
      job({ id: 'new', finishedAt: 900 }),
      job({ id: 'mid', finishedAt: 500 }),
    ];
    expect(entriesFor(jobs, []).map((e) => e.job.id)).toEqual(['new', 'mid', 'old']);
  });

  it('names who did it', () => {
    const [entry] = entriesFor([job({ assignedTo: 'a1' })], [member()]);
    expect(entry.who).toBe('Pip');
  });

  it('still credits someone who has left the crew', () => {
    const [entry] = entriesFor([job({ assignedTo: 'a9' })], [member()]);
    expect(entry.who).toBe('a9');
  });

  it('shows a dash when nobody ever picked it up', () => {
    expect(entriesFor([job()], [])[0].who).toBe('—');
  });

  it('reports a cost only when money was actually spent', () => {
    const free = entriesFor([job({ meter: { routed: true, costUsd: 0 } })], [])[0];
    const paid = entriesFor([job({ meter: { costUsd: 0.13 } })], [])[0];
    const unmeasured = entriesFor([job({ meter: { costUnknown: true } })], [])[0];
    expect(free.costUsd).toBeNull();
    expect(paid.costUsd).toBe(0.13);
    expect(unmeasured.costUsd).toBeNull();
  });
});

describe('badgeOf', () => {
  it('says "to review" for a delivery awaiting a verdict, whatever its raw status', () => {
    const [done] = entriesFor([job({ status: 'done' })], []);
    const [partial] = entriesFor([job({ status: 'partial' })], []);
    expect(badgeOf(done)).toBe('to review');
    expect(badgeOf(partial)).toBe('to review');
  });

  it('names the door that closed a continued leg, and the outcome otherwise', () => {
    const [carried] = entriesFor([job({ status: 'partial', continuedBy: 'x' })], []);
    const [kept] = entriesFor([job({ status: 'promoted' })], []);
    const [closed] = entriesFor([job({ status: 'discarded' })], []);
    expect(badgeOf(carried)).toBe('carried on');
    expect(badgeOf(kept)).toBe('kept');
    expect(badgeOf(closed)).toBe('closed');
  });
});

describe('cutChip (D-022, D-212)', () => {
  it('reads the cut off outOfTurns, never off turns over the cap', () => {
    expect(cutChip(job({ meter: { outOfTurns: true, turns: 41, turnsAllowed: 40 } }))).toBe('41/40');
    // A finished run that made more round trips than its leash allowed is
    // not a cut — two of them landed done on 2026-08-22.
    expect(cutChip(job({ meter: { turns: 51, turnsAllowed: 40 } }))).toBeNull();
    expect(cutChip(job())).toBeNull();
  });

  it('still says cut when the meter never reached a count', () => {
    expect(cutChip(job({ meter: { outOfTurns: true } }))).toBe('cut');
  });
});

describe('matches', () => {
  const [entry] = entriesFor([job({ title: 'Draw the plans…', prompt: 'Draw the plans of office 816' })], []);

  it('finds a run by its title or its sentence, whatever the case', () => {
    expect(matches(entry, 'PLANS')).toBe(true);
    expect(matches(entry, '816')).toBe(true);
    expect(matches(entry, 'kitchen')).toBe(false);
  });

  it('matches everything when the box is empty', () => {
    expect(matches(entry, '')).toBe(true);
    expect(matches(entry, '   ')).toBe(true);
  });
});

describe('groupsFor', () => {
  const crew = [
    member({ id: 'a1', name: 'Rue', color: 0x99e550 }),
    member({ id: 'a2', name: 'Ash', color: 0x639bff }),
  ];
  const jobs = [
    job({
      id: 'root',
      prompt: 'Draw the plans',
      status: 'partial',
      continuedBy: 'leg2',
      assignedTo: 'a1',
      finishedAt: 100,
      meter: { costUsd: 1 },
    }),
    // A reply leg: its prompt carries the reply, its root is the ask.
    job({
      id: 'leg2',
      prompt: 'Draw the plans\nThe user replied: carry on',
      status: 'promoted',
      continues: 'root',
      assignedTo: 'a1',
      finishedAt: 200,
      meter: { costUsd: 2 },
    }),
    // The same sentence asked afresh, in another case, by someone else.
    job({
      id: 'fresh',
      prompt: 'draw the plans',
      status: 'discarded',
      assignedTo: 'a2',
      finishedAt: 300,
      meter: { costUnknown: true },
    }),
    job({
      id: 'other',
      prompt: 'Write a note',
      status: 'promoted',
      assignedTo: 'a2',
      finishedAt: 250,
      meter: { costUsd: 0.5 },
    }),
  ];

  const all = entriesFor(jobs, crew);

  it('puts every leg of one sentence under one ask, continuations by their root', () => {
    const groups = groupsFor(all, crew, all);
    expect(groups.map((g) => g.legs.length)).toEqual([3, 1]);
    expect(groups[0].legs.map((e) => e.job.id)).toEqual(['fresh', 'leg2', 'root']);
    expect(groups[0].prompt).toBe('Draw the plans');
  });

  it('orders asks by their latest activity and badges each with its newest leg', () => {
    const groups = groupsFor(all, crew, all);
    expect(groups.map((g) => g.lastAt)).toEqual([300, 250]);
    expect(groups[0].latest.job.id).toBe('fresh');
    expect(badgeOf(groups[0].latest)).toBe('closed');
  });

  it('counts who worked it, what it cost and what could not be measured', () => {
    const [plans] = groupsFor(all, crew, all);
    expect(plans.who.map((w) => [w.name, w.legs, w.color])).toEqual([
      ['Rue', 2, 0x99e550],
      ['Ash', 1, 0x639bff],
    ]);
    expect(plans.costUsd).toBeCloseTo(3, 5);
    expect(plans.unmeasured).toBe(1);
  });

  it('keys a filtered leg on its root even when the filter dropped the root', () => {
    // The kept-only filter drops the partial root and keeps its promoted leg.
    const shown = all.filter((e) => e.job.id === 'leg2');
    const groups = groupsFor(shown, crew, all);
    expect(groups).toHaveLength(1);
    expect(groups[0].key).toBe('draw the plans');
    expect(groups[0].prompt).toBe('Draw the plans');
    expect(groups[0].legs.map((e) => e.job.id)).toEqual(['leg2']);
  });

  it('stops at the last known leg when the root has left the queue', () => {
    const byId = new Map([['b', job({ id: 'b', continues: 'a' })]]);
    expect(rootOf(job({ id: 'c', continues: 'b' }), byId).id).toBe('b');
  });

  it('survives a continues loop', () => {
    const a = job({ id: 'a', continues: 'b' });
    const b = job({ id: 'b', continues: 'a' });
    expect(rootOf(a, new Map([['a', a], ['b', b]])).id).toBe('b');
  });
});

describe('tally', () => {
  it('counts what still needs the user, and what it all cost', () => {
    const jobs = [
      job({ id: '1', status: 'done', meter: { costUsd: 0.1 } }),
      job({ id: '2', status: 'partial', meter: { costUsd: 0.2 } }),
      job({ id: '3', status: 'promoted', meter: { costUsd: 0.3 } }),
      job({ id: '4', status: 'running' }),
    ];
    const totals = tally(entriesFor(jobs, []));
    expect(totals.jobs).toBe(3);
    expect(totals.toReview).toBe(2);
    expect(totals.costUsd).toBeCloseTo(0.6, 5);
  });

  it('counts unmeasured runs rather than folding them in as zero', () => {
    const jobs = [
      job({ id: '1', status: 'done', meter: { costUsd: 0.1 } }),
      job({ id: '2', status: 'failed', meter: { costUnknown: true } }),
      job({ id: '3', status: 'failed', meter: { costUnknown: true } }),
    ];
    const totals = tally(entriesFor(jobs, []));
    expect(totals.costUsd).toBeCloseTo(0.1, 5);
    expect(totals.unmeasured).toBe(2);
  });
});
