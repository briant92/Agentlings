import { useCallback, useEffect, useRef, useState, type FormEvent } from 'react';
import type {
  AudiencePerson,
  AudienceReply,
  Cadence,
  ConnectionInfo,
  ScheduleInfo,
  WorkPlan,
} from '@agentlings/shared';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import type { AnchorFn } from '../world/anchor';
import {
  matchRecipient,
  missingAttachment,
  missingRecipient,
  missingWords,
  recipientProblem,
} from './askFacts';
import { AskBubble } from './AskBubble';
import { ChannelAskCard } from './ChannelAskCard';
import { RecipientPicker } from './RecipientPicker';

const DEBOUNCE_MS = 250;

const DAY_NAMES = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

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
  anchorFor,
}: {
  levelId: string;
  onFindAbility: (text: string) => void;
  /** The ask-card's connect button lands in Settings, where the drawer is. */
  onOpenSettings: () => void;
  /** The world's live sprite-anchor query, for the ask-bubble (D-084). */
  anchorFor: { current: AnchorFn | null };
}) {
  const [text, setText] = useState('');
  const [plan, setPlan] = useState<WorkPlan | null>(null);
  /**
   * A channel picked on the ask-card — only ever one of the options the
   * server offered (D-079). Null means the server's own default applies:
   * the asked channel when it is usable, otherwise none (a draft job).
   */
  const [channel, setChannel] = useState<string | null>(null);
  /** Whether the ask currently floats over the agentling; false means the
   *  in-bar card carries it instead (D-084's fallback). */
  const [bubbleUp, setBubbleUp] = useState(false);
  const onAnchored = useCallback((anchored: boolean) => setBubbleUp(anchored), []);
  /** First Start press on a doomed queue arms the honest relabel (D-087). */
  const [armed, setArmed] = useState(false);
  /** Answers by question id. Empty is always a valid state — Start never waits. */
  const [answers, setAnswers] = useState<Record<string, string>>({});
  /** Files dropped on the box, read once and sent with the job that uses them. */
  const [files, setFiles] = useState<Attached[]>([]);
  /** "Run as one job" — the escape from a split the user didn't mean (D-105). */
  const [single, setSingle] = useState(false);
  /** The folder picked to reorganize, when the sentence wants one (D-132). */
  const [organizeRoot, setOrganizeRoot] = useState<string | null>(null);
  /** The schedule just made without a run, so its first firing is visible (D-106). */
  const [scheduled, setScheduled] = useState<ScheduleInfo | null>(null);
  /** Repeat this sentence on a cadence (D-103). 'off' queues once, as ever. */
  const [repeatKind, setRepeatKind] = useState<'off' | 'daily' | 'weekly' | 'monthly'>('off');
  const [repeatDow, setRepeatDow] = useState(1);
  const [repeatDay, setRepeatDay] = useState(1);
  const [repeatTime, setRepeatTime] = useState('09:00');
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

  /** What the current plan was computed for — a pick survives a re-plan of
   *  the same sentence (confirming a near-miss re-plans, D-093) and dies
   *  with a new one, which is D-079's "a pick belongs to its card". */
  const plannedFor = useRef('');
  // The two send answers re-plan as they are typed, because whether this job
  // is free depends on them: with both in hand a bare send is composed in
  // code, and the card has to say "Free" while the user is still deciding
  // rather than after they have paid (D-097). Debounced like the sentence.
  const sendTo = answers['send-to'] ?? '';
  const sendSay = answers['send-say'] ?? '';
  useEffect(() => {
    const query = text.trim();
    if (!query) {
      setPlan(null);
      return;
    }
    const timer = window.setTimeout(() => {
      void api<WorkPlan>(
        lvl(levelId, '/work/plan'),
        postJson({
          text: query,
          ...(channel ? { channel } : {}),
          ...(single ? { single: true } : {}),
          answers: { 'send-to': sendTo, 'send-say': sendSay },
        }),
      )
        .then((next) => {
          setPlan(next);
          if (plannedFor.current !== query) {
            setChannel(null);
            // A one-job choice belongs to its sentence, like a channel pick.
            setSingle(false);
          }
          plannedFor.current = query;
          setArmed(false);
        })
        .catch(() => setPlan(null));
    }, DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [text, levelId, channel, sendTo, sendSay, single]);

  /** The send facts live on the ask card whenever one is up (D-087). */
  const sendQuestions = plan?.questions.filter((q) => q.id.startsWith('send-')) ?? [];
  const cardUp = !!plan?.channelAsk && plan.channelAsk.state !== 'ready';

  /**
   * The channel's opted-in people, behind the To field (D-092). Fetching is
   * also the quiet refresh, by decision — the route merges getUpdates and
   * the send audit before answering.
   */
  const [audience, setAudience] = useState<AudiencePerson[]>([]);
  /** Why the live source refused (D-122) — shown in the picker, not swallowed. */
  const [audienceProblem, setAudienceProblem] = useState<string | undefined>(undefined);
  const effectiveChannel = channel ?? plan?.channelAsk?.channel ?? null;
  useEffect(() => {
    if (!effectiveChannel) {
      setAudience([]);
      setAudienceProblem(undefined);
      return;
    }
    void api<AudienceReply>(`/api/channels/${effectiveChannel}/audience`)
      .then((reply) => {
        setAudience(reply.people);
        setAudienceProblem(reply.problem);
      })
      .catch(() => {
        setAudience([]);
        setAudienceProblem(undefined);
      });
  }, [effectiveChannel]);

  // An address already in the sentence answers "who" — and so does a name
  // the roster knows uniquely, aliases included (D-094): "to Pepo" prefills
  // Jose through the name a reviewed send taught it. Prefill, never
  // overwrite, and never on ambiguity — the arrest catches an empty field.
  useEffect(() => {
    if (!plan?.questions.some((q) => q.id === 'send-to')) return;
    const addr = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0];
    const known = addr ? null : matchRecipient(text, audience);
    const fill = addr ?? (known ? `${known.name} — ${known.id}` : null);
    if (fill) setAnswers((prev) => (prev['send-to']?.trim() ? prev : { ...prev, 'send-to': fill }));
  }, [plan, text, audience]);
  const looseQuestions = plan?.questions.filter((q) => !(cardUp && q.id.startsWith('send-'))) ?? [];
  const answerFact = (id: string, value: string) =>
    setAnswers((prev) => ({ ...prev, [id]: value }));

  /**
   * What turns the first Start press into a warning instead of a queue: a run
   * the desk already knows is doomed — no recipient, no message on a bare
   * send, a sentence leaning on an attachment nothing carries, or nothing
   * that can send. Recomputed each render, so fixing the reason turns Start
   * back into Start, armed or not.
   */
  /** A near-miss the user confirmed (D-093) — a send by their say-so. */
  const mentionPicked = !plan?.channelAsk && !!channel && !!plan?.channelMention;
  const arrest = (() => {
    const parts: string[] = [];
    // "The attached X" with an empty queue dooms any plan shape, send or
    // not — the run has no other way to receive a file (D-134; the proof
    // run's whole delivery was the question back).
    if (missingAttachment(text, files.length)) parts.push('nothing attached');
    const ask = plan?.channelAsk;
    if (!ask && !mentionPicked) return parts.length ? parts.join(' · ') : null;
    const to = answers['send-to']?.trim();
    // 'Invitees' never counts as missing (D-124) — an event for just you
    // queues; only a filled field can be wrong, caught just below.
    if (missingRecipient(sendQuestions, to)) parts.push('no recipient');
    const effective = channel ?? ask?.channel;
    // A filled recipient the channel's contract cannot reach — a name where
    // a chat id belongs — is the 71¢ wall, caught before money moves (D-091).
    if (to && effective) {
      const problem = recipientProblem(effective, to);
      if (problem) parts.push(problem);
    }
    // The message is the contract's other un-inventable fact: a bare send
    // queued without it can only spend a session asking for it (D-087).
    if (missingWords(sendQuestions, answers['send-say'])) parts.push('no message');
    if (ask) {
      if (!effective) parts.push('a draft that sends nothing');
      else {
        const usable = channel
          ? ask.options.find((o) => o.channel === channel)?.state === 'ready'
          : ask.state === 'ready';
        if (!usable) parts.push('you connect at review');
      }
    }
    return parts.length ? parts.join(' · ') : null;
  })();

  /** The cadence the controls describe, or null when this runs once. */
  const cadence = (): Cadence | null => {
    if (repeatKind === 'off') return null;
    const [h, m] = repeatTime.split(':').map(Number);
    return {
      kind: repeatKind,
      ...(repeatKind === 'weekly' ? { dow: repeatDow } : {}),
      ...(repeatKind === 'monthly' ? { day: repeatDay } : {}),
      hour: Number.isFinite(h) ? h : 9,
      minute: Number.isFinite(m) ? m : 0,
    };
  };

  /**
   * Schedule without running now (D-106): the first firing is the cadence's
   * own next occurrence — created on Aug 6, "monthly on the 1st" first fires
   * Sep 1 — which is exactly what a job on a real cadence wants, and what
   * Start (which also runs today) cannot offer. The server computes the
   * date; this only shows it.
   */
  const scheduleOnly = async () => {
    const repeat = cadence();
    if (!repeat || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const made = await api<ScheduleInfo>(
        lvl(levelId, '/schedules'),
        postJson({
          text: text.trim(),
          cadence: repeat,
          ...(channel ? { channel } : {}),
          ...(Object.keys(answers).length > 0 ? { answers } : {}),
        }),
      );
      setScheduled(made);
      setText('');
      setPlan(null);
      setChannel(null);
      setAnswers({});
      setRepeatKind('off');
      setSingle(false);
      setOrganizeRoot(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** Pick the folder to reorganize — the native dialog is the only source of
   *  an absolute path (D-102/D-132). */
  const pickOrganizeFolder = async () => {
    setError(null);
    try {
      const picked = await api<{ path?: string; cancelled?: boolean; error?: string }>(
        '/api/pick-folder',
        { method: 'POST' },
      );
      if (picked.path) setOrganizeRoot(picked.path);
      else if (picked.error) setError(picked.error);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

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
          ...(organizeRoot ? { organizeRoot } : {}),
          ...(single ? { single: true } : {}),
        }),
      );
      // The schedule stores what Start carried — the sentence verbatim (the
      // recipe key is the prompt, D-072), the pick and the card's answers —
      // and never the files: attachments ride one run only (D-103).
      const repeat = files.length === 0 ? cadence() : null;
      if (repeat) {
        await api(
          lvl(levelId, '/schedules'),
          postJson({
            text: text.trim(),
            cadence: repeat,
            ...(channel ? { channel } : {}),
            ...(Object.keys(answers).length > 0 ? { answers } : {}),
          }),
        );
      }
      setText('');
      setPlan(null);
      setChannel(null);
      setAnswers({});
      setOrganizeRoot(null);
      setFiles([]);
      setRepeatKind('off');
      setSingle(false);
      setScheduled(null);
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
    if (plan?.needsRepo) {
      setAskingRepo(true);
      return;
    }
    // An organize job needs its folder, and a folder can only be picked, never
    // typed (D-132). Pressing Start with none opens the native Select Folder
    // dialog rather than queuing something with nothing to organize — the
    // repo ask's twin, one line above.
    if (plan?.organize && !organizeRoot) {
      void pickOrganizeFolder();
      return;
    }
    // A doomed queue costs one extra press, with the reason on the button —
    // never a modal, and Start stays one press whenever the run can land
    // (D-087, the repo ask's twin).
    if (arrest && !armed) {
      setArmed(true);
      return;
    }
    void queue();
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
          onChange={(e) => {
            setText(e.target.value);
            // A new sentence retires the last schedule-only confirmation.
            if (scheduled) setScheduled(null);
          }}
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
          {armed && arrest ? `Queue anyway — ${arrest}` : 'Start'}
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

      {/* Steps (D-105): the split Start will queue, shown before anything
          runs — each step quoted on its own sentence, with "run as one job"
          one click away because a wrong split must be visible, never
          silent. */}
      {plan?.steps && !askingRepo && (
        <p className="work-gaps work-steps">
          <span className="dim">runs as {plan.steps.length} steps:</span>
          {plan.steps.map((s, i) => (
            <span key={s.sentence} className="work-step">
              {i + 1}. {s.title}
              <span className={s.quote.ceilingUsd === 0 ? ' quote-free' : ' quote-cost'}>
                {' '}
                {s.quote.wording}
              </span>
            </span>
          ))}
          <button className="work-link" onClick={() => setSingle(true)}>
            run as one job
          </button>
        </p>
      )}
      {single && plan && !askingRepo && (
        <p className="work-gaps work-steps">
          <span className="dim">running as one job</span>
          {' · '}
          <button className="work-link" onClick={() => setSingle(false)}>
            split into steps
          </button>
        </p>
      )}

      {/* Repeats (D-103): the same sentence queued again on a cadence. The
          schedule is created beside the job at Start, so the first run is
          now and the next is on the calendar. */}
      {plan && !askingRepo && (
        <p className="work-gaps work-repeat">
          {files.length > 0 ? (
            <span className="dim">runs once — attached files ride one run only</span>
          ) : (
            <>
              <span className="dim">repeats:</span>
              {(['off', 'daily', 'weekly', 'monthly'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={repeatKind === k ? 'work-chip on' : 'work-chip'}
                  onClick={() => setRepeatKind(k)}
                >
                  {k === 'off' ? 'no' : k}
                </button>
              ))}
              {repeatKind === 'weekly' && (
                <select
                  className="work-q-text work-repeat-pick"
                  value={repeatDow}
                  onChange={(e) => setRepeatDow(Number(e.target.value))}
                  aria-label="Which day of the week"
                >
                  {DAY_NAMES.map((d, i) => (
                    <option key={d} value={i}>
                      {d}
                    </option>
                  ))}
                </select>
              )}
              {repeatKind === 'monthly' && (
                <label className="dim">
                  on day{' '}
                  <input
                    className="work-q-text work-repeat-day"
                    type="number"
                    min={1}
                    max={31}
                    value={repeatDay}
                    onChange={(e) =>
                      setRepeatDay(Math.min(31, Math.max(1, Number(e.target.value) || 1)))
                    }
                    aria-label="Which day of the month"
                  />
                </label>
              )}
              {repeatKind !== 'off' && (
                <>
                  <label className="dim">
                    at{' '}
                    <input
                      className="work-q-text work-repeat-time"
                      type="time"
                      value={repeatTime}
                      onChange={(e) => setRepeatTime(e.target.value)}
                      aria-label="At what time"
                    />
                  </label>
                  <span className="dim">· queued again then, reviewed like any job</span>
                  {/* Start runs today as well; a job on a real cadence may
                      want its first run ON the cadence (D-106). Hidden on a
                      doomed send — the arrest owns that conversation. */}
                  {!arrest && (
                    <button className="work-link" disabled={busy} onClick={() => void scheduleOnly()}>
                      schedule only — no run today
                    </button>
                  )}
                </>
              )}
            </>
          )}
        </p>
      )}

      {plan?.channelAsk && !askingRepo && plan.channelAsk.state === 'ready' && (
        <p className="work-gaps work-channel-ready">
          sends via {plan.channelAsk.askedLabel} · every message waits for your review
        </p>
      )}

      {/* Organizing wants a folder, and only the native picker yields an
          absolute path (D-132) — never a text box for a path nobody can type.
          Until one is picked, Start has nothing to organize, so the pick is
          the gate. */}
      {plan?.organize && !askingRepo && (
        <div className="work-organize">
          {organizeRoot ? (
            <div className="work-organize-picked">
              <button
                type="button"
                className="work-folder-btn is-picked"
                onClick={() => void pickOrganizeFolder()}
                title="Choose a different folder"
              >
                <span className="work-folder-ic" aria-hidden="true">📁</span>
                <span className="work-organize-path">{organizeRoot}</span>
                <span className="work-folder-change">change</span>
              </button>
              <span className="work-organize-note">
                the crew proposes the moves — nothing changes until you approve
              </span>
            </div>
          ) : (
            <button
              type="button"
              className="work-folder-btn"
              onClick={() => void pickOrganizeFolder()}
            >
              <span className="work-folder-ic" aria-hidden="true">📁</span>
              Choose the folder to organize…
            </button>
          )}
        </div>
      )}

      {/* The near-miss (D-093): a channel word with no send verb — asked as
          a question, never claimed. Confirming is the fork-pick mechanism;
          the re-plan brings the To/Say facts from the server. */}
      {plan?.channelMention && !plan.channelAsk && !askingRepo && !channel && (
        <p className="work-gaps work-mention">
          mentions {plan.channelMention.label} — not read as a send (no send verb)
          {plan.channelMention.wired ? (
            <>
              {' · '}
              <button
                className="work-link"
                onClick={() => setChannel(plan.channelMention?.channel ?? null)}
              >
                yes — send via {plan.channelMention.label}
              </button>
            </>
          ) : (
            <span className="dim"> · say send / remind / message… if you meant one</span>
          )}
        </p>
      )}
      {mentionPicked && !askingRepo && plan?.channelMention && (
        <p className="work-gaps work-channel-ready">
          sends via {plan.channelMention.label} · every message waits for your review
          {' · '}
          <button className="work-link" onClick={() => setChannel(null)}>
            undo
          </button>
        </p>
      )}
      {plan?.channelAsk && !askingRepo && plan.channelAsk.state !== 'ready' && (
        <>
          {plan.agentling && (
            <AskBubble
              agentlingId={plan.agentling.id}
              anchorFor={anchorFor}
              onAnchored={onAnchored}
            >
              <div className={armed && arrest ? 'work-channel arrested' : 'work-channel'}>
                <ChannelAskCard
                  ask={plan.channelAsk}
                  picked={channel}
                  onPick={setChannel}
                  onUndo={() => setChannel(null)}
                  onOpenSettings={onOpenSettings}
                  variant="bubble"
                  prompt={text.trim()}
                  questions={sendQuestions}
                  answers={answers}
                  onAnswer={answerFact}
                  audience={audience}
                  audienceProblem={audienceProblem}
                />
              </div>
            </AskBubble>
          )}
          {!(plan.agentling && bubbleUp) && (
            <div className={armed && arrest ? 'work-channel arrested' : 'work-channel'}>
              <ChannelAskCard
                ask={plan.channelAsk}
                picked={channel}
                onPick={setChannel}
                onUndo={() => setChannel(null)}
                onOpenSettings={onOpenSettings}
                questions={sendQuestions}
                answers={answers}
                onAnswer={answerFact}
                audience={audience}
                audienceProblem={audienceProblem}
              />
            </div>
          )}
        </>
      )}

      {plan && !askingRepo && looseQuestions.length > 0 && (
        <div className="work-ask">
          {looseQuestions.map((q) => (
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
                {q.freeText && q.id === 'send-to' ? (
                  <RecipientPicker
                    className="work-q-text"
                    placeholder="or say which"
                    value={answers[q.id] ?? ''}
                    onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                    people={audience}
                    problem={audienceProblem}
                  />
                ) : q.freeText ? (
                  <input
                    className="work-q-text"
                    placeholder="or say which"
                    value={q.options.some((o) => o.label === answers[q.id]) ? '' : (answers[q.id] ?? '')}
                    onChange={(e) =>
                      setAnswers((prev) => ({ ...prev, [q.id]: e.target.value }))
                    }
                  />
                ) : null}
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

      {scheduled && !text.trim() && (
        <p className="work-gaps work-scheduled">
          scheduled — {scheduled.cadenceLabel}, first run{' '}
          {new Date(scheduled.nextDueAt).toLocaleString(undefined, {
            weekday: 'short',
            month: 'short',
            day: 'numeric',
            hour: '2-digit',
            minute: '2-digit',
          })}
          <span className="dim"> · it lands in review like any job · manage in crew → backoffice</span>
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
