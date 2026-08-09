# Expansion — broadening what a job can produce (2026-08-08)

**Status: proposal. This file decides nothing.** Each pack below ends in the
decisions it needs; a pack Brian picks goes through the ordinary gate — a
`DECISIONS.md` entry when settled, a `SPEC.md` milestone when scoped,
`AGENTLING.md` re-read from source when it lands. This sits beside `GAPS.md`
(the 2026-08-06 engine-gap list, G4–G6 still open) on the same precedent:
a working list that retires when its rows are settled.

The question asked: could a job, a skill, or a combination produce *advanced*
results — architecture blueprints, formal PDF/PPT with custom design, flows
that work real websites, organizing real folders, deep research and analysis?
Method: the current surface re-read from source (six roles including
`designer`, eight skills, the outbox contract grep-verified to carry no
attachment field, `catalog/sources.json` already indexing `anthropics/skills`),
contrasted against three web-research sweeps run 2026-08-08. Benchmark figures
below are as reported by trackers that visibly disagree with each other; every
number carries its date, and the standing rule applies — recompute before
trusting any of them later.

---

## 1. What the research actually says

Three findings frame everything below.

**The industry converged on this app's grammar.** Claude Code (`PreToolUse`
hooks), OpenAI's Agents SDK (`needs_approval` + serialized `RunState`),
LangGraph (`interrupt()`), CrewAI (`@human_feedback`) — every major framework
in 2026 ships the same shape: pause, persist, resume around a
declared-sensitive step. That is Approve-is-the-send (D-075) as the industry
pattern. Every pack below therefore *extends* the promote grammar — patch →
apply, outbox → send, pack → install — and none bypasses it.

**Generation is near-solved; editing, reliability and long horizons are not.**
Slide generation scores ~4.4/5 on judge rubrics (DeepPresenter, Feb 2026)
while *editing real decks* sits at 45% (PPT-Eval, Jun 2026) and end-to-end
office work at 18–35% of human level (OmegaUse-OfficeVal best 17.91 vs human
27.79, Jul 2026; SpreadsheetBench 2 best 34.89%, Jul 2026). Frontier models
fail ~45% of realistic MCP-server tasks single-shot and more on repeat
(MCPMark 57.5% pass@1 / 44.9% pass^4, Dec 2025). Hour-scale autonomy: ~20.6%
end-to-end (OSWorld 2.0, Jun 2026) against a measured ~12 h / 50% METR
horizon (Jan 2026) — capability outruns coherence. Consequence for this plan:
**bias toward producing new artifacts, deterministic replay, and
verify-your-own-output** — the postures the engine already has — and leave
format-preserving editing of user files parked (§15 row), because the state
of the art has not earned it either.

**The production-proven document path is already installed here.** Anthropic's
own document skills (the ones behind claude.ai file creation,
`anthropics/skills`, last updated 2026-07-17) *create* decks with
**pptxgenjs** and documents with the **docx** npm library — both at this
project's root since 2026-08-01 (D-031). Their Playwright HTML→pptx pipeline
was deleted in Feb 2026 in favour of pptxgenjs-native generation. What they
have that this app lacks is not runtime: it is (a) the **design rulebook** —
palettes, layout variety, an explicit ban list — encoded as skill text,
(b) a **render-and-inspect QA loop** (LibreOffice headless → raster → look),
and (c) for styled PDFs, a layout engine (they use Python reportlab; the
industry default for designed PDF reports is HTML→Chromium print). Those
skills are browsable in this app's own library today (`anthropic-skills`
source) but assume Python + LibreOffice, so installing them verbatim runs
nothing — the bridge is Node-native skills written in their *approach*, in
our own words, against our own contract.

Benchmark anchors kept for contrast (all fetched 2026-08-08):

