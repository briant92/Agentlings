# The Hireable Horde — the expansion board

The open board for the coverage-and-capability line. Opened on demand, never
imported — the same shape as `SPATIAL.md` and `RECONCILE.md` before it.

**Re-grounded on 2026-08-25 (D-249–D-257).** The line is no longer a list of
waves scored by the hireable count; it is **fourteen GitHub issues, #7–#20,
in the order of §4**, scored by **real work under supervision** — a job on a
real level, promoted or auto-sent, with every refusal counted as demand. The
hireable count (5–10 of 922) stays as a *map* of where the crew cannot go; it
is not the score, because it recorded zero for the eight most useful things
built in the week before the re-grounding. **§4 is the pick-up point** — each
ticket is taken with `/implement #N` in a fresh session, and the ticket says
what it is blocked by.

**Picking this up cold:** read §1 for where the line stands, **§2 for the
three premises this board had wrong** (written where the wrong ones were),
§4 for the order and what is deliberately not built, and **§4b for how the
machine was left and how to re-check any claim here**. Everything through
D-257 is committed; the record commit is the one that carried this rewrite.

Written 2026-08-24 at `ddbd218`; rewritten 2026-08-25 for D-249. The plan it
began from is the artifact *The Hireable Horde*
(https://claude.ai/code/artifact/3b0e5728-aec3-4765-bd68-d3cc1c839c41), with
the measurement behind it in *How Far Can the Horde Go*
(https://claude.ai/code/artifact/66dc4321-39d6-4018-b097-336fad285a76). The
vocabulary is `CONTEXT.md`'s — *score*, *real level*, *standing authority*,
*act*, *door*, *channel*, *trigger rule* — and where this board and the
glossary disagree, the glossary is right.

---

## 1. Where the line stands

| | |
|---|---|
| **Score** | **Counted, and built to send.** Last full week (2026-08-17 to 23): **87 promoted, 0 auto-sent** on three real levels — hq 48, training-ground 26, home-chores 13 — 32 discarded, 3 failed, 0 awaiting, $146 spent, no refusal on a real level; `npm run ledger:report` leads with it (#12, D-260). Every verdict is stamped when and by whom from the next restart; the refusals file counts (#11, D-259); **the Monday send is built and proven live (#13, D-261; 31/31 on the 2026-08-25 restart)** — a `report: realwork` schedule row, $0, no model — and **HQ row `15548352` is armed**, Mondays 08:05: its first firing is 2026-08-31, approved by hand; the standing offer appears at the third (2026-09-14). Slice #21 closes when that first firing is approved |
| Map | Hireable positions 5–10 of 922 · 16 % covered / 23 % partial / 61 % uncovered of 18,797 O*NET duties · calibration 52/58 · intake 53/54 |
| Real work through what D-241+ built | Two mail rules armed on HQ against real senders; one reply threaded into a real Gmail conversation (D-248) |
| Suites | server 2,386 across 97 files · web 343 · typecheck clean (full run 2026-08-25, with #13) |
| Gate | **ARMED** — `AGENTLINGS_PASSWORD` set in `.env`; comment it out and restart to disarm |

Everything below is committed. Nothing is in flight.

- **D-235 – D-238** — four trades hired off the benchmark (`operations`,
  `logistics`, `planner`, `security`), phrases on four powers (+53 — naming
  is a rung with a top), the scoreboard, the four trades proven on real paid
  work. **+247 duties in two commits against the plan's ≈3,500** — see §2.
- **D-239 – D-242** — the cross-origin hole the crew found in us, closed on
  both surfaces and proven live; **Wave 0's credential** (password →
  `HttpOnly` cookie, chosen by the socket), armed; the `.session.json` seam
  fixed over stdin; the login lockout. 41 live checks in all.
- **D-243 – D-245** — the `http` transport; **any MCP server added by the
  user** with its tool list read from the server; suggestions that only
  fill the form (Xero, Notion, Sentry, Stripe — retiring under D-256; a
  fifth, Alpha Vantage, arrived with D-262).
- **D-246 – D-248** — a schedule carries **files** (folder + rule, read
  fresh each firing); no bookkeeper trade, on measurement; **mail arriving
  fires a schedule**, and the job may answer **one threaded reply** — proven
  end to end on real mail 2026-08-25.
- **D-249 – D-257** — the re-grounding: the score, the sensitive line, the
  wire file, credentials, channels, the trigger grant, supervised live
  acting, the catalog, the team. Decisions only; every one names its ticket.

---

## 2. The three premises this board had wrong

Written here because this board carried them — the inverted line in its own
§4, the other two condensed from the plan it implements. Each is the
record's own correction, not a reinterpretation.

**"A rule carries no tools, so a firing that needs a door has none."** —
Inverted (D-254). What decides a job's doors is `grantedTools`, and its
reading of an *omitted* list is **every enabled non-sending door**; neither
sweep passes `tools`. So every firing of every schedule and mail rule holds
**eight doors today** — `web`, `render`, `github`, `search`, `bls`,
`calendar`, `mail`, `browser` — and the UF job D-248 cited as having *"no web
door"* carries all eight in its own record (`aa1d5324`). The two rules armed
on HQ fire jobs that reach the web, GitHub, the calendar, Brian's mailbox and
a browser **with a third party's mail as the brief**. An empty list cannot
even say *none*. Fix: #8, #9, #10.

**The flywheel.** The plan's §8 — *perpetually live and in sync* — scheduled
`bench:coverage` and `ledger:report` weekly and had the hireable KPI *"re-read
weekly by the flywheel"*. **It was never built**: the seven schedule rows on
disk run neither instrument. And it would have turned on a number that scores
reach at zero. What replaces it is the weekly real-work block (#13), at $0
with no model in the loop.

**Wave 1's estimate.** ≈ +3,500 duties was the plan's figure; D-235 and D-236
delivered **+194 and +53 covered** (D-235's +402 partial beside it, discounted
by the entry itself as unverified word matches), and D-236 already called the estimate *"a ceiling
for a long programme, not a forecast for a week."* Fourteen times short on
the first wave, and this board kept steering by the same count until D-249.

---

## 3. Wave 0 — API authentication · DONE AND PROVEN LIVE

Option B (password → `HttpOnly` cookie) and *leave `/internal/*`
uncredentialed*, recorded as D-241; the ledger closed in D-242. The gate is
**armed**. Proven on the restarted server with the queue empty:

```
node scripts/prove-wave0.mjs        # 16/16 — the HTTP and socket surfaces
node scripts/prove-wave0-ui.mjs     # 17/17 — the real app, headless Edge
```

The headline as one number: **an ungated `/ws` handshake is closed 4401 with
0 bytes where the signed-in one is handed 580,561.** A hostile origin still
gets 4403 on the socket and **403, not 401**, on a POST, which proves the
order. The gate-OFF run happened (5/5), the lockout is proven
(`401×6, 429`, reopening at ~301 s) and is opt-in (`--lockout`) because it
locks the door for five minutes.

Two things a later session should not relearn from the planner's full plan
(`.agentlings/levels/training-ground/jobs/95f4f5eb/RESULT.md`, on disk only):
**B was the only option under which the socket needed no special case**
(`useWorld.ts` opens a bare `new WebSocket`, and a gate that left `/ws` open
would be worse than none); and **the loopback bind and `serve`-never-`funnel`
(D-127, D-175) are unchanged by Wave 0** — it is not permission to relax the
tailnet rule.

---

## 4. The fourteen tickets, in order

Every ticket is on github.com/briant92/Agentlings, labelled `ready-for-agent`,
with its blocked-by edges native. The order is the order to take them; a
ticket with no blocker can be taken any time after #7.

| # | Ticket | Decision | Blocked by |
|---|---|---|---|
| **#7** | **Record the re-grounding** — the nine entries, this board, the glossary and `docs/agents/` committed | D-249–D-257 | — |
| #8 | **Prefactor: a named grant means exactly that** — an empty list means *none* in `grantedTools`; every forwarding caller checked | D-254 | — |
| #9 | **A rule's firing holds only the doors it names** — rows carry `tools`, both sweeps pass them, legacy rows say so, the seven rows backfilled by identification, live proof on a rested level | D-254 | #8 |
| #10 | **Door chips on the work bar** for schedules and rules — none ticked, the reading says what the firing holds | D-254 | #9 |
| #11 | **The desk counts what it refuses** — one line per never-row or not-built capability, beside the ledger | D-249 | — |
| #12 | **The real-work block** — the resolved-by stamp; one pure function over ledger, jobs and refusals; `ledger:report` prints it | D-249 | #11 |
| #13 | **The score arrives on Monday** — `report: realwork` on a schedule row, $0, no model, lands in review, earns standing approval the ordinary way; one row armed on HQ. Built and proven live 31/31, D-261; HQ row `15548352` armed, first firing 2026-08-31 | D-249 | #9, #12 |
| #14 | **First real door: market data through the ordinary path** — one official MCP server through the *existing* form, one HQ job promoted; if the form cannot take it, that gap is the deliverable. Path proven live 8/8 with no code, D-262: Alpha Vantage's hosted server as a fifth D-245 chip, the key in a Bearer header; the HQ job waits on a free key (`prove-market-door.mjs`, second half) | D-256, D-262 | — |
| #15 | **The catalog gets wide** — registry browse that fills the form, the verified-here shelf, the D-245 chips retired | D-256 | — |
| #16 | **Supervised live acting** — `browser-act`, headed, allowlisted, hand-queued only, never standing | D-255 | #9 |
| #17 | **A voice note is a sentence** — Telegram audio transcribed on this machine, quoted back like any sentence | D-253 | — |
| #18 | **Buk, read-only** — a stdio adapter over the reads, whatever the key's scope; on the shelf | D-252 | #15 |
| #19 | **SII purchases and sales register, read-only** — certificate login, reads only; accept/claim excluded by name | D-252, D-250 | #15 |
| #20 | **The wire file** — a *nómina* composed here, payees checked against a Settings allowlist, authorised at the bank by hand; build when a batch is due | D-251 | — |

**Slice one is #21** — the spec *"the score arrives on Monday, and a rule
holds only the doors it names"* — with #8, #9, #11, #12, #13 as its
sub-issues. Later slices (the catalog #15/#18/#19, the browser #16) get their
own spec when reached.

### What the waves became

The plan's Waves 2–6 are not a list any more; here is where each went, so
nobody rebuilds one from the artifact.

- **Wave 2** (transport, doors, triggers, browser acting) — done through
  D-248 except the browser, which is #16 as *supervised* acting rather than a
  session acting alone.
- **Wave 3** (two-way conversation) — the one-reply half is built (D-248);
  the runtime is **not built**, see below.
- **Wave 4** (deploy / sign / money) — the wire file is #20 as a
  *deliverable*, D-219 standing; nothing else is opened.
- **Wave 5** (media) — transcription in, #17; generation waits, see below.
- **Wave 6** (a manager) — not built, D-257.

### Deliberately not built, and why

- **A conversation runtime (outreach).** No correspondent exists: every
  standing approval ever earned is to Brian's own Telegram, and two externals
  have ever been reached, one reviewed send each. A commitments policy would
  govern nobody. Reopen when a real counterparty needs a second exchange
  (D-253).
- **WhatsApp Business inbound.** Meta delivers inbound only to a webhook — a
  public endpoint, which D-127, D-169, D-174 and D-175 forbid; D-248 refused
  Gmail push on the same rule. Sending (D-081) stands (D-253).
- **Media generation.** Waits on the refusal block (#11) showing demand;
  D-204's test unchanged (D-253).
- **A manager trade.** D-197's economics failed at 2.8–3.2× spend; Brian is
  the manager. The reopen shape is a planner-only manager — proposes the
  week's standing instructions, never dispatches — and it too waits on the
  refusal block (D-257).
- **The acts ledger and the authority matrix.** The shape stands in the
  plan; built for the first act beyond send, which will be the SII's
  accept/claim of a DTE — the reason #19 exposes reads only (D-250).

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
node scripts/prove-suggestions.mjs       # 15/15 — the suggestions, API and chips (retire with #15)
node scripts/prove-standing.mjs          # 25/25 — a schedule carrying files (D-246)
node scripts/prove-standing-ui.mjs       # 16/16 — the work bar's control (D-246)
node scripts/prove-mail-trigger.mjs      # 18/18 — trigger routes, preview, the dueNow sweep hazard (D-248)
node scripts/prove-trigger-ui.mjs        # 28/28 — the fifth chip in the real work bar (D-248) and the door chips (#10, D-254), headless Edge; arms a rule matching nobody holding one door, reads it back, deletes it
npx tsx scripts/verify-reply-thread.mts hq aa1d5324   # THREADED — the approved reply's Gmail thread == the trigger's (D-248)
node scripts/prove-rule-doors.mjs        # 25/25 — a row's doors ride its firing: legacy/none/omitted/one door, $0 (#9, D-258)
npx tsx scripts/verify-tool-doors.mts training-ground c639d84a   # the monthly row's doors against its compiled tool, through findTool, repo flag both ways (D-258)
node scripts/prove-refusals.mjs          # 19/19 — the refusals file: Start, plan, rule armed, reply, Start-with-repeat, seven lines at $0 (#11, D-259)
npm run ledger:report                    # leads with the score: real work per real level, last full week, the block the Monday send composes (#12, D-260; #13, D-261) — the app's own stamp (`resolvedBy: 'app'`) is proven only by a standing approval sending on a restarted server
node scripts/prove-realwork.mjs          # 31/31 — a report row on a rested level: six refused shapes, one firing, the job read off disk (done, one telegram message, the block as body, $0, no door, nothing sent), the row deleted, zero ledger rows (#13, D-261)
node scripts/prove-market-door.mjs [<key>] #  8/8 keyless — the Alpha Vantage chip, the form's probe against the real server, nothing written; with a key: adds, switches on, one HQ job holding the door, its trail (#14, D-262)
node scripts/arm-realwork.mjs <level> telegram <chat id>   # arms the Monday report on a level (HQ has `15548352`, Mondays 08:05 — do not arm a second one there); reads the row back and prints its label (#13, D-261)
```

Each refuses a server older than the thing it proves, so a stale server reads
as *"restart it first"* rather than as a failure. `prove-http-mcp` runs one
cheap model turn (~$0.15); the rest cost nothing. `prove-standing` takes about
three minutes of wall clock, nearly all of it waiting out two real cadences,
and its first version cost $0.38 because a crew guard passed by never
executing — it now fails closed and adds zero ledger rows. **The UI
instruments click past the first-run tour** (`Tour.tsx` sits over the work
bar in a fresh headless profile and swallows the pointer); a new instrument
must do the same or its first real click is lost.

**How the machine was left on 2026-08-25:**

- The **gate is armed** — `AGENTLINGS_PASSWORD` is set in `.env`, and the
  server was last restarted on it (the evening of 2026-08-24, twice; it
  carries all of D-248 plus the zero-match mail fix `5c9a736`). Comment the
  line out and restart to disarm.
- `.agentlings/connections.json` is **empty**. Nothing a user added is
  waiting to be found.
- **Seven schedule rows exist** — six on HQ (`919a5247` weekly expenses mail,
  `bd651cfd` and `1e21feb3` the daily calendar and mail briefs, `c9bc102f`
  and `c4a97302` the two armed mail rules, `e4ad0624` the paused reply
  proof) and one on training-ground (`c639d84a`, the monthly indicators, the
  monthly indicators). **All seven are backfilled on disk (#9, D-258)** —
  `c639d84a` `web search bls`, `919a5247` `render`, `bd651cfd` `calendar`,
  `1e21feb3` `mail`, the three mail rules none — and hold exactly that on the
  server restarted 2026-08-25 (read back live, no legacy label). The
  training-ground row is **not** on the free tool tier and has not been
  since 2026-08-17: the level carries a repository, a firing takes it, and
  the compiled tool is `hasRepo: false`, so the router filters it out before
  doors are read (D-258) — its 2026-09-12 firing is a paid session whatever
  its doors, until that repo is detached or the tool recompiled.
- **The two real mail rules are the proof, not leftovers.** `c9bc102f` fires
  on `from:mensajeria@santander.cl` (a client's payment receipt, ~quarterly,
  next expected late September); `c4a97302` on
  `from:edelivery@netxinvestor.com` (Insigneo's monthly notice, ~1st–2nd).
  Each firing is a paid HQ job (~$0.25–0.40); neither sends. **Do not delete
  them.**
- **Two ledger rows on a level called `d-246-standing-proof` are real spend
  ($0.38)** from a proof whose crew guard passed by never executing. The level
  is gone; the rows stay, because the ledger is not edited. They are not work.
- The three Starbase title-screen files (`TitleScreen.tsx`, `styles.css`,
  `starbase-scene.jpg`) sit **unstaged** in the working tree by decision —
  the backdrop mockups were declined 2026-08-23 — and #7 left them so.
- The server was restarted 2026-08-25 on `e70c730` (#8 + #9 live); the #9
  proof passed 25/25 on it. Not run: the two sweep-level mutations, each
  needing a restart of its own (D-258).
- The resolved-by stamp (#12, D-260) reaches the running server only on
  the next restart; until then every verdict written still reads as a
  person's at its finish time. The one seam no unit test reaches is the
  auto-send path naming `'app'` — proven only by a standing approval
  sending on a restarted server, which is when to read `resolvedBy` back.
- Otherwise nothing is in flight.

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
  a silent no-op (D-224, **four sightings** — `DECISIONS.md` is CRLF on every
  line and a `grep -q $'\r'` probe reported it LF; count with `tr -cd '\r'`).
- **What a job reaches is answered by `grantedTools`, not by what a run said
  about itself** (D-254).
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
