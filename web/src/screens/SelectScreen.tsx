import { useEffect, useState } from 'react';
import type {
  CloseLevelPreview,
  ClosedLevelInfo,
  LevelInfo,
  Quote,
  ThemeId,
  WorkPlan,
} from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { hireBanner, type HireFor } from './hire';
import { readSeen } from '../panels/Inbox';
import { allLooks, loadLooks, renderThumbnail } from '../world/looks';

export interface LevelEntry {
  id: string;
  name: string;
  theme: ThemeId;
}

const plural = (n: number, one: string, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

/** "Pip & Dot", "Pip, Dot & Moss" — names the way the copy speaks them. */
const names = (list: string[]) =>
  list.length <= 1 ? (list[0] ?? '') : `${list.slice(0, -1).join(', ')} & ${list[list.length - 1]}`;

const onDate = (at: number) =>
  new Date(at).toLocaleDateString(undefined, { day: 'numeric', month: 'short', year: 'numeric' });

const firing = (at: number) =>
  new Date(at).toLocaleString(undefined, {
    weekday: 'short',
    month: 'short',
    day: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
  });

/**
 * The card's notification row (D-137), Super Mario World's switch-palace
 * grammar: four fixed positions, a dashed outline when quiet, a filled !
 * when live — position alone says which signal fired. Only the red block
 * carries a count (60 waiting reviews and 1 are different errands); the
 * others answer on hover. Unread is judged here, not by the server: the
 * inbox's own seen set against the same capped population it lists.
 */
function LevelBlocks({ level }: { level: LevelInfo }) {
  const unread = level.finished.filter((id) => !readSeen(level.id).includes(id)).length;
  const blocks = [
    {
      k: 'y',
      on: level.jobsRunning > 0,
      title:
        level.jobsRunning > 0
          ? `${plural(level.jobsRunning, 'job')} running right now`
          : 'nobody working right now',
    },
    {
      k: 'r',
      on: level.toReview > 0,
      count: level.toReview,
      title:
        level.toReview > 0
          ? `${plural(level.toReview, 'delivery', 'deliveries')} waiting on your review`
          : 'nothing to review',
    },
    {
      k: 'g',
      on: level.schedules > 0,
      title:
        level.schedules === 1
          ? 'a schedule fires on its own here'
          : level.schedules > 1
            ? `${level.schedules} schedules fire on their own here`
            : 'no schedules',
    },
    {
      k: 'b',
      on: unread > 0,
      title:
        unread > 0 ? `${plural(unread, 'new result')} you haven't opened` : 'nothing new in the inbox',
    },
  ];
  return (
    <span className="lvl-blocks">
      {blocks.map((b) => (
        <span key={b.k} className={b.on ? `nblk on nb-${b.k}` : 'nblk off'} title={b.title}>
          {b.on ? '!' : ''}
          {b.k === 'r' && b.on && (b.count ?? 0) > 1 && <span className="nb-cnt">{b.count}</span>}
        </span>
      ))}
    </span>
  );
}



/** The world map: one card per level, each its own crew and context. */
export function SelectScreen({
  onEnter,
  onBack,
  hireFor = null,
}: {
  onEnter: (level: LevelEntry) => void;
  onBack: () => void;
  /** A hire waiting on the choice (D-229): the picker says so over the grid. */
  hireFor?: HireFor | null;
}) {
  const [levels, setLevels] = useState<LevelInfo[] | null>(null);
  const [creating, setCreating] = useState(false);
  /** The closed shelf, and whichever level a dialog is holding right now. */
  const [closed, setClosed] = useState<ClosedLevelInfo[]>([]);
  const [closing, setClosing] = useState<LevelInfo | null>(null);
  const [reopening, setReopening] = useState<ClosedLevelInfo | null>(null);
  /** Bumped when the looks registry refreshes, so the grid repaints with it. */
  const [, setLooksRev] = useState(0);

  const load = () => {
    void api<LevelInfo[]>('/api/levels').then(setLevels);
    void api<ClosedLevelInfo[]>('/api/levels/closed')
      .then(setClosed)
      .catch(() => setClosed([]));
    // The looks registry is filled once at boot, and a page whose boot raced a
    // server restart holds only the four built-ins for its whole life — the
    // New Level palette missing every installed world until an F5 (D-164).
    // This screen is where that palette shows, so re-read the packs on every
    // visit: loadLooks merges idempotently, and the bump repaints the grid
    // with whatever arrived — a pack installed mid-session included.
    void loadLooks().then(() => setLooksRev((n) => n + 1));
  };

  useEffect(load, []);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && !creating && !closing && !reopening) onBack();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onBack, creating, closing, reopening]);

  return (
    <div className="select-screen">
      <div className="ss-head">
        <span className="ss-title">SELECT LEVEL</span>
        <span className="dim">esc title</span>
      </div>
      {hireBanner(hireFor) && <p className="ss-hire">{hireBanner(hireFor)}</p>}
      <div className="ss-grid">
        {(levels ?? []).map((l) => (
          <div key={l.id} className="lvl-slot">
            <button
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
              <LevelBlocks level={l} />
            </button>
            <button className="lvl-close" onClick={() => setClosing(l)}>
              close
            </button>
          </div>
        ))}
        <button className="lvl-card new" onClick={() => setCreating(true)}>
          <span className="lvl-new-plus">+ NEW LEVEL</span>
          <span className="dim">name it · pick a palette · fresh crew spawns</span>
        </button>
      </div>
      {closed.length > 0 && (
        <>
          <div className="sect">closed</div>
          <div className="closed-rows">
            {closed.map((row) => (
              <div key={row.id} className="closed-row">
                <span className="closed-name">{row.name}</span>
                <span className="dim">closed {onDate(row.closedAt)}</span>
                <span className="dim">{plural(row.jobs, 'job')} kept · ledger kept</span>
                <span className="closed-spacer" />
                <button onClick={() => setReopening(row)}>Reopen</button>
              </div>
            ))}
          </div>
        </>
      )}
      {closing && (
        <CloseLevelModal
          level={closing}
          onClose={() => setClosing(null)}
          onClosed={() => {
            setClosing(null);
            load();
          }}
        />
      )}
      {reopening && (
        <ReopenModal
          row={reopening}
          onClose={() => setReopening(null)}
          onReopened={() => {
            setReopening(null);
            load();
          }}
        />
      )}
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
  /** How the backdrop is made: drawn from ops, or a rendered plate (D-144). */
  const [kind, setKind] = useState<'pixel' | '3d'>('pixel');
  /** A picture to work from — optional for either kind (D-113, D-144). */
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
      const picture = reference
        ? { name: reference.name, data: await base64Of(reference) }
        : undefined;
      await api(
        lvl(host.id, '/author-pack'),
        postJson({
          description: world,
          // 'plate' asks the designer to render a real 3D backdrop with
          // render_plate; the brief leads with it (D-144).
          kind: kind === '3d' ? 'plate' : 'pixel',
          ...(picture ? { reference: picture } : {}),
        }),
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
                    The two ways a backdrop is made now (D-144): drawn from
                    the ops idioms, or a real 3D plate the designer renders
                    with render_plate and ships behind the pixel frame
                    (D-142, D-143). A reference picture is its own, optional
                    thing for either kind — worked from, never copied
                    (D-113), and never the backdrop itself.
                  */}
                  <div className="nl-kind">
                    {(['pixel', '3d'] as const).map((k) => (
                      <button
                        key={k}
                        className={`nl-kind-pick${kind === k ? ' on' : ''}`}
                        onClick={() => setKind(k)}
                      >
                        {k === 'pixel' ? 'Pixel' : '3D backdrop'}
                      </button>
                    ))}
                  </div>
                  {kind === '3d' && (
                    <p className="dim">
                      {host.name} renders a real 3D scene as the backdrop plate; the crew and
                      props stay pixel, in front of it.
                    </p>
                  )}
                  <label className="nl-ref">
                    <input
                      type="file"
                      accept="image/png,image/jpeg,image/webp"
                      onChange={(e) => setReference(e.target.files?.[0] ?? null)}
                    />
                    <span className="dim">
                      {reference
                        ? `${reference.name} — ${host.name} will look at it and compose a world from it, not copy it.`
                        : 'Optional: a picture to work from. It is a reference, never the backdrop itself.'}
                    </span>
                  </label>
                  <button
                    disabled={!world.trim() || authoring}
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

/**
 * Closing archives in place — the folder stays whole, the runtime stops. The
 * preview is fetched before the button so the dialog names consequences
 * (schedules stop, granted approvals lapse, waiting reviews are kept) instead
 * of asserting safety; a mid-job crew member arrives as `blocker` and arrests
 * the button the way a doomed Start is arrested (D-087's manner).
 */
function CloseLevelModal({
  level,
  onClose,
  onClosed,
}: {
  level: LevelInfo;
  onClose: () => void;
  onClosed: () => void;
}) {
  const [preview, setPreview] = useState<CloseLevelPreview | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    void api<CloseLevelPreview>(lvl(level.id, '/close/preview'))
      .then(setPreview)
      .catch((err) => setError(err instanceof Error ? err.message : String(err)));
  }, [level.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const close = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(lvl(level.id, ''), { method: 'DELETE' });
      onClosed();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Close level — {level.name}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          {preview === null && !error && <p className="dim">Looking at what this would stop…</p>}
          {preview && (
            <>
              <p>
                The level leaves the map and its clock stops. The folder stays whole —{' '}
                {plural(preview.jobs, 'job')}, {plural(preview.recipes, 'recipe')},{' '}
                {plural(preview.notes, 'note')}
                {preview.crew.length > 0 ? `, and the lessons ${names(preview.crew)} keep` : ''} —
                and the ledger keeps every row.
              </p>
              {preview.blocker && <p className="error">{preview.blocker}</p>}
              {(preview.reviews > 0 ||
                preview.schedules.length > 0 ||
                preview.approvals.length > 0) && (
                <>
                  <div className="sect">what stops</div>
                  <ul className="close-stops">
                    {preview.reviews > 0 && (
                      <li>
                        <span className="mark">reviews</span>
                        <span>{plural(preview.reviews, 'delivery', 'deliveries')} still in review</span>
                        <span className="then">kept as they are — back if you reopen</span>
                      </li>
                    )}
                    {preview.schedules.map((s) => (
                      <li key={s.id}>
                        <span className="mark">schedule</span>
                        <span>
                          “{s.prompt}” — {s.cadenceLabel}
                        </span>
                        <span className="then">
                          {s.paused
                            ? 'already paused'
                            : s.nextDueAt !== undefined
                              ? `next ${firing(s.nextDueAt)}`
                              : 'fires when mail arrives'}{' '}
                          — stops; stays paused if you reopen
                        </span>
                      </li>
                    ))}
                    {preview.approvals.map((a) => (
                      <li key={a.key}>
                        <span className="mark">approval</span>
                        <span>standing approval “{a.key}”</span>
                        <span className="then">lapses — nothing auto-sends from a closed level</span>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="m-foot">
          <span className="dim foot-note">
            Nothing is deleted — the folder stays at .agentlings/levels/{level.id}.
          </span>
          <button
            className="warn"
            disabled={busy || !preview || preview.blocker !== null}
            onClick={() => void close()}
          >
            {busy ? 'closing…' : 'Close level'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}

/**
 * Reopening names the two powers that could otherwise return unnoticed:
 * schedules stay paused (a level asleep for months must not fire a catch-up
 * on waking), and a standing approval never stopped being granted.
 */
function ReopenModal({
  row,
  onClose,
  onReopened,
}: {
  row: ClosedLevelInfo;
  onClose: () => void;
  onReopened: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const reopen = async () => {
    setBusy(true);
    setError(null);
    try {
      await api(lvl(row.id, '/reopen'), { method: 'POST' });
      onReopened();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">Reopen {row.name}?</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          <p>
            Back on the map with crew, recipes and{' '}
            {row.reviews > 0 ? `the ${plural(row.reviews, 'waiting review')}` : 'its work record'}{' '}
            exactly as they were.
          </p>
          {(row.schedules.length > 0 || row.approvals.length > 0) && (
            <ul className="close-stops">
              {row.schedules.map((s) => (
                <li key={s.id}>
                  <span className="mark">schedule</span>
                  <span>
                    “{s.prompt}” — {s.cadenceLabel}
                  </span>
                  <span className="then">
                    stays paused — resume it from the backoffice when you want it firing again
                  </span>
                </li>
              ))}
              {row.approvals.map((a) => (
                <li key={a.key}>
                  <span className="mark">approval</span>
                  <span>standing approval “{a.key}”</span>
                  <span className="then">
                    still granted — revoke in Settings if you no longer want auto-sends
                  </span>
                </li>
              ))}
            </ul>
          )}
          {error && <p className="error">{error}</p>}
        </div>
        <div className="m-foot">
          <button disabled={busy} onClick={() => void reopen()}>
            {busy ? 'reopening…' : 'Reopen'}
          </button>
          <button onClick={onClose}>Cancel</button>
        </div>
      </div>
    </div>
  );
}
