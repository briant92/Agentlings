import { spawn } from 'node:child_process';
import { existsSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import path from 'node:path';
import type { Agentling, Job } from '@agentlings/shared';
import { cloneRepo, patchFile, writeDiff } from '../gitwork';
import {
  TOOL_CANDIDATE_RUNS,
  creditRecipe,
  noteToolCandidate,
  normalise,
  readRecipes,
  rememberRecipe,
  updateRecipes,
  type Recipe,
} from '../recipes';
import { type Connection, doorEndpoints, secretNames } from '../connections';
import { FILE_CHANNELS, OUTBOX_FILE, composeOutbox } from '../outbox';
import { deliveredFiles, producedArtefacts } from '../outputs';
import { type Decision, decide, recallSignal } from '../router';
import type { SearchResult } from '../search';
import { storeLines } from '../store';
import {
  DOORS_ENV,
  RUN_SCRIPT,
  TOOL_TIMEOUT_MS,
  VERIFY_SCRIPT,
  isComplete,
  readTools,
  recordToolRun,
  toolDir,
  usableTools,
} from '../tools';
import { fetchPage } from '../web';
import { CANCELLED, SessionFailure } from './claude';
import type { Executor, ExecutorResult, RunHint } from './executor';

/** The first line of whatever was thrown — an error is not a paragraph. */
function first(err: unknown): string {
  return err instanceof Error ? err.message.split('\n')[0] : String(err);
}

/**
 * Runs one plain-node script in the sandbox and says whether it succeeded.
 * Killed at the timeout, because a compiled tool that hangs has stopped being
 * cheaper than the session it replaced.
 */
function runNode(script: string, cwd: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  return new Promise((resolve) => {
    const child = spawn(process.execPath, [script], { cwd, stdio: 'ignore', env });
    const timer = setTimeout(() => {
      child.kill();
      resolve(false);
    }, TOOL_TIMEOUT_MS);
    child.on('error', () => {
      clearTimeout(timer);
      resolve(false);
    });
    child.on('close', (code) => {
      clearTimeout(timer);
      resolve(code === 0);
    });
  });
}

/**
 * Wraps the real executor with the deterministic layer. Work the router
 * recognises is done here, in code, for nothing; work it doesn't recognise
 * goes through to a session exactly as before.
 *
 * On the way back it does the other half: when a session explains how it
 * solved something, that becomes a recipe, so the next job of the same shape
 * skips the exploring and runs as a single shot — and once a recipe has proved
 * itself often enough, a compiled tool can take the job away from the model
 * altogether.
 */
export class RoutedExecutor implements Executor {
  constructor(
    private levelDir: string,
    private knowledge: () => string[],
    private webConfig: () => { allow?: string[]; maxChars?: number } | null,
    /**
     * What a run of this job could do — its connections, the SDK tools its
     * role grants, its skills, the libraries a sandbox can resolve. Injected
     * rather than worked out here, because this class knows the level and the
     * job and nothing about roles, and one place should decide what counts.
     */
    private capabilities: (job: Job, role?: string | null) => string[],
    private fallback: Executor,
    /**
     * Runs one search, or absent when this level has no way to.
     *
     * Injected whole rather than as a key, so this class needs neither the
     * secret nor an HTTP client — and so the tier can be exercised without a
     * network, which a hardcoded `fetch` would have made impossible. Last and
     * optional, so the call sites that predate the search tier keep working and
     * simply never route one.
     */
    private searchFor?: (query: string) => Promise<SearchResult>,
    /**
     * The connection catalog, for the two things a compiled tool's environment
     * turns on: which variables are secrets to be withheld, and — through the
     * manifest — which doors to hand over. Read fresh on every run rather than
     * captured, so switching a connection off in Settings reaches the next run
     * and not the next restart.
     *
     * Optional and last, so every call site that predates doors keeps working;
     * absent means no catalog, which strips nothing and grants nothing.
     */
    private connections: () => Connection[] = () => [],
  ) {}

  /** Work the router answered itself has no session to stop. */
  cancel(jobId: string): boolean {
    return this.fallback.cancel?.(jobId) ?? false;
  }

  /**
   * Runs a compiled tool, and keeps its work only if the tool can prove it.
   *
   * Both scripts are plain node, so nothing here needs a shell or cares which
   * platform it is on. Returns null when the tool did not run or did not
   * convince, which sends the job back down the ordinary path.
   */
  private async runTool(
    name: string,
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
  ): Promise<ExecutorResult | null> {
    const manifest = readTools(this.levelDir).find((t) => t.name === name);
    if (!manifest || !isComplete(this.levelDir, manifest)) return null;

    const dir = toolDir(this.levelDir, name);
    onProgress?.(`running the ${name} tool — no session needed`);

    /**
     * Every way out of the tool path, and the only way out other than success.
     *
     * Emptying the sandbox is not tidiness: discarding the *result* is not
     * enough, because the tool's files are the work. Found live — a
     * half-finished clone left behind collided with the one the fallback
     * session then tried to make, and the job died on the collision instead of
     * quietly being done properly. The sandbox is ours alone until the session
     * starts, so emptying it is exactly right.
     *
     * It says why, because the caller cannot know: a tool that failed its own
     * check and a clone that never happened are different events, and the
     * caller used to report both as "could not prove its work".
     */
    const wipe = (why: string): null => {
      rmSync(sandboxDir, { recursive: true, force: true });
      mkdirSync(sandboxDir, { recursive: true });
      onProgress?.(`${why} — doing it properly instead`);
      return null;
    };
    /**
     * The clone was unguarded, so a `git clone` failure threw straight out of
     * the executor and killed the job — the one route where "if the tool
     * cannot, do it properly" did not hold. Measured on job d450afd3: it died
     * on the clone, was filed as a `session` failure in a tier it never
     * reached, and left the tool's strike count untouched.
     *
     * No strike is recorded for it, deliberately. Two failures retire a tool,
     * and the clone is ours rather than the tool's — retiring a working tool
     * because the filesystem was busy would punish it for our fault.
     */
    if (job.repoPath) {
      try {
        await cloneRepo(job.repoPath, sandboxDir);
      } catch (err) {
        return wipe(`could not clone for the ${name} tool (${first(err)})`);
      }
    }

    /**
     * What the tool is handed: the server environment, minus every secret the
     * catalog declares, plus the doors this tool was compiled against.
     *
     * Both halves matter and they are the same rule from two sides. The doors
     * are what it may reach; stripping the keys is what stops it reaching
     * anything else with our credentials, which `spawn`'s implicit inheritance
     * had been quietly granting since the tier was built. Harmless under the
     * old no-network contract, load-bearing now.
     *
     * `verify.mjs` gets the same environment as `run.mjs`, because a check
     * that cannot see what the run saw cannot check it.
     */
    const env: NodeJS.ProcessEnv = { ...process.env };
    for (const name of secretNames(this.connections())) delete env[name];
    const doors = doorEndpoints(manifest.connections ?? []);
    if (Object.keys(doors).length > 0) env[DOORS_ENV] = JSON.stringify(doors);

    const ran = await runNode(path.join(dir, RUN_SCRIPT), sandboxDir, env);
    // Checked in a second process on purpose: a run that crashed cannot be
    // trusted to report that it crashed.
    const proved = ran && (await runNode(path.join(dir, VERIFY_SCRIPT), sandboxDir, env));

    const after = recordToolRun(this.levelDir, manifest, proved);
    if (!proved) {
      if (after.retiredReason) onProgress?.(`${name} retired — ${after.retiredReason}`);
      return wipe(`the ${name} tool could not prove its work`);
    }

    // Guarded for the same reason as the clone: the work is only reviewable as
    // a diff, so a run whose diff cannot be captured has produced nothing the
    // user can approve, and must fall back rather than throw.
    if (job.repoPath) {
      try {
        await writeDiff(sandboxDir);
      } catch (err) {
        return wipe(`could not capture what the ${name} tool changed (${first(err)})`);
      }
    }
    return {
      summary: `Done by the ${name} tool, which the crew wrote after doing this by hand. No session, no cost.`,
      meter: { costUsd: 0, turns: 0, routed: true, tooled: true },
    };
  }

  async run(
    job: Job,
    sandboxDir: string,
    onProgress?: (detail: string) => void,
    agentling?: Agentling,
  ): Promise<ExecutorResult> {
    const recipes = readRecipes(this.levelDir);
    const knowledge = this.knowledge();
    // Read here rather than injected, like recipes and tools above: this class
    // already knows the level, and `storeLines` returns nothing when the index
    // is missing or stale, so there is no case to special-case.
    const store = storeLines(this.levelDir, Date.now());
    const decision: Decision = job.noRouter
      ? { kind: 'agent' }
      : decide(job, {
          knowledge,
          store,
          recipes,
          tools: usableTools(this.levelDir),
          canFetch: job.tools?.includes('web') === true,
          // Both halves are required: the connection has to be granted to this
          // job *and* a key has to exist, or the free tier would claim work it
          // cannot then do.
          canSearch: job.tools?.includes('search') === true && Boolean(this.searchFor),
          capabilities: this.capabilities(job, agentling?.role),
        });

    // The message is already written and the recipient already resolved, so
    // composing is writing the file the session would have written — the same
    // OUTBOX.json, held to the same contract, read by the same queue on the
    // way out. Nothing is sent here: approval is still the send (D-075).
    //
    // A refusal falls through to a session rather than failing the job. The
    // contract can still object — a body over the cap, an address the split
    // could not find — and when it does, the honest move is to pay for the
    // run that can explain itself, which is what happened before this tier
    // existed (D-097).
    if (decision.kind === 'compose') {
      // Files the user attached to a job whose whole point is this one send
      // can only have been meant to ride it (D-159) — but only where the
      // channel can carry one; elsewhere they stay what they always were,
      // input context, rather than falling through to a session that could
      // not attach them either.
      const riding = FILE_CHANNELS.has(decision.channel)
        ? (job.attachments ?? []).map((a) => `input/${a.name}`)
        : [];
      const composed = composeOutbox(
        decision.channel,
        decision.to,
        decision.words,
        riding,
        sandboxDir,
      );
      if (composed.outboxes) {
        // The desk composes one send on one channel (D-097), so this writes
        // the single-outbox shape a run has always written — the list form
        // (D-179) is for a session composing several, never for this path.
        writeFileSync(
          path.join(sandboxDir, OUTBOX_FILE),
          `${JSON.stringify(composed.outboxes[0], null, 2)}\n`,
        );
        const [message] = composed.outboxes[0].messages;
        writeFileSync(
          path.join(sandboxDir, 'RESULT.md'),
          [
            '# Ready to send',
            '',
            `One ${decision.channel} message is addressed and waiting for your approval.`,
            '',
            `**To** ${message.name ? `${message.name} — ` : ''}\`${message.to}\``,
            '',
            '**Message**',
            '',
            `> ${message.body.split('\n').join('\n> ')}`,
            '',
            ...(message.files?.length
              ? [`**Attached** ${message.files.map((f) => f.replace(/^input\//, '')).join(', ')}`, '']
              : []),
            'These are your own words, sent exactly as you wrote them — nothing was',
            'rewritten and no agentling session was needed. Approving sends it.',
            '',
          ].join('\n'),
        );
        onProgress?.(`composed without a session — ${decision.reason}`);
        return {
          summary: `Ready to send on ${decision.channel} — your words, unchanged.`,
          meter: { costUsd: 0, turns: 0, routed: true },
        };
      }
      onProgress?.(`could not compose it (${composed.error}) — doing it properly instead`);
    }

    if (decision.kind === 'answer') {
      writeFileSync(path.join(sandboxDir, 'RESULT.md'), `${decision.body}\n`);
      if (decision.recipeKey) {
        const key = decision.recipeKey;
        updateRecipes(this.levelDir, (fresh) => creditRecipe(fresh, key, Date.now()));
      }
      onProgress?.(`answered without a session — ${decision.reason}`);
      return {
        summary: decision.summary,
        meter: { costUsd: 0, turns: 0, routed: true },
      };
    }

    if (decision.kind === 'fetch') {
      const web = this.webConfig() ?? {};
      const parts: string[] = [];
      for (const url of decision.urls) {
        onProgress?.(`reading ${url}`);
        const page = await fetchPage(url, { allow: web.allow, maxChars: web.maxChars });
        parts.push(
          page.error
            ? `## ${url}\n\nCould not read this: ${page.error}`
            : `## ${page.title ?? url}\n\nSource: ${url}\n\n${page.text}`,
        );
      }
      writeFileSync(
        path.join(sandboxDir, 'RESULT.md'),
        `# Pages you asked for\n\n${parts.join('\n\n')}\n\nFetched directly — no agentling session was needed.\n`,
      );
      const count = decision.urls.length;
      return {
        summary: `Fetched ${count} page${count === 1 ? '' : 's'} for you — no session needed.`,
        meter: { costUsd: 0, turns: 0, routed: true },
      };
    }

    if (decision.kind === 'search') {
      onProgress?.(`searching for ${decision.query}`);
      const found = await this.searchFor!(decision.query);
      // A search that failed is not an answer. Falling through costs money and
      // returns something; reporting the error for free returns nothing, and
      // the user asked for pages rather than for an apology.
      if (found.error) {
        onProgress?.(`search failed (${found.error}) — doing it properly instead`);
      } else {
        writeFileSync(
          path.join(sandboxDir, 'RESULT.md'),
          `# What the search found\n\n${found.text}\n\nSearched directly — no agentling session was needed.\n`,
        );
        return {
          summary: `Searched for "${decision.query}" — no session needed.`,
          meter: { costUsd: 0, turns: 0, routed: true },
        };
      }
    }

    let toolFellBack = false;
    if (decision.kind === 'tool') {
      const done = await this.runTool(decision.toolName, job, sandboxDir, onProgress);
      if (done) return done;
      toolFellBack = true;
      // It could not prove its own output, so nothing it produced is kept and
      // the job carries on as if no tool existed. A free wrong answer is the
      // one outcome worse than paying for a right one.
      onProgress?.('the tool could not prove its work — doing it properly instead');
    }

    let hint: RunHint | undefined;
    if (decision.kind === 'oneshot') {
      hint = { oneShot: true, approach: decision.approach, recipeKey: decision.recipeKey };
      onProgress?.(`done before — running it with less exploring (${decision.reason})`);
    } else if (decision.kind === 'agent' && decision.approach) {
      // The key rides along even though the leash does not. A session that used
      // a method is still a run *of that job*, and without this it records
      // nothing saying so: measured on seven runs of one sentence, every row
      // came back `recipeKey: (none)`, so the quote priced them off 35
      // unrelated `worker` rows and told the user "About 44c" for work that
      // cost $1.26 (D-072).
      hint = { approach: decision.approach, recipeKey: decision.recipeKey };
      onProgress?.('something like this was done before — starting from that method');
    }
    // Whichever way the method arrived, the recipe was used. A `search` only
    // reaches here when the search itself failed and the job fell through, and
    // a `compose` only when the outbox contract refused what the desk held —
    // neither carries a recipe either way.
    const usedKey =
      decision.kind === 'tool' || decision.kind === 'search' || decision.kind === 'compose'
        ? undefined
        : decision.recipeKey;

    let result: ExecutorResult | undefined;
    let failure: unknown;
    try {
      result = await this.fallback.run(job, sandboxDir, onProgress, agentling, hint);
    } catch (err) {
      failure = err;
    }

    // A mid-flight run — a continuation or a reply — lends a method and counts
    // as usage, and testifies to nothing else: it delivered the *remainder* of
    // a job, not the job, so it must not say the method gets the job done
    // (that compiles a tool that would then redo the whole job from scratch),
    // must not say the job fits a budget (a continuation finishing in eight
    // calls would license a five-turn leash for work that needs twenty-four —
    // D-068's trap by another door), and must not author the recipe (its
    // close-out describes resuming). Fresh runs keep all three (D-074).
    const midFlight = Boolean(job.continues);

    // Counted after the run rather than before it, so it can know whether the
    // run happened. Work stopped on purpose is not evidence that anybody wants
    // it compiled — the same reasoning that keeps a cancelled job `failed`
    // even when it left a diff behind. Found by reading the file: a job
    // cancelled two seconds in had logged a candidate exactly like a real one.
    //
    // A run that *failed* still counts. It was asked for and attempted, and
    // most runs on a short leash end that way — gating this on a clean exit is
    // the mistake this project has already paid for five times over.
    //
    // A mid-flight run does not: a compiled tool starts from nothing, so it
    // could never have served the job this run picked up halfway.
    if (
      usedKey &&
      !midFlight &&
      !(failure instanceof SessionFailure && failure.message === CANCELLED)
    ) {
      const used = recipes.find((r) => r.key === usedKey);
      if (used && (used.successes ?? 0) >= TOOL_CANDIDATE_RUNS) {
        // Not acted on: this only counts how often a compiled tool could have
        // served the job for nothing, so the fourth tier gets built on evidence
        // that the repeat work exists rather than on the hope that it does.
        noteToolCandidate(this.levelDir, {
          at: Date.now(),
          jobId: job.id,
          prompt: job.prompt,
          recipeKey: usedKey,
          successes: used.successes ?? 0,
        });
      }
    }

    // Bank what the run earned whether or not it finished. A run that died
    // still used its recipe, and SessionFailure carries the approach it wrote
    // down before it ran out — the contract already says the caller should
    // bank that, and this caller used to drop it on the floor. Measured: all
    // 13 recipe runs on this machine failed, so in 36 jobs no recipe was ever
    // credited or improved. Learning only from clean successes goes blind
    // exactly where a short leash puts most of its runs.
    const approach =
      result?.approach ?? (failure instanceof SessionFailure ? failure.approach : undefined);
    // The answer is only ever a finished run's, and only when nothing outside
    // the sandbox fed into it. A failed run's summary is its error message,
    // and an answer is replayed to the user word for word. A mid-flight run's
    // summary describes the remainder it picked up, not the job.
    //
    // A send is never an answer, and this used to be true by accident: the
    // channel sat in `job.tools`, so `!tools.length` was false and a send
    // could not reach here. Taking channels out of a job's tools (D-097)
    // removed that guard, and a send job narrowed to its channel alone would
    // have started banking "one Telegram is composed and waiting" as a
    // replayable answer — served for free on the next identical sentence,
    // with no outbox behind it. Exactly job 57bbff81's PDF, one channel over.
    const answer =
      result && !job.repoPath && !job.channels?.length && !job.tools?.length && !midFlight
        ? result.summary
        : undefined;

    /**
     * What this run has to record, held until the write rather than applied to
     * the snapshot it started from (F5, D-098).
     *
     * The decisions below are still made from what the run could see — that is
     * the honest basis for them — but each is kept as a change to apply, so it
     * lands on whatever is on disk when the run ends rather than on a picture
     * of the recipes taken before the session began. A job finishing inside
     * that window used to have its increments erased.
     */
    const changes: ((recipes: Recipe[]) => Recipe[])[] = [];
    let updated = recipes;
    if (usedKey) {
      // Did the work, not exited cleanly — the same test `partial` uses, so
      // the app has one notion of a run that delivered. A run that produced a
      // correct diff and then ran out of turns writing it up has proved the
      // job is repeatable, which is the only question the counter is asking.
      //
      // Measured: three runs of a mechanical repo job, two of which wrote a
      // correct 129-line file, scored zero. Counting clean exits promotes
      // small jobs a script cannot do and excludes the big mechanical ones it
      // could — exactly backwards.
      //
      // Deliberately *narrower* than `partial`, and the two questions are not
      // the same however alike they look. `partial` asks whether there is
      // something here worth the user's attention — a half-finished generator
      // is. This asks whether the recipe reliably gets the job done, because
      // three of these compile it into a tool that runs with no model at all.
      //
      // Measured on job 2711da49: a run wrote a working PDF generator, ran out
      // of turns before executing it, produced no PDF — and under a files-on-
      // disk test banked a success. Three of those would compile a tool from a
      // method that never finishes, and the fall-through would absorb the cost
      // every time it failed. Widening this alongside `partial` was one change
      // too many, made the same day, on the strength of the two sounding
      // similar.
      //
      // The clean exit is not sufficient on its own either, which took a third
      // case to see. Job 149620b5 finished politely and produced nothing — a
      // scout that read a code host and had no tool to write with — and would
      // have credited its recipe for it (D-041). So a clean exit must also
      // have left something; a diff stays sufficient by itself, since that is
      // the case above, where the work is done and only the write-up was cut.
      //
      // Neither half alone satisfies all three runs on record, which is why
      // this reads as it does rather than as `partial`'s test or as a plain
      // check for files.
      const delivered =
        (result !== undefined && deliveredFiles(sandboxDir)) ||
        existsSync(patchFile(sandboxDir));
      // The leash asks a different question and gets its own counter. Above, a
      // patch alone counts because the work was done and only the write-up was
      // cut — right for "can this compile into a script", wrong for "does this
      // job fit in five turns", which a killed run has answered no to whatever
      // it produced. Requiring the clean return in *both* shapes is also what
      // removes the asymmetry `successes` had here: measured on job 3c031419, a
      // no-repo job that dies could never earn the leash while the same work
      // with a clone earned it without finishing. (D-065)
      const fitted =
        result !== undefined &&
        (deliveredFiles(sandboxDir) || existsSync(patchFile(sandboxDir)));
      // What this run was leashed to, when the wall is what stopped it. Read
      // off the failure's own meter rather than `RECIPE_TURNS`, so it is the
      // budget the run actually got; `hint.oneShot` is what makes it a
      // statement about the leash rather than about a long run dying (D-095).
      const cutMeter = failure instanceof SessionFailure ? failure.meter : undefined;
      const leashCutFrom =
        hint?.oneShot && cutMeter?.outOfTurns && !midFlight ? cutMeter.turnsAllowed : undefined;
      /**
       * Whether this run *is* the job the recipe is about, or merely resembles
       * it (D-099).
       *
       * A recipe is matched two ways: the same sentence, or a similar one. The
       * second is right for lending a method — that is what similarity is for
       * — and wrong for saying anything about the job the key names. Measured:
       * "I need to send a Telegram to Pepo" scored close enough to the recipe
       * for "Send Pepo the current Warzone meta summary on Telegram", ran three
       * turns because it had two words to put in an outbox, and credited that
       * recipe with a 3-turn completion. Its siblings that actually did the
       * research measured 14 and 15. The leash then armed on the 3.
       *
       * So a resembling run credits *usage* and nothing else — exactly what a
       * continuation is already allowed (D-074), for exactly the same reason:
       * it did not do this job.
       */
      const exact = normalise(job.prompt) === usedKey;
      // Turns *granted*, never the count the SDK reports: job 653f8c2e was
      // capped at 33 and came back saying 40, and this number is about to
      // decide whether a five-turn leash is credible (D-022, D-052).
      const key = usedKey;
      const ownWork = !midFlight && exact;
      changes.push((fresh) =>
        creditRecipe(
          fresh,
          key,
          Date.now(),
          delivered && ownWork,
          fitted && ownWork,
          result?.meter?.turnsAllowed,
          result?.meter?.toolCalls,
          // The bound a cut leash disproved is a fact about the run that was
          // cut, so it only speaks for the keyed job when it *is* that job.
          ownWork ? leashCutFrom : undefined,
        ),
      );
    }
    if (approach && agentling && !midFlight) {
      // An answer is replayed to the user word for word, which is right when
      // the words *were* the deliverable and a lie when they only described
      // one. Measured on job 57bbff81: a run that had written a PDF banked its
      // own summary, and the next identical request was answered for free with
      // "hello-world.pdf (1,380 bytes) is a valid one-page PDF" — and no PDF.
      // The user asked for a file, was told its size, and got nothing.
      //
      // So a run that made something banks only its method. A repeat then runs
      // as a short one-shot that rebuilds the artefact, which is cheap and
      // true, rather than free and false.
      // An attachment makes an answer unrepeatable even when the run produced
      // nothing: the recipe key is the prompt, so "summarise the attached
      // contract" would replay contract A's summary for contract B. The words
      // were true once, about a file this job has never seen.
      const madeSomething = producedArtefacts(sandboxDir) || !!job.attachments?.length;
      const entry = {
        prompt: job.prompt,
        role: agentling.role,
        approach,
        ...(answer !== undefined && !madeSomething ? { answer } : {}),
        capabilities: this.capabilities(job, agentling?.role),
        // What it reached for, against what it could have (D-100). Taken from
        // the failure's meter too: a run that died having called the code host
        // still proves the method reaches outside, and that is exactly what
        // the compile gate needs to know.
        usedTools:
          result?.meter?.toolsUsed ??
          (failure instanceof SessionFailure ? failure.meter.toolsUsed : undefined),
      };
      changes.push((fresh) => rememberRecipe(fresh, { ...entry, at: Date.now() }));
      onProgress?.('noted how to do this next time');
    }
    if (changes.length > 0) {
      updated = updateRecipes(this.levelDir, (fresh) =>
        changes.reduce((carried, change) => change(carried), fresh),
      );
    }

    // Measured here rather than at the row builder because this is the only
    // place that holds both the prompt and the level's notes, and computed for
    // `noRouter` runs too: "do it properly" is still paid traffic, and one
    // that was a question is exactly the traffic D-046 is trying to size.
    // Nothing reads it — see LedgerEntry.asked.
    const signal = recallSignal(job.prompt, knowledge);

    // A run that died is paid traffic like any other, and on a short leash it
    // is most of them — `SessionFailure` carries a meter precisely because the
    // ledger files a row for it. Attaching this only to the runs that landed
    // would make the counter blind exactly where the traffic is, which is the
    // bias D-017 caught in the quote and this project has now paid for six
    // times. A cancelled run counts too: it was still a question, and it still
    // spent money.
    if (!result) {
      if (failure instanceof SessionFailure) {
        throw new SessionFailure(
          failure.message,
          { ...failure.meter, ...signal },
          failure.lesson,
          failure.approach,
        );
      }
      throw failure;
    }
    // The user was quoted nothing, because a tool was going to do it. The tool
    // did not, and a promise of free that arrives as a bill is the one thing
    // the quote exists to prevent — so this one is on the app.
    return {
      ...result,
      meter: { ...result.meter, ...signal, ...(toolFellBack ? { toolFellBack } : {}) },
    };
  }
}
