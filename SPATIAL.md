# Spatial documents — blueprints, floor plans, renders (2026-08-20)

**Status: proposal. This file decides nothing.** It follows `TEAMWORK.md`'s
pattern: each phase below ends in the decision it waits on, and anything Brian
picks goes through the ordinary gate — a `DECISIONS.md` entry when settled, a
`SPEC.md` line when scoped, `AGENTLING.md` re-read from source when it lands.
Figures were read from `.agentlings/ledger.jsonl` and the `home-chores` job
store on 2026-08-20; the standing rule applies — recompute before trusting
them later.

Current position: **Phase 0 complete — the §2 bar was MISSED; verdict in the
§2 trial log.** Nothing is built; Phase 1+ awaits Brian's call.

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

- [ ] **`plan-geometry` skill** distilled from 41fbbf49 + the proof job
  (vectors → model → closure numbers → deterministic re-render → overlay
  residual; includes the ask-once line for underspecified visual asks). →
  Desired: a fresh session can reproduce the rigor from the SKILL.md alone.
- [ ] **Role: new `drafter` vs extend `designer` (BRIAN DECIDES).** Budgets
  maxTurns ~30 / timeoutMinutes 25; card carries blueprint / floor plan /
  render / 3D / CAD / drawing. → Desired: a role whose budget shape fits
  render-heavy work and whose vocabulary attracts spatial sentences.
- [ ] **Matcher replay before install** (`npx tsx scripts/matcher-replay.ts`).
  → Desired: only the intended sentences move; zero unrelated re-routes.
- [ ] **Hire + restart under discipline** (`jobsRunning == 0`). → Desired:
  registry carries the role; no live session killed.
- [ ] **Live gate: both original sentences verbatim through normal intake.**
  → Desired: router picks the role unaided; both deliver inside quote, zero
  wall deaths; ledger starts the new price class.

### Phase 2 — mechanism fixes (small server builds, independent of each other)

- [ ] **Loud roster gap** (D-186 pattern). → Desired: queueing a job whose
  preferred role nobody holds prints a named line at the desk before the
  run; silent fallback gone.
- [ ] **Stub ledger row at session start, finalized at close-out.** →
  Desired: a hard-killed run still leaves a died/costUnknown row; the
  42e320d0 vanish is impossible; proven by a test that kills a session.
  Backfill of existing unmeasured rows only by identification (D-030).
- [ ] **Discard write-back** (mail-check disagreement precedent; folds into
  the T4 lesson-hygiene decision). → Desired: discarding a delivered job
  banks the rejection + Brian's last reply as the maker's lesson; verified
  by discarding a throwaway job.

### Phase 3 — close out

- [ ] **Record:** DECISIONS.md entry, SPEC.md line, AGENTLING.md re-read
  from source. → Desired: settled evidence, citable by ID.
- [ ] **Decide Tam's collage lessons** (banked from promoted v1, method since
  discarded; they can surface in future briefings). → Desired: explicit
  keep / retire / annotate — the first concrete case for the lesson-hygiene
  question.
- [ ] **Optional fork: photoreal ceiling.** → Desired: a scoped headless-
  Blender proposal (machine-level install, its own decision) or an explicit
  decided-not-built line. Until then the honest ceiling is low-poly / SVG.

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
2. Whether Phase 1 proceeds on Phase 0's evidence (method verified
   step-by-step, delivery killed by the turn ceiling) — and if so, the
   role shape: new `drafter` vs extend `designer`.
3. Phase 2 fixes: which of the three to build.
4. Photoreal fork: scope Blender, or decided-not-built.
