import { useEffect, useRef, useState } from 'react';
import type { Job } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { parcelAge, parcelChips, parcelOrder, parcelSections } from './parcels';

/**
 * The parcel desk (the pile said ×40 and clicking it opened one job blind):
 * every delivery waiting on a verdict, grouped by what Approve would do,
 * oldest first. Rows open the ordinary review; "Work the pile" walks the
 * whole queue with auto-advance; multi-select carries discard ONLY —
 * approving acts (sends, installs, applies), so it stays one at a time.
 */
export function ParcelDesk({
  levelId,
  jobs,
  onOpenReview,
  onClose,
}: {
  levelId: string;
  jobs: Job[];
  /** Open one delivery's review, entering the desk's flow. */
  onOpenReview: (jobId: string) => void;
  onClose: () => void;
}) {
  const [selected, setSelected] = useState<ReadonlySet<string>>(new Set());
  // The house press-twice: first press arms and relabels, second acts (D-134).
  const [armed, setArmed] = useState(false);
  const disarm = useRef<number | undefined>(undefined);
  const [discarding, setDiscarding] = useState<{ done: number; of: number } | null>(null);
  const [refusal, setRefusal] = useState<string | null>(null);

  const sections = parcelSections(jobs);
  const order = parcelOrder(jobs);
  const now = Date.now();
  const waiting = sections.flatMap((s) => s.jobs);
  const oldest =
    waiting.length > 0
      ? waiting.reduce((a, b) =>
          (a.finishedAt ?? a.createdAt) <= (b.finishedAt ?? b.createdAt) ? a : b,
        )
      : null;
  // A verdict given elsewhere prunes itself from the selection.
  const live = [...selected].filter((id) => order.includes(id));

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);
  useEffect(() => () => clearTimeout(disarm.current), []);

  const toggle = (id: string) => {
    setArmed(false);
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const discardSelected = async () => {
    if (discarding) return;
    if (!armed) {
      setArmed(true);
      clearTimeout(disarm.current);
      disarm.current = window.setTimeout(() => setArmed(false), 4000);
      return;
    }
    clearTimeout(disarm.current);
    setArmed(false);
    setRefusal(null);
    setDiscarding({ done: 0, of: live.length });
    try {
      for (const [i, id] of live.entries()) {
        await api(lvl(levelId, `/jobs/${id}/resolve`), postJson({ action: 'discard' }));
        setDiscarding({ done: i + 1, of: live.length });
      }
      setSelected(new Set());
    } catch (err) {
      setRefusal(err instanceof Error ? err.message : String(err));
    } finally {
      setDiscarding(null);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal parcels" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">parcel desk</span>
          <span className="dim">
            {oldest === null
              ? 'nothing waiting'
              : `${order.length} waiting · oldest ${parcelAge(oldest, now)}`}
          </span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body pd-body">
          {order.length === 0 && (
            <p className="dim">The pile is clear — every delivery has its verdict.</p>
          )}
          {sections.map((section) => (
            <div key={section.kind} className="pd-section">
              <div className={`pd-section-head pd-${section.kind}`}>
                {section.title} — {section.note}
              </div>
              {section.jobs.map((job) => (
                <div
                  key={job.id}
                  className="pd-row"
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenReview(job.id)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') onOpenReview(job.id);
                  }}
                >
                  <input
                    type="checkbox"
                    checked={selected.has(job.id)}
                    onClick={(e) => e.stopPropagation()}
                    onChange={() => toggle(job.id)}
                    aria-label={`select ${job.title}`}
                  />
                  <span className={`pd-dot ${job.status}`} title={job.status} />
                  <span className="pd-title">{job.title}</span>
                  {parcelChips(job).map((chip) => (
                    <span key={chip} className="pd-chip">
                      {chip}
                    </span>
                  ))}
                  <span className="pd-meta">
                    {parcelAge(job, now)}
                    {job.meter?.costUsd !== undefined &&
                      ` · $${job.meter.costUsd.toFixed(2)}`}
                  </span>
                  <span className="pd-go">review</span>
                </div>
              ))}
            </div>
          ))}
          {refusal && <p className="pd-refusal">{refusal}</p>}
        </div>
        {order.length > 0 && (
          <div className="pd-foot">
            <button
              className={`pd-discard${armed ? ' armed' : ''}`}
              disabled={live.length === 0 || discarding !== null}
              onClick={() => void discardSelected()}
            >
              {discarding
                ? `discarding ${discarding.done}/${discarding.of}…`
                : armed
                  ? `sure? discard ${live.length}`
                  : `discard ${live.length} selected`}
            </button>
            <span className="dim pd-note">
              bulk is discard-only — approve acts, so it stays one at a time
            </span>
            <button className="pd-work" onClick={() => onOpenReview(order[0])}>
              ▶ work the pile
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
