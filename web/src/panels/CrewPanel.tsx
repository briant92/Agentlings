import { useCallback, useEffect, useState } from 'react';
import type { CrewMember } from '@agentlings/shared';
import { api, lvl } from '../api';

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
  const done = `${member.jobsDone} done`;
  const failed = member.jobsFailed > 0 ? ` · ${member.jobsFailed} failed` : '';
  const lessons = member.lessons > 0 ? ` · ${member.lessons} lessons` : '';
  return done + failed + lessons;
}

/**
 * The crew, through the doorway: who is working, who is resting, and the two
 * ways someone leaves. Resting keeps everything; letting go does not, and the
 * confirmation says so rather than softening it.
 */
export function CrewPanel({ levelId, onClose }: { levelId: string; onClose: () => void }) {
  const [crew, setCrew] = useState<CrewMember[] | null>(null);
  const [confirming, setConfirming] = useState<CrewMember | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const refresh = useCallback(async () => {
    setCrew(await api<CrewMember[]>(lvl(levelId, '/crew')));
  }, [levelId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      if (confirming) setConfirming(null);
      else onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose, confirming]);

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

  const working = (crew ?? []).filter((m) => !m.resting);
  const resting = (crew ?? []).filter((m) => m.resting);
  const quiet = working.filter((m) => quietFor(m) !== null && m.jobsDone === 0);

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal crew" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Crew</span>
          {crew && (
            <span className="dim crew-count">
              {working.length} working · {resting.length} resting
            </span>
          )}
          <button onClick={onClose}>✕</button>
        </div>

        <div className="m-body">
          {crew === null && <p className="dim">Loading…</p>}

          {quiet.map((member) => (
            <div key={member.id} className="crew-hint">
              <p className="crew-hint-title">{member.name} has not finished anything yet</p>
              <p className="dim">
                Hired {quietFor(member)} days ago. Resting frees up the world and keeps everything
                they know.
              </p>
              <button className="ghost" onClick={() => void act(member, '/rest')}>
                Send {member.name} to rest
              </button>
            </div>
          ))}

          {crew && working.length > 0 && <div className="sect">working</div>}
          {working.map((member) => (
            <div key={member.id} className="crew-row">
              <span className="crew-dot" style={{ background: hex(member.color) }} />
              <span className="crew-name">{member.name}</span>
              <span className={`badge ${member.busy ? 'running' : 'queued'}`}>
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
                    onClick={() => void act(member, '/rest')}
                  >
                    rest
                  </button>
                  <button className="work-link danger" onClick={() => setConfirming(member)}>
                    let go
                  </button>
                </span>
              )}
            </div>
          ))}

          {resting.length > 0 && <div className="sect">resting · nothing lost</div>}
          {resting.map((member) => (
            <div key={member.id} className="crew-row asleep">
              <span className="crew-dot" style={{ background: hex(member.color) }} />
              <span className="crew-name">{member.name}</span>
              <span className="badge discarded">{member.role}</span>
              <span className="dim crew-record">{record(member)}</span>
              <span className="crew-actions">
                <button
                  className="work-link"
                  disabled={busy === member.id}
                  onClick={() => void act(member, '/wake')}
                >
                  bring back
                </button>
                <button className="work-link danger" onClick={() => setConfirming(member)}>
                  let go
                </button>
              </span>
            </div>
          ))}

          {crew?.length === 0 && (
            <p className="dim">Nobody works here yet. Hire someone to get started.</p>
          )}
          {error && <p className="error">{error}</p>}

          {confirming && (
            <div className="crew-confirm">
              <p className="crew-confirm-title">Let {confirming.name} go?</p>
              <p className="dim">
                {confirming.jobsDone} jobs delivered and {confirming.lessons} lessons go with them.
                Someone hired later starts from nothing.
              </p>
              <p className="dim">
                If it is the work that is wrong rather than them, resting keeps what they learnt.
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

function hex(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
