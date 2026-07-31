import { useMemo, useState } from 'react';
import type { CrewMember, Job } from '@agentlings/shared';
import { entriesFor, type Outcome, tally } from './ledger';

/**
 * The work record: everything the crew has finished, what it produced and what
 * it cost, filterable by who did it.
 *
 * Reads the job list the level already holds rather than an endpoint of its
 * own — the socket sends the whole queue whenever it changes, so the history
 * is on the client before this panel opens.
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
  jobs,
  crew,
  onOpenReview,
}: {
  jobs: Job[];
  crew: CrewMember[];
  /** Opens the job's outputs; the crew panel closes so nothing stacks. */
  onOpenReview: (jobId: string) => void;
}) {
  const [filter, setFilter] = useState<Outcome | 'all'>('all');
  const [who, setWho] = useState<string>('everyone');

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

      <p className="dim back-tally">
        {totals.jobs === 0
          ? 'Nothing here yet.'
          : `${totals.jobs} finished · ${totals.toReview} still to review · ${money(totals.costUsd)} on these` +
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
