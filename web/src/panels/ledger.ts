import { type CrewMember, type Job, type Outcome, outcomeOf } from '@agentlings/shared';

/**
 * The work record behind the crew door.
 *
 * The terminal is a feed, not an archive: its events are numbered per server
 * run and held in memory, so everything it ever said is gone after a restart.
 * The jobs themselves are persisted, which makes them the only durable account
 * of what the crew has actually done — this turns that into something you can
 * read.
 *
 * `Outcome` and `outcomeOf` used to live here. They moved to the shared model
 * when the inbox needed the same three groups on the server: two copies of
 * that map is how one job comes to be "kept" in one panel and "to review" in
 * the other.
 */

export { type Outcome, outcomeOf };

export interface Entry {
  job: Job;
  outcome: Outcome;
  /**
   * A to-review status whose decision was a continuation (D-139): filed
   * under closed — More turns or a reply already happened — and badged
   * "carried on" so the record says which door closed it.
   */
  carriedOn: boolean;
  /** Who did it, by name where the roster still knows them. */
  who: string;
  /** What it left behind, in one line. */
  produced: string;
  /** What it cost, or null when nothing was spent or nothing was measured. */
  costUsd: number | null;
}

/** A cost worth showing: a free tier spent nothing, so it says nothing. */
function costOf(job: Job): number | null {
  const cost = job.meter?.costUsd;
  return typeof cost === 'number' && cost > 0 ? cost : null;
}

/**
 * What the user actually gets from this job. A job with no diff is not empty —
 * most of them are answers or reports — so it falls back to the summary rather
 * than claiming nothing happened.
 */
export function producedBy(job: Job): string {
  const changes = job.changes;
  if (changes && changes.files > 0) {
    const files = changes.files === 1 ? '1 file' : `${changes.files} files`;
    return `${files} · +${changes.added} −${changes.removed}`;
  }
  if (job.status === 'failed') return job.error ?? 'nothing — it did not finish';
  return job.summary ? 'a written answer' : 'nothing on disk';
}

/**
 * Finished work, newest first. Anything still queued or running belongs to the
 * terminal, not to the record.
 */
export function entriesFor(jobs: readonly Job[], crew: readonly CrewMember[]): Entry[] {
  const names = new Map(crew.map((m) => [m.id, m.name]));
  const done: Entry[] = [];
  for (const job of jobs) {
    const outcome = outcomeOf(job.status);
    if (!outcome) continue;
    // A continued leg is decided (D-139): it files under closed rather than
    // sitting dressed as pending forever, and the badge names the door.
    const carriedOn = outcome === 'to review' && Boolean(job.continuedBy);
    done.push({
      job,
      outcome: carriedOn ? 'closed' : outcome,
      carriedOn,
      // Someone who has since been let go still did the work; their id is a
      // poor label but a truer one than pretending nobody did it.
      who: (job.assignedTo && names.get(job.assignedTo)) ?? job.assignedTo ?? '—',
      produced: producedBy(job),
      costUsd: costOf(job),
    });
  }
  return done.sort((a, b) => (b.job.finishedAt ?? 0) - (a.job.finishedAt ?? 0));
}

/**
 * The word on a row's badge: the door that closed it, or what the user still
 * has to do about it. A delivery awaiting a verdict reads "to review" — the
 * filter's own word — rather than its raw status, which said "done" about a
 * job nobody had looked at yet (UI.md, step 2).
 */
export function badgeOf(entry: Entry): string {
  return entry.carriedOn ? 'carried on' : entry.outcome;
}

/**
 * "41/40" when the turn budget cut the run, else nothing.
 *
 * Read off `outOfTurns` and never inferred from turns over the cap: a run can
 * report more turns than it was allowed and still have ended on its own —
 * 44/40 and 51/40 both finished `done` on 2026-08-22 (D-022, D-212). A cut
 * whose meter never reached a count still says so.
 */
export function cutChip(job: Job): string | null {
  const meter = job.meter;
  if (!meter?.outOfTurns) return null;
  return typeof meter.turns === 'number' && typeof meter.turnsAllowed === 'number'
    ? `${meter.turns}/${meter.turnsAllowed}`
    : 'cut';
}

/** Whether a row answers the find box: the sentence, as typed or as titled. */
export function matches(entry: Entry, text: string): boolean {
  const needle = text.trim().toLowerCase();
  if (!needle) return true;
  return (
    entry.job.title.toLowerCase().includes(needle) || entry.job.prompt.toLowerCase().includes(needle)
  );
}

