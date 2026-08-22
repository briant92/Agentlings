import { useCallback, useEffect, useRef, useState } from 'react';
import type { AgentlingProfile, ConnectionInfo, RoleInfo, SkillInfo } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { renderPortrait } from '../world/sprites';
import { ChannelLogo } from './ChannelLogo';
import { MoreRow, Section, usePaged } from './Section';

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
  const [pickFind, setPickFind] = useState('');
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

  // The picker's rows are paged, and a hook cannot follow the early return
  // below — so the offer is worked out from whatever profile there is.
  const held = profile?.role?.skills ?? [];
  const needle = pickFind.trim().toLowerCase();
  const offered = skills.filter(
    (s) =>
      !held.includes(s.name) &&
      (!needle ||
        s.name.toLowerCase().includes(needle) ||
        s.description.toLowerCase().includes(needle)),
  );
  const offer = usePaged(offered);

  if (!profile) return null;
  const { agentling, role, memory, record } = profile;
  // Newest first: the card is a record read backwards, unlike the session's
  // oldest-first brief.
  const newestFirst = [...memory].reverse();
  const lessons = allLessons ? newestFirst : newestFirst.slice(0, LESSONS_SHOWN);
  const doorsOn = connections.filter((c) => c.ready && c.enabled).length;
  const doorsNeed = connections.filter((c) => !c.ready).length;

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
                // Folded, with its first words in the header: the hire line
                // is read once and then in the way (UI.md, step 4).
                <Section
                  panel="profile"
                  id="hired"
                  label="hired to"
                  summary={`“${agentling.jobDescription}”`}
                >
                  <p className="hire-quote">“{agentling.jobDescription}”</p>
                </Section>
              )}
              <Section
                panel="profile"
                id="memory"
                label="memory"
                count={`${memory.length} ${memory.length === 1 ? 'lesson' : 'lessons'}`}
                defaultOpen
              >
                {memory.length === 0 && <p className="dim">No lessons yet. Work builds memory.</p>}
                {lessons.map((line, i) => {
                  const part = lessonParts(line);
                  return (
                    // Full width, the date and the run that taught it beneath
                    // — the text no longer wraps in a column beside a tag.
                    <div key={i} className="lesson">
                      <p className="lesson-text">{part.text}</p>
                      {(part.date || part.job) && (
                        <div className="lesson-sub">
                          {part.date && <span className="p-l-date">{part.date}</span>}
                          {part.job && (
                            <span className="lesson-src" title={part.job}>
                              ↗ {part.job}
                            </span>
                          )}
                        </div>
                      )}
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
              </Section>
              <Section panel="profile" id="record" label="record" count="from the ledger" defaultOpen>
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
                      {/* Relabelled to what it measures (UI.md, step 4): runs
                          that spent at least 99.5% of their quote. The turn
                          ceiling is a different fact — read off outOfTurns,
                          never off turns over the cap (D-212) — and gets its
                          own tile once the ledger row carries it. */}
                      <span className="p-r-lab">spent the whole quote</span>
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
              </Section>
            </>
          )}
          {tab === 'abilities' && (
            <>
              <Section
                panel="abilities"
                id="tools"
                label="boundaries · tools"
                count={(role?.tools ?? []).length}
                defaultOpen
              >
                <div className="chips">
                  {(role?.tools ?? []).map((t) => (
                    <span key={t} className="chip">
                      {t}
                    </span>
                  ))}
                  {(role?.tools ?? []).length === 0 && <span className="dim">none declared</span>}
                </div>
              </Section>
              <Section
                panel="abilities"
                id="skills"
                label="skills"
                count={`${(role?.skills ?? []).length} · every ${agentling.role}'s`}
                defaultOpen
              >
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
                  // The cost first, then a find box, then one row per skill
                  // with one button (UI.md, step 4) — not fourteen identical
                  // "hand to every drafter" buttons, ten rows then more.
                  <div className="p-picker">
                    <p className="p-p-note">
                      A skill handed here goes to every {agentling.role}. It rides every
                      session&apos;s brief, so it costs a little on every job — and methods learned
                      without it step back to hints until they land again.
                    </p>
                    {skills.length > held.length && (
                      <input
                        className="pick-find"
                        placeholder="find a skill…"
                        aria-label="Find a skill to hand over"
                        value={pickFind}
                        onChange={(e) => setPickFind(e.target.value)}
                      />
                    )}
                    {offered.length === 0 && (
                      <p className="dim p-p-note">
                        {needle
                          ? 'Nothing installed matches that — find more in the library.'
                          : 'Every installed skill is already theirs — find more in the library.'}
                      </p>
                    )}
                    {offer.rows.map((s) => (
                      <div key={s.name} className="pick-row">
                        <span className="pick-nm">{s.name}</span>
                        <button
                          className="pick-add"
                          disabled={handing !== null}
                          onClick={() => void handOver(s.name)}
                        >
                          {handing === s.name ? '…' : '+ hand over'}
                        </button>
                        <span className="pick-why">{s.description}</span>
                      </div>
                    ))}
                    <MoreRow hidden={offer.hidden} what="skills" onShow={offer.showAll} />
                    {handError && <p className="error">{handError}</p>}
                  </div>
                )}
              </Section>
              <Section
                panel="abilities"
                id="reach"
                label="reach"
                count={`${doorsOn} of ${connections.length} doors on`}
                summary={doorsNeed > 0 ? `${doorsNeed} need set-up · set in Settings` : 'set in Settings'}
              >
                {/* Folded to its header (UI.md, step 4): these are the level's
                    switches, not this worker's, so the cards become chips and
                    the switches stay where they are flipped. */}
                <div className="reach-chips">
                  {connections.map((c) => (
                    <span
                      key={c.name}
                      className={`mini${c.ready && c.enabled ? '' : ' dimmed'}`}
                      title={c.description}
                    >
                      <ChannelLogo channel={c.name} />
                      {c.label}
                      {!c.ready ? ' · needs set-up' : c.enabled ? '' : ' · off'}
                    </span>
                  ))}
                </div>
                <p className="dim p-reach-note">
                  Reach is the level&apos;s, not {agentling.name}&apos;s — every crew member here
                  works with the same switches, flipped in Settings.
                </p>
              </Section>
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
