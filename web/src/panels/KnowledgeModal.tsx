import { useEffect, useRef, useState } from 'react';
import type { KnowledgeStatus } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { ProvenanceSection } from './ProvenanceSection';
import { Section } from './Section';

/** What the store reads, as the chips say it. */
const FORMATS = ['.md', '.txt', '.docx', '.pdf', '.xlsx', '.pptx', '.png', '.jpg'];

/**
 * The knowledge store: folders of the user's own material this level can
 * answer from.
 *
 * Written for someone who has never heard the words "index" or "corpus" (M3).
 * The three things worth saying are what it will read, that it reads once
 * rather than watching, and that a stale index has quietly stopped being used —
 * the last of which is invisible from anywhere else in the app.
 */

function ago(at?: number): string {
  if (!at) return 'never';
  const mins = Math.round((Date.now() - at) / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} h ago`;
  return `${Math.round(hours / 24)} d ago`;
}

export function KnowledgeModal({
  levelId,
  onClose,
  pickOnOpen,
}: {
  levelId: string;
  onClose: () => void;
  /** Open the native folder dialog immediately — the header's "+" (D-102). */
  pickOnOpen?: boolean;
}) {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [picking, setPicking] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  /** StrictMode mounts twice; a second native dialog must not open over the first. */
  const pickedOnMount = useRef(false);

  const load = async (): Promise<KnowledgeStatus> => {
    const fresh = await api<KnowledgeStatus>(lvl(levelId, '/knowledge'));
    setStatus(fresh);
    return fresh;
  };

  useEffect(() => {
    void (async () => {
      try {
        const fresh = await load();
        if (pickOnOpen && !pickedOnMount.current) {
          pickedOnMount.current = true;
          await browse(fresh.sources);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [levelId]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  /** Sources are saved and read in one step: a saved folder nobody read is a
   *  setting that looks done and does nothing. */
  const save = async (paths: string[]): Promise<void> => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const done = await api<{ missing: string[]; entries: number; skipped: number }>(
        lvl(levelId, '/knowledge/sources'),
        postJson({ paths }),
      );
      // A typed path is the likeliest thing to be wrong, and a sync that found
      // nothing looks identical to a folder that is simply empty.
      if (done.missing.length > 0) {
        setError(`Could not find ${done.missing.join(', ')} — check the path and try again.`);
      } else {
        setNote(`Read ${done.entries} passage${done.entries === 1 ? '' : 's'}.`);
      }
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const add = async (): Promise<void> => {
    const path = draft.trim();
    if (!path || !status) return;
    setDraft('');
    await save([...status.sources, path]);
  };

  /**
   * The native Select Folder dialog, asked of the server — the machine that
   * has the folders. The answer lands through the same save as a typed path,
   * deduplicated because "+" twice on the same folder would index it twice.
   */
  const browse = async (existing: string[]): Promise<void> => {
    setPicking(true);
    setError(null);
    setNote(null);
    try {
      const picked = await api<{ path?: string; cancelled?: boolean }>('/api/pick-folder', {
        method: 'POST',
      });
      if (picked.path) await save([...new Set([...existing, picked.path])]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setPicking(false);
    }
  };

  const remove = async (path: string): Promise<void> => {
    if (!status) return;
    await save(status.sources.filter((p) => p !== path));
  };

  const resync = async (): Promise<void> => {
    setBusy(true);
    setError(null);
    setNote(null);
    try {
      const done = await api<{ entries: number }>(lvl(levelId, '/knowledge/sync'), {
        method: 'POST',
      });
      setNote(`Read ${done.entries} passage${done.entries === 1 ? '' : 's'} again.`);
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className="m-title">What this level can read</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          <p className="k-intro">
            Point this level at folders of your own material. The crew reads a copy taken
            when you press add — never your files directly — so you can see exactly what it
            has before it uses any of it.
          </p>

          {/* The light touch decided on 2026-08-22 (UI.md, step 6): the
              folders, the add controls and the formats stay open; the two
              explanations fold with their gist in the header. */}
          <Section
            panel="knowledge"
            id="folders"
            label="folders this level reads"
            count={status ? (status.sources.length === 0 ? 'none yet' : status.sources.length) : '…'}
            defaultOpen
          >
            {status?.sources.length === 0 && (
              <p className="lib-status">
                None yet. Everything is answered from what the crew has done itself.
              </p>
            )}
            {status?.sources.map((path) => {
              // A folder that is not there reads as a working one otherwise, and
              // it is the row rather than the transient error that persists.
              const gone = status.missing.includes(path);
              return (
                <div key={path} className={gone ? 'k-source gone' : 'k-source'}>
                  <span className="k-path" title={path}>
                    {path}
                  </span>
                  {gone && <span className="k-gone">not found</span>}
                  <button
                    className="work-link danger"
                    disabled={busy}
                    onClick={() => void remove(path)}
                  >
                    remove
                  </button>
                </div>
              );
            })}
            {status?.indexed && (
              <>
                <p className="lib-status">
                  {status.entries} passage{status.entries === 1 ? '' : 's'} from {status.files}{' '}
                  file{status.files === 1 ? '' : 's'} · read {ago(status.syncedAt)}
                  {status.scanned > 0 &&
                    ` · ${status.scanned} file${status.scanned === 1 ? '' : 's'} read from a scan`}
                  {' · '}
                  <button className="work-link" disabled={busy} onClick={() => void resync()}>
                    {busy ? 'reading…' : 'read them again'}
                  </button>
                </p>
                {/* Its own line rather than folded into the warning below: a
                    contract read as far as page 20 is a different loss from one
                    that yielded nothing, and it went unreported until the panel
                    copy was read back against the code. */}
                {status.scanCut > 0 && (
                  <p className="lib-warn">
                    {status.scanCut} scan{status.scanCut === 1 ? '' : 's'}{' '}
                    {status.scanCut === 1 ? 'was' : 'were'} longer than 20 pages and{' '}
                    {status.scanCut === 1 ? 'was' : 'were'} read that far only. Split the long
                    ones if what follows matters.
                  </p>
                )}
                {/* The budget ran out, or there is no engine. Either way these
                    files are in the folder and contributing nothing, which looks
                    from here exactly like a folder that was never read. */}
                {status.unscanned > 0 && (
                  <p className="lib-warn">
                    {status.unscanned} scanned file{status.unscanned === 1 ? '' : 's'} held no
                    text that could be read
                    {status.ocr
                      ? ' — a sync reads about 200 scanned pages, so point at a narrower folder for the rest.'
                      : ', because this machine has no OCR engine.'}
                  </p>
                )}
                {/* Invisible everywhere else, and it changes what the level can do. */}
                {status.stale && (
                  <p className="lib-warn">
                    This copy is over a week old, so the crew has stopped using it — jobs
                    are being answered without it until you read the folders again.
                  </p>
                )}
                {status.skipped > 0 && (
                  <p className="lib-warn">
                    {status.skipped} file{status.skipped === 1 ? '' : 's'} past the 250-per-folder
                    limit {status.skipped === 1 ? 'was' : 'were'} left out. Point at a narrower
                    folder to be sure of what is included.
                  </p>
                )}
                {status.truncated > 0 && (
                  <p className="lib-warn">
                    {status.truncated} file{status.truncated === 1 ? '' : 's'}{' '}
                    {status.truncated === 1 ? 'was' : 'were'} long enough that only the first
                    part was read. Split the long ones if the rest matters.
                  </p>
                )}
              </>
            )}
          </Section>

          <Section panel="knowledge" id="add" label="add a folder" defaultOpen>
            <p className="lib-status">
              <button
                className="work-link"
                disabled={busy || picking}
                onClick={() => void browse(status?.sources ?? [])}
              >
                {picking ? 'waiting for the folder window…' : 'choose a folder…'}
              </button>
              {' · or type a path below'}
            </p>
            <input
              className="lib-search"
              placeholder="C:\Users\you\Documents"
              value={draft}
              disabled={busy}
              onChange={(e) => setDraft(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === 'Enter') void add();
              }}
            />
          </Section>

          <Section
            panel="knowledge"
            id="formats"
            label="what gets read"
            count={`${FORMATS.length} formats`}
            defaultOpen
          >
            <div className="k-formats">
              {FORMATS.map((ext) => (
                <span key={ext} className="chip">
                  {ext}
                </span>
              ))}
            </div>
            {/* A spreadsheet is read as sentences rather than as a grid, which is
                why a column name is the way to find a number in it. */}
            <p className="lib-status">
              Spreadsheets a row at a time under their column names · decks a slide at a time
              · scans and photographs through the OCR built into Windows, marked “read from a
              scan” wherever the crew quotes them.
            </p>
            {status && !status.ocr && (
              <p className="lib-warn">
                This machine has no OCR engine, so a scan or a photograph holds pictures of
                words and none this level can read. Adding an English or Spanish language
                pack in Windows settings turns it on.
              </p>
            )}
          </Section>

          <Section
            panel="knowledge"
            id="how"
            label="how reading works"
            summary="a copy, not your files · read once · per-file limits · stale after a week"
          >
            <p className="lib-status">
              The crew reads a copy taken when you press add, never your files directly, and
              reads it once — nothing watches the folder. Read the folders again after you
              change them.
            </p>
            {/* "Passage" is the app's own word, and it means three different
                shapes depending on the file it came from. The figures were
                measured, not estimated: the cap is 200 passages, and a passage
                holds one slide but around six spreadsheet rows. */}
            <p className="lib-status">
              A passage is a section of writing, a slide, a run of spreadsheet rows, or a page
              of scanned paper. A file is read to about 60 pages of writing, 200 slides, or
              1,300 spreadsheet rows — a scan to 20 pages, and a folder to 250 files. Split the
              long ones if the rest matters.
            </p>
            <p className="lib-status">
              Words read from a scan are a good reading rather than the document&apos;s own, so
              anything taken from one is marked “read from a scan”. A copy older than a week
              stops being used until you read the folders again.
            </p>
          </Section>

          {/* The level's own record, searchable, and what a run would read (D-225). */}
          <ProvenanceSection levelId={levelId} />

          {note && <p className="lib-status">{note}</p>}
          {error && <p className="lib-warn">{error}</p>}
        </div>
      </div>
    </div>
  );
}
