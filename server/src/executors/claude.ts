import { type ChildProcess, spawn } from 'node:child_process';
import {
  cpSync,
  type Dirent,
  existsSync,
  mkdirSync,
  readdirSync,
  readFileSync,
  writeFileSync,
} from 'node:fs';
import path from 'node:path';
import { createInterface } from 'node:readline';
import { fileURLToPath } from 'node:url';
import type {
  Agentling,
  AudiencePerson,
  Job,
  JobAttachment,
  JobMeter,
  Pending,
} from '@agentlings/shared';
import { SERVER_PORT } from '@agentlings/shared';
import { briefForJob } from '../channel';
import { folderInventory, organizeBrief } from '../organize';
import { mcpToolNames, resolveForJob, toMcpServers, type Connection } from '../connections';
import { applyPatch, cloneRepo, patchFile, repoDir, writeDiff } from '../gitwork';
import { rateFor, type LedgerEntry } from '../ledger';
import type { MemoryStore } from '../memory';
import { outputNames } from '../outputs';
import type { LoadedRole, RoleRegistry } from '../roles';
import { relevantLines } from '../router';
import { GITHUB_TOOLS } from '../github';
import { SEARCH_TOOLS } from '../search';
import { extractUrls, fetchPage } from '../web';
import type { Executor, ExecutorResult, RunHint } from './executor';

const SESSION_TIMEOUT_MS = 10 * 60_000;
/**
 * A runaway agent that keeps "investigating" is the classic cost failure
 * mode, and turns are the multiplier. Roles that genuinely need to explore
 * raise this themselves with `maxTurns:` in their frontmatter; the default is
 * deliberately tight. Was 60, which was an accident rather than a decision.
 *
 * Then 8, which was right while the session also had to write its own notes
 * and is one turn short now that it does not: of the repo jobs measured after
 * the close-out moved out, the substantial one used 7 of 8. A wasted turn
 * costs about 7c. A run that hits the cap costs a `partial`, and a partial
 * never counts toward the successes a tool is promoted on — so the cap
 * stalling is not a slower loop, it is a loop that never reaches its last
 * stage. Cheap to be generous, expensive to be tight.
 */
const DEFAULT_MAX_TURNS = 10;
const TURN_CEILING = 40;
/**
 * What a job runs on when the crew has a recipe for it. Was 1, which sounds
 * like the ideal saving and cannot work: a single turn ends before the model
 * sees any tool result, so anything that must read before it writes — every
 * repo job — is impossible. Measured, it failed on max_turns having produced
 * no files at all, and cost more than the full session it replaced, since it
 * paid for the system prompt with no cache to read from.
 *
 * A recipe means explore less, not work blind.
 *
 * Then 3, and every one of the thirteen recipe runs on record ran out — not
 * occasionally, all of them. That is worse than it sounds, because `successes`
 * only counts runs that finish and a tool is promoted on three of them: a
 * recipe on a leash it always breaks can be used forever and never become
 * compilable, which makes the fourth tier unreachable by the ordinary path.
 * At 5 it still explores less than a cold run — those finished at 4 and 7
 * turns with no method handed to them — and it can now actually land.
 */
export const RECIPE_TURNS = 5;
/**
 * What compiling a recipe into a tool runs on, which is not what an ordinary
 * job runs on. A compile has to write two programs that agree with each other
 * — `run.mjs` and the `verify.mjs` that refuses its output — and the halves
 * disagreeing is precisely what running out of turns produces. Attempt one
 * failed exactly there: it listed a multi-line `export async function`
 * correctly and its own checker rejected it, one line in 124.
 *
 * The number is 10 — the same as the default, and stated rather than inherited
 * so that a role raising its own `maxTurns:` does not silently change what a
 * compile gets. The compile's needs are the compile's.
 *
 * It was briefly 15, on the reasoning that all three compiles on record had
 * run out of turns. Measured, that was the wrong inference. Attempt 3 at 15
 * ran out *as well* (16 reported of 15) and cost $1.32, against attempt 2's
 * $0.94 at a cap of 10 — 40% more money for the same outcome, and comparing
 * the two generated `verify.mjs` files afterwards, attempt 2's was if anything
 * the more thorough. What actually fixed the compile was telling it how the
 * previous one failed, not lengthening the leash.
 *
 * The real error was reading "ran out of turns" as "needed more turns".
 * Running out is a compile's *ordinary* ending, exactly as it is the
 * close-out's: it writes both programs and dies reporting that it did. The
 * status now says so, so the next person reads delivery off the label instead
 * of inferring a shortage from it.
 */
export const COMPILE_TURNS = 10;
/**
 * The write-up runs on its own, after the work, on the cheapest model going.
 *
 * It used to be part of the session, which meant it competed with the work for
 * turns — so it lost, every time, and the crew learned nothing from the tier
 * built to be cheap. Off the session it needs no repository, no exploring and
 * one turn: it is handed what the run left behind and asked to describe it.
 */
const CLOSEOUT_MODEL = 'claude-haiku-4-5-20251001';
/**
 * Two, not one, and measured rather than assumed. At one turn the pass read
 * the file it had just been told about and died on max_turns having written
 * nothing — the same orientation turn that repo runs used to waste, and the
 * same reason a one-shot cannot work at a single turn: a turn ends before the
 * model sees any tool result. The prompt now tells it not to go looking, and
 * the second turn is there for when it does anyway.
 */
const CLOSEOUT_TURNS = 2;
export const RUNNER = fileURLToPath(new URL('./agent-runner.mjs', import.meta.url));

/**
 * When the server itself runs inside a Claude Code terminal, inherited session
 * vars (an ANTHROPIC_BASE_URL proxy, CLAUDE_CODE_*) would point a spawned
 * runner's CLI at the host session's endpoint and break auth. Launder them so
 * the child authenticates like a fresh terminal would.
 */
export function launderedEnv(): Record<string, string | undefined> {
  return Object.fromEntries(
    Object.entries(process.env).filter(
      ([key]) =>
        key === 'CLAUDE_CODE_OAUTH_TOKEN' || // long-lived token from `claude setup-token`
        (!key.startsWith('CLAUDE') &&
          key !== 'ANTHROPIC_BASE_URL' &&
          key !== 'ANTHROPIC_AUTH_TOKEN'),
    ),
  );
}

/** Role tool names (lowercase, role files) → Agent SDK tool names. */
const TOOL_MAP: Record<string, string[]> = {
  read: ['Read'],
  write: ['Write'],
  edit: ['Edit'],
  bash: ['Bash'],
  grep: ['Grep', 'Glob'],
  glob: ['Glob'],
  web_fetch: ['WebFetch'],
  web_search: ['WebSearch'],
};

