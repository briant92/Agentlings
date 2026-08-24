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
  | 'discarded'
  /**
   * Seen and let go without a verdict: out of the review pile and closed in
   * the record, nothing kept, nothing refused, nothing banked (D-216) — the
   * way to clear an inbox that was never a judgement of the work.
   */
  | 'cleared';

/** What a review can say about a delivery: keep it, refuse it, or let it go. */
export type Verdict = 'promote' | 'discard' | 'clear';

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
   * The wall clock cut this run, not the turn budget — `outOfTurns`'s twin
   * (D-138). Carry-on reads it the same way: a run stopped by a limit is a
   * run the user may fund past the limit, whichever limit it was.
   */
  timedOut?: boolean;
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

/**
 * The provenance index (D-225): what a level has on file and which record came
 * from which, built from identifiers the records already carry. Derived,
 * per level, read by the Knowledge panel and by nothing that briefs a run.
 */
export type ProvenanceKind =
  | 'job'
  | 'note'
  | 'lesson'
  | 'recipe'
  | 'tool'
  | 'candidate'
  | 'source'
  | 'passage'
  | 'reconciliation'
  | 'agentling';

export type ProvenanceFlag = 'stale' | 'missing' | 'retired' | 'scanned' | 'unparsed' | 'unlisted';

export interface ProvenanceNode {
  id: string;
  kind: ProvenanceKind;
  /** The record's own first line or title, trimmed. */
  label: string;
  /** The file it was read from, relative to the level, and the line where there is one. */
  origin: { file: string; line?: number };
  at?: number;
  flags?: ProvenanceFlag[];
}

export interface ProvenanceEdge {
  from: string;
  to: string;
  /** The identifier this edge was read off — `ledger.recipeKey`, `lesson.jobStamp`, … Never a score. */
  via: string;
  /** Set when a title named this many jobs; the edge points at the first. */
  ambiguous?: number;
}

/** `GET /api/levels/:lid/provenance` — the level's counts and how the build went. */
export interface ProvenanceSummary {
  levelId: string;
  builtAt: number;
  buildMs: number;
  nodes: Record<ProvenanceKind, number>;
  edges: Record<string, { edges: number; ambiguous: number }>;
  /** Identifiers that named nothing, by the edge kind they would have made. Shown, never hidden. */
  unresolved: Record<string, number>;
}

/** `GET /api/levels/:lid/provenance?node=` — one record and everything one hop away. */
export interface ProvenanceNeighbourhood {
  node: ProvenanceNode;
  edges: ProvenanceEdge[];
  nodes: ProvenanceNode[];
  /** Edges past the cap, counted rather than dropped. */
  more: number;
}

/** `GET /api/levels/:lid/provenance/search?q=` — records sharing words with the query, best first. */
export interface ProvenanceHit {
  node: ProvenanceNode;
  /** Words shared with the query — the same count the recall tier and a session's notes are ranked by. */
  shared: number;
}

/**
 * `POST /api/levels/:lid/provenance/dry-run` — what a session would be handed
 * for a sentence, computed by the same selection the run makes and written
 * nowhere: the tier the router would choose, the eight notes, the six the
 * recall tier would answer from, and the named agentling's five newest lessons.
 */
export interface ProvenanceDryRun {
  tier: 'routed' | 'tool' | 'oneshot' | 'session';
  notes: string[];
  recall: string[];
  lessons: string[];
  agentling?: string;
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
  /**
   * What a run may read, or what approval may send (UI.md, step 7) — the
   * boundary Settings draws. Read off the catalog's own `sendsOnly` flag, the
   * one fact that already said it (D-097), rather than declared twice.
   */
  kind: 'read' | 'send';
  /**
   * Whether the connection holds any secret at all, so a row can offer to
   * forget it (D-218). `web` and `render` are ready and hold nothing.
   */
  credentialed: boolean;
  /**
   * The other connections declaring a secret this one declares — the Google
   * trio share one sign-in — so a Disconnect can say who else it takes down
   * before it is pressed, never after.
   */
  sharesSecretsWith: string[];
  /**
   * Added on this machine rather than shipped in the catalog (D-244). Only
   * these can be removed: a connection the app ships is part of the product,
   * and the way to stop using one is the switch that already exists.
   */
  added?: boolean;
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
  /**
   * What kind of file this is, as the learning keys on it (D-221): a
   * spreadsheet-shaped text file by its header columns, anything else by its
   * extension. Absent on attachments stamped before shapes were recorded.
   */
  shape?: string;
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
  /**
   * Files that ride the message as real attachments (D-159). Names of files
   * the run wrote at the sandbox root, or `input/<name>` for a file the user
   * attached at Start — forward slashes, nothing deeper. The bytes stay in
   * the sandbox until Approve reads them at send, exactly as the messages
   * themselves wait. Only the channels that can carry a file take the field:
   * telegram and gmail; everywhere else it is refused at parse.
   */
  files?: string[];
  /**
   * This message answers the mail that triggered the job (D-248). Gmail only,
   * and only meaningful on a job a mail trigger queued: the server supplies
   * the thread id and In-Reply-To from what the trigger stamped on the job,
   * so a session can aim at exactly one thread — the one that asked — and
   * never at an arbitrary id it wrote itself. Refused at send when the job
   * carries no triggering mail. A reply cannot carry files.
   */
  reply?: boolean;
  body: string;
}

