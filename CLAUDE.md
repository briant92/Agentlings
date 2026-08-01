# Agentlings

Behavioral base adapted from the Karpathy-inspired CLAUDE.md
(https://github.com/multica-ai/andrej-karpathy-skills), followed by
project-specific instructions. Where they conflict, project-specific wins.

## Behavioral guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.

---

## Project: Agentlings

A personal orchestration tool with Lemmings-style presentation: a horde of
small agentlings marches through a side-view 2D world, picks up real coding
jobs, works them in per-job sandboxes, and delivers results for review.
Full product definition: SPEC.md.

Greenfield, started 2026-07-29. Solo developer (Brian).

### Ground rules

- IMPORTANT: This project is completely separate from the IGPL Family Office
  project. Account-level connectors visible in sessions here (Supabase, Gmail,
  Calendar, Carta, Vercel) belong to that other project — NEVER read from or
  write to them for Agentlings work unless explicitly told otherwise.
- Architectural choices (language, engine, framework, storage) extend rule 1:
  present 2–3 options with a recommendation, wait for the decision, then
  append an entry to `DECISIONS.md`.
- Keep the project half of this file lean: when a placeholder becomes real,
  replace it and delete stale lines.

### Environment

- Windows 11; PowerShell is the primary shell. Prefer cross-platform tooling.
- This folder lives inside OneDrive (`...\OneDrive\Escritorio\Agentlings`).
  If `node_modules` or build output ever makes sync churn, exclude it via
  OneDrive Settings → Sync and backup → Advanced → Exclude files.
- Secrets go in `.env` (gitignored) — never in code and never in this file.

### Commands

- Setup: `npm install`; for the real executor copy `.env.example` → `.env`
  and set one auth option (see SPEC.md M1)
- Run dev: `npm run dev` (web on http://localhost:5173, API/WS on :4600)
- Test: `npm test`
- Lint / typecheck: `npm run typecheck`

### Code style & conventions

- TypeScript everywhere, `strict` on, ESM (`"type": "module"`).
- npm workspaces: `packages/shared` (domain types), `server` (Node + Hono +
  ws; runs TS directly via tsx, no build step), `web` (Vite + React + PixiJS).
- Server state is authoritative; the web client only renders it.

### Workflow

- Definition of done (extends rule 4): show the evidence — test output,
  command results — don't just assert success.
- Commit early and often with descriptive messages once git is initialized.

### Decision log

Every resolved question, with the evidence that settled it, lives in
`DECISIONS.md` — 36 entries, newest last. Read it before reopening anything
settled, and cite the entry ID (`D-017`) rather than a title or a line number.
Do not `@`-import it; it is meant to be opened on demand, not loaded on every
turn.

- D-001–D-007, D-032, D-034–D-035 — concept, stack, outside access, identity, executor
- D-008–D-010, D-014 — visuals and terrain: palette, art-as-data, art source, scenes-as-data
- D-011, D-013 — levels as workspaces, and the non-expert setup path
- D-012, D-016–D-018, D-026–D-027, D-029 — cost: quotes, ceilings, turn budgets, rates, billing
- D-015, D-019–D-025, D-036 — learning: recipes, close-out, compiled tools, promotion
- D-028, D-030–D-031, D-033 — socket payload, UI/UX, documents, answering a run

New entries append to `DECISIONS.md` with the next ID. An entry is a decision
plus what proved it — length is whatever the evidence takes, not one line.

### Hard-won rules

Distilled from the entries above; each points at the account it came from.
These are here because an archive changes no behaviour.

- Measure before tuning. A figure in these notes is not evidence — recompute
  it, including when the note is a premise you argued for. (D-016, D-029, D-035)
- Anything that learns only from clean successes goes blind exactly where most
  runs land. Check the population before the logic. (D-017, D-019, D-023, D-030)
- "It delivered" keeps being re-derived locally, and every local copy silently
  assumes a repository. Call the shared function. (D-030)
- Collapsing two notions that only sound alike is as dangerous as duplicating
  one. (D-030)
- A field can be threaded through a type, a spec and a route and still be
  dropped by the one function that builds the object. (D-033)
- A correct fix can ship inert. Ask what existing data it needs to reach, and
  backfill by identification — never by guess. (D-026, D-030, D-036)
- A mechanism that learns a method will keep using it after the ground moves.
  Ask what a stored decision assumed, not just whether it was right. (D-036)
- Price a turn by `turnsAllowed`. A cut-off run reports `turnsAllowed + 1` and
  nothing more. (D-022, D-025)
- "Ran out of turns" does not mean "needed more turns" — for a close-out or a
  compile it is the ordinary ending. (D-025)
- A quote may never come in under the turns it has already decided to grant.
  (D-022, D-026)
- When a run is short of turns, look at what it spends them on before granting
  more. (D-015, D-025)
- The user is never billed above the quote, and work that cost money and failed
  is absorbed. (D-012, D-021)
- Run it live before believing it. Faults invisible to 636 passing tests were
  obvious on the first real call. (D-021, D-024, D-030, D-033)
- Generated instruction is executable: preview before installing, and make a
  tool prove its own output. (D-011, D-021)
- Mutation-test after committing — `git checkout <file>` destroyed an hour of
  uncommitted work. (D-021)