const DEFAULT_TOOLS = ['Read', 'Write', 'Edit', 'Bash', 'Grep', 'Glob'];

/**
 * SDK tools that leave the sandbox, and the connection that authorises them.
 *
 * The registry is meant to be the only door outside. It was not: `allowedTools`
 * is built from the role alone, so a role naming `web_fetch` got the SDK's own
 * `WebFetch` whatever the user had switched off in Settings — the app's own
 * fetch tool and the pre-fetch of typed URLs were gated, and this second door
 * was not. Anything added to this map is a tool that must be asked for.
 */
const OUTSIDE_TOOLS: Record<string, string> = {
  WebFetch: 'web',
  WebSearch: 'web',
};

/**
 * Drops the tools whose connection this job was not granted.
 *
 * Applied after the role's list and after the default, because the question is
 * not what the role would like — it is what the user has allowed. A role left
 * with nothing but outside tools correctly ends up with none: it cannot reach
 * anything, which is the answer, not a fault.
 */
export function gateOutside(tools: string[], grantedNames: string[]): string[] {
  return tools.filter((tool) => {
    const needs = OUTSIDE_TOOLS[tool];
    return needs === undefined || grantedNames.includes(needs);
  });
}

/**
 * The document libraries, and how to call them.
 *
 * A sandbox sits inside the project, so Node walks up and resolves the root's
 * `node_modules` — nothing is installed per job and nothing is fetched. But a
 * library nobody is told about is not a capability: watched live, an agentling
 * asked for a PDF hand-assembled the bytes over several turns because it had
 * no idea `pdf-lib` was there. It worked, which is the part that makes it
 * expensive rather than obviously wrong.
 *
 * The call shapes are here because guessing them costs a turn. `pdf-parse` in
 * particular reads like its old function form and is now a class, so an agent
 * that reaches for the obvious `pdfParse(buffer)` fails and retries.
 */
const DOCUMENT_LIBRARIES = [
  '## Document libraries (already installed — never npm install)',
  'Import them directly; they resolve from the project root.',
  '- .docx write: `const {Document,Packer,Paragraph}=await import("docx")` → `writeFileSync(f, await Packer.toBuffer(doc))`',
  '- .docx read: `(await import("mammoth")).default.extractRawText({path})` → `.value`',
  '- .xlsx read/write/edit: `new (await import("exceljs")).default.Workbook()`, `await wb.xlsx.writeFile(f)` / `readFile(f)`',
  '- .pptx write: `new (await import("pptxgenjs")).default()`, `await pres.writeFile({fileName})`',
  '- .pdf write/edit: `const {PDFDocument,StandardFonts}=await import("pdf-lib")`; `PDFDocument.load(bytes)` opens an existing one',
  '- styled .pdf report (when a `render_pdf` tool is present): write ONE self-contained .html — inline CSS, images as data: URIs, `@page` rules for size and margins — then call `render_pdf` with the whole html; it writes the PDF at the sandbox root and reports pages and bytes. External URLs are blocked during the render, so nothing the page needs may live outside it',
  '- level-backdrop plate (when a `render_plate` tool is present): write ONE self-contained .html page — three.js importable from `http://three.local/three.module.js`, the only URL that resolves — set `document.title = "ready"` after your scene has drawn, then call `render_plate`; it writes a 2000×900 PNG at the sandbox root, quantized to the 128-colour backdrop budget, and reports colours and worst crew separation',
  '- .pdf text: `const {PDFParse}=await import("pdf-parse")`; `await new PDFParse({data}).getText()` → `.text`',
  // A scan returns nothing from `getText`, and an agent that does not know
  // there is an answer to that will conclude the file is empty and say so.
  // Named for the same reason the rest are: D-031 watched one hand-assemble a
  // PDF because nobody had mentioned pdf-lib, and it worked, which is what
  // made it expensive rather than obviously wrong.
  '- scanned .pdf or a photo (getText came back empty): `const {ocrPdf,imageText}=await import("<repo>/server/src/documents")`; `(await ocrPdf(f, 20)).text`, or `imageText(png)`. Windows only — the words are a good reading, not the document\'s own, so say so when you quote them.',
  'Use these rather than assembling a file format by hand.',
].join('\n');

/**
 * A session that failed after spending money, and possibly after doing the
 * work. Carries what the run produced so the caller can still bank the cost,
 * the lesson and the diff — a job that dies on its last turn should not throw
 * away everything the turns before it earned.
 */
/**
 * What a run killed on purpose fails with. Shared rather than written out at
 * each end: a thrower saying one word and a reader watching for another is a
 * check that silently never fires.
 */
export const CANCELLED = 'cancelled';

export class SessionFailure extends Error {
  constructor(
    message: string,
    readonly meter: JobMeter = {},
    readonly lesson?: string,
    readonly approach?: string,
  ) {
    super(message);
    this.name = 'SessionFailure';
  }
}

/**
 * A role's own wall clock, clamped like the turn cap so a typo cannot uncap
 * it. The 10-minute default binds long-form work before turns do — the first
 * live deck run was cut mid-iteration by the wall with turns to spare
 * (D-128) — so a role that genuinely runs long raises this in its
 * frontmatter, the exact shape `maxTurns:` already has.
 */
const TIMEOUT_CEILING_MINUTES = 30;
export function timeoutMsFor(role: { timeoutMinutes?: number } | undefined): number {
  const wanted = role?.timeoutMinutes;
  if (typeof wanted !== 'number' || !Number.isFinite(wanted) || wanted < 1) {
    return SESSION_TIMEOUT_MS;
  }
  return Math.min(Math.trunc(wanted), TIMEOUT_CEILING_MINUTES) * 60_000;
}

/** A role's own turn budget, clamped so a typo can't uncap the loop. */
export function turnsFor(role: { maxTurns?: number } | undefined): number {
  const wanted = role?.maxTurns;
  if (typeof wanted !== 'number' || !Number.isFinite(wanted) || wanted < 1) {
    return DEFAULT_MAX_TURNS;
  }
  return Math.min(Math.floor(wanted), TURN_CEILING);
}

