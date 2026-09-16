# Codebase fat / architecture review — 2026-09-16

**Review only.** Nothing in this file was applied. Every figure below was
measured on `main` at `b660872` on 2026-09-16 with the commands named beside
it; a figure is not evidence, recompute it before acting (PROJECT.md,
hard-won rules). Proposals are proposals — each one that touches an
architectural choice goes through CLAUDE.md rule 1 and lands as a `D-` entry
before any code moves.

Scope asked for: architecture, data layer, workflows, dead code, fat deps,
schema drift, duplication.

## The repo in numbers

| Measure | Value | How |
|---|---|---|
| Tracked files / bytes | 572 files, 23 MB | `git ls-files \| xargs du -ch` |
| — of which `web/public` (packs, PNG) | ~14.7 MB | same |
| — of which root `*.md` | 2.15 MB (DECISIONS.md alone 1.58 MB, 287 entries, 258k words) | `wc -c *.md`, `rg -c "^## D-"` |
| Server source / tests | 37,550 / 36,167 lines (113 test files) | `find server/src -name '*.ts'` + `wc` |
| Web source / tests | 18,297 / ~4,100 lines (38 test files, 0 `.tsx` tests) | same |
| Shared | 4,103 lines; `index.ts` 2,638 with 174 exports | same |
| Scripts | 64 files, 13,310 lines (40 `prove-*`, 15 migrations) | `wc -l scripts/*` |
| Commits (whole history, 7 weeks) | 830; `server/src/index.ts` in 213 of them (26%) | `git log --name-only` |
| `node_modules` after `npm ci` | 1.9 GB | `du -sh node_modules` |
| Typecheck | clean, all three workspaces | `npm run typecheck` |
| Tests on Linux | server 2,938 pass / **12 fail** in 5 files; web 377/377 | `npm test` (see P0-2) |
| Web bundle | 80 chunks, 4.5 MB JS; main chunk 824 KB (259 KB gz); mermaid lazy-loaded | `npm run build` |

---

## P0 — structural, costing something today

### P0-1. `server/src/index.ts` is the application, and cannot be tested

- 4,634 lines. **111 route registrations** (44 GET, 52 POST, 8 DELETE, 3 PUT,
  1 PATCH) and **34 module-level functions**, of which at least eight are
  domain logic rather than HTTP glue: `autoSendIfApproved` (L722),
  `queueNextStep` (L1678), `queueCheck` (L1762), `settleCheck` (L1846),
  `queueGatherIfLastHand` (L1921), `sweepSchedules` (L4370),
  `sweepMailTriggers` (L4438), `sweepVoice` (L4546). Plus 9 module-level
  mutable singletons (`levels`, `matchIndex`, `subscriptions`, `sentJobsRev`,
  the two sweep flags…) and 4 `setInterval`s.
- ~2,459 of the 4,634 lines sit inside handler bodies. The longest handlers
  are business logic: `/tools/promote` 193 lines (recipe selection, manifest
  authoring, job queuing — L3444–3637), `/work` 124, `/schedules` 106,
  `/jobs/:id/reply` 84.
