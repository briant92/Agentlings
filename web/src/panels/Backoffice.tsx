import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrewMember, Job, LevelProductivity, ScheduleInfo } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import {
  badgeOf,
  cutChip,
  entriesFor,
  groupsFor,
  matches,
  tally,
  type Entry,
  type Group,
  type Outcome,
} from './ledger';
import { ExpandRow, MoreRow, usePaged } from './Section';

/**
 * The work record: everything the crew has finished, what it produced and what
 * it cost, grouped by the sentence that asked for it (UI.md, step 2).
 *
 * The rows read the job list the level already holds rather than an endpoint
 * of its own — the socket sends the whole queue whenever it changes, so the
 * history is on the client before this panel opens.
 *
 * The lifetime line above them does not, and cannot: the queue holds only the
 * jobs still in it, so adding those up gave a level total $1.60 short of what
 * the ledger says was really paid out. It reads the same figures the
 * productivity panel does, from the same request, so the two can no longer
 * disagree — and the row subtotal beneath it is labelled as a subtotal rather
 * than left to look like a second, quieter answer to the same question.
 *
 * Grouped by ask because the flat list had stopped answering the questions
 * it was opened for: with fourteen legs of one sentence among forty-eight
 * runs, "what has this ask cost" and "which leg was the last" both took a
 * scroll and some arithmetic. The flat list is one click away, and the
 * filters, the find box and the totals stay pinned while either scrolls.
 */

const FILTERS: (Outcome | 'all')[] = ['all', 'to review', 'kept', 'closed'];

/** Which shape of the record was last chosen — a hint the browser keeps, like a fold. */
type View = 'ask' | 'run';
const VIEW_KEY = 'agentlings:backoffice:view';
function readView(): View {
  try {
    return localStorage.getItem(VIEW_KEY) === 'run' ? 'run' : 'ask';
  } catch {
    return 'ask';
  }
}
function saveView(view: View): void {
  try {
    localStorage.setItem(VIEW_KEY, view);
  } catch {
    // A lost hint, not a lost setting.
  }
}

function when(at: number | undefined): string {
  if (!at) return '';
  const d = new Date(at);
  const today = new Date().toDateString() === d.toDateString();
  return today
    ? d.toTimeString().slice(0, 5)
    : `${d.toDateString().slice(4, 10)} ${d.toTimeString().slice(0, 5)}`;
}

