import { useEffect, useState } from 'react';
import type { LevelInfo, Quote, ThemeId, WorkPlan } from '@agentlings/shared';
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

/**
 * A file as base64, in chunks.
 *
 * `String.fromCharCode(...bytes)` spreads one argument per byte, so a picture
 * of any real size overflows the call stack — the reference that prompted all
 * this is 1.5 MB, which is 1.5 million arguments. 32KB at a time is well
 * inside every engine's limit.
 */
async function base64Of(file: File): Promise<string> {
  const bytes = new Uint8Array(await file.arrayBuffer());
  const CHUNK = 0x8000;
  let binary = '';
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
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
  /** How the world is meant to look, and the picture behind it (D-113). */
  const [kind, setKind] = useState<'pixel' | 'pre-rendered'>('pixel');
  const [reference, setReference] = useState<File | null>(null);
  const [authored, setAuthored] = useState<string | null>(null);
  const [quote, setQuote] = useState<Quote | null>(null);
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

  /**
   * The quote, before anything is queued.
   *
   * The desk plans a sentence and shows what it will cost before Start exists;
   * this button skipped straight to queueing, which is a worse promise than
   * every other way into the engine makes. Planned unsplit, because that is
   * how the route queues it.
   */
  useEffect(() => {
    const text = world.trim();
    if (!host || !text) {
      setQuote(null);
      return;
    }
    let alive = true;
    const timer = window.setTimeout(() => {
      void api<WorkPlan>(
        lvl(host.id, '/work/plan'),
        // `authoring` so the price shown is the designer's, matching what the
        // button will queue — the desk names the kind of job, never the role.
        postJson({ text: `Author a level pack: ${text}`, single: true, authoring: true }),
      )
        .then((plan) => alive && setQuote(plan.quote ?? null))
        // A quote that will not load must not block authoring; the button
        // simply stops claiming a price it does not have.
        .catch(() => alive && setQuote(null));
    }, 350);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [host, world]);

  const authorWorld = async () => {
    if (!host) return;
    setError(null);
    setAuthoring(true);
    try {
      // Read here rather than in the route: the server takes base64 like every
      // other attachment, and the browser is where a File becomes bytes.
      const picture =
        kind === 'pre-rendered' && reference
          ? { name: reference.name, data: await base64Of(reference) }
          : undefined;
      await api(
        lvl(host.id, '/author-pack'),
        postJson({ description: world, ...(picture ? { reference: picture } : {}) }),
      );
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
                  {/*
                    The two ways a world of this kind has ever been made: drawn
                    by hand, or rendered and then reduced. Pre-rendered asks for
                    the picture, because the crew works from it — it does not
                    become the backdrop, which the ops format cannot carry
                    (D-108, D-113).
                  */}
                  <div className="nl-kind">
                    {(['pixel', 'pre-rendered'] as const).map((k) => (
                      <button
                        key={k}
                        className={`nl-kind-pick${kind === k ? ' on' : ''}`}
                        onClick={() => setKind(k)}
                      >
                        {k === 'pixel' ? 'Pixel' : 'Pre-rendered'}
                      </button>
                    ))}
                  </div>
                  {kind === 'pre-rendered' && (
                    <label className="nl-ref">
                      <input
                        type="file"
                        accept="image/png,image/jpeg,image/webp"
                        onChange={(e) => setReference(e.target.files?.[0] ?? null)}
                      />
                      <span className="dim">
                        {reference
                          ? `${reference.name} — ${host.name} will look at it and compose a world from it, not copy it.`
                          : 'Pick a picture to work from. It is a reference, not the backdrop.'}
                      </span>
                    </label>
                  )}
                  <button
                    disabled={!world.trim() || authoring || (kind === 'pre-rendered' && !reference)}
                    onClick={() => void authorWorld()}
                  >
                    {authoring
                      ? 'queueing…'
                      : quote
                        ? `Author it — up to $${quote.ceilingUsd.toFixed(2)}`
                        : 'Author it'}
                  </button>
                </div>
              )}
              {!authored && quote && (
                <p className="dim">
                  {host.name} will run one session, capped at ${quote.ceilingUsd.toFixed(2)}.
                  Nothing installs until you approve the delivery.
                </p>
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
