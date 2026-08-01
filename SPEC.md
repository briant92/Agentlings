# Agentlings — v1 Specification

A personal orchestration tool that makes running a fleet of coding agents
feel like playing Lemmings: a horde of small agentlings marches through a
side-view 2D world, picks up jobs you queue, does real work in sandboxes,
and carries the results to the exit for your review.

Decided 2026-07-30 through a design interview; this file is the product
source of truth. Update it when scope changes.

`DECISIONS.md` is the companion record: this file says what the product is
and how it behaves, that one says why each choice was made and what
measurement settled it. Its entries are numbered (`D-017`) and the IDs are
stable, so cite one rather than a title or a line number. Reasoning that
runs longer than a sentence belongs there, not here.

## Product decisions

| Question | Decision |
|---|---|
| Identity | Real-work orchestrator — utility first, Lemmings presentation |
| Audience | Just Brian (personal tool; no auth, hosting, or onboarding) |
| Platform | Web UI in the browser + local Node server |
| Agent brains | Hybrid: deterministic sim for world behavior; LLM only for real job execution |
| Jobs (v1) | Coding tasks against local repositories |
| Goal shape | Independent jobs in a queue (decomposition/pipelines later) |
| World | Literal side-view 2D world (stations, exit); hazards later |
| Outputs | Per-job sandbox + in-app review; promote what you keep |

## Core loop

