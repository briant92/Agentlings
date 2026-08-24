# UI unclogging — the build checklist

Written 2026-08-22 after the six decisions were taken on the mockups. The
**spec is the design canvas** (Agentlings UI Upgrades —
https://claude.ai/code/artifact/c4b18e77-336a-43ea-9d0b-95835a04b9df): ten
artboards in the app's own chrome, each in its default state with one thing
opened, and a note per board saying what changed and what it needs. This file
is the order the work lands in, what each step touches, and how each is
proven. Tick the boxes as they land; a step is done when its evidence line is
true, not when its code compiles.

## What was decided

- **Unclogging, everywhere:** sections fold and remember their state per
  panel (the section you came for opens by default); door cards, roles and
  approvals become one-line rows that expand on tap; the backoffice filter bar
  and totals stay pinned while the list scrolls; long lists show ten rows and
  a "more" row; tabs for Settings only (reads · sends · app). Every
  disclosure is a tappable row — nothing is hover-only, the horde is also on
  the phone (D-175).
- **Backoffice** grouped by ask, groups collapsed; "every run" one click away.
- **Review** gets "where the turns went" with its route.
- **Profile:** the "hit the turn ceiling" tile is relabelled to what it
  measures ("spent the whole quote") and a true cut count is added — it needs
  `outOfTurns` on the ledger row, backfilled by identification.
- **Library** says who holds each job, from the level's crew; omitted when
  opened from the title screen or Settings, where no level is in scope.
- **What this level can read:** light touch — format chips, explanations
  folded; no per-folder figures.

## Safety review before building

- The push from the other session (`be28e11`, `2b9341a`) is documentation
  only — `DECISIONS.md` (D-212) and `SPATIAL.md` §6. No file this build edits
  moved, so there is nothing to rebase around.
- **D-212 changes one reading, and the build honours it:** a run can finish
  `done` at 51/40 without being cut. So a "cut" anywhere in the UI — the leg
  chip, the facts strip, the new tile — keys on `meter.outOfTurns` and never
  on `turns > turnsAllowed` (D-022 already said so; D-212 proves why). A
  finished run shows "51 turns", never "51 of 40".
- D-212 names a possible new trail line (`compact_boundary`). The trajectory
  route below ignores line kinds it does not know, so that instrument can land
  without touching it.
- Baseline 2026-08-22: `npm run typecheck` clean; `npm test` 77 files / 1,904
  server tests and 18 files / 203 web tests, all passing.
- Server `44404` is up (durable, launched from Brian's own terminal) with no
  job running. Server-side steps are batched into **one restart window**; the
  restart is Brian's, from his terminal, never between 07:55 and 08:20 (the
  hq calendar and mail briefs fire at 08:00 and 08:10 and only while a server
  is up), and never while `jobsRunning > 0` (D-140). With `npm run serve`
  there is no file watch, so editing server source is safe until that restart.

## Ground rules for every step

- Every changed line traces to a board or a note on the canvas.
- One shared function per notion (D-030): "what it left" is computed in
  `outputs.ts` and stamped on the job, never re-derived in a panel; the
  carry-forward list comes from the same code `carryForward` runs.
- Each step adds or extends a test, and the server steps are mutation-tested
  after the commit (kill the line, watch the test fail).
- Commit per step with a descriptive message; push only when Brian says so.
- A capability that changes what a job can reach or what the app records gets
  its `AGENTLING.md` line re-read from source; a settled question gets its
  `DECISIONS.md` entry with the evidence that settled it.

## Phase 1 — client only, ships on a reload

- [x] **1. The unclogging vocabulary** — landed 2026-08-22 (`06d412e`). — `web/src/panels/Section.tsx` (label ·
      count · summary · chevron; open state remembered under
      `agentlings:fold:<panel>:<section>` in localStorage, the merge-dismissed
      pattern; `defaultOpen` per caller), a one-line `Row` that expands with
      local state, `usePaged(list, 10)` with its "more" row, and the
      `.x-sticky` / row / section styles in `styles.css` lifted from the
      canvas's `base.css`. Test: fold state survives a remount; paging shows
      ten then all. Evidence: the three helpers exist, tested, used by nothing
      yet.
- [x] **2. Backoffice** — landed 2026-08-22 (`06d412e`); seen live as 49 runs in 22 asks. (`Backoffice.tsx`, `ledger.ts`, `CrewPanel.tsx`) —
      `groupsFor(entries)` keyed on `meter.recipeKey ?? prompt.trim().toLowerCase()`,
      newest activity first, with count, who (per member), spend, unmeasured
      count, last time and the latest leg's outcome as the badge; groups
      collapsed, "by ask | every run" remembered; find box on the sticky bar
      with the lifetime line and the tally; ten asks then "more", ten legs
      then "more"; a leg row is when · who · what it left · cost · a `41/40`
      chip **only when `outOfTurns`**, `↳` when `job.continues`; done/partial
      rows still awaiting a verdict read "to review". Standing approvals fold
      to a header with the three meters in its summary. Tests in
      `ledger.test.ts`: grouping, the chip rule (a 51/40 done run gets none),
      the label rule. Evidence: Home Chores opens to 19 asks, the blueprint
      group opens to its 14 legs, filters still sum as before.
- [x] **3. Review, client half** — landed 2026-08-22 (`81d387e`); PENDING.md joined the paperwork set in `88c51a4` so a cut run opens on RESULT.md. (`ReviewModal.tsx`, a pure `facts.ts`) — the
      facts strip from `job.meter` and `quotedUsd` (who · spend of quote ·
      "cut at turn 41 of 40" only when `outOfTurns`, else "44 turns" · minutes
      · tool calls and `toolsUsed` · finished at); the title wraps to two
      lines; "what is left" and "files" as foldable sections; `RESULT.md`
      opens first; the footer becomes one row with the More-turns block at the
      left; "start the reply from what is left" prefills the reply with the
      pending items. Test: `factsLine()` on a cut run, a finished 51/40 run and
      a routed run. Evidence: 106140b4 renders as the canvas shows, minus the
      directory rows and the carry note (Phase 3).
- [x] **4. Profile and Abilities, client half** — landed 2026-08-22 (`88c51a4`). (`ProfileModal.tsx`) —
      "hired to" folded with its first words in the header; lessons full
      width with date and source beneath, three newest then "all lessons";
      record open; the fourth tile relabelled **"spent the whole quote"** on
      the bottom line for now; the hand-over picker with its cost note first,
      a find box, three rows then "more"; reach folded to "10 of 12 doors on
      · 2 need set-up", chips and the Settings link inside. Test: the picker
      filter; the lesson line parser already has one. Evidence: Ash's card
      matches the two boards except the cut tile and the discard tag.
- [x] **5. Library** — landed 2026-08-22; seen live: 7 held on Home Chores, 3 held by nobody. (`RolesModal.tsx`, `LibraryBrowse.tsx`, `LevelView.tsx`,
      `App.tsx`) — `RolesModal` takes an optional `levelId`; when given it
      reads `GET /api/levels/:id/crew` (the route CrewPanel already uses) and
      shows "held by …" or "nobody · hire one" per role, the hire link closing
      the Library and starting the existing hire flow; roles as one-line rows
      that expand to description, tool and ability chips and the leash
      (`maxTurns · timeoutMinutes · maxCostUsd · model` off `RoleInfo`);
      abilities folded with "concise-reports on 9 jobs · ponytail on none"
      (counts from `roles[].skills`); install-from-link folded; browse-all as a
      category rail with the results beside it, ten at a time. Test: the
      held-by map from a crew list; ability counts. Evidence: the Library from
      Home Chores names Ivy, Sol, Rue, Ash, Bea, Tam, and the four workers, and
      marks clerk, mason and scout unheld; from the title screen the column is
      absent.
- [x] **6. What this level can read** — landed 2026-08-22. (`KnowledgeModal.tsx`) — intro to one
      sentence; folders, add-a-folder and formats-as-chips open; the two
      explanations under a folded "how reading works" with their gist in the
      header. No server change. Evidence: the empty state matches the board.

## Phase 2 — server batch, one restart

- [x] **7. Connection kind** — landed 2026-08-22 (`8447b3a`), one change
      from the plan: the catalog already said it. `sendsOnly` (D-097) is the
      fact, so `ConnectionInfo.kind` is read off it in `describe()` rather
      than declared a second time; the test pins the catalog — exactly the
      four senders are sends-only.
- [x] **8. Door usage** — landed 2026-08-22 (`8447b3a`); reads live after the restart. `GET /api/doors/usage` aggregating
      `.agentlings/doors.log` per door: calls, per-tool counts, errors, first
      and last `at`. Test against a fixture log. Evidence: the route answers
      mail 38 (27 search, 11 read) and search 96 for today's log.
- [x] **9. What a run left** — landed 2026-08-22 (`8447b3a`); the boot backfill runs at the restart. `deliverySummary(dir)` in `outputs.ts` (top-level
      files minus paperwork: count, PDFs, images, other; plus `work/` and
      `input/` counts and bytes, never `repo/` or dotfiles), stamped on the job
      as `delivered` where `changes` and `pending` are stamped at finish, and
      **backfilled at boot** for finished jobs lacking it (one readdir each,
      once). The output route returns the same directories as `dirs` beside
      `files`. Tests: the summary on a fixture sandbox; the boot backfill
      stamps once. Evidence: 29ddccb7 reads "PDF, 14 images + 62 files" and
      106140b4 "nothing delivered · work/ 68".
- [x] **10. Carry manifest** — landed 2026-08-22 (`8447b3a`). `carryManifest(previousDir)` beside
      `carryForward` in `executors/claude.ts`, the single list of what a new
      leg receives (top-level non-paperwork files, `input/`, the report as
      `PREVIOUS-RESULT.md`) and what stays; `carryForward` copies from it and
      `GET …/continue/quote` returns it as `carries`. Test: the manifest on a
      fixture sandbox; `carryForward` copies exactly the manifest. Evidence:
      the quote for 106140b4 lists `input/` and the report, and names `work/`
      as left behind.
- [x] **11. Trajectory route** — landed 2026-08-22 (`8447b3a`). `GET /api/levels/:lid/jobs/:id/trajectory`
      returning the session pass's `call`, `result`, `said` and `end` lines
      from `.trajectory.jsonl`, unknown kinds skipped, `{trail: false}` when
      the file is absent. Test against a fixture trail with a foreign line
      kind. Evidence: 39a1ff24 answers 43 calls; 106140b4 answers no trail.
- [x] **12. The ledger's cut field** — landed 2026-08-22 (`8447b3a`), with `timedOut` beside it since the clock is the other limit (D-138) and `cut` counts both. `outOfTurns?: boolean` on `LedgerEntry`,
      written by the row builder from `job.meter.outOfTurns` (presence-gated
      like `turnsAllowed`); `recordOf` gains `cut` and `finished` (done and not
      cut) with `AgentlingRecord` to match; `isJournal()` learns the D-201
      shape (`my delivery was discarded, not what was wanted…`) so the
      lessons count stops counting it, and the profile route returns those
      lines separately as `discards` plus `kept` (promoted jobs in the queue by
      assignee). Tests: the row carries the flag; `recordOf` on cut, finished
      and 51/40-done fixtures; `isJournal` on the D-201 line. Evidence: Ash's
      record answers 6 runs · 5 cut · 1 finished.
- [x] **13. Backfill the cut field** — landed and **run** 2026-08-22
      (`8447b3a`): `scripts/backfill-ledger-cut.ts`, by identification only,
      dry by default, `--write` took `ledger.jsonl.pre-cut.bak` first (on
      disk only — `.agentlings/` is gitignored). Evidence: 430 rows, none
      speaking before; 100 marked (91 `outOfTurns`, 9 `timedOut`) across hq
      67, home-chores 18, training-ground 14, bootcamp 1; 46 silent rows name
      jobs no longer stored and stay silent (the cut count is a floor for
      them); **19 stored rows over the cap were left unmarked because their
      jobs finished on their own — D-212's population to the row** (its
      seventeen older rows plus `39a1ff24` 44/40 and `8aef2a7c` 51/40). Of the
      100 marked, 91 show turns over the cap; with the 46 unstored rows that
      is where D-212's ninety-eight lie.
