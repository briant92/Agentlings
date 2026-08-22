import { useEffect, useState } from 'react';
import type { LibraryBrowse as Browse, LibraryHit } from '@agentlings/shared';
import { api } from '../api';
import { LibraryResults } from './LibraryResults';
import { MoreRow, usePaged } from './Section';

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

type Kind = 'all' | 'role' | 'skill';

function query(kind: Kind, source: string, category?: string): string {
  const parts: string[] = [];
  if (kind !== 'all') parts.push(`kind=${kind}`);
  if (source !== 'all') parts.push(`source=${encodeURIComponent(source)}`);
  if (category !== undefined) parts.push(`category=${encodeURIComponent(category)}`);
  return parts.length > 0 ? `?${parts.join('&')}` : '';
}

export function LibraryBrowse({
  hidden,
  onInstalled,
}: {
  /**
   * A query is on screen, so this is out of the way — hidden rather than
   * unmounted. Unmounting loses the category you had open, and the whole
   * promise of leaving the search box is coming back to where you were.
   */
  hidden: boolean;
  onInstalled: (name: string) => void;
}) {
  const [shape, setShape] = useState<Browse | null>(null);
  const [kind, setKind] = useState<Kind>('all');
  const [source, setSource] = useState('all');
  const [category, setCategory] = useState<string | null>(null);
  const [hits, setHits] = useState<LibraryHit[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** A category's entries, ten at a time (UI.md, step 5). */
  const page = usePaged(hits ?? []);

  // The last shape is kept while the next one loads. Clearing it would empty
  // the source dropdown that is driving the request, and blank the chips on
  // every filter change for the sake of a message nobody has time to read.
  useEffect(() => {
    let alive = true;
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
  const chosen = categories.find((c) => c.name === category);
  const total = shape ? shape.jobs + shape.abilities : 0;

  return (
    <div className="br" hidden={hidden}>
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
        {/* Counted from the index rather than taken from the source's own
            status, which is recorded before entries are deduplicated across
            sources and overstates by whatever it lost — 204 against 180 on the
            real catalogue. A filter that promises 204 and yields 180 is worse
            than a filter with no numbers on it. */}
        <select
          className="br-src"
          value={source}
          onChange={(e) => setSource(e.target.value)}
          aria-label="Filter by source"
        >
          <option value="all">all {shape?.indexed.length ?? 0} sources</option>
          {(shape?.indexed ?? []).map((s) => (
            <option key={s.name} value={s.name}>
              {s.label} · {s.entries}
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
        // A rail of categories with the results beside it (UI.md, step 5),
        // in place of a chip box clipped at 120px: the rail scrolls through
        // all hundred, and the results page ten at a time.
        <div className="br-split">
          <div className="br-rail">
            {categories.map((c) => (
              <button
                key={c.name}
                className={`br-cat${c.name === category ? ' on' : ''}`}
                onClick={() => setCategory(c.name === category ? null : c.name)}
              >
                {c.name} <i>{c.jobs + c.abilities}</i>
              </button>
            ))}
          </div>
          <div className="br-hits">
            {!chosen && <p className="dim br-empty">Pick a category to see what it holds.</p>}
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
                {hits === null && <p className="dim br-empty">loading…</p>}
                {hits && <LibraryResults hits={page.rows} onInstalled={onInstalled} />}
                <MoreRow hidden={page.hidden} what="entries" onShow={page.showAll} />
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
