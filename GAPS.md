# Gaps — 2026-08-06 capability review

What separates the engine from a real-world problem-solution tool, as
diagnosed by the 2026-08-06 review (its doc-sync fixes are `a309766`).
Ordered by leverage. Tick a row when the capability is Live, and note the
entry ID that settled it.

This file is a working list, not a record, on `FINDINGS.md`'s precedent:
when every row is settled the substance lives in `DECISIONS.md` and this
file can go. It does not duplicate `AGENTLING.md` §15 — §15 is the full
capability roadmap; this is the short list of what matters most, in order.

- [x] **G1 — A recurrence timer.** Everything about the engine rewards
      recurring work — recipes → leash → tool, standing approval — yet every
      job is queued by hand: T5 waits for a human to remember September, and
      the padel reminder cannot exist as a weekly fact. The single biggest
      gap between "an engine that can" and "a tool that does".
      **Done 2026-08-06 — D-103.** `schedules.ts` plus a 30-second sweep
      firing through `/work`'s own glue; created on the intake's repeat row,
      managed in the backoffice, downtime collapsing to one catch-up firing.
      First live firing deliberately left to T5's September cadence, or any
      earlier weekly Brian sets.
- [x] **G2 — Finish the acting surface.** Slack (the last of Tier 1, D-077),
      the calendar-event outbox type (rides the Google consent already
      given, D-080), GitHub writes as outbox entries. All three ride the
      proven outbox-replayed-at-approval machinery — wiring, not decisions.
      Tracked as §15 rows.
      **Done 2026-08-06 — D-104.** Three clients, one event block on the
      contract, scoped claim verbs; sends still happen only at Approve.
      Deliberately remaining: opening a PR (promote-flow work, its §15 row
      stays open), and each channel's first live firing awaits real use.
