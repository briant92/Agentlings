# Agentlings — working rules

Imported by `CLAUDE.md`, so everything here is in context every session. The
behavioral base lives there alone; this is the project half, split out on
2026-08-01 (D-038) so the two can be read and changed independently.

## Ground rules

- IMPORTANT: This project is completely separate from the maintainer's other
  project. Account-level connectors visible in sessions here (Supabase, Gmail,
  Calendar, Carta, Vercel) reach **that** project's resources — NEVER read from
  or write to them for Agentlings work. The Supabase connector is the sharp one:
  it is account-scoped, so `execute_sql` and `apply_migration` can hit any
  project in the account, the other project included.
  Agentlings owns its own resources instead, and reaches them the way every
  connection in this app does — a key in `.env`, never a connector (D-078).
  **Agentlings has no cloud account of its own** (D-174): the Supabase project
  and the Vercel project stood up on 2026-08-12 were deleted unused, so there
  is no hosted anything to reach and no Supabase call is ever correct here.
  **The app runs on this machine.** Hosting was declined on measurement
  (D-169) — repo work, the folder organizer, the knowledge store and OCR are
  all bound to the local disk or to Windows, so a hosted server is a smaller
  product. **Phone access is done and did not need hosting** (D-175): a
  private tailnet reaches this machine, the app is unchanged and still local.
  So the only live reopen trigger left is a second person needing access —
  wanting the horde on a phone is no longer one.
- Architectural choices (language, engine, framework, storage) extend CLAUDE.md
  rule 1:
  present 2–3 options with a recommendation, wait for the decision, then
  append an entry to `DECISIONS.md`.
- Keep this file lean: when a placeholder becomes real, replace it and delete
  stale lines. It is resident in every session, so a line that no longer earns
  its place is costing something.

## Environment

- Windows 11; PowerShell is the primary shell. Prefer cross-platform tooling.
- The repo lives at `C:\Users\MSI\Dev\Agentlings` — **outside OneDrive since
  2026-08-12 (D-166)**, which closed the two incident classes it caused:
  replayed edits restarting the server minutes after the fact and killing paid
  sessions (D-140), and a 100%-CPU sync grind that failed 15 tests by
  starvation alone. No pausing, no junction, no exclusion hunt is needed any
  more; a path in these notes that still says OneDrive is stale.
- Secrets go in `.env` (gitignored) — never in code and never in this file.
- **Where an install keeps things is one call** (D-270): `installPaths()` in
  `server/src/installpaths.ts`. `AGENTLINGS_HOME` moves the operator's half —
  `.env`, `.agentlings/`, `Artwork/` — and never roles, skills or the catalog;
  unset, as on this machine, everything is exactly where it has always been.
  No module of an install may derive those paths itself. The one exception is
  `server/scripts/dev-logged.mjs`, which launches tsx and so cannot import a
  `.ts` module; `dev-logged.test.ts` spawns it to pin the two together. The
  hand-run `scripts/backfill-*` and `scripts/prove-*` tools are outside this.
- **No password, no public interface** (D-271): `listenPolicy()` in
  `server/src/session.ts` decides whether this install may listen at all.
  `AGENTLINGS_BIND` names the interface (default loopback) and the port comes
  from `PORT`, or `AGENTLINGS_PORT` when both are set. Bind anything but
  loopback without `AGENTLINGS_PASSWORD` and the server exits with the reason
  as its one line. Unset, as on this machine, it is `127.0.0.1:4600` exactly as
  before. Boot must call it **after** `process.loadEnvFile` — the password may
  live in `.env`. `listenPort()` beside it is the *only* answer to "what port
  is this install on": the runner and every tool door build their loopback URLs
  from it, and the `SERVER_PORT` constant they used to read is gone.
- **One origin** (D-272): the server serves the built web bundle from its own
  port. `bundleFile()` in `server/src/bundle.ts` decides what the bundle
  answers; `installPaths().webDistDir` is where it looks, on the product side.
  It runs **in front of the gate** — the sign-in screen is part of the bundle,
  so a gated shell would be a refusal with nowhere to act on it — and it
  refuses `/api`, `/internal` and `/ws` by name, so the operator's data is
  gated exactly as before. With no bundle built it answers nothing, which is
  why `npm run dev` and `npm run serve` are unchanged.
- **The environment beats the secrets file.** `process.loadEnvFile` does not
  overwrite a name already in `process.env` (measured, D-270), so a variable
  set by the host wins over the same name in `.env` at the next restart — even
  one pasted into Settings, which works until then.

## Commands

- Setup: `npm install`; for the real executor copy `.env.example` → `.env`
  and set one auth option (see SPEC.md M1)
- Run dev: `npm run dev` (web on http://localhost:5173, API/WS on :4600)
- Run stable: `npm run serve` — same server and log, **no file watching**, so
  a source edit or a OneDrive echo cannot restart it mid-session (D-140).
  Drive the app with this; use `dev` only while changing server code. Under
  `serve` a server that dies after living a minute is started again by the
  launcher, 5 s doubling to 5 min (D-284); one that dies at boot stops with
  its reason. Nothing announces a restart but `server.log`.
- Run on one port: `npm run build`, then the server alone — the API port
  serves the title screen too (D-272). This is what a container does; nobody
  here needs it, and `dev`/`serve` are unaffected by whether `web/dist` exists.
- Run on the phone: `tailscale serve --bg 5173`, then `tailscale serve status`
  for the URL — use the MagicDNS name, not the `100.x` IP (D-175). Never
  `tailscale funnel`: the API has no auth and funnel is the public-internet
  sibling of the same command.
- Coverage benchmark: `npm run bench:coverage -- --onet <dir>` over a
  downloaded O*NET text release (fixtures alone with no flags; D-230)
- Voice notes: `npm run voice:install` once — fetches the Whisper model
  (241 MB) into `.agentlings/models/` and proves it runs; until then a note
  that arrives says *the transcriber is not installed* at the desk (D-265)
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
- **A push to `main` is a deploy, and not only here.** The reference install
  rebuilds from `main` on every push — measured 2026-08-28, deployment
  `bb1c8b7f` of `ed5e622`, SUCCESS in 61 s — and so does **every install a
  stranger deployed from the template**, which tracks `main` rather than a
  pinned commit (D-276); two were live on other accounts when that was first
  measured (D-280). One push therefore changes the reference install, what a
  visitor clicking *Deploy* receives, **and software already running for people
  who cannot be contacted.** That is accepted rather than pinned to a release
  branch (D-280) — it ships like any other live app — which is what makes the
  rest of this rule load-bearing: say so when offering a push, and never push a
  container build that has not been typechecked and tested.

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