- `serve()` runs at import, so **no test may load the file**. The tests say so
  themselves: `session.test.ts:39` ("a test that reached the gate through the
  app would start a real server on :4600") and `verdict.test.ts:725` ("What it
  cannot reach is `autoSendIfApproved` itself: index.ts listens at import, so
  no test may load it (D-278 Q10)"). The chain-step machinery and all four
  sweeps therefore have **zero unit tests**; their only proof is the
  `prove-*` live scripts.
- Boilerplate: `getLevel(c.req.param('lid'))` + `return c.json({ error:
  'unknown level' }, 404)` appears **46 times**; `'unknown job'` 12×;
  `return c.json({ error` 187×. No `requireLevel` helper or middleware.
- 25 modules are imported by `index.ts` and nothing else (`auth`, `browse`,
  `bundle`, `close`, `crew`, `cv`, `deliveries`, `doorlog`, `env`, `intake`,
  `jobboard`, `mailtrigger`, `mcpprobe`, `merge`, `packbrief`, `preview`,
  `productivity`, `provenance`, `refine`, `registry`, `render`, `report`,
  `sweep`, `transcribe`, `validate`, `voice`, both executors) — the module
  split is good; the *composition* is the fat.

**Proposal (no behaviour change):**
1. Split the listener from the app: `app.ts` builds and exports the Hono app
   and the level map; `index.ts` (or `boot.ts`) becomes ~40 lines that load
   `.env`, call `listenPolicy()`, and `serve()`. This alone makes every route
   reachable from a test with `app.request()`.
2. Move the four sweeps and the chain-step functions (`queueNextStep`,
   `queueCheck`, `settleCheck`, `queueGatherIfLastHand`, `autoSendIfApproved`)
   into `chain.ts` / `sweeps.ts` taking `(rt, job)` — they already take the
   runtime as a parameter, so this is a cut-and-paste with imports.
3. One `requireLevel(c)` helper returning `rt | Response`. 46 sites.
4. Then, and only then, group routes by prefix (`/api/levels/*` is 50 of the
   111) into `routes/levels.ts` etc. This step is optional; 1–3 are the value.

**Verify:** typecheck clean; the same 2,938 tests pass; a new
`app.test.ts` proves one route through `app.request()`; `prove-wave0.mjs`
still passes live.

### P0-2. The test suite does not pass on the platform the template deploys to, and nothing runs it

- `.github/` holds only `agents/` — **no workflow**. PROJECT.md's rule "never
  push a container build that has not been typechecked and tested" is
  enforced by a hand-run on one Windows machine, while D-276/D-280 make every
  push to `main` a deploy to strangers' installs.
- On Linux (this review's VM; the same family as `mcr.microsoft.com/playwright:v1.62.1-noble`),
  `npm test` fails **12 tests in 5 files** and — because the root script is
  `test -w server && test -w web` — never reaches the web suite:
  - `render.test.ts` ×3: argument-validation tests (`no such finish: "hd"`,
    `no such mode`, `tileWidth`) fail with `no renderer on this install — no
    Microsoft…` — the renderer probe runs before the refusals they test.
  - `pickFolder.test.ts` ×4: the "one dialog at a time" gate is tested
    through the Windows dialog path.
  - `bundle.test.ts` ×1: "refuses a path onto another drive" assumes drive
    letters.
  - `gitwork.test.ts` ×2, `carry.test.ts` ×2: 10 s hook timeouts on clone —
    network-bound, environment-sensitive.
- Web's `package.json` runs `vitest run` **without declaring vitest** (hoisted
  from server); root runs `tsx` without declaring it. Works today because of
  hoisting only.

**Proposal:** one `.github/workflows/ci.yml` that runs `npm ci`, `npm run
typecheck`, `npm run test -w web`, `npm run test -w server` on `ubuntu-latest`
and reports (not gates) to begin with. Fix the five files to pass off
Windows: `it.skipIf(process.platform !== 'win32')` for the dialog and drive
tests, reorder the render refusals to validate before probing (that is what
the tests assert anyway), and raise/relax the two clone hooks. Declare
`vitest` in `web/package.json` and `tsx` at the root. Change the root `test`
script to run both workspaces even when one fails (`npm run test --workspaces
--if-present`).

**Verify:** the workflow is green on `main`; the Windows run is unchanged.

---

## P1 — real fat, no fire

### P1-1. Data layer: 23 hand-rolled stores, one of them safe

There is no database and no store abstraction. `store.ts` is the
knowledge-index only (`store-index.json`, 4 importers). Measured across
`server/src` non-test:

| Question | Answer |
|---|---|
| Modules doing raw `fs` I/O | 50 |
| Modules owning a persisted file under `.agentlings/` | ~22 (settings, ledger, sends, refusals, doorlog, userconnections, audience, library, voice, levels, queue, schedules, approvals, recipes, store, tools, reconciliation, memory, trajectory, moves, executors/claude, env) |
| Independent load/save pairs | ≥ 23 (`readSettings/writeSettings`, `readSchedules/writeSchedules`, `readApprovals/writeApprovals`, `readRecipes/writeRecipes`, `readMeta/writeMeta`, `readRoster/writeRoster`, …) |
| Atomic tmp+rename writes | **1 site**: `ledger.ts:411–420` (`ledger.jsonl.rewriting` → rename) |
| Everything else | `writeFileSync` direct overwrite, no lock, no coalescing |
| `schemaVersion` on any record | **0** |
| Fields defaulted-on-read as implicit migration | ~35 (+5 structural lifts: `queue.ts liftJob` L122–157, `approvals.ts liftApproval` L72–100, `continuedBy` heal L207–215, `delivered` backfill L216–233, recipe `terms` L265–269) |
| Hand-run migration scripts | 15 (`scripts/backfill-*` ×12, `drop-*` ×2, `dedupe-notes.ts`) — dry-run by default, never at boot |
| `jobs.json` | full-array rewrite on every mutation (`queue.ts:273–276`), synchronous, in request handlers |
| Append-only files with no rotation | `ledger.jsonl`, `sends.jsonl`, `refusals.jsonl`, `doors.log`, `tool-candidates.jsonl`, per-job `.trajectory.jsonl` / `moves.jsonl`, `server.log` |

The tolerant-reader style (torn JSON = missing, optional field = predates
field) is consistent and documented in comments, which is what has kept this
working. The cost is that **every reader carries every migration for ever**
and the 15 scripts each re-implement "walk the ledger, patch a field, write
it back" (e.g. `backfill-ledger-author.mjs`, `-closeout`, `-compile`,
`-fallback`, `-recipe`, `-shape` are the same loop six times).

