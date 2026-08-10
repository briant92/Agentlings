// Domain model shared by server (authoritative) and web (rendering).

export * from './pack';
import type { PackDraft } from './pack';
export * from './scene';
export * from './draw';
export * from './palette';

/** The four looks built into the app; the client owns the actual colors. */
export type ThemeKey = 'cave' | 'chalkboard' | 'household' | 'marble';

export * from './themes';

/**
 * What a level stores as its look: a built-in `ThemeKey`, or the folder name
 * of an installed level pack.
 *
 * A plain string rather than a union, because the set is no longer closed at
 * compile time — a pack can be dropped in while the app is running. Nothing
 * downstream may assume it resolves: a level whose pack has been deleted has
 * to keep opening, on fallback art, the way a broken agentling pack already
 * degrades rather than breaks.
 */
export type ThemeId = string;

/** One card on the level-select screen. */
export interface LevelInfo {
  id: string;
  name: string;
  project: string;
  theme: ThemeId;
  createdAt: number;
  crew: number;
  /** Crew sprite tints for the card's dots. */
  colors: number[];
  jobsDone: number;
  jobsRunning: number;
  /** Deliveries waiting on a decision — the select screen's red block (D-137). */
  toReview: number;
  /** Unpaused schedules living here — the green block. */
  schedules: number;
  /**
   * The finished-job ids the inbox lists, newest first. The browser subtracts
   * its own seen set for the blue block — "have I read this" never reaches
   * the server.
   */
  finished: string[];
}

/**
 * What closing a level would keep and stop, shown before the button. Closing
 * archives in place — the folder stays whole so the id is never reissued and
 * the ledger's rows keep pointing at real history; only the runtime stops.
 */
export interface CloseLevelPreview {
  /** Why the close is refused right now — someone mid-job — or null. */
  blocker: string | null;
  jobs: number;
  /** Deliveries waiting on a decision (done, partial or failed). Kept as they are. */
  reviews: number;
  recipes: number;
  notes: number;
  /** Names on the roster; their lessons stay with the level. */
  crew: string[];
  /** Every schedule stops firing; paused at close so reopening cannot surprise. */
  schedules: ScheduleInfo[];
  /** Granted standing approvals — they lapse; nothing auto-sends from a closed level. */
  approvals: SendApprovalInfo[];
}

/** One row on the closed shelf, carrying what a reopen would bring back. */
export interface ClosedLevelInfo {
  id: string;
  name: string;
  project: string;
  theme: ThemeId;
  closedAt: number;
  jobs: number;
  /** Deliveries that were waiting on a decision when the level closed. */
  reviews: number;
  /** All paused at close; reopening leaves them paused. */
  schedules: ScheduleInfo[];
  /** Still granted on disk — named at reopen so no power returns silently. */
  approvals: SendApprovalInfo[];
}

/**
 * repo/ working copies under job sandboxes — the disk weight, measured. Only
 * clones under promoted or discarded jobs are sweepable: a failed, partial or
 * done job's clone is where a reply's continuation still works.
 */
export interface WorkingCopiesInfo {
  sweepable: { clones: number; bytes: number };
  kept: { clones: number; bytes: number };
}

/** What a sweep actually removed, plus what it could not. */
export interface SweepResult {
  clones: number;
  bytes: number;
  /** Clones the filesystem refused to release (a lock, a sync in flight). */
  skipped: number;
}

/** Where a session's credentials come from, and whether they still work. */
export interface AuthStatus {
  ok: boolean;
  source: 'api-key' | 'oauth-token' | 'stored-login' | 'none';
  /** Plain language, only when something needs fixing. */
  problem?: string;
}

export interface SettingsInfo {
  executor: 'claude-agent-sdk' | 'simulated';
  auth: AuthStatus;
  /** What the crew can reach outside the sandbox, and whether it is on. */
  connections: ConnectionInfo[];
}

export type JobStatus =
  | 'queued'
  | 'running'
  | 'done'
  /**
   * Ran out of turns, but left a diff worth reviewing. Its own outcome, not a
   * failure: a short-leash run trades the write-up for a much cheaper run, and
   * calling the result a failure hides work that is ready to promote.
   */
  | 'partial'
  | 'failed'
  | 'promoted'
  | 'discarded';

/**
 * What one session actually cost. Recorded per job from the first run, so
 * which workflows are expensive is a fact rather than a guess.
 */
