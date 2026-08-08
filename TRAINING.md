# Training programme — real jobs, priced before they run

The training phase's working file. Every task below is real work with a
verifiable output, ordered so the learning machinery earns its keep on
schedule, and **priced twice before anything runs**: the app's own quote
(taken live through `/work/plan` on 2026-08-04, free, nothing queued) and my
predicted actual cost. Fill the Actuals column as runs land and compare —
"predict, then measure" is the house method, applied to the curriculum itself.

It began as the answer to a 2026-08-04 architecture review, whose checklist
lived in `FINDINGS.md`: F3 (the leash's own value) and F4 (the tool tier's
demand) were measured *by* this programme rather than before it. Every row of
that review is settled — D-073, D-074, D-095, D-096, D-097, D-098, plus F3's
measurements below — so the file was retired on 2026-08-06 by its own rule
("a working list, not a record"), and what it still carried is **What's open**
at the foot of this one.

## What the outside evidence says, in four lines

- **Cost is a first-class metric, not a footnote.** Agents with similar
  accuracy differ in cost by up to two orders of magnitude, and simple
  baselines are often Pareto-optimal over elaborate ones — evaluate
  accuracy × cost jointly ([AI Agents That Matter,
  arXiv:2407.01502](https://arxiv.org/pdf/2407.01502)). This engine already
  does; the curriculum pre-registers both numbers.
- **Difficulty is steps × tools.** GAIA levels its real-world tasks that way:
  L1 ≈ one tool and ~5 steps, L2 ≈ multiple tools and 5–10 steps, L3 ≈ dozens
  of steps ([GAIA, arXiv:2311.12983](https://huggingface.co/papers/2311.12983)).
  Mapped here onto turn budgets: L1 fits the 5-turn leash, L2 the 10-turn
  default, L3 needs quote-funded turns (D-067).
- **Skills compound when they are stored as verifiable, reusable code, and a
  curriculum works at the frontier of current capability**
  ([Voyager](https://voyager.minedojo.org/),
  [arXiv:2305.16291](https://arxiv.org/pdf/2305.16291)) — the recipe → tool
  ladder is exactly this shape, so the programme feeds it recurring jobs whose
  method converges to a script.
- **Delegate first what is frequent, well-specified, verifiable and
  reversible**; give the checker an exact pass/fail per unit
  ([Intelligent AI Delegation, arXiv:2602.11865](https://arxiv.org/html/2602.11865v1),
  [outcome-based criteria](https://pickaxe.co/post/ai-agent-pricing-models));
  the payoff concentrates in high-volume repetitive flows
  ([NiCE](https://www.nice.com/agentic-ai/cost-reduction-with-autonomous-ai-agents)).
  Every task below has a stated pass check and a recurrence plan, because a
  recipe that never repeats never pays.

## How that maps onto this engine

- **Recurrence is the training signal.** A first run buys a method (~43% off
  the next run, D-069/D-071); a third completing run arms the leash (D-064/
  D-065/D-068); three deliveries make a compile candidate (D-021). One-off
  jobs teach almost nothing per dollar.
- **Run every sentence verbatim on repeats.** The recipe key is
  `normalise(prompt)`; a reworded repeat is a different job to the crew.
- **Phrasing picks the role and the role picks the price** (D-051, D-053) —
  measured 16× on one job. The wordings below are chosen deliberately; queue
  them as written.
- **T6 must be queued with only `web` named** (narrowing, D-034). The level
  grants search/github/browser by default, every granted connection lands in
  the recipe's capability surface, and the compile gate refuses any recipe
  whose surface names a deliberately-enabled connection (D-044). A compilable
  recipe has to be *learned* clean.
- **Attach the material** rather than making the crew find it — measured 88s
  vs 616s (memory). Attachments also keep answers unbankable, which is
  correct.
- **The displayed role is the matcher's guess; the price is the runner's.**
  training-ground holds two workers, so everything there prices off `worker`
  history whatever role the plan names (D-017, D-026).

## The programme

Waves are ordered; within a wave, order is free. Quotes were pre-registered
live on 2026-08-04 (ceiling $2.00 on training-ground is the documented clamp,
D-072 — expected is the number to compare).

### Wave 1 — L1 singles: one capability, verifiable, sized for ten turns

| ID | Prompt (verbatim) | Trains | App quote (pre-run) | My predicted actual |
|---|---|---|---|---|
| **T1** | Write a short sourced note on the current value of the UF in Chile and the CLP/USD exchange rate, naming each source. | search + fetch + cite method | About 46c (36 alike) | **~40c** (30–60c; search makes turns dear, ~4.4–6.6c each) |
| **T2** | Produce a one-page .docx summary of the attached document, in plain language, with headed sections. *(attach any real document)* | document production from given material | About 46c (36 alike) | **~25c** (18–32c; ~5–8 calls at no-repo rates + 3.5c close-out) |
| **T3** | Turn the attached CSV into an .xlsx workbook: the data on one sheet, and a second sheet totalling by category. *(attach a real CSV)* | exceljs, structured output, previewable | About 46c (36 alike) | **~30c** (22–42c) |

Pass checks: T1 names ≥2 sources and the figures agree with them; T2 opens in
the delivery viewer with the headings; T3's grid preview shows both sheets and
the totals recompute.

### Wave 2 — repeats: the same three sentences, twice more each

Run each Wave-1 sentence again (verbatim; fresh attachment content is fine for
T2/T3) on its real cadence or back-to-back. What should happen, per the
engine's own rules:

- **Run 2** arrives with the method as a *hint* on the full cap (no
  completions yet). Predicted: **15–30% under run 1** (D-069's method value,
  minus leash).
- **Run 3** goes **one-shot on the 5-turn leash** if run 2 completed inside
  its turns (`completions ≥ 1`, `completedInTurns ≤ 10`). Predicted quote
  flips to "About …, done this N times"; predicted actual **18–42% under run
  1** (D-042's per-job table).

**This is the F3 measurement.** Per job, compare run 2 (hint, full cap)
against run 3 (leashed): the difference is the leash's own marginal value,
which no measurement has yet isolated from the method's. Three jobs give
three paired points. Confound to note honestly: the method itself improves
between runs (D-071 says one step then noise, so the pairing is fair).

**Measured 2026-08-05 — the wave ran, and the leash never fired: every run 3
was refused by D-068's credibility gate, correctly each time.** What the six
runs measured instead:

- **The method's value is job-shaped, not a rate.** Live-data gathering (T1):
  worth ≤ 0 — 61.0 → 67.8 → 84.4c, the gathering happens fresh every run.
  Transform jobs: worth −47% (T2, identical inputs) and −57% (T3, run 2→3).
  F3's eventual answer will be conditional on job shape.
- **Method-as-ratchet, quality-driven.** The close-out banks the *best* run's
  standard and later runs pay to meet it: T3·2 cost 2× run 1 building live
  formulas, five grouping blocks and an XML verification pass nobody asked
  for — a better artifact at a higher price. Cost per job converges to the
  quality ceiling, not the floor. Corollary worth a decision someday: the
  5-turn leash is also the only cost-ceiling against quality creep, and the
  ratchet pushes jobs out of its eligibility (T1: 12, T3 briefly 19).
- **The gate ratchets both ways within one wave.** T2 6, T3 8 by wave end —
  both now leash-eligible; a run 4 of each would put real leashed points on
  F3's board (~35–50c each).
- **D-072 keyed pricing went live**: run-3 quotes read "done this 1 time
  before" off run 2's row; T1's ceiling tightened $2.00 → $1.36.
- **D-073 live-verified**: 10 knowledge lines after 9 runs — the `known`
  decline fired at least 3×, exact-dedup collapsed the repeated bare lines,
  genuinely new lessons still banked.
- **Predictions: 6 of 6 low, mean miss ~2.2×** — the level's ~5–8c per-call
  context floor plus the unmodeled ratchet. The app's keyed quotes beat my
  guesses on every repeat.

Wave 2 spend: **$4.13, all delivered, all charged, nothing absorbed.**

**The leashed pair (runs 4, 2026-08-05) put the first real leashed points on
the board and closed F3's first loop.** Both leashed runs were cut at the
5-turn wall holding their deliverables — the jobs' matured standard needs 5–7
calls and the leash allows ~4 — so both filed failed, charged $0, absorbed
(30.7c and 36.2c). The F3 verdict at n=2: **the leash trims spend a further
14–24% on top of the matured method's −47/−57%, at the price of reliability**
— the tier's historical 21-failed-vs-8 record reproducing, now with D-063
making the cut runs deliver anyway. And the pair surfaced F7: a cut run
cannot revise `completions`/`completedInTurns` (D-068, deliberate), so these
recipes stay leash-eligible forever and every future repeat loops
leash → cut → deliver → absorb. Free for the user, unbounded for the app.

### Wave 3 — L2 multi-tool

| ID | Prompt (verbatim) | Trains | App quote | My predicted actual |
|---|---|---|---|---|
| **T4** | Using the code host connection, list the last 15 commits on briant92/Agentlings and write a short status note on what changed. | github connection + synthesis | About 46c (36 alike) | **~22c** (15–35c; hq's leashed scout did this class at 5.5–8.4c, worker on the default model costs more) |
| **T5** | *(on its real cadence — fires itself 12 Aug)* I need a summary table of this month's main economic indicators from Chile and the US | the settled method on fresh data; monthly recurrence | **About $1.09 — done this 3 times before** (keyed, high certainty) | **$1.00–1.15** |

T5 is the **tenth** job to carry that sentence and the ninth to complete —
not the twelfth. The old number counted two continuations of `3c031419` as
runs of their own, and they are not: a continuation is the job it continues
(D-074). Nor do the two Telegram-bound runs of 2026-08-07 belong to it —
*"…from Chile and the US **sent on Telegram to me**"* is a different
sentence, so a different key, and it carries its own recipe reading
`hits: 0`. The exact sentence's recipe reads **`hits: 8`, `successes: 6`,
`completedInTurns: 24`**, and that is the count to trust: it is the engine's
own, not a tally of what looked alike in `jobs.json`. Anything counting runs
by eye will make this mistake in both directions — resembling sentences up,
continuations up, and the real figure was on disk the whole time.

It is the *first firing on the real monthly cadence*, and the schedule is
**live**: `training-ground`, id `c639d84a`, **monthly on the 12th at 09:00**,
next due **Wed 12 Aug 2026 09:00**, unpaused, never fired. It only fires
while the app is running; closed at the hour, D-103's boot sweep fires one
catch-up when it next starts.

**The row's title is wrong and the wave is not**: the first firing is August,
not September. The day moved from the 1st on 2026-08-07 because the sentence
asks for *this month's* indicators and day 1 could not answer it — Chile's
IPC lands around the 8th and US CPI around the 10th–13th, so a firing on the
1st reports the month before last under this month's name. The 12th clears
both. It fires in August rather than September only because August's 12th
had not yet passed when the cadence changed, where the 1st's had —
`computeNextDue` was run rather than reasoned about, and returned
`Wed Aug 12 2026 09:00` against the 1st's `Tue Sep 01`.

That is **not** the early run this row warns against. The rule is: do not
*hand-queue* extra runs to farm the recipe — a tenth synthetic run teaches
nothing. A firing on its own cadence is the opposite of synthetic, and it is
what the row exists to observe; it simply arrives 20 days sooner, with
September's following on the 12th.

### Wave 4 — the compile ladder, walked legitimately

| ID | Prompt (verbatim) | Connections | App quote | My predicted actual |
|---|---|---|---|---|
| **T6** | Summarise the attached expenses.csv into SUMMARY.md: a markdown table with the total per category and a grand total. *(attach a real expenses CSV; **name only `web`** on the job)* | the full ladder: recipe → completions → 3 successes → candidate → compile → tool | About 46c (36 alike) | run 1 **~20c** (15–30c); runs 2–3 **~15c**; leashed **~12c** |

Run it three-plus times with different CSVs (real months of expenses). The
method converges to "parse, group, total, write markdown" — plain node, no
libraries, data varies per run so the compile cannot cache an answer (D-045's
test), and the narrowed surface passes D-044's gate. Then promote:

- Compile: predicted quote **~$1.58–2.00**, predicted actual **$0.95–1.35**
  (D-024/D-025's range), one-off.
- Every run after: **$0**, `verify.mjs` recomputing the totals — the first
  tool earned end-to-end on real work with no seeding anywhere in its
  history.

**Measured 2026-08-05 (runs 2–3) — the ladder is blocked, and not by demand.**
Two things were wrong in the plan above, both discovered by running it:

- **"Three runs" is four.** `successes` counts *reuse* runs; the founding run
  banks the recipe and never counts itself (`TOOL_CANDIDATE_RUNS = 3`,
  refused at `index.ts:1806`). After runs 1–3 the recipe reads
  `hits: 2, successes: 1`. Read the counter, not the prose — the same rule
  that says a figure in these notes is not evidence.
- **The leash then makes the fourth run impossible.** `canShortenLeash`
  requires only `completions >= 1` and `completedInTurns <= 10`, so run 3 was
  leashed off a single completion whose own record said **6 turns** — and
  handed **5**. It was cut, delivered anyway (D-063), charged $0. A cut run
  credits neither `successes` nor `completions` (D-065's deliberate choice),
  so the recipe is frozen at `successes: 1` while every future run repeats
  leash → cut → deliver → absorb. **`successes` can never reach 3. The compile
  is unreachable by running the job more.**

This is F7 with a sharper edge: not just unbounded absorption, but a recipe
that can no longer climb. It is also the fourth time a gate that verified one
thing was read as licensing another (D-064, D-065, D-068 — and the warning is
written in `recipes.ts` directly above the code that did it).

**Settled the same day by D-095**, which was a prerequisite for this wave
rather than a parallel item: the bound became the leash's own budget, a
leashed run cut at the wall may raise it, and T6·4 then ran un-leashed and
credited `successes: 2`. One more delivery reaches the three a compile needs.

### Wave 5 — the knowledge store on its best case *(needs a folder from Brian)*

Point training-ground's store (level header → *reading*) at a real folder the
crew cannot otherwise reach — household/warranty/finance documents, the
D-059–D-061 material. Then:

| Step | Prompt shape | Predicted |
|---|---|---|
| Sync + 2 recalls | "what do we know about ⟨specific thing in the folder⟩" | **$0** (routed; each answer cites `[file, synced date]`) |
| One grounded session | "Using the notes on file, draft a ⟨checklist/letter/summary⟩ for ⟨thing the documents cover⟩" | **~30–45c**; the store's measured best case is material with no other route (D-049) |

**Measured 2026-08-06 — the wave ran end to end, and the best case held.**
Brian picked the folder through D-102's new "+" dialog (its first live
serving): `Training Ground Workout`, two real PDFs — a confidential Enerlink
board deck from that morning and a 2022 balance sheet — 55 passages, nothing
skipped, $0.

- **Both recalls routed at $0 with the promised citations** (`[file, synced
  2026-08-06]`). "What do we know about MGI" came back precise — the alert
  engine's own numbers off the deck. The store's win on no-other-route
  material is exactly as D-049 called it: not a percentage.
- **The thin recall found a boundary worth having.** The balance PDF is a
  scan that arrived with a junk text layer baked in ("BALANCE GENERAL
  zo22…"), and D-059's text-layer-wins rule trusted it — `scanned: 0`, so
  the good Windows OCR never fired. The rule assumes any text layer beats
  OCR; this file breaks the assumption. Recorded, not fixed (What's open).
  The same recall's second citation matched the *word* "balances" from the
  other file — term-scoring being term-scoring, disclosed by the citation.
- **The grounded session delivered above prediction, for the usual reason**:
  50.6c against the 38c guess (7 calls × the level's ~7c standing-context
  floor, D-067's residual — the fifth prediction this level has pushed low
  the same way). The briefing itself is the standard matured elsewhere
  turning up here: deck figures verbatim, risks generalised from the one
  incident, and a **Gaps** section naming the four agenda items its 12
  recalled lines never covered — the recall hands a scored selection, not
  the index, and the run said so instead of papering over it.

### Wave 6 — hq repo maintenance (optional, real, recurring)

| ID | Prompt (verbatim) | App quote | My predicted actual |
|---|---|---|---|
| **T8** | Survey SPEC.md against the modules in server/src and list every non-test module SPEC does not name - read only, change nothing. | **About 10c** (scout, ceiling 29c) | **~12–18c** (hq scout survey precedent: 17.7c cost, 9.6c charged) |

Real maintenance (SPEC drifts silently — memory), recurring after any batch of
server work, and a future compile candidate of the same family as
`list-every-server-module`.

**Measured 2026-08-06 (T8·1, first run).** The demand is real — SPEC had
drifted by **eight** unnamed modules (approvals, audience, channel, env,
google, pickFolder, validate, executors/simulated) — and so is the case for
compiling it: the scout's delivery was 70% right at full confidence, with
three phantom files, one miss and a self-contradicting census, while the
seven true findings cost 14.3c. Cross-checked both ways before crediting
either list: my first grep was the worse instrument on named-vs-mentioned
(prose words passed channel/env/validate), the scout's memory was the worse
one on existence. A compiled tool would enumerate rather than remember —
this job stays on its cadence and should compile once its runs earn it.

## Prediction ledger — fill as runs land

| Run | Date | Job id | Quoted | Predicted | Actual cost | Charged | Calls | Outcome | Note |
|---|---|---|---|---|---|---|---|---|---|
| T1·1 | 2026-08-05 | 44a7c682 | 46c | 40c | **61.0c** | 61.0c | 9 | done | 92s; 5 sources, figures cross-checked. Both guesses low: ~6.2c/call with 219k cache-read and all four connections' tool definitions riding — the app's 46c is a class mean over lighter jobs, mine under-weighted search tokens. Ceiling never close. One lesson line banked, no copies (D-073's first live outing) |
| T1·2 | 2026-08-05 | b8a9a902 | 50c | 28c | **67.8c** | 67.8c | 11 | done | hint bought nothing — live-data gathering re-fetches every run (D-064's shape). First keyed T1 row. Close-out declined with `known` — D-073's sentinel live |
| T1·3 | 2026-08-05 | 31d89544 | 68c keyed | 24c | **84.4c** | 84.4c | 20 | done | leash correctly refused (completedInTurns 12 > 10) — my "leash expected" was wrong, the gate was right. Cost *rose* run-over-run: the banked five-source standard makes each run more thorough |
| T2·1 | 2026-08-05 | a4885b22 | 46c | 25c | **$1.50** | $1.50 | 21 | done | **6× my guess, and the miss is the finding**: I attached the repo's largest doc (AGENTLING.md, 74KB) against a prediction written for a modest one — 1.29M cache-read tokens rode 21 calls (~7.1c/call, 202s). First hard number for the "quote does not know attachments" gap; the $2.00 clamp absorbed it with 50c to spare. Deliverable good: headed one-pager via a generator script. **T2·2: attach a normal-sized document, and compare per-call, not totals** |
| T2·2 | 2026-08-05 | 5ec8c5cc | 50c | 20c | **66.9c** | 66.9c | 13 | done | 4.4KB attachment isolates the term: −$0.83 and −8 calls vs the 74KB run, same sentence |
| T2·3 | 2026-08-05 | d89b4138 | 67c keyed | 17c | **35.5c** | 35.5c | 5 | done | **−47% on identical inputs** — the method a completing run wrote, D-069 replicated on a transform job. completedInTurns 14 → 6: leash-eligible for run 4 |
| T3·1 | 2026-08-05 | dde3c87b | 46c | 30c | **60.7c** | 60.7c | 7 | done | 85s. Totals verified independently to 4 decimals; "category" ambiguity handled by stating the choice and totalling all three readings. 2× my guess with a *small* (5.9KB) attachment — which isolates the real driver: **this level's standing context (4 connections' tool definitions + knowledge + library brief) floors every call at ~7–8c**, while the class rate pooling cheaper hq rows priced the quote. D-067's rate residual, showing up per level |
| T3·2 | 2026-08-05 | 5fa37b98 | 50c | 23c | **$1.11** | $1.11 | 18 | done | **method-as-ratchet**: run 1's banked standard (state the interpretation, total every reading) executed in full — 275 live formulas, 5 grouping blocks, raw-XML verification. Better artifact, 2× the cost |
| T3·3 | 2026-08-05 | 87558372 | $1.11 keyed | 19c | **47.5c** | 47.5c | 7 | done | the matured method now *includes* the efficient path. completedInTurns 19 → 8: leash-eligible for run 4 |
| T2·4 | 2026-08-05 | f843f9c3 | 57c oneshot | 30c | 30.7c | **$0** | 5 | partial→promoted | **first live one-shot since the gates** — cut at 5 turns (needed ~6), delivered SUMMARY.docx anyway (D-063), absorbed. Spend −14% vs the hint baseline |
| T3·4 | 2026-08-05 | 7f23d9f5 | 57c oneshot | 38c | 36.2c | **$0** | 6 | partial | cut at 5, workbook + build.mjs delivered, absorbed. Spend −24% vs hint. A cut run cannot revise the record, so the leash stays armed → see F7 |
| T4·1 | 2026-08-05 | ebb14da4 | 50c live (46c at pre-reg) | 22c | **29.6c** | 29.6c | 3 | done | 57s — cheapest and fastest run on this level, and the closest to a guess yet (+35%). D-040's trimmed replies visible: one `list_commits` covered it. The note caveats itself: subjects only, no diffs fetched. github connection proven end-to-end here; 5th recipe banked |
| T4·2 | 2026-08-05 | 03ddc6d8 | 50c | — | 25.5c | 25.5c | 3 | done | hint; completedInTurns 4 — under the leash itself |
| T4·3 | 2026-08-05 | 39be00b2 | 57c oneshot | ~18c | **23.3c** | 23.3c | 3 | done→promoted | **the first leashed completion in the engine's history** — oneshot, 3 calls inside 5 turns, 42s, and it credited a leashed completion back to the recipe. T4 arc: 29.6 → 25.5 → 23.3c |
| T4·4 | 2026-08-06 | 5dd552df | 23c keyed (ceiling 46.7c) | ~23c | **28.7c** | 28.7c | 3 | done | **second leashed completion ever**, and the first under D-095's tighter bound — oneshot, 4 turns of 5, 52.9s. Credited `successes: 2 → 3`, which makes it a candidate. Cost *rose* on the fourth run (arc 29.6 → 25.5 → 23.3 → 28.7c): the leash is not a downward ratchet, it is a floor the job wanders above. The note itself read this repo's last 15 commits and got the day right — the D-097 arc, the "fix, then record, then pin" rhythm, and that three subjects admit a fault no test caught |
| T4·compile | 2026-08-06 | — | **free** | free | **$0** | **$0** | 0 | **refused** | **D-044's negative case, proven live and for nothing**: *"that method used browser and github and search, and a compiled tool is plain node with no network — it could never do this job."* The gate refused before a compile session was queued, so the ~$1 D-044 exists to save was saved. Note what it named: `web` is ambient so it is excluded, and `browser`/`search` were almost certainly never touched — the gate judges the surface a method was *learned with*, not what it used, because the surface cannot tell. **The practical rule this makes concrete: narrowing the connections at the desk is what makes a compile reachable at all** — T6 compiled because it was queued naming only `web` |
| T5·Aug | | | $1.09 | $1.08 | | | | | real cadence — fires itself Wed 12 Aug 09:00, schedule `c639d84a` (was T5·Sep; the day moved to the 12th so the sentence's *this month* has figures to find) |
| T6·1 | 2026-08-05 | 87934cf1 | 49c live | 20c | **24.8c** | 24.8c | 4 | done | 37s. Totals match an independent recompute exactly (grand 43.6750 over 104 real spend rows). **The banked recipe's surface is `conn:web` alone** — compile-clean, D-044 will pass. Best prediction landing yet (+24%) |
| T6·2 | 2026-08-05 | e1296348 | 48c class ("44 jobs like it") | 15c | **47.0c** | 47.0c | 5 | done | 48s, 111 rows (cost by job class). All four figures match an independent recompute exactly. **Cost nearly doubled run-over-run** (24.8 → 47.0c) — the ratchet again: run 1's method matured into a `summarise.mjs` generator plus an exact-figures section, and the CSV grew 4.2→4.5KB. My 15c guess low for the third time on this job. **The quote was still class-priced**: one prior run does not key it — the recipe only credits on *reuse*, so run 1 left `successes: 0` |
| T6·3 | 2026-08-05 | 8ef1063a | **56.7c keyed** | 15c | 20.4c | **$0** | 5 | partial | **leashed on its second reuse and cut at the wall** — `oneShot`, `turnsAllowed: 5`, `error_max_turns` at turn 6, SUMMARY.md correct anyway (D-063; all five figures match my recompute), charged $0, 20.4c absorbed. The gate armed off `completions: 1` with `completedInTurns: 6` on file — **the recipe's own record said six turns and the leash granted five**. D-072's keyed quote fired here, one credited run in |
| T6·4 | 2026-08-05 | 074d7d73 | 93.9c keyed | 45c | **69.2c** | 69.2c | 9 | done | **the first run under D-095** — the leash refused itself (`turnsAllowed: 40`, no `oneShot`) where run 3 had taken it, and the recipe credited `successes: 1 → 2`, its first movement since being learned. 107s, all seven figures matching an independent recompute; a 6-category composite axis and the biggest CSV yet (5.3KB), which is most of the rise over run 2 |
| T6·5 | 2026-08-05 | e5874fce | $1.16 keyed | 50c | **58.4c** | 58.4c | 9 | done | **`successes: 3` — the compile threshold, reached on real recurring work with nothing seeded**. 118s, un-leashed, all seven figures matching an independent recompute; it also named the second plausible grouping (`description`, by level) and said why it did not use it — T3's "state the interpretation" standard turning up in a different job. Closest prediction on this job yet (+17%). *Note: `tool-candidates.jsonl` has no T6 line yet — the check reads the recipe as loaded at run start, so it lands one run later; the promote route reads `successes` directly and does not wait for it* |
| T6·compile | 2026-08-05 | 3cc1634b | $2.00 ceiling | $1.15 | **$1.06** | **$0** | 11 | partial→promoted | **the prediction landed** ($0.95–1.35 called, $1.06 actual). Cut at the compile cap (11 of 10 turns, D-025) holding two finished scripts — the ordinary ending for a compile, not a shortfall. Filed `failed`, so the user was charged nothing and the app absorbed it (D-012): **a working tool cost $0 and the ledger records the run that built it as a failure** |
| T6·tool | 2026-08-05 | 1882e54b | free | $0.00 | **$0** | **$0** | 0 | done | **`tooled: true`, 0 turns, no session** — a seventh CSV (by day, 116 rows) it had never seen, every figure matching an independent recompute, and it disclosed the rounding residual (parts 50.32 vs grand 50.31) rather than hiding it. `runs: 1, failures: 0` |
| T7·recalls | 2026-08-06 | 535e8aea, 2c89a2dc | free | $0.00 | **$0** | $0 | 0 | done | both routed, both citing `[file, synced 2026-08-06]`; the thin one exposed the junk-text-layer boundary and a term-match stray, each visible in its citation |
| T7·session | 2026-08-06 | 60298461 | $2.00 ceiling | 38c | **50.6c** | 50.6c | 7 | done | 114s; one-page .docx + md twin, deck figures verbatim, honest Gaps section for the agenda items its 12 recalled lines never carried. +33% on the guess — the level's per-call floor again |
| T8·1 | 2026-08-06 | ad4f1356 | 28.6c ceiling (10c class) | 12–18c | **14.3c** | 14.3c | 8 | done | 37s, scout, prediction landed. **The list is 70% right and reads 100% confident**: 7 findings confirmed by exact-filename recompute, **3 phantom files** (catalog/pack/palette.ts — none exists in server/src), **1 miss** (executors/simulated.ts, real and unnamed), and a census whose own numbers don't reconcile (47+10≠57, 39 names listed as 47). True drift: **8 modules SPEC does not name**. Both instruments erred first — my bare-basename grep passed channel/env/validate off prose words — and the compile-candidate argument made itself: a script enumerates, a memory invents |

| Pack·1 | 2026-08-07 | 7037aeab | 50c (51 alike) | — | **$1.8134** | $1.8134 | 16 | done→discarded | the first authored world, D-110. 17 turns, 429s, 31,262 out, 881,656 cache-read. Discarded on the slug clash (D-111) and recovered from the sandbox |
| Pack·2 | 2026-08-07 | 98942492 | **53c** (52 alike) | $0.85–1.20 | **$1.2878** | $1.2878 | 10 | done | **the quote half of the prediction landed exactly** — 53c, high certainty, one more sample, 3c of drift after a run that cost 3.6× it. The cost half missed high (+7% over the range top) and **the reasoning missed backwards**: I predicted a smaller pack, and a six-word description of a plainer place produced **78 ops against run 1's 46** (58 fg / 17 backdrop / 3 ambient, same viewH 450) for **29% less money**. Cost tracked *turns* (17→11, −35%) and cache-read (−45%), not the drawing — output tokens fell only 19% while the op count rose 70%, because ops are terse JSON and thinking is not. **Confounded on purpose-built ground**: the brief itself changed between the two runs (`9b207eb`, the three faults run 1 found, plus the taken-slug list), so −29% cannot be charged to the subject alone |

Programme total, predicted: **~$4.50–6.50 spent** across ~19 runs plus one
~$1.15 compile; chargeable less (failures and quote caps absorb). Regenerate
the real figures with `npm run ledger:report` after each wave.

## What settles what

- **Wave 2** settles F3: the leash's marginal value, isolated from the
  method's, on three paired jobs.
- **Wave 4** settles F4's demand question the honest way: a tool earned on
  real recurring work, or a measured reason it still cannot be.
- **Waves 1–4 together** give the quote its first non-synthetic classes —
  watch whether "About 46c" tightens toward each job's own keyed mean, which
  is D-072's promise on real traffic.
- **Every wave** feeds the D-073 check: lesson files should hold one telling
  of each fact however many runs land, and the close-out's `known` decline
  gets its first live outings.

## The overnight campaign — 2026-08-07 (D-118)

Brian asked for one night that exercised everything: every tier, every
connection, every learning level, the whole review flow, results by 09:00.
Pre-registered first, then 27 ledger rows — **$7.87 charged, $8.14 spent**
(predicted $5–9). The full account is D-118; what belongs to this file's
running themes:

| Probe | Predicted | Measured |
|---|---|---|
| answer / search / fetch+extract route free | $0 x3 | **all three ran sessions** (29.7c, 40.1c, 21.9c); verbatim repeat still a session (17.4c, the D-069 step); no `answer` banked |
| recalls, tool on an 8th CSV, verbatim compose | $0 | $0, $0, $0 — citations, exact figures, auto-send 1.4s under D-101's grant |
| same sentence, three crews (veteran / never-used / fresh hire) | learning shows in cost | **cost is variance** (59.6c/47.0c/62.7c, cold pair 2x apart); **learning is the standard** — the veteran's five-source authority chain vs the fresh hire's honest one-hop flag |
| first analyst anywhere (fresh class) | a cut, welcome | **cut-but-complete** at a 6-turn grant, workbook exact, 5.1c absorbed; run 2: 40 turns, done, 17.2c — the cheapest class-tag tax yet (n=3 with D-112) |
| skill authored → installed → measured | fewer turns on pack #4 | **quality, not turns**: `lamp-room-daybreak` separation **19.8, best ever**, ramp rule applied at design time; still cut at 23. Fifth world installed |
| composite "then" x compiled tool | unknown | **step 1 quoted and served `tool`, $0, inside the chain**; halted chains have no resume affordance (step 2 hand-requeued after the crash) |
| More turns on a real cut run | full loop | quote proven live ("About 59c — done this 3 times before", ceiling $1.33); the POST left one atom short — every cut tonight was cut-but-complete, and continuing finished work buys nothing |

Two latent bugs found and fixed the same night with reproductions as test
cases: a continuation inheriting its parent's `PENDING.md` (D-119) and
approvals keyed on reply transcripts (D-120). 1,462 tests green after both.

## What's open

Inherited from `FINDINGS.md` when it was retired (2026-08-06). Its findings
are all settled and live in `DECISIONS.md`; these are the open *jobs* that had
collected on its board, and they sit here because this is where the evidence
each one rests on already is.

0. **The server died twice with sessions live (2026-08-07, D-118), cause
   unobserved.** 21:38 and 21:46:08: composite step 2 and the first analyst
   probe filed `INTERRUPTED`, the pack run's meter was eaten (`costUnknown`,
   the ninth unmeasured row). No watched file changed at either moment, and
   the plausible process at 21:38 turned out to be Adobe's own node.exe — the
   pattern-matched-signal rule, live. **Next input: capture the dev server's
   stderr across an evening of real sessions** — an unwatched console is why
   this is still a mystery, and a server that dies on completion seams is the
   likeliest author of the older unmeasured rows too.
1. **The free answer tier never fires — decide whether that is a policy or a
   bug, by measurement.** Tonight's population (D-118): general questions
   always pay, even verbatim repeats of timeless ones; what routes free is
   bare reads, recalls, tools and verbatim composes. Before loosening
   anything, read what `answer`-banking requires and count how many real
   prompts would have qualified — the gate may be guarding against exactly
   the staleness D-045 named.
2. **More turns' POST is one atom short of proven** — a genuinely-unfinished
   cut run has not been continued live (the quote half is proven on a real
   cut run). Do not manufacture one: the next designer run that cuts mid-work
   is the honest specimen, and **cut-but-complete beside `Finished.` is the
   signal for declining the button**, twice observed.
3. **A second standing approval sits earned-but-untaken**: "send a telegram
   to brian with the current uf value and the observed dollar rate" reached
   `eligible: true` on three unchanged approvals. **Taking it needs one more
   reviewed run**: the grant control exists only in the review panel's offer
   modal, which fires on Approve of that signature — the backoffice row shows
   the state ("the offer waits at the next review") but carries no button.
   The API-driven third approval consumed the modal moment invisibly, which
   is how the offer ended up owned by nobody — D-111's shape, softened by
   the row naming its own exit. Candidate UX fix: the grant control on the
   backoffice row itself. D-101 already proved the auto-fire; a daily 09:00
   schedule on the sentence becomes the timer's first useful standing
   automation once granted.
4. **Calendar is wired and walled**: its first firing failed only on the
   Google console toggle (`calendar-json.googleapis.com`, project
   40965402983 — the same wall gmail cleared the same evening). Enable, then
   re-Approve job `3e5ef9f2` in ui-check: "nobody is messaged twice" held.
5. **T5 fires itself Wed 12 Aug 2026 at 09:00**, on its real monthly cadence
   (schedule `c639d84a`, untouched tonight). Still not to be hand-queued.
   The timer's *mechanism* was live-fired 2026-08-07 on a disposable $0
   daily, knowingly front-running D-103's "deliberately left" line —
   August's T5 firing remains the first real scheduled work.
6. **Three measured gaps, deliberately unbuilt** (unchanged): the quote is
   blind to attachments (re-measured tonight: 48KB of sources pushed the
   skill job to 79c) and to per-level context weight; and the store trusts a
   junk embedded text layer — now attested by the crew itself: the redo of
   the thin recall called it *"a defect, not a gap in the archive"* (D-118).
7. **Two ledger blind spots, recorded rather than fixed** (both in D-096):
   the candidate list lands a run late, and a compile that builds a working
   tool files `outcome: failed`. Joined tonight by their cousin: a crash
   files a working run `costUnknown`, so "unmeasured" now has three authors —
   caps, compiles and deaths.

Settled while the list was live, kept for the record:

1. ~~**The Warzone recipe is mis-credited.**~~ **Done 2026-08-06 — D-099.**
   The question underneath it turned out to have one answer: a run that only
   *resembles* a recipe credits usage and nothing else, which is the rule a
   continuation already lived under (D-074). Sweeping every credit ever made
   found **five** resembling credits across four recipes rather than the one
   that was noticed; three were repaired by identification and the fourth had
   never earned counters at all. Live: the Warzone recipe reads `hits: 1`,
   still matches, still lends its method, and the real sentence now plans as
   `session` where it would have been `oneshot`. **Nothing left to do here —
   and no wasted run to pay for.**
2. ~~**The doors, and the libraries.**~~ **Done 2026-08-06 — D-100**, and the
   measurement answered a different question than the one asked. Granting the
   doors would have unlocked **nothing**: every refused recipe also carries
   `browser`, which no plain-node script can run whatever doors it holds. What
   actually bound was the limit D-044 named about itself — the gate read what
   a method *could* reach. Runs now record the tools they call, the gate reads
   that, and old recipes keep the old answer because silence is not innocence.
   Live: T4's refusal went from *"browser and github and search"* to
   *"github"*. **Narrowing at the desk still helps, but no longer decides**:
   a method is judged by what it reached, so a job queued with everything on
   and using none of it can now compile.
3. ~~**Standing approval has never fired.**~~ **Done 2026-08-06 — D-101.**
   Proven end to end on "Send a Telegram to Brian": three $0 compose runs
   approved unchanged (the third's modal offered the grant, taken ten
   seconds later), then the fourth ran and **sent itself 906 ms after
   finishing** — no review, approvals 4, all four bodies in the audit. The
   attempt also found and fixed a wall: on a ready channel the desk shows
   no send card, the Words fell to an optional-looking loose row, and a
   skipped field queued a 26.8¢ session that could only block on "what to
   say" — so Start now arrests "no message", mutation-proved, beside
   D-091's shape check. Left to unit tests deliberately: revocation,
   the stranger-blocks-it rule, and the send-time refusal fallback.
*(Old items 4–6 — T5's cadence, the three measured gaps, the two ledger
blind spots — are restated with tonight's evidence as items 5–7 of the live
list above.)*

7. ~~**The quote is wrong for a whole job class, not just low.**~~ **Done
   2026-08-07 — D-112 gave the class its tag** (the `designer` role), and the
   quote flipped from a pooled 54c to "first time doing this"; GAPS G5
   records the close and the tag's own cost. The account below stands as
   written, run 2's measurement included. The first
   real pack-authoring run (2026-08-07, D-110) quoted **50c** at *high*
   certainty from 51 samples and cost **$1.81** — 3.6x over, and 91% of the
   $2 ceiling. This is not the per-call floor of item 5: that is a residual
   of a few cents, and this is a factor. Authoring a world is 17 turns of
   composing a few hundred ops, and it was priced against a pooled class
   whose members are mostly short. The engine behaved correctly throughout —
   quoted before the work, ceiling held, user billed the real figure — so
   nothing is broken; what is wrong is the estimate, and it will stay wrong
   until this class has samples of its own. **One run is not a rate.** The
   useful next input is a second authoring run at a different size, not a
   tuning pass on one data point — the same discipline item 5 is waiting on.

   **Run 2 is pre-registered below, unrun** (written 2026-08-07, before the
   button was pressed — a prediction recorded afterwards is not one).

   *The sentence, verbatim, in `hq` so the level and the agentling match run
   1:* **`an empty swimming pool, drained, at noon`**. Six words against run
   1's fifteen, and one clause deliberately: run 1's *night* bought a scrim,
   *lamplit* bought light cones, and *the sea through the gunports* bought
   the whole 10-op backdrop layer. This buys none of them. It is **not**
   told to keep the pack small — that is the experiment. If a small subject
   comes back as another 450-tall world, the class has a flat price, and
   that is the finding.

   *Measured before writing it, with the real `findRecipe`:* a new world
   does not match run 1's recipe at all — 0.114–0.159 against a 0.30 hint
   threshold, because the key is dominated by the *scene* words rather than
   the task words. Two consequences. Run 2 starts **cold**, exactly like run
   1, so the two are comparable. And no leash can fire: a *strong* match
   would route `oneshot`, and that recipe carries no `completedInTurns`, so
   `canShortenLeash` would have defaulted true and armed a 5-turn leash on a
   17-turn job. Not close to the 0.65 bar, so it cannot happen — but it also
   means **D-069's ~43% second-run saving will never reach this class.**
   Every authoring run is a first run.

   *Run 1's numbers, to compare against:* $1.8134 · 17 turns · 429s · 31,262
   output tokens · 881,656 cache-read · 16 tool calls · close-out 6.6c ·
   quoted 50c expected against the $2 ceiling · `jobClass: "worker"` · pack
   shape 33 foreground ops / 10 backdrop / 3 ambient / viewH 450.

   *Prediction (mine, pre-run).* The app will quote **~50c again** — same
   pooled class, one more sample. Actual: **~$1.00, range $0.85–1.20, 9–12
   turns.** Format-learning, the `pack:check` loop, RESULT.md and close-out
   are fixed at roughly 6–8 of run 1's turns; composition scales with op
   count, and cache-read cost grows faster than linearly in turns, so a
   scene cut to about a third should cost less than half — and nowhere near
   nothing.

   *Decision rule, fixed before the run.* **≥$1.50** → the price is flat per
   pack; quote the class at ~$1.80 whatever the description, and two points
   are enough. **≤$1.00** → cost tracks scene size, and the pair gives a
   slope worth a third run at the top end. **$1.00–1.50** → inconclusive on
   shape, but the class is still confirmed at 3–4x its pooled rate.

   *Record:* job id, quoted expected vs `costUsd`, `turns`, output tokens,
   and the pack's own shape — that last is what makes the cost comparable
   rather than merely smaller.

   *What two runs still will not fix.* The ledger files this as `jobClass:
   "worker"`, because the class is the role that ran the work — so however
   many authoring runs land, the quote keeps averaging them against every
   short worker session in the level. Two points give the right number;
   **something has to tag the class before the quote can use it.** Cheap
   once the number exists, and not before.

   **RAN 2026-08-07 — job `98942492`, $1.2878, and the premise was wrong.**
   The quote half of the prediction landed exactly: **53c**, high certainty,
   52 samples — 3c of drift after a run that cost 3.6x it, which is what a
   pooled class does with one outlier. The cost half missed high ($0.85–1.20
   called, 11 turns of the 9–12 called). **And the reasoning missed
   backwards.** A six-word description of a plainer place did not produce a
   smaller pack: it produced **78 ops against run 1's 46** — 58 foreground,
   17 backdrop, 3 ambient, the same viewH 450 — for **29% less money**. The
   experiment varied the description; the crew varied its output the other
   way, because how much to draw was never the user's variable to set.

   So *cost does not track scene size*, and the "≤$1.00 → tracks size"
   branch of the rule is dead rather than unproven. What cost tracked was
   **turns** (17 → 11, −35%) and cache-read (881,656 → 488,232, −45%).
   Output tokens fell only 19% while the op count rose 70% — ops are terse
   JSON, and what a turn buys is thinking, not drawing.

   **One confound, and it is ours.** The brief changed between the runs
   (`9b207eb`: the three faults run 1 found, plus the taken-slug list D-111
   wanted). Run 2 had a better brief *and* a different subject, so the −29%
   cannot be charged to the subject alone — the repo's own rule about its
   scaffolding passing as the subject's words, turning up in a measurement
   this time instead of a document.

   **What is now solid at n=2:** both runs came in **2.4–3.6x over quote**,
   mean actual **$1.55** against a ~52c pooled quote — call it **3x**. That
   is a rate, and it did not need a third run to become one. The remaining
   blocker is not samples, it is that nothing tags the class, so no number
   of runs can reach the quote. **The next useful input is the tag, not
   another world.**

Deliberately **not** here, so nobody reopens them: the quote ceiling pinned at
the $2.00 clamp (D-072), the compile turn cap (D-025), the compile rate split
(D-029), Google Custom Search (D-054), browser acting tools (D-034/D-035), and
the tool-surface gate (D-050).