**Proposal:**
1. One `jsonfile.ts` with `readJsonOr<T>(file, fallback)` (the existing
   torn-file policy) and `writeJsonAtomic(file, value)` (the ledger's
   sibling+rename). Adopt it per module as each is next touched — no format
   change, no big-bang. The ledger already models the right pattern.
2. A single `schemaVersion` **on the ledger only** (append a `{v:2}` header
   row is not needed — a top-level field on new rows is enough), so the next
   backfill can be `for rows where v < N` rather than `for rows where field is
   absent`. Do not version everything; the ledger is the file the 12 scripts
   were written against.
3. Decide (D-entry) whether the 15 scripts are archive or tooling. If
   archive: `scripts/migrations/` with a README naming the D-entry each
   served. If tooling: fold the six ledger loops into one
   `ledger-backfill.ts --field`. Either is fine; the current state is neither.

**Not a proposal:** replacing JSON files with SQLite. The volume-carries-
everything story (`.railway/railway.ts`) and the sync-read-everywhere style
are coherent; a database is a different product.

### P1-2. Dependency manifests describe a different repo than the one that runs

Measured with `rg` over every `import`/`import()`/`require` (test and
non-test separated):

| Finding | Evidence |
|---|---|
| Root `dependencies` are server-only | `docx`, `exceljs`, `jszip`, `mammoth`, `pdf-lib`, `pdf-parse`, `pptxgenjs` — every executable import is under `server/src/` (`documents.ts`, `render.ts`, `jobboard.ts`) |
| Two of them are test-only | `docx`, `pptxgenjs`: **0 non-test imports**; only `preview.test.ts`, `store.test.ts` build fixtures. (They are named in the runner prompt at `claude.ts:274–281` so a *sandbox* can `import("docx")` — that is the reason they are installed, and it should be written down at the declaration.) |
| Duplicated declaration | `jszip` in root **and** `server/package.json` |
| Runtime dep declared as devDep | `zod` — used at runtime by `server/src/executors/agent-runner.mjs:134,170,288`. Works only because the Dockerfile deliberately does **not** `--omit=dev`. Any future prune breaks the runner. |
| Undeclared where used | `vitest` (38 web test files, not in `web/package.json`); `tsx` (root scripts, not at root); `@napi-rs/canvas` (`store.test.ts` ×5, a transitive of `pdf-parse`, declared nowhere) |
| Types-only / CLI-only, fine | `@types/*`, `typescript`, `concurrently` (npm scripts only) |

**Proposal:** move the seven doc libs to `server/package.json` (with `docx`
and `pptxgenjs` under a comment naming the sandbox as their consumer), delete
the root `dependencies` block, drop the duplicate `jszip`, move `zod` to
`dependencies`, add `vitest` to web and `tsx` to root, add `@napi-rs/canvas`
to server devDeps. Lockfile changes only in placement; `npm ls` output is
identical. Then `container.test.ts` can assert the runner's imports are all
in `dependencies`, so this cannot regress.

**Verify:** `npm ci && npm run typecheck && npm test` unchanged; `npm ci
--omit=dev -w server` followed by `node server/src/executors/agent-runner.mjs`
resolves `zod` (proves the fix, not something to ship).