/**
 * The job a leg descends from, following `continues` back to the first run.
 * A parent no longer in the queue ends the walk at the last leg still known.
 */
export function rootOf(job: Job, byId: ReadonlyMap<string, Job>): Job {
  let current = job;
  const seen = new Set<string>([job.id]);
  while (current.continues) {
    const parent = byId.get(current.continues);
    if (!parent || seen.has(parent.id)) break;
    seen.add(parent.id);
    current = parent;
  }
  return current;
}

/** One ask and every leg run for it (UI.md, step 2). */
export interface Group {
  /** The sentence, normalised — the same key the recipe shelf uses. */
  key: string;
  /** The first run's sentence, as typed. */
  prompt: string;
  /** Every finished leg, newest first. */
  legs: Entry[];
  /** Who worked it and how many legs each, most first. */
  who: { id: string; name: string; color: number | null; legs: number }[];
  costUsd: number;
  unmeasured: number;
  lastAt: number;
  /** The newest leg — its outcome is the group's badge. */
  latest: Entry;
}

/**
 * The record grouped by ask: every leg of the same sentence under one row,
 * continuations included, newest activity first.
 *
 * Keyed on the root run's sentence rather than on each leg's own prompt,
 * because a reply leg's prompt carries the reply and a More-turns leg's
 * carries nothing new — both are the same ask, and the record should say
 * fourteen runs of one sentence rather than three asks that happen to look
 * alike. The root is found by walking `continues`, which is the one link
 * the queue keeps between a leg and what it continues.
 */
export function groupsFor(entries: readonly Entry[], crew: readonly CrewMember[]): Group[] {
  const byId = new Map(entries.map((e) => [e.job.id, e.job]));
  const colors = new Map(crew.map((m) => [m.id, m.color]));
  const groups = new Map<string, Group>();
  for (const entry of entries) {
    const root = rootOf(entry.job, byId);
    const key = root.prompt.trim().toLowerCase();
    let group = groups.get(key);
    if (!group) {
      group = {
        key,
        prompt: root.prompt,
        legs: [],
        who: [],
        costUsd: 0,
        unmeasured: 0,
        lastAt: 0,
        latest: entry,
      };
      groups.set(key, group);
    }
    group.legs.push(entry);
    // Entries arrive newest first, so the last root seen is the oldest: the
    // row shows the sentence as it was first asked, not as it was last typed.
    group.prompt = root.prompt;
    group.costUsd += entry.costUsd ?? 0;
    if (entry.job.meter?.costUnknown) group.unmeasured += 1;
    const at = entry.job.finishedAt ?? 0;
    if (at > group.lastAt) {
      group.lastAt = at;
      group.latest = entry;
    }
    const id = entry.job.assignedTo ?? '';
    const worker = group.who.find((w) => w.id === id);
    if (worker) worker.legs += 1;
    else group.who.push({ id, name: entry.who, color: colors.get(id) ?? null, legs: 1 });
  }
  for (const group of groups.values()) {
    group.legs.sort((a, b) => (b.job.finishedAt ?? 0) - (a.job.finishedAt ?? 0));
    group.who.sort((a, b) => b.legs - a.legs);
  }
  return [...groups.values()].sort((a, b) => b.lastAt - a.lastAt);
}

/**
 * Totals for the header.
 *
 * This is a subtotal of the rows on screen, not the level's lifetime spend —
 * it moves with the filters, and the ledger is the authority on what the app
 * has really paid out. The two legitimately differ: the ledger keeps a row for
 * every run ever made, while this can only see jobs still in the queue file.
 *
 * `unmeasured` is carried rather than quietly folded in as zero. A killed
 * session never reaches the message the SDK reports cost on, so its spend is
 * real and unknowable — and silently counting it as nothing is how a total
 * comes to understate itself.
 */
export function tally(entries: readonly Entry[]): {
  jobs: number;
  toReview: number;
  costUsd: number;
  unmeasured: number;
} {
  return {
    jobs: entries.length,
    toReview: entries.filter((e) => e.outcome === 'to review').length,
    costUsd: entries.reduce((sum, e) => sum + (e.costUsd ?? 0), 0),
    unmeasured: entries.filter((e) => e.job.meter?.costUnknown).length,
  };
}
