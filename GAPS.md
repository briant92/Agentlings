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
- [ ] **G5 — The quote's three blind spots.** Attachments (+$0.83 measured on
      one 74KB file, T2·1) and per-level context weight (the ~5–8c per-call
      floor that pushed five predictions low the same way) are residuals. The
      third is not: a **whole job class priced wrong**. Authoring a level pack
      quoted 50c at *high* certainty from 51 samples and cost **$1.81** —
      3.6x over, 91% of the ceiling (D-110), because it was averaged against a
      pooled class whose members are mostly short. All three recorded in
      TRAINING.md's "What's open", all three deliberately waiting on more real
      traffic before code: one run is not a rate.
- [ ] **G6 — Robustness odds and ends.** The store trusts a junk embedded
      text layer over its own better OCR (Wave 5's "zo22" balance sheet —
      D-059's rule assumes any text layer beats OCR); the connection
      registry cannot express a hosted HTTP MCP server (`builtin | stdio`
      only), which binds the day a connection is somebody else's server; a
      job waits for its matched specialist while others idle (the §15 row
      that is a choice, not wiring).