### P1-3. 1.9 GB of `node_modules`, most of it never executed here

| Package | Size | What runs |
|---|---|---|
| `@anthropic-ai/claude-agent-sdk-linux-x64` + `-musl` | 263 + 258 MB | one of the two, per libc |
| `onnxruntime-node` | 513 MB (`linux` 354, `win32` 124, `darwin` 35) | one platform's binary, only when a voice note arrives |
| `onnxruntime-web` | 130 MB | **nothing** — the browser build pulled in by `@huggingface/transformers` |
| `mermaid` (+ `@mermaid-js`, `cytoscape-*`, `katex`) | ~110 MB | lazily, one component (`Mermaid.tsx`); correctly code-split |
| `pixi.js` | 80 MB | the world |
| `three` | 26 MB | **two files** served into offline renders (`render.ts:70–84`) |
| `pdfjs-dist`/`pdf-parse`/`pdf-lib`/`exceljs` | ~105 MB | document reading |

The Dockerfile `npm ci`s all of it into the image (by design — tsx and Vite
are devDeps). Nothing here is wrong; it is heavy, and the weight lands on
every `Deploy` click.

**Proposal (measure first, decide later):** record the built image size
once (`docker image ls` on the reference install) as the baseline. The one
cheap win is `onnxruntime-web` (130 MB, never loaded in Node) — check whether
`@huggingface/transformers` can be installed with it excluded; if not, it
stays. `voice:install` already downloads the 241 MB model at first use; the
same lazy-install pattern for `@huggingface/transformers` itself would take
~660 MB out of every install that never gets a voice note, but that is a
D-entry, not a tidy-up.

### P1-4. Web: three god-components, seven hand-rolled modals, no component tests

| File | Lines | `useState` | `useEffect` | Components |
|---|---|---|---|---|
| `web/src/panels/WorkBar.tsx` | 1,720 | 31 | 12 | **1** (logic L84–843, JSX L843–1720) |
| `web/src/screens/SettingsModal.tsx` | 1,205 | 33 | 6 | 2 |
| `web/src/panels/ReviewModal.tsx` | 1,270 | 16 | 7 | 2 |
| `web/src/world/WorldCanvas.tsx` | 1,068 | — | 2 | 1 |

- Seven `*Modal.tsx` (`CrewModal`, `HireModal`, `KnowledgeModal`,
  `ProfileModal`, `ReviewModal`, `RolesModal`, `SettingsModal`) each copy the
  same scaffold: `onClose` prop, `window` keydown Escape listener,
  `className="modal-backdrop"`, ✕ button. No `Modal.tsx` base.
- 38 web test files, **0 test a component** (all pure `.ts` helpers). The
  API client is already centralised (`web/src/api.ts`, 94 `api<…>` call
  sites); WorkBar has the one stray raw `fetch` (L505).
- `styles.css`: 6,606 lines, 1,114 selectors, 676 class names; 43 classes
  have no literal reference in `web/src` (some are built dynamically —
  `chan-*`, `nb-*` — so treat as ~25 dead, unverified).

**Proposal:** a 30-line `Modal.tsx` (backdrop, Escape, close button, `title`)
adopted by the seven; WorkBar's hooks section (L84–843) extracted into
`useWorkBar()` with the JSX left alone — the eyes-only design canvas (UI.md)
is unchanged by either. Not proposed: a state library.

### P1-5. 736 lines of untyped runtime JavaScript across a process boundary

`server/src/executors/agent-runner.mjs` (454), `browser-act.mjs` (54),
`runner-secrets.mjs` (75), `server/scripts/dev-logged.mjs` (153). Plain JS is
deliberate ("spawned with plain `node`, never through tsx" — header comment;
D-270 for `dev-logged`). But the JSONL protocol the runner emits
(`progress|observation|said|compact|result|error`) is typed on **neither**
side: `claude.ts` parses it untyped and the runner writes it untyped; no
`@ts-check` in any of the four files.

**Proposal:** `// @ts-check` plus a `runner-protocol.d.ts` that both
`claude.ts` and (via JSDoc `@typedef {import(...)}`) `agent-runner.mjs` read.
Zero runtime change; `tsc --noEmit` starts checking 736 lines it currently
skips. The `.mjs` stays `.mjs`.

