# Findings — 2026-08-04 architecture review

The checklist from the deep-dive review of the optimization loop. Tick a row
when the finding is fixed or the measurement it waits on has been run, and note
the entry ID that settled it. The full reasoning behind each row is in the
review conversation and, once acted on, in `DECISIONS.md`.

This file is a working list, not a record: when every row is settled, the
substance lives in `DECISIONS.md` and this file can go.

**State (2026-08-06):** **every row below is settled.** By this file's own
rule — "a working list, not a record: when every row is settled, the substance
lives in `DECISIONS.md` and this file can go" — what remains here is the board
of open *work*, not open findings, and this file has earned its retirement
once that board finds a home. The findings themselves are D-073, D-074, D-095,
D-096, D-097 and D-098, plus F3's measurements in `TRAINING.md`.

Training has run waves 1–4 — 22 runs, one compiled tool in service and one
compile correctly refused; actuals in `TRAINING.md`'s prediction ledger. Read
that file before queueing anything: prompts repeat **verbatim**, because the
recipe key is the prompt. Sequential queueing is no longer required (D-098),
but two servers on one tree still must never happen. The dev server was left
running.

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
      counter-case is now settled too (board item 3, 2026-08-06): T4 reached
      `successes: 3` and its compile was **refused live** by D-044, naming
      browser, github and search, before any session was queued. Both sides
      of the gate are now proven on real work — one method compiled, one
      turned away with its reason. **The doors/libraries decision has its
      evidence and is the open question**: the refusal is correct today, and
      whether a compiled tool should ever be granted the doors (`fetch`,
      `github`, `search`) rather than being refused for needing them is what
      that evidence was gathered to answer. Still: do not build first.
- [x] **F5 — Recipe counters lose concurrent increments.** `RoutedExecutor`
      read recipes at run start and wrote at end; two jobs on different
      stations lost one another's counts, and the counters gate leashes and
      compiles. **Done 2026-08-06 — D-098**, by the cheap direction this row
      named: `updateRecipes` reads, applies and writes in one synchronous
      block, and the executor holds what it has to record as changes applied
      at the end rather than to the snapshot it began with. Its *decisions*
      still come from what the run could see. Four tests overlap two real runs
      in both finish orders; the old write loses an increment either way.
      **Sequential queueing is no longer load-bearing** — though two servers
      on one tree still must never happen, which `autoPort: false` and the
      attach config now enforce rather than hope for.
- [x] **F6 — Doc figures have drifted again.** AGENTLING.md §7/§8 and SPEC's
      tier table carried 17.9c/39.9c over "106 jobs". **Done 2026-08-06:**
      resynced from `npm run ledger:report` rather than from the prose —
      **19.1c one-shot / 51.5c session over 148 jobs**, with the spend split
      ($50.94 spent, $30.46 charged, $19.78 absorbed), the one-shot record
      (9 done against 24 failed), the avoided-cost counterfactual and the
      ladder's step-downs (63% / 100%) all re-read from the same run. The
      same pass added the `compose` tier to both tier tables, which had six
      rows for a router that has seven — a capability landed the day before
      and documented nowhere, which is the fault this file's own rule about
      AGENTLING.md exists to catch.
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
2. **The Warzone recipe is mis-credited**, and nothing on this board said so
   until now. "I need to send a Telegram to Pepo" matched
   `send pepo the current warzone meta summary on telegram.` by *similarity*
   and credited it with a 3-turn completion — work its own siblings measured
   at 14–15. It is leash-eligible on that number, so the next real run of
   that sentence gets 5 turns and is cut. D-095's un-learn then retires the
   leash automatically, so the cost is one wasted run, not a loop. The wider
   question — whether a similarity match should credit `completedInTurns` at
   all, or only an exact one — is the entry someone should write before
   touching the counter.
3. ~~**T4·4** — the gate's negative case.~~ **Done 2026-08-06.** The run went
   as predicted: leashed on `completedInTurns: 4`, completed in 4 turns of 5
   for 28.7c — the **second leashed completion ever**, and the first under
   D-095's tighter bound — and credited `successes: 3`. The promote was then
   refused, live and for nothing: *"that method used browser and github and
   search, and a compiled tool is plain node with no network."* D-044 turned
   away ~$1 of compile before a session was queued. Two things worth keeping:
   the gate names the surface a method was **learned with**, not what it used
   (`browser` and `search` were almost certainly never touched), so
   **narrowing at the desk is what makes a compile reachable** — T6 compiled
   because it was queued naming only `web`. And the candidate line lagged
   again exactly as board item 1 says it would.
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
