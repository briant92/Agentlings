import { useEffect, useState } from 'react';
import type { KnowledgeStatus } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';

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

export function KnowledgeModal({ levelId, onClose }: { levelId: string; onClose: () => void }) {
  const [status, setStatus] = useState<KnowledgeStatus | null>(null);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const load = async (): Promise<void> => {
    setStatus(await api<KnowledgeStatus>(lvl(levelId, '/knowledge')));
  };

  useEffect(() => {
    void load().catch((err: unknown) => setError(err instanceof Error ? err.message : String(err)));
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
            Point this level at folders of your own notes. The crew reads a copy
            taken when you press add — never your files directly — so you can see
            exactly what it has before it uses any of it.
          </p>

          <div className="sect">folders this level reads</div>
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

          <div className="sect">add a folder</div>
          <input
            className="lib-search"
            placeholder="C:\Users\you\Notes"
            value={draft}
            disabled={busy}
            onChange={(e) => setDraft(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') void add();
            }}
          />
          {/* A PDF that is a scan of paper holds pictures of words and no
              words, and reads as an empty file rather than a failed one —
              which is indistinguishable from "not read" without saying so. */}
          <p className="lib-status">
            Notes, Word documents and PDFs are read (.md, .txt, .docx, .pdf). A PDF
            that is a scan of paper has no text in it, so nothing is taken from it.
          </p>

          {status?.indexed && (
            <>
              <div className="sect">what it has</div>
              <p className="lib-status">
                {status.entries} passage{status.entries === 1 ? '' : 's'} from {status.files} file
                {status.files === 1 ? '' : 's'} · read {ago(status.syncedAt)}
                {' · '}
                <button className="work-link" disabled={busy} onClick={() => void resync()}>
                  {busy ? 'reading…' : 'read them again'}
                </button>
              </p>
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
                  {status.truncated} file{status.truncated === 1 ? '' : 's'} {' '}
                  {status.truncated === 1 ? 'was' : 'were'} long enough that only the first
                  part was read — about 60 pages each. Split the long ones if the rest matters.
                </p>
              )}
            </>
          )}

          {note && <p className="lib-status">{note}</p>}
          {error && <p className="lib-warn">{error}</p>}
        </div>
      </div>
    </div>
  );
}