export interface JobMeter {
  costUsd?: number;
  turns?: number;
  /**
   * The turn limit this session was given. Not the same quantity as `turns`,
   * which the SDK reports higher — a cap of 4 can come back as 6. Pricing a
   * budget needs the number we control, not the one it reports.
   */
  turnsAllowed?: number;
  durationMs?: number;
  inputTokens?: number;
  outputTokens?: number;
  cacheReadTokens?: number;
  /** The model that actually ran it. */
  model?: string;
  /** True when code answered it and no session ran at all. */
  routed?: boolean;
  /** True when a recipe let it run as a single call instead of a loop. */
  oneShot?: boolean;
  /** Which recipe it was a repeat of, when `oneShot`. Reaches the ledger. */
  recipeKey?: string;
  /** True when a compiled tool did the whole job, with no model involved. */
  tooled?: boolean;
  /**
   * A tool claimed the job, could not prove its work, and a session had to do
   * it after all. The user was quoted nothing on the strength of that tool, so
   * the run is absorbed rather than billed.
   */
  toolFellBack?: boolean;
  /** The run spent money that could not be measured — see LedgerEntry. */
  costUnknown?: boolean;
  /**
   * The session was stopped because it used every turn it was granted.
   *
   * Carried as a field rather than read back out of the error sentence, and
   * deliberately not inferred from `turns > turnsAllowed`, which is not a
   * cut-off marker — it fires on runs that finished early too (D-022, D-052).
   * This is what makes "carry on from where it stopped" a thing the app can
   * offer, as against a thing the user has to notice and phrase.
   */
  outOfTurns?: boolean;
  /**
   * Part of `costUsd`, spent by the close-out pass rather than by the session.
   * Kept separate so the per-turn rate prices the session alone: the write-up
   * is a fixed errand, not something the turn budget can buy more or less of.
   */
  closeOutUsd?: number;
  /** Tool calls the session made, and the last one it made. Measurement only. */
  toolCalls?: number;
  lastTool?: string;
  /**
   * Every tool this run actually called, by name, deduped and sorted.
   *
   * Not measurement — the compile gate reads it (D-100). D-044 had to judge
   * whether a method could become a plain-node script from the surface it was
   * *learned with*, because what it *used* was recorded nowhere, and said so:
   * "closing it needs the run to record which tools it actually called".
   * Absent means a run from before this existed, which the gate must be able
   * to tell apart from a run that reached nothing.
   */
  toolsUsed?: string[];
  /** The prompt was question-shaped. Measurement only — see LedgerEntry. */
  asked?: boolean;
  /** How many of the level's own notes bear on the prompt. Measurement only. */
  recallable?: number;
}

/**
 * The knowledge store's index, as the UI sees it.
 *
 * Counts and dates, never the passages themselves: the point of an index you
 * can inspect is a file you can open, not your notes crossing the API on every
 * poll of a status panel.
 */
export interface KnowledgeStatus {
  /** The folders this level indexes, as they were typed. */
  sources: string[];
  /**
   * Of those, the ones not on disk right now — a typo, or a folder since moved.
   * Re-checked on every read rather than only when it was added, because a
   * source that silently contributes nothing looks exactly like one that works.
   */
  missing: string[];
  indexed: boolean;
  entries: number;
  files: number;
  syncedAt?: number;
  /** Files found beyond the per-source cap. Shown, never silently dropped. */
  skipped: number;
  /** Files read only as far as the per-file passage cap — a long report, not a
   *  whole folder. Same rule as `skipped`, one level down. */
  truncated: number;
  /** Files whose words were read off pixels rather than out of a text layer. */
  scanned: number;
  /** Scans read only as far as the per-file page budget — a long contract read to page 20. */
  scanCut: number;
  /** Files holding no text that were not read: the budget ran out, or `ocr` is false. */
  unscanned: number;
  /** Whether this machine can read a scan at all. Windows-only, and it needs a
   *  language pack, so the platform alone does not answer it (D-061). */
  ocr: boolean;
  /** Past a week the store contributes nothing at all, so this is the difference
   *  between a level that can answer from your material and one that stopped. */
  stale: boolean;
}

/** A connection a job can opt into. Secret values never appear here. */
export interface ConnectionInfo {
  name: string;
  label: string;
  description: string;
  builtin: boolean;
  /** False when a secret it declares is missing from .env. */
  ready: boolean;
  missingSecrets: string[];
  /** Plain-words steps for getting the secret — what the settings drawer shows. */
  setup?: string[];
  /** Who this connection turned out to be ("brian@gmail.com"), once known. */
  identity?: string;
  /** What it is before anyone changes it. */
  defaultOn: boolean;
  /** Whether jobs can reach it right now — the default unless Settings says otherwise. */
  enabled: boolean;
}

/**
 * One person a sending channel knows (D-092): the opt-in audience,
 * persisted. Present means reachable — on Telegram, they tapped Start on
 * the bot, or a reviewed send already went to them. No contact book is
 * ever imported; absent means unreachable, which is the channel's rule.
 */
export interface AudiencePerson {
  /** The channel's own address for them — a chat id, later an email. */
  id: string;
  /** Their name as the channel shows it, else the id itself. */
  name: string;
  username?: string;
  /**
   * Other names they have gone by in reviewed sends (D-094) — "Pepo" lives
   * here when Telegram says "Jose Dussaillant". Matching material for the
   * To prefill; only ever collected from names the user approved at review.
   */
  aliases?: string[];
  /** They messaged the bot themselves — the strongest opt-in. */
  viaStart: boolean;
  /** From the user's own saved Google Contacts (D-122) — autofill, not opt-in. */
  viaContacts?: boolean;
  /** Reviewed sends already delivered to them. */
  sends: number;
}

/**
 * The audience GET's answer. `problem` names why the live source could not
 * be read — the People API console toggle, a revoked consent — while the
 * stored roster still answers; a wall shown where the expectation forms
 * instead of a silently thinner dropdown.
 */
export interface AudienceReply {
  people: AudiencePerson[];
  problem?: string;
}

/** One row of the channels Settings lists beyond the wired ones (D-088). */
export interface ChannelShelfRow {
  channel: string;
  label: string;
  detail: string;
}

