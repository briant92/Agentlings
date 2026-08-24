# The Hireable Horde — the expansion board

The open board for the coverage-and-capability line. Opened on demand, never
imported — the same shape as `SPATIAL.md` and `RECONCILE.md` before it.

**Read `§3 Wave 0` first: that is the pick-up point, and it waits on one
decision that is Brian's.**

Written 2026-08-24, at `ddbd218`. The line so far is D-235 → D-240; the plan it
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
| Suites | server 2,080 across 87 files · web 333 · typecheck clean |

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

---

## 2. Owed before anything else in its wave

- **The `.session.json` seam — OWED BEFORE WAVE 2.** `toMcpServers`
  (`connections.ts:262-266`) writes **real secret values** into
  `mcpServers[].env`, serialized into `.session.json` inside the sandbox the
  agentling reads all job long. It leaks nothing today and that was *verified*:
  every secret-bearing connection is `transport: builtin`, the only `stdio` one
  declares no secrets, and the audit opened its own job's file and found an
  empty `env`. **One stdio connection that declares a secret makes this high
  severity** — which is exactly what Wave 2 adds. Fix: write `${NAME}`
  placeholders and resolve them in the runner from the env it was handed.
  **Wave 2 must not start without it.**
- **A re-read of the four trades' cost shape.** All four ran on the default
  model on a repo level; `logistics` finished in 4 turns for 49c and may belong
  on the cheap model, but one run is not a measurement.

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

**Two things are still owed, and both are small:**

- **The gate-OFF live run.** `prove-wave0.mjs` is built to run twice — arming
  it meant the off run would have cost a second restart, so "an unset password
  changes nothing" is proven by unit test, not live. A step below this
  project's bar, recorded rather than glossed.
- **`POST /api/session` has no rate limiting.** Unlimited guesses. Bounded by a
  42.5-bit passphrase and the loopback bind, so not urgent — but real, and
  introduced by D-241.

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
| 2 | Event triggers; HTTP MCP transport; business-system doors; browser acting tools | extends D-103; D-053/D-035 for the browser half |
| 3 | Two-way conversation — the mail loop first | D-075's *not-a-chat* clause only |
| 4 | Deploy / publish / file; e-signature; then money in three steps | D-075's *not-an-actor*; D-229's signing half; **D-219 by its own reopen clause** |
| 5 | Media, voice, CAD out | **D-204 when its own demand test passes** |
| 6 | Coordination — a manager trade | nothing: **D-197's bar is re-run on its named triggers** |

The generalization the acting waves rest on — the **acts ledger** (D-075's
outbox made typed: compose → validate → review → replay → audit) and the
**authority matrix L0–L4** (D-082 generalized) — is designed in the plan
artifact and **not built**. Build it when a wave needs it, not before.

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
