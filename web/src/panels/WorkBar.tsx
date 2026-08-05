import { useEffect, useState, type FormEvent } from 'react';
import type { ConnectionInfo, WorkPlan } from '@agentlings/shared';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';

const DEBOUNCE_MS = 250;

/** A file waiting to go with the next job, already read into memory. */
interface Attached {
  name: string;
  bytes: number;
  /** Base64, because it rides in the same JSON as the sentence it belongs to. */
  data: string;
}

function readAsBase64(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    // The result is a data: URL; everything after the comma is the payload.
    reader.onload = () => resolve(String(reader.result).split(',')[1] ?? '');
    reader.onerror = () => reject(new Error(`could not read ${file.name}`));
    reader.readAsDataURL(file);
  });
}

function fileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

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
  onOpenSettings,
}: {
  levelId: string;
  onFindAbility: (text: string) => void;
  /** The ask-card's connect button lands in Settings, where the drawer is. */
  onOpenSettings: () => void;
}) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<WorkPlan | null>(null);
  /**
   * A channel picked on the ask-card — only ever one of the options the
   * server offered (D-079). Null means the server's own default applies:
   * the asked channel when it is usable, otherwise none (a draft job).
   */
  const [channel, setChannel] = useState<string | null>(null);
  /** Answers by question id. Empty is always a valid state — Start never waits. */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** Files dropped on the box, read once and sent with the job that uses them. */
  const [files, setFiles] = useState<Attached[]>([]);
  const [dragging, setDragging] = useState(false);
  const [askingRepo, setAskingRepo] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const live = connections.filter((c) => c.enabled);

  useEffect(() => {
    void api<ConnectionInfo[]>('/api/connections')
      .then((list) => setConnections(list.filter((c) => c.ready)))
      .catch(() => setConnections([]));
  }, []);

  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setPlan(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<WorkPlan>(lvl(levelId, '/work/plan'), postJson({ text: query }))
        .then((next) => {
          setPlan(next);
          // A pick belongs to the card it was made on; a new plan is a new card.
          setChannel(null);
        })
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
        postJson({
          text: text.trim(),
          ...(folder === undefined ? {} : { repoPath: folder }),
          ...(Object.keys(answers).length > 0 ? { answers } : {}),
          ...(files.length > 0
            ? { files: files.map((f) => ({ name: f.name, data: f.data })) }
            : {}),
          // Only an explicit pick rides; with none the server settles the
          // channel itself from the same detection the card came from.
          ...(channel ? { channel } : {}),
        }),
      );
      setText('');
      setPlan(null);
      setChannel(null);
      setAnswers({});
      setFiles([]);
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

  /**
   * Reads dropped files into memory. Refused here as well as on the server —
   * the server is what makes it true, but finding out before you have typed
   * the sentence is the difference between a hint and a rejection.
   */
  const attach = async (incoming: FileList | null) => {
    if (!incoming?.length) return;
    setError(null);
    const room = MAX_ATTACHMENTS - files.length;
    if (room <= 0) {
      setError(`${MAX_ATTACHMENTS} files at most`);
      return;
    }
    const taking = [...incoming].slice(0, room);
    if (taking.length < incoming.length) setError(`${MAX_ATTACHMENTS} files at most`);
    for (const file of taking) {
      if (file.size > MAX_ATTACHMENT_BYTES) {
        setError(`${file.name} is larger than ${MAX_ATTACHMENT_BYTES / (1024 * 1024)} MB`);
        continue;
      }
      try {
        const data = await readAsBase64(file);
        setFiles((prev) => [...prev, { name: file.name, bytes: file.size, data }]);
      } catch (err) {
        setError(err instanceof Error ? err.message : String(err));
      }
    }
  };

  return (
    <div
      className={dragging ? 'work dropping' : 'work'}
      onDragOver={(e) => {
        // Only take over the drop when it is actually a file; dragging text
        // around the page should behave as it always did.
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(true);
      }}
      onDragLeave={(e) => {
        if (e.currentTarget.contains(e.relatedTarget as Node | null)) return;
        setDragging(false);
      }}
      onDrop={(e) => {
        if (!e.dataTransfer.types.includes('Files')) return;
        e.preventDefault();
        setDragging(false);
        void attach(e.dataTransfer.files);
      }}
    >
      <form className="work-bar" onSubmit={submit}>
        <input
          className="work-input"
          data-tour="work"
          placeholder="What do you need done?"
          value={text}
          onChange={(e) => setText(e.target.value)}
        />
        <label className="work-clip" title="Attach a document">
          <input
            type="file"
            multiple
            onChange={(e) => {
              void attach(e.target.files);
              e.target.value = ''; // so the same file can be picked twice
            }}
          />
          📎
        </label>
        <button type="submit" disabled={!text.trim() || busy}>
          Start
        </button>
      </form>

      {files.length > 0 && (
        <p className="work-files">
          {files.map((f) => (
            <span key={f.name} className="work-file">
              {f.name} <span className="dim">{fileSize(f.bytes)}</span>
              <button
                type="button"
                aria-label={`Remove ${f.name}`}
                onClick={() => setFiles((prev) => prev.filter((x) => x.name !== f.name))}
              >
                ✕
              </button>
            </span>
          ))}
          <span className="dim"> · they go in the sandbox, nothing else can see them</span>
        </p>
      )}

      {/* What the crew can reach, stated rather than asked. It is not a control
          — the switch lives in Settings — but a job that cannot reach the web
          should say so here, where the work is queued, and not in its result. */}
      {connections.length > 0 && !askingRepo && (
        <p className="work-gaps work-conn">
          {live.length > 0 ? (
            <span className="work-conn-on" title={live.map((c) => c.description).join(' · ')}>
              the crew can {live.map((c) => c.label.toLowerCase()).join(', ')}
            </span>
          ) : (
            <span className="work-conn-off">the crew is working offline</span>
          )}
          <span className="dim">· change in settings</span>
        </p>
      )}

      {plan && !askingRepo && (
        <p className="work-plan">
          {plan.agentling ? (
            <>
              <span className="work-who">{plan.agentling.name}</span> will take this
              {plan.noOneHasRole && plan.role
                ? ` — nobody here is a ${plan.role}, so it goes to your ${plan.agentling.role}`
                : ''}
              <span className="dim"> · saved as “{plan.title}”</span>
              <span className={plan.quote.ceilingUsd === 0 ? ' quote-free' : ' quote-cost'}>
                {' · '}
                {plan.quote.wording}
              </span>
            </>
          ) : (
            <span className="dim">Nobody works here yet — hire someone first.</span>
          )}
        </p>
      )}

      {plan?.channelAsk && !askingRepo && plan.channelAsk.state === 'ready' && (
        <p className="work-gaps work-channel-ready">
          sends via {plan.channelAsk.askedLabel} · every message waits for your review
        </p>
      )}
      {plan?.channelAsk && !askingRepo && plan.channelAsk.state !== 'ready' && (
        <div className="work-channel">
          {channel ? (
            <p className="work-channel-note">
              Sends via{' '}
              {plan.channelAsk.options.find((o) => o.channel === channel)?.label ?? channel}{' '}
              instead — every message waits for your review.{' '}
              <button type="button" className="work-link" onClick={() => setChannel(null)}>
                undo
              </button>
            </p>
          ) : (
            <>
              <p className="work-channel-note">{plan.channelAsk.note}</p>
              {plan.channelAsk.options.map((option) => (
                <div key={option.channel} className="work-channel-opt">
                  <span className="work-channel-name">{option.label}</span>
                  <span className="dim work-channel-detail">{option.detail}</span>
                  {option.state === 'ready' && option.channel !== plan.channelAsk?.asked && (
                    <button
                      type="button"
                      className="work-chip"
                      onClick={() => setChannel(option.channel)}
                    >
                      use {option.label}
                    </button>
                  )}
                  {option.state === 'connectable' && (
                    <button type="button" className="work-chip" onClick={onOpenSettings}>
                      connect
                    </button>
                  )}
                </div>
              ))}
            </>
          )}
        </div>
      )}

      {plan && !askingRepo && plan.questions.length > 0 && (
        <div className="work-ask">
          {plan.questions.map((q) => (
            <div key={q.id} className="work-q">
              <span className="work-q-ask">
                {q.ask}
                {q.hint && <span className="dim work-q-hint"> {q.hint}</span>}
              </span>
              <span className="work-q-answers">
                {q.options.map((o) => (
                  <button
                    key={o.label}
                    type="button"
                    className={answers[q.id] === o.label ? 'work-chip on' : 'work-chip'}
                    onClick={() =>
                      setAnswers((prev) => {
                        const next = { ...prev };
                        // Clicking the chosen one again takes it back — every
                        // question has to be un-answerable.
                        if (next[q.id] === o.label) delete next[q.id];
                        else next[q.id] = o.label;
                        return next;
                      })
                    }
                  >
                    {o.label}
                  </button>
                ))}
                {q.freeText && (
                  <input
                    className="work-q-text"
                    placeholder="or say which"
                    value={q.options.some((o) => o.label === answers[q.id]) ? '' : (answers[q.id] ?? '')}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  />
                )}
              </span>
            </div>
          ))}
          <p className="dim work-hint">Optional — Start works either way.</p>
        </div>
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
