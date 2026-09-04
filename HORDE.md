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

**Closed 2026-09-03 (D-281). The line that followed is the demand line
(D-283): Brian's own week, one issue per item, on the tracker — #41–#48 as
of 2026-09-04 — and not on this board.** Everything below is the record of
the line that ended.

| | |
|---|---|
| **Score** | **Counted, and built to send.** Last full week (2026-08-17 to 23): **87 promoted, 0 auto-sent** on three real levels — hq 48, training-ground 26, home-chores 13 — 32 discarded, 3 failed, 0 awaiting, $146 spent, no refusal on a real level; `npm run ledger:report` leads with it (#12, D-260). Every verdict is stamped when and by whom from the next restart; the refusals file counts (#11, D-259); **the Monday send is built and proven live (#13, D-261; 31/31 on the 2026-08-25 restart)** — a `report: realwork` schedule row, $0, no model — and **HQ row `15548352` is armed**, Mondays 08:05: its first firing is 2026-08-31, approved by hand; the standing offer appears at the third (2026-09-14). Slice #21 closes when that first firing is approved |
| Map | Hireable positions 5–10 of 922 · 16 % covered / 23 % partial / 61 % uncovered of 18,797 O*NET duties · calibration 52/58 · intake 53/54 |
| Real work through what D-241+ built | Two mail rules armed on HQ against real senders; one reply threaded into a real Gmail conversation (D-248) |
| Suites | server 2,627 across 104 files · web 363 · typecheck clean (full run 2026-08-26, with #22) |
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
  fill the form (Xero, Notion, Sentry, Stripe, and Alpha Vantage with
  D-262) — **retired by #15, D-263**, replaced by the registry browse and
  the verified-here shelf.
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

**#18, #19 and #20 were archived 2026-09-03 (D-281)** — closed as *not
planned*, `ready-for-agent` removed, because all three are code-complete
(re-proven 30/30, 33/33 and 43/43 that morning) and every box left on them is
owed by a person: a Buk tenant and read key, Brian's `.p12`, and a Banco de
Chile layout PDF behind a bot wall. Their rows below stand as written, each
closing comment names the trigger that revives it, and `gh issue reopen <n>`
brings one back whole. **The board is empty — the line has no open ticket.**

**#22 sits at the end of the table and was not one of the fourteen** — it was
opened later, off #11's own finding: the desk counted a refusal and said
nothing about it. A ticket added this way belongs here rather than in a new
section, because the table is what a cold session reads.

| # | Ticket | Decision | Blocked by |
|---|---|---|---|
| **#7** | **Record the re-grounding** — the nine entries, this board, the glossary and `docs/agents/` committed | D-249–D-257 | — |
| #8 | **Prefactor: a named grant means exactly that** — an empty list means *none* in `grantedTools`; every forwarding caller checked | D-254 | — |
| #9 | **A rule's firing holds only the doors it names** — rows carry `tools`, both sweeps pass them, legacy rows say so, the seven rows backfilled by identification, live proof on a rested level | D-254 | #8 |
| #10 | **Door chips on the work bar** for schedules and rules — none ticked, the reading says what the firing holds | D-254 | #9 |
| #11 | **The desk counts what it refuses** — one line per never-row or not-built capability, beside the ledger | D-249 | — |
| #12 | **The real-work block** — the resolved-by stamp; one pure function over ledger, jobs and refusals; `ledger:report` prints it | D-249 | #11 |
| #13 | **The score arrives on Monday** — `report: realwork` on a schedule row, $0, no model, lands in review, earns standing approval the ordinary way; one row armed on HQ. Built and proven live 31/31, D-261; HQ row `15548352` armed, first firing 2026-08-31 | D-249 | #9, #12 |
| #14 | **First real door: market data through the ordinary path** — one official MCP server through the *existing* form, one HQ job promoted; if the form cannot take it, that gap is the deliverable. Done with no code, D-262: Alpha Vantage's hosted server as a fifth D-245 chip, the key in a Bearer header, added by Brian through Settings; HQ job `0b9886dc` read live quotes through it (11 door calls, $1.11) and was promoted by hand (`prove-market-door.mjs` 8/8 both halves); issue closed | D-256, D-262 | — |
| #15 | **The catalog gets wide** — registry browse that fills the form, the verified-here shelf, the D-245 chips retired. Built, D-263: the browse over `registry.modelcontextprotocol.io` fills the form and saves nothing, what it cannot carry is passed over by name and the registry down is a named state; the shelf stamps `verifiedAt` and `source` at the add (Alpha Vantage backfilled by identification); the five chips and their test and proof deleted, the rules moved to `registry.test.ts`. Proven live: `prove-registry-fill.mts` 9/9 without a server (real registry, Brave's real server through the fill with the `.env` key), then on the restart `prove-user-connections.mjs` 28/28 and `-ui.mjs` 16/16; issue closed | D-256, D-263 | — |
| #16 | **Supervised live acting** — `browser-act`, headed, allowlisted, hand-queued only, never standing. Built, D-264: a `supervised` second connection carrying the twelve acts and the eight reads, off by default and never in the default grant — a job holds it only by naming it (the work bar's *watch* tick), a rule or schedule naming it refused by name (`validTools`), the chips never offering it; the allowlist and profile folder on the row (`PUT /api/settings/browser-act`); the runner launching a headed persistent Edge the person signed into, Playwright MCP attached over CDP with `--allowed-origins`, a `PreToolUse` hook refusing `browser_navigate` off the list by name on the trail, the context's `close` ending the run in one sentence. Proven live through the real runner 19/19 (`prove-browser-act-runner.mjs`: form filled and submitted $0.60, off-list navigate refused $0.31, closed window ended the run) and on the restarted server 24/24 (`prove-browser-act.mjs`: the rule refusals by name, HQ job `72f85086` filling and submitting the form $0.43, HQ job `edceccd3` refused on its trail $0.25); `72f85086` promoted by hand at review 2026-08-26 03:31 UTC, issue closed | D-255, D-264 | #9 |
| #17 | **A voice note is a sentence** — Telegram audio transcribed on this machine, quoted back like any sentence. Built, D-265: the bot polled every 15 s while telegram is on, the roster's notes fetched and read by `whisper-small` through transformers.js on the CPU (language detected first, silence gated by energy), each waiting above the work bar with its words or its reason; *Use* fills the box, the ordinary reading and Start apply, the audio and the transcript ride `input/`, the note is spent by the job. `npm run voice:install` is the one step (241 MB) and proves itself 4/4 on a known clip. Proven live on the restart 2026-08-26, `prove-voice.mjs` 24/24: Brian's real note `446455175` (10 s, en, read 21 s after it was sent: *"Hey guys, I need to know the next five schedules of the Premier League in England."*) listed at the desk with its words, queued job `6693cd7a` on a rested proof level with the audio (226,648 bytes, byte for byte) and the transcript in `input/`, the queued line naming the note, the note spent and refused a second time, $0; issue closed | D-253, D-265 | — |
| #18 | **Buk, read-only** — a stdio adapter over the reads, whatever the key's scope; on the shelf. Built, D-266: `scripts/buk-mcp.mts` with its whole mind in `server/src/buk.ts`, added through the D-244 form like any stdio server (`npx tsx <adapter> --tenant <subdomain>`, secret `BUK_API_KEY`), five reads and no sixth — `employees`, `active_employees`, `employee_plans`, `vacations_available`, `pay_stubs` — every path, parameter and date format taken off Buk's own unauthenticated Swagger contract (`demo.buk.cl/api/chile/es/api_docs`, 151 paths, read 2026-08-26) and re-checked against it live on every proof run. **A write is unrepresentable, not refused:** one request function, `GET` hard-coded, no body to give, five paths from one table — and Buk offers `POST` at two of those same addresses. The company-wide monthly *liquidaciones* listing is left out by name (Buk gates it behind *see sensitive information*; D-249's line). The stdio probe was taught to read the stderr it had piped since D-244 and listened to from nobody, so the adapter's three startup refusals reach the form instead of `Connection closed`. Review caught that the five paths were four and a wildcard — `..` as an employee built `/employees/../payroll_detail`, which every parser normalises to `/payroll_detail`, the family left out by name; the built URL is parsed and its path checked against the literal one now, and a redirect is refused rather than followed carrying a payroll token in a header only `Authorization` gets stripped from. Proven `npx tsx scripts/prove-buk-door.mts` **30/30** with no server, no account and no key, nothing written: the real probe spawning the real adapter for the five tools, the shelf's two stamps asserted by value, the three startup refusals by name, the five paths still `GET` in the live contract, and — through the real adapter over MCP at the **real** Buk — all five reads reaching Buk and refused there, an invented `create_employee` refused as *it reads only*, a wrong date format and a path-shaped employee each refused before the wire. **Owed: two boxes, not one** — one real HQ job reading a real payroll and promoted, *and* the add through the route and the form itself (`.agentlings/connections.json` is empty, no `buk` row exists; the add flow probes before it writes and the adapter refuses to start without a key). Both wait on a tenant and a read key in `.env`; the proof's own last line says NOT proven end to end until then | D-252, D-266 | #15 |
| #19 | **SII purchases and sales register, read-only** — certificate login, reads only; accept/claim excluded by name. Built, D-267: **the ticket's own premise was false**, and finding that out was most of the work — the client D-252 named is `@emisso/sii` (not `emisso-sii`, which is a 404), its only portal login types a *clave tributaria* into a headless browser, and its certificate half is `Not implemented` stubs end to end. So the login is this repo's own, on a measurement: SII's *Ingresar con Certificado Digital* posts to `herculesr.sii.cl`, which asks for a TLS client certificate in the handshake, and Node answers it with `https.Agent({ pfx, passphrase })` — **one request carrying the `.p12`**, cookies for every read after, no clave, no browser, no profile. `scripts/sii-mcp.mts` with its mind in `server/src/sii.ts`, added through the D-244 form (`npx tsx <adapter> --rut <rut>`, secrets `SII_CERT_PATH` and `SII_CERT_PASSWORD`), offering **three reads and no fourth** — the month's summary by document type, the compras, the ventas — each asked of one of the register's four sections, which is what *with their state* means. **Read-only cannot be argued from the method here** (SII answers reads over `POST`), so it is held by the table and measured on the wire: every tool driven through the real request path at a client that writes down every address it was asked for. Accept and claim excluded by name for D-250's acts ledger — and measured: every write `@emisso/sii@0.1.1` exports throws `Not implemented`, asserted by a test so the version that implements one arrives as a failure. The portal-endpoint fragility is the standing risk and, unlike Buk's, checkable against nothing: a reply that is not the register's JSON is called *the address may have moved* rather than read as an empty month. Proven `npx tsx scripts/prove-sii-door.mts` **33/33** with no server, no SII account and no certificate: five startup refusals by name, and at the **real SII** both refusals said as themselves — no certificate at all is `302 → errorp.html`, one SII does not accredit dies at the handshake with `unknown ca`. 18 mutations across `sii.ts` and the shared `doorreply.ts`, 18 caught. Review's catches taken, both axes finding the same one first: the redirect was refused on the login and then **followed** on the next request (no credential could leave — the jar scopes cookies to `sii.cl` — but the address was still the far end's choice; now a suffix-matched host check, with `sii.cl.evil.example.com` in the test); the fragility was named everywhere except the shelf row a person actually reads, so it is in the row's own description and §5 asserts it; the reply ceiling could go silently inert if `sii.data` is not where the rows are, and now says so; the expired-session retry went round its own seam through `session.refresh()`, which was the one path no test could reach; `clip` and `trimReply` had been written twice, so the mechanism is `doorreply.ts` and Buk's behaviour is unchanged byte-for-byte; the throwaway `.p12` was written twice too. **Owed, two boxes not one**: one real HQ job listing a month's received DTEs and promoted, AND the add through the route and the form — `.agentlings/connections.json` is empty, no `sii` row exists, and both wait on Brian's `.p12` and its password in `.env`, which this machine does not have | D-252, D-250, D-267 | #15 |
| #20 | **The wire file** — a *nómina* composed here, payees checked against a Settings allowlist, authorised at the bank by hand. Built, D-268: `server/src/nomina.ts` holds the whole of it — the contract, the RUT, the layout, the gate, the composer, the brief. **A run says who and how much; the allowlist says where.** `NOMINA.json` carries a RUT, an amount and the bank's paperwork and carries no account number, no bank code and no name-on-the-account — those come from the payee allowlist a person typed into Settings (`PUT /api/settings/wire`, `POST`/`DELETE .../wire/payees`), so the case where a run keeps an approved name and quietly changes the account number **does not exist**: it was never asked for an account. The verdict is **asked fresh, never stamped** — the queue keeps only the declaration, the card and Approve recompute against the list as it stands, so adding the payee and pressing Approve again is the whole fix with no re-run. The file is written **at Approve and nowhere else**, like the patch: until a person approves there is nothing to upload, which is what *refused whole* has to mean for a deliverable. **The ticket's third box moved, because Santander publishes nothing** — its Pagos Masivos page 403s a non-browser, no layout exists anywhere public, and the ERP vendors that generate one (Manager+'s SANTANDER8, Buk, Talana) document only *that* they build "la estructura requerida por el banco"; its layout is a template handed to the client inside Office Banking. So the format is **BCI's own published specification** (*Estructura Archivos — Pago de nómina en línea*, 5 pages, read 2026-08-26), thirteen columns with its maxima and its types, and Santander joins the column table the day Brian pastes its template. Things the specification said that a guess would have got wrong, each of which changed the code: both the factura and the orden de compra are obligatory for **PRV** and asked for by neither other type; four payment codes, not a free string; **column B is the account and column C the bank**; the delimiter is `;` or `|` and **nothing escapes either**, so a payee called `Norte;Sur` makes a well-formed fourteen-field line that is a *different payment*, refused; and **its own example line's RUT does not pass modulo-11** (`123455678;3`, and it checks to 5), so the proof reproduces the line byte for byte except the two RUT columns and says why. Four things it does not settle are chosen once and written down: `;`, **no padding** (maxima not widths, and its example pads column B to 17 where the max is 18), CRLF, and UTF-8 — the encoding is the one the first real upload will settle. **D-219 is measured, not asserted**: the proof walks 249 sources across server, web, scripts and packages for a payment-shaped path — and a canary proves that check can still fail. Proven `npx tsx scripts/prove-nomina.mts` **43/43** — no server, no bank, no money, nothing written outside a temp folder. 25 mutations of `nomina.ts`, 25 caught. Review's catches taken, both axes finding the same one first: the column bounds were asked only where the bytes are written, and `composeNomina` runs AFTER the outbox has been sent — so a 46-character payee name meant Approve answered 400 with the messages already gone, which is what the outbox block above it forbids; the gate asks the whole question now and a test drives four settings through both to prove they cannot disagree. Also: `nomina.txt` was not a reserved name, so a run could write a bank file itself carrying coordinates no allowlist ever saw (refused at the completion seam by name, not overwritten); the charge account preempted naming anybody, so in the shipped state every batch refused without ever naming a payee; `stampDelivered` never ran again, so the inbox counted `NOMINA.json` and never the composed file; the maxima were restated in four places; `payeeProblem`'s comment promised a check it did not do, and was also stricter than the bank (column B is *Alfanumérico* and it demanded digits); `amount` was bounded by `Number.isInteger`, true above 2^53 where the figure has already been rounded; the allowlist map was built twice behind two `!` assertions; and a dead `refusedCount` plus a `format` round-trip nobody asked for. **OWED, the ticket's fourth box**: one real batch composed here, uploaded at Santander and authorised by hand — it needs Brian's charge account, his real payees, the Office Banking template for the Santander column table and his token; the proof's last line says NOT proven end to end until then. **THE BANK IN ALL OF THE ABOVE IS WRONG (2026-09-03).** Brian has no Pagos Masivos at Santander; payroll goes through **Banco de Chile**. So *Santander publishes no layout → BCI's is implemented → Santander joins as a second column table* is a chain about an institution that is not in the picture, and the third box is **un-ticked**: `BCI_LAYOUT` is a correct implementation of a real published specification belonging to neither the assumed bank nor the used one. The architecture survives untouched, because it was built bank-independent on purpose. Banco de Chile appears to **publish** theirs — `PagosMasivosV4.pdf` on `portales.bancochile.cl`, publicly indexed, behind Incapsula (503 to curl, 403 to headless Edge, 503 to headed Edge, all tried) — so this needs a human browser, not a credential, and may need no capture trip at all | D-219, D-250, D-251, D-268 | — |
| #22 | **The desk says what it refuses** — the count of #11 read back at the bar, before Start. Built, D-269: `refusalRows` in `server/src/refusals.ts` turns the keys the meter already knows into what the desk says, `/work/plan` carries them, and the work bar paints one amber line per row under the plan — the desk's own lead-in (*this asks for a payment*), the job board's `BOUNDARIES.why` **verbatim** so the desk and the positions board are one string rather than two copies free to drift, and then **what the crew will do instead** (*It will draft the instruction for you to send.*), which is the desk's alone because the board is written about a duty and names no other side. **D-093's shape, in the UI's words**: Start is never disabled and one grey tail under the lot says *Start still works — the crew does the rest and says what it left to you*, said once however many rows, because a fact about the button is not a fourth warning; the test holds that tail to no word that reads as a block. The four not-built capabilities collapse onto the board's one `not-built` row and name their mediums once (*this asks for a video and an image*), and that row alone carries **no** offer — D-259's words are that no media is read or made, so a consolation sentence there would be the first untrue thing on the line. **A never-channel is deliberately not on this line** though the meter counts one: the ask card has stated that refusal since D-079, in the channel shelf's own words and with the channels that *would* carry it offered beside it, which a line cannot do — so the rule is written down, a never-channel is refused on the card and never on the line. Read from the **whole** sentence, exactly as the meter reads it at Start, so a split into steps cannot make the desk and the count disagree. Nothing is counted here (D-259). Mockup first, Brian's three calls taken: amber over grey and over a bordered block (the block borrows `.work-channel.arrested`'s dress, and that dress means *a press was stopped*), one tail over none and over per-row, the ask card over a second voice. **Review's catches taken, both axes finding the order claim first** — the doc said *"in the board's order"* while `CLAIMS` runs money/sign/act/people and `BOUNDARIES` runs money/people/act/sign, and the only order test used the one pair that cannot tell them apart; the ticket's own second half (*it will draft the instruction for you to send*) had been dropped, so the desk said less than the product does; the `why` lookup degraded to `''` where its neighbour asserted, which would have painted a lead-in with nothing after it — resolved at load now, and a row off the board **throws**; four further comments claimed more than the code did. **22 mutations across `refusals.ts` and `planLine.ts`, 21 caught, the twenty-second an equivalent mutant** — an earlier round of 16 had a real survivor, the load-time `throw` for a reading pointing off the board, which no test could reach (D-246 shape), and re-running it after each review round kept earning the re-run — two gaps after round two (`act`'s corrected offer was not pinned by value, so reverting it to the overclaiming sentence passed everything; the list joiner's one-medium branch was untested), and after round three all three reverted offers are caught. **Round three's real find was structural, not verbal**: one `does` per board row, applied to rows that are heterogeneous — `sign` reaches a lease AND a prescription, `act` a deploy AND a tax return, `people` a standup AND a delegation — so two rounds of rewording were the wrong fix twice. All four offers now say what the whole row can bear, and a table in the test names, per row, the fixture sentences each must survive. Server 2,627 passed, web 363 passed, typecheck clean. **PROVEN LIVE 2026-08-26, 21/21 all PASS** on Brian's restarted server, Start never pressed: the board's sentence byte for byte off coverage.ts, the two rows drawn in the order the route sent them, Start undisabled, ordinary work silent, the never-channel getting its ask card and no line, and refusals.jsonl unchanged at 904 bytes across a run made entirely of refusing sentences. **Issue #22 can close** | D-093, D-259, D-269 | #11 (done) |

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
- **Wave 5** (media) — transcription in, #17 (built, D-265); generation waits, see below.
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
  accept/claim of a DTE — the reason #19 exposes reads only (D-250). #19 is
  now built and that act has a real address waiting for it: `sendResultadoDte`
  and `sendAcuseRecibo` in `@emisso/sii`, both `Not implemented` stubs today,
  left out of `server/src/sii.ts` by name (D-267).

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
node scripts/prove-user-connections.mjs  # 28/28 — adding a connection, both transports (D-244); then the registry browse, the Brave fill connected with the .env key (spawns npx for real), the shelf's stamps on disk, removed (#15, D-263)
node scripts/prove-user-connections-ui.mjs # 16/16 — adding one through the real form; the shelf, a real registry search, a pick that saves nothing, the registry-down state said by name (#15, D-263). Leaves a `ui-proof` row — remove it in Settings or via DELETE /api/connections/ui-proof
npx tsx scripts/prove-registry-fill.mts  #  9/9  — no server needed: the REAL registry → Brave's fill → the form's validator → the REAL probe spawning it with BRAVE_API_KEY from .env, 8 tools; Alpha Vantage's SSE-only entry passed over by name; unreachable named (#15, D-263)
# prove-suggestions.mjs retired with the D-245 chips (#15, D-263); its rules live in server/src/registry.test.ts
node scripts/prove-standing.mjs          # 25/25 — a schedule carrying files (D-246)
node scripts/prove-standing-ui.mjs       # 16/16 — the work bar's control (D-246)
node scripts/prove-mail-trigger.mjs      # 18/18 — trigger routes, preview, the dueNow sweep hazard (D-248)
node scripts/prove-trigger-ui.mjs        # 28/28 — the fifth chip in the real work bar (D-248) and the door chips (#10, D-254), headless Edge; arms a rule matching nobody holding one door, reads it back, deletes it
npx tsx scripts/verify-reply-thread.mts hq aa1d5324   # THREADED — the approved reply's Gmail thread == the trigger's (D-248)
node scripts/prove-rule-doors.mjs        # 25/25 — a row's doors ride its firing: legacy/none/omitted/one door, $0 (#9, D-258)
npx tsx scripts/verify-tool-doors.mts training-ground c639d84a   # the monthly row's doors against its compiled tool, through findTool, repo flag both ways (D-258)
node scripts/prove-refusals.mjs          # 19/19 — the refusals file: Start, plan, rule armed, reply, Start-with-repeat, seven lines at $0 (#11, D-259)
node scripts/prove-refusal-ui.mjs        # 21/21 (2026-08-26) — the desk SAYING it (#22, D-269), headless Edge, Start never pressed: the money line under the plan with the reason read off coverage.ts and compared byte for byte, the offer beside it and absent from that reason, two rows and still ONE tail, Start not disabled throughout, an ordinary sentence with no line, a WhatsApp sentence with its ask card and NO line, and refusals.jsonl byte-identical before and after. Refuses a server older than #22 by name
npm run ledger:report                    # leads with the score: real work per real level, last full week, the block the Monday send composes (#12, D-260; #13, D-261) — the app's own stamp (`resolvedBy: 'app'`) is proven only by a standing approval sending on a restarted server
node scripts/prove-realwork.mjs          # 31/31 — a report row on a rested level: six refused shapes, one firing, the job read off disk (done, one telegram message, the block as body, $0, no door, nothing sent), the row deleted, zero ledger rows (#13, D-261)
node scripts/prove-market-door.mjs [<key>] #  8/8 keyless — the Alpha Vantage chip, the form's probe against the real server, nothing written; with a key: adds, switches on, one HQ job holding the door, its trail (#14, D-262)
npm run voice:install                    #  4/4  — no server needed: fetches whisper-small (241 MB) into .agentlings/models once, then proves it on this machine — silence is "nothing heard", fixtures/voice/jfk-4s.wav reads back its known words in ~2 s (#17, D-265)
npx tsx scripts/prove-buk-door.mts       # 30/30 — no server, no Buk account, no key, nothing written: the real probe spawning the real adapter for its five tools, the shelf's stamps by value, three startup refusals by name, the five paths re-read as GET in Buk's LIVE contract, and the real adapter over MCP at the REAL Buk — all five reads reaching Buk and refused there, an invented write refused, a wrong date format and a path-shaped employee refused before the wire. Prints the exact add-form values at the end (#18, D-266). What leaves on the wire (every read a GET, no body) is measured in server/src/buk.test.ts instead, deliberately not repeated here. Says NOT proven end to end until one real HQ job reads a real payroll through it
npx tsx scripts/prove-sii-door.mts       # 33/33 — no server, no SII account, no certificate, nothing written: a throwaway .p12 is generated so the real probe can spawn the real adapter for its three tools, five startup refusals by name, the shelf's stamps by value, and at the REAL SII both refusals said as themselves (no certificate → 302 errorp.html; one SII does not accredit → the handshake, unknown ca) plus all three reads reaching that login over MCP and refused there, an invented accept and claim refused as "it reads only", and a future month, a period in prose, a document type by name and a side in Spanish each refused before the wire. Prints the exact add-form values at the end (#19, D-267). What leaves on the wire — every address a read holds, and no write — is measured in server/src/sii.test.ts instead, deliberately not repeated here. Says NOT proven end to end until one real HQ job lists a month's received DTEs through it
npx tsx scripts/prove-nomina.mts         # 43/43 — no server, no bank, no money, nothing written outside a temp folder: BCI's thirteen columns and its own example line reproduced field for field, the contract's named refusals, the gate refusing a stranger WHOLE with the two approved payees composed nowhere, the same declaration becoming approvable when the payee is added and refused again when removed, the format's own rules (a smuggled `;`, a 46-character name, a bank name where the code goes), and a recursive walk of 249 sources across server, web, scripts and packages proving no payment endpoint is named, with a canary proving that check can fail (#20, D-268). Says NOT proven end to end until one real batch is uploaded and authorised at the bank
node scripts/prove-voice.mjs             # 24/24 — the voice routes, the transcriber as the desk reads it, Start refusing a note by name; with a REAL transcribed note on disk, the whole way in on a rested level (audio riding input/, the note spent, refused twice) — says NOT proven end to end until one has (#17, D-265)
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
  waiting to be found — **including Buk** (#18, D-266) **and the SII
  register** (#19, D-267): both adapters ship in the repo and are proven, but
  no connection is stored, no `BUK_API_KEY` is in `.env`, and neither
  `SII_CERT_PATH` nor `SII_CERT_PASSWORD` is either. There is no Buk tenant
  and no SII certificate on this machine, which is exactly what each ticket's
  last two boxes are waiting on.
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
- **The transcriber is installed** — `.agentlings/models/onnx-community/whisper-small`, 241 MB, put there by `npm run voice:install` on 2026-08-25 and proven 4/4. `.agentlings/voice/` holds one real note, `446455175` (Brian, 2026-08-26 06:44, 10 s, en), spent by proof job `6693cd7a` — the level is closed, the note stays as the record. The sweep is live on the restarted server; a new note reaches the desk in ~20 s.
- **The payee allowlist is empty and no charge account is set** (#20, D-268).
  `settings.json` holds no `wire` block at all, which reads as no account and
  nobody approved — so every batch is refused, which is the right default for
  money leaving. And the column table nobody built is **the wrong bank's**:
  payroll goes through **Banco de Chile**, not Santander, which has no Pagos
  Masivos enabled at all. Banco de Chile appears to publish its layout —
  `PagosMasivosV4.pdf` on `portales.bancochile.cl`, Incapsula-blocked to
  automation, so it needs a human browser and not a credential. Those two
  things are what the ticket's fourth box was waiting on — **and it is now two
  boxes** (2026-09-03): the bank's own parser accepting a composed file, which
  an upload abandoned before the token can prove, and a real batch authorised by
  hand, deferred to the first genuine payroll because a real one cannot be
  authorised as a test. No code depends on the second.
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