---

## P2 — tidy when passing

### P2-1. Dead or unreferenced things (verified individually)

| Item | Evidence | Note |
|---|---|---|
| `web/public/starbase.png` | 2,058,302 bytes tracked; only `starbase-scene.jpg` is referenced (`TitleScreen.tsx:14`). Sole mentions are its own Blender script and a bundle test that fakes the name. | **9% of every tracked byte**, for nothing served. Confirm with Brian it is not a hand-opened reference before removing. |
| 7 scripts with zero references anywhere (not even DECISIONS.md) | `backfill-ledger-compile.mjs`, `-fallback.mjs`, `-recipe.mjs`, `backfill-ledger-settled.ts`; `prove-engine.mjs`, `prove-engine-ui.mjs`, `prove-hosted-engine.mjs` (last touched 2026-08-31) | The other one-off scripts are each cited by at least one D-entry (or `HORDE.md`) — they are evidence, keep them. |
| 50 unused exports + 26 unused exported types | `npx knip` (default config) | Spot-checked 9: all genuinely unreferenced (`DEFAULT_BIND`, `DEFAULT_PORT`, `loginRefusal`, `markTourSeen`, `clearRefineCache`, `forgetRenderAvailability`, `titleAddsSomething`…). Un-exporting is safe; deleting needs a look each. |
| 10 shared exports unreferenced outside shared | `AgentlingState`, `ChannelShelfRow`, `CoverageEvidence`, `JobEventType`, `MAX_OUTBOX_BODY_CHARS`, `MovesRun`, `OUTBOX_BODY_CHARS`, `PreviewSlide`, `RepoTarget`, `SpendTotals` | |
| `fixtures/reconcile/*.mjs` | referenced by `RECONCILE.md` and D-223 only | fine; it is the fixture generator |

### P2-2. Duplication (highest-signal only)

| What | Where |
|---|---|
| `ago()` — identical body | `RolesModal.tsx:17`, `KnowledgeModal.tsx:20` |
| `isRecord()` — identical | `reconciliation.ts:75`, `nomina.ts:242` |
| USD display formatter | 8 near-copies: `Productivity.tsx:12`, `Backoffice.tsx:68`, `facts.ts:22`, `CrewModal.tsx:72`, `crew.ts:196`, `ProfileModal.tsx:9`, `realwork.ts:223`, `estimate.ts:65 formatUsd` |
| `randomUUID().slice(0, 8)` id shape | `schedules.ts:450`, `queue.ts:339`, `party.ts:214` |
| slugify pipeline | `levels.ts:110`, `shared/index.ts:2630` (inside `branchName`) |
| `JSON.parse(readFileSync(...))` | named `readJson` once (`library.ts:241`); inline in ≥15 modules (see P1-1) |
| `AGENTLINGS_MAX_COST_USD` read | `index.ts:3033`, `index.ts:4027`, `quote.ts:169` |
| `'claude-haiku-4-5-20251001'` | `refine.ts:25 MODEL`, `executors/claude.ts:137 CLOSEOUT_MODEL` |
| `ResolvedBy` union re-inlined | `shared/index.ts:211` vs `JobEvent.by` at `:2503` |
| Test fixtures re-declared per file | `function job(` in 5 server + 6 web test files; `entry(` ×4; `fakeFetch(` ×4; `mkdtempSync` in 57 of 113 server test files; no `test-utils` |

The PROJECT.md hard-won rule against re-deriving one notion locally (D-030)
already names this class. One `server/src/testing.ts` with `job()`, `entry()`,
`tmpRoot()` would remove the largest cluster.

### P2-3. Config and doc drift

- `.env.example` does not mention `BUK_API_KEY`, `SII_CERT_PATH`,
  `SII_CERT_PASSWORD` (two doors landed 2026-08-26/09-03),
  `AGENTLINGS_MAX_COST_USD` (documented as the operator override in
  `estimate.ts:31,47`), `AGENTLINGS_LOG_DIR`, `AGENTLINGS_CLOSEOUT_MODEL`,
  `AGENTLINGS_RESTART_AFTER_MS`, `AGENTLINGS_RESTART_DELAY_MS`. Some are dev
  knobs; the SII/Buk keys and the cost ceiling are operator-facing.
