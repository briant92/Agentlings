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
| T1·2 | | | | 28c | | | | | hint, full cap |
| T1·3 | | | | 24c | | | | | leash expected |
| T2·1 | 2026-08-05 | a4885b22 | 46c | 25c | **$1.50** | $1.50 | 21 | done | **6× my guess, and the miss is the finding**: I attached the repo's largest doc (AGENTLING.md, 74KB) against a prediction written for a modest one — 1.29M cache-read tokens rode 21 calls (~7.1c/call, 202s). First hard number for the "quote does not know attachments" gap; the $2.00 clamp absorbed it with 50c to spare. Deliverable good: headed one-pager via a generator script. **T2·2: attach a normal-sized document, and compare per-call, not totals** |
| T2·2 | | | | 20c | | | | | hint expected; smaller attachment |
| T2·3 | | | | 17c | | | | | leash expected |
| T3·1 | 2026-08-05 | dde3c87b | 46c | 30c | **60.7c** | 60.7c | 7 | done | 85s. Totals verified independently to 4 decimals; "category" ambiguity handled by stating the choice and totalling all three readings. 2× my guess with a *small* (5.9KB) attachment — which isolates the real driver: **this level's standing context (4 connections' tool definitions + knowledge + library brief) floors every call at ~7–8c**, while the class rate pooling cheaper hq rows priced the quote. D-067's rate residual, showing up per level |
| T3·2 | | | | 23c | | | | | |
| T3·3 | | | | 19c | | | | | leash expected |
| T4·1 | | | 46c | 22c | | | | | |
| T5·Sep | | | $1.09 | $1.08 | | | | | real cadence |
| T6·1 | | | 46c | 20c | | | | | name `web` only |
| T6·2 | | | | 15c | | | | | |
| T6·3 | | | | 15c | | | | | |
| T6·compile | | | ~$1.58 | $1.15 | | | | | on request |
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
