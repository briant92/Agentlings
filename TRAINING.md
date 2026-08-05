# Training programme — real jobs, priced before they run

The training phase's working file. Every task below is real work with a
verifiable output, ordered so the learning machinery earns its keep on
schedule, and **priced twice before anything runs**: the app's own quote
(taken live through `/work/plan` on 2026-08-04, free, nothing queued) and my
predicted actual cost. Fill the Actuals column as runs land and compare —
"predict, then measure" is the house method, applied to the curriculum itself.

`FINDINGS.md` is the review this comes from; F3 (the leash's own value) and
F4 (the tool tier's demand) are measured *by* this programme rather than
before it.

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
| **T5** | *(September, on its real cadence)* I need a summary table of this month's main economic indicators from Chile and the US | the settled method on fresh data; monthly recurrence | **About $1.09 — done this 3 times before** (keyed, high certainty) | **$1.00–1.15** |

T5 is the twelfth run of that sentence but the *first on its real monthly
cadence* — do not run it early to farm the recipe (memory: an eleventh
synthetic run teaches nothing).

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
written in `recipes.ts` directly above the code that did it). F7's decision
entry is now a **prerequisite** for wave 4, not a parallel item.

### Wave 5 — the knowledge store on its best case *(needs a folder from Brian)*

Point training-ground's store (level header → *reading*) at a real folder the
crew cannot otherwise reach — household/warranty/finance documents, the
D-059–D-061 material. Then:

| Step | Prompt shape | Predicted |
|---|---|---|
| Sync + 2 recalls | "what do we know about ⟨specific thing in the folder⟩" | **$0** (routed; each answer cites `[file, synced date]`) |
| One grounded session | "Using the notes on file, draft a ⟨checklist/letter/summary⟩ for ⟨thing the documents cover⟩" | **~30–45c**; the store's measured best case is material with no other route (D-049) |

### Wave 6 — hq repo maintenance (optional, real, recurring)

| ID | Prompt (verbatim) | App quote | My predicted actual |
|---|---|---|---|
| **T8** | Survey SPEC.md against the modules in server/src and list every non-test module SPEC does not name - read only, change nothing. | **About 10c** (scout, ceiling 29c) | **~12–18c** (hq scout survey precedent: 17.7c cost, 9.6c charged) |

Real maintenance (SPEC drifts silently — memory), recurring after any batch of
server work, and a future compile candidate of the same family as
`list-every-server-module`.

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
| T5·Sep | | | $1.09 | $1.08 | | | | | real cadence |
| T6·1 | 2026-08-05 | 87934cf1 | 49c live | 20c | **24.8c** | 24.8c | 4 | done | 37s. Totals match an independent recompute exactly (grand 43.6750 over 104 real spend rows). **The banked recipe's surface is `conn:web` alone** — compile-clean, D-044 will pass. Best prediction landing yet (+24%) |
| T6·2 | 2026-08-05 | e1296348 | 48c class ("44 jobs like it") | 15c | **47.0c** | 47.0c | 5 | done | 48s, 111 rows (cost by job class). All four figures match an independent recompute exactly. **Cost nearly doubled run-over-run** (24.8 → 47.0c) — the ratchet again: run 1's method matured into a `summarise.mjs` generator plus an exact-figures section, and the CSV grew 4.2→4.5KB. My 15c guess low for the third time on this job. **The quote was still class-priced**: one prior run does not key it — the recipe only credits on *reuse*, so run 1 left `successes: 0` |
| T6·3 | 2026-08-05 | 8ef1063a | **56.7c keyed** | 15c | 20.4c | **$0** | 5 | partial | **leashed on its second reuse and cut at the wall** — `oneShot`, `turnsAllowed: 5`, `error_max_turns` at turn 6, SUMMARY.md correct anyway (D-063; all five figures match my recompute), charged $0, 20.4c absorbed. The gate armed off `completions: 1` with `completedInTurns: 6` on file — **the recipe's own record said six turns and the leash granted five**. D-072's keyed quote fired here, one credited run in |
| T6·compile | | | ~$1.58 | $1.15 | | | | | **blocked** — see the arithmetic below |
| T6·tool | | | free | $0.00 | | | | | verify must pass |
| T7·recalls | | | free | $0.00 | | | | | |
| T7·session | | | | 38c | | | | | |
| T8·1 | | | 10c | 15c | | | | | hq |

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