export const MAX_OUTBOX_SUBJECT_CHARS = 200;
export const MAX_OUTBOX_PARAMS = 10;
export const MAX_OUTBOX_PARAM_CHARS = 500;

/** As many files as one message may carry — the same bound as job attachments. */
export const MAX_OUTBOX_FILES = 5;
/** Per file. Matches what a user may attach at Start, so nothing round-trips oversize. */
export const MAX_OUTBOX_FILE_BYTES = 10 * 1024 * 1024;
/**
 * Per message, all files together. Gmail refuses messages over 25 MB counting
 * the base64 inflation (~4/3), so 15 MB of real bytes is the honest ceiling —
 * and Telegram's 50 MB bot cap sits comfortably above it.
 */
export const MAX_OUTBOX_FILES_TOTAL_BYTES = 15 * 1024 * 1024;

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
  /** Which outbox this is the result of (D-179). */
  channel: string;
  sentTo: string[];
  failed: { to: string; reason: string }[];
}

export const MAX_OUTBOX_MESSAGES = 20;
export const MAX_OUTBOX_TO_CHARS = 200;
/**
 * Body caps by channel, modelling each channel's own truth rather than one
 * invented number (D-193). One flat 2000 refused a 3,325-character Telegram
 * message three runs in a row — a message Telegram itself carries, since its
 * sendMessage hard limit is 4096. Telegram's number is protocol; Slack
 * refuses past 40k; Gmail has no protocol cap, so its figure is sanity, not
 * protocol. A channel declaring nothing keeps the conservative fallback.
 */
export const OUTBOX_BODY_CHARS: Record<string, number> = {
  telegram: 4096,
  gmail: 50_000,
  slack: 40_000,
};
export const MAX_OUTBOX_BODY_CHARS = 2000;
/** The one place the per-channel cap is answered, for parse and brief alike. */
export function outboxBodyCap(channel?: string): number {
  return (channel && OUTBOX_BODY_CHARS[channel]) || MAX_OUTBOX_BODY_CHARS;
}

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
/**
 * What a run took out before sending, declared so it can be checked (D-181).
 *
 * The app cannot promise that nothing sensitive leaves: two of the three real
 * withholding sentences — "with the customer names removed", "leaving out
 * anything confidential" — are judgements, not patterns, and a rule that
 * claimed to catch them would be claiming a coverage no rule has. False
 * confidence at the one irreversible moment is worse than no promise at all.
 *
 * So the promise is narrower and mechanical: the run says which literal values
 * it removed, and Approve refuses to send anything that still contains one.
 * `what` is for the human at review — "the customer names" — and `values` are
 * the strings the gate actually looks for.
 */
export interface WithheldItem {
  /** What kind of thing this was, in the user's terms. Shown at review. */
  what: string;
  /** The literal strings that must not appear in anything sent. */
  values: string[];
}

export interface Withheld {
  items: WithheldItem[];
  /** Anything the run wants the reviewer to know about its judgement. */
  note?: string;
}

/** Values shorter than this are refused: they match everything and would block every send. */
export const MIN_WITHHELD_CHARS = 3;
export const MAX_WITHHELD_ITEMS = 20;
export const MAX_WITHHELD_VALUES = 200;

/**
 * The reconciliation contract (D-222): what a run asked to reconcile one
 * record of money against another writes as RECONCILIATION.json. The server
 * recomputes both adjusted sides from `adjustments` — the file never states
 * a balance it is trusted on — and Approve is refused when they do not meet.
 */
export interface ReconciliationSide {
  /** Which file this side was, in the reviewer's terms — usually its name. */
  label: string;
  closing: number;
}

export interface ReconciliationAdjustment {
  /** Which side's closing this adjusts: the bank's, or the records'. */
  side: 'statement' | 'records';
  /** in-transit · outstanding · fee · interest · returned · error · other */
  kind: string;
  /** Signed: positive adds to that side's closing, negative subtracts. */
  amount: number;
  what: string;
  ref?: string;
}

export interface ReconciliationMatch {
  statement: string;
  /** One record, or several when a statement line settles more than one. */
  records: string[];
  amount: number;
  date?: string;
}

export interface ReconciliationUnmatched {
  /** The line's own reference where it has one — a deposit line often has none. */
  ref?: string;
  date?: string;
  amount: number;
  what: string;
  /** in-transit · outstanding · fee · interest · returned · error · open-invoice · out-of-scope · unexplained */
  category: string;
}

/** An entry the records side would post for an item only the statement has. */
export interface ReconciliationEntry {
  debit: string;
  credit: string;
  amount: number;
  memo?: string;
}

export interface Reconciliation {
  period?: string;
  currency?: string;
  statement: ReconciliationSide;
  records: ReconciliationSide;
  adjustments: ReconciliationAdjustment[];
  matched: ReconciliationMatch[];
  unmatched: { statement: ReconciliationUnmatched[]; records: ReconciliationUnmatched[] };
  entries: ReconciliationEntry[];
  note?: string;
}

