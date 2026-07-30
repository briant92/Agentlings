# Agentlings — v1 Specification

A personal orchestration tool that makes running a fleet of coding agents
feel like playing Lemmings: a horde of small agentlings marches through a
side-view 2D world, picks up jobs you queue, does real work in sandboxes,
and carries the results to the exit for your review.

Decided 2026-07-30 through a design interview; this file is the product
source of truth. Update it when scope changes.

## Product decisions

| Question | Decision |
|---|---|
| Identity | Real-work orchestrator — utility first, Lemmings presentation |
| Audience | Just Brian (personal tool; no auth, hosting, or onboarding) |
| Platform | Web UI in the browser + local Node server |
| Agent brains | Hybrid: deterministic sim for world behavior; LLM only for real job execution |
| Jobs (v1) | Coding tasks against local repositories |
| Goal shape | Independent jobs in a queue (decomposition/pipelines later) |
| World | Literal side-view 2D world (stations, exit); hazards later |
| Outputs | Per-job sandbox + in-app review; promote what you keep |

## Core loop

1. Queue a job (title + prompt + target repo path).
2. The job claims a station slot in the world (max 5 visible; extras wait).
3. An idle agentling walks to the station and works — the actual execution
   runs in `.agentlings/jobs/<id>/` (the job's sandbox).
4. On success the agentling carries the result to the exit; on failure it
   walks home and the job is marked failed.
5. You review the sandbox output in the panel and promote or discard it.

The world is presentation, not physics: the server sim owns all state and
the client renders it. Nothing in the world may block or corrupt a job.

## Architecture

```
web  (Vite + React + PixiJS)  ── WebSocket /ws (world 10 Hz + job events)
                              ── REST /api    (queue, review, resolve)
server (Node + Hono + ws)     ── sim tick, job queue, sandboxes, executors
packages/shared               ── domain types + world constants
```

- `server/src/sim.ts` — agentling state machine (idle → walking → working →
  delivering), advanced every `TICK_MS`.
- `server/src/queue.ts` — in-memory job store, station slots, sandbox dirs.
  No persistence in M0; a restart clears the world (job sandboxes remain on
  disk under `.agentlings/`).
- `server/src/executors/` — `Executor` interface. M0 ships
  `SimulatedExecutor` (writes `RESULT.md` after a fake delay) so the whole
  loop runs end to end without an API key.
- `server/src/events.ts` — typed job events (queued / started / progress /
  done / failed / resolved) broadcast on the WS with a 200-entry replay
  buffer; the terminal rail in the UI renders them. Movement is never an
  event — the world tells that story.

### REST API

| Route | Purpose |
|---|---|
| `GET /api/state` | Current `WorldState` snapshot |
| `POST /api/jobs` | Queue a job `{title, prompt, repoPath?}` |
| `GET /api/jobs/:id/output` | Sandbox files for review |
| `POST /api/jobs/:id/resolve` | `{action: "promote" \| "discard"}` |

## Agentling identity (roles, skills, memory)

Each agentling is a self-contained worker: a persistent role, a skill
set, hard boundaries, and a memory that accumulates across jobs. Click a
sprite to open its profile; assignments persist in
`.agentlings/roster.json`.

- **Roles** are Claude Code subagent files in `roles/*.md` — frontmatter
  (`name`, `description`, `tools`, `skills`, optional `model`) plus the
  system prompt as body. Built-ins: worker, scout, mason, scribe.
- **Skills** are `SKILL.md` folders in `skills/` (built-in:
  concise-reports). Both roles and skills install from GitHub URLs via
  the Roles & skills modal (blob links auto-convert to raw).
- **Boundaries**: a run may use the intersection of the role's `tools`
  and the job's tool opt-in (see M2 registry) — the sandbox stays the
  hard wall underneath.
- **Memory**: one lessons file per agentling in `.agentlings/memory/`;
  M0 stubs a career-log line per job.
- M0 stored identity; **M1 enforces it** — the executor maps the role
  onto the Agent SDK session (system prompt, tool allowlist, model,
  mounted skills) and reads/writes real memory lessons. A scout with
  read-only tools genuinely cannot edit code.

## Levels (projects as worlds)

The app boots like a 90's game: **title screen** (Continue · Start ·
Settings) → **level select** → a level. A level is a full workspace for
one project — its own crew, job queue, event feed, sandboxes, and
memory — stored under `.agentlings/levels/<id>/` (`level.json`,
`roster.json`, `memory/`, `jobs/`, `KNOWLEDGE.md`).

