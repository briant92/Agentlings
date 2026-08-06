import { useCallback, useEffect, useMemo, useState } from 'react';
import type { CrewMember, Job, LevelProductivity, ScheduleInfo } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { entriesFor, type Outcome, tally } from './ledger';

/**
 * The work record: everything the crew has finished, what it produced and what
 * it cost, filterable by who did it.
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
 */

const FILTERS: (Outcome | 'all')[] = ['all', 'to review', 'kept', 'closed'];

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
      (who === 'everyone' || e.job.assignedTo === who),
  );
  const totals = tally(shown);
  // Only offer names that actually did something, so the list is never a
  // menu of filters that all come back empty.
  const workers = crew.filter((m) => all.some((e) => e.job.assignedTo === m.id));

  return (
    <>
      <div className="back-bar">
        <span className="t-filters">
          {FILTERS.map((f) => (
            <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </span>
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

      {schedules.length > 0 && (
        <div className="back-schedules">
          <p className="dim back-sched-head">on a schedule — fired jobs land above like any other</p>
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

      <p className="dim back-tally">
        {totals.jobs === 0
          ? 'Nothing here yet.'
          : // Deliberately "showing": these are the rows on screen and they
            // move with the filters, which is a different quantity from the
            // line above however similar the words.
            `showing ${totals.jobs} · ${totals.toReview} still to review · ${money(totals.costUsd)} on these` +
            (totals.unmeasured > 0
              ? ` · ${totals.unmeasured} stopped mid-run, cost unknown`
              : '')}
      </p>

      {shown.map(({ job, outcome, who: name, produced, costUsd }) => (
        <button key={job.id} className="back-row" onClick={() => onOpenReview(job.id)}>
          <span className="back-when dim">{when(job.finishedAt)}</span>
          <span className="back-main">
            <span className="back-title">{job.title}</span>
            <span className="dim back-made">
              {name} · {produced}
              {costUsd !== null && ` · ${money(costUsd)}`}
            </span>
          </span>
          <span className={`badge ${job.status}`}>{outcome === 'to review' ? job.status : outcome}</span>
        </button>
      ))}

      {all.length > 0 && shown.length === 0 && (
        <p className="dim">Nothing matches that. Try a different filter.</p>
      )}
    </>
  );
}