/**
 * The honest shelf (D-077's tiers, shown in Settings): what is planned, and
 * what will never be on the menu with the reason on the row — so nobody
 * waits for it.
 */
export interface ChannelShelf {
  planned: ChannelShelfRow[];
  never: ChannelShelfRow[];
}

/**
 * A file the user attached to a job.
 *
 * It lands in `input/` inside the sandbox rather than at its root, which is
 * how the repo clone and fetched pages already work — and it matters here
 * beyond tidiness: everything that asks "did this run deliver anything"
 * looks at top-level files, so an input sitting at the root would be counted
 * as output the job never produced.
 */
export interface JobAttachment {
  name: string;
  bytes: number;
}

/** As many as one job may carry, and how large each may be. */
export const MAX_ATTACHMENTS = 5;
export const MAX_ATTACHMENT_BYTES = 10 * 1024 * 1024;

/** One sheet of a spreadsheet, as far down as the preview goes. */
export interface PreviewSheet {
  name: string;
  /** Cells as text; the first row is whatever the sheet's first row is. */
  rows: string[][];
  /** What the sheet actually holds, so a cut is stated rather than implied. */
  totalRows: number;
  totalCols: number;
}

/** One slide, as the lines of text on it. */
export interface PreviewSlide {
  n: number;
  lines: string[];
}

/**
 * A file as the panel shows it, rather than as it saves it.
 *
 * The kind says how much to trust what is on screen. `native` and `text` are
 * the file itself. `html`, `grid` and `slides` are conversions and the panel
 * labels them as such — a converted preview that reads as the real document is
 * the same error as a banked sentence standing in for a PDF that was never
 * written (D-030).
 *
 * Everything that cuts says what it cut. A preview that quietly shows the
 * first hundred rows of a thousand has answered a different question than the
 * one asked.
 */
export type FilePreview =
  | { kind: 'text'; content: string; truncated: boolean }
  | { kind: 'html'; html: string; truncated: boolean }
  | { kind: 'grid'; sheets: PreviewSheet[] }
  | { kind: 'slides'; slides: PreviewSlide[]; total: number }
  | { kind: 'native'; contentType: string }
  | { kind: 'none'; reason: string };

/** What a finished job actually changed, for explaining it in plain words. */
export interface JobChanges {
  files: number;
  added: number;
  removed: number;
  names: string[];
}

/** One message an outbox asks to send. `to` is the channel's own address shape. */
export interface OutboxMessage {
  to: string;
  /** Display name for the review card; never sent to the channel. */
  name?: string;
  /** Mail-shaped channels want one; chat-shaped channels ignore it. */
  subject?: string;
  /**
   * Template body parameters, for channels that send pre-approved templates
   * (WhatsApp Business). What is actually transmitted; `body` is the rendered
   * text as review shows it.
   */
  params?: string[];
  /**
   * The calendar channel's event (D-104): `subject` is its title, `body` its
   * description, `to` the calendar it lands on ("primary"). Refused on every
   * other channel.
   */
  event?: OutboxEvent;
  body: string;
}

export const MAX_OUTBOX_SUBJECT_CHARS = 200;
export const MAX_OUTBOX_PARAMS = 10;
export const MAX_OUTBOX_PARAM_CHARS = 500;

/**
 * The pre-approved template a template-shaped outbox sends — one per outbox,
 * because a batch is one message in N mailboxes. Meta owns the template's
 * actual text; review shows the name, the language and every parameter, so
 * what is transmitted is on the card even though the rendering is a claim.
 */
export interface OutboxTemplate {
  name: string;
  /** Meta's language code — "es", "en_US". */
  language: string;
}

/**
 * What a run asks to send: one channel, up to MAX_OUTBOX_MESSAGES messages,
 * written as OUTBOX.json at the sandbox root. Never executed by the session —
 * review shows the messages, and Approve is the send (D-075).
 */
export interface Outbox {
  channel: string;
  /** Required by template-shaped channels (WhatsApp Business); absent elsewhere. */
  template?: OutboxTemplate;
  messages: OutboxMessage[];
}

/**
 * What approval actually sent, stamped per recipient so a retry can never
 * message anyone twice: `sentTo` accumulates across Approves, `failed` is the
 * last attempt's remainder with the channel's own reason per recipient.
 */
export interface OutboxSent {
  at: number;
  sentTo: string[];
  failed: { to: string; reason: string }[];
}

export const MAX_OUTBOX_MESSAGES = 20;
export const MAX_OUTBOX_TO_CHARS = 200;
export const MAX_OUTBOX_BODY_CHARS = 2000;

/**
 * The calendar channel's event block (D-104): what a message describes when
 * the channel creates an event instead of delivering words. Times are
 * date-times as the user meant them — a bare local time gets the machine's
 * own zone at send; an explicit offset rides through untouched.
 */
export interface OutboxEvent {
  start: string;
  end: string;
  /** Email addresses, never invented — the same rule as every recipient. */
  attendees?: string[];
}

/**
 * A reorganization a run proposes for a real folder (D-132, EXPANSION P5),
 * written as MOVES.json at the sandbox root — one manifest, up to MAX_MOVES
 * ops, never executed by the session. Review shows the moves and Approve
 * replays them, exactly as a reviewed patch is replayed by `git apply`.
 *
 * Ops are `mkdir` and `move` only — **no delete, no copy** (D-121's grammar on
 * files). Every path is relative to the picked root and must stay under it:
 * the model proposes, the server moves, and the server is the only thing that
 * touches the real folder.
 */
