import { useCallback, useEffect, useState } from 'react';
import type { Delivery } from '@agentlings/shared';
import { lvl } from '../api';
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
  onOpenReview,
}: {
  levelId: string;
  revision: number;
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
    (jobId: string) => {
      setSeen((prev) => {
        if (prev.includes(jobId)) return prev;
        const next = [...prev, jobId];
        localStorage.setItem(seenKey(levelId), JSON.stringify(next));
        return next;
      });
    },
    [levelId],
  );

  const open = (jobId: string, file?: string) => {
    markSeen(jobId);
    onOpenReview(jobId, file);
  };

  const fresh = (rows ?? []).filter((d) => !seen.includes(d.jobId)).length;

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
        {rows?.map((d) => {
          const unread = !seen.includes(d.jobId);
          const files = orderFiles(d.files);
          return (
            <div key={d.jobId} className={`in-row${unread ? ' unread' : ''}`}>
              <span className="dim in-when">{when(d.at)}</span>
              <span className="in-main">
                <span className="in-title">
                  {unread && <span className="in-dot" />}
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
                      <span
                        key={f.name}
                        className={`in-chip${PAPERWORK.has(f.name) ? ' paper' : ''}`}
                      >
                        <button onClick={() => open(d.jobId, f.name)} title={`Open ${f.name}`}>
                          {f.name} <i>{size(f.bytes)}</i>
                        </button>
                        <a
                          href={fileUrl(levelId, d.jobId, f.name)}
                          download={f.name}
                          onClick={() => markSeen(d.jobId)}
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
              <span className="in-acts">
                <button className="work-link" onClick={() => open(d.jobId)}>
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
