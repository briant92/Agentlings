import { useEffect, useState } from 'react';
import type { LevelInfo, ThemeId } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { allLooks, renderThumbnail } from '../world/looks';

export interface LevelEntry {
  id: string;
  name: string;
  theme: ThemeId;
}



/** The world map: one card per level, each its own crew and context. */
export function SelectScreen({
  onEnter,
  onBack,
}: {
  onEnter: (level: LevelEntry) => void;
  onBack: () => void;
}) {
  const [levels, setLevels] = useState<LevelInfo[] | null>(null);
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    void api<LevelInfo[]>('/api/levels').then(setLevels);
  }, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !creating) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, creating]);

  return (
    <div className="select-screen">
      <div className="ss-head">
        <span className="ss-title">SELECT LEVEL</span>
        <span className="dim">esc title</span>
      </div>
      <div className="ss-grid">
        {(levels ?? []).map((l) => (
          <button
            key={l.id}
            className="lvl-card"
            onClick={() => onEnter({ id: l.id, name: l.name, theme: l.theme })}
          >
            <img className="lvl-thumb" src={renderThumbnail(l.theme)} alt="" />
            <span className="lvl-meta">
              <span className="lvl-name">{l.name}</span>
              <span className="lvl-proj">{l.project}</span>
            </span>
            <span className="lvl-crew">
              {l.colors.map((c, i) => (
                <span
                  key={i}
                  className="crew-dot"
                  style={{ background: `#${c.toString(16).padStart(6, '0')}` }}
                />
              ))}
              <span className="dim">
                {l.crew} crew · {l.jobsDone} done
                {l.jobsRunning > 0 ? ` · ${l.jobsRunning} running` : ''}
              </span>
            </span>
          </button>
        ))}
        <button className="lvl-card new" onClick={() => setCreating(true)}>
          <span className="lvl-new-plus">+ NEW LEVEL</span>
          <span className="dim">name it · pick a palette · fresh crew spawns</span>
        </button>
      </div>
      {creating && (
        <NewLevelModal
          levels={levels ?? []}
          onClose={() => setCreating(false)}
          onCreated={(level) => {
            setCreating(false);
            onEnter(level);
          }}
        />
      )}
    </div>
  );
}

function NewLevelModal({
  levels,
  onClose,
  onCreated,
}: {
  levels: LevelInfo[];
  onClose: () => void;
  onCreated: (level: LevelEntry) => void;
}) {
  const [name, setName] = useState('');
  const [project, setProject] = useState('');
  const [theme, setTheme] = useState<ThemeId>('cave');
  const [error, setError] = useState<string | null>(null);
  /** A world the crew author rather than one already on the palette (M4). */
  const [world, setWorld] = useState('');
  const [authoring, setAuthoring] = useState(false);
  const [authored, setAuthored] = useState<string | null>(null);
  // The crew doing the work. A pack is not owned by a level — it installs for
  // the whole app — but the job that writes it has to run somewhere, so it
  // runs in the first level and the copy says so rather than being coy.
  const host = levels[0];

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const authorWorld = async () => {
    if (!host) return;
    setError(null);
    setAuthoring(true);
    try {
      await api(lvl(host.id, '/author-pack'), postJson({ description: world }));
      setAuthored(world);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setAuthoring(false);
    }
  };

  const create = async () => {
    setError(null);
    try {
      const level = await api<LevelInfo>('/api/levels', postJson({ name, project, theme }));
      onCreated({ id: level.id, name: level.name, theme: level.theme });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">New level</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body nl-body">
          <input
            placeholder="Level name (e.g. Investment Banking)"
            value={name}
            onChange={(e) => setName(e.target.value)}
          />
          <input
            placeholder="Project tag (e.g. Finance)"
            value={project}
            onChange={(e) => setProject(e.target.value)}
          />
          <div className="sect">palette</div>
          <div className="nl-themes">
            {allLooks().map((look) => (
              <button
                key={look.id}
                className={`nl-theme${theme === look.id ? ' on' : ''}`}
                onClick={() => setTheme(look.id)}
              >
                <img src={renderThumbnail(look.id)} alt="" />
                <span>{look.label}</span>
              </button>
            ))}
          </div>
          {host && (
            <>
              <div className="sect">or have the crew author one</div>
              {authored ? (
                <p className="dim">
                  {host.name} is authoring it. It will appear on this palette once you approve
                  the delivery — nothing is installed until you do.
                </p>
              ) : (
                <div className="nl-author">
                  <input
                    placeholder="Describe a world (e.g. the between-decks of a whaling ship at night)"
                    value={world}
                    onChange={(e) => setWorld(e.target.value)}
                  />
                  <button
                    disabled={!world.trim() || authoring}
                    onClick={() => void authorWorld()}
                  >
                    {authoring ? 'queueing…' : 'Author it'}
                  </button>
                </div>
              )}
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="m-foot">
          <button disabled={!name.trim()} onClick={() => void create()}>
            Create level
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
