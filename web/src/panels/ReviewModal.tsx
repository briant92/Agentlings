import { useEffect, useState } from 'react';
import type { Job } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';

interface OutputFile {
  name: string;
  content: string;
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
          {files === null && <p className="dim">Loading sandbox…</p>}
          {files?.length === 0 && <p className="dim">Sandbox is empty.</p>}
          {files?.map((f) => (
            <div key={f.name}>
              <h3>{f.name}</h3>
              <pre>{f.content}</pre>
            </div>
          ))}
        </div>
        <div className="m-foot">
          {job.status === 'done' && (
            <>
              <button onClick={() => void resolve('promote')}>Promote</button>
              <button onClick={() => void resolve('discard')}>Discard</button>
            </>
          )}
          <button onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}
