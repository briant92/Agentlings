# Findings — 2026-08-04 architecture review

The checklist from the deep-dive review of the optimization loop. Tick a row
when the finding is fixed or the measurement it waits on has been run, and note
the entry ID that settled it. The full reasoning behind each row is in the
review conversation and, once acted on, in `DECISIONS.md`.

This file is a working list, not a record: when every row is settled, the
substance lives in `DECISIONS.md` and this file can go.

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
- [ ] **F3 — The one-shot tier is dormant and the headline is measuring
      populations, not the mechanism.** 31 recipes, 1 leash-eligible; the
      report's step-1 figure moves with the mix (50→63% across recomputations)
      while D-069/D-071 showed the method alone is worth ~43% with no leash.
      When recipes re-earn completions, run the paired measurement: leash vs
      hint-at-full-cap on the same job. Blocked on traffic.
- [ ] **F4 — First real repeat demand points at the blocked tool tier.**
      training-ground's candidate counter has fired 3× on a job that can never
      compile under the plain-node contract (needs search/web at run time;
      deliverable is fresh data). The method already split into a compilable
      formatter (generator script + DATA object) and an inherently paid gather.
      Decision to take *when a second recurring job shows the same shape*:
      tools get the gated `/internal/*` doors, and/or the document libraries.
      Do not build on n=1.
- [ ] **F5 — Recipe counters lose concurrent increments.** `RoutedExecutor`
      reads recipes at run start and writes at end; two jobs on different
      stations lose one another's counts, and the counters now gate leashes and
      compiles. Cheap direction: re-read and merge before write. Becomes real
      the day two stations run at once.
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
- [ ] **Next step — a second real job through training-ground.** Everything
      learned so far is one sentence deep. The leash bound, `mean × 2`, method
      generality, clarify-saves-turns and F3/F4 above are all blocked on real
      traffic, not thought.

Deliberately **not** on the list, so nobody reopens them from here: the quote
ceiling pinned at the $2.00 clamp (measured, both fixes rejected — D-072), the
compile turn cap (D-025), the compile rate split (D-029), Google Custom Search
(D-054), browser acting tools (D-034/D-035), and the tool-surface gate (D-050).
