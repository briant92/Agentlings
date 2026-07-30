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
  record it in the Decision log.
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

<!-- One line per architectural/irreversible decision: date — decision — why. -->
- 2026-07-29 — Named "Agentlings" (agents + -lings, Lemmings homage); lives at
  `Escritorio\Agentlings` as a sibling of IGPL, fully separate context.
- 2026-07-29 — Adopted the Karpathy-inspired behavioral guidelines
  (multica-ai/andrej-karpathy-skills) as the base of this CLAUDE.md.
- 2026-07-30 — Concept resolved (design interview): personal real-work
  orchestrator for local coding jobs; literal 2D world; independent job
  queue; sandbox + review outputs. Details in SPEC.md.
- 2026-07-30 — Stack: TS monorepo (npm workspaces) — Vite + React + PixiJS
  web, Node + Hono + ws server, Vitest; Claude Agent SDK planned as the
  real executor (M1).
- 2026-07-30 — External-app access for agentlings happens in-app (MCP
  connection registry, per-job opt-in; sketch in SPEC.md M2) — never by
  reusing claude.ai / Claude Code connectors.
- 2026-07-30 — Agentling identity: per-agentling roles in Claude-native
  formats (subagent .md in `roles/`, SKILL.md in `skills/`, installable
  from GitHub URLs), per-agentling memory files, profile popup on sprite
  click. M0 stores identity; the M1 executor enforces it. See SPEC.md.
- 2026-07-30 — M1 built: real executor = one Claude Agent SDK session per
  job in a child process (agent-runner.mjs, plain node) with laundered
  env — never import the SDK into the server/tsx process (it wedges the
  loader). Repo jobs: local clone + DIFF.patch review; promote =
  git apply. Auth via .env (see .env.example).
- 2026-07-30 — Structural: 90's boot flow (title → level select →
  level). Levels are independent workspaces (own crew/jobs/memory +
  per-level KNOWLEDGE.md fed only to that level's sessions); the
  roles/skills catalog stays global. Crews start at 2, hire in-level.
  Themes are hand-tuned palettes; card thumbnails render from them.
  Legacy cave migrated to levels/hq. Details in SPEC.md.
