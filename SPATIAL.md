# Spatial documents — blueprints, floor plans, renders (2026-08-20)

**Status: proposal. This file decides nothing.** It follows `TEAMWORK.md`'s
pattern: each phase below ends in the decision it waits on, and anything Brian
picks goes through the ordinary gate — a `DECISIONS.md` entry when settled, a
`SPEC.md` line when scoped, `AGENTLING.md` re-read from source when it lands.
Figures were read from `.agentlings/ledger.jsonl` and the `home-chores` job
store on 2026-08-20; the standing rule applies — recompute before trusting
them later.

Current position: **the plan is closed and cure (a) is FALSIFIED** (D-207,
2026-08-22). Phase 1 landed the drafter (D-198); every §3 item is ticked
(D-199 to D-205, plus the Phase 3 writing pass); the pre-D-150 residue is
charged (D-206, $10.19 of the $15.05 named).

**The cure (a) test, run on the §4 sentence as job `29ddccb7`: the drafter
did NOT stop itself.** Cut at 41/40 turns — the ninth consecutive wall cut,
and the turn grant was **40, the hard `TURN_CEILING`**, five above the
drafter's own 35, so more turns is no longer a lever that exists. **Yet the
work is the best this task has produced**: party-wall residuals 3,02 cm and
1,93 cm (vs the gate's 6,4/5,0 and Phase 0's 10,6–13,7), location-map fit
0,21/0,41/0,21 map px, the composed PDF and the overlay both delivered,
nothing cropped, and the pairing proven from the sheets themselves by
mirror-symmetric wall tilts (−1,93° against +1,86°). $4.00 inside a $4.24
quote; promoted, priced and settled `done`.

**The new failure mode — D-202 in mirror image: the artefacts outran the
report.** `RESULT.md` was left at "STATUS: IN PROGRESS" listing as "still to
land" four things that had all landed, with the residuals sitting computed
and unreported in `model.json`. Cure (a)'s premise is what broke: it asks the
run to land a deliverable early and improve it, and here composition cannot
precede the geometry it composes. **No new cure is proposed** — D-207 records
three candidates (move the report off the session's turns as D-020 moved the
close-out; have the close-out write the report from the artefacts when the
session was cut; raise `TURN_CEILING`, which this evidence argues against)
and leaves the choice to Brian.

**Chosen and built the same day (D-208): the report off the session's turns.**
Measuring first turned one defect into two. The report is lost on **30% of all
runs that produced something** (54 of 266 with no `RESULT.md` at all, 26 more
unfinished) and on **75% of the ones cut at a wall** — thirteen of them
promoted anyway, on the files rather than the report. And the close-out's own
**ask order turned out to be its survival rate**: asked for three files in two
turns it landed `LESSON.md` 281/281, `APPROACH.md` 280/281, and `PENDING.md` —
asked last — **157/281**, so 124 runs lost the one file nothing else can write.
Built: every file asked for in **one reply**, a third close-out turn as free
insurance, and a **fourth file — the report — only when the run left none**,
gated on `producedArtefacts` so an empty run cannot be made to look delivered.
An existing report is never rewritten: the pass may not read files, so it
cannot know what it would replace, and 70% of runs already report better than
it could. Live re-read owed after the next few runs: PENDING's rate against
56%, a close-out report appearing where one was missing, and zero reports
overwritten.

## 1. The evidence

Two real tasks ran in `home-chores` on 2026-08-18/19. Ten runs, five dead at
the 10-minute wall, ~$9.08 charged.

**Blueprint conjoin** — offices 816/818/819 from a broker PDF into one
continuous plan; routed to the scribe; ended **discarded**:

| run | outcome | cost (real / charged) |
|---|---|---|
| 42e320d0 | died — **no ledger row at all** | invisible |
| 9e35b9b1 | died at wall | $0-metered |
| aec29553 | promoted (v1) | $2.46 / $1.71 |
| 69675331 | died at wall | $0-metered |
| a14357d9 | done, superseded | $2.73 / $2 |
| a648455c | promoted (v3) | $1.45 |
| f40faf92 | **discarded** — "offices are not in the correct position" | $2.03 / $2 |

**3D render** — Villa Toscana L9 ampliación: 7fb7a9c5 (died; preferred
designer, ran as worker), 8f4fdc3e (died), then 41fbbf49 **promoted**
($1.92, 17 turns).

Five causes, each with its seam:

1. **Routing by artifact word.** "Produce a PDF" is scribe-card vocabulary, so
   a geometry job went to the documentation role. The one skill named
   "blueprints" (`skills/architecture-blueprints/`) is C4 *software* diagrams
   — a standing vocabulary collision.
2. **Silent roster gap.** `roles/designer.md` (timeoutMinutes 25,
   see-your-work) fit the work, but no designer is hired in `home-chores`;
   `server/src/queue.ts` line ~406 lets anyone take a job whose preferred
   role is hired nowhere, and nothing says so.
3. **The 10-minute default wall** (`timeoutMsFor`, `server/src/executors/
   claude.ts`) on raster/render-heavy work: 5 of 10 runs died there,
   $0-metered; 42e320d0 left no row at all (suspect: the Aug-18 evening
   restart — unverified).
4. **No clarifying ask.** The 3D sentence offered "let me know" and
   `asked:false` everywhere; asks fire only on missing attachments (D-134).
5. **A discard banks no lesson.** f40faf92's rejection wrote nothing to
   `tam.md`/`KNOWLEDGE.md`, while promoted v1's doomed collage method *did*
   bank — the next blueprint job recalls the method that was just rejected.
   Sibling of the T4 lesson-hygiene item (recorded, not decided).

**What already works** (keep, codify): 41fbbf49's model-first pipeline —
pdf.js vector extraction (153,926 paths from a no-text AutoCAD plot),
dimension chains proven by closure (two exact, one 1.1%), a hand-built
renderer, an orthographic verify overlay, assumptions declared. See
`.agentlings/levels/home-chores/jobs/41fbbf49/` (RESULT.md,
render-aerial.png, verify-plan.png). Also: continue-chains salvaged dead
runs' sandboxes, and quote discipline held throughout.

## 2. The bar — pre-registered before anything is built

One proof job redoes the blueprint conjoin model-first (sentence in §4).
It passes if **all** hold:

- Delivered PDF shows the three units mated on their party walls, rotation
  handled — Brian's eye agrees;
- the delivery itself carries an overlay image (placed outlines over the
  location map) **and** a residual number (max gap in cm between mated
  party walls);
- converged in ≤2 runs and ≤ ~$3.

Miss → record what failed in `DECISIONS.md` and stop; no role gets written
for an unproven method. (D-190 discipline: treatment artefact decided up
front.)

### Trial log (2026-08-21, in flight)

Brian hired **Rue (designer)** and queued the shipped sentence ~00:33Z.
What the night produced, in order:

- The sentence **split at "then"** (see §4): the verify/deliver tail became
  its own step, matched **researcher** ($0.73 real) — Bea refused it
  honestly ("not delivered — the reason is upstream"), promoted.
- The draw step ran as designer and hit the **turn wall three times**
  (44ef78e6, ae032255, 46ba288f — `outOfTurns`, 17/16 turns each): the $2
  quote prices 16 turns, under designer's own maxTurns 20. Time was never
  the binder — run 2 used 15.3 min of the 25-minute box. **The designer's
  known turn-wall pattern, now with the quote as the wall.**
- Run 2's sandbox is the real progress: `oficinas-816-818-819.pdf` (A3,
  whole sheets multiply-blended, nothing erased), rotations from the
  location map (819's wedge carries the building's 14.01° turn), scale
  CHECKED not guessed (<0.8% — no resize), **two defects found by its own
  seam overlays** (818/819 party wall doubled — inner faces mated instead
  of the shared wall; 816/818 pillar ~19 cm off), per-pair residuals in
  `layout.json`. The method §2 bets on is visibly working.
- Run 3 (31d0c24b) died ~1 min in — **the server process died mid-run**
  (cause unknown; not a reboot, no crash logged) and the 01:33Z restart
  marked it failed. It has **no ledger row** — the 42e320d0 vanish-mode
  reproduced; Phase 2's stub-row fix now has two live cases.
- Resumed via the **reply route** (`continue` refuses a null meter) as
  **843245a0**, carrying the sandbox + the step-2 deliverables the split
  gave away (overlay + residual in cm). Running.

**Bar accounting, honest:** "≤2 runs" is already blown — but by the
16-turn quote and one externally killed (censored) run, not yet by the
method. The gate now reads on 843245a0: if it delivers the mated plan +
overlay + residual, the **mechanics** verdict is pass and the **economics**
verdict is "fails under today's quote shape, cure named" (drafter budget /
quote floor for spatial classes). If it stalls again, both fail. Judge on
the artifacts, per §2.

