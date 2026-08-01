# Agentlings

Behavioral base adapted from the Karpathy-inspired CLAUDE.md
(https://github.com/multica-ai/andrej-karpathy-skills), followed by
project-specific instructions. Where they conflict, project-specific wins.

## Behavioral guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.

---

## Project: Agentlings

A personal orchestration tool with Lemmings-style presentation: a horde of
small agentlings marches through a side-view 2D world, picks up real coding
jobs, works them in per-job sandboxes, and delivers results for review.
Full product definition: SPEC.md.

Greenfield, started 2026-07-29. Solo developer (Brian).

### Ground rules

- IMPORTANT: This project is completely separate from the IGPL Family Office
  project. Account-level connectors visible in sessions here (Supabase, Gmail,
  Calendar, Carta, Vercel) belong to that other project — NEVER read from or
  write to them for Agentlings work unless explicitly told otherwise.
- Architectural choices (language, engine, framework, storage) extend rule 1:
  present 2–3 options with a recommendation, wait for the decision, then
  record it in the Decision log.
- Keep the project half of this file lean: when a placeholder becomes real,
  replace it and delete stale lines.

### Environment

- Windows 11; PowerShell is the primary shell. Prefer cross-platform tooling.
- This folder lives inside OneDrive (`...\OneDrive\Escritorio\Agentlings`).
  If `node_modules` or build output ever makes sync churn, exclude it via
  OneDrive Settings → Sync and backup → Advanced → Exclude files.
- Secrets go in `.env` (gitignored) — never in code and never in this file.

### Commands

- Setup: `npm install`; for the real executor copy `.env.example` → `.env`
  and set one auth option (see SPEC.md M1)
- Run dev: `npm run dev` (web on http://localhost:5173, API/WS on :4600)
- Test: `npm test`
- Lint / typecheck: `npm run typecheck`

### Code style & conventions

- TypeScript everywhere, `strict` on, ESM (`"type": "module"`).
- npm workspaces: `packages/shared` (domain types), `server` (Node + Hono +
  ws; runs TS directly via tsx, no build step), `web` (Vite + React + PixiJS).
- Server state is authoritative; the web client only renders it.

### Workflow

- Definition of done (extends rule 4): show the evidence — test output,
  command results — don't just assert success.
- Commit early and often with descriptive messages once git is initialized.

### Decision log

<!-- One line per architectural/irreversible decision: date — decision — why. -->
- 2026-07-29 — Named "Agentlings" (agents + -lings, Lemmings homage); lives at
  `Escritorio\Agentlings` as a sibling of IGPL, fully separate context.
- 2026-07-29 — Adopted the Karpathy-inspired behavioral guidelines
  (multica-ai/andrej-karpathy-skills) as the base of this CLAUDE.md.
- 2026-07-30 — Concept resolved (design interview): personal real-work
  orchestrator for local coding jobs; literal 2D world; independent job
  queue; sandbox + review outputs. Details in SPEC.md.
- 2026-07-30 — Stack: TS monorepo (npm workspaces) — Vite + React + PixiJS
  web, Node + Hono + ws server, Vitest; Claude Agent SDK planned as the
  real executor (M1).
- 2026-07-30 — External-app access for agentlings happens in-app (MCP
  connection registry, per-job opt-in; sketch in SPEC.md M2) — never by
  reusing claude.ai / Claude Code connectors.
- 2026-07-30 — Agentling identity: per-agentling roles in Claude-native
  formats (subagent .md in `roles/`, SKILL.md in `skills/`, installable
  from GitHub URLs), per-agentling memory files, profile popup on sprite
  click. M0 stores identity; the M1 executor enforces it. See SPEC.md.
- 2026-07-30 — M1 built: real executor = one Claude Agent SDK session per
  job in a child process (agent-runner.mjs, plain node) with laundered
  env — never import the SDK into the server/tsx process (it wedges the
  loader). Repo jobs: local clone + DIFF.patch review; promote =
  git apply. Auth via .env (see .env.example).
- 2026-07-30 — Visuals phase 1: one master palette (DB32) drives every
  theme, sprite and thumbnail; canvas scales by whole numbers with
  letterbox; optional CRT filter; iris-wipe transitions; particles;
  Press Start 2P (OFL) for signage only.
- 2026-07-30 — Visuals phase 2: art is data. `npm run art` bakes the
  hand-authored frames into `web/public/art/agentling.png` plus an
  Aseprite-shaped atlas (cycles name their frames, since ours reuse them);
  the runtime prefers that sheet and falls back to the same frames as JSON,
  so the two can never drift. Anything loaded is snapped onto DB32, which
  is a no-op for our own art and is what makes an outside pack belong.
  The palette moved to `packages/shared` — it is a product decision, not a
  rendering one.
- 2026-07-30 — Visuals phase 3 (art source), resolved: **keep the built-in
  art**. It is original, coherent and already DB32; now that phase 2 makes
  swapping it a file copy, the decision is reversible and does not have to
  be made under pressure. What is not deferred is the contract — a pack
  must supply walk/work/deliver by name, uniform frame size, facing right,
  feet on the bottom edge, transparency not a matte; `npm run art:check`
  enforces it and `art/PACK.md` is the brief. Any resolution is allowed:
  the world scales to frame height. A pack's licence lands in this repo,
  so terms get recorded before installing — free rarely means
  unconditional, and committing a pack here is redistribution.
  Deferred: making `drawScenery` data-driven, which every external-terrain
  route needs. It is a large rewrite whose whole point is how it looks, so
  it waits for a Browser pane that is actually displayed — the hidden pane
  freezes the render loop and it would be reshaped blind.
- 2026-07-30 — M3 direction (user-friendliness for a non-expert): every
  setup step becomes a plain-language sentence. The concept matcher is
  local, deterministic and required to work with no auth and no network;
  an LLM tier only ever refines it. Intent words outrank domain words;
  confidence leans on coverage; unknown words surface as gaps that will
  drive library search. Library installs stay preview-first and
  SHA-pinned — an installed role or skill is executable instruction, and
  the user is not an expert. See SPEC.md M3.
- 2026-07-30 — Cost model (designed for pass-through billing, even though
  use is personal today). Estimating and measuring are two halves of one
  loop, not alternatives: the router already sorts work into three tiers
  with genuinely different cost behaviour (routed = certain zero, recipe
  hit = narrow band from observed history, cold job = bounded by maxTurns
  × model), so a quote is a lookup over history rather than a model, and
  it tightens as recipes accumulate. Decisions: quote a ceiling and
  enforce it, so the user is never billed above the quote; the app absorbs
  jobs that cost money and fail, which puts the incentive on failing fast;
  the ledger records observed cost and chargeable price as separate
  numbers from day one, because a ledger cannot be reconstructed
  retroactively; quotes are shown in money with the certainty stated.
  Observed cost comes from the SDK's total_cost_usd — no price table to
  maintain. Reselling model access has terms implications Brian should
  confirm with Anthropic before billing anyone.
- 2026-07-31 — Terrain is data, closing the phase-3 deferral. A theme used
  to be fifteen colours and nothing else while `drawScenery` drew a cave
  regardless, so Home Chores rendered stalactites and hanging vines in
  beige. Scenes are now data (`world/scene.ts` + `world/scenes/*`), and a
  theme names a place as well as a palette. The design decision worth
  keeping is what the format is **not**: not a drawing language. Composing
  seeded speckle, mineral veins and a jagged ceiling out of primitives ends
  in a small unauthorable programming language, so the vocabulary is
  parameterised *idioms* — ceiling, speckle, veins, tufts, repeat, band —
  plus three primitives. Coordinates are `"groundY-40"`, one regex, not an
  expression evaluator; colours are theme slot names, so a scene never
  hard-codes a palette. Each top-level op draws from its own seed, because
  a format where inserting an op repaints everything after it is one nobody
  can author in. The interpreter targets a `Surface`, so the same data
  paints the world, the level cards (previously a second hand-drawn cave
  that could disagree with the level it previewed) and a recorder in tests.
  The cave is transcribed op for op — the built-in art is kept, as phase 3
  decided; only its noise falls differently. chalkboard and marble point at
  the cave until someone writes them, which is now a data file rather than
  a rewrite. External terrain packs are unblocked but deliberately not
  built: no loader ships until there is a pack worth loading.
- 2026-07-31 — One-shot became a short leash (3 turns), measured. At one
  turn the tier could not work: a turn ends before the model sees any tool
  result, so anything that must read before it writes — every repo job — is
  impossible. Run live it failed on max_turns having written no files at
  all, and cost **more** than the full session it replaced ($0.17 vs
  $0.14), since it paid for the system prompt with no cache to read. At 3
  turns the same job produces a correct, promotable diff for ~$0.11 against
  ~$0.27–0.44 for the 8-turn run. A recipe means explore less, not work
  blind. Two bugs fell out and are fixed: promote refused to apply a failed
  job's patch while still stamping it "promoted" (silent no-op — the worst
  outcome), and a failed run was filed as tier `session`, polluting the
  history the quote reads. Still open: a short-leash run ends `failed`
  because the RESULT/LESSON/APPROACH write-up does not fit in 3 turns, so
  the diff is promotable but the card reads as a failure. **Resolved the
  same day**: a run that dies holding a diff is now `partial`, its own
  status, reviewable exactly like finished work — the output was good, only
  the label was wrong. Cancelling stays `failed` even with a diff, since you
  stopped it on purpose. Measured across eight runs the leash yields a
  usable diff roughly two times in three, for ~$0.11 against ~$0.44; the
  prompt trim (a recipe run is not asked to re-write the method it was just
  handed) is principled but its effect was within noise at this sample size.
  **Reliability fixed by measurement, not tuning** (2026-07-31): watching
  the tool calls live showed every repo run opening with `ls` or
  `Get-ChildItem` before it could do anything — one of three turns spent
  discovering a layout the server already knew. The clone's file listing now
  goes into the prompt, and the orientation call disappeared from every
  trace: 4/4 runs produced an identical diff, against 3/5 before. The lesson
  generalises — when a run is short of turns, look at what it spends them on
  before spending more of them. Recipe matching
  left strict deliberately (same-shape jobs score 0.33 against a 0.65 bar)
  — revisit with evidence, not intuition.
- 2026-07-31 — Cost ceiling, corrected by measurement. The mid-flight
  dollar check could never work: the session stream carries no running
  cost. Measured — the only `total_cost_usd` in a 35-message session
  arrives on the last one, and per-message usage is partial (52 output
  tokens reported against a true 568). So the check only ever fired after
  the money was spent, and its sole effect was to relabel a finished
  session as failed. Replaced with the budget that binds *before* the
  spending: the quote is divided by observed cost-per-turn to set
  `maxTurns`. It only ever tightens — a rich quote must not let a job run
  longer than its role allows — and with no history the role's budget
  stands. Priced per turn *granted*, not per turn the SDK reports: those
  are different quantities (a cap of 4 came back as 6), and pricing
  against the reported number left budgets ~1.5× loose *for capped runs*;
  measured later across real history the distortion runs both ways, since a
  run that finishes early reports fewer turns than it was granted, so the
  fallback was noise rather than a one-way bias (corrected 2026-07-31, and
  the fallback is now gone: only `turnsAllowed` rows price a turn). Note the
  user was
  never over-billed: `priceFor` already caps charges at the quote. What
  was unbounded was the app's absorbed cost.
- 2026-07-31 — The quote's feedback loop was open, found by running it end
  to end: quote a job, run it, compare. A job quoted at 30c — "about 15c,
  done this 4 times before", *high* confidence — cost **59c**, ran out of
  turns and filed `partial` holding a good diff. Billing held (`priceFor`
  charged zero, the app absorbed all of it), but re-running the estimator
  afterwards showed the quote for the identical next job had not moved a
  cent. `history()` read `done` rows only, and the runs that break a quote
  are exactly the ones that exhaust their turns and file failed or partial,
  so the average could not see its own worst cases: it saw 4 scribe runs at
  a mean of 15c while 5 runs had really cost money, at 24c — $0.59 invisible,
  and the same hole hid $0.60 of worker spend. Fixed by counting every run
  that spent money, in `history()` and in quoteFor's tier fallback alike.
  That nobody is billed for a failure is a *billing* decision and `priceFor`
  makes it; a quote bounds spending, and spent money is spent whatever the
  outcome. The scribe quote moved to "about 24c", ceiling 50c. Three things
  stay open **deliberately**, and all three are the same shape — a mechanism
  that is correct but currently inert. The turn budget still never binds:
  quote ÷ rate came to 17 turns against a role cap of 8, before and after, so
  the ceiling from `b3be508` does nothing wherever the cap is the smaller
  number. `DEFAULT_CEILING_USD` clamps the learned ceiling at 50c, so a
  repeat of that same job would still breach by ~19%. And the job class is
  the *matched* role, so wording that matched `mason` — a role nobody holds —
  quoted off the tier average instead, moving the same work from "about 15c,
  high confidence" to "up to 50c, first time". Cost per turn is not a
  property of a role either: this run burnt 7.4c/turn against a class rate of
  1.8c, driven by 280k cache-read tokens on a repo job, which the class key
  does not record. Across the whole history, 3 of 6 quoted runs breached.
  **The first of the three resolved the same day**, and the fix was the last
  sentence rather than the first: the clamp was never the problem. A ceiling
  binds exactly when the rate exceeds ceiling ÷ role cap — 50c ÷ 8 = 6.25c a
  turn — and the work really burnt 7.4c, so it *should* have bound and only
  failed to because the rate was pooled across repo and non-repo runs. So the
  ledger now records `hasRepo` and `costPerTurn` narrows to runs of the same
  shape. The separation is not marginal: per turn, repo runs cost 4.4× a
  scribe's non-repo runs and 10× a worker's. On the real ledger the measured
  job now budgets 6 turns for a predicted 44c under its 50c ceiling, where it
  took 8 and spent 59c; worker-with-repo correctly stays at 8, since 8 turns
  at its rate still fits. Rows written before the field are left unshaped
  rather than assumed — mixing them back in is the averaging that caused
  this — so a one-off `scripts/backfill-ledger-shape.mjs` reads the shape back
  off the job records still on disk, which is where repoPath always lived;
  without it the fix would have been correct and inert. The quote is
  deliberately *not* segmented the same way: it stays the promise to the user,
  and the budget is how the promise is kept.
  **The second resolved the same day too.** `DEFAULT_CEILING_USD` was one
  constant doing two jobs: what a quote says in ignorance, and the most a
  quote may ever say. Conflating them made the quote promise *less* than the
  history it was reading — it held evidence of a 59c run and promised 50c, so
  it broke a promise it had the evidence to keep. Split into
  `DEFAULT_CEILING_USD` (ignorance, still 50c) and `MAX_CEILING_USD` (runaways
  only, $2), with `AGENTLINGS_MAX_COST_USD` now an absolute cap rather than a
  default. Scribe's ceiling becomes 71c and that run is covered. The
  consequence is worth stating plainly rather than discovering later: an
  honest ceiling **un-binds** the turn budget, because the budget was only
  biting while the quote was artificially low — 8 turns at 7.5c is 60c, inside
  71c. That is not one fix undoing the other; they are alternative routes to
  the same guarantee. Make the promise true, or make the spending fit a
  smaller promise — both prevent a breach, only the second shortens the run.
  The budget stays live as the backstop and fires the moment a ceiling is
  genuinely tight: measured across caps, $0.40 gives 5 turns and $0.25 gives
  3, every one of them inside its quote.
  **The third was a mislabelling, not a pricing bug.** The class was
  `job.preferredRole`, the role the *matcher* named — but `nextUnassigned`
  deliberately lets any free agentling pick up work routed to a role nobody
  holds, and the session then runs as *their* role: their prompt, their tools,
  their turn cap. A mason job done by a worker was therefore filed as a mason
  job, building a history for work that never happened while robbing the role
  that really did it, and the rate lookup then found no mason history and fell
  back to the role cap. Latent rather than realised — 0 of 23 checkable rows
  were mislabelled, since every job so far happened to be taken by a matching
  agentling — so nothing needed backfilling. Now the ledger records the role
  that ran, the rate prices by the role about to run, and `runnerRole()` in
  work.ts predicts it for the quote. Measured on the phrasings that exposed
  it: "add tests for formatUsd" matches `mason`, which nobody holds, and
  quoted "up to 50c — first time doing this" off 0 samples; it now quotes
  "about 17c — done this 9 times before" off Pip's worker history, because Pip
  is who actually does it. The instability is reduced, not removed, and what
  remains is honest: the same sentence can still land on a scribe (28c) or a
  worker (17c), and those really are different costs.
- 2026-07-31 — Confirming the four fixes live, and the ceiling breached
  again. Job `d618e774`, matched to `mason` which nobody holds: the class fix
  is proven — the row reads `jobClass: worker`, the role that actually ran it
  (Pip), where the old code would have written `mason`. The learning loop is
  proven too: quoted 52c, cost 81c, and the *next* quote for the same sentence
  moved to 97c immediately, because a failed row is no longer invisible.
  But the quote was **breached 1.55×**, and the prediction that produced it was
  mine: I forecast 46c from a 3-sample rate of 5.7c a turn, and the run burnt
  10.1c a turn. So `hasRepo` is necessary and **not sufficient** — within repo
  jobs the per-turn cost still varies about twofold, driven by how much the
  job writes (391 lines, 11.8k output tokens, 288k cache read here), which is
  not knowable before it runs. The honest position: the turn budget can never
  bound cost more tightly than its rate estimate is accurate, and across the
  two live runs the ceiling held once (45c under 50c) and broke once (81c over
  52c). It is not established that it holds. What *is* established is that
  nobody is ever over-billed — `priceFor` capped the charge and this run, like
  every failure, was absorbed at zero. The 391-line diff also did not work
  (24 of 25 tests passing), the first of the three measurement runs to produce
  something unpromotable, so it was discarded. **The failing case was the
  test's fault, not the code's** — worth recording because it is the failure
  mode to expect from generated tests. It ran one prompt twice and expected
  the second run to update the recipe, but a first run with no repository and
  no web stores an *answer*, so the repeat is replayed by the router and no
  second session ever happens (verified: `decide()` returns `answer` without a
  repo and `oneshot` with one). The same file asserts that answer is stored,
  three cases earlier — it contradicted itself. `rememberRecipe` updates in
  place correctly and recipes.test.ts already covers it. The reachable version
  of that test needs a `repoPath`, which is the one shape where an exact repeat
  really does run again. Note also that three of the
  last four runs ended `partial` on max_turns: the role cap of 8 is now the
  binding constraint on whether work finishes, not the money.
- 2026-07-31 — The crew was not learning, and it is the same bug a third
  time. Asked whether a successful job is banked permanently, the honest
  answer came from the data: 36 jobs, **1** of them free, 8 recipes stored and
  **every one with `hits: 0`** — not one had ever been reused. Two causes. The
  match bar is 0.65 while real same-shape jobs score 0.33, which was left
  strict deliberately. The other was a defect: `RoutedExecutor` credited and
  remembered only after `fallback.run` *returned*, so a session that threw
  skipped the lot — and **all 13 recipe runs failed**, because three turns
  usually go on the work rather than the write-up. The tier built to be cheap
  was the one tier that could never teach anything. `SessionFailure` already
  carried the approach for precisely this ("so the caller can still bank the
  cost, the lesson and the diff"); this caller dropped it. Now both happen
  whether or not the run finished. One thing deliberately does **not**: the
  *answer* is still only ever taken from a run that returned, because an
  answer is replayed to the user word for word and a failed run's summary is
  its error message — banking one would serve "ran out of turns" as the answer
  for ever. Worth naming the pattern, since this is its third appearance after
  the quote history and the ledger's job class: **anything that learns only
  from clean successes goes blind exactly where the short-leash tier puts most
  of its runs.** Look for that shape before looking for anything else.
  Still open and now the interesting question: recipes make repeat work
  *cheaper*, never free, because notes still have to be read by a paid model.
  The only route to actually free is the crew turning a repeated job into a
  script the router can run in code — a fourth shortcut tier that does not
  exist yet.
- 2026-07-31 — Learning sweep: the write-up moves out of the session, the
  matcher gets two bars, and the fourth tier is counted before it is built.
  Framing first, because it decides everything else: none of this is
  reinforcement learning and calling it that leads to bad choices. No weights
  change; a stateless model re-reads notes every time. What can actually be
  built is a **compiler** — the agent *interprets* a task, a tool is that task
  *compiled*, and learning is moving work down the ladder from one to the
  other. That also fixes the criterion for calling the API: pay for judgement
  that has not been compiled yet, and nothing else. It sets the ceiling too —
  "add tests for module X" never compiles, because the assertions depend on the
  module; "generate the skeleton for <file>" does. Tools take the scaffolding,
  sessions keep the judgement.
  **The write-up moved out.** It used to compete with the work for turns, so it
  was cut first — a recipe run was explicitly told not to write LESSON.md or
  APPROACH.md — and the tier built to be cheap became the one tier that could
  never teach anything. Now no job is asked for them at all. A close-out pass
  runs afterwards on a cheap model with one turn, handed the run's own RESULT.md
  and the *names* of the files it changed, never the patch — the point is a
  write-up costing about a cent, and a diff is what makes a turn expensive. It
  runs after every job that left anything behind, including the ones that died,
  which are most of them. Its cost is recorded as `closeOutUsd` inside
  `costUsd`: counted in the total, kept out of the per-turn rate, because the
  write-up is a fixed errand rather than something the turn budget can buy more
  or less of. Its own failure is swallowed — a missing lesson costs the crew a
  note, and throwing would cost the user their work.
  **Two bars, not one.** Same-shape jobs scored 0.33 against a 0.65 bar, so the
  crew never recognised its own work. Fixed by stemming, by weighting rare
  words above common ones, and by splitting the threshold: a strong match still
  shortens the run to three turns, while a weak one (0.3) hands over the method
  and leaves the leash alone. The asymmetry is the whole argument — a wrong
  method given to a full-length session wastes a turn it can ignore, and the
  same wrong method with the leash cut wastes the entire run.
  **The fourth tier is counted, not built.** A recipe now tracks `successes`
  apart from `hits`, since a recipe used ten times and never once successful is
  a candidate for nothing. A job matching a recipe with three successes appends
  to `tool-candidates.jsonl` and *nothing else happens*. Promotion would cost
  about a session and save a fraction of one per reuse, so it pays back around
  the third to fifth use — and this machine has seen one repeat in 36 jobs. The
  counter answers whether there is anything to compile before a compiler gets
  written.
  Three of my own claims were wrong on the way and the corrections are the
  useful part. `KNOWLEDGE.md` is **not** fed whole and does not grow without
  bound — `readKnowledge` already capped it at the last twelve lines, so the
  defect was never cost, it was that twelve *recent* notes are not twelve
  *relevant* ones; sessions now get the top eight by relevance, through the
  same `relevantLines` the recall tier uses. Rarity weighting made matching
  **worse** at first: with one recipe on file every word it uses appears in
  every document, so the shared words — the entire signal — got weighed to
  nothing and a job stopped matching itself; it is off below five recipes. And
  the first stemmer turned "invoices" into "invoic" while leaving "invoice"
  whole, breaking the exact pair it existed to fix; stripping a single "s" and
  never "es" is worse linguistics and better matching. Recipe `terms` are now
  recomputed from the key on read rather than trusted from disk, so the next
  change to stemming strands nothing and that migration never has to be
  written.
  **Confirmed live, after the close-out failed twice for reasons worth
  keeping.** First it wrote its config and produced nothing, because the catch
  that stops a missing note from costing the user their work also hides why
  there is no note — a silent failure by design, and the diagnosis needed a
  probe that spawns the runner with the same laundered env the server uses.
  Run from a plain shell it 401s instead, which is a different bug and a
  waste of an hour if believed. Then, properly reproduced: at one turn it
  spent that turn calling `Read` on the file it had just been told about and
  died on max_turns having written nothing — the same orientation turn repo
  runs used to waste, and the same reason a one-shot cannot work at a single
  turn. Fixed by telling it not to go looking and giving it two turns for when
  it does anyway. End to end on a real job: `closeOutUsd` **2.1c** on the
  meter, LESSON.md and APPROACH.md written, a recipe stored with a method, and
  the agentling's own memory file one line longer. So the crew is measurably
  different after a job, which is the thing that was broken. Note the cost
  estimate was optimistic — "about a cent" measured 2.1–2.3c, about 4% of a
  50c repo job but nearer 17% of a cheap one, so the write-up is close to free
  on the work that matters and merely cheap on the work that does not.
- 2026-07-31 — The fourth tier, built on request rather than on evidence. The
  standing recommendation was to wait for the candidate counter to show repeat
  work, and it still shows one repeat in 36 jobs — so this is machinery for a
  demand that has not appeared yet, built deliberately with that known. What
  makes it worth having anyway is that the design question is interesting and
  the answer is reusable: **a tool is a job compiled**. A recipe saves the
  exploring and still pays a model to read it; a tool removes the model, which
  is the only way a cost per task actually falls. A tool is a directory with a
  manifest and two plain-node scripts, `run.mjs` and `verify.mjs` — no shell,
  no dependencies, no network, so it neither cares about the platform nor
  reaches anywhere it should not. The ledger gets a `tool` tier kept apart from
  `routed`, because routed work was never paid for while a tool is work that
  used to be: only the second says the crew is getting cheaper.
  Every design decision here is a refusal to trust the thing. It matches on the
  **strong** bar only and on shape as well as words, since a script written
  against a clone is wrong where there is no clone and the two jobs read
  identically. It must **prove its own output**, checked in a second process
  because a run that crashed cannot be trusted to report that it crashed; work
  it cannot prove is discarded and the job is paid for properly. Two failures
  in a row retire it, and a hang is killed at a timeout — a compiled tool that
  hangs has stopped being cheaper than the session it replaced. The promotion
  brief insists on the check harder than on the script, because without one the
  tier is only a faster way to be wrong.
  Promotion is a **request**, never automatic: it spends money, and a promotion
  nobody asked for is a charge nobody quoted. It refuses a recipe that has not
  landed three times. The manifest is written before the compiling session
  runs, so a half-written tool exists for a while — `usableTools` filters it out
  rather than letting it win a job away from the recipe hint that would
  otherwise have helped.
  One process note worth keeping: reverting a mutation with `git checkout <file>`
  destroyed an hour of uncommitted work in that file, because the mutation
  trick is only safe on a file that is already committed. Mutation-test after
  committing, not before.
  **Run end to end with a real repo tool, and it found two design faults that
  no unit test could.** First, the promotion brief told the session to write
  into `.agentlings`, which every session is simultaneously forbidden to do —
  the job rules say work only inside the sandbox. The fix is the better shape
  anyway: a generated tool is executable instruction, which is why library
  installs are preview-first, so the compiling session writes `run.mjs` and
  `verify.mjs` into its own sandbox like any other output and they are copied
  into the tool directory only on promote. Second, and only visible by looking
  at the working tree afterwards: the compiling session sensibly ran its own
  script to check it worked, which left the output file inside its clone, and
  promoting the compile carried that stray file into the real repository. A
  compiling run's deliverable is the tool, never the clone it tried the tool
  out in, so promote no longer applies its patch. Both faults were invisible
  to 444 passing tests and obvious within one live run.
  The measurement: compiling cost **34c** and 7 turns; the tool then did the
  same job in **1.06 seconds for nothing**, against ~110s and ~34c for the
  session it replaced, and the ledger shows it under its own `tool` tier. The
  generated `verify.mjs` is the part worth reading — it recomputes the answer
  from the file system independently and diffs it both ways, checking sorting,
  duplicates and malformed lines, rather than the file-exists check the brief
  was written to forbid.
  **The fall-through, tested live by injecting a fault, found two more.** The
  bug injected into the installed `run.mjs` was that it stopped recursing, so
  its output was plausible and quietly incomplete — one entry where there were
  three — which `verify.mjs` caught exactly as designed. The fall-through then
  **crashed the job outright**: `runTool` clones the repository, and the
  fallback session cloned into the same path and died on `destination path
  already exists`. Discarding a tool's *result* was never enough, because the
  tool's files are the work; the sandbox is emptied now. Second, the job had
  been quoted **free** on the strength of that tool and then cost 28c. A
  promise of free arriving as a bill is precisely what the quote exists to
  prevent, so a run that falls back from a tool is absorbed: `toolFellBack`
  reaches the ledger as `priceUsd: 0`. Proven live afterwards — job done, cost
  28c, **charged nothing**, the tool struck twice and retired itself with
  `failed 2 runs in a row`, and the same sentence then quoted "up to 22c" as an
  ordinary session instead of "free". Both faults were invisible to 444 passing
  tests and to the mutation test of the very branch they were in, because both
  live in what the *next* step sees rather than in the branch's own logic.
- 2026-07-31 — The turn caps, set by asking what actually gates the loop.
  `DEFAULT_MAX_TURNS` 8 → **10**, `RECIPE_TURNS` 3 → **5**. The reason is not
  that runs felt cramped; it is that **`successes` only counts runs that
  finish, and a tool is promoted on three of them**. A leash a run always
  breaks therefore does not merely slow the loop down, it severs its last
  stage: a recipe can be used forever and never become compilable. All
  thirteen recipe runs on record ran out at 3, so the fourth tier was
  unreachable by the ordinary path — the end-to-end test only worked because
  the successes were seeded by hand, which was disclosed at the time but
  mattered more than it looked. Cold repo runs that finished used 4 and 7
  turns *with no method handed to them*, so 5 still explores less while being
  able to land. For the default, moving the write-up off the session bought
  back the turns it used to cost — measured, 8 of 11 runs ran out before the
  close-out and 0 of 3 after — and the one substantial repo job since used 7
  of 8. A wasted turn costs about 7c; a capped run costs a `partial` that
  contributes nothing to promotion. Cheap to be generous, expensive to be
  tight. Both remain ceilings: the quote's turn budget still tightens below
  them when the money is short.
  One measurement correction fell out. A cut-off run reports exactly
  `turnsAllowed + 1` — 9/8, 7/6, 4/3 eleven times — so the reported `turns` on
  a cut-off run is a *marker* that it ran out, carrying no information about
  how many turns it wanted. The log's earlier "a cap of 4 came back as 6" is
  not what the data shows now. The conclusion it supported is unchanged and
  in fact stronger: price a turn by `turnsAllowed`, never by the reported
  count. Confidence is asymmetric and worth recording — 13/13 is not
  ambiguous, whereas the default rests on n=2 repo runs since the close-out,
  which by this project's own small-n rule is an estimate rather than a
  finding.
  **Raising the leash was not enough, and checking before spending caught it.**
  The oneshot tier quotes from its own history; that history was the thirteen
  runs that died at three turns costing ~11c, so it quoted 22c, which funds
  three turns — the leash that was failing. `RECIPE_TURNS = 5` was inert on
  arrival. This is the same bug a third time, one level up: a mechanism reading
  a population its own brokenness produced, and it cannot escape by itself. Fix
  is a rule that ought to have been there from the start: **a quote may never
  come in under the turns it has already decided to grant**, since that is
  quoting for work it will not permit. `quoteFor` takes `floorUsd` and
  index.ts computes it exactly as the executor will — leash × the rate for that
  role in that shape. The absolute cap still wins over the floor, because a
  leash nobody can afford should shorten rather than overturn the ceiling.
  Note `scribe/session` cleared its own leash by **$0.004**: not strangled
  today, one rate-drift from it.
  Then measured live, and it lands: `done` at **5 of 5 turns** for 13c against
  a 35c quote — the first `oneshot` run ever to finish, against thirteen that
  did not, and the first `successes: 1` any recipe has banked. Two more and it
  is promotable to a tool without anybody seeding it, which is the compilation
  path working end to end for the first time. Worth recording that it used
  *every* turn of the five: it landed with zero headroom, so 5 is the floor
  rather than a comfortable choice, and at 3 it would certainly have died like
  the others.
- 2026-07-31 — The promotion gate was selecting for the wrong work, which is
  the same bug a **fifth** time and the worst-placed instance of it.
  `successes` decides whether a job is ever compiled into a tool, and it
  counted only runs that exited cleanly. Measured on a real mechanical repo
  job (write EXPORTS.md, 123 exported functions): three runs, **two of which
  wrote a correct 129-line file**, scored zero. The consequence is an
  inversion, not merely a delay. A big mechanical job is exactly what a script
  is for and exactly what cannot finish on a five-turn leash, while a short
  note explaining what a favicon is lands three times easily and *is*
  promotable — despite being prose no script can write. So the gate promoted
  what a tool cannot do and excluded what it could. `landed` now means the run
  **delivered**, tested the way `partial` already is: a diff on disk. One
  notion of a run that did the work, used in both places. Proven live
  immediately: a `partial` run credited a success and took the recipe to
  promotable, which under the old rule was unreachable for that job forever.
  Two things fell out of the same run. The close-out writes two files and then
  has to say so, a third turn it does not have — so **running out is its
  ordinary ending, with both files already on disk** — and its output was
  being thrown away on the exit code, which is why that recipe did not exist
  and had to be rebuilt from the APPROACH.md the run really wrote. Fixed by
  keeping what is on disk and taking the cost off the failure; `closeOutUsd`
  of 4.6c and 4.8c now appear where before the notes *and* the money vanished.
  And the cut-off heuristic used the day before is wrong: reported `turns` can
  exceed `turnsAllowed` on a run that **succeeded** (12 of 10, twice), so it
  agreed with the real outcome on only 29 of 31 rows and the earlier "8 of 11
  ran out" was one too many. The claim that survives unqualified is the one
  about shape: every repo job at the old caps failed, and repo jobs after the
  close-out finish. Price by `turnsAllowed`; never read anything into the
  reported count.
  Cost of learning this: **$2.38 across five runs**, of which $0.71 was
  chargeable and $1.67 absorbed — the billing rules held throughout.
- 2026-07-31 — The first tool compiled without seeding was **bad**, and that is
  the most reassuring result of the day. Promoting the EXPORTS recipe produced
  406 lines of careful work — `run.mjs` refuses the export shapes it cannot
  parse rather than omitting them silently, which is the router's own
  never-guess rule applied by generated code to itself — and yet the two halves
  disagreed: `verify.mjs` rejects a multi-line `export async function` that
  `run.mjs` correctly lists, one line in 124. So the tool produced the *right*
  answer and its own checker refused it. Every guard fired in order: output
  discarded, job done properly by a session, `toolFellBack` → **charged zero**,
  one strike recorded. The failure mode is worth naming precisely, because it
  is not the one the design was braced for: a false negative costs money and
  not trust, which is the direction the tier was built to fail in.
  Two gaps it exposed. The compile session was **unquoted** — the only job in
  the app without a ceiling, unbounded because nobody had thought to bound it
  rather than by decision, and it spent $1.26 and still ran out of turns.
  Promotion now quotes as a plain session on the recipe's role, directly rather
  than through the router, since the compile sets `noRouter`. And there is no
  way to retire a tool short of letting it fail twice: this one is provably
  broken and self-retiring would have cost another absorbed session, so it was
  retired by hand. A `POST .../tools/:name/retire` is the obvious missing verb.
  A judgement worth recording for next time: a compile is worth more turns than
  an ordinary job. It has to write two programs that agree with each other, and
  the halves disagreeing is exactly what running out of turns produces.
  **Recompiled, and the second attempt is good.** The retire verb plus a fresh
  name (`write-export-repo-root-2`, the first left intact) made a second try
  possible; what made it *succeed* was telling the compiling session how the
  first failed. The promote response already reported the retired reason to the
  caller, but nothing reached the session doing the work — so a second attempt
  was an identical first try at the same price. Handed the fault and the general
  form of it (the two halves disagreeing about the same input), the new
  `verify.mjs` imports the shared definition from `run.mjs` so they cannot
  disagree, *and* keeps an independent crude count so importing does not quietly
  turn the check into a rubber stamp. That second half is the part worth
  admiring: it answers the obvious objection to its own fix. It lists
  `web.ts :: fetchPage` — the entry that killed attempt one — and both halves
  exit 0. Run live: `tier: tool`, `costUsd: 0`, runs 1, failures 0.
  The compile still ran out of turns at 10 and cost 94c, inside its $1.52
  quote and charged nothing. So the turn shortage is real and unfixed; what
  changed is that the work it *did* finish was better aimed. Worth noting the
  quote floor did its job here — it guaranteed the compile all ten turns
  rather than strangling it, which is exactly the failure it was written for.
- 2026-07-31 — A compile gets its own turn cap, and the number came from the
  money rather than from the work. Both compiles on record broke a cap of 10 —
  the role's everyday budget, borrowed by default rather than chosen. A compile
  is not an ordinary job: it writes two programs that must agree with each
  other, and the halves disagreeing is exactly what running out of turns
  produces, which is how attempt one shipped a `verify.mjs` that rejected its
  own correct output. The cap belongs to the **job**, not the role — a compile
  is handed to whichever role owns the recipe, and none of them should raise
  their daily budget for one errand — so `maxTurns` is now a job field and wins
  over the role's, while the recipe leash still wins over both (a job the crew
  has done before is one it has done before, whatever it claims to need).
  The number went 16 → 15 → **10**, and only the last step came from running
  the thing. The ledger cannot say how many turns a compile wants: a cut-off
  run reports `turnsAllowed + 1` whatever it wanted, so the reported count is a
  marker that it ran out and nothing more. So 15 was set from the side that
  *is* knowable — what the quote can fund, since a cap the money cannot honour
  is handed straight back by `turnsForBudget` and arrives inert, exactly how
  `RECIPE_TURNS = 5` landed. (I proposed 16; the test written to prove it
  refuted it, at the dearest observed rate `MAX_CEILING_USD` funds 15. Cheap,
  and before any money moved.) `compileQuote`'s floor moved to the same
  constant, since a quote funding fewer turns than it grants is the bug
  `e2a53c8` already fixed once.
  **Then it was measured, and 15 was wrong.** Attempt 3 at a cap of 15 ran out
  *as well* — 16 reported of 15 — and cost **$1.32** against attempt 2's
  **$0.94** at a cap of 10: 40% more money for the same outcome, and comparing
  the two generated `verify.mjs` files afterwards, attempt 2's was if anything
  the more thorough of the two. The tool attempt 3 produced was good (125
  entries, both halves exit 0, independently cross-checked, and it lists
  `web.ts :: fetchPage` — the entry that killed attempt 1), so nothing was
  wasted; it simply was not *better*. What fixed the compile was `4f7a561`,
  telling it how the last one failed. The cap was never the binding constraint.
  So the error worth naming is the inference, not the number: **"ran out of
  turns" was read as "needed more turns"**. Running out is a compile's ordinary
  ending, precisely as it is the close-out's — it writes both programs and dies
  reporting that it did. The cap is back to 10, still stated rather than
  inherited so a role raising its own `maxTurns:` cannot silently change what a
  compile gets.
  The quote held throughout: quoted $1.5168 (predicted $1.52 before spending),
  spent $1.32, **charged $0**. That is the third hold against two breaches.
  And the mislabel this exposed is the **sixth** instance of the project's
  recurring bug, in the place it was hardest to see: `queue.fail` decided
  `partial` from a diff on disk, but a compile's deliverable is never a diff —
  its output is the two scripts and promote deliberately does not apply its
  patch — so *every* compile filed `failed`, including one holding two working
  programs. `deliveredTool()` in tools.ts is now the single notion of a compile
  having delivered, used by `installTool` (which already refused half a tool)
  and by the queue. Half a tool is still a failure.
  Still open: the rate all of this is priced off is `scribe/session/hasRepo` at
  8.2c, which **pools compiles with ordinary repo sessions** and understates a
  compile by about a third — the same shape as the `hasRepo` split, a
  population hiding its expensive cases. Worth doing only when a compile's cost
  needs to be predicted, which at a cap of 10 it currently does not.
- 2026-07-31 — The one-shot quote could never find its own history, found by
  noticing a recipe with three successes quoting "first time doing this". Two
  readers wanted different things from one field and only one of them was ever
  written: the ledger always records `jobClass: agentling.role` (the runner
  fix), while the quote asks for `decision.recipeKey` on the oneshot tier. They
  cannot match. Measured across all 20 one-shot rows, **not one** matched, so
  every one-shot quote fell through to the tier average — permanently, on the
  twentieth run as on the first — and a worker one-shot was quoted 56c against
  its own 22c history. Nobody was over-billed (`priceFor` still caps), but the
  quote could not *tighten*, which is the entire promise of pricing from a
  ledger rather than a model.
  The fix is to stop making one field answer two questions. `jobClass` stays
  the role that ran, because what a **turn** costs is set by the role's prompt,
  tools and cap; `recipeKey` is added, because a **quote** asks "have we done
  this job before" and a role cannot answer that. `quoteClass()` chooses in one
  place — recipe when there is one, else role — and `costPerTurn` is untouched.
  Only a one-shot is stamped: marking a full session with a recipe would take
  that row out of its role's history, which is what prices a session.
  Backfilled without guessing, which mattered — a recipe key *is*
  `normalise(prompt)`, so a row is stamped only when the prompt on its own job
  record normalises to a key that exists today. That is an identification, not
  a similarity match, and it covered **20 of 20**; anything ambiguous would
  have been left unshaped, since guessing is the mislabelling this change
  exists to undo. Without the backfill the fix would have been correct and
  inert, the same trap as the `hasRepo` split.
  Measured after: the favicon recipe moved from "Up to 56c — first time doing
  this" to "About 14c — done this 3 times before", high certainty; tool and
  session quotes unchanged. The ceiling landed at 42c rather than the 27c its
  history implies, because the **quote floor** binds — 5 leash turns at the
  scribe repo rate is ~41c, and a quote may not come in under the turns it has
  decided to grant.
  **That floor was then found to be priced on the wrong tier, and fixed.** It
  converted the leash at `costPerTurn(..., 'session', ...)` — the session rate
  — for a run that was never going to be a session. Measured, a one-shot turn
  costs 60–70% of a session turn for the same role and shape (scribe with a
  repo, 5.7c against 8.3c; worker, 3.6c against 5.9c), because a short leash
  explores less per turn. Since the floor is a *lower* bound on the quote, the
  error ran one way only: the user was quoted more than the work costs. The
  same hard-coded `'session'` sat in the executor's `turnsForBudget` call, so
  fixing only the quote would have left the two disagreeing about how many
  turns the same money buys; `rateFor()` is now the one place that decides, and
  both call it. A one-shot with no history of its own falls back to the session
  rate rather than to nothing — overshooting is the safe direction, and
  dropping the floor would restore the bug it was written for. That branch is
  live rather than theoretical: there is no one-shot history at all for
  non-repo work. Favicon quote 42c → **29c**, predicted to the cent before
  measuring; tool and session quotes unchanged.
- 2026-07-31 — The unquoted way in, found by tripping over it. `POST
  /api/levels/:lid/jobs` queued work with `quotedUsd` left undefined, so
  `turnsForBudget` never bound and the run silently fell back to the role's
  cap. Nothing in the web client used it — but SPEC documents it, and an
  unquoted route into a system whose whole cost story is "the quote binds
  before the money moves" is a hole in the story rather than a shortcut. It now
  quotes exactly as `/work` does, and settles the **role** while it is there:
  quoting on one role while another runs the session is the mislabelling this
  log has already recorded twice. `quoteFor_` takes `repoPath` explicitly
  instead of reading it off the level, since the shape decides both the route
  and the rate.
  What it deliberately does **not** do is inherit the level's repository. That
  was in the first draft and taken back out: `/work` inherits, this route never
  has, and quietly handing every caller a clone is a different change wearing
  this one's clothes. The quote is priced on whatever the job will really run
  with, which is the only property that had to hold.
  Verified live on both shapes, cancelled before either spent anything: with a
  repository, 27.8c — to the cent what `/work/plan` says for the same sentence,
  which is the coherence that was missing. Without one, `quotedUsd` is
  undefined because that prompt routes to `answer` and is *free* — not
  unquoted. Those two are indistinguishable in the field and it is worth
  knowing why they are safe to conflate: `quoteFor` returns a zero ceiling only
  for `routed` and `tool`, and every paying tier passes through a bound with a
  1c floor. So a job that costs money now always carries a ceiling.
- 2026-07-31 — The socket was describing a world that had not changed, found
  by scoping a leak that turned out not to exist. `seenStatus` was flagged as
  unbounded; it is not — every key comes from `w.jobs`, and nothing ever
  removes a job from the queue, so the map is bounded by data the client
  already holds. Measuring instead of fixing found the real cost: `TICK_MS` is
  100, the state payload was **41.8KB of which jobs were 98%**, and it went out
  **ten times a second per viewer** — ~386 KB/s to say nothing had happened.
  The measurement also killed the obvious fix. Of 54 jobs, **0 were active and
  43 were awaiting review**, so "active plus the last N resolved" would have
  hidden work the user still had to act on. **Recency is the wrong axis**, and
  that is what intuition would have built.
  Two changes instead. First, do not describe a world nobody is looking at: the
  tick built and serialised every level's state regardless of viewers, and
  `sendToLevel` stringified *before* checking for subscribers, so an empty
  level paid the full 42KB. The sim still steps unwatched — jobs run whether or
  not anyone is watching — only the describing is skipped. Second, send the job
  list only when it changes. `JobQueue` counts a revision in `persist()`, which
  every mutator already funnels through, so the counter is trustworthy exactly
  as long as that stays true and there are tests pinning it. A frame carries
  `jobs` only when the revision moved; the client keeps the last list and still
  hands consumers a whole `WorldState`, so no UI knows the difference.
  Measured over 12s on a live socket: 110 movement frames of **999 bytes** and
  one 41.9KB list, **12.4 KB/s against 386 KB/s — a 96.8% cut**, approaching
  97.6% over a longer session. The one list per viewing session is by design: a
  level nobody watches forgets what it sent, so the next viewer re-syncs.
  Deliberately **not** done: trimming fields from the live job (prompt is 34%,
  meter 15%, repoPath 11%, none of which the canvas reads). It would be ~70%
  on its own, but `ReviewModal` reads `title`, `status`, `error`, `summary` and
  `changes` straight off the state object, so it needs a new endpoint and a
  loading state in the one flow least worth breaking — and after the revision
  change it would be optimising a message that rarely sends.
- 2026-07-31 — The compile rate split, measured and then **not** done. The
  standing note said the quote understated a compile by about a third, so
  splitting the rate was the last item with real evidence behind it. Measuring
  first took the evidence away: compiles run at **9.0c a turn against the 8.3c
  pooled rate** the quote uses — **8%, not a third**. The old figure came from
  comparing the single worst compile (12.6c) against the pool instead of
  comparing the compile population against it, which is the error this log has
  a rule against.
  What the split would actually have done: raised every compile quote from
  **$1.58 to $2.00** — `MAX_CEILING_USD`, so straight to the runaway cap — off
  **n=3**, while changing no turn budget at all, since `COMPILE_TURNS` is the
  binding cap in both cases. And it would have been guarding against a breach
  that has never occurred: both quoted compiles held ($0.94 and $1.32 against
  $1.52), and the one that looks worst ($1.26) was the *unquoted* one that
  `ab6c354` already fixed.
  So the resolution is to **record the field and not read it**. That is not
  fence-sitting, it is the asymmetry: a rate can be computed from a ledger
  whenever there is finally enough of it, and a ledger cannot be given a field
  it never wrote — the same reason cost and price were separate numbers from
  the first entry. The marker is an explicit job flag rather than a title
  sniffed at read time, and the backfill stamps a row only when its own job
  record still carries the exact title the promote route writes (4 of 4; 12
  older rows from deleted levels left alone). Verified after: the session quote
  is still $1.58 and the one-shot still "About 14c — done this 4 times before",
  so nothing became less accurate in exchange for the option.
- 2026-07-31 — A UI/UX pass, four changes, and the arithmetic decided more of
  it than taste did.
  **Agentlings are now their own colour.** They were drawn identically and only
  the hover label carried the tint, so telling five apart meant hovering each in
  turn. The gown is the identity channel — the largest flat area, so it still
  reads in a 27px portrait, and leaving hair and skin alone keeps the crew
  looking like one crew. One definition in `tint.ts` serves both art paths: the
  built-in frames swap palette entries by key, the baked sheet swaps pixels by
  value. That symmetry is the point — a sprite tinted one way in the world and
  another in the rail is worse than no tint, since the whole idea is
  recognising someone at a glance. Matching on the two *exact* source colours
  is what makes it safe on any sheet: ours is generated from the same frame
  definitions, and an outside pack that doesn't use them is left alone rather
  than having its highlights eaten. Measured live: 390 gown pixels swapped in
  the real PNG, 5 distinct gowns, every one on DB32. One casualty worth
  recording — **Pip's mint green snaps to steel grey.** The three original HQ
  crew hold colours that predate the ramp, and mint sits almost exactly between
  `limeLight` and `steel` under the perceptual weighting (14383 against 14244);
  grey wins by 1%. Their name label stays mint while the gown goes grey. New
  hires are unaffected — `COLOR_POOL` is already DB32 — so the fix is one line
  in the legacy seed, deliberately not taken because it is a migration on a live
  roster.
  **The hover outline is a flat copy, not a tint.** Pixi's tint multiplies, so
  offset copies of the ordinary frames keep their dark pixels dark and read as a
  smeared ghost; `flatten` throws the detail away and eight offsets then read as
  a one-pixel ring. Verified on the real sheet: 10 colours to 1, transparency
  intact. Four offsets was tried and rejected — it leaves gaps on every diagonal
  of this art. The colour needed its own theme slot: `accentLight` is drawn from
  the same family as the rock in every theme, so cave's outline was DB.tan
  against DB.tan walls and half vanished into the scenery it existed to lift a
  sprite off. Signposts get a *real* silhouette because they are drawn from
  primitives and can simply be drawn again offset; the door gets a ring, because
  it is scenery painted from the level's own scene data and there is no shape
  there to take. That asymmetry is honest and the shared colour is what makes it
  read as one idea. Geometry lives in `hover.ts` because each box is used twice
  — to draw and to catch the pointer — and the two drifting apart gives you a
  prop that lights up somewhere other than where it is clickable.
  **The terminal split was decided by a measurement, not a preference.** The
  literal left/right split asked for costs the world its pixel-exactness:
  1400 − 24 padding − 340 rail − 16 gap leaves 1020, and `fitCanvas` needs ≥1000
  for a whole-number scale, so widening the rail to 460 drops the world to 900
  and the canvas gets a non-integer CSS width. So the rail is stacked by default
  and goes side by side only at ≥1560, where 1560 − 24 − 480 − 16 leaves 1040.
  Confirmed in the browser at both widths: canvas CSS width exactly 1000px.
  Every activity line is read off state the app already holds — the sim's state,
  the job title, the last progress line. Nothing is invented, and the one
  example that could not be honoured ("waiting until 5pm to report out") was
  refused rather than faked, because there is no scheduler and a made-up status
  cannot be acted on.
  **The backoffice exists because the terminal is a feed, not an archive.** Its
  events are numbered per server run and held in memory, so everything it ever
  said is gone after a restart; the jobs persist, which makes them the only
  durable account of what the crew has done. No new endpoint — the socket
  already sends the whole queue whenever it changes, so the history is on the
  client before the panel opens. Two things fell out of building it. The output
  route read *every* file as UTF-8 and inlined it, so a job that produced a real
  document produced mojibake; binary is now sniffed for a NUL byte the way git
  does, rather than guessed from an extension list, because the interesting
  files are the ones nobody anticipated. Proven end to end with a real PNG:
  listed as binary, downloaded byte-identical, traversal refused. And the
  panel's total read "$12.22 spent" against the ledger's $13.81 — both correct,
  since the panel can only see jobs still in the queue file — but **two numbers
  labelled "spent" is a defect regardless of how well it can be explained.** It
  now says "$12.22 on these" and names the gap: "4 stopped mid-run, cost
  unknown", which matches the ledger's `unmeasured` exactly. Folding those in as
  zero is how a total comes to understate itself, which this log records twice
  already.
  **Clarification is pre-flight, and deliberately not mid-run.** A session is a
  one-shot child process by design, so pausing one to ask a question means a
  `waiting` status, a runner holding stdin, and a timeout policy for a user who
  went to bed — against the grain of a cost model whose whole premise is
  bounding a run *before* it starts. Asking first is also the only point where a
  question can reduce spend rather than add to it. Three rules keep it from
  becoming the form the one-box intake was built not to be: never on free work,
  never more than three, never required. The free gate is proven live — a
  sentence containing "improve everything" asks nothing when it lands on the
  `tool` tier. The answers are kept **out of `job.prompt`**, which is the
  non-obvious part: a recipe is keyed on `normalise(prompt)` and the one-shot
  quote looks up `recipeKey`, so folding them in would give a clarified job a
  different key from the same job asked plainly and the crew would stop
  recognising work it had already done. The server also recomputes the questions
  from the sentence rather than trusting what the client sends back — possible
  only because the rules are deterministic, and it means the only instructions
  that can reach a session are ones the user was shown.
  **The measurement is deferred on purpose.** Whether clarifying actually saves
  turns needs 4+ paired runs at ~40c each, and this log's own small-n rule says
  n=2 is an estimate rather than a finding, so buying a weak answer for $1.60 is
  the error this project keeps catching. Instead the job record now carries
  `clarifications` and the ledger already carries turns and cost, so the
  comparison is computable from ordinary traffic whenever there is enough of
  both — the same resolution as the compile flag, and for the same asymmetry: a
  rate can be computed from a ledger later, and a ledger cannot be given a field
  it never wrote.
  **Pip's colour, fixed the next day, and the interesting part is where the bug
  actually was.** A crew tint used to be a label colour and nothing else, so
  being off the ramp cost nothing; painting the sprite in it made that a defect
  retroactively. Checking before changing anything showed the seeding path was
  already correct — a scratch level created today hands Pip `#99e550` and Dot
  `#639bff`, both exact DB32 — so this was never an ongoing bug, only two rows
  of historical data plus a stale constant. `LEGACY` now takes its tints from
  `COLOR_POOL` rather than listing its own, which leaves **one** list of crew
  colours in the file and makes the bug unrepresentable instead of merely
  fixed. The seed change alone would have been correct and **inert** — hq
  migrated long ago and the value is on disk — the same trap as the `hasRepo`
  and `recipeKey` backfills, so `scripts/backfill-roster-palette.mjs` rewrites a
  row only when it still holds the exact colour the old seed wrote. That is an
  identification rather than a guess: a tint changed on purpose is left alone
  and a second run does nothing. Two rows moved (hq and home-chores both have a
  Pip), verified after: label and gown both `#99e550`. Moss and Bea are
  deliberately **not** moved — they snap within their own hue, so rewriting
  them would change how they look in order to fix nothing; `--all` does it if
  that judgement ever changes. A test now asserts every tint the app can hand
  out is on the palette, for a fresh hire at all sixteen positions and for the
  legacy migration, which is the guard that would have caught this.
  **Test drive: "Produce a PDF", and it found three things no test could.**
  Run as the vaguest brief the box can take, on a scratch level with no
  repository. First, the clarifier was **silent on it** — `shape` only fired on
  *gathering* verbs (find, research, compare), so a job whose entire content
  was unspecified got no question at all while a paying session went off to
  guess. The rules knew about fetching and not about *making*, which is the
  case where the brief matters most; `PRODUCING` and an `about` question fixed
  it, and "Produce a PDF" now asks "What should go in it?" before anything else.
  Second, **the agentling can write a PDF** — the capability was assumed absent
  because the sandbox has no libraries, and it simply wrote a 4KB dependency-free
  Node script and ran it. Valid `%PDF-1.4`, correct objects and xref, the right
  date, and a paragraph explaining it was assembled by hand. Worth remembering
  before scoping out a capability: no library is not the same as no route.
  Third, and the reason a live run beats a fixture: **the PDF was not detected
  as binary.** It has uncompressed streams, so no NUL byte anywhere — and the
  NUL sniff is git's test, which answers "is this source code" rather than the
  question actually being decided, "would inlining this damage it". Its
  Latin-1 `%âãÏÓ` marker is not valid UTF-8, so it was inlined as mojibake:
  exactly the defect the binary path was written to prevent, surviving because
  the unit fixture had a NUL in it by construction and so proved the heuristic
  instead of the requirement. `isBinary` now asks whether the bytes round-trip
  through UTF-8, with slack only where the sniff window truncated the file.
  The download route was never affected — it reads raw bytes, and the hash
  matched disk exactly throughout.
  Costs and labels behaved: $0.364 against a $1.58 quote, `priceUsd` 0, the
  failure absorbed. And the backoffice rescued a job the terminal had written
  off — the PDF was reachable and downloadable from it while the feed showed
  only a failure, which is the strongest argument yet for having built it.
  **Which exposed the fourth thing, and it is this log's recurring bug for the
  seventh time.** The run delivered a PDF and was filed `failed`, because
  `partial` was defined as a diff on disk — a *repo-shaped* notion of delivery.
  A job with no repository can never have a diff, so no such job could ever be
  `partial` however much it produced: not reviewable, not creditable to a
  recipe, filed under "closed" in the very panel that was showing its output.
  The same shape as the promotion gate, which was fixed for exactly this reason
  and then re-introduced one level down. Delivery now means **the run left
  something for the user**, of which a diff is one shape. Two exceptions kept,
  both already decided: a compile is judged only on `deliveredTool`, since half
  a tool is not a delivery and its working files must not be mistaken for
  output; and cancelling stays `failed` whatever is on disk, because you
  stopped it on purpose. That second guard belongs in `fail()` rather than in
  the caller — a killed session rejects through that path, not through
  `cancel()` — and it was latent before this: a cancelled run holding a diff
  would already have been mislabelled `partial`. Job 2ff16bf2 keeps its
  historical `failed`; statuses are not recomputed retroactively.
  **Four runs of one sentence, and the recurring bug three more times.** Run 2,
  with the close-out fixed, came back `done`: PDF, generator, an unprompted
  *verifier*, notes, and a recipe banked under the key `produce a pdf` — clean,
  because the clarification answers are kept out of `job.prompt`. Run 3 then
  hit the recipe and was answered **free, in zero turns, with a lie**: the
  banked answer said "hello-world.pdf (1,380 bytes) is a valid one-page PDF",
  and the sandbox held that sentence and no PDF. An answer is replayed word for
  word, which is right when the words *were* the deliverable and false when
  they merely described one — so a run that **made** something now banks only
  its method, and a repeat re-runs cheaply and truthfully instead of being
  answered freely and falsely. The stored answers had to be dropped too or the
  fix was inert; `scripts/backfill-recipe-answers.ts` identifies them off job
  records still on disk (3 of 7, including one on `home-chores`, which has no
  repository and so was genuinely live). Four are left alone: `say hi` is a
  real answer, and three `write a short note in X.md` recipes lost their
  sandboxes, so they cannot be identified rather than guessed — inert while hq
  has a repository, since the answer tier never fires there.
  Run 4 proved both halves at once: tier `oneshot` rather than `routed`, quote
  56c, spent 47c, **charged nothing**, and filed **`partial`** — the first live
  sighting of that fix, on a run that produced a valid PDF and ran out of turns
  saying so. And it exposed the ninth instance: `creditRecipe` still tested
  delivery as `result || a patch on disk`, directly under a comment claiming it
  used "the same test `partial` uses". It had drifted apart from `partial`
  within hours of that being widened, so a non-repo run credited **zero
  successes** however much it made — and a recipe that can never bank a success
  can never be compiled into a tool, which is the promotion-gate inversion
  again, one level down. The lesson is not "check this call site": it is that
  **"it delivered" keeps being re-derived locally instead of being one
  function**, and every local copy silently assumes a repository. There are now
  three shared notions in `outputs.ts` — `deliveredFiles`, `producedArtefacts`,
  `outputNames` — and the next thing that asks the question should call one.
  **Run 5 caught the over-correction, an hour old.** The recipe hit again
  (`hits` 3) and banked its first ever `success` — and produced **no PDF**. It
  wrote a working generator, ran out of turns before executing it, and the
  files-on-disk test counted that as the job being done. Three of those would
  compile a tool from a method that never finishes, and the fall-through would
  absorb the cost each time it failed. So `successes` is narrowed back to a
  clean finish or a diff, while `partial` stays wide — and the two are **not**
  the same question however alike they read: `partial` asks whether there is
  something worth the user's attention, and a half-finished generator is;
  `successes` asks whether the recipe gets the job **done**, because that is
  what compiles it into a script that runs with no model at all. The comment
  claiming they used one test is what carried the mistake, so it now states the
  divergence instead. The stored `successes: 1` was corrected to 0 by hand —
  one value on a scratch level, and leaving it would have made the fix inert on
  the very recipe that exposed it.
  Worth naming the shape, since it is the mirror of the bug that dominates this
  log: unifying two notions is as dangerous as duplicating one. The nine
  earlier instances all came from a definition copied and left to drift; this
  one came from collapsing two definitions that only *sounded* alike, on the
  same day, to fix the drift.
  One fact learned by getting it wrong, worth recording because it is easy to
  assume: **a question with no repository is not free.** The `answer` tier
  replays a *stored* answer, and the first run of a novel prompt is what
  produces it — so that run is a full session. Queued one expecting zero, it
  quoted $1.58; cancelled at 12.7s, filed `failed` with `costUnknown`, charged
  $0. The billing rules held exactly as designed; the assumption did not.
- 2026-07-31 — Document capability: **Node libraries at the project root**.
  `docx`, `mammoth`, `exceljs`, `pptxgenjs`, `pdf-lib`, `pdf-parse` — six pure
  JS packages, no native builds, which matters on Windows. The mechanism is the
  interesting part and it was measured before choosing: a sandbox lives at
  `.agentlings/levels/<id>/jobs/<id>`, *inside* the project, so Node walks up
  and resolves the root's `node_modules`. Installing once at the root therefore
  reaches every job with no per-job install, no network and no npm in the
  sandbox — verified by writing and reading back a real .xlsx, .docx, .pptx and
  .pdf from a sandbox path, including `pdf-lib` reopening its own file and
  adding a page, which is in-place editing rather than rewriting.
  The alternative was a Python toolchain — `python-docx`, `openpyxl`,
  `python-pptx`, `pypdf`, the stack Anthropic's own document skills are built
  on, and clearly better at format-preserving edits to .docx and .pptx. Turned
  down for now on three counts: Python is not installed on this machine at all
  (`python`, `python3`, `py` all miss), it puts a second runtime inside a
  single-runtime TypeScript project, and this log already records most
  `anthropics/skills` entries as **Proprietary** while `skills/` is committed,
  so adopting them is redistribution and needs terms read first. The accepted
  cost is that .docx and .pptx can be read and written but not revised with
  their formatting intact; .xlsx and .pdf round-trip properly.
  **Installing them was half the job.** A library nobody is told about is not a
  capability — measured the same evening, an agentling asked for a PDF
  hand-assembled the bytes across several turns because it did not know
  `pdf-lib` was there, and it *worked*, which is what made it expensive rather
  than obviously wrong. So `buildAppend` now names each library and its call
  shape on every job. The shapes are there because guessing one costs a turn:
  `pdf-parse` reads exactly like the function it used to be and is now a class,
  so the obvious `pdfParse(buffer)` fails.
  Two things this deliberately does **not** solve. There is still **no way for
  a file to reach a sandbox** — a job gets a repo clone or nothing, and the
  work bar takes a sentence, a folder and connections but no upload. So reading
  and editing are unblocked in principle and unreachable in practice until an
  ingest path exists; writing works today. And the compiled-tool contract is
  "plain node, no dependencies, no network", so the fourth tier cannot import
  any of these without that contract being reopened on purpose.
- 2026-07-30 — Structural: 90's boot flow (title → level select →
  level). Levels are independent workspaces (own crew/jobs/memory +
  per-level KNOWLEDGE.md fed only to that level's sessions); the
  roles/skills catalog stays global. Crews start at 2, hire in-level.
  Themes are hand-tuned palettes; card thumbnails render from them.
  Legacy cave migrated to levels/hq. Details in SPEC.md.