- **Creation**: name + project tag + a hand-tuned palette theme (cave,
  chalkboard, household, marble). A fresh crew of two spawns; hire more
  from inside the level (they drop in at the hatch). Level cards on the
  select screen render their thumbnails live from the theme palette.
- **Context scoping**: every finished job appends to the level's
  `KNOWLEDGE.md`; executor sessions load their own lessons plus their
  level's knowledge — never another level's. Levels share nothing but
  the global roles/skills catalog.
- **Transport**: one sim per level ticks server-side; the WebSocket
  subscribes per level (`/ws?level=<id>`), so the client streams only
  the world on screen.
- The pre-level cave migrated to `levels/hq` with its crew, roles, and
  memory intact.

## Milestones

- **M0 — walking skeleton (this scaffold).** Marching horde, job queue,
  simulated executor, sandbox output, review panel. Evidence: `npm test`
  green, a queued job visibly worked and reviewable in the browser.
- **M1 — real executor (built).** `ClaudeAgentExecutor` runs each job as
  one Claude Agent SDK session in a child process (`agent-runner.mjs`,
  spawned with plain node — the SDK's huge import graph must never enter
  the server/tsx process, and a wedged session can't take the server
  down). The role becomes the session: system-prompt append, tool
  allowlist via `permissionMode: dontAsk`, model, skills mounted into
  `sandbox/.claude/skills`, memory lessons in, `LESSON.md` back out.
  Repo jobs `git clone --local` into `sandbox/repo`; `DIFF.patch` is
  captured after the session; promote `git apply`s it to the real repo
  and only then marks the job promoted. Streamed tool calls surface as
  terminal progress lines. 10-minute timeout, 60-turn cap per session.
  Auth (any one): `ANTHROPIC_API_KEY` in `.env`, a
  `CLAUDE_CODE_OAUTH_TOKEN` from `claude setup-token`, or a fresh Claude
  Code login (auto-detected; `AGENTLINGS_EXECUTOR` overrides). The child
  env is laundered of `CLAUDE*`/`ANTHROPIC_BASE_URL` so a server started
  from inside a Claude Code terminal doesn't inherit that session's
  endpoint or auth.
- **M2 — durability & quality of life.** Persist jobs (JSONL or SQLite),
  survive restarts, cancel button, per-job live log stream. External-app
  access via an in-app MCP connection registry: named connections defined
  in server config (tokens in `.env`), jobs opt in through a
  `tools: string[]` field, and the executor passes only those MCP servers
  into the agentling's Agent SDK session. Default remains no external
  connections — sandbox only.
- **M3 — deepen the metaphor (parked ideas).** Hazards mapped to real
  failure modes (rate-limit fire pits, error chasms), blocker agentlings
  (paused queues), goal decomposition, job pipelines.

## Non-goals (v1)

- No multi-user, auth, or hosting; localhost only.
- No game scoring or win/lose states — the world is a status display.
- No direct writes to real repos before you promote a result.
- No LLM calls for world behavior (movement stays deterministic).
- No borrowing of claude.ai / Claude Code connector auth for agentlings —
  the app owns its own external credentials (see M2).

## Definition of done (per CLAUDE.md)

Every milestone shows evidence: test output, command results, or a
screenshot of the loop running.
