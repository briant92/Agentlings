import { useEffect, useMemo, useRef, useState } from 'react';
import type { Job, JobEvent, WorldState } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';

type Filter = 'all' | 'active' | 'results';
const FILTERS: Filter[] = ['all', 'active', 'results'];

function ts(at: number): string {
  return new Date(at).toTimeString().slice(0, 8);
}

function jobById(world: WorldState | null, id: string): Job | undefined {
  return world?.jobs.find((j) => j.id === id);
}

/** What approving would actually do to the project, in one line. */
function changeLine(job: Job): string {
  const c = job.changes;
  if (!c || c.files === 0) {
    return job.repoPath
      ? 'nothing to apply — no files were changed'
      : 'a report only — nothing to apply to a project';
  }
  const files = c.files === 1 ? '1 file' : `${c.files} files`;
  return `would change ${files} · +${c.added} −${c.removed}`;
}

/** The reporting rail: one chronological feed for everything the horde does. */
export function Terminal({
  levelId,
  world,
  events,
  onOpenReview,
}: {
  levelId: string;
  world: WorldState | null;
  events: JobEvent[];
  onOpenReview: (jobId: string) => void;
}) {
  const [filter, setFilter] = useState<Filter>('all');
  const [paused, setPaused] = useState(false);
  const feedRef = useRef<HTMLDivElement>(null);

  const display = useMemo(() => {
    // Progress updates in place: keep only the latest per job, and only
    // while that job is still running.
    const latestProgress = new Map<string, number>();
    for (const e of events) {
      if (e.type === 'progress') latestProgress.set(e.jobId, e.id);
    }
    let list = events.filter((e) => {
      if (e.type !== 'progress') return true;
      return (
        latestProgress.get(e.jobId) === e.id && jobById(world, e.jobId)?.status === 'running'
      );
    });
    if (filter === 'active') {
      list = list.filter((e) => {
        const status = jobById(world, e.jobId)?.status;
        return status === 'queued' || status === 'running';
      });
    } else if (filter === 'results') {
      list = list.filter((e) => e.type === 'done' || e.type === 'failed' || e.type === 'resolved');
    }
    return list;
  }, [events, filter, world]);

  useEffect(() => {
    const el = feedRef.current;
    if (el && !paused) el.scrollTop = el.scrollHeight;
  }, [display, paused]);

  const resolve = async (jobId: string, action: 'promote' | 'discard') => {
    await api(lvl(levelId, `/jobs/${jobId}/resolve`), postJson({ action }));
  };

  return (
    <aside
      className="terminal"
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
    >
      <div className="t-head">
        <span className="t-title">terminal</span>
        <span className="t-filters">
          {FILTERS.map((f) => (
            <button key={f} className={f === filter ? 'on' : ''} onClick={() => setFilter(f)}>
              {f}
            </button>
          ))}
        </span>
      </div>
      <div className="t-feed" ref={feedRef}>
        {display.length === 0 && <p className="dim">No reports yet. Queue a job.</p>}
        {display.map((e) => (
          <EventEntry
            key={e.id}
            event={e}
            job={jobById(world, e.jobId)}
            onOpenReview={onOpenReview}
            onResolve={resolve}
          />
        ))}
      </div>
      <div className="t-foot">
        <span>{paused ? 'paused' : 'following'}</span>
        <span className="cursor" />
      </div>
    </aside>
  );
}

function EventEntry({
  event,
  job,
  onOpenReview,
  onResolve,
}: {
  event: JobEvent;
  job: Job | undefined;
  onOpenReview: (jobId: string) => void;
  onResolve: (jobId: string, action: 'promote' | 'discard') => Promise<void>;
}) {
  const time = <span className="t-time">{ts(event.at)}</span>;
  switch (event.type) {
    case 'queued':
      return (
        <div className="t-line">
          {time}
          <span className="ev-queued">▸ queued</span>
          <span className="t-text">{event.title}</span>
        </div>
      );
    case 'started':
      return (
        <div className="t-line">
          {time}
          <span className="ev-started">► working</span>
          <span className="t-text">
            {event.agentling} · {event.title}
          </span>
        </div>
      );
    case 'progress':
      return (
        <div className="t-line">
          {time}
          <span className="ev-progress">⋯ {event.detail}</span>
        </div>
      );
    case 'done':
      return (
        <>
          <div className="t-line">
            {time}
            <span className="ev-done">✔ finished</span>
            <span className="t-text">
              {event.agentling} · {event.title}
            </span>
          </div>
          {job?.status === 'done' && (
            <div className="t-card">
              <div className="summary">{event.detail}</div>
              <div className="t-changes">{changeLine(job)}</div>
              <div className="actions">
                <button onClick={() => void onResolve(event.jobId, 'promote')}>Approve</button>
                <button onClick={() => void onResolve(event.jobId, 'discard')}>Discard</button>
                <button className="ghost" onClick={() => onOpenReview(event.jobId)}>
                  See the changes
                </button>
              </div>
            </div>
          )}
        </>
      );
    case 'failed':
      return (
        <div className="t-line">
          {time}
          <span className="ev-failed">✖ failed</span>
          <span className="t-text">
            {event.title} — {event.detail}
          </span>
        </div>
      );
    case 'resolved':
      return (
        <div className="t-line">
          {time}
          <span className="ev-resolved">★ {event.detail}</span>
          <span className="t-text">{event.title}</span>
        </div>
      );
  }
}