- [x] **14. Restart** — done by Brian 2026-08-22 (server `7100`). Evidence,
      read off the live routes: `/api/doors/usage` answers search 96, web 69
      (15 refusals), mail 38 (27 search · 11 read, 9 refusals), render 23,
      calendar 3; `39a1ff24/trajectory` is `trail: true`, 98 lines, 43
      session calls, and `106140b4/trajectory` is `trail: false`;
      `106140b4/output` lists `input/` (1 file) and `work/` (68 files,
      51.9 MB) beside its 4 paperwork files, and its `continue/quote`
      carries `input/` and RESULT.md as the report with `work/` and the
      paperwork left behind; Ash's profile reads 7 runs · 5 cut · 2 finished
      on their own · 4 kept, with the D-201 note under `discards` and out of
      `memory`; `/api/connections` kinds split 8 reads / 4 sends; the boot
      backfill stamped 49 of 49 Home Chores jobs — `29ddccb7` reads 75 files,
      1 PDF, 14 images, the run the backoffice called "nothing on disk".
      **Phase 3 can now be verified live.**

## Phase 3 — the client parts that needed the batch

- [x] **15. Settings** — landed 2026-08-22; seen live: reads · 8 with web 69×, search 96×, mail 38× last today 08:13 and three doors unused since Aug 18, the mail row opening to mail_search 27 · mail_read 11 · 9 refused; sends · 4 with Telegram knowing 2 people and two needs-set-up rows whose add-it-here link opens the drawer, planned SMS · Discord, never folded at 6; app signed in with an API key from .env. (`SettingsModal.tsx`, a pure `settings.ts`) — tabs reads · sends · app
      (remembered), rows grouped by `kind` with mark · name · usage · switch;
      a "needs set-up" row carries the pill and the add-it-here link instead
      of a switch; the row body holds the description, per-tool counts and
      the secret drawer; Telegram's people and Google's re-approve inside
      their rows; planned chips and the never-list fold under sends; display,
      executor (with `auth.source`), catalog and maintenance under app.
      Evidence: both Settings boards, with today's counts.