### VERDICT (2026-08-21, per the pre-registered §2 bar): MISSED

843245a0 was cut at the turn wall too — 18/17 turns, $2.04 real, $0
charged, 10.2 of 25 minutes — the **fourth** cut, every one by the quote's
turn ceiling (16–17 under designer's own maxTurns 20), never by the clock
and never by the geometry.

- **Economics: decisive fail.** Five designer runs + the split's researcher
  step ≈ $7.1 real, $0.73 charged, zero §2 artifacts delivered.
- **Mechanics: fail by the bar's own clause (no delivered artifacts),
  recorded with the distinction that every completed step verified
  correct:** rotations from the map's arc; run 2's scale error caught and
  corrected 2.3× against the stated 29,97 m²; the 818/819 doubled wall
  fixed by wall-frame rectification + NCC (du = +19 px = the wall's own
  thickness, confirmed by eye in `img/seam_B.png`); the 816/818 seam
  solved wall-windowed in the dying turns (`mateA.json`: NCC 0.413,
  dt = 2, du = 8, n = 23 100); `compose2.mjs` — the final composer —
  written and never run. The sandbox stands one script-run + overlay +
  residual table from the full artifact set.
- **Cures, any one:** (a) Phase 1's budget shape — the role's own turns
  honored over the quote ceiling for spatial classes; (b) a quote floor
  for this class; (c) one More-turns press on 843245a0 (~$2) collects the
  artifact under today's rules — that spend is outside this trial's books.
- **Instrument lessons banked:** check BOTH instruments before queueing
  (`suggestSetup` AND `splitSteps`); the stub-ledger-row fix has two live
  cases (42e320d0, 31d0c24b); and failure-banking works — run 4's
  LESSON.md holds wall-frame rectification from a failed run — while
  discard-banking remains the gap.

### Coda — the More-turns press (2026-08-21, after the verdict)

Brian pressed More turns once; run 5 (e7fbc720, $1.65, 8.8 min) delivered
and was **approved in review** — and was cut at the turn wall a **fifth**
time (18/17).

**Real and delivered:** full-length wall residuals (816/818 max 13,7 cm,
rms 2,8 — the 13,7 is the two sheets *drawing* the same wall differently,
not placement slack; 818/819 max 10,6, rms 3,2), the location-map overlay
(`img/overlay-ubicacion.png`, max cell error 0,5 map px at one similarity),
the corrected full-res composition (`stage.png`, rendered 22:05:10), and
one more self-catch worth keeping: its first re-fit scored a beautiful
3,3 cm rms and was **overruled by looking** — the rendered strip showed the
plans interpenetrating; the band detector had swallowed floor hatch.

**Not delivered: the PDF.** `oficinas-816-818-819.pdf` in the promoted
delivery is **byte-identical (sha256) to run 2's pre-fix render**.
RESULT.md's "the composition is re-rendered" was written at 22:04:32, the
corrected render landed at 22:05:10, and the PDF rebuild never ran — the
wall hit during close-out. PENDING.md says "done". So a promoted delivery
carries a false claim about its headline file, caught by hash, not by
review. Recorded, not proposed: a review-side check that a file a RESULT
claims rebuilt actually changed since the parent sandbox (hash/mtime) —
the file-shaped sibling of the mail gate's live search.

Completion is one tiny run (rebuild the PDF from the existing corrected
placement — the scripts and placement are all in the sandbox) or accepting
`stage.png` as the artifact. Brian's choice; the trial's verdict above is
unchanged either way.

### Coda closed (2026-08-21 morning) — the artifact exists and is proven

Brian queued the rebuild-only reply; it took three more runs (3d4a0ff8,
2ee3b18b partial; **1680dfa1 promoted**), every one cut at 18/17 — the
chain finishes **eight designer runs, eight turn-wall cuts**, zero failures
of clock or geometry.

- Runs 6–7 repeated the run-5 shape in miniature: the rebuild itself ran
  (07:44, old bytes saved as `.bak`) but the **read-back died on a missing
  `img/` dir** — "a corrected file with no evidence is indistinguishable
  from no rebuild" (run 8's own words). The review-side file-claim check
  recorded above now has its argument made flesh twice.
- Run 8 delivered the proof: a hash table (new `1e12a834…`, 2 862 113 B
  vs old `f2532f3a…`, 3 046 875 B) — **independently recomputed and
  confirmed** — seam close-ups rendered *from the delivered bytes* (818|819
  one dark band with the centreline down its middle; 816|818 a single thin
  line), an old-vs-new page pair, and one honest reconciliation (map fit
  0,80 px today vs the stale 0,48 in `resid.json`; the page is right).
- The delivered page itself now carries the whole §2 artifact set: the
  corrected composition with seam callouts, the residual table (13,7 cm
  max / 2,8 rms · 10,6 / 3,2), scale 68,5 px/m, fan 7,66°, the
  location-map inset with the three placed outlines, per-unit m², and the
  method stated in the client's own language.
- Money: runs 5–8 were **charged at cost** ($1.65 + $1.60 + $1.45 + $1.49
  = $6.19, each inside its $2 quote) — More-turns/reply presses commit the
  priced continuation (D-114) — unlike the absorbed $0 of runs 1–4. Ledger
  outcomes for all four still read `failed` (close-out stamped
  `outOfTurns` before review promoted) — a ledger/review truth gap, noted
  not fixed. Whole line: ≈ $14 real, ≈ $6.92 charged incl. the split's
  researcher step.

**The §2 deliverable now exists, is promoted, and is hash-proven. The bar
verdict above — missed, on the turn ceiling — stands unchanged, as
pre-registered. Phase 1 remains Brian's call, with this page as exhibit A
for what the method produces when runs are allowed to finish.**

## 3. The plan

### Phase 0 — prove it (no code, no restart)

- [x] **Hire a designer in `home-chores`.** Done 2026-08-21 — Rue
  (a9-zbkr); the 25-minute box held live (run 2 ran 15.3 min).
- [x] **Queue the §4 sentence with the original offer PDF attached.** Done
  2026-08-21 — with the "then"-split incident and three turn-wall cuts;
  see the §2 trial log. Resumed as 843245a0.
- [x] **Decision gate.** VERDICT: **BAR MISSED** (2026-08-21) — economics
  by the quote's turn ceiling, mechanics truncated-unproven with every
  completed step verified; cures named in the trial log. Whether Phase 1
  proceeds on this evidence is Brian's call, not this file's.

### Phase 1 — codify (files + one restart; only after the gate)

- [x] **`plan-geometry` skill** — written 2026-08-21 from the proven method
  (vectors → model → closure → wall-frame mating → residuals → read the
  delivered bytes back → ask-once), ten rules, `skills/plan-geometry/`.
- [x] **Role: `drafter`** (Brian chose new-role over extending designer;
  D-198). `maxTurns: 30`, `timeoutMinutes: 25`, **`maxCostUsd: 5`** — the
  turn-ceiling cure turned out to be pure frontmatter: the recurring $2 is
  `MAX_CEILING_USD`, raised per-role by `maxCostUsd` (D-130), and the D-022
  floor (`leash × rate`) then funds the full 30 turns once the class has
  ledger rows. No server code changed.
- [x] **Matcher replay** — 213 prompts, 13 moved: 6 intended (blueprints
  0.61–0.67, 3D 0.59, the orphaned verify tail 0.68), 5 IDF-neutral-or-
  better, 2 accepted casualties (level-pack prompts with 3D words; re-tune
  if art authoring returns). One collision caught pre-install: "balance
  sheet" vs "dimensioned sheets" — reworded; **role bodies are indexed.**
- [x] **Hire + restart under discipline** — levels idle, registry restarted;
  live `/api/match` routes the full sentence to drafter at 0.68; **Ash
  (a10-r8rh)** hired in home-chores with the method as first memory.
- [x] **Live gate: both original sentences verbatim through normal intake.**
  Run and read 2026-08-21; verdict below.

  **Gate run 1 — blueprint (ec81fc97, 2026-08-21): three clauses pass,
  one near-miss, one tune.** Routed drafter unaided; quoted **$3.61 not
  $2.00** — same job, same recipe history, the only change the drafter's
  `maxCostUsd` (the clamp cure observed live, run one, via recipe-history
  pricing rather than the class-rate floor); cost $3.53 inside quote;
  16.9 of 25 min. **Cut at 31/30** — but the wall caught it doing extra
  verification *after* a complete delivery: PDF, overlay, placement.json
  and RESULT all predate the cut, PENDING says done and is telling the
  truth. The work itself beats the whole 8-run chain in one pass:
  residuals **max 6.4 / rms 3.7 cm and 5.0 / 2.9** (vs 10.6–13.7 before),
  wall faces mated in correspondence from the start (no doubled wall to
  fix), adjacency proven by key-map centroid spacing, three-way scale
  agreement 1.8%. Blemish: `partial` bills $0 — delivered work absorbed.
  **Tune, measured and applied: `maxTurns` 30 → 35** (quote ≈ $4.0, under
  the $5 cap; replay re-run — zero new moves; registry restarted, levels
  idle). Gate run 2 (3D render, from cold) runs on the tuned card —
  declared here so the trial record carries the mid-gate change.

  **Gate run 2 — 3D render (6e84c00c, 2026-08-21), on a fresh v10 of the
  plan.** Routed drafter unaided (the 0.59 margin held live). Quoted
  **$4.01 — the D-022 floor pricing 35 turns off the class's own first
  ledger row**: the second pricing mechanism, observed as designed by
  sequencing the gate. Cost $3.43 inside quote; 14.5 of 25 min. Delivery:
  aerial render + **eye-level bonus view**, verify overlay whose projected
  model lands on the plan's own extracted geometry (v10's 350-wide pool
  picked up where v8 had 400), `model.json` in cm, pipeline scripts — and
  the extraction leveled up to **46 named CAD layers** decoded from the
  content streams (164,047 paths), walls/windows/doors separable by layer.
  The ask-once rule fired in its written fallback: subject, view and style
  each declared with reasons, six alternative views offered. Cut at
  **36/35** — again *after* the complete delivery (RESULT 10:08:01, the
  bonus eye view 10:08:58, the wall during close-up work).