export type MoveOp =
  | { op: 'mkdir'; path: string }
  | { op: 'move'; from: string; to: string };

export interface MovesManifest {
  moves: MoveOp[];
}

/**
 * What approval actually moved, stamped per op so a retry can never move
 * anything twice: `done` accumulates across Approves, `failed` is the last
 * attempt's remainder with the reason per op. The journal `moves.jsonl` is
 * `done` written out, and reversing it is the undo.
 */
export interface MovesRun {
  at: number;
  done: MoveOp[];
  failed: { op: MoveOp; reason: string }[];
}

export const MAX_MOVES = 200;
export const MAX_MOVE_PATH_CHARS = 400;

/**
 * When a schedule fires: a calendar cadence in the machine's own local time
 * (D-103). Not cron syntax — the person this app is for says "every
 * Thursday at 9", not "0 9 * * 4".
 */
export interface Cadence {
  kind: 'daily' | 'weekly' | 'monthly';
  /** Weekly only: 0–6, Sunday 0 — `Date.getDay()`'s own numbering. */
  dow?: number;
  /** Monthly only: 1–31, clamped to the month's last day at fire time. */
  day?: number;
  hour: number;
  minute: number;
}

/**
 * A schedule as the UI sees it (D-103): a sentence queued again on its
 * cadence, and how the last firing went. `cadenceLabel` is worded by the
 * server so every surface says a cadence the same way.
 */
export interface ScheduleInfo {
  id: string;
  prompt: string;
  cadence: Cadence;
  cadenceLabel: string;
  channel?: string;
  createdAt: number;
  nextDueAt: number;
  lastFiredAt?: number;
  lastError?: string;
  paused: boolean;
}

/**
 * Standing approval for one recurring send job, as the UI sees it (D-082).
 * `eligible` means the offer may be shown: enough unchanged approvals and
 * not yet granted. The recipient list is the allowlist auto-send is locked
 * to — display it whole, because it is the thing being trusted.
 */
export interface SendApprovalInfo {
  key: string;
  channel: string;
  recipients: string[];
  template?: string;
  approvals: number;
  auto: boolean;
  eligible: boolean;
}

/** One channel the ask-card offers, with its honest one-liner. */
export interface ChannelOption {
  channel: string;
  label: string;
  state: 'ready' | 'connectable' | 'planned' | 'never';
  detail: string;
}

/**
 * The intake noticed this sentence wants to send on a channel (D-079).
 * Everything the card says is decided server-side from the catalog and
 * Settings; the client renders it and picks — it can neither invent a
 * channel nor promote one past its state.
 */
export interface ChannelAsk {
  /** The channel the prompt asked for, normalised ("whatsapp"). */
  asked: string;
  askedLabel: string;
  state: 'ready' | 'connectable' | 'planned' | 'never';
  /** Set when the asked channel itself can carry the job now or after connecting. */
  channel?: string;
  /** The card's header sentence. */
  note: string;
  options: ChannelOption[];
}

/**
 * What a run got to, and what it left — the close-out's third output beside
 * the lesson and the approach (D-114).
 *
 * `items` empty means the run believed itself finished, which is a different
 * statement from "nobody asked": a job with no `pending` at all is one whose
 * close-out never ran, and the review says so rather than implying nothing is
 * left.
 */
export interface Pending {
  /** Where it got to, in one line. */
  state: string;
  /** What remains, in the run's own words. Empty when it thinks it is done. */
  items: string[];
}