- [x] **16. Backoffice "what it left"** — landed 2026-08-22; seen live on Home Chores, every run: 49 rows, no kept row reads nothing, 29ddccb7 reads PDF, 14 images + 60 files · $4.00, the two cut discards read nothing delivered · work/ 68 and work/ 46. From `job.delivered`, replacing
      `producedBy()`'s repo-diff-or-summary reading; the old wording stays for
      jobs that still lack the stamp. Test: the phrase builder. Evidence: no
      kept run with a PDF reads "nothing on disk".
- [x] **17. Review, server-fed half** — landed 2026-08-22; seen live: 39a1ff24 shows where the turns went · 43 calls as 43 blocks, Bash 28 · Read 11 · Edit 2 · ToolSearch 1 · Write 1, longest run 6 Bash, call 39 failed and retried on the next, rail rows input/ 1 file · 149 KB and work/ 36 files · 3.9 MB, files header 4 delivered · 4 paperwork; 106140b4 shows the no-trail line, nothing delivered · 4 paperwork · input/ 1 · work/ 68, work/ 68 files · 49.5 MB · not carried forward, and the More-turns note from the manifest. `work/` and `input/` rows in the rail
      from `dirs`; the More-turns note from `carries`; the turns strip
      (`TurnsStrip.tsx`: one block per call coloured by tool, failed calls
      ringed, hover names the call, longest run and failed-call captions, the
      honest "no trail" line for runs before Aug 22). Tests: the strip's
      legend from a fixture trail equals its blocks; the carry note wording.
      Evidence: 39a1ff24 shows its 43 blocks, 106140b4 its note and no strip.