/**
 * The most turns this run may take before the quote is applied: a recipe
 * buys a short leash, a job that states its own need gets that, and anything
 * else gets the role's own budget.
 *
 * A job's own cap wins over the role's because the work, not the worker,
 * is what makes a compile long — it is handed to whichever role owns the
 * recipe, and none of them should have to raise their everyday budget to
 * accommodate it. The leash still wins over both: a job the crew has a recipe
 * for is one it has done before, whatever it claims to need.
 *
 * `firm` says which kind of cap this is, and the distinction is the whole of
 * D-067. The leash and a job's stated need are *decisions about this run* —
 * the one-shot tier simply is its five turns, and a rich quote must not be
 * able to extend it into an ordinary session. A role's `maxTurns` is nothing
 * of the sort: it is a standing guess about a trade, made before anyone saw
 * the job, and it has no business outranking a budget computed for the work
 * actually in front of it.
 */
export function turnCapFor(
  role: { maxTurns?: number } | undefined,
  hint?: { oneShot?: boolean },
  jobTurns?: number,
): { turns: number; firm: boolean } {
  if (hint?.oneShot) return { turns: RECIPE_TURNS, firm: true };
  if (typeof jobTurns === 'number' && Number.isFinite(jobTurns) && jobTurns >= 1) {
    return { turns: Math.min(Math.floor(jobTurns), TURN_CEILING), firm: true };
  }
  return { turns: turnsFor(role), firm: false };
}

/**
 * A money ceiling the SDK can actually enforce.
 *
 * The session stream carries no running cost — measured, not assumed: the
 * only total_cost_usd in a 35-message session arrives on the final message,
 * and per-message usage is partial (52 output tokens reported against a true
 * 568). So a mid-flight dollar check cannot stop an overspend, it can only
 * notice one after the money is gone.
 *
 * Turns are the lever that exists *before* the spending, so the ceiling is
 * converted into turns at what a turn of this work has really cost. With no
 * history to price a turn, the cap simply stands.
 *
 * **The quote wins against a role's standing guess, in both directions.** It
 * used to only ever tighten, on the reasoning that a generous ceiling must not
 * let a job outrun its role — but that rule was written when the per-turn rate
 * was pooled across repo and no-repo work and predicted neither, so the cap
 * always won and the ceiling could never bind on anything (D-018). The rate has
 * been per-shape and per-tier since. What the old rule left behind was a
 * standing guess about a trade beating an estimate computed for the job:
 * measured four times on one sentence, `worker`'s cap of 10 bound work the
 * quote had funded to roughly 56 turns, and every one of those runs was killed
 * having delivered (D-063, D-066).
 *
 * A `firm` cap still binds absolutely — see `turnCapFor`. Both hard clamps
 * stand: `TURN_CEILING` so a loop cannot be uncapped, and the quote's own
 * `MAX_CEILING_USD` upstream so one freak run cannot fund the next.
 */
export function turnsForBudget(
  ceilingUsd: number | undefined,
  perTurn: { samples: number; usd: number },
  cap: { turns: number; firm: boolean },
): number {
  if (!ceilingUsd || ceilingUsd <= 0 || perTurn.samples === 0 || perTurn.usd <= 0) {
    return cap.turns;
  }
  // At least one turn: a budget too small for a single turn should fail on
  // its own terms, not be silently turned into a session that cannot think.
  const funded = Math.max(1, Math.floor(ceilingUsd / perTurn.usd));
  return cap.firm ? Math.min(cap.turns, funded) : Math.min(TURN_CEILING, funded);
}

export function mapTools(roleTools: string[]): string[] {
  const mapped = roleTools.flatMap(
    (t) => TOOL_MAP[t.toLowerCase()] ?? [t.charAt(0).toUpperCase() + t.slice(1)],
  );
  return [...new Set(mapped)];
}

/**
 * What is in the clone, so the first turn is not spent finding out.
 *
 * Watched live, every repo run opened with `ls` or `Get-ChildItem` before it
 * could do anything — on a short leash that orientation turn was the
 * difference between landing the edit and running out. A directory listing
 * costs nothing here and buys back a turn there.
 */
export function repoListing(root: string, limit = 40): string[] {
  const out: string[] = [];
  const walk = (dir: string, prefix: string): void => {
    if (out.length >= limit) return;
    let entries: Dirent[];
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch {
      return;
    }
    for (const entry of entries) {
      if (out.length >= limit) return;
      if (entry.name === '.git' || entry.name === 'node_modules') continue;
      const rel = `${prefix}${entry.name}`;
      if (entry.isDirectory()) walk(path.join(dir, entry.name), `${rel}/`);
      else out.push(rel);
    }
  };
  walk(root, '');
  return out.sort();
}

/**
 * What the session is actually asked to do.
 *
 * Answers the user gave up front ride here rather than in `job.prompt`,
 * because a recipe is keyed on the prompt: folding them in would give a
 * clarified job a different key from the same job asked plainly, and the crew
 * would stop recognising work it had already done.
 */
/**
 * Marks a failed run's spend unknown when nothing measured it.
 *
 * The SDK reports cost on a result message, so any death before that one
 * arrives leaves real money with no number against it. Recording that as zero
 * is worse than recording nothing: the ledger reads as though the run were
 * free, and the runs that die this way are the *expensive* ones — a session
 * killed by the ten-minute timeout is by definition the longest there is.
 *
 * Measured on job a7b277d3: ten full minutes filed as `costUsd: 0`. The cancel
 * path had always done this correctly; the timeout path rejected with a plain
 * Error and skipped it. Applied here, where every failure meter is assembled,
 * rather than in the branch that happened to be noticed — a spawn failure or
 * anything else that dies early has exactly the same hole.
 *
 * `closeOutUsd` alone is not a cost: the write-up runs after the session and
 * knowing what it spent says nothing about what the session did.
 */
export function withCostKnown(meter: JobMeter): JobMeter {
  if (meter.costUsd !== undefined) return meter;
  return { ...meter, costUnknown: true };
}

/**
 * True when the title says something the prompt does not.
 *
 * `titleFrom` shortens a long prompt and marks the cut with an ellipsis, which
 * is right for a card and wrong for a prompt: a model handed
 * "Job: look up Buydepa and summarise…" above that same sentence reads the
 * ellipsis as a truncated message and asks the user to say it again. Measured
 * on job ca5db1b4 — one turn, 1.4c, no work done, and a question the UI had no
 * way to answer. A title earns its line only when someone wrote it separately
 * from the prompt, as the `/jobs` route allows.
 */
/**
 * Start a follow-up where the run it answers stopped.
 *
 * A reply is a new job — a session is a one-shot child process and pausing one
 * mid-run was refused for good reasons (D-030) — so the continuity has to be
 * put back by hand: the earlier patch is applied to the fresh clone and
 * anything that run produced is copied across. Without this, answering a
 * question would re-do and re-bill work already paid for.
 *
 * Its own paperwork is deliberately left behind. The new run writes its own
 * RESULT.md, and inheriting the old one would make "did this deliver" true
 * before the session had done anything.
 */
