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
| Goal shape | Independent jobs in a queue; explicit "then" sequences split into steps since M5.14 (D-105) — open-ended decomposition still later |
| World | Literal side-view 2D world (stations, exit); hazards later |
| Outputs | Per-job sandbox + in-app review; promote what you keep |

## Core loop

1. Queue a job (title + prompt + target repo path).
2. The job claims a station slot in the world (max 5 visible; extras wait).
3. An idle agentling walks to the station and works — the actual execution
   runs in `.agentlings/levels/<level>/jobs/<id>/` (the job's sandbox).
4. On success the agentling carries the result to the exit; on failure it
   walks home and the job is marked failed.
5. You review the sandbox output in the panel and promote, discard or clear it —
   clear being the verdict that says nothing (D-216).

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
  └─ RoutedExecutor      does it in code for nothing where it can (M5.3–M5.8)
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
- `executors/simulated.ts` — the stand-in from the diagram above: pretends to
  work, then writes a RESULT.md, so the loop runs end to end with no key.
- `gitwork.ts` — clone, diff, apply. Repo work never touches the real
  repository until you promote it.

**Spending less** — the M5 spine, cheapest tier first.

- `router.ts` — which tier a job lands on, and the rule that governs all of
  them: never guess.
- `recipes.ts` — remembered approaches, how alike two jobs are, and the
  counter that says whether a tool would have paid off.
- `capability.ts` — what a run *could* do, as one flat token list, so a
  recipe found under a different surface can be demoted rather than trusted.
  Connections, tools, skills and libraries; deliberately not the model or the
  turn cap, which change how well a run does something and not what it can do.
- `tools.ts` — compiled tools: manifest, matching, verification, retirement.
- `estimate.ts` — the quote, as a lookup over history rather than a model.
- `quote.ts` — the one place a request is priced, given what the server holds
  rather than reaching for it, so every way in is quoted the same way.
- `ledger.ts` — what work cost and what it may be charged; the per-turn rate
  the turn budget is derived from. Each row also records who did it.
- `trajectory.ts` — one line per call, result and remark a run makes, and
  how its child ended, kept under the sandbox as `.trajectory.jsonl` (D-211).
  Sandboxes kept no transcript before it; `doorlog.ts` (D-192) covers the
  doors alone. Both clip hard and swallow a failed write — a trace, never a
  copy of the work, and never a way to take a run down.
- `web.ts` — pages as trimmed text, never a raw dump.
- `search.ts` — finding a page, as against reading one. Builtin so the reply
  size is ours: titles, snippets and links, then `fetch_page` reads the chosen
  one. Brave Search; needs `BRAVE_API_KEY`; ships off.
- `render.ts` — printing a run's own HTML into a styled PDF through the
  system Edge (playwright-core by channel, D-128). Offline by construction:
  every request the page makes is aborted, proved against a live listener.
  No secret; on by default; the runner writes the bytes at the sandbox root.
- `moves.ts` — the organizer contract (D-132): `checkMoves` validates a
  MOVES.json of mkdir/move ops (every path under the root, never a delete),
  `executeMoves` replays it at Approve refusing to overwrite and re-checking
  each path, `reverseMoves` is the undo. The one place the server moves a
  file in a real folder outside the app.
- `organize.ts` — reaching that folder: a metadata-only inventory (names,
  types, sizes, dates — no contents) handed to the run in its brief, and the
  under-firing detector that routes an "organize" sentence to worker.
- `github.ts` — reading a code host, builtin for the same reason: one issue
  list is unbounded JSON unless the caller owns the size. Compact lines,
  capped lists, truncated bodies, never a patch. Reads and cannot act; needs
  `GITHUB_TOKEN`; ships off.
- `connections.ts` — what a job may reach outside its sandbox; `settings.ts`
  decides which of those are live. Reading the web is on by default, everything
  credentialed is not.
- `env.ts` — the one secrets store is `.env`, loaded at boot and read through
  `process.env` at call time; the drawer writes it and patches the live env in
  the same call. A second store was considered and refused (D-078).
- `validate.ts` — one real call per connection at paste time, so a bad key
  fails in the drawer and not in a job (D-076). What comes back is an identity
  worth showing or the provider's own refusal — never the secret.
- `google.ts` — the loopback OAuth flow against the user's own client (D-076,
  D-080): the password is typed on Google's page, a refresh token is what
  lands, and nothing stores unvalidated.

**Understanding the request.**

- `store.ts` — your own notes, synced into a per-level index the crew reads.
  Never read live: the index is an artefact you can inspect before a session
  can use it, each line carries its source and sync date, and a stale index
  contributes nothing so the free tier falls through rather than serving it.
- `provenance.ts` — the level's own record mapped (D-225): one derived node
  per record on disk and one edge per identifier a record already carries,
  each edge naming that identifier (`via`) and never a score. Built on
  demand, yielding to the tick, held per level until a file moves; read by
  the Knowledge panel's routes and by nothing that briefs a run.
- `documents.ts` — getting the data out of a Word file, a PDF, a spreadsheet
  or a deck, in one place. Two callers want the same files for different
  reasons — the review panel shows them, the store indexes them — so this
  returns rows and lines and never a preview or a passage. The libraries are
  installed at the project root for the sandboxes and imported lazily.
- `ocr.ts` — reading words off a picture of words, using the OCR engine
  Windows already has. The first Windows-only file in the project, which is why
  it is a file: everything above it asks `ocrAvailable()` and gets `false`
  elsewhere.
- `pickFolder.ts` — the native Select Folder dialog, served by this process
  because a browser never reveals an absolute path (D-102). The second
  Windows-only file, on `ocr.ts`'s precedent; the typed path is the fallback.
- `match.ts` — the local, deterministic concept matcher. Works with no auth
  and no network, always.
- `work.ts` — turning a sentence into a plan: title, role, who will run it.
- `schedules.ts` — the recurrence timer (D-103): sentences queued again on a
  calendar cadence, per level, fired by a server sweep through the same glue
  `/work` uses so a scheduled job is quoted like a hand-queued one. Downtime
  collapses to a single catch-up firing; pause never builds a backlog.
- `steps.ts` — composite work (D-105): the split where the user said "then",
  what a delivered step forwards into the next step's input/, and the step
  brief. Each step is an ordinary job — its own recipe key, tier and quote —
  and a failed step halts the chain.
- `close.ts` — closing a level as an archive in place (D-121): the mid-job
  blocker, the named-consequences preview, the closedAt stamp that pauses
  schedules through the pause route's own function, and the closed shelf.
  Nothing here deletes; the folder staying under levels/ is what keeps the id
  off the market.
- `sweep.ts` — the disk answer (D-121): repo/ working copies under promoted
  or discarded jobs, measured and removed. Every other byte of a sandbox —
  transcript, close-out, outputs — stays; a redo clones fresh.