function money(usd: number): string {
  return usd < 0.01 ? '<$0.01' : `$${usd.toFixed(2)}`;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** What an ask cost, with the legs nobody could meter said rather than folded in. */
function groupCost(group: Group): string {
  const more = group.unmeasured > 0 ? `${group.unmeasured} unmeasured` : '';
  if (group.costUsd > 0) return more ? `${money(group.costUsd)} + ${more}` : money(group.costUsd);
  return more || 'free';
}

/** One finished leg: when · who · what it left · cost · the cut chip · badge. */
function Leg({ entry, onOpen }: { entry: Entry; onOpen: (id: string) => void }) {
  const { job } = entry;
  const chip = cutChip(job);
  return (
    <button className="back-row leg" onClick={() => onOpen(job.id)}>
      <span className="back-when dim">{when(job.finishedAt)}</span>
      <span className="leg-main" title={job.continues ? 'continues the leg before it' : undefined}>
        {entry.who}
        {job.continues ? ' ↳' : ''} · {entry.produced}
      </span>
      <span className="leg-cost">{entry.costUsd !== null ? money(entry.costUsd) : ''}</span>
      {chip && (
        <span className="cut-chip" title="cut at the turn ceiling">
          {chip}
        </span>
      )}
      <span className={`badge ${job.status}`}>{badgeOf(entry)}</span>
    </button>
  );
}

/** A group's legs, ten at a time. */
function Legs({ legs, onOpen }: { legs: Entry[]; onOpen: (id: string) => void }) {
  const { rows, hidden, showAll } = usePaged(legs);
  return (
    <>
      {rows.map((entry) => (
        <Leg key={entry.job.id} entry={entry} onOpen={onOpen} />
      ))}
      <MoreRow hidden={hidden} what="legs" onShow={showAll} />
    </>
  );
}

/** One ask, folded to two lines: the sentence, then runs · who · spend · last. */
function Ask({ group, onOpen }: { group: Group; onOpen: (id: string) => void }) {
  const runs = group.legs.length;
  return (
    <ExpandRow
      className="ask"
      head={
        <>
          <span className="ask-main">
            <span className="ask-title">{group.prompt}</span>
            <span className="dim ask-meta">
              <span>
                {runs} {runs === 1 ? 'run' : 'runs'}
              </span>
              {group.who.map((w) => (
                <span key={w.id}>
                  {w.color !== null && <i className="who-dot" style={{ background: hex(w.color) }} />}
                  {w.name}
                  {w.legs > 1 ? ` ${w.legs}` : ''}
                </span>
              ))}
              <span>{groupCost(group)}</span>
              <span>last {when(group.lastAt)}</span>
            </span>
          </span>
          <span className={`badge ${group.latest.job.status}`}>{badgeOf(group.latest)}</span>
        </>
      }
    >
      <Legs legs={group.legs} onOpen={onOpen} />
    </ExpandRow>
  );
}

/** The flat record's row, as it always was, plus the cut chip and the badge's word. */
function Run({ entry, onOpen }: { entry: Entry; onOpen: (id: string) => void }) {
  const { job } = entry;
  const chip = cutChip(job);
  return (
    <button className="back-row" onClick={() => onOpen(job.id)}>
      <span className="back-when dim">{when(job.finishedAt)}</span>
      <span className="back-main">
        <span className="back-title">{job.title}</span>
        <span className="dim back-made">
          {entry.who}
          {job.continues ? ' ↳' : ''} · {entry.produced}
          {entry.costUsd !== null && ` · ${money(entry.costUsd)}`}
        </span>
      </span>
      {chip && (
        <span className="cut-chip" title="cut at the turn ceiling">
          {chip}
        </span>
      )}
      <span className={`badge ${job.status}`}>{badgeOf(entry)}</span>
    </button>
  );
}

export function Backoffice({
  levelId,
  jobs,
  crew,
  productivity,
  onOpenReview,
}: {
  levelId: string;
  jobs: Job[];
  crew: CrewMember[];
  /** The level's real lifetime spend. Null until the first fetch lands. */
  productivity: LevelProductivity | null;
  /** Opens the job's outputs; the crew panel closes so nothing stacks. */
  onOpenReview: (jobId: string) => void;
}) {
  const [filter, setFilter] = useState<Outcome | 'all'>('all');
  const [who, setWho] = useState<string>('everyone');
  const [find, setFind] = useState('');
  const [view, setView] = useState<View>(readView);
  const pick = (next: View) => {
    setView(next);
    saveView(next);
  };

  /** Sentences this level queues again on a cadence (D-103). */
  const [schedules, setSchedules] = useState<ScheduleInfo[]>([]);
  const loadSchedules = useCallback(() => {
    void api<{ schedules: ScheduleInfo[] }>(lvl(levelId, '/schedules'))
      .then((reply) => setSchedules(reply.schedules))
      .catch(() => setSchedules([]));
  }, [levelId]);
  useEffect(() => {
    loadSchedules();
  }, [loadSchedules]);

  const all = useMemo(() => entriesFor(jobs, crew), [jobs, crew]);
  const shown = all.filter(
    (e) =>
      (filter === 'all' || e.outcome === filter) &&
      (who === 'everyone' || e.job.assignedTo === who) &&
      matches(e, find),
  );
  const totals = tally(shown);
  const groups = groupsFor(shown, crew);
  // Only offer names that actually did something, so the list is never a
  // menu of filters that all come back empty.
  const workers = crew.filter((m) => all.some((e) => e.job.assignedTo === m.id));
  const asks = usePaged(groups);
  const runs = usePaged(shown);

  return (
    <>
      <div className="sticky-bar">
        <div className="back-bar">
          <span className="t-filters">
            {FILTERS.map((f) => (
              <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>
                {f}
              </button>
            ))}
          </span>
          <input
            className="back-find"
            placeholder="find a run…"
            aria-label="Find a run by its sentence"
            value={find}
            onChange={(e) => setFind(e.target.value)}
          />
          {workers.length > 0 && (
            <select
              className="back-who"
              value={who}
              onChange={(e) => setWho(e.target.value)}
              aria-label="Filter by agentling"
            >
              <option value="everyone">everyone</option>
              {workers.map((m) => (
                <option key={m.id} value={m.id}>
                  {m.name}
                </option>
              ))}
            </select>
          )}
        </div>

        {productivity && productivity.jobs > 0 && (
          <p className="back-lifetime">
            {productivity.jobs} runs all told · {money(productivity.costUsd)} spent ·{' '}
            {money(productivity.priceUsd)} billable
            {productivity.unmeasured > 0 && ` · ${productivity.unmeasured} unmeasured`}
          </p>
        )}

        <div className="back-tally-row">
          <p className="dim back-tally">
            {totals.jobs === 0
              ? 'Nothing here yet.'
              : // Deliberately "showing": these are the rows on screen and they
                // move with the filters, which is a different quantity from the
                // line above however similar the words.
                `showing ${totals.jobs}` +
                (view === 'ask' ? ` in ${groups.length} ${groups.length === 1 ? 'ask' : 'asks'}` : '') +
                ` · ${totals.toReview} to review · ${money(totals.costUsd)} on these` +
                (totals.unmeasured > 0 ? ` · ${totals.unmeasured} cost unknown` : '')}
          </p>
          <span className="seg" role="group" aria-label="How to list the runs">
            <button className={view === 'ask' ? 'on' : ''} onClick={() => pick('ask')}>
              by ask
            </button>
            <button className={view === 'run' ? 'on' : ''} onClick={() => pick('run')}>
              every run
            </button>
          </span>
        </div>
      </div>

      {schedules.length > 0 && (
        <div className="back-schedules">
          <p className="dim back-sched-head">on a schedule — fired jobs land below like any other</p>
          {schedules.map((s) => (
            <div key={s.id} className="back-row back-sched">
              <span className="back-main">
                <span className="back-title">{s.prompt}</span>
                <span className="dim back-made">
                  {s.cadenceLabel}
                  {s.paused ? ' · paused' : ` · next ${when(s.nextDueAt)}`}
                  {s.lastError ? ` · last firing failed: ${s.lastError}` : ''}
                </span>
              </span>
              <span className="back-sched-acts">
                <button
                  onClick={() =>
                    void api(
                      lvl(levelId, `/schedules/${s.id}/pause`),
                      postJson({ paused: !s.paused }),
                    )
                      .then(loadSchedules)
                      .catch(() => {})
                  }
                >
                  {s.paused ? 'resume' : 'pause'}
                </button>
                <button
                  aria-label={`Stop repeating "${s.prompt}"`}
                  onClick={() =>
                    void api(lvl(levelId, `/schedules/${s.id}`), { method: 'DELETE' })
                      .then(loadSchedules)
                      .catch(() => {})
                  }
                >
                  ✕
                </button>
              </span>
            </div>
          ))}
        </div>
      )}

      {view === 'ask' ? (
        <>
          {asks.rows.map((group) => (
            <Ask key={group.key} group={group} onOpen={onOpenReview} />
          ))}
          <MoreRow hidden={asks.hidden} what="asks" onShow={asks.showAll} />
        </>
      ) : (
        <>
          {runs.rows.map((entry) => (
            <Run key={entry.job.id} entry={entry} onOpen={onOpenReview} />
          ))}
          <MoreRow hidden={runs.hidden} what="runs" onShow={runs.showAll} />
        </>
      )}

      {all.length > 0 && shown.length === 0 && (
        <p className="dim">Nothing matches that. Try a different filter.</p>
      )}
    </>
  );
}
