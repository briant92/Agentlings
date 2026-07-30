import { useState, type FormEvent } from 'react';
import { api, postJson } from '../api';

/** One-row job intake under the world; repo path stays tucked away until M1 matters. */
export function QueueBar() {
  const [title, setTitle] = useState('');
  const [prompt, setPrompt] = useState('');
  const [repoPath, setRepoPath] = useState('');
  const [showRepo, setShowRepo] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

  return (
    <form className="queue-bar" onSubmit={submit}>
      <input
        className="qb-title"
        placeholder="Job title"
        value={title}
        onChange={(e) => setTitle(e.target.value)}
      />
      <input
        className="qb-prompt"
        placeholder="What should the agentling do?"
        value={prompt}
        onChange={(e) => setPrompt(e.target.value)}
      />
      {showRepo ? (
        <input
          className="qb-repo"
          placeholder="Target repo path (used from M1)"
          value={repoPath}
          onChange={(e) => setRepoPath(e.target.value)}
        />
      ) : (
        <button type="button" className="ghost" onClick={() => setShowRepo(true)}>
          + repo
        </button>
      )}
      <button type="submit" disabled={!title.trim() || !prompt.trim()}>
        Queue
      </button>
      {error && <span className="error">{error}</span>}
    </form>
  );
}
