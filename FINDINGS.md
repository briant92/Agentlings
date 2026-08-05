# Findings — 2026-08-04 architecture review

The checklist from the deep-dive review of the optimization loop. Tick a row
when the finding is fixed or the measurement it waits on has been run, and note
the entry ID that settled it. The full reasoning behind each row is in the
review conversation and, once acted on, in `DECISIONS.md`.

This file is a working list, not a record: when every row is settled, the
substance lives in `DECISIONS.md` and this file can go.

**State at last session (2026-08-05, pushed `9b66959`):** training waves 1–2
ran — 15 runs, 15 deliveries, $8.83 spent — and the actuals plus the wave
findings live in `TRAINING.md`'s prediction ledger and wave-2 "Measured"
block. Read that file before queueing anything; prompts repeat **verbatim**
(the recipe key is the prompt) and runs go **sequentially** while F5 is open.
The dev server was left running from that session.

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
- [ ] **F4 — First real repeat demand points at the blocked tool tier.**
      T6 ("summarise expenses.csv into SUMMARY.md") has now run three times,
      all delivered, on a recipe whose surface is verified `conn:web` alone —
      compile-clean for D-044. **Blocked, and not by demand (2026-08-05):**
      the promote is refused at `successes: 1` of 3, because `successes`
      counts reuse only *and* run 3 was leashed → cut → uncredited. Every
      further run repeats that, so the counter cannot move. **F7 is now a
      prerequisite** — no more T6 runs until it is settled; they would cost
      ~20c each, deliver correctly, charge $0 and teach nothing new.
      Counter-case still queued behind it: a third T4 delivery makes a
      candidate whose compile D-044 should visibly refuse (method needs the
      live code host). The doors/libraries decision still waits for that
      evidence; do not build first.
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
- [ ] **F7 — The leash cannot un-learn** *(added 2026-08-05, from Wave 2's
      leashed pair)*. T2·4 and T3·4 both leashed, both cut at 5 turns holding
      their deliverables (their matured standard needs 5–7 calls), both
      charged $0 and absorbed — and a cut run cannot revise `completions` or
      `completedInTurns` (D-068, deliberately), so both recipes stay
      leash-eligible and every future repeat loops leash → cut → deliver →
      absorb: free for the user, unbounded absorption for the app. Decision
      direction, not code: a *leashed* run cut at the wall has proved need >
      leash, and its `toolCalls` is a lower bound — letting that raise
      `completedInTurns` would retire the leash for jobs it demonstrably does
      not fit. Reopens D-068's counter semantics; wants its own D-entry
      before any counter moves.

      *Sharpened 2026-08-05 by T6·3, and now the top of the board.* The loop
      is not only unbounded absorption — it **freezes the recipe**. A cut run
      credits neither counter, so a leashed-and-cut recipe can never reach
      `successes: 3` and can never be compiled: the tool tier is unreachable
      for exactly the jobs the leash grabs (F4, live). And the arming
      condition is looser than this row assumed — `canShortenLeash` asks
      `completions >= 1` and `completedInTurns <= 10`, so **one** completing
      run recorded at **6** turns armed a **5**-turn leash. The recipe's own
      record said it did not fit. Two questions for the entry, then: may a cut
      leashed run raise `completedInTurns`, and should the gate compare that
      field against the leash's actual budget rather than
      `LEASH_CREDIBLE_UP_TO`.
- [x] **Next step — a second real job through training-ground.** Done and then
      some: waves 1–2 of `TRAINING.md` are five distinct real jobs across 15
      runs. Superseded by the board below.

## The board — pick up here

1. **F7's decision entry** — now first, because wave 4 cannot move until it
   lands: whether a leashed run cut at the wall may raise `completedInTurns`,
   and whether `canShortenLeash` should read that field against the leash's
   own budget. A counters change — take it through a D-entry first.
2. **T6's fourth run, then promote** (F4's milestone) — *only after 1*. Fresh
   expenses CSV, verbatim prompt, **name only `web`**; it must complete
   un-leashed to credit `successes: 2`, so a fifth run follows before the
   compile request. Then review `run.mjs` for D-045's cache test before
   promoting. Runs 1–3 are on the board at 24.8c, 47.0c and 20.4c-absorbed.
3. **T4·4** (cheap, one run): third delivery makes it a candidate; then ask
   promote and watch D-044 refuse with the reason. The gate's negative case,
   live.
4. **T5 in September**, on its real cadence — not before.
5. **Wave 5** needs Brian to pick a real documents folder for the store.
6. Two measured gaps now sized for whoever reopens them: the quote is blind to
   attachments (74KB ≈ +$0.83, T2·1) and to per-level context weight (~5–8c
   per-call floor here vs the pooled class rate) — both have ledger rows
   behind them now, neither is worth code before more traffic.

Deliberately **not** on the list, so nobody reopens them from here: the quote
ceiling pinned at the $2.00 clamp (measured, both fixes rejected — D-072), the
compile turn cap (D-025), the compile rate split (D-029), Google Custom Search
(D-054), browser acting tools (D-034/D-035), and the tool-surface gate (D-050).
