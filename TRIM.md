# Trim review — 2026-09-04

What to cut after the product is deliverable, ranked so a person can
greenlight one ticket at a time. **Review only.** No cleanup landed with
this note. Independent of any other in-flight line.

Measured on `c42c2d6` (main). Counts are `wc -l` / ripgrep, not vibes.

**How to pick this up:** the table in §1 is the decision surface. §2–§5
are the evidence. §6 is what not to touch even if a trim ticket is
greenlit. A greenlight is a new ticket that names one row from §1, not
a licence to sweep.

---

## 1. Top findings (impact × effort)

| # | Finding | Impact | Effort | Greenlight as |
|---|---|---|---|---|
| **T1** | `server/src/index.ts` is 5,251 lines / 108 routes / 96 imports. ~754 lines of job-intake glue (`queueSentence` and five siblings, lines 1966–2714) sit in the HTTP process file. | High — every new way-in has to find the glue by scrolling | Medium — extract, pin with existing `work.test.ts` / `verdict.test.ts` / `queue.test.ts` | Extract intake glue to a module the routes call |
| **T2** | The desk re-quotes on every keystroke (`WorkBar` debounce 250 ms → `POST /work/plan` → `quoteFor_`). `storeLines` is cached (mtime/size, measured in `store.ts`). **`readLedger` is not** — it re-parses the whole install `ledger.jsonl` on every quote. | High as the ledger grows; low today on a small install | Low — same cache shape as `storeLines` | Cache `readLedger` / `readRecipes` behind file identity |
| **T3** | `Job` is 62 top-level fields (~378 lines in `packages/shared/src/index.ts`). Every act type (outbox, pack, moves, party, withheld, reconciliation, nómina) is another optional blob plus an `*Error` sibling. `NewJobSpec` duplicates 27 of those fields. | High going forward — next act will add two more fields | Low as **policy**; high as a rewrite | Stop adding top-level fields. Do **not** migrate existing jobs.json |
| **T4** | Two enqueue paths. UI and schedules go through `queueSentence`. `POST /api/levels/:lid/jobs` is in SPEC.md, unused by `web/` (zero callers), and is the path that once queued with no `quotedUsd` (D-027, still named in `work.ts`). | Medium — a second way-in is how quote/channel stamps drift | Low | Route `/jobs` through `queuedJobSpec`/`queueSentence`, or mark it compatibility-only |
| **T5** | Four UI god-files: `WorkBar.tsx` 1,720 · `ReviewModal.tsx` 1,270 · `SettingsModal.tsx` 1,205 · `WorldCanvas.tsx` 1,068. The extract-the-pure-logic pattern already exists (`askFacts.ts`, `doors.ts`, `nomina.ts`, `files.ts`). | Medium — next desk change is expensive | Medium, one file per ticket | Continue extracting; do not rewrite the JSX in one PR |
| **T6** | `packages/shared/src/index.ts` is 2,638 lines of domain types in one barrel. World/pack types already live in sibling files (`scene.ts`, `pack.ts`, `palette.ts`, `draw.ts`). Job/library/coverage/outbox do not. | Medium for navigation | Low-mechanical | Split the barrel by domain; re-export from `index.ts` so imports do not move |
| **T7** | Scripts: 13,004 lines. 29 `prove-*` files = 8,275 lines (two of them duplicate `railwayBin()`). 12 `backfill-*` files = 1,171 lines, all one-shot. Not product, not dead — they are the evidence DECISIONS.md cites. | Low for runtime; high for “where do I look” | Low if left; high if deleted wrongly | Leave in place. Optionally add `scripts/README.md` that classifies prove vs backfill vs bench |
| **T8** | `web/src/world/scenes/starbase.ts` (428 lines) exports `STARBASE` / `STARBASE_THEME` and **nothing imports them**. `TitleScreen.tsx` uses the baked `/starbase-scene.jpg`. | Tiny | Tiny, after confirming the jpg is the source of truth | Delete or wire; do not do both “to be safe” |
| **T9** | `zod` is a **server production** dependency (`server/package.json`) and is imported only from tests + prove scripts (`mcpprobe.test.ts`, `mcpprobe.fixture.mjs`, three `scripts/prove-*.mjs`). | Tiny (install size / “what can a sandbox import”) | Tiny | Move to `devDependencies` |
| **T10** | Naming collision, not duplication: `channel.ts` (901, intake detection) vs `channels.ts` (617, Approve send clients). Both live, both load-bearing. | Low now; high the day someone “consolidates channels” | — | Rename only with a decision. Do not merge |