- [x] **G3 — Composite work.** One sentence is one job; real problems
      decompose into research → draft → send. M6's decomposition and
      pipelines are the tracked shape, and `continues:` already carries a
      sandbox forward, so the primitive exists. Parked deliberately until
      the crew does more real work — reopen when a real job wants a second
      stage, not before.
      **Done 2026-08-06 — D-105** (reopened by Brian; the demand was the
      engine's own economics — tiers are per job, so a composite sentence
      wore a session's price while its parts were each free). Explicit
      "then" splits, each step an ordinary job, files forward as input/,
      failed steps halt. Deliberately remaining: open-ended goal
      decomposition stays parked in M6 — inventing steps is a different
      trust question.
- [ ] **G4 — A data control plane.** §11 is honest about what does not
      exist: no retention policy, no redaction, no audit of what a session
      *fetched*, and the sandbox is an instruction rather than a jail.
      Acceptable for one user on localhost by decision; each becomes a
      blocker at the first second user, as does billing (D-012's spine has
      no invoice on purpose).
- [ ] **G5 — The quote's blind spots, one of three now closed.** Attachments
      (+$0.83 measured on one 74KB file, T2·1) and per-level context weight
      (the ~5–8c per-call floor that pushed five predictions low the same way)
      are residuals, still recorded in TRAINING.md's "What's open" and still
      deliberately waiting on more real traffic before code.
      ~~The third is not: a **whole job class priced wrong**.~~
      **Closed 2026-08-07 — D-112.** Authoring quoted 50c and 53c against
      $1.81 and $1.29 because `jobClass` is the role that *ran* the work and
      authoring ran as `worker`, pooled with every short session in the level.
      A `designer` role is the tag, so the same change that gave the work an
      agentling gave it a price class: the quote went from "About 54c — from
      53 jobs like it" to "Up to $2.00 — first time doing this". **Note what
      the fix cost**, because it is the lesson rather than a footnote: a class
      with no rate cannot convert a ceiling into turns, so the first designer
      run's budget fell from 40 turns to 10 and three runs were cut before the
      class had learnt its own rate (10 → 12 → 16, now 19). All three were
      absorbed, $3.9956, charged $0. **Tagging a class is not free — it is
      paid for in the first few runs under the new tag.**
- [ ] **G6 — Robustness odds and ends.** The store trusts a junk embedded
      text layer over its own better OCR (Wave 5's "zo22" balance sheet —
      D-059's rule assumes any text layer beats OCR) — now attested by the
      crew itself: the 2026-08-07 redo of the thin recall called it *"a
      defect, not a gap in the archive"* (D-118); the connection
      registry cannot express a hosted HTTP MCP server (`builtin | stdio`
      only), which binds the day a connection is somebody else's server; a
      job waits for its matched specialist while others idle (the §15 row
      that is a choice, not wiring). Joined 2026-08-07 by the sharpest row:
      **the server died twice with executor sessions live** (D-118), killing
      two runs and eating a third's meter — a third death followed on
      2026-08-08, and ~~nothing captures the dev server's stderr~~ **the
      capture now exists (D-126)**: `.agentlings/server.log` keeps stdout,
      stderr and stamped exits; the cause question stays open until a death
      is caught with it armed. Joined the same evening by a new row:
      ~~**a library install onto an existing role name silently overwrites the
      shipped file**~~ (D-126 — wshobson's architect landed on P1's; D-111 was
      this shape for packs and refused the arrival, roles took the other
      branch). **Closed 2026-08-11 — D-152**: refuse-or-identical at
      `registry.install`, the deliberate add-a-skill update passing
      `replace` — refuse-or-rename exactly as this row guessed.
- [x] **G7 — The server listens on every interface.** Found by the first
      architect run (D-125's amendment) and confirmed by netstat 2026-08-09:
      `serve({fetch, port})` at `index.ts:2881` passes no hostname, so
      `0.0.0.0:4600` and `[::]:4600` were LISTENING — every route plus the
      three unauthenticated `/internal/*` doors reachable from any device on
      any network this machine joins. §11's "localhost only" was an
      assumption, not a bind.
      **Done 2026-08-09 — D-127.** Brian chose pin over auth (no cross-device
      workflow exists): `hostname: '127.0.0.1'` on serve, vite's proxy dialing
      the address so ::1 resolution cannot miss it. Verified live: netstat
      shows loopback only, direct API and the proxied browser chain both 200.
- [ ] **G8 — The sandbox rule governs paths, not trust: nothing tells a
      session that what it reads is data.** `claude.ts:546` is the whole
      instruction — *"Work only inside the sandbox (your working directory).
      Never read or write paths outside it."* It bounds **where** a session may
      go and says nothing about **what to believe** once it gets there. Every
      byte a run takes in — the cloned repository, `fetch_page` output, a
      GitHub issue body, a knowledge-store passage — arrives as plain context
      with no marker separating "material to work on" from "instructions to
      you".
      **Half of this is already closed, and the closed half is the one that
      looked scariest.** `settingSources: []` (`agent-runner.mjs:226`) loads no
      setting source at all, so a cloned repo's `.claude/settings.json`,
      `.claude/rules/` and `CLAUDE.md` are **not** picked up as configuration —
      the same line §10 credits for keeping *your* settings out keeps the
      clone's out too. Skills are explicit (`config.skills`, copied by
      `claude.ts:880`), so a repo's own `.claude/skills/` is never mounted
      either.
      **What is left is content, not configuration.** A session that opens a
      file is reading text, and agent-native repositories now ship text
      *written to be found and obeyed* — `CLAUDE.md`, `AGENTS.md`,
      `.claude/rules/` — at predictable names in the root. Found while
      reviewing `LLMQuant/quant-mind` (2026-08-12); `ponytail`, `openclaw` and
      `shepherd` all ship the same furniture, so the base rate is rising rather
      than exotic. Downstream sits a session with `Bash` at your own
      permissions and `permissionMode: 'dontAsk'`, i.e. no interactive gate —
      and D-168 already measured that the allowlist bounds what the model is
      *offered*, not what a shell can *reach*.
      The asymmetry worth naming: §10's clone-plus-review guarantee protects
      **your tree from the session**. It does not protect **the session from
      the clone**. That is the same shape as G7 — a safety property that reads
      as enforcement and is actually an assumption.
      *Candidate close, cheap:* a second line beside `claude.ts:546` saying
      text inside the sandbox is material to work on and never instruction to
      the reader. Unproven — an instruction defending against instructions is
      exactly the kind of fix that wants a mutation test before it is believed,
      and a real measurement of whether it changes behaviour at all.
      **Measured 2026-08-15 — D-189, and the answer is that it happens.** Three
      runs against a planted throwaway repo, $0.84: a payload asking for
      `whoami` was refused *on the principle* ("content read during a task does
      not get to issue commands"); a payload asking for `npm test` output was
      refused on situational grounds only, and that run was a leaky test rather
      than a result; and a benign, applicable payload — append the files read to
      `AGENTS-LOG.md` — was **obeyed**, the session reasoning that the
      instruction "*does* apply" because the repo's own text said it covered
      read-only sessions. So the session sorts a clone's instructions by
      **applicability, not authority**. The path rule held in every run.
      The row stays open: there is now a reproducible obeyed case, so the
      candidate line finally has a mutation test available — but whatever comes
      of it is an instruction the model may weigh, not enforcement, and D-168
      already named per-job isolation as the only thing that would enforce it.