- [x] **18. Profile, server-fed half** — landed 2026-08-22; seen live on Ash: memory · 3 lessons · 1 discard note with the note dimmed and tagged between the lessons by date, the record line 7 runs · 2 finished on their own · 5 cut short · 4 kept, the cut tile 5 of 7 (labelled cut short, since `record.cut` counts the clock as well as the turn budget, D-138), and the bottom line 88% of quoted actually spent · $27.99 lifetime · 0 of 7 spent the whole quote. The cut tile from `record.cut`,
      "spent the whole quote" on the bottom line, the record line
      `runs · finished on its own · cut · kept`, the D-201 note tagged
      "discard note" from `discards`. Evidence: Ash's card matches the board.

## Phase 4 — the record

- [x] **19. `AGENTLING.md`** — done 2026-08-22: §§6, 11 and 12 re-read against abc0263 — the trail read back as the turns strip, the over-the-cap count re-read (115 of 430 rows, 24 unflagged) with the rows own flag beside it, the stamp in the loop. The trail is now read in the review (Live), the
      ledger row carries the cut, the job carries what it left; numbers
      re-read from source.
- [x] **20. `DECISIONS.md`** — done 2026-08-22: D-213 (the unclogging; overflow 643 / 376 / 191 → 0 / 0 / 39 as drawn, and 10 / 0 / 0 re-measured live at 1280×720), D-214 (the cut on the row: 100 of 430 flagged, 19 left, 46 silent) and D-215 (what a run left: 373 of 395 stamped, 16 PDF runs the old reading called nothing), both indexes in the same edit. One entry for the unclogging decisions and what
      each board proved (measured: body overflow 643 / 376 / 191 px down to
      0 / 0 / 39 on Library / Settings / Abilities at the same content); one
      for the ledger's cut field with the backfill count; one for "what a run
      left" as the single notion behind the backoffice line. Indexes updated
      in the same edit.
