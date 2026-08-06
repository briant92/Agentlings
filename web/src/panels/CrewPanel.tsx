import { useCallback, useEffect, useState } from 'react';
import type {
  CrewMember,
  Job,
  LevelProductivity,
  MergePreview,
  MergeProposal,
  SendApprovalInfo,
} from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { Backoffice } from './Backoffice';

const DAY = 24 * 60 * 60 * 1000;
/** After this long without finishing anything, resting is worth suggesting. */
const QUIET_DAYS = 7;

function quietFor(member: CrewMember): number | null {
  const since = member.lastWorkedAt ?? member.hiredAt;
  if (!since) return null;
  const days = Math.floor((Date.now() - since) / DAY);
  return days >= QUIET_DAYS ? days : null;
}

function record(member: CrewMember): string {
  const failed = member.jobsFailed > 0 ? ` · ${member.jobsFailed} failed` : '';
  const lessons = member.lessons > 0 ? ` · ${member.lessons} lessons` : '';
  return `${member.jobsDone} done${failed}${lessons}`;
}

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}

/** Dismissed proposals live in the browser — a hint, not saved state. */
function dismissKey(levelId: string): string {
  return `agentlings:merge-dismissed:${levelId}`;
}
function pairKey(a: string, b: string): string {
  return [a, b].sort().join('|');
}
function readDismissed(levelId: string): string[] {
  try {
    return JSON.parse(localStorage.getItem(dismissKey(levelId)) ?? '[]') as string[];
  } catch {
    return [];
  }
}

interface Pair {
  keep: CrewMember;
  absorb: CrewMember;
}

/**
 * The crew, through the doorway: who is working, who is resting, who looks
 * redundant, and the two ways someone leaves. Merging and resting keep what
 * was learnt; letting go does not, and the confirmation says so.
 */
