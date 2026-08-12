# Agentlings — working rules

Imported by `CLAUDE.md`, so everything here is in context every session. The
behavioral base lives there alone; this is the project half, split out on
2026-08-01 (D-038) so the two can be read and changed independently.

## Ground rules

- IMPORTANT: This project is completely separate from the IGPL Family Office
  project. Account-level connectors visible in sessions here (Supabase, Gmail,
  Calendar, Carta, Vercel) reach **that** project's resources — NEVER read from
  or write to them for Agentlings work. The Supabase connector is the sharp one:
  it is account-scoped, so `execute_sql` and `apply_migration` can hit any
  project in the account, Family Office included.
  Agentlings owns its own resources instead, and reaches them the way every
  connection in this app does — a key in `.env`, never a connector (D-078).
  Live since 2026-08-12 (D-165): Supabase org **Agentlings** on the Free plan,
  project **Agentlings**, region East US (North Virginia), Data API off and
  automatic RLS on; and Vercel project **agentlings-web** on the personal Hobby
  scope, serving the web client only at `agentlings-web.vercel.app` — the
  server cannot go there and goes to Railway (the numbers are in D-165).
- Architectural choices (language, engine, framework, storage) extend CLAUDE.md
  rule 1:
  present 2–3 options with a recommendation, wait for the decision, then
  append an entry to `DECISIONS.md`.
- Keep this file lean: when a placeholder becomes real, replace it and delete
  stale lines. It is resident in every session, so a line that no longer earns
  its place is costing something.

## Environment

- Windows 11; PowerShell is the primary shell. Prefer cross-platform tooling.
- This folder lives inside OneDrive (`...\OneDrive\Escritorio\Agentlings`),
  and consumer OneDrive has **no** per-folder exclusion setting — the
  "Exclude files" switch an earlier version of this line pointed at is an
  enterprise GPO, and was hunted for and not found (2026-08-10). OneDrive
  has now caused two real incidents: replayed edits restarting the server
  minutes later (D-140) and a 100%-CPU sync grind over worktree copies
  that failed 15 tests by starvation alone. The workable mitigations, in
  order: keep `.claude\worktrees` OUT of the synced tree via a junction
  (`mklink /J` to somewhere under `%LOCALAPPDATA%` — OneDrive does not
  traverse reparse points, though it may nag about them), pause OneDrive
  during heavy sessions, or move the repo out of OneDrive entirely — the
  clean fix, but a planned migration: level `repoPath`s and the session
  memory directory are keyed to the current absolute path.
- Secrets go in `.env` (gitignored) — never in code and never in this file.

## Commands

- Setup: `npm install`; for the real executor copy `.env.example` → `.env`
  and set one auth option (see SPEC.md M1)
- Run dev: `npm run dev` (web on http://localhost:5173, API/WS on :4600)
- Run stable: `npm run serve` — same server and log, **no file watching**, so
  a source edit or a OneDrive echo cannot restart it mid-session (D-140).
  Drive the app with this; use `dev` only while changing server code.
- Test: `npm test`
- Lint / typecheck: `npm run typecheck`

## Code style & conventions

- TypeScript everywhere, `strict` on, ESM (`"type": "module"`).
- npm workspaces: `packages/shared` (domain types), `server` (Node + Hono +
  ws; runs TS directly via tsx, no build step), `web` (Vite + React + PixiJS).
- Server state is authoritative; the web client only renders it.

## Workflow

- Definition of done (extends CLAUDE.md rule 4): show the evidence — test output,
  command results — don't just assert success.
- Commit early and often with descriptive messages.

## Decision log

Every resolved question, with the evidence that settled it, lives in
`DECISIONS.md`, newest last. Read it before reopening anything settled, and
cite the entry ID (`D-017`) rather than a title or a line number. Do not
`@`-import it; it is meant to be opened on demand, not loaded on every turn.
Its own **By theme** index, next to its Contents, is the way in when you know
the subject but not the ID.

New entries append with the next ID, and the same edit adds them to both
indexes. An entry is a decision plus what proved it — length is whatever the
evidence takes, not one line.

## Capability surface

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

## Hard-won rules

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
