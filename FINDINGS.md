# Findings — 2026-08-04 architecture review

The checklist from the deep-dive review of the optimization loop. Tick a row
when the finding is fixed or the measurement it waits on has been run, and note
the entry ID that settled it. The full reasoning behind each row is in the
review conversation and, once acted on, in `DECISIONS.md`.

This file is a working list, not a record: when every row is settled, the
substance lives in `DECISIONS.md` and this file can go.

**State (2026-08-05, pushed `f26fa39`):** five of the seven rows below are
settled; **F5 and F6 are all that is left**, and both are cheap. Training has
run waves 1–4 — 21 runs and the first compiled tool, actuals in `TRAINING.md`'s
prediction ledger. Read that file before queueing anything: prompts repeat
**verbatim** (the recipe key is the prompt) and runs go **sequentially** while
F5 is open. The dev server was left running.

- [x] **F1 — The learning loop has no dedup.** A recurring job banks the same
      lesson every run: 11 near-identical lines in training-ground's
      `KNOWLEDGE.md`, 8 in Pip's lessons, all one fact. The cost is slot
      crowding, not tokens — the 8 knowledge notes and 5 lessons a session is
      handed are all copies, and anything else the level learns about that job
      is crowded out. **Done 2026-08-04 — D-073.** The threshold was measured
      and rejected (no similarity bar separates rewordings from distinct
      notes); shipped as exact dedup at both append seams, the close-out shown
      what is on file with a `known` decline, and the existing pile cleaned.
- [x] **F2 — Continuation runs bank junk recipes.** A continued job's prompt
      carries the carry-on brief, so its close-out banks a recipe under a
      compound key nobody will match (`hits: 0` in training-ground), and the
      brief's words distort the rarity corpus. **Done 2026-08-04 — D-074.**
      The brief rides on `Job.brief` (D-030's clarifications rule), the router
      refuses every shortcut to mid-flight work, a continuation credits usage
      only, and the one junk recipe was dropped by identification.
- [x] **F3 — The one-shot tier is dormant and the headline is measuring
      populations, not the mechanism.** **Measured 2026-08-05** (TRAINING.md
      wave 2 + the leashed pair): the method's value is job-shaped — ≤0 on
      live-data gathering (T1 rose 61→84c), −47%/−57% on transforms — and the
      leash's own margin is a further 14–24% of *spend*, bought at reliability:
      T2·4/T3·4 were cut at the wall, delivered anyway, charged $0. T4·3 then
      became the first leashed run ever to complete (3 calls, 23.3c): the tier
      works precisely where jobs fit ≤4 calls. The old ~55% headline was mostly
      the method. Residue moved to F7; refinement is just more pairs.
- [x] **F4 — First real repeat demand points at the blocked tool tier.**
      **Done 2026-08-05 — D-096.** The ladder was walked end to end on real
      recurring work: five hand-done runs, a compile, a reviewed promote, and
      a sixth run served by `summarise-attach-expense-csv` at `tooled: true`,
      0 turns, $0. It was blocked for one afternoon on the way — `successes`
      counts reuse only, so "three runs" was five, and the leash then froze
      the recipe (F7) — which is the account in D-095 and D-096. The
      counter-case is now board item 2: a third T4 delivery makes a candidate
      whose compile D-044 should visibly *refuse*. The doors/libraries
      decision still waits for that evidence; do not build first.
- [ ] **F5 — Recipe counters lose concurrent increments.** `RoutedExecutor`
      reads recipes at run start and writes at end; two jobs on different
      stations lose one another's counts, and the counters now gate leashes and
      compiles. Cheap direction: re-read and merge before write. Becomes real
      the day two stations run at once — all 15 training runs were queued
      sequentially to avoid it; keep doing that until fixed.
- [ ] **F6 — Doc figures have drifted again.** AGENTLING.md §7/§8 and SPEC's
      tier table carry 17.9c/39.9c over "106 jobs"; live is 17.9c/49.0c over
      115. The docs' own rule (regenerate, don't trust prose) covers it; apply
      the mechanical resync when next in those files.
- [x] **F7 — The leash cannot un-learn** *(added 2026-08-05, from Wave 2's
      leashed pair)*. **Done 2026-08-05 — D-095**, both halves: the bound is
      the leash's own budget, and a leashed run cut at the wall raises the
      need it disproved. Verified live by T6·4 refusing the leash it had
      taken the run before, and by the mutations recorded in the entry.
      T6·3 sharpened the row before it closed: the loop was not only
      unbounded absorption, it **froze the recipe** — a cut run credits
      neither counter, so a leashed-and-cut recipe could never reach
      `successes: 3` and could never be compiled, which made the tool tier
      unreachable for exactly the jobs the leash grabbed.
- [x] **Next step — a second real job through training-ground.** Done and then
      some: waves 1–2 of `TRAINING.md` are five distinct real jobs across 15
      runs. Superseded by the board below.

## The board — pick up here

1. **Two things the compile turned up**, neither urgent, both cheap to note
   and easy to mis-read later:
   - `tool-candidates.jsonl` still has no T6 line. The candidate check reads
     the recipe as loaded at run *start*, so it lands a run late — the UI's
     candidate list is one run behind the promote route's own bar, which
     reads `successes` directly. Cosmetic; the compile went through anyway.
   - **A compile that produces a working tool is recorded as a failure.**
     T6's hit the turn cap holding two finished scripts, so it filed
     `failed` and was absorbed — right by D-012, and it means any future
     "compile success rate" read off the ledger says 0% while the tool it
     built is live. Ask what the population was before trusting that figure.
2. **T4·4** (cheap, one run): third delivery makes it a candidate; then ask
   promote and watch D-044 refuse with the reason. The gate's negative case,
   live. Worth re-reading its recipe first — T4 completed in 4 turns, so it
   is one of the few still leash-eligible under D-095, and the run will be a
   one-shot.
3. **T5 in September**, on its real cadence — not before.
4. **Wave 5** needs Brian to pick a real documents folder for the store.
5. Two measured gaps now sized for whoever reopens them: the quote is blind to
   attachments (74KB ≈ +$0.83, T2·1) and to per-level context weight (~5–8c
   per-call floor here vs the pooled class rate) — both have ledger rows
   behind them now, neither is worth code before more traffic.

Deliberately **not** on the list, so nobody reopens them from here: the quote
ceiling pinned at the $2.00 clamp (measured, both fixes rejected — D-072), the
compile turn cap (D-025), the compile rate split (D-029), Google Custom Search
(D-054), browser acting tools (D-034/D-035), and the tool-surface gate (D-050).
