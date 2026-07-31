import { useEffect, useState } from 'react';
import type { Job, JobOutputFile } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';

type OutputFile = JobOutputFile;

function size(bytes: number): string {
  if (bytes < 1024) return `${bytes} bytes`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/** The report first, then the file list, with the raw patch tucked underneath. */
function order(files: OutputFile[]): OutputFile[] {
  const rank = (name: string) => (name === 'RESULT.md' ? 0 : name === 'DIFF.patch' ? 2 : 1);
  return [...files].sort((a, b) => rank(a.name) - rank(b.name) || a.name.localeCompare(b.name));
}

/** Full sandbox contents in an overlay; Esc, backdrop, or Close dismisses. */
export function ReviewModal({
  levelId,
  job,
  onClose,
}: {
  levelId: string;
  job: Job;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<OutputFile[] | null>(null);

  useEffect(() => {
    let alive = true;
    void api<{ files: OutputFile[] }>(lvl(levelId, `/jobs/${job.id}/output`)).then((data) => {
      if (alive) setFiles(data.files);
    });
    return () => {
      alive = false;
    };
  }, [levelId, job.id]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const resolve = async (action: 'promote' | 'discard') => {
    await api(lvl(levelId, `/jobs/${job.id}/resolve`), postJson({ action }));
    onClose();
  };

  return (
    <div className="modal-backdrop" onClick={onClose}>
      <div className="modal" onClick={(e) => e.stopPropagation()}>
        <div className="m-head">
          <span className={`badge ${job.status}`}>{job.status}</span>
          <span className="m-title">{job.title}</span>
          <button onClick={onClose}>✕</button>
        </div>
        <div className="m-body">
          {job.error && <p className="error">{job.error}</p>}
          {job.summary && <p className="rv-summary">{job.summary}</p>}
          {job.changes && job.changes.files > 0 && (
            <>
              <div className="sect">
                files this would change · +{job.changes.added} −{job.changes.removed}
              </div>
              <ul className="rv-files">
                {job.changes.names.map((name) => (
                  <li key={name}>{name}</li>
                ))}
              </ul>
            </>
          )}
          {files === null && <p className="dim">Loading…</p>}
          {files?.length === 0 && <p className="dim">Nothing was left in the sandbox.</p>}
          {files &&
            order(files).map((f) =>
              f.binary ? (
                // A document is not something to print into a <pre>. It is
                // named, sized and offered as itself.
                <div key={f.name} className="rv-file">
                  <h3>{f.name}</h3>
                  <p className="dim">
                    {size(f.bytes)} ·{' '}
                    <a href={lvl(levelId, `/jobs/${job.id}/output/${encodeURIComponent(f.name)}`)}>
                      download
                    </a>
                  </p>
                </div>
              ) : f.name === 'DIFF.patch' ? (
                <details key={f.name} className="rv-raw">
                  <summary>Show the raw patch</summary>
                  <pre>{f.content}</pre>
                </details>
              ) : (
                <div key={f.name}>
                  <h3>{f.name}</h3>
                  <pre>{f.content}</pre>
                </div>
              ),
            )}
        </div>
        <div className="m-foot">
          {job.status === 'done' && (
            <>
              <button onClick={() => void resolve('promote')}>Approve</button>
              <button onClick={() => void resolve('discard')}>Discard</button>
            </>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
