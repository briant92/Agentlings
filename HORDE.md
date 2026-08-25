# The Hireable Horde — the expansion board

The open board for the coverage-and-capability line. Opened on demand, never
imported — the same shape as `SPATIAL.md` and `RECONCILE.md` before it.

**Wave 0 is complete and nothing is owed. Wave 2 is open and three of its four
parts are done** — the `http` transport (D-243), business-system doors,
answered by letting users add any MCP server themselves (D-244) with four
verified starting points (D-245), and **event triggers, built as D-248**
together with the one-reply half of Wave 3 it pulled forward: mail arriving
fires a schedule, and the job may answer one threaded reply through the
ordinary outbox, always reviewed. **§4 is the pick-up point.** What remains
there is browser acting tools, which are last deliberately and for a reason
worth reading before starting them — and D-248's own owed items: a restart
and its live proof, the trigger-creation UI (mockup first), and the first
real rule on real mail.

**Picking this up cold:** read §1 for where the line stands, §4 for the
decision that opens the next piece, and **§4b for how the machine was left and
how to re-check any claim on this board**. Everything through D-245 is
committed and pushed; the last commit was `14a894f`.

**One thing the numbers here do not say.** Everything from D-241 onward is
*capability* — a gate, three seams closed, a transport, a way to add
connections. None of it has been exercised on real work, and the headline is
unmoved at 5–10 of 922 because reach, not machinery, is what moves it. This
board said the cheapest next step was to add one real connection and give the
horde a real job through it.

**That step was taken and it went somewhere else — see D-246.** Asked which
system, Brian had none in mind, so the job history was read backwards instead:
446 prompts, and *accounting* is asked for four times in seven days and served
none of them. Then the connection premise died on a fact — the books are Excel
files, and there is no MCP server for a spreadsheet. The real blocker was a
seam: a schedule carried a prompt and a channel and nothing else, so recurring
work could only reach what was ambient. Schedules can now carry files. **The
headline is still 5–10 of 922**, because that counts duty coverage and plumbing
adds no duties — a different trade, recorded as a different trade. The UI landed and is proven
too (16/16). **A bookkeeper trade was then declined on measurement — D-247:**
all 16 real reconciliation runs already routed to `analyst`, which already
covers 13 of the 15 duties it takes on that occupation, and 9 of the 13 gaps
are policy boundaries and closed doors no role file touches. The method went
into `analyst` instead. What is still owed for *"I need an accountant"* is the
part no plumbing reaches: **the money duties are a deliberate boundary, Wave 4,
not a gap** — and whether that method actually improves a run is unmeasured.