- Four root proposal documents — `EXPANSION.md`, `PRERENDER.md`,
  `SPATIAL.md`, `TEAMWORK.md` (150 KB together) — each open with "this file
  decides nothing", were last touched 2026-08-09/11/22/19, and are not
  indexed by `CLAUDE.md` or `PROJECT.md`. `GAPS.md` is a 2026-08-06 review.
  `RECONCILE.md` and `TRAINING.md` are working files of lines that may still
  be live. Whether the closed ones move to `docs/proposals/` (HORDE.md set
  the precedent of condensing a board into the repo) is Brian's call — the
  content is fine, the front door is cluttered.
- `README.md` architecture diagram is current; no dead links found.

### P2-4. Web bundle

Main chunk 824 KB / 259 KB gz; pixi.js ships both `WebGLRenderer` (69 KB)
and `WebGPURenderer` (39 KB) chunks. Mermaid is correctly dynamic. Nothing
urgent; if the title screen ever feels slow, `manualChunks` for pixi is the
lever.

---

## What NOT to touch (and why the tools will tell you to)

| Thing | Tool says | Truth |
|---|---|---|
| `three` in `server/package.json` | knip: "unused dependency" | Used by path: `render.ts:80` resolves its install dir with `createRequire(...).resolve('three')` and serves `three.module.min.js` + `three.core.min.js` into offline sandboxed renders (D-143). Removing it breaks `render_plate`. Add to a `knip.json` ignore with this sentence. |
| 58 `scripts/*` and `fixtures/reconcile/*.mjs` | knip: "unused files" | Hand-run proofs and migrations; of the 52 one-off `prove-*`/`backfill-*`/`drop-*`/`verify-*` scripts checked, 44 are cited by name in `DECISIONS.md` and one more in `HORDE.md`. They are the evidence PROJECT.md demands. Archive/move is a decision, deletion is not. |
| Comment density (12,141 of 37,550 server lines, 32%; 1,741 `D-` citations to 216 distinct decisions) | any "fat" heuristic | House style and load-bearing: the comments are where the decision is cited at the line it constrains. |
| `DECISIONS.md` at 1.58 MB | file-size heuristics | Archive by design, opened on demand, never imported (PROJECT.md). |
| `Schedule.tools` absent on old rows | "default it to `[]`" | Absent means *all doors* (legacy grant, `schedules.ts:65–73`, D-254). `?? []` would silently revoke every pre-existing schedule's doors. |
| Ledger append + `.rewriting` rename | "why is only this one atomic" | It is the correct pattern; make the others match it, not the reverse. |
| Dockerfile `npm ci` without `--omit=dev` | "prune devDeps" | Deliberate (tsx, Vite). It is also what currently masks the `zod` misplacement (P1-2) — fix the manifest, keep the Dockerfile. |
| `agent-runner.mjs` as plain JS | "convert to TS" | Deliberate: spawned with plain `node` so the SDK import can never wedge the server. `@ts-check` (P1-5) gets the type safety without changing the file type. |
| Railway resource names `Agentlings` / `agentlings-volume` | "normalise casing" | A rename is a create+delete that destroys the volume (`.railway/railway.ts` header; `container.test.ts` pins them). |
| `web/public/packs/**` PNGs (~13 MB) | size heuristics | Product assets with provenance in each `pack.json`; `starbase.png` (P2-1) is the one unreferenced file. |
| `packages/shared/src/index.ts` at 2,638 lines | "split it" | 174 exports with 131 importing files; it is a type dictionary and splitting it is churn for no reader. |

---

## Suggested order, if any of this is picked up

1. **P0-2 first** — a CI run on Linux is the only way to prove every other
   change here, and today the suite cannot be run green anywhere but one
   machine.
2. **P1-2** — manifest moves; zero risk, ten minutes, closes a latent break.
3. **P0-1 steps 1–3** — listener split, sweeps/chain extraction,
   `requireLevel`. Each is a mechanical move that the existing 2,938 tests
   plus one new `app.test.ts` prove.
4. **P1-1 step 1** — `jsonfile.ts`, adopted as modules are touched.
5. Everything else as passing tidy-ups, each behind its own commit.

Nothing above changes what the horde does for Brian; all of it changes how
much of the machine can be proven without running it live.