/**
 * What the server says the file says: both sides adjusted by the run's own
 * adjustments, recomputed at completion and stamped on the job, so the card
 * and the Approve gate read one truth (D-030).
 */
export interface ReconciliationSummary {
  period?: string;
  currency?: string;
  statement: { label: string; closing: number; adjusted: number };
  records: { label: string; closing: number; adjusted: number };
  /** The run's adjustments as read — what the reviewer sees beside each balance. */
  adjustments: ReconciliationAdjustment[];
  /** statement adjusted minus records adjusted, in the file's own units. */
  difference: number;
  balances: boolean;
  counts: {
    matched: number;
    unmatchedStatement: number;
    unmatchedRecords: number;
    adjustments: number;
    entries: number;
  };
}

/**
 * One approved reconciliation, kept in the level's `reconciliations/`
 * directory so the next period starts from it (D-223): what it ended at,
 * the items open then, and the shape of the files it was read from — the
 * key a successor job is matched on (D-221). Written at Approve only; a
 * clear writes nothing (D-216).
 */
export interface ReconciliationRollForward {
  jobId: string;
  approvedAt: number;
  /** The approved job's attachment shape — how a successor finds this state. */
  inputShape?: string[];
  /** The stamped summary, verbatim — nothing re-derived, nothing dropped. */
  reconciliation: ReconciliationSummary;
}

export const MAX_RECONCILIATION_ADJUSTMENTS = 200;
export const MAX_RECONCILIATION_MATCHES = 2000;
export const MAX_RECONCILIATION_UNMATCHED = 500;
export const MAX_RECONCILIATION_ENTRIES = 100;
export const MAX_RECONCILIATION_TEXT_CHARS = 200;
/** Under this the two adjusted sides are equal; sums are done in cents, so it is a guard, not a fudge. */
export const RECONCILIATION_TOLERANCE = 0.005;

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
 * The identity of an op — what "already done" means at every seam: the
 * replay's skip list, the undo's remainder, the review card's moves-left.
 * One definition for both sides because two copies diverged invisibly once:
 * the server's had a raw NUL byte between the holes and the web panel's a
 * space, so the two keyed spacey paths differently (D-161). The separator is
 * NUL — the one byte no path on any OS can contain, where a space would
 * collide `a b` → `c` with `a` → `b c` — and it is spelled `\u0000` so the
 * choice stays visible to eyes, diffs and grep. Keys live in memory only,
 * never persisted; what a person reads is `opLabel`, never this.
 */
export function opKey(op: MoveOp): string {
  return op.op === 'mkdir' ? `mkdir:${op.path}` : `move:${op.from}\u0000${op.to}`;
}

/** The op as a person reads it — error details and cards, never identity. */
export function opLabel(op: MoveOp): string {
  return op.op === 'mkdir' ? `mkdir ${op.path}` : `${op.from} → ${op.to}`;
}

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
  /** Absent on a mail-triggered row (D-248) — exactly one of these two is set. */
  cadence?: Cadence;
  /** What fires this row when it is not a calendar: mail arriving (D-248). */
  trigger?: { mail: string };
  /** The firing in words, whichever shape it is — the one label the UI shows. */
  cadenceLabel: string;
  channel?: string;
  createdAt: number;
  /** Absent on a trigger row: mail has no next occurrence to name. */
  nextDueAt?: number;
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
  /** One entry per channel the grant covers, each with its own allowlist (D-179). */
  channels: { channel: string; recipients: string[]; template?: string }[];
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
  /**
   * The other channels this sentence asks to send on, which this job cannot
   * carry (D-178).
   *
   * A job holds one channel and the earliest mention wins, so "telegram Pepo
   * the UF and email the same figures to Ana" queued a Telegram job and the
   * email vanished — no card, no question, not even the near-miss line, since
   * that fires only when *no* channel was settled. Every other way the desk
   * can be wrong about a send is loud; this one was silent, which is why it
   * is reported before it is solved.
   */
  also?: ChannelOption[];
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

/**
 * What a check pass found (TEAMWORK T1, D-194): a second agentling's verdict
 * on a delivered job, stamped onto the job it checked. The checker informs;
 * it never authorises — Approve stays the only send, and this row is what
 * the reviewer reads before deciding.
 */
