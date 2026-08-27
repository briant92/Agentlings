import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type FormEvent,
  type KeyboardEvent,
} from 'react';
import type {
  AudiencePerson,
  AudienceReply,
  Cadence,
  ConnectionInfo,
  ScheduleInfo,
  VoiceReply,
  WorkPlan,
} from '@agentlings/shared';
import { MAX_ATTACHMENT_BYTES, MAX_ATTACHMENTS, VOICE_SWEEP_MS } from '@agentlings/shared';
import { api, lvl, postJson } from '../api';
import type { AnchorFn } from '../world/anchor';
import {
  alsoAskedLine,
  authoringSentence,
  matchRecipient,
  missingAttachment,
  missingRecipient,
  missingWords,
  recipientProblem,
  reconcileGap,
} from './askFacts';
import { AskBubble } from './AskBubble';
import { ChannelAskCard } from './ChannelAskCard';
import { ChannelLogo } from './ChannelLogo';
import { doorChoices, doorsRefused, holdsLine, watchChoices, watchedTools } from './doors';
import { refusalDesk, whoSuffix } from './planLine';
import { RecipientPicker } from './RecipientPicker';
import { previewLine, type PreviewLine, type TriggerPreviewReply } from './trigger';
import { voiceHead, voiceHold } from './voice';
import {
  acceptGhost,
  gapClass,
  ghostFor,
  paintClass,
  paintPieces,
  usableSpans,
} from './workSpans';

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
  /**
   * The person chose to watch this job act in a browser (D-255): Start then
   * NAMES the supervised door beside every door the job would have held
   * anyway. Off by default and reset after every Start — a job holds it
   * only when this was ticked for it, never because the switch is on.
   */
  const [watch, setWatch] = useState(false);
  /** The folder picked to reorganize, when the sentence wants one (D-132). */
  const [organizeRoot, setOrganizeRoot] = useState<string | null>(null);
  /** The schedule just made without a run, so its first firing is visible (D-106). */
  const [scheduled, setScheduled] = useState<ScheduleInfo | null>(null);
  /**
   * Repeat this sentence on a cadence (D-103), or fire it when mail arrives
   * (D-248) — 'mail' is the fifth chip on the same row, because it is the
   * same idea: a sentence queued again by something other than you. 'off'
   * queues once, as ever.
   */
  const [repeatKind, setRepeatKind] = useState<'off' | 'daily' | 'weekly' | 'monthly' | 'mail'>(
    'off',
  );
  const [repeatDow, setRepeatDow] = useState(1);
  const [repeatDay, setRepeatDay] = useState(1);
  const [repeatTime, setRepeatTime] = useState('09:00');
  /** The Gmail query a mail trigger polls — typed, never read off the sentence. */
  const [triggerQuery, setTriggerQuery] = useState('');
  /** What that query reaches right now, asked of the server as it is typed. */
  const [triggerPreview, setTriggerPreview] = useState<PreviewLine | null>(null);
  /**
   * The doors a schedule or rule's firing will hold (D-254): exactly the
   * chips ticked, none by default. Only a repeat carries them — a hand-queued
   * job gets its grant the ordinary way — so the picks are cleared whenever
   * the repeat row turns off, and a chip nobody can see never names a door.
   */
  const [doors, setDoors] = useState<string[]>([]);
  /**
   * Files a firing reads afresh (D-246). Not attachments: attachments ride one
   * run, and these are re-read from the folder every time the schedule fires,
   * which is what lets "reconcile the books monthly" reach next month's
   * statement without anyone attaching anything again.
   *
   * `matched` is what the rule finds *right now*, asked of the server as the
   * rule is typed — a filter matching nothing has to look different at the
   * desk from one matching correctly, or the difference only shows at 08:10
   * on the first of the month.
   */
  const [standing, setStanding] = useState<
    { dir: string; match: string; as: string; matched?: string | null }[]
  >([]);
  const [dragging, setDragging] = useState(false);
  const [askingRepo, setAskingRepo] = useState(false);
  const [repoPath, setRepoPath] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connections, setConnections] = useState<ConnectionInfo[]>([]);
  const live = connections.filter((c) => c.enabled);
  /** The doors this install cannot offer at all (#30) — computed once per render. */
  const refusedDoors = doorsRefused(connections);

  useEffect(() => {
    void api<ConnectionInfo[]>('/api/connections')
      .then((list) => setConnections(list.filter((c) => c.ready)))
      .catch(() => setConnections([]));
  }, []);

  /**
   * Voice notes waiting at the desk (D-265). Polled, because the server
   * learns of one on its own sweep and the socket carries the world, not the
   * desk. `voiceId` is the note whose words are in the box: Start carries it
   * so the audio rides the job, and clearing the box lets it go.
   */
  const [voice, setVoice] = useState<VoiceReply | null>(null);
  const [voiceId, setVoiceId] = useState<string | null>(null);
  const refreshVoice = useCallback(() => {
    void api<VoiceReply>('/api/voice')
      .then(setVoice)
      .catch(() => setVoice(null));
  }, []);
  useEffect(() => {
    refreshVoice();
    const timer = window.setInterval(refreshVoice, VOICE_SWEEP_MS);
    return () => window.clearInterval(timer);
  }, [refreshVoice]);
  const dismissVoice = async (id: string) => {
    try {
      await api(`/api/voice/${encodeURIComponent(id)}/dismiss`, { method: 'POST' });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
    if (voiceId === id) setVoiceId(null);
    refreshVoice();
  };

  /** What the current plan was computed for — a pick survives a re-plan of
   *  the same sentence (confirming a near-miss re-plans, D-093) and dies
   *  with a new one, which is D-079's "a pick belongs to its card". */
  const plannedFor = useRef('');
  // The two send answers re-plan as they are typed, because whether this job
  // is free depends on them: with both in hand a bare send is composed in
  // code, and the card has to say "Free" while the user is still deciding
  // rather than after they have paid (D-097). Debounced like the sentence.
  // Every send fact, not two named ones (D-180): a job may ask a recipient
  // per channel, and a re-plan that carried only the first would price the
  // card on half of what the user has typed.
  const sendAnswers = Object.fromEntries(
    Object.entries(answers).filter(([id]) => id.startsWith('send-')),
  );
  const sendKey = JSON.stringify(sendAnswers);
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
          answers: sendAnswers,
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
  }, [text, levelId, channel, sendKey, single]);

  /**
   * A cadence the sentence carries (D-184), filled into the controls once per
   * sentence — never re-applied, so turning it off stays off while the user
   * keeps typing. `cadenceFor` remembers which sentence it filled, the way
   * `plannedFor` remembers which sentence a pick belongs to.
   */
  const cadenceFor = useRef('');
  useEffect(() => {
    // A mail trigger in the words (D-248) takes the chip the same way a
    // cadence does, and only the chip: the query is never guessed.
    const readTrigger = plan?.trigger;
    const read = plan?.cadence;
    const sentence = text.trim();
    if (!sentence) return;
    // Only ever act on a plan that belongs to *this* sentence. `text` changes
    // a beat before its plan arrives, so without this the effect applies the
    // previous sentence's reading to the new words and then records it as
    // this sentence's own — which is how "telegram me the UF on Monday",
    // typed over a weekly sentence, kept the weekly chip armed. Seen live;
    // the clearing branch below could not fire because the ref already
    // matched.
    if (plannedFor.current !== sentence) return;
    if (!read && !readTrigger) {
      // The sentence no longer reads as a repeat, so a repeat *this effect*
      // set no longer applies — seen live: reading "every Monday at 9", then
      // typing "telegram me the UF on Monday" over it, left the weekly chip
      // armed, and Start would have made a schedule out of a one-off. Only a
      // fill of ours is cleared; a repeat the user chose by hand is theirs.
      if (cadenceFor.current && cadenceFor.current !== sentence) {
        cadenceFor.current = '';
        setRepeatKind('off');
      }
      return;
    }
    if (cadenceFor.current === sentence) return;
    cadenceFor.current = sentence;
    if (readTrigger || !read) {
      setRepeatKind('mail');
      return;
    }
    setRepeatKind(read.cadence.kind);
    if (read.cadence.dow !== undefined) setRepeatDow(read.cadence.dow);
    if (read.cadence.day !== undefined) setRepeatDay(read.cadence.day);
    setRepeatTime(
      `${String(read.cadence.hour).padStart(2, '0')}:${String(read.cadence.minute).padStart(2, '0')}`,
    );
  }, [plan, text]);

  /**
   * The live highlight: the plan's spans painted behind the box by a
   * decorative, aria-hidden twin. The input stays the only control — the twin
   * renders what the server already computed and nothing else, and a ghost is
   * taken solely by Tab, whose edit then re-plans like any typed one (D-093:
   * correction is the user's move, never the matcher's).
   */
  const inputRef = useRef<HTMLInputElement>(null);
  const paintRef = useRef<HTMLDivElement>(null);
  const [caret, setCaret] = useState(0);
  /** Escape, or any keystroke but Tab, dismisses the ghost until the next re-plan. */
  const [ghostDropped, setGhostDropped] = useState(false);
  useEffect(() => setGhostDropped(false), [plan]);
  const spans = usableSpans(text, plannedFor.current, plan?.spans);
  const ghost = ghostDropped ? null : ghostFor(caret, spans, plan?.suggestions);
  /** What the crew will refuse in this sentence, said before Start (#22). */
  const refusal = refusalDesk(plan?.refuses);
  /** The twin scrolls exactly with the box, or the underlines drift. */
  const syncPaint = () => {
    if (paintRef.current && inputRef.current) {
      paintRef.current.scrollLeft = inputRef.current.scrollLeft;
    }
  };
  useEffect(() => {
    syncPaint();
    window.addEventListener('resize', syncPaint);
    return () => window.removeEventListener('resize', syncPaint);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text]);
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    // No ghost showing: Tab stays ordinary focus navigation, untouched.
    if (!ghost) return;
    if (e.key === 'Tab') {
      e.preventDefault();
      const took = acceptGhost(text, ghost);
      setText(took.next);
      setGhostDropped(true);
      const box = e.currentTarget;
      requestAnimationFrame(() => box.setSelectionRange(took.caret, took.caret));
    } else if (e.key === 'Escape') {
      setGhostDropped(true);
    } else if (!['Shift', 'Control', 'Alt', 'Meta'].includes(e.key)) {
      setGhostDropped(true);
    }
  };

  /** The send facts live on the ask card whenever one is up (D-087). */
  const sendQuestions = plan?.questions.filter((q) => q.id.startsWith('send-')) ?? [];
  const cardUp = !!plan?.channelAsk && plan.channelAsk.state !== 'ready';

  /**
   * The channel's opted-in people, behind the To field (D-092). Fetching is
   * also the quiet refresh, by decision — the route merges getUpdates and
   * the send audit before answering.
   */
  /**
   * One roster per channel (D-180). A job can ask for two, and each picker
   * has to offer the people *that* channel knows — a Telegram chat id has no
   * business in the Gmail field, and offering it there is how a recipient
   * ends up on the wrong contract.
   */
  const [audiences, setAudiences] = useState<Record<string, AudienceReply>>({});
  const effectiveChannel = channel ?? plan?.channelAsk?.channel ?? null;
  /** Every channel with a field on the card, so each is fetched exactly once. */
  const askChannels = [
    ...new Set(
      (plan?.questions ?? [])
        .map((q) => q.channel)
        .filter((c): c is string => !!c)
        .concat(effectiveChannel ? [effectiveChannel] : []),
    ),
  ];
  const audienceKey = askChannels.join(',');
  useEffect(() => {
    for (const each of audienceKey ? audienceKey.split(',') : []) {
      if (audiences[each]) continue;
      void api<AudienceReply>(`/api/channels/${each}/audience`)
        .then((reply) => setAudiences((prev) => ({ ...prev, [each]: reply })))
        .catch(() => setAudiences((prev) => ({ ...prev, [each]: { people: [] } })));
    }
    // `audiences` is deliberately not a dependency: it is what this writes,
    // and reading it here only skips work already done.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [audienceKey]);
  const peopleOn = (c: string | undefined) => (c ? (audiences[c]?.people ?? []) : []);
  const problemOn = (c: string | undefined) => (c ? audiences[c]?.problem : undefined);

  // An address already in the sentence answers "who" — and so does a name
  // the roster knows uniquely, aliases included (D-094): "to Sammy" prefills
  // Sample through the name a reviewed send taught it. Prefill, never
  // overwrite, and never on ambiguity — the arrest catches an empty field.
  useEffect(() => {
    const recipients = (plan?.questions ?? []).filter(
      (q) => q.id.startsWith('send-to') && q.channel,
    );
    if (recipients.length === 0) return;
    // Per channel, against that channel's own roster (D-180). An address
    // typed in the sentence fills the channel that takes addresses; a name
    // fills whichever channels know it, each with their own id for them.
    const addr = text.match(/[\w.+-]+@[\w-]+(?:\.[\w-]+)+/)?.[0];
    setAnswers((prev) => {
      let next = prev;
      for (const q of recipients) {
        if (next[q.id]?.trim()) continue;
        const known = matchRecipient(text, peopleOn(q.channel));
        const takesAddress = peopleOn(q.channel).some((p) => p.id.includes('@'));
        const fill = known
          ? `${known.name} — ${known.id}`
          : addr && (q.channel === 'gmail' || takesAddress)
            ? addr
            : null;
        if (fill) next = next === prev ? { ...prev, [q.id]: fill } : { ...next, [q.id]: fill };
      }
      return next;
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [plan, text, audienceKey, audiences]);
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
    // A reconciliation with one side or none (D-224, RECONCILE B2): the
    // server named the verb, the card counts the files. Its reason is the
    // specific one, so the generic 'nothing attached' stands down for it.
    const reconcileReason = plan?.reconcile ? reconcileGap(files) : null;
    if (reconcileReason) parts.push(reconcileReason);
    else if (missingAttachment(text, files.length)) parts.push('nothing attached');
    // "Build me a level" is authoring, and authoring lives behind the New
    // Level door where it prices as design work (D-110, D-144) — typed here
    // it would run as an ordinary worker job.
    if (authoringSentence(text)) parts.push('worlds are authored from + New Level');
    const ask = plan?.channelAsk;
    if (!ask && !mentionPicked) return parts.length ? parts.join(' · ') : null;
    // 'Invitees' never counts as missing (D-124) — an event for just you
    // queues; only a filled field can be wrong, caught just below.
    const empty = missingRecipient(sendQuestions, answers);
    if (empty.length > 0) {
      // Named when there is more than one field, because "no recipient"
      // beside two boxes does not say which (D-180).
      parts.push(
        sendQuestions.filter((q) => q.id.startsWith('send-to')).length > 1
          ? `no recipient for ${empty.join(' or ')}`
          : 'no recipient',
      );
    }
    // A filled recipient the channel's contract cannot reach — a name where
    // a chat id belongs — is the 71¢ wall, caught before money moves (D-091).
    // Per field now: each channel judges its own by its own shape.
    for (const q of sendQuestions) {
      const value = answers[q.id]?.trim();
      const on = q.channel ?? channel ?? ask?.channel;
      if (!value || !on || !q.id.startsWith('send-to')) continue;
      const problem = recipientProblem(on, value);
      if (problem) parts.push(problem);
    }
    const effective = channel ?? ask?.channel;
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

  /**
   * The rule's reach, asked as it is typed (D-248) — D-246's live match, for
   * mail. Debounced so a query being typed is not ten Gmail calls, and read
   * through the same route the poll's guard rides, so the line and the firing
   * agree about what counts. `fetch` rather than `api()` on purpose: the 502
   * wall is an answer here, not a failure.
   */
  useEffect(() => {
    if (repeatKind !== 'mail') return;
    const q = triggerQuery.trim();
    if (!q) {
      setTriggerPreview(null);
      return;
    }
    let stale = false;
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/trigger/preview?q=${encodeURIComponent(q)}`);
        const body = (await res.json().catch(() => ({}))) as TriggerPreviewReply['body'];
        if (!stale) setTriggerPreview(previewLine({ status: res.status, body }));
      } catch {
        if (!stale) setTriggerPreview({ tone: 'miss', text: 'the preview could not be read' });
      }
    }, 300);
    return () => {
      stale = true;
      clearTimeout(timer);
    };
  }, [repeatKind, triggerQuery]);

  useEffect(() => {
    if (repeatKind === 'off') setDoors([]);
  }, [repeatKind]);

  /**
   * Arm a mail trigger (D-248): the schedule alone, nothing run today — a
   * trigger has nothing to run until the mail comes, so this is the only
   * thing Start can mean while the mail chip is on. The confirmation line
   * says what the rule waits for; the row is in the backoffice from here.
   */
  const armTrigger = async () => {
    const q = triggerQuery.trim();
    if (!q || !text.trim()) return;
    setBusy(true);
    setError(null);
    try {
      const made = await api<ScheduleInfo>(
        lvl(levelId, '/schedules'),
        postJson({
          text: text.trim(),
          trigger: { mail: q },
          tools: doors,
          ...(channel ? { channel } : {}),
          ...(Object.keys(answers).length > 0 ? { answers } : {}),
          ...(standingInputs().length > 0 ? { inputs: standingInputs() } : {}),
        }),
      );
      setScheduled(made);
      setText('');
      setPlan(null);
      setChannel(null);
      setAnswers({});
      setRepeatKind('off');
      setTriggerQuery('');
      setTriggerPreview(null);
      setStanding([]);
      setSingle(false);
      setWatch(false);
      setOrganizeRoot(null);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  /** The cadence the controls describe, or null when this runs once — or waits for mail. */
  const cadence = (): Cadence | null => {
    if (repeatKind === 'off' || repeatKind === 'mail') return null;
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
          tools: doors,
          ...(channel ? { channel } : {}),
          ...(Object.keys(answers).length > 0 ? { answers } : {}),
          ...(standingInputs().length > 0 ? { inputs: standingInputs() } : {}),
        }),
      );
      setScheduled(made);
      setText('');
      setPlan(null);
      setChannel(null);
      setAnswers({});
      setRepeatKind('off');
      setStanding([]);
      setSingle(false);
      setWatch(false);
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

  /**
   * Add a folder for a firing to read. The native dialog is the only source of
   * an absolute path (D-102/D-132), the same door the organize pick uses.
   * The landing name is prefilled from whatever is newest in the folder right
   * now, so the row starts with a real filename rather than a blank the user
   * has to invent — they will usually shorten it, which is the point: the
   * source name changes month to month and the prompt's must not.
   */
  const addStandingFolder = async () => {
    setError(null);
    try {
      const picked = await api<{ path?: string; cancelled?: boolean; error?: string }>(
        '/api/pick-folder',
        { method: 'POST' },
      );
      if (picked.error) return setError(picked.error);
      if (!picked.path) return;
      const dir = picked.path;
      const seen = await api<{ name: string | null }>(
        `/api/standing/match?dir=${encodeURIComponent(dir)}`,
      ).catch(() => ({ name: null }));
      setStanding((rows) => [
        ...rows,
        { dir, match: '', as: seen.name ?? '', matched: seen.name },
      ]);
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    }
  };

  /**
   * Re-ask what each rule matches when a rule changes. Debounced, because this
   * fires on every keystroke in the filter box and the answer is a disk read.
   */
  const standingKey = JSON.stringify(standing.map((r) => [r.dir, r.match]));
  useEffect(() => {
    if (standing.length === 0) return;
    const timer = setTimeout(() => {
      void Promise.all(
        standing.map((r) =>
          api<{ name: string | null }>(
            `/api/standing/match?dir=${encodeURIComponent(r.dir)}&match=${encodeURIComponent(r.match)}`,
          )
            .then((a) => a.name)
            .catch(() => null),
        ),
      ).then((names) => {
        setStanding((rows) =>
          rows.map((r, i) => (i < names.length ? { ...r, matched: names[i] } : r)),
        );
      });
    }, 300);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [standingKey]);

  /** What rides the schedule, dropping any row still missing a landing name. */
  const standingInputs = () =>
    standing
      .filter((r) => r.dir && r.as.trim())
      .map((r) => ({ dir: r.dir, ...(r.match.trim() ? { match: r.match.trim() } : {}), as: r.as.trim() }));

  const queue = async (folder?: string, planned = false) => {
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
          // The planner proposes the split, reviewed before any hand runs
          // (TEAMWORK T3) — asked by the button, never inferred.
          ...(planned ? { planParty: true } : {}),
          // Watching (D-255): the supervised door is named beside every door
          // the job would have held anyway — a list is exactly those, so
          // naming one must not drop the rest. Otherwise no list at all, and
          // the server's default grant leaves the supervised door out.
          ...(watch && repeatKind === 'off' ? { tools: watchedTools(connections) } : {}),
          // The note the words came from (D-265): its audio rides the job.
          ...(voiceId ? { voice: voiceId } : {}),
        }),
      );
      // The schedule stores what Start carried — the sentence verbatim (the
      // recipe key is the prompt, D-072), the pick and the card's answers —
      // and never the attached files, which ride one run only (D-103). What it
      // may carry instead is a standing input: a folder and a rule, re-read at
      // every firing (D-246). The two are exclusive by construction — the
      // repeat row is hidden while files are attached.
      const repeat = files.length === 0 ? cadence() : null;
      if (repeat) {
        await api(
          lvl(levelId, '/schedules'),
          postJson({
            text: text.trim(),
            cadence: repeat,
            tools: doors,
            // Start just queued this sentence: its refusals were counted there (D-259).
            queued: true,
            ...(channel ? { channel } : {}),
            ...(Object.keys(answers).length > 0 ? { answers } : {}),
            ...(standingInputs().length > 0 ? { inputs: standingInputs() } : {}),
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
      setStanding([]);
      setSingle(false);
      setScheduled(null);
      setAskingRepo(false);
      setRepoPath('');
      if (voiceId) {
        setVoiceId(null);
        refreshVoice();
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
    } finally {
      setBusy(false);
    }
  };

  const submit = (e: FormEvent) => {
    e.preventDefault();
    if (!text.trim()) return;
    // With the mail chip on, Start is Arm: there is nothing to run today.
    if (repeatKind === 'mail') {
      void armTrigger();
      return;
    }
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
      // …unless this install has no dialog to open (#30): pressing Start
      // would otherwise reach the picker and come back with an error, which
      // is the fault this ticket exists to close one layer down.
      if (plan.organizeRefused) {
        setError(plan.organizeRefused);
        return;
      }
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
      {/* Voice notes (D-265): each one quoted back with the words it became, or
          the reason it became none. Use puts the words in the box — the same
          reading and the same Start as a typed sentence; nothing queues here. */}
      {voice && voice.notes.length > 0 && (
        <ul className="work-voice">
          {voice.notes.map((note) => {
            const hold = voiceHold(note, voice.transcriber);
            const taken = voiceId === note.id;
            return (
              <li key={note.id} className={taken ? 'work-voice-note taken' : 'work-voice-note'}>
                <span className="work-voice-head">🎙 {voiceHead(note)}</span>
                {hold ? (
                  <span className="dim"> — {hold}</span>
                ) : (
                  <q className="work-voice-words">{note.transcript}</q>
                )}
                {!hold && !taken && (
                  <button
                    type="button"
                    className="work-voice-use"
                    onClick={() => {
                      setText(note.transcript ?? '');
                      setCaret((note.transcript ?? '').length);
                      setVoiceId(note.id);
                      if (scheduled) setScheduled(null);
                      inputRef.current?.focus();
                    }}
                  >
                    Use
                  </button>
                )}
                {taken && (
                  <span className="dim"> · in the box — fix anything misheard, then Start</span>
                )}
                <button
                  type="button"
                  className="work-voice-dismiss"
                  aria-label={`Dismiss the voice note from ${note.from}`}
                  onClick={() => void dismissVoice(note.id)}
                >
                  ✕
                </button>
              </li>
            );
          })}
        </ul>
      )}
      <form className="work-bar" onSubmit={submit}>
        <div className="work-input-wrap">
          <div className="work-input-paint" aria-hidden="true" ref={paintRef}>
            {(() => {
              let at = 0;
              return paintPieces(text, spans).flatMap((piece, i) => {
                const nodes = [
                  <span key={i} className={paintClass(piece.category, piece.text)}>
                    {piece.text}
                  </span>,
                ];
                at += piece.text.length;
                if (ghost && at === ghost.end) {
                  nodes.push(
                    <span key="ghost" className="wi-ghost">
                      {ghost.suggestion}
                    </span>,
                  );
                }
                return nodes;
              });
            })()}
          </div>
          <input
            ref={inputRef}
            className="work-input"
            data-tour="work"
            placeholder="What do you need done?"
            value={text}
            onChange={(e) => {
              setText(e.target.value);
              setCaret(e.target.selectionStart ?? 0);
              // A new sentence retires the last schedule-only confirmation.
              if (scheduled) setScheduled(null);
              // An emptied box lets the voice note go; an edit keeps it —
              // fixing a misheard word is the point of quoting it back.
              if (voiceId && !e.target.value.trim()) setVoiceId(null);
            }}
            onScroll={syncPaint}
            onSelect={(e) => setCaret(e.currentTarget.selectionStart ?? 0)}
            onKeyDown={onInputKeyDown}
          />
        </div>
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
        <button
          type="submit"
          disabled={!text.trim() || busy || (repeatKind === 'mail' && !triggerQuery.trim())}
        >
          {repeatKind === 'mail'
            ? 'Arm — watch for mail'
            : armed && arrest
              ? `Queue anyway — ${arrest}`
              : 'Start'}
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

      {/* What this install cannot offer at all, and why (#30). Not a switch
          and not a missing key — the machine under the install has no screen
          to open a window on — so it is said here, beside what the crew CAN
          reach, rather than left to a refusal halfway through a paid run.
          Refused rather than absent on purpose: a person deploying the
          template learns what the local version would have done. */}
      {refusedDoors.length > 0 && !askingRepo && (
        <p className="work-gaps work-conn-refused">
          {refusedDoors.map((c) => (
            <span key={c.name}>
              <span className="work-refused-name">{c.label.toLowerCase()}</span>
              {' — '}
              {c.unavailable}
            </span>
          ))}
        </p>
      )}

      {plan && !askingRepo && (
        <p className="work-plan">
          {plan.agentling ? (
            <>
              <span className="work-who">{plan.agentling.name}</span> will take this
              {whoSuffix(plan)}
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

      {/* What the crew will refuse (#22), said here rather than found inside a
          run that spent turns discovering it. D-093's shape — a line, never a
          block: Start stays enabled and the tail says so once, in the gap
          line's grey, because a fact about the button is not a fourth warning.
          Amber is the desk's own word for "read and said back, not refused"
          (.work-mention, .work-nofiles). The reason is the job board's `why`,
          verbatim; nothing here is counted (D-259). */}
      {plan &&
        !askingRepo &&
        refusal.lines.map((line) => (
          <p key={line.row} className="work-gaps work-refuses">
            {line.lead} — <span className="work-refuses-why">{line.why}</span>
            {line.does && <span className="work-refuses-does"> {line.does}</span>}
          </p>
        ))}
      {plan && !askingRepo && refusal.tail && (
        <p className="work-gaps work-refuses-tail">{refusal.tail}</p>
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

      {/* The party (TEAMWORK T2): the hands Start will queue, each priced on
          its own piece, the words the licence was read from quoted back
          (D-184) — and "run solo" one click away, because a fan-out the user
          did not mean must be one click from off. */}
      {plan?.party && !single && !askingRepo && (
        <p className="work-gaps work-steps">
          <span className="dim">
            read “{plan.party.words}” as a party of {plan.party.hands.length}:
          </span>
          {plan.party.hands.map((hand, i) => (
            <span key={hand.sentence} className="work-step">
              {i + 1}. {hand.title}
              <span className={hand.quote.ceilingUsd === 0 ? ' quote-free' : ' quote-cost'}>
                {' '}
                {hand.quote.wording}
              </span>
            </span>
          ))}
          <span className="work-step">
            then the gather
            <span className={plan.party.gather.quote.ceilingUsd === 0 ? ' quote-free' : ' quote-cost'}>
              {' '}
              {plan.party.gather.quote.wording}
            </span>
            {plan.party.sendTail ? <span className="dim"> · it also does: “{plan.party.sendTail}”</span> : null}
          </span>
          <button className="work-link" onClick={() => setSingle(true)}>
            run solo
          </button>
        </p>
      )}
      {plan?.partyBlocked && !single && !askingRepo && (
        <p className="work-gaps work-steps">
          <span className="dim">a party was asked, and cannot run: {plan.partyBlocked}</span>
          {plan.planQuote && (
            <button className="work-link" disabled={busy} onClick={() => void queue(undefined, true)}>
              let a planner propose the split ({plan.planQuote.wording})
            </button>
          )}
        </p>
      )}

      {/* Repeats (D-103): the same sentence queued again on a cadence. The
          schedule is created beside the job at Start, so the first run is
          now and the next is on the calendar. */}
      {/* The watch choice (D-255): a supervised door is never in the default
          grant, so the one way a hand-queued job holds it is this tick. Shown
          only while such a door is on and ready, and only for a job that runs
          now — a schedule or rule can never hold it, and the server refuses
          one that tries. */}
      {plan && !askingRepo && repeatKind === 'off' && watchChoices(connections).length > 0 && (
        <p className="work-gaps work-repeat">
          <span className="dim">watch:</span>
          {watchChoices(connections).map((c) => (
            <button
              key={c.name}
              type="button"
              className={watch ? 'work-chip on' : 'work-chip'}
              aria-pressed={watch}
              title={c.description}
              onClick={() => setWatch((v) => !v)}
            >
              {c.label.toLowerCase()}
            </button>
          ))}
          <span className="work-doors-read dim">
            · {watch ? 'a browser window opens on this screen; close it to end the run' : 'this job stays out of the browser'}
          </span>
        </p>
      )}
      {plan && !askingRepo && (
        <p className="work-gaps work-repeat">
          {files.length > 0 ? (
            <span className="dim">
              runs once — attached files ride one run only. For a repeat that
              reads the newest file each time, start without attachments.
            </span>
          ) : (
            <>
              <span className="dim">repeats:</span>
              {(['off', 'daily', 'weekly', 'monthly', 'mail'] as const).map((k) => (
                <button
                  key={k}
                  type="button"
                  className={repeatKind === k ? 'work-chip on' : 'work-chip'}
                  onClick={() => setRepeatKind(k)}
                >
                  {k === 'off' ? 'no' : k === 'mail' ? 'when mail arrives' : k}
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
              {repeatKind !== 'off' && repeatKind !== 'mail' && (
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
                  {/* What the sentence itself was read as (D-184), quoted so
                      the reading can be checked. Start with a repeat set makes
                      a schedule that spends money on a timer, so this never
                      passes silently — and "not a repeat" is one click. */}
                  {plan?.cadence && repeatKind === plan.cadence.cadence.kind && (
                    <span className="work-cadence-read">
                      {'· '}read “{plan.cadence.phrase}” as {plan.cadence.label}
                      {' · '}
                      <button className="work-link" onClick={() => setRepeatKind('off')}>
                        not a repeat
                      </button>
                    </span>
                  )}
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
              {/* The mail trigger (D-248): the raw Gmail query — the words
                  that actually reach the poll, in the language the crew's own
                  mail_search speaks — and, beneath it, what those words reach
                  right now. The sentence can turn the chip on (D-184's
                  doctrine) but never fills this field: "the bank" is not an
                  address, and a guessed rule spends money on a timer nobody
                  set. Start reads Arm while this is on. */}
              {repeatKind === 'mail' && (
                <>
                  <span className="dim">matching</span>
                  <input
                    className="work-q-text work-trigger-q"
                    value={triggerQuery}
                    placeholder="from:cartola@banco.cl subject:estado"
                    onChange={(e) => setTriggerQuery(e.target.value)}
                    aria-label="The Gmail query a mail must match"
                    autoFocus
                  />
                  <span className="dim">
                    · Gmail's own search words: from:, subject:, has:attachment, newer_than:
                  </span>
                  {plan?.trigger && (
                    <span className="work-cadence-read">
                      {'· '}read “{plan.trigger.phrase}” as a mail trigger
                      {' · '}
                      <button className="work-link" onClick={() => setRepeatKind('off')}>
                        not a trigger
                      </button>
                    </span>
                  )}
                  {triggerPreview && triggerPreview.tone !== 'idle' && (
                    <span
                      className={
                        triggerPreview.tone === 'hit'
                          ? 'work-trigger-line work-standing-hit'
                          : 'work-trigger-line work-standing-miss'
                      }
                    >
                      {triggerPreview.text}
                    </span>
                  )}
                  <span className="work-trigger-line dim">
                    the mail lands as <code>input/mail.txt</code> · at most 10 firings a day · each
                    one is a job, quoted and reviewed like any other
                    {channel === 'gmail' &&
                      ' · the job may draft one reply into that mail’s thread — it waits for your review'}
                  </span>
                </>
              )}
              {repeatKind !== 'off' && (
                <>
                  {/* Door chips (D-254): the firing holds exactly the doors
                      ticked here, none by default — a rule that reads the
                      mailbox has to say so where it is armed. The reading
                      beside them is the row's own words for it. */}
                  <span className="work-doors">
                    <span className="dim">doors:</span>
                    {doorChoices(connections).map((c) => (
                      <button
                        key={c.name}
                        type="button"
                        className={doors.includes(c.name) ? 'work-chip on' : 'work-chip'}
                        aria-pressed={doors.includes(c.name)}
                        title={c.description}
                        onClick={() =>
                          setDoors((picked) =>
                            picked.includes(c.name)
                              ? picked.filter((d) => d !== c.name)
                              : [...picked, c.name],
                          )
                        }
                      >
                        {c.name}
                      </button>
                    ))}
                    <span className="work-doors-read dim">· {holdsLine(doors)}</span>
                  </span>
                  {/* Standing inputs (D-246): a folder and a rule the firing
                      re-reads, so a monthly job reaches next month's file.
                      Each row says what it matches RIGHT NOW, because a filter
                      that finds nothing must not look like one that works. */}
                  <span className="work-standing">
                    <span className="dim">reads each time:</span>
                    {standing.map((row, i) => (
                      <span className="work-standing-row" key={`${row.dir}-${i}`}>
                        <span className="work-standing-dir" title={row.dir}>
                          {row.dir}
                        </span>
                        <label className="dim">
                          newest matching{' '}
                          <input
                            className="work-q-text work-standing-match"
                            value={row.match}
                            placeholder="anything"
                            onChange={(e) =>
                              setStanding((rows) =>
                                rows.map((r, j) => (j === i ? { ...r, match: e.target.value } : r)),
                              )
                            }
                            aria-label="Part of the filename to match"
                          />
                        </label>
                        <label className="dim">
                          as{' '}
                          <input
                            className="work-q-text work-standing-as"
                            value={row.as}
                            placeholder="statement.xlsx"
                            onChange={(e) =>
                              setStanding((rows) =>
                                rows.map((r, j) => (j === i ? { ...r, as: e.target.value } : r)),
                              )
                            }
                            aria-label="The name it lands under"
                          />
                        </label>
                        <button
                          type="button"
                          className="work-link"
                          onClick={() => setStanding((rows) => rows.filter((_, j) => j !== i))}
                          aria-label="Remove this folder"
                        >
                          ×
                        </button>
                        <span
                          className={row.matched ? 'work-standing-hit' : 'work-standing-miss'}
                        >
                          {row.matched
                            ? `now matches ${row.matched}`
                            : 'nothing matches this yet'}
                        </span>
                      </span>
                    ))}
                    <button
                      type="button"
                      className="work-link"
                      disabled={busy}
                      onClick={() => void addStandingFolder()}
                    >
                      + add a folder
                    </button>
                    {standing.length > 0 && (
                      <span className="dim">
                        · read fresh every firing — name it in your sentence as{' '}
                        <code>input/{standing[0].as || 'statement.xlsx'}</code>
                      </span>
                    )}
                  </span>
                </>
              )}
            </>
          )}
        </p>
      )}

      {/* The single-channel chip. It stands down when the sentence asked for
          more than one, because the line below says the whole truth and this
          one would contradict it — seen in the running app, which said "sends
          via Telegram" and "sends via Telegram and Gmail" one under the
          other. */}
      {plan?.channelAsk &&
        !askingRepo &&
        plan.channelAsk.state === 'ready' &&
        !plan.channelAsk.also?.length && (
          <p className="work-gaps work-channel-ready">
            {plan.channelAsk.channel && (
              <span className="work-sends-mark" aria-hidden="true">
                <ChannelLogo channel={plan.channelAsk.channel} />
              </span>
            )}
            sends via {plan.channelAsk.askedLabel} · every message waits for your review
          </p>
        )}

      {/* Two channels in one sentence (D-178, D-179). The job now carries every
          wired one — one run, one message set each — and what is left over is
          only a channel no client can send, which the line still names rather
          than dropping in silence. */}
      {!!plan?.channelAsk?.also?.length && !askingRepo && (() => {
        const line = alsoAskedLine(plan.channelAsk!, effectiveChannel);
        if (!line) return null;
        const { carried, dropped } = line;
        return (
          <p className="work-gaps work-also">
            {carried.length > 1
              ? `sends via ${carried.map((c) => c.label).join(' and ')} — one job, one message set each`
              : carried.length === 1
                ? `sends via ${carried[0].label}`
                : 'sends nothing yet'}
            {dropped.length > 0 && (
              <>
                {' · '}
                also asks for {dropped.map((d) => d.label).join(' and ')}, which cannot send —{' '}
                {dropped.map((d) => d.detail).filter(Boolean)[0] ?? 'not available'}
              </>
            )}
          </p>
        );
      })()}

      {/* A file asked for on a channel that cannot carry one. The outbox
          contract refuses it too, but only once the run has written it — so
          this is the same refusal moved to where the sentence can still be
          changed. It never blocks Start: the message goes, the file stays. */}
      {!!plan?.noFiles?.length && !askingRepo && (
        <p className="work-gaps work-nofiles">
          {plan.noFiles.map((n) => n.label).join(' and ')} can’t carry files — the “
          {plan.noFiles[0].phrase}” you named goes into the message as words, not as an
          attachment
        </p>
      )}

      {/* Organizing wants a folder, and only the native picker yields an
          absolute path (D-132) — never a text box for a path nobody can type.
          Until one is picked, Start has nothing to organize, so the pick is
          the gate. */}
      {/* …and on an install with no desktop there is no picker to offer, so
          the desk says that instead of a button whose only outcome is an
          error on the click (#30). Same shape as the refused doors above: the
          step stays visible, and it says why it cannot be taken. */}
      {plan?.organize && plan.organizeRefused && !askingRepo && (
        <div className="work-organize">
          {/* Rendered verbatim: the sentence is the server's, whole, so the
              bar and Start cannot end up saying it differently. */}
          <p className="work-organize-refused">{plan.organizeRefused}</p>
        </div>
      )}
      {plan?.organize && !plan.organizeRefused && !askingRepo && (
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
          <span className="work-sends-mark" aria-hidden="true">
            <ChannelLogo channel={plan.channelMention.channel} />
          </span>
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
                  audienceFor={peopleOn}
                  audienceProblemFor={problemOn}
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
                audienceFor={peopleOn}
                audienceProblemFor={problemOn}
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
                {q.freeText && q.id.startsWith('send-to') ? (
                  <RecipientPicker
                    className="work-q-text"
                    placeholder="or say which"
                    value={answers[q.id] ?? ''}
                    onChange={(value) => setAnswers((prev) => ({ ...prev, [q.id]: value }))}
                    people={peopleOn(q.channel)}
                    problem={problemOn(q.channel)}
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
          nothing your crew has covers:{' '}
          {plan.gaps.map((g, i) => (
            <span key={g}>
              {i > 0 && ' · '}
              <span className={gapClass(g, plan.spans, plan.suggestions)}>{g}</span>
            </span>
          ))}
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
          scheduled — {scheduled.cadenceLabel}
          {/* A mail-triggered row has no next occurrence to name (D-248). */}
          {scheduled.nextDueAt !== undefined && (
            <>
              , first run{' '}
              {new Date(scheduled.nextDueAt).toLocaleString(undefined, {
                weekday: 'short',
                month: 'short',
                day: 'numeric',
                hour: '2-digit',
                minute: '2-digit',
              })}
            </>
          )}
          {scheduled.tools && <> · {holdsLine(scheduled.tools)}</>}
          <span className="dim"> · it lands in review like any job · manage in crew → backoffice</span>
        </p>
      )}

      {error && <p className="error">{error}</p>}
    </div>
  );
}