export interface Job {
  id: string;
  title: string;
  prompt: string;
  /** Target repository for the real executor (ignored by SimulatedExecutor). */
  repoPath?: string;
  /** Role the intake matched; the sim routes the job to that role first. */
  preferredRole?: string;
  /** Connections this job opted into by name. Absent means sandbox only. */
  tools?: string[];
  /** Set when the user asked for a proper session after a routed answer. */
  noRouter?: boolean;
  /**
   * Composite work (D-105): the sentences still to run after this one. A
   * delivered step queues the next as its own ordinary job — its own recipe
   * key, its own tier, its own quote — with this step's deliverables waiting
   * in its input/. A failed step halts the chain with the reason in the feed.
   */
  steps?: string[];
  /** Which step this job is, for the cards: 2 of 3. */
  step?: { n: number; of: number };
  /**
   * The channel this job sends on, when intake detected one (D-079). The
   * session is told the outbox contract for it and nothing else changes —
   * composing happens in the run, sending stays at approval (D-075).
   */
  channel?: string;
  /**
   * A send the desk already holds whole (D-097): the recipient and the words
   * themselves, from a sentence that named no message for a run to write.
   *
   * Only ever set when the desk asked for the words *as written* rather than
   * roughly, which is what makes composing deterministic — there is nothing
   * left to decide, so the outbox is built in code and the job never reaches
   * a session. Absent on every send that has something to work out, and those
   * behave exactly as before.
   */
  send?: { to: string; words: string };
  /**
   * A channel the prompt mentioned that the job never carried (D-093) —
   * stamped at queue time so the review can say plainly that approving
   * sends nothing, with the reply path as the way out.
   */
  channelMention?: { channel: string; label: string };
  /**
   * The job this one answers. Its sandbox is carried forward, so a reply picks
   * up where that run stopped instead of paying to redo it.
   */
  continues?: string;
  /**
   * Standing instructions handed to the session on top of the prompt — the
   * carry-on brief of a continuation, today. Kept out of `prompt` for the same
   * reason `clarifications` is: a recipe is keyed on the prompt, so a brief
   * folded in gave a continuation a different key from the job it continues —
   * it banked recipes under compound keys nobody would match, and its runs
   * joined no priced history (D-074).
   */
  brief?: string;
  /** A turn cap this job needs in its own right, overriding the role's. */
  maxTurns?: number;
  /**
   * Answers the user gave before the run, handed to the session on top of the
   * prompt.
   *
   * Kept out of `prompt` deliberately: a recipe is keyed on the prompt, so
   * folding these in would give a clarified job a different key from the same
   * job asked plainly, and the crew would stop recognising work it has already
   * done.
   */
  clarifications?: string[];
  /** Files the user attached, waiting in `input/` inside the sandbox. */
  attachments?: JobAttachment[];
  /**
   * This job compiles a recipe into a tool. Recorded rather than acted on: a
   * compile is its own kind of work — it writes two programs that must agree —
   * and a ledger cannot be reconstructed after the fact, so the shape is kept
   * from now on even though the quote still prices compiles with ordinary
   * sessions. Measured 2026-07-31, the difference is 8% over four runs, which
   * is too little and too few to price on yet.
   */
  compile?: boolean;
  /** The ceiling quoted before the work; enforced, and never billed above. */
  quotedUsd?: number;
  /** Filled in when the job completes and left a patch behind. */
  changes?: JobChanges;
  /** Parsed from OUTBOX.json when the run left a valid one. Approve executes it (D-075). */
  outbox?: Outbox;
  /**
   * A world this run authored, offered for review (M4). Approve installs it.
   * The same shape of promise as `outbox`: written by the session, performed
   * by the server, never the other way round.
   */
  packDraft?: PackDraft;
  /** PACK.json existed and was not a valid pack — the reason, never a silent drop. */
  packDraftError?: string;
  /** OUTBOX.json existed and was not a valid outbox — the reason, never a silent drop. */
  outboxError?: string;
  /** Send results so far, merged across retries. */
  outboxSent?: OutboxSent;
  /**
   * A folder reorganization this run proposed, offered for review (D-132).
   * The same promise as `outbox` and `packDraft`: written by the session,
   * performed by the server at Approve, never the other way round. `moves`
   * is the manifest; `organizeRoot` is the folder it applies to, set from
   * the picker at queue time and never from the model's file.
   */
  moves?: MovesManifest;
  /** The real folder the moves apply to; the model never sees or sets it. */
  organizeRoot?: string;
  /** MOVES.json existed and was not a valid manifest — the reason, never a silent drop. */
  movesError?: string;
  /** Move results so far, merged across retries — the accumulator behind the journal. */
  movesRun?: MovesRun;
  /**
   * Where the run got to and what it did not get to (D-114).
   *
   * Written by the close-out, which is the only thing that runs *after* a
   * session dies — and the runs that need this most are exactly the ones cut
   * before they could write anything of their own: three of the first six
   * were. Without it, granting more turns is a coin flip.
   */
  pending?: Pending;
  /** What the session cost — recorded whether it succeeded or failed. */
  meter?: JobMeter;
  status: JobStatus;
  /** Station slot in the world; -1 while waiting for a free station or after finishing. */
  slot: number;
  createdAt: number;
  startedAt?: number;
  finishedAt?: number;
  /** Agentling id once picked up. */
  assignedTo?: string;
  /** One-line result summary once done. */
  summary?: string;
  error?: string;
}

/**
 * What became of a job, grouped the way someone reviewing work would ask.
 *
 * Shared rather than owned by the panel that first needed it: the inbox on the
 * server and the work record in the browser both sort jobs into these three,
 * and two copies of this map is how the same job comes to be called "kept" in
 * one panel and "to review" in the other.
 */
export type Outcome = 'to review' | 'kept' | 'closed';

const OUTCOMES: Record<string, Outcome> = {
  done: 'to review',
  partial: 'to review',
  promoted: 'kept',
  discarded: 'closed',
  failed: 'closed',
};

/** Null for `queued` and `running`, which are not history yet. */
export function outcomeOf(status: JobStatus): Outcome | null {
  return OUTCOMES[status] ?? null;
}

/** Whether a run left something for the user, whatever its ledger outcome. */
export function isDelivery(status: JobStatus): boolean {
  return status === 'done' || status === 'partial' || status === 'promoted';
}

export type AgentlingState = 'idle' | 'walking' | 'working' | 'delivering';

export interface Agentling {
  id: string;
  name: string;
  /** Sprite tint, 0xRRGGBB. */
  color: number;
  state: AgentlingState;
  x: number;
  targetX: number;
  jobId?: string;
  /** Role name from roles/*.md; persisted across restarts in the roster. */
  role: string;
  /** What the user said this agentling was hired to do, in their own words. */
  jobDescription?: string;
  jobsDone: number;
  jobsFailed: number;
}