export function CrewPanel({
  levelId,
  jobs,
  productivity,
  onOpenReview,
  onClose,
}: {
  levelId: string;
  /** The level's whole job list — the crew's work record lives in it. */
  jobs: Job[];
  /** Lifetime spend, from the ledger; the queue above cannot answer it. */
  productivity: LevelProductivity | null;
  onOpenReview: (jobId: string) => void;
  onClose: () => void;
}) {
  const [tab, setTab] = useState<'crew' | 'backoffice'>('crew');
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [proposals, setProposals] = useState<MergeProposal[]>([]);
  const [dismissed, setDismissed] = useState<string[]>(() => readDismissed(levelId));
  const [confirming, setConfirming] = useState<CrewMember | null>(null);
  const [picking, setPicking] = useState<CrewMember | null>(null);
  const [merging, setMerging] = useState<Pair | null>(null);
  const [preview, setPreview] = useState<MergePreview | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** Jobs allowed to send without review, and the ones one offer away (D-082). */
  const [approvals, setApprovals] = useState<SendApprovalInfo[]>([]);

  const refresh = useCallback(async () => {
    setCrew(await api<CrewMember[]>(lvl(levelId, '/crew')));
    setProposals(await api<MergeProposal[]>(lvl(levelId, '/merge/proposals')));
    setApprovals(await api<SendApprovalInfo[]>(lvl(levelId, '/approvals')).catch(() => []));
  }, [levelId]);

  const setAutoSend = async (key: string, auto: boolean) => {
    try {
      await api(lvl(levelId, '/approvals'), postJson({ key, auto }));
      setApprovals(await api<SendApprovalInfo[]>(lvl(levelId, '/approvals')));
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (merging) setMerging(null);
      else if (picking) setPicking(null);
      else if (confirming) setConfirming(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirming, picking, merging]);

  // Whenever the pair changes, ask the server exactly what it would leave.
  useEffect(() => {
    if (!merging) {
      setPreview(null);
      return;
    }
    setPreview(null);
    void api<MergePreview>(
      lvl(levelId, '/merge/preview'),
      postJson({ keep: merging.keep.id, absorb: merging.absorb.id }),
    )
      .then(setPreview)
      .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
  }, [merging, levelId]);

  const act = async (member: CrewMember, path: string, method = 'POST') => {
    setBusy(member.id);
    setError(null);
    try {
      await api(lvl(levelId, `/agentlings/${member.id}${path}`), { method });
      await refresh();
      setConfirming(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const doMerge = async () => {
    if (!merging) return;
    setBusy(merging.keep.id);
    setError(null);
    try {
      const done = await api<{ keep: string; absorbed: string }>(
        lvl(levelId, '/merge'),
        postJson({ keep: merging.keep.id, absorb: merging.absorb.id }),
      );
      setNote(`${done.absorbed} folded into ${done.keep}. Nothing was lost.`);
      setMerging(null);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(null);
    }
  };

  const dismiss = (proposal: MergeProposal) => {
    const next = [...dismissed, pairKey(proposal.keep, proposal.absorb)];
    setDismissed(next);
    localStorage.setItem(dismissKey(levelId), JSON.stringify(next));
  };

  const onCrew = tab === 'crew';
  const byId = (id: string) => (crew ?? []).find((m) => m.id === id);
  const working = (crew ?? []).filter((m) => !m.resting);
  const resting = (crew ?? []).filter((m) => m.resting);
  const quiet = working.filter((m) => quietFor(m) !== null && m.jobsDone === 0);
  const live = proposals.filter((p) => !dismissed.includes(pairKey(p.keep, p.absorb)));

  const row = (member: CrewMember, asleep: boolean) => (
    <div key={member.id} className={`crew-row${asleep ? ' asleep' : ''}`}>
      <span className="crew-dot" style={{ background: hex(member.color) }} />
      <span className="crew-name">{member.name}</span>
      <span className={`badge ${member.busy ? 'running' : asleep ? 'discarded' : 'queued'}`}>
        {member.busy ? 'working now' : member.role}
      </span>
      <span className="dim crew-record">{record(member)}</span>
      {member.busy ? (
        <span className="dim crew-blocked">busy — finish first</span>
      ) : (
        <span className="crew-actions">
          <button
            className="work-link"
            disabled={busy === member.id}
            onClick={() => void act(member, asleep ? '/wake' : '/rest')}
          >
            {asleep ? 'bring back' : 'rest'}
          </button>
          <button className="work-link" onClick={() => setPicking(member)}>
            merge
          </button>
          <button className="work-link danger" onClick={() => setConfirming(member)}>
            let go
          </button>
        </span>
      )}
    </div>
  );

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal crew" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Crew</span>
          <span className="t-filters crew-tabs">
            <button className={tab === 'crew' ? 'on' : ''} onClick={() => setTab('crew')}>
              crew
            </button>
            <button
              className={tab === 'backoffice' ? 'on' : ''}
              onClick={() => setTab('backoffice')}
            >
              backoffice
            </button>
          </span>
          {crew && tab === 'crew' && (
            <span className="dim crew-count">
              {working.length} working · {resting.length} resting
            </span>
          )}
          <button onClick={onClose}>✕</button>
        </div>

        <div className="m-body">
          {tab === 'backoffice' && approvals.length > 0 && (
            <div className="bo-standing">
              <div className="sect">standing approvals — jobs allowed to send without review</div>
              {approvals.map((a) => (
                <div key={a.key} className="bo-standing-row">
                  <span className="bo-standing-what">
                    {a.channel} → {a.recipients.join(', ')}
                    {a.template ? ` · template ${a.template}` : ''}
                  </span>
                  {a.auto ? (
                    <>
                      <span className="bo-standing-on">auto-send on</span>
                      <button className="work-link" onClick={() => void setAutoSend(a.key, false)}>
                        turn it off
                      </button>
                    </>
                  ) : (
                    <span className="dim">
                      {a.approvals} of 3 unchanged approvals
                      {a.eligible ? ' — the offer waits at the next review' : ''}
                    </span>
                  )}
                </div>
              ))}
              <p className="dim bo-standing-note">
                Any new recipient, template or channel drops a job back to review on its own.
              </p>
            </div>
          )}
          {tab === 'backoffice' && (
            <Backoffice
              levelId={levelId}
              jobs={jobs}
              crew={crew ?? []}
              productivity={productivity}
              onOpenReview={(jobId) => {
                // One overlay at a time: the review takes the screen rather
                // than stacking a second backdrop over this one.
                onClose();
                onOpenReview(jobId);
              }}
            />
          )}

          {tab === 'crew' && crew === null && <p className="dim">Loading…</p>}

          {onCrew &&
            !merging &&
            !picking &&
            live.map((proposal) => {
              const keep = byId(proposal.keep);
              const absorb = byId(proposal.absorb);
              if (!keep || !absorb) return null;
              return (
                <div key={pairKey(proposal.keep, proposal.absorb)} className="crew-hint">
                  <p className="crew-hint-title">
                    {keep.name} and {absorb.name} look like the same hire
                  </p>
                  <p className="dim">{proposal.reasons.join(' · ')}</p>
                  <div className="actions">
                    <button onClick={() => setMerging({ keep, absorb })}>Review merge</button>
                    <button className="ghost" onClick={() => dismiss(proposal)}>
                      Not the same, ignore
                    </button>
                  </div>
                </div>
              );
            })}

          {onCrew && picking && (
            <div className="crew-hint">
              <p className="crew-hint-title">Merge {picking.name} with…</p>
              <p className="dim">
                {picking.name} is kept; the one you pick is folded in. You can swap that next.
              </p>
              <div className="crew-pick">
                {(crew ?? [])
                  .filter((m) => m.id !== picking.id && !m.busy)
                  .map((m) => (
                    <button
                      key={m.id}
                      className="hire-option"
                      onClick={() => {
                        setMerging({ keep: picking, absorb: m });
                        setPicking(null);
                      }}
                    >
                      <span className="badge queued">{m.name}</span>
                      <span className="dim r-desc">
                        {m.role} · {record(m)}
                      </span>
                    </button>
                  ))}
              </div>
              <div className="actions">
                <button className="ghost" onClick={() => setPicking(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}

          {onCrew && merging && (
            <div className="crew-merge">
              <p className="crew-hint-title">
                Merge {merging.absorb.name} into {merging.keep.name}
              </p>
              {preview === null && <p className="dim">Working out what that leaves…</p>}
              {preview && (
                <>
                  <div className="crew-merge-pair">
                    <div className="crew-merge-card keeps">
                      <p className="crew-merge-name">{preview.keep.name} stays</p>
                      <p className="dim">
                        {preview.keep.role} · {record(preview.keep)}
                      </p>
                    </div>
                    <div className="crew-merge-card">
                      <p className="crew-merge-name">{preview.absorb.name} folds in</p>
                      <p className="dim">
                        {preview.absorb.role} · {record(preview.absorb)}
                      </p>
                    </div>
                  </div>
                  <div className="sect">afterwards {preview.keep.name} has</div>
                  <ul className="lessons">
                    <li>
                      {preview.jobsDone} delivered, {preview.jobsFailed} failed — both records
                      added up
                    </li>
                    <li>{preview.lessons} lessons, oldest first, duplicates dropped</li>
                    <li>both hire descriptions, kept as written</li>
                    <li>the same job and abilities — {preview.keep.role}, unchanged</li>
                  </ul>
                  {preview.differentRoles && (
                    <p className="lib-warn">
                      ⚠ They do different jobs. {preview.absorb.name} is a {preview.absorb.role}, and
                      that job is not carried over.
                    </p>
                  )}
                  <p className="dim crew-merge-foot">
                    {preview.absorb.name}&apos;s own file is archived, not deleted. One fewer
                    agentling on screen.
                  </p>
                  <div className="actions">
                    <button disabled={busy !== null} onClick={() => void doMerge()}>
                      Merge them
                    </button>
                    <button
                      className="ghost"
                      onClick={() => setMerging({ keep: merging.absorb, absorb: merging.keep })}
                    >
                      Keep {merging.absorb.name} instead
                    </button>
                    <button className="ghost" onClick={() => setMerging(null)}>
                      Cancel
                    </button>
                  </div>
                </>
              )}
            </div>
          )}

          {onCrew && !merging && !picking && (
            <>
              {quiet.map((member) => (
                <div key={member.id} className="crew-hint">
                  <p className="crew-hint-title">{member.name} has not finished anything yet</p>
                  <p className="dim">
                    Hired {quietFor(member)} days ago. Resting frees up the world and keeps
                    everything they know.
                  </p>
                  <div className="actions">
                    <button className="ghost" onClick={() => void act(member, '/rest')}>
                      Send {member.name} to rest
                    </button>
                  </div>
                </div>
              ))}

              {working.length > 0 && <div className="sect">working</div>}
              {working.map((member) => row(member, false))}

              {resting.length > 0 && <div className="sect">resting · nothing lost</div>}
              {resting.map((member) => row(member, true))}

              {crew?.length === 0 && (
                <p className="dim">Nobody works here yet. Hire someone to get started.</p>
              )}
            </>
          )}

          {onCrew && note && <p className="stat-done">{note}</p>}
          {onCrew && error && <p className="error">{error}</p>}

          {onCrew && confirming && (
            <div className="crew-confirm">
              <p className="crew-confirm-title">Let {confirming.name} go?</p>
              <p className="dim">
                {confirming.jobsDone} jobs delivered and {confirming.lessons} lessons go with them.
                Someone hired later starts from nothing.
              </p>
              <p className="dim">
                If it is the work that is wrong rather than them, resting or merging keeps what
                they learnt.
              </p>
              <div className="actions">
                <button
                  className="danger"
                  disabled={busy === confirming.id}
                  onClick={() => void act(confirming, '', 'DELETE')}
                >
                  Let go
                </button>
                {!confirming.resting && (
                  <button className="ghost" onClick={() => void act(confirming, '/rest')}>
                    Send to rest instead
                  </button>
                )}
                <button className="ghost" onClick={() => setConfirming(null)}>
                  Cancel
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