export async function carryForward(
  previousId: string,
  sandboxDir: string,
  hasRepo: boolean,
  onProgress?: (detail: string) => void,
): Promise<void> {
  const previous = path.join(path.dirname(sandboxDir), previousId);
  if (!existsSync(previous)) return;
  const patch = patchFile(previous);
  if (hasRepo && existsSync(patch)) {
    onProgress?.('carrying forward the earlier changes');
    await applyPatch(repoDir(sandboxDir), patch);
  }
  for (const name of outputNames(previous)) {
    if (PAPERWORK_FORWARD.has(name)) continue;
    cpSync(path.join(previous, name), path.join(sandboxDir, name));
  }
}

// PENDING.md is paperwork too: forwarded, a parent's account satisfies the
// close-out's short-circuit and gets stamped onto a run it never described.
const PAPERWORK_FORWARD = new Set([
  'RESULT.md',
  'DIFF.patch',
  'LESSON.md',
  'APPROACH.md',
  'PENDING.md',
]);

export function titleAddsSomething(job: Job): boolean {
  const title = job.title.replace(/…+$/, '').trim();
  if (!title) return false;
  return !job.prompt.trim().toLowerCase().startsWith(title.toLowerCase());
}

export function sessionPrompt(job: Job): string {
  const base = titleAddsSomething(job) ? `Job: ${job.title}\n\n${job.prompt}` : job.prompt;
  const parts = [base];
  if (job.clarifications?.length) {
    parts.push(
      `The user has already settled these:\n${job.clarifications
        .map((line) => `- ${line}`)
        .join('\n')}`,
    );
  }
  // A continuation's carry-on brief rides here, never in `job.prompt`, for the
  // same reason the clarification answers above do: a recipe is keyed on
  // normalise(prompt), and a brief folded into the prompt gave a continuation
  // a different key from the job it continues (D-074).
  if (job.brief) parts.push(job.brief);
  return parts.join('\n\n');
}

export function buildAppend(
  role: LoadedRole | undefined,
  lessons: string[],
  knowledge: string[],
  hasRepo: boolean,
  sources: string[] = [],
  approach?: string,
  repoFiles: string[] = [],
  attachments: JobAttachment[] = [],
  /** What the run is actually allowed, after the role cap and the quote. */
  turns?: number,
  /**
   * The outbox contract, when this job sends on a channel (D-079). Told here
   * because a capability nobody is told about is not one (D-031) — without
   * this section a send job has no way to know OUTBOX.json exists.
   */
  outboxBrief?: string,
  /** The organizing contract + folder inventory, when this job organizes (D-132). */
  organizeText?: string,
  /**
   * The wall clock in minutes, said beside the turns for the same reason the
   * turns are said at all (D-138): a run that was never told there was a
   * clock could not ration against it — the first authoring run spent its
   * whole ten minutes composing and died with an empty sandbox.
   */
  minutes?: number,
): string {
  const parts: string[] = [];
  parts.push(role?.prompt ?? 'You are a general-purpose worker agentling.');
  parts.push(
    [
      '## Job rules',
      '- Work only inside the sandbox (your working directory). Never read or write paths outside it.',
      hasRepo
        ? '- The target repository is cloned at ./repo — make all code changes there.'
        : '- There is no target repository; produce your output as files in the working directory.',
      '- Write RESULT.md in the working directory: outcome first, evidence second.',
      // The budget is said out loud because, measured, it was not: job 97b95f10
      // spent all ten of its turns gathering, wrote nothing at all, and filed
      // `failed` with an empty sandbox. No close-out runs on a job that left
      // nothing behind, so no lesson and no approach were banked either — 66c
      // bought two generic log lines. The brief had asked for RESULT.md "when
      // finished" and never mentioned there was a budget to finish inside, so
      // the run could not ration and had no reason to checkpoint.
      //
      // This is not D-020 coming back. That moved LESSON.md and APPROACH.md out
      // of the session because meta-work competed with the work and was cut
      // first. RESULT.md is the deliverable, already demanded here; this changes
      // only *when* it is written, not whether.
      ...(turns
        ? [
            `- You have ${turns} turns${minutes ? ` and about ${minutes} minutes of clock` : ''}. When ${minutes ? 'either runs' : 'they run'} out the session stops wherever you are, so write RESULT.md as soon as you have anything worth reporting and keep updating it. Do not save it for the end.`,
            '- If you run out before finishing, RESULT.md should say what you established, what is still missing, and what you would do next.',
          ]
        : []),
    ].join('\n'),
  );
  if (outboxBrief) parts.push(outboxBrief);
  if (organizeText) parts.push(organizeText);
  if (attachments.length > 0) {
    parts.push(
      [
        '## Files the user attached',
        'They are already in ./input — read them from there, and do not go looking elsewhere.',
        ...attachments.map((a) => `- input/${a.name} (${Math.max(1, Math.round(a.bytes / 1024))} KB)`),
        'Use the document libraries below to read them rather than opening them as plain text.',
      ].join('\n'),
    );
  }
  parts.push(DOCUMENT_LIBRARIES);
  if (repoFiles.length > 0) {
    parts.push(
      [
        `## What is in ./repo (${repoFiles.length} file${repoFiles.length === 1 ? '' : 's'})`,
        ...repoFiles.map((f) => `- repo/${f}`),
        'This is the whole listing. Open what you need; do not list the directory.',
      ].join('\n'),
    );
  }
  if (approach) {
    parts.push(
      [
        '## How this kind of job was done before',
        approach,
        'Follow this directly. Do not re-explore unless it turns out to be wrong.',
      ].join('\n'),
    );
  }
  if (sources.length > 0) {
    parts.push(
      [
        '## Pages already fetched for you',
        'These were read before this session started and trimmed to the important text.',
        'Read them from disk; do not fetch them again.',
        ...sources.map((s) => `- ${s}`),
      ].join('\n'),
    );
  }
  if (knowledge.length > 0) {
    parts.push(
      // "knows", not "has learned": since D-047 these lines are the crew's own
      // notes *and* your indexed material, and a store passage was not learned
      // by anybody here. Each one names its own source, so the session can tell
      // them apart without the heading pretending they are the same thing.
      `## What this level knows\n${knowledge.map((k) => `- ${k}`).join('\n')}`,
    );
  }
  if (lessons.length > 0) {
    parts.push(`## Lessons from your own past jobs\n${lessons.map((l) => `- ${l}`).join('\n')}`);
  }
  return parts.join('\n\n');
}

