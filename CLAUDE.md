# Agentlings

Behavioral base adapted from the Karpathy-inspired CLAUDE.md
(https://github.com/multica-ai/andrej-karpathy-skills), followed by
project-specific instructions. Where they conflict, project-specific wins.

## Behavioral guidelines

Adopted from the Karpathy-inspired base (D-002) and since cut to what the
harness does not already do by default (D-038). Bias toward caution over speed;
on trivial tasks, use judgment. The numbering is referenced elsewhere in this
file, so it stays.

**1. Think before coding.** State your assumptions. Where several readings are
possible, present them rather than picking silently. Where something is
unclear, stop and name what is confusing.

**2. Simplicity first.** The minimum that solves the problem, nothing
speculative. If you wrote 200 lines and it could be 50, rewrite it.

**3. Surgical changes.** Touch only what you must, and match the existing style
even where you would do it differently. Notice unrelated dead code and
**mention it — do not delete it**. Do remove the imports, variables and
functions your own change orphaned. The test: every changed line traces to the
request.

**4. Goal-driven execution.** Turn the task into a verifiable goal — "add
validation" becomes "write tests for invalid inputs, then make them pass". For
multi-step work, state the plan as steps with their checks:

```
1. [Step] → verify: [check]
```

Weak criteria ("make it work") need constant clarification; strong ones let you
loop independently.

---

## Project: Agentlings

A personal orchestration tool with Lemmings-style presentation: a horde of
small agentlings marches through a side-view 2D world, picks up real coding
jobs, works them in per-job sandboxes, and delivers results for review.
Full product definition: SPEC.md. What one agentling can do: AGENTLING.md.

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
- Commit early and often with descriptive messages.

### Decision log

Every resolved question, with the evidence that settled it, lives in
`DECISIONS.md`, newest last. Read it before reopening anything settled, and
cite the entry ID (`D-017`) rather than a title or a line number. Do not
`@`-import it; it is meant to be opened on demand, not loaded on every turn.
Its own **By theme** index, next to its Contents, is the way in when you know
the subject but not the ID.

New entries append with the next ID, and the same edit adds them to both
indexes. An entry is a decision plus what proved it — length is whatever the
evidence takes, not one line.

### Capability surface

What an agentling can do — activities, reach, turn budget, the five tiers,
learning, boundaries — lives in `AGENTLING.md`. Read it before answering a
capability question or writing user-facing copy about one, and update it when a
capability lands. Do not `@`-import it; like `DECISIONS.md` it is opened on
demand.

It is **derived, not authored**. Every claim is regenerable from the code and
tagged Live / Partial / Not built, so decide nothing in it: a change is settled
in `DECISIONS.md`, described in `SPEC.md`, then reflected here with the numbers
re-read from source rather than copied from the prose. Where it disagrees with
the code the code wins and the file is wrong — the opposite of `DECISIONS.md`,
where the entry stands and the code is what drifted.

### Hard-won rules

Distilled from the entries above; each points at the account it came from.
These are here because an archive changes no behaviour.

- Measure it, run it live, and verify by what it now does. A figure in these
  notes is not evidence — recompute it, including when the note is a premise
  you argued for; faults invisible to 636 passing tests were obvious on the
  first real call; and a scripted check once passed by matching a string that
  already existed. (D-016, D-021, D-024, D-029, D-030, D-033, D-035, D-037)
- Ask what a mechanism learned from, and what it assumed. Anything that learns
  only from clean successes goes blind exactly where most runs land, and
  anything that learned a method keeps using it after the ground moves. Check
  the population before the logic. (D-017, D-019, D-023, D-030, D-036, D-037)
- A change can be complete in the type, the spec and the route and still reach
  nothing — the one function that builds the object drops the field, or the fix
  ships inert against data written before it. Ask what existing data it must
  reach, and backfill by identification, never by guess. (D-026, D-030, D-033,
  D-036)
- Duplicating one notion and collapsing two that only sound alike are the same
  mistake. "It delivered" kept being re-derived locally, and every copy silently
  assumed a repository — call the shared function. (D-030)
- Price a turn by `turnsAllowed`: a cut-off run reports `turnsAllowed + 1` and
  nothing more, and a quote may never come in under the turns it has already
  decided to grant. (D-022, D-025, D-026)
- "Ran out of turns" does not mean "needed more turns" — for a close-out or a
  compile it is the ordinary ending. When a run is short, look at what it spends
  them on before granting more. (D-015, D-025)
- The user is never billed above the quote, and work that cost money and failed
  is absorbed. (D-012, D-021)
- Generated instruction is executable: preview before installing, and make a
  tool prove its own output. (D-011, D-021)
- Mutation-test after committing — `git checkout <file>` destroyed an hour of
  uncommitted work. (D-021)
