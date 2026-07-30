import { useEffect, useState, type FormEvent } from 'react';
import type { WorkPlan } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';

const DEBOUNCE_MS = 250;

/**
 * Work intake: one box, one sentence. The app derives the title, matches the
 * role and picks who takes it — and shows all of that before queueing, so the
 * user is confirming a plan rather than filling in a form.
 *
 * The project folder is the only thing it ever has to ask for, and it asks
 * once per level.
 */
export function WorkBar({
  levelId,
  onFindAbility,
}: {
  levelId: string;
  onFindAbility: (text: string) => void;
}) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<WorkPlan | null>(null);
  const [askingRepo, setAskingRepo] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setPlan(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<WorkPlan>(lvl(levelId, '/work/plan'), postJson({ text: query }))
        .then(setPlan)
        .catch(() => setPlan(null));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, levelId]);

  const queue = async (folder?: string) => {
    setBusy(true);
    setError(null);
    try {
      await api(
        lvl(levelId, '/work'),
        postJson({ text: text.trim(), ...(folder === undefined ? {} : { repoPath: folder }) }),
      );
      setText('');
      setPlan(null);
      setAskingRepo(false);
      setRepoPath('');
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    // Ask for the project folder once, then never again for this level.
    if (plan?.needsRepo) setAskingRepo(true);
    else void queue();
  };

  const openRepo = () => {
    setRepoPath(plan?.repoPath ?? '');
    setAskingRepo(true);
  };

  return (
    <div className="work">
      <form className="work-bar" onSubmit={submit}>
        <input
          className="work-input"
          placeholder="What do you need done?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <button type="submit" disabled={!text.trim() || busy}>
          Start
        </button>
      </form>

      {plan && !askingRepo && (
        <p className="work-plan">
          {plan.agentling ? (
            <>
              <span className="work-who">{plan.agentling.name}</span> will take this
              {plan.noOneHasRole && plan.role
                ? ` — nobody here is a ${plan.role}, so it goes to your ${plan.agentling.role}`
                : ''}
              <span className="dim"> · saved as “{plan.title}”</span>
            </>
          ) : (
            <span className="dim">Nobody works here yet — hire someone first.</span>
          )}
        </p>
      )}

      {plan && !askingRepo && plan.gaps.length > 0 && (
        <p className="work-gaps">
          nothing your crew has covers: {plan.gaps.join(' · ')}
          {' · '}
          <button className="work-link" onClick={() => onFindAbility(text.trim())}>
            find one
          </button>
        </p>
      )}

      {plan && !askingRepo && !plan.needsRepo && (
        <p className="work-gaps">
          {plan.repoPath ? `working in ${plan.repoPath}` : 'no project folder'}
          {' · '}
          <button className="work-link" onClick={openRepo}>
            change
          </button>
        </p>
      )}

      {askingRepo && (
        <div className="work-repo">
          <label htmlFor="work-folder">Which project folder should they work in?</label>
          <div className="work-repo-row">
            <input
              id="work-folder"
              autoFocus
              placeholder="C:\Users\you\projects\my-app"
              value={repoPath}
              onChange={(e) => setRepoPath(e.target.value)}
            />
            <button disabled={!repoPath.trim() || busy} onClick={() => void queue(repoPath.trim())}>
              Use this
            </button>
            <button className="ghost" disabled={busy} onClick={() => void queue('')}>
              Skip — no folder
            </button>
          </div>
          <p className="dim work-hint">
            Asked once per level. Nothing is written there until you approve the result.
          </p>
        </div>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