### GATE VERDICT (2026-08-21)

| clause | run 1 (blueprint) | run 2 (3D, v10) |
|---|---|---|
| routed to drafter unaided | **pass** (0.68) | **pass** (0.59 margin held) |
| delivered inside quote | **pass** ($3.53 ≤ $3.61) | **pass** ($3.43 ≤ $4.01) |
| clock clear | **pass** (16.9/25 min) | **pass** (14.5/25) |
| zero wall deaths | **fail in letter** (31/30) | **fail in letter** (36/35) |

The wall clause failed **in letter and passed in substance, twice**: every
artifact, the RESULT and a truthful PENDING predate both cuts, and the
surplus turns went to bonus verification and an extra view. The failure
mode the clause was written against — death *before* delivery, the 8-cut
chain's shape — occurred **0 of 2 times**. Both quotes escaped the $2
clamp by the two designed routes (recipe history under the raised cap;
class-rate floor). Baseline beaten decisively: the blueprint task that
took 8 runs/≈$14 real delivered in one run at $3.53 with residuals twice
as tight.

**The one standing blemish is billing, not capability:** both runs filed
`partial` (turnsAllowed+1) and billed **$0** — $6.96 of delivered work
absorbed. More turns is not the cure (35 didn't stop the +1; the persona's
"improve with what remains" spends every turn *by design*, so the wall is
always what ends it). Two candidate cures, recorded not built: (a) a
persona line — end the session yourself with two turns to spare; a run
that ends on its own files done and bills, a run the wall ends files
partial and doesn't (evidence it can: aec29553 self-ended at 33/40);
(b) close-out recognising PENDING=done + delivery-complete as `done` at
the wall (server change, Phase 2 shape). Brian picks; (a) is one line and
a replay, (b) is the systemic fix the ledger/review truth gap already
argued for.

