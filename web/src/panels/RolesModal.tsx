import { type MouseEvent, useEffect, useState } from 'react';
import type {
  CrewMember,
  LibrarySearchResult,
  LibraryStatus,
  RoleInfo,
  SkillInfo,
} from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { abilitySummary, abilityUse, heldBy, heldSummary, leash } from './library';
import { LibraryBrowse } from './LibraryBrowse';
import { LibraryResults } from './LibraryResults';
import { ExpandRow, Section } from './Section';

const DEBOUNCE_MS = 300;

function ago(at: number): string {
  if (!at) return 'never';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

/**
 * The library: what this crew can already do, and how to find more. Search is
 * plain language; nothing installs until the user has had the chance to read
 * it, and everything installed is pinned to the commit it was read at.
 *
 * Opened from a level it also says who holds each job there (UI.md, step 5),
 * because a role nobody holds does nothing; opened from the title screen or
 * Settings there is no level in scope, and that column is simply absent.
 */
export function RolesModal({
  onClose,
  initialQuery = '',
  levelId,
  levelName,
  onHire,
}: {
  onClose: () => void;
  initialQuery?: string;
  /** The level the Library was opened from, when one is in scope. */
  levelId?: string;
  levelName?: string;
  /** Starts the level's hire flow; the Library closes first. */
  onHire?: () => void;
}) {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [crew, setCrew] = useState<CrewMember[]>([]);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<LibrarySearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [url, setUrl] = useState('');
  const [kind, setKind] = useState<'role' | 'skill'>('role');

  const refresh = async () => {
    setRoles(await api<RoleInfo[]>('/api/roles'));
    setSkills(await api<SkillInfo[]>('/api/skills'));
  };

  useEffect(() => {
    void refresh();
    void api<LibraryStatus>('/api/library').then(setStatus);
  }, []);

  // The same roster the crew panel reads; resting members still hold a role.
  useEffect(() => {
    if (!levelId) return;
    void api<CrewMember[]>(lvl(levelId, '/crew'))
      .then(setCrew)
      .catch(() => setCrew([]));
  }, [levelId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  useEffect(() => {
    const text = query.trim();
    if (!text) {
      setResult(null);
      return;
    }
    setSearching(true);
    const timer = window.setTimeout(() => {
      void api<LibrarySearchResult>('/api/library/search', postJson({ text }))
        .then(setResult)
        .catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)))
        .finally(() => setSearching(false));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [query]);

  const resync = async () => {
    setBusy(true);
    try {
      setStatus(await api<LibraryStatus>('/api/library/refresh', { method: 'POST' }));
    } finally {
      setBusy(false);
    }
  };

  const installFromUrl = async () => {
    setError(null);
    setNote(null);
    try {
      const done = await api<{ kind: string; name: string }>(
        '/api/templates/install',
        postJson({ url, kind }),
      );
      setNote(`Added ${done.name}.`);
      setUrl('');
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const held = heldBy(crew);
  const use = abilityUse(roles, skills);
  const hire = (e: MouseEvent) => {
    e.stopPropagation();
    onClose();
    onHire?.();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Library</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          <Section
            panel="library"
            id="find"
            label="find something new"
            summary={
              status
                ? `${status.total} available · ${status.sources.filter((s) => s.ok).length}/${status.sources.length} sources · checked ${ago(status.fetchedAt)}`
                : 'checking sources…'
            }
            defaultOpen
          >
            <input
              className="lib-search"
              placeholder="What do you need it to do?"
              value={query}
              onChange={(e) => setQuery(e.target.value)}
            />

            <p className="lib-status">
              <button className="work-link" disabled={busy} onClick={() => void resync()}>
                {busy ? 'checking…' : 'check again'}
              </button>
              {' · '}
              <button className="work-link" onClick={() => setBrowsing(!browsing)}>
                {browsing ? 'hide' : 'browse all'}
              </button>
            </p>
            {status?.sources
              .filter((s) => !s.ok)
              .map((s) => (
                <p key={s.name} className="lib-warn">
                  {s.repo}: {s.error}
                </p>
              ))}
            {status?.sources
              .filter((s) => s.truncated)
              .map((s) => (
                <p key={s.name} className="lib-warn">
                  {s.repo}: showing the first {s.count}, {s.truncated} more not indexed
                </p>
              ))}

            {/* A query takes the screen: browsing is a mode you leave rather than
                a filter fighting the search box. Hidden rather than unmounted,
                so clearing the query returns to the category you had open —
                unmounting reset it, which made "browse all" a thing you had to
                start over every time you tried a search.
                Letting the two combine instead would make the browse filters a
                second, quieter search engine, where a forgotten category reads
                as "the library has nothing like that". */}
            {browsing && (
              <LibraryBrowse
                hidden={query.trim() !== ''}
                onInstalled={(name) => {
                  setNote(`Added ${name}. Any agentling can use it now.`);
                  void refresh();
                }}
              />
            )}

            {searching && <p className="dim">searching…</p>}
            {result?.hits.length === 0 && (
              <p className="dim">
                Nothing in the sources matches that
                {result.gaps.length > 0 ? ` — no source covers: ${result.gaps.join(' · ')}` : ''}.
              </p>
            )}
            {result && (
              <LibraryResults
                hits={result.hits}
                onInstalled={(name) => {
                  setNote(`Added ${name}. Any agentling can use it now.`);
                  void refresh();
                }}
              />
            )}

            {note && <p className="stat-done">{note}</p>}
            {error && <p className="error">{error}</p>}
          </Section>

          <Section
            panel="library"
            id="jobs"
            label="jobs your crew can hold"
            count={roles.length}
            summary={levelId && levelName ? heldSummary(roles, held, levelName) : undefined}
            defaultOpen
          >
            {roles.map((r) => {
              const names = held.get(r.name) ?? [];
              const strap = leash(r);
              return (
                // One line per job — badge, description, who holds it — that
                // opens to the chips and the leash the role file sets.
                <ExpandRow
                  key={r.name}
                  head={
                    <>
                      <span className="badge queued">{r.name}</span>
                      <span className="nm">
                        <span className="d">{r.description}</span>
                      </span>
                      {levelId &&
                        (names.length > 0 ? (
                          <span className="fact">
                            held by{' '}
                            {names.map((name, i) => (
                              <b key={name}>
                                {i > 0 ? ', ' : ''}
                                {name}
                              </b>
                            ))}
                          </span>
                        ) : (
                          <span className="fact warn">
                            nobody
                            {onHire && (
                              <>
                                {' · '}
                                <button className="work-link" onClick={hire}>
                                  hire one
                                </button>
                              </>
                            )}
                          </span>
                        ))}
                    </>
                  }
                >
                  <p>{r.description}</p>
                  <div className="chips">
                    {r.tools.map((t) => (
                      <span key={t} className="chip">
                        {t}
                      </span>
                    ))}
                    {r.skills.map((s) => (
                      <span key={s} className="chip skill">
                        {s}
                      </span>
                    ))}
                    {r.tools.length === 0 && r.skills.length === 0 && (
                      <span className="dim">no tools, no abilities</span>
                    )}
                  </div>
                  {(strap || (levelId && names.length > 0)) && (
                    <p className="role-foot">
                      {strap && (
                        <>
                          <span className="dim">leash</span> {strap}
                        </>
                      )}
                      {levelId && names.length > 0 && (
                        <>
                          {strap ? ' · ' : ''}
                          <span className="dim">held by</span> {names.join(', ')}
                          {onHire && (
                            <>
                              {' · '}
                              <button className="work-link" onClick={hire}>
                                hire another
                              </button>
                            </>
                          )}
                        </>
                      )}
                    </p>
                  )}
                </ExpandRow>
              );
            })}
          </Section>

          <Section
            panel="library"
            id="abilities"
            label="abilities"
            count={skills.length}
            summary={abilitySummary(use)}
          >
            {/* Each ability with the jobs that list it: an ability reaches a
                run only through a job, so "no job" is the row's whole point. */}
            {use.map((u) => {
              const skill = skills.find((s) => s.name === u.name);
              return (
                <div key={u.name} className="abil-row">
                  <span className="chip skill">{u.name}</span>
                  <span className="desc" title={skill?.description}>
                    {skill?.description}
                  </span>
                  <span className={`n${u.jobs === 0 ? ' zero' : ''}`}>
                    {u.jobs === 0 ? 'no job' : `${u.jobs} ${u.jobs === 1 ? 'job' : 'jobs'}`}
                  </span>
                </div>
              );
            })}
          </Section>

          <Section
            panel="library"
            id="install"
            label="install from a link"
            summary="a Claude subagent .md or a SKILL.md on GitHub"
          >
            <p className="dim install-hint">
              A Claude subagent .md or a SKILL.md on GitHub — blob links are converted to raw
              automatically. Links are not pinned to a commit the way library installs are.
            </p>
            <div className="install-row">
              <select value={kind} onChange={(e) => setKind(e.target.value as 'role' | 'skill')}>
                <option value="role">job</option>
                <option value="skill">ability</option>
              </select>
              <input
                placeholder="https://github.com/user/repo/blob/main/agents/reviewer.md"
                value={url}
                onChange={(e) => setUrl(e.target.value)}
              />
              <button disabled={!url.trim()} onClick={() => void installFromUrl()}>
                Install
              </button>
            </div>
          </Section>
        </div>
      </div>
    </div>
  );
}
