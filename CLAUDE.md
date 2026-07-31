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
- 2026-07-30 — Structural: 90's boot flow (title → level select →
  level). Levels are independent workspaces (own crew/jobs/memory +
  per-level KNOWLEDGE.md fed only to that level's sessions); the
  roles/skills catalog stays global. Crews start at 2, hire in-level.
  Themes are hand-tuned palettes; card thumbnails render from them.
  Legacy cave migrated to levels/hq. Details in SPEC.md.
