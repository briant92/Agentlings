import { awaitingVerdict, hasVerdict, type Job, type ResolvedBy } from '@agentlings/shared';
import type { LedgerEntry } from './ledger';
import type { Refusal } from './refusals';

/**
 * The score (D-249, D-260): real work under supervision, counted from what is
 * already on disk — the ledger, each level's job records and the refusals
 * file — and nothing else. One pure function, two callers: `ledger:report`
 * prints it and the Monday send (#13) will send it, because a second copy
 * of "what counts" is how the same week comes to be scored twice (D-030).
 *
 * The rules, as decided:
 * - a job counts in the week its verdict was written, not the week it ran,
 *   so the window is read against `resolvedAt` — or `finishedAt` for a job
 *   from before the stamp, which reads as resolved by a person then;
 * - `promoted` is a person's verdict; `auto-sent` is the app's, with
 *   something actually sent. The app's other promotes — a check filed, a
 *   hand folded into its gather — are neither: the checked job or the
 *   gather carries the verdict, and a hand counted beside its gather would
 *   score a party by its size;
 * - a `done` nobody reviewed is *awaiting review*, never real work: the
 *   delivered pile as it stands, everything unreviewed up to the window's
 *   end, and a job carried on (more turns, a reply) is decided, not waiting;
 * - `failed` is a run that failed, counted when it ended — including one
 *   discarded afterwards, which is a failure cleared away and not a delivery
 *   turned down (the resolve route says the same), told by the record's own
 *   fields: a discard with an error and nothing delivered;
 * - `spent` is the window's own ledger rows — what the level cost that week,
 *   whether or not the jobs it paid for were resolved yet;
 * - a real level is any level not named for a proof or a check; the
 *   excluded ones are listed by id so the reader sees what was left out.
 */
export interface Window {
  /** Inclusive, ms. */
  start: number;
  /** Exclusive, ms. */
  end: number;
}

export interface LevelJobs {
  id: string;
  name?: string;
  jobs: Job[];
}

export interface LevelWork {
  levelId: string;
  name: string;
  /** A person's promote. */
  promoted: number;
  /** The app's promote with something sent — a standing approval. */
  autoSent: number;
  /** A delivery turned down. */
  discarded: number;
  /** A run that failed, whether or not it was discarded since. */
  failed: number;
  /** Delivered, unreviewed, as of the window's end. */
  awaiting: number;
  /** Ledger rows dated inside the window. */
  spentUsd: number;
  /** Refusals inside the window, by key. */
  refusals: Record<string, number>;
}

export interface RealWorkBlock {
  window: Window;
  levels: LevelWork[];
  /** Level ids left out by name. */
  excluded: string[];
}

const NAMED_FOR = /\b(?:proof|check)\b/i;

/** A level named for a proof or a check — by its id or its display name. */
export function isProofLevel(level: { id: string; name?: string }): boolean {
  return NAMED_FOR.test(level.id) || (level.name !== undefined && NAMED_FOR.test(level.name));
}

/**
 * When and by whom a job's verdict was written; null while it has none. A job
 * resolved before the stamp existed reads as a person's verdict at its finish.
 */
export function resolution(
  job: Pick<Job, 'status' | 'finishedAt' | 'resolvedAt' | 'resolvedBy'>,
): { at: number; by: ResolvedBy } | null {
  if (!hasVerdict(job.status)) return null;
  const at = job.resolvedAt ?? job.finishedAt;
  if (at === undefined) return null;
  return { at, by: job.resolvedBy ?? 'you' };
}

/**
 * Whether the run failed — `failed` now, or discarded since from `failed`.
 * The queue marks a run `failed` only when it delivered nothing (a cancel
 * aside), and every failure carries its error, so a discard with an error
 * and nothing delivered is one; a discarded partial shows its files or its
 * patch. A discard whose delivery summary is gone with its sandbox cannot be
 * told and stays a discard.
 */
export function failedRun(job: Pick<Job, 'status' | 'error' | 'delivered' | 'changes'>): boolean {
  if (job.status === 'failed') return true;
  if (job.status !== 'discarded' || !job.error || !job.delivered || job.changes) return false;
  const d = job.delivered;
  return d.files === 0 && d.pdf === 0 && d.images === 0 && d.dirs.length === 0;
}

/**
 * The Monday-to-Monday week, local time, that ended most recently before
 * `now`. Rebuilt from its date parts at the end because a clock change at
 * midnight (Chile's) makes `setHours(0)` on the changeover Sunday land on
 * 01:00, and date arithmetic keeps the wall-clock hour.
 */
export function lastFullWeek(now: number): Window {
  const d = new Date(now);
  // getDay: Sunday 0 … Saturday 6; back to the Monday this week started.
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const end = new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
  d.setDate(d.getDate() - 7);
  return { start: new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime(), end };
}

const inWindow = (w: Window, at: number) => at >= w.start && at < w.end;

/**
 * The Monday send's own sentence (D-261) — one fixed prompt for every
 * report row, because the standing approval keys on it (D-072, D-082). It
 * lives here rather than in `report.ts` because the score must know it: the
 * report lands as a job on a real level and is promoted like any send, and
 * counting it would have the instrument reading its own needle — +1
 * promoted every Monday, +1 awaiting until reviewed, forever.
 */
