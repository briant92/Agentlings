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

## Milestones

- **M0 — walking skeleton (this scaffold).** Marching horde, job queue,
  simulated executor, sandbox output, review panel. Evidence: `npm test`
  green, a queued job visibly worked and reviewable in the browser.
- **M1 — real executor.** `ClaudeAgentExecutor` using the Claude Agent SDK
  (`@anthropic-ai/claude-agent-sdk`, `query()` with the sandbox as cwd).
  Clone the target repo into the sandbox (`git clone --local`), let the
  agent work there; review becomes a diff view; promote applies the patch
  to the real repo (`git apply`). `ANTHROPIC_API_KEY` lives in `.env`
  (gitignored) — never in code.
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
