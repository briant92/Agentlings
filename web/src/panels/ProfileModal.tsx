import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentlingProfile, ConnectionInfo, RoleInfo, SkillInfo } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { renderPortrait } from '../world/sprites';
import { ChannelLogo } from './ChannelLogo';

/**
 * A lesson line as the close-out writes it: date, prose, and — since D-089 —
 * the job that taught it, stamped at the end. Older lessons have no stamp
 * and render without a tag rather than with a guessed one.
 */
const LESSON_RE = /^(\d{4})-(\d{2})-(\d{2}) · (.*?)(?: \(job: (.+)\))?$/;

function lessonParts(line: string): { date: string | null; text: string; job: string | null } {
  const match = LESSON_RE.exec(line);
  if (!match) return { date: null, text: line, job: null };
  return { date: `${match[2]}-${match[3]}`, text: match[4], job: match[5] ?? null };
}

const usd = (value: number): string => {
  const cents = Math.round(value * 100);
  return cents < 100 ? `${cents}¢` : `$${value.toFixed(2)}`;
};

/** How many lesson rows the card shows before "all lessons" (D-089). */
const LESSONS_SHOWN = 3;

/**
 * The worker's file, two tabs (D-089): Profile keeps who they are, a memory
 * that reads at a glance, and their record off the ledger; Abilities holds
 * what they may touch, what they know — with a way to hand the role a skill
 * — and what a job of theirs can reach.
 */