| Area | State of the art | Humans |
|---|---|---|
| Needle-in-web research (BrowseComp) | ~92% — Claude Opus 5 90.8% official (Jul 2026) | trained humans 29.2% in 2 h |
| Research reports (DeepResearch Bench) | RACE ~48.9 (Gemini DR); citation accuracy 90.2 (Perplexity) | rubric-judged |
| Desktop computer use, short tasks (OSWorld-Verified) | 85.4% (Jun 2026) | 72.4% |
| Web tasks, live sites (Online-Mind2Web) | ~90.5% (Mar 2026); production runs 10–20 pts lower | — |
| Hour-scale computer work (OSWorld 2.0) | ~20.6% binary (Jun 2026) | completes it |
| Deck generation (PPTEval) | 4.44/5 (Feb 2026) | — |
| Deck *editing* (PPT-Eval) | 45% success (Jun 2026) | 95.5% on the NCRE office exam |
| Complex workbooks (SpreadsheetBench 2) | 34.89% (Jul 2026) | — |
| Repo coding (SWE-bench Verified) | 96%, saturated (Aug 2026) | — |
| Private-data analysis (DABstep hard) | ~16% at launch baselines | — |
| Prompt injection on GUI agents | 17.8% single-attempt success unguarded (2026) | — |

---

## 2. The contrast, area by area

| Asked for | Today (from source) | Gap, named |
|---|---|---|
| Architecture blueprints | `scribe`/`scout` write prose; repo listing + clone + GitHub reads exist; **no diagram skill, no architect trade, review renders no diagrams** (no mermaid anywhere in `web/src`) | A blueprint discipline + a diagram the review can show |
| Formal PDF/PPT, custom design | The five libraries live at root with call shapes in the brief (D-031); `designer` role owns a render-and-judge loop for *worlds*, not documents; preview shows pptx as slide text, PDF inline | The design rulebook as skills; a styled-PDF layout path; visual QA for documents |
| Working real websites | Browser reads only — 8 of 24 tools, the twelve that act deliberately absent (D-034), measured weak as a reader (D-035, D-053) | An acting shape that goes through review — a decision, not wiring |
| Folders and content | Store syncs folders read-only (D-047), OCR (D-061), native folder picker (D-102); **writing outside the sandbox refused** (§10, §15) | A reviewed, replayable, undoable move plan — the boundary decision |
| Deep research | `scout` on Haiku, 12 turns; search + fetch live and measured (D-053–D-055); citations ride the corpus lines; a real briefing with a Gaps section shipped (Wave 5, 50.6¢); **10-min session wall, $2 ceiling, class rates tuned for short runs** | A researcher trade with the budget shape research needs |
| Deep analysis | `analyst` on Haiku, 6 turns, read/grep/bash; exceljs; DB row blocked on a credential existing (§15) | Script-first analysis discipline + charts the review can show |

---

## 3. The packs

Each names what it unlocks, the build shape (role + skills + engine seams),
the decisions it waits on, and the evidence that would prove it landed —
because the definition of done here is showing the evidence, not asserting.

### P1 — Blueprint pack *(smallest; no decisions; recommended first)* — **built, D-125**

**Unlocks:** "draw me the architecture of this repo" as a reviewable
deliverable: a C4-shaped document — context → containers → components — where
every box traces to a file or directory, plus an ADR when the job is a
decision.

**Build:**
- Role `architect` — read, grep, bash, write; default model; ~15 turns. New
  trade rather than a scribe variant because the verb routes differently and
  the work needs its own price class (G5's lesson priced that: a new class
  under-budgets its first ~3 runs while it learns its rate — expected, not
  tuned around).
- Skill `architecture-blueprints` — evidence-first (read before drawing;
  never a box the code cannot substantiate), C4 levels, Mermaid v11 output
  (`flowchart` + `architecture-beta`; the C4 syntax itself is still
  experimental upstream), ADR format, and "name what you did not read".