- [x] **21. Memory note updated; push offered.** — done 2026-08-22; the push was offered, not made.

## Phase 5 — after the first day of use

Not on the canvas: four frictions reported on 2026-08-23 against the built
panels, each the unclogging's own vocabulary applied one step further. The
why is D-226; this is the checklist's record that they landed.

- [x] **22. The first day's four frictions** — landed 2026-08-23 (D-226).
      (`settings.ts` + test, `SettingsModal.tsx`, `KnowledgeModal.tsx`,
      `LevelView.tsx`, `CrewPanel.tsx`, `styles.css`) — Settings reads:
      the no-secret, on-by-default reads (web, render) fold into one
      `Section` labelled *always on, nothing to set up*, the rest under a
      *sources* heading, split by the pure `splitReads` (both conditions —
      `browser` holds no secret and is still a decision); Knowledge: the
      header "+" gone, *choose a folder…* the one picker, the typed path a
      labelled field with an *add* button; Review: `.fv` bounded, rail and
      body scrolling alone, bar pinned — the rail was the whole symptom, the
      body had its own 420 px cap since the viewer was built, and that cap is
      now gone so there is one vertical scroller; Crew: hidden
      while a review is open and back when it closes, the Backoffice's early
      `onClose()` removed. No server change. Evidence: typecheck clean, web
      28 / 291 with the browser case mutation-tested; live in headless Edge —
      always on · 2 with *Use a web browser* a source row, the 47-file review
      with the rail at 400 of 2,110 and the body, bar and modal at 0, Crew
      absent during Review and back on Escape.
- [x] **23. The phone at phone width** — landed 2026-08-23 (D-227).
      (`styles.css` only, +75 / −2) — D-175 had measured Desktop Mode;
      at 412 px the page scrolled sideways to 671 (the header actions never
      wrapped). Now: `100dvh`; under 560 px the header wraps and the
      Review / Library rails stack over their content; under
      `pointer: coarse` the buttons, header ghosts, modal close, rail rows
      and feed filters carry real padding (15–22 px → 32–33); under both,
      `.side` and `.modal` at `zoom: 1.15`, the canvas untouched.
      Evidence: headless Edge at 412 × 915 with coarse pointer vs 1280 × 600
      with a mouse — every desktop number unchanged; on the S26 Ultra in
      mobile mode, Brian: looks and feels great.
- [x] **24. Meet the crew** — landed 2026-08-23 (D-228). AGENTLING.md as a
      character-select screen, opened from Settings → catalog beside
      *Open roles & skills*: six boards. Trades is a 4-wide roster of pixel
      sprites (one body, a hat and tint per trade) and a fighter-card sheet
      — class tag, plain blurb, a turns bar against the 40 ceiling, a
      *may cost* bar that draws the measured average as a share of the
      quote ceiling with *has cost: avg · most · sessions* beneath it,
      model, tool and skill chips, three special moves; ← → browse, Esc
      closes. Skills, powers, reach, price, never are card grids; the doors
      carry on / needs a key / off / send · at approval pills off the live
      connections, the price ladder's two paid rungs read the ledger. New
      `GET /api/crew` (`server/src/cv.ts`), `web/src/panels/crew.ts` holds
      the prose, `CrewModal.tsx` the screen; `.cv-*` rules at the end of
      `styles.css`, the six tabs wrapping on a phone and the key hint
      hidden under `pointer: coarse`. Evidence: server 82 / web 29 files
      green (cv 2, crew 6); headless Edge at 1280 × 700 and 412 × 915
      with the route served from the real roles and ledger — no sideways
      scroll, no page error, two arrows land on clerk with *14c avg · 22c
      most · 15 sessions*; the ladder reads 19c / 88c off 374 paid rows,
      against AGENTLING.md's 19.2c / 87c.