Written 2026-08-24, at `ddbd218`; updated through D-245. The line so far is
D-235 → D-245; the plan it
implements is the artifact *The Hireable Horde*
(https://claude.ai/code/artifact/3b0e5728-aec3-4765-bd68-d3cc1c839c41), with
the measurement behind it in *How Far Can the Horde Go*
(https://claude.ai/code/artifact/66dc4321-39d6-4018-b097-336fad285a76).

---

## 1. Where the line stands

| | |
|---|---|
| **Headline** | **Hireable positions: 5–10 of 922** — `npm run bench:coverage` leads with it |
| Coverage | 16 % covered / 23 % partial / 61 % uncovered of 18,797 O*NET duties |
| Calibration | 52/58 (90 %) against the hand grades, both overclaim cells empty |
| Intake | 53/54, 0 misses |
| Suites | server 2,198 across 92 files · web 333 · typecheck clean |
| Gate | **ARMED** — `AGENTLINGS_PASSWORD` set in `.env`; comment it out and restart to disarm |

Everything below is committed and pushed. Nothing is in flight.

- **D-235** — four trades hired off the benchmark's own clusters: `operations`,
  `logistics`, `planner`, `security`, one POWERS entry each. No boundary moved.
- **D-236** — phrases on four existing powers. **+53 duties**, against D-235's
  +194 for comparable effort: *naming is a rung with a top*, now measured. The
  structural floor (`thin()`'s top-one role check) is named and **deliberately
  left alone** — it earns its own entry with its own before-and-after.
- **D-237** — the scoreboard. Counts only duties whose grade rests on recorded
  evidence; **partial-on-`lexical` never counts**, which corrected the plan's
  own definition. Its first run caught a false positive in itself.
- **D-238** — the four trades **proven on real paid work**. Every refusal held.
  `security` was cut by a ten-minute wall its role file never overrode.
- **D-239** — the cross-origin hole **the crew found in us**, closed on both
  surfaces. Not authentication; shipped ahead of Wave 0 because it needed no
  credential decided.
- **D-240** — D-239 proven live (946 KB of level state to any website → zero);
  the `security` re-run completing at 24 turns; 7 advisories → 4.
- **D-241** — **Wave 0's credential**: a password for an `HttpOnly` cookie,
  chosen by the socket rather than by taste. Off until `.env` arms it. Proven
  live across two restarts. With D-242, 41 live checks in all.
- **D-242** — **the security ledger closed**: the `.session.json` seam fixed
  over **stdin**, a six-try login lockout, and one board item struck as
  something that was never a task. Wave 2 unblocked.
- **D-243** — **Wave 2 opens**: `transport: http`, a remote MCP server over
  streamable HTTP. Proven 6/6 against a real MCP server. Its own correction is
  attached: it does **not** subsume accounting, which is `stdio`.
- **D-244** — **the catalog stops being the ceiling**: Settings can add **any**
  MCP server, stdio or http, with its tool list read from the server rather
  than typed. Not the vendor question I was asking — the reframe was that ANY
  user should reach the system they need. Proven live, 24 checks: 17 through
  the API against two real MCP servers, 7 through the real Settings form.
- **D-245** — **suggestions, not catalog entries**: four starting points (Xero,
  Notion, Sentry, Stripe) that *fill the form* rather than ship as connections,
  because we have never authenticated to any of them. Every shape read from a
  primary source and dated; OAuth-only servers excluded because our transports
  carry a static credential; **three of the four are `stdio`**. Proven live
  15/15 — including that choosing a chip saves nothing.

---

## 2. Owed before anything else in its wave — **NOTHING**

Both items that stood here are closed.

- ~~The `.session.json` seam~~ — **fixed in D-242.** `toMcpServers` emits
  `${NAME}` placeholders and the values reach the runner on **stdin**. Note for
  anyone reading the old plan: its prescribed fix — *resolve them in the runner
  from the env it was handed* — **does not work**, because `launderedEnv`
  strips exactly those names (D-217) and a `Bash` child inherits the runner's
  environment anyway. **Wave 2 is unblocked.**
- ~~A re-read of the four trades' cost shape~~ — **struck, it was never a
  task.** The ledger holds one run each (operations 14t/$0.74, logistics
  4t/$0.49, planner 17t/$1.42, security 24t/$1.58 plus the cut $0 run). One run
  is not a measurement and no scheduling makes it one: that data arrives by
  *using* the app. A board item that cannot be worked reads as debt.

---

## 3. Wave 0 — API authentication · **DONE AND PROVEN LIVE**

**M0 was answered on 2026-08-24: option B, the password → `HttpOnly` cookie,
and W0.5 is "leave `/internal/*` uncredentialed". Recorded as D-241.** All
eleven tasks are done, and **the gate is ARMED** — `AGENTLINGS_PASSWORD` is set
in `.env` and the server has been restarted on it. §3.1–§3.3 below are kept as
written, because the reasoning is what a later session will want to re-read.

Proven on the restarted server with the queue empty (R-07):

```
node scripts/prove-wave0.mjs        # 16/16 — the HTTP and socket surfaces
node scripts/prove-wave0-ui.mjs     # 17/17 — the real app, headless Edge
```

The headline as one number: **an ungated `/ws` handshake is closed 4401 with 0
bytes where the signed-in one is handed 580,561.** D-239 was re-checked rather
than assumed — a hostile origin still gets 4403 on the socket and **403, not
401**, on a POST, which also proves the order.

**Both of Wave 0's debts are now closed (D-242), and nothing is owed:**

- **The gate-OFF live run happened** — 5/5, on its own restart. With the
  password commented out every probe answers exactly as it did before Wave 0,
  and D-239 still fires 4403, which shows the origin check is independent of
  the gate rather than riding on it.
- **`POST /api/session` is rate limited** — six tries, five minutes, proven
  live as `401,401,401,401,401,401,429`. The right password is refused 429 too,
  so a locked door is not an oracle — **and it reopens on its own at ~301 s**
  against a 300,000 ms window, which is the half a unit test cannot reach.
- **The lockout probe is opt-in** (`--lockout`) because proving it locks the
  door for five minutes. A restart clears it.

---

Planned by the crew's own `planner` on 2026-08-24 (job `95f4f5eb`, Training
Ground) and condensed here because **that sandbox is gitignored and will not
survive a sweep**. Five milestones, eleven tasks; the full 19.8 KB plan,
including estimates with their basis and §7's open questions, is at
`.agentlings/levels/training-ground/jobs/95f4f5eb/RESULT.md` while it lasts.

### 3.1 The decision that gates everything (M0) — Brian's

| Option | `/api/*` | `/ws` | Note |
|---|---|---|---|
| **A** — shared secret, `Authorization: Bearer` | trivial | **needs a second scheme** — a browser cannot set a header on a handshake | the secret reaches the browser anyway, so it lands in localStorage |
| **B** — password → `HttpOnly` session cookie **(planner's recommendation)** | one middleware | **free** — cookies ride the upgrade | adds a login screen; brings CSRF (R-03) and cookie-flag friction across three origins (R-04) |
| **C** — loopback-exempt, token only off-loopback | conditional | conditional | leaves `/internal/*` untouched, but "is this loopback" is a property a proxy can lie about |

**Why this is not a free choice:** `web/src/useWorld.ts:36` opens a bare
`new WebSocket(...)`, and the world view is socket-fed — so a Wave 0 that gates
HTTP and leaves the socket open is *worse than none*. **B is the only option
under which the socket needs no special case.** Recommendation, not a decision.

### 3.2 The work, once M0 is answered

| | Task | Depends on |
|---|---|---|
| W0.1 | Resolve the `auth.ts` name collision (it is the executor's auth) | — |
| W0.2 | **Pure gate module + tests** — `server/src/session.ts`; must be separate because `index.ts` calls `serve()` at import, so importing it in a test starts a listener | M0, W0.1 |
| W0.3 | Mount on `/api/*` with an exemption list (OAuth callback, login) | W0.2 |
| W0.4 | Login/logout routes; the secret in `.env` like every other credential (D-076/D-078) | W0.2 |
| W0.5 | **`/internal/*` policy** — the wide one, because it is a design call (R-01) | M0 |
| W0.6 | **Gate the WebSocket**, distinct close code, reconnect handled | W0.3 |
| W0.7 | Web client: login screen, 401 handling; one non-`api()` call site (`Inbox.tsx:70`) | W0.3, W0.4 |
| W0.8 | Fix in-tree non-browser callers (two reconcile fixtures) | W0.3 |
| W0.9 | Prove dev **and** tailnet origins | W0.7 |
| W0.10 | Live run on a restarted server | W0.6–W0.8 |
| W0.11 | Record it — entry, `.env.example`, `AGENTLING.md` port table | W0.10 |

**Critical path:** M0 → W0.2 → W0.3 → W0.6 → W0.10 → W0.11.

### 3.3 The risks that change what gets built

- **R-01 (M/H) — a server-wide token handed to the runner re-opens what
  `/internal/*` exists to close.** The session is an LLM in a sandbox; anything
  in its environment it can read. Never give it the shared secret: exempt
  `/internal/*` on loopback with a comment saying why, or mint per-session
  tokens scoped to the prefix and expiring with the job.
- **R-02 (H/H) — the socket gets forgotten**, because header auth makes it a
  special case and special cases get deferred. Choosing B removes the trigger.
- **R-03 (M/H) — CSRF arrives with the cookie.** `SameSite=Strict` +
  `HttpOnly`, plus the same-origin check **already shipped in D-239**.
- **R-04 (H/M) — cookie flags break one of three origins**: Vite dev, direct
  `:4600`, and the `.ts.net` name. Set `Secure` from the request's own
  protocol; W0.9 exists to catch exactly this.
- **R-05 (M/M) — a route is missed** among ~90 registrations. Mount by prefix,
  and add a test that enumerates routes so a *future* one is caught too.
- **R-06 (M/M) — locking yourself out of the Google OAuth loop.** The callback
  carries no credential; exempt it. Its `state` check is already in place.
- **R-07 (M/H) — editing server source while jobs run kills sessions.** Land
  the gate with the queue empty; "restarted, then proven" is the bar.
- **R-09 (L/H) — Wave 0 read as permission to relax the tailnet rule.** It is
  not. **The loopback bind and `serve`-never-`funnel` (D-127, D-175) are
  unchanged by Wave 0**, and the entry must say so.

---

## 4. Waves 2–6 — each starts with a decision, not a commit

Every one supersedes something recorded, so none of them begins in code. In the
plan's order, with what each reverses:

| Wave | What it opens | Supersedes |
|---|---|---|
| 2 | ~~Event triggers~~ **done, D-248**; ~~HTTP MCP transport~~ **done, D-243**; business-system doors (mostly catalog now); browser acting tools **(ranked last — see below)** | extends D-103; D-053/D-035 for the browser half |
| 3 | Two-way conversation — **the one-reply half built in D-248** (a mail-triggered job may answer one threaded reply, reviewed, never auto-sent); anything past that is still open | D-075's *not-a-chat* clause only |
| 4 | Deploy / publish / file; e-signature; then money in three steps | D-075's *not-an-actor*; D-229's signing half; **D-219 by its own reopen clause** |
| 5 | Media, voice, CAD out | **D-204 when its own demand test passes** |
| 6 | Coordination — a manager trade | nothing: **D-197's bar is re-run on its named triggers** |

**Wave 2's remaining three, in the order they should be taken (D-243):**

1. **Event triggers — BUILT, D-248** (2026-08-24, commit `9e103bd` and the
   record commit after it). A schedule row carries a Gmail query instead of a
   cadence; the server polls with no LLM in the loop; the mail lands as
   `input/mail.txt`; three unconditional loop guards (`-from:me`, a
   once-per-message seen ring, a daily cap of 10 whose overflow never fires
   late). The Wave 3 pull-forward was decided WITH it, not backed into:
   `reply: true` threads one answer into the triggering conversation, the
   server supplying the thread from the job's own stamp, and `autoBlocker`
   excludes every mail-triggered job from standing approval. **Proven live
   the same evening** — 18/18 on both restarts, plus a quiet rule through a
   full mail-sweep interval; the first run's one ambiguous branch led to the
   zero-match 204 fix (the entry's attached correction). **The creation
   control is built** (commit `34a85d3`, after a mockup round Brian picked
   from): a fifth chip *when mail arrives* on the repeat row, the raw Gmail
   query, the sentence reading, D-246's live match line moved to mail, Start
   reading *Arm* — **proven live 19/19** in headless Edge on 2026-08-25
   (`prove-trigger-ui.mjs`: the sentence turns the chip on and is quoted
   back, the field stays empty, the live line answers amber for a rule
   matching nobody, Arm creates a real row and it is removed again).
   **Owed:** only the thing no fixture reaches — no rule has fired off a
   real mailbox yet; the first real rule (the bank's statement mail is the
   measured candidate) is the end-to-end proof.
2. **Business-system doors — ANSWERED by D-244 and D-245.** D-244 lets a user
   add any MCP server themselves rather than waiting for us to curate one, and
   D-245 seeds four verified starting points that fill the form. Still:
   **check the transport before assuming it is `http`** (D-243's correction,
   reinforced by D-245 — three of its four are `stdio`). Xero's official MCP
   server is **`stdio`** (`npx -y @xeroapi/xero-mcp-server@latest`, secrets in
   `env`), so the accounting side needs nothing D-243 added and works today.
   Remote `http` endpoints exist for Atlassian, HubSpot, Linear, Slack,
   Salesforce, Asana, Monday and similar — a real population, but dev/CRM
   rather than the ledger — and **most of them want OAuth 2.1, which is not
   built**; D-243 covers static credentials from `.env`. **The open question is
   which system**, and that depends on what Brian actually runs his business
   on.
3. **Browser acting tools — last, and deliberately.** `click`/`type`/`submit`
   is a session changing someone else's state with **no outbox and no
   approval**, which supersedes D-075's *not-an-actor* clause through a side
   door when Wave 4 is where acting belongs, behind the acts ledger. D-035 also
   *measured* the browser's value as lower than the case made for it.

The generalization the acting waves rest on — the **acts ledger** (D-075's
outbox made typed: compose → validate → review → replay → audit) and the
**authority matrix L0–L4** (D-082 generalized) — is designed in the plan
artifact and **not built**. Build it when a wave needs it, not before.

---

## 4b. The proof instruments, and the state of the machine

Every one of these is a **live** check against a running server, not a test.
They exist because this line's bar is "run it and see", and a later session
should re-run rather than trust the numbers written above.

```
node scripts/prove-wave0.mjs             # 16/16 — the gate, HTTP + socket
node scripts/prove-wave0.mjs --lockout   # + the login lockout (LOCKS THE DOOR 5 min)
node scripts/prove-wave0-ui.mjs          # 17/17 — the login screen, headless Edge
node scripts/prove-http-mcp.mjs          #  6/6  — the http transport, real MCP server
node scripts/prove-user-connections.mjs  # 17/17 — adding a connection, both transports
node scripts/prove-user-connections-ui.mjs #  7/7 — adding one through the real form
node scripts/prove-suggestions.mjs       # 15/15 — the suggestions, API and chips
node scripts/prove-standing.mjs          # 25/25 — a schedule carrying files (D-246)
node scripts/prove-standing-ui.mjs       # 16/16 — the work bar's control (D-246)
node scripts/prove-mail-trigger.mjs      # 18/18 — trigger routes, preview, the dueNow sweep hazard (D-248); ran clean on BOTH 2026-08-24 evening restarts
node scripts/prove-trigger-ui.mjs        # 19/19 — the fifth chip in the real work bar (D-248 control), headless Edge; arms a rule matching nobody and deletes it
```

Each refuses a server older than the thing it proves, so a stale server reads
as *"restart it first"* rather than as a failure. `prove-http-mcp` runs one
cheap model turn (~$0.15); the rest cost nothing. `prove-standing` takes about
three minutes of wall clock, nearly all of it waiting out two real cadences,
and its first version cost $0.38 because a crew guard passed by never
executing — it now fails closed and adds zero ledger rows.

**How the machine was left on 2026-08-24:**

- The **gate is armed** — `AGENTLINGS_PASSWORD` is set in `.env`, and the
  server was last restarted on it. Comment the line out and restart to disarm.
- `.agentlings/connections.json` is **empty**. Everything the proofs added was
  removed again; nothing a user added is waiting to be found.
- The server was **restarted twice on the evening of 2026-08-24** and now
  carries all of D-248 **plus the zero-match mail fix** (`5c9a736` — Gmail
  answers a zero-match list as a 204 with an empty body; without the fix
  every quiet trigger rule errored within two minutes, see D-248's attached
  correction). `prove-mail-trigger.mjs` ran 18/18 on both restarts — the
  second with the preview answering 200 — and a quiet rule then survived a
  full 130 s mail-sweep interval live: no error, nothing queued, level
  closed again.
- **Two ledger rows on a level called `d-246-standing-proof` are real spend
  ($0.38)** from a proof whose crew guard passed by never executing. The level
  is gone; the rows stay, because the ledger is not edited. They are not work.
- Nothing is in flight, and **nothing on this board is owed**.
- The one thing nobody has done: **give the horde a real job on real data
  through any of it.** Everything from D-241 on is proven against fixtures.

---

## 5. Standing facts a new session should not re-derive

- **Roles are read once at boot.** A role file edit — including a new trade —
  reaches nothing until the server restarts. Brian restarts it; a
  session-started server dies with the session host and can kill a paid run.
- **A role prompt's refusals are indexed as strongly as its offers.** *"never a
  live system"* pulled *"Query a live database"* to the security trade on the
  word `live` and cost a calibration point. Reword, don't argue with BM25.
- **A negative example only tests a rule if it would pass without it.** Three
  mutation passes in a row exposed the choice of fixture rather than the logic.
  And hash the file before and after: a `\n`-anchored replace on a CRLF file is
  a silent no-op (D-224, three sightings).
- **`.agentlings/` is gitignored.** Every job deliverable — including the plans
  and audits this board condenses — exists on disk only.
- The four trades are hired on **Training Ground**: Tam (operations), Rue
  (logistics), Ash (planner), Lux (security).

## 6. The artifacts behind this board

On disk only, under `.agentlings/levels/training-ground/jobs/<id>/`:

| Job | Trade | What it holds |
|---|---|---|
| `95f4f5eb` | planner | The full Wave 0 plan — estimates with their basis, §7's open questions |
| `f14fecd5` | security | The audit: every advisory traced to a call site, the `.session.json` seam |
| `99898724` | operations | An SOP for the mutation pass, marking each step `[recorded]` or `[inferred]` |
| `7788efaf` | logistics | Reorder points and the supplier comparison, with `reorder.mjs` kept beside it |
| `f73a5e6b` | security | The cut run, kept for the contrast: its `PENDING.md` names what a wall costs |
