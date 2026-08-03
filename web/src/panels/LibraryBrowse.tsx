import { useEffect, useState } from 'react';
import type { LibraryBrowse as Browse, LibraryHit, SourceStatus } from '@agentlings/shared';
import { api } from '../api';
import { LibraryResults } from './LibraryResults';

/**
 * The catalogue, for someone who has not decided what they want yet.
 *
 * Search needs a query, and a query needs to already know what you are looking
 * for. This is the other half: the shape of what is there, arranged by where
 * the sources keep their own files.
 *
 * It fetches in two steps because the two costs are different — the category
 * counts are a few KB and the entries are only ever one category's worth,
 * against an index of 372KB. Nothing here installs or previews on its own: the
 * rows are the same `LibraryResults` search renders, so a template is still
 * read before it is written and still pinned to the commit it was read at.
 */

/** How many category chips to show before the rest go behind a click. */
const CHIP_LIMIT = 18;

type Kind = 'all' | 'role' | 'skill';

function query(kind: Kind, source: string, category?: string): string {
  const parts: string[] = [];
  if (kind !== 'all') parts.push(`kind=${kind}`);
  if (source !== 'all') parts.push(`source=${encodeURIComponent(source)}`);
  if (category !== undefined) parts.push(`category=${encodeURIComponent(category)}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export function LibraryBrowse({
  sources,
  onInstalled,
}: {
  /** From the library status the modal already holds; names the source filter. */
  sources: SourceStatus[];
  onInstalled: (name: string) => void;
}) {
  const [shape, setShape] = useState<Browse | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState<string | null>(null);
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [all, setAll] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    setShape(null);
    void api<Browse>(`/api/library/browse${query(kind, source)}`)
      .then((data) => alive && setShape(data))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [kind, source]);

  // A category that the current filters no longer offer must not stay selected
  // with somebody else's entries under it.
  useEffect(() => {
    if (!shape || category === null) return;
    if (!shape.categories.some((c) => c.name === category)) setCategory(null);
  }, [shape, category]);

  useEffect(() => {
    if (category === null) {
      setHits(null);
      return;
    }
    let alive = true;
    setHits(null);
    void api<LibraryHit[]>(`/api/library/browse${query(kind, source, category)}`)
      .then((data) => alive && setHits(data))
      .catch((err: unknown) => alive && setError(err instanceof Error ? err.message : String(err)));
    return () => {
      alive = false;
    };
  }, [category, kind, source]);

  const categories = shape?.categories ?? [];
  const shown = all ? categories : categories.slice(0, CHIP_LIMIT);
  const chosen = categories.find((c) => c.name === category);
  const total = shape ? shape.jobs + shape.abilities : 0;

  return (
    <div className="br">
      <div className="br-bar">
        <span className="br-seg">
          <button className={kind === 'all' ? 'on' : ''} onClick={() => setKind('all')}>
            everything <i>{total || '·'}</i>
          </button>
          <button className={kind === 'role' ? 'on' : ''} onClick={() => setKind('role')}>
            jobs <i>{shape?.jobs ?? '·'}</i>
          </button>
          <button className={kind === 'skill' ? 'on' : ''} onClick={() => setKind('skill')}>
            abilities <i>{shape?.abilities ?? '·'}</i>
          </button>
        </span>
        <select
          className="br-src"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Filter by source"
        >
          <option value="all">all {sources.length} sources</option>
          {sources.map((s) => (
            <option key={s.name} value={s.name}>
              {s.label} · {s.count}
            </option>
          ))}
        </select>
      </div>

      {shape === null && !error && <p className="dim br-empty">Reading the catalogue…</p>}
      {error && <p className="error br-empty">{error}</p>}
      {shape && categories.length === 0 && (
        <p className="dim br-empty">Nothing indexed matches that filter.</p>
      )}

      {categories.length > 0 && (
        <div className="br-cats">
          {shown.map((c) => (
            <button
              key={c.name}
              className={`br-cat${c.name === category ? ' on' : ''}`}
              onClick={() => setCategory(c.name === category ? null : c.name)}
            >
              {c.name} <i>{c.jobs + c.abilities}</i>
            </button>
          ))}
          {categories.length > CHIP_LIMIT && (
            <button className="br-cat more" onClick={() => setAll(!all)}>
              {all ? 'fewer ▴' : `all ${categories.length} categories ▾`}
            </button>
          )}
        </div>
      )}

      {chosen && (
        <>
          <div className="br-head">
            <span className="br-who">{chosen.name}</span>
            <span className="dim">
              {chosen.jobs > 0 && `${chosen.jobs} ${chosen.jobs === 1 ? 'job' : 'jobs'}`}
              {chosen.jobs > 0 && chosen.abilities > 0 && ' · '}
              {chosen.abilities > 0 &&
                `${chosen.abilities} ${chosen.abilities === 1 ? 'ability' : 'abilities'}`}
            </span>
            <button className="work-link br-clear" onClick={() => setCategory(null)}>
              clear
            </button>
          </div>
          <div className="br-list">
            {hits === null && <p className="dim br-empty">loading…</p>}
            {hits && <LibraryResults hits={hits} onInstalled={onInstalled} />}
          </div>
        </>
      )}
    </div>
  );
}