1. Queue a job (title + prompt + target repo path).
2. The job claims a station slot in the world (max 5 visible; extras wait).
3. An idle agentling walks to the station and works — the actual execution
   runs in `.agentlings/levels/<level>/jobs/<id>/` (the job's sandbox).
4. On success the agentling carries the result to the exit; on failure it
   walks home and the job is marked failed.
5. You review the sandbox output in the panel and promote or discard it.

The world is presentation, not physics: the server sim owns all state and
the client renders it. Nothing in the world may block or corrupt a job.

## Architecture

```
web  (Vite + React + PixiJS)  ── WebSocket /ws (world 10 Hz + job events)
                              ── REST /api    (levels, queue, review, spend)
server (Node + Hono + ws)     ── sim tick, job queue, sandboxes, executors
packages/shared               ── domain types + world constants + palette
```

One job passes through a chain, and the point of the chain is that most jobs
should stop before the end of it:

```
Sim picks up a queued job
  └─ RoutedExecutor      does it in code for nothing where it can (M5.3–M5.6)
       └─ ClaudeAgentExecutor   one SDK session, in a child process (M1)
            └─ agent-runner.mjs      plain node; the SDK never enters the server
```

`SimulatedExecutor` stands in for the whole tail when there is no API key, so
the loop runs end to end without one.

**The world** — presentation state the server owns outright.

- `sim.ts` — agentling state machine (idle → walking → working → delivering),
  advanced every `TICK_MS`.
- `queue.ts` — job store, station slots, sandbox dirs. Persisted per level
  since M2: a restart resumes rather than forgetting.
- `events.ts` — typed job events (queued / started / progress / done / failed
  / resolved) broadcast on the WS with a replay buffer; the terminal rail
  renders them. Movement is never an event — the world tells that story.

**Levels** — independent workspaces, each with its own crew and memory.

- `levels.ts` — level directories, `level.json`, KNOWLEDGE.md, roster files.
- `crew.ts` — the roster on disk against the agentlings alive in the sim.
- `memory.ts` — per-agentling lesson files.
- `merge.ts` — proposing and executing the folding of redundant hires.

**Doing the work.**

- `executors/executor.ts` — the `Executor` interface both real and simulated
  implement, plus `RunHint` (how the router shapes a run).
- `executors/routed.ts` — the deterministic layer wrapped round whichever
  executor is in use; also where a run's learning is banked.
- `executors/claude.ts` — role → session: system-prompt append, tool
  allowlist, model, skills, memory, turn budget, and the close-out pass.
- `executors/agent-runner.mjs` — the child process. Plain JS, spawned with
  plain node, with a laundered env.
- `gitwork.ts` — clone, diff, apply. Repo work never touches the real
  repository until you promote it.

**Spending less** — the M5 spine, cheapest tier first.

- `router.ts` — which tier a job lands on, and the rule that governs all of
  them: never guess.
- `recipes.ts` — remembered approaches, how alike two jobs are, and the
  counter that says whether a tool would have paid off.
- `tools.ts` — compiled tools: manifest, matching, verification, retirement.
- `estimate.ts` — the quote, as a lookup over history rather than a model.
- `ledger.ts` — what work cost and what it may be charged; the per-turn rate
  the turn budget is derived from.
- `web.ts` — pages as trimmed text, never a raw dump.
- `connections.ts` — what a job may reach outside its sandbox. Nothing is
  ambient.

**Understanding the request.**

- `match.ts` — the local, deterministic concept matcher. Works with no auth
  and no network, always.
- `work.ts` — turning a sentence into a plan: title, role, who will run it.
- `refine.ts` — the optional one-call LLM tier that only ever refines the
  local answer.
- `roles.ts` / `library.ts` — role and skill definitions, and the catalog
  they can be installed from (preview-first, SHA-pinned).

**Plumbing.**

- `index.ts` — HTTP routes, the WebSocket, and the wiring that assembles a
  level's runtime.
- `auth.ts` — which credentials are in play and whether they still work, said
  once at startup rather than one failed agentling at a time.

### State on disk

Everything the app knows lives under `.agentlings/`, which is gitignored —
the app's memory is not the repository's.

```
.agentlings/
  ledger.jsonl              every job: what it cost, what it may be charged
  catalog/                  the role/skill library index and what is installed
  levels/<level>/
    level.json              name, project, theme, repo path
    roster.json             everyone hired here, resting crew included
    jobs.json               the queue, so a restart resumes
    KNOWLEDGE.md            what this level's crew has learned
    recipes.json            approaches worth reusing, and how often they land
    tool-candidates.jsonl   jobs a compiled tool could have served
    memory/<name>.md        one agentling's lessons
    tools/<name>/           tool.json + run.mjs + verify.mjs
    jobs/<id>/              one job's sandbox: repo clone, RESULT.md, DIFF.patch
```

### REST API

Routes below are the M0 shapes; everything job-facing is scoped per level
(`/api/levels/:lid/...`) since levels landed.

| Route | Purpose |
|---|---|
| `GET /api/state` | Current `WorldState` snapshot |
| `POST /api/jobs` | Queue a job `{title, prompt, repoPath?}`; quoted and role-matched like `/work`, but keeps the caller's title and takes no repository unless given one |
| `GET /api/jobs/:id/output` | Sandbox files for review |
| `POST /api/jobs/:id/resolve` | `{action: "promote" \| "discard"}` |
| `GET /api/levels/:lid/tools` | Compiled tools, and what could be compiled next |
| `POST /api/levels/:lid/tools/promote` | Compile a proven recipe into a tool |
| `POST /api/levels/:lid/tools/:name/retire` | Take a tool out of service, with the reason |
| `GET /api/spend` | Cost, chargeable price and what was absorbed, by level and tier |

## Agentling identity (roles, skills, memory)

Each agentling is a self-contained worker: a persistent role, a skill
set, hard boundaries, and a memory that accumulates across jobs. Click a
sprite to open its profile; assignments persist in
`.agentlings/levels/<level>/roster.json`.

- **Roles** are Claude Code subagent files in `roles/*.md` — frontmatter
  (`name`, `description`, `tools`, `skills`, optional `model`, optional
  `maxTurns`) plus the system prompt as body. Built-ins: worker, scout,
  mason, scribe, analyst. The catalog is global; the crews are per level.
- **Skills** are `SKILL.md` folders in `skills/` — built-in:
  check-your-work, cite-sources, concise-reports, plain-language,
  small-diffs, tables-and-numbers. Both roles and skills install from
  GitHub URLs via the Roles & skills modal (blob links auto-convert to raw).
- **Boundaries**: a run may use the intersection of the role's `tools`
  and the job's tool opt-in (see M2 registry) — the sandbox stays the
  hard wall underneath.
- **Memory**: one lessons file per agentling in
  `.agentlings/levels/<level>/memory/`. A lesson is written by the close-out
  pass after every job that left anything behind, including the ones that
  died (M5.4).
- M0 stored identity; **M1 enforces it** — the executor maps the role
  onto the Agent SDK session (system prompt, tool allowlist, model,
  mounted skills) and reads/writes real memory lessons. A scout with
  read-only tools genuinely cannot edit code.

## Levels (projects as worlds)

The app boots like a 90's game: **title screen** (Continue · Start ·
Settings) → **level select** → a level. A level is a full workspace for one
project — its own crew, job queue, event feed, sandboxes, memory and
everything it has learned — stored under `.agentlings/levels/<id>/` (laid out
under [State on disk](#state-on-disk)).

- **Creation**: name + project tag + a hand-tuned palette theme (cave,
  chalkboard, household, marble). A fresh crew of two spawns; hire more
  from inside the level (they drop in at the hatch). Level cards on the
  select screen render their thumbnails live from the theme palette.
- **Context scoping**: every finished job appends to the level's
  `KNOWLEDGE.md`, and a session is given the notes from it that are relevant
  to *its own job* — never another level's, and never simply the most recent.
- **Capability is per level, and that is the point.** Recipes, compiled tools
  and the tool-candidate log all live in the level that earned them. A method
  that works against one repository is not a method that works against
  another, which is the same reason a recipe stores an approach and not an
  answer: the same words about different work are a different question. So a
  level gets better at its own project rather than at projects in general, and
  a new level starts honest.
- **Spend is not scoped that way.** One `ledger.jsonl` covers everything, with
  each row tagged by level, because capability belongs to a project while the
  bill is one bill. `/api/spend` totals by level and by tier.
- **Transport**: one sim per level ticks server-side; the WebSocket
  subscribes per level (`/ws?level=<id>`), so the client streams only
  the world on screen.
- Levels share nothing else but the global roles and skills catalog — the
  definitions are common, the crews that hold them are not.
- The pre-level cave migrated to `levels/hq` with its crew, roles, and
  memory intact.

## Milestones

The summaries below are the shape of each milestone; the account of what was
tried, measured and rejected is in `DECISIONS.md`:

- M1 executor → D-007 · M3 non-expert setup → D-011 · levels → D-013
- M5.0 meter and cap → D-022 · M5.1 connections → D-005 · M5.3 router → D-015
- M5.4 recipes → D-019, D-020, D-023
- M5.5 billing → D-012, D-016–D-018, D-026–D-027, D-029
- M5.6 compiled tools → D-021, D-024, D-025

- **M0 — walking skeleton (this scaffold).** Marching horde, job queue,
  simulated executor, sandbox output, review panel. Evidence: `npm test`
  green, a queued job visibly worked and reviewable in the browser.
- **M1 — real executor (built).** `ClaudeAgentExecutor` runs each job as
  one Claude Agent SDK session in a child process (`agent-runner.mjs`,
  spawned with plain node — the SDK's huge import graph must never enter
  the server/tsx process, and a wedged session can't take the server
  down). The role becomes the session: system-prompt append, tool
  allowlist via `permissionMode: dontAsk`, model, skills mounted into
  `sandbox/.claude/skills`, memory lessons in, `LESSON.md` back out.
  Repo jobs `git clone --local` into `sandbox/repo`; `DIFF.patch` is
  captured after the session; promote `git apply`s it to the real repo
  and only then marks the job promoted. Streamed tool calls surface as
  terminal progress lines. 10-minute timeout, 60-turn cap per session.
  Auth (any one): `ANTHROPIC_API_KEY` in `.env`, a
  `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or a fresh Claude
  Code login (auto-detected; `AGENTLINGS_EXECUTOR` overrides). The child
  env is laundered of `CLAUDE*`/`ANTHROPIC_BASE_URL` so a server started
  from inside a Claude Code terminal doesn't inherit that session's
  endpoint or auth.
- **M2 — durability & quality of life.** Persist jobs (JSONL or SQLite),
  survive restarts, cancel button, per-job live log stream. External-app
  access via an in-app MCP connection registry: named connections defined
  in server config (tokens in `.env`), jobs opt in through a
  `tools: string[]` field, and the executor passes only those MCP servers
  into the agentling's Agent SDK session. Default remains no external
  connections — sandbox only.
- **M3 — say what you need (in progress).** The app is for a non-expert:
  every setup step becomes a sentence in plain language.
  - **M3.1 (built).** Concept matcher, `server/src/match.ts`: BM25 over the
    installed catalog plus a hand-written concept map, split into INTENT
    (what you want done, full weight) and DOMAIN (what it is done to, a
    third) so the verb decides the role. Confidence leans on coverage over
    raw score; below `MIN_CONFIDENCE` it says so instead of guessing, and
    unknown words come back as `gaps`. Local, deterministic, no auth.
    `POST /api/match`.
  - **M3.2 (built).** Hire popup: the agentling lands, then asks "What will
    <name>'s job be?". Live suggestion with the matched words shown as the
    reason, `Change` one click away, and the user's sentence stored on the
    agentling (`jobDescription`) and seeded as its first memory.
  - **M3.3 (built).** LLM refinement tier, `refine.ts`. No change to
    `agent-runner.mjs` was needed — a single-turn config (no tools, one
    turn, Haiku) through the same child process is exactly the shape, so
    the SDK's import graph still never enters the server. `/api/match`
    stays instant and `/api/match/refine` is a separate request the client
    fires alongside, so nothing waits on it. The reply is fenced by the
    installed catalogue: a role that isn't installed makes the whole reply
    unusable rather than being passed through, invented abilities are
    dropped, confidence is clamped. Cached by sentence + catalogue
    signature; failures are deliberately not cached so fixing auth takes
    effect immediately. Every failure path returns null and the local
    answer stands.
  - **M3.4 (built).** Library sync. `catalog/sources.json` is a curated
    list of source repos; `server/src/library.ts` reads each one's tree at
    its head commit, indexes every file whose frontmatter parses, and
    caches to `.agentlings/catalog/index.json` (a week's TTL, refreshed in
    the background, never on the boot path). Search reuses the concept
    matcher against the remote index. Nothing installs unseen: preview
    returns the full text plus warnings (broad tools, links, and the
    declared license, because installing copies the file into the user's
    own project). Installs fetch the exact indexed commit and record
    provenance in `.agentlings/catalog/installed.json`, so a later sync can
    report "update available" and never apply one. GitHub is read
    unauthenticated unless `GITHUB_TOKEN` is set; the token is sent to the
    API host only, never to raw file hosts. Per-source cap of 60 with the
    overflow count shown rather than silently dropped.
    - **Known limitation:** only the single `.md` is installed. Skills that
      ship supporting scripts or reference files arrive incomplete; whole
      -folder installs are the obvious follow-up.
    - **Starter set + fallback.** Ships 5 generalist jobs (worker, mason,
      scout, scribe, analyst) and 6 generalist abilities, hand-written
      against this app's contract — sandbox only, RESULT.md out — which
      third-party agents know nothing about. Everything else is found on
      demand: when a sentence has no confident job or names words the crew
      can't cover, the same sentence searches the library inline and the
      results install in place, re-matching immediately. `starter.test.ts`
      pins the shipped set from disk; `match.test.ts` pins the algorithm
      against a fixture, and the two drifting apart is how a regression got
      through once.
  - **M3.5 (built).** Work intake in one box: the sentence becomes the
    prompt, `titleFrom` derives the title, the matcher picks the role, and
    `pickAgentling` picks who takes it — all shown before anything is
    queued. Jobs carry `preferredRole`; `nextUnassigned(role, present)`
    routes to that role first, then unrouted work, then work routed to a
    role nobody holds, so nothing starves. The project folder is asked once
    per level and stored on the level (`''` records a decline), changeable
    from the intake. Results: `queue.complete` reads DIFF.patch into
    `job.changes`, the terminal card says what approving would change in
    plain words with Approve / Discard / See the changes, and the review
    modal leads with the report and file list, raw patch collapsed.
  - **M3.6 (built).** First-run tour: three coach marks over the real
    controls — hire, the work box, the terminal — rather than a slideshow,
    so it teaches where things are. Anchored by `data-tour` attributes and
    re-measured on resize and scroll; a step whose control isn't on screen
    falls back to a centred card. Runs once (`agentlings:tour` in
    localStorage), waits for the iris to finish, never opens over a modal,
    and can be replayed from Settings.
- **M4 — crew management.** Three ways a crew changes size without losing
  what it learnt.
  - **M4.0 (built).** The roster is the record, the sim holds only who is
    awake. Career figures, `hiredAt`, `lastWorkedAt` and `resting` are
    persisted — `jobsDone`/`jobsFailed` used to live only in the sim and
    reset on every restart, which made an agentling's record meaningless.
    `crew.ts` holds the pure seam (`syncRoster`, `crewMembers`,
    `activeCrew`); `CrewSeed` is defined once, in `levels.ts`.
  - **M4.1 (built).** Rest: out through the door (`Sim.sendOut` reuses the
    delivering walk, removing them on arrival), off the job queue, nothing
    lost. Waking drops them back through the hatch with career and lessons
    intact. Blocked mid-job. The Crew panel opens from the doorway in the
    world and from a header button.
  - **M4.2 (built).** Letting go: roster entry removed, lessons moved to
    `memory/archive/<name>-<date>.md` rather than deleted. The confirmation
    states what is lost and offers resting as the alternative.
  - **M4.3 (built).** Merge, in `merge.ts`. Same role is a requirement
    rather than a signal — the role *is* the tools and abilities, so
    different roles are different capability, not overlap. Score comes from
    hire-description word overlap, with two undescribed hires of one role
    treated as redundant (nothing distinguishes them) and one-described
    pairs held below the threshold. Every proposal carries its reasons, and
    each agentling appears in at most one proposal per round. Survivor
    defaults to the stronger record, then longer memory, then seniority,
    and is swappable in the review. Execution: careers add up, memories
    merge oldest-first with duplicates dropped, an absorption note records
    who was folded in and what they were for, the absorbed file is archived
    and the name returns to the pool. Blocked mid-job. Dismissed proposals
    are remembered per browser — a hint, not saved state.
- **M5 — going outside, cheaply.** The Agent SDK's default is an open-ended
  loop; the work is constraining it, and often not entering it at all.
  - **M5.0 (built).** Meter and cap. `maxTurns` was 60 — now 10 by default,
    per-role in frontmatter, clamped at 40 by `turnsFor()`. The runner was
    discarding the `usage`/`total_cost_usd` the SDK returns; both are now
    captured on the job and shown on the terminal card. Roles carry a
    `model:`; extraction and reading run on Haiku.
  - **M5.1 (built).** Connection registry, `catalog/connections.json`.
    Nothing is ambient: a job names what it wants (`Job.tools`) and gets
    that and no more, which is the security boundary and the cost one —
    every visible tool is definition overhead in every request of the
    session. Secrets are referenced by env-var name, never stored or
    returned; a connection whose secret is missing is listed as not ready.
  - **M5.2 (built).** Browsing without the bill. `web.ts` returns readable
    text trimmed to a budget, never a page: a Wikipedia article measured
    573KB raw (~143k tokens) against ~3k tokens delivered. URLs the user
    wrote are fetched *before* the session by plain code at no token cost
    and land as files the agent reads; an in-session `fetch_page` tool
    calls back into the server so extraction, trimming and the allowlist
    have one implementation. Non-http is refused. `AGENTLINGS_MAX_COST_USD`
    is the absolute ceiling on what one job may be quoted; it cannot stop a
    session mid-flight, because the stream carries no running cost — measured,
    the only `total_cost_usd` in a 35-message session arrives on the last one.
    Turns are the only budget that binds before the money is spent (M5.5).
  - **M5.3 (built).** The deterministic router, `router.ts`, wrapped round
    whichever executor is in use by `RoutedExecutor`. It claims only work
    whose shape it recognises exactly — a question about what the level
    already knows, answered from KNOWLEDGE.md; and a bare "read this page",
    fetched in code. Everything else falls through to a session untouched.
    The rule is never guess: a missed saving costs money, a wrong answer
    costs trust. "Do it properly" re-queues with `noRouter` when the user
    disagrees with a routed answer.

    The ladder it sorts work onto, cheapest first, is the spine of M5:

    | Tier | Fires when | Cost |
    |---|---|---|
    | `answer` | recall from KNOWLEDGE.md, or an exact repeat with a stored answer | free |
    | `fetch` | a bare "read this page" | free |
    | `tool` | a compiled tool matches the job's words *and* shape (M5.6) | free |
    | `oneshot` | a recipe matches strongly — the method, on a 5-turn leash | ~13c |
    | `agent` | everything else; a weak recipe match still lends its method | ~50c |

    The oneshot price is measured at the 5-turn leash; the agent one is still a
    projection from raising the cap to 10, where 44c was what 8 turns cost.

    A session receives what the level knows **about this job** — the eight
    most relevant notes, chosen by the same term overlap the recall tier uses.
    Feeding it the twelve most recent instead showed a job about billing
    whatever happened to be done yesterday.
  - **M5.4 (built).** Memoisation, `recipes.ts`. A finished job leaves
    APPROACH.md alongside LESSON.md — how to do this *kind* of job without
    exploring — and that becomes a recipe stored per level. The next job of
    the same shape runs on a short leash with the approach handed to it
    rather than as an exploring loop. Recipes hold the approach, never the
    answer: a stored answer is replayed only on an exact prompt repeat with
    no repository and no web access, because the same words against a
    different repo are a different question.

    **The write-up is not the session's job.** It used to be, and it competed
    with the work for turns, so it was cut first and the tier built to be cheap
    became the one tier that could never teach anything — 13 of 13 recipe runs
    died before writing either file. A separate close-out pass runs afterwards
    on a cheap model with two turns, handed the run's own RESULT.md and the
    *names* of the files it changed, never the patch. It runs after every job
    that left anything behind, including the ones that died, which are most of
    them. Measured at 2.1c: about 4% of a repo job, and the price of the crew
    learning at all.

    **Two bars, because the two mistakes cost different amounts.** A strong
    match (0.65) shortens the run to five turns; a weak one (0.3) hands over
    the method and leaves the leash alone. A wrong method given to a
    full-length session wastes a turn it can ignore; the same method with the
    leash cut wastes the whole run. Words are stemmed and weighted by rarity —
    same-shape jobs used to score 0.33 against a 0.65 bar, so the crew never
    recognised its own work.

    A recipe's `terms` are recomputed from its key on read rather than trusted
    from disk, so changing how words are stemmed can never strand the recipes
    written before it.
  - **M5.5 (built).** The billing spine, designed for pass-through even
    though use is personal. `ledger.jsonl` is append-only and records
    observed cost and chargeable price as separate numbers from the first
    entry, because a ledger cannot be reconstructed retroactively.
    `estimate.ts` quotes before the work by asking the router what it would
    do and looking up what that tier and class have actually cost — a
    lookup, not a model, so it tightens as recipes accumulate. `/api/spend`
    totals by level and tier.

    **The quote reads every run that spent money**, not only the ones that
    landed. The runs that break a quote are exactly the ones that exhaust
    their turns and file failed or partial, so a done-only average is blind to
    its own worst cases by construction: it once saw four scribe runs at a
    mean of 15c while five runs had really cost money, at 24c. That nobody is
    billed for a failure is a *billing* decision, and `priceFor` makes it; a
    quote is a bound on spending, and spent money is spent.

    **Two ceilings, not one.** `DEFAULT_CEILING_USD` (50c) is what ignorance
    quotes; `MAX_CEILING_USD` ($2, overridden by `AGENTLINGS_MAX_COST_USD`)
    exists only so one freak run cannot set every later quote for its class.
    They were the same constant until that made the quote promise *less* than
    the history it was reading — it held evidence of a 59c run and promised
    50c.

    **Turns are the enforcement, and a turn is priced by the shape of the
    work.** The quote divided by observed cost-per-turn sets `maxTurns`, and
    it only ever tightens: a rich quote must not let a job run longer than its
    role allows. The rate counts only runs of the same shape, because a repo
    run costs 4.4–10× a turn of the same role without one — the clone puts
    hundreds of thousands of cached tokens in front of every turn, and a rate
    pooled across both predicts neither. A turn is priced per turn *granted*,
    never per turn the SDK reports: a cap of 4 can come back as 6.

    **What the ledger records about a job is what actually happened to it.**
    The job class is the role that *ran* the work, not the role the matcher
    named — a job routed to a role nobody holds is picked up by whoever is
    free and runs as their role. `closeOutUsd` is part of `costUsd` but kept
    separate, so the per-turn rate prices the session rather than the session
    plus a fixed errand. `hasRepo` records the shape the rate depends on.

    **Nothing is billed above its quote, and some things below it.** Failed
    work is charged nothing. So is a job quoted free because a compiled tool
    was going to do it, when the tool then could not — a promise of free that
    arrives as a bill is the one thing the quote exists to prevent.
  - **M5.6 (built).** Compiled tools — the fourth tier, and the only one that
    makes a cost per task actually fall. A recipe makes repeat work cheaper by
    saving the exploring, and still pays a model to read it. A tool removes the
    model: the agent stops being the thing that does the job and becomes the
    thing that once wrote down how. **Interpretation compiled.**

    This also settles when to call the API at all: pay for judgement that has
    not been compiled yet, and nothing else. And it sets the honest ceiling —
    "add tests for module X" never compiles, because the assertions depend on
    the module; "list the modules with no test file" does. Tools take the
    scaffolding, sessions keep the judgement.

    A tool is a directory holding a manifest and two plain-node ES modules,
    `run.mjs` and `verify.mjs` — no shell, no dependencies, no network, so it
    neither cares about the platform nor reaches anywhere it should not. The
    ledger gives it a `tool` tier kept apart from `routed`: routed work was
    never paid for, whereas a tool is work that *used* to be, and only the
    second says the crew is getting cheaper.

    Nothing about a tool is trusted:

    - It matches on the **strong** bar only, and on shape as well as words. A
      script written against a clone is simply wrong where there is no clone,
      and the two jobs can be worded identically.
    - It must **prove its own output**, checked in a second process because a
      run that crashed cannot be trusted to report that it crashed. Work it
      cannot prove is discarded — the files as well as the result, since the
      files *are* the work — and the job is paid for properly. A free wrong
      answer is the one outcome worse than a right answer that cost money.
    - Two failures in a row **retire** it; a hang is killed at a timeout, since
      a compiled tool that hangs has stopped being cheaper than the session it
      replaced.

    Promotion is a **request**, never automatic: it spends money, and a
    promotion nobody asked for is a charge nobody quoted. It refuses a recipe
    that has not landed three times, then queues one session whose only job is
    to write the script and the check — and whose brief insists on the check
    harder than on the script, because without one the tier is only a faster
    way to be wrong. The scripts land in that session's sandbox and are
    installed only when it is **reviewed and promoted**, exactly like a library
    install: a generated tool is executable instruction. Its clone is scratch
    and is never applied to the repository.

    Whether a fourth tier is worth having at all is a question the app answers
    by counting rather than guessing: a job matching a recipe with three
    successes appends to `tool-candidates.jsonl` and nothing else happens.
    Promotion pays back somewhere around the third to fifth reuse, and this
    machine has seen one repeat in 36 jobs — so the machinery exists ahead of
    the demand, deliberately and with that known.
- **M6 — deepen the metaphor (parked ideas).** Hazards mapped to real
  failure modes (rate-limit fire pits, error chasms), blocker agentlings
  (paused queues), goal decomposition, job pipelines.

## Non-goals (v1)

- No multi-user, auth, or hosting; localhost only.
- No game scoring or win/lose states — the world is a status display.
- No direct writes to real repos before you promote a result.
- No LLM calls for world behavior (movement stays deterministic).
- No borrowing of claude.ai / Claude Code connector auth for agentlings —
  the app owns its own external credentials (see M2).

## Definition of done (per CLAUDE.md)

Every milestone shows evidence: test output, command results, or a
screenshot of the loop running.
