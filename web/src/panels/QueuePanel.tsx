import { useState, type FormEvent } from 'react';
import type { Job, WorldState } from '@agentlings/shared';

interface OutputFile {
  name: string;
  content: string;
}

async function api<T>(path: string, init?: RequestInit): Promise<T> {
  const res = await fetch(path, init);
  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: string } | null;
    throw new Error(body?.error ?? res.statusText);
  }
  return res.json() as Promise<T>;
}

function postJson(body: unknown): RequestInit {
  return {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify(body),
  };
}

export function QueuePanel({ world }: { world: WorldState | null }) {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [review, setReview] = useState<{ job: Job; files: OutputFile[] } | null>(null);

  const jobs = world?.jobs ?? [];

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await api('/api/jobs', postJson({ title, prompt, repoPath: repoPath || undefined }));
      setTitle('');
      setPrompt('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  const openReview = async (job: Job) => {
    const data = await api<{ files: OutputFile[] }>(`/api/jobs/${job.id}/output`);
    setReview({ job, files: data.files });
  };

  const resolve = async (job: Job, action: 'promote' | 'discard') => {
    await api(`/api/jobs/${job.id}/resolve`, postJson({ action }));
    setReview(null);
  };

  return (
    <div className="panel">
      <form onSubmit={submit} className="job-form">
        <h2>New job</h2>
        <input
          placeholder="Title (e.g. Fix the flaky date test)"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
        />
        <textarea
          placeholder="What should the agentling do?"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          rows={3}
        />
        <input
          placeholder="Target repo path (used by the real executor from M1)"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
        />
        <button type="submit" disabled={!title.trim() || !prompt.trim()}>
          Queue job
        </button>
        {error && <p className="error">{error}</p>}
      </form>

      <div className="job-list">
        <h2>Jobs</h2>
        {jobs.length === 0 && <p className="dim">Nothing queued. The horde is loafing.</p>}
        <ul>
          {[...jobs].reverse().map((job) => (
            <li key={job.id}>
              <span className={`badge ${job.status}`}>{job.status}</span>
              <span className="title" title={job.prompt}>
                {job.title}
              </span>
              {job.assignedTo && <span className="dim">· {agentName(world, job.assignedTo)}</span>}
              {(job.status === 'done' || job.status === 'failed') && (
                <button onClick={() => void openReview(job)}>review</button>
              )}
            </li>
          ))}
        </ul>
      </div>

      {review && (
        <div className="review">
          <h2>Review: {review.job.title}</h2>
          {review.job.error && <p className="error">{review.job.error}</p>}
          {review.files.length === 0 && <p className="dim">Sandbox is empty.</p>}
          {review.files.map((f) => (
            <div key={f.name}>
              <h3>{f.name}</h3>
              <pre>{f.content}</pre>
            </div>
          ))}
          <div className="actions">
            <button onClick={() => void resolve(review.job, 'promote')}>Promote</button>
            <button onClick={() => void resolve(review.job, 'discard')}>Discard</button>
            <button onClick={() => setReview(null)}>Close</button>
          </div>
        </div>
      )}
    </div>
  );
}

function agentName(world: WorldState | null, id: string): string {
  return world?.agentlings.find((a) => a.id === id)?.name ?? id;
}