- Engine seam (small): render ```mermaid fences in the review preview —
  client-side, lazy-loaded. Mermaid is the lingua franca agents emit
  (v11.16.1, Aug 2026) and the one renderer that makes this pack visible.

**Evidence gate:** blueprint Agentlings itself; the diagram renders in
review; every named module exists (the T8·1 sweep style — checked by
enumeration, not by reading).

### P2 — Studio pack: decks, reports, styled PDFs *(the discovery pack)* — **built, D-128**

**Unlocks:** a branded one-shot deck or report — palette, layout variety,
real charts — produced in the sandbox, previewed in review, downloaded from
the outputs panel. Generation only; editing user files stays parked with the
§15 row, and the 45%-at-the-frontier editing numbers are the reason.

**Build:**
- Skill `deck-design` — pptxgenjs, in the production skills' approach and our
  own words: derive a palette from the topic or a stated brand, mandated
  layout variety, the ban list (no decorative stripes, no beige defaults, no
  centred body text), master slides, native `addChart`. The library gotchas
  (hex without `#`, `margin: 0`) belong in the skill text — D-031's lesson
  that an unnamed capability is not one.
- Skill `document-design` — the docx npm library: styles, headings, TOC,
  page furniture.
- Skill (or the same skill's PDF half) `pdf-report` — needs a layout path,
  which is the pack's one real decision (below).
- Roles: hand these to `designer` and `scribe` via the existing hand-to-role
  picker (D-089) first. A new `producer` trade only if routing or pricing
  demands one — do not pay the class tax before the work exists.
- Engine seams: **(a)** a `render_pdf` internal door — local sandbox HTML in,
  PDF bytes out, through Chromium print (Playwright is already in the stack
  by npx; the door is localhost-only like `/internal/fetch`, no network
  reach). **(b)** optional, later: a `render_office` door behind an
  availability check when LibreOffice is installed (ocr.ts's exact
  precedent — Windows-only capability behind a seam every caller asks), so a
  deck can be rastered and *looked at*, the designer's loop applied to
  documents. Ship without it first; validate structure, not pixels.

**Decision — the styled-PDF path:**
1. **HTML + CSS → Chromium print door** *(recommended)* — the 2026 industry
   default for designed reports, no new runtime, the door is small and
   reviewable.
2. pdf-lib direct — already installed but a drawing API, not a layout engine;
   fine for stamps and forms, wrong for designed pages.
3. Python + the Anthropic skills verbatim — a second runtime, previously
   declined; their document skills are also source-available proprietary
   while `skills/` is committed. **Park; revisit only if editing user files
   becomes real work.**

**Evidence gate:** one real deck job with a stated brand colour, reviewed in
the panel; the PDF door proves itself by rendering a report the reviewer can
open inline (the existing PDF preview already does that part).

### P3 — Deep-research pack

**Unlocks:** multi-source, cited, triangulated briefs as a trade rather than
a lucky scout run — the Wave 5 briefing shape (verdict first, per-claim
citations, an honest Gaps section) as the *standard* output of a research
job.

**Build:**
- Role `researcher` — default model (not Haiku: the scout is priced for
  errands, not synthesis), read/write/grep/web_fetch, ~30 turns; skills:
  `deep-research`, `cite-sources`, `concise-reports`.
- Skill `deep-research` — decompose the question into searches; two
  independent sources for any load-bearing claim; citation per claim with
  fetch date (the store's `[file, synced date]` convention, extended to
  URLs); a Gaps section naming what was not found; never pad a thin answer.
- Engine seams: **(a)** per-role session timeout — 10 minutes is the wall
  research hits first; a `timeoutMinutes` frontmatter field, clamped like
  `maxTurns`. **(b)** nothing else. The $2 ceiling stays: measured research
  runs cost 27–93¢ today, and raising a ceiling ahead of evidence is the
  mistake the quote machinery exists to catch. The class pays G5's tax while
  it learns its rate.

**What SOTA says the bar is:** product deep research runs 5–45 min and ~92%
on needle-finding; report *quality* is judged on citation trustworthiness
(90.2% accuracy is the best published). Agentlings' bar is not benchmark
parity — it is that a brief's every claim carries a source Brian can click,
and its Gaps section is honest. That is achievable at this budget shape.

**Evidence gate:** three real questions Brian actually wants answered, run
through the trade; spot-check citations against sources (the D-118 pattern —
the crew's claims verified against ground truth, not trusted).

### P4 — Analyst upgrade *(small; keeps expectations honest)*

**Unlocks:** analysis jobs that compute rather than recall — scripts over
CSVs/workbooks, numbers cited to cells, a chart the review can show.

**Build:**
- Skill `data-analysis` — computation happens in a script the sandbox keeps
  (never mental arithmetic — `tables-and-numbers` sharpened), input
  provenance per figure, and charts emitted as SVG (no chart library:
  exceljs cannot draw them, and an SVG is a file the review can render).
- Engine seam: SVG preview in the outputs panel, served inert (no scripts) —
  the PDF-inline precedent.
- The `analyst` role keeps 6 turns until a real job is cut short — "ran out
  of turns" has not meant "needed more turns" here (D-015, D-025).
- The database row stays §15-blocked on a read-only credential existing.

**Why modest:** private-data analysis is the *least*-solved area surveyed
(hard-split scores 15–50%, 2026). The app's structural answer is already
right — recurring analysis converges to compiled tools with `verify.mjs`,
deterministic and free — so this pack sharpens inputs and outputs rather
than pretending a skill closes a frontier gap.

### P5 — Organizer pack: real folders *(first boundary decision)*

**Unlocks:** "organize this folder" — a reviewed reorganization of a real
directory Brian names: content-aware sorting into a proposed structure,
renames included, never a deletion.

**Build (the shape that fits the grammar):**
- Reach: the level declares organizable folders through the existing native
  picker (D-102); the store's sync machinery already reads and OCRs them —
  the read half exists.
- The run writes `MOVES.json` — mkdir / move / rename ops only, each with
  source and destination, collision-checked at the seam like the outbox is.
- Review renders before/after trees; **Approve is the reorganization** —
  the server replays the manifest, stamps per-op results (the per-recipient
  send precedent), journals to `moves.jsonl`, and the journal reverses: undo
  is replay backwards. Nothing deletes — D-121's grammar (close, never
  delete) applied to files.
- OneDrive caution goes in the preview: moves inside a synced folder sync.

**Decision — write reach outside the sandbox (§10, §15):**
1. Status quo — organizing stays manual.
2. **Manifest replayed at Approve** *(recommended)* — deterministic,
   reviewable, journaled, reversible; the model proposes and never touches.
3. Granting sessions filesystem tools beyond the sandbox — **refuse**: §10
   is honest that the sandbox is an instruction, and this would formalize
   leaving it live.

**What SOTA says:** no credible product does content-aware organization (the
best consumer tool sorts on filenames only, never reads contents, 2026
reviews), and agent reliability on real filesystem servers is ~45–58% —
which is precisely the argument for option 2's deterministic replay over
live agent moves. This pack would be genuinely differentiated.

**Evidence gate:** first run against a *copy* of a real messy folder;
measure the proposal against Brian's own judgement; prove the journal
reverses cleanly before the real folder is ever named.

### P6 — Web-operator pack: flows behind the scenes *(the D-034-sized decision; last)*

**Unlocks:** "renew X on that portal", "fill this month's form" — multi-step
flows on named sites, drafted by a run, executed only at Approve.

**Build (the shape, if wanted):**
- The run — read-only browser, as today — drafts `WEBPLAN.json`: navigate /
  click / fill steps, each with its selector, its value, and an `expect`
  (what must be true before the step fires). Values that are secrets stay
  out; sign-in remains the user-made storage-state file (D-034's line:
  the app never sees a password).
- Review shows the step list and target screenshots; **Approve replays**
  through Playwright's acting tools server-side — per-step stamps, halt on
  any `expect` mismatch, a screenshot per step as the audit. The model acts
  never; a reviewed script acts once.
- Scope v1, hard: allowlisted sites per level; no purchases, no account
  creation, no CAPTCHA solving (429-and-CAPTCHA already measured as the
  wall, D-035).

**Decision:**
1. **Keep refusing** *(the standing default; respectable)* — the read case
   measured weak (D-035, D-053) and no real errand has demanded acting yet.
2. **Replay-at-Approve web plans** *(recommended if — and only if — Brian
   has real recurring errands of this class)* — it is the one acting shape
   consistent with D-034, and the 2026 injection numbers (17.8%
   single-attempt success against unguarded GUI agents) are D-034's argument
   quantified: the model that read the page never gets to act on it.
3. In-session acting — **refuse**, unchanged.

**What SOTA says:** live-web benchmarks read 62–90% with production 10–20
points lower; selector drift and auth walls are the leading failure modes;
hour-scale flows collapse to ~20%. The replay design dodges the worst of it
and inherits the rest as honest `expect`-halts — a draft can go stale
between review and replay, and the halt-plus-redraft is the design, not a
bug to fix later.

**Evidence gate:** one real errand Brian repeats, first against a test page;
the audit trail (screenshots per step) reviewed like `sends.jsonl`.

---

## 4. Cross-cutting

**Delivery is already the industry pattern.** Every surveyed product hands
binary files over as sandbox → storage → download link — exactly the outputs
panel (D-058). The one worthwhile extension, when a pack makes it real: an
optional `attachment` field on outbox messages so an approved gmail send can
carry the produced report (telegram: sendDocument, its 1024-char caption cap
noted). One contract decision, validated at the seam like `event` was
(D-104); not required by P1–P4.

**Every new trade pays the class tax.** G5 measured it: a new `jobClass` has
no rate, so its first runs convert ceilings into too few turns until ~3 rows
exist ($4.00 absorbed learning the designer class). Two new roles are
proposed here (`architect`, `researcher`) — expect the tax, and hire them
into the level where the work lives, because a role nobody holds does
nothing (D-112's whole lesson).

**Packaging.** Each pack is a role file + skill folders in the format the
catalog already installs verbatim and previews first (M3.4). Published to a
repo and added to `catalog/sources.json`, they become one-click installs —
and nothing shaped like them exists among the library's 532 entries today.

**Parked, each with its reason:** Python second runtime (editing user files
is unsolved at the frontier too — 45% — so the runtime buys little);
format-preserving docx/pptx edits (same evidence, §15 row stands); goal
decomposition (M6's trust question, untouched by any pack); in-session
acting (refused, above); CI status (blocked on a GitHub App); billing
(D-012's spine, no invoice on purpose).

---

## 5. Recommended order

| # | Pack | Why this position | Rough size |
|---|---|---|---|
| 1 | P1 Blueprints | No decisions; one small render seam; immediately visible | ~a day |
| 2 | P2 Studio | Libraries already installed; one door decision (HTML→PDF); high demo value | 2–3 days, phased |
| 3 | P3 Research | Role + skill + one frontmatter field; composes with schedules and steps | 1–2 days |
| 4 | P4 Analyst | Two small pieces; honesty pack | ~a day |
| 5 | P5 Organizer | Waits on the §10 write-reach decision; medium build after it | 2–3 days after the decision |
| 6 | P6 Web operator | Waits on the D-034-sized decision and on a real errand existing | the largest; only with both |

P1–P4 are wiring plus two small doors and could proceed on ordinary review.
P5 and P6 are decisions first, and the packs are written so the decision is
what gets made — not drifted into.

## 6. What none of this changes

Approve stays the send, the install, the reorganization and the replay. The
router still never guesses. Nothing is billed above its quote; failed work
is absorbed; a promise of free stays free. The sandbox plus review stays the
guarantee, localhost stays the boundary, and `.env` stays the only place a
secret lives.