- `clarify.ts` — the questions worth asking before any money moves. Local and
  deterministic like the matcher, never on free work, never more than three,
  and never required: Start must always work.
- `refine.ts` — the optional one-call LLM tier that only ever refines the
  local answer.
- `roles.ts` / `library.ts` — role and skill definitions, and the catalog
  they can be installed from (preview-first, SHA-pinned).
- `browse.ts` — the catalog arranged for someone with no query. Categories are
  read off the sources' own file paths, never inferred from the descriptions:
  a taxonomy derived from prose is a plausible answer nobody can check.

**Sending, at approval only.**

- `channel.ts` — does this sentence want to message someone, and what can the
  app honestly offer (D-079)? A send verb plus a channel word claims; a bare
  mention does not. Under-firing is the safe direction.
- `audience.ts` — the people a channel can reach, persisted by name (D-092,
  D-122, D-123). Sources are the channel's rule: Telegram is opt-in only
  (whoever tapped Start, whoever a reviewed send went to); Gmail adds the
  user's saved Google Contacts and, once the widened consent is re-granted,
  the people Gmail's own compose field knows ("other contacts" — everyone
  the user has emailed). What a session is told stays narrower either way —
  `legendAudience` filters the brief's legend to people named in the
  sentence or already sent to, never the whole book.
- `approvals.ts` — standing approval for a recurring send (D-082): unchanged
  reviews counted, the grant refused until earned, the recipient set as the
  security boundary, and any signature change starting the count over.

**Showing what happened.**

- `outputs.ts` — what a job left behind, as a listing that says what each file
  *is*. Bytes are fetched one file at a time, so a produced PDF stops coming
  back as replacement characters.
- `preview.ts` — that file converted for reading, in the server because the
  libraries are already here. Every conversion loses something and says what:
  a `.docx` keeps its words and not its layout. An analyst's SVG chart (D-131)
  is shown as a `native` image through an `<img>`, where scripts and external
  refs do not run, and it is served attachment-disposition so a direct
  navigation downloads rather than executing it.
- `deliveries.ts` — finished work, newest first: the inbox. Everything that
  reached an outcome, failures included, because the terminal feed is numbered
  per server run and gone after a restart.
- `productivity.ts` — what the crew produced and what it cost, built pure for
  the reason `ledgerRow` is: one object out of three sources is exactly the
  shape that quietly drops a field.

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
  ledger.jsonl              every job: what it cost, what it may be charged, who did it
  refusals.jsonl            every sentence the desk refused a row of: when, which level, which row (D-259)
  settings.json             where you depart from a connection's shipped default
  catalog/                  the role/skill library index and what is installed
  levels/<level>/
    level.json              name, project, theme, repo path
    roster.json             everyone hired here, resting crew included
    jobs.json               the queue, so a restart resumes; each verdict stamped when and by whom (D-260)
    schedules.json          sentences queued again on a cadence (D-103); a `report: realwork` row sends the week's score (D-261)
    KNOWLEDGE.md            what this level's crew has learned
    recipes.json            approaches worth reusing, and how often they land
    store-index.json        your own notes, indexed — source and date per entry
    tool-candidates.jsonl   jobs a compiled tool could have served
    memory/<name>.md        one agentling's lessons
    tools/<name>/           tool.json + run.mjs + verify.mjs
    jobs/<id>/              one job's sandbox: repo clone, RESULT.md, DIFF.patch
      .trajectory.jsonl     what that run called, saw and said, clipped, and how it ended (D-211)
