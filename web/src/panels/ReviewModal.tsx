import { useEffect, useState } from 'react';
import type { DeliveryFile, Job } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import { FileViewer } from './FileViewer';

/** Full sandbox contents in an overlay; Esc, backdrop, or Close dismisses. */
export function ReviewModal({
  levelId,
  job,
  /** The file to open on, when the inbox already knows which one was clicked. */
  file,
  onClose,
}: {
  levelId: string;
  job: Job;
  file?: string;
  onClose: () => void;
}) {
  const [files, setFiles] = useState<DeliveryFile[] | null>(null);

  useEffect(() => {
    let alive = true;
    void api<{ files: DeliveryFile[] }>(lvl(levelId, `/jobs/${job.id}/output`)).then((data) => {
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
      <div className="modal review" onClick={(e) => e.stopPropagation()}>
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
          {files && <FileViewer levelId={levelId} jobId={job.id} files={files} initial={file} />}
        </div>
        <div className="m-foot">
          {/* `partial` gets the same actions the terminal card offers it:
              without this, "See the changes" on the status that most needs
              reviewing opened a modal whose only button was Close. */}
          {(job.status === 'done' || job.status === 'partial') && (
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
