# Decision log

One entry per resolved question: the decision, and the evidence that settled
it. Newest last. Entry IDs are stable — quote them (`D-017`) rather than a
title or a line number, which both move.

Standing rules distilled from these entries live in CLAUDE.md under
"Hard-won rules"; this file is the account they came from. An entry is a
decision plus what proved it — length is whatever the evidence takes.

## Contents

- [D-001 — 2026-07-29 — Named "Agentlings"; separate from IGPL](#d-001--2026-07-29--named-agentlings-separate-from-igpl)
- [D-002 — 2026-07-29 — Adopted the Karpathy-inspired behavioral guidelines](#d-002--2026-07-29--adopted-the-karpathy-inspired-behavioral-guidelines)
- [D-003 — 2026-07-30 — Concept resolved: a personal real-work orchestrator](#d-003--2026-07-30--concept-resolved-a-personal-real-work-orchestrator)
- [D-004 — 2026-07-30 — Stack: TS monorepo, Vite/React/PixiJS web, Node/Hono/ws server](#d-004--2026-07-30--stack-ts-monorepo-vitereactpixijs-web-nodehonows-server)
- [D-005 — 2026-07-30 — External-app access is in-app MCP, never reused connectors](#d-005--2026-07-30--external-app-access-is-in-app-mcp-never-reused-connectors)
- [D-006 — 2026-07-30 — Agentling identity: roles, skills and memory in Claude-native formats](#d-006--2026-07-30--agentling-identity-roles-skills-and-memory-in-claude-native-formats)
- [D-007 — 2026-07-30 — M1: the real executor is one SDK session per job, in a child process](#d-007--2026-07-30--m1-the-real-executor-is-one-sdk-session-per-job-in-a-child-process)
- [D-008 — 2026-07-30 — Visuals phase 1: one master palette drives everything](#d-008--2026-07-30--visuals-phase-1-one-master-palette-drives-everything)
- [D-009 — 2026-07-30 — Visuals phase 2: art is data](#d-009--2026-07-30--visuals-phase-2-art-is-data)
- [D-010 — 2026-07-30 — Visuals phase 3: keep the built-in art, and fix the contract](#d-010--2026-07-30--visuals-phase-3-keep-the-built-in-art-and-fix-the-contract)
- [D-011 — 2026-07-30 — M3: user-friendliness for a non-expert](#d-011--2026-07-30--m3-user-friendliness-for-a-non-expert)
- [D-012 — 2026-07-30 — The cost model: estimating and measuring are one loop](#d-012--2026-07-30--the-cost-model-estimating-and-measuring-are-one-loop)
- [D-013 — 2026-07-30 — Structural: the boot flow, and levels as independent workspaces](#d-013--2026-07-30--structural-the-boot-flow-and-levels-as-independent-workspaces)
- [D-014 — 2026-07-31 — Terrain is data, closing the phase-3 deferral](#d-014--2026-07-31--terrain-is-data-closing-the-phase-3-deferral)
- [D-015 — 2026-07-31 — One-shot became a short leash, measured](#d-015--2026-07-31--one-shot-became-a-short-leash-measured)
- [D-016 — 2026-07-31 — The cost ceiling, corrected by measurement](#d-016--2026-07-31--the-cost-ceiling-corrected-by-measurement)
- [D-017 — 2026-07-31 — The quote's feedback loop was open](#d-017--2026-07-31--the-quotes-feedback-loop-was-open)
- [D-018 — 2026-07-31 — Confirming the four fixes live, and the ceiling breached again](#d-018--2026-07-31--confirming-the-four-fixes-live-and-the-ceiling-breached-again)
- [D-019 — 2026-07-31 — The crew was not learning, and it is the same bug a third time](#d-019--2026-07-31--the-crew-was-not-learning-and-it-is-the-same-bug-a-third-time)
- [D-020 — 2026-07-31 — Learning sweep: the write-up moves out of the session](#d-020--2026-07-31--learning-sweep-the-write-up-moves-out-of-the-session)
- [D-021 — 2026-07-31 — The fourth tier: a tool is a job compiled](#d-021--2026-07-31--the-fourth-tier-a-tool-is-a-job-compiled)
- [D-022 — 2026-07-31 — The turn caps, set by asking what actually gates the loop](#d-022--2026-07-31--the-turn-caps-set-by-asking-what-actually-gates-the-loop)
- [D-023 — 2026-07-31 — The promotion gate was selecting for the wrong work](#d-023--2026-07-31--the-promotion-gate-was-selecting-for-the-wrong-work)
- [D-024 — 2026-07-31 — The first unseeded compile was bad, and that is reassuring](#d-024--2026-07-31--the-first-unseeded-compile-was-bad-and-that-is-reassuring)
- [D-025 — 2026-07-31 — A compile gets its own turn cap](#d-025--2026-07-31--a-compile-gets-its-own-turn-cap)
- [D-026 — 2026-07-31 — The one-shot quote could never find its own history](#d-026--2026-07-31--the-one-shot-quote-could-never-find-its-own-history)
- [D-027 — 2026-07-31 — The unquoted way in](#d-027--2026-07-31--the-unquoted-way-in)
- [D-028 — 2026-07-31 — The socket was describing a world that had not changed](#d-028--2026-07-31--the-socket-was-describing-a-world-that-had-not-changed)
- [D-029 — 2026-07-31 — The compile rate split, measured and then not done](#d-029--2026-07-31--the-compile-rate-split-measured-and-then-not-done)
- [D-030 — 2026-07-31 — A UI/UX pass, where the arithmetic decided more than taste](#d-030--2026-07-31--a-uiux-pass-where-the-arithmetic-decided-more-than-taste)
- [D-031 — 2026-07-31 — Document capability: Node libraries at the project root](#d-031--2026-07-31--document-capability-node-libraries-at-the-project-root)
- [D-032 — 2026-08-01 — Reading the web is on by default, and Settings owns the switch](#d-032--2026-08-01--reading-the-web-is-on-by-default-and-settings-owns-the-switch)
- [D-033 — 2026-08-01 — The ellipsis the model believed, and the answer with nowhere to go](#d-033--2026-08-01--the-ellipsis-the-model-believed-and-the-answer-with-nowhere-to-go)
- [D-034 — 2026-08-01 — A browser that reads and cannot act](#d-034--2026-08-01--a-browser-that-reads-and-cannot-act)
- [D-035 — 2026-08-01 — The browser measured, and the case for it is weaker than the case made for it](#d-035--2026-08-01--the-browser-measured-and-the-case-for-it-is-weaker-than-the-case-made-for-it)
- [D-036 — 2026-08-01 — A method is only as good as what was available when it was found](#d-036--2026-08-01--a-method-is-only-as-good-as-what-was-available-when-it-was-found)
- [D-037 — 2026-08-01 — The rest of the axes, as one surface rather than five comparisons](#d-037--2026-08-01--the-rest-of-the-axes-as-one-surface-rather-than-five-comparisons)
- [D-038 — 2026-08-01 — CLAUDE.md trimmed to what the harness does not already do](#d-038--2026-08-01--claudemd-trimmed-to-what-the-harness-does-not-already-do)
- [D-039 — 2026-08-01 — The close-out cost never reached the ledger](#d-039--2026-08-01--the-close-out-cost-never-reached-the-ledger)
- [D-040 — 2026-08-01 — The code host is builtin, because the budget for a stdio server is not ours](#d-040--2026-08-01--the-code-host-is-builtin-because-the-budget-for-a-stdio-server-is-not-ours)
- [D-041 — 2026-08-02 — A clean exit is not a delivery, and scout could not write](#d-041--2026-08-02--a-clean-exit-is-not-a-delivery-and-scout-could-not-write)
- [D-042 — 2026-08-02 — The quote overshot sevenfold, and narrowing it did not help](#d-042--2026-08-02--the-quote-overshot-sevenfold-and-narrowing-it-did-not-help)
- [D-043 — 2026-08-02 — The tool tier could not fail into a session, and its absorption was invisible](#d-043--2026-08-02--the-tool-tier-could-not-fail-into-a-session-and-its-absorption-was-invisible)
- [D-044 — 2026-08-02 — Landing three times does not make a method compilable](#d-044--2026-08-02--landing-three-times-does-not-make-a-method-compilable)
- [D-045 — 2026-08-02 — The first compile produced a cache, and its own check could not tell](#d-045--2026-08-02--the-first-compile-produced-a-cache-and-its-own-check-could-not-tell)
- [D-046 — 2026-08-02 — The knowledge store: opened, not settled](#d-046--2026-08-02--the-knowledge-store-opened-not-settled)
- [D-047 — 2026-08-02 — The knowledge store is synced and indexed, never read live](#d-047--2026-08-02--the-knowledge-store-is-synced-and-indexed-never-read-live)
- [D-048 — 2026-08-02 — The knowledge store built, and the free tier caught guessing](#d-048--2026-08-02--the-knowledge-store-built-and-the-free-tier-caught-guessing)
- [D-049 — 2026-08-02 — The store measured, and the second unquoted way in](#d-049--2026-08-02--the-store-measured-and-the-second-unquoted-way-in)
- [D-050 — 2026-08-02 — Three tiers of capability, and what a compiled tool may inherit](#d-050--2026-08-02--three-tiers-of-capability-and-what-a-compiled-tool-may-inherit)
- [D-051 — 2026-08-02 — The crew's first real finding: the recall tier counts where recipes weigh](#d-051--2026-08-02--the-crews-first-real-finding-the-recall-tier-counts-where-recipes-weigh)
- [D-052 — 2026-08-02 — A claim about the turn cap, withdrawn, and the instrument that was missing](#d-052--2026-08-02--a-claim-about-the-turn-cap-withdrawn-and-the-instrument-that-was-missing)
- [D-053 — 2026-08-02 — A missing capability is not refused, it is substituted](#d-053--2026-08-02--a-missing-capability-is-not-refused-it-is-substituted)
- [D-054 — 2026-08-02 — A search connection, built because the gap was measured](#d-054--2026-08-02--a-search-connection-built-because-the-gap-was-measured)
- [D-055 — 2026-08-03 — A free tier for finding pages, and what it must never claim](#d-055--2026-08-03--a-free-tier-for-finding-pages-and-what-it-must-never-claim)
- [D-056 — 2026-08-03 — The ledger gains an author, and the panels that needed one](#d-056--2026-08-03--the-ledger-gains-an-author-and-the-panels-that-needed-one)
- [D-057 — 2026-08-03 — Two ways to count one thing, and why the slower one stays](#d-057--2026-08-03--two-ways-to-count-one-thing-and-why-the-slower-one-stays)
- [D-058 — 2026-08-04 — A document is shown where it lands, and two listings become one](#d-058--2026-08-04--a-document-is-shown-where-it-lands-and-two-listings-become-one)
- [D-059 — 2026-08-04 — The store reads documents, and the splitter that made it real](#d-059--2026-08-04--the-store-reads-documents-and-the-splitter-that-made-it-real)
- [D-060 — 2026-08-04 — A grid is not prose, and the readers stop being written twice](#d-060--2026-08-04--a-grid-is-not-prose-and-the-readers-stop-being-written-twice)
- [D-061 — 2026-08-04 — Reading paper: the engine Windows already has](#d-061--2026-08-04--reading-paper-the-engine-windows-already-has)
- [D-062 — 2026-08-04 — Two faults found by reading the panel copy back against the code](#d-062--2026-08-04--two-faults-found-by-reading-the-panel-copy-back-against-the-code)
- [D-063 — 2026-08-04 — The run is told its budget, and delivers before it ends](#d-063--2026-08-04--the-run-is-told-its-budget-and-delivers-before-it-ends)
- [D-064 — 2026-08-04 — A method earns the leash by having worked, not by existing](#d-064--2026-08-04--a-method-earns-the-leash-by-having-worked-not-by-existing)
- [D-065 — 2026-08-04 — The leash gets its own counter, because it was asking a different question](#d-065--2026-08-04--the-leash-gets-its-own-counter-because-it-was-asking-a-different-question)
- [D-066 — 2026-08-04 — Carrying on, rather than asking for a smaller request](#d-066--2026-08-04--carrying-on-rather-than-asking-for-a-smaller-request)
- [D-067 — 2026-08-04 — The quote wins against a role's standing guess](#d-067--2026-08-04--the-quote-wins-against-a-roles-standing-guess)
- [D-068 — 2026-08-04 — A leash has to be a shortening, not a different job](#d-068--2026-08-04--a-leash-has-to-be-a-shortening-not-a-different-job)
- [D-069 — 2026-08-04 — A method halved a real job, with no leash and no tier change](#d-069--2026-08-04--a-method-halved-a-real-job-with-no-leash-and-no-tier-change)
- [D-070 — 2026-08-04 — A quote that could not find its history, and the copy that covered for it](#d-070--2026-08-04--a-quote-that-could-not-find-its-history-and-the-copy-that-covered-for-it)
- [D-071 — 2026-08-04 — The third run says the halving was a step, not a trend](#d-071--2026-08-04--the-third-run-says-the-halving-was-a-step-not-a-trend)
- [D-072 — 2026-08-04 — Seven runs of one sentence, none of them recording it was the same job](#d-072--2026-08-04--seven-runs-of-one-sentence-none-of-them-recording-it-was-the-same-job)

## By theme

The Contents above is chronological; this is the way in when you know the
subject but not the ID. Lived in CLAUDE.md until D-038 and moved here so a new
entry updates one file rather than two.

- **Concept, stack, outside access, identity, executor** — D-001–D-007, D-032,
  D-034–D-035
- **Visuals and terrain** — palette, art-as-data, art source, scenes-as-data:
  D-008–D-010, D-014
- **Levels as workspaces, and the non-expert setup path** — D-011, D-013
- **Cost** — quotes, ceilings, turn budgets, rates, billing: D-012, D-016–D-018,
  D-026–D-027, D-029; D-067, where the quote stops losing to a role's standing
  guess about a trade; and D-070, the third form of one fault — a quote that
  cannot find its history cannot tighten, whether the class it looks up is
  wrong (D-026, D-029), in the wrong field (`quoteClass`), or absent because
  the matcher declined to name one — and D-072, where it was never written down
  at all for any run that took a method without the leash, which is most of
  them; that entry also records why the pinned ceiling was measured and then
  left alone rather than fixed — and is amended with what settled and what did
  not, since the freak-run diagnosis it rests on has since been resolved by the
  fix while the ceiling stayed at the clamp for a different reason entirely
- **Learning** — recipes, close-out, compiled tools, promotion: D-015,
  D-019–D-025, D-036–D-037; and D-069, the first measurement of a banked method
  against work somebody actually wanted done, which halved the job **without**
  the leash and so credits the approach with a saving the tier averages had
  been attributing to the tier change — read with D-071, where the third run
  lands between the first two and turns the halving back into a single step
  followed by noise, exactly as §8 says a recipe behaves
- **Socket payload, UI/UX, documents, answering a run** — D-028, D-030–D-031,
  D-033
- **The project's own notes** — D-002, D-038
- **Cost, continued** — D-039
- **Outside access, continued** — D-040
- **Delivery and roles** — D-041
- **Quoting, continued** — D-042
- **The fourth tier, in service** — D-043, D-044, D-045
- **Outside access, continued again** — the knowledge store: options in D-046,
  settled as sync-and-index by D-047, built in D-048
- **The free tier's honesty** — the recall tier scoring on its own asking
  words: D-048
- **The store measured on real work, and quoting `noRouter`** — D-049, which
  also closes the second unquoted route (D-027 is the first)
- **Where capability lives** — the three tiers, what may graduate between them,
  and why a tool's surface is recorded but not gated on: D-050
- **The crew working on itself** — the rarity asymmetry the recall tier has and
  recipes do not, and what a job's phrasing costs: D-051
- **What a turn is spent on** — a withdrawn claim about the cap, and the tool
  counter that had to exist before it could be asked: D-052
- **How to ask for work** — what the crew does when a capability is missing, and
  why "find out" is a budget instruction: D-053
- **Finding a page** — the search connection and why it is builtin: D-054,
  and the free tier that answers a bare search without a session: D-055
- **Reading the crew record** — the productivity block and the inbox, the author
  the ledger never recorded, and the three tests that passed without testing:
  D-056
- **Documents, continued** — produced in D-031, and shown rather than merely
  offered in D-058, which also collapses the second listing and the second
  ordering (D-030's shape again); read *into* the knowledge store by D-059,
  where the splitter was the feature and the extensions were the easy half;
  and D-060, which adds the two formats that are not prose at all and puts the
  readers in one module before the second copy could be written; D-061 reads
  paper itself, with the one Windows-only file in the project behind a seam,
  and D-062, where reading the panel copy back found a silent cap and a budget
  charged the wrong number — plus a correction to what D-061 claimed
- **Counting what is actually there** — a per-source count taken before dedupe,
  and the second derivation left in place on purpose rather than collapsed:
  D-057, which is D-030's rule met head-on and answered
- **Running out of turns** — the first real job in a real level died with an
  empty sandbox because nobody had told it there was a budget: D-063, where the
  fix is measured as a paired re-run rather than asserted; and D-064, where that
  fix banked a method from a run that had not finished and would have handed the
  next one half the turns, so a recipe now has to have landed before it may
  shorten anything. D-065 is the correction to that gate — the counter it used
  answers the compile question, not the leash's, and using it locked no-repo
  work out for ever while repo work earned the leash without finishing. D-066
  stops asking the user to shrink the request and lets a cut-off run be picked
  up instead; four runs of one sentence now compound for less each time and not
  one of them has ever finished, which is where the per-run turn cap comes due.
  D-067 pays it: the quote now outranks a role's standing guess, since the rule
  that said otherwise was guarding against a pooled rate that has since been
  fixed — and the same measurement exposes the next layer of it, a rate that
  averages a class and so over-funds any job dearer than its own class. The job
  then **finished**, on the fifth run, which settled that it was never too big;
  and the completion promptly armed the next failure, since fitting a 33-turn
  budget was about to license a five-turn leash: D-068, the third reading of a
  gate as licensing something it never verified

## D-001 — 2026-07-29 — Named "Agentlings"; separate from IGPL

Named "Agentlings" (agents + -lings, Lemmings homage); lives at
`Escritorio\Agentlings` as a sibling of IGPL, fully separate context.

## D-002 — 2026-07-29 — Adopted the Karpathy-inspired behavioral guidelines

Adopted the Karpathy-inspired behavioral guidelines
(multica-ai/andrej-karpathy-skills) as the base of this CLAUDE.md.

## D-003 — 2026-07-30 — Concept resolved: a personal real-work orchestrator

Concept resolved (design interview): personal real-work
orchestrator for local coding jobs; literal 2D world; independent job
queue; sandbox + review outputs. Details in SPEC.md.

## D-004 — 2026-07-30 — Stack: TS monorepo, Vite/React/PixiJS web, Node/Hono/ws server

Stack: TS monorepo (npm workspaces) — Vite + React + PixiJS
web, Node + Hono + ws server, Vitest; Claude Agent SDK planned as the
real executor (M1).

## D-005 — 2026-07-30 — External-app access is in-app MCP, never reused connectors

External-app access for agentlings happens in-app (MCP
connection registry, per-job opt-in; sketch in SPEC.md M2) — never by
reusing claude.ai / Claude Code connectors.

## D-006 — 2026-07-30 — Agentling identity: roles, skills and memory in Claude-native formats

Agentling identity: per-agentling roles in Claude-native
formats (subagent .md in `roles/`, SKILL.md in `skills/`, installable
from GitHub URLs), per-agentling memory files, profile popup on sprite
click. M0 stores identity; the M1 executor enforces it. See SPEC.md.

## D-007 — 2026-07-30 — M1: the real executor is one SDK session per job, in a child process

M1 built: real executor = one Claude Agent SDK session per
job in a child process (agent-runner.mjs, plain node) with laundered
env — never import the SDK into the server/tsx process (it wedges the
loader). Repo jobs: local clone + DIFF.patch review; promote =
git apply. Auth via .env (see .env.example).

## D-008 — 2026-07-30 — Visuals phase 1: one master palette drives everything

Visuals phase 1: one master palette (DB32) drives every
theme, sprite and thumbnail; canvas scales by whole numbers with
letterbox; optional CRT filter; iris-wipe transitions; particles;
Press Start 2P (OFL) for signage only.

## D-009 — 2026-07-30 — Visuals phase 2: art is data

Visuals phase 2: art is data. `npm run art` bakes the
hand-authored frames into `web/public/art/agentling.png` plus an
Aseprite-shaped atlas (cycles name their frames, since ours reuse them);
the runtime prefers that sheet and falls back to the same frames as JSON,
so the two can never drift. Anything loaded is snapped onto DB32, which
is a no-op for our own art and is what makes an outside pack belong.
The palette moved to `packages/shared` — it is a product decision, not a
rendering one.

## D-010 — 2026-07-30 — Visuals phase 3: keep the built-in art, and fix the contract

Visuals phase 3 (art source), resolved: **keep the built-in
art**. It is original, coherent and already DB32; now that phase 2 makes
swapping it a file copy, the decision is reversible and does not have to
be made under pressure. What is not deferred is the contract — a pack
must supply walk/work/deliver by name, uniform frame size, facing right,
feet on the bottom edge, transparency not a matte; `npm run art:check`
enforces it and `art/PACK.md` is the brief. Any resolution is allowed:
the world scales to frame height. A pack's licence lands in this repo,
so terms get recorded before installing — free rarely means
unconditional, and committing a pack here is redistribution.
Deferred: making `drawScenery` data-driven, which every external-terrain
route needs. It is a large rewrite whose whole point is how it looks, so
it waits for a Browser pane that is actually displayed — the hidden pane
freezes the render loop and it would be reshaped blind.

## D-011 — 2026-07-30 — M3: user-friendliness for a non-expert

M3 direction (user-friendliness for a non-expert): every
setup step becomes a plain-language sentence. The concept matcher is
local, deterministic and required to work with no auth and no network;
an LLM tier only ever refines it. Intent words outrank domain words;
confidence leans on coverage; unknown words surface as gaps that will
drive library search. Library installs stay preview-first and
SHA-pinned — an installed role or skill is executable instruction, and
the user is not an expert. See SPEC.md M3.

## D-012 — 2026-07-30 — The cost model: estimating and measuring are one loop

Cost model (designed for pass-through billing, even though
use is personal today). Estimating and measuring are two halves of one
loop, not alternatives: the router already sorts work into three tiers
with genuinely different cost behaviour (routed = certain zero, recipe
hit = narrow band from observed history, cold job = bounded by maxTurns
× model), so a quote is a lookup over history rather than a model, and
it tightens as recipes accumulate. Decisions: quote a ceiling and
enforce it, so the user is never billed above the quote; the app absorbs
jobs that cost money and fail, which puts the incentive on failing fast;
the ledger records observed cost and chargeable price as separate
numbers from day one, because a ledger cannot be reconstructed
retroactively; quotes are shown in money with the certainty stated.
Observed cost comes from the SDK's total_cost_usd — no price table to
maintain. Reselling model access has terms implications Brian should
confirm with Anthropic before billing anyone.

## D-013 — 2026-07-30 — Structural: the boot flow, and levels as independent workspaces

Structural: 90's boot flow (title → level select →
level). Levels are independent workspaces (own crew/jobs/memory +
per-level KNOWLEDGE.md fed only to that level's sessions); the
roles/skills catalog stays global. Crews start at 2, hire in-level.
Themes are hand-tuned palettes; card thumbnails render from them.
Legacy cave migrated to levels/hq. Details in SPEC.md.

## D-014 — 2026-07-31 — Terrain is data, closing the phase-3 deferral

Terrain is data, closing the phase-3 deferral. A theme used
to be fifteen colours and nothing else while `drawScenery` drew a cave
regardless, so Home Chores rendered stalactites and hanging vines in
beige. Scenes are now data (`world/scene.ts` + `world/scenes/*`), and a
theme names a place as well as a palette. The design decision worth
keeping is what the format is **not**: not a drawing language. Composing
seeded speckle, mineral veins and a jagged ceiling out of primitives ends
in a small unauthorable programming language, so the vocabulary is
parameterised *idioms* — ceiling, speckle, veins, tufts, repeat, band —
plus three primitives. Coordinates are `"groundY-40"`, one regex, not an
expression evaluator; colours are theme slot names, so a scene never
hard-codes a palette. Each top-level op draws from its own seed, because
a format where inserting an op repaints everything after it is one nobody
can author in. The interpreter targets a `Surface`, so the same data
paints the world, the level cards (previously a second hand-drawn cave
that could disagree with the level it previewed) and a recorder in tests.
The cave is transcribed op for op — the built-in art is kept, as phase 3
decided; only its noise falls differently. chalkboard and marble point at
the cave until someone writes them, which is now a data file rather than
a rewrite. External terrain packs are unblocked but deliberately not
built: no loader ships until there is a pack worth loading.

## D-015 — 2026-07-31 — One-shot became a short leash, measured

One-shot became a short leash (3 turns), measured. At one
turn the tier could not work: a turn ends before the model sees any tool
result, so anything that must read before it writes — every repo job — is
impossible. Run live it failed on max_turns having written no files at
all, and cost **more** than the full session it replaced ($0.17 vs
$0.14), since it paid for the system prompt with no cache to read. At 3
turns the same job produces a correct, promotable diff for ~$0.11 against
~$0.27–0.44 for the 8-turn run. A recipe means explore less, not work
blind. Two bugs fell out and are fixed: promote refused to apply a failed
job's patch while still stamping it "promoted" (silent no-op — the worst
outcome), and a failed run was filed as tier `session`, polluting the
history the quote reads. Still open: a short-leash run ends `failed`
because the RESULT/LESSON/APPROACH write-up does not fit in 3 turns, so
the diff is promotable but the card reads as a failure. **Resolved the
same day**: a run that dies holding a diff is now `partial`, its own
status, reviewable exactly like finished work — the output was good, only
the label was wrong. Cancelling stays `failed` even with a diff, since you
stopped it on purpose. Measured across eight runs the leash yields a
usable diff roughly two times in three, for ~$0.11 against ~$0.44; the
prompt trim (a recipe run is not asked to re-write the method it was just
handed) is principled but its effect was within noise at this sample size.
**Reliability fixed by measurement, not tuning** (2026-07-31): watching
the tool calls live showed every repo run opening with `ls` or
`Get-ChildItem` before it could do anything — one of three turns spent
discovering a layout the server already knew. The clone's file listing now
goes into the prompt, and the orientation call disappeared from every
trace: 4/4 runs produced an identical diff, against 3/5 before. The lesson
generalises — when a run is short of turns, look at what it spends them on
before spending more of them. Recipe matching
left strict deliberately (same-shape jobs score 0.33 against a 0.65 bar)
— revisit with evidence, not intuition.

## D-016 — 2026-07-31 — The cost ceiling, corrected by measurement

Cost ceiling, corrected by measurement. The mid-flight
dollar check could never work: the session stream carries no running
cost. Measured — the only `total_cost_usd` in a 35-message session
arrives on the last one, and per-message usage is partial (52 output
tokens reported against a true 568). So the check only ever fired after
the money was spent, and its sole effect was to relabel a finished
session as failed. Replaced with the budget that binds *before* the
spending: the quote is divided by observed cost-per-turn to set
`maxTurns`. It only ever tightens — a rich quote must not let a job run
longer than its role allows — and with no history the role's budget
stands. Priced per turn *granted*, not per turn the SDK reports: those
are different quantities (a cap of 4 came back as 6), and pricing
against the reported number left budgets ~1.5× loose *for capped runs*;
measured later across real history the distortion runs both ways, since a
run that finishes early reports fewer turns than it was granted, so the
fallback was noise rather than a one-way bias (corrected 2026-07-31, and
the fallback is now gone: only `turnsAllowed` rows price a turn). Note the
user was
never over-billed: `priceFor` already caps charges at the quote. What
was unbounded was the app's absorbed cost.

## D-017 — 2026-07-31 — The quote's feedback loop was open

The quote's feedback loop was open, found by running it end
to end: quote a job, run it, compare. A job quoted at 30c — "about 15c,
done this 4 times before", *high* confidence — cost **59c**, ran out of
turns and filed `partial` holding a good diff. Billing held (`priceFor`
charged zero, the app absorbed all of it), but re-running the estimator
afterwards showed the quote for the identical next job had not moved a
cent. `history()` read `done` rows only, and the runs that break a quote
are exactly the ones that exhaust their turns and file failed or partial,
so the average could not see its own worst cases: it saw 4 scribe runs at
a mean of 15c while 5 runs had really cost money, at 24c — $0.59 invisible,
and the same hole hid $0.60 of worker spend. Fixed by counting every run
that spent money, in `history()` and in quoteFor's tier fallback alike.
That nobody is billed for a failure is a *billing* decision and `priceFor`
makes it; a quote bounds spending, and spent money is spent whatever the
outcome. The scribe quote moved to "about 24c", ceiling 50c. Three things
stay open **deliberately**, and all three are the same shape — a mechanism
that is correct but currently inert. The turn budget still never binds:
quote ÷ rate came to 17 turns against a role cap of 8, before and after, so
the ceiling from `b3be508` does nothing wherever the cap is the smaller
number. `DEFAULT_CEILING_USD` clamps the learned ceiling at 50c, so a
repeat of that same job would still breach by ~19%. And the job class is
the *matched* role, so wording that matched `mason` — a role nobody holds —
quoted off the tier average instead, moving the same work from "about 15c,
high confidence" to "up to 50c, first time". Cost per turn is not a
property of a role either: this run burnt 7.4c/turn against a class rate of
1.8c, driven by 280k cache-read tokens on a repo job, which the class key
does not record. Across the whole history, 3 of 6 quoted runs breached.
**The first of the three resolved the same day**, and the fix was the last
sentence rather than the first: the clamp was never the problem. A ceiling
binds exactly when the rate exceeds ceiling ÷ role cap — 50c ÷ 8 = 6.25c a
turn — and the work really burnt 7.4c, so it *should* have bound and only
failed to because the rate was pooled across repo and non-repo runs. So the
ledger now records `hasRepo` and `costPerTurn` narrows to runs of the same
shape. The separation is not marginal: per turn, repo runs cost 4.4× a
scribe's non-repo runs and 10× a worker's. On the real ledger the measured
job now budgets 6 turns for a predicted 44c under its 50c ceiling, where it
took 8 and spent 59c; worker-with-repo correctly stays at 8, since 8 turns
at its rate still fits. Rows written before the field are left unshaped
rather than assumed — mixing them back in is the averaging that caused
this — so a one-off `scripts/backfill-ledger-shape.mjs` reads the shape back
off the job records still on disk, which is where repoPath always lived;
without it the fix would have been correct and inert. The quote is
deliberately *not* segmented the same way: it stays the promise to the user,
and the budget is how the promise is kept.
**The second resolved the same day too.** `DEFAULT_CEILING_USD` was one
constant doing two jobs: what a quote says in ignorance, and the most a
quote may ever say. Conflating them made the quote promise *less* than the
history it was reading — it held evidence of a 59c run and promised 50c, so
it broke a promise it had the evidence to keep. Split into
`DEFAULT_CEILING_USD` (ignorance, still 50c) and `MAX_CEILING_USD` (runaways
only, $2), with `AGENTLINGS_MAX_COST_USD` now an absolute cap rather than a
default. Scribe's ceiling becomes 71c and that run is covered. The
consequence is worth stating plainly rather than discovering later: an
honest ceiling **un-binds** the turn budget, because the budget was only
biting while the quote was artificially low — 8 turns at 7.5c is 60c, inside
71c. That is not one fix undoing the other; they are alternative routes to
the same guarantee. Make the promise true, or make the spending fit a
smaller promise — both prevent a breach, only the second shortens the run.
The budget stays live as the backstop and fires the moment a ceiling is
genuinely tight: measured across caps, $0.40 gives 5 turns and $0.25 gives
3, every one of them inside its quote.
**The third was a mislabelling, not a pricing bug.** The class was
`job.preferredRole`, the role the *matcher* named — but `nextUnassigned`
deliberately lets any free agentling pick up work routed to a role nobody
holds, and the session then runs as *their* role: their prompt, their tools,
their turn cap. A mason job done by a worker was therefore filed as a mason
job, building a history for work that never happened while robbing the role
that really did it, and the rate lookup then found no mason history and fell
back to the role cap. Latent rather than realised — 0 of 23 checkable rows
were mislabelled, since every job so far happened to be taken by a matching
agentling — so nothing needed backfilling. Now the ledger records the role
that ran, the rate prices by the role about to run, and `runnerRole()` in
work.ts predicts it for the quote. Measured on the phrasings that exposed
it: "add tests for formatUsd" matches `mason`, which nobody holds, and
quoted "up to 50c — first time doing this" off 0 samples; it now quotes
"about 17c — done this 9 times before" off Pip's worker history, because Pip
is who actually does it. The instability is reduced, not removed, and what
remains is honest: the same sentence can still land on a scribe (28c) or a
worker (17c), and those really are different costs.

## D-018 — 2026-07-31 — Confirming the four fixes live, and the ceiling breached again

Confirming the four fixes live, and the ceiling breached
again. Job `d618e774`, matched to `mason` which nobody holds: the class fix
is proven — the row reads `jobClass: worker`, the role that actually ran it
(Pip), where the old code would have written `mason`. The learning loop is
proven too: quoted 52c, cost 81c, and the *next* quote for the same sentence
moved to 97c immediately, because a failed row is no longer invisible.
But the quote was **breached 1.55×**, and the prediction that produced it was
mine: I forecast 46c from a 3-sample rate of 5.7c a turn, and the run burnt
10.1c a turn. So `hasRepo` is necessary and **not sufficient** — within repo
jobs the per-turn cost still varies about twofold, driven by how much the
job writes (391 lines, 11.8k output tokens, 288k cache read here), which is
not knowable before it runs. The honest position: the turn budget can never
bound cost more tightly than its rate estimate is accurate, and across the
two live runs the ceiling held once (45c under 50c) and broke once (81c over
52c). It is not established that it holds. What *is* established is that
nobody is ever over-billed — `priceFor` capped the charge and this run, like
every failure, was absorbed at zero. The 391-line diff also did not work
(24 of 25 tests passing), the first of the three measurement runs to produce
something unpromotable, so it was discarded. **The failing case was the
test's fault, not the code's** — worth recording because it is the failure
mode to expect from generated tests. It ran one prompt twice and expected
the second run to update the recipe, but a first run with no repository and
no web stores an *answer*, so the repeat is replayed by the router and no
second session ever happens (verified: `decide()` returns `answer` without a
repo and `oneshot` with one). The same file asserts that answer is stored,
three cases earlier — it contradicted itself. `rememberRecipe` updates in
place correctly and recipes.test.ts already covers it. The reachable version
of that test needs a `repoPath`, which is the one shape where an exact repeat
really does run again. Note also that three of the
last four runs ended `partial` on max_turns: the role cap of 8 is now the
binding constraint on whether work finishes, not the money.

## D-019 — 2026-07-31 — The crew was not learning, and it is the same bug a third time

The crew was not learning, and it is the same bug a third
time. Asked whether a successful job is banked permanently, the honest
answer came from the data: 36 jobs, **1** of them free, 8 recipes stored and
**every one with `hits: 0`** — not one had ever been reused. Two causes. The
match bar is 0.65 while real same-shape jobs score 0.33, which was left
strict deliberately. The other was a defect: `RoutedExecutor` credited and
remembered only after `fallback.run` *returned*, so a session that threw
skipped the lot — and **all 13 recipe runs failed**, because three turns
usually go on the work rather than the write-up. The tier built to be cheap
was the one tier that could never teach anything. `SessionFailure` already
carried the approach for precisely this ("so the caller can still bank the
cost, the lesson and the diff"); this caller dropped it. Now both happen
whether or not the run finished. One thing deliberately does **not**: the
*answer* is still only ever taken from a run that returned, because an
answer is replayed to the user word for word and a failed run's summary is
its error message — banking one would serve "ran out of turns" as the answer
for ever. Worth naming the pattern, since this is its third appearance after
the quote history and the ledger's job class: **anything that learns only
from clean successes goes blind exactly where the short-leash tier puts most
of its runs.** Look for that shape before looking for anything else.
Still open and now the interesting question: recipes make repeat work
*cheaper*, never free, because notes still have to be read by a paid model.
The only route to actually free is the crew turning a repeated job into a
script the router can run in code — a fourth shortcut tier that does not
exist yet.

## D-020 — 2026-07-31 — Learning sweep: the write-up moves out of the session

Learning sweep: the write-up moves out of the session, the
matcher gets two bars, and the fourth tier is counted before it is built.
Framing first, because it decides everything else: none of this is
reinforcement learning and calling it that leads to bad choices. No weights
change; a stateless model re-reads notes every time. What can actually be
built is a **compiler** — the agent *interprets* a task, a tool is that task
*compiled*, and learning is moving work down the ladder from one to the
other. That also fixes the criterion for calling the API: pay for judgement
that has not been compiled yet, and nothing else. It sets the ceiling too —
"add tests for module X" never compiles, because the assertions depend on the
module; "generate the skeleton for <file>" does. Tools take the scaffolding,
sessions keep the judgement.
**The write-up moved out.** It used to compete with the work for turns, so it
was cut first — a recipe run was explicitly told not to write LESSON.md or
APPROACH.md — and the tier built to be cheap became the one tier that could
never teach anything. Now no job is asked for them at all. A close-out pass
runs afterwards on a cheap model with one turn, handed the run's own RESULT.md
and the *names* of the files it changed, never the patch — the point is a
write-up costing about a cent, and a diff is what makes a turn expensive. It
runs after every job that left anything behind, including the ones that died,
which are most of them. Its cost is recorded as `closeOutUsd` inside
`costUsd`: counted in the total, kept out of the per-turn rate, because the
write-up is a fixed errand rather than something the turn budget can buy more
or less of. Its own failure is swallowed — a missing lesson costs the crew a
note, and throwing would cost the user their work.
**Two bars, not one.** Same-shape jobs scored 0.33 against a 0.65 bar, so the
crew never recognised its own work. Fixed by stemming, by weighting rare
words above common ones, and by splitting the threshold: a strong match still
shortens the run to three turns, while a weak one (0.3) hands over the method
and leaves the leash alone. The asymmetry is the whole argument — a wrong
method given to a full-length session wastes a turn it can ignore, and the
same wrong method with the leash cut wastes the entire run.
**The fourth tier is counted, not built.** A recipe now tracks `successes`
apart from `hits`, since a recipe used ten times and never once successful is
a candidate for nothing. A job matching a recipe with three successes appends
to `tool-candidates.jsonl` and *nothing else happens*. Promotion would cost
about a session and save a fraction of one per reuse, so it pays back around
the third to fifth use — and this machine has seen one repeat in 36 jobs. The
counter answers whether there is anything to compile before a compiler gets
written.
Three of my own claims were wrong on the way and the corrections are the
useful part. `KNOWLEDGE.md` is **not** fed whole and does not grow without
bound — `readKnowledge` already capped it at the last twelve lines, so the
defect was never cost, it was that twelve *recent* notes are not twelve
*relevant* ones; sessions now get the top eight by relevance, through the
same `relevantLines` the recall tier uses. Rarity weighting made matching
**worse** at first: with one recipe on file every word it uses appears in
every document, so the shared words — the entire signal — got weighed to
nothing and a job stopped matching itself; it is off below five recipes. And
the first stemmer turned "invoices" into "invoic" while leaving "invoice"
whole, breaking the exact pair it existed to fix; stripping a single "s" and
never "es" is worse linguistics and better matching. Recipe `terms` are now
recomputed from the key on read rather than trusted from disk, so the next
change to stemming strands nothing and that migration never has to be
written.
**Confirmed live, after the close-out failed twice for reasons worth
keeping.** First it wrote its config and produced nothing, because the catch
that stops a missing note from costing the user their work also hides why
there is no note — a silent failure by design, and the diagnosis needed a
probe that spawns the runner with the same laundered env the server uses.
Run from a plain shell it 401s instead, which is a different bug and a
waste of an hour if believed. Then, properly reproduced: at one turn it
spent that turn calling `Read` on the file it had just been told about and
died on max_turns having written nothing — the same orientation turn repo
runs used to waste, and the same reason a one-shot cannot work at a single
turn. Fixed by telling it not to go looking and giving it two turns for when
it does anyway. End to end on a real job: `closeOutUsd` **2.1c** on the
meter, LESSON.md and APPROACH.md written, a recipe stored with a method, and
the agentling's own memory file one line longer. So the crew is measurably
different after a job, which is the thing that was broken. Note the cost
estimate was optimistic — "about a cent" measured 2.1–2.3c, about 4% of a
50c repo job but nearer 17% of a cheap one, so the write-up is close to free
on the work that matters and merely cheap on the work that does not.

## D-021 — 2026-07-31 — The fourth tier: a tool is a job compiled

The fourth tier, built on request rather than on evidence. The
standing recommendation was to wait for the candidate counter to show repeat
work, and it still shows one repeat in 36 jobs — so this is machinery for a
demand that has not appeared yet, built deliberately with that known. What
makes it worth having anyway is that the design question is interesting and
the answer is reusable: **a tool is a job compiled**. A recipe saves the
exploring and still pays a model to read it; a tool removes the model, which
is the only way a cost per task actually falls. A tool is a directory with a
manifest and two plain-node scripts, `run.mjs` and `verify.mjs` — no shell,
no dependencies, no network, so it neither cares about the platform nor
reaches anywhere it should not. The ledger gets a `tool` tier kept apart from
`routed`, because routed work was never paid for while a tool is work that
used to be: only the second says the crew is getting cheaper.
Every design decision here is a refusal to trust the thing. It matches on the
**strong** bar only and on shape as well as words, since a script written
against a clone is wrong where there is no clone and the two jobs read
identically. It must **prove its own output**, checked in a second process
because a run that crashed cannot be trusted to report that it crashed; work
it cannot prove is discarded and the job is paid for properly. Two failures
in a row retire it, and a hang is killed at a timeout — a compiled tool that
hangs has stopped being cheaper than the session it replaced. The promotion
brief insists on the check harder than on the script, because without one the
tier is only a faster way to be wrong.
Promotion is a **request**, never automatic: it spends money, and a promotion
nobody asked for is a charge nobody quoted. It refuses a recipe that has not
landed three times. The manifest is written before the compiling session
runs, so a half-written tool exists for a while — `usableTools` filters it out
rather than letting it win a job away from the recipe hint that would
otherwise have helped.
One process note worth keeping: reverting a mutation with `git checkout <file>`
destroyed an hour of uncommitted work in that file, because the mutation
trick is only safe on a file that is already committed. Mutation-test after
committing, not before.
**Run end to end with a real repo tool, and it found two design faults that
no unit test could.** First, the promotion brief told the session to write
into `.agentlings`, which every session is simultaneously forbidden to do —
the job rules say work only inside the sandbox. The fix is the better shape
anyway: a generated tool is executable instruction, which is why library
installs are preview-first, so the compiling session writes `run.mjs` and
`verify.mjs` into its own sandbox like any other output and they are copied
into the tool directory only on promote. Second, and only visible by looking
at the working tree afterwards: the compiling session sensibly ran its own
script to check it worked, which left the output file inside its clone, and
promoting the compile carried that stray file into the real repository. A
compiling run's deliverable is the tool, never the clone it tried the tool
out in, so promote no longer applies its patch. Both faults were invisible
to 444 passing tests and obvious within one live run.
The measurement: compiling cost **34c** and 7 turns; the tool then did the
same job in **1.06 seconds for nothing**, against ~110s and ~34c for the
session it replaced, and the ledger shows it under its own `tool` tier. The
generated `verify.mjs` is the part worth reading — it recomputes the answer
from the file system independently and diffs it both ways, checking sorting,
duplicates and malformed lines, rather than the file-exists check the brief
was written to forbid.
**The fall-through, tested live by injecting a fault, found two more.** The
bug injected into the installed `run.mjs` was that it stopped recursing, so
its output was plausible and quietly incomplete — one entry where there were
three — which `verify.mjs` caught exactly as designed. The fall-through then
**crashed the job outright**: `runTool` clones the repository, and the
fallback session cloned into the same path and died on `destination path
already exists`. Discarding a tool's *result* was never enough, because the
tool's files are the work; the sandbox is emptied now. Second, the job had
been quoted **free** on the strength of that tool and then cost 28c. A
promise of free arriving as a bill is precisely what the quote exists to
prevent, so a run that falls back from a tool is absorbed: `toolFellBack`
reaches the ledger as `priceUsd: 0`. Proven live afterwards — job done, cost
28c, **charged nothing**, the tool struck twice and retired itself with
`failed 2 runs in a row`, and the same sentence then quoted "up to 22c" as an
ordinary session instead of "free". Both faults were invisible to 444 passing
tests and to the mutation test of the very branch they were in, because both
live in what the *next* step sees rather than in the branch's own logic.

## D-022 — 2026-07-31 — The turn caps, set by asking what actually gates the loop

The turn caps, set by asking what actually gates the loop.
`DEFAULT_MAX_TURNS` 8 → **10**, `RECIPE_TURNS` 3 → **5**. The reason is not
that runs felt cramped; it is that **`successes` only counts runs that
finish, and a tool is promoted on three of them**. A leash a run always
breaks therefore does not merely slow the loop down, it severs its last
stage: a recipe can be used forever and never become compilable. All
thirteen recipe runs on record ran out at 3, so the fourth tier was
unreachable by the ordinary path — the end-to-end test only worked because
the successes were seeded by hand, which was disclosed at the time but
mattered more than it looked. Cold repo runs that finished used 4 and 7
turns *with no method handed to them*, so 5 still explores less while being
able to land. For the default, moving the write-up off the session bought
back the turns it used to cost — measured, 8 of 11 runs ran out before the
close-out and 0 of 3 after — and the one substantial repo job since used 7
of 8. A wasted turn costs about 7c; a capped run costs a `partial` that
contributes nothing to promotion. Cheap to be generous, expensive to be
tight. Both remain ceilings: the quote's turn budget still tightens below
them when the money is short.
One measurement correction fell out. A cut-off run reports exactly
`turnsAllowed + 1` — 9/8, 7/6, 4/3 eleven times — so the reported `turns` on
a cut-off run is a *marker* that it ran out, carrying no information about
how many turns it wanted. The log's earlier "a cap of 4 came back as 6" is
not what the data shows now. The conclusion it supported is unchanged and
in fact stronger: price a turn by `turnsAllowed`, never by the reported
count. Confidence is asymmetric and worth recording — 13/13 is not
ambiguous, whereas the default rests on n=2 repo runs since the close-out,
which by this project's own small-n rule is an estimate rather than a
finding.
**Raising the leash was not enough, and checking before spending caught it.**
The oneshot tier quotes from its own history; that history was the thirteen
runs that died at three turns costing ~11c, so it quoted 22c, which funds
three turns — the leash that was failing. `RECIPE_TURNS = 5` was inert on
arrival. This is the same bug a third time, one level up: a mechanism reading
a population its own brokenness produced, and it cannot escape by itself. Fix
is a rule that ought to have been there from the start: **a quote may never
come in under the turns it has already decided to grant**, since that is
quoting for work it will not permit. `quoteFor` takes `floorUsd` and
index.ts computes it exactly as the executor will — leash × the rate for that
role in that shape. The absolute cap still wins over the floor, because a
leash nobody can afford should shorten rather than overturn the ceiling.
Note `scribe/session` cleared its own leash by **$0.004**: not strangled
today, one rate-drift from it.
Then measured live, and it lands: `done` at **5 of 5 turns** for 13c against
a 35c quote — the first `oneshot` run ever to finish, against thirteen that
did not, and the first `successes: 1` any recipe has banked. Two more and it
is promotable to a tool without anybody seeding it, which is the compilation
path working end to end for the first time. Worth recording that it used
*every* turn of the five: it landed with zero headroom, so 5 is the floor
rather than a comfortable choice, and at 3 it would certainly have died like
the others.

## D-023 — 2026-07-31 — The promotion gate was selecting for the wrong work

The promotion gate was selecting for the wrong work, which is
the same bug a **fifth** time and the worst-placed instance of it.
`successes` decides whether a job is ever compiled into a tool, and it
counted only runs that exited cleanly. Measured on a real mechanical repo
job (write EXPORTS.md, 123 exported functions): three runs, **two of which
wrote a correct 129-line file**, scored zero. The consequence is an
inversion, not merely a delay. A big mechanical job is exactly what a script
is for and exactly what cannot finish on a five-turn leash, while a short
note explaining what a favicon is lands three times easily and *is*
promotable — despite being prose no script can write. So the gate promoted
what a tool cannot do and excluded what it could. `landed` now means the run
**delivered**, tested the way `partial` already is: a diff on disk. One
notion of a run that did the work, used in both places. Proven live
immediately: a `partial` run credited a success and took the recipe to
promotable, which under the old rule was unreachable for that job forever.
Two things fell out of the same run. The close-out writes two files and then
has to say so, a third turn it does not have — so **running out is its
ordinary ending, with both files already on disk** — and its output was
being thrown away on the exit code, which is why that recipe did not exist
and had to be rebuilt from the APPROACH.md the run really wrote. Fixed by
keeping what is on disk and taking the cost off the failure; `closeOutUsd`
of 4.6c and 4.8c now appear where before the notes *and* the money vanished.
And the cut-off heuristic used the day before is wrong: reported `turns` can
exceed `turnsAllowed` on a run that **succeeded** (12 of 10, twice), so it
agreed with the real outcome on only 29 of 31 rows and the earlier "8 of 11
ran out" was one too many. The claim that survives unqualified is the one
about shape: every repo job at the old caps failed, and repo jobs after the
close-out finish. Price by `turnsAllowed`; never read anything into the
reported count.
Cost of learning this: **$2.38 across five runs**, of which $0.71 was
chargeable and $1.67 absorbed — the billing rules held throughout.

## D-024 — 2026-07-31 — The first unseeded compile was bad, and that is reassuring

The first tool compiled without seeding was **bad**, and that is
the most reassuring result of the day. Promoting the EXPORTS recipe produced
406 lines of careful work — `run.mjs` refuses the export shapes it cannot
parse rather than omitting them silently, which is the router's own
never-guess rule applied by generated code to itself — and yet the two halves
disagreed: `verify.mjs` rejects a multi-line `export async function` that
`run.mjs` correctly lists, one line in 124. So the tool produced the *right*
answer and its own checker refused it. Every guard fired in order: output
discarded, job done properly by a session, `toolFellBack` → **charged zero**,
one strike recorded. The failure mode is worth naming precisely, because it
is not the one the design was braced for: a false negative costs money and
not trust, which is the direction the tier was built to fail in.
Two gaps it exposed. The compile session was **unquoted** — the only job in
the app without a ceiling, unbounded because nobody had thought to bound it
rather than by decision, and it spent $1.26 and still ran out of turns.
Promotion now quotes as a plain session on the recipe's role, directly rather
than through the router, since the compile sets `noRouter`. And there is no
way to retire a tool short of letting it fail twice: this one is provably
broken and self-retiring would have cost another absorbed session, so it was
retired by hand. A `POST .../tools/:name/retire` is the obvious missing verb.
A judgement worth recording for next time: a compile is worth more turns than
an ordinary job. It has to write two programs that agree with each other, and
the halves disagreeing is exactly what running out of turns produces.
**Recompiled, and the second attempt is good.** The retire verb plus a fresh
name (`write-export-repo-root-2`, the first left intact) made a second try
possible; what made it *succeed* was telling the compiling session how the
first failed. The promote response already reported the retired reason to the
caller, but nothing reached the session doing the work — so a second attempt
was an identical first try at the same price. Handed the fault and the general
form of it (the two halves disagreeing about the same input), the new
`verify.mjs` imports the shared definition from `run.mjs` so they cannot
disagree, *and* keeps an independent crude count so importing does not quietly
turn the check into a rubber stamp. That second half is the part worth
admiring: it answers the obvious objection to its own fix. It lists
`web.ts :: fetchPage` — the entry that killed attempt one — and both halves
exit 0. Run live: `tier: tool`, `costUsd: 0`, runs 1, failures 0.
The compile still ran out of turns at 10 and cost 94c, inside its $1.52
quote and charged nothing. So the turn shortage is real and unfixed; what
changed is that the work it *did* finish was better aimed. Worth noting the
quote floor did its job here — it guaranteed the compile all ten turns
rather than strangling it, which is exactly the failure it was written for.

## D-025 — 2026-07-31 — A compile gets its own turn cap

A compile gets its own turn cap, and the number came from the
money rather than from the work. Both compiles on record broke a cap of 10 —
the role's everyday budget, borrowed by default rather than chosen. A compile
is not an ordinary job: it writes two programs that must agree with each
other, and the halves disagreeing is exactly what running out of turns
produces, which is how attempt one shipped a `verify.mjs` that rejected its
own correct output. The cap belongs to the **job**, not the role — a compile
is handed to whichever role owns the recipe, and none of them should raise
their daily budget for one errand — so `maxTurns` is now a job field and wins
over the role's, while the recipe leash still wins over both (a job the crew
has done before is one it has done before, whatever it claims to need).
The number went 16 → 15 → **10**, and only the last step came from running
the thing. The ledger cannot say how many turns a compile wants: a cut-off
run reports `turnsAllowed + 1` whatever it wanted, so the reported count is a
marker that it ran out and nothing more. So 15 was set from the side that
*is* knowable — what the quote can fund, since a cap the money cannot honour
is handed straight back by `turnsForBudget` and arrives inert, exactly how
`RECIPE_TURNS = 5` landed. (I proposed 16; the test written to prove it
refuted it, at the dearest observed rate `MAX_CEILING_USD` funds 15. Cheap,
and before any money moved.) `compileQuote`'s floor moved to the same
constant, since a quote funding fewer turns than it grants is the bug
`e2a53c8` already fixed once.
**Then it was measured, and 15 was wrong.** Attempt 3 at a cap of 15 ran out
*as well* — 16 reported of 15 — and cost **$1.32** against attempt 2's
**$0.94** at a cap of 10: 40% more money for the same outcome, and comparing
the two generated `verify.mjs` files afterwards, attempt 2's was if anything
the more thorough of the two. The tool attempt 3 produced was good (125
entries, both halves exit 0, independently cross-checked, and it lists
`web.ts :: fetchPage` — the entry that killed attempt 1), so nothing was
wasted; it simply was not *better*. What fixed the compile was `4f7a561`,
telling it how the last one failed. The cap was never the binding constraint.
So the error worth naming is the inference, not the number: **"ran out of
turns" was read as "needed more turns"**. Running out is a compile's ordinary
ending, precisely as it is the close-out's — it writes both programs and dies
reporting that it did. The cap is back to 10, still stated rather than
inherited so a role raising its own `maxTurns:` cannot silently change what a
compile gets.
The quote held throughout: quoted $1.5168 (predicted $1.52 before spending),
spent $1.32, **charged $0**. That is the third hold against two breaches.
And the mislabel this exposed is the **sixth** instance of the project's
recurring bug, in the place it was hardest to see: `queue.fail` decided
`partial` from a diff on disk, but a compile's deliverable is never a diff —
its output is the two scripts and promote deliberately does not apply its
patch — so *every* compile filed `failed`, including one holding two working
programs. `deliveredTool()` in tools.ts is now the single notion of a compile
having delivered, used by `installTool` (which already refused half a tool)
and by the queue. Half a tool is still a failure.
Still open: the rate all of this is priced off is `scribe/session/hasRepo` at
8.2c, which **pools compiles with ordinary repo sessions** and understates a
compile by about a third — the same shape as the `hasRepo` split, a
population hiding its expensive cases. Worth doing only when a compile's cost
needs to be predicted, which at a cap of 10 it currently does not.

## D-026 — 2026-07-31 — The one-shot quote could never find its own history

The one-shot quote could never find its own history, found by
noticing a recipe with three successes quoting "first time doing this". Two
readers wanted different things from one field and only one of them was ever
written: the ledger always records `jobClass: agentling.role` (the runner
fix), while the quote asks for `decision.recipeKey` on the oneshot tier. They
cannot match. Measured across all 20 one-shot rows, **not one** matched, so
every one-shot quote fell through to the tier average — permanently, on the
twentieth run as on the first — and a worker one-shot was quoted 56c against
its own 22c history. Nobody was over-billed (`priceFor` still caps), but the
quote could not *tighten*, which is the entire promise of pricing from a
ledger rather than a model.
The fix is to stop making one field answer two questions. `jobClass` stays
the role that ran, because what a **turn** costs is set by the role's prompt,
tools and cap; `recipeKey` is added, because a **quote** asks "have we done
this job before" and a role cannot answer that. `quoteClass()` chooses in one
place — recipe when there is one, else role — and `costPerTurn` is untouched.
Only a one-shot is stamped: marking a full session with a recipe would take
that row out of its role's history, which is what prices a session.
Backfilled without guessing, which mattered — a recipe key *is*
`normalise(prompt)`, so a row is stamped only when the prompt on its own job
record normalises to a key that exists today. That is an identification, not
a similarity match, and it covered **20 of 20**; anything ambiguous would
have been left unshaped, since guessing is the mislabelling this change
exists to undo. Without the backfill the fix would have been correct and
inert, the same trap as the `hasRepo` split.
Measured after: the favicon recipe moved from "Up to 56c — first time doing
this" to "About 14c — done this 3 times before", high certainty; tool and
session quotes unchanged. The ceiling landed at 42c rather than the 27c its
history implies, because the **quote floor** binds — 5 leash turns at the
scribe repo rate is ~41c, and a quote may not come in under the turns it has
decided to grant.
**That floor was then found to be priced on the wrong tier, and fixed.** It
converted the leash at `costPerTurn(..., 'session', ...)` — the session rate
— for a run that was never going to be a session. Measured, a one-shot turn
costs 60–70% of a session turn for the same role and shape (scribe with a
repo, 5.7c against 8.3c; worker, 3.6c against 5.9c), because a short leash
explores less per turn. Since the floor is a *lower* bound on the quote, the
error ran one way only: the user was quoted more than the work costs. The
same hard-coded `'session'` sat in the executor's `turnsForBudget` call, so
fixing only the quote would have left the two disagreeing about how many
turns the same money buys; `rateFor()` is now the one place that decides, and
both call it. A one-shot with no history of its own falls back to the session
rate rather than to nothing — overshooting is the safe direction, and
dropping the floor would restore the bug it was written for. That branch is
live rather than theoretical: there is no one-shot history at all for
non-repo work. Favicon quote 42c → **29c**, predicted to the cent before
measuring; tool and session quotes unchanged.

## D-027 — 2026-07-31 — The unquoted way in

The unquoted way in, found by tripping over it. `POST
/api/levels/:lid/jobs` queued work with `quotedUsd` left undefined, so
`turnsForBudget` never bound and the run silently fell back to the role's
cap. Nothing in the web client used it — but SPEC documents it, and an
unquoted route into a system whose whole cost story is "the quote binds
before the money moves" is a hole in the story rather than a shortcut. It now
quotes exactly as `/work` does, and settles the **role** while it is there:
quoting on one role while another runs the session is the mislabelling this
log has already recorded twice. `quoteFor_` takes `repoPath` explicitly
instead of reading it off the level, since the shape decides both the route
and the rate.
What it deliberately does **not** do is inherit the level's repository. That
was in the first draft and taken back out: `/work` inherits, this route never
has, and quietly handing every caller a clone is a different change wearing
this one's clothes. The quote is priced on whatever the job will really run
with, which is the only property that had to hold.
Verified live on both shapes, cancelled before either spent anything: with a
repository, 27.8c — to the cent what `/work/plan` says for the same sentence,
which is the coherence that was missing. Without one, `quotedUsd` is
undefined because that prompt routes to `answer` and is *free* — not
unquoted. Those two are indistinguishable in the field and it is worth
knowing why they are safe to conflate: `quoteFor` returns a zero ceiling only
for `routed` and `tool`, and every paying tier passes through a bound with a
1c floor. So a job that costs money now always carries a ceiling.

## D-028 — 2026-07-31 — The socket was describing a world that had not changed

The socket was describing a world that had not changed, found
by scoping a leak that turned out not to exist. `seenStatus` was flagged as
unbounded; it is not — every key comes from `w.jobs`, and nothing ever
removes a job from the queue, so the map is bounded by data the client
already holds. Measuring instead of fixing found the real cost: `TICK_MS` is
100, the state payload was **41.8KB of which jobs were 98%**, and it went out
**ten times a second per viewer** — ~386 KB/s to say nothing had happened.
The measurement also killed the obvious fix. Of 54 jobs, **0 were active and
43 were awaiting review**, so "active plus the last N resolved" would have
hidden work the user still had to act on. **Recency is the wrong axis**, and
that is what intuition would have built.
Two changes instead. First, do not describe a world nobody is looking at: the
tick built and serialised every level's state regardless of viewers, and
`sendToLevel` stringified *before* checking for subscribers, so an empty
level paid the full 42KB. The sim still steps unwatched — jobs run whether or
not anyone is watching — only the describing is skipped. Second, send the job
list only when it changes. `JobQueue` counts a revision in `persist()`, which
every mutator already funnels through, so the counter is trustworthy exactly
as long as that stays true and there are tests pinning it. A frame carries
`jobs` only when the revision moved; the client keeps the last list and still
hands consumers a whole `WorldState`, so no UI knows the difference.
Measured over 12s on a live socket: 110 movement frames of **999 bytes** and
one 41.9KB list, **12.4 KB/s against 386 KB/s — a 96.8% cut**, approaching
97.6% over a longer session. The one list per viewing session is by design: a
level nobody watches forgets what it sent, so the next viewer re-syncs.
Deliberately **not** done: trimming fields from the live job (prompt is 34%,
meter 15%, repoPath 11%, none of which the canvas reads). It would be ~70%
on its own, but `ReviewModal` reads `title`, `status`, `error`, `summary` and
`changes` straight off the state object, so it needs a new endpoint and a
loading state in the one flow least worth breaking — and after the revision
change it would be optimising a message that rarely sends.

## D-029 — 2026-07-31 — The compile rate split, measured and then not done

The compile rate split, measured and then **not** done. The
standing note said the quote understated a compile by about a third, so
splitting the rate was the last item with real evidence behind it. Measuring
first took the evidence away: compiles run at **9.0c a turn against the 8.3c
pooled rate** the quote uses — **8%, not a third**. The old figure came from
comparing the single worst compile (12.6c) against the pool instead of
comparing the compile population against it, which is the error this log has
a rule against.
What the split would actually have done: raised every compile quote from
**$1.58 to $2.00** — `MAX_CEILING_USD`, so straight to the runaway cap — off
**n=3**, while changing no turn budget at all, since `COMPILE_TURNS` is the
binding cap in both cases. And it would have been guarding against a breach
that has never occurred: both quoted compiles held ($0.94 and $1.32 against
$1.52), and the one that looks worst ($1.26) was the *unquoted* one that
`ab6c354` already fixed.
So the resolution is to **record the field and not read it**. That is not
fence-sitting, it is the asymmetry: a rate can be computed from a ledger
whenever there is finally enough of it, and a ledger cannot be given a field
it never wrote — the same reason cost and price were separate numbers from
the first entry. The marker is an explicit job flag rather than a title
sniffed at read time, and the backfill stamps a row only when its own job
record still carries the exact title the promote route writes (4 of 4; 12
older rows from deleted levels left alone). Verified after: the session quote
is still $1.58 and the one-shot still "About 14c — done this 4 times before",
so nothing became less accurate in exchange for the option.

## D-030 — 2026-07-31 — A UI/UX pass, where the arithmetic decided more than taste

A UI/UX pass, four changes, and the arithmetic decided more of
it than taste did.
**Agentlings are now their own colour.** They were drawn identically and only
the hover label carried the tint, so telling five apart meant hovering each in
turn. The gown is the identity channel — the largest flat area, so it still
reads in a 27px portrait, and leaving hair and skin alone keeps the crew
looking like one crew. One definition in `tint.ts` serves both art paths: the
built-in frames swap palette entries by key, the baked sheet swaps pixels by
value. That symmetry is the point — a sprite tinted one way in the world and
another in the rail is worse than no tint, since the whole idea is
recognising someone at a glance. Matching on the two *exact* source colours
is what makes it safe on any sheet: ours is generated from the same frame
definitions, and an outside pack that doesn't use them is left alone rather
than having its highlights eaten. Measured live: 390 gown pixels swapped in
the real PNG, 5 distinct gowns, every one on DB32. One casualty worth
recording — **Pip's mint green snaps to steel grey.** The three original HQ
crew hold colours that predate the ramp, and mint sits almost exactly between
`limeLight` and `steel` under the perceptual weighting (14383 against 14244);
grey wins by 1%. Their name label stays mint while the gown goes grey. New
hires are unaffected — `COLOR_POOL` is already DB32 — so the fix is one line
in the legacy seed, deliberately not taken because it is a migration on a live
roster.
**The hover outline is a flat copy, not a tint.** Pixi's tint multiplies, so
offset copies of the ordinary frames keep their dark pixels dark and read as a
smeared ghost; `flatten` throws the detail away and eight offsets then read as
a one-pixel ring. Verified on the real sheet: 10 colours to 1, transparency
intact. Four offsets was tried and rejected — it leaves gaps on every diagonal
of this art. The colour needed its own theme slot: `accentLight` is drawn from
the same family as the rock in every theme, so cave's outline was DB.tan
against DB.tan walls and half vanished into the scenery it existed to lift a
sprite off. Signposts get a *real* silhouette because they are drawn from
primitives and can simply be drawn again offset; the door gets a ring, because
it is scenery painted from the level's own scene data and there is no shape
there to take. That asymmetry is honest and the shared colour is what makes it
read as one idea. Geometry lives in `hover.ts` because each box is used twice
— to draw and to catch the pointer — and the two drifting apart gives you a
prop that lights up somewhere other than where it is clickable.
**The terminal split was decided by a measurement, not a preference.** The
literal left/right split asked for costs the world its pixel-exactness:
1400 − 24 padding − 340 rail − 16 gap leaves 1020, and `fitCanvas` needs ≥1000
for a whole-number scale, so widening the rail to 460 drops the world to 900
and the canvas gets a non-integer CSS width. So the rail is stacked by default
and goes side by side only at ≥1560, where 1560 − 24 − 480 − 16 leaves 1040.
Confirmed in the browser at both widths: canvas CSS width exactly 1000px.
Every activity line is read off state the app already holds — the sim's state,
the job title, the last progress line. Nothing is invented, and the one
example that could not be honoured ("waiting until 5pm to report out") was
refused rather than faked, because there is no scheduler and a made-up status
cannot be acted on.
**The backoffice exists because the terminal is a feed, not an archive.** Its
events are numbered per server run and held in memory, so everything it ever
said is gone after a restart; the jobs persist, which makes them the only
durable account of what the crew has done. No new endpoint — the socket
already sends the whole queue whenever it changes, so the history is on the
client before the panel opens. Two things fell out of building it. The output
route read *every* file as UTF-8 and inlined it, so a job that produced a real
document produced mojibake; binary is now sniffed for a NUL byte the way git
does, rather than guessed from an extension list, because the interesting
files are the ones nobody anticipated. Proven end to end with a real PNG:
listed as binary, downloaded byte-identical, traversal refused. And the
panel's total read "$12.22 spent" against the ledger's $13.81 — both correct,
since the panel can only see jobs still in the queue file — but **two numbers
labelled "spent" is a defect regardless of how well it can be explained.** It
now says "$12.22 on these" and names the gap: "4 stopped mid-run, cost
unknown", which matches the ledger's `unmeasured` exactly. Folding those in as
zero is how a total comes to understate itself, which this log records twice
already.
**Clarification is pre-flight, and deliberately not mid-run.** A session is a
one-shot child process by design, so pausing one to ask a question means a
`waiting` status, a runner holding stdin, and a timeout policy for a user who
went to bed — against the grain of a cost model whose whole premise is
bounding a run *before* it starts. Asking first is also the only point where a
question can reduce spend rather than add to it. Three rules keep it from
becoming the form the one-box intake was built not to be: never on free work,
never more than three, never required. The free gate is proven live — a
sentence containing "improve everything" asks nothing when it lands on the
`tool` tier. The answers are kept **out of `job.prompt`**, which is the
non-obvious part: a recipe is keyed on `normalise(prompt)` and the one-shot
quote looks up `recipeKey`, so folding them in would give a clarified job a
different key from the same job asked plainly and the crew would stop
recognising work it had already done. The server also recomputes the questions
from the sentence rather than trusting what the client sends back — possible
only because the rules are deterministic, and it means the only instructions
that can reach a session are ones the user was shown.
**The measurement is deferred on purpose.** Whether clarifying actually saves
turns needs 4+ paired runs at ~40c each, and this log's own small-n rule says
n=2 is an estimate rather than a finding, so buying a weak answer for $1.60 is
the error this project keeps catching. Instead the job record now carries
`clarifications` and the ledger already carries turns and cost, so the
comparison is computable from ordinary traffic whenever there is enough of
both — the same resolution as the compile flag, and for the same asymmetry: a
rate can be computed from a ledger later, and a ledger cannot be given a field
it never wrote.
**Pip's colour, fixed the next day, and the interesting part is where the bug
actually was.** A crew tint used to be a label colour and nothing else, so
being off the ramp cost nothing; painting the sprite in it made that a defect
retroactively. Checking before changing anything showed the seeding path was
already correct — a scratch level created today hands Pip `#99e550` and Dot
`#639bff`, both exact DB32 — so this was never an ongoing bug, only two rows
of historical data plus a stale constant. `LEGACY` now takes its tints from
`COLOR_POOL` rather than listing its own, which leaves **one** list of crew
colours in the file and makes the bug unrepresentable instead of merely
fixed. The seed change alone would have been correct and **inert** — hq
migrated long ago and the value is on disk — the same trap as the `hasRepo`
and `recipeKey` backfills, so `scripts/backfill-roster-palette.mjs` rewrites a
row only when it still holds the exact colour the old seed wrote. That is an
identification rather than a guess: a tint changed on purpose is left alone
and a second run does nothing. Two rows moved (hq and home-chores both have a
Pip), verified after: label and gown both `#99e550`. Moss and Bea are
deliberately **not** moved — they snap within their own hue, so rewriting
them would change how they look in order to fix nothing; `--all` does it if
that judgement ever changes. A test now asserts every tint the app can hand
out is on the palette, for a fresh hire at all sixteen positions and for the
legacy migration, which is the guard that would have caught this.
**Test drive: "Produce a PDF", and it found three things no test could.**
Run as the vaguest brief the box can take, on a scratch level with no
repository. First, the clarifier was **silent on it** — `shape` only fired on
*gathering* verbs (find, research, compare), so a job whose entire content
was unspecified got no question at all while a paying session went off to
guess. The rules knew about fetching and not about *making*, which is the
case where the brief matters most; `PRODUCING` and an `about` question fixed
it, and "Produce a PDF" now asks "What should go in it?" before anything else.
Second, **the agentling can write a PDF** — the capability was assumed absent
because the sandbox has no libraries, and it simply wrote a 4KB dependency-free
Node script and ran it. Valid `%PDF-1.4`, correct objects and xref, the right
date, and a paragraph explaining it was assembled by hand. Worth remembering
before scoping out a capability: no library is not the same as no route.
Third, and the reason a live run beats a fixture: **the PDF was not detected
as binary.** It has uncompressed streams, so no NUL byte anywhere — and the
NUL sniff is git's test, which answers "is this source code" rather than the
question actually being decided, "would inlining this damage it". Its
Latin-1 `%âãÏÓ` marker is not valid UTF-8, so it was inlined as mojibake:
exactly the defect the binary path was written to prevent, surviving because
the unit fixture had a NUL in it by construction and so proved the heuristic
instead of the requirement. `isBinary` now asks whether the bytes round-trip
through UTF-8, with slack only where the sniff window truncated the file.
The download route was never affected — it reads raw bytes, and the hash
matched disk exactly throughout.
Costs and labels behaved: $0.364 against a $1.58 quote, `priceUsd` 0, the
failure absorbed. And the backoffice rescued a job the terminal had written
off — the PDF was reachable and downloadable from it while the feed showed
only a failure, which is the strongest argument yet for having built it.
**Which exposed the fourth thing, and it is this log's recurring bug for the
seventh time.** The run delivered a PDF and was filed `failed`, because
`partial` was defined as a diff on disk — a *repo-shaped* notion of delivery.
A job with no repository can never have a diff, so no such job could ever be
`partial` however much it produced: not reviewable, not creditable to a
recipe, filed under "closed" in the very panel that was showing its output.
The same shape as the promotion gate, which was fixed for exactly this reason
and then re-introduced one level down. Delivery now means **the run left
something for the user**, of which a diff is one shape. Two exceptions kept,
both already decided: a compile is judged only on `deliveredTool`, since half
a tool is not a delivery and its working files must not be mistaken for
output; and cancelling stays `failed` whatever is on disk, because you
stopped it on purpose. That second guard belongs in `fail()` rather than in
the caller — a killed session rejects through that path, not through
`cancel()` — and it was latent before this: a cancelled run holding a diff
would already have been mislabelled `partial`. Job 2ff16bf2 keeps its
historical `failed`; statuses are not recomputed retroactively.
**Four runs of one sentence, and the recurring bug three more times.** Run 2,
with the close-out fixed, came back `done`: PDF, generator, an unprompted
*verifier*, notes, and a recipe banked under the key `produce a pdf` — clean,
because the clarification answers are kept out of `job.prompt`. Run 3 then
hit the recipe and was answered **free, in zero turns, with a lie**: the
banked answer said "hello-world.pdf (1,380 bytes) is a valid one-page PDF",
and the sandbox held that sentence and no PDF. An answer is replayed word for
word, which is right when the words *were* the deliverable and false when
they merely described one — so a run that **made** something now banks only
its method, and a repeat re-runs cheaply and truthfully instead of being
answered freely and falsely. The stored answers had to be dropped too or the
fix was inert; `scripts/backfill-recipe-answers.ts` identifies them off job
records still on disk (3 of 7, including one on `home-chores`, which has no
repository and so was genuinely live). Four are left alone: `say hi` is a
real answer, and three `write a short note in X.md` recipes lost their
sandboxes, so they cannot be identified rather than guessed — inert while hq
has a repository, since the answer tier never fires there.
Run 4 proved both halves at once: tier `oneshot` rather than `routed`, quote
56c, spent 47c, **charged nothing**, and filed **`partial`** — the first live
sighting of that fix, on a run that produced a valid PDF and ran out of turns
saying so. And it exposed the ninth instance: `creditRecipe` still tested
delivery as `result || a patch on disk`, directly under a comment claiming it
used "the same test `partial` uses". It had drifted apart from `partial`
within hours of that being widened, so a non-repo run credited **zero
successes** however much it made — and a recipe that can never bank a success
can never be compiled into a tool, which is the promotion-gate inversion
again, one level down. The lesson is not "check this call site": it is that
**"it delivered" keeps being re-derived locally instead of being one
function**, and every local copy silently assumes a repository. There are now
three shared notions in `outputs.ts` — `deliveredFiles`, `producedArtefacts`,
`outputNames` — and the next thing that asks the question should call one.
**Run 5 caught the over-correction, an hour old.** The recipe hit again
(`hits` 3) and banked its first ever `success` — and produced **no PDF**. It
wrote a working generator, ran out of turns before executing it, and the
files-on-disk test counted that as the job being done. Three of those would
compile a tool from a method that never finishes, and the fall-through would
absorb the cost each time it failed. So `successes` is narrowed back to a
clean finish or a diff, while `partial` stays wide — and the two are **not**
the same question however alike they read: `partial` asks whether there is
something worth the user's attention, and a half-finished generator is;
`successes` asks whether the recipe gets the job **done**, because that is
what compiles it into a script that runs with no model at all. The comment
claiming they used one test is what carried the mistake, so it now states the
divergence instead. The stored `successes: 1` was corrected to 0 by hand —
one value on a scratch level, and leaving it would have made the fix inert on
the very recipe that exposed it.
Worth naming the shape, since it is the mirror of the bug that dominates this
log: unifying two notions is as dangerous as duplicating one. The nine
earlier instances all came from a definition copied and left to drift; this
one came from collapsing two definitions that only *sounded* alike, on the
same day, to fix the drift.
One fact learned by getting it wrong, worth recording because it is easy to
assume: **a question with no repository is not free.** The `answer` tier
replays a *stored* answer, and the first run of a novel prompt is what
produces it — so that run is a full session. Queued one expecting zero, it
quoted $1.58; cancelled at 12.7s, filed `failed` with `costUnknown`, charged
$0. The billing rules held exactly as designed; the assumption did not.

## D-031 — 2026-07-31 — Document capability: Node libraries at the project root

Document capability: **Node libraries at the project root**.
`docx`, `mammoth`, `exceljs`, `pptxgenjs`, `pdf-lib`, `pdf-parse` — six pure
JS packages, no native builds, which matters on Windows. The mechanism is the
interesting part and it was measured before choosing: a sandbox lives at
`.agentlings/levels/<id>/jobs/<id>`, *inside* the project, so Node walks up
and resolves the root's `node_modules`. Installing once at the root therefore
reaches every job with no per-job install, no network and no npm in the
sandbox — verified by writing and reading back a real .xlsx, .docx, .pptx and
.pdf from a sandbox path, including `pdf-lib` reopening its own file and
adding a page, which is in-place editing rather than rewriting.
The alternative was a Python toolchain — `python-docx`, `openpyxl`,
`python-pptx`, `pypdf`, the stack Anthropic's own document skills are built
on, and clearly better at format-preserving edits to .docx and .pptx. Turned
down for now on three counts: Python is not installed on this machine at all
(`python`, `python3`, `py` all miss), it puts a second runtime inside a
single-runtime TypeScript project, and this log already records most
`anthropics/skills` entries as **Proprietary** while `skills/` is committed,
so adopting them is redistribution and needs terms read first. The accepted
cost is that .docx and .pptx can be read and written but not revised with
their formatting intact; .xlsx and .pdf round-trip properly.
**Installing them was half the job.** A library nobody is told about is not a
capability — measured the same evening, an agentling asked for a PDF
hand-assembled the bytes across several turns because it did not know
`pdf-lib` was there, and it *worked*, which is what made it expensive rather
than obviously wrong. So `buildAppend` now names each library and its call
shape on every job. The shapes are there because guessing one costs a turn:
`pdf-parse` reads exactly like the function it used to be and is now a class,
so the obvious `pdfParse(buffer)` fails.
Two things this deliberately does **not** solve. There is still **no way for
a file to reach a sandbox** — a job gets a repo clone or nothing, and the
work bar takes a sentence, a folder and connections but no upload. So reading
and editing are unblocked in principle and unreachable in practice until an
ingest path exists; writing works today. And the compiled-tool contract is
"plain node, no dependencies, no network", so the fourth tier cannot import
any of these without that contract being reopened on purpose.

## D-032 — 2026-08-01 — Reading the web is on by default, and Settings owns the switch

Reversing D-005's per-job opt-in for one connection, deliberately and only for
that one. The framing that decides it: Agentlings is an outbound platform, so
reaching a page is what the crew is *for*, not a permission to be granted job
by job. A checkbox under the intake asked the same question every time and
answered it "no" by default, which is the wrong default for the product.

**The default had to live on the server, and that is the whole change.** Making
the client's `allowed` state start as `['web']` would have looked identical and
been worth nothing: `resolveForJob` grants exactly what the request carried, so
anything posting to `/work` without that field — the `/jobs` route, a script, a
replayed job — would silently get nothing. The rule is now one line in
`settings.ts`: the user's answer if they gave one, else the catalog's
`defaultOn`, and never when a secret it needs is missing, since a connection
that cannot work is not a preference.

**One resolver, three readers.** `granted()` is called once per request and
handed to both the quote and the queued job; the executor then reads the job's
stored `tools`. This is not tidiness — web access decides whether the router
can use its free `fetch` tier, so a quote that answered it differently from the
run would price a different job. Measured live on the same sentence: web on
quotes `routed` / "Free — we already know this", web off quotes `session` /
"Up to $1.58". Same prompt, one switch, and the quote follows the run.

**Defaults are additive; an explicit "off" is authoritative.** A test written
to assert the obvious thing failed and was right to: a caller naming a ready
connection that ships off should still get it, because that is D-005's opt-in
for credentialed connections and this change was never meant to remove it. So
`grantedTools` unions the defaults with what was asked, and only a deliberate
user "off" blocks both. Off means off; unset means the catalog decides.

The store records departures only, so a shipped default can change later
without migrating anyone's settings — the same reason the ledger records cost
and price separately. It is global rather than per level: the registry is
global, and what the crew may reach is a property of the crew.

The checkbox is replaced by a statement, not by silence. `the crew can read web
pages · change in settings` in lime, or `the crew is working offline` in
orange — because a job that cannot reach the web should say so where the work
is queued rather than in its result. Verified in the browser: the line reads
`#99e550`, on the palette.

Two things worth naming. `describe()` takes the enabled set rather than reading
settings itself, which breaks an import cycle *and* keeps one readiness rule —
the first draft inlined a second copy of `missingSecrets`, which is the drift
this log records nine times. And this widens what every session can reach: the
posture moved from "ambient nothing" to "ambient reading". That is the change
asked for, but it is a reversal rather than drift, which is why it is written
down here and in three places in SPEC.md that asserted the opposite.

**The switch had a second door, found by auditing capabilities rather than by
testing the switch.**  is built from the role alone, so scout —
which declares  — was handed the SDK's own  whatever
Settings said. Turning web off removed the app's  tool and the
pre-fetch of typed URLs, and left the network reachable through a tool the
registry never sees. The tests written for the switch all passed, because they
tested the resolver rather than what reached the session.

Fixed by : a map of the SDK tools that leave the sandbox to the
connection that authorises them, applied after the role's list and after the
default, since the question is not what the role wants but what the user has
allowed. A role left holding only outside tools correctly ends with none.
Proven against the real role files and the real registry — scout goes
 to , and analyst, mason, scribe
and worker are byte-identical either way. The run also says so out loud rather
than letting a scout spend turns discovering it.

The general lesson is about where a boundary is enforced, not about the web: a
permission checked in the place that *resolves* it is not checked in the place
that *uses* it, and  was assembled from a different source
entirely. Anything added to  is a tool that must be asked for.

**The switch had a second door, found by auditing capabilities rather than by
testing the switch.** `allowedTools` is built from the role alone, so scout —
which declares `web_fetch` — was handed the SDK's own `WebFetch` whatever
Settings said. Turning web off removed the app's `fetch_page` tool and the
pre-fetch of typed URLs, and left the network reachable through a tool the
registry never sees. Every test written for the switch passed, because they
tested the resolver rather than what actually reached the session.

Fixed by `gateOutside`: a map of the SDK tools that leave the sandbox to the
connection that authorises them, applied after the role's list and after the
default, since the question is not what the role wants but what the user has
allowed. A role left holding only outside tools correctly ends with none — it
cannot reach anything, which is the answer rather than a fault. Proven against
the real role files and the real registry: scout goes `Read, Grep, Glob,
WebFetch` to `Read, Grep, Glob`, while analyst, mason, scribe and worker are
identical either way. The run says so out loud rather than letting a scout
spend turns discovering it.

The general lesson is about where a boundary is enforced, not about the web: a
permission checked where it is *resolved* is not checked where it is *used*,
and `allowedTools` was assembled from a different source entirely. Anything
added to `OUTSIDE_TOOLS` is a tool that must be asked for.

## D-033 — 2026-08-01 — The ellipsis the model believed, and the answer with nowhere to go

Brian reported that a run came back saying his message was cut short and the
only options were approve, discard and see-the-changes. Two separate faults,
and the one he reported was the smaller.

**The app told the model the prompt was truncated.** `sessionPrompt` opened
with `Job: ${job.title}`, and `titleFrom` marks a shortened title with an
ellipsis — right for a card, wrong for a prompt. Job `ca5db1b4` was handed
`Job: I need someone to look up Buydepa and summarize…` above that same
sentence in full, and Haiku did the reasonable thing: read the ellipsis as a
cut-off message and asked the user to repeat themselves. One turn of twelve,
1.4c, no work, and a question the UI could not answer. For a prompt-derived
title that line was never anything but a shortened duplicate of the sentence
beneath it, so it is dropped when the title is a prefix of the prompt and kept
when someone wrote it separately, as `/jobs` allows. A display concern had
leaked into a prompt and the model believed it.

**And an agentling that asks a question had nowhere to be answered.** The card
offered approve or discard, so the only way to respond was to retype the whole
request and pay for the work again. The fix is a reply box that queues a
follow-up — and the reason that is allowed is worth stating, because D-030
refused exactly this: what it refused was *mid-run* clarification, which needs
a `waiting` status and a runner holding stdin. A reply arrives after the run
has ended, which is simply a new job. The architectural line is not "never ask
the user", it is "never pause a session".

A follow-up carries `continues`, and `carryForward` starts its sandbox where
the last one stopped: the earlier patch applied to the fresh clone, anything
produced copied across. Without that, answering a question would re-do and
re-bill work already paid for. Its paperwork is deliberately left behind — an
inherited RESULT.md would make "did this deliver" true before the session had
done anything, which is the delivery-test bug this log records repeatedly.

**Two faults were invisible to 636 passing tests and showed up on the first
live call.** `continues` never reached the job, because `JobQueue.add` builds
its `Job` field by field and simply did not copy it — a field can be threaded
through a type, a spec and a route and still be dropped by the one function
that constructs the thing. And a `.filter(Boolean)` meant to drop an absent
summary also ate the blank line separating the original request from the note,
running two paragraphs together. Neither is subtle; neither was reachable
without calling the route.

One dead end fixed while in there: `ReviewModal` showed its actions only for
`done`, so "See the changes" on a `partial` opened a modal whose only button
was Close — no actions on precisely the status that most needs reviewing.

## D-034 — 2026-08-01 — A browser that reads and cannot act

Scoped from the capability audit, which found the crew has no hands: no
clicking, no forms, no logins, and `fetchPage` is one HTTP GET with no
JavaScript, so most modern sites return an empty shell. The gap is the biggest
single limit on delegating real work.

**The hard part is not MCP, it is that a browser breaks the safety model.**
Every guarantee this app makes rests on one shape — work in a sandbox, review,
promote. A diff can be inspected before it touches anything real. `browser_click`
on "Confirm order" happens on the live internet the instant the model decides
to, and there is no promote step for a submitted form. The obvious mitigation is
ruled out by D-030: pausing a run to ask needs a `waiting` status and a runner
holding stdin, which was refused for good reasons.

So the first version **reads and cannot act**. Of the 24 tools Playwright MCP
offers — enumerated by speaking JSON-RPC to it rather than trusting a README,
because a wrong name grants nothing silently — eight are granted, and twelve
that act are deliberately absent, including `browser_evaluate`,
`browser_run_code_unsafe` and `browser_network_request`, which issues an
arbitrary HTTP request. That removes the real limitation today without adding a
new risk class: nothing changes on the far end, so the sandbox-then-review model
holds exactly. It also produces the cost data needed to price an acting version
honestly. `catalog.test.ts` asserts the absent names against the shipped
catalog, so the boundary is a test rather than a description of one.

**Signing in without the app seeing a password.** `--storage-state` restores a
session file the user makes themselves by logging in once in a real browser.
Nothing is stored, transmitted or typed by the app. The path differs per
machine so it cannot live in a committed catalog, which is what `expandArgs`
is for: `${VAR}` is filled from the environment and the whole argument is
*dropped* when the variable is unset — that is what makes signing in optional,
since `--storage-state=` with no path is an error while absent is a signed-out
browser. The file is a bearer token for every site in it, so it is gitignored.

Licence is clean: Apache-2.0, Microsoft, fetched by `npx`, so nothing is
redistributed into this repo and D-010's rule about terms landing here does not
bite. Chromium was already installed.

**And it corrected a rule I had got backwards the same day.** `grantedTools`
let a caller add any ready connection the user had not explicitly switched off
— reading D-005's "per-job opt-in" as a job being able to grant itself
something. With one built-in web connection that looked defensible. Adding a
browser made it plainly wrong: Settings reports a connection as disabled and a
job reaching it anyway makes the switch a lie, which is D-032's defect one level
up. **Never switched on is not the same as not switched off.** Naming a
connection now only ever *narrows*, which is the honest reading of per-job
opt-in anyway — a job that does not need the browser should not carry its tool
definitions, since every visible tool is overhead in every request. The test
that caught it was written for the browser and failed on the web.

Deliberately not done: `--allowed-origins`, which Microsoft's own help calls
"*does not* serve as a security boundary", so shipping it would suggest a fence
where there is a guardrail. And no acting tools until there is measured cost
data — the documented failure mode is context growth, since each navigation
returns a fresh snapshot and a long session carries pages it already left,
which is a rate unlike anything in the ledger.

## D-035 — 2026-08-01 — The browser measured, and the case for it is weaker than the case made for it

Phase 3 of the browser scope: run it and find out. Three live runs, **$0.61**,
and the useful results are the negative ones.

**The premise was overstated, and mine.** I argued the crew could not read
modern sites because `fetchPage` is one GET with no JavaScript. Measured
against real pages, that is mostly false: react.dev, vercel.com,
anthropic.com, playwright.dev and news.ycombinator.com all return 3–8KB of
readable text, because marketing and docs sites are server-rendered. Where it
genuinely fails is narrower than claimed — Google search (93 characters),
reddit's www host (0), PDFs (refused as not a readable document) and sites
that block a non-browser agent (Bloomberg, 403).

**And the crew routes around it without help.** Asked to read
`www.reddit.com/r/programming/`, which `fetch_page` returns nothing for, both
runs found `old.reddit.com` — server-rendered — by themselves and produced
correct titles. The browser was granted, wired and spawned in run B, and never
called once. A capability is not needed merely because a tool fails; the
question is whether the model can get the answer another way, and here it
could.

**Forced onto a page with no workaround, it works and is cheap.** With web
switched off, a scout reached a Google search page through
`mcp__browser__browser_navigate` — 5 turns of 12, **$0.0327, about 0.65c per
turn granted, against 8.3c for a repo session.** Accessibility snapshots really
are small. But it did not get the answer: Google served 429 and a CAPTCHA. That
is a real limit and not one to engineer around — a browser is not an anti-bot
tool, and building toward defeating bot protection is out of scope by choice.

**`gateOutside` proven live, and it fires exactly as designed.** The scout's
`allowedTools` came out `["Read","Grep","Glob","Skill"]` with `WebFetch`
removed and the web shim absent. The trace then shows the model *asking* for
`WebFetch`, being refused, and going to find the browser tools instead. A
denied request still appears as a tool call in the progress stream, which is
worth knowing before reading a trace as evidence of a leak — it looks identical
to one.

**The learning loop suppressed the new capability, which is the finding with
teeth.** Run A solved the job with `fetch_page` and banked a recipe. Run B,
with the browser newly available, matched that recipe, was leashed to five
turns and told the method — so it never explored, never tried the browser, and
the comparison measured nothing. Every mechanism here is working as designed
and the emergent behaviour is that **a crew which has learned a method will not
discover a better one.** Recipes make repeat work cheaper and make capability
changes invisible. Nothing is done about it yet; naming it is the point.

So acting tools stay unbuilt, and now for a measured reason rather than a
cautious one: the browser has been genuinely used once, on a page that blocked
it. The tier that would justify click and type has not yet demonstrated value
in the tier that only reads.

One process note. The first measurement script polled for 300s and reported
"TIMED OUT" for two jobs that were still running and later finished fine — the
harness gave up, not the app. The runs cost real money and produced real
output while the experiment recorded nothing, which is a reminder that an
instrument shorter than the thing it measures manufactures its own result.

## D-036 — 2026-08-01 — A method is only as good as what was available when it was found

Fixing what D-035 measured: a job solved with `fetch_page` banked a recipe, and
the next run of the same shape — with a browser newly switched on — matched
that recipe, took the five-turn leash, followed the method and never tried the
browser. Every part worked as designed. The emergent result was that a crew
which has learned a method cannot notice it has grown.

A recipe now records the connections its run could reach, and a mismatch with
what the job can reach today **demotes a strong match to a weak one** — the
method is still handed over, the leash is simply not cut. That is D-020's
asymmetry applied to a second axis: a stale method given to a full-length run
costs one turn it can ignore, while the same method with the leash cut costs
the whole run, and here it also costs the chance to find the better way. Any
difference counts, in either direction. A method that used a connection since
switched off is actively wrong; one written without a connection that now
exists may simply be beaten.

Deliberately **not** touched: the `answer` tier. It looks like the same bug in
its strongest form — zero turns, no exploration — but the router already checks
that the current job has no repository and no web before replaying, so that
path is capability-aware already. Fixing it twice would be the "collapse two
notions that only sound alike" error this log records.

**The backfill is the interesting half.** Absent `tools` means unknown
provenance, treated as changed, which is safe and also expensive: without a
backfill every recipe on file pays for one full-length run before healing. So
`scripts/backfill-recipe-tools.ts` stamps a recipe only where a job record
still on disk normalises to that exact key — an identification, since a
recipe's key *is* `normalise(prompt)`, not a similarity match. Of 15 recipes it
stamped 9, left 6 orphaned where the job records are gone, and left **1
ambiguous** — which is the reddit recipe that caused all of this, because run A
banked it under `web` and run B under `browser,web`. Two runs, one key,
genuinely contested provenance. The ambiguity rule protected exactly the case
that motivated the change, and leaving it demoted is the right answer rather
than a gap.

Verified on the real file afterwards: a recipe banked under `web` stays strong
against `web` and goes weak against `web + browser`, with its method still
attached; the contested one stays weak whatever it is asked.

What this does not fix is the general shape, which is worth stating so nobody
believes otherwise. Connections are one axis of capability. A new role, a new
skill, a document library, a raised turn cap or a better model all change what
a good method is, and none of them demotes anything. The honest claim is that
the axis which actually bit has been closed, not that recipes now track
capability.

## D-037 — 2026-08-01 — The rest of the axes, as one surface rather than five comparisons

D-036 closed the connections axis and said plainly what it left open: a role's
tools, its skills, the document libraries, the turn cap and the model all change
what a good method is, and none of them demoted anything. This closes them —
and the design decision is that they are **not five comparisons**.

A run's capability surface is one sorted list of prefixed tokens —
`conn:web`, `tool:Bash`, `skill:cite-sources`, `lib:pdf-lib` — and a recipe
stores the surface it was written under. The only operation is "is this the
same surface", so a flat list beats a record with a field per axis: adding an
axis later is a new prefix and no migration, and the list stays readable on
disk, which matters at the moment a recipe demotes and someone asks why. It
also replaces D-036's `capabilities`-as-connections field a day old, which is
churn worth admitting: the generalisation should have come first, and the cost
of getting there second was one superseded field and one retired backfill.

**Two axes are deliberately excluded, and the line is what they change.** A
capability is what a run *can do*, not how well or how long it does it. The
model changes how well; the turn cap changes how long — and a leashed run takes
`RECIPE_TURNS` regardless of its role's cap, so recording that one would demote
on a number the run never uses. Including them would make every model change
demote every recipe on file, for no gain in what the crew can discover.

`surfaceFor` in index.ts is the single place that decides what counts, because
it is the only place that knows the job, the role registry, the skills on disk
and the root's dependencies at once. `RoutedExecutor` takes it as a supplier
rather than working it out: that class knows a level and a job and nothing
about roles, and the router, the recipe it banks and the recipe it matches
against must never disagree about the surface.

Proven against the real role files and `package.json`: a scout's surface is 13
tokens, and a recipe written under it stops shortening the run when the browser
is switched on, when a library is installed, when a skill is added to the role,
or when the role gains Bash — and keeps shortening it when nothing changes. A
bonus that fell out rather than being designed: scout and worker have different
surfaces, so a method found by a scout no longer shortens a worker's run
either. That is D-026's observation — the role that runs a job need not be the
role it was matched to — handled without a rule of its own.

**No backfill this time, and that is a reversal.** D-036 shipped
`backfill-recipe-tools.ts` because unknown provenance demotes and a blanket
demotion costs a full-length run per recipe. The other axes cannot be
reconstructed: a job record does not say what skills its role had, and the
root's dependencies at the time are unknowable. Filling them from today's role
definitions would be a guess, which is the mislabelling this log keeps
catching, so the script is retired and every recipe demotes exactly once before
healing. Cheap here — the ledger shows almost no repeat work — and honest,
which the alternative would not have been.

One process note worth keeping. A scripted edit reported success by checking
for a string that already existed elsewhere in the same file, so the router
context went unwired while the check said otherwise, and three tests failed for
a reason the check had ruled out. **Verify a change by what it should now do,
not by whether some text is present.**

## D-038 — 2026-08-01 — CLAUDE.md trimmed to what the harness does not already do

CLAUDE.md had reached 196 lines and a third of it was the behavioural base
D-002 adopted. Read against the harness's own instructions, rules 1 and 2 were
close to duplicates — scope discipline, when to ask rather than guess, matching
the surrounding style are all default now, so those lines bought nothing and
cost context on every turn.

**What survived is what is not default, and the test was behavioural rather
than editorial.** Four clauses have visibly steered sessions: mention unrelated
dead code rather than deleting it, remove the orphans your own change made,
match existing style even where you would not, and state a multi-step plan as
steps with their checks. Everything else went: **66 lines → 33**. The four
headings stay numbered because Ground rules and Workflow both cite them
("extends rule 1"), and deleting them would have broken two references to fix a
third problem.

Reopening D-002 rather than quietly overriding it: the base was adopted as a
decision, so cutting it is a decision, and this entry is what the file's own
rule asks for.

**The hard-won rules were compressed by merging, not cutting.** They grow one
per lesson and were sixteen bullets saying about nine things — three separate
rules about measuring, running live and verifying by behaviour are one rule
with three citations. Merged to nine, every `D-` reference preserved, so
nothing became harder to trace back. That the count *fell* while the log grew
is the point: an archive changes no behaviour, and a list nobody finishes
reading is an archive.

Worth recording that this bought almost no lines — 38 → 34 — because a merged
bullet carries every clause it absorbed and runs four lines instead of two. The
win is that there are seven fewer things to read, not that the file is shorter,
and predicting it as a line saving was the wrong unit.

**The thematic index moved here.** Six lines grouping the entries by subject
lived in CLAUDE.md, which meant a new entry had to be written in one file and
indexed in another — a two-file edit nobody would keep up. It is not redundant
with Contents, which is chronological, so it moved rather than being deleted.
Both indexes now live beside what they index.

**Net 196 → 151, against a predicted ~120.** The estimate was made by section
before any of it was written and missed two ways: merged bullets are wordier per
bullet than the ones they replace (above), and the Capability surface block was
left at full length by choice rather than cut to 8. Recorded rather than
rounded, because a proposal's arithmetic is a claim like any other and this log
exists to catch the ones that go unchecked.

The two sections that actually change behaviour — the hard-won rules and the
project conventions — are intact or sharper.

**Amended the same day: the behavioural cut is reverted, the rest stands.**
Brian asked for the original 66 lines back and for the project half to live
somewhere else. So `CLAUDE.md` is now the Karpathy base verbatim — byte-checked
against `11912ca` — plus a project header naming the four documents, and
`PROJECT.md` holds the working rules, `@`-imported on the last line.

The import is the whole point and worth stating plainly: **a file that is not
imported is not resident, and a rule that is not resident does not apply.**
Moving the project half behind a pointer would have quietly switched off the
IGPL boundary, the secrets rule and the hard-won rules — the last of which
exist precisely because an archive changes no behaviour. So this buys
separation and an upstream-diffable base, and saves no context at all: 90 + 110
lines against 151, both loaded every turn. That is the opposite of what the
morning's trim optimised for, and it is a fair trade once the goal is stated as
flow rather than size.

What survives from the original entry: the merged hard-won rules, the thematic
index living in this file, and the reasoning about which behavioural clauses
were doing work. That reasoning is now a record of what was tried rather than
of what is in force — kept, because the next person to look at the file's
length will have the same idea.

## D-039 — 2026-08-01 — The close-out cost never reached the ledger

Found while building `scripts/ledger-report.mjs`: no row in 79 has a
`closeOutUsd`, because `LedgerEntry` has no such field. The meter does —
`claude.ts` sets it, `JobMeter` declares it, the terminal card shows it — but
the row builder at `index.ts:245` copies `recipeKey`, `compile`, `turns`,
`turnsAllowed`, `costUnknown` and `model` across and not that one.

**So `SPEC.md` M5.5 states something untrue.** It says `closeOutUsd` "is part
of `costUsd` but kept separate, so the per-turn rate prices the session rather
than the session plus a fixed errand". The separation exists in memory and dies
at the ledger, so `costPerTurn` divides session-plus-write-up across the
session's own turns.

The error is small and one-directional: a write-up is about 2c against a 39.2c
session mean, so every rate is inflated by roughly a cent, and since the rate
divides a quote into turns, the bias is toward granting **fewer** turns than
the money would buy. Nothing is over-billed — `priceFor` caps that
independently — which is why it has been invisible.

**This is D-033 recurring in the same shape**, and worth saying plainly: a
field can be threaded through a type, a spec and a route and still be dropped
by the one function that builds the object. The hard-won rule was written from
that exact failure and did not prevent this one, because the rule tells you the
shape of the bug and not where to look for it. What actually found it was
computing something from the data and noticing a column was missing — which is
the argument for the report script existing at all.

**Not fixed here, deliberately.** It changes every future turn budget, so it
wants its own pass with a before-and-after on real rows rather than riding
along with a documentation commit. Two things are already true and will not
improve by waiting: the 79 existing rows can never be backfilled, since the
split was never written down; and a fix only starts paying from the next run.
Recorded in `AGENTLING.md` §8 as a known gap and in §15 as a task blocked on
nothing.

**Fixed the same day, with the measurement the entry asked for.** `LedgerEntry`
gained the field, `index.ts` copies it, and `costPerTurn` subtracts it — plus a
filter change that matters on its own: a row now qualifies on *session* cost
above zero rather than total cost, so a killed run whose only measured spend
was its write-up no longer contributes turns against a zero and drags the rate
down. Three tests, one per case: the split is excluded, a row without one is
read as all-session, and the write-up-only row is ignored.

**The write-up is dearer than this entry guessed.** It said "about 2c" and
"roughly a cent" of rate inflation. Measured across 14 surviving records the
mean is **3.53c**, range 2.07–4.82c — about 9% of a 39.2c session, not a
rounding error. The guess came from a figure in the notes, which is the thing
this project's first rule says not to trust, in an entry written by the person
who wrote the rule.

**It did not ship inert, because the history was recoverable by
identification.** `scripts/backfill-ledger-closeout.mjs` reads the split back
off the persisted job records and matches on `jobId`: 13 rows stamped, 65 with
no surviving split left alone, and 1 refused because its recorded write-up
equalled its total. Nothing was inferred from the mean — that is the
mislabelling D-036 retired its own backfill to avoid, and a stamped average is
indistinguishable from a real observation once written.

Rates fell 1.3–6.3% (scribe one-shot with a repo 5.37c → 5.03c; worker session
without one 2.97c → 2.82c). **At a 50c ceiling exactly one of five classes wins
a turn**, and several are clamped by their role's cap regardless — so the
honest claim is that the retrospective effect is small, and the prospective one
is larger, because every new row carries the split where only 13 of 79 old ones
could. Nobody was over-billed at any point; `priceFor` caps the charge
independently, which is why this survived 79 jobs unnoticed.

## D-040 — 2026-08-01 — The code host is builtin, because the budget for a stdio server is not ours

The roadmap called a code host the cheapest first credentialed connection and
said it was blocked on nothing. Two things turned up on contact.

**The obvious server is deprecated.** `@modelcontextprotocol/server-github`
starts, works, and prints `npm warn deprecated … Package no longer supported`.
GitHub's supported replacement ships as a Docker image — Docker is not
installed here — or as a remote HTTP endpoint, and `Connection.transport` is
`builtin | stdio`, so this registry cannot express a hosted server at all. That
gap is now recorded in `AGENTLING.md` §5 as the first thing to fix if the next
connection is somebody else's.

**Builtin is the better answer regardless, and the catalog had already argued
it.** Its own comment says results should be small by design, "and for a stdio
server that budget is the server's own flags, not ours: the SDK talks to it
directly, so nothing of ours sits in between". A code host is precisely where
that bites — one issue list or one diff is unbounded. Measured against a real
repository, 30 open issues are **150,320 characters of API JSON and 3,969 as
delivered, 38× smaller**. `get_pull_request_files` returns names and line
counts and never the patch, though the API offers one on every entry.

So `github.ts` is our own eight tools over the REST API, reusing the token
discipline the library sync already had, and `agent-runner.mjs` builds their
schemas from config rather than importing anything of ours.

**The tools were enumerated, not read about.** Speaking JSON-RPC to the
reference server returned 26 tools, 14 reading and 12 acting. That is D-034's
method and it earns its keep twice: it produced the read/act split honestly,
and the acting names are now asserted absent in two places — the catalog, which
is the grant, and the implementation.

**A test caught a traversal hole that review did not.** `isRepo` was
`/^[\w.-]+\/[\w.-]+$/`, which reads as "word characters, dots and dashes" and
silently accepts `..` as a whole segment — so `../secrets` was a well-formed
`owner/name` and went into an API path. The check is now per segment with
all-dots refused. Worth recording because the regex looked obviously fine, and
the test that failed was written to assert something else entirely.

**Live before believing it:** three tools called against a real public
repository, unauthenticated, returning correctly shaped and trimmed output. The
connection ships **off** and cannot be switched on without `GITHUB_TOKEN` —
which the user sets themselves. 688 tests green.

**`get_checks` removed on first contact with a real token.** Seven of the eight
tools verified live against the private repo; the eighth 403'd, and the
permission it needs was not in the fine-grained PAT picker. Both observations
have the same cause: GitHub restricts the Checks API to GitHub Apps, so no
personal access token can read it.

The documented fallback is the Commit Statuses API, which a fine-grained token
*can* read — and it does not cover the same ground. Measured against an
Actions-based repository, one commit returned **0 statuses and 399 check runs**:
GitHub Actions reports as check runs and posts no statuses at all, so a
statuses-based tool would answer "no CI" on every repository whose CI is
Actions. Switching would have produced a tool that works and is wrong, which is
worse than one that fails honestly.

So it is gone rather than fixed, and a test asserts it stays gone so it cannot
drift back as a tool that 403s. Reading CI needs a GitHub App — a bigger
decision than a tool, and moot here until the repo has any CI to read, which it
does not. Recorded as a roadmap row.

Worth keeping the shape of this: the tool list came from enumerating the
reference server, which was right, and every one of those 26 tools is
implementable *by a GitHub App*. What the enumeration could not tell us was
which of them a PAT may call. A capability list is not a permission list.

## D-041 — 2026-08-02 — A clean exit is not a delivery, and scout could not write

The first real job through the code host connection found two faults, neither
of which any test had caught. Job `149620b5`: "list the last 10 commits on
briant92/Agentlings and summarise what changed", queued with no repository so
the connection was the only way to answer.

**The connection worked.** `mcp__github__list_commits` was called and returned,
which proves the whole chain end to end — catalog, settings, `grantedTools`,
the executor's config, the runner building zod schemas from those specs, the
internal endpoint, the API.

**`scout` could not write down what it found.** Its frontmatter said
`tools: [read, grep, web_fetch]` while its own prompt promised "you never
modify files other than your own notes and RESULT.md", and every session is
told to write RESULT.md. So it read the commits, tried `Write`, was refused,
tried `Bash cat >`, was refused, and ended by saying it had no way to record
the answer. Fixed by adding `write`, with a test over the shipped roles
asserting each has `Write` or `Bash` — Bash counts, since `analyst` delivers by
`cat >` and is coherent that way. Mutation-tested: the guard fails on the old
frontmatter with the role named.

**The second fault is the one worth deciding.** The job was recorded `done` and
**priced at 4.7c**, having produced nothing: its sandbox holds `.session.json`
and no RESULT.md. `fail()` asks whether a run delivered — `hasPatch ||
deliveredFiles(sandbox)` — and carries three measured cases in its comment
explaining why. `complete()` asks nothing and sets `done` unconditionally.

So a run that *dies* is checked for delivery and a run that *exits cleanly* is
assumed to have delivered, and this run exited cleanly by explaining that it
could not do the work. That is this project's own rule recurring: "it
delivered" keeps being re-derived, the shared function exists, and the success
path does not call it.

Not fixed here, because the right answer is a decision about billing rather
than a missing call:

- `failed` — absorbed, which is honest about the outcome but files a session
  that ran fine under the same label as one that crashed.
- `partial` — the existing name for "left something worth your attention",
  except here there is nothing to review at all.
- `done` at a price of zero — keeps the outcome accurate and stops the charge,
  and needs `priceFor` to take delivery as well as outcome.

The last is the closest fit and it changes what `priceFor` is, so it wants its
own pass. Recorded in `AGENTLING.md` §15 under cost machinery.

## D-042 — 2026-08-02 — The quote overshot sevenfold, and narrowing it did not help

The third run of the same job was the first genuine repeat in the ledger. The
recipe fired — `oneshot`, five-turn leash, key recorded — and two things came
out of it that the tier story did not predict.

**The leash saved nothing.** Run two was a full session at 7.86c over 12 turns;
run three was leashed to 5 and cost **8.04c**. A recipe saves the exploring, and
a Haiku scout calling one tool and writing one file was not exploring. The
close-out is a fixed ~2.2c either way. So `AGENTLING.md` §8's "51% off" is a
population average across mixed roles and shapes, and for work that was already
cheap and tight the step-down is zero. Worth stating there, because the number
reads like a promise about the next job.

**The quote said 56.7c for a job that cost 8.04c.** Traced exactly:
`quoteFor('oneshot', recipeKey, …)` found no history for that key, fell through
to the whole one-shot population — worker and scribe runs against repository
clones, mean 18.8c, max 47.3c — and `max(mean × 2, max × 1.2)` is 56.72c to the
cent. Scout's own five runs had cost 1.4c to 8.0c. Nobody was over-charged,
since `priceFor` caps at actual cost, but the quote is what the user sees
*before* deciding to run anything.

**The obvious fix was built, measured, and thrown away.** `shapeHistory` looked
right by analogy with `costPerTurn`, which narrows by role and shape because
D-018 proved a pooled rate predicts neither. Replaying every paid quote in the
ledger against only the rows that preceded it:

| variant | mean abs error | breaches | quotes over 5× actual |
|---|---|---|---|
| today | 35.0c | 8 | 7 |
| role+shape, same tier only | 33.9c | 8 | 7 |
| role+shape, falling back to session | 34.8c | 8 | 7 |

Identical to within noise on 63 quotes. On the seven quotes it actually
changed, four came closer and three got worse — one badly, a 13.3c scribe
one-shot quoted at 103.9c, because falling back from `oneshot` to `session`
inherits full-session prices for a five-turn leash. Excluding compiles from
that population helps and does not rescue it: scribe sessions with a repository
genuinely run 28c–107c.

So the defect is real and this was not its fix. Reverted rather than shipped,
which is D-029's shape again — the compile rate split, measured and then not
done. The right time to reopen is when a role has one-shot history of its own,
because the honest reading of these numbers is that the fallback matters less
than having any same-kind history at all, and 80 mostly-synthetic jobs cannot
supply it.

One thing not to lose: mean absolute error is the wrong yardstick for a quote
the user reads. A 7× overshoot on one job matters to whoever decides not to run
it, and averages over 63 rows cannot see that. Whatever reopens this should be
judged on the ratio of the worst quotes, not the mean of all of them.

**The report was measuring the wrong population, and fixing it changed the
answer.** `recipeKey` is only written on `oneshot` rows, so grouping by it saw
a job's leashed runs and none of the sessions that preceded them — which hid
the very transition the section exists to show. The key is now recovered from
the job record's own prompt through the same `normalise` the router keys
recipes by, imported rather than copied, since a second notion of "the same
job" drifting from the first is a mistake already on this list.

Repeated jobs went from 4 to 8, and five of them have now been seen on both
tiers, which is the first time the step-down could be measured *within* a job
rather than across two populations:

| job | session | leash | |
|---|---|---|---|
| make slugify robust | 13.4c | 11.0c | 18% off |
| write a note in anchor2.md | 20.9c | 13.9c | 33% off |
| write exports.md at the repo root | 66.9c | 39.8c | 41% off |
| read a reddit page | 36.5c | 21.2c | 42% off |
| summarise recent commits | 7.2c | 8.0c | 11% dearer |

**So the population figure of 50% roughly doubles the real per-job saving**,
which is 18–42% where there was exploring to cut and negative where there was
not. The two numbers differ because the tiers hold different work, not because
the leash behaves differently — exactly the pooling error D-018 found in the
rate and D-042 found in the quote, now found a third time in the headline this
project has been quoting at itself.

Ten paid rows cannot be grouped at all, their job records being gone, and the
report says so rather than quietly averaging over what is left. `AGENTLING.md`
§8 now carries the per-job table instead of the tier comparison alone, and the
trail prints one letter per tier so `78.2c(S) → 46.6c(1) → 0.0c(T)` shows the
whole ladder on one line.

## D-043 — 2026-08-02 — The tool tier could not fail into a session, and its absorption was invisible

Reading one odd trail in the repeat report — `0.0c(T) → 0.0c(S) → 27.7c(S)` for
"list every server module that has no test" — turned up three faults and one
thing working exactly as designed.

**Working:** the fall-back billing. Two jobs have had a tool claim them and
fail, at 27.7c and 55.7c, and both were charged **nothing**. "A promise of free
that arrives as a bill is the one thing the quote exists to prevent" holds on
real money.

**The tier could not fail into a session.** `runTool` awaited `cloneRepo`
unguarded, so a `git clone` failure threw out of the executor and killed the
job — the one route where "if the tool cannot, do it properly" did not hold.
Job d450afd3 died exactly there. It was then filed as a `session` failure in a
tier it never reached, and left the tool's strike count untouched, so the
ledger recorded a session that never ran and the tool showed a clean record for
a job it had lost. Guarding the clone fixes all three at once, which is why
there is no separate fix for the mis-attribution: removing the cause was
cheaper than labelling the effect. `writeDiff` is guarded for the same reason —
work whose diff cannot be captured is work nobody can approve.

**No strike for a failed clone, deliberately.** Two failures retire a tool, and
the clone is ours rather than the tool's; retiring a working tool because the
filesystem was busy would punish it for our fault. The test asserts the strike
count stays at zero, and mutation-testing it reproduces d450afd3's exact error.

**`toolFellBack` never reached the ledger** — set on `JobMeter`, dropped by the
same row builder that dropped `closeOutUsd` (D-039). So the ledger could not
answer how often the fourth tier claims work it cannot finish, which is the
question that decides whether the tier is worth having. Now recorded, and the
two historical rows recovered by identification from the surviving job records.

**And `absorbed` was counting the wrong thing.** It read "cost of rows whose
outcome is `failed`", but a fall-back finishes `done` at a price of zero — so
83.4c of deliberate absorption was invisible and the total read as complete.
It is now "spent and never charged", which is what the word meant all along:
$10.88 → **$11.71, 63% of all spend**.

The part worth keeping is how that last one hid. `totals()` had the definition,
and the report had **its own copy** — so fixing `totals` moved the report by
exactly zero, and the number only changed when the copy went. This project's
own rule, met head on for the second time: "it delivered" keeps being
re-derived locally, and the answer is to call the shared function.

**Settled as `failed`, and not for the reason this entry expected.** It argued
for `done` priced at zero, on the grounds that the session did complete. That
reads the status as a description of the run. It is not: `done` means delivered
and ready to review, `partial` means delivered but cut short, `failed` means
did not deliver. The taxonomy classifies **delivery**, and by it a run that
produced nothing has exactly one cell — whatever manners it exited with. Naming
that made the third option collapse: no `priceFor` change is needed, because
absorbing failures is already the rule.

`complete()` now asks the same question `fail()` asks, through one private
`delivered()` both call, and hands an empty run to `fail()` with the session's
own summary as the error. "I need write permission to complete this job" is a
better account of what happened than anything the queue could invent, and it
was previously discarded along with the outcome.

**Fixing the queue alone would have changed nothing that matters.** The ledger
takes its outcome from the sim's callback, which hardcoded `'done'` on the
resolve path — so an empty run would still have been announced as a delivery,
still credited to the agentling who could not do it, and still priced. The sim
now reads the queue's verdict back and lets the event, the career counter, the
outcome and the walk to the exit all follow it. That is three things fixed by
one question being asked in the right place, and it is worth noting that the
half I first wrote would have looked correct in the queue's own tests while
leaving the bill exactly where it was.

Mutation-tested on both halves: without the queue change an empty sandbox files
`done`, and without the sim change the events read `['started', 'done']` with
nobody credited a failure.

**One adjacent case left alone.** `RoutedExecutor` credits a recipe when
`result !== undefined || hasPatch` — a clean exit, which is the same assumption
this entry just removed, so a run that delivered nothing can still credit its
recipe. It is deliberately *not* changed here: that counter was set to clean
exits on purpose, measured against job 2711da49 where a files-on-disk test
banked a success for a run that produced no PDF, and moving it is a separate
decision about what "the recipe reliably works" means. Recorded so the next
person finds the reasoning rather than the inconsistency.

**The adjacent case above is now done, and needed a third condition rather
than a swap.** `RoutedExecutor` credited a recipe on `result !== undefined ||
hasPatch` — a clean exit, which is the assumption this entry removed. Neither
obvious replacement works, because three runs on record pull in different
directions:

| run | should count | clean-exit | files on disk | both |
|---|---|---|---|---|
| 2711da49 — wrote a generator, ran out, no PDF | no | no | **yes** | no |
| 149620b5 — finished politely, empty sandbox | no | **yes** | no | no |
| correct diff, then ran out writing it up | yes | no | yes | **no** |

So it reads `(result !== undefined && deliveredFiles) || hasPatch`: a clean
exit must also have left something, and a diff stays sufficient on its own,
which is the third row. Mutation-tested — without it, the polite empty run
banks a success, and three of those compile a tool from a method that delivers
nothing.

**And the counter was checked on live code, because a dead cohort said it might
not work.** The `slugify` recipe carries 13 one-shot rows recording its key and
`hits: 0` on disk, which would mean the three-successes gate never opens by the
ordinary path — the symptom already on record as "the fourth tier had to be
built speculatively". Ruled out as a live fault: `rememberRecipe` preserves
counters, the answers backfill only deletes `answer`, and a fourth run of the
code-host job moved the recipe from 1/1 to **2/2 with `lastUsedAt` set**. The
zeros are a ghost of code that was committed at 11:58 and evidently not running
at 12:32; not worth reconstructing further, and now not worth worrying about.

That run also priced honestly: quoted 16.1c, cost 8.4c, charged 8.4c, five
turns, 2.1c of it the write-up. One more delivery and it is compilable, which
will be the first recipe to reach that gate on its own.

## D-044 — 2026-08-02 — Landing three times does not make a method compilable

Five runs of the code-host summary took its recipe to three deliveries — the
first recipe to reach the compile gate by the ordinary path, which is what
D-021 built the machinery for and had never seen. It is also a recipe that can
never be compiled.

A tool is two plain-node modules with "no dependencies, no shell commands, no
network". That job earns its answer through the code-host connection. The gate
checked that the method was **repeatable** and never that it was
**reproducible in code**, so promoting it would have spent about a dollar
asking a session to write a script that cannot exist — and the honest outcomes
are a compile that fails its own check, or one that passes a trivial check and
serves a stale answer for free, which is the single outcome this tier exists to
prevent.

**The obvious guard was wrong and the data said so before it shipped.**
Refusing any recipe whose surface names a connection would also refuse
`anchor2` — five deliveries of writing a short note — because `web` ships on
and therefore sits in almost every surface, including recipes that never
fetched anything. A capability surface records what a run *could* reach, not
what it used, which is exactly the ambiguity that makes this hard.

What separates them is deliberateness. Measured across both levels: the two
recipes that actually compiled carry no connection tokens at all; `anchor2`
carries only the ambient `web`; the code-host recipe carries `github` and
`browser`, which the user had to switch on. So the gate subtracts the
`defaultOn` connections and refuses on what is left. Ambient availability
carries no information; a connection somebody turned on does.

Verified live and for nothing: promoting the code-host recipe now answers "that
method used browser and github, and a compiled tool is plain node with no
network — it could never do this job."

**The limit, stated rather than hidden.** A job that genuinely fetched a page
with nothing but `web` still passes this gate and will produce a failing
compile. That is the price of reading availability instead of use, and closing
it needs the run to record which tools it actually called — which the ledger
does not carry and no measurement yet demands. Recorded so the next person
knows the gate is a filter and not a proof.

## D-045 — 2026-08-02 — The first compile produced a cache, and its own check could not tell

The `anchor2` recipe — five deliveries of "write a short note explaining what a
favicon is, with one example" — was promoted on request. The compile went
perfectly by every measure the app has: 51.1c against a $1.58 quote, 8 turns of
10, both scripts written, status `done`.

`run.mjs` holds the note as a string literal.

**That is a cache, not a method, and it makes the tier's safety check
circular.** `verify.mjs` is twenty assertions about the note's structure —
definition, testable claim, one `<link>` example, a caching gotcha — and every
one of them passes by construction, because the same session hardcoded the text
those assertions describe. A program checking a constant it itself wrote cannot
fail. The check that D-021 insisted on "harder than the script" was, here,
theatre.

**And the router would have served it to other questions.** Tools match on the
strong bar, which is the recipe bar. Measured against the compiled manifest:

| prompt | score | |
|---|---|---|
| …what a **favicon** is | 1.000 | claims |
| …what a **web manifest** is | 0.700 | claims |
| …what a **service worker** is | 0.700 | claims |
| …what **CORS** is | 0.778 | claims |

So "explain CORS" returns the favicon note — free, and passing verification.
That is the free wrong answer this tier exists to prevent, arrived at through
the tier's own machinery.

**So the boundary has a sharper test than D-021's.** "Add tests for module X"
versus "list the modules with no test file" is a rule about the job. This is a
rule about the artefact: **if the answer is a literal in `run.mjs`, it compiled
a cache** — and no `verify.mjs` can detect that, because the same session wrote
both. Nothing automated caught it. Reading the generated code did, which is
precisely what the review gate is for (D-011, D-021), and is the first time
that gate has earned its keep on a compile rather than a library install.

**Discarding it then poisoned the recipe.** The manifest is written before the
compiling session runs, and `promote` refused any later attempt because "a tool
for that recipe already exists" — a tool with nothing to execute. Discard is
supposed to be the safe half of review; instead it made the recipe permanently
uncompilable, and the router never noticed because `usableTools` needs both
scripts. Fixed by asking the question properly: refuse when a tool *works* or a
compile is *in flight*, which is robust to discard, cancel, a crash or a
restart. Chasing each terminal path would have left the next one to be found
the same way — as cancelling did, ten minutes later, straight after the discard
fix.

## D-046 — 2026-08-02 — The knowledge store: opened, not settled

**This entry was opened, and is now closed by D-047**, which picked option C.
It is kept as written because the options and what each would cost are the
reasoning D-047 rests on; read it for the alternatives, cite D-047 for the
position. What remains genuinely open here is the *second* question only in the
sense of its thresholds — the answer itself is in D-047 too.

**It was written open**, against this file's usual contract, because the
roadmap row said "decide what the crew may read" and a one-line blocker is not
a decision anybody can take.

**The goal.** A level's recall corpus is closed. `KNOWLEDGE.md` is written by
the crew, from its own finished jobs, so a level can answer for free only about
work it has already done. Ask it something you wrote down yourself, somewhere
else, and it falls through to a paid session — 38c to reread your own notes.
The `answer` tier is where cost actually reaches zero, so widening what it may
legitimately claim is the largest saving left on the board.

**It is not blocked on wiring, and that is worth being precise about.**
`catalog/connections.json` takes any stdio MCP server today, and a notes store
is a reading connection, so it sidesteps the acting blocker entirely (D-034).
What is undecided is scope, and §11 is why: there is no classification,
redaction or retention layer, so whatever the store returns enters a Claude
session whole. A notes store is usually undifferentiated personal material.
"Point it at my notes" is therefore a bigger grant than "point it at my repo".

**Three scoping options, none chosen.**

| | Shape | Costs |
|---|---|---|
| A | One connection, whole store, ships off — exactly how `github` ships | Simplest, and the grant is all-or-nothing. Every read is live, so freshness is whatever the store says today |
| B | Per-level allowlist of spaces, folders or tags | Matches D-013: capability is per level because a method proven against one project is not proven against another, and a notes store cuts across that grain. Costs a scoping UI and a decision per level |
| C | Sync-and-index — a trimmed local index the crew reads, never the store live | Matches the shape M5.2 already proved for the web: trim before the model, one implementation, and the size is ours. Makes freshness explicit and auditable. Costs a sync path and staleness becomes a real state |

**A second question, separate from scoping and easy to conflate with it: may
the free tier serve from it?** `KNOWLEDGE.md` is trusted because the crew
earned it — every note is the residue of a job that ran. External docs have
unknown freshness and no such provenance, and D-045 is the standing warning
that a free wrong answer is the one outcome worse than a right answer that cost
money. A defensible split is that a store **grounds a session** and never
**answers on its own** until freshness can be established, which pushes the
saving from "free" down to "cheaper" and is a materially different feature.
Deciding scope without deciding this would ship the ambiguity.

**What would settle it, and why nothing here is measured.** No figure in this
entry is evidence: nothing in the ledger records whether a question *could*
have been answered from own material, so the size of the prize is unknown. That
is the same shortage that parks the attachment quote and the clarification
comparison — real traffic, not more thought. The cheap first move is to record
it: a routed `agent` run that recalls rather than produces is already
distinguishable in principle, and counting those would price this row before it
is built rather than after. (D-042, D-044)

**The counting started the same day.** Two raw facts on every paid row —
`asked` (question-shaped) and `recallable` (how many of the level's own notes
share a term with the prompt) — computed by `recallSignal` in `router.ts` from
the same scorer the recall tier and the session context already use, so there
is one notion of "a note that bears on this job" rather than a second that
could drift from it.

Recorded and read by nobody, the same bargain as `compile` (D-029). Two facts
rather than one verdict because the bar is the part nobody can place: an asked
question with `recallable: 0` is the run a store would have served, a high
count is a run that was paid for despite the notes being there, and which of
those matters is what the data has to say. Deciding "recall-only" at write time
would bake in the guess this entry exists to avoid.

Gated on presence rather than truth, which is the whole design: `asked: false`
is written, because without the negative rows there is no denominator and the
answer is a count with nothing to divide by. An absent field means the row
predates the measurement — a distinction that would be lost if false were
treated as nothing to say. `asked` understates by construction, needing a
question mark or a leading wh-word, so "do we have a deploy doc" is missed;
an undercount is a floor, an overcount is a story.

Free-tier rows carry neither, deliberately: the router already answered those,
so they are not the paid traffic being sized.

**The first version measured only the runs that landed, which is this project's
oldest mistake wearing a new hat.** The signal was attached to the executor's
success return, and a run that dies throws a `SessionFailure` instead — which
carries a meter precisely because the ledger files a row for it. So every
question that ran out of turns would have been counted as no question at all,
and on a short leash those are most runs. Exactly the blindness D-017 found in
the quote, arrived at independently four entries later. Caught by checking the
claim "every paid row carries it" against the failure path rather than against
the tests, all of which passed. Failed and cancelled runs now carry it too: a
cancelled run was still a question and still spent money, which is a different
question from whether anyone wanted it compiled.

**And the row builder was pulled out of the server to be tested.** It is the
one function in this app with a proven habit of dropping fields silently —
`closeOutUsd` for 79 jobs, `toolFellBack` for two more, both declared on the
type and written by the executor and lost in those lines (D-039). It sat inside
a completion callback in `index.ts`, unreachable without binding a port and
writing to the real ledger, so both bugs were found by reading job files
afterwards. `ledgerRow` is now pure and every field the meter can carry is
pinned by a test, including the ones that already worked. Verified over the
composed chain rather than hop by hop, since composition is where this keeps
failing: "what is our deployment process?" produces `asked: true,
recallable: 0` on a 38c session row, and "what did we learn about the payment
flow" produces a free `routed` row with neither field.

## D-047 — 2026-08-02 — The knowledge store is synced and indexed, never read live

D-046 laid out three scoping shapes and refused to pick between them. Picked:
**C — the crew reads a trimmed local index, scoped per level, and never talks
to the store live.** A (one connection, whole store) and B (a per-level
allowlist over live reads) are both rejected, and B's virtue is kept.

**Decided at n=0 traffic, deliberately, and the split is the point.** The
counter added the same day sizes whether the store is worth building and when;
it says nothing about which shape it should take. Shape turns on the safety
model and on where the corpus plugs in, both already settled here, so waiting
for rows would not have improved this answer — and D-046's own warning about
small samples applies to the *build-it-at-all* question, which stays open.

**It is the only shape that keeps the app's one safety guarantee.** Everything
here is sandbox → review → promote, and preview-before-install for anything
executable (D-011, D-021). A and B both hand a session live reach into a corpus
nobody has read; the index is an artefact you can inspect *before* the crew can
use it. "Nothing arrives unread" already governs a skill's companion files, and
a page of notes going straight into a session is the same event.

**It is also the cheapest, which is not a coincidence.** `readKnowledge` returns
`string[]`, and both consumers — the recall tier and the session context —
select from it with `relevantLines`. An index that emits lines slots into that
seam with no new tier, no new router branch, and no second scorer. A and B would
each need one, and a second notion of "a note that bears on this job" is exactly
the duplication D-030 was written about.

**Size stays ours.** M5.2 measured the trim-before-the-model shape at 573 KB raw
against ~3k tokens delivered, and D-040 refused a stdio code host because an
unbounded reply is the expensive kind. A live store returns whatever it returns,
in every request of the session.

**B's virtue is kept rather than lost.** The index is per level, which is where
capability belongs (D-013) — a method proven against one project is not proven
against another, and a note about one project is not a note about another.
Choosing what a level syncs *is* "decide what the crew may read"; C relocates
that from a standing live grant to a one-time choice with a reviewable result.

**The second question, which D-046 warned would ship as ambiguity if left:
the free tier may serve from the index, with two guards.** Every synced line
carries its source and the date it was synced, and a recall answer says so; and
an index past a staleness threshold falls through to a paid session rather than
answering free. The distinction that makes the guards necessary: a `KNOWLEDGE.md`
note is an immutable record of something that happened on a date, while a wiki
page asserts what is *currently* true. Notes cannot rot the way pages can, and
serving a stale page for free is the outcome D-045 caught the first compiled
tool committing.

**What this does not decide.** Which store, and the threshold numbers — both
want measurement rather than argument, and the threshold especially should be
set against real staleness rather than picked. When one is wired, D-040's rule
stands: establish its tool list by speaking to the server, not by trusting its
README, because a wrong tool name grants nothing and does so silently.

## D-048 — 2026-08-02 — The knowledge store built, and the free tier caught guessing

D-047 decided the shape; this is it built, and the thing that building it found.

**The store.** `store.ts` walks the folders a level names, splits markdown at
its headings, trims each passage to 600 chars and writes
`store-index.json` — every entry stamped with its file and the date it was
read. `storeLines` renders an entry as a corpus line with that provenance
*inside* the line, which is why neither the recall tier nor the session prompt
contains a word about stores: both already print lines. `readKnowledge` returns
`string[]`, so the index needed no new tier, no router branch and no second
scorer, exactly as D-047 predicted from the seam.

Staleness is one rule in one place: past a week `storeLines` returns nothing, so
a stale index cannot be matched, the free tier has nothing to answer from, and
the job falls through to a session that can go and look. Two copies of that rule
would eventually disagree.

`recallSignal` is deliberately *not* fed the store. It measures whether the
crew's own notes could have answered a paid question — the figure that says
whether a store was worth having — and letting the store feed it would have had
it answer its own question yes the moment the store existed (D-046).

**Then the live check found the free tier answering a question about quantum
mechanics.** Quoting "what do we know about quantum tunnelling" against `hq`
came back `routed` — free, "we already know this". With the store emptied it
still did, so this was never about the store: it had been true of the recall
tier all along and the store only made it louder.

Measured rather than guessed at: `terms()` returns `['know', 'quantum',
'tunnell']`, `know` is not a stopword, and `relevantLines` accepted any note
scoring above zero. One note of 86 matched, sharing exactly `['know']` — a note
about writing `EXPORTS.md`. So the tier was scoring on the one word guaranteed
to appear in every question that reaches it, and "never guess" was guessing by
construction.

**Fixed by scoring on what the question is about.** The asking vocabulary —
know, learn, find, remind, tell, and their forms — is dropped before scoring,
inside `relevantLines`, so the recall tier, the counter and the eight notes a
session is handed all get one rule rather than three copies. The set is built by
running `terms()` over those words rather than written out pre-stemmed, so it
cannot drift from the stemmer. A question left with no subject at all — "what do
we know" — now matches nothing, which is the honest answer: there is no subject
to be relevant to.

Verified live against the real level, and the negative case matters as much as
the positive: "quantum tunnelling" now quotes a session; "rolling back a deploy"
against an indexed folder quotes free and answers with `[ops/deploy.md, synced
2026-08-02]` attached; and "what do we know about the ledger" *correctly* quotes
a session, because `hq` turns out to hold no note containing the word — checked
rather than assumed, since an over-correction would look identical from outside.

**What is not built: any UI.** The store is reachable only over the API
(`GET/POST /api/levels/:lid/knowledge`, `POST .../sources`, `POST .../sync`).
Pointing a level at a folder from inside the app is the obvious next piece and
was left out rather than half-done.

**The UI, added the same day (D-048 continued).** *reading* in the level header
opens the store panel: the folders this level reads, what the copy holds, when
it was taken, and an add box. Adding a folder reads it immediately — a saved
folder nobody read is a setting that looks done and does nothing, which is the
same failure as a connection listed ready with no secret behind it.

Three things the panel says that nothing else can. A **stale** copy is called
out in words, because "the crew quietly stopped using your notes a week ago" is
otherwise invisible from every screen in the app. The **overflow** past the
250-per-folder cap is shown with the advice to point somewhere narrower, rather
than a number nobody can act on. And a source that is **not found** is marked on
its own row.

That last one came out of driving the finished UI rather than out of designing
it. Typing a bad path showed an error and then saved the folder anyway, so the
error scrolled away and left a row identical to a working one — a source
contributing nothing, looking exactly like a source contributing everything.
The fix re-checks existence on every read of the status rather than only when
the folder is added, which also catches the more likely case: a folder that was
fine when added and has since been moved or renamed.

Verified in the browser against the running app, not only by test: the panel
opens on its empty state, a folder added through it reports "4 passages from
2 files · read just now", a bad path is marked NOT FOUND on its own row, and
remove takes each back out with the counts refreshing. No screenshot — the
preview pane in this environment does not composite frames, a known limitation
of the harness rather than of the app.

## D-049 — 2026-08-02 — The store measured, and the second unquoted way in

The knowledge store run against real work for the first time, and the result is
mixed in a way worth writing down rather than rounding up.

**Where it wins, it wins completely.** "What do we know about the close-out
pass" was answered `routed`, **$0, no session at all**, from six indexed
passages each carrying `[AGENTLING.md, synced 2026-08-02]`. That question would
have been a session before. The saving is not a percentage.

**Where the crew already has a clone, it wins almost nothing.** Paired on one
prompt — "which decision settled how a knowledge store is scoped, and which
options did it reject" — with `noRouter` both times so no recipe could confound
it:

| | turns | total | session only | per turn |
|---|---|---|---|---|
| store on | 4 | 24.88c | 20.20c | 5.05c |
| store off | 5 | 27.32c | 22.61c | 4.52c |

**1 turn and 2.45c, about 9%** — and the per-turn column says why: the store
makes each turn *dearer*, because its lines are input tokens on every one of
them, and buys fewer turns in exchange. On this question that trade barely came
out ahead. **Both answers were equally correct**, and both cited
`repo/DECISIONS.md` line ranges rather than the store: with a clone in the
sandbox the session can simply read the file, so the store was helping it find
what it could already reach.

**n=1 paired, which is the small-sample error this project keeps catching**, and
a one-turn delta sits inside ordinary variation. Both confounds push the same
way — API prompt caching should have made the second run cheaper, and the level's
own notes grew between runs (`recallable` 2 → 3) — so the small win is if
anything understated. It is still n=1.

**So the store's value is concentrated in the recall tier and in material the
crew cannot otherwise reach**, which is what D-046 said the goal was. Pointing
it at the repository the crew already clones is close to its worst case, and
that is how it was measured here. Do not generalise this number to a notes
folder that is not in the repo.

**And the paired run turned up a second unquoted way in.** The no-store row
carried no `quotedUsd` at all: `POST /jobs/:id/redo` called `queue.add` without
quoting, so `turnsForBudget` never bound and the run fell back to the role's
cap. That is D-027 exactly, on a different route, found the same way — by
tripping over a ledger row.

Fixed by quoting it, with the part that matters being *which* quote. A redo sets
`noRouter`, so asking the router what it would do produces a fiction:
`/work/plan` prices the close-out question at **`routed`, $0**, and a redo of
that same job really runs a full session. The old code would have queued it
with a $0 ceiling and then spent real money against it — a promise of free
arriving as a bill, the one thing the quote exists to prevent. `quoteFor_` now
takes a `noRouter` flag and branches on the same expression `RoutedExecutor`
branches on, so the quote and the run cannot disagree about which of them is
happening. Verified as D-027 was, live and cancelled before either spent:
redoing the free job now quotes **$1.58** where the router says $0.

## D-050 — 2026-08-02 — Three tiers of capability, and what a compiled tool may inherit

A design review of the whole learning story, prompted by the observation that
the knowledge store as built (D-047, D-048) is a **bespoke input path in a
generic app**: it asks the user to already keep notes, in a folder, and to point
at them. That is an integration, not a capability. Its measured value stands
(D-049) and its role is narrowed accordingly — the door for material the crew
cannot otherwise reach, not the spine.

**The spine is what the level writes for itself**, which mostly exists:
`KNOWLEDGE.md`, `recipes.json`, `memory/<name>.md` and `tools/`, with the M5
ladder bending cost from `agent` to `oneshot` to a free compiled tool. Within a
level, `usableTools` is not scoped per agentling, so a tool the crew earns is
already available to everyone in it.

**The gap is that earned capability cannot leave the level that earned it.**
Nothing crosses but the ledger and the authored catalog. So the cost curve bends
per project and resets to zero for every new level — invisible with one project,
structural with many. Stated as three tiers:

| tier | holds | flows |
|---|---|---|
| baseline | `roles/*.md`, `skills/`, `buildAppend`, the router's free tiers | one copy, so it rises for everyone at once |
| level | knowledge, recipes, tools | never sideways |
| agentling | lessons | never sideways |

The baseline already propagates instantly *because there is only one copy of
it* — improve `worker.md` and every worker everywhere is better on its next
session. `AGENTLING.md` describes that baseline and is not part of it; it is
derived, and no agentling reads it.

**Generality should be earned, not declared.** A tool would graduate from level
to baseline on being independently earned in **two or more levels** — one
project cannot demonstrate that a method generalises, which is exactly D-013's
argument, so this respects it rather than overturning it. And the unit that
graduates is the **tool only**: a tool is mechanics, while a recipe, a lesson
and a knowledge line are all prose about one context. Prose never crosses. That
answers the contamination question structurally rather than by a rule someone
has to remember.

**The premise for gating a tool on its surface was wrong, and checking the
contract is what showed it.** The proposal was that a compiled tool, unlike a
recipe, has no capability surface and so never notices the baseline improving —
the D-036 bug, unfixed for tools. The asymmetry is real: `Recipe.capabilities`
and `sameCapabilities` exist, `ToolManifest` had nothing. But the compile brief
is *"No dependencies, no shell commands, no network. Node built-ins only"*, so a
tool uses **none of the four axes a surface records**. A moved surface therefore
makes a tool possibly *dated*, never possibly *wrong* — and its output is proved
by `verify.mjs` on every run regardless. Refusing on a mismatch would drop a
free, proven answer into a paid session to buy nothing.

So the gate is not built and the record is. `ToolManifest.capabilities` is
copied from the recipe at compile time — the only moment both are in hand — and
read by nobody, the same bargain as `compile` and `asked`. It is kept because
the contract is a brief rather than a jail, nothing stops a generated `run.mjs`
importing from the project root, and because giving tools the gated doors a
session gets would make the field load-bearing overnight for a question that
cannot be answered retroactively.

`scripts/backfill-tool-surface.mjs` recovered **1 of 5** tools on this machine
by identification (`tool.recipeKey === recipe.key`); the other four were
compiled before D-036 and their recipes carry no surface either. Reading the
level's surface *now* would have produced a plausible number describing a moment
that never happened, so those four keep an absent field, which is the honest
record. Idempotent, and 686 tests green.

**Stages 1–3 are deliberately not built**: record `earnedBy`/`earnedIn`, then
count cross-level recurrence, then the graduated catalog behind the same review
gate a compile already passes — a graduated tool is still executable
instruction (D-011, D-021). All three are downstream of repeat traffic that does
not exist: one genuine repeat in 36 jobs, two working tools, one active level.
Building the graduation mechanism now would be the mistake this log keeps
recording, in a nicer shape.

## D-051 — 2026-08-02 — The crew's first real finding: the recall tier counts where recipes weigh

The first jobs queued as work rather than as tests of a mechanism. One
delivered a finding better than the hunch that prompted it; the other failed in
a way that was the specification's fault, not the crew's.

**The finding.** A scout surveyed `relevantLines` over hq's 92 notes and ten
realistic questions for 17.7c (charged 9.6c — the quote capped it and 8.1c was
absorbed). **72% of all matches share exactly one word.** But the useful half is
what it noticed next: whether that is signal or noise depends entirely on how
*rare* the word is. Questions about `slugify` and `export` matched at 100%
single-word and every match was right; questions containing `test` and `write`
matched at 78–100% single-word and were noise.

That is sharper than the hunch it came from. After D-048 removed the asking
words, the remaining worry was recorded as "single-content-term matching still
lets weak hits into the tail", with the implied fix of demanding two terms.
Demanding two would have thrown away the `slugify` case, which is the tier
working perfectly.

**The asymmetry it points at.** `similarity()` in `recipes.ts` already weights
by rarity — *"two jobs both mentioning `estimate` are far better evidence of the
same work than two both mentioning `file`"* — with a `RARITY_NEEDS` guard so a
small corpus does not weigh its only signal down to nothing. `relevantLines` in
`router.ts` scores a raw count of shared terms and has never weighted anything.
So the paid tier that only lends a method reasons about rarity, and the **free**
tier that answers outright does not. That is the wrong way round: a weak match
on a recipe wastes a turn a session can ignore, a weak match here is a free
answer nobody checked.

**Not fixed, because the two candidate fixes have different blast radii and one
of them moves an instrument mid-measurement.** `relevantLines` serves three
callers — the recall tier's answer, the eight notes a session is handed, and
`recallSignal`'s `recallable`. Weighting the *score* changes ranking only, so
`recallable` (a count of lines scoring above zero) is untouched and the counter
keeps its meaning. Adding a *threshold* changes which lines count at all, and
would redefine `recallable` after four rows — cheap now, not later, but a choice
rather than an accident. Recorded so whoever picks it up knows the second option
is not free.

**And the failure was mine.** The other job asked a `worker` to add two fields
to a type, stamp them at a call site and write a test — three files against a
~1,300-file clone. `worker` declares no `maxTurns`, so it took the default 10,
spent 11, and produced **nothing at all**: no result, no diff, no change in its
clone. 45c spent, nothing charged, since failures are absorbed. It had already
been given the strongest known lever — the exact file paths — and still did not
fit. The answer is not a bigger cap (D-015, D-025: running out of turns is an
ordinary ending, and "ran out" is not "needed more"); it is that a three-file
change is two jobs. Re-queued split.

**Worth carrying separately: phrasing picks the role, and the role picks the
price.** The same survey, worded as implementation, quoted **$1.58** and routed
to `worker`; worded as "survey… read only, change nothing" it quoted **9.6c**
and routed to `scout` — 16×, before any work happened, because scout has real
history in the ledger while worker-with-a-repo still quotes the ignorance
ceiling. The quote is a lookup over what that class has actually cost, so an
unfamiliar class is expensive by definition.

**A promoted change does not reach the next job until it is committed** — found
by splitting the failed job in two and watching the second half fail anyway.
`cloneRepo` runs `git clone --local`, which clones **HEAD**, not the working
tree. The first half was reviewed and promoted, so its fields were in the real
`tools.ts`; they were not in the *commit*, so the second half's clone did not
have them. It dutifully re-derived the whole first half — both diffs carry the
same base blob for `tools.ts` — and then ran out of turns partway through the
change it was actually asked for, leaving a declared `const` nobody used. Not
promotable, and the run cost 45c that was absorbed.

Committing first and re-queuing the identical sentence finished in one go, and
the diff it produced is the one that shipped: 37.7c, and it matched the
conditional-spread style and the comment voice of the line above it without
being shown either. So dependent jobs need a commit between them, not merely a
promote — and this is the second time today the gap between "the app did it" and
"the repository has it" cost a run.

## D-052 — 2026-08-02 — A claim about the turn cap, withdrawn, and the instrument that was missing

I claimed the 10-turn cap was "reliably cutting runs at the verification step,
not the work step", on the strength of "four of seven jobs ended at
`turnsAllowed + 1` with the task essentially done". Measured, it does not hold.

**The ground truth, on the five cap-hit failures I had personally reviewed:**

| job | diff | what it actually was |
|---|---|---|
| `381a307f` | 0 B | nothing at all |
| `95c748d0` | 1.4 KB | re-derived a prior job, unused `const` — not promotable |
| `d42aae86` | 4.3 KB | new file written, its caller untouched |
| `9177b021` | 6.9 KB | complete and correct |
| `0d32e24a` | 5.7 KB | complete and correct |

**Two of five, not four of seven.** The four were jobs I had promoted something
from, which is a different set: promoting the *good half* of a half-finished run
is not the run having finished. I counted my own review decisions and reported
them as a property of the runs.

**And the signal underneath it was one this log had already measured as
unreliable.** `turns > turnsAllowed` fires on **43 of 88 paid runs**, and seven
of those finished `done` — D-022 recorded exactly that, "a successful run can
report more too". So the premise was built on a marker already known not to mark
the thing. That is the failure this project keeps writing down: *measure the
premise, especially one you are the one advancing.* Fourth instance.

**What is actually supported**: of 33 examinable cap-hit failures, 23 left a
diff or a result. That says the review gate recovers real work from runs nobody
was billed for, which is worth knowing and is a different claim.

**The real answer was that the question could not be asked.** Nothing recorded
what a turn was spent on. The ledger carried `turns` and `cost`; the per-tool-call
`progress` events lived in memory and died with the process; and the close-out
lessons describe the work, not the budget — all five say something about the
task and none mentions running out. So "was the last turn the work or the check"
had no answer in stored data, and I had filled that gap with a plausible story.

**So the instrument now exists.** `toolCalls` and `lastTool` are counted off the
tool stream and folded into the meter at the single point where all four of the
runner's exits converge — deliberately not at each exit, because attaching a
measurement only to the clean path is the mistake made in D-046 and the failing
runs are the entire population of interest. Recorded and read by nobody, the
same bargain as `compile` and `asked`.

Verified live on both halves rather than by reading the code:

- a finished scout run — `toolCalls: 20, lastTool: "Write"`, ending by writing
  its report
- a **cancelled** run — `toolCalls: 3, lastTool: "Read"`, still gathering when
  it was killed

The second is the useful one twice over: it proves the failure path carries the
field, and it carries **no `turns` at all**, because a killed session never
reaches the result message the SDK reports on. On exactly the runs where the
existing budget numbers go blank, this one still says what happened.

**One observation, offered as an observation.** The finished run reported 21
turns against a cap of 12, having made 20 tool calls. `turns ≈ toolCalls + 1` on
a single sample, and a gap between cap and reported turns far wider than the
"cap of 4 came back as 6" already on record. If it holds across rows it would
say the reported count tracks tool calls rather than the thing the cap limits —
which would explain why the cap and the reported number have never agreed. It
is n=1 and is written here as a thing to check, not a finding.

## D-053 — 2026-08-02 — A missing capability is not refused, it is substituted

The first two jobs queued through the UI by the user rather than by a session
were the same question asked twice. One finished in 4 turns for 34c; the other
exhausted its budget and was absorbed. Nothing about the subject matters — what
separates them is what each reached for when the thing it needed was absent, and
that generalises to every job the crew will ever take.

**There is no search.** The crew can read a page you *name* — `fetch_page`, and
the browser's eight reading tools. Nothing can *find* one. For a question with
no URL attached, that gap is total, and the run that succeeded says so in its
own output: *"`WebSearch` was attempted first and denied by the permission
mode."*

**Neither run stopped there, and that is the finding.** A missing capability
does not produce a clean refusal — it produces a detour, and the detours differ
enormously in price:

| | detour taken | tool calls | outcome |
|---|---|---|---|
| "How many goals has X scored in his career?" | fell back to model knowledge, and labelled it unverified | 3 | done, 34c |
| "Can anyone **find out** how many goals X has scored?" | went to the browser | 10 | **failed, 27.5c absorbed** |

**The phrasing chose the detour.** "Find out" reads as an instruction to go and
look, so the second run went looking with the only looking tool it had. The
first was asked a question and answered it. Two words of difference, 62c and one
failure apart — the same lever measured earlier that day, where wording a job as
a survey rather than an implementation moved its quote 16× by moving its role.
So: **say what you want done, not how hard to try.** "Find out" and "make sure"
and "check thoroughly" are budget instructions wearing the clothes of politeness.

**The good pattern is the first run's**, and it is worth protecting: when it
could not verify, it answered from what it had, said exactly which parts were
settled and which were moving, gave its own cutoff, and named where to check. An
unverified answer that says so is useful; the failure mode to fear is the
confident one.

**A job carries the level's repository whether the work needs it or not, and
that sets the price.** Both runs cloned a 1,300-file codebase to answer a
question that never touched it. Measured on this ledger the same day: **5.2c per
granted turn with a repo against 2.0c without**, over 35 and 8 runs. That is why
it quoted $1.58. The app cannot fix this by itself — `needsRepo` in the planner
means "the level has no folder, so ask", not "this work needs one", and deciding
a job does not need the code is a guess that leaves an agentling blind when it is
wrong. Choosing a level without a repository is the user saying it, which is the
only safe form the answer can take.

**And the new instrument has a misreading, which caught its own author within the
hour.** `lastTool` on the failed run is `browser_evaluate` — a tool the catalog
does **not** grant, asserted by a test. The run's final act was to ask for
something it could never have and be refused. `toolCalls` and `lastTool` are
counted off the progress stream, which records **what the model asked for, not
what it got** — the trap already on record from a `WebFetch` call that looked
like a leak and was a denial. Read the granted list before reading a tool name as
an action. The instrument is still the right one: without it this failure would
have read as "ran out of turns, cause unknown", and instead it names the exact
wall the run died against.

## D-054 — 2026-08-02 — A search connection, built because the gap was measured

D-053 measured what the crew does when it cannot search: it substitutes. One run
fell back to model knowledge and labelled it honestly; another spent its whole
budget driving the browser at a search engine and died there. The cheapest
answer to that is not a better browser — it is a search box, so `search` is now
a connection.

**Builtin, not an MCP server, for D-040's reason verbatim.** A search API answers
in verbose JSON — ranking metadata, thumbnails, profiles, dates, per result —
and for a stdio server that budget is the server's own flags, not ours. Owning
the call owns the size: `search_web` returns three fields a result, capped at ten
results with snippets clipped to 200 characters.

**Brave, after Google was tried and turned out to be impossible.** Scraping the
search page was never a candidate — against the terms, and D-035 had already
measured what it returns to a crawler: 429 and a CAPTCHA, the exact wall the run
in D-053 died against. So the choice was between search APIs, and I recommended
Google Custom Search as the official, well-supported one.

**It cannot do general web search any more, and I did not know.** As of
**20 January 2026** Programmable Search Engine only serves engines configured
against a list of at most 50 nominated domains; whole-web engines created before
that date keep working until 1 January 2027 and no new one can have it. The
control panel does not explain this — the toggle is simply dead — and the user
found the notice in a help page after doing the console setup on my advice. My
knowledge cutoff is May 2026, so this was four months inside it and I still gave
a confident recommendation. **A capability that used to exist is the easiest
kind of thing to be wrong about, because nothing contradicts you until someone
tries it.**

The revert cost one `git checkout` of two files and four one-line edits, which
is the only part of this that went right and was not luck: the provider sits
behind one URL, one parse and an injected `http`, so swapping it never touched
the tool, the gate, the runner or the trimming. Recorded here mostly so nobody
tries Google Custom Search for this again.

**Two tools, not one, and that is the design.** `search_web` finds and
`fetch_page` reads, each trimming its own half, and the search result text says
so in as many words. A single tool returning page contents would have re-created
the unbounded reply the split exists to avoid.

**Credentialed, so it ships off and is never live without both halves** —
the same rule as the code host. Verified against the running server: it lists
`ready: false` with both secrets named, so it cannot be switched on at all
until they exist — and a test pins that either one alone still refuses.

**The runner's builtin-tool block became a loop rather than a third copy.**
`web`, `github` and now `search` all reach back into the server through a gated
`/internal/*` door; two of them build their SDK tool schemas generically from
config, and a third near-identical twenty lines is how two of them quietly stop
agreeing about error handling (D-030).

**And the first draft of the catalog tests passed vacuously.** They asserted
`grantedTools(...)` did not contain `'search_web'` — but that function returns
*connection* names, so the assertion was true however broken the gate was. The
trap already on record as a scripted check matching a string that existed
elsewhere. Rewritten to go through `resolveForJob` and `mcpToolNames`, and
paired with a positive case that grants the key, so the negatives can only pass
because the gate held rather than because the string was never there.

11 tests on the search module, 4 on the catalog entry, 711 server and 66 web
green. Nothing has actually searched yet: that waits on a key.

**Verified on the run that measured the gap.** The prompt from D-053 that
exhausted its budget in the browser was re-queued verbatim, in a level with no
repository, with the browser still switched on so the substitution was still
available:

| | turns | calls | last tool | cost | charged |
|---|---|---|---|---|---|
| browser, failed | 11 | 10 | `browser_evaluate` *(refused)* | 27.5c | 0 |
| model knowledge | 4 | 3 | `Write` | 34.3c | 34.3c |
| **search + fetch** | 9 | 8 | `Write` | 39.5c | 39.5c |

It never opened the browser. Given a tool that finds pages, it searched, read
two of them and wrote up what they said — and the answer is the kind the
substitution could not produce: **919 goals as of 19 July 2026**, split 794 club
and 125 international, with two independent sources agreeing *on the split
rather than only the total*, a third matching, and the lower figures still
circulating (911, 914, 918) correctly diagnosed as older snapshots rather than
rival counts, since 23 of those goals were scored in 2026.

It also carried D-053's honest-fallback habit into a run that had sources:
counting basis stated, and *"not verified by me: whether Messi has played
between 19 July and today."*

**The price of being right is about 5c.** Against the model-knowledge run it is
39.5c versus 34.3c, for a sourced and cross-checked answer instead of an
unverified one carrying a knowledge-cutoff caveat. Against the failed run it is
39.5c charged versus 27.5c absorbed for nothing. And the fetched pages are the
reason a turn here costs 4.4c against the 2.0c a no-repo session averages —
search buys accuracy with input tokens on every subsequent turn, exactly as a
clone does, which is worth knowing before assuming a search tier is cheap.

## D-055 — 2026-08-03 — A free tier for finding pages, and what it must never claim

Asked why a search cost a full session when the app already answers *"read this
page"* for nothing, the answer was that nobody had built the other half. The
router had `answer`, `fetch` and `tool` free, and zero references to search: a
bare *"search for X"* paid ~35c for a session to make one API call and paste the
result. Now `search` is the fourth free tier.

**The whole design is in what it refuses.** `fetch` can use an allowlist because
its subject is a URL; a query is arbitrary text, so the subject cannot be
checked. Instead the *lead* must be a search instruction and the remainder must
not turn the search into a question about its own results — `and`, `then`,
`summarise`, `compare`, `why`, `how`, `best`, `should` and a dozen more. A
prompt carrying an address is a fetch, never a search: the page was named.

**Under-firing is deliberate.** "Search for the best typescript orm" contains
`best` and so costs a session, though it is a plain query. That is the safe
direction, and the reason is the router's own rule: a missed saving costs money,
a wrong answer costs trust — and **handing a list of links to somebody who asked
a question is a wrong answer given for free.** Ten of the sixteen router tests
added here assert that it does *not* fire.

**It also refuses work it could not finish.** The tier claims a job only when
the connection is granted to it *and* the level actually has a way to search, so
a level with no key never routes one. And a search that fails is not an answer:
the job falls through to a session, because the user asked for pages rather than
for an apology.

**Injected whole rather than as a key**, which was a correction mid-build. The
first version called `fetch` directly and would have made the tier untestable
without a network — the same untestability that hid two ledger bugs for 79 jobs
(D-039). `RoutedExecutor` now takes `searchFor?: (query) => Promise<SearchResult>`,
so the executor needs neither the secret nor an HTTP client, and five tests
exercise the tier with no network at all.

**And the quote was lying.** `routed` covers three different free things and the
wording only ever spoke for one: a search quoted *"Free — we already know this"*,
which is the opposite of true — the app is about to go and look. It was loose
for `fetch` too. `quoteFor` now takes the reason from the caller, who knows
which of the three it is.

Verified live: *"search for typescript 6 release notes"* quotes **"Free — just
looking for pages"**, runs at `tier: routed, costUsd: 0, turns: 0`, and writes
real results. The same sentence with *"and summarise what changed"* quotes 33c
and a session; *"how many goals has Messi scored?"* still quotes $1.58 and a
session. 727 server and 66 web tests green.

**What this does not do is make research free.** The Messi run cost 39.5c and
what it bought was the judgement — cross-checking sources, spotting that three
circulating figures were stale snapshots rather than rival counts. This tier
only removes the session from requests that never wanted judgement in the first
place. D-021's line holds: pay for judgement that has not been compiled yet, and
nothing else.

## D-056 — 2026-08-03 — The ledger gains an author, and the panels that needed one

The crew rail gained a productivity block under the roll call and the terminal
an inbox of finished work under the feed. Both read the ledger, and building
them turned up the reason nothing had read it that way before: **a row records
the role that ran a job, never the agentling.** Two hires holding the same role
are one entry in that file, so "who is spending" had no answer in the only
complete account of what has been paid out.

**The alternative source is worse in a way that hides itself.** Per-member spend
can be summed from `jobs.json` instead — the backoffice already does something
like it — but the queue keeps only jobs still in it. Measured on `hq`: the
ledger holds 95 runs at $22.47, the queue 83 of them at $20.87. A panel built on
the queue would have been $1.59 light and said nothing about it.

So `LedgerEntry` gained `agentlingId`, and `scripts/backfill-ledger-author.mjs`
filled the history **by identification**: each row matched to its job by id, the
author copied from that job's own `assignedTo`. 87 of 104 rows resolved. The
other 17 have lost their job record — their sandbox holds a `.session.json` that
names the *role* and nothing else — so they were left blank rather than
attributed to whoever held that role, which would have built a spending record
for work that agentling may never have touched. What they cost is reported as
`unattributed`, and the panel says so in words: without that line the crew's
figures simply add up to less than the level's, which reads as arithmetic gone
wrong rather than as a known hole. (The rule is D-030's and D-036's: backfill by
identification, never by guess.)

**The street lights are spend over quote** — green under half, amber to 85%, red
above — and the count of runs stopped at their ceiling sits beside the ratio in
words rather than in a second colour. The two genuinely disagree and the choice
was made on the real numbers: by ratio Pip is 28% and Sol 22%, both green; by
how often the budget binds, Sol is capped on 4 of 11 priced runs against Pip's 1
of 15. A member can be cheap in dollars and capped a third of the time, and that
says **the quote is too tight for their work**, not that they overspend. One
light for one meaning; the other fact is still on the row, in a sentence.

**Two figures that only sound alike were kept apart, and two that were the same
were joined.** `delivered` cannot come from the ledger: a run that exhausts its
turns holding a finished diff files as a ledger failure and as a `partial` job —
14 of them here — so reading delivery off the ledger undercounts by exactly the
runs most worth reviewing. It is taken from the queue and documented as a floor.
Meanwhile `Outcome`/`outcomeOf` moved into the shared model and the backoffice
now takes its lifetime line from the same request the new block does. Two copies
of that map, and two totals for one level, is how one job comes to be "kept" in
one panel and "to review" in the other (D-030 again).

**Mutation-tested, and three of the tests were not doing their job.** Seventeen
mutants; fourteen were caught first time. The three survivors each marked a test
that asserted something true of both the right rule and the wrong one: a
"compares halves not endpoints" case whose data made both rules agree, a journal
matcher probed only on `failed` and not on `delivered`, and an ordering test that
never checked the date it displayed. Fixing the third also tightened `isJournal`
from opening words to whole shapes, since "merged with care: read both files
before rewriting either" is a real lesson that starts exactly like the
bookkeeping. Re-run against all 119 real memory lines, strict and loose agree
on every one — the hole was real and unhit, which is the only kind a passing
suite ever shows you.

**Layout was measured, not eyeballed.** A fixed 240px inbox came out *taller*
than the live feed it sits under (134px against 106px on a short panel), and a
flat floor under the roll call pushed the record 31px through the panel's own
border at the 240px minimum the app's grid allows. Both are now shares rather
than pixels, swept from 240 to 860px of panel with no spill and the live half
larger at every step.

## D-057 — 2026-08-03 — Two ways to count one thing, and why the slower one stays

`SourceStatus.count` was recorded inside `syncSource`, before `syncSources` ran
`dedupe` across every source. Dedupe drops any `kind:name` a source listed
earlier already claimed, so the count described what a source **read**, never
what it contributed: measured on the real index, `wshobson-agents` reported 204
against the 180 that reached `entries`, and the four sources summed to 556
against 532. `truncated` never covered it — that reports the `MAX_PER_SOURCE`
cap, which no source currently hits. `syncSources` now recomputes each count
from the deduped entries, and the on-disk index was re-synced: 180 == 180,
532 == 532, 0 entries added or removed.

**The decision is not the fix, it is what was left duplicated.** `browse.ts`
still counts the index itself in `indexedBySource` rather than reading the
number now sitting in `count`, and that reads as a straight violation of D-030 —
one notion, two derivations, the shape that let "it delivered" drift. Two
reasons it stays. The weaker one is temporary: an index synced before this
carries the old figure, and a fix that ships inert against data written before
it is this project's most repeated bug (D-026, D-030, D-033, D-036). The
durable one is that `indexedBySource` counts *the same list the filter is about
to show*, so the number and the rows come from one pass and cannot disagree,
whereas `count` is a cache written at sync time and only ever as fresh as the
last sync.

**The clean resolution was available and not taken.** Deleting `count` from
`SourceStatus` altogether and letting every caller ask `indexedBySource` gives
one number instead of two that agree — D-030 satisfied rather than argued
around. It costs a field in a persisted JSON shape plus the truncation warning
in `RolesModal` that reads it. It was not done because the task was to make
`count` mean one thing, not to remove it, and widening that unasked is the kind
of call the brief did not hand over. **If a third consumer of `count` appears,
take the collapse rather than writing a fourth argument for keeping the cache.**

**What dedupe discards is still discarded.** It reports nothing about what it
dropped or to whom, so "24 of these are also published by `wshobson-agents`" is
not merely unshown — it is uncomputable without changing `dedupe` to return its
losses per source. Worth knowing before anyone promises that line in the UI.

Proved by a test that syncs two sources both publishing `skill:pdf` and asserts
the later one's count is what survived rather than what it read, plus the
property that was false: source counts sum to `entries.length`. Mutation-tested
after committing — reverting the one line in `syncSources` fails it with
`expected 2 to be 1` while the file's other 28 tests stay green.

## D-058 — 2026-08-04 — A document is shown where it lands, and two listings become one

The gap was not production. Measured before designing anything, from a real
sandbox-depth path rather than from D-031's account of itself: `.docx` 8,487
bytes, `.xlsx` 6,386, `.pptx` 44,730, `.pdf` 837, with `pdf-parse` and
`mammoth` reading their own siblings' output back. The mechanism holds — a
sandbox sits inside the project, so Node walks up to the root `node_modules`
and no job installs anything.

The gap was that **nothing had ever produced one, and nothing could show one
if it had.** Every file on disk across both levels: 167 `.md`, 37 `.patch`, 23
`.mjs`, one `.csv`. Zero documents. The PDF runs of D-030 lost their
sandboxes, so the capability is proven in the library and still unproven in
the crew's hands — the split the first hard-won rule is about, sitting in the
log unnoticed for four days because "we installed the libraries" reads like
"the crew produces documents".

**Converting happens on the server.** Not a preference: the libraries are
already there for the sandboxes, and the web workspace is pixi, react and a
font. `previewFile` answers with a kind — `grid` from exceljs, `html` from
mammoth, `slides` from the pptx's own XML through jszip, and for a PDF or an
image `native`, which is the honest answer that the browser draws it better
than any description of it. Zero new dependencies: jszip was already on disk
as a transitive dep of four of the six document libraries and is now declared
rather than relied on by hoisting.

**Sanitising by hand rather than adding a sanitizer.** Mammoth escapes the
document's own text, so the exposure is not what a document says but what it
links to: a hyperlink target is author-controlled and travels into an `href`
intact. So the tag list is fixed, every attribute is dropped, and an `href`
survives only if it is plainly `http(s)`. Proved through the real converter,
not against a hand-written fixture — a `.docx` built with `docx`'s own
`ExternalHyperlink` pointing at `javascript:alert(1)`, asserted to come back
with its words and without its scheme.

**Every conversion says what it lost, and every cut says what it cut.** The
panel carries `exact` or `converted · values, not formatting` beside the file
name, and `100 of 214 rows` under the grid. This is not decoration. D-030
records an answer banked as "hello-world.pdf (1,380 bytes) is a valid one-page
PDF" over a sandbox that held that sentence and no PDF; a preview that reads
as the document is the same error with better typography.

**Two listings became one, and so did two orderings.** `listOutputs` read
every byte of every file so the panel could print the text ones — megabytes
fetched to draw a row of labels, and an answer to "what is in this file" in a
place that had not asked. The route now returns `describeOutputs`, the listing
the inbox already used, and contents come one file at a time from the preview.
Separately, the inbox ranked paperwork last while the review panel ranked
`RESULT.md` first, so a job that wrote a spreadsheet led with the spreadsheet
in one panel and with the write-up in the other. One `orderFiles` now, in a
plain module beside the JSX like `activity.ts` and `ledger.ts` — deliverables,
then `RESULT.md`, then the rest of the paperwork.

The inbox chip changed what it does: it opens the file, and a separate arrow
saves it. Saving a `.xlsx` to find out whether it was the right `.xlsx` was
the whole complaint.

**Evidence.** 803 server tests and 74 web, plus a live run against the running
server on a real finished job — the `.xlsx` came back as two named sheets with
their totals, the `.docx` as its headings, the `.pptx` as two slides in order,
the `.pdf` as `native`, and a `.md` as text. Mutation-tested after committing,
four at once: allowing every `href`, disabling the tag list, cutting
`GRID_ROWS` to 5, and restoring the inbox's old ordering each failed the test
written for it — 4 of 14 server tests and 2 of 8 web, with the rest green.

**Not solved, and named rather than left to be discovered.** A `.pptx` preview
is text and no visuals, because nothing installed renders a slide. A `.docx`
keeps its words and not its layout, which is D-031's accepted cost showing up
one layer higher. And the panel still cannot show a document the crew never
wrote: the tier matters — only a session tier can write one, since a compiled
tool's contract is plain node with no dependencies — and so does the turn
budget, D-030's run 5 having produced a working generator and no file.

## D-059 — 2026-08-04 — The store reads documents, and the splitter that made it real

Opening the knowledge store to `.docx` and `.pdf` is one line in `INDEXABLE`,
and on its own it would have been inert.

**What `passages` actually did.** It split at markdown headings and `trim`med
each section to 600 characters, throwing the rest away. Invisible on the short
notes it was built for and ruinous on anything else — measured before changing
anything, a 2,974-character `.txt` indexed as **one** passage holding 633
characters, so 79% of a plain text file was already unsearchable, and a
markdown file with long sections lost every tail past 600. Nothing said so; the
`skipped` counter reports files left out, not content left behind, so the panel
showed a clean sync over a partial index.

A `.docx` or a `.pdf` has no `#` headings anywhere, so adding the extensions on
top of that would have indexed the first paragraph of each document and looked
exactly like it worked. That is D-026's shape once more: complete in the type,
the route, the setting and the panel copy, and reaching nothing. So the change
that matters is that an over-long block is now **cut** into passages at a
sentence end rather than truncated, which fixes `.txt` and long markdown in the
same motion — they were broken before documents were ever mentioned.

**The rest is small on purpose.** `extract` reads a file by extension, lazily
importing `mammoth` or `pdf-parse` so a folder of markdown loads neither; the
libraries are already at the project root for the sandboxes (D-031), so
nothing was installed. `sync` becomes async and one unreadable file — an
encrypted PDF, a `.docx` that is a renamed something-else — costs its own
passages and no more, the same rule a missing source folder already had.

**A second cap, because documents are not notes.** `MAX_PER_SOURCE` bounds a
folder at 250 files; nothing bounded a file. One 500-page PDF is more passages
than 250 markdown files put together, and the whole index is parsed on every
job and every quote. So 200 passages a file — about 60 pages — with the count
of files that hit it shown in the panel, on the same rule the source cap
follows: a store that quietly indexed the first third of a contract would
answer confidently from that third.

**Caught by running it, not by the test.** `pdf-parse` writes `-- 1 of 1 --`
between pages, and it rode into the indexed passage, where it would be shown
in a recall answer and pasted into an agentling's briefing as though the
document had said it. The unit test asserted with `toContain` and passed with
the marker sitting in the entry; it was visible the moment a real PDF was
indexed and the entry read back. The test now asserts its absence, over a
two-page PDF, which is also what proves the pages are both read.

**Evidence.** Verified live on the `home-chores` level and then removed again:
a folder holding a `.docx`, a `.pdf` and an `.md` indexed as 3 passages from 3
files, and asked through the real router, "what do we know about the
dishwasher warranty" returned the `answer` tier — free, no session, no turns —
quoting the PDF with `[warranty.pdf, synced 2026-08-04]` on the line, and "what
do we know about the boiler service" returned the `.docx` the same way.
810 server tests and 74 web. Mutation-tested after committing, one at a time so
the signals do not mask each other: replacing the chunker with the old truncate
failed 4, dropping the two extensions failed 2, removing the page-marker strip
failed 1, and removing the truncation counter failed 1.

**Still not read.** Anything that is not text under the hood: a scanned PDF is
pictures of words and yields nothing, which the panel now says rather than
leaving it to look like a file that was skipped. `.xlsx` and `.pptx` are not
indexed either — the crew can write both and `previewFile` can read both
(D-058), so this is a decision not to flatten a spreadsheet into prose, not a
missing capability.

## D-060 — 2026-08-04 — A grid is not prose, and the readers stop being written twice

D-059 closed by naming `.xlsx` and `.pptx` as a decision not to flatten a
spreadsheet into prose rather than a missing capability. Reopened on request,
and the decision was the right thing to have deferred: the extensions are two
lines and the shaping is the whole problem.

**Why a spreadsheet is the hard one.** `AX-114 | Meridian | 12.40` shares no
words with "what do we know about supplier pricing". Everything that would
match — the column names, the sheet tab — sits somewhere else in the file, and
`relevantLines` scores one passage at a time against the question. Worse, a
long sheet is cut into passages wherever the length runs out (D-059), so a
header two hundred rows above is not in the passage that would have matched.
So every row is rendered as a sentence about itself: `Q3 prices — sku=AX-114,
supplier=Meridian, unit=12.4`. Redundant by design — the sheet name and the
column names repeat on every line, because a passage that cannot be cut
anywhere is not a passage, and a term that is not in the passage cannot be
scored. Blank cells are dropped rather than written as `unit=`, which would
spend the budget saying nothing.

**A header row is only a header row when it looks like one.** Text in every
filled cell. One number in the top row and it is data, and labelling the rest
under it would attach `12.40=13.05` to every line of the sheet — a confident
falsehood repeated in every passage, which is worse than no labels at all. A
sheet that fails the test keeps its bare values.

**A deck was easy, and that is the point of the split.** A slide is already a
unit of thought, so it becomes one passage under its own title, which is the
heading rule markdown gets for free. Nothing new was needed.

**The readers moved to `documents.ts`.** The review panel (D-058) and the
store (D-059) want the same four formats for different reasons, and the second
copy of "how do you read a .pptx" was about to be written. That module returns
rows and lines and knows nothing about previews or passages; `preview.ts`
shapes them into a `FilePreview` and `store.ts` into text. This is D-030's
lesson used in advance for once, rather than recorded after the drift.

**Caught by reading a live index, again.** The slide passages came out as
`# Slide 1 Kitchen refit plan` — a label of ours sitting in the recall answer
where the document's words belong, and `slide` would then have scored against
every deck in a folder. That is precisely pdf-parse's page marker from D-059
one entry later, except this time we wrote it. The heading is now the slide's
own first line. Twice in two changes the fault was invisible to a passing test
and obvious in the first real index: the tests said `toContain`, and the thing
wrong was what else was in there.

**Evidence.** 817 server tests and 74 web. Verified live on `home-chores` and
then removed: five files — `.md`, `.docx`, `.pdf`, `.xlsx`, `.pptx` — indexed
as six passages, and through the real router "what do we know about the
washing machine brand" was answered free from the spreadsheet while "what do we
know about the kitchen refit order" came back from the deck, each with its
filename and sync date on the line. Mutation-tested after committing, one at a
time: dropping the two extensions failed 2 tests, dropping the sheet-name
prefix failed 3, weakening the header test failed 1, restoring the `# Slide N`
label failed 1, and removing the blank-cell filter failed 2.

**Bounds unchanged and now load-bearing.** A spreadsheet is verbose by design,
so `MAX_PASSAGES_PER_FILE` (200) is what keeps a large workbook from being most
of an index that is parsed on every job and every quote. exceljs reads the whole
file whatever we ask of it, so the cap bounds the index and not the read.

## D-061 — 2026-08-04 — Reading paper: the engine Windows already has

D-059 and D-060 both ended by naming the same hole — a scan holds pictures of
words and none this app could read — and the panel said so in as many words.
Closing it turned out to cost nothing to install, which was not the expected
answer and is the whole reason this entry is short on options and long on
measurements.

**Both halves were already on disk.** `pdf-parse` carries `pdfjs-dist` and
`@napi-rs/canvas` as its own dependencies, both prebuilt — no native build,
which is what ruled a Python stack out in D-031 — and exposes `getScreenshot()`
at about 130ms a page. And Windows ships an OCR engine, with `en-US` and
`es-MX` installed on this machine. So the rasteriser and the reader were both
there, and the work was joining them and being honest about the result.

**Chosen over tesseract.js on measurement.** That would have been portable and
cost ~32MB of `node_modules` (1.4MB package, 30.6MB WASM core), a postinstall
script, and a ~15MB language download to vendor for offline use. Against a
built-in engine that reads a rough page in well under a second, the portability
was the only thing it bought. The accepted cost is that `ocr.ts` is now the one
Windows-only file in the project, against PROJECT.md's "prefer cross-platform"
— which is exactly why it is a file and not a few lines in `documents.ts`.
Everything above it asks `ocrAvailable()`, gets `false` elsewhere, and syncs at
ordinary speed with the scans reported unread. A portable engine later goes
behind the same seam with no caller changing. Claude vision was the third
option and is the better reader by far; it was turned down for bulk indexing
because a 250-file folder becomes a real bill, and it remains the obvious
answer for a single document inside a job.

**Three constants, each measured rather than assumed, and two of them
surprising.**

*Render scale 2.* On a realistic page — 10pt body copy, skewed 1.2°, speckled,
JPEG quality 50 — scale 1 recovered 5 of 22 expected tokens, 2 recovered 18, 3
recovered 18, and 4 fell back to 15. Upscaling a lossy scan magnifies its
artefacts and softens the strokes, so more resolution is worse past a point.
An earlier probe had suggested scale 1 was fine, and it was wrong for a reason
worth naming: its text was poster-sized. A fixture that is easier than the real
thing measures the fixture.

*One shell per document, never per page.* One page costs 1,567ms and four cost
1,497ms — essentially all of it is PowerShell starting. Per-page spawning would
have made a ten-page document ten times slower for nothing.

*A budget of 200 pages a sync, 20 a file.* Reading a text layer
is free and reading pixels is not, and the sources route blocks until the sync
finishes. Every other cap here is reported; these are too.

**"Is there a text layer" is not "is it non-empty".** A scan often carries a
stamp added digitally, so `getText` returns *something* — and treating that as
a text layer indexes a 40-page contract as the word "Confidential". The test is
40 non-space characters.

**The marker is the point, not the polish.** Every OCR'd passage says so where
it is quoted: `[invoice-scan.pdf, read from a scan, synced 2026-08-04]`. The
live run returned `engiñééÊR]` for `engineer R.` and `Appliance:worcester` for
`Appliance: Worcester`, and the recall tier puts that line into a free answer
and into an agentling's briefing word for word. Good enough to find a document,
not good enough to quote one — and the reader has to be told which they are
holding. This is D-058's `converted` badge one layer down, and the third time
in three entries that the fault worth catching was scaffolding or noise passing
itself off as the document's own words.

**Evidence.** 822 server tests and 74 web. Verified live on `home-chores` and
then removed: a photocopied invoice and a phone photo of a gas meter indexed in
4.8s, and through the real router "what do we know about the expansion vessel
part number" came back free, quoting `EV-4471` off the scan with the marker on
the line. Mutation-tested after committing, one at a time: forcing the text
layer to always win failed 2 tests, dropping the `scanned` flag from the entry
failed 2, and setting `OCR_SCALE` to 1 failed 1.

**One mutation escaped, and that is the useful part.** Relaxing the text-layer
threshold to `length > 0` broke nothing, because every scan fixture had a text
layer of exactly nothing — so the threshold the code deliberately sets at 40
was untested. The stamped-scan case above was written for it, and the same
mutation now fails 3 tests. A passing suite said the constant was covered; it
was not, and only mutating it said so.

## D-062 — 2026-08-04 — Two faults found by reading the panel copy back against the code

An errand — update the reading panel for OCR — that turned into two real
defects, neither of which any test was going to find, because both were
behaviours nobody had asked the code about.

**A correction to D-061 first.** That entry says of the OCR budgets "200 pages
a sync, 20 a file, both reported". The second half was untrue when it was
written. A file that got no OCR at all was counted as `unscanned`; a file read
as far as page 20 of 50 was counted as nothing, and the panel said nothing.
The one cap in this store that reported nothing was the one whose entry
claimed it did. The sentence is narrowed above and the counter now exists.

**And the budget was being charged the wrong number.** `budget -= allowance`,
not the pages actually read — so a one-page receipt cost the same twenty pages
as a twenty-page report. A folder of thirty short scans read the first ten and
reported the other twenty as holding no text, which is a wrong answer rather
than a slow one. `ScreenshotResult.total` had been sitting in the type the
whole time; `ocrPdf` returns it now, so the budget is charged what it spent
and "this document was longer than I could read" is a thing the panel can say.

**What actually found them.** Not a test, not the type checker, and not the
live run — all three were green. Reading the user-facing sentences one at a
time and asking of each "is this still true, and how would I know". The intro
still said "notes, documents, spreadsheets, decks" a commit after scans became
readable; the per-file warning gave page counts for writing, slides and rows
and not for a scan. Chasing the second one into the code is what surfaced the
counter that did not exist and the arithmetic that was wrong. Copy is a
description of behaviour, and description is a test that runs in your head.

**And a rule broken, worth recording because the log already warned about it.**
Mutation-testing these fixes, `git checkout -- server/src/store.ts` reverted
them: they were not committed yet. That is D-021's hard-won rule — mutation-test
*after* committing — hit exactly as written, in the file that records it. The
work was redone from the conversation rather than lost, and the order is the
point: commit, then mutate, then restore.

**Evidence.** 824 server tests and 74 web. Both fixes mutation-tested after
committing this time: charging the allowance again fails the budget test,
removing the counter fails the cut test.

## D-063 — 2026-08-04 — The run is told its budget, and delivers before it ends

The first real job queued into a real level failed with nothing to show for it.
`97b95f10` — "a summary table of this month's main economic indicators from
Chile and the US" — spent all ten of its turns gathering, made 28 tool calls,
was still calling `search_web` when the cap fired, and left an **empty
sandbox**. 65.8c, absorbed, and because the close-out pass only runs on a job
that left something behind, no lesson and no approach were banked either. The
level's whole memory of it was two generic log lines.

**The brief had never mentioned there was a budget.** Read back out of the
session record rather than inferred: it asked for `RESULT.md` "when finished"
and said nothing about turns. The run could not ration what it did not know it
had, and had no reason to checkpoint. It is also worth stating what the run was
*allowed*: quoted $1.58 and dead at 66c, because `maxTurns = min(role cap,
quote ÷ rate)` and `worker`'s cap of 10 bound long before the money did. The
tighten-only rule is D-018 working as designed, and the effect is that a
generic guess about a trade overrode a budget computed for this job.

So the brief now carries the same number the SDK is capped at — one variable,
so the two cannot disagree — and asks for the deliverable early and updated
rather than saved for the end, plus a line about saying what is missing if it
runs short.

**This is not D-020 coming back.** That moved `LESSON.md` and `APPROACH.md` out
of the session because meta-work competed with the work and was cut first.
`RESULT.md` is the deliverable and was already demanded; this changes when it
is written, not whether.

**Evidence — the same sentence, same level, same four connections, same quote.**

| | `97b95f10` | `306e415e` |
|---|---|---|
| status | `failed` | `partial` |
| left behind | nothing | `RESULT.md`, an `.xlsx`, the script that built it |
| close-out | never ran | ran, 2.3c |
| recipe | none | banked |
| cost | 65.8c | 93.3c |
| charged | $0 | $0 |
| turns | 10/10, max_turns | 10/10, max_turns |
| output tokens | 5,799 | 15,234 |

**It did not finish. It delivered anyway**, which is what the change was for.
Cost rose 42% and bought a spreadsheet, a sourced report, a lesson and a
method, against a baseline that bought two log lines. The report also caught
what the request itself got wrong — the month was four days old, so only one
indicator had published — and said so with a release date on every row.

Two things learned in passing. A `partial` from a cut-off run is **not**
charged: `sim.ts` files the ledger outcome as `failed` on the throwing path
whatever the queue's status says, so the billing consequence feared before the
change does not exist. And the panel and the level's own `KNOWLEDGE.md`
therefore disagree about what happened — "to review" against "failed".

## D-064 — 2026-08-04 — A method earns the leash by having worked, not by existing

D-063's success set up the next failure, and it was visible before it happened.
The recipe banked by `306e415e` is an exact key match under an unmoved
capability surface, so `findRecipe` called it **strong** — checked against the
stored file rather than reasoned about: `exact: true | strong: true`. The next
run of that sentence would have been given **five turns to do what the run that
wrote the method had just failed to do in ten.**

Nothing asked whether the authoring run had got anywhere. `Recipe.successes`
existed and was read only by tool promotion.

**The two-bar logic is right and its premise did not hold here.** D-019 and
D-023 price the two mistakes correctly — a wrong method on a full run wastes a
turn it can ignore; the same method with the leash cut wastes the run — but
both assume a recipe saves *exploring*. This job is gathering-bound: ten
agencies' figures take the turns they take, and knowing the method gathers
nothing. So `canShortenLeash` now wants a landing as well as an unmoved
surface.

**`successes`, deliberately, and not whether the authoring run finished.** Two
questions that sound alike, and this file has been wrong before by collapsing a
pair of those (D-030, and the three runs it took to get `partial` apart from
delivery). `successes` counts runs that used the method and delivered — evidence
about the *method*. The authoring run's own ending is evidence about one run.

It costs the leash exactly one outing, because a hint-only match still credits
the recipe when it lands. Proved end to end rather than argued: run 1 writes
the method, run 2 gets it as a hint on the full cap and delivers, run 3 is
leashed. The free `answer` tier is untouched — it keys off `exact`, not
`strong`.

**Amended the same day: "exactly one outing" is true going forward and was not
true of what was already on disk.** Every recipe written before this gate has
`completions` absent, which reads as zero, so all of them were demoted at once.
Counted rather than estimated: **31 recipes on this machine, 1 leash-eligible,
30 hint-only until each earns a completion of its own.** The one-shot tier is
therefore dormant across the board rather than delayed by a run — its measured
55% step-down does not apply to anything until recipes re-earn it one at a time.

That is the conservative reading and it stands: there is no evidence any of
those 30 methods ever completed, and the tier's own record is 21 leashed
failures against 8 deliveries. But the sentence above understated the cost by a
factor of thirty and the count belongs next to it. Note also that the leniency
D-068 added for an absent `completedInTurns` cannot be reached by any of them —
it only applies once `completions` is at least 1, which is exactly what they
lack.

The tier's own history is the argument for buying that evidence before spending
the leash on it: **21 leashed runs failed against 8 delivered**, and most of the
62% of all spend that is absorbed is that.

That figure was wrong when this entry was first written — 5, copied out of
`AGENTLING.md`'s prose rather than recomputed, which is the one thing the
hard-won rules say not to do with a number. Recounted off the ledger the same
day. The ratio still carries the argument; the count was simply stale, which is
how a figure in a note goes wrong without anyone touching it.

**Evidence.** 833 server tests and 74 web, typecheck clean. Committed first,
then mutation-tested: dropping the `successes` clause fails three tests.
Against the live recipe, `strong` flips true → false, so the next run of that
sentence gets the role's full cap with the method as a hint.

## D-065 — 2026-08-04 — The leash gets its own counter, because it was asking a different question

D-064 gated the one-shot leash on `successes`. That was the wrong counter, and
it was wrong for a day.

`successes` decides whether a method is ever compiled into a script, and it is
deliberately generous about *how* a run ended: it credits a dying run that left
a correct patch, because the work was done and only the write-up was cut. That
generosity was itself hard-won — counting clean exits scored two correct
129-line files as zero and did so in the worst direction, promoting the small
jobs a script cannot do while excluding the big mechanical ones it is for
(D-021).

The leash is asking something else entirely: **does this job fit its budget.**
A run that had to be killed has answered no, however good its output was.

**Measured, and the failure was total rather than partial.** Job `3c031419` was
the third run of the same sentence: it delivered a real spreadsheet and a
sourced report, and was killed on its last turn. It credited no success —
because a no-repo run that dies never can, the clause requiring a clean return
being the only route to one without a patch. So that job could never earn the
leash at all, while **identical work with a repository would have earned it
without ever finishing**. Two shapes, two bars, inherited from a decision taken
about a different question rather than chosen for this one.

`completions` counts runs that finished inside their turns *and* left something,
requiring the clean return in both shapes — which is also what removes the
asymmetry. `canShortenLeash` reads it; `successes` goes back to answering only
the compile question.

**The lesson is the one this log keeps recording, and this time it caught the
log itself.** D-064's own text says the file "has been wrong before by
collapsing two of those" and then collapses two of those, in the same commit,
while explaining why it was not doing so. Reusing an existing counter felt like
the opposite of duplication; what it actually was is D-030's second failure mode
— two notions that only sound alike, given one name. The tell was available and
unread: `successes` had a comment three paragraphs long explaining precisely
which question it answers.

**Evidence.** 840 server tests and 74 web, typecheck clean. A regression test
pins the pair apart — a recipe with three deliveries and no completions is
refused the leash — and two executor tests assert the divergence end to end on
one run. Committed, then mutation-tested: swapping the gate back to `successes`
fails the regression test.

## D-066 — 2026-08-04 — Carrying on, rather than asking for a smaller request

The three runs of D-063 and D-065 all ended the same way: the work essentially
done, the session killed at the wall. The obvious response — tell the user to
ask for less — was refused as the actual complaint about this app. A user
trimming their request to fit an engine is doing the engine's job, and it reads
as underperformance because it is.

What was missing is not instruction. It is that a job needing more turns than
one run is granted had nowhere to go.

Most of the machinery already existed: `continues:` carries a sandbox forward,
and `reply` quotes and bills the follow-up as the session it is (D-033). What
did not exist was the app **knowing a run had been cut off** and offering to
pick it up, rather than leaving the user to notice and phrase it.

**The signal is carried, not inferred.** The runner emits `outOfTurns` when the
SDK reports `error_max_turns`. Reading it back out of the error sentence would
be one side saying one word while the other watched for another — the check that
silently never fires, which is why `CANCELLED` is a shared constant. The
tempting alternative, `turns > turnsAllowed`, is *not* a cut-off marker: it
fires on 43 of 88 paid runs and seven of those finished (D-022, D-052).

**A request, never automatic.** Each continuation is a fresh session at a fresh
price, and a job that quietly spawned three would be three charges against one
quote — the thing a quote exists to prevent (D-012, D-025). The same reasoning
as promotion: a charge nobody asked for is a charge nobody quoted.

**The brief points at RESULT.md rather than repeating it**, which is D-063
paying off twice: a run is already asked to record what it established, what is
still missing and what it would do next, and that handover is on disk in the
sandbox the continuation inherits. Better than one composed in the route, and
free.

**A defect found by running it, not by testing it.** The first live continuation
of a `worker`'s job came back routed to `analyst`: the brief it carries has
"read RESULT.md" in it, which is enough to swing a match made on "summary
table". `preferredRole` could not stand in as the fallback, because the matcher
leaves that field empty whenever it is unsure — exactly the case that produced
this. A continuation is the *same job*, so re-matching it asks the wrong
question. It now resolves the role from `assignedTo`, which is the ledger's own
rule — the role that ran the work, not the one the matcher named (D-026, D-029)
— applied to what a run is rather than to what it cost.

**And the test cost something unmeasurable**, which is worth recording because
it will recur. Verifying a queue-backed route by queueing means the sim picks
the job up immediately; cancelling settled it `failed` at nothing charged, but
`costUnknown` — a killed session never reaches the message the SDK reports cost
on. It made 15 tool calls first.

**Existing partials had to be reached.** The field is new, so every run already
on disk lacked it and none could be continued — a change complete in the type,
the route and the UI that reaches no existing data (D-026, D-030, D-033, D-036).
Backfilled by identification on the runner's own `error_max_turns` record,
written at the time: **37 jobs set, 52 left alone** because they carry no such
record. Nothing was inferred from a status or a turn count.

**Measured, and the answer is half of one.** The continuation of `3c031419`
resumed rather than restarted: it opened the spreadsheet the previous run had
left, refined the script that builds it, and rewrote the report as a handover
instead of gathering anything again. Cheapest run of the four, and the whole
sequence on one sentence reads:

| | brief | method | continuation | cost | outcome |
|---|---|---|---|---|---|
| `97b95f10` | no budget | — | — | 65.8c | `failed`, empty sandbox |
| `306e415e` | budget | — | — | 93.3c | `partial`, report + `.xlsx` |
| `3c031419` | budget | approach | — | 78.0c | `partial` |
| `69960175` | budget | approach | carries the sandbox | **55.5c** | `partial` |

Nothing was charged for any of it. The deliverable has existed since the second
run and each run since has improved it for less.

**And all four were cut off at ten turns.** That is the finding. Continuation
makes the work compound across runs, which is what it was for, but it does not
make a run *finish* — so the job never files as done, the recipe never records a
completion, and by D-065's gate it will never earn the leash. Which is correct:
this job genuinely does not fit in ten turns, and the gate is refusing to
pretend otherwise.

So the remaining question is D-063's unresolved half, now with four runs behind
it rather than one: `worker`'s generic cap of 10 bound a job the quote had
funded to roughly 56 turns, four times, and `maxTurns = min(role cap, quote ÷
rate)` means the generic guess about a trade wins over the estimate computed for
this job every time. Whether a per-run turn cap is the right unit at all is the
next decision, and it is a decision rather than a task — D-015 and D-025 are on
record that "ran out of turns" does not mean "needed more turns", and four cut
runs that each delivered are the first real evidence pulling the other way.

## D-067 — 2026-08-04 — The quote wins against a role's standing guess

`maxTurns = min(role cap, quote ÷ rate)`, so a number written into a role's
frontmatter before anyone had seen the job outranked an estimate computed for
the work actually in front of it. Four runs of one sentence, each quoted $1.58,
each held to `worker`'s 10, each killed having delivered (D-063, D-066). The
quote was never allowed to mean anything.

**The rule was right when it was written and had outlived its reason.** D-018
introduced tighten-only because the per-turn rate was pooled across repo and
no-repo work and predicted neither: the budget came out at 17 turns against a
cap of 8, so the cap always won and the ceiling could never bind on anything.
The fix then was the cap; the fix since has been the rate, which is per-shape
and per-tier. What survived into today was the guard without the thing it was
guarding against — and this project has a name for that already: a method that
keeps being used after the ground moved (D-019, D-023, D-037).

**Not every cap is a guess, and the distinction is the change.** `turnCapFor`
returns three things and they are not alike:

| Cap | What it is | Binds |
|---|---|---|
| `RECIPE_TURNS` | The one-shot tier *is* its five turns | firm |
| A job's stated need | A compile's own budget, so no role has to raise its everyday one | firm |
| The role's `maxTurns` | A standing guess about a trade | soft — yields to the quote |

A quote that could stretch the leash would dissolve the one-shot tier rather
than fund it, so firm means firm in both directions. A soft cap yields in both
directions too: a job quoted at 5c still gets three turns and not the role's
ten, which is the money protection tighten-only was really providing.

Both hard clamps stand. `TURN_CEILING` (40) stops a cheap rate and a rich quote
uncapping the loop between them — 100 ÷ 0.001 is 100,000 turns — and
`MAX_CEILING_USD` upstream still stops one freak run funding the next.

**Measured against the real ledger rather than reasoned about.** For
`worker · session · no repo` the rate is **4.69c a turn over 10 samples**, so
the job that paid for this moves from 10 turns to **33** — which is $1.55 at
that rate, against a $1.58 quote. The conversion is sound on average, which is
the claim being made.

**And the honest residual, which the same measurement exposes.** The rate is a
class average, and this job is dearer than its class: it really costs 6.6c a
turn because search puts fetched pages in front of every subsequent turn. 33
turns at 6.6c is **$2.18, about 38% over its own quote.** Nobody is billed for
that — `priceFor` caps the charge at the quote and the app absorbs the rest —
but it is spend, and the exposure is larger than it was, because 10 turns could
not overspend by much and 33 can.

That is the same shape as D-018's finding, one level finer: a rate pooled across
*jobs within a shape* predicts the average and not the member. It was tolerable
while the role cap masked it. Two things follow, and neither is done here: the
drift is visible in the ledger and should be read there rather than argued, and
if it is real the answer is a finer rate — per recipe, or per job history —
rather than putting the cruder guard back.

**Evidence.** 841 server tests and 74 web, typecheck clean. Committed, then
mutation-tested: restoring `min(cap.turns, funded)` fails three tests, one of
them the pair that checks a firm cap and a soft cap of the same size now behave
differently.

## D-068 — 2026-08-04 — A leash has to be a shortening, not a different job

D-067 gave the economic-indicators job the turns its own quote had funded, and
it **finished** — `done`, 33 turns, $1.96 spent against a $1.58 quote, the first
completion in five runs of that sentence. The question it was run to answer got
a clear answer: the job was never too big, it was too tightly capped. Four runs
had been killed by a number in a role's frontmatter while the app's own estimate
said the work was funded.

**And the completion immediately armed the next failure.** It credited
`completions: 1`, which opened D-065's gate, which meant the next run of the
same sentence would be handed **five** turns to do what had just taken 33 —
`firm`, so D-067's own change meant the quote could not rescue it, and
permanently, because a run cut off at five would never complete and so never
revise the record.

**Third time in one day, and the same shape each time.** A gate that verifies
one thing gets read as licensing another:

| Counter | What it actually verifies | What it was read as licensing | Corrected by |
|---|---|---|---|
| `successes` | the method gets the job done | the job fits its budget | D-065 |
| `completions` | a run fitted the budget it had | the job fits *five* turns | this entry |

Fitting *some* budget is not evidence of fitting this one. `completedInTurns`
records what the completing run was **granted** — never the SDK's count, which
said 40 against a cap of 33 (D-022) — and keeps the **shortest** completion,
since a job proved achievable in 33 turns and again in 12 needs 12, and taking
the latest would let one generously-budgeted run undo what a tighter one
established.

The leash is refused when that number is above twice its own length.
**`LEASH_CREDIBLE_UP_TO` is chosen without data and says so in the code.** A run
that finished in 8 turns may well do it in 5 once the exploring is handed over;
one that needed 33 will not, and that gap is not a matter of degree. Refining it
needs leashed outcomes paired against this field — which is the argument for
recording the field now, since it cannot be added backwards (D-050's lesson,
and D-039's).

An absent value keeps the old behaviour rather than being demoted. Refusing
every recipe written before today would have quietly retired the one-shot tier,
which is a 55% step-down on the work it does suit.

**A cycle found by the suite rather than by inspection.** `LEASH_CREDIBLE_UP_TO`
cannot import `RECIPE_TURNS`: `recipes.ts` ← `router.ts` ← `claude.ts`, so the
module initialises half-built and four test files fail to load with
`Cannot access 'STOPWORDS' before initialization`. The direct-import check said
there was no cycle and was looking one hop deep. The constant is written out,
and a test holds the two in step — a test file is a leaf and may import both.

**Backfilled by identification, one recipe.** The live recipe stored its
completion before the field existed, so it was still leashing. `653f8c2e`'s
ledger row records `turnsAllowed: 33` and `outcome: done`, which is the
completing run's own account rather than an inference, and that is the value
written. It is the only recipe on this machine with a completion at all.

**What the run also cost, which is D-067's residual measured rather than
projected.** $1.96 spent against a $1.58 quote — 24% over, where the projection
was 38%. The chargeable figure is $1.58, `priceFor` capping it, so the 38c is
absorbed exactly as designed. It is the first job in this sequence to record any
chargeable amount, and the whole sequence spent $4.89 to produce one delivery.

## D-069 — 2026-08-04 — A method halved a real job, with no leash and no tier change

Everything §8 of `AGENTLING.md` says about repeat work is measured on synthetic
repeats — jobs queued to exercise a mechanism, with about one genuine repeat in
86. This is the first measurement of a banked method against a job somebody
actually wanted done.

| Run | Turns | Method from | Cost | Outcome |
|---|---|---|---|---|
| `653f8c2e` | 33 | a cut-off run | $1.96 | done |
| `8ab9b070` | 40 | **a run that completed** | **97c** | done, **25 turns used** |

**51% off, and the run finished fifteen turns under its cap** — the first of six
on this sentence not to exhaust its budget.

**The part worth reading twice: this was not the one-shot tier.** The leash was
refused (D-068), so `8ab9b070` ran as an ordinary `session` with the approach
handed over as a hint. §8's headline step-down — 55%, session to one-shot — is
attributed to *moving down a tier*, and D-019/D-023 price the weak match as
nearly free but not as valuable: "a wrong method given to a full-length session
wastes a turn it can ignore". The implication nobody had tested is that a right
one is worth about a turn.

It was worth half the job. The method carries value **independent of the leash**,
which is not what the two-bar framing assumes, and it means the tier averages in
§8 have been crediting the leash with savings the approach was producing.

**What changed was the method's provenance, not its existence.** Runs 2–4 banked
approaches written by close-outs of runs that died; run 5 was the first written
by a session that finished. The concrete lever is legible in it — step 4 reads
"build the final output with a script, not manual entry" — and run 6 had a
generator producing the workbook early instead of assembling rows by hand. 24
tool calls against 39.

**Confounds, stated rather than buried.** The budget also rose 33 → 40 and the
level's `recallable` notes reached 6, so the 51% is not the method alone. What
more budget does *not* explain is finishing under the cap: the previous five runs
all spent everything they had.

**n = 1.** Six runs of one sentence in one level. The claim is that a method
written by a completing run halved this job; it is not a rate.

**Amended the same hour, by the seventh run: it was not a rate, and the caveat
above earned its keep.** `765c7dcc` carried a method written by the run that
produced the 97c — better than its predecessor, opening with the timing
clarification rather than reaching it at step 3 — and cost **$1.26**. Three
completions now read $1.96 → 97c → $1.26. What survives is the *step* from no
proven method to a proven one, mean $1.12 against $1.96, and with no tier
change, which is this entry's real contribution. What does not survive is any
suggestion that banking a better method compounds. See D-071.

### Two things the same run measured

**The quote for this class is now pinned rather than drifting.** D-067 warned
the ceiling could feed back on itself; it rose $1.58 → $2.00 after run 5 and
then stayed there, because the ceiling is `max(mean × 2, max × 1.2)` and the max
is still run 5's $1.96. `MAX_CEILING_USD` is doing precisely the job D-016 gave
it. The cost is that the quote has stopped being informative for this class —
permanently $2.00 until that max ages out, and nothing ages. Run 6 cost half its
quote and was charged its actual 97c, so the loop is bounded and not runaway.

**`completedInTurns` records the grant, not the need, and so will not tighten.**
The job completed in 25 turns and the field stayed at 33, because what is
recorded is turns *granted* — 40 here, so `min(33, 40)` holds. That is
deliberate: the SDK's reported count is in a different unit, run 5 having been
capped at 33 and reported 40, which cannot be a usage figure (D-022). The
consequence is that the bound ratchets down only on grants and over-refuses
leashes, which is the safe direction and is not the same as being right.
`toolCalls` — 39 against 24 — is the better signal if this is ever refined,
because it is counted in our units rather than the SDK's.

**Where the sequence ends.** Six runs, **$5.86 spent, $2.55 chargeable**, and a
reproducible method for a recurring job that now costs 97c — against a first
attempt that cost 66c and left an empty sandbox.

## D-070 — 2026-08-04 — A quote that could not find its history, and the copy that covered for it

The sixth run of the economic-indicators sentence was quoted "Up to $2.00 —
first time doing this". It had been quoted that way all six times.

**The lookup was the fault; the copy was accurate about it.** `runnerRole`
returned `null`, because the matcher scored the sentence at 0.24 against a
`MIN_CONFIDENCE` of 0.35 and declines rather than guesses — which is right, and
was then treated as though the job would therefore not be run. It was run six
times, by whoever picked it up, and every row was filed under `worker`. So
`history()` looked up a class no ledger row carries, found nothing, and fell
through to the tier average, where "first time doing this" is the literal truth
about a lookup that never happened.

**Third form of one fault.** D-026 and D-029 fixed the class being *wrong* — a
job priced as the absent specialist rather than whoever ran it. `quoteClass`
fixed it being the wrong *field* — a one-shot quote looking up a recipe key in
a column that only ever held roles, so 20 of 20 one-shot rows missed and every
one of them said "first time doing this" for ever. This is the class being
*absent*, and it produces the identical symptom for the identical reason: **a
quote that cannot find its history cannot tighten, which was the whole promise
of pricing from a ledger.**

With no crew at all it still returns null. There is genuinely nothing to price
under then, and a guess there would be an invented class rather than an observed
one — which is what the test this replaced was protecting, correctly, against
the wrong case.

**Fixing the lookup exposed the wording behind it.** The quote then read "About
44c — done this 35 times before", off 35 `worker` rows, about a job that had run
six. `quoteClass` reads a recipe key for a one-shot and a role for everything
else, and the copy spoke for the first as though it were always true. The count
was real; the claim about it was not. `sameJob` is now passed by the one caller
that knows which it is, and a class lookup reads "from 35 jobs like it".

`ledger.test.ts` had asserted `done this 3 times before` under a test named
"quotes from history once this **kind** of job has been done" — the same
confusion written down twice, green both times, and readable in the test's own
title. D-062's habit again: the copy is a description of behaviour, and reading
it back is a test that runs in your head.

### The other half: a bound that only ratcheted on grants

`completedInTurns` recorded the turns a completing run was *granted*. Job
`8ab9b070` was given 40, finished on 24 tool calls, and left the bound sitting
at 33 — which was merely the smaller of two allowances and says nothing about
what the job needs.

It now takes the tighter of the grant and `toolCalls + 1`. **The units were
checked before the swap rather than after**, which is the whole reason this
project keeps a log: `turns === toolCalls + 1` on **5 of 5** completing rows,
so the expression reproduces the SDK's own count exactly while being counted by
us — and therefore survives a run the SDK never reports on at all (D-052). Had
it not matched, tool calls and turns would have been two notions that only
sound alike, which is the mistake three of the last six entries record.

The bound is still an upper bound and still conservative: SDK turns run higher
than the `maxTurns` grant they came from — 21 against 12 on one row — so
comparing it to a five-turn leash refuses more readily than the truth requires.
That is the safe direction and is not the same as being right.

**Evidence.** 854 server tests and 74 web, typecheck clean. Both fixes committed
then mutation-tested: restoring either the old `runnerRole` or the grant-only
bound fails three tests between them. Verified live — the same sentence that
had said "first time doing this" six times now quotes "About 44c — from 35 jobs
like it", 35 samples, high certainty. The one-shot wording is unit-tested only:
no recipe on this machine currently qualifies for the leash (see D-065's
amendment), so there is nothing live to read it off.

## D-071 — 2026-08-04 — The third run says the halving was a step, not a trend

D-069 measured a banked method against real work for the first time and reported
51% off — $1.96 to 97c between two completing runs of the same sentence. It read
like the start of a curve. The seventh run of that sentence, carrying a method
written by the run that produced the 97c and visibly better than its
predecessor, cost **$1.26**.

| Completing run | Method it carried | Tool calls | Cost |
|---|---|---|---|
| `653f8c2e` | written by runs that died | 39 | $1.96 |
| `8ab9b070` | written by a completing run | 24 | 97c |
| `765c7dcc` | written by a *better* completing run | 26 | **$1.26** |

**So D-069's headline was two points, and the third lands between them.** The
honest reading is one step and then noise: from no proven method ($1.96) to a
proven one (97c and $1.26, mean $1.12) — about 43% — after which the method
getting *better* bought nothing measurable. That is not a new finding so much as
this project's own doctrine arriving on real work: §8 already says a recipe
"cuts the price once, by moving the job down a tier, and then holds it there".
Here it cuts once without any tier change at all (D-069's point stands) and then
holds, at a level noisy enough that two draws differ by 30%.

**The correction matters more than the original claim.** D-069 was written the
same hour on n=2 and carried a caveat about sample size; this is what that
caveat was for. Read the two together, D-069's contribution is that a method is
worth something without the leash — which run 7 supports — and not that repeated
banking compounds, which run 7 refutes. n=3, one sentence, one level.

**And the run that most needed a bigger budget did not use one.** All three
completions were granted 40 turns and used 39, 24 and 26 calls. Nothing since
run 5 has come close to its cap, which retires the concern D-067 was built for
and leaves the opposite one: the quote has been pinned at the $2.00 clamp since
run 5, so every run since has been granted turns it does not want.

### The bound moved toward the truth for the first time

`completedInTurns` was 33, a value that arrived by backfill from run 5's *grant*
and had never once been derived from what a run actually did. Run 7 finished on
26 tool calls and it is now **27** — `min(33, 40, 26 + 1)`.

That is D-070's half of the fix working live, and it also re-confirms the
relationship it rests on: `turns === toolCalls + 1` now holds on **6 of 6**
completing rows. The leash stays refused, correctly — 27 is still far above the
credible bound of 10, and this job has never been done in fewer than 24 calls.

**Where the level stands.** Seven paid runs on one sentence: **$7.12 spent,
$3.81 chargeable**, three deliveries, and a method that reliably produces a
4-sheet workbook for somewhere between 97c and $1.26.

## D-072 — 2026-08-04 — Seven runs of one sentence, none of them recording it was the same job

The quote for the economic-indicators job said "About 44c" for work whose three
completions had averaged $1.40. Not a rounding problem: it was pricing off 35
unrelated `worker` rows, because none of that job's own rows said which job they
were.

```
97b95f10 … 765c7dcc   all session   recipeKey: (none)
```

`hint` carried `recipeKey` only on the leashed branch, and the meter recorded it
only when `oneShot`. So a session *handed a method* — the weak-match path, which
D-069 showed is where most of the saving actually comes from — recorded nothing
identifying the job at all. Only a leashed run was ever a run of something.

**Fourth form of the fault D-070 names**, and by now the pattern is the entry:
a quote that cannot find its history cannot tighten. The class has been wrong
(D-026, D-029), in the wrong field (`quoteClass`), absent because the matcher
declined (D-070), and now never written down for the majority of runs.

**The widening is what makes pricing by recipe safe rather than a swap of one
blind answer for another.** A recipe key carries no rows until a run has been
recorded under it, so pricing by it alone would have quoted "first time doing
this" for a job whose *role* has 36 rows. `quoteFor` now tries the exact job,
then the wider class, then the tier — each step a real answer and only the last
ignorance — and clears `sameJob` itself when it widens, so the wording can never
outrun the rows it was computed from.

**Measured live, before and after the first keyed run.**

```
before:  About 46c   — from 36 jobs like it    samples 36
after:   About $1.11 — done this 1 time before  samples 1
```

That is the whole argument for finer classes in one line: **one row about this
job beats thirty-six about this role.** $1.11 lands mid-range of the job's real
$0.97–$1.26, where 46c was not close to anything.

**n = 1, and it cannot be more.** Only run 8 carries a key. Runs 5–7 predate the
change and were deliberately **not** backfilled: the prompt is recoverable and
the key derivable from it, but whether a given run *used* the recipe is not
recorded anywhere — run 1 predates the recipe existing at all, and the router's
decision at the time is not stored. Reconstructing it would be a guess wearing
identification's clothes, which is the line D-039 and D-046 both draw. `certainty`
stays `estimated` until three keyed rows exist.

**It does not unpin the ceiling, and was not meant to.** $1.11 × 2 is under the
clamp now, but the ceiling reads `max(mean × 2, max × 1.2)` off the same rows,
and one keyed row means one max. It will settle as keyed rows accumulate.

**Amended after two more runs: the prediction was half right, and the half that
failed changed what the problem is.**

`certainty` behaved exactly as designed, flipping on the third keyed row:

| Keyed rows | Expected | Certainty |
|---|---|---|
| 1 | $1.11 | estimated |
| 2 | $1.12 | estimated |
| 3 | **$1.09** | **high** |

The three keyed runs cost **$1.11, $1.12 and $1.04** — a range of eight cents,
far tighter than the $0.97–$1.96 the unkeyed history had suggested, because the
outliers are all from before the method matured and none of them are keyed.

The max term settled as predicted: `max × 1.2` fell from **$2.35 to $1.35** once
run 5's $1.96 stopped being in this job's population. **The ceiling did not
move.** `mean × 2` is now $2.18 and takes over, so it clamps at $2.00 exactly as
before.

So the diagnosis this entry rests on — one expensive run pinning a class for
ever — is **resolved and no longer the cause.** What holds the ceiling now is
the multiplier itself, on a job whose max is 1.03× its mean. `mean × 2` exists
to leave room to exceed the average; here it grants 100% headroom where 3% would
cover every run on record. That is a better problem and a different one.

Deliberately not acted on. n = 3, and those three are tight partly *because*
they are the three most recent — a sample chosen by when the field was added
rather than by anything about the job. And the caution in the table below is
unchanged: the ceiling is the turn budget, so tightening it tightens turns, and
these runs use 23–25 calls of the 40 they are granted.

`completedInTurns` held at **24**: both new runs used 25 calls, above the
standing bound, and the minimum correctly refused to move. Level totals after
ten paid runs of one sentence: **$10.40 spent, $7.09 chargeable, six
deliveries.**

### Why the ceiling was left pinned, measured rather than assumed

The pinning was the original complaint and the measurement rejected both fixes:

| Rule | Ceiling | Turns funded | |
|---|---|---|---|
| current (`max`) | $2.00 | 40 | pinned, generous |
| recency window, any size | $2.00 | 40 | **changes nothing** — the $1.96 run *is* recent |
| p90 instead of `max` | $1.12 | ~22 | would have **cut off run 5**, which needed 33 |

A recency window was the obvious fix and would have been built without the
measurement. And the ceiling is not a display — it *is* the turn budget, so
tightening it tightens turns, and the run that first proved this job can finish
needed 33 of them. Unused turns cost nothing: runs 6, 7 and 8 were granted 40 and
used 24, 26 and 23. The clamp holding at $2.00 is D-016 working, not failing.

**Also this run: `completedInTurns` fell 27 → 24**, the second consecutive
tightening from what a run actually did rather than what it was allowed —
`min(27, 40, 23 + 1)`. And a fourth completion at $1.11 against $1.96 / 97c /
$1.26 keeps D-071's reading intact: one step, then noise.

**Where the level stands.** Eight paid runs of one sentence: **$8.24 spent,
$4.93 chargeable**, four deliveries.
