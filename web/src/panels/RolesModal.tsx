import { useEffect, useState } from 'react';
import type { LibrarySearchResult, LibraryStatus, RoleInfo, SkillInfo } from '@agentlings/shared';
import { api, postJson } from '../api';
import { LibraryBrowse } from './LibraryBrowse';
import { LibraryResults } from './LibraryResults';

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
 */
export function RolesModal({
  onClose,
  initialQuery = '',
}: {
  onClose: () => void;
  initialQuery?: string;
}) {
  const [roles, setRoles] = useState<RoleInfo[]>([]);
  const [skills, setSkills] = useState<SkillInfo[]>([]);
  const [status, setStatus] = useState<LibraryStatus | null>(null);
  const [query, setQuery] = useState(initialQuery);
  const [result, setResult] = useState<LibrarySearchResult | null>(null);
  const [searching, setSearching] = useState(false);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [browsing, setBrowsing] = useState(false);
  const [advanced, setAdvanced] = useState(false);
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

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Library</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          <div className="sect">find something new</div>
          <input
            className="lib-search"
            placeholder="What do you need it to do?"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
          />

          <p className="lib-status">
            {status
              ? `${status.total} available from ${status.sources.filter((s) => s.ok).length}/${status.sources.length} sources · checked ${ago(status.fetchedAt)}`
              : 'checking sources…'}
            {' · '}
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

          <div className="sect">jobs your crew can hold · {roles.length}</div>
          {roles.map((r) => (
            <div key={r.name} className="role-row">
              <span className="badge queued">{r.name}</span>
              <span className="dim r-desc">{r.description}</span>
              <span className="r-meta">
                {r.tools.join(' · ') || 'no tools'}
                {r.skills.length > 0 && ` · abilities: ${r.skills.join(', ')}`}
              </span>
            </div>
          ))}
          <div className="sect">abilities · {skills.length}</div>
          {skills.map((s) => (
            <div key={s.name} className="role-row">
              <span className="chip skill">{s.name}</span>
              <span className="dim r-desc">{s.description}</span>
            </div>
          ))}

          <p className="lib-status">
            <button className="work-link" onClick={() => setAdvanced(!advanced)}>
              {advanced ? 'hide' : 'install from a link instead'}
            </button>
          </p>
          {advanced && (
            <>
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
            </>
          )}
        </div>
      </div>
    </div>
  );
}