/**
 * What the run left behind, small enough to hand to a one-turn model: its own
 * write-up and the names of the files it changed. Never the diff itself — the
 * point is a write-up that costs about a cent, and a patch is what makes a
 * turn expensive. Null when the run left nothing worth describing.
 */
export function closeOutEvidence(sandboxDir: string): string | null {
  const parts: string[] = [];

  const resultPath = path.join(sandboxDir, 'RESULT.md');
  if (existsSync(resultPath)) {
    const text = readFileSync(resultPath, 'utf8').trim();
    if (text) parts.push(`What the run reported:\n${text.slice(0, 1500)}`);
  }

  const patchPath = path.join(sandboxDir, 'DIFF.patch');
  if (existsSync(patchPath)) {
    const patch = readFileSync(patchPath, 'utf8');
    const files = [...patch.matchAll(/^diff --git a\/(.+?) b\//gm)].map((m) => m[1]);
    if (files.length > 0) {
      parts.push(`Files it changed:\n${files.map((f) => `- ${f}`).join('\n')}`);
    }
  }

  // What it made, for work that changes no repository. Without this the crew
  // learned nothing from a job with no clone: evidence was a write-up or a
  // diff, and a run that spends its last turn producing the deliverable has
  // neither. Measured on job 2ff16bf2 — a valid PDF written from scratch, no
  // lesson, no recipe, nothing banked. Names only, never contents: the brief
  // is to describe the method, and a file's contents are the answer.
  const produced = outputNames(sandboxDir).filter(
    (name) => name !== 'RESULT.md' && name !== 'DIFF.patch',
  );
  if (produced.length > 0) {
    parts.push(`Files it produced:\n${produced.map((f) => `- ${f}`).join('\n')}`);
  }

  return parts.length > 0 ? parts.join('\n\n') : null;
}

/**
 * First "- " line of LESSON.md, if the agent wrote one.
 *
 * `known` on its own is the close-out declining: it was shown what the crew's
 * notes already say (see `closeOutBrief`) and judged its lesson a repeat. The
 * honest result is then no new lesson — not the same fact in new words, which
 * is how one publication-lag lesson came to fill every note slot (D-073).
 */
/**
 * PENDING.md into the shape the review shows.
 *
 * `done` alone is the close-out saying nothing is left — the same sentinel
 * idiom as `known` in `parseLesson`, and for the same reason: a model asked
 * for a list will write one, so the way to get "nothing" is to name the word
 * that means it. That is a different answer from a job carrying no `pending`
 * at all, which means the close-out never ran.
 */
export function parsePending(text: string): Pending | undefined {
  const lines = text
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);
  if (lines.length === 0) return undefined;
  if (lines.length === 1 && /^done\.?$/i.test(lines[0])) return { state: 'Finished.', items: [] };

  const items: string[] = [];
  const prose: string[] = [];
  for (const line of lines) {
    if (/^[-*]\s+/.test(line)) items.push(line.replace(/^[-*]\s+/, '').slice(0, 300));
    else if (!/^#/.test(line)) prose.push(line);
  }
  const state = prose[0]?.slice(0, 300);
  if (!state && items.length === 0) return undefined;
  // Five is what the brief asks for; trimming here means a close-out that
  // ignores the cap cannot flood the panel.
  return { state: state ?? 'Stopped before it could say where it got to.', items: items.slice(0, 5) };
}

export function parseLesson(text: string): string | undefined {
  const notARepeat = (lesson: string): string | undefined =>
    /^known\.?$/i.test(lesson) ? undefined : lesson;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (trimmed.startsWith('- ') && trimmed.length > 2) return notARepeat(trimmed.slice(2).trim());
  }
  const fallback = text.trim().split(/\r?\n/)[0]?.trim();
  return fallback ? notARepeat(fallback) : undefined;
}

/**
 * What the close-out is asked, given what the run left behind and what the
 * crew already knows.
 *
 * The known notes are the exact window the next session will be handed — this
 * agentling's newest lessons plus the level's most relevant notes — because
 * that window is where a repeated lesson costs: a recurring job that re-banks
 * its one lesson every run fills all of those slots with copies (D-073, eight
 * copies after ten runs of one sentence). Deterministic dedup cannot catch the
 * reworded copy — measured, rewordings of one fact score 0.3–0.5 under
 * `similarity()`, a band hq's genuinely distinct notes crowd — so the one
 * reader that can judge a paraphrase, the model already being paid for the
 * write-up, is shown what is on file and asked to decline a repeat.
 */
export function closeOutBrief(
  job: { prompt: string },
  evidence: string,
  known: string[],
): { prompt: string; append: string } {
  const onFile =
    known.length > 0
      ? `\n\nThe crew's notes already say:\n${known.map((k) => `- ${k}`).join('\n')}`
      : '';
  return {
    prompt: `A job has just finished. Write down what it teaches.\n\nThe job was: ${job.prompt}\n\n${evidence}${onFile}`,
    append: [
      'You are writing the crew notes for a job that has already run. Do not do the job.',
      // Measured: without this it opened the file it had just been told
      // about and ran out of turns having written nothing.
      'Do not read, open or search any files. Everything you need is in this message.',
      'Write exactly three files in the working directory, then stop:',
      '- LESSON.md: one line starting with "- ", holding one thing a future agentling should remember about this KIND of job.',
      ...(known.length > 0
        ? [
            '  If that one thing is already in the crew\'s notes above, write LESSON.md holding exactly the word "known" — do not say it again in new words.',
          ]
        : []),
      '- APPROACH.md: a few lines telling whoever does this KIND of job next how to do it directly, without exploring. Describe the method, never the answer.',
      // The user is deciding whether to buy this run more turns, and the only
      // thing that answers it is what the run itself did not get to. Written
      // here because the close-out is the one errand that runs *after* the
      // session dies, which is precisely when nobody wrote a report (D-114).
      '- PENDING.md: what is left. First line: where the run actually got to, one sentence, in the past tense.',
      '  Then one "- " line per thing still to do, most important first, at most five.',
      '  Say only what the evidence above supports. If it got nowhere, say that plainly — "it had barely started" is a useful answer and a made-up plan is not.',
      '  If nothing is left and the work looks complete, write PENDING.md holding exactly the word "done".',
      'If the run failed, say what to do differently — a run that died still teaches something.',
    ].join('\n'),
  };
}

/** Short human line for a tool_use block, e.g. "Bash npm test". */
export function toolLine(name: string, input: unknown): string {
  const i = (input ?? {}) as Record<string, unknown>;
  const detail = [i.file_path, i.command, i.pattern, i.url, i.query, i.path].find(
    (v) => typeof v === 'string' && v.length > 0,
  ) as string | undefined;
  const text = detail ? `${name} ${detail}` : name;
  return text.length > 80 ? `${text.slice(0, 77)}…` : text;
}

function firstLine(text: string): string {
  const line = text.trim().split(/\r?\n/)[0] ?? '';
  return line.length > 200 ? `${line.slice(0, 197)}…` : line;
}

interface RunnerMessage {
  type: 'progress' | 'result' | 'error';
  name?: string;
  input?: unknown;
  summary?: string;
  message?: string;
  meter?: unknown;
}

/**
 * M1: the real executor. Each job runs one Claude Agent SDK session in a
 * child process (see agent-runner.mjs), shaped by the agentling's role
 * (system prompt, tool allowlist, model, mounted skills) and its memory.
 */
export class ClaudeAgentExecutor implements Executor {
  constructor(
    private registry: RoleRegistry,
    private memory: MemoryStore,
    private skillsDir: string,
    /** Returns the level's shared knowledge lines for this session. */
    private knowledge: () => string[] = () => [],
    /** The connection registry, read fresh so edits don't need a restart. */
    private connections: () => Connection[] = () => [],
    /** History, for turning a money ceiling into a turn budget. */
    private ledger: () => LedgerEntry[] = () => [],
    /** The channel's opted-in audience, for the brief's legend (D-092). */
    private audience: (channel: string) => AudiencePerson[] = () => [],
    /** The last body sent on a channel, for "send the same again" (D-094). */
    private lastSend: (channel: string) => string | undefined = () => undefined,
  ) {}

  /** Live sessions by job id, so one can be stopped on request. */
  private running = new Map<string, ChildProcess>();
  /** Jobs killed deliberately, so the death can be reported as intent. */
  private cancelled = new Set<string>();

  async run(
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Agentling,
    hint?: RunHint,
  ): Promise<ExecutorResult> {
    const role = agentling ? this.registry.get(agentling.role) : undefined;
    const lessons = agentling ? this.memory.lessons(agentling.name).slice(-5) : [];

    let hasRepo = false;
    if (job.repoPath) {
      onProgress?.(`cloning ${job.repoPath}`);
      await cloneRepo(job.repoPath, sandboxDir);
      hasRepo = true;
    }
    if (job.continues) await carryForward(job.continues, sandboxDir, hasRepo, onProgress);

    const { granted, refused } = resolveForJob(job.tools, this.connections(), process.env);
    for (const { name, reason } of refused) onProgress?.(`connection "${name}" unavailable: ${reason}`);
    const web = granted.find((c) => c.name === 'web');
    const codeHost = granted.find((c) => c.name === 'github');
    const searchConn = granted.find((c) => c.name === 'search');
    const render = granted.find((c) => c.name === 'render');

    // Lever 1 and 5 together: addresses the user wrote are fetched here, by
    // plain code, at no token cost — and land as trimmed text the session
    // reads normally. Far cheaper than the agent deciding to go and look.
    const sources: string[] = [];
    if (web) {
      for (const url of extractUrls(job.prompt)) {
        onProgress?.(`reading ${url}`);
        const page = await fetchPage(url, { allow: web.allow, maxChars: web.maxChars });
        const file = path.join(sandboxDir, 'sources', `${sources.length + 1}.md`);
        mkdirSync(path.dirname(file), { recursive: true });
        writeFileSync(
          file,
          page.error
            ? `# ${url}\n\nCould not read this: ${page.error}\n`
            : `# ${page.title ?? url}\n\nSource: ${url}\n\n${page.text}\n`,
        );
        sources.push(path.relative(sandboxDir, file));
      }
    }

    const skills = (role?.skills ?? []).filter((s) =>
      existsSync(path.join(this.skillsDir, s, 'SKILL.md')),
    );
    for (const skill of skills) {
      cpSync(path.join(this.skillsDir, skill), path.join(sandboxDir, '.claude', 'skills', skill), {
        recursive: true,
      });
    }

    const mapped = mapTools(role?.tools ?? []);
    const allowedTools = gateOutside(
      mapped.length > 0 ? mapped : [...DEFAULT_TOOLS],
      granted.map((c) => c.name),
    );
    if (skills.length > 0) allowedTools.push('Skill');
    // Said out loud: a scout with no way to reach a page will otherwise spend
    // turns discovering that, and its report should say why rather than guess.
    if (mapped.includes('WebFetch') && !allowedTools.includes('WebFetch')) {
      onProgress?.('web access is off in settings — working from what is here');
    }

    // A job the crew has done before gets a short leash rather than the full
    // budget; either way the quote can tighten it further, since turns are
    // the only budget that binds before the money is spent.
    const turnBudget = turnsForBudget(
      job.quotedUsd,
      // Priced on the role about to run it, which is the role whose prompt,
      // tools and turn cap decide what a turn costs — not the one the matcher
      // named, who may not be on the crew at all. And on the tier it will run
      // as, since a leashed turn costs appreciably less than a session's; this
      // has to match what the quote assumed or the two disagree about how many
      // turns the same money buys.
      rateFor(
        this.ledger(),
        agentling?.role ?? job.preferredRole ?? '',
        hint?.oneShot ? 'oneshot' : 'session',
        hasRepo,
      ),
      turnCapFor(role, hint, job.maxTurns),
    );

    // What this level knows *about this job*, not what it did most recently —
    // the same selection the recall tier uses. Hoisted because the close-out is
    // shown the same window: "already known" has to mean "already in what the
    // next session will read", or the two drift apart (D-073).
    const relevantNotes = relevantLines(this.knowledge(), job.prompt, 8);

    const configPath = path.join(sandboxDir, '.session.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        cwd: sandboxDir,
        prompt: sessionPrompt(job),
        append: buildAppend(
          role,
          lessons,
          relevantNotes,
          hasRepo,
          sources,
          hint?.approach,
          hasRepo ? repoListing(path.join(sandboxDir, 'repo')) : [],
          job.attachments ?? [],
          // The same number the SDK is capped at, so the brief and the runner
          // cannot disagree about how long the run has.
          turnBudget,
          briefForJob(
            job,
            (channel) => this.audience(channel),
            (channel) => this.lastSend(channel),
          ),
          job.organizeRoot ? organizeBrief(folderInventory(job.organizeRoot)) : undefined,
          // The same number the timer kills at, so the brief and the wall
          // cannot disagree about how long the run has.
          timeoutMsFor(role) / 60_000,
        ),
        allowedTools,
        // Named here rather than assembled in the runner, so what a connection
        // may do is decided from the catalog in one place.
        mcpTools: mcpToolNames(granted),
        maxTurns: turnBudget,
        skills,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        mcpServers: toMcpServers(granted, process.env),
        ...(web
          ? { web: { endpoint: `http://127.0.0.1:${SERVER_PORT}/internal/fetch` } }
          : {}),
        // Web-shaped, not loop-shaped: the reply is bytes the runner writes,
        // so the runner holds a dedicated block and this carries only the door.
        ...(render
          ? { render: { endpoint: `http://127.0.0.1:${SERVER_PORT}/internal/render` } }
          : {}),
        // Builtin like `web`, and for the same reason: the server owns the
        // call so it owns the size of the reply. Only the tools the catalog
        // actually granted are described to the session — every visible tool
        // is definition overhead in each of its requests.
        ...(codeHost
          ? {
              github: {
                endpoint: `http://127.0.0.1:${SERVER_PORT}/internal/github`,
                tools: GITHUB_TOOLS.filter((t) => (codeHost.tools ?? []).includes(t.name)),
              },
            }
          : {}),
        // Finding a page, as against reading one. Builtin for the same reason
        // as the two above, and separate from `web` on purpose: search returns
        // links, `fetch_page` returns text, and a session that can only do the
        // second substitutes something far more expensive for the first
        // (D-053).
        ...(searchConn
          ? {
              search: {
                endpoint: `http://127.0.0.1:${SERVER_PORT}/internal/search`,
                tools: SEARCH_TOOLS.filter((t) => (searchConn.tools ?? []).includes(t.name)),
              },
            }
          : {}),
        sources,
      }),
    );

    let summary: string;
    let meter: JobMeter;
    try {
      ({ summary, meter } = await this.runSession(configPath, job.id, onProgress, timeoutMsFor(role)));
    } catch (err) {
      // The session died, but the turns before it may have finished the work.
      // Harvest first, then rethrow carrying everything the run did earn.
      const salvage = await this.harvestAndCloseOut(
        sandboxDir,
        hasRepo,
        job,
        [...lessons, ...relevantNotes],
        onProgress,
      );
      // The same shape the success path records. A failed run that is still
      // filed as a full session pollutes the very history the quote reads.
      const failedMeter: JobMeter = {
        turnsAllowed: turnBudget,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        ...(hint?.oneShot ? { oneShot: true } : {}),
        ...(hint?.recipeKey ? { recipeKey: hint.recipeKey } : {}),
        ...(salvage.closeOutUsd ? { closeOutUsd: salvage.closeOutUsd } : {}),
      };
      const spent = err instanceof SessionFailure ? { ...err.meter, ...failedMeter } : failedMeter;
      throw new SessionFailure(
        err instanceof Error ? err.message : String(err),
        withCostKnown(spent),
        salvage.lesson,
        salvage.approach,
      );
    }

    const { lesson, approach, closeOutUsd } = await this.harvestAndCloseOut(
      sandboxDir,
      hasRepo,
      job,
      [...lessons, ...relevantNotes],
      onProgress,
    );

    return {
      summary,
      lesson,
      approach,
      meter: {
        ...meter,
        // The write-up is spending too. Recording it separately keeps the
        // per-turn rate honest — it prices the session, not the session plus
        // an errand — while the total still counts every cent.
        ...(closeOutUsd
          ? { costUsd: (meter.costUsd ?? 0) + closeOutUsd, closeOutUsd }
          : {}),
        turnsAllowed: turnBudget,
        model: role?.model ?? process.env.AGENTLINGS_MODEL,
        ...(hint?.oneShot ? { oneShot: true } : {}),
        ...(hint?.recipeKey ? { recipeKey: hint.recipeKey } : {}),
      },
    };
  }

  /**
   * Everything the run earned, plus the write-up it did not have turns for.
   * The close-out only runs when the first harvest came back missing one, so a
   * session that did write its own notes costs nothing extra.
   */
  private async harvestAndCloseOut(
    sandboxDir: string,
    hasRepo: boolean,
    job: Job,
    known: string[],
    onProgress?: (detail: string) => void,
  ): Promise<{ lesson?: string; approach?: string; pending?: Pending; closeOutUsd?: number }> {
    const first = await this.harvest(sandboxDir, hasRepo, onProgress);
    // `pending` joins the short-circuit: a run that wrote its own lesson and
    // approach used to skip the close-out entirely, and would now skip the one
    // thing only the close-out writes.
    if (first.lesson && first.approach && first.pending) return first;

    const meter = await this.closeOut(sandboxDir, job, job.id, known, onProgress);
    if (!meter) return first;

    const after = await this.harvest(sandboxDir, hasRepo);
    return {
      lesson: after.lesson ?? first.lesson,
      approach: after.approach ?? first.approach,
      pending: after.pending ?? first.pending,
      ...(meter.costUsd ? { closeOutUsd: meter.costUsd } : {}),
    };
  }

  /**
   * Everything a run leaves on disk: the diff against the clone, the lesson
   * and the approach. Runs however the session ended, so a failure is still
   * reviewable and still teaches the crew something.
   */
  private async harvest(
    sandboxDir: string,
    hasRepo: boolean,
    onProgress?: (detail: string) => void,
  ): Promise<{ lesson?: string; approach?: string; pending?: Pending }> {
    if (hasRepo) {
      const changed = await writeDiff(sandboxDir);
      onProgress?.(changed ? 'DIFF.patch written for review' : 'no repository changes');
    }

    const lessonPath = path.join(sandboxDir, 'LESSON.md');
    const lesson = existsSync(lessonPath)
      ? parseLesson(readFileSync(lessonPath, 'utf8'))
      : undefined;

    const approachPath = path.join(sandboxDir, 'APPROACH.md');
    const approach = existsSync(approachPath)
      ? readFileSync(approachPath, 'utf8').trim().slice(0, 1200) || undefined
      : undefined;

    const pendingPath = path.join(sandboxDir, 'PENDING.md');
    const pending = existsSync(pendingPath)
      ? parsePending(readFileSync(pendingPath, 'utf8'))
      : undefined;

    return { lesson, approach, pending };
  }

  /**
   * Asks a cheap model to write down what the run did, from what it left on
   * disk. Runs after every job that produced anything at all — including the
   * ones that died, which are most of them on a short leash.
   *
   * Its own failure is never the job's: a missing write-up costs the crew a
   * lesson, and throwing here would cost the user their work.
   */
  private async closeOut(
    sandboxDir: string,
    job: Job,
    jobId: string,
    known: string[],
    onProgress?: (detail: string) => void,
  ): Promise<JobMeter | undefined> {
    const evidence = closeOutEvidence(sandboxDir);
    if (!evidence) return undefined;

    const brief = closeOutBrief(job, evidence, known);
    const configPath = path.join(sandboxDir, '.closeout.json');
    writeFileSync(
      configPath,
      JSON.stringify({
        cwd: sandboxDir,
        prompt: brief.prompt,
        append: brief.append,
        allowedTools: ['Write'],
        maxTurns: CLOSEOUT_TURNS,
        model: process.env.AGENTLINGS_CLOSEOUT_MODEL || CLOSEOUT_MODEL,
      }),
    );

    try {
      const { meter } = await this.runSession(configPath, jobId, undefined);
      onProgress?.('wrote up what this job teaches');
      return meter;
    } catch (err) {
      // It writes two files and then has to say so, which is a third turn it
      // does not have — so running out is its *ordinary* ending, with both
      // files already on disk. Measured: a run whose notes were written and
      // then thrown away, because this returned nothing and the caller took
      // that as "no notes". The files are the work; the exit code is not.
      // Its cost is real either way and comes back on the failure.
      return err instanceof SessionFailure ? err.meter : {};
    }
  }

  /**
   * Kills the session running this job, if one is. The child is the whole
   * session — stopping it is what makes cancel mean anything, since an
   * abandoned session keeps thinking and keeps spending.
   */
  cancel(jobId: string): boolean {
    const child = this.running.get(jobId);
    if (!child) return false;
    this.cancelled.add(jobId);
    child.kill();
    return true;
  }

  private runSession(
    configPath: string,
    jobId: string,
    onProgress?: (detail: string) => void,
    timeoutMs = SESSION_TIMEOUT_MS,
  ): Promise<{ summary: string; meter: JobMeter }> {
    return new Promise((resolve, reject) => {
      const child = spawn(process.execPath, [RUNNER, configPath], {
        stdio: ['ignore', 'pipe', 'pipe'],
        env: launderedEnv(),
      });
      this.running.set(jobId, child);
      const timer = setTimeout(() => {
        child.kill();
        // A SessionFailure carrying the streamed partials, not a bare Error:
        // a time-cut used to lose everything the stream had counted, filing a
        // meter with no turns and no tools — the least-learning failure mode.
        // `timedOut` is `outOfTurns`'s twin, and carry-on reads it (D-138).
        reject(
          new SessionFailure(`session timed out after ${timeoutMs / 60_000} minutes`, {
            ...meter,
            timedOut: true,
            ...(meter.costUsd === undefined ? { costUnknown: true } : {}),
          }),
        );
      }, timeoutMs);

      let summary = '';
      let meter: JobMeter = {};
      let errorMsg = '';
      let stderr = '';
      // What the run spent itself on, counted from the tool stream because
      // nothing else records it: the ledger has turns and cost, and the
      // progress events die with the process. Without this, "did the budget
      // run out on the work or on checking the work" cannot be asked at all
      // (D-052).
      let toolCalls = 0;
      let lastTool: string | undefined;
      /**
       * Which tools this run actually called, by name (D-100).
       *
       * The names were already going past — `lastTool` kept the final one and
       * dropped the rest. Keeping the set closes the limit D-044 named about
       * itself: the compile gate reads what a method *could* reach, because
       * what it *used* was never recorded anywhere. Measured, that costs the
       * tier real work — three of the seven recipes eligible to compile are
       * refused for carrying `browser` on their surface, and none of them
       * plausibly opened one.
       */
      const toolsUsed = new Set<string>();
      child.stderr.on('data', (chunk: Buffer) => {
        stderr += String(chunk);
      });
      const lines = createInterface({ input: child.stdout });
      lines.on('line', (line) => {
        let msg: RunnerMessage;
        try {
          msg = JSON.parse(line) as RunnerMessage;
        } catch {
          return;
        }
        if (msg.type === 'progress' && msg.name) {
          toolCalls++;
          lastTool = msg.name;
          toolsUsed.add(msg.name);
          onProgress?.(toolLine(msg.name, msg.input));
        } else if (msg.type === 'result') {
          summary = firstLine(String(msg.summary ?? ''));
          if (msg.meter && typeof msg.meter === 'object') meter = msg.meter as JobMeter;
        } else if (msg.type === 'error') {
          errorMsg = firstLine(String(msg.message ?? 'agent session failed'));
          if (msg.meter && typeof msg.meter === 'object') meter = msg.meter as JobMeter;
        }
      });
      child.on('error', (err) => {
        clearTimeout(timer);
        this.running.delete(jobId);
        this.cancelled.delete(jobId);
        reject(err);
      });
      child.on('close', (code) => {
        clearTimeout(timer);
        this.running.delete(jobId);
        // Folded in here, where all four exits converge, rather than at each
        // of them: the run that died is the one worth measuring, and attaching
        // a measurement only to the clean path is the mistake this project has
        // now made twice (D-046, D-052). `toolCalls` is written even at zero —
        // a run that called nothing is an answer, and an absent field means
        // the row predates the counter.
        meter = {
          ...meter,
          toolCalls,
          ...(lastTool ? { lastTool } : {}),
          // Sorted so two runs that used the same tools compare equal, and
          // absent rather than empty when nothing was called — an absent field
          // means the run predates this, which the compile gate must be able
          // to tell apart from a run that provably reached nothing (D-100).
          ...(toolsUsed.size > 0 ? { toolsUsed: [...toolsUsed].sort() } : {}),
        };
        if (this.cancelled.delete(jobId)) {
          // Killed on purpose: say so, rather than reporting whatever the
          // dying process happened to leave on stderr. It spent money on the
          // way, and the SDK only reports cost on a result message that will
          // now never arrive — so the spend is marked unknown, not zero.
          return reject(
            new SessionFailure(CANCELLED, {
              ...meter,
              ...(meter.costUsd === undefined ? { costUnknown: true } : {}),
            }),
          );
        }
        if (errorMsg) return reject(new SessionFailure(errorMsg, meter));
        if (code !== 0) {
          return reject(
            new SessionFailure(firstLine(stderr) || `agent runner exited with code ${code}`, meter),
          );
        }
        resolve({ summary: summary || 'Session ended without a final result.', meter });
      });
    });
  }
}