- [x] **25. Positions** — landed 2026-08-23 (D-229). The seventh board:
      *who would you hire?* over twelve hand-written postings
      (`web/src/panels/positions.ts`), each card a pip row — green /
      orange / red per duty — and the trade it maps to or *no seat*; the
      match is two columns, the human posting (responsibilities, skills
      asked for, also known as) beside the crew's answer (sprite, tally
      as counts, every duty graded with its reason, needs, also fits) and
      a HIRE button. HIRE closes the modal, shows *Hiring a clerk as
      executive assistant — pick the level it joins* over the level
      picker (`screens/hire.ts`), and the chosen level hires on arrival
      with the Hire modal already filled (`HireModal` `preset`). The
      trade card gains *fills: …* links into the board; the board carries
      no cost line — one trade fills several jobs, so cost stays on the
      trade. A search that misses names the four seats the crew has none
      of. Evidence: web 31 files green (positions 4, hire 1); headless
      Edge at 1280 × 700 and 412 × 915 with the agentling POST and the
      role PUT intercepted — no sideways scroll, no page error, *inbox* →
      one match → HIRE → banner → HQ → the modal with *executive
      assistant* and clerk. Found on the way: `.cv-v` was already the
      trades board's stat-value class, so the verdict rows inherited the
      pixel face and `nowrap` and blew the columns out; renamed
      `.cv-duty`.

## Hazards to keep in view

- `.agentlings/` is gitignored: the ledger backup and the boot backfill live
  on disk only — say so in the commit that adds them.
- `turns > turnsAllowed` is not a cut (D-022, D-212). If a test fixture needs
  a cut run, give it `outOfTurns: true`; if it needs a finished run that ran
  long, give it 51/40 and no flag.
- A role or skill text edit reshuffles BM25 routing (D-190's lesson). Nothing
  here edits one; the leash shown in the Library is read, not written.
- The D-211 trail is session-pass and close-out-pass; the strip reads the
  session pass only, and its counts are calls, not turns.
- [x] **26. The world's postings** — landed 2026-08-23 (D-232).
      (`server/src/jobboard.ts` + 5 tests, routes, `web/src/panels/jobboard.ts`
      + 4 tests, `CrewModal.tsx`, `HireModal.tsx`, `styles.css` tail) — the
      O*NET 1,016 as a second section of the positions board: one download
      into `.agentlings/onet` (button on the board, size and licence named),
      the same search box, world cards dashed with a MEASURED badge, a
      picked card showing counts, the coverage line, the graded-by-the-
      benchmark note and every duty's reason; HIRE through the level picker
      unchanged; the hand board's miss line defers to world matches; a dim
      measured hint in the Hire modal when the sentence names an occupation.
      Evidence: live sync 17.1 s / 1,016 occupations; headless Edge at
      1280 × 700 and 412 × 915 with the routes answered by the real
      grader's JSON — 5 cards, 28 duty rows, no sideways scroll, no page
      errors, the hire POST intercepted so nothing landed in HQ.
- [x] **27. One prompt, one review** — landed 2026-08-23 (D-233).
      (`packages/shared` Job/Delivery, `server` queue/work/index/deliveries,
      `web/src/panels/chain.ts` + 8 tests, `Inbox.tsx`, `Terminal.tsx`,
      `ReviewModal.tsx`, `LevelView.tsx`, `styles.css`) — a step chain
      (D-105) stops reviewing as parallel panels: `stepPrev` links the
      steps, the terminal keeps one REVIEW at the chain's end, the inbox
      groups a chain into one card with its running tail named, and the
      modal gets a step rail, an outbox provenance line, and a last-step
      verdict that settles every step still awaiting one (per-job route,
      oldest first; an earlier tab's verdict stays its own). Evidence:
      server 86/2,062, web 34/328, typecheck clean; five mutations, five
      kills by their own tests. Live proof waits on the owed server
      restart and the next real two-step ask.
- [x] **28. Brand chips in the work box** — landed 2026-08-23 (D-234).
      (`web/src/panels/workSpans.ts` + 5 tests, `WorkBar.tsx`,
      `styles.css` highlight block) — a channel word whose brand the app
      draws wears a capsule in that brand's colour (ChannelLogo's set,
      derived client-side from the word; unknown words keep the orange
      underline), matched intent/domain/suggestion/verb words gain a
      faint wash over their underlines, gaps stay underline-only, and
      the "sends via X" line carries the channel's hand-drawn mark. The
      atomic pill with an inline icon was rejected: width shifts the
      twin against the input (D-093's box stays a plain input).
      Evidence: web 34/333, typecheck clean; live in headless Edge on
      the real plan route — the Telegram capsule and mark on the D-192
      sentence, the Gmail red on a send-via-gmail ask, the chip span
      aligned over the input's own word, no page errors.