/** Parsed role definition (Claude subagent frontmatter format, roles/*.md). */
export interface RoleInfo {
  name: string;
  description: string;
  tools: string[];
  skills: string[];
  model?: string;
  /** Turn budget for this role's sessions; clamped by the executor. */
  maxTurns?: number;
  /**
   * Wall clock for this role's sessions, in minutes; clamped by the executor
   * like the turn cap. Exists because the 10-minute default binds long-form
   * work first — a research synthesis and a deck's look-loop were both cut by
   * the wall before their turns ran out (D-128, D-129).
   */
  timeoutMinutes?: number;
  /**
   * The most a job of this role may be quoted, in dollars, raising the global
   * `MAX_CEILING_USD` runaway clamp for this class alone (D-130). A genuinely
   * expensive trade — the researcher's three gate runs all bound on the $2
   * global cap and its cost history wanted ~$5 — needs the headroom without
   * loosening the clamp for mason or scribe. Clamped to a hard maximum, and
   * an explicit `AGENTLINGS_MAX_COST_USD` still wins over it.
   */
  maxCostUsd?: number;
}

export interface SkillInfo {
  name: string;
  description: string;
}

/** One role or ability found in a source repo, pinned to the commit it was read at. */
export interface CatalogEntry {
  id: string;
  kind: 'role' | 'skill';
  name: string;
  description: string;
  repo: string;
  path: string;
  sha: string;
  source: string;
  trust: string;
  /** The source repo's licence — installing copies the file into your project. */
  license?: string;
}

export interface SourceStatus {
  name: string;
  label: string;
  repo: string;
  kind: 'role' | 'skill';
  trust: string;
  license?: string;
  sha?: string;
  /**
   * How many of this source's entries reached the index — counted *after*
   * cross-source dedupe, so it is what filtering on this source yields rather
   * than what the sync read.
   */
  count: number;
  ok: boolean;
  error?: string;
  /** Entries beyond the per-source cap, so nothing is dropped silently. */
  truncated?: number;
}

export interface LibraryStatus {
  fetchedAt: number;
  stale: boolean;
  sources: SourceStatus[];
  total: number;
}

/** A search hit, with whether it is already installed and from which commit. */
export interface LibraryHit {
  entry: CatalogEntry;
  state: 'new' | 'installed' | 'outdated';
}

export interface LibrarySearchResult {
  hits: LibraryHit[];
  /** Words no source covers either — worth saying rather than showing nothing. */
  gaps: string[];
}

/**
 * One group of the catalogue, for browsing it without a query.
 *
 * Derived from where a source keeps its files, never from what the entries
 * say. A source that arranges nothing becomes one category named for itself.
 */
export interface LibraryCategory {
  name: string;
  jobs: number;
  abilities: number;
  /** Which sources contribute, so a mixed category can say so. */
  sources: string[];
  /** The category's *lowest* trust: one community file makes it community. */
  trust: 'official' | 'community';
}

/** GET /api/library/browse — the shape of the catalogue, without its contents. */
export interface LibraryBrowse {
  categories: LibraryCategory[];
  /** Totals across everything indexed, for the kind filter's counts. */
  jobs: number;
  abilities: number;
  /**
   * Per source, how many entries are *actually indexed*.
   *
   * Counted from the index rather than read from `SourceStatus.count`. The two
   * agree since the count began being taken after cross-source dedupe instead
   * of before it — measured at 204 against 180 for `wshobson-agents` — but an
   * index synced before that still carries the old number, and offering a
   * filter that promises 204 and yields 180 is worse than offering none.
   */
  indexed: { name: string; label: string; entries: number }[];
}

/**
 * Tier 2's answer: the same sentence checked by one short Claude call. Always
 * optional — the local matcher answers without it.
 */
export interface Refinement {
  role: string | null;
  skills: string[];
  /** One plain-language line about what this agentling would be for. */
  summary?: string;
  confidence: number;
}

/** What the concept matcher proposes for a sentence the user typed. */
export interface MatchSuggestion {
  /** Best-matching role, or null when nothing was confident enough. */
  role: string | null;
  roleDescription: string;
  skills: string[];
  /** 0–1; below MIN_CONFIDENCE the UI asks instead of asserting. */
  confidence: number;
  /** The user's own words that drove the match — shown as the reason. */
  matchedTerms: string[];
  /** Words nothing in the library covers; later these drive library search. */
  gaps: string[];
  alternatives: { name: string; description: string }[];
}

/** One crew member as the Crew panel sees them — resting ones included. */
export interface CrewMember {
  id: string;
  name: string;
  color: number;
  role: string;
  jobDescription?: string;
  jobsDone: number;
  jobsFailed: number;
  hiredAt: number;
  /** Last time they finished a job, for spotting who has gone quiet. */
  lastWorkedAt?: number;
  resting: boolean;
  /** Mid-job: crew actions are blocked until they finish. */
  busy: boolean;
  lessons: number;
}

/** A pair the app thinks are doing the same job, with why it thinks so. */
export interface MergeProposal {
  /** Agentling id kept by default — the stronger record. */
  keep: string;
  /** Agentling id folded in and taken off the roster. */
  absorb: string;
  score: number;
  reasons: string[];
}

