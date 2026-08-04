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

/**
 * Say something back.
 *
 * An agentling that asks a question used to be a dead end: the card offered
 * approve or discard, so the only way to answer was to retype the whole
 * request and pay for the work again. Sending queues a follow-up that carries
 * this run's sandbox forward, so the answer continues the work rather than
 * restarting it.
 */
function ReplyBox({
  jobId,
  onReply,
}: {
  jobId: string;
  onReply: (jobId: string, text: string) => Promise<void>;
}) {
  const [text, setText] = useState('');
  const [busy, setBusy] = useState(false);
  const send = async () => {
    const answer = text.trim();
    if (!answer || busy) return;
    setBusy(true);
    try {
      await onReply(jobId, answer);
      setText('');
    } finally {
      setBusy(false);
    }
  };
  return (
    <div className="t-reply">
      <input
        value={text}
        placeholder="Answer, or say what to do next…"
        onChange={(e) => setText(e.target.value)}
        onKeyDown={(e) => {
          if (e.key === 'Enter') void send();
        }}
      />
      <button disabled={busy || !text.trim()} onClick={() => void send()}>
        {busy ? 'sending…' : 'Send'}
      </button>
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

  const resolve = async (jobId: string, action: 'promote' | 'discard') => {
    await api(lvl(levelId, `/jobs/${jobId}/resolve`), postJson({ action }));
  };

  /** The router answered without a session and the user disagrees. */
  const redo = async (jobId: string) => {
    await api(lvl(levelId, `/jobs/${jobId}/redo`), { method: 'POST' });
  };

  /** Stop work that is no longer wanted; the session is killed, not abandoned. */
  const cancel = async (jobId: string) => {
    await api(lvl(levelId, `/jobs/${jobId}/cancel`), { method: 'POST' });
  };

  /** Pick a cut-off run back up: same sandbox, its own quote and turns. */
  const carryOn = async (jobId: string) => {
    await api(lvl(levelId, `/jobs/${jobId}/continue`), { method: 'POST' });
  };

  /** Answer the agentling: a new job that carries this one's sandbox forward. */
  const reply = async (jobId: string, text: string) => {
    await api(lvl(levelId, `/jobs/${jobId}/reply`), postJson({ text }));
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
            onResolve={resolve}
            onRedo={redo}
            onReply={reply}
            onCancel={cancel}
            onContinue={carryOn}
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
  onResolve,
  onRedo,
  onReply,
  onCancel,
  onContinue,
}: {
  event: JobEvent;
  job: Job | undefined;
  onOpenReview: (jobId: string) => void;
  onResolve: (jobId: string, action: 'promote' | 'discard') => Promise<void>;
  onRedo: (jobId: string) => Promise<void>;
  onReply: (jobId: string, text: string) => Promise<void>;
  onCancel: (jobId: string) => Promise<void>;
  onContinue: (jobId: string) => Promise<void>;
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
          </div>
          {job?.status === 'done' && (
            <div className="t-card">
              <div className="summary">{event.detail}</div>
              <div className="t-changes">
                {changeLine(job)}
                {meterLine(job) && <span className="t-meter"> · {meterLine(job)}</span>}
              </div>
              <div className="actions">
                <button onClick={() => void onResolve(event.jobId, 'promote')}>Approve</button>
                <button onClick={() => void onResolve(event.jobId, 'discard')}>Discard</button>
                <button className="ghost" onClick={() => onOpenReview(event.jobId)}>
                  See the changes
                </button>
                {job.meter?.routed && (
                  <button className="ghost" onClick={() => void onRedo(event.jobId)}>
                    Do it properly
                  </button>
                )}
              </div>
              <ReplyBox jobId={event.jobId} onReply={onReply} />
            </div>
          )}
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
            </div>
            <div className="t-card">
              <div className="summary">
                {job.meter?.outOfTurns
                  ? 'Ran out of turns, but what it got done is ready to review.'
                  : 'Stopped early, but what it got done is ready to review.'}
              </div>
              <div className="t-changes">
                {changeLine(job)}
                {meterLine(job) && <span className="t-meter"> · {meterLine(job)}</span>}
              </div>
              <div className="actions">
                <button onClick={() => void onResolve(event.jobId, 'promote')}>Approve</button>
                <button onClick={() => void onResolve(event.jobId, 'discard')}>Discard</button>
                <button className="ghost" onClick={() => onOpenReview(event.jobId)}>
                  See the changes
                </button>
                {/* Only when the run was cut off — the server refuses the rest,
                    and a button that is going to be refused is worse than none. */}
                {job.meter?.outOfTurns && (
                  <button className="ghost" onClick={() => void onContinue(event.jobId)}>
                    Carry on
                  </button>
                )}
              </div>
              <ReplyBox jobId={event.jobId} onReply={onReply} />
            </div>
          </>
        );
      }
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