export interface CheckVerdict {
  /**
   * `confirmed` — every load-bearing claim held. `refuted` — at least one
   * claim is wrong. `unchecked` — the check ran and named no verdict, or
   * never reported; treated exactly like `refuted` by the auto-send gate,
   * because a check that vanished is not a check that passed.
   */
  verdict: 'confirmed' | 'refuted' | 'unchecked';
  /** The check job, so the review can open its sandbox. */
  jobId: string;
  /** Who checked, for the card. */
  by?: string;
  /** The checker's own claim-by-claim lines, clipped for the card. */
  findings?: string[];
  /** Why there is no usable verdict, when there is none. */
  note?: string;
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
   * The mail whose arrival queued this job (D-248). What the reply path
   * threads to — a session flags `reply: true` and the server supplies these,
   * so no run ever holds or invents a thread id. Its presence is also the
   * fact the auto-send gate reads: a mail-triggered job is always reviewed.
   */
  mailTrigger?: {
    /** Gmail's message id — the one mail_read takes. */
    id: string;
    threadId: string;
    /** The RFC 822 Message-ID header, for In-Reply-To when it was present. */
    msgId?: string;
    from?: string;
    subject?: string;
  };
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
   * The job id of the step before this one — the chain link the review
   * surfaces group by. One prompt used to end as parallel REVIEW cards with
   * nothing tying them together but timestamps; this lets the client walk a
   * chain in both directions and show it as one thing. Deliberately not
   * `continues`: that link means "same sandbox carried forward" and feeds
   * approval keys and chain repricing, neither of which a step split wants.
   */
  stepPrev?: string;
  /**
   * This job belongs to a chain whose sentence asked for something to be kept
   * out (D-183).
   *
   * A withholding instruction lives in one step and the send lives in another
   * — "…then redact the client names, then email it to the partners" — so a
   * gate reading only the step's own sentence would arm the redacting step and
   * leave the *sending* one open. That is the exact chain raising `MAX_STEPS`
   * to four unlocked, so the flag rides the whole chain rather than being
   * re-derived per step.
   *
   * Not the previous step's prompt, which the step brief already carries: that
   * looks back exactly one step, and "redact, then review, then send" puts the
   * redaction two back.
   */
  withholding?: boolean;
  /**
   * What the user typed on the card, carried so the rest of the chain can
   * still hear it (measured 2026-08-14).
   *
   * The desk asks its questions of the whole sentence — "then email it to Ana"
   * makes the card ask for the address — and then the split hands step one a
   * sentence that asks nothing of the kind, so `clarificationLines` dropped
   * every answer and no later step was queued with any. The user typed the
   * address and the sending step reported it missing.
   *
   * Raw answers rather than composed lines, because the guard is the recompute
   * (D-097): each step re-derives its own questions from its own sentence, so
   * an answer only reaches a session that asks for it, and no step can be
   * handed an instruction the user was never shown.
   */
  answers?: Record<string, string>;
  /**
   * The sentence asked for the work to be checked (TEAMWORK T1, D-194).
   *
   * Read off the whole sentence before any split loses it, like
   * `withholding` above, and riding every step for the same reason — the
   * deliverable lands at the end of a chain, so the flag must too. Only the
   * last step queues the check: a second agentling, in its own session and
   * sandbox, reads the delivered work against the brief and the world and
   * files CHECK.md. Its verdict lands here as `checkVerdict`; while it is
   * pending or refuting, the job never auto-sends.
   */
  checked?: boolean;
  /**
   * This job IS a check pass: the job it checks, and who worked that job —
   * so pickup can prefer a different member (a second identity is better
   * than a second session alone, and a sole holder still takes it rather
   * than starving the check).
   */
  check?: { of: string; avoid?: string };
  /** The check's verdict, stamped when the check job reaches an outcome. */
  checkVerdict?: CheckVerdict;
  /**
   * Work parties (TEAMWORK T2, D-195): this job is one hand of a party, or
   * its gather — the chain's shape turned sideways. Hands are ordinary
   * sibling jobs with distinct prompts (the sentence's own list items,
   * licensed by "a team of N" in the user's words) that run at once and
   * carry no channels; the gather is queued by the completion hook when the
   * last hand settles, receives every hand's report and files renamed into
   * its input/, and produces the one deliverable — and the outbox, when the
   * request sends. The request-specific context the gather needs rides here
   * on every hand, because the gather does not exist until the last hand
   * delivers and must be buildable from whichever hand settles last.
   */
  party?: {
    /** The party's shared id; hands and gather all carry it. */
    id: string;
    /** Which hand this is, 1-based; 0 on the gather. */
    hand: number;
    /** How many hands the party has. */
    of: number;
    /** This job is the gather. */
    gather?: boolean;
    /**
     * This job is a plan (TEAMWORK T3, D-196): it proposes the split as
     * PARTY.json and queues nothing — approving it is what queues the
     * hands, carrying this spec forward.
     */
    plan?: boolean;
    /** Hands the gather halts without, by number (from the reviewed plan). */
    loadBearing?: number[];
    /**
     * A repository party (TEAMWORK T4, D-197): hands clone and patch
     * disjoint scopes; the gather merges the patches on a fresh clone and
     * its single DIFF.patch is what Approve applies.
     */
    repo?: boolean;
    /** The paths THIS hand may edit, from the reviewed plan (repo parties). */
    scope?: string[];
    /** The original request, quoted into the gather's brief. */
    asked?: string;
    /** A trailing send clause the hands were cut from; the gather's to do. */
    sendTail?: string;
    /** Channels the request settled — for the gather; hands never send. */
    channels?: string[];
    /** The desk's answers (the send recipient), for the gather's brief. */
    answers?: Record<string, string>;
    /** The request asked for a check pass — the gather gets it, hands never. */
    checked?: boolean;
  };
  /**
   * The channels this job sends on, when intake detected any (D-079). The
   * session is told the outbox contract for each and nothing else changes —
   * composing happens in the run, sending stays at approval (D-075).
   *
   * A list since D-179: one sentence can ask for two, and one job does the
   * work once and writes an outbox per channel. Ordered as the sentence asked
   * for them, so the first is the one a single-channel path means when it
   * needs to pick one. A job stored before D-179 holds a bare string, lifted
   * to a one-entry list on read.
   */
  channels?: string[];
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
   * Channels the prompt asked to send on that this job is not carrying
   * (D-178) — a sibling of `channelMention` above and deliberately not the
   * same field: that one says a channel was *mentioned* and nothing claimed,
   * this one says a channel was genuinely asked for and a one-channel job
   * could not take it. The consequence is the same sentence at review —
   * approving sends nothing there — and the cause the user has to act on is
   * not.
   */
  alsoAsked?: { channel: string; label: string }[];
  /**
   * The job this one answers. Its sandbox is carried forward, so a reply picks
   * up where that run stopped instead of paying to redo it.
   */
  continues?: string;
  /**
   * The reply or carry-on that took this job over (D-139). An answered
   * failure is not still asking: the feed retires its card and the review
   * stops offering the reply box and More turns/time once this is set.
   */
  continuedBy?: string;
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
  /**
   * What the user typed into the reply box that queued this job — the last
   * thing they said about this work (D-201).
   *
   * It is already inside `prompt` as "The user replied: …", and stored again
   * here because a discard has to quote it and reading it back out of the
   * prompt would be a second notion of where a reply lives, drifting from the
   * one place that writes it (D-030). Absent on a job queued any other way,
   * and on every job written before this existed.
   */
  reply?: string;
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
  /**
   * Parsed from OUTBOX.json when the run left a valid one. Approve executes it
   * (D-075).
   *
   * A list since D-179, because a sentence can ask for two channels and the
   * work behind them is one job: the run does it once, so the figures agree,
   * and composes a message set per channel, so the bodies may differ — which
   * four of the five two-channel sentences in the benchmark corpus want. One
   * per channel, never two for the same one.
   *
   * A job stored before D-179 holds a bare object here; `readStoredJobs` and
   * `restore` lift it into a one-entry list on the way in, so nothing on disk
   * needs rewriting and no reader has to know both shapes.
   */
  outbox?: Outbox[];
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
  /**
   * Send results so far, merged across retries — one entry per channel that
   * has been attempted (D-179).
   *
   * Per channel because the dedup is per channel: `sentTo` is what stops a
   * second Approve messaging anyone twice, and a flat list across channels
   * would let an address sent on one suppress the same address on another.
   * Legacy single objects are lifted on read, keyed to the outbox they were
   * written for.
   */
  outboxSent?: OutboxSent[];
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
  /**
   * The party split a plan job proposed (TEAMWORK T3, D-196), parsed from
   * PARTY.json. The same promise shape as `outbox`, `packDraft` and
   * `moves`: written by the session, performed by the server at Approve —
   * promoting this job is what queues the hands.
   */
  partyDraft?: {
    hands: { prompt: string; scope?: string[]; loadBearing?: boolean; why?: string }[];
    notes?: string;
  };
  /** PARTY.json existed and was not a valid plan — the reason, never a silent drop. */
  partyDraftError?: string;
  /**
   * What this run says it took out before sending (D-181), when the sentence
   * asked for something to be withheld.
   *
   * The same promise shape as `outbox` and `moves` — written by the session,
   * checked and performed by the server — but the check is the point here:
   * Approve greps every outgoing body, subject and readable file for these
   * values and refuses the send if one survived. That is the whole of what
   * the app promises about redaction: not that nothing sensitive leaves, but
   * that what the run *declared* it removed is genuinely gone.
   */
  withheld?: Withheld;
  /** WITHHELD.json existed and was not a valid declaration — the reason, never a silent drop. */
  withheldError?: string;
  /**
   * The reconciliation the run declared, as the server recomputed it at
   * completion (D-222): both sides adjusted, whether they meet, and the
   * counts. Approve is refused while `balances` is false.
   */
  reconciliation?: ReconciliationSummary;
  /** RECONCILIATION.json existed and was not a valid declaration — the reason, never a silent drop. */
  reconciliationError?: string;
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
  /**
   * What the run left for the user, counted at the sandbox's top level when
   * it ended (UI.md, step 9) — the one notion the backoffice row reads. Jobs
   * finished before the field existed are stamped once at the next start,
   * from the sandbox they left; absent means that sandbox is gone.
   */
  delivered?: DeliverySummary;
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
  cleared: 'closed',
  failed: 'closed',
};