export function ProfileModal({
  levelId,
  agentlingId,
  onClose,
}: {
  levelId: string;
  agentlingId: string;
  onClose: () => void;
}) {
  const [profile, setProfile] = useState<AgentlingProfile | null>(null);
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [selectedRole, setSelectedRole] = useState('');
  const [tab, setTab] = useState<'profile' | 'abilities'>('profile');
  const [allLessons, setAllLessons] = useState(false);
  /** The installed skills catalog, for the hand-over picker. */
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [handing, setHanding] = useState<string | null>(null);
  const [handError, setHandError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const portraitRef = useRef<HTMLCanvasElement>(null);

  const refresh = useCallback(async () => {
    const data = await api<AgentlingProfile>(lvl(levelId, `/agentlings/${agentlingId}`));
    setProfile(data);
    setSelectedRole(data.agentling.role);
  }, [levelId, agentlingId]);

  useEffect(() => {
    void refresh();
    void api<RoleInfo[]>('/api/roles').then(setRoles);
    void api<SkillInfo[]>('/api/skills')
      .then(setSkills)
      .catch(() => setSkills([]));
    void api<ConnectionInfo[]>('/api/connections')
      .then(setConnections)
      .catch(() => setConnections([]));
  }, [refresh]);

  useEffect(() => {
    if (portraitRef.current) renderPortrait(portraitRef.current, 3, profile?.agentling.color);
  }, [profile === null, profile?.agentling.color, tab]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const assign = async () => {
    await api(lvl(levelId, `/agentlings/${agentlingId}/role`), postJson({ role: selectedRole }));
    await refresh();
  };

  const handOver = async (skill: string) => {
    if (!profile) return;
    setHanding(skill);
    setHandError(null);
    try {
      await api(`/api/roles/${profile.agentling.role}/skills`, postJson({ skill }));
      await refresh();
      void api<RoleInfo[]>('/api/roles').then(setRoles);
    } catch (err) {
      setHandError(err instanceof Error ? err.message : String(err));
    } finally {
      setHanding(null);
    }
  };

  if (!profile) return null;
  const { agentling, role, memory, record } = profile;
  // Newest first: the card is a record read backwards, unlike the session's
  // oldest-first brief.
  const newestFirst = [...memory].reverse();
  const lessons = allLessons ? newestFirst : newestFirst.slice(0, LESSONS_SHOWN);
  const offered = skills.filter((s) => !(role?.skills ?? []).includes(s.name));

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal profile" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <canvas ref={portraitRef} className="portrait" />
          <div className="p-id">
            <span className="p-name">
              {agentling.name} <span className="badge queued">{agentling.role}</span>
            </span>
            <span className="dim p-desc">{role?.description ?? 'No role definition found.'}</span>
          </div>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="p-tabs">
          <button
            className={tab === 'profile' ? 'p-tab on' : 'p-tab'}
            onClick={() => setTab('profile')}
          >
            Profile
          </button>
          <button
            className={tab === 'abilities' ? 'p-tab on' : 'p-tab'}
            onClick={() => setTab('abilities')}
          >
            Abilities
          </button>
        </div>
        <div className="m-body">
          {tab === 'profile' && (
            <>
              {agentling.jobDescription && (
                <>
                  <div className="sect">hired to</div>
                  <p className="hire-quote">“{agentling.jobDescription}”</p>
                </>
              )}
              <div className="sect">memory · {memory.length} lessons</div>
              {memory.length === 0 && <p className="dim">No lessons yet. Work builds memory.</p>}
              {lessons.map((line, i) => {
                const part = lessonParts(line);
                return (
                  <div key={i} className="p-lesson">
                    {part.date && <span className="p-l-date">{part.date}</span>}
                    <span className="p-l-sum">{part.text}</span>
                    {part.job && <span className="p-l-tag">↗ {part.job}</span>}
                  </div>
                );
              })}
              {memory.length > LESSONS_SHOWN && (
                <p className="p-l-more dim">
                  {allLessons ? `all ${memory.length} shown` : `${lessons.length} of ${memory.length} shown`}
                  {' · '}
                  <button className="work-link" onClick={() => setAllLessons((v) => !v)}>
                    {allLessons ? 'fewer' : 'all lessons'}
                  </button>
                </p>
              )}
              <div className="career">
                <span className="stat-done">{agentling.jobsDone} delivered</span>
                <span className="stat-failed">{agentling.jobsFailed} failed</span>
              </div>
              <div className="sect">record · from the ledger</div>
              {record.runs === 0 && (
                <p className="dim">No runs on the ledger yet — the record starts with the first.</p>
              )}
              {record.runs > 0 && (
                <div className="p-record">
                  <div className="p-r-cell">
                    <span className="p-r-big">
                      {record.done}{' '}
                      <span className="p-r-pct">
                        of {record.runs} · {Math.round((record.done / record.runs) * 100)}%
                      </span>
                    </span>
                    <span className="p-r-lab">runs landed</span>
                  </div>
                  <div className="p-r-cell">
                    <span className="p-r-big">
                      {record.avgPerDoneUsd === null ? '—' : usd(record.avgPerDoneUsd)}
                    </span>
                    <span className="p-r-lab">avg per landed run</span>
                    <span className="p-r-sub">failures priced in</span>
                  </div>
                  <div className="p-r-cell">
                    <span className="p-r-big">
                      {record.cheaper} <span className="p-r-pct">of {record.repeated}</span>
                    </span>
                    <span className="p-r-lab">repeated jobs got cheaper</span>
                  </div>
                  <div className="p-r-cell">
                    <span className="p-r-big">
                      {record.atCeiling} <span className="p-r-pct">of {record.pricedRuns}</span>
                    </span>
                    <span className="p-r-lab">hit the turn ceiling</span>
                  </div>
                  <div className="p-r-cell wide">
                    <span className={`p-light ${record.signal}`} />
                    <span className="p-r-line">
                      {record.ratio === null ? (
                        <>nothing quoted yet · {usd(record.costUsd)} lifetime</>
                      ) : (
                        <>
                          <b>{Math.round(record.ratio * 100)}% of quoted</b> actually spent ·{' '}
                          {usd(record.costUsd)} lifetime
                        </>
                      )}
                    </span>
                  </div>
                </div>
              )}
            </>
          )}
          {tab === 'abilities' && (
            <>
              <div className="sect">boundaries · tools</div>
              <div className="chips">
                {(role?.tools ?? []).map((t) => (
                  <span key={t} className="chip">
                    {t}
                  </span>
                ))}
                {(role?.tools ?? []).length === 0 && <span className="dim">none declared</span>}
              </div>
              <div className="sect">skills</div>
              <div className="chips">
                {(role?.skills ?? []).map((s) => (
                  <span key={s} className="chip skill">
                    {s}
                  </span>
                ))}
                <button className="chip chip-add" onClick={() => setPickerOpen((v) => !v)}>
                  {pickerOpen ? '− close' : '+ add a skill'}
                </button>
              </div>
              {pickerOpen && (
                <div className="p-picker">
                  {offered.length === 0 && (
                    <p className="dim p-p-note">
                      Every installed skill is already theirs — find more in the library.
                    </p>
                  )}
                  {offered.map((s) => (
                    <div key={s.name} className="p-p-row">
                      <span className="p-p-nm">{s.name}</span>
                      <span className="p-p-why dim">{s.description}</span>
                      <button
                        className="p-p-add"
                        disabled={handing !== null}
                        onClick={() => void handOver(s.name)}
                      >
                        {handing === s.name ? '…' : `hand to every ${agentling.role}`}
                      </button>
                    </div>
                  ))}
                  {handError && <p className="error">{handError}</p>}
                  <p className="dim p-p-note">
                    A skill rides every session's brief, so it costs a little on every job — and
                    methods learned without it step back to hints until they land again.
                  </p>
                </div>
              )}
              <div className="sect">reach · what a job of theirs may use</div>
              <div className="p-reach">
                {connections.map((c) => (
                  <div key={c.name} className="p-rc" title={c.description}>
                    <ChannelLogo channel={c.name} />
                    <span className="p-rc-nm">
                      {c.label}
                      {c.identity && <span className="dim p-rc-sub"> · {c.identity}</span>}
                    </span>
                    <span
                      className={!c.ready ? 'pill need' : c.enabled ? 'pill on' : 'pill off'}
                    >
                      {!c.ready ? 'needs set-up' : c.enabled ? 'on' : 'off'}
                    </span>
                  </div>
                ))}
              </div>
              <p className="dim p-reach-note">
                Reach is the level's, not {agentling.name}'s — every crew member here works with
                the same switches, flipped in Settings.
              </p>
            </>
          )}
        </div>
        <div className="m-foot p-foot">
          <span className="dim">role:</span>
          <select value={selectedRole} onChange={(e) => setSelectedRole(e.target.value)}>
            {roles.map((r) => (
              <option key={r.name} value={r.name}>
                {r.name}
              </option>
            ))}
          </select>
          <button disabled={selectedRole === agentling.role} onClick={() => void assign()}>
            Assign
          </button>
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