/** Exactly what a merge would leave behind, shown before it happens. */
export interface MergePreview {
  keep: CrewMember;
  absorb: CrewMember;
  /** Combined figures the survivor ends up with. */
  jobsDone: number;
  jobsFailed: number;
  lessons: number;
  /** True when the two hold different roles, so one job is being dropped. */
  differentRoles: boolean;
}

/** GET /api/agentlings/:id — everything the profile popup shows. */
/**
 * One member's lifetime record, read off the ledger rows that name them as
 * author (D-089). Blank-author rows — the 17 deliberately left after D-056's
 * backfill — are simply absent from every figure rather than guessed in.
 */
export interface AgentlingRecord {
  /** Ledger rows naming them. A job can be several runs (D-074). */
  runs: number;
  /** Runs that ended done. */
  done: number;
  /** Lifetime spend across all their runs, absorbed failures included. */
  costUsd: number;
  /** Spend ÷ done — what a landed run really costs, failures priced in. */
  avgPerDoneUsd: number | null;
  /** Their job classes run more than once, and how many now cost less. */
  repeated: number;
  cheaper: number;
  /** Priced runs that spent essentially their whole quote. */
  atCeiling: number;
  pricedRuns: number;
  /** Spend ÷ quoted over priced runs; null when nothing carried a quote. */
  ratio: number | null;
  signal: BudgetSignal;
}

export interface AgentlingProfile {
  agentling: Agentling;
  role: RoleInfo | null;
  /** Learnt lessons only, oldest first — the journal lines stay out (D-089). */
  memory: string[];
  record: AgentlingRecord;
}

/** What a job will cost, quoted before it runs. The ceiling is enforced. */
export interface Quote {
  tier: 'routed' | 'tool' | 'oneshot' | 'session';
  /** The most it can be charged; the session is stopped at this. */
  ceilingUsd: number;
  /** What it has typically cost, when there is history. */
  expectedUsd?: number;
  /** How many times this exact kind of job has been done. */
  samples: number;
  certainty: 'certain' | 'high' | 'estimated';
  /** Plain-language line: money, with the confidence stated. */
  wording: string;
}

/** Spend for a level or the whole app. Cost is ours; price is chargeable. */
export interface SpendTotals {
  jobs: number;
  costUsd: number;
  priceUsd: number;
  /** Cost of failed work, absorbed rather than charged. */
  absorbedUsd: number;
  /** Jobs answered without a session at all. */
  free: number;
}

/** How a crew member's spending sits against what was quoted for their work. */
export type BudgetSignal = 'green' | 'amber' | 'red';

/** Under this share of quote a member is green; under the second, amber. */
export const BUDGET_GREEN = 0.5;
export const BUDGET_AMBER = 0.85;

/** One crew member's spending record, as the street lights read it. */
export interface MemberSpend {
  id: string;
  name: string;
  color: number;
  /** Their runs the ledger can account for. */
  jobs: number;
  costUsd: number;
  /** What was quoted across the runs of theirs that carried a quote. */
  quotedUsd: number;
  /** Priced runs only — the denominator `ratio` is honest about. */
  priced: number;
  /** `costUsd` over `quotedUsd`, or null when nothing of theirs was quoted. */
  ratio: number | null;
  signal: BudgetSignal;
  /**
   * Runs that spent essentially their whole quote. Carried beside the ratio
   * rather than folded into it: a member can be cheap in dollars and still be
   * capped half the time, which says the quote is too tight for their work
   * rather than that they overspend.
   */
  atCeiling: number;
}

/**
 * The crew's record, for the productivity panel.
 *
 * Read from the ledger, which is the only complete account of what the app has
 * paid out — the queue file holds only jobs that are still in it. Where a
 * figure can come from just one of the two, the field says which.
 */
export interface LevelProductivity {
  /** Every run this level has ever made. */
  jobs: number;
  costUsd: number;
  /** What was chargeable. Failures are absorbed, so this is never the total. */
  priceUsd: number;
  absorbedUsd: number;
  /** Runs answered without paying a model at all. */
  free: number;
  /** Runs that spent money nobody can measure; totals read "at least". */
  unmeasured: number;
  /**
   * Runs that left something for the user.
   *
   * The only figure here taken from the queue rather than the ledger, because
   * a run that exhausts its turns holding a finished diff files as a ledger
   * failure and as a `partial` job — 14 of them on this level's history — so
   * the ledger alone undercounts delivery by exactly the jobs most worth
   * reviewing. It is therefore a floor: jobs that have left the queue file
   * cannot be counted.
   */
  delivered: number;
  /** Lines across every crew memory, and how many are worth the name. */
  lessons: number;
  /**
   * Of `lessons`, the automatic "delivered X / failed Y / merged with Z / hired
   * to" journal. Split out because a crew whose memory is 71 lines of its own
   * career and 43 of method has learnt 43 things, not 114.
   */
  journal: number;
  /** Job classes run more than once — the ones that could get cheaper. */
  repeated: number;
  /** Of those, the ones costing less lately than they used to. */
  cheaper: number;
  /** Runs on a class that used to cost money and now goes free. */
  nowFree: number;
  crew: MemberSpend[];
  /**
   * Runs whose author is no longer on record, and what they spent. The crew
   * figures add up to less than the level's by exactly this, and saying so is
   * the difference between a known hole and an arithmetic bug.
   */
  unattributed: number;
  unattributedUsd: number;
}

