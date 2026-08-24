import { useCallback, useEffect, useState } from 'react';
import type { Delivery, Job } from '@agentlings/shared';
import { lvl } from '../api';
import { groupDeliveries, runningNextStep } from './chain';
import { fileUrl, orderFiles, PAPERWORK, size } from './files';
import { money } from './Productivity';

/**
 * The latest finished work, under the reporting feed.
 *
 * The feed scrolls away and is gone after a restart — its events are numbered
 * per server run and held in memory. This is the durable half: what the crew
 * has actually produced, newest first, with the files one click from being
 * read or saved.
 *
 * It reads a listing of names and sizes only. The files themselves are fetched
 * by the route the review panel already uses, so there is one way to get a
 * file out of a sandbox rather than two.
 *
 * A chain's steps (D-105) render as one card rather than a row per step
 * (D-233): one prompt is one thing here, whatever the queue split it into.
 */

function when(at: number): string {
  const d = new Date(at);
  return new Date().toDateString() === d.toDateString()
    ? d.toTimeString().slice(0, 5)
    : d.toDateString().slice(4, 10);
}

/**
 * Which deliveries have been looked at.
 *
 * The browser's business, not the server's, and deliberately: "have I read
 * this" is about the person sitting here, while the job's status is about the
 * work. Keyed per level, like the crew panel's dismissed merges.
 */
function seenKey(levelId: string): string {
  return `agentlings:inbox-seen:${levelId}`;
}
/** Exported for the select screen's blue block (D-137), which subtracts this
 *  same set from the same capped population — the dot and the block agree. */
export function readSeen(levelId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(seenKey(levelId)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

export function Inbox({
  levelId,
  /** Bumped whenever the queue changes, so the list refetches then and only then. */
  revision,
  /** The live queue, so a chain card can say its next step is still working. */
  jobs,
  onOpenReview,
}: {
  levelId: string;
  revision: number;
  jobs?: readonly Job[];
  onOpenReview: (jobId: string, file?: string) => void;
}) {
  const [rows, setRows] = useState<Delivery[] | null>(null);
  const [seen, setSeen] = useState<string[]>(() => readSeen(levelId));
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void fetch(lvl(levelId, '/deliveries'))
      .then((res) => (res.ok ? (res.json() as Promise<Delivery[]>) : Promise.reject(res.statusText)))
      .then((data) => alive && setRows(data))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [levelId, revision]);

  const markSeen = useCallback(
    (jobIds: string[]) => {
      setSeen((prev) => {
        const fresh = jobIds.filter((id) => !prev.includes(id));
        if (fresh.length === 0) return prev;
        const next = [...prev, ...fresh];
        localStorage.setItem(seenKey(levelId), JSON.stringify(next));
        return next;
      });
    },
    [levelId],
  );

  const fresh = (rows ?? []).filter((d) => !seen.includes(d.jobId)).length;
  const groups = groupDeliveries(rows ?? []);

  return (
    <div className="inbox">
      <div className="in-head">
        <span className="t-title">inbox</span>
        {fresh > 0 && <span className="in-pill">{fresh} new</span>}
        <span className="dim in-count">latest delivered work</span>
      </div>
      <div className="in-list">
        {rows === null && !error && <p className="dim in-empty">Loading…</p>}
        {error && <p className="error">{error}</p>}
        {rows?.length === 0 && (
          <p className="dim in-empty">Nothing delivered yet. Finished work lands here.</p>
        )}
        {groups.map((group) => {
          const unread = group.some((d) => !seen.includes(d.jobId));
          // Opening any of a chain's steps marks the whole card read — the
          // dot is per card, and a half-read card would keep it lit forever.
          const open = (jobId: string, file?: string) => {
            markSeen(group.map((d) => d.jobId));
            onOpenReview(jobId, file);
          };
          const last = group[group.length - 1];
          const next = runningNextStep(jobs, last.jobId);
          return (
            <div
              key={group[0].jobId}
              className={`in-row${group.length > 1 ? ' in-chain' : ''}${unread ? ' unread' : ''}`}
            >
              <span className="dim in-when">{when(last.at)}</span>
              <span className="in-main">
                {group.map((d, i) => (
                  <StepBody
                    key={d.jobId}
                    d={d}
                    levelId={levelId}
                    dot={unread && i === 0}
                    open={open}
                    onSave={() => markSeen(group.map((g) => g.jobId))}
                  />
                ))}
                {/* The chain's tail, still at work: the door to the whole
                    review is the step that has not delivered yet, so the card
                    says where the decision will land instead of looking done. */}
                {next && (
                  <span className="dim in-chain-next">
                    step {next.step?.n ?? '?'} of {next.step?.of ?? '?'} is{' '}
                    {next.status === 'running' ? 'working' : 'queued'} — the review lands here when
                    it delivers
                  </span>
                )}
              </span>
              <span className="in-acts">
                <button className="work-link" onClick={() => open(last.jobId)}>
                  preview
                </button>
              </span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/** One delivery's title, chips and byline — a whole row alone, one step of a chain card. */
function StepBody({
  d,
  levelId,
  dot,
  open,
  onSave,
}: {
  d: Delivery;
  levelId: string;
  /** Whether this line carries the card's unread dot. */
  dot: boolean;
  open: (jobId: string, file?: string) => void;
  onSave: () => void;
}) {
  const files = orderFiles(d.files);
  return (
    <span className="in-step">
      <span className="in-title">
        {dot && <span className="in-dot" />}
        {d.step && <span className="dim in-step-n">step {d.step.n}</span>}
        {/* The title is the natural thing to click; it opens the
            review the way the chips do, at the report rather than
            at one file. */}
        <button className="in-name" onClick={() => open(d.jobId)} title="Open the review">
          {d.title}
        </button>
        <span className={`badge ${d.status}`}>
          {d.outcome === 'to review' ? d.status : d.outcome}
        </span>
      </span>
      {/* The chip opens the file rather than saving it. Saving a
          .xlsx to find out whether it is the right .xlsx was the
          whole complaint; the arrow keeps the one-click save for
          when you already know. */}
      {files.length > 0 && (
        <span className="in-files">
          {files.map((f) => (
            <span key={f.name} className={`in-chip${PAPERWORK.has(f.name) ? ' paper' : ''}`}>
              <button onClick={() => open(d.jobId, f.name)} title={`Open ${f.name}`}>
                {f.name} <i>{size(f.bytes)}</i>
              </button>
              <a
                href={fileUrl(levelId, d.jobId, f.name)}
                download={f.name}
                onClick={onSave}
                title={`Save ${f.name}`}
              >
                ↓
              </a>
            </span>
          ))}
        </span>
      )}
      <span className="dim in-made">
        {d.who}
        {d.costUsd !== null && ` · ${money(d.costUsd)}`}
        {d.changes && d.changes.files > 0 &&
          ` · ${d.changes.files === 1 ? '1 file' : `${d.changes.files} files`}, +${d.changes.added} −${d.changes.removed}`}
        {files.length === 0 && ' · nothing left on disk'}
      </span>
    </span>
  );
}