The architecture is **under-modularized**, not over-abstracted. The executor
chain (`RoutedExecutor` → `ClaudeAgentExecutor` → `agent-runner.mjs`, with
`SimulatedExecutor` as the whole-tail stand-in) is the one place a second
layer earned its keep. Almost everything else is a flat `server/src/*.ts`
plus one process file that grew the product.

---

## 2. Architecture

### Layering (what is actually there)

```
web  (Vite + React + PixiJS)   125 files, 18,725 prod / 4,112 test
  └─ REST /api  +  WS /ws
server (Hono + ws, tsx, no build)   215 files, 36,882 prod / 35,123 test
  └─ JSON/JSONL on disk under .agentlings/
packages/shared   6 files — domain types + world draw/pack/palette
```

Server state is authoritative; the client renders it. That split is clean
and should stay. The rot is **inside** the server process file and **inside**
the `Job` type, not across the three packages.

`packages/shared` is the right seam. World drawing already escaped the
barrel (`scene.ts` 442+ lines of ops, `draw.ts`, `pack.ts` 560, `palette.ts`).
The remaining 2,638-line `index.ts` is the API contract the web bundle
compiles against — splitting it (T6) is a file move, not a redesign.

### Coupling

| Seam | Who owns it | Coupled to |
|---|---|---|
| `LevelRuntime` (`index.ts:543`) | process file | queue, sim, EventLog, MemoryStore, roster |
| `queueSentence` (`index.ts:1966`) | process file | matcher, quote, channel detect, steps, party, check, settings, connections |
| `JobQueue.persist` | `queue.ts:273` | pretty-prints **every** job in the level to `jobs.json` on any mutation |
| `quoteFor_` | `quote.ts` | ledger + recipes + store + knowledge + tools + router |
| `Sim` | `sim.ts` | presentation only; job truth in `JobQueue` — this split is healthy |
| `crew.ts` | roster ↔ sim | small and correct (D-030's lesson applied) |

The expensive coupling is `queueSentence`: it is the one function every
schedule, mail trigger, chain step, check pass, party hand/gather, and
authoring button must go through so stamps do not drift. That is a feature.
Having it **live in `index.ts` next to 108 HTTP handlers** is the fat.

### Dead modules

| Path | Lines | Verdict |
|---|---|---|
| `web/src/world/scenes/starbase.ts` | 428 | Unused at runtime. Title screen loads a jpg. |
| `POST /api/levels/:lid/jobs` | route at `index.ts:1602` | Live API, **zero `web/` callers**. SPEC still lists it. `/work` is what the desk uses (`WorkBar.tsx:701`). |
| `server/src/coveragebench.ts` | 384 | Used by `npm run bench:coverage` and its test, not the running app. Keep. |
| 12 `scripts/backfill-*` | 1,171 | One-shot repairs. Keep; they are how D-033 backfills get re-run. |
| 29 `scripts/prove-*` | 8,275 | Live evidence, not product. `prove-hosted.mjs` is 1,513 lines and is the hosted-install proof. |

Nothing in `server/src/*.ts` (non-test) is an orphan import. Modules that
look niche — `sii.ts` 748, `nomina.ts` 665, `jobboard.ts`, `coverage.ts` 649 —
are product for this install, not leftovers.

### Over-abstraction

Almost none. The project's own rule ("no abstractions for single-use") is
what produced T1. Places that look like a second layer and are not:

- `quoteFor` (`estimate.ts`) vs `quoteFor_` (`quote.ts`) — the underscore is
  ugly; the split is the point (price given a ledger vs gather what the
  server holds). Rename later if it bothers; do not collapse.
- `channel.ts` vs `channels.ts` — detection vs send. Different jobs.
- `steps.ts` (serial "then") vs `party.ts` (parallel "team of N") — different
  licences (D-105 vs D-195). Unifying them would be a product change.
- `outbox.ts` (contract) vs `outboxsend.ts` (perform) vs `channels.ts`
  (clients) — the D-075 shape, keep.

---

## 3. Data layer

There is no SQL. The store is JSON/JSONL on disk. Schema drift is handled
by **lift-on-read** and **absent-means-before-this-existed**, never by
migrations.

### On-disk map (what a level actually writes)

**Install-wide** (`.agentlings/`):

| File | Module | Shape |
|---|---|---|
| `ledger.jsonl` | `ledger.ts` | append-only; whole-file rewrite on finalize/close |
| `settings.json` | `settings.ts` | connections on/off, model, wire payees, browser-act |
| `connections.json` | `userconnections.ts` | user MCP servers (catalog stays in-repo) |
| `sends.jsonl` | `sends.ts` | append-only send log |
| `refusals.jsonl` | `refusals.ts` | desk refusals |
| door-usage / voice / session cookie | `doorlog.ts`, `voice.ts`, `session.ts` | |

**Per level** (`.agentlings/levels/<id>/`):

| File | Module |
|---|---|
| `level.json`, `roster.json`, `KNOWLEDGE.md` | `levels.ts` |
| `jobs.json` | `queue.ts` — **full rewrite, pretty-printed, every mutation** |
| `recipes.json` | `recipes.ts` |
| `schedules.json` | `schedules.ts` |
| `send-approvals.json` | `approvals.ts` |
| `store-index.json` | `store.ts` (capped; lines cached in-process) |
| `tool-candidates.jsonl` | `recipes.ts` |
| `memory/<name>.md` | `memory.ts` |
| `tools/<name>/tool.json` | `tools.ts` |
| `reconciliations/<jobId>.json` | `reconciliation.ts` |

**Per job sandbox** (the act files, one promise shape):
`OUTBOX.json`, `MOVES.json`, `PACK.json`, `PARTY.json`, `WITHHELD.json`,
`RECONCILIATION.json`, `NOMINA.json`, `.trajectory.jsonl`, `.session.json`.

No unused model turned up. Optional fields on `StoreIndex`
(`truncated`, `scanned`, `scanCut`, `unscanned`) and on `Recipe`
(`capabilities`, `inputShape`, `usedTools`, `successes`, `completions`)
are live or are the D-033 "absent means before this existed" bargain.

### Schema / store drift

`queue.ts` `liftJob` (from line 133) is the only schema adapter: it lifts
pre-D-179 `channel` / single `outbox` / single `outboxSent` into lists on
read, and `restore()` does the same so a way-in cannot write the old shape
back. That is the right pattern. A bulk rewrite of historical `jobs.json`
is how you lose a level.

Several ledger fields are **recorded and deliberately not read**
(`compile`, and comments in `tools.ts` / `ledger.ts` saying so). That is
not dead data — it is waiting for enough samples to price on. Do not strip.

### Query hotspots

1. **Quote path** (`quote.ts:41`, called from `index.ts` plan + queue +
   continue/redo). Each call: `storeLines` (cached) + `readRecipes`
   (full `JSON.parse`) + `readKnowledge` + `usableTools` + **`readLedger`
   of the whole install**. The plan route re-runs on typing. `store.ts:476`
   already documents the 30 MB / 103 ms worst case they cached for; the
   ledger did not get the same treatment.
2. **`JobQueue.persist`** (`queue.ts:273`): `JSON.stringify(this.list(), null, 2)`
   of every job the level has ever queued, on pickup, progress, resolve,
   stamp. Fine at dozens of jobs; the `Job` blob (T3) makes each row large.
3. **`Sim.frame`** (`sim.ts:110`) copies/sorts the job list when the
   watcher is stale — already gated on `revision()`. Leave it.
4. **Provenance** (`provenance.ts`) walks jobs + recipes + ledger + store +
   tools. Read-only, on-demand from the panel. Not a tick hotspot.

`storeLines` is the model for T2: keyed on mtime+size, staleness applied
to `now` every call, array shared, consumers must not mutate.

---

## 4. Workflows

### The live job chain (do not collapse)

```
desk / schedule / mail trigger / author-pack
  → queueSentence (index.ts) / queuedJobSpec (work.ts)
    → JobQueue.add
      → Sim.tryPickUp (role match in queue.nextUnassigned)
        → RoutedExecutor (recipes, store, tools, compose)
          → ClaudeAgentExecutor | SimulatedExecutor
            → agent-runner.mjs
        → onOutcome → queueNextStep / queueCheck / queueGatherIfLastHand
        → review → performVerdict (verdict.ts, D-278)
```

D-278 already collapsed the 568-line resolve route and the standing-approval
path onto `verdict.ts`. That is the precedent T1 should copy for *intake*.

### Duplicated agent / job logic

| What | Where | Verdict |
|---|---|---|
| Who takes a job | `work.ts` `pickAgentling` (plan) vs `queue.nextUnassigned` + `Sim.tryPickUp` (runtime) | Two questions (preview vs claim). Keep both; they already disagree on purpose (resting crew, check-pass `avoid`). |
| Channel settlement | `/work/plan` (`index.ts` ~1751) and `queueSentence` (~2063) both call `detectChannelAsk` + `settledChannels` | Same functions, two call sites — the D-179 requirement that card and job agree. Extracting T1 makes this one call. |
| Quote | `quoteFor` vs `quoteFor_` | Split is correct (see §2). |
| Continue / redo / reply | `work.ts` `continuationBrief` / `redoJobSpec` / `replyBrief` plus three routes that still `queue.add` directly (`index.ts` 3090, 3139, 3241) | The routes should become `queueSentence` callers the same day as T1, or they will be the next D-027. |
| Crew UI | `CrewRail` (who is on the floor) · `CrewPanel` (merge/rest) · `CrewModal` (hire from title) | Three surfaces, three jobs. Not copy-paste. |

### Dead paths

- **`POST /jobs`** from the browser: dead. From SPEC / curl / tests: live.
  T4.
- **Open-ended decomposition**: parked in SPEC M6 / `steps.ts` header.
  Not built, not dead code.
- **Photoreal three.js** (PBR, shadow maps): declined D-204. The `three`
  package is **not unused** — `render.ts` vendors it for `render_plate`
  (`VENDORED_THREE`, D-143). `render.test.ts` exercises a THREE scene.
  Do not remove the dependency.
- **Compiled-tool pricing**: the fourth tier runs (`tools.ts`, router
  `kind: 'tool'`). Ledger `compile` is recorded and not yet a rate class.
  Leave the field.

---

## 5. Codebase fat

### Size map (source, excluding tests)

| Bucket | Prod lines | Notes |
|---|---|---|
| `server/src` | 36,882 | ~half tests again (35,123). That ratio is a feature. |
| `web/src` | 18,725 | Tests thinner (4,112). |
| `packages/shared` | ~3,900 | Barrel + pack/scene/draw. |
| `scripts/` | 13,004 | Prove/backfill/bench. |
| Root `*.md` | 32,303 | `DECISIONS.md` alone is 24,233. |

Largest files:

| Lines | File |
|---|---|
| 5,251 | `server/src/index.ts` |
| 2,638 | `packages/shared/src/index.ts` |
| 1,758 | `server/src/executors/claude.ts` |
| 1,720 | `web/src/panels/WorkBar.tsx` |
| 1,561 | `server/src/executors/routed.test.ts` |
| 1,513 | `scripts/prove-hosted.mjs` |
| 1,385 | `server/src/verdict.test.ts` |
| 1,343 | `server/src/queue.test.ts` |
| 1,270 | `web/src/panels/ReviewModal.tsx` |
| 1,205 | `web/src/screens/SettingsModal.tsx` |
| 1,112 | `server/src/executors/claude.test.ts` |
| 1,068 | `web/src/world/WorldCanvas.tsx` |
| 905 | `server/src/queue.ts` |
| 901 | `server/src/channel.ts` |

`claude.ts` at 1,758 is a session-brief + tool-allowlist + close-out
module, not a god-object in the `index.ts` sense. Split only if a
ticket is about the brief, not as trim.

### Unused deps

| Dep | Where declared | Used? |
|---|---|---|
| `three` | `server/package.json` | **Yes** — `render.ts` plate door (D-143). Keep. |
| `@huggingface/transformers` | server | **Yes** — lazy in `transcribe.ts`. |
| `ogg-opus-decoder` | server | **Yes** — lazy in `transcribe.ts`. |
| `playwright-core` | server | **Yes** — render, browser-act, prove UI. |
| `docx` `exceljs` `mammoth` `pdf-lib` `pdf-parse` `pptxgenjs` `jszip` | **repo root** `package.json` | **Yes** — D-031: sandboxes resolve root `node_modules`. Also `documents.ts`. Do not move them into `server/` without re-checking sandbox `import()`. |
| `railway` | root | **Yes** — `.railway/railway.ts` + `container.test.ts`. |
| `zod` | **server dependencies** | Tests + prove scripts only. T9. |
| `mermaid` | web | **Yes** — lazy in `Mermaid.tsx`. |
| `pixi.js` | web | **Yes** — `WorldCanvas.tsx`. |

No knip/eslint unused-export pass is configured (`tsc --noEmit` only).
T8 is the one confirmed unused *module*. A mechanical unused-export hunt
would be a follow-up, not a first ticket — this repo's comments are load-
bearing and a tool that flags "unused" on a function a prove script
imports via `tsx` will lie.

### Copy-paste

- `railwayBin()` is duplicated in `scripts/prove-hosted.mjs` (~663) and
  `scripts/prove-hosted-engine.mjs` (~55). Do not "DRY" the prove scripts
  in the same ticket as a product trim; they are independently pinned.
- `NewJobSpec` ⊂ `Job` (27/62 fields). Collapsing them is how a queue
  stamp gets dropped (the D-097 / `channelMention` incident is documented
  on the spec itself). Keep the copy; generate it from a shared pick type
  if T3 is greenlit as policy.
- Panel helpers already absorbed the worst JSX duplication. Further
  copies (`fileSize` in `WorkBar.tsx:70` vs similar in files.ts) are
  noise, not a ticket.

---

## 6. Concrete improvement proposals

Greenlight **one row**. Each is a ticket with a stop condition.

### T1 — Extract intake glue (do this first)

Move `queueSentence`, `queueNextStep`, `queueCheck`, `queueParty`,
`queuePartyPlan`, `queueGatherIfLastHand` (~754 lines) out of
`server/src/index.ts` into something like `server/src/intake.ts` (or
into `work.ts` if it stays under ~600). Routes become adapters.

Stop when: `index.ts` still owns listen/gate/WS/routes; `npm test` and
`npm run typecheck` pass; a scheduled firing, a "then" chain, and a
party still go through the same function (add a test that the route
file does not re-implement settlement).

Do **not** also split the 108 routes in the same ticket.

### T2 — Cache ledger (and recipes) like the store

Copy `store.ts`'s `held` map onto `readLedger` / `readRows` and
`readRecipes`: key mtime+size, share the array, apply no clock
staleness (those files do not go stale by age). `quoteFor_` keeps
calling the same functions.

Stop when: `quote.test.ts` still passes; a test proves a rewrite of
`ledger.jsonl` is seen on the next call; the plan route does not
re-parse a 1k-row ledger per keystroke.

### T3 — Policy: no new `Job` top-level fields

The next act type is a sandbox JSON + one parser + a stamp on an
`acts?: { kind: string }[]` (or keep using the existing per-file
pattern without adding `foo` + `fooError` to `Job`). Document in the
ticket, not a DECISIONS.md entry unless Brian wants it settled.

Do **not** migrate `outbox` / `moves` / `packDraft` / … off `Job`.
Lift-on-read stays.

### T4 — One enqueue path

Make `POST /jobs` call `queuedJobSpec` + the same settlement
`queueSentence` uses (or delete it from SPEC and keep it as a thin
alias that 400s with "use /work"). The web client does not need it.

### T5 — One UI extract per ticket

Order: `WorkBar.tsx` (intake already half-extracted) → `ReviewModal.tsx`
(review already has `nomina.ts` / `moves.ts` / `files.ts`) →
`SettingsModal.tsx`. `WorldCanvas.tsx` is Pixi wiring; leave it until
a world bug forces a split.

### T6 — Split the shared barrel

`packages/shared/src/job.ts`, `library.ts`, `coverage.ts`, `outbox.ts`,
re-exported from `index.ts`. Zero import changes for server/web if the
barrel stays. Mechanical.

### T7 / T8 / T9 — Opportunistic

- T7: `scripts/README.md` classifying prove / backfill / bench. No
  deletions.
- T8: confirm `starbase-scene.jpg` is canonical, then delete
  `scenes/starbase.ts` or render the title from it. Not both.
- T9: `zod` → server `devDependencies`. Re-run `npm test -w server`.

---

## 7. What NOT to touch yet

These look like fat and are not, or the cost of being wrong is a
broken install / a bill / a lost level.

| Leave | Why |
|---|---|
| `DECISIONS.md` (24,233 lines) | The record. Length is the evidence. Never a trim target. |
| `AGENTLING.md` | Derived. Regen from code; do not hand-shorten. |
| `.railway/`, `Dockerfile`, `listenPolicy`, bind/password | Production config. Out of scope. |
| Root document libraries | Sandboxes resolve them (D-031). Moving them silently changes every job. |
| `three` | `render_plate` (D-143). D-204 declined *photoreal*, not the package. |
| `jobs.json` on disk / `liftJob` | Lift-on-read is the migration. A rewrite is how history dies. |
| Router "never guess" / quote ceilings / `quotedUsd` enforcement | Money path. Cache reads (T2); do not change what a quote *means*. |
| `channel.ts` regexes | Paid for in real missed sends (D-090, D-093). |
| Unifying `steps.ts` and `party.ts` | Different product licences. |
| Collapsing `CrewRail` / `CrewPanel` / `CrewModal` | Three questions. |
| Horde tickets, coverage %, O*NET jobboard | Expansion line, scored by real work, not by file count. |
| G4 / G5 / G6 / G8 in `GAPS.md` | Control-plane / quote residuals / robustness. Not trim. |
| Server test volume (~1:1 with prod) | The pin that makes T1 safe. Cutting tests to look leaner is the wrong metric. |
| Prove/backfill scripts | Evidence. Classify (T7), do not delete. |
| `compile` / unused-looking ledger fields | Recorded until there is a rate. |
| Hosted vs local capability probes | D-274. Not fat. |

---

## 8. How this was counted

- Line counts: `find … -exec wc -l` on 2026-09-04, excluding
  `node_modules` / `dist` / `.git`.
- Routes: 108 `app.(get|post|put|delete|patch)` in `index.ts`, and
  nowhere else.
- `Job` fields: top-level `^  (\w+)\??:` inside `export interface Job`.
- Web `/jobs` callers: ripgrep over `web/` for `/jobs` POST — none.
  Desk uses `lvl(levelId, '/work')`.
- Dep uses: ripgrep `from '…'` / `import('…')` including lazy
  `documents.ts` / `transcribe.ts` / `render.ts`.
- `starbase.ts` imports: only the file itself. `TitleScreen.tsx` uses
  `BG_URL = '/starbase-scene.jpg'`.
- Glue range: `function queueSentence` at 1966 through
  `queueGatherIfLastHand` ending before `author-pack` at 2716.

No production config was changed. No code was deleted. No cleanup PR.
A greenlight is a new ticket that names T1–T9.