/** One file a delivery left behind. Named and sized; never its contents. */
export interface DeliveryFile {
  name: string;
  bytes: number;
}

/** One finished piece of work, as the inbox lists it. */
export interface Delivery {
  jobId: string;
  title: string;
  /** Who made it, by name where the roster still knows them. */
  who: string;
  /** When it finished, or was created if it somehow never recorded that. */
  at: number;
  status: JobStatus;
  outcome: Outcome;
  /** What it cost, or null when nothing was spent or nothing was measured. */
  costUsd: number | null;
  files: DeliveryFile[];
  changes?: JobChanges;
}

/**
 * One thing worth settling before a job runs.
 *
 * Answering is always optional. These narrow the work so the run explores
 * less; a question that blocked the intake would cost more than the turn it
 * saved.
 */
export interface ClarifyQuestion {
  /** Stable across recomputation, since the rules are deterministic. */
  id: string;
  ask: string;
  /** Why it is being asked, when that is not obvious. */
  hint?: string;
  /**
   * The field's own short name, when the question decides it rather than the
   * client. "Say" and "Words" are different promises about what happens to
   * what you type, so the label has to come from whoever chose the wording
   * or the two can disagree (D-097).
   */
  label?: string;
  /** Suggested answers; `answer` is what the session is actually told. */
  options: { label: string; answer: string }[];
  /** The user may type something instead of picking. */
  freeText?: boolean;
}

/** Preview of what the app will do with a sentence, before it queues anything. */
export interface WorkPlan {
  /** Short title derived from the sentence. */
  title: string;
  /** Role the matcher chose, or null when it isn't sure. */
  role: string | null;
  /** Who will pick it up, once the sim gets to it. */
  agentling: { id: string; name: string; role: string } | null;
  /**
   * The split Start will queue (D-105), shown before anything runs like
   * every other plan fact. Absent means one job; each step carries the
   * quote its own sentence earns today.
   */
  steps?: { sentence: string; title: string; quote: Quote }[];
  /** True when nobody in this level's crew holds the matched role. */
  noOneHasRole: boolean;
  confidence: number;
  /** True when this level has never been asked for a project folder. */
  needsRepo: boolean;
  /** The level's project folder; '' means asked and declined. */
  repoPath: string;
  /** What this will cost, before it runs. */
  quote: Quote;
  gaps: string[];
  /** Worth settling before it runs; always optional to answer. */
  questions: ClarifyQuestion[];
  /** Present when the sentence wants to send on a channel (D-079). */
  channelAsk?: ChannelAsk;
  /**
   * The sentence wants a folder reorganized (D-132). The desk shows a "choose
   * the folder" step — only the native picker yields an absolute path — and
   * the picked path rides back into `/work` as `organizeRoot`.
   */
  organize?: boolean;
  /**
   * A channel word with no send verb beside it (D-093) — the near-miss the
   * ask stays quiet on, surfaced as a question the user can confirm. Absent
   * whenever a real ask fired.
   */
  channelMention?: { channel: string; label: string; wired: boolean };
}

export interface WorldState {
  tick: number;
  agentlings: Agentling[];
  jobs: Job[];
}

export type JobEventType = 'queued' | 'started' | 'progress' | 'done' | 'failed' | 'resolved';

/** One line in the reporting terminal. Movement stays visual-only in the world. */
export interface JobEvent {
  /** Monotonic per server run; clients dedupe replays by id. */
  id: number;
  at: number;
  type: JobEventType;
  jobId: string;
  title: string;
  /** Agentling name for started/progress/done/failed. */
  agentling?: string;
  /** Progress text, result summary, failure reason, or resolve action. */
  detail?: string;
  /**
   * Who resolved it (D-114). `you` at the desk, `app` under a standing
   * approval — and the feed must keep them apart, because an auto-send is
   * precisely the case nobody looked at. A resolved line wearing your verb
   * when you never saw it is the one thing an audit trail must not do.
   */
  by?: 'you' | 'app';
}

/**
 * One tick on the wire.
 *
 * Agentlings move every tick; the job list changes a few times an hour, and
 * re-sending it ten times a second to say so was 98% of the traffic — 42KB a
 * frame at 54 jobs. So `jobs` rides along only when the queue's revision has
 * moved, and a client keeps the last list it was given. The first frame a
 * socket receives always carries one, so there is nothing to miss.
 */
export interface WorldFrame {
  tick: number;
  agentlings: Agentling[];
  /** Present only when the queue changed since this client was last told. */
  jobs?: Job[];
}

export type ServerMessage =
  | { type: 'world'; state: WorldFrame }
  | { type: 'events'; events: JobEvent[] };

// World geometry moved to ./scene, beside the interpreter that anchors a
// scene on it; re-exported by the `export *` above, so nothing importing it
// from this package had to change.
export const TICK_MS = 100;
/**
 * Close code for "that level does not exist". A socket closed with it must not
 * be retried — the client used to reconnect every second forever, sitting on
 * "connecting…" for a level that was never coming back. Shared so the two ends
 * cannot drift: a server that closes with one number and a client that watches
 * for another is the same hang with more steps.
 */
export const SOCKET_LEVEL_GONE = 4004;
/** Localhost API port; the spawned runner calls back here for web fetches. */
export const SERVER_PORT = 4600;
