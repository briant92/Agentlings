import { useEffect, useMemo, useRef, useState } from 'react';
import type { Job, JobEvent, WorldState } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { Inbox } from './Inbox';

type Filter = 'all' | 'active' | 'results';
const FILTERS: Filter[] = ['all', 'active', 'results'];

function ts(at: number): string {
  return new Date(at).toTimeString().slice(0, 8);
}

function jobById(world: WorldState | null, id: string): Job | undefined {
  return world?.jobs.find((j) => j.id === id);
}

/** What the session cost, when the executor could tell. */
function meterLine(job: Job): string | null {
  const m = job.meter;
  if (!m) return null;
  if (m.routed) return 'answered without an agentling · free';
  const bits: string[] = [];
  if (typeof m.costUsd === 'number') {
    bits.push(m.costUsd < 0.01 ? '<$0.01' : `$${m.costUsd.toFixed(2)}`);
  }
  if (typeof m.turns === 'number') bits.push(`${m.turns} turns`);
  if (typeof m.durationMs === 'number') bits.push(`${Math.round(m.durationMs / 1000)}s`);
  if (m.model) bits.push(m.model.replace(/^claude-/, '').replace(/-\d{8}$/, ''));
  return bits.length > 0 ? bits.join(' · ') : null;
}

/**
 * One way in (D-114).
 *
 * The card used to carry four controls and a text box, and left them live in a
 * scrolling log after they had been used — so the feed filled with rows you
 * could still act on by mistake, and the decision itself happened in a strip
 * a few characters tall. Everything moved to the review panel, which has room
 * for what the run actually produced; this is the door to it.
 *
 * The meter moves up beside the outcome, because what a run cost is context
 * for the decision rather than something you act on.
 */
function ReviewCard({
  job,
  say,
  onOpenReview,
}: {
  job: Job;
  say?: string;
  onOpenReview: (jobId: string, file?: string) => void;
}) {
  return (
    <div className="t-card">
      {say && <div className="summary">{say}</div>}
      <div className="actions">
        {/* A failure has no verdict to give — "REVIEW" promised one, and the
            modal behind it opens on an error and an answer box (D-135/D-136). */}
        <button className="t-review" onClick={() => onOpenReview(job.id)}>
          {job.status === 'failed' ? 'SEE WHAT HAPPENED' : 'REVIEW'}
        </button>
      </div>
    </div>
  );
}

/**
 * The reporting rail: one chronological feed for everything the horde does,
 * with the inbox of finished work beneath it.
 *
 * The two halves answer different questions on purpose. The feed is live and
 * disposable — numbered per server run, held in memory, gone after a restart.
 * The inbox is the durable half: what the crew actually produced, still there
 * tomorrow.
 */
export function Terminal({
  levelId,
  world,
  events,
  revision,
  onOpenReview,
}: {
  levelId: string;
  world: WorldState | null;
  events: JobEvent[];
  /** Bumped when the queue changes; the inbox refetches on it. */
  revision: number;
  /** The file is the inbox's business; the feed opens a job and nothing more. */
  onOpenReview: (jobId: string, file?: string) => void;
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

  /**
   * Stop work that is no longer wanted; the session is killed, not abandoned.
   *
   * The only thing the feed still does to a job. Approve, discard, carry on
   * and answering all moved into the review panel (D-114) — the feed opens
   * the decision, it does not make it.
   */
  const cancel = async (jobId: string) => {
    await api(lvl(levelId, `/jobs/${jobId}/cancel`), { method: 'POST' });
  };

  return (
    <aside
      className="terminal"
      data-tour="terminal"
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
            onCancel={cancel}
          />
        ))}
      </div>
      <div className="t-foot">
        <span>{paused ? 'paused' : 'following'}</span>
        <span className="cursor" />
      </div>
      <Inbox levelId={levelId} revision={revision} onOpenReview={onOpenReview} />
    </aside>
  );
}

function EventEntry({
  event,
  job,
  onOpenReview,
  onCancel,
}: {
  event: JobEvent;
  job: Job | undefined;
  onOpenReview: (jobId: string) => void;
  onCancel: (jobId: string) => Promise<void>;
}) {
  // Driven by the job's live status rather than the event's, so it vanishes
  // the moment the work ends. Each line offers it only for its own phase:
  // a started job still has a "queued" line above, and two stop buttons for
  // one job would be a puzzle rather than a control.
  const stop = (status: Job['status']) =>
    job?.status === status ? (
      <button className="t-stop" onClick={() => void onCancel(event.jobId)}>
        stop
      </button>
    ) : null;
  const time = <span className="t-time">{ts(event.at)}</span>;
  switch (event.type) {
    case 'queued':
      return (
        <div className="t-line">
          {time}
          <span className="ev-queued">▸ queued</span>
          <span className="t-text">{event.title}</span>
          {/* How the job came to exist, when it was not a person — a firing
              schedule says so here (D-103). */}
          {event.detail && <span className="dim"> · {event.detail}</span>}
          {stop('queued')}
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
          {stop('running')}
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
            {job && meterLine(job) && (
              <span className="t-meter t-meter-right">{meterLine(job)}</span>
            )}
          </div>
          {job?.status === 'done' && <ReviewCard job={job} onOpenReview={onOpenReview} />}
        </>
      );
    case 'failed':
      // A run that left a diff is partial, not failed — it did the work and
      // lost only the write-up, so it gets the same review actions.
      if (job?.status === 'partial') {
        return (
          <>
            <div className="t-line">
              {time}
              <span className="ev-partial">◐ partial</span>
              <span className="t-text">
                {event.agentling} · {event.title}
              </span>
              {meterLine(job) && (
                <span className="t-meter t-meter-right">{meterLine(job)}</span>
              )}
            </div>
            {/* A continued partial retires its card too (D-139 amendment): the
                user decided — More turns — and a decided task must not keep
                soliciting from the feed. Its files stay reviewable from the
                inbox and the panel. */}
            {!job.continuedBy && (
              <ReviewCard
                job={job}
                onOpenReview={onOpenReview}
                say={
                  job.meter?.outOfTurns
                    ? 'Ran out of turns, but what it got done is ready to review.'
                    : 'Stopped early, but what it got done is ready to review.'
                }
              />
            )}
          </>
        );
      }
      // A failed run's last words are often a question — the 6¢ run that
      // could not invent an address asked for one, correctly, and used to die
      // as this bare line (D-087). The reply box makes the answer continue
      // the same job, channel and sandbox carried, instead of wasting it.
      return (
        <>
          <div className="t-line">
            {time}
            <span className="ev-failed">✖ failed</span>
            <span className="t-text">{event.title}</span>
            {job && meterLine(job) && (
              <span className="t-meter t-meter-right">{meterLine(job)}</span>
            )}
          </div>
          {/* Answered failures retire their card (D-139), and so does any
              resolution: a failed-typed event's job can become partial by
              harvest and then promoted or discarded, and the card must ask
              only while the status still does — the done-card's own rule,
              which this branch never had because failed was once terminal. */}
          {job && job.status === 'failed' && !job.continuedBy && (
            <ReviewCard job={job} onOpenReview={onOpenReview} say={event.detail} />
          )}
        </>
      );
    case 'resolved':
      // Whose decision it was, kept apart on purpose: an auto-send is the one
      // case nobody looked at, and it must not wear the user's verb (D-114).
      return (
        <div className="t-line">
          {time}
          <span className={event.by === 'app' ? 'ev-auto' : 'ev-resolved'}>
            {event.by === 'app' ? '◈' : '★'} {event.detail}
          </span>
          <span className="t-text">{event.title}</span>
        </div>
      );
  }
}