```

### REST API

Everything job-facing is scoped per level (`/api/levels/:lid/...`); the
catalog, settings and spend are global because they are.

**Work — asking for it, watching it, resolving it.**

| Route | Purpose |
|---|---|
| `GET /api/levels/:lid/state` | Current `WorldState` snapshot |
| `POST /api/levels/:lid/work/plan` | What the app *would* do with a sentence — plan, role, who takes it, quote — shown before anything is queued |
| `POST /api/levels/:lid/work` | Queue that sentence, attachments included |
| `POST /api/levels/:lid/jobs` | Queue a job `{title, prompt, repoPath?}`; quoted and role-matched like `/work`, but keeps the caller's title and takes no repository unless given one |
| `POST /api/levels/:lid/jobs/:id/cancel` | Stop a run |
| `POST /api/levels/:lid/jobs/:id/redo` | "Do it properly" — re-queue with the router's shortcut switched off |
| `POST /api/levels/:lid/jobs/:id/reply` | Answer an agentling. A new job that carries the old sandbox forward, quoted and billed like the session it is |
| `POST /api/levels/:lid/jobs/:id/resolve` | `{action: "promote" \| "discard" \| "clear"}` |
| `GET` · `POST /api/levels/:lid/schedules` | The recurrence timer (D-103): list the sentences this level queues again on a cadence, and create one — made beside Start, so the first run is now and the next is on the calendar. `{report: "realwork", cadence, channel, to}` makes a row the app composes itself (D-261): its firing lands last week's real-work block as a send in review at $0, no model, no door; refused without a channel or recipient |
| `POST .../schedules/:sid/pause` · `DELETE .../schedules/:sid` | Pause (resume recomputes from now, never a backlog) and stop repeating |

**What came back.**

| Route | Purpose |
|---|---|
| `GET /api/levels/:lid/deliveries` | The inbox: everything that reached an outcome, newest first, failures included |
| `GET /api/levels/:lid/jobs/:id/output` | Sandbox files for review — names, sizes and what each file *is* |
| `GET /api/levels/:lid/jobs/:id/output/:name` | One file, as bytes: inline for a PDF, a download for the rest |
| `GET /api/levels/:lid/jobs/:id/output/:name/preview` | The same file converted for reading — a grid, words, slide text, or the note that the browser draws it |
| `GET /api/levels/:lid/productivity` | What the crew produced and what it cost, per member and per level |
| `GET /api/spend` | Cost, chargeable price and what was absorbed, by level and tier |
| `GET /api/working-copies` · `POST .../sweep` | The repo clones under finished jobs, measured, and the sweep that removes exactly those (D-121) |

**The crew and the level.**

| Route | Purpose |
|---|---|
| `GET /api/levels` · `POST /api/levels` | The level select, and creating one |
| `GET /api/levels/:lid/crew` | The roster: everyone hired here, resting crew included |
| `POST /api/levels/:lid/agentlings` | Hire; `GET`/`DELETE .../:aid` read a profile and let one go |
| `POST /api/levels/:lid/agentlings/:aid/role` | Reassign a trade |
| `POST /api/levels/:lid/agentlings/:aid/rest` · `/wake` | Out through the door, and back through the hatch |
| `GET /api/levels/:lid/merge/proposals` | Redundant hires worth folding together, with the reasons |
| `POST /api/levels/:lid/merge/preview` · `POST /api/levels/:lid/merge` | What a fold would do, then doing it |
| `GET /api/levels/:lid/close/preview` · `DELETE /api/levels/:lid` | What closing would keep and stop, then closing — an archive in place, never a delete (D-121) |
| `GET /api/levels/closed` | The closed shelf, each row carrying what a reopen would bring back |
| `POST /api/levels/:lid/reopen` | Back on the map exactly as left; schedules stay paused |

**What the crew knows, and what it has compiled.**

| Route | Purpose |
|---|---|
| `GET /api/levels/:lid/knowledge` | The store: sources, counts, what could not be read, and whether the index has gone stale |
| `POST /api/levels/:lid/knowledge/sources` | Point this level at folders of your own material, and index them |
| `POST /api/levels/:lid/knowledge/sync` | Re-read those folders — the crew reads the index, so nothing changes until this runs |
| `GET /api/levels/:lid/provenance` | The level's record mapped (D-225): counts by kind and how the build went; with `?node=` one record and everything one hop away, capped at 50 |
| `GET /api/levels/:lid/provenance/search?q=` | Records sharing words with the query, ranked as a session's notes are; capped at 50 |
| `POST /api/levels/:lid/provenance/dry-run` | What a session would be handed for a sentence — the tier, the eight notes, the six recall lines, an agentling's five lessons — written nowhere |
| `GET /api/levels/:lid/tools` | Compiled tools, and what could be compiled next |
| `POST /api/levels/:lid/tools/promote` | Compile a proven recipe into a tool |
| `POST /api/levels/:lid/tools/:name/retire` | Take a tool out of service, with the reason |

**The catalog — global, because the definitions are common and the crews that hold them are not.**

| Route | Purpose |
|---|---|
| `GET /api/roles` · `GET /api/skills` | What is installed |
| `GET /api/crew` | The crew's CV: every role with its quote ceiling and what its sessions have cost (Meet the crew, D-228) |
| `POST /api/match` · `POST /api/match/refine` | The local concept matcher, and the optional one-call tier that only refines it |
| `GET /api/library` · `POST /api/library/refresh` | Index status, and re-reading the sources |
| `POST /api/library/search` | The same matcher against the remote index |
| `GET /api/library/browse` | Categories and their counts; with one, that category's entries |
| `POST /api/library/preview` · `POST /api/library/install` | Nothing installs unseen: full text and warnings first, then the exact indexed commit |
| `POST /api/templates/install` | Install a role or skill straight from a URL |
| `GET /api/connections` · `GET /api/settings` | What can be reached, and which of it is switched on |

**The doors a running session may call back through** — `POST /internal/fetch`,
`/internal/github`, `/internal/search`. Not for the browser. They exist so
extraction, trimming and the allowlist have one implementation rather than one
per caller, and so a tool that is granted a door later is granted *these* and
nothing else.

## Agentling identity (roles, skills, memory)

Each agentling is a self-contained worker: a persistent role, a skill
set, hard boundaries, and a memory that accumulates across jobs. Click a
sprite to open its profile; assignments persist in
`.agentlings/levels/<level>/roster.json`.

- **Roles** are Claude Code subagent files in `roles/*.md` — frontmatter
  (`name`, `description`, `tools`, `skills`, optional `model`, optional
  `maxTurns`, optional `timeoutMinutes`, optional `maxCostUsd` — D-129,
  D-130) plus the system prompt as body. Built-ins: worker, mason, scout,
  scribe, analyst, designer, architect, researcher, clerk, drafter. The
  catalog is global; the crews are per level.
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

- **Creation**: name + project tag + a look. A fresh crew of two spawns;
  hire more from inside the level (they drop in at the hatch). Level cards on
  the select screen render their thumbnails live — the level shrunk through
  the same interpreter that draws it, never a sketch of it.
- **A look is one of four built in** (cave, chalkboard, household, marble)
  **or an installed level pack**: a whole world as data — its own palette,
  terrain, backdrop and height — dropped into `web/public/packs/` and picked
  up on reload. A pack the checker refuses is skipped with its reason rather
  than breaking the app, and a level whose pack has gone opens on the fallback
  rather than not at all. `npm run pack:check` judges one before it is
  installed; `art/LEVELPACK.md` is the contract.
- **The crew can author a look.** Describe a world in the New Level dialog and
  an ordinary quoted, sandboxed job writes the pack; review draws it through
  the interpreter that will draw it for real, and **approving is what installs
  it**. The session installs nothing and has no tool that could.
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
- M5.0 meter and cap → D-022, D-063 · M5.1 connections → D-005, D-244–D-245, D-255–D-256, D-266–D-267 · M5.3 router → D-015
- M5.4 recipes → D-019, D-020, D-023, D-064
- M5.5 billing → D-012, D-016–D-018, D-026–D-027, D-029
- M5.6 compiled tools → D-021, D-024, D-025
- M5.7 your own notes → D-046–D-051 · M5.8 finding a page → D-052–D-055
- M5.9 reading the crew record → D-056, D-057
- M5.10 reading what you keep → D-058–D-062
- M5.11 connections that send → D-075–D-077, D-097 · the wire file, a batch composed here and authorised at the bank by hand → D-219, D-251, D-268
- M5.12 the recurrence timer → D-103 · mail triggers and one reply → D-248 ·
  a rule holds only the doors it names → D-254 · a voice note is a sentence → D-265
- M5.13 the acting surface finished → D-104
- M5.14 composite work → D-105
- M5.15 backdrops, level packs, worlds the crew authors → D-107–D-111
- M5.16 the blueprint pack (EXPANSION P1) → D-125
- M5.17 the studio pack (EXPANSION P2) → D-128
- M5.18 the researcher trade (EXPANSION P3) → D-129
- M5.19 the analyst upgrade (EXPANSION P4) → D-131
- M5.20 the organizer pack (EXPANSION P5) → D-132
- M5.21 pre-rendered backdrops v1 (plates, the render door, the road) →
  D-142–D-144 · v2 (the stack, parallax, the occlusion strip, plate life,
  Route 2 as files) → D-148
- M5.22 the reading desks (EXPANSION A1): the calendar connection, the
  clerk trade, the daily morning brief → D-158
- M5.23 mail-read (EXPANSION A1): the second reading sibling — Gmail
  search and one-message read on the find/read split, behind one fresh
  `gmail.readonly` consent walked last; and the second standing desk,
  the daily mail brief on its own sentence → D-191
- M5.24 the check pass (TEAMWORK T1): "have it checked" queues a second
  agentling on the delivered work — its CHECK.md verdict rides the
  checked job's card, holds auto-send until `confirmed`, and writes
  refuted claims into the checked member's memory → D-194
- M5.25 work parties (TEAMWORK T2): "as a team of three" plus the
  sentence's own list runs the hands at once as channel-less sibling
  jobs; the last to settle queues the gather, which assembles their
  renamed reports into the one deliverable and carries the send → D-195
- M5.26 the planned party (TEAMWORK T3): a party asked for with no list
  gets a priced planner offer — a plan job proposes PARTY.json, the
  review renders it, and approving is what queues the hands; a
  load-bearing hand failing halts the party before the gather → D-196
- M5.27 repo parties (TEAMWORK T4): the planner partitions a repository
  by disjoint path scopes, hands clone and patch only inside their
  fences, and the gather merges the patches on a fresh clone into the
  one DIFF.patch Approve applies — adoption gated on the pre-registered
  trial → D-197
- M5.28 spatial documents (SPATIAL): the **drafter** trade and its
  `plan-geometry` skill turn a technical drawing into a deliverable built
  from the drawing's own geometry — vector paths pulled out of a CAD plot,
  scale derived from stated areas and dimension chains rather than assumed,
  every sheet placed in one coordinate frame, and only then composited,
  corrected or 3D-rendered. The deliverable carries its proof: closures,
  residuals in centimetres, hashes of the delivered bytes. Priced to
  finish — `maxTurns: 35`, a 25-minute wall and `maxCostUsd: 5`, which
  lifts the $2 runaway clamp for this class alone (D-130) so the quote can
  fund the turns the work actually takes. The eight-run chain that argued
  for it (≈$14 real, by SPATIAL.md's trial log) was answered in one $3.53
  run — the dearest single session on the ledger — with residuals twice as
  tight → D-198
- M5.29 four review-and-record fixes the spatial trial argued for: a
  ledger row **opened when a run starts** so a process dying under a
  session leaves an `interrupted` row rather than nothing (D-199); the
  **roster gap said out loud** on every way a job is queued, not only on
  the desk card (D-200); a **discard banking what was refused** into the
  maker's memory and the level's knowledge, so a rejected method stops
  being recommended (D-201); and each file on a continuation's review card
  marked **carried or written this run**, hashed against the parent
  sandbox — a fact about the bytes rather than a verdict on the report,
  because the detector the trial asked for would have accused 40 honest
  files to catch one (D-202)
- M5.30 the reconciliation line's first build (RECONCILE B1): the files a
  job was given join what the crew learns — each attachment stamped with
  its shape, a recipe and a compiled tool keyed on the shape they were
  learned over, a job with files never inheriting a method learned over
  other files, and never a banked answer at all → D-221
- M5.31 the reconciliation contract (RECONCILE B3): a sentence that asks
  to reconcile has its run deliver RECONCILIATION.json, the server
  recomputes both adjusted sides from the run's adjustments at completion,
  the review shows the two sides and the verdict, and Approve is refused
  by name when they do not meet — contract first and no skill, on D-220's
  measurement that the method transfers and only the statement had to be
  asked for → D-222
- M5.32 the roll-forward (RECONCILE B4): an approved reconciliation is
  banked in the level directory keyed by its files' shape, and the next
  reconciliation job of the same shape starts from it — the state in its
  sandbox as PRIOR-RECONCILIATION.json, the brief naming the file and the
  number, open items expected to clear or be aged; a clear or a discard
  banks nothing → D-223
- M5.33 the arrest (RECONCILE B2): a reconcile sentence with one file or
  none is stopped at the desk — the server's preview names it, the card
  counts the files, the reason lands on the Start button and a second
  press queues anyway; a single workbook passes as two sides → D-224
- M5.34 the provenance index: the level's own record mapped from the
  identifiers it already carries — a ledger row's recipe key, a lesson's
  job stamp, a manifest's recipe key, a passage's source — every edge
  naming the identifier and never a score; searched and walked in the
  Knowledge panel, with a dry-run of what a sentence would be handed; read
  by nothing that briefs a run; the knowledge-graph proposal's other
  options rejected on the measurements → D-225
- M5.35 Meet the crew: AGENTLING.md as a character-select screen behind
  Settings → catalog — six boards (trades, skills, powers, reach, price,
  never); a trade's card reads its tools, skills, model and turns off the
  role file, its quote ceiling off the same resolution a quote uses, and
  what its sessions have cost off the ledger keyed by the role that ran
  them, nominal beside measured; the skills and doors boards read the
  installed catalog and the live connections; only the plain-language
  prose is typed → D-228
- M5.36 positions: a seventh board in Meet the crew that starts from a
  human job — twelve postings, hand-written and hand-graded duty by duty
  against what is built (done / partly / not this crew's, each with the
  power, door or decision it rests on), a plain-code search over titles,
  aliases and duties that shows the nearest matches and names the seats
  the crew has none of, and HIRE carrying the trade and the job through
  the level picker into that level's Hire modal; a trade's card lists the
  positions it fills, and cost stays on the trade → D-229
- M5.37 the coverage benchmark: a real-world job record (O*NET or ESCO,
  downloaded files, provenance kept) normalised to a `WorkProfile` and
  graded duty by duty against the crew through the same matcher the desk
  uses — covered, partial or currently uncovered, every grade with its
  reason, and the gap kept apart as matcher, capability, door, policy or
  roster so a weak word match is never a hiring recommendation and "not
  this crew" needs a recorded boundary; `POST /api/coverage` and
  `coverageLine()` app-wide; `npm run bench:coverage` deterministic over
  a release, every aggregate carrying its task ids, candidate clusters
  for review and nothing created; O*NET 30.0 measured at 14 % covered /
  22 % partial / 64 % uncovered on the shipped doors → D-230; calibrated
  against the positions board's 58 hand grades at 90 % exact with both
  overclaim cells empty (scripts/coverage-calibrate.ts), and the one
  review-worthy cluster proven a matcher gap by three live compliance
  jobs → D-231
- M5.38 the job board: the O*NET database as an optional local data set
  (one user-initiated ~13 MB download into .agentlings/onet, never
  committed; CC BY 4.0 attribution kept) behind the positions board — the
  world's postings, searched by the hand board's rule with exact-name and
  title-before-alias refinements, each hit graded on demand by the same
  coverage() as the benchmark against the live doors, shown as counts
  with every duty's reason and marked measured, never vouched; HIRE
  unchanged through the level picker; a one-line measured hint in the
  Hire modal when the sentence names an occupation; bench:coverage reads
  the installed board by default → D-232
- M5.39 one prompt, one review: a step chain (D-105) surfaces as one
  thing — `stepPrev` links each chain-queued step to the one that queued
  it (a new field, never `continues`); the terminal offers one REVIEW at
  the chain's end (a mid-step's card stands only if queueing its
  successor failed), the inbox shows one card per chain with the steps
  stacked and a running tail named, and the review modal grows a step
  rail, an outbox provenance line, and a chain-wide verdict from the last
  step — every step still awaiting one settles through the same per-job
  route, oldest first, so recipes and lessons still bank per step;
  execution unchanged, and gating a step's run on the previous step's
  Approve rejected by name → D-233
- M5.40 the first trades hired off a measurement: four roles named for
  clusters the coverage benchmark counted rather than for work somebody
  asked for — `operations` (procedures, acceptance criteria, test and
  inspection findings against a named standard), `logistics` (stock,
  reorder points, lead times, supplier and carrier comparisons),
  `planner` (work breakdowns, milestones, dependencies, risk registers)
  and `security` (a clone audited for advisories, committed secrets and
  weak permissions) — with a POWERS entry each so a duty they reach is
  vouched rather than merely matched; new seats and no new reach, every
  one working on files in a sandbox behind the same review; measured
  before and after on the three instruments that could show a regression
  (intake 52/54 → 53/54, calibration 90% unchanged with the overclaim
  cells still empty, coverage 15%/21%/64% → 16%/24%/61%) → D-235
- M5.41 the desk says what it refuses: the shelf-of-never rows a sentence
  claims, read as it is typed and shown under the plan — one amber line
  per row carrying three things, the desk's own lead-in naming what was
  asked for, the job board's `BOUNDARIES.why` rendered **verbatim** so the
  two cannot drift, and what the crew will do instead, which is the desk's
  alone because the board is written about a duty and names no other side;
  the four not-built capabilities collapse onto the board's one
  `not-built` row, name their mediums once, and carry no offer, since no
  media is read or made either. D-093's shape — a line, never a block:
  Start stays enabled and one grey tail says so once, however many rows. A
  send claimed on a channel the shelf refuses stays the ask card's, which
  has said it since D-079 and offers the channels that would carry it.
  Read from the whole sentence, exactly as the meter reads it at Start, so
  a split into steps cannot make the desk and the count disagree; the row
  order is the meter's and not the board's, which is stated rather than
  assumed because the two really do differ; and nothing is counted here —
  the meter stays at Start, at a rule armed and at a reply sent, because
  the plan re-runs on every keystroke → D-259, D-269

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
  endpoint or auth — and, since D-217, of every secret the connection
  catalog declares, so a session holding `Bash` cannot read a token the
  doors were built to keep from it.
- **M2 — durability & quality of life (built).** Persist jobs (`jobs.json`
  per level), survive restarts, cancel button, per-job live log stream.
  External-app access via an in-app MCP connection registry: named
  connections defined in server config (tokens in `.env`), jobs opt in
  through a `tools: string[]` field, and the executor passes only those MCP
  servers into the agentling's Agent SDK session. Credentialed connections
  stay opt-in; reading the web does not (D-032). The field is read one way
  (D-254, #8): omitted means every enabled non-sending door, a list means
  exactly the doors in it, so `[]` means none.
- **M3 — say what you need (built).** The app is for a non-expert:
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
    API host only, never to raw file hosts. Per-source cap of 250 with the
    overflow count shown rather than silently dropped.
    - **A skill brings its folder.** Up to 200 companion files and 2MB,
      fetched at the same commit as its `SKILL.md` so the instructions and
      the scripts cannot disagree. A remote path that could climb out of the
      folder it is written into, or that names a drive, is refused rather
      than sanitised. The preview says how many extra files arrive and that
      they are scripts it can run, because "nothing arrives unread" would
      otherwise cover only the part that is markdown. A role stays one file:
      a role *is* its `.md`.
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
    plain words with Approve / Discard / Clear / See the changes, and the review
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
  loop; the work is constraining it, and often not entering it at all. The
  later steps (M5.9 onward) are the other half of the same question — what the
  work cost and what came back are only knowable if the app says so.
  - **M5.0 (built).** Meter and cap. `maxTurns` was 60 — now 10 by default,
    per-role in frontmatter, clamped at 40 by `turnsFor()`. The runner was
    discarding the `usage`/`total_cost_usd` the SDK returns; both are now
    captured on the job and shown on the terminal card. Roles carry a
    `model:`; extraction and reading run on Haiku.

    **The run is told what it has.** The brief carries the same number the SDK
    is capped at and asks for RESULT.md early and updated rather than at the
    end, so a run that is cut off has still delivered — and the close-out, which
    only fires on a job that left something behind, still gets to bank a lesson
    and a method. Measured as a paired re-run: the same sentence went from
    `failed` with an empty sandbox to `partial` with a spreadsheet, a sourced
    report and a recipe (D-063).
  - **M5.1 (built).** Connection registry, `catalog/connections.json`.
    A job gets what the platform has on plus what it names (`Job.tools`) and
    nothing else, which is the security boundary and the cost one — every
    visible tool is definition overhead in every request of the session. Since
    D-254 a schedule or trigger rule's firing holds **only the doors the row
    names**, none by default — a row from before the field keeps the old
    grant and says so (#8–#10 built and proven live, D-258: the work bar
    shows one chip per enabled non-sending door while a schedule or rule is
    being created, none ticked, and the row carries exactly the ticked ones).
    The add-a-connection form browses the public MCP registry and fills
    from an entry, saving nothing, with a *verified here* shelf — source and
    date per door — replacing the D-245 chips (D-256, built D-263, #15).
    The twelve browser acting tools are a second connection, `browser-act`,
    under supervision only (D-255, built D-264, #16): `supervised` in the
    catalog, off by default and never in the default grant — a job holds
    it only by naming it, which the work bar's *watch* tick does; a
    schedule or rule naming it is refused at creation; the run launches a
    headed Edge window on a profile the user signed into (the app writes no
    credential), Playwright MCP attaches over CDP, a navigate off the
    Settings allowlist is refused by name on the trail, and closing the
    window ends the run. The allowlist and profile folder are
    `PUT /api/settings/browser-act`, read back on `GET /api/settings`.
    A system that publishes an API and **no MCP server** gets a small adapter
    this repo owns, added through the same form (D-266, built for #18): Buk,
    the Chilean HR and payroll system, as five reads — employees, who is
    active on a date, one employee's plans, their vacation balance, their pay
    stubs — taken off Buk's own unauthenticated Swagger contract. It cannot
    write whatever the key's scope allows, because the adapter has one request
    function that hard-codes `GET` and has no body to give; Buk offers `POST`
    at two of the same five addresses, which is what makes that worth saying.
    The tenant is an argument on the connection's row; the key is
    `BUK_API_KEY`. Secrets are referenced by env-var name, never stored or
    returned; a connection whose secret is missing is listed as not ready and
    can never be switched on — and a stdio server that refuses to start now
    says **why** in the form, because the probe reads back the stderr it had
    piped since D-244 and listened to from nobody (D-266).
    A system that publishes **no API at all** gets one too (D-267, built for
    #19): the SII purchases and sales register, whose only way in is the tax
    portal's own single-page app, as three reads — a month's totals by
    document type, the documents received, the documents issued — each asked
    of one of the register's four sections, which is what their *state* is.
    Its credential is a **certificate file**, D-252's third kind and the first
    one built: the login is mutual TLS with the `.p12` against SII's own
    certificate gateway, one request, after which cookies carry every read;
    the RUT is an argument on the row, `SII_CERT_PATH` and
    `SII_CERT_PASSWORD` are the secrets, and no portal password exists
    anywhere in it. Accept and claim of a received DTE are excluded by name —
    that is the first act beyond the send, and D-250 keeps it for the acts
    ledger. Read-only cannot be argued from the method here, since SII's
    facade answers reads over `POST`, so it is held by the table and measured
    on the wire instead. These addresses came out of the SPA's own JavaScript
    and are versioned by nobody, so a reply that is not the register's JSON is
    reported as *the address may have moved* rather than read as an empty
    month.

    **A connection declares its own default** with `defaultOn`, and the user's
    departures live in `.agentlings/settings.json` — never in the catalog, so a
    shipped default can change without migrating anyone's settings. Reading the
    web is `defaultOn`: this is an outreach platform, so reaching a page is what
    the crew is for rather than something to ask for job by job. Everything
    credentialed ships off. Settings is authoritative over both — a job cannot
    name its way past a switch the user turned off. One resolver answers the
    question for the quote, the router and the executor alike, because web
    access decides the free `fetch` tier and two answers would be dollars
    apart. (D-032)
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
    | `search` | a bare "find me pages about X" | free |
    | `tool` | a compiled tool matches the job's words *and* shape (M5.6) | free |
    | `compose` | a send whose recipient *and* words the desk already holds (D-097) | free |
    | `oneshot` | a recipe matches strongly *and has landed once* — the method, on a 5-turn leash | 20c |
    | `agent` | everything else; a weak recipe match still lends its method | 50c |

    Both prices are measured over 161 jobs rather than projected, and they are
    regenerated by `npm run ledger:report` rather than maintained here — this
    table carried "~13c / ~50c" long after the real figures had moved, which is
    what the report exists to stop.

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

    **The write-up is not the session's job.** A separate close-out pass runs
    afterwards on a cheap model with two turns, handed the run's own RESULT.md
    and the *names* of the files it changed, never the patch. It runs after
    every job that left anything behind, including the ones that died, which
    are most of them. (D-020)

    **Two bars, because the two mistakes cost different amounts.** A strong
    match (0.65) shortens the run to five turns; a weak one (0.3) hands over
    the method and leaves the leash alone — a wrong method given to a
    full-length session wastes a turn it can ignore, the same method with the
    leash cut wastes the whole run. **A strong match must also have landed
    once**: both bars measure how alike two jobs are, which says nothing about
    whether the method works, and a run that died having banked its approach
    would otherwise match itself and be given half the turns it had just failed
    on (D-064). Words are stemmed and weighted by rarity.
    A recipe's `terms` are recomputed from its key on read rather than trusted
    from disk, so changing how words are stemmed can never strand the recipes
    written before it. (D-019, D-023)
  - **M5.5 (built).** The billing spine, designed for pass-through even
    though use is personal. `ledger.jsonl` is append-only and records
    observed cost and chargeable price as separate numbers from the first
    entry, because a ledger cannot be reconstructed retroactively.
    `estimate.ts` quotes before the work by asking the router what it would
    do and looking up what that tier and class have actually cost — a
    lookup, not a model, so it tightens as recipes accumulate. `/api/spend`
    totals by level and tier.

    **The quote reads every run that spent money**, not only the ones that
    landed: the runs that break a quote are exactly the ones that exhaust
    their turns, so a done-only average is blind to its own worst cases by
    construction. That nobody is billed for a failure is a *billing* decision,
    and `priceFor` makes it; a quote is a bound on spending, and spent money
    is spent. (D-017)

    **Two ceilings, not one.** `DEFAULT_CEILING_USD` (50c) is what ignorance
    quotes; `MAX_CEILING_USD` ($2, overridden by `AGENTLINGS_MAX_COST_USD`)
    exists only so one freak run cannot set every later quote for its class.
    (D-016)

    **Turns are the enforcement, and a turn is priced by the shape of the
    work.** The quote divided by observed cost-per-turn sets `maxTurns`, and
    it only ever tightens: a rich quote must not let a job run longer than its
    role allows. The rate counts only runs of the same shape, since a repo run
    costs several times a turn of the same role without one, and it prices a
    turn *granted*, never a turn the SDK reports. (D-016, D-018)

    **What the ledger records about a job is what actually happened to it.**
    The job class is the role that *ran* the work, not the role the matcher
    named — a job routed to a role nobody holds is picked up by whoever is
    free and runs as their role. `closeOutUsd` is part of `costUsd` but kept
    separate on the row, so the per-turn rate prices the session rather than
    the session plus a fixed errand — specified from the start, and actually
    true only since the row builder was fixed and the recoverable history
    backfilled by id (D-039). `hasRepo` records the shape the rate depends on.
    (D-026, D-029) A run the process dies under still leaves a row: one
    opens the moment a session starts and is replaced at close-out, and any
    still open at the next boot closes as `interrupted`, cost unknown — so
    "at least this much" can no longer be short a run the ledger never heard
    end. (D-199)

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
    scaffolding, sessions keep the judgement. (D-021)

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
    and is never applied to the repository. A compile is quoted like any other
    session, gets its own turn cap rather than the role's, and is told how the
    last attempt failed if there was one. (D-024, D-025)

    Whether a fourth tier is worth having at all is a question the app answers
    by counting rather than guessing: a job matching a recipe with three
    successes appends to `tool-candidates.jsonl` and nothing else happens. The
    machinery exists ahead of the demand, deliberately and with that known.
  - **M5.7 — your own notes (built).** `store.ts`. Point a level at folders of
    your own material and they are synced into a per-level index the crew
    reads. **Never read live**, which is the whole design: the corpus is an
    artefact you can inspect before any session can use it, each passage
    carries the file it came from and the date it was read, and that provenance
    rides *inside* the line so a free recall answer and a session's context
    both show it. Text splits at markdown headings where there are any and by
    length everywhere else, at sentence breaks, so a passage is bounded at 600
    chars rather than cut off at them — eight of them are what a session is
    handed. An index older than a week contributes nothing anywhere: the free
    tier falls through rather than serving something that may have rotted.
    (D-046, D-047)

    Building it caught the recall tier **scoring on its own asking words**, so
    "which decision settled X" looked like a match to notes that only shared
    the word "decision". A free tier that answers wrongly is worse than no free
    tier. (D-048)

    **Capability lives in three tiers, and that is a decision rather than a
    layout.** `capability.ts` records what a run could do as one flat token
    list, so a recipe found under a different surface is demoted rather than
    trusted. Baseline capability rises for everyone; what a level or a single
    agentling learnt never flows sideways; only a compiled tool may graduate.
    (D-036, D-037, D-050)

    **Measured on real work, the win is uneven and that is the honest result.**
    A question the level's own notes covered came back routed, free, with no
    session at all. Paired against a job that already had a clone, the store
    saved almost nothing — the clone was already the answer. It is a step down
    a tier where it applies, not a discount everywhere. (D-049)

    It is also where the crew first worked on itself: a scout surveying the
    recall scorer over the level's own notes returned a finding sharper than
    the hunch that prompted it — 72% of matches share exactly one word, and
    whether that is signal turns entirely on how *rare* the word is, which
    `recipes.ts` already weights for and the recall tier does not. (D-051)
  - **M5.8 — finding a page, not only reading one (built).** `search.ts`, and
    the free `search` tier that answers a bare "find me pages about X" with no
    session at all. Builtin for `github.ts`'s reason: a search API answers in
    verbose JSON, and owning the call owns the size — three fields a result,
    then `fetch_page` reads the chosen one. Brave, not Google: Custom Search
    stopped being a general web search on 2026-01-20. Scraping is not the
    fallback either — 429 and a CAPTCHA. Needs `BRAVE_API_KEY`; ships off.
    (D-054, D-055)

    It was built because the gap was **measured**: a session that cannot search
    does not refuse, it substitutes something far dearer and usually fails.
    (D-053) The same stretch withdrew a claim about the turn cap that the app
    had no instrument to support, and built the counter that could answer it.
    (D-052)
  - **M5.9 — reading the crew record (built).** The ledger gains an author:
    every row records which agentling did the work, so "who is producing" is a
    question with an answer. 87 of 104 historical rows were backfilled by job
    id and 17 deliberately left blank, because a row whose job record is gone
    cannot be attributed without guessing. `productivity.ts` and
    `deliveries.ts` are the two panels that needed it — what the crew produced
    and what it cost, and an inbox of everything that reached an outcome,
    failures included. (D-056)

    `browse.ts` makes the library readable by someone with no query: 532
    entries in 101 categories, **grouped by the sources' own file paths** and
    never inferred from the descriptions, because a taxonomy derived from prose
    is a plausible answer nobody can check. Counts describe what is indexed,
    taken per source before dedupe — two derivations of one number, and the
    slower one stays on purpose. (D-057)
  - **M5.10 — reading what you keep (built).** A produced document is shown
    where it lands rather than offered as a download link, which is the whole
    file and none of the point: `outputs.ts` says what each file *is* and
    `preview.ts` converts it in the server, where the libraries already are.
    Every conversion states what it loses. Two listings and two orderings
    collapse into one. (D-058)

    And the same files are read *into* the knowledge store — Word, PDF,
    spreadsheets, decks, and paper by OCR. `documents.ts` holds the readers so
    the panel and the store cannot disagree about how to read a `.pptx`; a grid
    is not prose and is not split like prose. `ocr.ts` uses the engine Windows
    already has — the one Windows-only file in the project, behind a seam every
    caller asks with `ocrAvailable()`. Budgets are 200 pages a sync and 20 a
    file, and a document longer than the app could read now says so, which it
    did not when the entry first claimed it did. (D-059–D-062)

    Three times in three entries, the fault worth catching was the app's own
    scaffolding or noise passing itself off as the document's own words — which
    is why a passage read from a scan is marked as one. The last two were found
    by reading the panel's sentences back against the code, not by a test, a
    type, or a live run: all three were green. (D-061, D-062)
  - **M5.11 — connections that send (built).** The batch is decided
    (D-077): Tier 1 is Telegram, Google (Gmail + Calendar + Contacts on one
    consent), WhatsApp Business and Slack; Tier 2 adds nine more on the same
    two credential shapes; six apps are declined with the reason on the row,
    WhatsApp personal first among them — and one act beside them by
    decision, initiating a payment or transfer (D-219). Sends never happen in a session
    (D-075): a run writes `OUTBOX.json` — one channel, up to 20 messages —
    review shows the messages, and **Approve is the send**, replayed by the
    server through the channel's client exactly as a patch is replayed by
    `git apply`. Results are stamped per recipient so a retry can never
    message anyone twice — and since D-160 the whole read→send→stamp
    sequence runs behind one per-job claim, so two *concurrent* Approves
    cannot race it either: the second is refused by name with nothing
    moved. Every attempt is audited to `sends.jsonl` beside
    the ledger; a channel that is off refuses with the reason and the job
    stays reviewable. Credentials are a Connect button for the OAuth pair
    and paste-a-token for everything else, passwords never (D-076).

    **The one thing beside a send that Approve lets out is a file (D-268,
    built).** A sentence asking for a *nómina* has the run write
    `NOMINA.json` — who and how much, and never where: the bank, the account
    and the name on the file come from a **payee allowlist** in Settings that
    only a person adds to. Approve checks every payee against it and **refuses
    the whole batch by name** if one is outside — the subset rule of D-082,
    though stricter than it: D-082 gates an auto-send and drops back to human
    review, and this refuses a person's own Approve. Inside, it composes
    `nomina.txt` in the bank's
    upload format as a deliverable. The verdict is recomputed at every ask, so
    adding the payee makes the same batch approvable with no re-run. Nothing is
    paid: the app has no payment endpoint (D-219 stands, and the proof greps for
    one), and the act is uploading the file and pressing the bank's own token.
    The format is BCI's published specification; Santander publishes none, so
    its column table waits on the template the bank hands the client.
    Slices, in the approved order — the review path exists before anything
    can ask to send:
    - [x] **Outbox + review.** `outbox.ts` (contract + validation),
          `channels.ts` (registry + replay with per-recipient retry),
          `sends.ts` (the audit), stamped by the queue on completion, executed
          by the resolve route, shown in the review modal. Telegram's channel
          client ships with it — token via `.env`, the drawer comes later.
    - [x] **Files on a message** (D-159). `files` on an outbox message —
          up to 5 sandbox-root deliverables or `input/` forwards, 10 MB
          each, 15 MB per message — on telegram and gmail only, refused at
          parse anywhere else exactly as the event block is outside
          calendar. Existence is checked where the outbox parses and again
          at send; the review card grows a paperclip row per file; Approve
          reads the bytes from the sandbox. Telegram sends the body as
          `sendMessage` then each file its own `sendDocument` (never the
          1024-cap caption); gmail goes whole to the media-upload endpoint
          as multipart `message/rfc822` while plain mail keeps the raw
          path proven since D-080. Files never auto-send, the desk's
          hold-whole compose rides Start attachments, and `sends.jsonl`
          records which names left.
    - [x] **The token drawer.** "Add it here" on any credentialed connection:
          the catalog's own walkthrough, paste, one real validation call
          (telegram `getMe` → @botname, github `/user` → login, one Brave
          query), then the value lands in `.env` — still the only store —
          and the live `process.env` in the same move, no restart. Nothing
          stores unvalidated, refusals never echo the value, and storing
          never switches anything on (D-078).
    - [x] **Intake detection + the ask-card.** A send verb plus a channel
          word — nothing less — resolves in the free intake, and the plan
          carries a server-decided `channelAsk`: a connected channel is a
          quiet chip, an unconnected wired one offers the drawer and
          queue-anyway, a planned one names the roadmap, and WhatsApp
          personal states its refusal with the honest fork (Telegram /
          Business API / Gmail). Start carries a usable channel or queues a
          draft job that sends nothing; a job with a channel is told the
          OUTBOX.json contract in its brief (D-031). Parked at the desk
          rather than as a `needs-connection` status — that is D-030's
          `waiting` shape, refused a second time; reasoning in D-079. The
          bubble over the agentling landed later as pure presentation: the
          same card in a tracked sheet-with-tail, with the bar card as the
          fallback whenever the world cannot anchor it (D-084).
    - [x] **The Google Connect flow.** Loopback OAuth against the user's own
          client (never a shared one, D-076): the drawer takes client id +
          secret, Google's consent page opens in a fresh tab — one consent
          across gmail.send, calendar.events, contacts.readonly,
          contacts.other.readonly (D-123) plus
          identity — and the 127.0.0.1 callback exchanges the code with
          PKCE. The exchange succeeding is the validation; a flow that
          never returns stores nothing. The gmail channel sends approved
          outboxes as the user (RFC 822 raw, accented subjects encoded,
          optional `subject` on outbox messages); testing-mode's 7-day
          expiry is named in the setup steps and again by the send-time
          reconnect sentence. Cards now say who connected (D-080).
    - [x] **The WhatsApp Business guide + channel.** Six Meta setup steps on
          the drawer, leading with the free test number (messages 5 verified
          numbers, no business verification). Business-initiated sends are
          pre-approved templates: the outbox carries `template`
          {name, language} once and per-message `params` — validated in
          Meta's own shapes — while `body` stays the reviewed rendering and
          the card prints exactly what is transmitted. Two secrets validate
          *whole* with one real call (the drawer submits the set; partial
          pastes refuse before any call). Sends stamp the user's declared
          `WHATSAPP_USD_PER_MESSAGE` into `sends.jsonl`, or no price at all
          — never a guess (D-081).
    - [x] **Standing approval** (the sketch said "the leash"; renamed —
          the recipe leash already owns that word, D-030/D-082). Three
          unchanged reviews of a send job earn the offer; granting lets
          the next clean run send itself, locked to the approved channel,
          recipient set and template — subset allowed, one stranger blocks
          the send, any signature change resets the count *and revokes the
          grant*. Auto fires only on a pure send job (no code changes, no
          extra files), through the same refusal gate, replay, audit and
          promote as a manual approve, and announces itself in the
          terminal. Offer at the earning review; list + one-click revoke
          in crew → backoffice (D-082).
    - [x] **The words, and the send that costs nothing** (D-097, added after
          the first real sends were reviewed as a user rather than as their
          author). A send carrying no content had nowhere to put the
          message: the prompt is an instruction, and `Say` asked what it
          should say *roughly*, promising the crew would write it out — so
          the message went into a box that offered to reword it, and did.
          The desk now tells the two apart by what is **left** after the
          send words, the channel words and the roster's names are struck
          out; nothing left means the message exists only in the user's
          head, and it asks for the **Words**, sent as written, with
          "write it out" as the way back to a draft. With both facts in
          hand there is nothing to decide, so the outbox is built in code
          on a `compose` tier — free and instant, and approval is still the
          send. A sending channel stopped being a *tool* in the same
          change: it grants a session nothing (sends are replayed by the
          server), and its presence in the capability surface was what
          refused every send job a compile.
  - **M5.12 — the recurrence timer (built).** D-103. A schedule is a
    sentence queued again on its cadence — verbatim, because the recipe key
    is the prompt — created beside Start on the intake's repeat row, listed
    with its next firing in the backoffice, fired by a 30-second server
    sweep plus a boot sweep **through the same glue `/work` uses**, so every
    firing is planned, channel-settled, quoted and reviewed exactly like a
    hand-queued job. Downtime collapses to one catch-up firing, never a
    backlog; pause resumes from now; attachments do not repeat. A scheduled
    pure send under a standing approval (D-082) closes the loop whole:
    it queues itself, sends itself, and audits every body to `sends.jsonl`.
    The repeat row can also **schedule only** — no run today, for jobs whose
    first run belongs on the cadence — and the confirmation says the first
    firing's date, computed by the server, never re-derived at the desk
    (D-106).

    **A voice note is a sentence (D-265, #17).** The third way a sentence
    arrives, after typing and a mail firing: while the telegram connection
    is on, the server polls the bot's `getUpdates` every fifteen seconds
    (D-253: polled, never delivered) and a voice note from anyone on the
    roster is fetched and transcribed **on this machine** — whisper-small
    through transformers.js on the CPU, the language asked of the model
    before the read, silence judged by energy so a quiet note is *nothing
    heard* and never a guessed word. The note waits above the work bar
    with its words or its reason; *Use* puts the words in the box and the
    ordinary reading and Start apply — a note is never queued on its own,
    and `voice` on `/work` only attaches the audio and the words as
    transcribed to `input/` and spends the note. `npm run voice:install` is the one step (241 MB into
    `.agentlings/models/`, proven on a known clip); until it has run, a
    note says *the transcriber is not installed* by name. `GET /api/voice`
    lists the transcriber and the waiting notes; `POST /api/voice/:id/dismiss`.
  - **M5.13 — the acting surface finished (built).** D-104. Three channels,
    no new idea about acting — every one is an outbox replayed at Approve.
    **Slack** is telegram's shape wholesale (paste-a-token, empty grant),
    with the Web API's 200-with-`{ok:false}` verdict read in the body.
    **Calendar events** ride the Google consent already given: the outbox
    contract gains its one event block — `event: {start, end, attendees?}`,
    `subject` as the title, one event per outbox, validated at the seam,
    refused on every other channel — and invitations go out by Google's own
    mail. **GitHub comments** are the first write on the reading connection:
    `to` is `owner/repo#123`, the session keeps its seven read tools, and
    opening a PR deliberately stays out (a pushed branch is promote-flow
    work, not an outbox entry). Detection widens by **scoped claims** — a
    channel's own verbs count only beside its word — so "add it to my
    calendar" is heard while "create a test for the telegram module" stays
    a coding sentence.
  - **M5.14 — composite work (built).** D-105. A sentence splits where the
    user said "then" — explicit markers only, a conditional lead refuses,
    at most three steps — shown at the desk with each step quoted on its
    own sentence and "run as one job" one click away. Each step is an
    ordinary job (own recipe key, own tier, own quote, through the same
    glue every way in shares); a delivered step's files ride into the next
    step's input/ with its report as previous-step.md, and a failed step
    halts the chain with the reason in the feed. The next step never exists
    before the previous delivers — no waiting status, again. Scheduled
    composite sentences split at fire time; open-ended goal decomposition
    stays parked in M6.
- **M6 — deepen the metaphor (parked ideas).** Hazards mapped to real
  failure modes (rate-limit fire pits, error chasms), blocker agentlings
  (paused queues), goal decomposition — the open-ended kind, where the app
  invents steps the user never wrote. Job pipelines left this list in
  M5.14.

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