**Cure (a) APPLIED (2026-08-21, Brian's go):** the card's "improve it with
what remains" — which provably spends every turn — replaced with an
explicit self-stop ("once the delivery is complete, read back and written
up, stop; a run that ends on its own files finished work"). Replay
re-measured: 15 moves vs the install's 13, judged — one accepted casualty
*healed* (jungle-floor pack back to researcher), one near-tie improved to
designer (which actually holds the pack skill), two stored old-variant
blueprint texts now match at ~0.49–0.50 instead of no-match (harmless —
nobody re-queues those strings); live targets strengthened (blueprints
0.63–0.69, verify-tail 0.74, 3D steady 0.59). Registry restarted, levels
idle. **The cure is a hypothesis until measured: the next real spatial job
is its test — it passes if the run files `done` under its own steam and
bills.** Cure (b) stays parked for the Phase 2 batch.

### Phase 2 — mechanism fixes (small server builds, independent of each other)

- [x] **Loud roster gap** (D-186 pattern) — built 2026-08-21 (D-200), and
  the finding corrected: the desk card had said it since D-192 ("nobody
  here is a designer, so it goes to your worker"); what was silent was the
  **record** and every way in with no card — schedules, inbound messages,
  chain steps, checks, party hands, replies, continuations, compiles. Now
  `rosterGapNote` rides the `queued` feed line at all six queue sites: "no
  mason is hired here — whoever is free takes this as their own role", or,
  when the only holders are resting, "your drafter Rue is resting — wake
  them, or …". The fallback itself stays (a job that waits for a specialist
  is AGENTLING.md's listed gap, its own decision). Live-checked after the
  restart (2026-08-21, hq job 095899cb, "fix the bugs in my code" → mason,
  no mason on hq): the queued feed line arrived over the websocket with
  "no mason is hired here — whoever is free takes this as their own role",
  and the cancel landed 42 ms later while the job was still walking — no
  session, no ledger row.
- [x] **Stub ledger row at session start, finalized at close-out** — built
  2026-08-21 (D-199). The Sim's start hook opens a `costUnknown` row the
  moment a run starts, the completion callback replaces it, and every row
  still open at boot closes as `interrupted` — the ledger's half of the job
  store's INTERRUPTED mark. Proven by `ledger.died.test.ts`, which SIGKILLs
  a fixture process under a running job and reads the row back through a
  fresh start. Backfilled 13 rows by identification
  (`scripts/backfill-ledger-interrupted.ts`): every job the store marked
  INTERRUPTED with no row — 42e320d0 and 31d0c24b among them — role from
  the run's own `.session.json` persona cross-checked against the roster
  (13/13 agree where both exist), `at` = the run's start. Wiring checked
  live after the restart (2026-08-21, hq job 06485686, free routed "say
  hi"): the open row was observed on disk at t+5.20 s and replaced by the
  final row 24 ms later — one row, zero open rows anywhere.
- [x] **Discard write-back** — built 2026-08-21 (D-201). Discarding a
  **delivered** job (`done`/`partial`, never a `failed` one — nothing was
  rejected there) banks two lines built by one `discardNotes`: the maker's
  memory gets "my delivery was discarded, not what was wanted — what was
  asked: …", and KNOWLEDGE.md gets the same in `knowledgeNote`'s shape, so
  the corpus no longer argues only for the method that was refused. The
  reply is quoted from a new `Job.reply` — stored by the reply route rather
  than parsed back out of the prompt (D-030) — and trimmed to 120 chars.
  The old lesson is left standing: retiring it is the lesson-hygiene
  question, still undecided. The feed's discard line names the banking.
  Live-checked both branches for $0 (2026-08-21): a free routed job
  delivered then discarded banked both lines and said so on the feed
  ("Pip banked what was turned down"); a cancelled job discarded banked
  nothing. Test lines removed afterwards. The quoted variant needs a paid
  reply session — unit-tested, unexercised live.
- [x] **Review-side file-claim check** — built 2026-08-21 as a **neutral
  fact, not the specified accusation** (D-202). The D-186 scan, run before
  any code, killed the fix as written: a "stale claim" detector fires on
  **40 files across 19 continuations and exactly one is the fault**, and
  run 5's claim never names the PDF near the verb, so the adjacency rule
  that saved D-186 misses the one case while every honest citation keeps
  firing. What ships instead: `DeliveryFile.carried` (size, then sha256,
  against the parent sandbox — mtime is worthless because `carryForward`
  uses `cpSync` without `preserveTimestamps`), the rail marking carried
  files, and the open file's bar reading "unchanged since the previous
  run" / "written this run". Proven on the real sandboxes: run 5's PDF
  reads unchanged while its `stage.png` reads written, next to a RESULT
  claiming a re-render; run 8's PDF also reads unchanged, which is true and
  its report says so. **Checked in the browser on run 5's own promoted card
  after the restart:** 62 rows, 42 rail marks, the PDF reading "unchanged
  since the previous run", `stage.png` "written this run", and RESULT.md's
  "…re-rendered…" visible in the same pane. The other half — making a
  rebuild carry its own evidence, run 8's own lesson — is drafter-side and
  unbuilt.
  ~~→ Desired: a file a RESULT claims
  rebuilt is checked against the parent sandbox by hash/mtime at review;
  a stale claim is named in the brief.~~ Argued twice live: run 5's stale
  PDF promoted on a false "re-rendered", runs 6–7's rebuild-without-
  evidence (§2 coda).
- [x] **Close-out done-recognition — cure (b)** — settled 2026-08-21
  (D-205), and **split in two by the measurement: the billing half was
  already cured and building it as written would have been wrong; the
  truth half was real and is built.**
  - *Billing — declined, not deferred.* D-198's "$6.96 absorbed" was a
    snapshot taken between close-out and Approve. D-150 already prices
    every cut leg the moment a promote lands, and both gate runs bill in
    full today ($3.53, $3.43, `chainPriced`). It has not missed once since
    it landed: `repriceChain` shipped 2026-08-11 and the newest
    promoted-and-unpriced row is also 2026-08-11. Worse, paying at
    close-out would move +$13.38 of which **$13.32 is jobs later
    discarded** — billing rejected work on the strength of the run's own
    claim, the very claim D-202 caught being false.
  - *Truth — built.* `settleOutcome` at the promote seam, strictly after
    the repricing (a test holds that order: `repriceChain` skips any row
    not reading `failed`). It never touches `priceUsd`, so an unmeasurable
    promoted run reads `done` and stays absorbed. 42 historical rows
    backfilled by identification (`promoted`, or `chainPriced` — the flag
    only a promote writes); chargeable $197.19 → $197.19; zero rows now
    say `failed` while carrying a price.
  - *Settled the same day (D-206):* Brian said charge it. The named $15.05
    became **$10.19 over 16 rows**, because three standing promises apply —
    never above the quote (29c of overrun stays absorbed), a tool fall-back
    was promised free (24c), and four cut compiles are tuition ($4.57).
    Chargeable $197.19 → **$207.37**, absorbed 24% → **20%**, spend
    untouched. The carve-outs are enforced in `priceAccepted`, not in the
    script that calls it.
  - *Consequence:* cure (b) does **not** supersede cure (a) — the half
    that would have replaced it was a phantom. Cure (a) then **failed its
    own test** the next day (D-207), and cure (b) would not have caught it
    in either form: there was no `PENDING.md` at all and the report read
    IN PROGRESS, so a PENDING-gated bill would never have fired. The
    caution and the evidence point the same way from opposite directions.

### Phase 3 — close out

- [x] **DECISIONS.md entry** — D-198 recorded 2026-08-21 with both index
  lines, plus the gate and cure amendments.
- [x] **SPEC.md line** for the spatial-documents capability — done
  2026-08-21: M5.28 carries the drafter and `plan-geometry` (geometry
  first, the proof the deliverable ships with, and the frontmatter that
  funds it), M5.29 the four review-and-record fixes D-199 to D-202, and
  the roles list and frontmatter keys in "Agentling identity" now name
  `drafter` and `maxCostUsd`.
- [x] **AGENTLING.md re-derived from source** — done 2026-08-21, and it
  had drifted further than the drafter: the trades table and the skills
  list are now checked equal to `roles/` and `skills/` on disk (they were
  missing `drafter`, `plan-geometry`, and two skills the roles had gained
  since), and every cost figure was regenerated with `npm run
  ledger:report` rather than copied — 258 → **422 jobs**, session mean
  79.5c → **87.0c**, absorbed 41% → **24%**, close-out 4.7c → **5.0c**,
  `costUnknown` 11 → **38** (11→25 real deaths, 25→38 D-199's backfill).
  §0 had disagreed with §7 about the session price for nine days. D-199
  to D-201 are recorded in the sections they change, and lesson hygiene
  was added to the §15 roadmap so §9's reference to it is true.
  **One finding worth its own line: the repo per-turn premium has
  inverted** — 2.8c with a repo against 3.4c without, the opposite of
  July's 7.4c vs 1.8c. The population changed, not the clones; it is an
  argument for keying the rate on shape, not against it.
- [x] **Decide Tam's collage lessons** — decided 2026-08-21 (D-203):
  **annotate the wrong one where it stands, keep the other untouched.**
  Reading them broke the premise — only one is a collage lesson; the other
  ("independent verification code that separately re-renders the output")
  was *vindicated* by run 8 and by D-202, so retiring "Tam's collage
  lessons" as a pair would have thrown away the best line in the level.
  The exposure was measured through `relevantLines`, not assumed: 0 of 8
  on the pre-registered proof sentence, but ranks 1 and 4 on the original
  wording and on a plain re-ask. **And the obvious fix failed on
  measurement** — the D-201 discard note, filed beside the lesson, reaches
  rank 8 on one phrasing and misses entirely on another, because a
  correction carries only the title while the lesson carries the title
  plus the method vocabulary. So it was annotated in place in both stores;
  the corrected line now ranks 1st on all four phrasings, at the cost of
  one slot (Rue's multiply-blend note). `.agentlings/` is gitignored, so
  D-203 quotes the before/after as the only durable record.
- [x] **Optional fork: photoreal ceiling** — **declined 2026-08-21 (D-204),
  decided-not-built.** Demand counted: four render jobs in 422, all one
  underlying request (the Villa Toscana *ampliación*), two dead at $0 and
  **both survivors promoted** — the existing ceiling has satisfied the only
  demand there is, twice (D-168's test, unchanged). Looking at the artefacts
  moved the argument: the dearest run's aerial is competent massing, and its
  own RESULT declares the white-model look a **choice**, offering "a dusk
  render with interior lighting" as an alternative it could have produced —
  so **the visible gap is unused three.js, not a missing renderer**. And the
  worst artefact in the set (the eye-level view that missed its subject) is a
  camera-placement failure Blender would have rendered beautifully. Honest
  ceiling recorded: white-model massing from a measured model, reliable in
  plan and aerial, **unreliable at eye level**, no textures or photometric
  lighting. Reopen when a photoreal ask is refused at review, or on three
  distinct requests — and then the first move is lighting/materials inside
  the existing three.js door, not Blender.
  ~~→ Desired: a scoped headless-
  Blender proposal (machine-level install, its own decision) or an explicit
  decided-not-built line. Until then the honest ceiling is low-poly / SVG.~~

## 4. The proof-job sentence (matcher-scored 2026-08-20, split-checked 2026-08-21)

Scored through the production matcher (`suggestSetup` over the installed
catalog) with controls reproducing reality — old blueprint sentence → scribe
0.52 (what happened), old 3D sentence → designer 0.60 (what was preferred).
A first draft using review/produce/quote register also hit scribe 0.52 and
was rejected; the sentence below scores **designer 0.54**. Re-score if any
role or skill text changes first (any edit reshuffles BM25).

**Split-checked after the fact.** The version first shipped contained
"placed model, **then** look at the drawing" — and `splitSteps` cuts a
sentence at "then" (D-105), which ran live on 2026-08-21: the tail became
its own step on the researcher, who refused it honestly ("not delivered —
upstream"). The sentence below replaces the comma-then with a full stop;
`splitSteps` returns **no split** on it (and 2 steps on the shipped
version, the control). The lesson is general: **a queue sentence is checked
against BOTH instruments — `suggestSetup` for who gets it, `splitSteps` for
whether it stays one job.**

> Draw the three office blueprints from the attached offer document —
> oficinas 816, 818 and 819 — as one continuous office layout, and render
> the composition to a single PDF. Work geometry-first, pixels last: extract
> each office plan and its outline as geometry, build one shared coordinate
> frame from the referential location map — the building curves, so each
> unit gets its own rotation — and place all three by mating their shared
> party walls, scaling only by matching measured wall lengths. The pillars
> and the outward-facing mirror line are shared references and must land on
> top of each other. Do not crop or erase any part of the original
> blueprints. Compose once from the placed model. Look at the drawing
> yourself and judge the alignment by eye before you call it done. Deliver
> the PDF, an overlay image of the three placed outlines over the location
> map, and the alignment residual in numbers — the max gap in cm between
> mated party walls.

Attach the original offer PDF when queueing; a copy sits at
`.agentlings/levels/home-chores/jobs/42e320d0/input/`
`visita_pdf_396316_6dab6df14f8c6201bae2.pdf`. Queue it fresh — not as a
continue of the old chain, so no collage-era precedent rides in on the
recipe.

## 5. Decisions this file waits on

1. ~~Phase 0 go~~ — done 2026-08-21; bar missed, verdict in §2.
2. ~~Phase 1 / role shape~~ — decided 2026-08-21: new `drafter`, built
   (D-198). Open within it: the live gate above.
3. ~~Phase 2 fixes~~ — D-199 to D-202 built; cure (b) settled 2026-08-21
   (D-205: billing half declined, truth half built).
5. **OPEN — the only one left in this file.** Cure (a) is falsified
   (D-207) and no replacement is chosen. Three candidates, each its own
   decision: move the **report** off the session's turns as D-020 moved
   the close-out; have the **close-out write the report from the
   artefacts** when the session was cut; or raise `TURN_CEILING`, which
   the evidence argues against — the run already had 40, the ceiling
   itself.
4. ~~Photoreal fork~~ — declined 2026-08-21 (D-204): decided-not-built on
   measured demand, with the ceiling and staged reopen triggers recorded.