export const REALWORK_PROMPT = "Send me last week's real work — the score, per level.";

/** The one number the score is: promoted or auto-sent, over the real levels. */
export function realCount(block: RealWorkBlock): number {
  return block.levels.reduce((s, l) => s + l.promoted + l.autoSent, 0);
}

export function realWork(
  window: Window,
  levels: LevelJobs[],
  ledger: LedgerEntry[],
  refusals: Refusal[],
): RealWorkBlock {
  const names = new Map<string, string | undefined>();
  for (const l of levels) names.set(l.id, l.name);
  for (const r of ledger) if (!names.has(r.levelId)) names.set(r.levelId, undefined);
  for (const r of refusals) if (!names.has(r.levelId)) names.set(r.levelId, undefined);

  const excluded: string[] = [];
  const work = new Map<string, LevelWork>();
  for (const [id, name] of names) {
    if (isProofLevel({ id, name })) excluded.push(id);
    else {
      work.set(id, {
        levelId: id,
        name: name ?? id,
        promoted: 0,
        autoSent: 0,
        discarded: 0,
        failed: 0,
        awaiting: 0,
        spentUsd: 0,
        refusals: {},
      });
    }
  }

  for (const level of levels) {
    const w = work.get(level.id);
    if (!w) continue;
    for (const job of level.jobs) {
      // The score's own send is not work anyone would otherwise have done.
      if (job.prompt === REALWORK_PROMPT) continue;
      // Nor is the horde checking the horde: a check step counts nowhere,
      // whatever its verdict, and the job it checked counts by Brian's own
      // verdict — once, not twice (D-285).
      if (job.check) continue;
      if (failedRun(job)) {
        if (job.finishedAt !== undefined && inWindow(window, job.finishedAt)) w.failed++;
        continue;
      }
      const r = resolution(job);
      if (r) {
        if (!inWindow(window, r.at)) continue;
        if (job.status === 'discarded') w.discarded++;
        else if (job.status === 'promoted') {
          if (r.by === 'you') w.promoted++;
          else if (job.outboxSent?.some((s) => s.sentTo.length > 0)) w.autoSent++;
        }
        // `cleared` is seen and let go (D-216): no verdict, nothing to count.
      } else if (awaitingVerdict(job)) {
        if (job.finishedAt !== undefined && job.finishedAt < window.end) w.awaiting++;
      }
    }
  }

  for (const r of ledger) {
    const w = work.get(r.levelId);
    if (w && inWindow(window, r.at)) w.spentUsd += r.costUsd;
  }
  for (const r of refusals) {
    const w = work.get(r.levelId);
    if (w && inWindow(window, r.at)) w.refusals[r.key] = (w.refusals[r.key] ?? 0) + 1;
  }

  // A level with nothing in the window is not a row of zeros; it is absent.
  const touched = (l: LevelWork) =>
    l.promoted + l.autoSent + l.discarded + l.failed + l.awaiting > 0 ||
    l.spentUsd > 0 ||
    Object.keys(l.refusals).length > 0;
  return {
    window,
    levels: [...work.values()]
      .filter(touched)
      .sort((a, b) => b.promoted + b.autoSent - (a.promoted + a.autoSent) || a.levelId.localeCompare(b.levelId)),
    excluded: excluded.sort(),
  };
}

// Text helpers of their own, not the report's: this text is also the Monday
// message (#13), which the server sends without the script.
const usd = (n: number) => (n === 0 ? '0' : n < 1 ? `${(n * 100).toFixed(1)}c` : `$${n.toFixed(2)}`);
const pad = (s: unknown, n: number) => String(s).padEnd(n);
const num = (s: unknown, n: number) => String(s).padStart(n);
const ymd = (ms: number) => {
  const d = new Date(ms);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
};

/** The block as text — one line per real level, the exclusions, and the one number the score is. */
export function formatRealWork(block: RealWorkBlock): string {
  const lines: string[] = [];
  // The window's end is exclusive; the last day inside it is the one to print.
  lines.push(`week ${ymd(block.window.start)} to ${ymd(block.window.end - 1)}`);
  lines.push('');
  lines.push(
    `${pad('level', 18)}${num('promoted', 9)}${num('auto-sent', 10)}${num('discarded', 10)}${num('failed', 7)}${num('awaiting', 9)}${num('spent', 8)}  refusals`,
  );
  for (const l of block.levels) {
    const refusals = Object.entries(l.refusals)
      .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
      .map(([k, n]) => `${k} ${n}`)
      .join(', ');
    lines.push(
      `${pad(l.levelId, 18)}${num(l.promoted, 9)}${num(l.autoSent, 10)}${num(l.discarded, 10)}${num(l.failed, 7)}${num(l.awaiting, 9)}${num(usd(l.spentUsd), 8)}  ${refusals || '—'}`,
    );
  }
  if (!block.levels.length) lines.push('(no real level had anything in this window)');
  if (block.excluded.length) lines.push(`excluded by name: ${block.excluded.join(', ')} (proof/check levels)`);
  const real = realCount(block);
  const awaiting = block.levels.reduce((s, l) => s + l.awaiting, 0);
  lines.push(
    `real work: ${real} job${real === 1 ? '' : 's'} promoted or auto-sent` +
      (awaiting ? `; ${awaiting} awaiting review` : ''),
  );
  return lines.join('\n');
}