/** Null for `queued` and `running`, which are not history yet. */
export function outcomeOf(status: JobStatus): Outcome | null {
  return OUTCOMES[status] ?? null;
}

/**
 * Whether a delivery is still waiting on the user — D-139's rule made whole:
 * in the to-review outcome AND not carried on. A continued job had its
 * decision (More turns, a reply), so counting it as pending dressed thirteen
 * decided chain legs as work waiting forever. Every surface that says
 * "waiting on you" — the select screen's badge, the parcel pile, the desk,
 * the work record's pending group — asks this one question; the private
 * copies it replaces had already drifted from each other (D-030's lesson,
 * again).
 */
export function awaitingVerdict(job: { status: JobStatus; continuedBy?: string }): boolean {
  return outcomeOf(job.status) === 'to review' && !job.continuedBy;
}

/** Whether a run left something for the user, whatever its ledger outcome. */
export function isDelivery(status: JobStatus): boolean {
  return (
    status === 'done' || status === 'partial' || status === 'promoted' || status === 'cleared'
  );
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

/**
 * One trade on the crew's CV (the Meet-the-crew screen): the role as it is
 * served, plus what a session of it may be quoted at most and what sessions
 * of it have actually cost — nominal beside measured, so the two can be read
 * against each other rather than one standing in for the other.
 */
export interface CrewRole extends RoleInfo {
  /** The most one session may be quoted, after the role's own ceiling and the env clamp. */
  ceilingUsd: number;
  /** Full sessions of this role on the ledger: how many, and what they cost. */
  measured: { samples: number; meanUsd: number; maxUsd: number };
}

export interface CrewCv {
  roles: CrewRole[];
  /** The hard turn ceiling every role is clamped to. */
  turnCeiling: number;
  /** The default budget a role naming none gets. */
  defaultTurns: number;
  /** What the two paid tiers have cost across every role: the price ladder's own rungs. */
  tiers: { oneshot: TierCost; session: TierCost };
}

export interface TierCost {
  samples: number;
  meanUsd: number;
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

/**
 * One classified word of the sentence, located — what drove which outcome,
 * for the desk to underline. Offsets index the trimmed sentence the plan was
 * made from, `end` exclusive, so `text.slice(start, end) === word` always
 * holds and the client can verify a span before painting it.
 */
export interface WorkSpan {
  start: number;
  end: number;
  /** The exact substring, original case. */
  word: string;
  category: 'intent' | 'domain' | 'gap' | 'gap-suggestion' | 'channel-word' | 'channel-verb';
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
  /**
   * A gap word beside the nearest word the catalog itself uses — informational
   * only, never applied to the match (D-093): acting on it is the user's move.
   */
  suggestions: { word: string; suggestion: string; distance: number }[];
  /** The matcher's own words located in the sentence (intent/domain/gap kinds). */
  spans: WorkSpan[];
  alternatives: { name: string; description: string }[];
}

/**
 * A real-world job record, normalised from whatever source wrote it — an
 * O*NET occupation, an ESCO occupation, later a posting or a CV — so the
 * coverage grader and the screens read one shape and never a source's own
 * field names. Provenance is kept on purpose: `source`, `sourceVersion`,
 * `occupationId`, `sourceUrl` and each task's `sourceId` are what let an
 * aggregate be traced back to the record that produced it.
 */
export interface WorkProfile {
  id: string;
  /** Adapter name: `onet`, `esco`, `fixture` … */
  source: string;
  sourceVersion?: string;
  sourceUrl?: string;
  title: string;
  aliases: string[];
  tasks: WorkTask[];
  skills: string[];
  tools: string[];
  domain?: string;
  /** The source's own identifier for the occupation (an O*NET-SOC code, an ESCO URI). */
  occupationId?: string;
}

export interface WorkTask {
  id: string;
  text: string;
  /** Core duty, as the source rates it; a supplemental one is `false`. */
  required: boolean;
  /** The source's own identifier for the task statement. */
  sourceId?: string;
}

export type TaskGrade = 'covered' | 'partial' | 'uncovered';

/**
 * Why a duty is less than covered. Kept apart because each has a different
 * remedy, and collapsing them is how a weak word match turns into a hiring
 * recommendation:
 *  - `matcher`    — the wording was not understood, or the words reach a role
 *                   but no recorded power vouches for the duty; the crew may
 *                   well be capable.
 *  - `capability` — evidence says the crew cannot do it: a decided-not-built
 *                   or not-built boundary.
 *  - `door`       — the duty needs a connection: one that exists and is
 *                   closed (`doorExists`), or one the app has no door for.
 *  - `policy`     — the agentling will not do it by decision (pay, act, talk).
 *  - `roster`     — a role covers it but nobody awake in this level holds it.
 */
export type GapKind = 'matcher' | 'capability' | 'door' | 'policy' | 'roster';

/** What the grade rests on: a recorded power, a recorded boundary, the words alone, or nothing. */
export type CoverageEvidence = 'power' | 'boundary' | 'lexical' | 'none';

export interface TaskCoverage {
  taskId: string;
  sourceId?: string;
  text: string;
  required: boolean;
  grade: TaskGrade;
  gap: GapKind | null;
  evidence: CoverageEvidence;
  /** The role this duty resolved to, or null. */
  role: string | null;
  /** The matcher's 0–1 confidence on this duty's words. */
  confidence: number;
  /** One line per thing the grade rests on, in the order they were weighed. */
  reasons: string[];
  matchedTerms: string[];
  /** Words of the duty nothing installed understands. */
  uncoveredTerms: string[];
  /** Ids of the powers and boundaries that fired. */
  powers: string[];
  boundaries: string[];
  /** What would have to exist or be on before the grade improves. */
  missing: { skills: string[]; tools: string[]; connections: string[] };
  /** The door it needs exists in the catalog and is merely closed. */
  doorExists?: boolean;
  /** The evidence supports saying "not this crew" for this duty. */
  notThisCrew: boolean;
  alternatives: string[];
}

export interface RosterState {
  role: string | null;
  /** Someone awake in the level holds the role. */
  held: boolean;
  /** The only holders are resting. */
  resting: boolean;
  /** Who the queue would hand it to instead, as their own role (D-200); null when held or no crew. */
  fallbackRole: string | null;
}

/** The coverage of one real-world job by the crew as it stands. Reusable app-wide. */
export interface CoverageResult {
  profileId: string;
  source: string;
  sourceVersion?: string;
  occupationId?: string;
  title: string;
  role: string | null;
  confidence: number;
  tasks: TaskCoverage[];
  counts: Record<TaskGrade, number>;
  gaps: Record<GapKind, number>;
  roster: RosterState;
  missing: { skills: string[]; tools: string[]; connections: string[] };
  alternatives: string[];
  /** Every task is graded off a boundary and none is a mere word gap. */
  notThisCrew: boolean;
}

/** The job board (D-232): the O*NET database as an optional local data set. */
export interface JobBoardInfo {
  present: boolean;
  version?: string;
  occupations?: number;
}

/** One board search hit: the occupation and its coverage, graded on demand. */
export interface JobBoardHit {
  title: string;
  occupationId?: string;
  sourceUrl?: string;
  aliases: string[];
  coverage: CoverageResult;
}

/** The hire hint: the one occupation a hire sentence names, or nothing. */
export interface JobBoardHint {
  title: string;
  occupationId?: string;
  role: string | null;
  counts: Record<TaskGrade, number>;
  line: string;
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
  /**
   * Runs a limit stopped — the turn budget or the clock — read off the row's
   * own flags and never off turns over the cap, which a finished run can
   * carry (D-022, D-212). A floor for rows older than the flags whose job is
   * no longer stored to backfill from (UI.md, step 12).
   */
  cut: number;
  /** Runs that ended done on their own: landed, and not cut. */
  finished: number;
  /** Spend ÷ quoted over priced runs; null when nothing carried a quote. */
  ratio: number | null;
  signal: BudgetSignal;
}

export interface AgentlingProfile {
  agentling: Agentling;
  role: RoleInfo | null;
  /** Learnt lessons only, oldest first — the journal lines stay out (D-089). */
  memory: string[];
  /** The notes a discard banked (D-201), oldest first — not lessons, shown under their own tag. */
  discards: string[];
  /** Jobs of theirs you kept — the queue's verdicts beside the ledger's outcomes. */
  kept: number;
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
  /**
   * This run inherited the file and did not touch it: byte-identical to the
   * file of the same name in the run it continues (D-202).
   *
   * A neutral fact, deliberately not a verdict. A continuation starts with
   * its parent's whole sandbox copied in, so every file it did not rewrite is
   * still sitting there looking exactly like a deliverable — and a promoted
   * run once carried a PDF byte-identical to a render two legs older while
   * its RESULT said "the composition is re-rendered". What the reviewer
   * needed was not an accusation but the other half of the sentence, next to
   * the file itself.
   *
   * Present only on a continuation, and gated on presence rather than truth
   * (the ledger's rule, D-029): `false` is an answer — this run wrote it, or
   * the parent never had it, which read the same way to a reviewer — while
   * an absent field means the job continues nothing and there is no previous
   * run to have carried anything from.
   */
  carried?: boolean;
}

/**
 * What a run left for the user, counted at the sandbox's top level (UI.md,
 * step 9): the files that are not the crew's paperwork, PDFs and images told
 * apart because a row wants to say so, and the folders beside them with their
 * weight — `work/` is where a cut run's evidence sits and nothing listed it.
 * The clone is never a folder of the run's own.
 */
export interface DeliverySummary {
  files: number;
  pdf: number;
  images: number;
  dirs: { name: string; files: number; bytes: number }[];
}

/** One door's use, read off the door trail (D-192) for Settings (UI.md, step 8). */
export interface DoorUsage {
  door: string;
  calls: number;
  errors: number;
  firstAt: number;
  lastAt: number;
  /** Calls per tool on this door. */
  tools: Record<string, number>;
}

/**
 * What a continuation leg receives from the run it continues, and what stays
 * behind (UI.md, step 10) — the one list `carryForward` copies from and the
 * review's More-turns note reads, so the note can never describe a copy the
 * code does not make.
 */
export interface CarryManifest {
  /** Top-level files copied across: the previous leg's deliverables. */
  files: string[];
  /** The previous leg's given files, under input/. */
  input: string[];
  /** The report that rides as PREVIOUS-RESULT.md, by its name in the previous leg; null when it wrote none. */
  report: string | null;
  /** A repository patch to apply, when the leg has a clone. */
  patch: boolean;
  /** What stays: the paperwork, and every folder but input/. */
  left: { paperwork: string[]; dirs: string[] };
}

/** One line of a sandbox's trail (D-211), as the review's turns strip reads it. */
export interface TrajectoryLine {
  at: number;
  pass: 'session' | 'closeout';
  kind: 'call' | 'result' | 'said' | 'end' | 'compact';
  turn?: number;
  id?: string;
  /** call: the tool's name and its clipped arguments. */
  name?: string;
  args?: string;
  /** result: whether it went well; result and said: the clipped head. */
  ok?: boolean;
  head?: string;
  /** end: how the child ended and what the meter knew by then. */
  outcome?: string;
  toolCalls?: number;
  costUsd?: number;
  turns?: number;
  durationMs?: number;
  /**
   * compact (D-212's instrument): the SDK compacted the context on this turn
   * — why, and the token counts either side as the SDK reported them.
   */
  trigger?: string;
  preTokens?: number;
  postTokens?: number;
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
  /** Which step of its chain this was (D-105), so the inbox can group. */
  step?: { n: number; of: number };
  /** The previous step's job id — the link the grouping walks. */
  stepPrev?: string;
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
  /**
   * The channel this fact belongs to, when it belongs to one (D-180).
   *
   * A job can send on several channels (D-179) and each needs its own
   * recipient, so the id carries the channel — but the client must not have
   * to parse an id to know which picker, which audience and which address
   * shape apply. Said here instead, by whoever already knew.
   */
  channel?: string;
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
  /**
   * The party Start will queue (TEAMWORK T2, D-195), shown priced before
   * anything runs: every hand on its own piece, the gather on its fixed
   * sentence, and the words the licence was read from (D-184's quote-back).
   */
  party?: {
    words: string;
    sendTail?: string;
    hands: { sentence: string; title: string; quote: Quote }[];
    gather: { quote: Quote };
  };
  /** A party was asked for and cannot run — the reason, said at the desk. */
  partyBlocked?: string;
  /**
   * What a plan job would cost (TEAMWORK T3), shown beside `partyBlocked`
   * so the planner offer is priced before it is pressed.
   */
  planQuote?: Quote;
  /** The sentence asked for a check pass (TEAMWORK T1, D-194). */
  checked?: boolean;
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
  /** Near-misses for the gaps, suggestion-only (D-093) — see MatchSuggestion. */
  suggestions: { word: string; suggestion: string; distance: number }[];
  /**
   * Every located word for the desk's underlines. The plan route merges the
   * channel detectors' evidence into the matcher's; other planWork callers
   * carry the matcher's alone, since nothing renders spans off the desk.
   */
  spans: WorkSpan[];
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
   * The sentence asks to reconcile (D-224). Named by the server so the desk
   * never re-derives the verb; the desk counts the files and arrests a
   * statement with nothing to reconcile it against — softly, the
   * missingAttachment way (D-134): the reason on the button, a second press
   * queues anyway.
   */
  reconcile?: boolean;
  /**
   * A channel word with no send verb beside it (D-093) — the near-miss the
   * ask stays quiet on, surfaced as a question the user can confirm. Absent
   * whenever a real ask fired.
   */
  channelMention?: { channel: string; label: string; wired: boolean };
  /**
   * A cadence the sentence itself carries (D-184) — "every Monday at 9".
   *
   * Fills the repeat controls in and is said in words on the card, because
   * Start with a repeat set both runs the job now *and* creates a schedule
   * that spends money on a timer. `phrase` is the words it was read from, so
   * the reading can be checked rather than taken on trust.
   */
  cadence?: { cadence: Cadence; phrase: string; label: string };
  /**
   * Channels this send asks a file to ride on that cannot carry one.
   *
   * The outbox contract refuses a file on these channels anyway, but only once
   * the run has written it — so the desk says it first, while the sentence can
   * still be changed. Nothing is blocked: the message goes, the file stays.
   * `phrase` is the word it was read from, so the reading can be checked.
   */
  noFiles?: { channel: string; label: string; phrase: string }[];
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
/**
 * The handshake came from another site and was refused (D-239). Its own code
 * rather than `SOCKET_LEVEL_GONE`, because the client must never retry this
 * one: a level that vanished may come back, and a forbidden origin will not.
 */
export const SOCKET_FORBIDDEN_ORIGIN = 4403;
/**
 * The handshake carried no valid session cookie (Wave 0). Its own code, and
 * distinct from `SOCKET_FORBIDDEN_ORIGIN` for the opposite reason that one is
 * distinct from `SOCKET_LEVEL_GONE`: a forbidden origin is never coming back,
 * but this one is fixed by signing in — so the client must stop retrying *and*
 * show the login screen rather than an error.
 */
export const SOCKET_UNAUTHENTICATED = 4401;
/** Localhost API port; the spawned runner calls back here for web fetches. */
export const SERVER_PORT = 4600;
