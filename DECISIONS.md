# Decision log

One entry per resolved question: the decision, and the evidence that settled
it. Newest last. Entry IDs are stable — quote them (`D-017`) rather than a
title or a line number, which both move.

Standing rules distilled from these entries live in CLAUDE.md under
"Hard-won rules"; this file is the account they came from. An entry is a
decision plus what proved it — length is whatever the evidence takes.

## Contents

- [D-001 — 2026-07-29 — Named "Agentlings"; separate from IGPL](#d-001--2026-07-29--named-agentlings-separate-from-igpl)
- [D-002 — 2026-07-29 — Adopted the Karpathy-inspired behavioral guidelines](#d-002--2026-07-29--adopted-the-karpathy-inspired-behavioral-guidelines)
- [D-003 — 2026-07-30 — Concept resolved: a personal real-work orchestrator](#d-003--2026-07-30--concept-resolved-a-personal-real-work-orchestrator)
- [D-004 — 2026-07-30 — Stack: TS monorepo, Vite/React/PixiJS web, Node/Hono/ws server](#d-004--2026-07-30--stack-ts-monorepo-vitereactpixijs-web-nodehonows-server)
- [D-005 — 2026-07-30 — External-app access is in-app MCP, never reused connectors](#d-005--2026-07-30--external-app-access-is-in-app-mcp-never-reused-connectors)
- [D-006 — 2026-07-30 — Agentling identity: roles, skills and memory in Claude-native formats](#d-006--2026-07-30--agentling-identity-roles-skills-and-memory-in-claude-native-formats)
- [D-007 — 2026-07-30 — M1: the real executor is one SDK session per job, in a child process](#d-007--2026-07-30--m1-the-real-executor-is-one-sdk-session-per-job-in-a-child-process)
- [D-008 — 2026-07-30 — Visuals phase 1: one master palette drives everything](#d-008--2026-07-30--visuals-phase-1-one-master-palette-drives-everything)
- [D-009 — 2026-07-30 — Visuals phase 2: art is data](#d-009--2026-07-30--visuals-phase-2-art-is-data)
- [D-010 — 2026-07-30 — Visuals phase 3: keep the built-in art, and fix the contract](#d-010--2026-07-30--visuals-phase-3-keep-the-built-in-art-and-fix-the-contract)
- [D-011 — 2026-07-30 — M3: user-friendliness for a non-expert](#d-011--2026-07-30--m3-user-friendliness-for-a-non-expert)
- [D-012 — 2026-07-30 — The cost model: estimating and measuring are one loop](#d-012--2026-07-30--the-cost-model-estimating-and-measuring-are-one-loop)
- [D-013 — 2026-07-30 — Structural: the boot flow, and levels as independent workspaces](#d-013--2026-07-30--structural-the-boot-flow-and-levels-as-independent-workspaces)
- [D-014 — 2026-07-31 — Terrain is data, closing the phase-3 deferral](#d-014--2026-07-31--terrain-is-data-closing-the-phase-3-deferral)
- [D-015 — 2026-07-31 — One-shot became a short leash, measured](#d-015--2026-07-31--one-shot-became-a-short-leash-measured)
- [D-016 — 2026-07-31 — The cost ceiling, corrected by measurement](#d-016--2026-07-31--the-cost-ceiling-corrected-by-measurement)
- [D-017 — 2026-07-31 — The quote's feedback loop was open](#d-017--2026-07-31--the-quotes-feedback-loop-was-open)
- [D-018 — 2026-07-31 — Confirming the four fixes live, and the ceiling breached again](#d-018--2026-07-31--confirming-the-four-fixes-live-and-the-ceiling-breached-again)
- [D-019 — 2026-07-31 — The crew was not learning, and it is the same bug a third time](#d-019--2026-07-31--the-crew-was-not-learning-and-it-is-the-same-bug-a-third-time)
- [D-020 — 2026-07-31 — Learning sweep: the write-up moves out of the session](#d-020--2026-07-31--learning-sweep-the-write-up-moves-out-of-the-session)
- [D-021 — 2026-07-31 — The fourth tier: a tool is a job compiled](#d-021--2026-07-31--the-fourth-tier-a-tool-is-a-job-compiled)
- [D-022 — 2026-07-31 — The turn caps, set by asking what actually gates the loop](#d-022--2026-07-31--the-turn-caps-set-by-asking-what-actually-gates-the-loop)
- [D-023 — 2026-07-31 — The promotion gate was selecting for the wrong work](#d-023--2026-07-31--the-promotion-gate-was-selecting-for-the-wrong-work)
- [D-024 — 2026-07-31 — The first unseeded compile was bad, and that is reassuring](#d-024--2026-07-31--the-first-unseeded-compile-was-bad-and-that-is-reassuring)
- [D-025 — 2026-07-31 — A compile gets its own turn cap](#d-025--2026-07-31--a-compile-gets-its-own-turn-cap)
- [D-026 — 2026-07-31 — The one-shot quote could never find its own history](#d-026--2026-07-31--the-one-shot-quote-could-never-find-its-own-history)
- [D-027 — 2026-07-31 — The unquoted way in](#d-027--2026-07-31--the-unquoted-way-in)
- [D-028 — 2026-07-31 — The socket was describing a world that had not changed](#d-028--2026-07-31--the-socket-was-describing-a-world-that-had-not-changed)
- [D-029 — 2026-07-31 — The compile rate split, measured and then not done](#d-029--2026-07-31--the-compile-rate-split-measured-and-then-not-done)
- [D-030 — 2026-07-31 — A UI/UX pass, where the arithmetic decided more than taste](#d-030--2026-07-31--a-uiux-pass-where-the-arithmetic-decided-more-than-taste)
- [D-031 — 2026-07-31 — Document capability: Node libraries at the project root](#d-031--2026-07-31--document-capability-node-libraries-at-the-project-root)
- [D-032 — 2026-08-01 — Reading the web is on by default, and Settings owns the switch](#d-032--2026-08-01--reading-the-web-is-on-by-default-and-settings-owns-the-switch)
- [D-033 — 2026-08-01 — The ellipsis the model believed, and the answer with nowhere to go](#d-033--2026-08-01--the-ellipsis-the-model-believed-and-the-answer-with-nowhere-to-go)
- [D-034 — 2026-08-01 — A browser that reads and cannot act](#d-034--2026-08-01--a-browser-that-reads-and-cannot-act)
- [D-035 — 2026-08-01 — The browser measured, and the case for it is weaker than the case made for it](#d-035--2026-08-01--the-browser-measured-and-the-case-for-it-is-weaker-than-the-case-made-for-it)
- [D-036 — 2026-08-01 — A method is only as good as what was available when it was found](#d-036--2026-08-01--a-method-is-only-as-good-as-what-was-available-when-it-was-found)
- [D-037 — 2026-08-01 — The rest of the axes, as one surface rather than five comparisons](#d-037--2026-08-01--the-rest-of-the-axes-as-one-surface-rather-than-five-comparisons)
- [D-038 — 2026-08-01 — CLAUDE.md trimmed to what the harness does not already do](#d-038--2026-08-01--claudemd-trimmed-to-what-the-harness-does-not-already-do)
- [D-039 — 2026-08-01 — The close-out cost never reached the ledger](#d-039--2026-08-01--the-close-out-cost-never-reached-the-ledger)
- [D-040 — 2026-08-01 — The code host is builtin, because the budget for a stdio server is not ours](#d-040--2026-08-01--the-code-host-is-builtin-because-the-budget-for-a-stdio-server-is-not-ours)
- [D-041 — 2026-08-02 — A clean exit is not a delivery, and scout could not write](#d-041--2026-08-02--a-clean-exit-is-not-a-delivery-and-scout-could-not-write)
- [D-042 — 2026-08-02 — The quote overshot sevenfold, and narrowing it did not help](#d-042--2026-08-02--the-quote-overshot-sevenfold-and-narrowing-it-did-not-help)
- [D-043 — 2026-08-02 — The tool tier could not fail into a session, and its absorption was invisible](#d-043--2026-08-02--the-tool-tier-could-not-fail-into-a-session-and-its-absorption-was-invisible)
- [D-044 — 2026-08-02 — Landing three times does not make a method compilable](#d-044--2026-08-02--landing-three-times-does-not-make-a-method-compilable)
- [D-045 — 2026-08-02 — The first compile produced a cache, and its own check could not tell](#d-045--2026-08-02--the-first-compile-produced-a-cache-and-its-own-check-could-not-tell)
- [D-046 — 2026-08-02 — The knowledge store: opened, not settled](#d-046--2026-08-02--the-knowledge-store-opened-not-settled)
- [D-047 — 2026-08-02 — The knowledge store is synced and indexed, never read live](#d-047--2026-08-02--the-knowledge-store-is-synced-and-indexed-never-read-live)
- [D-048 — 2026-08-02 — The knowledge store built, and the free tier caught guessing](#d-048--2026-08-02--the-knowledge-store-built-and-the-free-tier-caught-guessing)
- [D-049 — 2026-08-02 — The store measured, and the second unquoted way in](#d-049--2026-08-02--the-store-measured-and-the-second-unquoted-way-in)
- [D-050 — 2026-08-02 — Three tiers of capability, and what a compiled tool may inherit](#d-050--2026-08-02--three-tiers-of-capability-and-what-a-compiled-tool-may-inherit)
- [D-051 — 2026-08-02 — The crew's first real finding: the recall tier counts where recipes weigh](#d-051--2026-08-02--the-crews-first-real-finding-the-recall-tier-counts-where-recipes-weigh)
- [D-052 — 2026-08-02 — A claim about the turn cap, withdrawn, and the instrument that was missing](#d-052--2026-08-02--a-claim-about-the-turn-cap-withdrawn-and-the-instrument-that-was-missing)
- [D-053 — 2026-08-02 — A missing capability is not refused, it is substituted](#d-053--2026-08-02--a-missing-capability-is-not-refused-it-is-substituted)
- [D-054 — 2026-08-02 — A search connection, built because the gap was measured](#d-054--2026-08-02--a-search-connection-built-because-the-gap-was-measured)
- [D-055 — 2026-08-03 — A free tier for finding pages, and what it must never claim](#d-055--2026-08-03--a-free-tier-for-finding-pages-and-what-it-must-never-claim)
- [D-056 — 2026-08-03 — The ledger gains an author, and the panels that needed one](#d-056--2026-08-03--the-ledger-gains-an-author-and-the-panels-that-needed-one)
- [D-057 — 2026-08-03 — Two ways to count one thing, and why the slower one stays](#d-057--2026-08-03--two-ways-to-count-one-thing-and-why-the-slower-one-stays)
- [D-058 — 2026-08-04 — A document is shown where it lands, and two listings become one](#d-058--2026-08-04--a-document-is-shown-where-it-lands-and-two-listings-become-one)
- [D-059 — 2026-08-04 — The store reads documents, and the splitter that made it real](#d-059--2026-08-04--the-store-reads-documents-and-the-splitter-that-made-it-real)
- [D-060 — 2026-08-04 — A grid is not prose, and the readers stop being written twice](#d-060--2026-08-04--a-grid-is-not-prose-and-the-readers-stop-being-written-twice)
- [D-061 — 2026-08-04 — Reading paper: the engine Windows already has](#d-061--2026-08-04--reading-paper-the-engine-windows-already-has)
- [D-062 — 2026-08-04 — Two faults found by reading the panel copy back against the code](#d-062--2026-08-04--two-faults-found-by-reading-the-panel-copy-back-against-the-code)
- [D-063 — 2026-08-04 — The run is told its budget, and delivers before it ends](#d-063--2026-08-04--the-run-is-told-its-budget-and-delivers-before-it-ends)
- [D-064 — 2026-08-04 — A method earns the leash by having worked, not by existing](#d-064--2026-08-04--a-method-earns-the-leash-by-having-worked-not-by-existing)
- [D-065 — 2026-08-04 — The leash gets its own counter, because it was asking a different question](#d-065--2026-08-04--the-leash-gets-its-own-counter-because-it-was-asking-a-different-question)
- [D-066 — 2026-08-04 — Carrying on, rather than asking for a smaller request](#d-066--2026-08-04--carrying-on-rather-than-asking-for-a-smaller-request)
- [D-067 — 2026-08-04 — The quote wins against a role's standing guess](#d-067--2026-08-04--the-quote-wins-against-a-roles-standing-guess)
- [D-068 — 2026-08-04 — A leash has to be a shortening, not a different job](#d-068--2026-08-04--a-leash-has-to-be-a-shortening-not-a-different-job)
- [D-069 — 2026-08-04 — A method halved a real job, with no leash and no tier change](#d-069--2026-08-04--a-method-halved-a-real-job-with-no-leash-and-no-tier-change)
- [D-070 — 2026-08-04 — A quote that could not find its history, and the copy that covered for it](#d-070--2026-08-04--a-quote-that-could-not-find-its-history-and-the-copy-that-covered-for-it)
- [D-071 — 2026-08-04 — The third run says the halving was a step, not a trend](#d-071--2026-08-04--the-third-run-says-the-halving-was-a-step-not-a-trend)
- [D-072 — 2026-08-04 — Seven runs of one sentence, none of them recording it was the same job](#d-072--2026-08-04--seven-runs-of-one-sentence-none-of-them-recording-it-was-the-same-job)
- [D-073 — 2026-08-04 — The crew's notes stop repeating themselves](#d-073--2026-08-04--the-crews-notes-stop-repeating-themselves)
- [D-074 — 2026-08-04 — A continuation is the same job, now everywhere it counts](#d-074--2026-08-04--a-continuation-is-the-same-job-now-everywhere-it-counts)
- [D-075 — 2026-08-04 — Acting is an outbox replayed at approval, never a tool in a session](#d-075--2026-08-04--acting-is-an-outbox-replayed-at-approval-never-a-tool-in-a-session)
- [D-076 — 2026-08-04 — Credentials: a Connect button for the OAuth pair, paste-a-token for the rest, passwords never](#d-076--2026-08-04--credentials-a-connect-button-for-the-oauth-pair-paste-a-token-for-the-rest-passwords-never)
- [D-077 — 2026-08-04 — The connection batch: four now, nine later, six never](#d-077--2026-08-04--the-connection-batch-four-now-nine-later-six-never)
- [D-078 — 2026-08-05 — The token drawer: one store, one real call, one inbound crossing](#d-078--2026-08-05--the-token-drawer-one-store-one-real-call-one-inbound-crossing)
- [D-079 — 2026-08-05 — The desk notices a send, and asks at the only moment asking is free](#d-079--2026-08-05--the-desk-notices-a-send-and-asks-at-the-only-moment-asking-is-free)
- [D-080 — 2026-08-05 — Google connects by loopback, against the user's own client](#d-080--2026-08-05--google-connects-by-loopback-against-the-users-own-client)
- [D-081 — 2026-08-05 — WhatsApp Business sends templates, and the audit records a declared price or none](#d-081--2026-08-05--whatsapp-business-sends-templates-and-the-audit-records-a-declared-price-or-none)
- [D-082 — 2026-08-05 — Standing approval: earned in review, scoped to an allowlist, and not called a leash](#d-082--2026-08-05--standing-approval-earned-in-review-scoped-to-an-allowlist-and-not-called-a-leash)
- [D-083 — 2026-08-05 — Ambience is scene data, and the stalactites the dice never rolled](#d-083--2026-08-05--ambience-is-scene-data-and-the-stalactites-the-dice-never-rolled)
- [D-084 — 2026-08-05 — The ask floats over the agentling, and falls back to the bar](#d-084--2026-08-05--the-ask-floats-over-the-agentling-and-falls-back-to-the-bar)
- [D-085 — 2026-08-05 — Bare "mail" claims as a channel word, and stays out of the verb list](#d-085--2026-08-05--bare-mail-claims-as-a-channel-word-and-stays-out-of-the-verb-list)
- [D-086 — 2026-08-05 — The bubble wears the mock's sheet, and the bar keeps the desk card](#d-086--2026-08-05--the-bubble-wears-the-mocks-sheet-and-the-bar-keeps-the-desk-card)
- [D-087 — 2026-08-05 — The desk asks the send's two facts, and Start tells the truth](#d-087--2026-08-05--the-desk-asks-the-sends-two-facts-and-start-tells-the-truth)
- [D-088 — 2026-08-05 — The garage, the drawer and the outbox wear the mock too](#d-088--2026-08-05--the-garage-the-drawer-and-the-outbox-wear-the-mock-too)
- [D-089 — 2026-08-05 — The agentling's file: tagged memory, a ledger record, and a skill handed to the role](#d-089--2026-08-05--the-agentlings-file-tagged-memory-a-ledger-record-and-a-skill-handed-to-the-role)
- [D-090 — 2026-08-05 — A verb claims in every inflection, and a reply may name the channel the job never carried](#d-090--2026-08-05--a-verb-claims-in-every-inflection-and-a-reply-may-name-the-channel-the-job-never-carried)
- [D-091 — 2026-08-05 — The channel names its recipient's shape, and the desk objects to a name where a number belongs](#d-091--2026-08-05--the-channel-names-its-recipients-shape-and-the-desk-objects-to-a-name-where-a-number-belongs)
- [D-092 — 2026-08-05 — The audience roster: names for the opted-in, a picker behind To, and the legend the session reads](#d-092--2026-08-05--the-audience-roster-names-for-the-opted-in-a-picker-behind-to-and-the-legend-the-session-reads)
- [D-093 — 2026-08-05 — The near-miss is a question, and the review says when approving sends nothing](#d-093--2026-08-05--the-near-miss-is-a-question-and-the-review-says-when-approving-sends-nothing)
- [D-094 — 2026-08-05 — A known name prefills To, and "the same again" means the audited words](#d-094--2026-08-05--a-known-name-prefills-to-and-the-same-again-means-the-audited-words)
- [D-095 — 2026-08-05 — The leash is bounded by its own budget, and a run it cut may say so](#d-095--2026-08-05--the-leash-is-bounded-by-its-own-budget-and-a-run-it-cut-may-say-so)
- [D-096 — 2026-08-05 — The first tool earned end to end, and what the ledger says about the run that built it](#d-096--2026-08-05--the-first-tool-earned-end-to-end-and-what-the-ledger-says-about-the-run-that-built-it)
- [D-097 — 2026-08-05 — The desk asks for the words, and a send it already holds costs nothing](#d-097--2026-08-05--the-desk-asks-for-the-words-and-a-send-it-already-holds-costs-nothing)
- [D-098 — 2026-08-06 — A run's counters land on what is on disk, not on the picture it started from](#d-098--2026-08-06--a-runs-counters-land-on-what-is-on-disk-not-on-the-picture-it-started-from)
- [D-099 — 2026-08-06 — A run that only resembles a recipe credits usage, and nothing else](#d-099--2026-08-06--a-run-that-only-resembles-a-recipe-credits-usage-and-nothing-else)
- [D-100 — 2026-08-06 — The compile gate asks what a method used, not what it could reach](#d-100--2026-08-06--the-compile-gate-asks-what-a-method-used-not-what-it-could-reach)
- [D-101 — 2026-08-06 — Standing approval fired, and the desk arrests a send with no words](#d-101--2026-08-06--standing-approval-fired-and-the-desk-arrests-a-send-with-no-words)
- [D-102 — 2026-08-06 — The folder is picked in the OS's own dialog, served by the server that has the folders](#d-102--2026-08-06--the-folder-is-picked-in-the-oss-own-dialog-served-by-the-server-that-has-the-folders)
- [D-103 — 2026-08-06 — The recurrence timer: a sentence queued again on its cadence, through the same door](#d-103--2026-08-06--the-recurrence-timer-a-sentence-queued-again-on-its-cadence-through-the-same-door)
- [D-104 — 2026-08-06 — The acting surface finished: Slack, calendar events and GitHub comments, one outbox](#d-104--2026-08-06--the-acting-surface-finished-slack-calendar-events-and-github-comments-one-outbox)
- [D-105 — 2026-08-06 — Composite work: split where the user said "then", each step its own job](#d-105--2026-08-06--composite-work-split-where-the-user-said-then-each-step-its-own-job)
- [D-106 — 2026-08-06 — Schedule only: the repeat row can decline today's run, and says the first date](#d-106--2026-08-06--schedule-only-the-repeat-row-can-decline-todays-run-and-says-the-first-date)
- [D-107 — 2026-08-07 — Backdrops: the strip grows, and the viewport becomes data](#d-107--2026-08-07--backdrops-the-strip-grows-and-the-viewport-becomes-data)
- [D-108 — 2026-08-07 — The backdrop leaves DB32: one palette for the crew, another for the painting](#d-108--2026-08-07--the-backdrop-leaves-db32-one-palette-for-the-crew-another-for-the-painting)
- [D-109 — 2026-08-07 — M2 and M3 built: the backdrop layer, and a level pack that is a whole world](#d-109--2026-08-07--m2-and-m3-built-the-backdrop-layer-and-a-level-pack-that-is-a-whole-world)
- [D-110 — 2026-08-07 — M4: a run authors a world, and the first one found three faults in the brief](#d-110--2026-08-07--m4-a-run-authors-a-world-and-the-first-one-found-three-faults-in-the-brief)
- [D-111 — 2026-08-07 — A name clash was a dead end, and the crew's world replaced the hand-written one](#d-111--2026-08-07--a-name-clash-was-a-dead-end-and-the-crews-world-replaced-the-hand-written-one)
- [D-112 — 2026-08-07 — The crew got eyes: a headless renderer, a designer, and the trap the class tag set](#d-112--2026-08-07--the-crew-got-eyes-a-headless-renderer-a-designer-and-the-trap-the-class-tag-set)
- [D-113 — 2026-08-07 — The DKC look, measured: 128 colours holds, and the crew works from a picture rather than copying one](#d-113--2026-08-07--the-dkc-look-measured-128-colours-holds-and-the-crew-works-from-a-picture-rather-than-copying-one)
- [D-114 — 2026-08-07 — One button in the terminal, the decision in the panel, and an account of what is left](#d-114--2026-08-07--one-button-in-the-terminal-the-decision-in-the-panel-and-an-account-of-what-is-left)
- [D-115 — 2026-08-07 — The careers were zeroed at boot, and the ledger gave them back](#d-115--2026-08-07--the-careers-were-zeroed-at-boot-and-the-ledger-gave-them-back)
- [D-116 — 2026-08-07 — "Do it properly" comes back, in the panel](#d-116--2026-08-07--do-it-properly-comes-back-in-the-panel)
- [D-117 — 2026-08-07 — The designer drift measured, and both cheap fixes measured out](#d-117--2026-08-07--the-designer-drift-measured-and-both-cheap-fixes-measured-out)
- [D-118 — 2026-08-07 — The overnight campaign: 27 runs, priced first, across every flow the app has](#d-118--2026-08-07--the-overnight-campaign-27-runs-priced-first-across-every-flow-the-app-has)
- [D-119 — 2026-08-07 — Paperwork does not inherit: PENDING.md joins the forward exclusion](#d-119--2026-08-07--paperwork-does-not-inherit-pendingmd-joins-the-forward-exclusion)
- [D-120 — 2026-08-07 — An approval is keyed by the sentence the chain began with](#d-120--2026-08-07--an-approval-is-keyed-by-the-sentence-the-chain-began-with)
- [D-121 — 2026-08-08 — Closing a level archives it in place, and the sweep takes the clones](#d-121--2026-08-08--closing-a-level-archives-it-in-place-and-the-sweep-takes-the-clones)
- [D-122 — 2026-08-08 — Gmail's roster reads the contact book; the legend stops riding whole](#d-122--2026-08-08--gmails-roster-reads-the-contact-book-the-legend-stops-riding-whole)
- [D-123 — 2026-08-08 — The picker learns what Gmail's compose field knows](#d-123--2026-08-08--the-picker-learns-what-gmails-compose-field-knows)
- [D-124 — 2026-08-08 — Calendar asks its own two facts, and reads the gmail book](#d-124--2026-08-08--calendar-asks-its-own-two-facts-and-reads-the-gmail-book)
- [D-125 — 2026-08-08 — The architect trade, and a review that draws its diagrams](#d-125--2026-08-08--the-architect-trade-and-a-review-that-draws-its-diagrams)
- [D-126 — 2026-08-08 — The third death gets a capture, and an install overwrites a shipped role](#d-126--2026-08-08--the-third-death-gets-a-capture-and-an-install-overwrites-a-shipped-role)
- [D-127 — 2026-08-09 — The bind pinned to loopback: G7 closed the day it opened](#d-127--2026-08-09--the-bind-pinned-to-loopback-g7-closed-the-day-it-opened)
- [D-128 — 2026-08-09 — The studio pack: a render door that reaches nothing, and scribe grows a shell](#d-128--2026-08-09--the-studio-pack-a-render-door-that-reaches-nothing-and-scribe-grows-a-shell)
- [D-129 — 2026-08-09 — The researcher trade: a longer clock, and the word "research" changes hands](#d-129--2026-08-09--the-researcher-trade-a-longer-clock-and-the-word-research-changes-hands)
- [D-130 — 2026-08-09 — A role may raise its own ceiling: the per-class knob the researcher earned](#d-130--2026-08-09--a-role-may-raise-its-own-ceiling-the-per-class-knob-the-researcher-earned)
- [D-131 — 2026-08-09 — The analyst upgrade: a kept script, an SVG chart, and an inert display already built](#d-131--2026-08-09--the-analyst-upgrade-a-kept-script-an-svg-chart-and-an-inert-display-already-built)
- [D-132 — 2026-08-09 — The organizer pack: the sandbox boundary crossed by a reviewed, reversible manifest](#d-132--2026-08-09--the-organizer-pack-the-sandbox-boundary-crossed-by-a-reviewed-reversible-manifest)
- [D-133 — 2026-08-09 — The web-operator pack stays refused: no errand, no acting surface](#d-133--2026-08-09--the-web-operator-pack-stays-refused-no-errand-no-acting-surface)
- [D-134 — 2026-08-09 — Start arrests a sentence leaning on an attachment nothing carries](#d-134--2026-08-09--start-arrests-a-sentence-leaning-on-an-attachment-nothing-carries)
- [D-135 — 2026-08-09 — The failed modal's reply reads as the action it is](#d-135--2026-08-09--the-failed-modals-reply-reads-as-the-action-it-is)
- [D-136 — 2026-08-10 — The failed card says what its door opens on, and every review carries its ask](#d-136--2026-08-10--the-failed-card-says-what-its-door-opens-on-and-every-review-carries-its-ask)
- [D-137 — 2026-08-10 — The select screen wears switch-palace blocks](#d-137--2026-08-10--the-select-screen-wears-switch-palace-blocks)
- [D-138 — 2026-08-10 — A cut is a boundary, not an annulment: More time, the clock said out loud, and walls that can learn](#d-138--2026-08-10--a-cut-is-a-boundary-not-an-annulment-more-time-the-clock-said-out-loud-and-walls-that-can-learn)
- [D-139 — 2026-08-10 — An answered run stops asking: continuations stamp their parent](#d-139--2026-08-10--an-answered-run-stops-asking-continuations-stamp-their-parent)
- [D-140 — 2026-08-10 — The capture's first catch: the "unexplained deaths" were the watcher, and serving stops watching](#d-140--2026-08-10--the-captures-first-catch-the-unexplained-deaths-were-the-watcher-and-serving-stops-watching)
- [D-141 — 2026-08-10 — One Approve, one door: the install that refused itself](#d-141--2026-08-10--one-approve-one-door-the-install-that-refused-itself)
- [D-142 — 2026-08-10 — The plate lands: a raster behind the world, and the basin that proved it](#d-142--2026-08-10--the-plate-lands-a-raster-behind-the-world-and-the-basin-that-proved-it)
- [D-143 — 2026-08-10 — The door learns to paint: render_plate, and the gate the loop built](#d-143--2026-08-10--the-door-learns-to-paint-render_plate-and-the-gate-the-loop-built)
- [D-144 — 2026-08-10 — The Odyssey sentence: the desk points at the door, the door offers the plate](#d-144--2026-08-10--the-odyssey-sentence-the-desk-points-at-the-door-the-door-offers-the-plate)
- [D-145 — 2026-08-10 — The review speaks D-138: the cut named as a boundary, the delivery in the same breath](#d-145--2026-08-10--the-review-speaks-d-138-the-cut-named-as-a-boundary-the-delivery-in-the-same-breath)
- [D-146 — 2026-08-10 — The handover the brief promised: a continuation reads its parent's report, and the decoder pointer stops hiding](#d-146--2026-08-10--the-handover-the-brief-promised-a-continuation-reads-its-parents-report-and-the-decoder-pointer-stops-hiding)
- [D-147 — 2026-08-11 — The floor that drew nothing: op names become the contract](#d-147--2026-08-11--the-floor-that-drew-nothing-op-names-become-the-contract)
- [D-148 — 2026-08-11 — Backdrop v2 whole: the stack, the drift, the strip, the life](#d-148--2026-08-11--backdrop-v2-whole-the-stack-the-drift-the-strip-the-life)
- [D-149 — 2026-08-11 — The parcel desk: a pile of forty shows forty](#d-149--2026-08-11--the-parcel-desk-a-pile-of-forty-shows-forty)
- [D-150 — 2026-08-11 — A promoted chain prices its cut legs: the $0 world stops shipping](#d-150--2026-08-11--a-promoted-chain-prices-its-cut-legs-the-0-world-stops-shipping)
- [D-151 — 2026-08-11 — The shelf taken: the smooth finish and the depth map](#d-151--2026-08-11--the-shelf-taken-the-smooth-finish-and-the-depth-map)
- [D-152 — 2026-08-11 — The seam sweep: excerpt named, command handed over, arrival refused](#d-152--2026-08-11--the-seam-sweep-excerpt-named-command-handed-over-arrival-refused)
- [D-153 — 2026-08-11 — The Pine Reach: Route 2's dressed set, and the first smooth world](#d-153--2026-08-11--the-pine-reach-route-2s-dressed-set-and-the-first-smooth-world)
- [D-154 — 2026-08-11 — Every world furnishes its own doorway and parcel stand](#d-154--2026-08-11--every-world-furnishes-its-own-doorway-and-parcel-stand)
- [D-155 — 2026-08-11 — The crew rail names the trade](#d-155--2026-08-11--the-crew-rail-names-the-trade)
- [D-156 — 2026-08-11 — The full sweep: three gates closed, four seams found](#d-156--2026-08-11--the-full-sweep-three-gates-closed-four-seams-found)
- [D-157 — 2026-08-11 — Phase 0: the report answers the expansion plan's four questions](#d-157--2026-08-11--phase-0-the-report-answers-the-expansion-plans-four-questions)
- [D-158 — 2026-08-11 — The reading desks: calendar first, sibling grants, a clerk on the cheap model](#d-158--2026-08-11--the-reading-desks-calendar-first-sibling-grants-a-clerk-on-the-cheap-model)

## By theme

The Contents above is chronological; this is the way in when you know the
subject but not the ID. Lived in CLAUDE.md until D-038 and moved here so a new
entry updates one file rather than two.

- **Concept, stack, outside access, identity, executor** — D-001–D-007, D-032,
  D-034–D-035
- **Visuals and terrain** — palette, art-as-data, art source, scenes-as-data:
  D-008–D-010, D-014; and D-083 — idle life joining the format as ambient
  idioms, the draw reporting its own stalactite tips, and the cave comment
  the dice had quietly falsified; D-107 — backdrops behind the
  strip, the viewport becoming data a scene owns, and the scrim measured
  into a sprite rim; D-108 — the backdrop leaving DB32 for its own
  128-colour palette; D-109 — M2 and M3 built: the
  scrim as alpha bands, the format moving to shared so a checker can see it,
  and ThemeKey opening into an installed pack; D-110 — M4, a run
  authoring a whole world, and the brief whose example became the answer; D-111 —
  a name clash that left discarding as the only move, and the first world
  the crew drew replacing the hand-written one; D-112 — the crew given eyes,
  a headless renderer walking the app's own interpreter, D-107's separation
  measure finally existing as code, and a `designer` whose class tag fixed the
  quote while starving the turn budget; D-113 — the DKC look measured at last
  (128 holds, 32 destroys, flat sprites on it really do read as pasted on),
  and the reference path taken over the raster one because a session can
  genuinely see a picture; and D-142 — the plate landing at last:
  `backdrop.plates` as a checked raster beneath everything, one per pack
  because the tooling is opaque RGB, rim made a checked requirement, drafts
  refusing plates with the same message on both sides, and The Amber Basin
  proving format, checker, renderer, cards and CLI live in one evening;
  and D-143 — the render door growing render_plate (three.js vendored as
  the offline rule's one stated exception, the receipt carrying the same
  numbers the checker holds a plate to), drafts carrying plates through
  review into an Approve that copies them, and The Ember Gate — a three.js
  world built in four takes of the see-your-work loop — as its proof; and
  D-144 — the road to that door repaired the evening a real sentence missed
  it: the authoring brief taught plates and its stale cannot-carry claim
  corrected, the form's 3D-backdrop kind with the reference gone optional,
  and the desk arrest pointing at New Level; and D-147 — the floor that
  drew nothing: `"kind": "rect"` resolving every value past a checker that
  never read the discriminant into a switch with no default, so op and fx
  names became the checked contract and the interpreter went loud; and D-146's brief half — the
  raster-decoder pointer made unconditional beside the plates section, after
  the first paid More Time leg rebuilt the decoder to measure its own plate;
  and D-148 — backdrop v2 whole: alpha tooling beside the opaque paths, the
  1..3 plate stack with the occlusion strip and plate-life loops, overscan
  width as the drift opt-in, the renderer-owned motion law whose clamp *is*
  the checker's clearance margin, the door's cut-out modes, the layer-wide
  128 budget with joint quantize, and Route 2 shipped as untested-live
  Blender files — the smooth finish and displacement parallax deliberately
  left on the shelf; and D-151 — that shelf taken when Brian asked: the
  smooth finish as a per-pack opt-in (DOM plates under a transparent
  canvas, D-108 amended the narrow way — quantized stays the default) and
  the depth map (quantized-only DisplacementFilter, data never picture,
  smears named honestly); and D-153 — Route 2's first dressed set: a CC0
  kit through the template into The Pine Reach, the first smooth world
  live with differential DOM drift, and the plane-primitive Generated-Z
  constant banked as a real trap; and D-154 — the doorway and parcel
  stand drawn by the app from each world's own theme slots (no scene ever
  drew the door), the boxes shared with the checker, and the strip rule
  growing both spots — its first catches Pine Reach's own menhir and the
  Strait's paid strip
- **Roles, skills and who a job is filed under** — D-006, and D-112, where a
  role turns out to be a price class as much as a prompt: nobody holding it
  means it does nothing, adding one moves the matcher underneath the roles
  already there, and a class with no rate falls back to a standing cap; and
  D-117, that drift measured on every real prompt — ~5%, carried by generic
  body words — with both cheap fixes measured out and the index left alone;
  and D-125, the architect trade (EXPANSION P1) — where a survived mutation
  proved the routing surface is the whole role file, name ×3 description ×2
  body ×1, so D-112's reword-to-fix-tipping advice applies to bodies too,
  and the review panel learned to draw a markdown file's mermaid fences;
  and D-126's collision half — a library install onto an existing role name
  silently overwrites the shipped file, D-111's clash taking the other branch,
  closed by D-152's refuse-or-identical at install;
  and D-128, the studio pack — three design skills, scribe gaining bash
  because a role without a shell cannot run the call shapes the brief hands
  it, and the render door whose offline rule is proved against a live
  listener rather than described; and D-129, where adding a researcher
  fired the D-112 canary twice and both fixes were a vocabulary handover —
  scout keeps "looks into", the concept map's 'research' stops bridging to
  scout's words — and the per-role `timeoutMinutes` wall arrived in
  maxTurns's exact idiom
- **The dev server's own deaths** — D-118 (two, unobserved, the Adobe-node
  red herring) and D-126: the third death, diagnosed from outside by the
  port split (:4600 refused under a living :5173), and the capture D-118
  named — `npm run dev` tees the server's stdout/stderr into
  `.agentlings/server.log` with stamped exits, proved by a spawn test; and
  D-140, the capture's first catch closing the case — the deaths were tsx
  watch restarts on source events (live edits, OneDrive echoes minutes
  late) killing whatever session was running, answered by `npm run serve`:
  same server and log, no watching
- **The listening surface** — D-127: the first architect run found `serve()`
  passed no hostname (0.0.0.0, netstat-confirmed, G7), and Brian's decision
  pinned it to 127.0.0.1 with vite's proxy dialing the address so a ::1
  resolution cannot miss it — the pin verified live the same hour
- **Levels as workspaces, and the non-expert setup path** — D-011, D-013; and
  D-121, where deletion becomes closing — an archive in place that keeps the
  id off the market — and the measured disk weight turns out to be repo
  clones, answered by a per-job sweep rather than by deleting anything; and
  D-137, the select screen wearing SMW switch-palace blocks — dashed when
  quiet, a filled ! per signal (working, to review, scheduled, unread),
  the unread population shared with the inbox so the two cannot drift
- **Acting on the real world through review** — the promote grammar applied to
  side effects: D-075 (send), D-104 (the acting surface), D-110/D-111 (a run
  authors a world), and D-132, where it first crosses the sandbox boundary —
  a run proposes a folder reorganization as MOVES.json and the server replays
  it, model-never-touches, never a delete, journaled so it reverses; and
  D-141, one Approve one door — the gates-of-troy install refused by its own
  first half, fixed by authoring dropping the repo and an unchanged slug not
  counting as a rename, with the cut-legs-never-charge pricing seam recorded
- **Cost** — quotes, ceilings, turn budgets, rates, billing: D-012, D-016–D-018,
  D-026–D-027, D-029; D-130, where a role may raise its own ceiling above the
  global runaway clamp for its class alone (the researcher, measured bound on
  the $2 cap three times) — the env hard limit still wins, and a typo is
  clamped; D-067, where the quote stops losing to a role's standing
  guess about a trade; and D-070, the third form of one fault — a quote that
  cannot find its history cannot tighten, whether the class it looks up is
  wrong (D-026, D-029), in the wrong field (`quoteClass`), or absent because
  the matcher declined to name one — and D-072, where it was never written down
  at all for any run that took a method without the leash, which is most of
  them; that entry also records why the pinned ceiling was measured and then
  left alone rather than fixed — and is amended with what settled and what did
  not, since the freak-run diagnosis it rests on has since been resolved by the
  fix while the ceiling stayed at the clamp for a different reason entirely;
  and D-138, where the clock joins the budget grammar — `timedOut` as
  `outOfTurns`'s twin with More time behind it, the wall named in the brief
  so a run can ration, and walls-that-learn deferred until ledger rows
  carry duration; and D-157, where the report grows the expansion plan's
  four numbers before the plan spends — absorption bucketed and reconciled
  against `totals()`, compile candidates by the gate's own function,
  D-050's cross-level count, the clone-tax upper bound — and two of the
  four overturn plan items the same hour
- **Learning** — recipes, close-out, compiled tools, promotion: D-015,
  D-019–D-025, D-036–D-037; and D-069, the first measurement of a banked method
  against work somebody actually wanted done, which halved the job **without**
  the leash and so credits the approach with a saving the tier averages had
  been attributing to the tier change — read with D-071, where the third run
  lands between the first two and turns the halving back into a single step
  followed by noise, exactly as §8 says a recipe behaves
- **Socket payload, UI/UX, documents, answering a run** — D-028, D-030–D-031,
  D-033; and D-114, where the feed stopped being where decisions are made —
  one REVIEW on the row, the whole choice in the panel, the close-out writing
  an account of what is left so "more turns" is a judgement, and a resolved
  line that says who decided; and D-116, where that move turned out to have
  orphaned "Do it properly" and the button was restored in the panel; and
  D-139, where an answered run stops asking — both continuation doors stamp
  the parent (`continuedBy`), the failed card retires, carry-on refuses a
  second charge, and restore() backfills history from each child's own
  `continues`; and D-145, where the review modal stops contradicting D-138 —
  a cut run's red error becomes a neutral boundary sentence naming the limit
  and the delivery's substance in the same breath, More turns/time untouched
  beneath it
- **The project's own notes** — D-002, D-038
- **Cost, continued** — D-039
- **Outside access, continued** — D-040; and D-158, the reading desks —
  calendar-read first because it sits inside the consent already granted,
  read tools as sendsOnly-preserving sibling connections, a clerk trade on
  the cheap model, the morning brief as first standing desk; build gated
  behind T5's first firing
- **Delivery and roles** — D-041
- **Quoting, continued** — D-042
- **The fourth tier, in service** — D-043, D-044, D-045; and D-100, which
  answers the doors-and-libraries question by measuring it away: granting the
  doors would have unlocked nothing, because every refused recipe also carried
  a browser it never opened, so the gate learned to ask what a method *used*
  rather than what it could reach — closing both limits D-044 named about
  itself; and D-096, the first
  tool earned end to end on real recurring work with nothing seeded — five
  hand-done runs on five different real datasets, a compile whose verifier was
  mutated against five wrong answers before installing, then the job served at
  0 turns and $0. It also records what the ledger makes of the compile: cut at
  the cap, so filed a failure and absorbed, while the tool it built is live
- **Outside access, continued again** — the knowledge store: options in D-046,
  settled as sync-and-index by D-047, built in D-048; and D-102, where the
  folder it reads is picked in the OS's own Select Folder dialog served by
  the server (a browser never reveals an absolute path), the second
  deliberately Windows-only file — its first serving picked Wave 5's folder
- **The free tier's honesty** — the recall tier scoring on its own asking
  words: D-048
- **The store measured on real work, and quoting `noRouter`** — D-049, which
  also closes the second unquoted route (D-027 is the first)
- **Where capability lives** — the three tiers, what may graduate between them,
  and why a tool's surface is recorded but not gated on: D-050
- **The crew working on itself** — the rarity asymmetry the recall tier has and
  recipes do not, and what a job's phrasing costs: D-051
- **What a turn is spent on** — a withdrawn claim about the cap, and the tool
  counter that had to exist before it could be asked: D-052
- **How to ask for work** — what the crew does when a capability is missing, and
  why "find out" is a budget instruction: D-053
- **Finding a page** — the search connection and why it is builtin: D-054,
  and the free tier that answers a bare search without a session: D-055
- **Reading the crew record** — the productivity block and the inbox, the author
  the ledger never recorded, and the three tests that passed without testing:
  D-056; and D-115, where the sim zeroed the careers the roster persisted and
  `syncRoster` wrote the zeros back over the record — caught because D-056's
  ledger held the second derivation to disagree with, and repaired from it by
  identification
- **Documents, continued** — produced in D-031, and shown rather than merely
  offered in D-058, which also collapses the second listing and the second
  ordering (D-030's shape again); read *into* the knowledge store by D-059,
  where the splitter was the feature and the extensions were the easy half;
  and D-060, which adds the two formats that are not prose at all and puts the
  readers in one module before the second copy could be written; D-061 reads
  paper itself, with the one Windows-only file in the project behind a seam,
  and D-062, where reading the panel copy back found a silent cap and a budget
  charged the wrong number — plus a correction to what D-061 claimed
- **Counting what is actually there** — a per-source count taken before dedupe,
  and the second derivation left in place on purpose rather than collapsed:
  D-057, which is D-030's rule met head-on and answered
- **Running out of turns** — the first real job in a real level died with an
  empty sandbox because nobody had told it there was a budget: D-063, where the
  fix is measured as a paired re-run rather than asserted; and D-064, where that
  fix banked a method from a run that had not finished and would have handed the
  next one half the turns, so a recipe now has to have landed before it may
  shorten anything. D-065 is the correction to that gate — the counter it used
  answers the compile question, not the leash's, and using it locked no-repo
  work out for ever while repo work earned the leash without finishing. D-066
  stops asking the user to shrink the request and lets a cut-off run be picked
  up instead; four runs of one sentence now compound for less each time and not
  one of them has ever finished, which is where the per-run turn cap comes due.
  D-067 pays it: the quote now outranks a role's standing guess, since the rule
  that said otherwise was guarding against a pooled rate that has since been
  fixed — and the same measurement exposes the next layer of it, a rate that
  averages a class and so over-funds any job dearer than its own class. The job
  then **finished**, on the fifth run, which settled that it was never too big;
  and the completion promptly armed the next failure, since fitting a 33-turn
  budget was about to license a five-turn leash: D-068, the third reading of a
  gate as licensing something it never verified — and D-099, where the counters
  those gates read were being credited by runs that merely *resembled* the job,
  so a three-turn send armed a five-turn leash on fifteen turns of research —
  and D-098, where the counters
  those gates read stopped being written from a picture taken before the run
  began, so a job finishing inside another's window no longer erases its
  increments — and D-095, the fourth, where
  a bound of *twice* the leash let one completion recorded at six turns arm a
  five-turn one, until three cut runs and a leashed completion put the bound at
  the leash itself and let a run the leash cut raise the need it disproved
- **What a recurring job does to the notes** — the same lesson re-banked every
  run until every slot a session reads held one fact; dedup at the append
  seams, and the close-out shown what is already on file: D-073
- **Mid-flight runs** — the carry-on brief out of the prompt, the router's
  shortcut guard, and what a continuation may credit — closing for
  continuations the recipe-key gap D-072 closed for hinted sessions: D-074;
  D-119, where a continuation inherited its parent's PENDING.md and wore a
  stale account, so the file joined the paperwork that never forwards; and
  D-120, the same identification arriving at standing approvals — keyed by
  the root sentence, never the reply transcript; and D-146, where the
  carry-on brief pointed at the exact file that rule leaves behind — the
  first paid More Time leg re-derived its parent's thorough report as "the
  last run never reported" — answered by the report riding renamed
  (PREVIOUS-RESULT.md, newest in the chain, shared as one constant with the
  brief) and invisible to every delivered/produced check
- **The overnight campaign** — 27 runs pre-priced and driven end to end
  through the API in one night: the free tiers' real population measured,
  learning showing in the standard rather than the price, the class-tag tax
  at n=3, the first crew-authored skill installed and measured on the next
  world, the review flow's unobserved paths exercised, and two latent bugs
  found, reproduced and fixed before morning: D-118 (with D-119, D-120)
- **Acting, and the apps worth acting on** — the outbox replayed at approval,
  which closes §15's "one decision, not seven tasks": D-075; the two
  credential shapes and the never-a-password rule: D-076; the researched
  batch, its tiers and its refusals, WhatsApp personal among them: D-077;
  and the token drawer that keeps `.env` the only store and validates every
  paste with one real call before storing it: D-078; the intake ask-card that
  notices a send, forks honestly, and finally tells the session the outbox
  contract — with the parked-job status refused a second time: D-079; and
  the first Connect button — Google by loopback OAuth against the user's own
  client, the gmail channel that sends as them, and the 7-day trap given a
  sentence at both ends: D-080; WhatsApp Business as templates with the
  drawer learning to validate a secret *set* whole, and the audit taking a
  declared price or none: D-081; standing approval — earned by unchanged
  reviews, locked to a recipient allowlist, revoked by any change, and
  deliberately not called a leash: D-082; and the ask finally floating over
  the agentling as the mock drew it, with the bar card as the fallback that
  makes the diorama optional: D-084; and D-085, where the desk's first live
  miss ("send a mail") grew the channel vocabulary by one noun, with the
  verb list refused on the counter-case; and D-086, where a review found
  D-084 had kept the mock's sheet but not its contents — the bubble now
  wears the mock's dress (title, quoted sentence, logo rows, connect
  buttons) while the bar keeps the dense desk card, one mechanism in two
  frames; and D-087, where a real 6¢ run whose whole delivery was a
  question taught the desk to ask the send's two facts on the card, Start
  to arrest a knowably doomed queue for one extra press, and a failed
  run's question to carry a reply box that continues the same job, channel
  and all — the parked status refused a fourth time; and D-088, which
  finishes what D-086 started — Settings becomes the mock's garage (cards,
  marks, honest pills, the switch, and a served shelf of planned and
  never-with-why), the drawer's steps get their numbered squares, and the
  outbox review wears the channel's mark with a recipient's initial on
  every row — presentation only, over the same mechanisms
- **The agentling's file** — two tabs from an approved mock: lessons as
  one-line rows tagged by the job that taught them (stamped at close-out
  going forward, dedup taught to ignore the stamp), a per-member record
  read off the ledger's `agentlingId` rows, and Abilities holding tools,
  skills — with a hand-to-the-role picker that respects D-050's tiers —
  and reach, stated honestly as the level's: D-089; and D-090, the first
  real send job of the demo loop slipping past the desk as a participle
  ("to be sent … on Telegram") — every send verb now claims in its
  inflections, verb-side only so mentions stay quiet, and a reply may
  supply the channel the original never carried, through the same gates;
  and D-091, the third wall of the same demo — the desk accepted a name
  where Telegram's contract wants a number, so the arrest now checks the
  recipient against the channel's own shape and quotes the value on the
  button before money moves; and D-092, which retires the number-ferrying
  entirely — the opted-in audience persists as a named roster (getUpdates
  merged with the send audit, nothing imported), the To field becomes a
  picker, Settings lists who the bot knows with a forget button, and the
  session brief carries the legend so "send it to Pepo" resolves with the
  never-invent rule intact; and D-122, where Gmail's roster reads the saved
  contact book on the consent already given — reachability vs autofill is
  the channel's own rule — and the legend narrows to named-or-used, capped,
  for every channel; and D-123, where the compose-field list ("other
  contacts", everyone ever emailed) joins on a widened consent whose
  granting act is the user's own reconnect; and D-124, where calendar stops
  being silent at the desk — "Who's invited?" (optional, the gmail book
  behind it) and the title verbatim — and every audience seam maps
  calendar to gmail through one function; and D-093, wall 4 (a typo'd "Sen") answered at
  both gates — a channel word with no send verb raises a near-miss
  *question* the user can confirm into the full send surface, and a job
  that mentioned a channel it never carried says at review that approving
  sends nothing, with the reply as the way out; and D-094, from the first
  real sends — "to Pepo" prefills To through an alias a reviewed send
  taught the roster (unique match or nothing), and "send the same again"
  reuses the audited body verbatim, since sends.jsonl now records what
  was said; and D-097, from reviewing that run as a user rather than as
  its author — a send carrying no content had nowhere to put the message,
  so the desk now asks for the **words** instead of a gist whenever
  stripping the send words, the channel words and the roster's names
  leaves nothing behind, and a send it holds whole is composed in code for
  nothing rather than paying a session to copy two strings; and D-101,
  standing approval's first firing — three $0 compose approvals, the
  grant ten seconds after the third earned the offer, then a fourth run
  sent 906 ms after finishing with no review — plus the wall on the way
  there: a ready channel renders no send card, so the Words fell to an
  optional-looking loose row, a skipped field queued a 26.8¢ session that
  could only block on "what to say", and Start now arrests "no message"
  beside D-091's shape check; and D-104, the surface finished — Slack on
  telegram's whole shape (the Web API's 200-with-ok:false verdict read in
  the body), calendar events on D-080's already-given consent through the
  contract's one event block, GitHub comments as the first write on the
  reading connection, and scoped claim verbs that widen detection without
  loosening it; and D-134, the fourth arrest and the first that guards a
  non-send sentence — "the attached X" with nothing attached, built the
  evening its 5.3c evidence arrived; and D-144's fifth — "build me a
  level" pointed at the New Level door, claiming forms only, built the
  evening its proof sentence was typed; and D-135, the failed modal's reply
  given standalone wording and btn-more's amber, because "Or …" trailing
  buttons a failure never renders read as close-only; and D-136, the
  failed card's button saying SEE WHAT HAPPENED instead of promising a
  verdict, and every review opening with `the ask` — the verbatim prompt
  and its desk clarifications, the trace from result back to question
- **Recurrence** — the timer that queues a sentence again on its own cadence,
  fired by a server sweep through the same glue `/work` uses so the new way
  in is quoted like every other, with downtime collapsing to a single
  catch-up firing: D-103, the first row ticked off the 2026-08-06 capability
  review's `GAPS.md`
- **Composite work** — sentences split where the user said "then", each step
  an ordinary job with its own recipe key, tier and quote, files flowing
  forward as the next step's input/ and a failed step halting the chain:
  D-105, the review's G3 — with open-ended goal decomposition deliberately
  still parked in M6; and D-106, where the repeat row learned to schedule
  **without** running today and to say the first firing's date, found by
  T5's own rule the first evening anyone used the timer

## D-001 — 2026-07-29 — Named "Agentlings"; separate from IGPL

Named "Agentlings" (agents + -lings, Lemmings homage); lives at
`Escritorio\Agentlings` as a sibling of IGPL, fully separate context.

## D-002 — 2026-07-29 — Adopted the Karpathy-inspired behavioral guidelines

Adopted the Karpathy-inspired behavioral guidelines
(multica-ai/andrej-karpathy-skills) as the base of this CLAUDE.md.

## D-003 — 2026-07-30 — Concept resolved: a personal real-work orchestrator

Concept resolved (design interview): personal real-work
orchestrator for local coding jobs; literal 2D world; independent job
queue; sandbox + review outputs. Details in SPEC.md.

## D-004 — 2026-07-30 — Stack: TS monorepo, Vite/React/PixiJS web, Node/Hono/ws server

Stack: TS monorepo (npm workspaces) — Vite + React + PixiJS
web, Node + Hono + ws server, Vitest; Claude Agent SDK planned as the
real executor (M1).

## D-005 — 2026-07-30 — External-app access is in-app MCP, never reused connectors

External-app access for agentlings happens in-app (MCP
connection registry, per-job opt-in; sketch in SPEC.md M2) — never by
reusing claude.ai / Claude Code connectors.

## D-006 — 2026-07-30 — Agentling identity: roles, skills and memory in Claude-native formats

Agentling identity: per-agentling roles in Claude-native
formats (subagent .md in `roles/`, SKILL.md in `skills/`, installable
from GitHub URLs), per-agentling memory files, profile popup on sprite
click. M0 stores identity; the M1 executor enforces it. See SPEC.md.

## D-007 — 2026-07-30 — M1: the real executor is one SDK session per job, in a child process

M1 built: real executor = one Claude Agent SDK session per
job in a child process (agent-runner.mjs, plain node) with laundered
env — never import the SDK into the server/tsx process (it wedges the
loader). Repo jobs: local clone + DIFF.patch review; promote =
git apply. Auth via .env (see .env.example).

## D-008 — 2026-07-30 — Visuals phase 1: one master palette drives everything

Visuals phase 1: one master palette (DB32) drives every
theme, sprite and thumbnail; canvas scales by whole numbers with
letterbox; optional CRT filter; iris-wipe transitions; particles;
Press Start 2P (OFL) for signage only.

## D-009 — 2026-07-30 — Visuals phase 2: art is data

Visuals phase 2: art is data. `npm run art` bakes the
hand-authored frames into `web/public/art/agentling.png` plus an
Aseprite-shaped atlas (cycles name their frames, since ours reuse them);
the runtime prefers that sheet and falls back to the same frames as JSON,
so the two can never drift. Anything loaded is snapped onto DB32, which
is a no-op for our own art and is what makes an outside pack belong.
The palette moved to `packages/shared` — it is a product decision, not a
rendering one.

## D-010 — 2026-07-30 — Visuals phase 3: keep the built-in art, and fix the contract

Visuals phase 3 (art source), resolved: **keep the built-in
art**. It is original, coherent and already DB32; now that phase 2 makes
swapping it a file copy, the decision is reversible and does not have to
be made under pressure. What is not deferred is the contract — a pack
must supply walk/work/deliver by name, uniform frame size, facing right,
feet on the bottom edge, transparency not a matte; `npm run art:check`
enforces it and `art/PACK.md` is the brief. Any resolution is allowed:
the world scales to frame height. A pack's licence lands in this repo,
so terms get recorded before installing — free rarely means
unconditional, and committing a pack here is redistribution.
Deferred: making `drawScenery` data-driven, which every external-terrain
route needs. It is a large rewrite whose whole point is how it looks, so
it waits for a Browser pane that is actually displayed — the hidden pane
freezes the render loop and it would be reshaped blind.

## D-011 — 2026-07-30 — M3: user-friendliness for a non-expert

M3 direction (user-friendliness for a non-expert): every
setup step becomes a plain-language sentence. The concept matcher is
local, deterministic and required to work with no auth and no network;
an LLM tier only ever refines it. Intent words outrank domain words;
confidence leans on coverage; unknown words surface as gaps that will
drive library search. Library installs stay preview-first and
SHA-pinned — an installed role or skill is executable instruction, and
the user is not an expert. See SPEC.md M3.

## D-012 — 2026-07-30 — The cost model: estimating and measuring are one loop

Cost model (designed for pass-through billing, even though
use is personal today). Estimating and measuring are two halves of one
loop, not alternatives: the router already sorts work into three tiers
with genuinely different cost behaviour (routed = certain zero, recipe
hit = narrow band from observed history, cold job = bounded by maxTurns
× model), so a quote is a lookup over history rather than a model, and
it tightens as recipes accumulate. Decisions: quote a ceiling and
enforce it, so the user is never billed above the quote; the app absorbs
jobs that cost money and fail, which puts the incentive on failing fast;
the ledger records observed cost and chargeable price as separate
numbers from day one, because a ledger cannot be reconstructed
retroactively; quotes are shown in money with the certainty stated.
Observed cost comes from the SDK's total_cost_usd — no price table to
maintain. Reselling model access has terms implications Brian should
confirm with Anthropic before billing anyone.

## D-013 — 2026-07-30 — Structural: the boot flow, and levels as independent workspaces

Structural: 90's boot flow (title → level select →
level). Levels are independent workspaces (own crew/jobs/memory +
per-level KNOWLEDGE.md fed only to that level's sessions); the
roles/skills catalog stays global. Crews start at 2, hire in-level.
Themes are hand-tuned palettes; card thumbnails render from them.
Legacy cave migrated to levels/hq. Details in SPEC.md.

## D-014 — 2026-07-31 — Terrain is data, closing the phase-3 deferral

Terrain is data, closing the phase-3 deferral. A theme used
to be fifteen colours and nothing else while `drawScenery` drew a cave
regardless, so Home Chores rendered stalactites and hanging vines in
beige. Scenes are now data (`world/scene.ts` + `world/scenes/*`), and a
theme names a place as well as a palette. The design decision worth
keeping is what the format is **not**: not a drawing language. Composing
seeded speckle, mineral veins and a jagged ceiling out of primitives ends
in a small unauthorable programming language, so the vocabulary is
parameterised *idioms* — ceiling, speckle, veins, tufts, repeat, band —
plus three primitives. Coordinates are `"groundY-40"`, one regex, not an
expression evaluator; colours are theme slot names, so a scene never
hard-codes a palette. Each top-level op draws from its own seed, because
a format where inserting an op repaints everything after it is one nobody
can author in. The interpreter targets a `Surface`, so the same data
paints the world, the level cards (previously a second hand-drawn cave
that could disagree with the level it previewed) and a recorder in tests.
The cave is transcribed op for op — the built-in art is kept, as phase 3
decided; only its noise falls differently. chalkboard and marble point at
the cave until someone writes them, which is now a data file rather than
a rewrite. External terrain packs are unblocked but deliberately not
built: no loader ships until there is a pack worth loading.

## D-015 — 2026-07-31 — One-shot became a short leash, measured

One-shot became a short leash (3 turns), measured. At one
turn the tier could not work: a turn ends before the model sees any tool
result, so anything that must read before it writes — every repo job — is
impossible. Run live it failed on max_turns having written no files at
all, and cost **more** than the full session it replaced ($0.17 vs
$0.14), since it paid for the system prompt with no cache to read. At 3
turns the same job produces a correct, promotable diff for ~$0.11 against
~$0.27–0.44 for the 8-turn run. A recipe means explore less, not work
blind. Two bugs fell out and are fixed: promote refused to apply a failed
job's patch while still stamping it "promoted" (silent no-op — the worst
outcome), and a failed run was filed as tier `session`, polluting the
history the quote reads. Still open: a short-leash run ends `failed`
because the RESULT/LESSON/APPROACH write-up does not fit in 3 turns, so
the diff is promotable but the card reads as a failure. **Resolved the
same day**: a run that dies holding a diff is now `partial`, its own
status, reviewable exactly like finished work — the output was good, only
the label was wrong. Cancelling stays `failed` even with a diff, since you
stopped it on purpose. Measured across eight runs the leash yields a
usable diff roughly two times in three, for ~$0.11 against ~$0.44; the
prompt trim (a recipe run is not asked to re-write the method it was just
handed) is principled but its effect was within noise at this sample size.
**Reliability fixed by measurement, not tuning** (2026-07-31): watching
the tool calls live showed every repo run opening with `ls` or
`Get-ChildItem` before it could do anything — one of three turns spent
discovering a layout the server already knew. The clone's file listing now
goes into the prompt, and the orientation call disappeared from every
trace: 4/4 runs produced an identical diff, against 3/5 before. The lesson
generalises — when a run is short of turns, look at what it spends them on
before spending more of them. Recipe matching
left strict deliberately (same-shape jobs score 0.33 against a 0.65 bar)
— revisit with evidence, not intuition.

## D-016 — 2026-07-31 — The cost ceiling, corrected by measurement

Cost ceiling, corrected by measurement. The mid-flight
dollar check could never work: the session stream carries no running
cost. Measured — the only `total_cost_usd` in a 35-message session
arrives on the last one, and per-message usage is partial (52 output
tokens reported against a true 568). So the check only ever fired after
the money was spent, and its sole effect was to relabel a finished
session as failed. Replaced with the budget that binds *before* the
spending: the quote is divided by observed cost-per-turn to set
`maxTurns`. It only ever tightens — a rich quote must not let a job run
longer than its role allows — and with no history the role's budget
stands. Priced per turn *granted*, not per turn the SDK reports: those
are different quantities (a cap of 4 came back as 6), and pricing
against the reported number left budgets ~1.5× loose *for capped runs*;
measured later across real history the distortion runs both ways, since a
run that finishes early reports fewer turns than it was granted, so the
fallback was noise rather than a one-way bias (corrected 2026-07-31, and
the fallback is now gone: only `turnsAllowed` rows price a turn). Note the
user was
never over-billed: `priceFor` already caps charges at the quote. What
was unbounded was the app's absorbed cost.

## D-017 — 2026-07-31 — The quote's feedback loop was open

The quote's feedback loop was open, found by running it end
to end: quote a job, run it, compare. A job quoted at 30c — "about 15c,
done this 4 times before", *high* confidence — cost **59c**, ran out of
turns and filed `partial` holding a good diff. Billing held (`priceFor`
charged zero, the app absorbed all of it), but re-running the estimator
afterwards showed the quote for the identical next job had not moved a
cent. `history()` read `done` rows only, and the runs that break a quote
are exactly the ones that exhaust their turns and file failed or partial,
so the average could not see its own worst cases: it saw 4 scribe runs at
a mean of 15c while 5 runs had really cost money, at 24c — $0.59 invisible,
and the same hole hid $0.60 of worker spend. Fixed by counting every run
that spent money, in `history()` and in quoteFor's tier fallback alike.
That nobody is billed for a failure is a *billing* decision and `priceFor`
makes it; a quote bounds spending, and spent money is spent whatever the
outcome. The scribe quote moved to "about 24c", ceiling 50c. Three things
stay open **deliberately**, and all three are the same shape — a mechanism
that is correct but currently inert. The turn budget still never binds:
quote ÷ rate came to 17 turns against a role cap of 8, before and after, so
the ceiling from `b3be508` does nothing wherever the cap is the smaller
number. `DEFAULT_CEILING_USD` clamps the learned ceiling at 50c, so a
repeat of that same job would still breach by ~19%. And the job class is
the *matched* role, so wording that matched `mason` — a role nobody holds —
quoted off the tier average instead, moving the same work from "about 15c,
high confidence" to "up to 50c, first time". Cost per turn is not a
property of a role either: this run burnt 7.4c/turn against a class rate of
1.8c, driven by 280k cache-read tokens on a repo job, which the class key
does not record. Across the whole history, 3 of 6 quoted runs breached.
**The first of the three resolved the same day**, and the fix was the last
sentence rather than the first: the clamp was never the problem. A ceiling
binds exactly when the rate exceeds ceiling ÷ role cap — 50c ÷ 8 = 6.25c a
turn — and the work really burnt 7.4c, so it *should* have bound and only
failed to because the rate was pooled across repo and non-repo runs. So the
ledger now records `hasRepo` and `costPerTurn` narrows to runs of the same
shape. The separation is not marginal: per turn, repo runs cost 4.4× a
scribe's non-repo runs and 10× a worker's. On the real ledger the measured
job now budgets 6 turns for a predicted 44c under its 50c ceiling, where it
took 8 and spent 59c; worker-with-repo correctly stays at 8, since 8 turns
at its rate still fits. Rows written before the field are left unshaped
rather than assumed — mixing them back in is the averaging that caused
this — so a one-off `scripts/backfill-ledger-shape.mjs` reads the shape back
off the job records still on disk, which is where repoPath always lived;
without it the fix would have been correct and inert. The quote is
deliberately *not* segmented the same way: it stays the promise to the user,
and the budget is how the promise is kept.
**The second resolved the same day too.** `DEFAULT_CEILING_USD` was one
constant doing two jobs: what a quote says in ignorance, and the most a
quote may ever say. Conflating them made the quote promise *less* than the
history it was reading — it held evidence of a 59c run and promised 50c, so
it broke a promise it had the evidence to keep. Split into
`DEFAULT_CEILING_USD` (ignorance, still 50c) and `MAX_CEILING_USD` (runaways
only, $2), with `AGENTLINGS_MAX_COST_USD` now an absolute cap rather than a
default. Scribe's ceiling becomes 71c and that run is covered. The
consequence is worth stating plainly rather than discovering later: an
honest ceiling **un-binds** the turn budget, because the budget was only
biting while the quote was artificially low — 8 turns at 7.5c is 60c, inside
71c. That is not one fix undoing the other; they are alternative routes to
the same guarantee. Make the promise true, or make the spending fit a
smaller promise — both prevent a breach, only the second shortens the run.
The budget stays live as the backstop and fires the moment a ceiling is
genuinely tight: measured across caps, $0.40 gives 5 turns and $0.25 gives
3, every one of them inside its quote.
**The third was a mislabelling, not a pricing bug.** The class was
`job.preferredRole`, the role the *matcher* named — but `nextUnassigned`
deliberately lets any free agentling pick up work routed to a role nobody
holds, and the session then runs as *their* role: their prompt, their tools,
their turn cap. A mason job done by a worker was therefore filed as a mason
job, building a history for work that never happened while robbing the role
that really did it, and the rate lookup then found no mason history and fell
back to the role cap. Latent rather than realised — 0 of 23 checkable rows
were mislabelled, since every job so far happened to be taken by a matching
agentling — so nothing needed backfilling. Now the ledger records the role
that ran, the rate prices by the role about to run, and `runnerRole()` in
work.ts predicts it for the quote. Measured on the phrasings that exposed
it: "add tests for formatUsd" matches `mason`, which nobody holds, and
quoted "up to 50c — first time doing this" off 0 samples; it now quotes
"about 17c — done this 9 times before" off Pip's worker history, because Pip
is who actually does it. The instability is reduced, not removed, and what
remains is honest: the same sentence can still land on a scribe (28c) or a
worker (17c), and those really are different costs.

## D-018 — 2026-07-31 — Confirming the four fixes live, and the ceiling breached again

Confirming the four fixes live, and the ceiling breached
again. Job `d618e774`, matched to `mason` which nobody holds: the class fix
is proven — the row reads `jobClass: worker`, the role that actually ran it
(Pip), where the old code would have written `mason`. The learning loop is
proven too: quoted 52c, cost 81c, and the *next* quote for the same sentence
moved to 97c immediately, because a failed row is no longer invisible.
But the quote was **breached 1.55×**, and the prediction that produced it was
mine: I forecast 46c from a 3-sample rate of 5.7c a turn, and the run burnt
10.1c a turn. So `hasRepo` is necessary and **not sufficient** — within repo
jobs the per-turn cost still varies about twofold, driven by how much the
job writes (391 lines, 11.8k output tokens, 288k cache read here), which is
not knowable before it runs. The honest position: the turn budget can never
bound cost more tightly than its rate estimate is accurate, and across the
two live runs the ceiling held once (45c under 50c) and broke once (81c over
52c). It is not established that it holds. What *is* established is that
nobody is ever over-billed — `priceFor` capped the charge and this run, like
every failure, was absorbed at zero. The 391-line diff also did not work
(24 of 25 tests passing), the first of the three measurement runs to produce
something unpromotable, so it was discarded. **The failing case was the
test's fault, not the code's** — worth recording because it is the failure
mode to expect from generated tests. It ran one prompt twice and expected
the second run to update the recipe, but a first run with no repository and
no web stores an *answer*, so the repeat is replayed by the router and no
second session ever happens (verified: `decide()` returns `answer` without a
repo and `oneshot` with one). The same file asserts that answer is stored,
three cases earlier — it contradicted itself. `rememberRecipe` updates in
place correctly and recipes.test.ts already covers it. The reachable version
of that test needs a `repoPath`, which is the one shape where an exact repeat
really does run again. Note also that three of the
last four runs ended `partial` on max_turns: the role cap of 8 is now the
binding constraint on whether work finishes, not the money.

## D-019 — 2026-07-31 — The crew was not learning, and it is the same bug a third time

The crew was not learning, and it is the same bug a third
time. Asked whether a successful job is banked permanently, the honest
answer came from the data: 36 jobs, **1** of them free, 8 recipes stored and
**every one with `hits: 0`** — not one had ever been reused. Two causes. The
match bar is 0.65 while real same-shape jobs score 0.33, which was left
strict deliberately. The other was a defect: `RoutedExecutor` credited and
remembered only after `fallback.run` *returned*, so a session that threw
skipped the lot — and **all 13 recipe runs failed**, because three turns
usually go on the work rather than the write-up. The tier built to be cheap
was the one tier that could never teach anything. `SessionFailure` already
carried the approach for precisely this ("so the caller can still bank the
cost, the lesson and the diff"); this caller dropped it. Now both happen
whether or not the run finished. One thing deliberately does **not**: the
*answer* is still only ever taken from a run that returned, because an
answer is replayed to the user word for word and a failed run's summary is
its error message — banking one would serve "ran out of turns" as the answer
for ever. Worth naming the pattern, since this is its third appearance after
the quote history and the ledger's job class: **anything that learns only
from clean successes goes blind exactly where the short-leash tier puts most
of its runs.** Look for that shape before looking for anything else.
Still open and now the interesting question: recipes make repeat work
*cheaper*, never free, because notes still have to be read by a paid model.
The only route to actually free is the crew turning a repeated job into a
script the router can run in code — a fourth shortcut tier that does not
exist yet.

## D-020 — 2026-07-31 — Learning sweep: the write-up moves out of the session

Learning sweep: the write-up moves out of the session, the
matcher gets two bars, and the fourth tier is counted before it is built.
Framing first, because it decides everything else: none of this is
reinforcement learning and calling it that leads to bad choices. No weights
change; a stateless model re-reads notes every time. What can actually be
built is a **compiler** — the agent *interprets* a task, a tool is that task
*compiled*, and learning is moving work down the ladder from one to the
other. That also fixes the criterion for calling the API: pay for judgement
that has not been compiled yet, and nothing else. It sets the ceiling too —
"add tests for module X" never compiles, because the assertions depend on the
module; "generate the skeleton for <file>" does. Tools take the scaffolding,
sessions keep the judgement.
**The write-up moved out.** It used to compete with the work for turns, so it
was cut first — a recipe run was explicitly told not to write LESSON.md or
APPROACH.md — and the tier built to be cheap became the one tier that could
never teach anything. Now no job is asked for them at all. A close-out pass
runs afterwards on a cheap model with one turn, handed the run's own RESULT.md
and the *names* of the files it changed, never the patch — the point is a
write-up costing about a cent, and a diff is what makes a turn expensive. It
runs after every job that left anything behind, including the ones that died,
which are most of them. Its cost is recorded as `closeOutUsd` inside
`costUsd`: counted in the total, kept out of the per-turn rate, because the
write-up is a fixed errand rather than something the turn budget can buy more
or less of. Its own failure is swallowed — a missing lesson costs the crew a
note, and throwing would cost the user their work.
**Two bars, not one.** Same-shape jobs scored 0.33 against a 0.65 bar, so the
crew never recognised its own work. Fixed by stemming, by weighting rare
words above common ones, and by splitting the threshold: a strong match still
shortens the run to three turns, while a weak one (0.3) hands over the method
and leaves the leash alone. The asymmetry is the whole argument — a wrong
method given to a full-length session wastes a turn it can ignore, and the
same wrong method with the leash cut wastes the entire run.
**The fourth tier is counted, not built.** A recipe now tracks `successes`
apart from `hits`, since a recipe used ten times and never once successful is
a candidate for nothing. A job matching a recipe with three successes appends
to `tool-candidates.jsonl` and *nothing else happens*. Promotion would cost
about a session and save a fraction of one per reuse, so it pays back around
the third to fifth use — and this machine has seen one repeat in 36 jobs. The
counter answers whether there is anything to compile before a compiler gets
written.
Three of my own claims were wrong on the way and the corrections are the
useful part. `KNOWLEDGE.md` is **not** fed whole and does not grow without
bound — `readKnowledge` already capped it at the last twelve lines, so the
defect was never cost, it was that twelve *recent* notes are not twelve
*relevant* ones; sessions now get the top eight by relevance, through the
same `relevantLines` the recall tier uses. Rarity weighting made matching
**worse** at first: with one recipe on file every word it uses appears in
every document, so the shared words — the entire signal — got weighed to
nothing and a job stopped matching itself; it is off below five recipes. And
the first stemmer turned "invoices" into "invoic" while leaving "invoice"
whole, breaking the exact pair it existed to fix; stripping a single "s" and
never "es" is worse linguistics and better matching. Recipe `terms` are now
recomputed from the key on read rather than trusted from disk, so the next
change to stemming strands nothing and that migration never has to be
written.
**Confirmed live, after the close-out failed twice for reasons worth
keeping.** First it wrote its config and produced nothing, because the catch
that stops a missing note from costing the user their work also hides why
there is no note — a silent failure by design, and the diagnosis needed a
probe that spawns the runner with the same laundered env the server uses.
Run from a plain shell it 401s instead, which is a different bug and a
waste of an hour if believed. Then, properly reproduced: at one turn it
spent that turn calling `Read` on the file it had just been told about and
died on max_turns having written nothing — the same orientation turn repo
runs used to waste, and the same reason a one-shot cannot work at a single
turn. Fixed by telling it not to go looking and giving it two turns for when
it does anyway. End to end on a real job: `closeOutUsd` **2.1c** on the
meter, LESSON.md and APPROACH.md written, a recipe stored with a method, and
the agentling's own memory file one line longer. So the crew is measurably
different after a job, which is the thing that was broken. Note the cost
estimate was optimistic — "about a cent" measured 2.1–2.3c, about 4% of a
50c repo job but nearer 17% of a cheap one, so the write-up is close to free
on the work that matters and merely cheap on the work that does not.

## D-021 — 2026-07-31 — The fourth tier: a tool is a job compiled

The fourth tier, built on request rather than on evidence. The
standing recommendation was to wait for the candidate counter to show repeat
work, and it still shows one repeat in 36 jobs — so this is machinery for a
demand that has not appeared yet, built deliberately with that known. What
makes it worth having anyway is that the design question is interesting and
the answer is reusable: **a tool is a job compiled**. A recipe saves the
exploring and still pays a model to read it; a tool removes the model, which
is the only way a cost per task actually falls. A tool is a directory with a
manifest and two plain-node scripts, `run.mjs` and `verify.mjs` — no shell,
no dependencies, no network, so it neither cares about the platform nor
reaches anywhere it should not. The ledger gets a `tool` tier kept apart from
`routed`, because routed work was never paid for while a tool is work that
used to be: only the second says the crew is getting cheaper.
Every design decision here is a refusal to trust the thing. It matches on the
**strong** bar only and on shape as well as words, since a script written
against a clone is wrong where there is no clone and the two jobs read
identically. It must **prove its own output**, checked in a second process
because a run that crashed cannot be trusted to report that it crashed; work
it cannot prove is discarded and the job is paid for properly. Two failures
in a row retire it, and a hang is killed at a timeout — a compiled tool that
hangs has stopped being cheaper than the session it replaced. The promotion
brief insists on the check harder than on the script, because without one the
tier is only a faster way to be wrong.
Promotion is a **request**, never automatic: it spends money, and a promotion
nobody asked for is a charge nobody quoted. It refuses a recipe that has not
landed three times. The manifest is written before the compiling session
runs, so a half-written tool exists for a while — `usableTools` filters it out
rather than letting it win a job away from the recipe hint that would
otherwise have helped.
One process note worth keeping: reverting a mutation with `git checkout <file>`
destroyed an hour of uncommitted work in that file, because the mutation
trick is only safe on a file that is already committed. Mutation-test after
committing, not before.
**Run end to end with a real repo tool, and it found two design faults that
no unit test could.** First, the promotion brief told the session to write
into `.agentlings`, which every session is simultaneously forbidden to do —
the job rules say work only inside the sandbox. The fix is the better shape
anyway: a generated tool is executable instruction, which is why library
installs are preview-first, so the compiling session writes `run.mjs` and
`verify.mjs` into its own sandbox like any other output and they are copied
into the tool directory only on promote. Second, and only visible by looking
at the working tree afterwards: the compiling session sensibly ran its own
script to check it worked, which left the output file inside its clone, and
promoting the compile carried that stray file into the real repository. A
compiling run's deliverable is the tool, never the clone it tried the tool
out in, so promote no longer applies its patch. Both faults were invisible
to 444 passing tests and obvious within one live run.
The measurement: compiling cost **34c** and 7 turns; the tool then did the
same job in **1.06 seconds for nothing**, against ~110s and ~34c for the
session it replaced, and the ledger shows it under its own `tool` tier. The
generated `verify.mjs` is the part worth reading — it recomputes the answer
from the file system independently and diffs it both ways, checking sorting,
duplicates and malformed lines, rather than the file-exists check the brief
was written to forbid.
**The fall-through, tested live by injecting a fault, found two more.** The
bug injected into the installed `run.mjs` was that it stopped recursing, so
its output was plausible and quietly incomplete — one entry where there were
three — which `verify.mjs` caught exactly as designed. The fall-through then
**crashed the job outright**: `runTool` clones the repository, and the
fallback session cloned into the same path and died on `destination path
already exists`. Discarding a tool's *result* was never enough, because the
tool's files are the work; the sandbox is emptied now. Second, the job had
been quoted **free** on the strength of that tool and then cost 28c. A
promise of free arriving as a bill is precisely what the quote exists to
prevent, so a run that falls back from a tool is absorbed: `toolFellBack`
reaches the ledger as `priceUsd: 0`. Proven live afterwards — job done, cost
28c, **charged nothing**, the tool struck twice and retired itself with
`failed 2 runs in a row`, and the same sentence then quoted "up to 22c" as an
ordinary session instead of "free". Both faults were invisible to 444 passing
tests and to the mutation test of the very branch they were in, because both
live in what the *next* step sees rather than in the branch's own logic.

## D-022 — 2026-07-31 — The turn caps, set by asking what actually gates the loop

The turn caps, set by asking what actually gates the loop.
`DEFAULT_MAX_TURNS` 8 → **10**, `RECIPE_TURNS` 3 → **5**. The reason is not
that runs felt cramped; it is that **`successes` only counts runs that
finish, and a tool is promoted on three of them**. A leash a run always
breaks therefore does not merely slow the loop down, it severs its last
stage: a recipe can be used forever and never become compilable. All
thirteen recipe runs on record ran out at 3, so the fourth tier was
unreachable by the ordinary path — the end-to-end test only worked because
the successes were seeded by hand, which was disclosed at the time but
mattered more than it looked. Cold repo runs that finished used 4 and 7
turns *with no method handed to them*, so 5 still explores less while being
able to land. For the default, moving the write-up off the session bought
back the turns it used to cost — measured, 8 of 11 runs ran out before the
close-out and 0 of 3 after — and the one substantial repo job since used 7
of 8. A wasted turn costs about 7c; a capped run costs a `partial` that
contributes nothing to promotion. Cheap to be generous, expensive to be
tight. Both remain ceilings: the quote's turn budget still tightens below
them when the money is short.
One measurement correction fell out. A cut-off run reports exactly
`turnsAllowed + 1` — 9/8, 7/6, 4/3 eleven times — so the reported `turns` on
a cut-off run is a *marker* that it ran out, carrying no information about
how many turns it wanted. The log's earlier "a cap of 4 came back as 6" is
not what the data shows now. The conclusion it supported is unchanged and
in fact stronger: price a turn by `turnsAllowed`, never by the reported
count. Confidence is asymmetric and worth recording — 13/13 is not
ambiguous, whereas the default rests on n=2 repo runs since the close-out,
which by this project's own small-n rule is an estimate rather than a
finding.
**Raising the leash was not enough, and checking before spending caught it.**
The oneshot tier quotes from its own history; that history was the thirteen
runs that died at three turns costing ~11c, so it quoted 22c, which funds
three turns — the leash that was failing. `RECIPE_TURNS = 5` was inert on
arrival. This is the same bug a third time, one level up: a mechanism reading
a population its own brokenness produced, and it cannot escape by itself. Fix
is a rule that ought to have been there from the start: **a quote may never
come in under the turns it has already decided to grant**, since that is
quoting for work it will not permit. `quoteFor` takes `floorUsd` and
index.ts computes it exactly as the executor will — leash × the rate for that
role in that shape. The absolute cap still wins over the floor, because a
leash nobody can afford should shorten rather than overturn the ceiling.
Note `scribe/session` cleared its own leash by **$0.004**: not strangled
today, one rate-drift from it.
Then measured live, and it lands: `done` at **5 of 5 turns** for 13c against
a 35c quote — the first `oneshot` run ever to finish, against thirteen that
did not, and the first `successes: 1` any recipe has banked. Two more and it
is promotable to a tool without anybody seeding it, which is the compilation
path working end to end for the first time. Worth recording that it used
*every* turn of the five: it landed with zero headroom, so 5 is the floor
rather than a comfortable choice, and at 3 it would certainly have died like
the others.

## D-023 — 2026-07-31 — The promotion gate was selecting for the wrong work

The promotion gate was selecting for the wrong work, which is
the same bug a **fifth** time and the worst-placed instance of it.
`successes` decides whether a job is ever compiled into a tool, and it
counted only runs that exited cleanly. Measured on a real mechanical repo
job (write EXPORTS.md, 123 exported functions): three runs, **two of which
wrote a correct 129-line file**, scored zero. The consequence is an
inversion, not merely a delay. A big mechanical job is exactly what a script
is for and exactly what cannot finish on a five-turn leash, while a short
note explaining what a favicon is lands three times easily and *is*
promotable — despite being prose no script can write. So the gate promoted
what a tool cannot do and excluded what it could. `landed` now means the run
**delivered**, tested the way `partial` already is: a diff on disk. One
notion of a run that did the work, used in both places. Proven live
immediately: a `partial` run credited a success and took the recipe to
promotable, which under the old rule was unreachable for that job forever.
Two things fell out of the same run. The close-out writes two files and then
has to say so, a third turn it does not have — so **running out is its
ordinary ending, with both files already on disk** — and its output was
being thrown away on the exit code, which is why that recipe did not exist
and had to be rebuilt from the APPROACH.md the run really wrote. Fixed by
keeping what is on disk and taking the cost off the failure; `closeOutUsd`
of 4.6c and 4.8c now appear where before the notes *and* the money vanished.
And the cut-off heuristic used the day before is wrong: reported `turns` can
exceed `turnsAllowed` on a run that **succeeded** (12 of 10, twice), so it
agreed with the real outcome on only 29 of 31 rows and the earlier "8 of 11
ran out" was one too many. The claim that survives unqualified is the one
about shape: every repo job at the old caps failed, and repo jobs after the
close-out finish. Price by `turnsAllowed`; never read anything into the
reported count.
Cost of learning this: **$2.38 across five runs**, of which $0.71 was
chargeable and $1.67 absorbed — the billing rules held throughout.

## D-024 — 2026-07-31 — The first unseeded compile was bad, and that is reassuring

The first tool compiled without seeding was **bad**, and that is
the most reassuring result of the day. Promoting the EXPORTS recipe produced
406 lines of careful work — `run.mjs` refuses the export shapes it cannot
parse rather than omitting them silently, which is the router's own
never-guess rule applied by generated code to itself — and yet the two halves
disagreed: `verify.mjs` rejects a multi-line `export async function` that
`run.mjs` correctly lists, one line in 124. So the tool produced the *right*
answer and its own checker refused it. Every guard fired in order: output
discarded, job done properly by a session, `toolFellBack` → **charged zero**,
one strike recorded. The failure mode is worth naming precisely, because it
is not the one the design was braced for: a false negative costs money and
not trust, which is the direction the tier was built to fail in.
Two gaps it exposed. The compile session was **unquoted** — the only job in
the app without a ceiling, unbounded because nobody had thought to bound it
rather than by decision, and it spent $1.26 and still ran out of turns.
Promotion now quotes as a plain session on the recipe's role, directly rather
than through the router, since the compile sets `noRouter`. And there is no
way to retire a tool short of letting it fail twice: this one is provably
broken and self-retiring would have cost another absorbed session, so it was
retired by hand. A `POST .../tools/:name/retire` is the obvious missing verb.
A judgement worth recording for next time: a compile is worth more turns than
an ordinary job. It has to write two programs that agree with each other, and
the halves disagreeing is exactly what running out of turns produces.
**Recompiled, and the second attempt is good.** The retire verb plus a fresh
name (`write-export-repo-root-2`, the first left intact) made a second try
possible; what made it *succeed* was telling the compiling session how the
first failed. The promote response already reported the retired reason to the
caller, but nothing reached the session doing the work — so a second attempt
was an identical first try at the same price. Handed the fault and the general
form of it (the two halves disagreeing about the same input), the new
`verify.mjs` imports the shared definition from `run.mjs` so they cannot
disagree, *and* keeps an independent crude count so importing does not quietly
turn the check into a rubber stamp. That second half is the part worth
admiring: it answers the obvious objection to its own fix. It lists
`web.ts :: fetchPage` — the entry that killed attempt one — and both halves
exit 0. Run live: `tier: tool`, `costUsd: 0`, runs 1, failures 0.
The compile still ran out of turns at 10 and cost 94c, inside its $1.52
quote and charged nothing. So the turn shortage is real and unfixed; what
changed is that the work it *did* finish was better aimed. Worth noting the
quote floor did its job here — it guaranteed the compile all ten turns
rather than strangling it, which is exactly the failure it was written for.

## D-025 — 2026-07-31 — A compile gets its own turn cap

A compile gets its own turn cap, and the number came from the
money rather than from the work. Both compiles on record broke a cap of 10 —
the role's everyday budget, borrowed by default rather than chosen. A compile
is not an ordinary job: it writes two programs that must agree with each
other, and the halves disagreeing is exactly what running out of turns
produces, which is how attempt one shipped a `verify.mjs` that rejected its
own correct output. The cap belongs to the **job**, not the role — a compile
is handed to whichever role owns the recipe, and none of them should raise
their daily budget for one errand — so `maxTurns` is now a job field and wins
over the role's, while the recipe leash still wins over both (a job the crew
has done before is one it has done before, whatever it claims to need).
The number went 16 → 15 → **10**, and only the last step came from running
the thing. The ledger cannot say how many turns a compile wants: a cut-off
run reports `turnsAllowed + 1` whatever it wanted, so the reported count is a
marker that it ran out and nothing more. So 15 was set from the side that
*is* knowable — what the quote can fund, since a cap the money cannot honour
is handed straight back by `turnsForBudget` and arrives inert, exactly how
`RECIPE_TURNS = 5` landed. (I proposed 16; the test written to prove it
refuted it, at the dearest observed rate `MAX_CEILING_USD` funds 15. Cheap,
and before any money moved.) `compileQuote`'s floor moved to the same
constant, since a quote funding fewer turns than it grants is the bug
`e2a53c8` already fixed once.
**Then it was measured, and 15 was wrong.** Attempt 3 at a cap of 15 ran out
*as well* — 16 reported of 15 — and cost **$1.32** against attempt 2's
**$0.94** at a cap of 10: 40% more money for the same outcome, and comparing
the two generated `verify.mjs` files afterwards, attempt 2's was if anything
the more thorough of the two. The tool attempt 3 produced was good (125
entries, both halves exit 0, independently cross-checked, and it lists
`web.ts :: fetchPage` — the entry that killed attempt 1), so nothing was
wasted; it simply was not *better*. What fixed the compile was `4f7a561`,
telling it how the last one failed. The cap was never the binding constraint.
So the error worth naming is the inference, not the number: **"ran out of
turns" was read as "needed more turns"**. Running out is a compile's ordinary
ending, precisely as it is the close-out's — it writes both programs and dies
reporting that it did. The cap is back to 10, still stated rather than
inherited so a role raising its own `maxTurns:` cannot silently change what a
compile gets.
The quote held throughout: quoted $1.5168 (predicted $1.52 before spending),
spent $1.32, **charged $0**. That is the third hold against two breaches.
And the mislabel this exposed is the **sixth** instance of the project's
recurring bug, in the place it was hardest to see: `queue.fail` decided
`partial` from a diff on disk, but a compile's deliverable is never a diff —
its output is the two scripts and promote deliberately does not apply its
patch — so *every* compile filed `failed`, including one holding two working
programs. `deliveredTool()` in tools.ts is now the single notion of a compile
having delivered, used by `installTool` (which already refused half a tool)
and by the queue. Half a tool is still a failure.
Still open: the rate all of this is priced off is `scribe/session/hasRepo` at
8.2c, which **pools compiles with ordinary repo sessions** and understates a
compile by about a third — the same shape as the `hasRepo` split, a
population hiding its expensive cases. Worth doing only when a compile's cost
needs to be predicted, which at a cap of 10 it currently does not.

## D-026 — 2026-07-31 — The one-shot quote could never find its own history

The one-shot quote could never find its own history, found by
noticing a recipe with three successes quoting "first time doing this". Two
readers wanted different things from one field and only one of them was ever
written: the ledger always records `jobClass: agentling.role` (the runner
fix), while the quote asks for `decision.recipeKey` on the oneshot tier. They
cannot match. Measured across all 20 one-shot rows, **not one** matched, so
every one-shot quote fell through to the tier average — permanently, on the
twentieth run as on the first — and a worker one-shot was quoted 56c against
its own 22c history. Nobody was over-billed (`priceFor` still caps), but the
quote could not *tighten*, which is the entire promise of pricing from a
ledger rather than a model.
The fix is to stop making one field answer two questions. `jobClass` stays
the role that ran, because what a **turn** costs is set by the role's prompt,
tools and cap; `recipeKey` is added, because a **quote** asks "have we done
this job before" and a role cannot answer that. `quoteClass()` chooses in one
place — recipe when there is one, else role — and `costPerTurn` is untouched.
Only a one-shot is stamped: marking a full session with a recipe would take
that row out of its role's history, which is what prices a session.
Backfilled without guessing, which mattered — a recipe key *is*
`normalise(prompt)`, so a row is stamped only when the prompt on its own job
record normalises to a key that exists today. That is an identification, not
a similarity match, and it covered **20 of 20**; anything ambiguous would
have been left unshaped, since guessing is the mislabelling this change
exists to undo. Without the backfill the fix would have been correct and
inert, the same trap as the `hasRepo` split.
Measured after: the favicon recipe moved from "Up to 56c — first time doing
this" to "About 14c — done this 3 times before", high certainty; tool and
session quotes unchanged. The ceiling landed at 42c rather than the 27c its
history implies, because the **quote floor** binds — 5 leash turns at the
scribe repo rate is ~41c, and a quote may not come in under the turns it has
decided to grant.
**That floor was then found to be priced on the wrong tier, and fixed.** It
converted the leash at `costPerTurn(..., 'session', ...)` — the session rate
— for a run that was never going to be a session. Measured, a one-shot turn
costs 60–70% of a session turn for the same role and shape (scribe with a
repo, 5.7c against 8.3c; worker, 3.6c against 5.9c), because a short leash
explores less per turn. Since the floor is a *lower* bound on the quote, the
error ran one way only: the user was quoted more than the work costs. The
same hard-coded `'session'` sat in the executor's `turnsForBudget` call, so
fixing only the quote would have left the two disagreeing about how many
turns the same money buys; `rateFor()` is now the one place that decides, and
both call it. A one-shot with no history of its own falls back to the session
rate rather than to nothing — overshooting is the safe direction, and
dropping the floor would restore the bug it was written for. That branch is
live rather than theoretical: there is no one-shot history at all for
non-repo work. Favicon quote 42c → **29c**, predicted to the cent before
measuring; tool and session quotes unchanged.

## D-027 — 2026-07-31 — The unquoted way in

The unquoted way in, found by tripping over it. `POST
/api/levels/:lid/jobs` queued work with `quotedUsd` left undefined, so
`turnsForBudget` never bound and the run silently fell back to the role's
cap. Nothing in the web client used it — but SPEC documents it, and an
unquoted route into a system whose whole cost story is "the quote binds
before the money moves" is a hole in the story rather than a shortcut. It now
quotes exactly as `/work` does, and settles the **role** while it is there:
quoting on one role while another runs the session is the mislabelling this
log has already recorded twice. `quoteFor_` takes `repoPath` explicitly
instead of reading it off the level, since the shape decides both the route
and the rate.
What it deliberately does **not** do is inherit the level's repository. That
was in the first draft and taken back out: `/work` inherits, this route never
has, and quietly handing every caller a clone is a different change wearing
this one's clothes. The quote is priced on whatever the job will really run
with, which is the only property that had to hold.
Verified live on both shapes, cancelled before either spent anything: with a
repository, 27.8c — to the cent what `/work/plan` says for the same sentence,
which is the coherence that was missing. Without one, `quotedUsd` is
undefined because that prompt routes to `answer` and is *free* — not
unquoted. Those two are indistinguishable in the field and it is worth
knowing why they are safe to conflate: `quoteFor` returns a zero ceiling only
for `routed` and `tool`, and every paying tier passes through a bound with a
1c floor. So a job that costs money now always carries a ceiling.

## D-028 — 2026-07-31 — The socket was describing a world that had not changed

The socket was describing a world that had not changed, found
by scoping a leak that turned out not to exist. `seenStatus` was flagged as
unbounded; it is not — every key comes from `w.jobs`, and nothing ever
removes a job from the queue, so the map is bounded by data the client
already holds. Measuring instead of fixing found the real cost: `TICK_MS` is
100, the state payload was **41.8KB of which jobs were 98%**, and it went out
**ten times a second per viewer** — ~386 KB/s to say nothing had happened.
The measurement also killed the obvious fix. Of 54 jobs, **0 were active and
43 were awaiting review**, so "active plus the last N resolved" would have
hidden work the user still had to act on. **Recency is the wrong axis**, and
that is what intuition would have built.
Two changes instead. First, do not describe a world nobody is looking at: the
tick built and serialised every level's state regardless of viewers, and
`sendToLevel` stringified *before* checking for subscribers, so an empty
level paid the full 42KB. The sim still steps unwatched — jobs run whether or
not anyone is watching — only the describing is skipped. Second, send the job
list only when it changes. `JobQueue` counts a revision in `persist()`, which
every mutator already funnels through, so the counter is trustworthy exactly
as long as that stays true and there are tests pinning it. A frame carries
`jobs` only when the revision moved; the client keeps the last list and still
hands consumers a whole `WorldState`, so no UI knows the difference.
Measured over 12s on a live socket: 110 movement frames of **999 bytes** and
one 41.9KB list, **12.4 KB/s against 386 KB/s — a 96.8% cut**, approaching
97.6% over a longer session. The one list per viewing session is by design: a
level nobody watches forgets what it sent, so the next viewer re-syncs.
Deliberately **not** done: trimming fields from the live job (prompt is 34%,
meter 15%, repoPath 11%, none of which the canvas reads). It would be ~70%
on its own, but `ReviewModal` reads `title`, `status`, `error`, `summary` and
`changes` straight off the state object, so it needs a new endpoint and a
loading state in the one flow least worth breaking — and after the revision
change it would be optimising a message that rarely sends.

## D-029 — 2026-07-31 — The compile rate split, measured and then not done

The compile rate split, measured and then **not** done. The
standing note said the quote understated a compile by about a third, so
splitting the rate was the last item with real evidence behind it. Measuring
first took the evidence away: compiles run at **9.0c a turn against the 8.3c
pooled rate** the quote uses — **8%, not a third**. The old figure came from
comparing the single worst compile (12.6c) against the pool instead of
comparing the compile population against it, which is the error this log has
a rule against.
What the split would actually have done: raised every compile quote from
**$1.58 to $2.00** — `MAX_CEILING_USD`, so straight to the runaway cap — off
**n=3**, while changing no turn budget at all, since `COMPILE_TURNS` is the
binding cap in both cases. And it would have been guarding against a breach
that has never occurred: both quoted compiles held ($0.94 and $1.32 against
$1.52), and the one that looks worst ($1.26) was the *unquoted* one that
`ab6c354` already fixed.
So the resolution is to **record the field and not read it**. That is not
fence-sitting, it is the asymmetry: a rate can be computed from a ledger
whenever there is finally enough of it, and a ledger cannot be given a field
it never wrote — the same reason cost and price were separate numbers from
the first entry. The marker is an explicit job flag rather than a title
sniffed at read time, and the backfill stamps a row only when its own job
record still carries the exact title the promote route writes (4 of 4; 12
older rows from deleted levels left alone). Verified after: the session quote
is still $1.58 and the one-shot still "About 14c — done this 4 times before",
so nothing became less accurate in exchange for the option.

## D-030 — 2026-07-31 — A UI/UX pass, where the arithmetic decided more than taste

A UI/UX pass, four changes, and the arithmetic decided more of
it than taste did.
**Agentlings are now their own colour.** They were drawn identically and only
the hover label carried the tint, so telling five apart meant hovering each in
turn. The gown is the identity channel — the largest flat area, so it still
reads in a 27px portrait, and leaving hair and skin alone keeps the crew
looking like one crew. One definition in `tint.ts` serves both art paths: the
built-in frames swap palette entries by key, the baked sheet swaps pixels by
value. That symmetry is the point — a sprite tinted one way in the world and
another in the rail is worse than no tint, since the whole idea is
recognising someone at a glance. Matching on the two *exact* source colours
is what makes it safe on any sheet: ours is generated from the same frame
definitions, and an outside pack that doesn't use them is left alone rather
than having its highlights eaten. Measured live: 390 gown pixels swapped in
the real PNG, 5 distinct gowns, every one on DB32. One casualty worth
recording — **Pip's mint green snaps to steel grey.** The three original HQ
crew hold colours that predate the ramp, and mint sits almost exactly between
`limeLight` and `steel` under the perceptual weighting (14383 against 14244);
grey wins by 1%. Their name label stays mint while the gown goes grey. New
hires are unaffected — `COLOR_POOL` is already DB32 — so the fix is one line
in the legacy seed, deliberately not taken because it is a migration on a live
roster.
**The hover outline is a flat copy, not a tint.** Pixi's tint multiplies, so
offset copies of the ordinary frames keep their dark pixels dark and read as a
smeared ghost; `flatten` throws the detail away and eight offsets then read as
a one-pixel ring. Verified on the real sheet: 10 colours to 1, transparency
intact. Four offsets was tried and rejected — it leaves gaps on every diagonal
of this art. The colour needed its own theme slot: `accentLight` is drawn from
the same family as the rock in every theme, so cave's outline was DB.tan
against DB.tan walls and half vanished into the scenery it existed to lift a
sprite off. Signposts get a *real* silhouette because they are drawn from
primitives and can simply be drawn again offset; the door gets a ring, because
it is scenery painted from the level's own scene data and there is no shape
there to take. That asymmetry is honest and the shared colour is what makes it
read as one idea. Geometry lives in `hover.ts` because each box is used twice
— to draw and to catch the pointer — and the two drifting apart gives you a
prop that lights up somewhere other than where it is clickable.
**The terminal split was decided by a measurement, not a preference.** The
literal left/right split asked for costs the world its pixel-exactness:
1400 − 24 padding − 340 rail − 16 gap leaves 1020, and `fitCanvas` needs ≥1000
for a whole-number scale, so widening the rail to 460 drops the world to 900
and the canvas gets a non-integer CSS width. So the rail is stacked by default
and goes side by side only at ≥1560, where 1560 − 24 − 480 − 16 leaves 1040.
Confirmed in the browser at both widths: canvas CSS width exactly 1000px.
Every activity line is read off state the app already holds — the sim's state,
the job title, the last progress line. Nothing is invented, and the one
example that could not be honoured ("waiting until 5pm to report out") was
refused rather than faked, because there is no scheduler and a made-up status
cannot be acted on.
**The backoffice exists because the terminal is a feed, not an archive.** Its
events are numbered per server run and held in memory, so everything it ever
said is gone after a restart; the jobs persist, which makes them the only
durable account of what the crew has done. No new endpoint — the socket
already sends the whole queue whenever it changes, so the history is on the
client before the panel opens. Two things fell out of building it. The output
route read *every* file as UTF-8 and inlined it, so a job that produced a real
document produced mojibake; binary is now sniffed for a NUL byte the way git
does, rather than guessed from an extension list, because the interesting
files are the ones nobody anticipated. Proven end to end with a real PNG:
listed as binary, downloaded byte-identical, traversal refused. And the
panel's total read "$12.22 spent" against the ledger's $13.81 — both correct,
since the panel can only see jobs still in the queue file — but **two numbers
labelled "spent" is a defect regardless of how well it can be explained.** It
now says "$12.22 on these" and names the gap: "4 stopped mid-run, cost
unknown", which matches the ledger's `unmeasured` exactly. Folding those in as
zero is how a total comes to understate itself, which this log records twice
already.
**Clarification is pre-flight, and deliberately not mid-run.** A session is a
one-shot child process by design, so pausing one to ask a question means a
`waiting` status, a runner holding stdin, and a timeout policy for a user who
went to bed — against the grain of a cost model whose whole premise is
bounding a run *before* it starts. Asking first is also the only point where a
question can reduce spend rather than add to it. Three rules keep it from
becoming the form the one-box intake was built not to be: never on free work,
never more than three, never required. The free gate is proven live — a
sentence containing "improve everything" asks nothing when it lands on the
`tool` tier. The answers are kept **out of `job.prompt`**, which is the
non-obvious part: a recipe is keyed on `normalise(prompt)` and the one-shot
quote looks up `recipeKey`, so folding them in would give a clarified job a
different key from the same job asked plainly and the crew would stop
recognising work it had already done. The server also recomputes the questions
from the sentence rather than trusting what the client sends back — possible
only because the rules are deterministic, and it means the only instructions
that can reach a session are ones the user was shown.
**The measurement is deferred on purpose.** Whether clarifying actually saves
turns needs 4+ paired runs at ~40c each, and this log's own small-n rule says
n=2 is an estimate rather than a finding, so buying a weak answer for $1.60 is
the error this project keeps catching. Instead the job record now carries
`clarifications` and the ledger already carries turns and cost, so the
comparison is computable from ordinary traffic whenever there is enough of
both — the same resolution as the compile flag, and for the same asymmetry: a
rate can be computed from a ledger later, and a ledger cannot be given a field
it never wrote.
**Pip's colour, fixed the next day, and the interesting part is where the bug
actually was.** A crew tint used to be a label colour and nothing else, so
being off the ramp cost nothing; painting the sprite in it made that a defect
retroactively. Checking before changing anything showed the seeding path was
already correct — a scratch level created today hands Pip `#99e550` and Dot
`#639bff`, both exact DB32 — so this was never an ongoing bug, only two rows
of historical data plus a stale constant. `LEGACY` now takes its tints from
`COLOR_POOL` rather than listing its own, which leaves **one** list of crew
colours in the file and makes the bug unrepresentable instead of merely
fixed. The seed change alone would have been correct and **inert** — hq
migrated long ago and the value is on disk — the same trap as the `hasRepo`
and `recipeKey` backfills, so `scripts/backfill-roster-palette.mjs` rewrites a
row only when it still holds the exact colour the old seed wrote. That is an
identification rather than a guess: a tint changed on purpose is left alone
and a second run does nothing. Two rows moved (hq and home-chores both have a
Pip), verified after: label and gown both `#99e550`. Moss and Bea are
deliberately **not** moved — they snap within their own hue, so rewriting
them would change how they look in order to fix nothing; `--all` does it if
that judgement ever changes. A test now asserts every tint the app can hand
out is on the palette, for a fresh hire at all sixteen positions and for the
legacy migration, which is the guard that would have caught this.
**Test drive: "Produce a PDF", and it found three things no test could.**
Run as the vaguest brief the box can take, on a scratch level with no
repository. First, the clarifier was **silent on it** — `shape` only fired on
*gathering* verbs (find, research, compare), so a job whose entire content
was unspecified got no question at all while a paying session went off to
guess. The rules knew about fetching and not about *making*, which is the
case where the brief matters most; `PRODUCING` and an `about` question fixed
it, and "Produce a PDF" now asks "What should go in it?" before anything else.
Second, **the agentling can write a PDF** — the capability was assumed absent
because the sandbox has no libraries, and it simply wrote a 4KB dependency-free
Node script and ran it. Valid `%PDF-1.4`, correct objects and xref, the right
date, and a paragraph explaining it was assembled by hand. Worth remembering
before scoping out a capability: no library is not the same as no route.
Third, and the reason a live run beats a fixture: **the PDF was not detected
as binary.** It has uncompressed streams, so no NUL byte anywhere — and the
NUL sniff is git's test, which answers "is this source code" rather than the
question actually being decided, "would inlining this damage it". Its
Latin-1 `%âãÏÓ` marker is not valid UTF-8, so it was inlined as mojibake:
exactly the defect the binary path was written to prevent, surviving because
the unit fixture had a NUL in it by construction and so proved the heuristic
instead of the requirement. `isBinary` now asks whether the bytes round-trip
through UTF-8, with slack only where the sniff window truncated the file.
The download route was never affected — it reads raw bytes, and the hash
matched disk exactly throughout.
Costs and labels behaved: $0.364 against a $1.58 quote, `priceUsd` 0, the
failure absorbed. And the backoffice rescued a job the terminal had written
off — the PDF was reachable and downloadable from it while the feed showed
only a failure, which is the strongest argument yet for having built it.
**Which exposed the fourth thing, and it is this log's recurring bug for the
seventh time.** The run delivered a PDF and was filed `failed`, because
`partial` was defined as a diff on disk — a *repo-shaped* notion of delivery.
A job with no repository can never have a diff, so no such job could ever be
`partial` however much it produced: not reviewable, not creditable to a
recipe, filed under "closed" in the very panel that was showing its output.
The same shape as the promotion gate, which was fixed for exactly this reason
and then re-introduced one level down. Delivery now means **the run left
something for the user**, of which a diff is one shape. Two exceptions kept,
both already decided: a compile is judged only on `deliveredTool`, since half
a tool is not a delivery and its working files must not be mistaken for
output; and cancelling stays `failed` whatever is on disk, because you
stopped it on purpose. That second guard belongs in `fail()` rather than in
the caller — a killed session rejects through that path, not through
`cancel()` — and it was latent before this: a cancelled run holding a diff
would already have been mislabelled `partial`. Job 2ff16bf2 keeps its
historical `failed`; statuses are not recomputed retroactively.
**Four runs of one sentence, and the recurring bug three more times.** Run 2,
with the close-out fixed, came back `done`: PDF, generator, an unprompted
*verifier*, notes, and a recipe banked under the key `produce a pdf` — clean,
because the clarification answers are kept out of `job.prompt`. Run 3 then
hit the recipe and was answered **free, in zero turns, with a lie**: the
banked answer said "hello-world.pdf (1,380 bytes) is a valid one-page PDF",
and the sandbox held that sentence and no PDF. An answer is replayed word for
word, which is right when the words *were* the deliverable and false when
they merely described one — so a run that **made** something now banks only
its method, and a repeat re-runs cheaply and truthfully instead of being
answered freely and falsely. The stored answers had to be dropped too or the
fix was inert; `scripts/backfill-recipe-answers.ts` identifies them off job
records still on disk (3 of 7, including one on `home-chores`, which has no
repository and so was genuinely live). Four are left alone: `say hi` is a
real answer, and three `write a short note in X.md` recipes lost their
sandboxes, so they cannot be identified rather than guessed — inert while hq
has a repository, since the answer tier never fires there.
Run 4 proved both halves at once: tier `oneshot` rather than `routed`, quote
56c, spent 47c, **charged nothing**, and filed **`partial`** — the first live
sighting of that fix, on a run that produced a valid PDF and ran out of turns
saying so. And it exposed the ninth instance: `creditRecipe` still tested
delivery as `result || a patch on disk`, directly under a comment claiming it
used "the same test `partial` uses". It had drifted apart from `partial`
within hours of that being widened, so a non-repo run credited **zero
successes** however much it made — and a recipe that can never bank a success
can never be compiled into a tool, which is the promotion-gate inversion
again, one level down. The lesson is not "check this call site": it is that
**"it delivered" keeps being re-derived locally instead of being one
function**, and every local copy silently assumes a repository. There are now
three shared notions in `outputs.ts` — `deliveredFiles`, `producedArtefacts`,
`outputNames` — and the next thing that asks the question should call one.
**Run 5 caught the over-correction, an hour old.** The recipe hit again
(`hits` 3) and banked its first ever `success` — and produced **no PDF**. It
wrote a working generator, ran out of turns before executing it, and the
files-on-disk test counted that as the job being done. Three of those would
compile a tool from a method that never finishes, and the fall-through would
absorb the cost each time it failed. So `successes` is narrowed back to a
clean finish or a diff, while `partial` stays wide — and the two are **not**
the same question however alike they read: `partial` asks whether there is
something worth the user's attention, and a half-finished generator is;
`successes` asks whether the recipe gets the job **done**, because that is
what compiles it into a script that runs with no model at all. The comment
claiming they used one test is what carried the mistake, so it now states the
divergence instead. The stored `successes: 1` was corrected to 0 by hand —
one value on a scratch level, and leaving it would have made the fix inert on
the very recipe that exposed it.
Worth naming the shape, since it is the mirror of the bug that dominates this
log: unifying two notions is as dangerous as duplicating one. The nine
earlier instances all came from a definition copied and left to drift; this
one came from collapsing two definitions that only *sounded* alike, on the
same day, to fix the drift.
One fact learned by getting it wrong, worth recording because it is easy to
assume: **a question with no repository is not free.** The `answer` tier
replays a *stored* answer, and the first run of a novel prompt is what
produces it — so that run is a full session. Queued one expecting zero, it
quoted $1.58; cancelled at 12.7s, filed `failed` with `costUnknown`, charged
$0. The billing rules held exactly as designed; the assumption did not.

## D-031 — 2026-07-31 — Document capability: Node libraries at the project root

Document capability: **Node libraries at the project root**.
`docx`, `mammoth`, `exceljs`, `pptxgenjs`, `pdf-lib`, `pdf-parse` — six pure
JS packages, no native builds, which matters on Windows. The mechanism is the
interesting part and it was measured before choosing: a sandbox lives at
`.agentlings/levels/<id>/jobs/<id>`, *inside* the project, so Node walks up
and resolves the root's `node_modules`. Installing once at the root therefore
reaches every job with no per-job install, no network and no npm in the
sandbox — verified by writing and reading back a real .xlsx, .docx, .pptx and
.pdf from a sandbox path, including `pdf-lib` reopening its own file and
adding a page, which is in-place editing rather than rewriting.
The alternative was a Python toolchain — `python-docx`, `openpyxl`,
`python-pptx`, `pypdf`, the stack Anthropic's own document skills are built
on, and clearly better at format-preserving edits to .docx and .pptx. Turned
down for now on three counts: Python is not installed on this machine at all
(`python`, `python3`, `py` all miss), it puts a second runtime inside a
single-runtime TypeScript project, and this log already records most
`anthropics/skills` entries as **Proprietary** while `skills/` is committed,
so adopting them is redistribution and needs terms read first. The accepted
cost is that .docx and .pptx can be read and written but not revised with
their formatting intact; .xlsx and .pdf round-trip properly.
**Installing them was half the job.** A library nobody is told about is not a
capability — measured the same evening, an agentling asked for a PDF
hand-assembled the bytes across several turns because it did not know
`pdf-lib` was there, and it *worked*, which is what made it expensive rather
than obviously wrong. So `buildAppend` now names each library and its call
shape on every job. The shapes are there because guessing one costs a turn:
`pdf-parse` reads exactly like the function it used to be and is now a class,
so the obvious `pdfParse(buffer)` fails.
Two things this deliberately does **not** solve. There is still **no way for
a file to reach a sandbox** — a job gets a repo clone or nothing, and the
work bar takes a sentence, a folder and connections but no upload. So reading
and editing are unblocked in principle and unreachable in practice until an
ingest path exists; writing works today. And the compiled-tool contract is
"plain node, no dependencies, no network", so the fourth tier cannot import
any of these without that contract being reopened on purpose.

## D-032 — 2026-08-01 — Reading the web is on by default, and Settings owns the switch

Reversing D-005's per-job opt-in for one connection, deliberately and only for
that one. The framing that decides it: Agentlings is an outbound platform, so
reaching a page is what the crew is *for*, not a permission to be granted job
by job. A checkbox under the intake asked the same question every time and
answered it "no" by default, which is the wrong default for the product.

**The default had to live on the server, and that is the whole change.** Making
the client's `allowed` state start as `['web']` would have looked identical and
been worth nothing: `resolveForJob` grants exactly what the request carried, so
anything posting to `/work` without that field — the `/jobs` route, a script, a
replayed job — would silently get nothing. The rule is now one line in
`settings.ts`: the user's answer if they gave one, else the catalog's
`defaultOn`, and never when a secret it needs is missing, since a connection
that cannot work is not a preference.

**One resolver, three readers.** `granted()` is called once per request and
handed to both the quote and the queued job; the executor then reads the job's
stored `tools`. This is not tidiness — web access decides whether the router
can use its free `fetch` tier, so a quote that answered it differently from the
run would price a different job. Measured live on the same sentence: web on
quotes `routed` / "Free — we already know this", web off quotes `session` /
"Up to $1.58". Same prompt, one switch, and the quote follows the run.

**Defaults are additive; an explicit "off" is authoritative.** A test written
to assert the obvious thing failed and was right to: a caller naming a ready
connection that ships off should still get it, because that is D-005's opt-in
for credentialed connections and this change was never meant to remove it. So
`grantedTools` unions the defaults with what was asked, and only a deliberate
user "off" blocks both. Off means off; unset means the catalog decides.

The store records departures only, so a shipped default can change later
without migrating anyone's settings — the same reason the ledger records cost
and price separately. It is global rather than per level: the registry is
global, and what the crew may reach is a property of the crew.

The checkbox is replaced by a statement, not by silence. `the crew can read web
pages · change in settings` in lime, or `the crew is working offline` in
orange — because a job that cannot reach the web should say so where the work
is queued rather than in its result. Verified in the browser: the line reads
`#99e550`, on the palette.

Two things worth naming. `describe()` takes the enabled set rather than reading
settings itself, which breaks an import cycle *and* keeps one readiness rule —
the first draft inlined a second copy of `missingSecrets`, which is the drift
this log records nine times. And this widens what every session can reach: the
posture moved from "ambient nothing" to "ambient reading". That is the change
asked for, but it is a reversal rather than drift, which is why it is written
down here and in three places in SPEC.md that asserted the opposite.

**The switch had a second door, found by auditing capabilities rather than by
testing the switch.**  is built from the role alone, so scout —
which declares  — was handed the SDK's own  whatever
Settings said. Turning web off removed the app's  tool and the
pre-fetch of typed URLs, and left the network reachable through a tool the
registry never sees. The tests written for the switch all passed, because they
tested the resolver rather than what reached the session.

Fixed by : a map of the SDK tools that leave the sandbox to the
connection that authorises them, applied after the role's list and after the
default, since the question is not what the role wants but what the user has
allowed. A role left holding only outside tools correctly ends with none.
Proven against the real role files and the real registry — scout goes
 to , and analyst, mason, scribe
and worker are byte-identical either way. The run also says so out loud rather
than letting a scout spend turns discovering it.

The general lesson is about where a boundary is enforced, not about the web: a
permission checked in the place that *resolves* it is not checked in the place
that *uses* it, and  was assembled from a different source
entirely. Anything added to  is a tool that must be asked for.

**The switch had a second door, found by auditing capabilities rather than by
testing the switch.** `allowedTools` is built from the role alone, so scout —
which declares `web_fetch` — was handed the SDK's own `WebFetch` whatever
Settings said. Turning web off removed the app's `fetch_page` tool and the
pre-fetch of typed URLs, and left the network reachable through a tool the
registry never sees. Every test written for the switch passed, because they
tested the resolver rather than what actually reached the session.

Fixed by `gateOutside`: a map of the SDK tools that leave the sandbox to the
connection that authorises them, applied after the role's list and after the
default, since the question is not what the role wants but what the user has
allowed. A role left holding only outside tools correctly ends with none — it
cannot reach anything, which is the answer rather than a fault. Proven against
the real role files and the real registry: scout goes `Read, Grep, Glob,
WebFetch` to `Read, Grep, Glob`, while analyst, mason, scribe and worker are
identical either way. The run says so out loud rather than letting a scout
spend turns discovering it.

The general lesson is about where a boundary is enforced, not about the web: a
permission checked where it is *resolved* is not checked where it is *used*,
and `allowedTools` was assembled from a different source entirely. Anything
added to `OUTSIDE_TOOLS` is a tool that must be asked for.

## D-033 — 2026-08-01 — The ellipsis the model believed, and the answer with nowhere to go

Brian reported that a run came back saying his message was cut short and the
only options were approve, discard and see-the-changes. Two separate faults,
and the one he reported was the smaller.

**The app told the model the prompt was truncated.** `sessionPrompt` opened
with `Job: ${job.title}`, and `titleFrom` marks a shortened title with an
ellipsis — right for a card, wrong for a prompt. Job `ca5db1b4` was handed
`Job: I need someone to look up Buydepa and summarize…` above that same
sentence in full, and Haiku did the reasonable thing: read the ellipsis as a
cut-off message and asked the user to repeat themselves. One turn of twelve,
1.4c, no work, and a question the UI could not answer. For a prompt-derived
title that line was never anything but a shortened duplicate of the sentence
beneath it, so it is dropped when the title is a prefix of the prompt and kept
when someone wrote it separately, as `/jobs` allows. A display concern had
leaked into a prompt and the model believed it.

**And an agentling that asks a question had nowhere to be answered.** The card
offered approve or discard, so the only way to respond was to retype the whole
request and pay for the work again. The fix is a reply box that queues a
follow-up — and the reason that is allowed is worth stating, because D-030
refused exactly this: what it refused was *mid-run* clarification, which needs
a `waiting` status and a runner holding stdin. A reply arrives after the run
has ended, which is simply a new job. The architectural line is not "never ask
the user", it is "never pause a session".

A follow-up carries `continues`, and `carryForward` starts its sandbox where
the last one stopped: the earlier patch applied to the fresh clone, anything
produced copied across. Without that, answering a question would re-do and
re-bill work already paid for. Its paperwork is deliberately left behind — an
inherited RESULT.md would make "did this deliver" true before the session had
done anything, which is the delivery-test bug this log records repeatedly.

**Two faults were invisible to 636 passing tests and showed up on the first
live call.** `continues` never reached the job, because `JobQueue.add` builds
its `Job` field by field and simply did not copy it — a field can be threaded
through a type, a spec and a route and still be dropped by the one function
that constructs the thing. And a `.filter(Boolean)` meant to drop an absent
summary also ate the blank line separating the original request from the note,
running two paragraphs together. Neither is subtle; neither was reachable
without calling the route.

One dead end fixed while in there: `ReviewModal` showed its actions only for
`done`, so "See the changes" on a `partial` opened a modal whose only button
was Close — no actions on precisely the status that most needs reviewing.

## D-034 — 2026-08-01 — A browser that reads and cannot act

Scoped from the capability audit, which found the crew has no hands: no
clicking, no forms, no logins, and `fetchPage` is one HTTP GET with no
JavaScript, so most modern sites return an empty shell. The gap is the biggest
single limit on delegating real work.

**The hard part is not MCP, it is that a browser breaks the safety model.**
Every guarantee this app makes rests on one shape — work in a sandbox, review,
promote. A diff can be inspected before it touches anything real. `browser_click`
on "Confirm order" happens on the live internet the instant the model decides
to, and there is no promote step for a submitted form. The obvious mitigation is
ruled out by D-030: pausing a run to ask needs a `waiting` status and a runner
holding stdin, which was refused for good reasons.

So the first version **reads and cannot act**. Of the 24 tools Playwright MCP
offers — enumerated by speaking JSON-RPC to it rather than trusting a README,
because a wrong name grants nothing silently — eight are granted, and twelve
that act are deliberately absent, including `browser_evaluate`,
`browser_run_code_unsafe` and `browser_network_request`, which issues an
arbitrary HTTP request. That removes the real limitation today without adding a
new risk class: nothing changes on the far end, so the sandbox-then-review model
holds exactly. It also produces the cost data needed to price an acting version
honestly. `catalog.test.ts` asserts the absent names against the shipped
catalog, so the boundary is a test rather than a description of one.

**Signing in without the app seeing a password.** `--storage-state` restores a
session file the user makes themselves by logging in once in a real browser.
Nothing is stored, transmitted or typed by the app. The path differs per
machine so it cannot live in a committed catalog, which is what `expandArgs`
is for: `${VAR}` is filled from the environment and the whole argument is
*dropped* when the variable is unset — that is what makes signing in optional,
since `--storage-state=` with no path is an error while absent is a signed-out
browser. The file is a bearer token for every site in it, so it is gitignored.

Licence is clean: Apache-2.0, Microsoft, fetched by `npx`, so nothing is
redistributed into this repo and D-010's rule about terms landing here does not
bite. Chromium was already installed.

**And it corrected a rule I had got backwards the same day.** `grantedTools`
let a caller add any ready connection the user had not explicitly switched off
— reading D-005's "per-job opt-in" as a job being able to grant itself
something. With one built-in web connection that looked defensible. Adding a
browser made it plainly wrong: Settings reports a connection as disabled and a
job reaching it anyway makes the switch a lie, which is D-032's defect one level
up. **Never switched on is not the same as not switched off.** Naming a
connection now only ever *narrows*, which is the honest reading of per-job
opt-in anyway — a job that does not need the browser should not carry its tool
definitions, since every visible tool is overhead in every request. The test
that caught it was written for the browser and failed on the web.

Deliberately not done: `--allowed-origins`, which Microsoft's own help calls
"*does not* serve as a security boundary", so shipping it would suggest a fence
where there is a guardrail. And no acting tools until there is measured cost
data — the documented failure mode is context growth, since each navigation
returns a fresh snapshot and a long session carries pages it already left,
which is a rate unlike anything in the ledger.

## D-035 — 2026-08-01 — The browser measured, and the case for it is weaker than the case made for it

Phase 3 of the browser scope: run it and find out. Three live runs, **$0.61**,
and the useful results are the negative ones.

**The premise was overstated, and mine.** I argued the crew could not read
modern sites because `fetchPage` is one GET with no JavaScript. Measured
against real pages, that is mostly false: react.dev, vercel.com,
anthropic.com, playwright.dev and news.ycombinator.com all return 3–8KB of
readable text, because marketing and docs sites are server-rendered. Where it
genuinely fails is narrower than claimed — Google search (93 characters),
reddit's www host (0), PDFs (refused as not a readable document) and sites
that block a non-browser agent (Bloomberg, 403).

**And the crew routes around it without help.** Asked to read
`www.reddit.com/r/programming/`, which `fetch_page` returns nothing for, both
runs found `old.reddit.com` — server-rendered — by themselves and produced
correct titles. The browser was granted, wired and spawned in run B, and never
called once. A capability is not needed merely because a tool fails; the
question is whether the model can get the answer another way, and here it
could.

**Forced onto a page with no workaround, it works and is cheap.** With web
switched off, a scout reached a Google search page through
`mcp__browser__browser_navigate` — 5 turns of 12, **$0.0327, about 0.65c per
turn granted, against 8.3c for a repo session.** Accessibility snapshots really
are small. But it did not get the answer: Google served 429 and a CAPTCHA. That
is a real limit and not one to engineer around — a browser is not an anti-bot
tool, and building toward defeating bot protection is out of scope by choice.

**`gateOutside` proven live, and it fires exactly as designed.** The scout's
`allowedTools` came out `["Read","Grep","Glob","Skill"]` with `WebFetch`
removed and the web shim absent. The trace then shows the model *asking* for
`WebFetch`, being refused, and going to find the browser tools instead. A
denied request still appears as a tool call in the progress stream, which is
worth knowing before reading a trace as evidence of a leak — it looks identical
to one.

**The learning loop suppressed the new capability, which is the finding with
teeth.** Run A solved the job with `fetch_page` and banked a recipe. Run B,
with the browser newly available, matched that recipe, was leashed to five
turns and told the method — so it never explored, never tried the browser, and
the comparison measured nothing. Every mechanism here is working as designed
and the emergent behaviour is that **a crew which has learned a method will not
discover a better one.** Recipes make repeat work cheaper and make capability
changes invisible. Nothing is done about it yet; naming it is the point.

So acting tools stay unbuilt, and now for a measured reason rather than a
cautious one: the browser has been genuinely used once, on a page that blocked
it. The tier that would justify click and type has not yet demonstrated value
in the tier that only reads.

One process note. The first measurement script polled for 300s and reported
"TIMED OUT" for two jobs that were still running and later finished fine — the
harness gave up, not the app. The runs cost real money and produced real
output while the experiment recorded nothing, which is a reminder that an
instrument shorter than the thing it measures manufactures its own result.

## D-036 — 2026-08-01 — A method is only as good as what was available when it was found

Fixing what D-035 measured: a job solved with `fetch_page` banked a recipe, and
the next run of the same shape — with a browser newly switched on — matched
that recipe, took the five-turn leash, followed the method and never tried the
browser. Every part worked as designed. The emergent result was that a crew
which has learned a method cannot notice it has grown.

A recipe now records the connections its run could reach, and a mismatch with
what the job can reach today **demotes a strong match to a weak one** — the
method is still handed over, the leash is simply not cut. That is D-020's
asymmetry applied to a second axis: a stale method given to a full-length run
costs one turn it can ignore, while the same method with the leash cut costs
the whole run, and here it also costs the chance to find the better way. Any
difference counts, in either direction. A method that used a connection since
switched off is actively wrong; one written without a connection that now
exists may simply be beaten.

Deliberately **not** touched: the `answer` tier. It looks like the same bug in
its strongest form — zero turns, no exploration — but the router already checks
that the current job has no repository and no web before replaying, so that
path is capability-aware already. Fixing it twice would be the "collapse two
notions that only sound alike" error this log records.

**The backfill is the interesting half.** Absent `tools` means unknown
provenance, treated as changed, which is safe and also expensive: without a
backfill every recipe on file pays for one full-length run before healing. So
`scripts/backfill-recipe-tools.ts` stamps a recipe only where a job record
still on disk normalises to that exact key — an identification, since a
recipe's key *is* `normalise(prompt)`, not a similarity match. Of 15 recipes it
stamped 9, left 6 orphaned where the job records are gone, and left **1
ambiguous** — which is the reddit recipe that caused all of this, because run A
banked it under `web` and run B under `browser,web`. Two runs, one key,
genuinely contested provenance. The ambiguity rule protected exactly the case
that motivated the change, and leaving it demoted is the right answer rather
than a gap.

Verified on the real file afterwards: a recipe banked under `web` stays strong
against `web` and goes weak against `web + browser`, with its method still
attached; the contested one stays weak whatever it is asked.

What this does not fix is the general shape, which is worth stating so nobody
believes otherwise. Connections are one axis of capability. A new role, a new
skill, a document library, a raised turn cap or a better model all change what
a good method is, and none of them demotes anything. The honest claim is that
the axis which actually bit has been closed, not that recipes now track
capability.

## D-037 — 2026-08-01 — The rest of the axes, as one surface rather than five comparisons

D-036 closed the connections axis and said plainly what it left open: a role's
tools, its skills, the document libraries, the turn cap and the model all change
what a good method is, and none of them demoted anything. This closes them —
and the design decision is that they are **not five comparisons**.

A run's capability surface is one sorted list of prefixed tokens —
`conn:web`, `tool:Bash`, `skill:cite-sources`, `lib:pdf-lib` — and a recipe
stores the surface it was written under. The only operation is "is this the
same surface", so a flat list beats a record with a field per axis: adding an
axis later is a new prefix and no migration, and the list stays readable on
disk, which matters at the moment a recipe demotes and someone asks why. It
also replaces D-036's `capabilities`-as-connections field a day old, which is
churn worth admitting: the generalisation should have come first, and the cost
of getting there second was one superseded field and one retired backfill.

**Two axes are deliberately excluded, and the line is what they change.** A
capability is what a run *can do*, not how well or how long it does it. The
model changes how well; the turn cap changes how long — and a leashed run takes
`RECIPE_TURNS` regardless of its role's cap, so recording that one would demote
on a number the run never uses. Including them would make every model change
demote every recipe on file, for no gain in what the crew can discover.

`surfaceFor` in index.ts is the single place that decides what counts, because
it is the only place that knows the job, the role registry, the skills on disk
and the root's dependencies at once. `RoutedExecutor` takes it as a supplier
rather than working it out: that class knows a level and a job and nothing
about roles, and the router, the recipe it banks and the recipe it matches
against must never disagree about the surface.

Proven against the real role files and `package.json`: a scout's surface is 13
tokens, and a recipe written under it stops shortening the run when the browser
is switched on, when a library is installed, when a skill is added to the role,
or when the role gains Bash — and keeps shortening it when nothing changes. A
bonus that fell out rather than being designed: scout and worker have different
surfaces, so a method found by a scout no longer shortens a worker's run
either. That is D-026's observation — the role that runs a job need not be the
role it was matched to — handled without a rule of its own.

**No backfill this time, and that is a reversal.** D-036 shipped
`backfill-recipe-tools.ts` because unknown provenance demotes and a blanket
demotion costs a full-length run per recipe. The other axes cannot be
reconstructed: a job record does not say what skills its role had, and the
root's dependencies at the time are unknowable. Filling them from today's role
definitions would be a guess, which is the mislabelling this log keeps
catching, so the script is retired and every recipe demotes exactly once before
healing. Cheap here — the ledger shows almost no repeat work — and honest,
which the alternative would not have been.

One process note worth keeping. A scripted edit reported success by checking
for a string that already existed elsewhere in the same file, so the router
context went unwired while the check said otherwise, and three tests failed for
a reason the check had ruled out. **Verify a change by what it should now do,
not by whether some text is present.**

## D-038 — 2026-08-01 — CLAUDE.md trimmed to what the harness does not already do

CLAUDE.md had reached 196 lines and a third of it was the behavioural base
D-002 adopted. Read against the harness's own instructions, rules 1 and 2 were
close to duplicates — scope discipline, when to ask rather than guess, matching
the surrounding style are all default now, so those lines bought nothing and
cost context on every turn.

**What survived is what is not default, and the test was behavioural rather
than editorial.** Four clauses have visibly steered sessions: mention unrelated
dead code rather than deleting it, remove the orphans your own change made,
match existing style even where you would not, and state a multi-step plan as
steps with their checks. Everything else went: **66 lines → 33**. The four
headings stay numbered because Ground rules and Workflow both cite them
("extends rule 1"), and deleting them would have broken two references to fix a
third problem.

Reopening D-002 rather than quietly overriding it: the base was adopted as a
decision, so cutting it is a decision, and this entry is what the file's own
rule asks for.

**The hard-won rules were compressed by merging, not cutting.** They grow one
per lesson and were sixteen bullets saying about nine things — three separate
rules about measuring, running live and verifying by behaviour are one rule
with three citations. Merged to nine, every `D-` reference preserved, so
nothing became harder to trace back. That the count *fell* while the log grew
is the point: an archive changes no behaviour, and a list nobody finishes
reading is an archive.

Worth recording that this bought almost no lines — 38 → 34 — because a merged
bullet carries every clause it absorbed and runs four lines instead of two. The
win is that there are seven fewer things to read, not that the file is shorter,
and predicting it as a line saving was the wrong unit.

**The thematic index moved here.** Six lines grouping the entries by subject
lived in CLAUDE.md, which meant a new entry had to be written in one file and
indexed in another — a two-file edit nobody would keep up. It is not redundant
with Contents, which is chronological, so it moved rather than being deleted.
Both indexes now live beside what they index.

**Net 196 → 151, against a predicted ~120.** The estimate was made by section
before any of it was written and missed two ways: merged bullets are wordier per
bullet than the ones they replace (above), and the Capability surface block was
left at full length by choice rather than cut to 8. Recorded rather than
rounded, because a proposal's arithmetic is a claim like any other and this log
exists to catch the ones that go unchecked.

The two sections that actually change behaviour — the hard-won rules and the
project conventions — are intact or sharper.

**Amended the same day: the behavioural cut is reverted, the rest stands.**
Brian asked for the original 66 lines back and for the project half to live
somewhere else. So `CLAUDE.md` is now the Karpathy base verbatim — byte-checked
against `11912ca` — plus a project header naming the four documents, and
`PROJECT.md` holds the working rules, `@`-imported on the last line.

The import is the whole point and worth stating plainly: **a file that is not
imported is not resident, and a rule that is not resident does not apply.**
Moving the project half behind a pointer would have quietly switched off the
IGPL boundary, the secrets rule and the hard-won rules — the last of which
exist precisely because an archive changes no behaviour. So this buys
separation and an upstream-diffable base, and saves no context at all: 90 + 110
lines against 151, both loaded every turn. That is the opposite of what the
morning's trim optimised for, and it is a fair trade once the goal is stated as
flow rather than size.

What survives from the original entry: the merged hard-won rules, the thematic
index living in this file, and the reasoning about which behavioural clauses
were doing work. That reasoning is now a record of what was tried rather than
of what is in force — kept, because the next person to look at the file's
length will have the same idea.

## D-039 — 2026-08-01 — The close-out cost never reached the ledger

Found while building `scripts/ledger-report.mjs`: no row in 79 has a
`closeOutUsd`, because `LedgerEntry` has no such field. The meter does —
`claude.ts` sets it, `JobMeter` declares it, the terminal card shows it — but
the row builder at `index.ts:245` copies `recipeKey`, `compile`, `turns`,
`turnsAllowed`, `costUnknown` and `model` across and not that one.

**So `SPEC.md` M5.5 states something untrue.** It says `closeOutUsd` "is part
of `costUsd` but kept separate, so the per-turn rate prices the session rather
than the session plus a fixed errand". The separation exists in memory and dies
at the ledger, so `costPerTurn` divides session-plus-write-up across the
session's own turns.

The error is small and one-directional: a write-up is about 2c against a 39.2c
session mean, so every rate is inflated by roughly a cent, and since the rate
divides a quote into turns, the bias is toward granting **fewer** turns than
the money would buy. Nothing is over-billed — `priceFor` caps that
independently — which is why it has been invisible.

**This is D-033 recurring in the same shape**, and worth saying plainly: a
field can be threaded through a type, a spec and a route and still be dropped
by the one function that builds the object. The hard-won rule was written from
that exact failure and did not prevent this one, because the rule tells you the
shape of the bug and not where to look for it. What actually found it was
computing something from the data and noticing a column was missing — which is
the argument for the report script existing at all.

**Not fixed here, deliberately.** It changes every future turn budget, so it
wants its own pass with a before-and-after on real rows rather than riding
along with a documentation commit. Two things are already true and will not
improve by waiting: the 79 existing rows can never be backfilled, since the
split was never written down; and a fix only starts paying from the next run.
Recorded in `AGENTLING.md` §8 as a known gap and in §15 as a task blocked on
nothing.

**Fixed the same day, with the measurement the entry asked for.** `LedgerEntry`
gained the field, `index.ts` copies it, and `costPerTurn` subtracts it — plus a
filter change that matters on its own: a row now qualifies on *session* cost
above zero rather than total cost, so a killed run whose only measured spend
was its write-up no longer contributes turns against a zero and drags the rate
down. Three tests, one per case: the split is excluded, a row without one is
read as all-session, and the write-up-only row is ignored.

**The write-up is dearer than this entry guessed.** It said "about 2c" and
"roughly a cent" of rate inflation. Measured across 14 surviving records the
mean is **3.53c**, range 2.07–4.82c — about 9% of a 39.2c session, not a
rounding error. The guess came from a figure in the notes, which is the thing
this project's first rule says not to trust, in an entry written by the person
who wrote the rule.

**It did not ship inert, because the history was recoverable by
identification.** `scripts/backfill-ledger-closeout.mjs` reads the split back
off the persisted job records and matches on `jobId`: 13 rows stamped, 65 with
no surviving split left alone, and 1 refused because its recorded write-up
equalled its total. Nothing was inferred from the mean — that is the
mislabelling D-036 retired its own backfill to avoid, and a stamped average is
indistinguishable from a real observation once written.

Rates fell 1.3–6.3% (scribe one-shot with a repo 5.37c → 5.03c; worker session
without one 2.97c → 2.82c). **At a 50c ceiling exactly one of five classes wins
a turn**, and several are clamped by their role's cap regardless — so the
honest claim is that the retrospective effect is small, and the prospective one
is larger, because every new row carries the split where only 13 of 79 old ones
could. Nobody was over-billed at any point; `priceFor` caps the charge
independently, which is why this survived 79 jobs unnoticed.

## D-040 — 2026-08-01 — The code host is builtin, because the budget for a stdio server is not ours

The roadmap called a code host the cheapest first credentialed connection and
said it was blocked on nothing. Two things turned up on contact.

**The obvious server is deprecated.** `@modelcontextprotocol/server-github`
starts, works, and prints `npm warn deprecated … Package no longer supported`.
GitHub's supported replacement ships as a Docker image — Docker is not
installed here — or as a remote HTTP endpoint, and `Connection.transport` is
`builtin | stdio`, so this registry cannot express a hosted server at all. That
gap is now recorded in `AGENTLING.md` §5 as the first thing to fix if the next
connection is somebody else's.

**Builtin is the better answer regardless, and the catalog had already argued
it.** Its own comment says results should be small by design, "and for a stdio
server that budget is the server's own flags, not ours: the SDK talks to it
directly, so nothing of ours sits in between". A code host is precisely where
that bites — one issue list or one diff is unbounded. Measured against a real
repository, 30 open issues are **150,320 characters of API JSON and 3,969 as
delivered, 38× smaller**. `get_pull_request_files` returns names and line
counts and never the patch, though the API offers one on every entry.

So `github.ts` is our own eight tools over the REST API, reusing the token
discipline the library sync already had, and `agent-runner.mjs` builds their
schemas from config rather than importing anything of ours.

**The tools were enumerated, not read about.** Speaking JSON-RPC to the
reference server returned 26 tools, 14 reading and 12 acting. That is D-034's
method and it earns its keep twice: it produced the read/act split honestly,
and the acting names are now asserted absent in two places — the catalog, which
is the grant, and the implementation.

**A test caught a traversal hole that review did not.** `isRepo` was
`/^[\w.-]+\/[\w.-]+$/`, which reads as "word characters, dots and dashes" and
silently accepts `..` as a whole segment — so `../secrets` was a well-formed
`owner/name` and went into an API path. The check is now per segment with
all-dots refused. Worth recording because the regex looked obviously fine, and
the test that failed was written to assert something else entirely.

**Live before believing it:** three tools called against a real public
repository, unauthenticated, returning correctly shaped and trimmed output. The
connection ships **off** and cannot be switched on without `GITHUB_TOKEN` —
which the user sets themselves. 688 tests green.

**`get_checks` removed on first contact with a real token.** Seven of the eight
tools verified live against the private repo; the eighth 403'd, and the
permission it needs was not in the fine-grained PAT picker. Both observations
have the same cause: GitHub restricts the Checks API to GitHub Apps, so no
personal access token can read it.

The documented fallback is the Commit Statuses API, which a fine-grained token
*can* read — and it does not cover the same ground. Measured against an
Actions-based repository, one commit returned **0 statuses and 399 check runs**:
GitHub Actions reports as check runs and posts no statuses at all, so a
statuses-based tool would answer "no CI" on every repository whose CI is
Actions. Switching would have produced a tool that works and is wrong, which is
worse than one that fails honestly.

So it is gone rather than fixed, and a test asserts it stays gone so it cannot
drift back as a tool that 403s. Reading CI needs a GitHub App — a bigger
decision than a tool, and moot here until the repo has any CI to read, which it
does not. Recorded as a roadmap row.

Worth keeping the shape of this: the tool list came from enumerating the
reference server, which was right, and every one of those 26 tools is
implementable *by a GitHub App*. What the enumeration could not tell us was
which of them a PAT may call. A capability list is not a permission list.

## D-041 — 2026-08-02 — A clean exit is not a delivery, and scout could not write

The first real job through the code host connection found two faults, neither
of which any test had caught. Job `149620b5`: "list the last 10 commits on
briant92/Agentlings and summarise what changed", queued with no repository so
the connection was the only way to answer.

**The connection worked.** `mcp__github__list_commits` was called and returned,
which proves the whole chain end to end — catalog, settings, `grantedTools`,
the executor's config, the runner building zod schemas from those specs, the
internal endpoint, the API.

**`scout` could not write down what it found.** Its frontmatter said
`tools: [read, grep, web_fetch]` while its own prompt promised "you never
modify files other than your own notes and RESULT.md", and every session is
told to write RESULT.md. So it read the commits, tried `Write`, was refused,
tried `Bash cat >`, was refused, and ended by saying it had no way to record
the answer. Fixed by adding `write`, with a test over the shipped roles
asserting each has `Write` or `Bash` — Bash counts, since `analyst` delivers by
`cat >` and is coherent that way. Mutation-tested: the guard fails on the old
frontmatter with the role named.

**The second fault is the one worth deciding.** The job was recorded `done` and
**priced at 4.7c**, having produced nothing: its sandbox holds `.session.json`
and no RESULT.md. `fail()` asks whether a run delivered — `hasPatch ||
deliveredFiles(sandbox)` — and carries three measured cases in its comment
explaining why. `complete()` asks nothing and sets `done` unconditionally.

So a run that *dies* is checked for delivery and a run that *exits cleanly* is
assumed to have delivered, and this run exited cleanly by explaining that it
could not do the work. That is this project's own rule recurring: "it
delivered" keeps being re-derived, the shared function exists, and the success
path does not call it.

Not fixed here, because the right answer is a decision about billing rather
than a missing call:

- `failed` — absorbed, which is honest about the outcome but files a session
  that ran fine under the same label as one that crashed.
- `partial` — the existing name for "left something worth your attention",
  except here there is nothing to review at all.
- `done` at a price of zero — keeps the outcome accurate and stops the charge,
  and needs `priceFor` to take delivery as well as outcome.

The last is the closest fit and it changes what `priceFor` is, so it wants its
own pass. Recorded in `AGENTLING.md` §15 under cost machinery.

## D-042 — 2026-08-02 — The quote overshot sevenfold, and narrowing it did not help

The third run of the same job was the first genuine repeat in the ledger. The
recipe fired — `oneshot`, five-turn leash, key recorded — and two things came
out of it that the tier story did not predict.

**The leash saved nothing.** Run two was a full session at 7.86c over 12 turns;
run three was leashed to 5 and cost **8.04c**. A recipe saves the exploring, and
a Haiku scout calling one tool and writing one file was not exploring. The
close-out is a fixed ~2.2c either way. So `AGENTLING.md` §8's "51% off" is a
population average across mixed roles and shapes, and for work that was already
cheap and tight the step-down is zero. Worth stating there, because the number
reads like a promise about the next job.

**The quote said 56.7c for a job that cost 8.04c.** Traced exactly:
`quoteFor('oneshot', recipeKey, …)` found no history for that key, fell through
to the whole one-shot population — worker and scribe runs against repository
clones, mean 18.8c, max 47.3c — and `max(mean × 2, max × 1.2)` is 56.72c to the
cent. Scout's own five runs had cost 1.4c to 8.0c. Nobody was over-charged,
since `priceFor` caps at actual cost, but the quote is what the user sees
*before* deciding to run anything.

**The obvious fix was built, measured, and thrown away.** `shapeHistory` looked
right by analogy with `costPerTurn`, which narrows by role and shape because
D-018 proved a pooled rate predicts neither. Replaying every paid quote in the
ledger against only the rows that preceded it:

| variant | mean abs error | breaches | quotes over 5× actual |
|---|---|---|---|
| today | 35.0c | 8 | 7 |
| role+shape, same tier only | 33.9c | 8 | 7 |
| role+shape, falling back to session | 34.8c | 8 | 7 |

Identical to within noise on 63 quotes. On the seven quotes it actually
changed, four came closer and three got worse — one badly, a 13.3c scribe
one-shot quoted at 103.9c, because falling back from `oneshot` to `session`
inherits full-session prices for a five-turn leash. Excluding compiles from
that population helps and does not rescue it: scribe sessions with a repository
genuinely run 28c–107c.

So the defect is real and this was not its fix. Reverted rather than shipped,
which is D-029's shape again — the compile rate split, measured and then not
done. The right time to reopen is when a role has one-shot history of its own,
because the honest reading of these numbers is that the fallback matters less
than having any same-kind history at all, and 80 mostly-synthetic jobs cannot
supply it.

One thing not to lose: mean absolute error is the wrong yardstick for a quote
the user reads. A 7× overshoot on one job matters to whoever decides not to run
it, and averages over 63 rows cannot see that. Whatever reopens this should be
judged on the ratio of the worst quotes, not the mean of all of them.

**The report was measuring the wrong population, and fixing it changed the
answer.** `recipeKey` is only written on `oneshot` rows, so grouping by it saw
a job's leashed runs and none of the sessions that preceded them — which hid
the very transition the section exists to show. The key is now recovered from
the job record's own prompt through the same `normalise` the router keys
recipes by, imported rather than copied, since a second notion of "the same
job" drifting from the first is a mistake already on this list.

Repeated jobs went from 4 to 8, and five of them have now been seen on both
tiers, which is the first time the step-down could be measured *within* a job
rather than across two populations:

| job | session | leash | |
|---|---|---|---|
| make slugify robust | 13.4c | 11.0c | 18% off |
| write a note in anchor2.md | 20.9c | 13.9c | 33% off |
| write exports.md at the repo root | 66.9c | 39.8c | 41% off |
| read a reddit page | 36.5c | 21.2c | 42% off |
| summarise recent commits | 7.2c | 8.0c | 11% dearer |

**So the population figure of 50% roughly doubles the real per-job saving**,
which is 18–42% where there was exploring to cut and negative where there was
not. The two numbers differ because the tiers hold different work, not because
the leash behaves differently — exactly the pooling error D-018 found in the
rate and D-042 found in the quote, now found a third time in the headline this
project has been quoting at itself.

Ten paid rows cannot be grouped at all, their job records being gone, and the
report says so rather than quietly averaging over what is left. `AGENTLING.md`
§8 now carries the per-job table instead of the tier comparison alone, and the
trail prints one letter per tier so `78.2c(S) → 46.6c(1) → 0.0c(T)` shows the
whole ladder on one line.

## D-043 — 2026-08-02 — The tool tier could not fail into a session, and its absorption was invisible

Reading one odd trail in the repeat report — `0.0c(T) → 0.0c(S) → 27.7c(S)` for
"list every server module that has no test" — turned up three faults and one
thing working exactly as designed.

**Working:** the fall-back billing. Two jobs have had a tool claim them and
fail, at 27.7c and 55.7c, and both were charged **nothing**. "A promise of free
that arrives as a bill is the one thing the quote exists to prevent" holds on
real money.

**The tier could not fail into a session.** `runTool` awaited `cloneRepo`
unguarded, so a `git clone` failure threw out of the executor and killed the
job — the one route where "if the tool cannot, do it properly" did not hold.
Job d450afd3 died exactly there. It was then filed as a `session` failure in a
tier it never reached, and left the tool's strike count untouched, so the
ledger recorded a session that never ran and the tool showed a clean record for
a job it had lost. Guarding the clone fixes all three at once, which is why
there is no separate fix for the mis-attribution: removing the cause was
cheaper than labelling the effect. `writeDiff` is guarded for the same reason —
work whose diff cannot be captured is work nobody can approve.

**No strike for a failed clone, deliberately.** Two failures retire a tool, and
the clone is ours rather than the tool's; retiring a working tool because the
filesystem was busy would punish it for our fault. The test asserts the strike
count stays at zero, and mutation-testing it reproduces d450afd3's exact error.

**`toolFellBack` never reached the ledger** — set on `JobMeter`, dropped by the
same row builder that dropped `closeOutUsd` (D-039). So the ledger could not
answer how often the fourth tier claims work it cannot finish, which is the
question that decides whether the tier is worth having. Now recorded, and the
two historical rows recovered by identification from the surviving job records.

**And `absorbed` was counting the wrong thing.** It read "cost of rows whose
outcome is `failed`", but a fall-back finishes `done` at a price of zero — so
83.4c of deliberate absorption was invisible and the total read as complete.
It is now "spent and never charged", which is what the word meant all along:
$10.88 → **$11.71, 63% of all spend**.

The part worth keeping is how that last one hid. `totals()` had the definition,
and the report had **its own copy** — so fixing `totals` moved the report by
exactly zero, and the number only changed when the copy went. This project's
own rule, met head on for the second time: "it delivered" keeps being
re-derived locally, and the answer is to call the shared function.

**Settled as `failed`, and not for the reason this entry expected.** It argued
for `done` priced at zero, on the grounds that the session did complete. That
reads the status as a description of the run. It is not: `done` means delivered
and ready to review, `partial` means delivered but cut short, `failed` means
did not deliver. The taxonomy classifies **delivery**, and by it a run that
produced nothing has exactly one cell — whatever manners it exited with. Naming
that made the third option collapse: no `priceFor` change is needed, because
absorbing failures is already the rule.

`complete()` now asks the same question `fail()` asks, through one private
`delivered()` both call, and hands an empty run to `fail()` with the session's
own summary as the error. "I need write permission to complete this job" is a
better account of what happened than anything the queue could invent, and it
was previously discarded along with the outcome.

**Fixing the queue alone would have changed nothing that matters.** The ledger
takes its outcome from the sim's callback, which hardcoded `'done'` on the
resolve path — so an empty run would still have been announced as a delivery,
still credited to the agentling who could not do it, and still priced. The sim
now reads the queue's verdict back and lets the event, the career counter, the
outcome and the walk to the exit all follow it. That is three things fixed by
one question being asked in the right place, and it is worth noting that the
half I first wrote would have looked correct in the queue's own tests while
leaving the bill exactly where it was.

Mutation-tested on both halves: without the queue change an empty sandbox files
`done`, and without the sim change the events read `['started', 'done']` with
nobody credited a failure.

**One adjacent case left alone.** `RoutedExecutor` credits a recipe when
`result !== undefined || hasPatch` — a clean exit, which is the same assumption
this entry just removed, so a run that delivered nothing can still credit its
recipe. It is deliberately *not* changed here: that counter was set to clean
exits on purpose, measured against job 2711da49 where a files-on-disk test
banked a success for a run that produced no PDF, and moving it is a separate
decision about what "the recipe reliably works" means. Recorded so the next
person finds the reasoning rather than the inconsistency.

**The adjacent case above is now done, and needed a third condition rather
than a swap.** `RoutedExecutor` credited a recipe on `result !== undefined ||
hasPatch` — a clean exit, which is the assumption this entry removed. Neither
obvious replacement works, because three runs on record pull in different
directions:

| run | should count | clean-exit | files on disk | both |
|---|---|---|---|---|
| 2711da49 — wrote a generator, ran out, no PDF | no | no | **yes** | no |
| 149620b5 — finished politely, empty sandbox | no | **yes** | no | no |
| correct diff, then ran out writing it up | yes | no | yes | **no** |

So it reads `(result !== undefined && deliveredFiles) || hasPatch`: a clean
exit must also have left something, and a diff stays sufficient on its own,
which is the third row. Mutation-tested — without it, the polite empty run
banks a success, and three of those compile a tool from a method that delivers
nothing.

**And the counter was checked on live code, because a dead cohort said it might
not work.** The `slugify` recipe carries 13 one-shot rows recording its key and
`hits: 0` on disk, which would mean the three-successes gate never opens by the
ordinary path — the symptom already on record as "the fourth tier had to be
built speculatively". Ruled out as a live fault: `rememberRecipe` preserves
counters, the answers backfill only deletes `answer`, and a fourth run of the
code-host job moved the recipe from 1/1 to **2/2 with `lastUsedAt` set**. The
zeros are a ghost of code that was committed at 11:58 and evidently not running
at 12:32; not worth reconstructing further, and now not worth worrying about.

That run also priced honestly: quoted 16.1c, cost 8.4c, charged 8.4c, five
turns, 2.1c of it the write-up. One more delivery and it is compilable, which
will be the first recipe to reach that gate on its own.

## D-044 — 2026-08-02 — Landing three times does not make a method compilable

Five runs of the code-host summary took its recipe to three deliveries — the
first recipe to reach the compile gate by the ordinary path, which is what
D-021 built the machinery for and had never seen. It is also a recipe that can
never be compiled.

A tool is two plain-node modules with "no dependencies, no shell commands, no
network". That job earns its answer through the code-host connection. The gate
checked that the method was **repeatable** and never that it was
**reproducible in code**, so promoting it would have spent about a dollar
asking a session to write a script that cannot exist — and the honest outcomes
are a compile that fails its own check, or one that passes a trivial check and
serves a stale answer for free, which is the single outcome this tier exists to
prevent.

**The obvious guard was wrong and the data said so before it shipped.**
Refusing any recipe whose surface names a connection would also refuse
`anchor2` — five deliveries of writing a short note — because `web` ships on
and therefore sits in almost every surface, including recipes that never
fetched anything. A capability surface records what a run *could* reach, not
what it used, which is exactly the ambiguity that makes this hard.

What separates them is deliberateness. Measured across both levels: the two
recipes that actually compiled carry no connection tokens at all; `anchor2`
carries only the ambient `web`; the code-host recipe carries `github` and
`browser`, which the user had to switch on. So the gate subtracts the
`defaultOn` connections and refuses on what is left. Ambient availability
carries no information; a connection somebody turned on does.

Verified live and for nothing: promoting the code-host recipe now answers "that
method used browser and github, and a compiled tool is plain node with no
network — it could never do this job."

**The limit, stated rather than hidden.** A job that genuinely fetched a page
with nothing but `web` still passes this gate and will produce a failing
compile. That is the price of reading availability instead of use, and closing
it needs the run to record which tools it actually called — which the ledger
does not carry and no measurement yet demands. Recorded so the next person
knows the gate is a filter and not a proof.

## D-045 — 2026-08-02 — The first compile produced a cache, and its own check could not tell

The `anchor2` recipe — five deliveries of "write a short note explaining what a
favicon is, with one example" — was promoted on request. The compile went
perfectly by every measure the app has: 51.1c against a $1.58 quote, 8 turns of
10, both scripts written, status `done`.

`run.mjs` holds the note as a string literal.

**That is a cache, not a method, and it makes the tier's safety check
circular.** `verify.mjs` is twenty assertions about the note's structure —
definition, testable claim, one `<link>` example, a caching gotcha — and every
one of them passes by construction, because the same session hardcoded the text
those assertions describe. A program checking a constant it itself wrote cannot
fail. The check that D-021 insisted on "harder than the script" was, here,
theatre.

**And the router would have served it to other questions.** Tools match on the
strong bar, which is the recipe bar. Measured against the compiled manifest:

| prompt | score | |
|---|---|---|
| …what a **favicon** is | 1.000 | claims |
| …what a **web manifest** is | 0.700 | claims |
| …what a **service worker** is | 0.700 | claims |
| …what **CORS** is | 0.778 | claims |

So "explain CORS" returns the favicon note — free, and passing verification.
That is the free wrong answer this tier exists to prevent, arrived at through
the tier's own machinery.

**So the boundary has a sharper test than D-021's.** "Add tests for module X"
versus "list the modules with no test file" is a rule about the job. This is a
rule about the artefact: **if the answer is a literal in `run.mjs`, it compiled
a cache** — and no `verify.mjs` can detect that, because the same session wrote
both. Nothing automated caught it. Reading the generated code did, which is
precisely what the review gate is for (D-011, D-021), and is the first time
that gate has earned its keep on a compile rather than a library install.

**Discarding it then poisoned the recipe.** The manifest is written before the
compiling session runs, and `promote` refused any later attempt because "a tool
for that recipe already exists" — a tool with nothing to execute. Discard is
supposed to be the safe half of review; instead it made the recipe permanently
uncompilable, and the router never noticed because `usableTools` needs both
scripts. Fixed by asking the question properly: refuse when a tool *works* or a
compile is *in flight*, which is robust to discard, cancel, a crash or a
restart. Chasing each terminal path would have left the next one to be found
the same way — as cancelling did, ten minutes later, straight after the discard
fix.

## D-046 — 2026-08-02 — The knowledge store: opened, not settled

**This entry was opened, and is now closed by D-047**, which picked option C.
It is kept as written because the options and what each would cost are the
reasoning D-047 rests on; read it for the alternatives, cite D-047 for the
position. What remains genuinely open here is the *second* question only in the
sense of its thresholds — the answer itself is in D-047 too.

**It was written open**, against this file's usual contract, because the
roadmap row said "decide what the crew may read" and a one-line blocker is not
a decision anybody can take.

**The goal.** A level's recall corpus is closed. `KNOWLEDGE.md` is written by
the crew, from its own finished jobs, so a level can answer for free only about
work it has already done. Ask it something you wrote down yourself, somewhere
else, and it falls through to a paid session — 38c to reread your own notes.
The `answer` tier is where cost actually reaches zero, so widening what it may
legitimately claim is the largest saving left on the board.

**It is not blocked on wiring, and that is worth being precise about.**
`catalog/connections.json` takes any stdio MCP server today, and a notes store
is a reading connection, so it sidesteps the acting blocker entirely (D-034).
What is undecided is scope, and §11 is why: there is no classification,
redaction or retention layer, so whatever the store returns enters a Claude
session whole. A notes store is usually undifferentiated personal material.
"Point it at my notes" is therefore a bigger grant than "point it at my repo".

**Three scoping options, none chosen.**

| | Shape | Costs |
|---|---|---|
| A | One connection, whole store, ships off — exactly how `github` ships | Simplest, and the grant is all-or-nothing. Every read is live, so freshness is whatever the store says today |
| B | Per-level allowlist of spaces, folders or tags | Matches D-013: capability is per level because a method proven against one project is not proven against another, and a notes store cuts across that grain. Costs a scoping UI and a decision per level |
| C | Sync-and-index — a trimmed local index the crew reads, never the store live | Matches the shape M5.2 already proved for the web: trim before the model, one implementation, and the size is ours. Makes freshness explicit and auditable. Costs a sync path and staleness becomes a real state |

**A second question, separate from scoping and easy to conflate with it: may
the free tier serve from it?** `KNOWLEDGE.md` is trusted because the crew
earned it — every note is the residue of a job that ran. External docs have
unknown freshness and no such provenance, and D-045 is the standing warning
that a free wrong answer is the one outcome worse than a right answer that cost
money. A defensible split is that a store **grounds a session** and never
**answers on its own** until freshness can be established, which pushes the
saving from "free" down to "cheaper" and is a materially different feature.
Deciding scope without deciding this would ship the ambiguity.

**What would settle it, and why nothing here is measured.** No figure in this
entry is evidence: nothing in the ledger records whether a question *could*
have been answered from own material, so the size of the prize is unknown. That
is the same shortage that parks the attachment quote and the clarification
comparison — real traffic, not more thought. The cheap first move is to record
it: a routed `agent` run that recalls rather than produces is already
distinguishable in principle, and counting those would price this row before it
is built rather than after. (D-042, D-044)

**The counting started the same day.** Two raw facts on every paid row —
`asked` (question-shaped) and `recallable` (how many of the level's own notes
share a term with the prompt) — computed by `recallSignal` in `router.ts` from
the same scorer the recall tier and the session context already use, so there
is one notion of "a note that bears on this job" rather than a second that
could drift from it.

Recorded and read by nobody, the same bargain as `compile` (D-029). Two facts
rather than one verdict because the bar is the part nobody can place: an asked
question with `recallable: 0` is the run a store would have served, a high
count is a run that was paid for despite the notes being there, and which of
those matters is what the data has to say. Deciding "recall-only" at write time
would bake in the guess this entry exists to avoid.

Gated on presence rather than truth, which is the whole design: `asked: false`
is written, because without the negative rows there is no denominator and the
answer is a count with nothing to divide by. An absent field means the row
predates the measurement — a distinction that would be lost if false were
treated as nothing to say. `asked` understates by construction, needing a
question mark or a leading wh-word, so "do we have a deploy doc" is missed;
an undercount is a floor, an overcount is a story.

Free-tier rows carry neither, deliberately: the router already answered those,
so they are not the paid traffic being sized.

**The first version measured only the runs that landed, which is this project's
oldest mistake wearing a new hat.** The signal was attached to the executor's
success return, and a run that dies throws a `SessionFailure` instead — which
carries a meter precisely because the ledger files a row for it. So every
question that ran out of turns would have been counted as no question at all,
and on a short leash those are most runs. Exactly the blindness D-017 found in
the quote, arrived at independently four entries later. Caught by checking the
claim "every paid row carries it" against the failure path rather than against
the tests, all of which passed. Failed and cancelled runs now carry it too: a
cancelled run was still a question and still spent money, which is a different
question from whether anyone wanted it compiled.

**And the row builder was pulled out of the server to be tested.** It is the
one function in this app with a proven habit of dropping fields silently —
`closeOutUsd` for 79 jobs, `toolFellBack` for two more, both declared on the
type and written by the executor and lost in those lines (D-039). It sat inside
a completion callback in `index.ts`, unreachable without binding a port and
writing to the real ledger, so both bugs were found by reading job files
afterwards. `ledgerRow` is now pure and every field the meter can carry is
pinned by a test, including the ones that already worked. Verified over the
composed chain rather than hop by hop, since composition is where this keeps
failing: "what is our deployment process?" produces `asked: true,
recallable: 0` on a 38c session row, and "what did we learn about the payment
flow" produces a free `routed` row with neither field.

## D-047 — 2026-08-02 — The knowledge store is synced and indexed, never read live

D-046 laid out three scoping shapes and refused to pick between them. Picked:
**C — the crew reads a trimmed local index, scoped per level, and never talks
to the store live.** A (one connection, whole store) and B (a per-level
allowlist over live reads) are both rejected, and B's virtue is kept.

**Decided at n=0 traffic, deliberately, and the split is the point.** The
counter added the same day sizes whether the store is worth building and when;
it says nothing about which shape it should take. Shape turns on the safety
model and on where the corpus plugs in, both already settled here, so waiting
for rows would not have improved this answer — and D-046's own warning about
small samples applies to the *build-it-at-all* question, which stays open.

**It is the only shape that keeps the app's one safety guarantee.** Everything
here is sandbox → review → promote, and preview-before-install for anything
executable (D-011, D-021). A and B both hand a session live reach into a corpus
nobody has read; the index is an artefact you can inspect *before* the crew can
use it. "Nothing arrives unread" already governs a skill's companion files, and
a page of notes going straight into a session is the same event.

**It is also the cheapest, which is not a coincidence.** `readKnowledge` returns
`string[]`, and both consumers — the recall tier and the session context —
select from it with `relevantLines`. An index that emits lines slots into that
seam with no new tier, no new router branch, and no second scorer. A and B would
each need one, and a second notion of "a note that bears on this job" is exactly
the duplication D-030 was written about.

**Size stays ours.** M5.2 measured the trim-before-the-model shape at 573 KB raw
against ~3k tokens delivered, and D-040 refused a stdio code host because an
unbounded reply is the expensive kind. A live store returns whatever it returns,
in every request of the session.

**B's virtue is kept rather than lost.** The index is per level, which is where
capability belongs (D-013) — a method proven against one project is not proven
against another, and a note about one project is not a note about another.
Choosing what a level syncs *is* "decide what the crew may read"; C relocates
that from a standing live grant to a one-time choice with a reviewable result.

**The second question, which D-046 warned would ship as ambiguity if left:
the free tier may serve from the index, with two guards.** Every synced line
carries its source and the date it was synced, and a recall answer says so; and
an index past a staleness threshold falls through to a paid session rather than
answering free. The distinction that makes the guards necessary: a `KNOWLEDGE.md`
note is an immutable record of something that happened on a date, while a wiki
page asserts what is *currently* true. Notes cannot rot the way pages can, and
serving a stale page for free is the outcome D-045 caught the first compiled
tool committing.

**What this does not decide.** Which store, and the threshold numbers — both
want measurement rather than argument, and the threshold especially should be
set against real staleness rather than picked. When one is wired, D-040's rule
stands: establish its tool list by speaking to the server, not by trusting its
README, because a wrong tool name grants nothing and does so silently.

## D-048 — 2026-08-02 — The knowledge store built, and the free tier caught guessing

D-047 decided the shape; this is it built, and the thing that building it found.

**The store.** `store.ts` walks the folders a level names, splits markdown at
its headings, trims each passage to 600 chars and writes
`store-index.json` — every entry stamped with its file and the date it was
read. `storeLines` renders an entry as a corpus line with that provenance
*inside* the line, which is why neither the recall tier nor the session prompt
contains a word about stores: both already print lines. `readKnowledge` returns
`string[]`, so the index needed no new tier, no router branch and no second
scorer, exactly as D-047 predicted from the seam.

Staleness is one rule in one place: past a week `storeLines` returns nothing, so
a stale index cannot be matched, the free tier has nothing to answer from, and
the job falls through to a session that can go and look. Two copies of that rule
would eventually disagree.

`recallSignal` is deliberately *not* fed the store. It measures whether the
crew's own notes could have answered a paid question — the figure that says
whether a store was worth having — and letting the store feed it would have had
it answer its own question yes the moment the store existed (D-046).

**Then the live check found the free tier answering a question about quantum
mechanics.** Quoting "what do we know about quantum tunnelling" against `hq`
came back `routed` — free, "we already know this". With the store emptied it
still did, so this was never about the store: it had been true of the recall
tier all along and the store only made it louder.

Measured rather than guessed at: `terms()` returns `['know', 'quantum',
'tunnell']`, `know` is not a stopword, and `relevantLines` accepted any note
scoring above zero. One note of 86 matched, sharing exactly `['know']` — a note
about writing `EXPORTS.md`. So the tier was scoring on the one word guaranteed
to appear in every question that reaches it, and "never guess" was guessing by
construction.

**Fixed by scoring on what the question is about.** The asking vocabulary —
know, learn, find, remind, tell, and their forms — is dropped before scoring,
inside `relevantLines`, so the recall tier, the counter and the eight notes a
session is handed all get one rule rather than three copies. The set is built by
running `terms()` over those words rather than written out pre-stemmed, so it
cannot drift from the stemmer. A question left with no subject at all — "what do
we know" — now matches nothing, which is the honest answer: there is no subject
to be relevant to.

Verified live against the real level, and the negative case matters as much as
the positive: "quantum tunnelling" now quotes a session; "rolling back a deploy"
against an indexed folder quotes free and answers with `[ops/deploy.md, synced
2026-08-02]` attached; and "what do we know about the ledger" *correctly* quotes
a session, because `hq` turns out to hold no note containing the word — checked
rather than assumed, since an over-correction would look identical from outside.

**What is not built: any UI.** The store is reachable only over the API
(`GET/POST /api/levels/:lid/knowledge`, `POST .../sources`, `POST .../sync`).
Pointing a level at a folder from inside the app is the obvious next piece and
was left out rather than half-done.

**The UI, added the same day (D-048 continued).** *reading* in the level header
opens the store panel: the folders this level reads, what the copy holds, when
it was taken, and an add box. Adding a folder reads it immediately — a saved
folder nobody read is a setting that looks done and does nothing, which is the
same failure as a connection listed ready with no secret behind it.

Three things the panel says that nothing else can. A **stale** copy is called
out in words, because "the crew quietly stopped using your notes a week ago" is
otherwise invisible from every screen in the app. The **overflow** past the
250-per-folder cap is shown with the advice to point somewhere narrower, rather
than a number nobody can act on. And a source that is **not found** is marked on
its own row.

That last one came out of driving the finished UI rather than out of designing
it. Typing a bad path showed an error and then saved the folder anyway, so the
error scrolled away and left a row identical to a working one — a source
contributing nothing, looking exactly like a source contributing everything.
The fix re-checks existence on every read of the status rather than only when
the folder is added, which also catches the more likely case: a folder that was
fine when added and has since been moved or renamed.

Verified in the browser against the running app, not only by test: the panel
opens on its empty state, a folder added through it reports "4 passages from
2 files · read just now", a bad path is marked NOT FOUND on its own row, and
remove takes each back out with the counts refreshing. No screenshot — the
preview pane in this environment does not composite frames, a known limitation
of the harness rather than of the app.

## D-049 — 2026-08-02 — The store measured, and the second unquoted way in

The knowledge store run against real work for the first time, and the result is
mixed in a way worth writing down rather than rounding up.

**Where it wins, it wins completely.** "What do we know about the close-out
pass" was answered `routed`, **$0, no session at all**, from six indexed
passages each carrying `[AGENTLING.md, synced 2026-08-02]`. That question would
have been a session before. The saving is not a percentage.

**Where the crew already has a clone, it wins almost nothing.** Paired on one
prompt — "which decision settled how a knowledge store is scoped, and which
options did it reject" — with `noRouter` both times so no recipe could confound
it:

| | turns | total | session only | per turn |
|---|---|---|---|---|
| store on | 4 | 24.88c | 20.20c | 5.05c |
| store off | 5 | 27.32c | 22.61c | 4.52c |

**1 turn and 2.45c, about 9%** — and the per-turn column says why: the store
makes each turn *dearer*, because its lines are input tokens on every one of
them, and buys fewer turns in exchange. On this question that trade barely came
out ahead. **Both answers were equally correct**, and both cited
`repo/DECISIONS.md` line ranges rather than the store: with a clone in the
sandbox the session can simply read the file, so the store was helping it find
what it could already reach.

**n=1 paired, which is the small-sample error this project keeps catching**, and
a one-turn delta sits inside ordinary variation. Both confounds push the same
way — API prompt caching should have made the second run cheaper, and the level's
own notes grew between runs (`recallable` 2 → 3) — so the small win is if
anything understated. It is still n=1.

**So the store's value is concentrated in the recall tier and in material the
crew cannot otherwise reach**, which is what D-046 said the goal was. Pointing
it at the repository the crew already clones is close to its worst case, and
that is how it was measured here. Do not generalise this number to a notes
folder that is not in the repo.

**And the paired run turned up a second unquoted way in.** The no-store row
carried no `quotedUsd` at all: `POST /jobs/:id/redo` called `queue.add` without
quoting, so `turnsForBudget` never bound and the run fell back to the role's
cap. That is D-027 exactly, on a different route, found the same way — by
tripping over a ledger row.

Fixed by quoting it, with the part that matters being *which* quote. A redo sets
`noRouter`, so asking the router what it would do produces a fiction:
`/work/plan` prices the close-out question at **`routed`, $0**, and a redo of
that same job really runs a full session. The old code would have queued it
with a $0 ceiling and then spent real money against it — a promise of free
arriving as a bill, the one thing the quote exists to prevent. `quoteFor_` now
takes a `noRouter` flag and branches on the same expression `RoutedExecutor`
branches on, so the quote and the run cannot disagree about which of them is
happening. Verified as D-027 was, live and cancelled before either spent:
redoing the free job now quotes **$1.58** where the router says $0.

## D-050 — 2026-08-02 — Three tiers of capability, and what a compiled tool may inherit

A design review of the whole learning story, prompted by the observation that
the knowledge store as built (D-047, D-048) is a **bespoke input path in a
generic app**: it asks the user to already keep notes, in a folder, and to point
at them. That is an integration, not a capability. Its measured value stands
(D-049) and its role is narrowed accordingly — the door for material the crew
cannot otherwise reach, not the spine.

**The spine is what the level writes for itself**, which mostly exists:
`KNOWLEDGE.md`, `recipes.json`, `memory/<name>.md` and `tools/`, with the M5
ladder bending cost from `agent` to `oneshot` to a free compiled tool. Within a
level, `usableTools` is not scoped per agentling, so a tool the crew earns is
already available to everyone in it.

**The gap is that earned capability cannot leave the level that earned it.**
Nothing crosses but the ledger and the authored catalog. So the cost curve bends
per project and resets to zero for every new level — invisible with one project,
structural with many. Stated as three tiers:

| tier | holds | flows |
|---|---|---|
| baseline | `roles/*.md`, `skills/`, `buildAppend`, the router's free tiers | one copy, so it rises for everyone at once |
| level | knowledge, recipes, tools | never sideways |
| agentling | lessons | never sideways |

The baseline already propagates instantly *because there is only one copy of
it* — improve `worker.md` and every worker everywhere is better on its next
session. `AGENTLING.md` describes that baseline and is not part of it; it is
derived, and no agentling reads it.

**Generality should be earned, not declared.** A tool would graduate from level
to baseline on being independently earned in **two or more levels** — one
project cannot demonstrate that a method generalises, which is exactly D-013's
argument, so this respects it rather than overturning it. And the unit that
graduates is the **tool only**: a tool is mechanics, while a recipe, a lesson
and a knowledge line are all prose about one context. Prose never crosses. That
answers the contamination question structurally rather than by a rule someone
has to remember.

**The premise for gating a tool on its surface was wrong, and checking the
contract is what showed it.** The proposal was that a compiled tool, unlike a
recipe, has no capability surface and so never notices the baseline improving —
the D-036 bug, unfixed for tools. The asymmetry is real: `Recipe.capabilities`
and `sameCapabilities` exist, `ToolManifest` had nothing. But the compile brief
is *"No dependencies, no shell commands, no network. Node built-ins only"*, so a
tool uses **none of the four axes a surface records**. A moved surface therefore
makes a tool possibly *dated*, never possibly *wrong* — and its output is proved
by `verify.mjs` on every run regardless. Refusing on a mismatch would drop a
free, proven answer into a paid session to buy nothing.

So the gate is not built and the record is. `ToolManifest.capabilities` is
copied from the recipe at compile time — the only moment both are in hand — and
read by nobody, the same bargain as `compile` and `asked`. It is kept because
the contract is a brief rather than a jail, nothing stops a generated `run.mjs`
importing from the project root, and because giving tools the gated doors a
session gets would make the field load-bearing overnight for a question that
cannot be answered retroactively.

`scripts/backfill-tool-surface.mjs` recovered **1 of 5** tools on this machine
by identification (`tool.recipeKey === recipe.key`); the other four were
compiled before D-036 and their recipes carry no surface either. Reading the
level's surface *now* would have produced a plausible number describing a moment
that never happened, so those four keep an absent field, which is the honest
record. Idempotent, and 686 tests green.

**Stages 1–3 are deliberately not built**: record `earnedBy`/`earnedIn`, then
count cross-level recurrence, then the graduated catalog behind the same review
gate a compile already passes — a graduated tool is still executable
instruction (D-011, D-021). All three are downstream of repeat traffic that does
not exist: one genuine repeat in 36 jobs, two working tools, one active level.
Building the graduation mechanism now would be the mistake this log keeps
recording, in a nicer shape.

## D-051 — 2026-08-02 — The crew's first real finding: the recall tier counts where recipes weigh

The first jobs queued as work rather than as tests of a mechanism. One
delivered a finding better than the hunch that prompted it; the other failed in
a way that was the specification's fault, not the crew's.

**The finding.** A scout surveyed `relevantLines` over hq's 92 notes and ten
realistic questions for 17.7c (charged 9.6c — the quote capped it and 8.1c was
absorbed). **72% of all matches share exactly one word.** But the useful half is
what it noticed next: whether that is signal or noise depends entirely on how
*rare* the word is. Questions about `slugify` and `export` matched at 100%
single-word and every match was right; questions containing `test` and `write`
matched at 78–100% single-word and were noise.

That is sharper than the hunch it came from. After D-048 removed the asking
words, the remaining worry was recorded as "single-content-term matching still
lets weak hits into the tail", with the implied fix of demanding two terms.
Demanding two would have thrown away the `slugify` case, which is the tier
working perfectly.

**The asymmetry it points at.** `similarity()` in `recipes.ts` already weights
by rarity — *"two jobs both mentioning `estimate` are far better evidence of the
same work than two both mentioning `file`"* — with a `RARITY_NEEDS` guard so a
small corpus does not weigh its only signal down to nothing. `relevantLines` in
`router.ts` scores a raw count of shared terms and has never weighted anything.
So the paid tier that only lends a method reasons about rarity, and the **free**
tier that answers outright does not. That is the wrong way round: a weak match
on a recipe wastes a turn a session can ignore, a weak match here is a free
answer nobody checked.

**Not fixed, because the two candidate fixes have different blast radii and one
of them moves an instrument mid-measurement.** `relevantLines` serves three
callers — the recall tier's answer, the eight notes a session is handed, and
`recallSignal`'s `recallable`. Weighting the *score* changes ranking only, so
`recallable` (a count of lines scoring above zero) is untouched and the counter
keeps its meaning. Adding a *threshold* changes which lines count at all, and
would redefine `recallable` after four rows — cheap now, not later, but a choice
rather than an accident. Recorded so whoever picks it up knows the second option
is not free.

**And the failure was mine.** The other job asked a `worker` to add two fields
to a type, stamp them at a call site and write a test — three files against a
~1,300-file clone. `worker` declares no `maxTurns`, so it took the default 10,
spent 11, and produced **nothing at all**: no result, no diff, no change in its
clone. 45c spent, nothing charged, since failures are absorbed. It had already
been given the strongest known lever — the exact file paths — and still did not
fit. The answer is not a bigger cap (D-015, D-025: running out of turns is an
ordinary ending, and "ran out" is not "needed more"); it is that a three-file
change is two jobs. Re-queued split.

**Worth carrying separately: phrasing picks the role, and the role picks the
price.** The same survey, worded as implementation, quoted **$1.58** and routed
to `worker`; worded as "survey… read only, change nothing" it quoted **9.6c**
and routed to `scout` — 16×, before any work happened, because scout has real
history in the ledger while worker-with-a-repo still quotes the ignorance
ceiling. The quote is a lookup over what that class has actually cost, so an
unfamiliar class is expensive by definition.

**A promoted change does not reach the next job until it is committed** — found
by splitting the failed job in two and watching the second half fail anyway.
`cloneRepo` runs `git clone --local`, which clones **HEAD**, not the working
tree. The first half was reviewed and promoted, so its fields were in the real
`tools.ts`; they were not in the *commit*, so the second half's clone did not
have them. It dutifully re-derived the whole first half — both diffs carry the
same base blob for `tools.ts` — and then ran out of turns partway through the
change it was actually asked for, leaving a declared `const` nobody used. Not
promotable, and the run cost 45c that was absorbed.

Committing first and re-queuing the identical sentence finished in one go, and
the diff it produced is the one that shipped: 37.7c, and it matched the
conditional-spread style and the comment voice of the line above it without
being shown either. So dependent jobs need a commit between them, not merely a
promote — and this is the second time today the gap between "the app did it" and
"the repository has it" cost a run.

## D-052 — 2026-08-02 — A claim about the turn cap, withdrawn, and the instrument that was missing

I claimed the 10-turn cap was "reliably cutting runs at the verification step,
not the work step", on the strength of "four of seven jobs ended at
`turnsAllowed + 1` with the task essentially done". Measured, it does not hold.

**The ground truth, on the five cap-hit failures I had personally reviewed:**

| job | diff | what it actually was |
|---|---|---|
| `381a307f` | 0 B | nothing at all |
| `95c748d0` | 1.4 KB | re-derived a prior job, unused `const` — not promotable |
| `d42aae86` | 4.3 KB | new file written, its caller untouched |
| `9177b021` | 6.9 KB | complete and correct |
| `0d32e24a` | 5.7 KB | complete and correct |

**Two of five, not four of seven.** The four were jobs I had promoted something
from, which is a different set: promoting the *good half* of a half-finished run
is not the run having finished. I counted my own review decisions and reported
them as a property of the runs.

**And the signal underneath it was one this log had already measured as
unreliable.** `turns > turnsAllowed` fires on **43 of 88 paid runs**, and seven
of those finished `done` — D-022 recorded exactly that, "a successful run can
report more too". So the premise was built on a marker already known not to mark
the thing. That is the failure this project keeps writing down: *measure the
premise, especially one you are the one advancing.* Fourth instance.

**What is actually supported**: of 33 examinable cap-hit failures, 23 left a
diff or a result. That says the review gate recovers real work from runs nobody
was billed for, which is worth knowing and is a different claim.

**The real answer was that the question could not be asked.** Nothing recorded
what a turn was spent on. The ledger carried `turns` and `cost`; the per-tool-call
`progress` events lived in memory and died with the process; and the close-out
lessons describe the work, not the budget — all five say something about the
task and none mentions running out. So "was the last turn the work or the check"
had no answer in stored data, and I had filled that gap with a plausible story.

**So the instrument now exists.** `toolCalls` and `lastTool` are counted off the
tool stream and folded into the meter at the single point where all four of the
runner's exits converge — deliberately not at each exit, because attaching a
measurement only to the clean path is the mistake made in D-046 and the failing
runs are the entire population of interest. Recorded and read by nobody, the
same bargain as `compile` and `asked`.

Verified live on both halves rather than by reading the code:

- a finished scout run — `toolCalls: 20, lastTool: "Write"`, ending by writing
  its report
- a **cancelled** run — `toolCalls: 3, lastTool: "Read"`, still gathering when
  it was killed

The second is the useful one twice over: it proves the failure path carries the
field, and it carries **no `turns` at all**, because a killed session never
reaches the result message the SDK reports on. On exactly the runs where the
existing budget numbers go blank, this one still says what happened.

**One observation, offered as an observation.** The finished run reported 21
turns against a cap of 12, having made 20 tool calls. `turns ≈ toolCalls + 1` on
a single sample, and a gap between cap and reported turns far wider than the
"cap of 4 came back as 6" already on record. If it holds across rows it would
say the reported count tracks tool calls rather than the thing the cap limits —
which would explain why the cap and the reported number have never agreed. It
is n=1 and is written here as a thing to check, not a finding.

## D-053 — 2026-08-02 — A missing capability is not refused, it is substituted

The first two jobs queued through the UI by the user rather than by a session
were the same question asked twice. One finished in 4 turns for 34c; the other
exhausted its budget and was absorbed. Nothing about the subject matters — what
separates them is what each reached for when the thing it needed was absent, and
that generalises to every job the crew will ever take.

**There is no search.** The crew can read a page you *name* — `fetch_page`, and
the browser's eight reading tools. Nothing can *find* one. For a question with
no URL attached, that gap is total, and the run that succeeded says so in its
own output: *"`WebSearch` was attempted first and denied by the permission
mode."*

**Neither run stopped there, and that is the finding.** A missing capability
does not produce a clean refusal — it produces a detour, and the detours differ
enormously in price:

| | detour taken | tool calls | outcome |
|---|---|---|---|
| "How many goals has X scored in his career?" | fell back to model knowledge, and labelled it unverified | 3 | done, 34c |
| "Can anyone **find out** how many goals X has scored?" | went to the browser | 10 | **failed, 27.5c absorbed** |

**The phrasing chose the detour.** "Find out" reads as an instruction to go and
look, so the second run went looking with the only looking tool it had. The
first was asked a question and answered it. Two words of difference, 62c and one
failure apart — the same lever measured earlier that day, where wording a job as
a survey rather than an implementation moved its quote 16× by moving its role.
So: **say what you want done, not how hard to try.** "Find out" and "make sure"
and "check thoroughly" are budget instructions wearing the clothes of politeness.

**The good pattern is the first run's**, and it is worth protecting: when it
could not verify, it answered from what it had, said exactly which parts were
settled and which were moving, gave its own cutoff, and named where to check. An
unverified answer that says so is useful; the failure mode to fear is the
confident one.

**A job carries the level's repository whether the work needs it or not, and
that sets the price.** Both runs cloned a 1,300-file codebase to answer a
question that never touched it. Measured on this ledger the same day: **5.2c per
granted turn with a repo against 2.0c without**, over 35 and 8 runs. That is why
it quoted $1.58. The app cannot fix this by itself — `needsRepo` in the planner
means "the level has no folder, so ask", not "this work needs one", and deciding
a job does not need the code is a guess that leaves an agentling blind when it is
wrong. Choosing a level without a repository is the user saying it, which is the
only safe form the answer can take.

**And the new instrument has a misreading, which caught its own author within the
hour.** `lastTool` on the failed run is `browser_evaluate` — a tool the catalog
does **not** grant, asserted by a test. The run's final act was to ask for
something it could never have and be refused. `toolCalls` and `lastTool` are
counted off the progress stream, which records **what the model asked for, not
what it got** — the trap already on record from a `WebFetch` call that looked
like a leak and was a denial. Read the granted list before reading a tool name as
an action. The instrument is still the right one: without it this failure would
have read as "ran out of turns, cause unknown", and instead it names the exact
wall the run died against.

## D-054 — 2026-08-02 — A search connection, built because the gap was measured

D-053 measured what the crew does when it cannot search: it substitutes. One run
fell back to model knowledge and labelled it honestly; another spent its whole
budget driving the browser at a search engine and died there. The cheapest
answer to that is not a better browser — it is a search box, so `search` is now
a connection.

**Builtin, not an MCP server, for D-040's reason verbatim.** A search API answers
in verbose JSON — ranking metadata, thumbnails, profiles, dates, per result —
and for a stdio server that budget is the server's own flags, not ours. Owning
the call owns the size: `search_web` returns three fields a result, capped at ten
results with snippets clipped to 200 characters.

**Brave, after Google was tried and turned out to be impossible.** Scraping the
search page was never a candidate — against the terms, and D-035 had already
measured what it returns to a crawler: 429 and a CAPTCHA, the exact wall the run
in D-053 died against. So the choice was between search APIs, and I recommended
Google Custom Search as the official, well-supported one.

**It cannot do general web search any more, and I did not know.** As of
**20 January 2026** Programmable Search Engine only serves engines configured
against a list of at most 50 nominated domains; whole-web engines created before
that date keep working until 1 January 2027 and no new one can have it. The
control panel does not explain this — the toggle is simply dead — and the user
found the notice in a help page after doing the console setup on my advice. My
knowledge cutoff is May 2026, so this was four months inside it and I still gave
a confident recommendation. **A capability that used to exist is the easiest
kind of thing to be wrong about, because nothing contradicts you until someone
tries it.**

The revert cost one `git checkout` of two files and four one-line edits, which
is the only part of this that went right and was not luck: the provider sits
behind one URL, one parse and an injected `http`, so swapping it never touched
the tool, the gate, the runner or the trimming. Recorded here mostly so nobody
tries Google Custom Search for this again.

**Two tools, not one, and that is the design.** `search_web` finds and
`fetch_page` reads, each trimming its own half, and the search result text says
so in as many words. A single tool returning page contents would have re-created
the unbounded reply the split exists to avoid.

**Credentialed, so it ships off and is never live without both halves** —
the same rule as the code host. Verified against the running server: it lists
`ready: false` with both secrets named, so it cannot be switched on at all
until they exist — and a test pins that either one alone still refuses.

**The runner's builtin-tool block became a loop rather than a third copy.**
`web`, `github` and now `search` all reach back into the server through a gated
`/internal/*` door; two of them build their SDK tool schemas generically from
config, and a third near-identical twenty lines is how two of them quietly stop
agreeing about error handling (D-030).

**And the first draft of the catalog tests passed vacuously.** They asserted
`grantedTools(...)` did not contain `'search_web'` — but that function returns
*connection* names, so the assertion was true however broken the gate was. The
trap already on record as a scripted check matching a string that existed
elsewhere. Rewritten to go through `resolveForJob` and `mcpToolNames`, and
paired with a positive case that grants the key, so the negatives can only pass
because the gate held rather than because the string was never there.

11 tests on the search module, 4 on the catalog entry, 711 server and 66 web
green. Nothing has actually searched yet: that waits on a key.

**Verified on the run that measured the gap.** The prompt from D-053 that
exhausted its budget in the browser was re-queued verbatim, in a level with no
repository, with the browser still switched on so the substitution was still
available:

| | turns | calls | last tool | cost | charged |
|---|---|---|---|---|---|
| browser, failed | 11 | 10 | `browser_evaluate` *(refused)* | 27.5c | 0 |
| model knowledge | 4 | 3 | `Write` | 34.3c | 34.3c |
| **search + fetch** | 9 | 8 | `Write` | 39.5c | 39.5c |

It never opened the browser. Given a tool that finds pages, it searched, read
two of them and wrote up what they said — and the answer is the kind the
substitution could not produce: **919 goals as of 19 July 2026**, split 794 club
and 125 international, with two independent sources agreeing *on the split
rather than only the total*, a third matching, and the lower figures still
circulating (911, 914, 918) correctly diagnosed as older snapshots rather than
rival counts, since 23 of those goals were scored in 2026.

It also carried D-053's honest-fallback habit into a run that had sources:
counting basis stated, and *"not verified by me: whether Messi has played
between 19 July and today."*

**The price of being right is about 5c.** Against the model-knowledge run it is
39.5c versus 34.3c, for a sourced and cross-checked answer instead of an
unverified one carrying a knowledge-cutoff caveat. Against the failed run it is
39.5c charged versus 27.5c absorbed for nothing. And the fetched pages are the
reason a turn here costs 4.4c against the 2.0c a no-repo session averages —
search buys accuracy with input tokens on every subsequent turn, exactly as a
clone does, which is worth knowing before assuming a search tier is cheap.

## D-055 — 2026-08-03 — A free tier for finding pages, and what it must never claim

Asked why a search cost a full session when the app already answers *"read this
page"* for nothing, the answer was that nobody had built the other half. The
router had `answer`, `fetch` and `tool` free, and zero references to search: a
bare *"search for X"* paid ~35c for a session to make one API call and paste the
result. Now `search` is the fourth free tier.

**The whole design is in what it refuses.** `fetch` can use an allowlist because
its subject is a URL; a query is arbitrary text, so the subject cannot be
checked. Instead the *lead* must be a search instruction and the remainder must
not turn the search into a question about its own results — `and`, `then`,
`summarise`, `compare`, `why`, `how`, `best`, `should` and a dozen more. A
prompt carrying an address is a fetch, never a search: the page was named.

**Under-firing is deliberate.** "Search for the best typescript orm" contains
`best` and so costs a session, though it is a plain query. That is the safe
direction, and the reason is the router's own rule: a missed saving costs money,
a wrong answer costs trust — and **handing a list of links to somebody who asked
a question is a wrong answer given for free.** Ten of the sixteen router tests
added here assert that it does *not* fire.

**It also refuses work it could not finish.** The tier claims a job only when
the connection is granted to it *and* the level actually has a way to search, so
a level with no key never routes one. And a search that fails is not an answer:
the job falls through to a session, because the user asked for pages rather than
for an apology.

**Injected whole rather than as a key**, which was a correction mid-build. The
first version called `fetch` directly and would have made the tier untestable
without a network — the same untestability that hid two ledger bugs for 79 jobs
(D-039). `RoutedExecutor` now takes `searchFor?: (query) => Promise<SearchResult>`,
so the executor needs neither the secret nor an HTTP client, and five tests
exercise the tier with no network at all.

**And the quote was lying.** `routed` covers three different free things and the
wording only ever spoke for one: a search quoted *"Free — we already know this"*,
which is the opposite of true — the app is about to go and look. It was loose
for `fetch` too. `quoteFor` now takes the reason from the caller, who knows
which of the three it is.

Verified live: *"search for typescript 6 release notes"* quotes **"Free — just
looking for pages"**, runs at `tier: routed, costUsd: 0, turns: 0`, and writes
real results. The same sentence with *"and summarise what changed"* quotes 33c
and a session; *"how many goals has Messi scored?"* still quotes $1.58 and a
session. 727 server and 66 web tests green.

**What this does not do is make research free.** The Messi run cost 39.5c and
what it bought was the judgement — cross-checking sources, spotting that three
circulating figures were stale snapshots rather than rival counts. This tier
only removes the session from requests that never wanted judgement in the first
place. D-021's line holds: pay for judgement that has not been compiled yet, and
nothing else.

## D-056 — 2026-08-03 — The ledger gains an author, and the panels that needed one

The crew rail gained a productivity block under the roll call and the terminal
an inbox of finished work under the feed. Both read the ledger, and building
them turned up the reason nothing had read it that way before: **a row records
the role that ran a job, never the agentling.** Two hires holding the same role
are one entry in that file, so "who is spending" had no answer in the only
complete account of what has been paid out.

**The alternative source is worse in a way that hides itself.** Per-member spend
can be summed from `jobs.json` instead — the backoffice already does something
like it — but the queue keeps only jobs still in it. Measured on `hq`: the
ledger holds 95 runs at $22.47, the queue 83 of them at $20.87. A panel built on
the queue would have been $1.59 light and said nothing about it.

So `LedgerEntry` gained `agentlingId`, and `scripts/backfill-ledger-author.mjs`
filled the history **by identification**: each row matched to its job by id, the
author copied from that job's own `assignedTo`. 87 of 104 rows resolved. The
other 17 have lost their job record — their sandbox holds a `.session.json` that
names the *role* and nothing else — so they were left blank rather than
attributed to whoever held that role, which would have built a spending record
for work that agentling may never have touched. What they cost is reported as
`unattributed`, and the panel says so in words: without that line the crew's
figures simply add up to less than the level's, which reads as arithmetic gone
wrong rather than as a known hole. (The rule is D-030's and D-036's: backfill by
identification, never by guess.)

**The street lights are spend over quote** — green under half, amber to 85%, red
above — and the count of runs stopped at their ceiling sits beside the ratio in
words rather than in a second colour. The two genuinely disagree and the choice
was made on the real numbers: by ratio Pip is 28% and Sol 22%, both green; by
how often the budget binds, Sol is capped on 4 of 11 priced runs against Pip's 1
of 15. A member can be cheap in dollars and capped a third of the time, and that
says **the quote is too tight for their work**, not that they overspend. One
light for one meaning; the other fact is still on the row, in a sentence.

**Two figures that only sound alike were kept apart, and two that were the same
were joined.** `delivered` cannot come from the ledger: a run that exhausts its
turns holding a finished diff files as a ledger failure and as a `partial` job —
14 of them here — so reading delivery off the ledger undercounts by exactly the
runs most worth reviewing. It is taken from the queue and documented as a floor.
Meanwhile `Outcome`/`outcomeOf` moved into the shared model and the backoffice
now takes its lifetime line from the same request the new block does. Two copies
of that map, and two totals for one level, is how one job comes to be "kept" in
one panel and "to review" in the other (D-030 again).

**Mutation-tested, and three of the tests were not doing their job.** Seventeen
mutants; fourteen were caught first time. The three survivors each marked a test
that asserted something true of both the right rule and the wrong one: a
"compares halves not endpoints" case whose data made both rules agree, a journal
matcher probed only on `failed` and not on `delivered`, and an ordering test that
never checked the date it displayed. Fixing the third also tightened `isJournal`
from opening words to whole shapes, since "merged with care: read both files
before rewriting either" is a real lesson that starts exactly like the
bookkeeping. Re-run against all 119 real memory lines, strict and loose agree
on every one — the hole was real and unhit, which is the only kind a passing
suite ever shows you.

**Layout was measured, not eyeballed.** A fixed 240px inbox came out *taller*
than the live feed it sits under (134px against 106px on a short panel), and a
flat floor under the roll call pushed the record 31px through the panel's own
border at the 240px minimum the app's grid allows. Both are now shares rather
than pixels, swept from 240 to 860px of panel with no spill and the live half
larger at every step.

## D-057 — 2026-08-03 — Two ways to count one thing, and why the slower one stays

`SourceStatus.count` was recorded inside `syncSource`, before `syncSources` ran
`dedupe` across every source. Dedupe drops any `kind:name` a source listed
earlier already claimed, so the count described what a source **read**, never
what it contributed: measured on the real index, `wshobson-agents` reported 204
against the 180 that reached `entries`, and the four sources summed to 556
against 532. `truncated` never covered it — that reports the `MAX_PER_SOURCE`
cap, which no source currently hits. `syncSources` now recomputes each count
from the deduped entries, and the on-disk index was re-synced: 180 == 180,
532 == 532, 0 entries added or removed.

**The decision is not the fix, it is what was left duplicated.** `browse.ts`
still counts the index itself in `indexedBySource` rather than reading the
number now sitting in `count`, and that reads as a straight violation of D-030 —
one notion, two derivations, the shape that let "it delivered" drift. Two
reasons it stays. The weaker one is temporary: an index synced before this
carries the old figure, and a fix that ships inert against data written before
it is this project's most repeated bug (D-026, D-030, D-033, D-036). The
durable one is that `indexedBySource` counts *the same list the filter is about
to show*, so the number and the rows come from one pass and cannot disagree,
whereas `count` is a cache written at sync time and only ever as fresh as the
last sync.

**The clean resolution was available and not taken.** Deleting `count` from
`SourceStatus` altogether and letting every caller ask `indexedBySource` gives
one number instead of two that agree — D-030 satisfied rather than argued
around. It costs a field in a persisted JSON shape plus the truncation warning
in `RolesModal` that reads it. It was not done because the task was to make
`count` mean one thing, not to remove it, and widening that unasked is the kind
of call the brief did not hand over. **If a third consumer of `count` appears,
take the collapse rather than writing a fourth argument for keeping the cache.**

**What dedupe discards is still discarded.** It reports nothing about what it
dropped or to whom, so "24 of these are also published by `wshobson-agents`" is
not merely unshown — it is uncomputable without changing `dedupe` to return its
losses per source. Worth knowing before anyone promises that line in the UI.

Proved by a test that syncs two sources both publishing `skill:pdf` and asserts
the later one's count is what survived rather than what it read, plus the
property that was false: source counts sum to `entries.length`. Mutation-tested
after committing — reverting the one line in `syncSources` fails it with
`expected 2 to be 1` while the file's other 28 tests stay green.

## D-058 — 2026-08-04 — A document is shown where it lands, and two listings become one

The gap was not production. Measured before designing anything, from a real
sandbox-depth path rather than from D-031's account of itself: `.docx` 8,487
bytes, `.xlsx` 6,386, `.pptx` 44,730, `.pdf` 837, with `pdf-parse` and
`mammoth` reading their own siblings' output back. The mechanism holds — a
sandbox sits inside the project, so Node walks up to the root `node_modules`
and no job installs anything.

The gap was that **nothing had ever produced one, and nothing could show one
if it had.** Every file on disk across both levels: 167 `.md`, 37 `.patch`, 23
`.mjs`, one `.csv`. Zero documents. The PDF runs of D-030 lost their
sandboxes, so the capability is proven in the library and still unproven in
the crew's hands — the split the first hard-won rule is about, sitting in the
log unnoticed for four days because "we installed the libraries" reads like
"the crew produces documents".

**Converting happens on the server.** Not a preference: the libraries are
already there for the sandboxes, and the web workspace is pixi, react and a
font. `previewFile` answers with a kind — `grid` from exceljs, `html` from
mammoth, `slides` from the pptx's own XML through jszip, and for a PDF or an
image `native`, which is the honest answer that the browser draws it better
than any description of it. Zero new dependencies: jszip was already on disk
as a transitive dep of four of the six document libraries and is now declared
rather than relied on by hoisting.

**Sanitising by hand rather than adding a sanitizer.** Mammoth escapes the
document's own text, so the exposure is not what a document says but what it
links to: a hyperlink target is author-controlled and travels into an `href`
intact. So the tag list is fixed, every attribute is dropped, and an `href`
survives only if it is plainly `http(s)`. Proved through the real converter,
not against a hand-written fixture — a `.docx` built with `docx`'s own
`ExternalHyperlink` pointing at `javascript:alert(1)`, asserted to come back
with its words and without its scheme.

**Every conversion says what it lost, and every cut says what it cut.** The
panel carries `exact` or `converted · values, not formatting` beside the file
name, and `100 of 214 rows` under the grid. This is not decoration. D-030
records an answer banked as "hello-world.pdf (1,380 bytes) is a valid one-page
PDF" over a sandbox that held that sentence and no PDF; a preview that reads
as the document is the same error with better typography.

**Two listings became one, and so did two orderings.** `listOutputs` read
every byte of every file so the panel could print the text ones — megabytes
fetched to draw a row of labels, and an answer to "what is in this file" in a
place that had not asked. The route now returns `describeOutputs`, the listing
the inbox already used, and contents come one file at a time from the preview.
Separately, the inbox ranked paperwork last while the review panel ranked
`RESULT.md` first, so a job that wrote a spreadsheet led with the spreadsheet
in one panel and with the write-up in the other. One `orderFiles` now, in a
plain module beside the JSX like `activity.ts` and `ledger.ts` — deliverables,
then `RESULT.md`, then the rest of the paperwork.

The inbox chip changed what it does: it opens the file, and a separate arrow
saves it. Saving a `.xlsx` to find out whether it was the right `.xlsx` was
the whole complaint.

**Evidence.** 803 server tests and 74 web, plus a live run against the running
server on a real finished job — the `.xlsx` came back as two named sheets with
their totals, the `.docx` as its headings, the `.pptx` as two slides in order,
the `.pdf` as `native`, and a `.md` as text. Mutation-tested after committing,
four at once: allowing every `href`, disabling the tag list, cutting
`GRID_ROWS` to 5, and restoring the inbox's old ordering each failed the test
written for it — 4 of 14 server tests and 2 of 8 web, with the rest green.

**Not solved, and named rather than left to be discovered.** A `.pptx` preview
is text and no visuals, because nothing installed renders a slide. A `.docx`
keeps its words and not its layout, which is D-031's accepted cost showing up
one layer higher. And the panel still cannot show a document the crew never
wrote: the tier matters — only a session tier can write one, since a compiled
tool's contract is plain node with no dependencies — and so does the turn
budget, D-030's run 5 having produced a working generator and no file.

## D-059 — 2026-08-04 — The store reads documents, and the splitter that made it real

Opening the knowledge store to `.docx` and `.pdf` is one line in `INDEXABLE`,
and on its own it would have been inert.

**What `passages` actually did.** It split at markdown headings and `trim`med
each section to 600 characters, throwing the rest away. Invisible on the short
notes it was built for and ruinous on anything else — measured before changing
anything, a 2,974-character `.txt` indexed as **one** passage holding 633
characters, so 79% of a plain text file was already unsearchable, and a
markdown file with long sections lost every tail past 600. Nothing said so; the
`skipped` counter reports files left out, not content left behind, so the panel
showed a clean sync over a partial index.

A `.docx` or a `.pdf` has no `#` headings anywhere, so adding the extensions on
top of that would have indexed the first paragraph of each document and looked
exactly like it worked. That is D-026's shape once more: complete in the type,
the route, the setting and the panel copy, and reaching nothing. So the change
that matters is that an over-long block is now **cut** into passages at a
sentence end rather than truncated, which fixes `.txt` and long markdown in the
same motion — they were broken before documents were ever mentioned.

**The rest is small on purpose.** `extract` reads a file by extension, lazily
importing `mammoth` or `pdf-parse` so a folder of markdown loads neither; the
libraries are already at the project root for the sandboxes (D-031), so
nothing was installed. `sync` becomes async and one unreadable file — an
encrypted PDF, a `.docx` that is a renamed something-else — costs its own
passages and no more, the same rule a missing source folder already had.

**A second cap, because documents are not notes.** `MAX_PER_SOURCE` bounds a
folder at 250 files; nothing bounded a file. One 500-page PDF is more passages
than 250 markdown files put together, and the whole index is parsed on every
job and every quote. So 200 passages a file — about 60 pages — with the count
of files that hit it shown in the panel, on the same rule the source cap
follows: a store that quietly indexed the first third of a contract would
answer confidently from that third.

**Caught by running it, not by the test.** `pdf-parse` writes `-- 1 of 1 --`
between pages, and it rode into the indexed passage, where it would be shown
in a recall answer and pasted into an agentling's briefing as though the
document had said it. The unit test asserted with `toContain` and passed with
the marker sitting in the entry; it was visible the moment a real PDF was
indexed and the entry read back. The test now asserts its absence, over a
two-page PDF, which is also what proves the pages are both read.

**Evidence.** Verified live on the `home-chores` level and then removed again:
a folder holding a `.docx`, a `.pdf` and an `.md` indexed as 3 passages from 3
files, and asked through the real router, "what do we know about the
dishwasher warranty" returned the `answer` tier — free, no session, no turns —
quoting the PDF with `[warranty.pdf, synced 2026-08-04]` on the line, and "what
do we know about the boiler service" returned the `.docx` the same way.
810 server tests and 74 web. Mutation-tested after committing, one at a time so
the signals do not mask each other: replacing the chunker with the old truncate
failed 4, dropping the two extensions failed 2, removing the page-marker strip
failed 1, and removing the truncation counter failed 1.

**Still not read.** Anything that is not text under the hood: a scanned PDF is
pictures of words and yields nothing, which the panel now says rather than
leaving it to look like a file that was skipped. `.xlsx` and `.pptx` are not
indexed either — the crew can write both and `previewFile` can read both
(D-058), so this is a decision not to flatten a spreadsheet into prose, not a
missing capability.

## D-060 — 2026-08-04 — A grid is not prose, and the readers stop being written twice

D-059 closed by naming `.xlsx` and `.pptx` as a decision not to flatten a
spreadsheet into prose rather than a missing capability. Reopened on request,
and the decision was the right thing to have deferred: the extensions are two
lines and the shaping is the whole problem.

**Why a spreadsheet is the hard one.** `AX-114 | Meridian | 12.40` shares no
words with "what do we know about supplier pricing". Everything that would
match — the column names, the sheet tab — sits somewhere else in the file, and
`relevantLines` scores one passage at a time against the question. Worse, a
long sheet is cut into passages wherever the length runs out (D-059), so a
header two hundred rows above is not in the passage that would have matched.
So every row is rendered as a sentence about itself: `Q3 prices — sku=AX-114,
supplier=Meridian, unit=12.4`. Redundant by design — the sheet name and the
column names repeat on every line, because a passage that cannot be cut
anywhere is not a passage, and a term that is not in the passage cannot be
scored. Blank cells are dropped rather than written as `unit=`, which would
spend the budget saying nothing.

**A header row is only a header row when it looks like one.** Text in every
filled cell. One number in the top row and it is data, and labelling the rest
under it would attach `12.40=13.05` to every line of the sheet — a confident
falsehood repeated in every passage, which is worse than no labels at all. A
sheet that fails the test keeps its bare values.

**A deck was easy, and that is the point of the split.** A slide is already a
unit of thought, so it becomes one passage under its own title, which is the
heading rule markdown gets for free. Nothing new was needed.

**The readers moved to `documents.ts`.** The review panel (D-058) and the
store (D-059) want the same four formats for different reasons, and the second
copy of "how do you read a .pptx" was about to be written. That module returns
rows and lines and knows nothing about previews or passages; `preview.ts`
shapes them into a `FilePreview` and `store.ts` into text. This is D-030's
lesson used in advance for once, rather than recorded after the drift.

**Caught by reading a live index, again.** The slide passages came out as
`# Slide 1 Kitchen refit plan` — a label of ours sitting in the recall answer
where the document's words belong, and `slide` would then have scored against
every deck in a folder. That is precisely pdf-parse's page marker from D-059
one entry later, except this time we wrote it. The heading is now the slide's
own first line. Twice in two changes the fault was invisible to a passing test
and obvious in the first real index: the tests said `toContain`, and the thing
wrong was what else was in there.

**Evidence.** 817 server tests and 74 web. Verified live on `home-chores` and
then removed: five files — `.md`, `.docx`, `.pdf`, `.xlsx`, `.pptx` — indexed
as six passages, and through the real router "what do we know about the
washing machine brand" was answered free from the spreadsheet while "what do we
know about the kitchen refit order" came back from the deck, each with its
filename and sync date on the line. Mutation-tested after committing, one at a
time: dropping the two extensions failed 2 tests, dropping the sheet-name
prefix failed 3, weakening the header test failed 1, restoring the `# Slide N`
label failed 1, and removing the blank-cell filter failed 2.

**Bounds unchanged and now load-bearing.** A spreadsheet is verbose by design,
so `MAX_PASSAGES_PER_FILE` (200) is what keeps a large workbook from being most
of an index that is parsed on every job and every quote. exceljs reads the whole
file whatever we ask of it, so the cap bounds the index and not the read.

## D-061 — 2026-08-04 — Reading paper: the engine Windows already has

D-059 and D-060 both ended by naming the same hole — a scan holds pictures of
words and none this app could read — and the panel said so in as many words.
Closing it turned out to cost nothing to install, which was not the expected
answer and is the whole reason this entry is short on options and long on
measurements.

**Both halves were already on disk.** `pdf-parse` carries `pdfjs-dist` and
`@napi-rs/canvas` as its own dependencies, both prebuilt — no native build,
which is what ruled a Python stack out in D-031 — and exposes `getScreenshot()`
at about 130ms a page. And Windows ships an OCR engine, with `en-US` and
`es-MX` installed on this machine. So the rasteriser and the reader were both
there, and the work was joining them and being honest about the result.

**Chosen over tesseract.js on measurement.** That would have been portable and
cost ~32MB of `node_modules` (1.4MB package, 30.6MB WASM core), a postinstall
script, and a ~15MB language download to vendor for offline use. Against a
built-in engine that reads a rough page in well under a second, the portability
was the only thing it bought. The accepted cost is that `ocr.ts` is now the one
Windows-only file in the project, against PROJECT.md's "prefer cross-platform"
— which is exactly why it is a file and not a few lines in `documents.ts`.
Everything above it asks `ocrAvailable()`, gets `false` elsewhere, and syncs at
ordinary speed with the scans reported unread. A portable engine later goes
behind the same seam with no caller changing. Claude vision was the third
option and is the better reader by far; it was turned down for bulk indexing
because a 250-file folder becomes a real bill, and it remains the obvious
answer for a single document inside a job.

**Three constants, each measured rather than assumed, and two of them
surprising.**

*Render scale 2.* On a realistic page — 10pt body copy, skewed 1.2°, speckled,
JPEG quality 50 — scale 1 recovered 5 of 22 expected tokens, 2 recovered 18, 3
recovered 18, and 4 fell back to 15. Upscaling a lossy scan magnifies its
artefacts and softens the strokes, so more resolution is worse past a point.
An earlier probe had suggested scale 1 was fine, and it was wrong for a reason
worth naming: its text was poster-sized. A fixture that is easier than the real
thing measures the fixture.

*One shell per document, never per page.* One page costs 1,567ms and four cost
1,497ms — essentially all of it is PowerShell starting. Per-page spawning would
have made a ten-page document ten times slower for nothing.

*A budget of 200 pages a sync, 20 a file.* Reading a text layer
is free and reading pixels is not, and the sources route blocks until the sync
finishes. Every other cap here is reported; these are too.

**"Is there a text layer" is not "is it non-empty".** A scan often carries a
stamp added digitally, so `getText` returns *something* — and treating that as
a text layer indexes a 40-page contract as the word "Confidential". The test is
40 non-space characters.

**The marker is the point, not the polish.** Every OCR'd passage says so where
it is quoted: `[invoice-scan.pdf, read from a scan, synced 2026-08-04]`. The
live run returned `engiñééÊR]` for `engineer R.` and `Appliance:worcester` for
`Appliance: Worcester`, and the recall tier puts that line into a free answer
and into an agentling's briefing word for word. Good enough to find a document,
not good enough to quote one — and the reader has to be told which they are
holding. This is D-058's `converted` badge one layer down, and the third time
in three entries that the fault worth catching was scaffolding or noise passing
itself off as the document's own words.

**Evidence.** 822 server tests and 74 web. Verified live on `home-chores` and
then removed: a photocopied invoice and a phone photo of a gas meter indexed in
4.8s, and through the real router "what do we know about the expansion vessel
part number" came back free, quoting `EV-4471` off the scan with the marker on
the line. Mutation-tested after committing, one at a time: forcing the text
layer to always win failed 2 tests, dropping the `scanned` flag from the entry
failed 2, and setting `OCR_SCALE` to 1 failed 1.

**One mutation escaped, and that is the useful part.** Relaxing the text-layer
threshold to `length > 0` broke nothing, because every scan fixture had a text
layer of exactly nothing — so the threshold the code deliberately sets at 40
was untested. The stamped-scan case above was written for it, and the same
mutation now fails 3 tests. A passing suite said the constant was covered; it
was not, and only mutating it said so.

## D-062 — 2026-08-04 — Two faults found by reading the panel copy back against the code

An errand — update the reading panel for OCR — that turned into two real
defects, neither of which any test was going to find, because both were
behaviours nobody had asked the code about.

**A correction to D-061 first.** That entry says of the OCR budgets "200 pages
a sync, 20 a file, both reported". The second half was untrue when it was
written. A file that got no OCR at all was counted as `unscanned`; a file read
as far as page 20 of 50 was counted as nothing, and the panel said nothing.
The one cap in this store that reported nothing was the one whose entry
claimed it did. The sentence is narrowed above and the counter now exists.

**And the budget was being charged the wrong number.** `budget -= allowance`,
not the pages actually read — so a one-page receipt cost the same twenty pages
as a twenty-page report. A folder of thirty short scans read the first ten and
reported the other twenty as holding no text, which is a wrong answer rather
than a slow one. `ScreenshotResult.total` had been sitting in the type the
whole time; `ocrPdf` returns it now, so the budget is charged what it spent
and "this document was longer than I could read" is a thing the panel can say.

**What actually found them.** Not a test, not the type checker, and not the
live run — all three were green. Reading the user-facing sentences one at a
time and asking of each "is this still true, and how would I know". The intro
still said "notes, documents, spreadsheets, decks" a commit after scans became
readable; the per-file warning gave page counts for writing, slides and rows
and not for a scan. Chasing the second one into the code is what surfaced the
counter that did not exist and the arithmetic that was wrong. Copy is a
description of behaviour, and description is a test that runs in your head.

**And a rule broken, worth recording because the log already warned about it.**
Mutation-testing these fixes, `git checkout -- server/src/store.ts` reverted
them: they were not committed yet. That is D-021's hard-won rule — mutation-test
*after* committing — hit exactly as written, in the file that records it. The
work was redone from the conversation rather than lost, and the order is the
point: commit, then mutate, then restore.

**Evidence.** 824 server tests and 74 web. Both fixes mutation-tested after
committing this time: charging the allowance again fails the budget test,
removing the counter fails the cut test.

## D-063 — 2026-08-04 — The run is told its budget, and delivers before it ends

The first real job queued into a real level failed with nothing to show for it.
`97b95f10` — "a summary table of this month's main economic indicators from
Chile and the US" — spent all ten of its turns gathering, made 28 tool calls,
was still calling `search_web` when the cap fired, and left an **empty
sandbox**. 65.8c, absorbed, and because the close-out pass only runs on a job
that left something behind, no lesson and no approach were banked either. The
level's whole memory of it was two generic log lines.

**The brief had never mentioned there was a budget.** Read back out of the
session record rather than inferred: it asked for `RESULT.md` "when finished"
and said nothing about turns. The run could not ration what it did not know it
had, and had no reason to checkpoint. It is also worth stating what the run was
*allowed*: quoted $1.58 and dead at 66c, because `maxTurns = min(role cap,
quote ÷ rate)` and `worker`'s cap of 10 bound long before the money did. The
tighten-only rule is D-018 working as designed, and the effect is that a
generic guess about a trade overrode a budget computed for this job.

So the brief now carries the same number the SDK is capped at — one variable,
so the two cannot disagree — and asks for the deliverable early and updated
rather than saved for the end, plus a line about saying what is missing if it
runs short.

**This is not D-020 coming back.** That moved `LESSON.md` and `APPROACH.md` out
of the session because meta-work competed with the work and was cut first.
`RESULT.md` is the deliverable and was already demanded; this changes when it
is written, not whether.

**Evidence — the same sentence, same level, same four connections, same quote.**

| | `97b95f10` | `306e415e` |
|---|---|---|
| status | `failed` | `partial` |
| left behind | nothing | `RESULT.md`, an `.xlsx`, the script that built it |
| close-out | never ran | ran, 2.3c |
| recipe | none | banked |
| cost | 65.8c | 93.3c |
| charged | $0 | $0 |
| turns | 10/10, max_turns | 10/10, max_turns |
| output tokens | 5,799 | 15,234 |

**It did not finish. It delivered anyway**, which is what the change was for.
Cost rose 42% and bought a spreadsheet, a sourced report, a lesson and a
method, against a baseline that bought two log lines. The report also caught
what the request itself got wrong — the month was four days old, so only one
indicator had published — and said so with a release date on every row.

Two things learned in passing. A `partial` from a cut-off run is **not**
charged: `sim.ts` files the ledger outcome as `failed` on the throwing path
whatever the queue's status says, so the billing consequence feared before the
change does not exist. And the panel and the level's own `KNOWLEDGE.md`
therefore disagree about what happened — "to review" against "failed".

## D-064 — 2026-08-04 — A method earns the leash by having worked, not by existing

D-063's success set up the next failure, and it was visible before it happened.
The recipe banked by `306e415e` is an exact key match under an unmoved
capability surface, so `findRecipe` called it **strong** — checked against the
stored file rather than reasoned about: `exact: true | strong: true`. The next
run of that sentence would have been given **five turns to do what the run that
wrote the method had just failed to do in ten.**

Nothing asked whether the authoring run had got anywhere. `Recipe.successes`
existed and was read only by tool promotion.

**The two-bar logic is right and its premise did not hold here.** D-019 and
D-023 price the two mistakes correctly — a wrong method on a full run wastes a
turn it can ignore; the same method with the leash cut wastes the run — but
both assume a recipe saves *exploring*. This job is gathering-bound: ten
agencies' figures take the turns they take, and knowing the method gathers
nothing. So `canShortenLeash` now wants a landing as well as an unmoved
surface.

**`successes`, deliberately, and not whether the authoring run finished.** Two
questions that sound alike, and this file has been wrong before by collapsing a
pair of those (D-030, and the three runs it took to get `partial` apart from
delivery). `successes` counts runs that used the method and delivered — evidence
about the *method*. The authoring run's own ending is evidence about one run.

It costs the leash exactly one outing, because a hint-only match still credits
the recipe when it lands. Proved end to end rather than argued: run 1 writes
the method, run 2 gets it as a hint on the full cap and delivers, run 3 is
leashed. The free `answer` tier is untouched — it keys off `exact`, not
`strong`.

**Amended the same day: "exactly one outing" is true going forward and was not
true of what was already on disk.** Every recipe written before this gate has
`completions` absent, which reads as zero, so all of them were demoted at once.
Counted rather than estimated: **31 recipes on this machine, 1 leash-eligible,
30 hint-only until each earns a completion of its own.** The one-shot tier is
therefore dormant across the board rather than delayed by a run — its measured
55% step-down does not apply to anything until recipes re-earn it one at a time.

That is the conservative reading and it stands: there is no evidence any of
those 30 methods ever completed, and the tier's own record is 21 leashed
failures against 8 deliveries. But the sentence above understated the cost by a
factor of thirty and the count belongs next to it. Note also that the leniency
D-068 added for an absent `completedInTurns` cannot be reached by any of them —
it only applies once `completions` is at least 1, which is exactly what they
lack.

The tier's own history is the argument for buying that evidence before spending
the leash on it: **21 leashed runs failed against 8 delivered**, and most of the
62% of all spend that is absorbed is that.

That figure was wrong when this entry was first written — 5, copied out of
`AGENTLING.md`'s prose rather than recomputed, which is the one thing the
hard-won rules say not to do with a number. Recounted off the ledger the same
day. The ratio still carries the argument; the count was simply stale, which is
how a figure in a note goes wrong without anyone touching it.

**Evidence.** 833 server tests and 74 web, typecheck clean. Committed first,
then mutation-tested: dropping the `successes` clause fails three tests.
Against the live recipe, `strong` flips true → false, so the next run of that
sentence gets the role's full cap with the method as a hint.

## D-065 — 2026-08-04 — The leash gets its own counter, because it was asking a different question

D-064 gated the one-shot leash on `successes`. That was the wrong counter, and
it was wrong for a day.

`successes` decides whether a method is ever compiled into a script, and it is
deliberately generous about *how* a run ended: it credits a dying run that left
a correct patch, because the work was done and only the write-up was cut. That
generosity was itself hard-won — counting clean exits scored two correct
129-line files as zero and did so in the worst direction, promoting the small
jobs a script cannot do while excluding the big mechanical ones it is for
(D-021).

The leash is asking something else entirely: **does this job fit its budget.**
A run that had to be killed has answered no, however good its output was.

**Measured, and the failure was total rather than partial.** Job `3c031419` was
the third run of the same sentence: it delivered a real spreadsheet and a
sourced report, and was killed on its last turn. It credited no success —
because a no-repo run that dies never can, the clause requiring a clean return
being the only route to one without a patch. So that job could never earn the
leash at all, while **identical work with a repository would have earned it
without ever finishing**. Two shapes, two bars, inherited from a decision taken
about a different question rather than chosen for this one.

`completions` counts runs that finished inside their turns *and* left something,
requiring the clean return in both shapes — which is also what removes the
asymmetry. `canShortenLeash` reads it; `successes` goes back to answering only
the compile question.

**The lesson is the one this log keeps recording, and this time it caught the
log itself.** D-064's own text says the file "has been wrong before by
collapsing two of those" and then collapses two of those, in the same commit,
while explaining why it was not doing so. Reusing an existing counter felt like
the opposite of duplication; what it actually was is D-030's second failure mode
— two notions that only sound alike, given one name. The tell was available and
unread: `successes` had a comment three paragraphs long explaining precisely
which question it answers.

**Evidence.** 840 server tests and 74 web, typecheck clean. A regression test
pins the pair apart — a recipe with three deliveries and no completions is
refused the leash — and two executor tests assert the divergence end to end on
one run. Committed, then mutation-tested: swapping the gate back to `successes`
fails the regression test.

## D-066 — 2026-08-04 — Carrying on, rather than asking for a smaller request

The three runs of D-063 and D-065 all ended the same way: the work essentially
done, the session killed at the wall. The obvious response — tell the user to
ask for less — was refused as the actual complaint about this app. A user
trimming their request to fit an engine is doing the engine's job, and it reads
as underperformance because it is.

What was missing is not instruction. It is that a job needing more turns than
one run is granted had nowhere to go.

Most of the machinery already existed: `continues:` carries a sandbox forward,
and `reply` quotes and bills the follow-up as the session it is (D-033). What
did not exist was the app **knowing a run had been cut off** and offering to
pick it up, rather than leaving the user to notice and phrase it.

**The signal is carried, not inferred.** The runner emits `outOfTurns` when the
SDK reports `error_max_turns`. Reading it back out of the error sentence would
be one side saying one word while the other watched for another — the check that
silently never fires, which is why `CANCELLED` is a shared constant. The
tempting alternative, `turns > turnsAllowed`, is *not* a cut-off marker: it
fires on 43 of 88 paid runs and seven of those finished (D-022, D-052).

**A request, never automatic.** Each continuation is a fresh session at a fresh
price, and a job that quietly spawned three would be three charges against one
quote — the thing a quote exists to prevent (D-012, D-025). The same reasoning
as promotion: a charge nobody asked for is a charge nobody quoted.

**The brief points at RESULT.md rather than repeating it**, which is D-063
paying off twice: a run is already asked to record what it established, what is
still missing and what it would do next, and that handover is on disk in the
sandbox the continuation inherits. Better than one composed in the route, and
free.

**A defect found by running it, not by testing it.** The first live continuation
of a `worker`'s job came back routed to `analyst`: the brief it carries has
"read RESULT.md" in it, which is enough to swing a match made on "summary
table". `preferredRole` could not stand in as the fallback, because the matcher
leaves that field empty whenever it is unsure — exactly the case that produced
this. A continuation is the *same job*, so re-matching it asks the wrong
question. It now resolves the role from `assignedTo`, which is the ledger's own
rule — the role that ran the work, not the one the matcher named (D-026, D-029)
— applied to what a run is rather than to what it cost.

**And the test cost something unmeasurable**, which is worth recording because
it will recur. Verifying a queue-backed route by queueing means the sim picks
the job up immediately; cancelling settled it `failed` at nothing charged, but
`costUnknown` — a killed session never reaches the message the SDK reports cost
on. It made 15 tool calls first.

**Existing partials had to be reached.** The field is new, so every run already
on disk lacked it and none could be continued — a change complete in the type,
the route and the UI that reaches no existing data (D-026, D-030, D-033, D-036).
Backfilled by identification on the runner's own `error_max_turns` record,
written at the time: **37 jobs set, 52 left alone** because they carry no such
record. Nothing was inferred from a status or a turn count.

**Measured, and the answer is half of one.** The continuation of `3c031419`
resumed rather than restarted: it opened the spreadsheet the previous run had
left, refined the script that builds it, and rewrote the report as a handover
instead of gathering anything again. Cheapest run of the four, and the whole
sequence on one sentence reads:

| | brief | method | continuation | cost | outcome |
|---|---|---|---|---|---|
| `97b95f10` | no budget | — | — | 65.8c | `failed`, empty sandbox |
| `306e415e` | budget | — | — | 93.3c | `partial`, report + `.xlsx` |
| `3c031419` | budget | approach | — | 78.0c | `partial` |
| `69960175` | budget | approach | carries the sandbox | **55.5c** | `partial` |

Nothing was charged for any of it. The deliverable has existed since the second
run and each run since has improved it for less.

**And all four were cut off at ten turns.** That is the finding. Continuation
makes the work compound across runs, which is what it was for, but it does not
make a run *finish* — so the job never files as done, the recipe never records a
completion, and by D-065's gate it will never earn the leash. Which is correct:
this job genuinely does not fit in ten turns, and the gate is refusing to
pretend otherwise.

So the remaining question is D-063's unresolved half, now with four runs behind
it rather than one: `worker`'s generic cap of 10 bound a job the quote had
funded to roughly 56 turns, four times, and `maxTurns = min(role cap, quote ÷
rate)` means the generic guess about a trade wins over the estimate computed for
this job every time. Whether a per-run turn cap is the right unit at all is the
next decision, and it is a decision rather than a task — D-015 and D-025 are on
record that "ran out of turns" does not mean "needed more turns", and four cut
runs that each delivered are the first real evidence pulling the other way.

## D-067 — 2026-08-04 — The quote wins against a role's standing guess

`maxTurns = min(role cap, quote ÷ rate)`, so a number written into a role's
frontmatter before anyone had seen the job outranked an estimate computed for
the work actually in front of it. Four runs of one sentence, each quoted $1.58,
each held to `worker`'s 10, each killed having delivered (D-063, D-066). The
quote was never allowed to mean anything.

**The rule was right when it was written and had outlived its reason.** D-018
introduced tighten-only because the per-turn rate was pooled across repo and
no-repo work and predicted neither: the budget came out at 17 turns against a
cap of 8, so the cap always won and the ceiling could never bind on anything.
The fix then was the cap; the fix since has been the rate, which is per-shape
and per-tier. What survived into today was the guard without the thing it was
guarding against — and this project has a name for that already: a method that
keeps being used after the ground moved (D-019, D-023, D-037).

**Not every cap is a guess, and the distinction is the change.** `turnCapFor`
returns three things and they are not alike:

| Cap | What it is | Binds |
|---|---|---|
| `RECIPE_TURNS` | The one-shot tier *is* its five turns | firm |
| A job's stated need | A compile's own budget, so no role has to raise its everyday one | firm |
| The role's `maxTurns` | A standing guess about a trade | soft — yields to the quote |

A quote that could stretch the leash would dissolve the one-shot tier rather
than fund it, so firm means firm in both directions. A soft cap yields in both
directions too: a job quoted at 5c still gets three turns and not the role's
ten, which is the money protection tighten-only was really providing.

Both hard clamps stand. `TURN_CEILING` (40) stops a cheap rate and a rich quote
uncapping the loop between them — 100 ÷ 0.001 is 100,000 turns — and
`MAX_CEILING_USD` upstream still stops one freak run funding the next.

**Measured against the real ledger rather than reasoned about.** For
`worker · session · no repo` the rate is **4.69c a turn over 10 samples**, so
the job that paid for this moves from 10 turns to **33** — which is $1.55 at
that rate, against a $1.58 quote. The conversion is sound on average, which is
the claim being made.

**And the honest residual, which the same measurement exposes.** The rate is a
class average, and this job is dearer than its class: it really costs 6.6c a
turn because search puts fetched pages in front of every subsequent turn. 33
turns at 6.6c is **$2.18, about 38% over its own quote.** Nobody is billed for
that — `priceFor` caps the charge at the quote and the app absorbs the rest —
but it is spend, and the exposure is larger than it was, because 10 turns could
not overspend by much and 33 can.

That is the same shape as D-018's finding, one level finer: a rate pooled across
*jobs within a shape* predicts the average and not the member. It was tolerable
while the role cap masked it. Two things follow, and neither is done here: the
drift is visible in the ledger and should be read there rather than argued, and
if it is real the answer is a finer rate — per recipe, or per job history —
rather than putting the cruder guard back.

**Evidence.** 841 server tests and 74 web, typecheck clean. Committed, then
mutation-tested: restoring `min(cap.turns, funded)` fails three tests, one of
them the pair that checks a firm cap and a soft cap of the same size now behave
differently.

## D-068 — 2026-08-04 — A leash has to be a shortening, not a different job

D-067 gave the economic-indicators job the turns its own quote had funded, and
it **finished** — `done`, 33 turns, $1.96 spent against a $1.58 quote, the first
completion in five runs of that sentence. The question it was run to answer got
a clear answer: the job was never too big, it was too tightly capped. Four runs
had been killed by a number in a role's frontmatter while the app's own estimate
said the work was funded.

**And the completion immediately armed the next failure.** It credited
`completions: 1`, which opened D-065's gate, which meant the next run of the
same sentence would be handed **five** turns to do what had just taken 33 —
`firm`, so D-067's own change meant the quote could not rescue it, and
permanently, because a run cut off at five would never complete and so never
revise the record.

**Third time in one day, and the same shape each time.** A gate that verifies
one thing gets read as licensing another:

| Counter | What it actually verifies | What it was read as licensing | Corrected by |
|---|---|---|---|
| `successes` | the method gets the job done | the job fits its budget | D-065 |
| `completions` | a run fitted the budget it had | the job fits *five* turns | this entry |

Fitting *some* budget is not evidence of fitting this one. `completedInTurns`
records what the completing run was **granted** — never the SDK's count, which
said 40 against a cap of 33 (D-022) — and keeps the **shortest** completion,
since a job proved achievable in 33 turns and again in 12 needs 12, and taking
the latest would let one generously-budgeted run undo what a tighter one
established.

The leash is refused when that number is above twice its own length.
**`LEASH_CREDIBLE_UP_TO` is chosen without data and says so in the code.** A run
that finished in 8 turns may well do it in 5 once the exploring is handed over;
one that needed 33 will not, and that gap is not a matter of degree. Refining it
needs leashed outcomes paired against this field — which is the argument for
recording the field now, since it cannot be added backwards (D-050's lesson,
and D-039's).

An absent value keeps the old behaviour rather than being demoted. Refusing
every recipe written before today would have quietly retired the one-shot tier,
which is a 55% step-down on the work it does suit.

**A cycle found by the suite rather than by inspection.** `LEASH_CREDIBLE_UP_TO`
cannot import `RECIPE_TURNS`: `recipes.ts` ← `router.ts` ← `claude.ts`, so the
module initialises half-built and four test files fail to load with
`Cannot access 'STOPWORDS' before initialization`. The direct-import check said
there was no cycle and was looking one hop deep. The constant is written out,
and a test holds the two in step — a test file is a leaf and may import both.

**Backfilled by identification, one recipe.** The live recipe stored its
completion before the field existed, so it was still leashing. `653f8c2e`'s
ledger row records `turnsAllowed: 33` and `outcome: done`, which is the
completing run's own account rather than an inference, and that is the value
written. It is the only recipe on this machine with a completion at all.

**What the run also cost, which is D-067's residual measured rather than
projected.** $1.96 spent against a $1.58 quote — 24% over, where the projection
was 38%. The chargeable figure is $1.58, `priceFor` capping it, so the 38c is
absorbed exactly as designed. It is the first job in this sequence to record any
chargeable amount, and the whole sequence spent $4.89 to produce one delivery.

## D-069 — 2026-08-04 — A method halved a real job, with no leash and no tier change

Everything §8 of `AGENTLING.md` says about repeat work is measured on synthetic
repeats — jobs queued to exercise a mechanism, with about one genuine repeat in
86. This is the first measurement of a banked method against a job somebody
actually wanted done.

| Run | Turns | Method from | Cost | Outcome |
|---|---|---|---|---|
| `653f8c2e` | 33 | a cut-off run | $1.96 | done |
| `8ab9b070` | 40 | **a run that completed** | **97c** | done, **25 turns used** |

**51% off, and the run finished fifteen turns under its cap** — the first of six
on this sentence not to exhaust its budget.

**The part worth reading twice: this was not the one-shot tier.** The leash was
refused (D-068), so `8ab9b070` ran as an ordinary `session` with the approach
handed over as a hint. §8's headline step-down — 55%, session to one-shot — is
attributed to *moving down a tier*, and D-019/D-023 price the weak match as
nearly free but not as valuable: "a wrong method given to a full-length session
wastes a turn it can ignore". The implication nobody had tested is that a right
one is worth about a turn.

It was worth half the job. The method carries value **independent of the leash**,
which is not what the two-bar framing assumes, and it means the tier averages in
§8 have been crediting the leash with savings the approach was producing.

**What changed was the method's provenance, not its existence.** Runs 2–4 banked
approaches written by close-outs of runs that died; run 5 was the first written
by a session that finished. The concrete lever is legible in it — step 4 reads
"build the final output with a script, not manual entry" — and run 6 had a
generator producing the workbook early instead of assembling rows by hand. 24
tool calls against 39.

**Confounds, stated rather than buried.** The budget also rose 33 → 40 and the
level's `recallable` notes reached 6, so the 51% is not the method alone. What
more budget does *not* explain is finishing under the cap: the previous five runs
all spent everything they had.

**n = 1.** Six runs of one sentence in one level. The claim is that a method
written by a completing run halved this job; it is not a rate.

**Amended the same hour, by the seventh run: it was not a rate, and the caveat
above earned its keep.** `765c7dcc` carried a method written by the run that
produced the 97c — better than its predecessor, opening with the timing
clarification rather than reaching it at step 3 — and cost **$1.26**. Three
completions now read $1.96 → 97c → $1.26. What survives is the *step* from no
proven method to a proven one, mean $1.12 against $1.96, and with no tier
change, which is this entry's real contribution. What does not survive is any
suggestion that banking a better method compounds. See D-071.

### Two things the same run measured

**The quote for this class is now pinned rather than drifting.** D-067 warned
the ceiling could feed back on itself; it rose $1.58 → $2.00 after run 5 and
then stayed there, because the ceiling is `max(mean × 2, max × 1.2)` and the max
is still run 5's $1.96. `MAX_CEILING_USD` is doing precisely the job D-016 gave
it. The cost is that the quote has stopped being informative for this class —
permanently $2.00 until that max ages out, and nothing ages. Run 6 cost half its
quote and was charged its actual 97c, so the loop is bounded and not runaway.

**`completedInTurns` records the grant, not the need, and so will not tighten.**
The job completed in 25 turns and the field stayed at 33, because what is
recorded is turns *granted* — 40 here, so `min(33, 40)` holds. That is
deliberate: the SDK's reported count is in a different unit, run 5 having been
capped at 33 and reported 40, which cannot be a usage figure (D-022). The
consequence is that the bound ratchets down only on grants and over-refuses
leashes, which is the safe direction and is not the same as being right.
`toolCalls` — 39 against 24 — is the better signal if this is ever refined,
because it is counted in our units rather than the SDK's.

**Where the sequence ends.** Six runs, **$5.86 spent, $2.55 chargeable**, and a
reproducible method for a recurring job that now costs 97c — against a first
attempt that cost 66c and left an empty sandbox.

## D-070 — 2026-08-04 — A quote that could not find its history, and the copy that covered for it

The sixth run of the economic-indicators sentence was quoted "Up to $2.00 —
first time doing this". It had been quoted that way all six times.

**The lookup was the fault; the copy was accurate about it.** `runnerRole`
returned `null`, because the matcher scored the sentence at 0.24 against a
`MIN_CONFIDENCE` of 0.35 and declines rather than guesses — which is right, and
was then treated as though the job would therefore not be run. It was run six
times, by whoever picked it up, and every row was filed under `worker`. So
`history()` looked up a class no ledger row carries, found nothing, and fell
through to the tier average, where "first time doing this" is the literal truth
about a lookup that never happened.

**Third form of one fault.** D-026 and D-029 fixed the class being *wrong* — a
job priced as the absent specialist rather than whoever ran it. `quoteClass`
fixed it being the wrong *field* — a one-shot quote looking up a recipe key in
a column that only ever held roles, so 20 of 20 one-shot rows missed and every
one of them said "first time doing this" for ever. This is the class being
*absent*, and it produces the identical symptom for the identical reason: **a
quote that cannot find its history cannot tighten, which was the whole promise
of pricing from a ledger.**

With no crew at all it still returns null. There is genuinely nothing to price
under then, and a guess there would be an invented class rather than an observed
one — which is what the test this replaced was protecting, correctly, against
the wrong case.

**Fixing the lookup exposed the wording behind it.** The quote then read "About
44c — done this 35 times before", off 35 `worker` rows, about a job that had run
six. `quoteClass` reads a recipe key for a one-shot and a role for everything
else, and the copy spoke for the first as though it were always true. The count
was real; the claim about it was not. `sameJob` is now passed by the one caller
that knows which it is, and a class lookup reads "from 35 jobs like it".

`ledger.test.ts` had asserted `done this 3 times before` under a test named
"quotes from history once this **kind** of job has been done" — the same
confusion written down twice, green both times, and readable in the test's own
title. D-062's habit again: the copy is a description of behaviour, and reading
it back is a test that runs in your head.

### The other half: a bound that only ratcheted on grants

`completedInTurns` recorded the turns a completing run was *granted*. Job
`8ab9b070` was given 40, finished on 24 tool calls, and left the bound sitting
at 33 — which was merely the smaller of two allowances and says nothing about
what the job needs.

It now takes the tighter of the grant and `toolCalls + 1`. **The units were
checked before the swap rather than after**, which is the whole reason this
project keeps a log: `turns === toolCalls + 1` on **5 of 5** completing rows,
so the expression reproduces the SDK's own count exactly while being counted by
us — and therefore survives a run the SDK never reports on at all (D-052). Had
it not matched, tool calls and turns would have been two notions that only
sound alike, which is the mistake three of the last six entries record.

The bound is still an upper bound and still conservative: SDK turns run higher
than the `maxTurns` grant they came from — 21 against 12 on one row — so
comparing it to a five-turn leash refuses more readily than the truth requires.
That is the safe direction and is not the same as being right.

**Evidence.** 854 server tests and 74 web, typecheck clean. Both fixes committed
then mutation-tested: restoring either the old `runnerRole` or the grant-only
bound fails three tests between them. Verified live — the same sentence that
had said "first time doing this" six times now quotes "About 44c — from 35 jobs
like it", 35 samples, high certainty. The one-shot wording is unit-tested only:
no recipe on this machine currently qualifies for the leash (see D-065's
amendment), so there is nothing live to read it off.

## D-071 — 2026-08-04 — The third run says the halving was a step, not a trend

D-069 measured a banked method against real work for the first time and reported
51% off — $1.96 to 97c between two completing runs of the same sentence. It read
like the start of a curve. The seventh run of that sentence, carrying a method
written by the run that produced the 97c and visibly better than its
predecessor, cost **$1.26**.

| Completing run | Method it carried | Tool calls | Cost |
|---|---|---|---|
| `653f8c2e` | written by runs that died | 39 | $1.96 |
| `8ab9b070` | written by a completing run | 24 | 97c |
| `765c7dcc` | written by a *better* completing run | 26 | **$1.26** |

**So D-069's headline was two points, and the third lands between them.** The
honest reading is one step and then noise: from no proven method ($1.96) to a
proven one (97c and $1.26, mean $1.12) — about 43% — after which the method
getting *better* bought nothing measurable. That is not a new finding so much as
this project's own doctrine arriving on real work: §8 already says a recipe
"cuts the price once, by moving the job down a tier, and then holds it there".
Here it cuts once without any tier change at all (D-069's point stands) and then
holds, at a level noisy enough that two draws differ by 30%.

**The correction matters more than the original claim.** D-069 was written the
same hour on n=2 and carried a caveat about sample size; this is what that
caveat was for. Read the two together, D-069's contribution is that a method is
worth something without the leash — which run 7 supports — and not that repeated
banking compounds, which run 7 refutes. n=3, one sentence, one level.

**And the run that most needed a bigger budget did not use one.** All three
completions were granted 40 turns and used 39, 24 and 26 calls. Nothing since
run 5 has come close to its cap, which retires the concern D-067 was built for
and leaves the opposite one: the quote has been pinned at the $2.00 clamp since
run 5, so every run since has been granted turns it does not want.

### The bound moved toward the truth for the first time

`completedInTurns` was 33, a value that arrived by backfill from run 5's *grant*
and had never once been derived from what a run actually did. Run 7 finished on
26 tool calls and it is now **27** — `min(33, 40, 26 + 1)`.

That is D-070's half of the fix working live, and it also re-confirms the
relationship it rests on: `turns === toolCalls + 1` now holds on **6 of 6**
completing rows. The leash stays refused, correctly — 27 is still far above the
credible bound of 10, and this job has never been done in fewer than 24 calls.

**Where the level stands.** Seven paid runs on one sentence: **$7.12 spent,
$3.81 chargeable**, three deliveries, and a method that reliably produces a
4-sheet workbook for somewhere between 97c and $1.26.

## D-072 — 2026-08-04 — Seven runs of one sentence, none of them recording it was the same job

The quote for the economic-indicators job said "About 44c" for work whose three
completions had averaged $1.40. Not a rounding problem: it was pricing off 35
unrelated `worker` rows, because none of that job's own rows said which job they
were.

```
97b95f10 … 765c7dcc   all session   recipeKey: (none)
```

`hint` carried `recipeKey` only on the leashed branch, and the meter recorded it
only when `oneShot`. So a session *handed a method* — the weak-match path, which
D-069 showed is where most of the saving actually comes from — recorded nothing
identifying the job at all. Only a leashed run was ever a run of something.

**Fourth form of the fault D-070 names**, and by now the pattern is the entry:
a quote that cannot find its history cannot tighten. The class has been wrong
(D-026, D-029), in the wrong field (`quoteClass`), absent because the matcher
declined (D-070), and now never written down for the majority of runs.

**The widening is what makes pricing by recipe safe rather than a swap of one
blind answer for another.** A recipe key carries no rows until a run has been
recorded under it, so pricing by it alone would have quoted "first time doing
this" for a job whose *role* has 36 rows. `quoteFor` now tries the exact job,
then the wider class, then the tier — each step a real answer and only the last
ignorance — and clears `sameJob` itself when it widens, so the wording can never
outrun the rows it was computed from.

**Measured live, before and after the first keyed run.**

```
before:  About 46c   — from 36 jobs like it    samples 36
after:   About $1.11 — done this 1 time before  samples 1
```

That is the whole argument for finer classes in one line: **one row about this
job beats thirty-six about this role.** $1.11 lands mid-range of the job's real
$0.97–$1.26, where 46c was not close to anything.

**n = 1, and it cannot be more.** Only run 8 carries a key. Runs 5–7 predate the
change and were deliberately **not** backfilled: the prompt is recoverable and
the key derivable from it, but whether a given run *used* the recipe is not
recorded anywhere — run 1 predates the recipe existing at all, and the router's
decision at the time is not stored. Reconstructing it would be a guess wearing
identification's clothes, which is the line D-039 and D-046 both draw. `certainty`
stays `estimated` until three keyed rows exist.

**It does not unpin the ceiling, and was not meant to.** $1.11 × 2 is under the
clamp now, but the ceiling reads `max(mean × 2, max × 1.2)` off the same rows,
and one keyed row means one max. It will settle as keyed rows accumulate.

**Amended after two more runs: the prediction was half right, and the half that
failed changed what the problem is.**

`certainty` behaved exactly as designed, flipping on the third keyed row:

| Keyed rows | Expected | Certainty |
|---|---|---|
| 1 | $1.11 | estimated |
| 2 | $1.12 | estimated |
| 3 | **$1.09** | **high** |

The three keyed runs cost **$1.11, $1.12 and $1.04** — a range of eight cents,
far tighter than the $0.97–$1.96 the unkeyed history had suggested, because the
outliers are all from before the method matured and none of them are keyed.

The max term settled as predicted: `max × 1.2` fell from **$2.35 to $1.35** once
run 5's $1.96 stopped being in this job's population. **The ceiling did not
move.** `mean × 2` is now $2.18 and takes over, so it clamps at $2.00 exactly as
before.

So the diagnosis this entry rests on — one expensive run pinning a class for
ever — is **resolved and no longer the cause.** What holds the ceiling now is
the multiplier itself, on a job whose max is 1.03× its mean. `mean × 2` exists
to leave room to exceed the average; here it grants 100% headroom where 3% would
cover every run on record. That is a better problem and a different one.

Deliberately not acted on. n = 3, and those three are tight partly *because*
they are the three most recent — a sample chosen by when the field was added
rather than by anything about the job. And the caution in the table below is
unchanged: the ceiling is the turn budget, so tightening it tightens turns, and
these runs use 23–25 calls of the 40 they are granted.

`completedInTurns` held at **24**: both new runs used 25 calls, above the
standing bound, and the minimum correctly refused to move. Level totals after
ten paid runs of one sentence: **$10.40 spent, $7.09 chargeable, six
deliveries.**

### Why the ceiling was left pinned, measured rather than assumed

The pinning was the original complaint and the measurement rejected both fixes:

| Rule | Ceiling | Turns funded | |
|---|---|---|---|
| current (`max`) | $2.00 | 40 | pinned, generous |
| recency window, any size | $2.00 | 40 | **changes nothing** — the $1.96 run *is* recent |
| p90 instead of `max` | $1.12 | ~22 | would have **cut off run 5**, which needed 33 |

A recency window was the obvious fix and would have been built without the
measurement. And the ceiling is not a display — it *is* the turn budget, so
tightening it tightens turns, and the run that first proved this job can finish
needed 33 of them. Unused turns cost nothing: runs 6, 7 and 8 were granted 40 and
used 24, 26 and 23. The clamp holding at $2.00 is D-016 working, not failing.

**Also this run: `completedInTurns` fell 27 → 24**, the second consecutive
tightening from what a run actually did rather than what it was allowed —
`min(27, 40, 23 + 1)`. And a fourth completion at $1.11 against $1.96 / 97c /
$1.26 keeps D-071's reading intact: one step, then noise.

**Where the level stands.** Eight paid runs of one sentence: **$8.24 spent,
$4.93 chargeable**, four deliveries.

## D-073 — 2026-08-04 — The crew's notes stop repeating themselves

Found by an architecture review reading the training level's files rather than
by anything the app said: ten runs of one sentence left **eleven lines in
`KNOWLEDGE.md` and eight in Pip's lessons, nearly all of them the same
publication-lag fact reworded**. Nothing reads what is already banked before
appending, so a recurring job — the exact job the whole machine is optimised
for — writes its one lesson every run.

**The cost is slot crowding, not tokens.** A session is handed the eight most
relevant knowledge notes and its agentling's five newest lessons. Every copy
quotes the job title, so for this job all thirteen slots were copies of one
fact — and would stay so, crowding out anything else the level ever learns
about its own flagship job. The store measured this shape from outside in
D-049 (158 passages crowding 86 crew notes); this is the same failure arising
from within.

**The obvious fix was measured first and rejected, which is why the fix has
three parts.** A similarity threshold at the append seam cannot work: against
the real corpora, the known rewordings of the one fact score only **0.3–0.5**
under `similarity()` — the crude stemmer misses `publication`/`published` and
`month`/`monthly`, and Jaccard punishes long paraphrases — while hq's 102
genuinely distinct notes have **432 pairs at ≥0.3 and 160 at ≥0.5**. No
threshold separates them; any choice either misses most duplicates or eats
real notes. So:

- **Exact dedup at both append seams, on the undated text.** `undated()` in
  `memory.ts` strips the date prefix; `MemoryStore.append` and
  `appendKnowledge` drop an existing `- ` line saying the same words before
  appending, so the newest telling stays and the date refreshes. Zero false
  positives by construction, and the seams preserve everything that is not a
  lesson line — the first draft rewrote whole files and would have eaten the
  human notes `memory.test.ts` documents as allowed. It catches real cases:
  the same cleanup found 14 exact-duplicate bookkeeping lines on hq (jobs run
  twice banking identical lines, one merge note banked twice).
- **The reworded repeat is stopped at its source, by the one reader that can
  judge a paraphrase.** The close-out is already a paid model call; it is now
  shown the exact window the next session will read — the agentling's five
  newest lessons plus the eight most relevant level notes — and told to write
  LESSON.md holding exactly `known` when its lesson is already there
  (`closeOutBrief`). `parseLesson` reads that as no lesson, so the run banks a
  bare bookkeeping line, which the exact rule above then keeps to one copy.
  D-011's shape: the deterministic layer does what it can prove, and the model
  only ever declines — a wrongly-declined lesson costs one note and the next
  run re-teaches it; a wrongly-banked one compounds forever. The decline is
  model behaviour and is not unit-testable; the prompt and the sentinel path
  are pinned by tests, and the next real training runs are the live check.
- **The existing pile was cleaned rather than left to make the fix inert**
  (the D-026/D-030/D-033/D-036 trap). `scripts/dedupe-notes.ts` applies the
  exact rule retroactively — dry run by default, `.pre-dedupe.bak` beside each
  changed file — and took the 14 hq lines. The training level's paraphrase
  pile cannot be identified by any deterministic rule, so it was cleaned **by
  hand**, the same warrant as D-030's `successes` correction: one reading of
  eleven lines that are visibly one fact, backups kept, keeping the bare
  failed line, Pip's newest telling and Dot's.

**What this deliberately does not touch.** `relevantLines` and `recallSignal`
are unchanged — D-051 records why moving the scorer mid-measurement redefines
`recallable`, and this fix changes the corpus, not the instrument. Future
`recallable` counts will be lower because the level genuinely holds fewer
lines, which is the counter counting what is there.

**Evidence.** 858 server tests and 74 web before the change, 877 and 74 after
both this entry and D-074, typecheck clean. The dedup rules are pinned by new
tests (same-note replacement, differing-notes kept, human notes preserved, the
`known` sentinel, the brief's known-section and its absence); committed, then
mutation-tested — the results are recorded below the next entry, since the two
landed together.

## D-074 — 2026-08-04 — A continuation is the same job, now everywhere it counts

The training level held a second recipe: key = the economic-indicators
sentence **plus the entire carry-on brief**, `hits: 0`, unmatchable by
construction. `/continue` composed the brief into `job.prompt`, so a
continuation banked its close-out under a compound key nobody would ever ask
for again, its runs joined none of the job's keyed history (the D-072 gap,
reopened for continuations), and the brief's own words — carry, start, updated
— entered the rarity corpus every other match is weighed against.

**The fix is D-030's rule, applied to the field it already governs.**
Clarification answers were kept out of `job.prompt` from the start because a
recipe is keyed on `normalise(prompt)`; the carry-on brief violated the same
rule in the same field. So `Job.brief` now carries standing instructions to
the session — `continuationBrief()` composes it, `queuedJobSpec` and
`JobQueue.add` copy it (the D-033 dropped-field trap, paid at both seams), and
`sessionPrompt` appends it after the clarifications. A continuation's prompt
is the original sentence **verbatim**: keyed, matched, quoted and credited as
the job it continues.

**That immediately needed two guards, because the shortcuts now see the
original prompt.**

- **The router refuses every shortcut to mid-flight work.** A continuation or
  a reply carries its sandbox forward, and every shortcut starts from nothing:
  a stored answer would replay instead of resuming, a compiled tool would redo
  the job from scratch, and a five-turn leash is absurd for work that has just
  proved it does not fit its full budget. A matching recipe still lends its
  method — and its key, so the run is priced as a run of that job (D-072).
  The quote carries `continues` on both routes for the same reason the redo
  carries `noRouter` (D-049): a `routed`, $0 quote for a run about to be a
  session is a promise of free arriving as a bill.
- **A mid-flight run counts as usage and testifies to nothing else.** It
  delivered the *remainder* of a job, not the job — so it credits `hits` only:
  not `successes` (three of those would compile a tool that redoes the whole
  job from scratch), not `completions` (a continuation finishing in eight
  calls would license a five-turn leash for work that needs twenty-four,
  D-068's trap by another door), and it neither authors the recipe nor banks
  an answer (its close-out and summary describe resuming, not the job).

**Deliberately left alone: the reply route's composed prompt.** A reply folds
the user's new words into `job.prompt` and so still banks per-reply recipe
keys. That is the same wart one level down, and it is not fixed here because a
reply genuinely is a new request — D-066's own line — and its text must
persist on the job; moving it into `brief` would change what a brief means.
The router guard and the quote fix cover replies regardless, since both key on
`continues`. Recorded so the next person finds the reasoning rather than the
inconsistency (D-043's habit).

**The one recipe banked the old way was dropped by identification**
(`scripts/drop-continuation-recipes.ts`, marker = the brief's own phrase,
`.pre-drop.bak` kept): training-ground 2 → 1 recipes, the real one untouched
at `completions: 6, completedInTurns: 24`.

**Evidence.** 877 server tests and 74 web with D-073, typecheck clean. New
tests pin the guard (a mid-flight exact repeat gets `agent` with the method
and key, never `answer` or `oneshot`), the credit rule (a delivering
continuation moves `hits` alone), the authorship rule (a continuation banks no
recipe), the brief plumbing (`sessionPrompt` appends it; the job keeps its own
prompt), and the quote (`session` tier for a mid-flight recall question,
role-class fallback while the job's keyed rows accumulate). Both entries were
committed and then mutation-tested (D-021's order), one mutation at a time
with the rest of the suite green: disabling the `undated` filter failed 1
test in `appendKnowledge` and 2 in `MemoryStore.append` (the dedup case and
the human-notes case), removing the router's mid-flight guard failed 2, and
un-guarding `delivered` in the credit call failed 1. One mutant survived one
test and it is worth recording (D-056's habit): "sends mid-flight work with no
recipe to a plain session" passes with the guard removed, because a prompt
nothing claims falls through to `agent` either way — it pins the contract's
shape, and the other two tests are what actually hold the guard.

## D-075 — 2026-08-04 — Acting is an outbox replayed at approval, never a tool in a session

The decision AGENTLING.md §15 called "one decision, not seven tasks", taken.
The blocker was always the safety model: everything here is sandbox → review →
promote, and an action on the live internet has no promote step (D-034). The
three candidates on file were a pre-approved allowlist, a dry-run-then-confirm
turn, and a `waiting` status with the run parked — the last already refused
once for separate reasons (D-030).

Settled as a fourth shape that keeps the model intact: **the session never
holds a send tool.** A run that wants to message someone writes `OUTBOX.json`
in its sandbox — one channel, recipients, bodies — and that file is a
deliverable like any other: it counts as delivery by the existing top-level
rule, it is read in review, and **Approve is the send**. The server replays
the reviewed outbox through the channel's client with the stored secret,
exactly as a reviewed patch is replayed by `git apply`. The model composes;
plain code sends; the token never enters a session.

What that buys, in the order it mattered:

- **No new risk class.** The twelve held-back browser tools stay held back;
  D-034's argument is untouched because nothing acts mid-session.
- **Idempotent by recipient.** Send results are stamped on the job
  (`outboxSent`) as they happen, and a partial failure leaves the job
  reviewable with the reasons; a second Approve retries only the recipients
  that failed. Approving twice can never message anyone twice.
- **The audit §11 said did not exist.** Every attempt — sent or refused — is
  appended to `sends.jsonl` beside the ledger: jobId, channel, recipient,
  outcome. A separate file *because* the ledger row is written at completion
  and the send happens later, at review: an append-only price history must
  not gain a second row for an event that cost no model anything. Channel
  prices (WhatsApp's per-message cent) join this file when a priced channel
  ships.
- **The leash, designed and deliberately not built.** A recurring job
  approved unchanged several times may be offered standing approval, scoped
  to the job, its recipient list and its wording; a new recipient or new
  template drops it back to review. The recipient allowlist is also the
  prompt-injection answer — nothing a session *read* can add a recipient a
  human never approved once. It waits for a recurring job to exist to earn
  it.

One more deferral recorded as reasoning rather than a gap: the session is not
yet *told* the outbox contract — a capability nobody is told about is not a
capability (D-031), and the telling belongs to intake detection, where the
channel is known to be granted before the run starts. Until then an outbox is
written only by a run explicitly asked to write one, which is the right
smallest surface to prove the pipe on.

Evidence: the approved design of 2026-08-04 (the four mocked screens), the two
prior refusals this composes with rather than reopens (D-030, D-034), and the
implementation landing with this entry — validation, replay, per-recipient
retry and audit under test, including the refusal path: promoting an outbox
whose channel is off fails with the reason and the job stays reviewable,
because "promoted" stamped on a refusal is the one outcome worse than refusing
outright.

## D-076 — 2026-08-04 — Credentials: a Connect button for the OAuth pair, paste-a-token for the rest, passwords never

Research across the candidate menu (2026-08-04) found exactly **two**
providers that need an OAuth flow — Google and Microsoft — and everything
else authenticating with a token the user creates in that app's own settings
page. So the credential surface is two shapes, and only two:

- **Connect button** (Google, Microsoft): opens the provider's own consent
  page in the user's real browser, catches the localhost redirect, and stores
  the refresh token in the gitignored store under the env-var name the
  connection already declares. Two providers in the whole menu makes this one
  contained build, not a framework.
- **Paste-a-token drawer** (Telegram, Slack, WhatsApp Business, Twilio,
  Notion, Discord, Todoist, X…): the existing `.env` pattern surfaced in
  Settings, with a per-connection plain-words walkthrough and validation by
  one real call at paste time, so a bad key fails in the drawer and not in a
  job.

**Agentlings never sees, stores or transmits a password.** That extends the
principle the browser connection set — §11's storage-state rule, "the app
never sees a password" — to every credentialed connection, and it is not
merely taste: Google retired password-based app access years ago, so custody
would be a liability that does not even work.

Two Google specifics that shaped the shape, verified against Google's own
documentation:

- **Testing-mode consent expires in seven days, refresh token included**, so
  the Connect guidance walks the user to *publish* their consent screen:
  unverified-in-production shows one warning interstitial, caps at 100
  lifetime users (irrelevant at one), and refresh tokens persist.
- **Each user brings their own OAuth client.** Shipping a shared client would
  make Agentlings a multi-user app requesting restricted Gmail scopes —
  Google verification and a paid security assessment. Own-client is the
  standard posture for self-hosted tools and the honest one here.

Also verified, and kept because it closes a question §5 left open: Google now
ships official Workspace MCP servers — per-product, remote HTTP, Developer
Preview — and they *still* require your own OAuth client and consent screen,
and their Gmail write tool is `create_draft`, not send. They dodge nothing
this decision needs dodged, so the registry's missing HTTP transport is not
forced by this batch, and the first credentialed connections stay builtin
thin clients for D-040's reason: a mailbox is exactly where owning the size
of the answer bites hardest.

## D-077 — 2026-08-04 — The connection batch: four now, nine later, six never

The menu, settled by research rather than enthusiasm — usage, pricing and API
posture verified 2026-08-04, in the turn recorded before this one. The
WhatsApp question is what started it; D-075 is how any of them send.

**Tier 1 — wired first.**

- **Telegram** — bot token, free, sends in a minute; each recipient taps
  Start on the bot once. The cheapest possible proof of the whole pipe.
- **Google: Gmail + Calendar + Contacts, one consent** — the only channel
  that arrives *as the user*, from their own address.
- **WhatsApp Business Cloud API** — per-message pricing since July 2025,
  ≈$0.025 US and country-dependent (≈$0.010 India, ≈€0.11 Germany), service
  replies inside the 24-hour window free. The honest toll is the setup — a
  Meta business account, a dedicated number that leaves the consumer app,
  pre-approved templates — and that messages arrive from a business number,
  which changes the decision more than the cents do.
- **Slack** — a user-created internal app with a pasted bot token. The May
  2025 crackdown (1 request/minute on history reads, LLM-training bans)
  targets commercially distributed apps; internal custom apps are exempt.

**Tier 2 — same two credential shapes, added on demand.** Outlook/Microsoft
365 (Graph covers personal accounts, the second and last OAuth build),
Discord bot, SMS via Twilio (≈1¢/message US, the fallback for recipients
with no apps), Notion, Todoist, GitHub acting (the existing token gains
write scopes and outbox types — no new auth at all), X (pay-per-use became
the default in February 2026: $0.015/post, $0.005/read, no monthly minimum,
so personal-volume posting is viable for the first time since the API
closed), Bluesky, Reddit.

**Never on the menu, with the reason on the row** so nobody waits for them:

- WhatsApp personal — no API exists; puppeting WhatsApp Web breaks Meta's
  terms, gets numbers banned, and is the acting browser D-034 declined,
  arriving by another door.
- Signal — no official API.
- iMessage — nothing exists off-Mac.
- LinkedIn — closed to personal automation and enforced.
- WeChat — official accounts need Chinese business verification.
- Instagram / Messenger DMs — business-account APIs behind Meta app review.

**Build order, approved with the mockups:** outbox + review first, then the
token drawer with Telegram live, then intake detection and the ask-bubble,
then the Google Connect flow, then the WhatsApp Business guide. The review
path exists before anything can ask to send, and each slice demos alone.
SPEC.md M5.11 tracks the slices.

## D-078 — 2026-08-05 — The token drawer: one store, one real call, one inbound crossing

Slice 2 of M5.11. A connection missing its secret now reads "Needs
`TELEGRAM_BOT_TOKEN` — add it here, or set it in .env": the drawer shows the
connection's own walkthrough (from the catalog, which is where a connection
says what it is), takes the paste, and stores nothing until the provider has
answered for it.

**`.env` stays the only store, and that was the decision worth writing
down.** The server already hydrates `process.env` from `.env` at boot
(`process.loadEnvFile`), and every consumer — the resolver, the quote, the
executor, the channels — reads `process.env` at call time. So the drawer
writes the file and patches the live `process.env` in one move: a pasted
token works immediately, survives a restart, and there is no second store to
disagree with the first. The alternative, an app-managed `secrets.json`
merged into an env view, was refused because the first reader that forgets
the merge is Settings saying "ready" while the run says "missing secret" —
two answers, dollars apart, which is D-032's shape. The writer is a guest in
a hand-edited file: it replaces the one `NAME=` line, commented or live, or
appends one, and everything else survives byte-identical, CRLF included.

**Validated by one real call per connection — D-076's promise kept.**
Telegram asks `getMe` and shows `@botname`; GitHub asks `/user` and shows
the login; search runs one Brave query. A 429 from Brave refuses to store:
the key may be fine, but "everything stored was validated" is the invariant
and the fix is to wait a minute. Values are guarded before any call — no
whitespace, quotes or `#`, at most 500 characters, so a paste that grabbed
too much fails with "check what was copied" rather than corrupting the very
file it was bound for — and a value never appears in any reason.

**The standing sentence about secrets was amended everywhere it appears.**
"Values never cross the API" was true and now is not, precisely once: a
value crosses inbound at paste time, and is never returned, never listed,
never echoed. `connections.ts`, the catalog comment and AGENTLING.md §5 and
§11 all now say so. Storing still does not enable — everything credentialed
ships off, and the switch stays the user's own move.

**Evidence.** 26 new tests: the env writer's file shapes (commented line
replaced in place, CRLF preserved, prefix names not mistaken), the guard's
refusals, all three validators against a fake fetch including the
never-echo-the-value case, and a catalog rule that every credentialed
connection carries setup steps — an empty drawer is D-011 failed quietly.
Then verified against the running server and the real Telegram API: a
garbage token answered "Telegram rejected the token — check what @BotFather
sent", `has spaces` was refused before any call was made, and `.env` gained
no line from either.

## D-079 — 2026-08-05 — The desk notices a send, and asks at the only moment asking is free

Slice 3 of M5.11. Intake now detects that a sentence wants to message
someone — a send verb and a channel word together, nothing less — and the
plan carries a `channelAsk` card decided entirely server-side from the
catalog and Settings. A connected channel is a quiet chip ("sends via
Telegram · every message waits for your review"); an unconnected wired one
offers the drawer and queue-anyway; a planned one names the roadmap; and
WhatsApp personal states its refusal with the fork D-077 promised —
Telegram now, WhatsApp Business planned with the business-number caveat,
Gmail planned next. The card can offer and the client can pick; neither can
invent a channel nor promote one past its state.

**The job parks at the desk, not in the queue — a deviation from the
slice's sketch, decided rather than drifted into.** The sketch said "parks
as `needs-connection` and the agentling raises the bubble". A parked job
status is the `waiting` shape D-030 already refused, back for a second
audition: a new status through `outcomeOf`, persistence, the sim, and a
resume path — all to hold a job the user is still looking at. The intake is
where "nothing is quoted or billed until you pick" is already true, so the
ask renders as a card on the work bar and Start does what the card says:
carries the channel when one is usable, queues a draft job that sends
nothing when none is. Queue-anyway is honest *because of the earlier
slices* — the approve gate refuses an unconnected channel with the reason
(D-075) and the drawer connects mid-review (D-078) — so a job queued before
connecting is never stuck, only reviewed later. The bubble drawn over the
agentling's head stays presentation polish: the card is the mechanism, the
world is presentation, and nothing behavioural waits on it.

**Detection follows the router's own rule — never guess, and under-fire.**
Word-only ("summarise the whatsapp export") and verb-only fire nothing;
"send a signal to the process" is code talk and stays quiet while "notify
me on signal" gets Signal's refusal; the earliest mention wins, so "on
WhatsApp or Telegram" asks for WhatsApp. And the first test run caught the
detector missing the plainest phrasing there is: "email the summary to the
team" carries its channel in its verb, so `email` joined the verb list —
the test was written from the copy, and the copy was right.

**The session is finally told the contract — D-031's rule, closing the
deferral D-075 recorded.** A job that carries a channel gets an outbox
section in its brief: the exact OUTBOX.json shape, the caps, that "to" is a
numeric chat id and a missing id is reported in RESULT.md rather than
invented, and that the user reviews before anything sends. Told only when a
channel rides, because every prompt line is input tokens on every turn and
a job that does not send should not pay to hear about sending. The channel
is server-settled at queue time — the caller's pick counts only if the
channel exists, no pick means the detection's own default — and the field
crosses both spec seams with a test pinning each, which is D-033's trap
paid forward: `closeOutUsd` went missing in exactly that kind of function
for 79 jobs.

**Evidence.** 20 new tests across the detector, the brief, both spec seams
and the executor append; typecheck clean, 951 server and 91 web tests
green. Verified live against the running server: the original WhatsApp
sentence that started this whole batch returns the fork above verbatim,
"send the padel reminder on telegram" returns connectable with the channel
riding, and "summarise the whatsapp export file" returns nothing at all.

## D-080 — 2026-08-05 — Google connects by loopback, against the user's own client

Slice 4 of M5.11, and the first Connect button — D-076's OAuth shape,
built. The `google` connection joins the catalog exactly as telegram did:
builtin, an empty tool grant asserted in tests, ships off. The `gmail`
channel sends an approved outbox *as the user, from their own address* —
what D-077 called the only channel that arrives as them.

**The flow.** The Settings drawer takes the user's own client id and secret
— D-076's rule: never a shared client, because restricted Gmail scopes on
one make Agentlings a verified-app matter with a paid assessment — and
opens Google's consent page in a fresh tab. Five scopes in one consent
(gmail.send now; calendar.events and contacts.readonly so later slices need
no re-consent; openid email for identity), PKCE S256, and
`access_type=offline&prompt=consent` so a *re*connect still yields a
refresh token. The loopback callback on 127.0.0.1:4600 exchanges the code,
and **the exchange succeeding is the validation** — D-078's rule stretched
over two requests: the pending flow holds the id and secret in memory only,
keyed by a single-use ten-minute `state`, and a flow that never comes back
stores nothing anywhere. On success all three values land in `.env` in one
move, and the card says who connected — read out of the id_token, no extra
call, no extra scope.

**The 7-day trap gets a sentence at both ends.** The setup steps say
publish-to-production out loud, and `invalid_grant` at send time — which is
what a Testing-mode expiry looks like — surfaces as "Google has revoked
this connection — open Settings and Connect Google again. An OAuth app left
in Testing does this every 7 days", never as an HTTP status.

**The gmail channel.** The refresh token buys a short-lived access token
per send and keeps nothing. The message is real RFC 822 in the API's `raw`
field: UTF-8 body, RFC 2047-encoded subject when it carries accents — this
crew writes Spanish — and no Subject header at all when the outbox had
none, rather than an invented one. `OutboxMessage` gains an optional
`subject`, validated like every other field and shown at review; the gmail
outbox brief says addresses-not-chat-ids, write in the user's own voice,
and report a missing address rather than inventing it.

**Identity joined Settings for every connection, not only this one.**
`StoredSettings.identities` records who a connection turned out to be, the
token drawer now writes it too (telegram's card keeps its @bot), and a
ready card reads "connected as brian@gmail.com". Display only — never part
of any gate.

**What this slice cannot verify itself, said plainly.** The full circle —
consent on Google's page, the callback, a real mail — needs the user's own
GCP client and their own yes. That is the design working, not a gap in it:
the app cannot test a flow whose whole point is that only the user can
approve it. What is verified: 26 new tests across the flow store
(single-use, expiring, the challenge really being S256 of the verifier it
keeps), the exchange (refresh token present, absent with the fix named,
refused with Google's own sentence and never the secret), the refresh (the
7-day sentence), the raw message and the channel client; and live against
the running server — the start endpoint minted a correct consent URL, a
bogus-state callback answered 400 with the stale-link page, and "email the
summary to the team" now asks connectable-Gmail at the desk.

## D-081 — 2026-08-05 — WhatsApp Business sends templates, and the audit records a declared price or none

Slice 5 of M5.11, the last Tier-1 sender wired — the channel the whole
batch was asked about first. Same shape as its siblings: empty tool grant
asserted in tests, sends only at approval, a switch that stays the user's.
The two facts that make WhatsApp different are handled head-on rather than
smoothed over.

**Business-initiated WhatsApp is templates, and the contract says so.**
Meta owns a template's text; what travels is its name, its language and
per-recipient parameters. So the outbox gains an outbox-level `template`
— {name, language}, one per outbox, because a batch is one message in N
mailboxes — and per-message `params`, validated in Meta's own shapes:
template names lowercase_underscore, language codes like `es` or `en_US`,
params without line breaks, which Meta refuses late and this refuses
early. `body` stays required and is the message as review reads it — a
claimed rendering — while the card also prints the template line and the
exact params, so what is *transmitted* is on the card even though Meta
holds the words. The brief tells a run: exactly the approved template name
the user gave, never an invented one, and RESULT.md when none was given.

**Two secrets can only be validated whole, which reworked the drawer's
contract.** Meta's one real check — the phone number id asked for its
display number, which is also the identity the card then shows — needs the
token *and* the id. The secret route now takes every missing value in one
submission: a partial paste is refused before any call is made, unknown
names are refused, every value passes the same guards, one validation
covers the set, and only then does anything store. "Validated before
stored" now holds for the *set*, not per field (D-078, amended by this).
The drawer became fill-everything-then-one-Check for every connection;
telegram's single field reads exactly as before.

**The audit records the user's declared price, or none — never a guess.**
Meta prices per delivered template by category and country and does not
say so in the send response; the true figure lives in webhooks and
invoices this app does not read. `WHATSAPP_USD_PER_MESSAGE`, set by the
user from their own rate card, is stamped on each delivered send in
`sends.jsonl` as their declared figure; unset records no price at all. A
guessed price in an audit file is worse than an absent one — D-039's
ledger rule, arriving from the other direction.

**The guide leads with the free on-ramp.** Meta gives every Business app a
test number that can message up to five verified numbers, free — the whole
demo loop with no business verification and no spend. The six setup steps
on the drawer start there and end at the permanent System User token.

**Evidence.** 15 new tests: the template block and params in Meta's
shapes; the client posting template-name-language-params and never the
body; the no-template refusal before any call; Meta's own refusal sentence
surfaced; the declared-rate function refusing garbage, zero, and every
other channel; `executeOutbox` handing the template to each send; the
validator proving both halves with one call. Live against the running
server: the whatsapp fork's three alternatives all show live states now,
"on whatsapp business" is its own connectable ask, a junk two-value paste
answered "Meta rejected the token" off a real graph.facebook.com call, a
partial paste was refused before any call was made, and `.env` gained
nothing from either.

## D-082 — 2026-08-05 — Standing approval: earned in review, scoped to an allowlist, and not called a leash

The last slice of M5.11, building the design D-075 recorded. A recurring
send job approved unchanged three times may be offered standing approval;
granted, its next clean run sends without waiting. The name is deliberate:
this repo already has a leash — the recipe's five turns — and two
mechanisms sharing one word is how two notions get collapsed (D-030). In
code and UI this is a **standing approval**, and `send-approvals.json`
sits beside the level's other records.

**Identity, count, and what resets it.** The job is its prompt —
`normalise(prompt)`, the same identity recipes and keyed quotes use
(D-072) — and the signature is channel + sorted recipient set + template
name where one exists. An unchanged manual approve increments the count;
*any* signature change starts it over at one **and revokes any standing
grant**, because what was trusted is not what is now being sent. Granting
is refused until earned, with the count in the refusal sentence.

**The allowlist is the security boundary, and subset is the rule.**
Auto-send reaches recipients inside the approved set and nobody else —
fewer is fine, one stranger blocks the whole send. This is D-075's
injection answer, built: nothing a session *read* can add a recipient a
human never approved once. Bodies are deliberately not locked, and the
deviation from the sketch's "wording" is recorded here on purpose: a
weekly reminder's words change by design; the recipient set is what
exfiltration needs, while a wrong body is quality, not reach; every sent
body remains on the promoted job's card and in `sends.jsonl`; and
revocation is one click in crew → backoffice.

**Auto fires subtractively.** Only a clean `done`; only when the outbox
parsed; only when the run changed no code and produced nothing beyond its
paperwork and the outbox itself — a send job that also wrote a report is
work somebody has to look at. Then the same gates as a manual approve
(`outboxRefusal`, verbatim — a switched-off channel refuses), the same
idempotent per-recipient replay, the same audit rows with the same
declared price, the same promote. A refusal or a partial failure leaves
the job in review exactly as if no approval existed, with a terminal line
saying why.

**Where it lives.** The offer appears after the approve that earned it —
the job is already promoted; the offer is the review's last step, never a
gate — with the whole recipient list on the card, because the list is the
thing being trusted. Granted approvals are listed in crew → backoffice
with one-click revocation; auto-sent runs land in the inbox as promoted
work and announce themselves in the terminal ("auto-sent 3 via telegram —
standing approval").

**Evidence.** 19 new tests: the count surviving recipient reordering; the
reset-and-revoke on any change; unearned grants refused with the count;
the subset rule and the one-stranger block; no grant → no send at any
count; every autoBlocker guard (partial, compile, no outbox, parse error,
changed code, an extra file); torn-file tolerance. 1011 server and 93 web
tests green, typecheck clean; the approvals routes probed live with their
refusal sentences. The full circle — three real approvals, the offer, a
granted auto-send — needs three real runs of a real recurring job, which
is the training ground's next errand rather than this slice's claim.

## D-083 — 2026-08-05 — Ambience is scene data, and the stalactites the dice never rolled

A visuals batch run in a second session alongside the M5.11 slices,
mockup-first: four animated mocks approved as shown, four commits
(4f03f51, 9c79106, 948b9a1, e43465b), every file in `web/` so the two
sessions never touched the same code.

**Idle life joins the terrain format.** A scene now carries an `ambient`
section in the same spirit as its ops — parameterised idioms, not a
drawing language, D-014's rule extended to motion: `drips`, `flyer`,
`motes`, `beam`, `glints`, `clock`. The scene says which effects and
where, in the same anchor coordinates the ops use; the renderer
(`ambience.ts`) owns the state machines and draws on a layer between
scenery and crew. Thumbnails deliberately get none of it — a snapshot of
dust is a stain. Positional colour comes from theme slots; the water and
the bat are fixed DB colours, the confetti's precedent — a renderer
detail, not a theme decision. The chalkboard's painted clock hands came
out of the scene data, and the ambient clock draws them live at the
actual time of day.

**The first effect audited the painting.** Drips need stalactite tips,
so `drawScene` now returns marks — positions only the seeded geometry
knows, reported so an effect hangs on the picture the player sees rather
than on a guess at it. Wiring that up found the fault: at the shipped
seed the cave had **zero** stalactites. Replaying the ceiling's
mulberry32 stream showed every hang roll landing as a vine — five vines,
no point ever clearing both the 30% spike roll and the depth bar — while
the op's own comment promised "stalactites at the deep points and
hanging vines elsewhere". Untrue since the D-014 port, unnoticed because
vines filled the ceiling either way. The comment is now enforced rather
than hoped for: every interior local-deepest point past the spike bar
grows a stalactite before the dice speak — endpoints excluded, they sit
over the side walls — and the dice may still add more. The shipped seed
now hangs five spikes and two vines, in new places: the same grain trade
D-014's header already accepted. The family is the hard-won rule about
figures in notes — a comment describing a seeded outcome is a claim
nobody re-measured until a feature needed it true.

**Refused in the same batch: a progress meter on the signposts.**
`meter` lands only at completion (`queue.ts` — complete, fail and cancel
are its three writers), so a mid-run bar would be invented data. The
running signpost instead blinks a lamp on each real tool call, wired
from the same event feed the terminal prints, with the replayed backlog
on connect absorbed silently so the lamp never claims work that already
happened. The crew emotes obey the same sourcing rule: only flips they
watched, attributed through `assignedTo`, classified with the shared
`outcomeOf` rather than a local re-listing (D-030), and zZz only when
the board holds nothing queued or running.

**Environment note.** The Browser pane freezes rAF while hidden, so a
session cannot verify live pixels — but a second Vite on :5273
(`agentlings-web-second` in launch.json) shares the running engine
through the same proxy, which lets a session verify mounting, console
and computed styles without touching another session's dev server. The
eyeball on the running app stays the user's step, at :5173.

**Evidence.** The state machines are tested against a recorded surface
rather than a canvas: the drip lifecycle down to the splash pixel, a
glint's spawn-and-die, the clock's hands at an injected three o'clock,
emote flips including the no-pop-for-history guard; scene marks
deterministic across draws, inside the walls, clear of hatch and exit.
One assertion caught its own feature short — the parcel pile's hit box
grew to 44px because the count tag's containment test demanded it. 93
web and 1011 server tests green on the merged head, typecheck clean,
zero console errors on a scripted mount of the merged app.

## D-084 — 2026-08-05 — The ask floats over the agentling, and falls back to the bar

The mock's screen 1, completed: the channel ask now renders as a speech
bubble over the agentling who would take the job — the light sheet with the
tail, exactly the approved design — while the work bar keeps carrying it
whenever the world cannot. Presentation only, deliberately: D-079's card
stays the mechanism, one component (`ChannelAskCard`) renders inside both
frames, and nothing behavioural waits on the diorama. The 'ready' state
keeps its quiet chip in the bar; a bubble that only ever asks is a bubble
worth looking up at.

**The seam is one function, not a layout contract.** `WorldCanvas`
publishes a live query through a ref — sprite id in, head-top in page
coordinates out — computed from the *smoothed* position the canvas actually
draws (the same `motion` map the emotes read) through the canvas's own
rect, so the edge-to-edge sizing, a resize, or the next layout pass cannot
drift the mapping. The mapping itself is `anchorPoint` in
`world/anchor.ts`, pure and tested. The bubble tracks it each frame with
rAF, clamps its box to the viewport, and offsets the tail by the clamp so
it keeps pointing at the head while the box stays on screen. The world
learns nothing about who is asking.

**The fallback is the contract.** The bubble reports whether it anchored;
anything else — no crew yet, the stage still booting, the sprite gone —
puts the identical card back under the intake, where the ask has lived
since D-079. An ask can be missed pretty; it must not be missable.

**Evidence.** Five new tests on the pure mapping and the clamp — the
offset-and-scale case, the identity case, both edges, and the
too-narrow-viewport pin — with 98 web tests and the full typecheck green.
The production build carries `.ask-bubble` in both bundles, which is this
repo's ship-check where a browser cannot be driven from the session; the
float respects `prefers-reduced-motion`, and the visual pass is the open
app's to confirm — it hot-reloads, so the bubble is already live there.

## D-085 — 2026-08-05 — Bare "mail" claims as a channel word, and stays out of the verb list

A live miss from the desk: "I need to send a mail to a friend" raised
nothing while "…send an email…" raised the ask. Both pass the verb gate on
"send"; the gmail row matched gmail|email|e-mail and never bare "mail", so
`detectChannelAsk` returned null and the client had nothing to draw. Working
as coded — the word was absent, not mishandled: no test pinned it out and no
entry had weighed it. This is the class of gap D-079 already recorded once,
when "email the summary" missed and "email" joined the verb list.

Two fixes were run against the real regexes before choosing. Adding "mail"
as a channel word only fires the reported phrasing and nothing new; adding
it to the verbs too (email's own double duty) would also catch "mail the
summary to Ana", but one word then satisfies both gates and a mere mention
fires — "summarise the mail export" raises a card, exactly the counter-case
channel.test.ts pins null for WhatsApp. That is the wrong side of D-079's
pricing ("a wrong card costs trust"), so: channel word only. The row is now
`\b(g|e-?)?mail\b` — which also picks up "e mail" spelled apart, and matches
nothing inside hotmail, protonmail or "mailing list" — with the
noun-not-verb constraint stated in a comment where the next edit will read
it.

Left standing, on purpose: verb-form "mail me the report" still misses,
until real intake shows the phrasing; "email" as a mere mention ("fix the
email parser bug") fires today, D-079's decided trade observed here and not
reopened; and the gate is English-only, so "manda un mail" never fires — a
product boundary, not a word-list line.

**Evidence.** Two pinning cases ("send a mail to a friend" → gmail,
connectable; "summarise the mail export" → null), mutation-checked: against
the old regex the new test fails with `expected undefined to be 'gmail'`.
Full suite 1012 + 98 and typecheck green. Verified live against the running
dev server's own plan route — the failing prompt now returns the ask, the
email prompt still does, and the counter-case returns none.

## D-086 — 2026-08-05 — The bubble wears the mock's sheet, and the bar keeps the desk card

A review Brian asked for found that D-084 had delivered the mock's bubble
*frame* — sheet, tail, float, the anchor mechanics — around the work bar's
own contents. The approved mock's bubble is a title ("This job needs a
messaging app"), the typed sentence quoted back, option rows each carrying
a 34px app mark, one plain-words line and a connect button, and the state's
note as the foot; what rendered inside the sheet was the bar's dense text
card, lifted whole by the one-component rule. No entry decided the
difference — it drifted in through reuse, and D-084's "exactly the approved
design" was true of the shell and silently false of the contents. The
information design had not survived the move between frames: the bar card
sits under the input, where a title and a quoted prompt would be redundant;
the bubble floats over the world, where the mock gave it both precisely so
it could stand alone.

The fix keeps D-084's actual principle — one mechanism, and only the dress
differs. `ChannelAskCard` gains a `variant`: the bar keeps the dense card
verbatim, and the bubble renders the mock's sheet from the same ask object
and the same handlers. The marks are inline SVG approximations lifted from
the mock itself (telegram, whatsapp, gmail, slack drawn; anything else gets
its initial on a tile, the mock's own treatment for the planned tier) — no
brand asset ships and nothing is fetched. WhatsApp Business keeps the
mock's amber "Set up" against the blue "Connect", the typed sentence rides
a `prompt` prop the bar never passes, the note moves to the foot in the
bubble only, and the bubble widens to the mock's 470px.

**Evidence.** Typecheck and 98 web tests green; the production build
carries the title string and both new class families in the bundles.
Verified in a live second web server against the shared API: the mock's
own sentence raises a bubble whose DOM reads title, quoted prompt, three
logo rows — Telegram · Connect, WhatsApp Business · amber Set up, Gmail ·
Connect — and the refusal foot. The pane could not composite frames in
this session (a recorded environment limit), so the same check also proved
D-084's fallback: with `requestAnimationFrame` frozen the bubble stays
hidden and the bar card carries the identical ask — missed pretty,
not missable.

## D-087 — 2026-08-05 — The desk asks the send's two facts, and Start tells the truth

The account opens with a real run. "I need to send and email to a friend"
was typed at the desk with Gmail unconnected, Start queued it carrying
`channel: gmail` at the $2.00 clamp with 40 turns granted, and Pip spent
one turn, zero tool calls and 6¢ to deliver exactly this: *"I can compose
that for you — but I need a few details first, since I can't invent an
address."* The outbox contract working as written (D-075's never-invent
rule), landing as `failed` — and the terminal drew a plain failed job as a
bare ✖ line with no reply box, so a correct question had cost money to
reach a place with no way to answer it. Three gaps compounded: the ask
card informed and never arrested; the clarify rules never fire on "send"
(not in their producing-verb list); and the run's own fallback question
was a dead end.

**The flow now closes the loop at both ends, and the gate lives at the
desk — the terminal's pre-run conversation was considered and refused,**
because a job parked waiting on input is the `waiting` status this log has
refused three times (D-030 twice, D-079), and the desk is where nothing is
quoted or billed yet. "Start never waits" already had one deliberate
exception, the project-folder ask; this is its twin, scoped the same way —
only when the job needs it.

- **The send facts are ordinary clarify questions, asked first.**
  `questionsFor` takes an optional `channel` and emits `send-to` and
  `send-say` ahead of everything else (the outbox contract refuses to
  invent either), still never required server-side, still capped at three.
  The ask wording never varies by channel — only the hint does — so the
  queue-time recompute (the rule that stops a caller inventing
  instructions) matches whatever card the user answered on, even when a
  fork changed the channel between plan and queue. A draft still asks: the
  asked name stands in for the channel at both call sites.
- **The card is where they are answered.** Both dresses of
  `ChannelAskCard` render the facts as fields — TO and SAY on the bubble's
  sheet, dense rows on the bar — including after a pick, because a chosen
  alternative still needs its recipient. An address already typed in the
  sentence prefills TO and never overwrites. When a card is up the generic
  question row hands the send questions to it rather than asking twice.
- **Start arrests a knowably doomed queue for exactly one press.** The
  first press on a run with no recipient, no channel that can send, or an
  unconnected one relabels the button with the consequence — "Queue anyway
  — no recipient · you connect at review" — and the card wears the reason's
  colour; the second press queues with eyes open. Fixing the reason turns
  Start back into Start, armed or not. D-079's queue-anyway logic survives
  for the connection half (the drawer connects mid-review, D-078); it was
  the missing-facts half that was dead on arrival.
- **A failed run's question gets the reply box** done and partial jobs
  already had, and the reply route now carries `previous.channel` — without
  it a continuation never heard the outbox contract (the brief is derived
  from `job.channel` at run time) and composed nothing sendable. The 6¢
  becomes a down payment, not waste.

**Evidence.** Eight new clarify tests (fire-first, per-channel hints,
neutral fork hint, the cap, free-tier silence, forwarding with the channel
context and dropping without it); 1020 + 98 and typecheck green. Live
against the running API: the failing sentence's plan now returns
`send-to, send-say` with the Gmail hint. The whole client flow proven for
$0 by a patched fetch returning a fake 201: fields render on the card with
the hints as placeholders and no duplicate in the loose row; the first
press queues nothing and relabels; filling the facts drops the recipient
clause live; the second press posts exactly one body carrying both
answers; an address in the sentence prefills TO. Left for the demo loop:
a real reply on a failed send job (it spawns a paid session, so it was
typecheck-and-read verified only), and the repo-folder ask's own buttons
bypass the arrest — send jobs rarely carry repos, noted rather than wired.

## D-088 — 2026-08-05 — The garage, the drawer and the outbox wear the mock too

Brian asked for the rest of what D-086 did for the bubble: the design
preview's screens are friendlier than the surfaces they mocked, and the
system is already proven — so the flair moves in, presentation only, over
mechanisms that do not change. Three surfaces:

- **Settings is the mock's garage (screen 3).** The checkbox sentences
  become a card grid: the connection's mark, its name, an identity line
  (who it connected as, else the description), an honest pill — green
  `on`, grey `off`, amber `needs set-up` — and the same toggle restyled as
  a switch over the same input. A cell with its drawer open spans the
  grid. Below the cards, the tiers D-077 decided finally show where the
  user decides: `planned` as quiet chips and **the shelf of never, each
  row with its reason** — served by a new `GET /api/channels` off the same
  `PLANNED`/`NEVER` maps the ask-card reads, so the two can never
  disagree. The pill says `on`, not the mock's `connected`, because half
  the cards are credential-less readers and "connected" would overclaim.
- **The drawer's walkthrough gets its numbered squares (screen 2).** The
  `setup` steps D-078 already wrote render as the mock drew them; the
  paste-and-Check row and the Google Connect flow are untouched. The
  separate "✓ connected as" line is gone — identity lives on the card.
- **The outbox review is a channel-headed card (screen 4).** The mark on
  the header, "Outbox — N messages via Gmail" with the template and
  sent-state as the sub-line, and a recipient's initial on every row —
  same rows, same sent/failed truth. The foot learns the mock's button
  hierarchy: Approve-&-send is the green act, Discard the quiet one, and
  the standing-approval offer's grant goes amber. The mock's cost line
  ("3 × $0.025 ≈ 8¢") is deliberately absent: a declared WhatsApp rate is
  stamped on sends.jsonl at send time (D-081) and is not in the outbox the
  client reviews — drawing it would invent a number.

`ChannelLogo` grew a Google mark and a GitHub tile and now exports the
channel labels, so every surface names channels from one place.

**Evidence.** Two shelf tests (labels and reasons present; no wired
channel on either shelf) — 18 in channel.test.ts, 1022 server + 98 web
green, typecheck clean. Bundles carry the new classes and copy (the
steps rule survives minified as `li:before`). Live on a second web server
against the shared API: `GET /api/channels` answers Slack/SMS/Discord
planned and six refusals; the settings modal renders seven cards — every
one with mark, pill and switch, readers `on`, the three senders honestly
`needs set-up` — six shelf rows with reasons, and a drawer open with four
numbered steps. The outbox card could not be probed live because no job
in any level carries an outbox yet; it is covered by build and tests, and
the first demo-loop send is its visual pass. The pane still cannot
composite frames in this session, so pixels remain the open app's to
confirm — it hot-reloads, and the garage is already live there.

## D-089 — 2026-08-05 — The agentling's file: tagged memory, a ledger record, and a skill handed to the role

Brian asked for the profile card to be worth reading, mocked as its own
preview page and settled by four answered questions: lifetime figures (a
7-day-old project makes any window equal lifetime while costing window
code), "all lessons" expands inline, a hand-added skill changes no pricing
(the capability surface already reacts — D-036), and reach stays on the
card as drawn. Two tabs over the same modal and handlers.

**Profile.** A lesson renders as date chip · first line · tag. The tag is
real, not parsed hope: the close-out now stamps `(job: title)` on the
lessons it banks — the title is in scope where the line is composed — and
`untagged()` joins `undated()` in the dedup key, or one lesson re-taught
by a second job would pile up beside itself, the exact failure D-073
closed. Old lessons carry no stamp and show no tag; nothing is backfilled
by guesswork. The card's memory also stops showing the journal — the
delivered/failed/hired-to lines are the career counter's story, and
`isJournal` (the productivity module's own boundary) filters them
server-side, so "N lessons" finally counts what was learnt. Below the
career counter, `recordOf` reads the member's own ledger rows: runs
landed with %, average per landed run — all their spend over the runs
that landed, so a delivered run's price carries the failures around it
(D-012's absorption seen from the member's side) — repeated-jobs-cheaper
(`cheaperClasses` on their rows alone), ceiling hits, and the street
light with lifetime spend. Blank-author rows (the 17 D-056 left) are
absent from every figure.

**Abilities.** Tools stay read-only — they are the role's, which is why
the role selector stays in the foot. Skills gain the `+`: the picker
lists *installed* skills the role lacks (finding new ones stays the
library's job), and the button says "hand to every worker" because that
is what it does — capability lives in the baseline tier (D-050), so the
skill lands on the role by a line edit that keeps the file's own shape
(`roleTextWithSkill` → `registry.install`), reaching every holder of the
role on their next session. The picker says in words what it costs: a
skill rides every session's brief, and methods learned without it step
back to hints (D-036) until they land again. Reach lists the connections
with the garage's marks and pills, and states that reach is the level's,
not the member's — per-member permissions do not exist and are not drawn.

**Evidence.** Eight new tests across memory (the stamp dedup),
productivity (`recordOf`: authorship filter, failures-priced-in average,
member-only repeats and ceiling hits) and roles (`roleTextWithSkill`
extends the line and inserts one when absent); 1029 + 98 and typecheck
green, bundles carrying the new copy. Live on a second web server: Pip's
card shows his real record — 18 of 26 landed, $1.00 per landed run, 4 of
6 repeated jobs cheaper, 1 ceiling hit, 42% of quoted, $17.97 lifetime,
the same figures the crew rail computes — six real lessons in one-line
rows (all untagged, correctly: every one predates the stamp), and the
picker offers the four real skills the worker role lacks. The hand-over
button was deliberately not pressed live — it writes `roles/worker.md`
for real; its path is covered by the roles tests and the route's own
guards. The first tagged lesson arrives with the next real close-out.

## D-090 — 2026-08-05 — A verb claims in every inflection, and a reply may name the channel the job never carried

The demo loop's first real job hit the wall D-085 and D-087 were built to
prevent, one layer past their fixes. Brian connected @WZBottero_Bot (the
garage worked end to end) and queued *"I need a summary of the current
Call of Duty: Warzone meta **to be sent** to my friend Pepo Dussaillant on
Telegram"*. The verb gate knew only bare infinitives — `\bsend\b` does not
match "sent" — so the desk asked nothing, the job carried no channel, the
session was never told the outbox contract, and Pip did the honourable
thing with a bad hand: 14 turns and 65¢ of real research, a composed
`telegram-message.txt` sitting in the sandbox, and the closing line "the
send is blocked on capability, not on research". Every inflection missed
the same way: sent, sending, reminded, messaged, texted, pinged, emailed.

Two fixes, one boundary decided:

- **`SEND_VERBS` matches each verb's inflections** — send/sends/sent/
  sending and their siblings across the list. Verb-side only, and that is
  the decided boundary: an inflection is never a channel word, so
  "summarize the emailed report" and "the messaging layer needs a
  refactor" stay quiet ("emailed" fails the channel row's boundary), and
  "this should be emailed to Ana" — verb and channel evidence in one
  inflected word — is deliberately not enough, pinned by test. The bare
  double-duty forms ("email Ana") keep firing as D-079 decided.
- **A reply may supply the missing channel through the same gates.** The
  reply route's continuation carries `previous.channel ??
  detectChannelAsk(reply …)?.channel` — detection, not invention, so
  "send it to Pepo on telegram" in an answer box gives the continuation
  the outbox contract the original never had, and `carryForward` hands it
  the already-composed message (everything but paperwork crosses; its own
  doc: "answering a question would re-do and re-bill work already paid
  for").

**Evidence.** Two new pinning tests (the real sentence verbatim → telegram,
plus texted/reminded; the three quiet counter-cases), mutation-checked:
against the bare-verb regex exactly the inflection test fails. 1031 + 98
and typecheck green. Live against the running server, the exact failed
sentence's plan now returns `channelAsk: telegram/ready` with `send-to,
send-say` and the chat-id hint. The recovery is the reply path: the 65¢
run's research and composed message carry forward, and the continuation's
only work is an OUTBOX.json with Pepo's chat id — the down payment shape
D-087 promised, about to be exercised for real for the first time.

## D-091 — 2026-08-05 — The channel names its recipient's shape, and the desk objects to a name where a number belongs

The demo's third wall, one layer past D-090: with the verb fixed, the
re-run carried `channel: telegram` from birth, the To/Say facts rode as
clarifications — and To said "Pepo Dussaillant". A name, where Telegram's
contract wants the numeric chat id. The field's hint said so; nothing
enforced it. The run obeyed the never-invent rule to the letter — composed
the message, left it out of the outbox, wrote
`{"channel":"telegram","messages":[]}` for the validator to refuse — and
71¢ bought the desk's missing sentence. Every gate did its decided job;
the arrest just could not see a recipient that cannot possibly be reached.

Now it can. `recipientProblem(channel, to)` in its own tested module: a
channel declares the shape its contract wants — telegram and
whatsapp-business want digits somewhere, gmail wants an @ — and a filled
To that fails its channel's shape joins the arrest, with the value quoted
on the button: *Queue anyway — "Pepo Dussaillant" isn't a chat id*.
"Brian — 8633678680" passes, because digits anywhere satisfy a chat id
and the name riding along is what review wants anyway. A channel with no
declared shape objects to nothing, and the check runs only when To is
filled — "no recipient" keeps its own clause. Client-side only, D-087's
pattern: the arrest is the desk's honesty, and the contract's own refusal
stays the backstop.

Recorded here so it is not lost, per the same review: the "text Ana when
the build is done" phrasing — a send verb with no channel word — still
fires nothing; wiring "text" to imply the planned SMS channel would only
surface the redirect card, and it waits for real intake to want it, like
D-085's verb-form "mail".

**Evidence.** Six tests on the shape module (the 71¢ value verbatim,
digits-anywhere passing, gmail's @, the undeclared-channel silence, the
truncated quote); 104 web tests and typecheck green. Live on a second web
server with Telegram genuinely connected: the ready chip up, To filled
with "Pepo Dussaillant", the first press queued nothing and the button
read the quoted objection; retyping "Brian — 8633678680" flipped it back
to Start without a second press being wasted.

## D-092 — 2026-08-05 — The audience roster: names for the opted-in, a picker behind To, and the legend the session reads

"8633678680 is nobody's idea of a friend." Brian asked for names once the
chat ids exist, and the data was already on the right boundary: everyone
who taps Start is in the bot's own getUpdates with their name, and
everyone a reviewed send went to is in sends.jsonl. So the roster is the
opt-in audience persisted — never a contact-book import, which stays on
the userbot shelf where it was refused — and the three decisions settled
by recommendation: **refresh is one endpoint doing both jobs** (the
garage's "check for new people" and the picker's quiet load hit the same
GET, which merges getUpdates — Telegram retains only ~24 hours of hellos,
so once seen means remembered — re-merges the whole send audit
idempotently, persists, answers); **the legend rides every send job**;
and **the roster lives at `.agentlings/audience/<channel>.json`**, global
like the bot itself.

The pieces, each on an existing seam: `SendRecord` gains the `name` the
reviewed outbox showed (the audit stops needing a phonebook, and
sends-only people keep the name you approved); `channelBrief` takes the
audience and appends the legend — worded so **an address the user gives
directly always wins**, because "use these ids and no others" would have
broken the paste-someone-new flow — and the executor reads the roster
through one more injected reader, the same seam knowledge and the ledger
use. The To field becomes `RecipientPicker`: focus opens the people,
picking writes "Name — id" (exactly what D-091's shape check accepts and
review wants), typing filters, and with nobody on the roster it is the
plain input it replaced. Settings lists who the bot knows under the
Telegram card with a forget button — un-knowing someone lasts until they
say hello again.

**Evidence.** Nine audience tests (merge semantics — a returning hello
refreshes the name and never loses a send count, idempotent audit
re-merge, a tapped-Start name outranking the audit, disk round-trip,
remove, getUpdates flattening with an injected http); two legend tests;
1042 + 104 and typecheck green. Live against the real bot: the endpoint
returned **two people — and one was news**: Jose "Pepo" Dussaillant had
tapped Start (6783316106), so the roster's first real read resolved the
very id the whole errand was missing. The picker opened with both, chose
Jose, wrote "Jose Dussaillant — 6783316106", and Start stayed Start; the
garage showed "knows 2 people" with forget buttons. The probe's only
failures were the hidden pane's focus semantics, not the code. The forget
button was deliberately not pressed on real people.

## D-093 — 2026-08-05 — The near-miss is a question, and the review says when approving sends nothing

Wall 4 was one letter: *"**Sen** me a Telegram with the latest Warzone
meta"*. The typo'd verb missed even D-090's inflections, so the desk read
research, told the session nothing about outboxes, and Pip spent 80¢
composing a third stranded message file. Brian approved in good faith —
the review's tells (no outbox card, plain "Approve") were true but too
quiet — and nothing arrived. His three questions shaped the fix, and one
of them settled a boundary: fuzzy-matching typos was considered and
refused, because edit-distance-1 makes "test" match "text" and *"test the
telegram integration"* must never raise a send ask.

**The near-miss is asked, not claimed, and at the desk — the only free
moment.** A run cannot pause to ask (refused four times, D-030; the reply
box is the after-ask), so `mentionsChannel` — the ask's own word table,
one notion — feeds a `channelMention` onto the plan whenever a channel
word appears with no send verb. The desk shows a question: *mentions
Telegram — not read as a send (no send verb)*, with **yes — send via
Telegram** on wired channels (a rephrase hint otherwise). Confirming is
the fork-pick mechanism that already existed: the client re-plans naming
the channel, the server emits the To/Say questions like any detection
(no copy duplicated), the picker and the D-091 arrest engage, and the
queue carries the channel — so the run finally hears the outbox
contract. A pick now survives a same-sentence re-plan (`plannedFor`) and
still dies with a new sentence, which is D-079's rule kept.

**The review grows the guard the 80¢ approval deserved.** The queue
stamps `channelMention` on any job that mentioned a channel it never
carried; the review shows it in amber: *approving keeps the files and
sends nothing — to send, reply on the job's card*. Going forward only:
old jobs carry no stamp and are not guessed at.

**Evidence.** Three `mentionsChannel` tests (the 80¢ sentence verbatim,
earliest-mention and the unwired flag, the no-mention null); 1045 + 104
and typecheck green. Live on the exact typo'd sentence: the plan returns
no ask but `channelMention: Telegram (wired)`; re-planning with the
confirmed channel returns `send-to, send-say`; and the whole client flow
ran for $0 behind a fake 201 — the question line rendered, one click
brought the picked-note and both fact rows, the picker filled "Brian
Thornton — 8633678680", and the captured queue POST carried
`channel: telegram` with the answer. The review guard ships in the
bundle and meets its first real job the next time a mention slips
through unconfirmed.

## D-094 — 2026-08-05 — A known name prefills To, and "the same again" means the audited words

Asked by Brian off the back of the first two real sends: "to Pepo" made
him pick from the roster by hand, and "send the same Telegram" made the
run rebuild the message from source — honestly disclosed, but drift where
he wanted integrity. Both halves resolved on data the app already owned.

**"Pepo" lives in the audit, so the roster learns it as an alias.** The
Telegram name is Jose Dussaillant; the reviewed send recorded "Jose
Dussaillant (Pepo)". `mergeSends` now keeps any reviewed name that
differs from the roster's as an alias (set semantics — the whole-audit
re-merge stays idempotent; a name equal to the id never qualifies), and
`matchRecipient` prefills To when the prompt names exactly one person —
tokens of three letters and up from names, usernames and aliases, matched
as whole words, so "Brianna" never matches Brian, ambiguity prefills
nothing, and "send **me**" stays empty on purpose: the app does not know
which row is the user and will not pretend to. The picker's filter learnt
the aliases too.

**"The same again" is the audited body, not a rebuild.** The lesson the
Pepo run banked said it itself: the original lived in another sandbox, so
it rebuilt and disclosed. Now `SendRecord` carries the body on sends that
happened — the audit of what left the machine finally records *what
left* — and when a send prompt asks for sameness (`RESEND_WORDS`, a
deterministic list; a stray "previous" costs one ignorable brief block),
the executor hands the channel's newest audited body to `channelBrief`,
which tells the run: reuse this text verbatim, adjust only what the user
asked, and say it was reused. Say stays a gist field — integrity lives in
the brief, not stuffed into a one-line input.

**Evidence.** Five `matchRecipient` tests (the Pepo sentence verbatim
through the alias, whole-word and case-blind, ambiguity → nobody, "me" →
nobody, Brianna ≠ Brian), two alias-merge tests (collected once however
often re-merged; name-equals-id never qualifies), a reuse-block brief
test and four RESEND_WORDS cases with two quiet counter-cases; 1050 + 109
and typecheck green. Live: the roster's next read grew
`aliases: ["Jose Dussaillant (Pepo)"]` from the real audit line, and
typing the exact sentence "Now send the same Telegram to Pepo" prefilled
To with "Jose Dussaillant — 6783316106" — zero clicks. The reuse block's
first real exercise waits for the next same-again send, since proving it
live means paying for a session; its construction is pinned by the brief
test and the trigger fires on that very sentence.

## D-095 — 2026-08-05 — The leash is bounded by its own budget, and a run it cut may say so

Found by running T6, not by reading code. Wave 4's job — "summarise the
attached expenses.csv into SUMMARY.md" — was on the board for two more
runs and then the first legitimately-earned compiled tool. Run 2 landed
(47.0c, five calls, every figure matching an independent recompute). Run 3
was leashed, cut at the wall, delivered a correct SUMMARY.md anyway
(D-063), charged $0 and absorbed 20.4c. Then the ladder stopped, for two
reasons that were both invisible until the counters were read.

**"Three runs" was four, and the promote was never close.** `successes`
counts *reuse*: the founding run banks the recipe and does not count
itself. Three runs left `hits: 2, successes: 1`, against
`TOOL_CANDIDATE_RUNS = 3`. That part is working as designed and the board
was simply wrong — recorded here because the arithmetic is not obvious
from the field names, and F4's plan was written from the prose.

**The leash then made the fourth run impossible.** `canShortenLeash`
asked `completions >= 1` and `completedInTurns <= LEASH_CREDIBLE_UP_TO`,
which was 10 — twice the leash, and its own doc comment said plainly that
the number was a guess awaiting leashed outcomes. So a single completion
recorded at **six** turns armed a **five**-turn leash. The recipe's own
record already said it did not fit. It was cut; a cut run credits neither
`successes` nor `completions` (D-065, deliberately and rightly); so the
recipe stays armed at six-needs-five for ever, and every future run
repeats leash → cut → deliver → absorb. Free for the user, unbounded for
the app — F7 as filed — but also, and this is the part F7 missed, the
recipe can never again credit a success, so **the leash had quietly made
the tool tier unreachable for exactly the jobs it grabbed**.

Four measured leashed outcomes now exist, and they separate at the leash
itself rather than at twice it: T4·3 completed leashed off a record of 4
— the only leashed completion this engine has had — while T2·4 (6), T3·4
(8) and T6·3 (6) were each granted five against a record saying more, and
each was cut. So `LEASH_CREDIBLE_UP_TO` becomes `RECIPE_TURNS`: a run may
be shortened to five turns only once it has completed inside five. The
join test that keeps the two in step (the constant cannot import the
executor without closing a cycle) now asserts equality rather than
double.

**And a leashed run cut at the wall may raise `completedInTurns`.** D-068
refused every revision from a cut run, and was right about the two it
named: a killed run has not completed, and its output does not say the
job fits. It left no way to un-learn. The third fact is one only a cut
*leashed* run witnesses — the job needs more turns than it was given — so
`creditRecipe` takes `leashCutFrom` and raises the bound to
`granted + 1`, credits nothing else, and yields to any later run that
genuinely completes in less (the existing `Math.min` outranks a bound
inferred from a failure). Both halves are needed: the tighter gate stops
the wrong grant, and the un-learn catches the ratchet, which is measured
— T1 and T3 both grew *more* expensive run over run as their banked
standard matured, so a recipe that fits five turns today can need six
next month.

This is the fourth time here that a gate verifying one thing was read as
licensing another (D-064, D-065, D-068), and the warning was written in
`recipes.ts` directly above the code that did it. The rule that keeps
catching it: ask what the counter's own doc comment says it measured.

**Evidence.** `npm test` 1057 + 109 green, typecheck clean. The
eligibility bound is re-pinned at 4/5 pass and 6 refuse — including
T6·3's exact record — and six tests cover the un-learn across both files.

The tests needed three rounds, and the two that failed are the useful
part. Two first passed *for the wrong reason*: seeded through
`rememberRecipe` with no capability surface, they died on
`sameCapabilities` and never reached the bound they claimed to test.
Then three more proved tautological — they seeded the recipe at six
turns, where T6 actually stood, and the raise is a `Math.max` to `5 + 1`,
so every assertion held whatever the code did. Deleting the raise killed
one test of four. Reseeding at four — the only state a leashed cut can
now arise from, since a recipe at six can no longer be leashed at all —
made them discriminate. Both faults are the house one: a check that
passes on something already true.

Mutation-proved after committing, on the restored file each time.
Bound back to `* 2`: 5 fail (both eligibility cases, two un-learn cases,
the join test). Raise deleted: 2 fail. Dropping `hint?.oneShot` at the
call site — so *any* cut run would revise the bound, well past what this
entry allows — killed **nothing**, because no test reached that seam; two
`RoutedExecutor` tests now do, one leashed and one not, and the second
fails under that mutation.

Live, and the point of the exercise. T6·4 (job 074d7d73, a fourth real
CSV): `oneShot` absent, `turnsAllowed: 40` — **the leash refused itself
on the new bound**, where run 3 had taken it — done in 10 turns and 9
calls, 107s, 69.2c against a 93.9c keyed quote. All seven figures match
an independent recompute exactly. The recipe went `successes: 1 → 2`,
`completions: 1 → 2`, `completedInTurns` unchanged at 6: the first
movement on that counter since the recipe was learned, and the ladder is
walking again.

## D-096 — 2026-08-05 — The first tool earned end to end, and what the ledger says about the run that built it

The question F4 was opened to answer — is the compiled-tool tier worth
having, on evidence rather than hope — now has a live answer. The ladder
was walked with nothing seeded at any step: five hand-done runs of one
real recurring job, a compile requested only once `successes` reached
three, both generated scripts read before installing, and a sixth run
that the tool served.

**The job.** "Summarise the attached expenses.csv into SUMMARY.md: a
markdown table with the total per category and a grand total", queued
verbatim six times with `web` the only named connection, so the banked
surface stayed `conn:web` alone and D-044's gate passed on the first ask.
Every run carried a *different* real slice of this project's own ledger —
cost by level, by job class, by level×class; charged price by level and
by tier×class; then spend by day — which is D-045's cache test built into
the training data rather than asserted afterwards.

**The compile.** $1.06 against a predicted $0.95–1.35, cut at the turn cap
(11 of 10, D-025) holding two finished scripts. That is the ordinary
ending for a compile and not a shortfall — the rule that says so was
already written down. `run.mjs` is node built-ins only, with a real
RFC4180 parser, BigInt arithmetic in the smallest unit the file uses, and
a grouping column chosen by a written-down priority rule that it
discloses in the output. `verify.mjs` trusts none of it: its own parser,
its own column picks, its own sum, plus a naive float cross-check as a
net for a dropped or double-counted row, and it compares every published
figure against what it computed.

**Proved before installing, which is the whole point of previewing
generated code (D-011, D-021).** Offline, free: the pair ran correctly on
three CSVs it had never seen, including run 1's — where it reproduced
43.68, the figure a session had worked out by hand five runs earlier,
minutes after producing 22.47 from a different file. It cannot be
replaying an answer. And `verify.mjs` was mutated against five wrong
outputs — a category off by one cent, the grand total off by one cent, a
category row deleted, the row count misstated, no SUMMARY.md at all — and
exited non-zero on every one, zero on the correct output. A verifier that
never fails proves nothing, so this was checked rather than assumed. (The
first attempt at that check read `$?` after a pipe and reported the exit
code of `head`; every case looked like a pass.)

**Then the payoff, live.** A seventh CSV, 116 rows grouped by day: job
1882e54b came back `tier: tool`, `tooled: true`, **0 turns, $0**, every
figure matching an independent recompute — and it disclosed the rounding
residual (the displayed parts sum to 50.32 against a grand total of
50.31, because each is rounded independently from the exact integer sum)
rather than burying it in a category. `runs: 1, failures: 0`.

**The finding nobody was looking for.** That compile is recorded in the
ledger as `outcome: failed`, `priceUsd: 0` — cut at the wall, so the user
was charged nothing and the app absorbed the $1.06 (D-012). Correct by
every existing rule, and worth writing down anyway: **a working tool cost
the user nothing, and the run that built it is filed as a failure.** Any
future "how often do compiles succeed" read off the ledger will say 0%
while the tool it produced is in service. The house rule applies to our
own records — ask what the population was before trusting the rate.

**What it is worth.** The five hand-done runs cost $2.20 in total and
rose over time rather than falling (24.8c → 47.0c → 69.2c → 58.4c, the
ratchet: each run meets the standard the last one banked). Every run of
this sentence from here costs nothing at all. The tier pays back on the
third or fourth reuse at these prices, which is roughly what D-021
guessed when it had no data.

## D-097 — 2026-08-05 — The desk asks for the words, and a send it already holds costs nothing

Brian's observation, reviewing the "I need to send a Telegram to Pepo" run
(job 470d7389, 32.4¢, 2m06s): the prompt is an *instruction*, and `Say`
was framed as a *direction* — "what should it say, roughly? / a line is
enough, they write it out properly". So a send that carries no content had
nowhere to put the message, and the message got typed into a box that
promised to reword it. It did: "A DARLE" went out as "A DARLE 💪".

**The emoji was the specification being obeyed, not a model taking
liberties.** Three layers agreed: the hint promised a rewrite, the brief
carried a verbatim clause only for resends (D-094) and said nothing about
fidelity for a fresh one, and the recipe the run matched had banked "add
minimal embellishment only for tone". Nothing was misbehaving.

**Two shapes, and only one of them wants a gist.** "Send Pepo the current
Warzone meta summary" has a message to *write*, so a rough direction is
the right ask and steering it is the job. "Send a Telegram to Pepo" has no
message anywhere but in the user's head. The distinction had to be narrow
or it would break the case it was never about — Brian scoped it exactly
that way, and the scoping is the rule.

**Telling them apart by what is *left*.** A subject test cannot do it:
"on Telegram" and "with a summary" are the same preposition, so the
channel supplies the very evidence being looked for, while "Send Pepo the
current Warzone meta summary" carries real content with no preposition at
all. Instead strip the send words, the channel words and the roster's own
names, then ask `terms()` — the recipe matcher's stemmer — what survives.
Empty residue means the message exists nowhere. Eight for eight on the
real sentences in training-ground, and it introduces no new machinery. A
recipient is not a subject, which is why the names are needed; an unknown
one leaves a residue and reads as content-bearing, which is the old
wording and the safe way to be wrong.

The question then changes shape: **"What should the message say?"**,
labelled **Words** (the pill is what made it read as a setting), promising
"sent as written", with `write it out` as a fixed opening that hands it
back to a session — a literal prefix rather than a fuzzy read of intent,
which is D-093's judgement applied on the way out. The label rides on the
question because the wording and the label are one promise and must not be
able to disagree.

**And then it costs nothing.** With both facts in hand and the words
promised verbatim, there is nothing left to decide: composing is copying
two strings into the file a session would have written. A `compose` tier
does it in code, held to the outbox contract itself — `checkOutbox` split
out of `readOutbox` so an outbox built by us and one written by a model
are the same object — and a contract refusal falls through to a session
rather than failing the job. **Sending is untouched: approval is still the
send (D-075).** This changes who composed it, not when it goes. The quote
sees the same thing through the one `sendFacts` both ways in call, so the
card reads "Free — nothing to work out" while the user is still deciding.
32.4¢ and two minutes becomes $0 and instant.

**Three faults, none of which the tests found.** They are the entry.

*The field two builders dropped.* `send` was added to the type, the route,
the router and the executor, and jobs still reached the queue without it:
`queuedJobSpec` and `queue.add` each construct a job field by field, and
neither named it. Spreading `...(send ? { send } : {})` into the call slips
past excess-property checking, so nothing complained. Two live sessions ran
at 16.7¢ and 13.4¢ composing a message the desk was already holding.
PROJECT.md's own hard-won rule — "complete in the type, the spec and the
route and still reach nothing" — twice in one sitting, and the mutation
that re-introduces it killed **nothing** until tests were added at both
builders.

*The guard that hid the fix.* `questionsFor` withheld every question on a
free tier — right when free meant "the router already knows the answer",
wrong for a tier whose freeness *depends* on the answers. The moment both
facts were in hand the quote flipped to free and the fields vanished under
the user mid-type. Only a live run shows that; every unit test passed. The
send's two facts are the job's content, not a narrowing of a paid run, so
they are now asked at any price. An existing test asserted the old rule and
now asserts the new one with the reason.

*The separator.* `splitRecipient` knew only the picker's em-dash, and the
field is free text. It now reads an en-dash and a spaced hyphen, splits at
the *last* one (names carry hyphens; addresses rarely do), and treats a
trailing separator as part of the name rather than an empty address.

**And the channel a send job is about is not a tool.** Taken the same
day, from the same review. `grantedTools` handed every enabled connection
to every job, so a send carried `telegram` — which is `builtin` with no
branch in the executor and no MCP server, and therefore grants a session
*nothing*. The catalog had been saying so in prose all along: telegram's
own description reads "Grants the crew no tools at all — sends happen at
review, never inside a run." The cost was never tokens. It was that
`conn:telegram` landed in the recipe's capability surface, where D-044
reads any deliberately-enabled connection as a method that reached
outside and refuses the compile — so **the most repetitive job shape in
the product was locked out of the free tool tier by the channel it was
about**, permanently and invisibly.

Connections now declare `sendsOnly` (telegram, google, whatsapp-business),
and `grantedTools` drops them. Declared rather than inferred from the
name, because a connection and its channel need not share one: `google`
is the connection, `gmail` is the channel. Excluded in `grantedTools`
rather than at the surface, so the quote, the router and the run keep
getting their one answer from the one function. The connection stays
*enabled* — that switch is what the server consults before replaying an
approved outbox, and this only says a run cannot reach it.

That removed a guard nobody had noticed was load-bearing. A send could
never bank a replayable answer, because the channel kept `job.tools`
non-empty and the "nothing outside fed into it" test failed on it. With
channels gone from tools, a send narrowed to its channel alone would have
banked "one Telegram is composed and waiting" and served it free on the
next identical sentence with no outbox behind it — job 57bbff81's PDF,
one channel over. The job's own `channel` now says it explicitly.

**Last, the brief says whose words these are.** A send that falls through
to a session — the outbox contract refusing what the desk held, in
practice a body over the channel's limit — hands a run the user's own
message with nothing saying so, which is precisely the condition that
turned "A DARLE" into "A DARLE 💪". `channelBrief` now carries an
own-words block: the message verbatim, *"it is not a brief for a message;
it is the message"*, and what to do when it will not fit, because an
instruction to send it exactly as written and nothing else would be one
the run cannot follow in the very case that produced it.

Deliberately narrow, and the obvious wider readings are wrong. A
continuation holds no send facts — the reply route takes only text, and
carrying the old ones forward would let a brief insist on words the reply
may have just superseded, which is guessing at intent that D-091 and
D-094 both refused. A content-bearing send has no own-words to protect:
there the user gave a direction and writing the message *is* the job.

`draftingAsk` was written and tested in the same sitting and called by
nothing — speculative code by the project's own rule, now wired. "Write
it out" is addressed to the desk; once it has sent the job to a session
instead of composing it, the phrase is noise in the brief and worse than
noise, since it reads as part of what to write. Stripped as a leading
phrase only, so "tell him to write it out before Friday" survives whole.

And a third instance of the same fault as the two builders: deleting the
line that handed a job's own words to `channelBrief` broke **no test**,
while `channelBrief` itself was covered from three directions. A correct
function reached by nobody. The which-blocks-ride decisions now live in
`briefForJob` and are tested there, which incidentally pins D-094's reuse
wiring — equally unpinned until now.

**Evidence.** 1101 + 109 green, typecheck clean. Mutations: `bareSend`
forced false kills 5, forced true kills 4, dropping the `write it out`
escape kills 1, bypassing the outbox contract kills 4, dropping `send` in
either builder kills 1 each, and restoring the free-tier guard kills 1.
Live, through the running server: the bare sentence asks **Words** and
quotes a session; both facts in hand flip it to "Free — nothing to work
out" *with the fields still there*; asking for a draft returns it to a
session; the content-bearing sentence is untouched at "roughly"/**Say**.
Queued for real, it came back `costUsd 0, turns 0, routed`, wrote
`to: 8633678680` with the name kept and the body **"A DARLE"** unchanged,
and RESULT.md that reads as a review. Debugging cost 30.2¢ across two
sessions; the four test jobs were discarded and `sends.jsonl` is untouched
at three rows — nothing was sent to prove any of this.

For the channel half: dropping the `sendsOnly` filter kills 2, dropping
the `!job.channel` guard kills 1. Live, a queued send now carries
`tools: ["web","github","search","browser"]` with `channel: "telegram"`
riding on its own field — the channel gone, everything else untouched.
Against the real gate's ambient set (`web` alone), the same job reads
`REFUSED — used telegram` before and **`COMPILABLE`** after when narrowed
to `web`, while an un-narrowed one still refuses on github, search and
browser, which it genuinely reached. The tier is now open to send work
that stays inside; it is not open to send work that researched first, and
that distinction is D-044 doing its job rather than being worked around.

For the brief: dropping the own-words block kills 3, un-wiring it from
`briefForJob` kills 2, and dropping the escape-phrase strip kills 1. For
the redo: dropping the channel kills 2, and the clarifications, the brief
and the attachments kill 1 each — as does the inverse, letting `send` ride
after all, which is the decision worth pinning in both directions.

**And the redo route, which the tracing turned up.** "Do it properly"
should differ from the job it redoes in exactly one way — the router is
not asked. Four things silently differed, and each left the redone job
unable to do the work it was redoing: no `channel`, so a redone send had
no outbox contract in its brief and could not know it was sending at all;
no `clarifications`, so it had lost the recipient and the message the user
typed; no `brief`; and no attached files, because `Job.attachments` is
names and sizes while the bytes live in the sandbox a redo does not
inherit — "summarise the attached expenses.csv" came back to an empty
`input/` and could only fail, having been paid for. Reachable throughout:
the button shows on any routed job, which now includes every free composed
send.

`send` is the one thing that deliberately does not ride, and the reasoning
is the same as everywhere else here — it is the input the shortcut
consumed, so carrying it would brief the run to keep the words verbatim,
which is exactly what the free compose already produced. The redo would
then be a paid way to write the identical file. Asking for it properly is
asking for a person's judgement on the wording; the words themselves still
ride, as the clarification the user answered.

Extracted to `redoJobSpec` beside `queuedJobSpec`, for that function's own
stated reason — route wiring is not tested — and `attachedFiles` reads the
bytes back by the job's own record rather than by listing the directory,
so a file the *run* wrote into `input/` cannot ride into the next job as
an attachment the user never sent.

## D-098 — 2026-08-06 — A run's counters land on what is on disk, not on the picture it started from

The last row of the 2026-08-04 review (F5), and the one that had been
sitting longest because it was filed as latent. `RoutedExecutor` read
`recipes.json` at the start of a run and wrote it back at the end, so any
job that finished inside that window had its increments erased by whoever
started first — a whole session's width of opportunity to lose someone
else's work, and the wider the session the wider the window.

**It was latent when it was written down and is not any more.** The
counters were bookkeeping in July. Since then they decide whether a run is
leashed (`completions`, `completedInTurns` — D-095) and whether a recipe
can ever be compiled (`successes`, D-021's three). A lost `successes` is a
tool that never gets built; a lost `completedInTurns` is a leash arming on
the wrong number. The workaround — queue everything sequentially — held
for 21 training runs by discipline, and stopped being purely discipline
the day two chat sessions began sharing this tree and one queued a real
send while the other was working.

`updateRecipes(levelDir, mutate)` reads, applies and writes in one
synchronous block. That closes the window completely rather than narrowing
it: the runtime is single threaded, so nothing can interleave between the
read and the write, and there is no remaining race to reason about within
a process. Across two *processes* there would still be one — which is a
second reason two servers must never share a tree, now enforced by
`autoPort: false` and the attach config rather than by hoping.

The executor keeps its decisions where they were and moves only the
recording. It collects what it has to write as a list of changes and
applies them at the end, so `delivered`, `fitted` and the rest are still
judged from the snapshot the run could see — which is the honest basis for
them, since that is what the run had — while what it *records* lands on
top of everything that happened since.

**Evidence.** 1118 + 109 green, typecheck clean. Four tests drive two
overlapping runs through the real executor with a gated session, in both
finish orders. Reverting to the stale-snapshot write fails three of them,
including both orders — the increment is lost either way, because both
runs read the same picture at the start; and making `updateRecipes` skip
its re-read fails 17 across the suite. The fourth test, that the last run
to finish owns the method it wrote, passes under the mutation too and is
documentation rather than a discriminator: an approach is not a counter,
and both writes set it to the same string.

**And the way this entry nearly did not get written.** The fix was
complete, tested and green — and uncommitted — when a mutation script
aborted and the `git checkout server/src` chained after it with `;` ran
anyway and destroyed the lot. That is D-021's own hard-won rule, the one
written into `PROJECT.md` as "mutation-test after committing", walked into
by chaining the restore to a command that could fail. Redone from context,
committed *first*, and every restore since issued as its own command.

## D-099 — 2026-08-06 — A run that only resembles a recipe credits usage, and nothing else

A recipe is matched two ways: the same sentence, or a similar one. Both
credited everything, and the second should never have. Similarity exists to
lend a *method* to a related job — that is the whole point of scoring shapes
rather than strings — and lending a method is not evidence about the job the
key names.

**What it did.** "I need to send a Telegram to Pepo" scored close enough to
the recipe for "Send Pepo the current Warzone meta summary on Telegram" —
they share *send*, *pepo*, *telegram* — ran three turns because it had two
words to put in an outbox, and credited that recipe with a **3-turn
completion**. The siblings that actually did the research measured 14 and 15.
`canShortenLeash` then read the 3 and armed a five-turn leash, so the next
real run of that sentence was going to be cut at the wall. D-095's un-learn
would have retired the leash afterwards, which bounds the damage at one wasted
run rather than a loop — but a run wasted for no reason at all.

**The rule.** `successes`, `completions` and `completedInTurns` now require an
exact match, and a cut leash may only raise the bound of the job it actually
cut. `hits` still credits: the method genuinely was used, that is what `hits`
means, and nothing reads it anyway. This is precisely the rule a continuation
already lives under (D-074) — *usage only* — for precisely the same reason: it
did not do this job. Each counter answers its own question and so needs its
own evidence, which is D-065's principle applied to a third case.

**The cost, stated rather than buried.** A repeat phrased differently no
longer accumulates toward the leash or a compile; it banks its own recipe
under its own key instead. `TRAINING.md` has said "run every sentence
verbatim on repeats" since the programme began, and the engine now agrees with
its own instructions rather than quietly rewarding near-misses. If that ever
bites, the fix is a *deliberate* one — merging near-identical keys — not the
accidental crediting it replaces.

**The sweep, which found four rather than one.** Rather than repair the recipe
that was noticed, every credit ever made was classified: the ledger records
which `recipeKey` each run credited, and `jobs.json` records what that job
actually asked, so exact and resembling can be told apart for all 52 credited
rows. Five resembling credits across four recipes — the Warzone research
recipe credited twice by neighbouring send jobs, the typo'd "Sen me a
Telegram" recipe credited by its corrected twin, the Nike price recipe by a
differently-worded ask, and the one that started this.

Three were repaired and one needed nothing. `scripts/drop-nonexact-credits.ts`
touches a recipe only when **every** credit it ever received was resembling —
then the counters are known in their entirety to be other people's work and
can be removed rather than adjusted. A recipe with any exact credit mixed in
is left alone and says so on the way past: `completedInTurns` is a `min()`,
and undoing one contribution to a minimum cannot be done by identification.
This project does not backfill by guess (D-026, D-030, D-033, D-036). The
fourth recipe was already correct because its resembling run had failed and
delivered nothing, so it had never earned the counters in the first place.

**Evidence.** 1123 + 109 green, typecheck clean. Six tests: a resembling run
matches and credits `hits` alone, the same run against its own sentence
credits all three counters, a resembling run cut on the leash does not raise
the bound, and the resembling job still banks its own recipe. Mutations:
dropping the exactness requirement fails 1, and ungating `leashCutFrom` failed
**nothing** until the fifth test was written for it — the wiring untested
again, for the fifth time in two days.

Live, on the repaired record: the Warzone recipe reads `hits: 1` and nothing
else, `findRecipe` still matches it exactly and still lends its approach, and
`canShortenLeash` is now false. Planning the real sentence through the running
server quotes **`tier: session`** where it would have been `oneshot` — the trap
disarmed, and the method kept.

## D-100 — 2026-08-06 — The compile gate asks what a method used, not what it could reach

The doors-and-libraries question, which the roadmap had carried since D-021
and T4·4 was supposed to settle: should a compiled tool be granted the doors
(`fetch`, `github`, `search`) and the document libraries, rather than refused
for needing them?

**Measuring it answered a different question.** Granting the doors would have
unlocked **nothing**. Seven recipes are eligible to compile by count; four
already do; all three that D-044 refuses also carry **`browser`** — an stdio
MCP server, which a plain-node script can never run whatever doors it is
given. The doors were never the binding constraint.

What binds is the limit D-044 named about itself and could not then fix:
*"closing it needs the run to record which tools it actually called — which
the ledger does not carry and no measurement yet demands."* A measurement now
demands it. Those three recipes are refused for a browser none of them
plausibly opened; it is simply switched on at that level, so it lands on every
surface learned since.

**Two facts worth having measured rather than assumed**, both established with
a script in the tools directory: a compiled tool can already `import('exceljs')`
— node resolves it from the repo root — and can already reach
`http://127.0.0.1:4600/internal/fetch`, which is localhost-bound with no auth
and answered HTTP 200. "No dependencies, no shell commands, no network" is a
**brief the compile is asked to follow, not a sandbox**. The manifest's own
comment said as much — "the contract is a brief, not a jail" — and Brian's
call is to say so plainly rather than build the jail: the tier has honoured
the brief without being forced to, and enforcing it would cost real work to
buy a guarantee nothing has yet needed.

**So the gate learns to ask about use.** The executor already saw every tool
name and kept only the last; it keeps the set, as `toolsUsed` on the meter. A
recipe accumulates them as `usedTools` — the **union** across runs, never the
latest, because a method that ever needed the code host needs it however many
later runs happened not to reach for it, and under-claiming here approves a
script that cannot exist. `connectionsUsed` joins those names to the catalog's
own per-connection tool lists, matching both bare and `mcp__name__` forms.
Taken from a failed run's meter too: a run that died having called the code
host has still proved the method reaches outside.

`compileBlockers` asks use first and availability second. **The fallback is
the careful half.** A recipe whose runs all predate the recording has said
nothing about what it reached, and absent evidence is not evidence of absence
— reading silence as innocence would approve exactly the compile D-044 exists
to refuse. So old recipes get the old answer, and the sharper one is earned by
running again.

It also closes D-044's *other* stated limit. Ambient is subtracted from a
surface because `web` is on everywhere and carries no information; but a run
that genuinely **called** `fetch_page` has said something, and use reports it.
The job that "genuinely fetched a page with nothing but `web`" and would have
produced a failing compile is now refused.

**Evidence.** 1140 + 109 green, typecheck clean. Seventeen tests across
`connectionsUsed`, `compileBlockers` and the recipe union. Mutations: making
the union a replacement fails 1, and ignoring use in the gate failed
**nothing** until `compileBlockers` was extracted from the route to be
testable — the sixth untested-wiring fault in two days, and the third fixed by
moving a decision out of a route.

Live, and worth the 31.2c it cost. T4·5 recorded
`["ToolSearch","Write","mcp__github__list_commits"]` on its meter and the same
on its recipe, so the field travels the whole path — runner to meter to recipe
— which is the hop that silently swallowed a field twice this week. The
compile request then went from *"that method used **browser and github and
search**"* to *"that method used **github**"*. Still refused, which is right:
that job does reach the code host. Refused for the one reason that is true.

## D-101 — 2026-08-06 — Standing approval fired, and the desk arrests a send with no words

M5.11's last built-but-unproven piece, TRAINING.md's open item 3: nothing had
ever earned the three unchanged reviews, so the one path that sends without a
human in the moment (D-082) had never once run. Proving it took five queues
of one sentence — and the first found a wall.

**The wall cost 26.8¢ and taught the desk nothing it didn't already know.**
"Send a Telegram to Brian" is a bare send — the server said so itself: its
plan carried the **Words** question with D-097's sent-as-written promise, and
the live `bareSend` probed against the real roster returns true. But on a
*ready* channel the send card never renders (`WorkBar` mounts it only while
the channel ask still needs deciding), so both facts fell to the loose
clarification rows under "Optional — Start works either way", To prefilled
itself through D-094's alias match, and the Words row read as one more
skippable field. It was skipped — and Start let the queue through, because
the arrest guarded "no recipient" (D-087) and the recipient's shape (D-091)
but never the message. The 26.8¢ session then obeyed the outbox contract to
the letter: five turns, refused to invent the words, wrote an outbox the
validator rejected (`"messages" must be a non-empty array`) and delivered
*"Blocked on one thing: what to say."* Charged, for the question the desk had
been holding on screen. (Recipe hygiene held: the run credited a `hit` on the
old resembling key and moved nothing else — D-099 doing its job the day it
landed.)

**The fix is D-087's own sentence, finished.** The comment above the send
questions already said a run without either fact "can only spend money asking
for them"; the arrest now covers the second fact. `missingWords` joins
`recipientProblem` (D-091) and `matchRecipient` (D-094) in `askFacts`: when
the say question carries the **Words** label — the server's own marker for a
bare send, and the label's documented reason to exist (D-097) — and the field
is empty, Start relabels to "Queue anyway — no message". A content-bearing
send's empty Say still queues silently, because writing the message is that
job; typed words always clear it, "write it out" included — that session is
chosen deliberately. Evidence: 1140 + 113 green; committed first (D-021),
then both mutations — dropping the label check, weakening the emptiness test
— each killed by a named test.

**The proof ran clean, and free.** Four queues of the verbatim sentence with
the desk holding the words, every one composed in code: 0 turns, $0.00 total.

- `9ad35c4c` approved → approvals 1, recipients locked to `[8633678680]`.
- `03005cac` approved → 2. The body was retyped lowercase between runs and
  the count grew anyway — bodies sit outside the signature by design (a
  weekly reminder's words change), and this exercised it.
- `f798582b` approved → 3; the review modal made the offer and the grant
  landed ten seconds later (`grantedAt`).
- 105 seconds after the grant, the fourth queue: finished in 2.4 s, and
  **sent 906 ms after finishing** — no review, resolved `promoted`,
  approvals 4, the row's `lastAt` equal to the send stamp to the
  millisecond, and `sends.jsonl` holding all four name-stamped bodies.

Everything D-082 designed fired in order on its first real outing:
`recordApproval` counting only unchanged signatures, the offer surfacing on
the third promote (the grant before it is refused in code), `autoBlocker`'s
pure-send guards passing a compose job, `autoSendable`'s allowlist answering
yes, and the auto path crediting its own approval so the count stays honest.
Left to the unit tests rather than live proof, deliberately: revocation on a
changed signature, the stranger-blocks-it subset rule, and the refusal
fallback at send time. M5.11 has no unproven pieces left.

## D-102 — 2026-08-06 — The folder is picked in the OS's own dialog, served by the server that has the folders

Wave 5 needed a folder from Brian, and typing a path was the friction. The
browser cannot remove it: both `webkitdirectory` and `showDirectoryPicker()`
deliberately never reveal an absolute path, so no web-side picker can hand
the server a folder to sync. What can is the server itself — it runs on the
user's own machine, in the user's own session.

**Chosen from three options** (an in-app folder tree over a list-folders
API; the native dialog; native now with the tree as an eventual fallback):
the native dialog, Brian's pick and the recommendation. "+" beside *reading*
opens Windows' modern IFileOpenDialog in folder mode — Quick Access,
OneDrive, search — owned by the foreground window, which is the browser the
user just clicked in, so it fronts above the click instead of flashing in
the taskbar. The chosen path saves through the same sources route as a typed
one, deduplicated, and the reading panel opens on the sync's own report. The
typed path stays as the fallback, and the panel grew "choose a folder…" for
later additions.

**The second deliberately Windows-only file**, on the OCR engine's precedent
(D-059): COM interop compiled by `Add-Type` in a spawned `powershell.exe
-Sta -EncodedCommand` — the encoding sidesteps every quoting rule a heredoc
dies on — with `[Console]::OutputEncoding` forced to UTF-8, because PS 5.1's
redirected stdout otherwise speaks the OEM codepage and mangles accented
folder names on this locale. One dialog at a time, five minutes of patience,
and a cancel is an answer: a `CANCELLED` sentinel no absolute path can
collide with.

**Probed before wiring, and the probe paid.** The C# was compiled headlessly
through the exact spawn the server uses, before the route existed — and the
probe showed PS 5.1 writing CLIXML progress noise to stderr **on success**,
which is why `parsePickOutput` reads stderr only off a non-zero exit; keyed
on "stderr non-empty" it would have failed every healthy pick. Tests pin the
seams the two sides share — the last-non-empty-line rule (Add-Type chats
above the answer), the sentinel, and the gate that refuses a second dialog
and reopens after any answer — while the dialog itself is a person and a
window, left to the person. Both mutations killed (first-line-instead-of-
last, and a stuck gate) after committing first, per D-021. 1147 + 113 green.

**Served live within the hour**: the first "+" picked `Training Ground
Workout`, the sync read 55 passages from two PDFs for $0, and Wave 5 ran on
it end to end — the record and its two boundary findings are TRAINING.md's.

## D-103 — 2026-08-06 — The recurrence timer: a sentence queued again on its cadence, through the same door

The 2026-08-06 capability review's first-ranked gap (`GAPS.md` G1), built on
Brian's instruction the same day. The engine rewards recurring work
everywhere — a recipe wants the same sentence verbatim (D-072), the leash
arms on completions, a tool needs three deliveries, standing approval sends
a proven job by itself (D-101) — and yet nothing re-queued anything: T5
waits for a person to remember September, and the weekly reminder D-082 was
designed around could not exist as a weekly fact. Every job was queued by
hand.

**Three ways to fire it were weighed:**

1. **The OS's scheduler** (Task Scheduler / cron hitting the API) — no code,
   but it fires when the server may be off, is set up per machine outside
   the app, and puts the recurrence rules outside the thing that owns
   quotes, channels and the queue.
2. **A session that re-queues itself** — refused on sight: a run granting
   itself future runs is the autonomy §14 exists to refuse. A schedule is a
   standing instruction a *person* wrote, like a standing approval.
3. **A server sweep** — chosen. `schedules.json` per level beside the
   level's other stores, a 30-second interval plus a boot sweep, calendar
   cadences in the machine's local time.

**The shape inherits its rules rather than inventing them:**

- A schedule stores the sentence **verbatim** plus what Start carried — the
  channel pick and the card's answers — because the recipe key is the
  prompt and a reworded repeat is a different job to the crew. Never the
  files: attachments ride one run only, and the repeat row says so.
- **Firing goes through the same glue `/work` uses.** The route's body from
  plan to queued event was lifted into `queueSentence` and both call it: a
  scheduled job is planned, channel-settled, quoted and specced identically
  to a hand-queued one. A new way in without a quote is D-027 over again; a
  second hand-rolled job builder is D-097 over again. The lift is the
  route-wiring lesson applied in advance — one body, two callers, no copy
  to drift.
- **Advance-then-attempt.** `nextDueAt` moves past the occurrence *before*
  queueing is tried, so a firing that throws records `lastError` on the row
  instead of retrying every thirty seconds — and "next" is computed from
  now rather than from the missed slot, which is what collapses downtime:
  a server off for three weeks fires a weekly schedule **once**, not three
  times. Boot runs the same sweep, so a missed occurrence fires promptly
  rather than waiting out the first interval.
- **Pause means not-while-paused; resume recomputes from now** — a
  schedule paused past its moment never fires a backlog on the way back in.
- Cadences are **words, not cron** — every day / every Thursday / monthly
  on the 23rd, at HH:MM local, with a monthly day clamped to short months
  (the 31st fires on Feb 28) — because this is M3's app and the person it
  is for says "every Thursday at 9", not `0 9 * * 4`.
- What fires lands as an **ordinary job**: quoted, reviewed, promoted, and
  standing-approval-eligible. A scheduled pure send under a D-082 grant is
  the first fully closed loop — it queues itself, sends itself, and every
  body still lands in `sends.jsonl`. The terminal says a firing job was
  `queued by its schedule` on the queued line itself.

**Evidence.** 26 unit tests pin the cadence math (strictly-after semantics,
the Jan-31 → Feb-28 clamp, the December year-roll), the store, the
single-catch-up collapse, error-recorded-then-cleared, and resume-from-now;
the suites read 1,173 server + 113 web green with typecheck clean. Both
load-bearing seams were then mutated after committing (D-021's rule): `>`
became `>=` on the daily candidate and killed exactly the strictly-after
test; computing "next" from the missed slot rather than from now killed
exactly the catch-up-collapse and resume-from-now tests. One and two kills,
no survivors, file restored from the commit. One test
failed on the way and it was the test's own fixture — the "future" schedule
was due at the probe moment — which is worth recording because the module
survived its author's first misreading. Not yet seen: a live firing. The
running dev server belongs to the other session and two servers on one tree
never happen, so the first live proof is deliberately T5's September firing
— or any weekly Brian sets before then — with the sweep's call site being
one call to the same glue every hand-queued job already exercises.

## D-104 — 2026-08-06 — The acting surface finished: Slack, calendar events and GitHub comments, one outbox

G2 of the capability review's list (`GAPS.md`), built on Brian's instruction
the same day G1 shipped. Three additions and no new idea about *how* the app
acts: a run writes OUTBOX.json, review shows it, **Approve is the send**
(D-075). The whole build is three channel clients, one contract block and
the detection to match — which is what "wiring, not decisions" was supposed
to mean when G2 claimed it.

**Slack** is telegram's shape wholesale: a `sendsOnly` connection with an
empty tool grant, a pasted bot token validated by one real call
(`auth.test`), replay through `chat.postMessage`, the audience roster
growing from reviewed sends like every channel's. The one thing it taught:
**Slack answers HTTP 200 with `{ok:false}`** — the body is the verdict, and
reading `res.ok` alone would call every failure a success, the same trap as
grading the exit code of `head` (D-096). The client and the validator both
read the body, and a test pins each. Off the planned shelf the day it
works, and the shelf test now asserts the leaving too.

**Calendar events** ride the consent already given: D-080's one Connect
covered `calendar.events` from the first day, so the channel's connection
is `google` and no new credential exists anywhere. The contract grows its
one new block — `event: {start, end, attendees?}`, with `subject` as the
title — validated at the seam like everything a model writes: parseable
date-times, the end after the start, attendees only as real addresses, and
**one event per outbox**, because sends are idempotent *by recipient* and
two events land on one calendar — an outbox that could double-book is
refused whole rather than half-replayed. The block is refused on every
other channel: a field that parses and silently does nothing is how a
review card and a send end up describing different things. A bare local
time gets the machine's own zone at send and an explicit offset rides
untouched; attendees get Google's own invitation mail (`sendUpdates=all`).
The desk deliberately asks no To/Words for a calendar job — its facts are
a title and a time, and the send questions would be the desk talking past
the user. The session's brief carries the event contract instead.

**GitHub comments** are the first write on a connection that reads. `to`
is the reference itself — `owner/repo#123` — so per-recipient idempotency
means "posts once per thread"; the comment goes from the user's own
account; and because `github` is not `sendsOnly`, the session keeps its
seven read tools — "read the thread, then draft the comment" is one job.
A 404 names both readings (no such issue, or a token that cannot write),
because GitHub's own answer does not and the fixes differ. **Opening a PR
is deliberately absent**: it needs a pushed branch, which is promote-flow
work, not an outbox entry — the §15 row stays open and says exactly that.

**Detection widened without loosening — the scoped claims.** "Add",
"create" and "book" are everyday coding words; as global send verbs they
would read "create a test for the telegram module" as a send. So a channel
may declare verbs that claim **only beside its own word**: add / put /
create / book / schedule / invite beside "calendar", and "comment on" —
singular on purpose, so "read the commentS on github issue 5" stays a
read — beside "github". Global verbs still claim everywhere, the near-miss
question (D-093) covers bare mentions unchanged, and the tests pin the
refused over-fires as firmly as the made claims.

**Evidence.** 65 new tests across seven suites — the contract's event
cases, all three clients (the ok:false trap, the timezone attach, the
reference parse refused before any call), the scoped claims firing and
staying quiet, the briefs, the hints, the validator, the catalog's slack
block and the recipient shapes; 1,212 server + 115 web green, typecheck
clean. Three pre-existing tests moved because the world did: slack left
the planned shelf, stopped being the "no brief" example, and gained a
recipient shape — each repointed at a channel that still holds the old
role. Mutated after committing (D-021's rule): making slack trust
`res.ok` killed exactly the 200-body test; dropping the one-event rule
killed exactly its test; and removing the verb gate killed **five** —
the original verb-plus-word test, the bare-"mail" rule and all three
scoped-claim guards — which is the over-fire protection measured as
load-bearing. No survivors, restored from the commit. Not yet
live-fired: no SLACK_BOT_TOKEN exists yet, and the first event and
first comment wait for real use — each will land as an ordinary
reviewed outbox, and standing approval (D-082) composes unchanged for
all three.

## D-105 — 2026-08-06 — Composite work: split where the user said "then", each step its own job

G3 of the capability review's list (`GAPS.md`), reopened by Brian the same
day G1 and G2 shipped. The row itself said "reopen when a real job wants a
second stage" — the demand evidence is the engine's own economics: tiers
are per job, so a composite sentence falls through to a full session even
when its parts are each free. "Summarise the expenses CSV, then telegram
Brian the total" is a compiled tool and a cheap send wearing a 50c
session's clothes, and splitting is what lets the ladder apply to the
parts.

**The design fork that mattered: steps are ordinary jobs, not
continuations.** A continuation would carry the sandbox forward for free,
but D-074's rules would then bind — the router refuses every shortcut to
mid-flight work, so every step after the first would be a paid session,
killing the point. Instead a delivered step's files ride into the next
step's `input/` exactly as attachments do, and each step keeps its own
prompt as its recipe key, its own tier, its own quote through the same
`queueSentence` glue as every way in. Recurring pipelines therefore
converge per step — a step that lands three times is a compile candidate
like any other job — and the attachment rule keeps every step's answers
honestly unbankable.

**The split is governed by the router's own rule: never guess.**
- Only explicit sequence markers split — ", then", "; then", ". Then",
  "and then" — and nothing else; "and" alone never does.
- A conditional lead before the first marker refuses whole: "if the tests
  pass, then commit" is one instruction, not two. After the first marker a
  conditional belongs to its step and splits fine.
- A torn-off fragment refuses whole ("…and then some"), as does anything
  past MAX_STEPS = 3 — beyond that the box has become a script.
- The desk shows the split before Start — "runs as 2 steps", each step
  quoted on its own sentence — with **run as one job** one click away. A
  wrong split is visible, never silent, and the choice belongs to its
  sentence like a channel pick.

**No waiting status, for the fifth time.** The next step does not exist
until the previous one delivers: the chain rides the job (`Job.steps` +
`Job.step`), and the completion hook — the same seam that runs the
close-out and the standing-approval auto-send — queues the next step as a
fresh job with the forwarded files, the position on its card, and "queued
by step N's delivery" on its terminal line. A failed step halts the chain
with the reason in the feed; a partial one forwards, because the statuses
classify delivery (D-041) and partial delivered. The previous step's
RESULT.md travels under the alias `input/previous-step.md` — the handover
its own D-063 brief already wrote — and the step brief names what rode,
what stayed behind (the attachment caps bind, and say so), and that later
steps run as their own jobs.

**What composes for free.** A scheduled composite sentence splits at fire
time, because the split lives inside the glue; a redone step keeps its
tail, because `redoJobSpec` names the fields; a step that is a pure send
under a standing approval still auto-sends. And what stays parked is
named: open-ended goal decomposition — the app inventing steps the user
never wrote — is M6's question and remains there.

**Evidence.** 14 new tests: the splits made and refused (the conditional
guard, the fragment guard, the cap), the forwarding filter (paperwork,
outbox and patch never ride; the caps report what stayed), the step brief,
and both spec builders carrying the chain. 1,226 server + 115 web green,
typecheck clean. Mutated after committing (D-021's rule): dropping the
conditional guard killed exactly its test, disarming the fragment guard
killed exactly its test, and letting paperwork through the forwarding
filter killed exactly the filter's — three mutations, three kills, no
survivors, file restored from the commit. Not yet live-fired — the first
real chain waits for the dev server restart, and the natural first
customer is exactly the expenses-then-telegram shape the tool tier
already serves half of for nothing.

## D-106 — 2026-08-06 — Schedule only: the repeat row can decline today's run, and says the first date

Found by the timer's first real user on its first real evening. Brian set
T5's sentence to monthly-on-the-1st and looked for a way to choose
September — which the arithmetic had already chosen for him: `nextDueAt`
is the next occurrence *strictly after now* (D-103's own pinned rule), so
a monthly-day-1 schedule created on Aug 6 first fires Sep 1. Two things
were genuinely missing, and neither was the month picker it looked like:

- **Nothing showed the computed date.** The desk said "queued again then"
  without saying when *then* was, leaving the user to trust arithmetic
  the server had already done.
- **Start always ran the job today as well.** D-103 chose "Start queues
  now and schedules the rest" as the default — right for most jobs, wrong
  for exactly T5, whose own programme rule is *not before September*. A
  job on a real cadence may want its first run **on** the cadence.

So the repeat row gains **schedule only — no run today**: it POSTs the
schedule through the existing route and nothing else, and the
confirmation line shows the server's own answer — "scheduled — monthly on
the 1st at 09:00, first run Mon, Sep 1, 09:00" — rather than a
client-side recomputation, because the one implementation of the cadence
arithmetic lives in `schedules.ts` and the desk only repeats what it
said. The link hides behind the same arrest that gates Start on a doomed
send, and the confirmation retires the moment a new sentence is typed or
a Start lands.

Client-only by design — the tested seam is the route and the cadence
math, both already pinned; the desk gained one caller of each. 115 web
tests green, typecheck clean. T5 can now be scheduled tonight and run
first on September 1st, which closes the training programme's last open
task without anyone having to remember it.

## D-107 — 2026-08-07 — Backdrops: the strip grows, and the viewport becomes data

Brian asked for pre-rendered backgrounds behind the levels, with the
interface overlaid, and for levels drawn from literature and pop culture.
Three forks were settled before any code, and one of them was settled by
measurement against what I had argued for.

**Where the backdrop sits: behind the world strip, not behind the whole
app.** The alternative was a full-bleed illustration with the header, rail
and terminal floating over it as translucent surfaces. Rejected on blast
radius: every panel's legibility would have to be re-solved against
arbitrary art, where the strip confines the risk to one canvas and leaves
every existing coordinate alive. The full-bleed frame stays available as a
later phase off the same pack format.

**The viewport becomes data, and that is M1, built here.** `VIEW_H` and
`GROUND_Y` were constants in `WorldCanvas`, with a second copy in
`themes.ts`, so every level was 320 pixels tall whatever it was a picture
of — a backdrop had nowhere to exist. They move into the `Scene`, and
`anchorsOf` is the single place they become `Anchors`, so the world, the
thumbnail and any future pack cannot disagree about where the ground is.
The four built-ins declare 320 / 258; the Pequod mock-up runs 450 / 388,
which keeps the 62 pixels below the ground line untouched and spends all
130 new ones on air above.

Only y moved, and that is what kept it local: the server sim carries `x`
and nothing else, `hover.ts` already took `groundY` as a parameter, and
only the three particle emitters had to follow.

Proved by recording all four scenes through the `Surface` before and after
— 1198 / 225 / 300 / 307 draw calls, byte-identical at 70,373 bytes. That
capture fed anchors in by hand, so a test pins the other half: `anchorsOf`
on each built-in must still yield 1000 / 320 / 258 / 80 / 940, written as
literals because the point is that history did not move. Three mutations,
three kills — a scene claiming 259, `anchorsOf` reading `viewH` where
`groundY` belongs, and `anchorsOf` hard-coding 320 instead of asking.
`tsc` caught what vitest could not, the test file's ad-hoc scene literals;
the fix is a helper, because an optional `viewH` would re-hide the exact
constant this removes. 1343 tests green, typecheck clean.

**The scrim, and the premise I had to abandon.** A scrim — a ramp of the
theme's own `void` from mid-height down to the ground line — was proposed
as the answer to a busy backdrop eating the crew. Measured by rendering
each scene twice, scrim on and off, and comparing only the pixels that
differ, which are backdrop by construction since the sprites draw
identically in both passes. On the Pequod's dark wall it helps every crew
member, mean separation 108.5 → 114.7. On Arrakis's bright sand it is a
**wash** — 31.0 → 31.1 — and actively harms two of four: rose 52.4 → 31.3,
and pink **20.9 → 0.3**, which is the same luminance as the sand it is
standing on. Darkening a bright ground drags it *through* the mid-tones
where the gowns live instead of away from them, and no single direction
works for gowns spanning the whole ramp.

So the scrim stays, per-pack and tunable, but it is not the legibility
device. That is a **constant one-pixel dark rim on the sprites** —
separation by contour rather than by value, which is indifferent to what
is behind it. This is not new machinery: `flatten()` in `tint.ts` and
`OUTLINE_OFFSETS` in `hover.ts` already build exactly this ring for the
hover outline. The change is running it always for packs that ask.

**Levels from a sentence.** "A level inspired by Moby-Dick" becomes an
ordinary quoted, sandboxed job whose deliverable is the pack: theme slots,
scene ops, ambient, validated by a checker and previewed before install —
the tool compiler's own rule, that generated instruction proves its own
output. A supplied `backdrop.png` in the pack folder wins over authored
ops. An image-generation connection was refused for now: it needs a
connection shape the registry cannot express (G6's `builtin | stdio`), a
new key and a new cost line, and authored scenes have not yet been shown
to be insufficient.

Deliberately out of scope and named rather than smuggled in:
**parallax**, on the ground that the world does not scroll so there is
nothing to parallax against; and **prop sprite overrides**. Signposts,
crates and torches stay code-drawn from theme slots, which the Arrakis
mock-up exposes better than any argument — its doorway glows pink, because
the renderer fills a doorway with the theme's `void` and Arrakis spends
`void` on its sky. Nothing is broken; a prop and a pack disagreed about
what a slot means. Either props gain sprite overrides, or slots gain
contracts — a `void` that promises to be dark. Left open on purpose, to be
decided against a real picture rather than in the abstract.

Remaining: M2 the backdrop layer and scrim, M3 level packs with `themeId`
opening up and `provenance` required by the checker, M4 the authoring job.
Mock-up: https://claude.ai/code/artifact/8dd970c4-ea80-4cf4-8726-4d1a93752422

## D-108 — 2026-08-07 — The backdrop leaves DB32: one palette for the crew, another for the painting

Brian pointed at Donkey Kong Country's Kongo Jungle map screen and asked
whether that look was reachable. It is, and it costs a rule.

Two things had to be said plainly. First, the scene format cannot produce
it and never will: DKC's art was modelled and rendered in 3D on SGI
workstations, then quantized down to the console's palette, and soft
ambient shading, depth haze and foliage clusters are not expressible as
`rect` / `poly` / `speckle`. The format is parameterised idioms,
deliberately not a drawing language (D-014), so this look means a genuine
raster file in the pack folder — which is the branch already chosen in
D-107.

Second, **DB32 is what stands in the way.** Everything loaded is currently
snapped to 32 colours, and for sprites that is exactly what stops an
outside pack looking grafted on (D-008, D-009). Snap a rendered backdrop
to 32 colours and it is destroyed — that look lives in a hundred-odd
shades with dithering between them. DKC itself is on the order of 128
colours for a background layer, not 32.

Decided: **DB32 governs everything drawn from theme slots** — crew, props,
scene ops — which is where "one crew" comes from, and **the backdrop layer
carries its own quantized palette**, budgeted at 128 and dithered. A split
with a stated boundary, not a hole. `pack:quantize` will make the budget a
checkable fact rather than a hope, and the same tool takes a Blender
render or an image model's output, since the authentic route here is also
the practical one for a single person.

The cost is bought knowingly: flat 32-colour sprites on a soft-shaded
render will read as pasted on, because DKC's own coherence came from
characters and backgrounds sharing one pipeline. This is what promotes
D-107's sprite rim from a bright-ground fix to **mandatory**. Re-skinning
the crew to match is expressible today — the pack format already accepts
any frame resolution and scales to frame height — but it is an
art-sourcing problem, a re-skin of the whole product, and a separate
decision to be taken after one backdrop is actually in place.

Composition constraints that fall out of the strip: author at 1000×450 (or
2000×900 and downsample), and keep the bottom 62 pixels and the ground
line quiet, because the crew walk there and the signposts, doorway and
parcel pile sit at fixed x. A centred composition like that map screen
does not transfer; it has to become a horizontal band.

`PACK.md` still states the old unconditional rule and is left alone
deliberately — it describes what exists, and backdrops do not exist yet.
It changes with M2.

## D-109 — 2026-08-07 — M2 and M3 built: the backdrop layer, and a level pack that is a whole world

D-107 planned four milestones. M1 landed with that entry; this is M2 and M3,
and the parts where building them changed the plan.

**M2 — the backdrop, and the scrim as bands.** A scene gains an optional
`backdrop`: ops of its own, plus a scrim, drawn beneath the foreground.
Because `drawScene` is what both the world and the level card already call, a
backdrop reaches both with no renderer change — which is what the `Surface`
abstraction was always for.

The scrim is **stacked alpha bands, not a gradient**. `Surface` has three
primitives and a gradient would be a fourth that Pixi, the thumbnail canvas
and the test recorder would all have to grow; banding is also what pixel art
does anyway. Bands tile on whole pixels so the alphas never compound and a
fractional band height cannot leave a bright seam. The backdrop is seeded off
its own base, for the same reason each op already has one: adding a rock to
the foreground must not reshuffle the grain of the sky.

`rim` puts D-107's measured outline on the crew — its own silhouette set,
because the hover colour is deliberately chosen to *stand out* where a rim
wants to read as an edge, and a pool, because eight ghosts suffice for hover
but a rim needs eight per agentling. Opt-in; none of the built-ins set it.

On the way, the slot lookup was collapsed into `paintOf`. Worth recording
because the duplication was mine and one commit old: `drawOp` had it inline,
the scrim duplicated it, and the rim would have been a third.

**M3 — the format moves, so a checker can see it.** A pack has to be
validated before installation, by a CLI and by the server that serves it, and
neither can import a browser bundle. So the scene format moved to
`packages/shared/src/scene.ts` — types only; the interpreter, the surfaces and
`anchorsOf` stay in web, the last deliberately, so the new module needs no
imports and cannot go cyclic with `index.ts`. `web/src/world/scene.ts`
re-exports the lot, so all ten importers were untouched. The first attempt
*copied* `Theme` rather than moving it, leaving two structurally identical
interfaces that typecheck was perfectly happy with — which is exactly how that
kind of duplicate survives.

`LevelPack extends Scene` rather than restating it, so a pack cannot describe
something the renderer would refuse to draw. It adds the palette and
`provenance`, required, because the licence becomes this repository's problem.

The half worth having is the **walk**. An unknown slot name reaches the
renderer as a throw at draw time — a level that will not open, with a stack
trace behind it. Now it is a line naming the op and the slot before anything
is installed. The walk is driven by which *keys* hold colours and coordinates
rather than by the op union, so a colour nested inside a `repeat` inside a
`band` is checked by the same three lines as a top-level one, and an op added
later is covered without touching the checker. Coordinates go through
`resolveCoord` itself, so the checker and the draw cannot disagree about what
parses. `THEME_SLOTS` carries a type-level assertion against drifting from
`Theme`; dropping a slot fails compilation naming the slot, mutation-proved.

**M3 also opened `ThemeKey`.** What a level stores is a `ThemeId` — a built-in
key or an installed pack's folder name — because the set is no longer closed
at compile time. The rule that follows: nothing downstream may assume it
resolves. `lookFor` never throws and never returns nothing, so a level whose
pack was deleted, renamed or refused still opens in the cave, the way a broken
art pack leaves the crew in built-in art. A pack named after a built-in is
refused rather than merged, because which one won would depend on directory
order.

The server reads `web/public/packs/*/pack.json` per request and serves them
whole — whole rather than as names, because it has already read and validated
every one and returning names would have the client fetch the same files and
decide validity a second time. Rejected packs come back with their reasons, so
a pack absent from the world can say why. Per request, so dropping a folder in
and reloading is the entire install.

**Evidence.** The four built-in scenes, run through the checker as packs —
between them every op in the format, including cave's ceiling with stalactites
and vines, and the beam, glints and clock ambients — pass with zero errors,
and fail the moment a slot they use is removed, which is what proves the walk
reached them. The CLI against a real pack: clean, exit 0; with four planted
faults, four exact messages, exit 1. Live: the server lists The Pequod at
450/388 with rim `rockEdge`; it appears in the new-level palette with its own
thumbnail; `lookFor('atlantis')` falls back to cave; a deliberately broken
pack planted beside it left the good one installed and came back rejected with
both reasons. Cave's thumbnail is still 17,154 bytes — the same figure it
measured before M1, through all three milestones. 1375 tests green.

Ships `web/public/packs/moby-dick`, the first real pack, and `LEVELPACK.md`.

**Deliberately not built.** The raster backdrop and its own 128-colour palette
(D-108) — `backdrop` takes ops today, not an image, so DB32 has not in fact
been relaxed anywhere yet. M4, the job that authors a pack from a sentence.
And the props question D-107 left open: signposts, crates and torches are
still code-drawn from theme slots, so a pack that repurposes `void` for sky
still gets a doorway painted with its sky.

## D-110 — 2026-08-07 — M4: a run authors a world, and the first one found three faults in the brief

The last of D-107's four milestones, and the only one whose evidence had to be
bought. It works: a description goes in, a job comes back holding a whole
world, and approving it is what installs it. The pack the first real run
produced is good — 33 foreground ops, 10 backdrop, three ambient effects, a
scrim in seven bands, a rim set, passing the checker with no errors and no
warnings. Its lamps cast light cones down the hull, which is a better idea
than anything in the hand-authored pack it was measured against.

**The contract is the outbox's, not a copy of it.** A session never installs
anything: it writes `PACK.json` at the sandbox root, review shows it, and
Approve is the install, performed by the server exactly as a reviewed patch is
replayed by `git apply` and a reviewed outbox by the channel client. Its own
file rather than a field on `Outbox` — an outbox is message-shaped and a pack
has no recipients or bodies, so collapsing them because both mean "something
Approve performs" is D-030's mistake.

The slug is a security boundary, not tidiness: it becomes a directory name, so
`../../etc` would let a sandbox choose where on disk an approval writes.
Refused by pattern, checked again at the write. Re-approving an identical pack
succeeds rather than failing, so a retry is never blocked by the work the first
attempt did — the outbox's own `sentTo` rule; anything *different* at that slug
is refused and left untouched.

**The trigger is a button, deliberately.** A sentence pattern is the on-brand
answer and was rejected for now: both walls the send surface hit — D-090's
inflections, D-093's typo'd verb — were found by real sentences rather than
predicted, and the phrasings people use for authoring a world did not exist
yet. A button cannot misfire, and the matcher can be designed later against
sentences that have actually been typed.

**The preview is drawn through the interpreter that will draw it for real**, so
it cannot flatter the pack, and at true proportions rather than card-shaped,
because how tall a world is is one of the few things a pack decides that cannot
be changed afterwards. `paintTo` is now the one place a scene becomes an image;
the four built-in cards came back byte-identical through that refactor —
17,154 / 8,814 / 10,462 / 8,010.

### What the first real run cost, and what it exposed

**$1.81, 17 turns**, against a quote of 50c at *high* certainty from 51
samples: 3.6x over and 91% of the $2 ceiling. The engine behaved correctly —
quoted before the work, ceiling held, the real figure billed — so nothing is
broken; the estimate is simply wrong for this job class, which was priced
against a pooled class whose members are mostly short. Recorded as TRAINING.md
item 7, deliberately unfixed: one run is not a rate.

Three faults, all in my own scaffolding rather than in the engine:

- **The brief answered its own question.** Its example carried a concrete
  identity — `"slug": "moby-dick"`, `"name": "The Pequod"` — and the run
  returned every one of them verbatim, from a description that said only
  *"a whaling ship"*. It never mentioned Melville. **The example was the
  answer.** Identity fields are placeholders now, with a line saying the
  concrete values illustrate the format and are not defaults to adopt, and a
  test asserts the brief contains no name or slug that could be copied.
  Dimensions stay concrete on purpose: copying those is fine, because the
  brief explains why they work.
- **Nothing told it which slugs were taken**, so a flawless pack came back
  unapprovable and only found out at Approve — after the money was spent. The
  route passes the installed slugs now and the brief lists them.
- **`pack:check` could not check a `PACK.json`.** The deliverable is
  `{slug, pack}`; the CLI dispatched on a top-level `ops` and answered *"not
  recognisably a pack"* for the one file the brief tells a session to check —
  so the instruction was only satisfiable *before* the file reached its final
  shape. The session had checked honestly against a bare pack and wrapped it
  afterwards; its report was true of the file at the time. This broke the
  project's own rule that a tool must prove its own output, in the one place
  it most needed to.

The fixes were verified against the artefact itself: the run's own `PACK.json`,
which the CLI refused to read, now reports `a pack is already installed as
"moby-dick"` and exits 1 — the exact failure caught where it costs nothing.

On the way, two dedups the fixes forced: `BUILTIN_THEMES` replaces three copies
of the same four names, in a leaf module because `pack.ts` needs it and
`index.ts` imports `pack.ts`, with the same anti-drift assertion as
`THEME_SLOTS`; and `slugProblem` moved to shared for the reason
`validateLevelPack` already lives there — a rule the checker waves through and
the install then refuses is a wall a session cannot see coming.

### One process failure worth recording

Testing the new route by *calling* it queued a real job on HQ, which the queue
picked up immediately: a session ran for six tool calls before the cancel
landed, at an unmeasured cost the ledger recorded as `costUnknown` and absorbed
(D-012). Calling that route *was* the authorisation — there was nothing between
a description and a running session, because the button had no quote step while
every other way into the engine has one. That is now fixed (the ceiling is on
the button), but the lesson is the older one: a route that spends money is not
something to smoke-test by invoking it.

Deliberately remaining: the sentence matcher; `PackCard`'s markup is still
unverified in a browser, because the only job carrying a `packDraft` is the one
whose slug collides; and the props question D-107 left open is unchanged.
1399 tests green, typecheck clean.

## D-111 — 2026-08-07 — A name clash was a dead end, and the crew's world replaced the hand-written one

Found by Brian in ordinary use, one turn after D-110 shipped. He approved
Pip's pack and got back:

> a different pack is already installed as "moby-dick" — remove
> web/public/packs/moby-dick or give this one another slug

He went looking for a level called `moby-dick`, could not find one, and
discarded a good $1.81 pack because the message left him nowhere to go.

**Four faults in one sentence, all in my own copy.** It named a slug he had
never seen — the app calls that world "The Pequod" wherever it appears. It
said "pack", but the only packs he had ever seen were palette entries, so the
Level panel was the reasonable place to look and a pack never appears there.
It told him to delete a directory, which the app cannot do and he should not
need a terminal for. And it proposed giving this one another slug while
offering no way whatever to do that.

The wording was the smaller half. The real fault is that **a collision was a
dead end**: the review offered Approve and Discard, Approve refused, so
Discard was the only move left, and it threw away work that was already paid
for. A constraint the user cannot act on is not a guard, it is a trap.

So the refusal names the world the way the palette names it and drops the
filesystem instruction, and the review gains an **Install as** field. The
clash is shown *before* the button, checked against the packs the client
already holds and naming what occupies the name; approving under a new one
installs the pack beside it. The route takes the override and re-checks it
with the same `slugProblem`, because a client that can rename must not be able
to rename into `cave` or `../../etc`.

Nothing was lost. Discarding leaves `PACK.json` in the sandbox and `packDraft`
on the job, so the world survived its own rejection — which is worth knowing
the next time a review ends badly.

**And the crew's pack replaced the hand-written one**, keeping the
`moby-dick` name, at Brian's decision. Pip's is the better picture: 33
foreground ops against 9, lamps casting light cones down the hull, gunports
onto a starred sky. Its provenance is also better than the one I wrote — it
separates Melville's public-domain text from studio adaptations, which is
exactly the distinction `LEVELPACK.md` asks for, and it discloses that three
near-black values sit off the DB32 ramp rather than claiming a purity it does
not have. The palette entry went from 16,334 bytes to 24,094; the four
built-in cards are unchanged.

The first world in this project not drawn by hand is now the one that ships.

1402 tests green, typecheck clean.

## D-112 — 2026-08-07 — The crew got eyes: a headless renderer, a designer, and the trap the class tag set

Brian asked whether there should be a job kind like "designer", with its own
tools and skills, and whether published ones could be leveraged. The answer
came in three parts, and only the first was the one he expected.

**The shelf was the wrong place to look.** Roles here already *are* Claude
Code subagent files and skills already *are* `SKILL.md` folders, so published
templates install verbatim — the mechanism was never missing. But measured
against the 532-entry catalogue, nothing transfers: the design-shaped entries
(`canvas-design`, `algorithmic-art`, `frontend-design`, `ui-designer`) are
p5.js, PNG/PDF and web UI, and everything matching *game* is engine
programming. Our deliverable is a fixed vocabulary of nine JSON ops and no
published skill speaks it. What transfers is judgment, and the authoring brief
already carried most of that — writing it again as a skill would be D-030's
duplication.

**What was actually missing: the crew could not see.** A session composed a
few hundred ops blind, and `pack:check` only ever answered "will this load".
So `npm run pack:render` draws a pack to a PNG through **the same `drawScene`
the app walks** — a renderer that could disagree with the app would be worse
than none, because it would be believed. The interpreter moved
`web/src/world/scene.ts` → `packages/shared/src/draw.ts` on D-109's precedent,
the world constants moved with it (`index.ts` imports `draw`, so the cycle was
real), and the raster and PNG went to the server because they need `node:zlib`
and shared is bundled into the browser. No dependency was added. It also gave
D-107's separation measure a home: **that number had never existed as code** —
"20.9 → 0.3" was measured by hand and left nothing runnable behind.

It found the shape of the problem on its first outing. The two installed packs
are mirror images: The Pequod sits on a dark ground where every gown separates
20.5–82.4 and its rim is useless (2.4), while The Drained Pool is bright, one
crew colour in eight vanishes (`#5fcde4`, 0.5), and its rim carries them
(47.5). **Each is saved by the device the other lacks**, so a gown that
vanishes is only a fault when the rim cannot carry it — the first verdict told
the pool to set a rim it already had, and the tool now reads the rim before
judging.

**The role, and why it is also the price tag.** `jobClass` is the role that
*ran* the work, so `designer` is simultaneously the missing class tag that had
kept authoring pooled with every short `worker` session and quoted 3x under
(D-110's 50c against $1.81; run 2's 53c against $1.29). `forceRole` carries a
role the *route* knows when the sentence cannot — authoring arrives by a
button — and deliberately does not fake the crew: `noOneHasRole` is recomputed
so `runnerRole` still prices against whoever will really run it. The desk sends
`authoring`, never a role name, because a client that could pick the role could
pick the price class.

Two things had to be true and one of them was measured the hard way. **A role
nobody holds does nothing**: with `designer` shipped and unheld the quote
stayed "About 54c — from 53 jobs like it"; hiring Moss into it flipped it to
"Up to $2.00 — first time doing this", samples 0. And **adding a role moves the
matcher underneath the roles already there**: shipping `designer` and
`see-your-work` sent *"look into how the payment code works"* from `scout` to
`mason`, because BM25's idf is corpus-relative and scout had been winning that
sentence 0.750 to 0.740 — either new document alone was enough. Rewording the
newcomer would only postpone it until the role after next, so scout now *says*
it explains how existing code works and owns the sentence on its own words.
`starter.test.ts` is the canary and carries the account.

### The trap the tag set, and the honest correction

Giving authoring its own class fixed the quote and, in the same move, **cut the
run's turn budget from 40 to 10**. `turnsForBudget` prices turns off the
*class's* per-turn rate, and with `samples === 0` it falls back to the role's
standing cap — the 40 the first two runs enjoyed had been coming from
`worker`'s fifty-odd rows all along. D-095's shape through a new door: the tag
meant to help took away what was helping, and the first designer run was cut
holding a finished, valid, rather good pack.

I recommended `maxTurns: 20` on the role and Brian took it. **It was
irrelevant, and the record should say so.** A role cap binds only while the
class has no rate, and the very run that exposed the problem gave the class its
first row — so every run after it was funded by the quote instead: 10 → 12 →
16, and the class now funds 19. The fix was for a wound already closing by
another route. What is true is the weaker claim: a new class costs its first
few runs, and `maxTurns` decides only how badly the *first* one is starved.

### What proved it

Three runs on "a quiet greenhouse at dawn", each cut at its cap, **charged $0
every time** — $3.9956 absorbed, `priceUsd: 0` three times, D-012 exactly as
designed. The first produced `world.png` in its sandbox unprompted, which is
the loop firing. The second wrote the diagnosis. The third fixed it and was
promoted.

The diagnosis is the entry's real evidence, because it is reasoning no checker
could reach:

> **9.5 is thin, and it is thin by luck.** The eight gown luminances are 22.5,
> 23.1, 32.2, 33.3, 40.9, 51.7, 63.4, 84.3. The pack's backdrop sits at 73.5 —
> the midpoint of the widest *interior* gap in that ramp (lime 63.4 ↔ yellow
> 84.3), whose best possible score is ~10.4.

**A background inside the crew's luminance ramp caps the best achievable
separation at half the widest interior gap.** No score above ~10 was available
without moving the background out of the ramp entirely — which it then did.
The band the crew stand on went from 72.9–74.1 to 4.0–4.9, worst separation
from **9.5 to 17.6**, and the rim from `stoneDark` to `rockEdge`. Its own
account of the fault was compositional as well as numeric: the brightest thing
in a dawn picture should be the sun, not the floor the crew walk on. The pale
haze became a dark planting bed and the composition survived.

Deliberately not seen by the render, and stated in the brief so a clean picture
is not over-read: ambient effects are animated, the crew stand-ins are
gown-coloured blocks rather than the 18×20 art, and the doorway, signposts and
deliveries are drawn over a pack rather than in it.

1430 tests green, typecheck clean. The Long Glasshouse ships as the third
installed world, and the first drawn by an agentling that could see it.

## D-113 — 2026-08-07 — The DKC look, measured: 128 colours holds, and the crew works from a picture rather than copying one

D-108 chose a raster backdrop with its own 128-colour palette and left three
things unmeasured: whether quantizing to that budget preserves the look,
whether 32 really destroys it, and whether flat DB32 sprites on a soft-shaded
ground read as pasted on. All three are now measured, on the actual Kongo
Jungle screenshot Brian pointed at when he opened the subject.

**`npm run pack:quantize`** makes the budget a fact rather than a hope, as
D-108 said it would. Median cut — deterministic, so the number is assertable —
plus Floyd–Steinberg, plus a PNG decoder written beside the encoder from
D-112. Still no dependency: node's `zlib` both ways.

| source | budget | mean error /255 |
|---|---|---|
| Kongo Jungle, 83,910 colours | 128 | **4.37** |
| the same | 32 | **15.30** |
| a clean glasshouse render, 1,002 colours | 128 | **1.10** |
| the same | 32 | **6.23** |

**D-108's claim holds and is now numeric: 32 costs 3.5x the error of 128 on a
real render, and the difference is obvious by eye** — at 32 the sky
crosshatches, the rear palm crowns collapse from dark green to purple-black,
and DK himself goes muddy maroon. At 128 it survives essentially intact.

A prediction of mine was wrong on the way, and the reason matters: I expected
a SNES screenshot to arrive already console-quantized near 128 colours. It
arrived at **83,910**, because 1440×900 is not a SNES resolution — the file is
an upscaled, resampled, lossily recompressed copy, and the interpolation
invented tens of thousands of colours long before it reached us. A screenshot
is not the console's output.

**And D-108's predicted cost is real.** Standing crew-coloured blocks with the
mandatory rim on that jungle, they read exactly as pasted on — while DK and
the Kremling, in the same frame, look at home, because they came from the same
pipeline as the background. Two honest qualifications: our stand-ins are flat
rectangles, which is the worst case against a real shaded 18×20 sprite; and
this is **not** a legibility failure — separation is fine, the crew are
perfectly visible. The rim machinery answers "can I be seen" and has nothing
to say about "do I belong". D-107 and D-108 solved the first. The second is
the re-skin D-108 parked, and it is still parked.

### Two ways to use a picture, and which we took

- **(a) the upload becomes the backdrop** — the only route to the look, since
  the ops vocabulary provably cannot reach it. Costs a second file through
  both the sandbox handover and the install (`installPack` writes exactly one
  `pack.json`), a checker budget, both renderers, and it takes authoring out
  of the crew's hands, because nothing in this app can generate such an image:
  the connections are web, github, search, browser, telegram, google,
  whatsapp-business, slack.
- **(b) the upload is a reference the crew works from** — no format change at
  all, and worlds stay crew-authored.

**Taken: (b)**, on evidence rather than preference. A session was given the
screenshot as `reference.png`, with the filename deliberately neutral so it
could not be recognised from the name, and asked to describe what it saw.

It saw it. The sandy path dipping left and cresting middle-right, three
horizontal zones, near-black leaf undergrowth in the bottom quarter, a brown
ape on all fours with cream muzzle and pale pink hands, the magenta fan-leaf
behind it, three bananas on the sand, a helmeted green reptile with a purple
tail, the DK barrel, a second grey barrel in the undergrowth, the graded hole
between them, an arc of nine bananas. It **described rather than recognised**
— *"I have not named the game or the characters, since the picture itself
carries no title, only the letters `DK`"* — which is exactly what working from
a reference requires. It cropped six regions, re-encoded them at 2–3× and
looked again, and separated seen from unseen: dusk or dawn undeterminable from
the gradient, "roughly eleven" palm crowns with the overlap stated, and a
patch on the reptile it declined to name at 6×.

So the reference path is not a compromise: the crew can see, zoom, and reason
about what it sees. What it cannot do is reproduce a rendered painting, and
the brief now says so in as many words, because a run that tries to trace one
will come out worse than a run that reads it.

**Cost: $0.99 and 17 turns for a description — and a third of that was waste.**
It wrote its own PNG decoder, chunk walk and Paeth unfiltering and all, inside
a sandbox whose `repo/server/src/raster.ts` had held `decodePng` since that
morning. Nothing told it. The brief now points at it by name, which is the
cheapest possible version of the capability surface doing its job.

### What shipped, and what did not

`Artwork/` is a drop folder for source images, with **its contents gitignored
and its README tracked**. Not a judgement per file: `LEVELPACK.md` already
says a file in this repository makes its licence this project's problem, and a
folder people drop pictures into fills up with things nobody re-read the terms
of. Inputs untracked, `web/public/packs/<slug>/` outputs tracked and carrying
provenance the checker refuses to let you omit. A pack drawn from a reference
must name it there, which is why the upload is kept rather than consumed.

New Level offers **Pixel** or **Pre-rendered** — the two ways this kind of
world was ever made — and pre-rendered asks for the picture. It rides as an
ordinary attachment into `input/`, measured long ago at 88s against 616s for
making a session go and find things.

Deliberately not built: the raster backdrop of (a). It is still the only route
to the real thing, and the measurements above are what a decision to build it
should rest on. Also caught before it shipped, and worth recording because the
file that prompted the feature is exactly the size that breaks it:
`String.fromCharCode(...bytes)` spreads one argument per byte, so a 1.5 MB
reference is 1.5 million arguments and a stack overflow. Chunked at 32KB.

1448 tests green, typecheck clean.

## D-114 — 2026-08-07 — One button in the terminal, the decision in the panel, and an account of what is left

Brian's own reading of the feed, from a screenshot: a finished run puts four
controls and a text box into a scrolling log and **leaves them live after they
have been used**, so rows already dealt with stay clickable, and the decision
itself happens in a strip a few characters tall while the panel with room for
the actual work sits unopened.

Decided: the row gets **one green REVIEW**, the panel gets the whole decision —
Approve, Discard, More turns, and a box to tell the agentling something — and
the row collapses to a plain line once you have chosen.

**A click-through mockup came first** and earned its keep: built in the app's
own palette straight out of `styles.css`, with a real rendered world embedded,
so the flow could be clicked rather than imagined. Four questions came out of
it that the description had not raised, and each answer changed the code. The
prototype is at
`https://claude.ai/code/artifact/1986a959-40fe-4c0f-9d08-bb4ad5a35420`.

### The four, and why each went the way it did

**Where "what is left" comes from.** More turns without it is a coin flip, and
the runs that most need it are the ones cut before they could write anything —
**three of the first six wrote no report at all**. The answer was already in
the system: the close-out is a separate two-turn errand that fires *after* the
session dies, proven on every cut run at 5–9c. It now writes `PENDING.md`
beside `LESSON.md` and `APPROACH.md`. Two details are load-bearing. It joins
the short-circuit — a run that wrote its own lesson and approach used to skip
the close-out entirely, and would have skipped the one thing only the close-out
writes. And `done` is its sentinel, the same idiom as `known`, because a model
asked for a list will write one: the way to get "nothing" is to name the word
that means it.

**What More turns says before you press it.** `up to $X`, matching how the desk
phrases every other spend, with *charged only if it finishes* beside it. That
second half is a rule and not reassurance: `priceFor` returns 0 for any run
filed `failed`, and every cut run has been — six for six, including ones whose
output was kept. The figure comes from the route that will charge it, through
one shared `continuationSpec`, because a desk that quotes one price and a queue
that bills another is exactly D-097.

**Approve leaves the log.** The panel opens with it focused, so a trusted run
is REVIEW then Enter. The speed lost is the speed that let the drained pool's
vanishing crew colour through unlooked-at; the speed kept is standing approval,
which is the mechanism built for "stop asking me" (D-101).

**The resolved line names the decider.** `approved — installed the
glasshouse-dawn world` in lime when it was you; `sent automatically` in sky
when a standing approval did it. Your verb, not the ledger's — "promoted" is
what the record calls it, and the feed is a list of your decisions. An
auto-send must never wear your verb, because those are precisely the runs
nobody looked at.

`pending` is stamped in `queue.finish()` beside the outbox and the pack draft:
the same seam, firing on every ending including a cancel, and needing no thread
back through the executor because the close-out writes the file before either
completion path returns.

### What is not proved, and should not be read as proved

1459 tests green and the quote route verified live against a real cut run
(200 with a quote; 400 for a run that did not stop for want of turns). Neither
of those is the thing that matters:

- **Nobody has looked at the new UI.** The Browser pane freezes in this
  environment, so it is unobserved in a browser. In a session whose whole
  lesson was that looking is what catches faults — the renderer of D-112 exists
  for that reason — shipping an interface nobody has seen is the same mistake
  one layer up, and is recorded here rather than discovered later.
- **No real close-out has ever produced a `PENDING.md`.** The parser, the brief
  and the panel are tested; the model asked to write it has not been asked
  once. Its first outputs need checking against what the run actually did,
  because a two-turn errand reading a dead sandbox is precisely where an
  invented plan would come from. The brief tells it that *"it had barely
  started"* is a valid answer for that reason.
- **A pre-existing oddity is now visible where users read.** The live quote for
  a cut run came back `expected $2.36, ceiling $2.00` — the expectation above
  the clamp. That is D-072 behaving as designed, not something introduced here,
  but the button now says "up to $2.00" for a continuation whose own history
  says otherwise.

**First contact, added the same evening.** Brian pressed the restored "Do it
properly" (D-116) on the `ui-check` routed fetch; the redo ran as a session
with the router off — 3 turns, 22.0c against the $2 clamp, `outcome: done`,
approved — and its close-out wrote the first real `PENDING.md`: the word
`done`, verbatim. The sentinel idiom held on its first outing — a model asked
for a list named the word that means nothing is left instead of writing one —
and the claim is true against the run, whose RESULT.md is a complete account
of the page. Only the clean path is proven by this: a cut run's account, the
case More turns actually depends on, is still unobserved.

## D-115 — 2026-08-07 — The careers were zeroed at boot, and the ledger gave them back

Found by the evening's full review, by looking rather than by any test: the
ledger gives Pip 50 runs in hq, his roster career said 1, and every level card
said "0 done". Three counters, one fact, three answers.

The mechanism was two correct pieces composed into an eraser. `Sim`'s
constructor materialised the roster with `jobsDone: 0, jobsFailed: 0`
hardcoded — while `addAgentling`, six lines below, seeded `seed.jobsDone ?? 0`
the way M4.0 intended. And `syncRoster` then wrote the sim's live counters
back over `roster.json`, which is correct exactly when the sim was seeded
correctly and an eraser when it was not: every restart re-zeroed the record on
disk. The stray values that survived anywhere (`Pip: 1`) were whatever landed
since the latest boot. D-030's shape yet again — one notion, two derivations,
the visible one wrong — and D-097's test gap beside it: 1,459 tests were green
because none of them ever handed the constructor a veteran.

Decided: the constructor takes `addAgentling`'s two lines, and one test pins
both layers — the seeding, and the restart round-trip through `syncRoster`
handing back what came in. Mutation-proved by putting the zeroes back: exactly
the new test fails (1 of 10), everything else green (`64bd28c`).

The history came back from the ledger, by identification and not by guess
(D-056's precedent). The mapping is exact rather than approximate, which is
what made the backfill safe: a ledger row's `outcome` is written from the same
`landed` boolean that increments the career (`landed = status !== 'failed'`,
then `jobsDone++`/`jobsFailed++` and `onOutcome` files the row), so per
`(levelId, agentlingId)` the done rows are `jobsDone` and the failed rows are
`jobsFailed`, one to one. A cancel that never ran a session touches neither
side. Dry-run first, cross-checked against the productivity panel's
per-member run counts, then applied:

| Level | Member | Was (done/failed) | Recomputed |
|---|---|---|---|
| hq | Pip | 1 / 0 | 20 / 30 |
| hq | Ivy | 0 / 0 | 12 / 13 |
| hq | Sol | 0 / 0 | 10 / 2 |
| hq | Dot | 0 / 0 | 1 / 0 |
| hq | Moss | 0 / 0 | 1 / 5 |
| home-chores | Pip | 1 / 0 | 4 / 0 |
| training-ground | Pip | 3 / 0 | 47 / 10 |
| training-ground | Dot | 0 / 0 | 2 / 0 |

Every total matches the ledger's per-member row counts (Pip hq 50, Ivy 25,
Sol 12, Moss 6; training-ground's 57 + 2 are its 59). Deliberately untouched:
the 17 rows with no `agentlingId` (blank by D-056's own rule), rows for
`pdf-test-drive` (the level is gone), and — had any existed — rows attributed
to ids no longer on a roster; none were, because no merge has ever executed.
Verified live after a reload: `/api/levels` reports hq 44 done,
training-ground 49, home-chores 4 from the server's own memory.

Worth keeping from this one: the counter was only caught because D-056 gave
the ledger an author to disagree *with*. A figure that cannot be
cross-checked is not wrong, it is unfalsifiable — the level cards had been
reading "0 done" with nobody in a position to say so.

## D-116 — 2026-08-07 — "Do it properly" comes back, in the panel

The same review that found D-115 found that D-114's rewrite had orphaned the
redo path: the terminal's four controls were replaced by one REVIEW, and "Do
it properly" — D-015's escape hatch, the one-click way to pay for a full
session when a routed free answer is wrong — was in none of the surfaces that
replaced them. The server route survived, quoted and tested (`D-027` closed
its unquoted hole), with no caller left in `web/src`.

The near-miss mattered less than it first looked, which is why this was a
question rather than a straight fix: the clarify box already escalates — a
reply carries `continues:`, and the router refuses a continuation every
shortcut — so a wrong free answer was recoverable by typing a sentence. But
that is a different offer: a reply *continues* the sandbox with new words,
while redo re-runs the same request properly, and the user should not have to
compose instructions to say "that answer is not good enough".

Decided (Brian, of the three options): restore the button. It sits in the
review panel's footer beside Discard — the place D-114 moved every decision —
shown only when `job.meter?.routed` is true, so it can never appear on work
that already paid for a session. One click POSTs the existing route, the new
run is queued and quoted as a session, and the routed job stays reviewable
exactly as before. Render-verified live on a routed $0 fetch in the `ui-check`
scratch level: the button appears for the routed job, Approve keeps focus, and
More turns stays absent. Deliberately not clicked there — the route queues a
real paid session, and proving the wiring is the route's own tests' job.

## D-117 — 2026-08-07 — The designer drift measured, and both cheap fixes measured out

The review caught it live: "Read https://example.com" matched **designer** at
0.49 on `[read, com]`, and the desk said "nobody here is a designer, so it
goes to your worker" about fetching a page. The memory note from the hire
already warned that adding Moss's two documents moved the matcher underneath
the existing roles; this entry is that warning sized, and the tuning question
settled by measurement rather than by the first idea.

**The drift, on the whole population.** Every distinct real prompt the app
has ever queued (83, plus the live probe) replayed through the production
matcher offline (`MatchIndex` + `suggestSetup` against the real catalog):
42 no-match, scout 17, scribe 14, **designer 5**, mason 3, analyst 3. The
five: a knowledge question ("what do we know about the close-out pass",
**0.66, on the single word `know`**), two coding prompts, a fetch, and one
defensible capture ("describe the attached image", on `see, picture`). The
mechanism is the designer's long prose body — `toDoc` indexes role bodies at
weight 1 against descriptions at 2, and a ~30-line body full of *read, see,
look, know, first, pass* out-words every terse built-in.

**Fix one, descriptions-only: refused by its own numbers.** Rebuilding the
index with bodies dropped kills all five designer captures — and orphans
**14 correct matches** with them ("turn the attached CSV into an .xlsx
workbook" loses analyst, "move `quoteFor_` out of index.ts" loses mason,
"write a short sourced note" loses scout…). 42 → 56 no-matches. Bodies carry
real signal for every role whose body is terse; the cure costs three times
the disease.

**Fix two, down-weighting: a dead knob.** The same sweep at body weight 0.5
and 0.25: designer keeps 4 of its 5 captures at both settings, "know" still
winning at 0.65 (was 0.66). Confidence leans on **coverage**, not raw score
(D-011's design), so scaling body terms cannot dislodge a match carried by a
body-only word. The knob does not reach the fault.

Decided: **weight 1 stays; nothing changes in the matcher.** The measured
cost is ~5% of real prompts drifting to a role that mostly is not hired
(the assignment then falls back — "goes to your worker" — and the tier is
the router's decision, not the matcher's). The one real exposure is in hq,
where Moss exists: a drifted sentence that reaches a session runs as
`jobClass: designer` and pollutes the class rate D-112 paid $4 to
establish. **Tripwire:** an hq ledger row filed `designer` on a sentence
that is not design work reopens this. The real fix, if it fires, is not a
weight — it is query-term informativeness, D-051's lesson again: whether one
shared word is signal depends on how rare the word is *in language*, not in
a six-document corpus where "know" is unique by accident.

## D-118 — 2026-08-07 — The overnight campaign: 27 runs, priced first, across every flow the app has

Brian's brief, verbatim in spirit: broad tasks that trigger every tool, hire
across the roles and explore new ones, install skills, control the entire flow,
send only to him, try every learning level, results by 09:00, ceiling $200.
The campaign was **pre-registered before any quote was taken** (predictions in
the scratchpad plan, the house method applied to the curriculum itself) and
driven end to end through the server's own API — `/work/plan`, `/work`,
`resolve`, `redo`, `reply`, `continue/quote`, the approvals route, hire, role,
rest/wake, schedules. 27 ledger rows: **$7.87 charged, $8.14 spent** against a
predicted $5–9, ~$200 never close.

**The free tiers' real population.** The plan predicted routed $0 for an
answer-shaped question, a fetch-with-extraction and a search question; all
three ran paid sessions (29.7c, 21.9c, 40.1c), and a **verbatim repeat** of the
timeless question five minutes later still ran a session (17.4c — D-069's one
step, visible). The recipe banked a method and no `answer`. What routes free
tonight, measured: bare URL reads, knowledge recalls (both $0 with citations),
compiled tools, and verbatim-words composes. Filed as an open question rather
than a bug: whether answer-banking's criteria should widen is a measurement to
take deliberately, not a gate to loosen because a prediction embarrassed
itself.

**Learning shows in the standard, not the price.** The same sentence, verbatim,
in three populations: training-ground veteran 59.6c/13 turns, never-used
`random` crew 47.0c/9, fresh hire in a new `bootcamp` level 62.7c/16. The two
cold runs differ nearly 2x from each other, so at n=1 the variance drowns any
cost signal — but the *quality* gradient is real and directional: the veteran's
note carries the banked five-source standard (authority hierarchy, the
forward-published UF path, Monday's already-known rate) where the fresh hire
fought an Incapsula block for seven turns and honestly flagged its figure as
one hop from the issuer.

**The class-tag tax, at n=3.** The first analyst anywhere (Bea, bootcamp,
hired and role'd tonight) was cut at a 6-turn grant on her first job —
`outOfTurns: true` beside `pending: Finished.`, the workbook complete and
exact — 5.1c absorbed; her second job got 40 turns and delivered a three-sheet
workbook at 17.2c. One cut-but-complete run is the cheapest tag ever paid
(designer's was $4, D-112). The matcher sweep over all 20 recurring recipe
keys: 11 no-match, 3 scout-held in hq, and **5 whose matched specialist is
unhired exactly where the work recurs** (scout x2, scribe x2, analyst x1 in
training-ground; analyst x1 in hq). The recommendation that follows: no new
role earns invention tonight — sends already compose at $0 without a courier —
the shortage is hiring existing specialists where their matched work already
recurs, priced against the now-thrice-measured tag tax.

**The skill loop, closed.** A training-ground run authored
`authoring-a-level-pack` from five attached sources (79.0c/10 turns — the
attachment tax again), three of its claims were verified against source before
anything installed (HEADROOM 58, the checker's key sets, the four built-in
theme names), and the picker attached it to the designer role. Pack #4,
`lamp-room-daybreak`, was then authored **under** it: worst separation **19.8,
the best any pack has measured** (glasshouse 17.6), with the luminance-ramp
rule applied at design time — a plinth wall placed *because* "the crew's ramp
runs 22.5–84.3" — instead of discovered after a render. The skill moved the
method and the quality, not the turn count (cut at 23, like its ancestors).
Fifth world installed. The 532-entry library, meanwhile, has still never had
an install (`installed.json: {}`) — the app's own skills all arrived as
folder drops.

**The review flow's unobserved paths.** Second live "Do it properly", first
via the API — the redo of the thin balance-sheet recall diagnosed the store's
junk text layer in its own words ("a defect, not a gap in the archive"),
which is G6's boundary attested by the crew. A discard on the stale greenhouse
partial whose draft slug was already taken (it could never have installed —
D-111's rule made the discard objective). A reply-continuation ran, keyed and
credited as its job (recipes clean, D-074 holding) — and exposed both bugs
below. More turns' quote came back live on a real cut run ("About 59c — done
this 3 times before", ceiling $1.33): the figure the button shows, computed by
the route that would charge it. The POST itself stays one atom short of
proven, deliberately: every cut tonight was **cut-but-complete** (`outOfTurns`
beside `Finished.`), and continuing finished work buys nothing — that pattern,
twice in one night, is the panel's real signal for *declining* the button, and
genuine mid-work cuts have become rare since D-095/D-112.

**Sends, arrests, automation.** The bare-send arrest and the standing approval
composed for the first time: Words demanded at the desk, composed in code at
$0, then auto-sent 1.4s after finishing under D-101's grant (approvals 4→5,
audit row stamped). The "Sen" near-miss raised `channelMention` exactly as
D-093 built. Slack answered `connectable` with an honest note rather than an
arrest. The heartbeat sentence met D-087's shape — the crew **refused to
invent** "tonight's training heartbeat" and asked for the data instead of
fabricating it. The UF-ping arc earned a second grant's eligibility (three
unchanged approvals → offer), and the grant was left on the table: the
permission layer treats taking a standing auto-send rule as the user's own
click, which is the right reading — it is one click in the panel now.
Calendar's first firing is wired-correct and walled by the Google console
(`calendar-json.googleapis.com` disabled on project 40965402983 — the same
wall gmail cleared earlier the same evening); the 400 leaves the job
reviewable and "nobody is messaged twice" held. The recurrence timer's
mechanism live-fired on a disposable $0 daily (created, fired +7s, deleted;
`c639d84a` untouched) — knowingly front-running D-103's "deliberately left"
line; T5's Aug-12 firing remains the first real scheduled work.

**Composite x tool.** The split preview priced step 1 "Free — the crew wrote
a tool for this" and the run served it `tooled: true` at $0 inside a
then-chain. Step 2 died to the crash below and was recovered by hand-requeue:
a halted chain has no resume affordance, noted as a UX gap.

**The crash, unresolved and named.** The tsx child died twice with executor
sessions live (21:38, 21:46:08), killing composite step 2 and the first
analyst probe (`INTERRUPTED`) and eating the pack run's meter (`costUnknown`,
the ledger's ninth unmeasured row). No watched file changed at either moment,
and the 21:38 "restart" process turned out to be Adobe's own node.exe born on
a coincidental second — the hard-won rule about pattern-matched signals,
earning its keep mid-diagnosis. Cause unobserved (the dev server's stderr was
not captured); left open at the top of TRAINING.md's list with the evidence
table. Worth saying plainly: a server that can die on completion seams is the
likeliest author of the ledger's older unmeasured rows too.

Two latent bugs were found, reproduced on demand, and fixed the same night:
D-119 and D-120. 1,462 tests green and typecheck clean after both.

## D-119 — 2026-08-07 — Paperwork does not inherit: PENDING.md joins the forward exclusion

Found on `fb19d020`, the heartbeat continuation: it composed its outbox
correctly, and its job record told its **parent's** story — "halted after
validating the recipient", items about supplying data it had already been
given. The two sandboxes held byte-identical `PENDING.md`s.

The mechanism is three correct pieces composing into a lie. `carryForward`
excludes `PAPERWORK_FORWARD = {RESULT, DIFF, LESSON, APPROACH}` — written
before D-114 existed, so the third paperwork file forwards like any
deliverable. The continuation's run wrote its own lesson and approach, and
`harvestAndCloseOut`'s short-circuit (`first.lesson && first.approach &&
first.pending`) found all three present — the third one **inherited** — and
skipped the close-out, the only thing that would have written a fresh account.
D-114 worried about an invented account from a close-out reading a dead
sandbox; the live failure was the opposite — a *real* account from the wrong
run, stamped onto a job whose work it never described.

Decided: `PENDING.md` joins the exclusion set — `carryForward`'s own docstring
("its own paperwork is deliberately left behind") already stated the rule the
set now matches. A continuation starts with no account; if its run writes
none, the short-circuit fails on `first.pending` and the close-out writes one
that is actually its own. The extended paperwork test pins all four files;
mutation-proved by removing the entry — exactly one test fails (1 of 1,332).

## D-120 — 2026-08-07 — An approval is keyed by the sentence the chain began with

Found twice: a dead grant already on disk whose key is a 360-character
transcript ("…you have already worked on this — anything you produced is
already here… the user replied: can you add an excel table…"), and then
reproduced on demand — approving `fb19d020`'s send minted a second
(`send a telegram to brian with tonight's training heartbeat you have already
worked on this…`, approvals 1). A key like that can never match a future
sentence: the grant is dead weight and the approvals ladder silently restarts
for every continuation of a send.

The cause is D-074's gap, one seam over. `/reply` builds a transcript prompt
(deliberately — the run needs the conversation), recipes credit a continuation
as the job it continues, `/continue` keys by the verbatim original — and all
three approval call-sites still keyed `approvalKey(job.prompt)`.

Decided: `JobQueue.rootPrompt(id)` walks the `continues` chain (cycle-safe,
stopping at a missing parent, answering the job's own prompt when there is
nothing further), and the three call-sites — auto-send's lookup, auto-send's
record, and the resolve route's record — key by the root. The security
boundary does not move: `autoSendable` still gates on the recipient allowlist,
so a continuation auto-sends only under the root grant's locked recipients —
which is what a continuation *is* under D-074's identification. The dead keys
stay on disk as inert rows, deliberately unmigrated: a grant is cheap to
re-earn, and a migration that guessed wrong would write an auto-send rule
nobody granted. Tests pin the chain walk, the orphan stop and the unknown id;
mutation-proved by killing the walk — exactly one test fails.

## D-121 — 2026-08-08 — Closing a level archives it in place, and the sweep takes the clones

Brian asked for level deletion with a happy medium between unbounded growth
and losing training data. Measured first, the two halves came apart: six
levels held 1,019 MB, of which hq alone was 1,016 — and 1,002.9 MB of that is
`repo/` working copies under job sandboxes. Every level's actual learning —
recipes, knowledge, lessons, transcripts, close-outs — fits in ~16 MB. So
"delete a level" was never the disk question, and the disk question was never
about levels. The design also mostly existed already, three times over:
letting an agentling go archives the lessons and forgets the roster (the file
is still there), D-029 left ledger rows from dead levels alone, and D-111
ruled that the app offers the action rather than a filesystem instruction.

Decided: **the app closes levels and never destroys them.**
`DELETE /api/levels/:lid` stamps `closedAt` into level.json and pauses every
schedule through `setPaused` — the pause route's own function — with the
stamp written last so a failure part-way leaves the close retryable. The
runtime stops by removal from the levels map: the tick loop and the schedule
sweep both walk it, so one delete is the whole stop; watchers get
`SOCKET_LEVEL_GONE`, which the client already treats as "leave, don't retry".
The folder staying whole under `levels/` is also the id defence:
`createLevelFiles` guards on the *directory* existing, so a closed id is
never reissued and the ledger's rows keep their referent. A preview route in
merge's preview→act grammar feeds the confirm, which names consequences
instead of asserting safety: deliveries still in review are kept; each
schedule is quoted with its next firing (closing training-ground would have
to say T5 stops); granted standing approvals lapse — an approvals file in a
closed dir is inert by construction, because nothing reads the dir. Close
refuses 409 while anyone is mid-job, in the crew routes' own wording. Reopen
clears the stamp and rebuilds the runtime; schedules stay paused
deliberately — a level asleep for months must not fire a catch-up on
waking — and the reopen dialog names the paused schedules and still-granted
approvals, so no power returns silently. Boot skips closed dirs, and the
fresh-HQ seed now requires a genuinely empty install: an all-closed map is a
decision, not an absence to paper over. A hard delete is deliberately not a
route — D-111's counterpart: the app offers the reversible act; the
irreversible one stays a by-hand act outside it.

The disk answer is a separate sweep (`POST /api/working-copies/sweep`),
offered as a maintenance card in Settings. It removes `repo/` only, and only
under `promoted` or `discarded` jobs — a done, partial or failed job's clone
is where a reply's continuation still works, and a sandbox dir with no job
row proves nothing about itself, so both are kept rather than guessed at
(backfill by identification). Everything else in a sandbox stays; a redo
clones fresh. Measured at build time: 403.3 MB across 40 clones sweepable
immediately, 599.6 MB more under hq's 60 unresolved reviews, freeing as they
resolve. Closed levels are swept too: the rule is per job, not per level.

One trap dodged and pinned: counting a closed level's jobs by constructing a
`JobQueue` would have *rewritten* it — `restore()` fails running jobs over to
`failed — interrupted` and persists. `readStoredJobs` reads without touching,
and a test closes a level with a `running` job on disk and asserts the stored
file still says running.

16 new tests (blocker wording, granted-only approvals, pause through the
tested path, reopen leaves paused, the per-job sweep rule, torn-file
tolerance, the no-rewrite pin); 1,348 + 130 green, typecheck clean.

**Evidence amendment, the same hour — the first real call did its usual
work.** Mutation-proved post-commit (`59070e2`): the mid-job guard removed
kills exactly the two blocker tests, `done` added to the sweepable set kills
exactly the two classification tests, the pause condition inverted kills
exactly the two schedule tests — no survivors, no over-kills. Then the live
`GET /api/working-copies` against the real store agreed with the independent
PowerShell measurement to the byte (40 clones / 403.3 MB sweepable,
50 / 599.6 MB kept) — and took **19 seconds on a synchronous walk**, holding
the event loop for all of it: sim, sockets, every request. Invisible to
tests that walk six-file temp dirs; obvious on the first real call. The walk
now rides fs/promises, and measured again the API answers 6–14 ms *during*
the scan. The Settings card says "Measuring…" for those seconds — the honest
cost of a real number; a cached figure would answer its own question stale.

**Amendment (2026-08-09 late — the sweep's first live run, its last
unexercised item).** Brian ran it from Settings against the real store,
audited from outside before and after. Before: 45 clones / 588,685,262
bytes sweepable (grown from the 40/403.3 MB above as reviews resolved),
52 / 693,327,406 kept. After: **sweepable 0/0, kept byte-identical** —
the sweep took exactly what it named, ~561 MB freed. Disk agreed with the
instrument: exactly 52 `repo/` dirs remain. Spot check on promoted
`42d39856` (the P5 organize job): clone gone, RESULT.md, MOVES.json and
`moves.jsonl` — the journal Undo and audit read — all intact. Deliverables
never lived in the clones, and now the store shows it.

## D-122 — 2026-08-08 — Gmail's roster reads the contact book; the legend stops riding whole

Brian asked whether the Gmail connection can review his contact list so the
To field offers a dropdown with name matching. Almost all of it already
existed: `contacts.readonly` has been in the consent since D-080 ("one
consent, three capabilities… so nobody re-consents per feature"), the
audience route is channel-generic and the WorkBar already calls it for
whatever channel the plan carries, `RecipientPicker` and the D-094 name
prefill are channel-agnostic, and `AudiencePerson.id` was documented as "a
chat id, **later an email**". The one missing piece was a source: nothing
filled `audience/gmail.json` from Google Contacts.

D-092 said "never a contact-book import", and that line was written about
the **userbot shelf** — scraping a phone's book through an unofficial
client, refused with reasons (D-077). This is the other thing: the official
People API, on the user's own OAuth client and a consent they already gave.
The distinction that makes both rules true at once is that **what counts as
an honest source is the channel's own rule**: on Telegram the roster IS
reachability, so opt-in is the boundary; on Gmail any address is reachable
and the roster is autofill, so the user's saved contacts belong in it.
Decided with Brian: **saved contacts only** ("My Contacts") — the
`otherContacts` everyone-ever-emailed list needs a scope the consent does
not carry, and the send audit grows that population honestly anyway.

The build: `googleContacts` (People API, names + addresses only, paged at
1,000, one row per email, a two-address person is two reachable rows, no
display name falls back to the address) rides `accessTokenFromRefresh`;
`mergeContacts` folds the book in — contact-book name wins, but an
address-as-name never overwrites a name a reviewed send taught; aliases and
send counts survive; idempotent — and the audience GET grows a gmail branch
beside telegram's, gated on the three `GOOGLE_OAUTH_*` env names. A refusal
becomes `problem` beside the stored people rather than a silently thinner
dropdown, because the People API sits behind the **same console toggle that
walled the calendar** (D-104): live-verified the hour it was built, the
real store answered 2 send-audit people plus exactly that sentence —
"Google says the People API is off for your project — enable it in the
Google console (APIs & Services → Library → People API), then look again."
The picker shows it amber where the expectation forms; the 7-day-trap and
revocation wordings ride the same field for free.

**The legend stopped riding whole, for every channel — decided with Brian
against the whole-roster and picker-only alternatives.** channelBrief used
to map every roster row into every send session's prompt; two Telegram
people made that invisible, a contact book prices the user's whole address
book into each paid prompt for recipients the job will never touch (context
costs on every turn, D-053). `legendAudience` now filters at briefForJob —
the single production call site — to people the sentence names (mirroring
`matchRecipient`'s whole-word ≥3-letter token rule, aliases included, minus
the uniqueness demand: a legend may hold both Anas) plus people already
sent to, ranked by use, capped at 20 — with everyone the prompt names kept
past the cap, because the sentence asked for them. The picker itself ranks
by use, bounds its DOM at 80 rows with an honest "N more — keep typing",
and scrolls inside its own list.

14 new tests (paging and flattening, the console sentence, refusal
wordings, merge semantics including the address-as-name guard, the legend's
keep/drop/cap rules, and the briefForJob wiring both ways); 1,362 + 130
green, typecheck clean. Telegram's audience answered unchanged beside the
gmail check. What remains is Brian's console toggle — the same one the
calendar waits on — and the first real dropdown over the real book after
it.

## D-123 — 2026-08-08 — The picker learns what Gmail's compose field knows

Brian flipped the People API toggle the same hour, and the D-122 fetch
answered honestly: **one** saved contact with an email. His book at
contacts.google.com is phone numbers. What he wanted — "like when I'm
composing an email in Gmail" — is a different list: **"other contacts"**,
auto-collected from everyone he has ever emailed, which is what Gmail's own
compose field autocompletes from. It sits behind its own People API
endpoint and its own scope (`contacts.other.readonly`) — exactly the list
D-122 skipped while the consent lacked the scope. Asked for by name, the
skip is revised; the boundary that stays is D-092's real one, the
shelf-refused userbot scrape.

The build widens one seam rather than adding one. `GOOGLE_SCOPES` gains the
scope, with the note that matters operationally: **a token minted before a
scope joined the list does not grow it** — reconnecting is what grants the
slice, and the reconnect on Google's own page is the user's consent act, so
the code ships inert until Brian himself approves. The connections walker
generalizes to `listPeople` serving both lists — `otherContacts` speaks
`readMask` where `connections` speaks `personFields`, otherwise the same
walk, the same paging, the same refusals-as-sentences — and a 403
"insufficient authentication scopes" maps to the sentence naming the fix:
open Settings, Connect Google again, approve. The audience route merges
emailed-people first and the saved book second, so a curated name outranks
an auto-collected one; if both lists refuse, the saved book's broader
sentence keeps the problem line.

Live the hour it shipped: the route answered the 3 known people plus
exactly the reconnect sentence — the token predates the scope, as it must
until the Connect button is pressed. 3 new tests (the readMask walk against
its own endpoint, the reconnect mapping, saved-over-auto name precedence);
1,365 + 130 green, typecheck clean; mutation: breaking the
insufficient-scope match kills exactly the reconnect test. What remains is
Brian's one consent click, after which the compose-field population fills
the picker on its next focus — no restart, and the legend rule keeps every
prompt as narrow as before regardless of how big the list turns out to be.

**Amendment, minutes later — Brian could not take the click, and the fault
was D-111's shape exactly.** "Press Connect Google again" pointed at a
control that does not exist: the drawer and its Connect button render only
while a connection is *not ready*, so a connected Google card offered
identity, a pill and a switch — no way to re-walk consent. An instruction
the user cannot act on is a trap, and this one was written the same hour
the entry above praised the reconnect sentence. Fixed at both ends: the
start route takes typed secrets or falls back to the client the .env
already stores (`startCredentials`, its own tests — an empty ask is a
reconnect, not a mistake; a truly absent client still gets the old
validation sentences), and the ready Google card grows a quiet
**re-approve access** link that opens the fresh consent in a tab with
nothing to re-paste and nothing to poll — the callback storing the new
refresh token is the whole grant. Live-verified: an empty-body start
answered 200 with the accounts.google.com URL carrying **both** contacts
scopes, minted from the stored client. 1,368 + 130 green.

## D-124 — 2026-08-08 — Calendar asks its own two facts, and reads the gmail book

Brian asked for the calendar invite to work like a telegram or a mail at
the desk: To filling with matching contacts (who is invited), Say helping
with the title. Probed live before touching anything: "Send a calendar
invite to Andy for tomorrow at 6pm" detects `calendar` correctly (even
with "on Gmail" in the sentence — the D-104 scoped claims hold), and the
desk asks **nothing** — D-104's deliberate exception. The deeper fault was
new, though: a calendar job's brief legend reads the *calendar* roster,
which does not exist — the 116-person book of D-122/D-123 is keyed under
gmail — so a paid run could never have resolved "Andy" and would have
refused the attendee honestly after the money was spent, the 71¢-wall
class again.

Decided with Brian, revising D-104's silence rather than its reasoning:

- **Calendar asks its own two.** "Who's invited?" — id `send-to`, label
  **Invitees**, and the label is load-bearing: it is how the client's
  arrest knows this To is *optional*, because a dentist appointment has no
  invitees and must queue without a fight (D-104's argument, kept). A
  *filled* field is checked like any other channel's (D-091): the calendar
  shape wants an address in every comma-separated part, so "Ana García"
  alone is arrested before money and "Ana — ana@x.com" passes the way
  every picker pick does. "What's the event called?" — label **Title**,
  used verbatim; never 'Words', so the bare-send arrest cannot fire. Times
  stay the sentence's job; the session parses them under the brief's
  contract, and the brief now says outright that an Invitees answer is
  exactly the attendee list and a Title answer is the subject verbatim.
- **Every audience seam maps calendar → gmail through one function**
  (`rosterChannel`, the D-119/D-120 sweep done up front): the audience GET
  (so the picker and its problem line just work, client unchanged), the
  plan-time roster names, the executor's injected legend reader, and the
  forget route. Attendees are gmail-reachable people; a calendar.json
  would only ever have held "primary".
- **Calendar never takes the D-097 compose shortcut**: `sendFacts` refuses
  it by name, because a `{to, words}` compose cannot carry the start and
  end an event needs — without the guard, adding the questions would have
  quietly extended the free-tier promise to a channel it cannot keep it
  for.
- The answers reach the run through `clarificationLines`' existing
  recompute — zero new plumbing — and execution needed nothing: the outbox
  contract already validates attendees as emails and Approve already sends
  invitations via sendUpdates=all.

Live after building: the same sentence now answers
`send-to [Invitees] "Who's invited?" · send-say [Title] "What's the event
called?"`, and `GET /api/channels/calendar/audience` serves the 116-person
gmail book — the picker and the D-094 prefill have both inputs. 9 new
tests (calendar's questions and labels, the compose refusal, rosterChannel
both ways, the calendar shape, missingRecipient's exemption and its
ordinary firing); 1,371 + 134 green, typecheck clean. Found in passing:
Brian had quietly given the close feature its first three real uses —
bootcamp, random and ui-check all sit on the closed shelf, ui-check with
its kept calendar re-Approve named on the row.

**Mutation evidence, with a catch worth its own lines.** The Invitees
exemption removed kills exactly its test. But the sendFacts guard removed
**survived** — twice. The first compose-refusal test used a sentence that
was never bare ("invite" reads as content), so it returned null with or
without the guard: a test passing for the wrong reason, the harness-first
lesson again. The second attempt exposed the deeper fact: `calendar` is
not a CHANNEL_WORD, so any sentence *containing* the word cannot read
bare — the guard's one reachable path is a **settled** channel with no
channel word in the text (an ask-card pick, a schedule replay). The test
now uses exactly that shape, with a telegram twin on the same sentence
proving it composes there — so the calendar null is the guard refusing,
not the sentence never qualifying — and the mutation now kills exactly
one test. Three exact kills total across the change.

**Amendment (2026-08-09 late — the desk's first sent invite, and the
timeline the audit straightened out).** The send journal showed the
history had run ahead of the notes: `3e5ef9f2` (ui-check) failed its
Approve **twice** on 2026-08-07 night with the designed error — the 400
naming the console enable link — and succeeded 2026-08-08 08:04 after
Brian enabled the Calendar API, *before* ui-check was closed; the
"re-Approve waits with the closed level" note was stale. The **first real
attendee-carrying invite** then sent the same morning (`be099816`, the
Pollo reminder, ok:true 10:21, andytg1111@gmail.com attached) — but it
had needed the old detour: a first job asking for Andy's email, Brian's
reply, a second job. What remained unproven was exactly what this entry
built that evening.

Tonight closed it: `f3124c4f`, "Send a calendar invite to Andy for
tomorrow at 6pm about joining the Agentlings revolution", queued through
the D-124 desk. The clarifications carried both answers in the desk's own
words — "Who's invited? Andy — andytg1111@gmail.com" (the picker's
format, straight off the 116-person book) and "What's the event called?
AGENTLINGS" (verbatim, capitals kept) — and the run shows what that
bought: **3 turns, one Write, 15.8 s, `asked: false`**, the event exact
(2026-08-10T18:00–19:00 from "tomorrow at 6pm", attendee attached, title
verbatim), `sends.jsonl` ok:true matching the job's `outboxSent` to the
millisecond, ~35c all-in against the $2 ceiling. Two jobs and a reply
became one job and no questions — the detour D-124 was built to kill,
measured dead on its first live outing.

## D-125 — 2026-08-08 — The architect trade, and a review that draws its diagrams

Brian picked P1 off `EXPANSION.md` (the broaden-the-spectrum proposal,
`cfbf654`; the research that shaped it is cited there). The decisive local
fact: the review panel could not show a diagram at all — no mermaid
anywhere in `web/src` — so a blueprint would have arrived as fence source
in a `<pre>`, and the pack's whole point is a drawing someone can read.

What shipped (`c5995e3`):

- **`architect`**, the seventh trade — read, grep, bash, write; 15 turns;
  evidence-first prompt: enumerate before describing (the T8·1 lesson as a
  standing instruction — memory invents files, a listing cannot), views
  rather than one mural, ADRs when the job is a decision, and every
  blueprint closes by naming what it did not read.
- **`architecture-blueprints`**, the ninth ability — C4 discipline top
  down, one diagram per level; mermaid mechanics (`flowchart` /
  `architecture-beta`, never the still-experimental C4 syntax; a view
  splits past ~15 nodes); boxes carry their real paths; arrows say what
  actually flows.
- **The review draws fences.** `splitMermaid` cuts a markdown preview into
  text and *closed* ```mermaid fences; a `Mermaid` component lazy-loads
  the library (heavy, and most files carry no diagram), renders under
  `securityLevel: 'strict'` so a label is text and a crew-written file
  cannot script the panel, and keeps the fence's own source one click
  below the drawing — D-030's rule that a conversion must never read as
  the file, applied to diagrams. An **unclosed fence stays text**,
  deliberately: the preview's own truncation can cut a fence mid-diagram,
  and half a diagram is something the file does not say.

Evidence: 1,371 + 139 green (five splitter tests; the starter pins move to
seven jobs / nine abilities; a reach sentence — "draw an architecture
blueprint of this system" — routes to architect), typecheck clean, and the
D-112 canary held on first run: no earlier reach sentence tipped when the
corpus grew.

**Mutation evidence, and the one that survived.** Unclosed-fences-render
killed exactly its test; opener-loosened-to-a-prefix (```mermaidish reads
as a fence) killed exactly its test. Then the architect's *description*
gutted to "A helpful generalist" **survived** — the reach still routed to
architect. Not a hole in the reach test: `toDoc` weights name ×3,
description ×2, body ×1, and the role's body is dense with its own
vocabulary, so the route was riding the whole document. Description and
body gutted together killed exactly the reach test. Worth keeping: **the
matcher's routing surface is the whole role file**, so D-112's advice —
fix a tipped sentence by rewording the role that should own it — applies
to bodies as much as descriptions.

Not proved yet, said plainly: no browser has drawn one of these diagrams
(jsdom cannot render mermaid, so the tests pin the splitter and the
fallback, never the pixels — the first F5 on Brian's own server is that
check); the first real blueprint job has not run; and the new class pays
G5's tax knowingly — with no rate, architect's standing 15-turn cap is its
whole budget until rows exist. The natural first errand: hire an architect
into hq and queue the reach sentence itself — hq is the level whose
blueprint can be checked against SPEC's own architecture section.

**Amendment, 2026-08-09 — every unproven line above is now proved, and the
first run out-earned its pack.** Job `3296ea7a` ("Draw an architecture
blueprint of this system", hq, Bea as architect): **promoted**, $1.66
against the $2.00 first-time quote (charged = cost, under the ceiling;
close-out 5.7¢; ledger reports 21 turns against 15 allowed — D-022's
reported-is-not-granted, on a run that delivered whole). Brian confirmed
the review **drew the diagrams** — the pixels check. The mechanical gate
passed: all 26 file paths the blueprint names exist, `index.ts` is exactly
the 2,981 lines it claims, the route count within one of its 73. The run
also corrected its own brief on the record: the handed listing says 40
files where `git ls-files` finds 260 — the cap is deliberate (D-063's
orientation turn), but the brief's wording let it read as the whole.

What the first blueprint found, verified where checkable the same hour:

- **The server binds every interface.** `serve({fetch, port})` at
  `index.ts:2881` passes no hostname; the blueprint flagged it as its one
  unresolved security consequence, and netstat against the live server
  confirmed: `0.0.0.0:4600` and `[::]:4600` LISTENING. §11's "localhost
  only" was an assumption, not a bind — G7 now holds the open decision
  (pin `127.0.0.1`, or keep LAN reach on purpose).
- `/internal/fetch` does not re-assert the catalog grant its two sibling
  doors re-assert (the D-119 sibling-seam shape, found by a paid run).
- The tier concept lives as **three vocabularies in three files** (router
  kinds, quote tiers, AGENTLING's seven) — anything adding a tier lands in
  all three.
- Four modules import `executors/claude.ts` for constants and sentinels
  only — pricing a quote drags the SDK-spawning module in.

A $1.66 run produced one confirmed security finding, one sibling-seam
gap and two coupling facts. The pack's evidence gate is closed.

## D-127 — 2026-08-09 — The bind pinned to loopback: G7 closed the day it opened

Brian's decision on G7, taken the morning the first architect run opened
it: **pin, don't authenticate** — no workflow reaches the app from another
device, so the LAN reach was all exposure and no use.

What changed (`05864c7`), both ends of the dial:

- `serve({ fetch, port })` at the foot of `index.ts` gains
  `hostname: '127.0.0.1'`, with the constraint stated where the code is:
  the `/internal/*` doors carry no auth, so **the bind is the whole
  boundary**. The WebSocket upgrades ride the same server and inherit it.
- `web/vite.config.ts` dials `127.0.0.1` **by address** for `/api` and
  `/ws`: Node may resolve `localhost` to `::1` first, and a proxy dialing
  IPv6 at an IPv4-only bind would have turned the pin into an outage. The
  executor's door endpoints and the OAuth redirect already used the
  address (`claude.ts:882-904`, `GOOGLE_REDIRECT`) — untouched.

Verified against the live server, not asserted: tsx watch restarted on the
edit (the D-126 capture logged the restart — its first config-triggered
serving); netstat moved from `0.0.0.0:4600` + `[::]:4600` to
**`127.0.0.1:4600` alone**; the direct API answered 200; and the browser's
whole chain through vite's proxy answered 200. 1,372 + 139 green,
typecheck clean. `AGENTLING.md` §11's line re-corrected to the new
measured truth, per its code-wins rule — the same line that had claimed
"localhost only" while the bind said otherwise.

Left alone on purpose: the boot log still prints `http://localhost:4600`
(a browser resolves it fine either family), and the doors still carry no
auth — the bind is again the boundary, but now it is a *chosen* one,
measured, rather than a default nobody had read.

## D-128 — 2026-08-09 — The studio pack: a render door that reaches nothing, and scribe grows a shell

EXPANSION P2, planned in plan mode and decided by Brian in three answers:
`playwright-core` driving the **system Edge** by channel (no browser
download; the dependency in the *server* workspace on purpose — root
dependencies are read as `lib:` capability tokens, so a root dep would
demote every recipe on the machine, D-036 via `LIBRARIES`); the `render`
connection **defaultOn** like `web`; and **scribe gains `bash`** — the
planning exploration found its `[read, write, grep]` could never execute
the docx call shapes the brief has been handing every session since D-031.

What shipped (`aa6cbac`):

- **`render.ts` + the `/internal/render` door.** A run authors ONE
  self-contained HTML document and the tool prints it: `setContent` (the
  page never navigates) plus a route that **aborts every request**, so an
  image, font or stylesheet URL in a run's HTML reaches nothing — proved
  in `render.test.ts` against a live localhost listener that counted
  **zero hits** while the document asked for an image, alongside a real
  Edge-printed one-page PDF. Caps owned by the module: 2 MB of HTML, 30 s
  killed. The door copies `/internal/github`'s 400/404/403 shape with the
  grant re-checked — never `/internal/fetch`'s, the sibling that skips it
  (D-125's finding).
- **Web-shaped on the session side, and that is a correction to the plan's
  first draft**: the runner's generic github/search loop hands
  `reply.text` to the model, and a PDF is bytes to *write* — so `render`
  gets a dedicated runner block (the `web` precedent) that writes the
  file at the sandbox root and hands the model the receipt
  (`Wrote report.pdf — 2 page(s), N bytes`). Base64 never rides a prompt.
- **Three skills in the house style**, all mandating sandbox-root output
  (subdirectory files are invisible to review — the planning sweep's
  finding): `deck-design` (palette-first pptxgenjs, the no-`#` hex trap,
  layout variety, the ban list, native `addChart`, read-back quoting
  slide count and titles, the honest "layout unverified by eye" line),
  `document-design` (styles never decorated runs, hierarchy, page
  furniture, mammoth read-back), `pdf-report` (`@page` owns the paper,
  data: URIs, pdf-parse read-back, the .html kept beside the .pdf as its
  source, and the no-renderer fallback: deliver the HTML and say so).
  deck-design + pdf-report ride designer; document-design + pdf-report
  ride scribe. No new role — designer and scribe keep their earned rates,
  which was the point (G5's class tax paid only where a class is new).
- `DOCUMENT_LIBRARIES` gains the styled-PDF line, self-qualified ("when a
  render_pdf tool is present") so the brief stays honest when the
  connection is off.

Evidence: 1,380 + 139 green on the first full run — the reach canary held
with three new skill docs in the corpus — typecheck clean. Mutations,
post-commit: the route-abort removed was killed exactly by the
zero-requests test; `defaultOn` flipped and the grant emptied were each
killed by exactly the two catalog assertions. Known and accepted, stated
rather than hidden: the `/internal/render` route's 403 is untested like
both of its siblings, the runner block is untested like the whole runner
(both conventions, not oversights), and turning the connection on demotes
existing strong recipes for one outing while their surface heals —
D-036's designed behaviour, not a regression.

Not yet run live: the first styled-PDF job and the first branded deck are
the evidence gate, after Brian's server restart picks up the catalog and
runner changes. Expected quotes come from scribe's and designer's
existing classes, not a first-time ceiling.

**Amendment, 2026-08-09 afternoon — the gate is closed, and the deck run
taught more than the clean one.** Brian restarted (the capture logged the
SIGINT and the fresh start — it also logged tsx restarting under this
morning's live edits, working exactly as built) and ran both jobs.

*The report* (`650fadbf`, scribe, promoted): **63.5¢ against the $1.58
quote, 6 of 22 turns** — an existing class quoting from its own rate, as
intended. One A4 page, the brand colour and three derived tints, and the
skill's discipline held whole: pdf-parse read-back quoted in the result,
a first render that came out 2 pages **tightened and re-rendered to 1**
(the door served repeatedly), and the model-knowledge caveat printed on
the page itself. One mechanical mismatch found: the skill says keep the
.html beside the .pdf, but the html rides the tool *argument* and need
never touch disk — the run composed in memory and no .html exists. The
skill line, not the run, is what should move (one line, next touch).

*The deck* (`bd129804`, designer, promoted): the ledger row reads
`failed · costUnknown · $0 charged` — the run was **cut by the 10-minute
session wall mid-iteration** (its RESULT is titled "in progress") — and
the sandbox it left was good enough that Brian promoted it. What it held
is the finding: the run routed around pptxgenjs entirely — a 16:9 PDF
deck through the render door, then **`mutool` (present on this machine;
it noted pdftoppm absent, probed, found it) rasterised every page**, it
*looked* at them, wrote seven named visual faults ("the plume ran through
the word SpaceX", "the rocket read as clip-art"), fixed all seven in v2,
and computed WCAG contrast ratios in its own `contrast.mjs`, quoting
eight pairs. The see-your-work loop ran END TO END on a deck — the thing
the parked `render_office` row assumed needed LibreOffice.

Recorded, not yet acted on (n=1 each): a deck job's look-loop wants
headroom the 10-minute wall does not give; deck-design's .pptx mandate
versus the render-door path is a real fork (editable artifact vs
presentable one) the skill should name instead of silently losing;
and **mutool's presence means deck visual QA is possible today** — the
render_office row's premise has an alternative on this machine.

## D-129 — 2026-08-09 — The researcher trade: a longer clock, and the word "research" changes hands

EXPANSION P3. The build is small — a role, a skill, one engine seam — and
the seam had just earned its evidence: the deck run (D-128's amendment)
was cut by the 10-minute wall with turns to spare, exactly the bind the
plan predicted research would hit first.

What shipped (`39211ff`):

- **`timeoutMinutes`** on `RoleInfo`, parsed in `maxTurns`'s exact
  frontmatter idiom, applied by `timeoutMsFor` — default 10, clamped at
  30 so a typo cannot uncap the clock — and passed per call into
  `runSession`; the close-out keeps the 10-minute default. The turn cap's
  whole shape, deliberately: same parse, same clamp-don't-trust, same
  tests.
- **`researcher`**, the eighth trade: default model (scout stays the cheap
  Haiku errand-reader), 30 turns, the first `timeoutMinutes: 25`;
  verdict-first briefs, two independent sources per load-bearing claim,
  RESULT.md kept current so a cut run has still delivered.
- **`deep-research`**, the thirteenth ability: decompose before fetching;
  search finds, fetch reads; independent means separately produced;
  per-claim `[url, fetched YYYY-MM-DD]` citations (the store's provenance
  shape extended to the web); disagreement reported, never averaged; a
  Gaps section; never pad.

**The D-112 canary fired twice, and both fixes were a vocabulary
handover.** First 'look into how the payment code works' tipped scout →
mason the moment the corpus grew — fixed by scout's own words (its
description trades the word "Research" for the literal "looks into").
Then the new reach row landed on scout anyway, through the **concept
map**: `research:` had bridged to `reconnaissance`/`survey` since the
days scout *was* the research role. The map entry now reads
`['research', 'sources', 'brief', 'findings']` — the researcher owns the
word — while look/explore/survey/investigate keep carrying scout's
phrasings. match.test's echoed-term probe moved to 'investigate', a
bridge that still exists, keeping its point (the user's word is credited,
not the catalog's).

Mutation evidence, including one that taught about the instrument:
clamp-removed killed exactly its test; the map handover reverted killed
exactly the reach row. The researcher-gutted mutant **survived on the
first attempt — because the mutant was broken, not the test**: the
node-script surgery left the role's body intact, and the stemmer has no
`-er` rule so the name alone (`researcher` ≠ `research`) could not have
carried the routing. Redone with a real gutting, the reach row killed it
exactly. A surviving mutant is a claim about the mutant first — the
measure-before-tuning rule in mutation form.

Not yet run live: the trade's evidence gate is three real questions Brian
actually wants answered, spot-checked against their citations (the D-118
verify-the-crew's-claims pattern). The class pays G5's tax knowingly; the
$2 ceiling stays deliberately unraised until a real run argues otherwise.

**Amendment, 2026-08-09 — the first real run (1 of 3), and its citations
audited from outside.** Brian hired a researcher (Bea, into home-chores)
and asked what Starlink's V3 satellites are made of and can do (job
`75d1503a`, promoted). The brief is the skill running whole: verdict
first, a "V3 ≠ FCC Gen3" section untangling exactly the conflation the
skill hoped it would catch, four conflicting mass figures reported and
**not averaged** ("I'm not averaging these — use the best-provenance one,
dated"), and a Gaps section naming eight things it could not establish.

Audited the citations through the app's own `/internal/fetch`, not
trusted: the flight claims (TechCrunch) verified; the corroborator the
brief cites (Converge Digest) confirmed every headline number — 1 Tbps,
160 Gbps, 2,048 beams, 400 Gbps lasers, Ka/E/V/W, Redmond. **The finding
worth keeping: the brief's most load-bearing source — SpaceX's own spec
page — returns 0 chars through the app's door (JS-rendered, the D-035
class), yet the brief quotes it verbatim.** The researcher read it through
the SDK's `WebFetch` (held via the role's `web_fetch`), a richer fetch
path than the app's own `fetch_page` door — so a researcher carries two
fetches of different reach, and the app cannot itself re-audit what the
richer one read. What rescued auditability was the skill's own
**two-independent-sources rule**: the corroborator *is* app-readable, so
the numbers stand on a source the app can check even when the primary
cannot. The rule earned its place on the first run.

Cost is the second signal: **$2.41 spent, $2.00 charged, $0.41 absorbed**
— the run hit the $2 ceiling (36 turns of 30, D-022's reported-over-
granted). "Never billed above quote" fired. One real argument that the
researcher class may want a higher ceiling than a design or scribe job —
but n=1, and two more gate questions come first. The ceiling stays.

**Second amendment — the gate is complete, 3 of 3, and the ceiling
argument is now measured.** Brian ran the other two on Bea: SpaceX's
business (`1732eece`) and how to train Agentlings (`2c0955f2`), both
promoted. Both are the skill at its best — the business brief runs its
own arithmetic consistency checks (segment results reconciling to the
stated total to the rounding), self-corrects a draft error on the record,
discloses two paywalls, and catches that a quoted "Aug 09" share price
cannot be real because the date is a Sunday; the training brief engages
this project's own "learns only from clean successes" memory and grounds
concrete M6 fixes in 2026 literature (ACE, ExpeL, the STALE benchmark),
labelling its one synthesis as inference rather than a sourced claim.
Citations audited from outside through `/internal/fetch`, and this time
the primaries were app-readable and verified: Fortune's +92%/$7.8B, ACE's
+10.6% and "brevity bias", STALE's 55.2%. The trade works.

**The ceiling is now a measured case, not a hunch — all three runs bound
on the $2 clamp:** cost $2.41 / $3.23 / $2.02, charged $2.00 each,
**$1.66 absorbed across the three**, and the clamp pulled two runs' turn
budgets *below the role's own 25* (25 and 19 granted against maxTurns 30)
— the researcher's cost history wants to quote ~$5 and `MAX_CEILING_USD`
holds it at $2. That clamp is D-016's runaway guard, deliberately global,
so raising it is a real tradeoff and Brian's call — surfaced, not taken.
The three quality passes are the gate; the ceiling is a separate decision
the runs have now earned.

## D-126 — 2026-08-08 — The third death gets a capture, and an install overwrites a shipped role

**The event.** Minutes after P1 pushed, Brian hired an architect and "the
app froze". Diagnosed from outside the tree before touching anything:
`:4600` refused the connection while `:5173` served 200 in 3 ms — the API
process was dead and vite alive, so the "freeze" was a living page talking
to a dead world. The third unobserved server death (D-118 holds the first
two). No traceback exists for any of them, because nothing kept the
terminal's contents — the exact gap D-118 named as the next input.

**What the disk then said.** `roles/architect.md` was not P1's file. At
20:56:02 the library had installed `role:architect` from wshobson/agents
(`plugins/ship-mate/agents/architect.md`; provenance in `installed.json`):
Brian's running server booted before P1 existed, so its hire list carried
no architect — he found one on the shelf, and the install landed on the
same filename and **silently overwrote the shipped role**. The community
file is written for another framework entirely (it reads
`orchestrator-output.md`; `model: inherit`; no `tools:`), and the starter
suite named the breach exactly — "architect has no way to write RESULT.md:
(none)" — D-041's write-capability guard doing its job against a file it
was never written about. Restored by checkout; the community version stays
reinstallable from the catalog, nothing lost.

**What was built** (`9d95110`). The dev script now runs the same
`tsx watch` through `dev-logged.mjs`: identical console, plus
`.agentlings/server.log` holding stdout, stderr, starts, forwarded
signals, and a stamped exit line with the code. Rotation at 5 MB, one
generation. Proved end to end rather than by unit-testing the plumbing
apart: a spawn test runs the wrapper over a synthetic entry that prints
to stderr and exits 7, and asserts the log holds both and the wrapper
repeats the code. Post-commit mutation — the exit line removed — killed
exactly that test. Two env seams (`AGENTLINGS_DEV_ENTRY`,
`AGENTLINGS_LOG_DIR`) exist only for the test.

**Open, recorded rather than fixed tonight, each on the surgical rule:**

- **The deaths' cause.** Unobservable retroactively; the capture turns the
  next one into a traceback. Until one is caught armed, the Adobe-node
  lesson stands — no pattern-matched suspects, and the coincidence of this
  death with an `npm install` under the running server stays a suspicion,
  not a finding.
- **Install-by-name overwrites a shipped role.** D-111 met this shape for
  packs and refused the arrival; roles took the other branch and replaced
  the resident. Refuse-or-rename at the collision is the candidate fix.
- **A third-party role's `model:` reaches the executor unsanitized** —
  `inherit` is not a model id; harmless until such a role runs a session,
  and a candidate for the install preview's warning list.

## D-131 — 2026-08-09 — The analyst upgrade: a kept script, an SVG chart, and an inert display already built

EXPANSION P4, the smallest pack, and smaller still than planned: the engine
seam it named — "SVG preview in the outputs panel, served inert" — turned
out to **already exist**. `.svg` was mapped to `image/svg+xml` in
`CONTENT_TYPES`, and `previewFile` routes any `image/*` type to a `native`
preview the panel renders through an `<img>`. An SVG loaded via `<img>` runs
no script and fetches no external resource — the standard safe-display
technique — and `opensInBrowser` stays PDF-only, so the bytes route serves a
`.svg` attachment-disposition and a direct navigation downloads it rather
than executing it (a top-level SVG navigation *does* run scripts; an `<img>`
does not). Both halves of the security property were latent and untested.

So the pack was mostly the skill, and two tests that make the implicit
property **explicit and load-bearing** (`d31398d`):

- **`data-analysis`**, the fourteenth ability: compute in a script the
  sandbox keeps (`analysis.mjs`), never in the head; cite every figure to
  its column, row range and file; draw the result as hand-authored SVG —
  `<rect>` bars, `<line>` axes — with no chart library (`exceljs` cannot
  draw one), no `<script>`, no external URLs, at the sandbox root; read the
  numbers back and confirm the parts sum.
- **The analyst gained `write`**, the scribe precedent exactly (D-128): a
  role authoring a Node script and an SVG needs a real file, not a `cat >`
  heredoc on six Haiku turns. Its `write`-or-`bash` starter check was
  already green either way, so the tool is the enabling fix, not a
  correctness one. Model and turn cap unchanged — Haiku, 6 turns — on the
  measure-first rule: "ran out of turns" has not meant "needed more turns"
  here, so the first real analysis job is what argues, not a guess (D-015,
  D-025). A chart glyph so an `.svg` is findable in the file rail.

Evidence: 1,392 + 140 green on the first run, the reach canary held with a
new skill doc in the corpus (data-analysis's words did not tip the
spreadsheet sentence off the analyst), typecheck clean. Two post-commit
mutations, both killed: letting a `.svg` open inline in the browser killed
the never-open-itself test; giving `.svg` a non-image content-type killed
both the shown-as-image preview test and the content-type assertion.

Not yet run live: the first real analysis job — a CSV or workbook with a
chart worth drawing — is the evidence gate, and the one number to watch is
whether six Haiku turns reach a script, a chart and a cited report or get
cut. The database row stays §15-blocked on a read-only credential existing;
this pack sharpens the file-and-record path the analyst already has.

**Amendment (2026-08-09 late — the gate closed on a seeded CSV; every
promise audited from outside).** Job `64dbcd1b` (home-chores, the level's
first analyst hire `a6-1dhs`; promoted). The fixture was deliberate: a
30-row July expenses CSV seeded with four traps — an exact duplicate, a
decimal-slip outlier, a missing amount, a blank line, plus mixed category
casing — with the correct sums computed independently before the run.

**All four traps handled, cited to exact file lines** (13/19/23, each
verified): the outlier flagged and quantified ("100× too high, distorts
groceries to 77.8%" — 5682.15/7305.89 is 77.77%), the duplicate caught,
the missing amount excluded *and said so*, the casing folded. Every
category total and the $7,305.89 grand total matched the audit's reference
to the cent — and **the kept script, re-run outside the sandbox,
reproduced every figure**, the pack's whole thesis proven in the strongest
form. Nuance kept honest: the script's own anomaly heuristic (`> $500`)
false-positives rent and has no duplicate check — the *report* corrected
both, so totals are script-backed and the flags were judgment, and the
judgment was right. The SVG (a pie — a fair answer to "where did the money
go", though the skill suggests bars) is inert as demanded — no `<script>`,
no external refs — its geometry trig-verified (the 77.8% slice spans
280.0° exactly), and **Brian confirmed the review drew it**: the
already-built `<img>` seam's first live outing. File-name nit: the script
landed as `analyze.js`, not the skill's `analysis.mjs` — it ran as ESM
only because the repo root's `"type": "module"` is inherited through
`.agentlings/`, which is precisely the fragility the `.mjs` spelling
exists to avoid.

**The six-turn question dissolved rather than answered**: with two
class rows the money leash funds the run (D-067's soft cap — the same
mechanism D-130's amendment verified), so this run was allowed 33 and
needed **7 — one more than the role's standing guess**, meaning a firm 6
would have cut it and the funded leash made the guess safe. Quote 10.4c,
cost 13.5c, charged 10.4c — the class's first D-012 bound, 3.1c absorbed.
The audit's own 26c prediction was wrong the instructive way: it pooled
the two bootcamp rows that ran under the xlsx *recipe*, and `quoteClass`
splits recipe-keyed rows out of the role's history by design — the quote
answers "have we done *this* before", per its own comment.

**The run before it earned its nickel**: first attempt `a9d504f1` went
out with no attachment (Brian pasted the sentence, nothing else) and the
analyst failed honestly in 4 turns — "I don't see an expenses file in the
working directory" — 5.3c absorbed, nothing invented. Two desk gaps
observed, recorded not built: a sentence naming "the attached X" queues
with zero attachments (D-087's doomed-queue shape; an arrest candidate),
and the gate again began with a hire because the analyst existed only on
closed bootcamp — the researcher gate's noOneHasRole lesson, caught by
probe this time before it cost anything. Close-out control case for
D-130's recorded seam: RESULT.md at 1,216 chars sits under the 1,500-char
slice and this PENDING.md is *accurate* — data-quality follow-ups, no
phantom truncation.

## D-130 — 2026-08-09 — A role may raise its own ceiling: the per-class knob the researcher earned

Brian's decision after P3's gate, from three options (leave it, raise the
global clamp, or a per-role knob): **the knob** — the surgical fix that
matches the trio P3 was already building.

The measured case D-129's second amendment laid out: all three researcher
gate runs bound on `MAX_CEILING_USD` ($2), the class's own cost history
wanting ~$5, and the clamp pulling two runs' turn budgets below the role's
own 30. That clamp is D-016's runaway guard and is deliberately global, so
raising it for everyone would loosen the guard for mason and scribe too —
a freak run of theirs could then quote $4 before anything caught it.

What shipped (`78a26d8`): an optional `maxCostUsd:` in role frontmatter,
the third of P3's per-role trio after `maxTurns` and `timeoutMinutes` and
the same trusted-but-bounded shape. `roleCeilingUsd(roleMax, envMax)`
resolves it: a role's value applies only when set, clamped to
`ROLE_CEILING_HARD_MAX_USD` ($10) so a typo of `maxCostUsd: 400` cannot
uncap spending, and an explicit `AGENTLINGS_MAX_COST_USD` **still wins
outright** — an env spending limit is how a user gets a hard cap back, and
a role's wish for more can never cross it. `quoteFor` already took
`maxCeilingUsd`; the seam only had to feed it. `researcher.md` carries
`maxCostUsd: 4`, so its own evidence (mean × 2 ≈ $5, clamped to its $4
ceiling) now sets the quote instead of the $2 global floor.

Two mutations, two exact kills: the env-limit precedence removed (role
value returned even when a lower env limit is set) killed the
env-wins test; the hard clamp dropped (raw role value trusted) killed the
runaway-typo test. 1,390 + 139 green, typecheck clean.

**Not yet fired live** — no researcher run has been quoted under the new
ceiling yet; the next real question is the proof, and the expected shape
is a quote near $4 with a turn budget no longer clamped below 30. The
global `MAX_CEILING_USD` is untouched, so every other class is exactly as
it was.

**Amendment (2026-08-09 late — the knob fired live; gate closed).** Job
`1f91f4a3` (home-chores, Bea, the AI data-centre electricity question;
promoted). The desk quote was verified from outside before Start — the plan
route answered "About $2.55 — from 3 jobs like it" with `ceilingUsd` 4, the
class's own evidence (mean ×2 ≈ $5.10) clamped to the role's $4 exactly as
shipped. (Same probe, same sentence, on hq and training-ground: role matched
`researcher` but `noOneHasRole` — the desk fell back to Pip-the-worker at a
$2/50c quote, G5's a-role-nobody-holds rule doing its job; Brian hit this
first by queueing on the wrong level, and the card could say it louder.)
The ledger row is the proof: `quotedUsd` 4 against the prior rows' 2/2/2,
and `priceUsd` = `costUsd` = **$3.09** — the first researcher run charged
what it really cost, $0 absorbed, where the three gate runs had absorbed
$1.66 between them.

The turn budget came back **39, not 30 — and that is the design, not a
fault**: `turnsForBudget` funds `floor(ceiling / rate)` at the class's own
rate — `costPerTurn` = Σ(cost − close-out) / Σ(turnsAllowed) = $7.4596/74
= 10.08c/turn, so floor(4/0.1008) = 39 — and a role's `maxTurns` is the
soft cap by D-067 (a standing guess about a trade, outranked by a budget
computed for the work in front of it), `TURN_CEILING` 40 the hard one.
D-129's starvation (25, then 19) is gone; the run used the whole leash (53
tool calls, `lastTool: Edit`) and delivered whole, banking 8 recallable
passages (0/1/4 on the prior runs).

The brief ran the skill whole: verdict first; source+date on every figure;
disagreements tabled and left standing — the 2× China spread promoted to
the headline reason the consensus 950 TWh is "more likely low than high",
the IEA-vs-EPRI US tension declared irreconcilable from published material
rather than averaged; its own arithmetic labelled as such. Citations
re-audited from outside through `/internal/fetch`: IEA Key Questions 6/6
claimed figures present in the page, Goldman 5/5, Carbon Brief 4/4, WRI
4/4 — and EPRI's site answered **0 chars through the door, which the
brief's own weaknesses section had already declared** ("returned no
readable text… I have not read the primary document"). The Gaps section is
verified honest, and D-129's banked finding — JS-rendered primaries
unreadable app-side, the two-source rule the rescue — recurs as the norm.

One new seam, recorded not acted: `closeOutEvidence` hands the close-out
the first **1,500 chars** of RESULT.md (`claude.ts:600`). This 28K brief
was cut mid-word at exactly that boundary, and the Haiku close-out —
rightly obeying "say only what the evidence above supports" — wrote a
PENDING.md describing a run "truncated mid-analysis" whose every listed
item the RESULT.md on disk already satisfies. Harmless on a promoted job,
but PENDING.md is what a redo forwards (D-114), so a continuation would be
told to redo finished work. When touched: the excerpt should say it is an
excerpt, or carry head+tail. LESSON.md came back the sentinel `known` —
the dedup declining a repeat lesson, correct.

## D-132 — 2026-08-09 — The organizer pack: the sandbox boundary crossed by a reviewed, reversible manifest

EXPANSION P5, planned in plan mode and the first pack that touches a real
folder outside the sandbox. Brian's two decisions: the inventory a run sees
is **names, types, sizes and dates only** — no file contents ever leave the
disk, so §11's no-redaction gap never bites — and the organizing skill goes
on **`worker`**, no new price class.

**The boundary decision, which is the whole point.** Option 2 of three: the
model never touches the folder. The server walks it into a read-only
inventory (handed to the run in its brief, the way the repo listing is), the
run writes `MOVES.json` — `mkdir` and `move` ops, **never a delete or a
copy** — and **Approve replays it**, the server the only thing that moves a
file, only under the folder Brian picked, journaled so it reverses. Option 1
(stay manual) and option 3 (give the session a filesystem tool — refused; it
would formalize leaving the sandbox, §10) were not taken. SOTA is the
argument: agent reliability on real filesystem servers is ~45–58% (MCPMark),
and the best consumer organizer sorts on filenames only — a deterministic
replay of a reviewed manifest is safer *and* more capable than a live loop.

Built by replicating the outbox/pack convention (there is no shared
deliverable interface — a contract module, a stamp in `finish()`, a `Job`
field, a resolve branch, a review branch), across three commits:

- **`moves.ts` — the contract and the executor**, the one piece with no
  precedent to copy. `checkMoves` is the whole gate: every path relative and
  lexically incapable of escape (no `..`, no absolute, no drive letter), no
  two moves onto one destination, a cap, a reason for every refusal.
  `executeMoves` mirrors `executeOutbox` — skip already-done ops, per-op
  try/catch that never aborts the batch, **`move` refuses to overwrite**,
  never `unlink` — and **re-resolves each path under the root at execution
  time**, so the manifest is never trusted on its own word. `reverseMoves` is
  the undo: the journal walked back, files to→from, and the empty folders
  `mkdir` made removed only if still empty — a folder that gained a file is
  left whole, because reversing must never delete.
- **The reach and the wiring.** `organize.ts` walks a picked folder into the
  metadata inventory and tells the session the contract in its brief (D-031).
  The queue carries `organizeRoot`, `stampMoves` reads the manifest at the
  same seam as the outbox, and the resolve route gains the replay branch —
  re-checks the folder is there, `executeMoves` under the picked root (never a
  root the model could name), journals to `moves.jsonl`, records `movesRun`,
  and returns 400-and-reviewable on a partial so "Approve again" finishes the
  rest and moves nothing twice. A `reverse-moves` route is the undo. Intake
  detection under-fires like a channel (`wantsOrganize`), routes to `worker`,
  and the desk asks *which folder* through the native picker — the only source
  of an absolute path.
- **The skill and the review.** `organizing-folders` on worker; a `MovesCard`
  showing from→to rows, the plain-words count, the OneDrive-syncs caution, and
  an Undo button; Approve flips to "Approve & move N".

Evidence: the security core is 12 tests against a real temp dir — escape
refused both ways, no-overwrite, idempotent replay, exec-time re-check, and
the reverse round-tripping to the exact original layout — plus 6 reach tests
(the inventory proven to carry **no file contents**) and the web summary
helper. 1,410 + 142 green, the reach canary held with a new skill doc,
typecheck clean. Three post-commit mutations on the executor guards each
killed exactly their test: the exec-time escape guard removed (a `..`
manifest would execute), the no-overwrite check removed, the skip-done
idempotency removed.

Not yet run live, and the gate is deliberately cautious: **first against a
copy of a real messy folder**, the proposal measured against Brian's own
judgement, and the journal proven to reverse cleanly before any real folder
is ever named. Deliberately out of scope: delete (never), copy, multiple
roots in one job, and a standing/scheduled reorganization (the recurring
shape can come later, as sends did). This partially answers §15's
"filesystem beyond the sandbox" row — but as a reviewed-and-replayed
manifest, not a live tool, which is the row's own condition.

**Amendment, 2026-08-09 night — the gate is closed, proven live end to end
on real data.** Brian pointed it at a real folder (property and company
documents — his own disposable test folder, but real files, inside OneDrive)
and ran the whole round-trip. First job (17-op plan) discarded on the
copy-first caution; second job `42d39856` (14-op plan) approved: the server
replayed it, **12 files relocated into two new subfolders, 0 failures**,
journaled to `moves.jsonl`. Verified against the actual disk, not the status:
every move landed, every source gone. **The safety model held under the
first real run** — the session's brief never contained the absolute path
(one grep scare turned out to be the project's own `TRAINING.md` naming a
same-named folder from a past session; the `.session.json` was clean), so
the model wrote only `MOVES.json` and the *server* did every move. Then
**Undo**: reverseMoves replayed the journal backwards — **12/12 files
restored to their exact places, both created folders removed as empty**,
`movesRun.done` 14 → 0, byte-for-byte the original layout. Two journal
batches, both `failed=0`.

Two things running it taught, each fixed before the success (found the way
this project finds things — by use, not by tests): the intake preview showed
the matcher's role (**scribe**) while the job would run as worker, so the
preview now forces worker on an organize sentence (`91d27ff`); and the
repo-target clarify question rendered as a **text box** for the one input
that can only be picked, so an organize sentence now asks no clarify
questions and pressing Start opens the native Select Folder dialog, with the
detector narrowed to a tidying verb *beside a folder noun* so "clean up the
whole project" stays a coding job (`780e854`). The plan-mode caution — prove
the reversal before trusting it — is what made the first real run safe.

## D-133 — 2026-08-09 — The web-operator pack stays refused: no errand, no acting surface

EXPANSION P6 — the last pack, and the only one whose own plan built it "only
if Brian has a real recurring web errand." Asked directly, Brian chose to
**keep refusing** (the plan's recommended default), so P6 is not built, by
decision rather than by omission.

The reasoning, which is worth keeping because it is the whole project's
posture in one place:

- **No errand demanded it.** P6 opens a path to *acting* on real websites —
  filling forms, clicking submit/confirm on the user's own logged-in
  sessions. A capability like that is earned by a concrete use, not built
  speculatively; without a real recurring errand there is nothing to shape
  the `WEBPLAN` contract or the allowlist, and nothing to prove it against
  but a synthetic page.
- **The read case already measured weak** (D-035, D-053): the crew routes
  around the browser unaided, and forced onto it, it is cheap but fragile.
  An acting surface on top of that inherits the fragility (selector drift,
  auth walls, hour-scale flows collapsing to ~20% at the 2026 frontier).
- **The safety argument is D-034's, unchanged and quantified.** In-session
  acting stays refused outright (option 3). Even the reviewed
  replay-at-Approve shape (option 2) is a dual-use web-actuation engine, and
  the 2026 indirect-injection numbers (17.8% single-attempt success against
  unguarded GUI agents) are exactly why the model that read a page must never
  be the thing that acts on it. Building that engine with no legitimate,
  bounded errand behind it is the wrong default.

**The condition to reopen is explicit:** a concrete web errand Brian actually
repeats — "log into portal X and pull this month's statement", "fill the same
weekly form on site Y". The moment one exists, P6's option 2 is the shape to
build (WEBPLAN drafted by a read-only run, replayed at Approve, per-step
`expect`-halts, allowlisted to that one site, screenshots as the audit),
and the errand is its evidence gate. Until then, refusing is the answer, and
`AGENTLING.md` §15's "Click, type, fill a form" row stays open with this
entry as its reason.

**This closes the expansion (EXPANSION.md).** P1–P5 are built and, for P1–P3,
proven live; P6 is decided-not-built. The file's remaining rows are the two
content-toggle follow-ups (a bounded content peek for the organizer, an
outbox attachment field) and the live evidence gates that wait on Brian's own
runs — none of them a new pack.

## D-134 — 2026-08-09 — Start arrests a sentence leaning on an attachment nothing carries

The fourth arrest, built the evening its evidence arrived. The analyst
gate's first attempt (D-131's amendment) queued "Total the attached
expenses…" with nothing attached — Brian pasted the sentence and pressed
Start, nothing else — and the run's only possible delivery was the
question back: 4 turns, 5.3c, absorbed. The desk had held every fact the
refusal needed the whole time: the sentence claims an attachment, the
queue carries none, and a run has no other way to receive a file. Brian
ordered the arrest built after seeing the failed job's review offered
nothing to act on (that review-side texture stays recorded in D-131's
amendment, deliberately unbuilt).

`missingAttachment(text, attachedCount)` joins `askFacts.ts` beside the
D-087/D-091/D-101/D-124 walls: a word-boundary match on the **claiming
forms only** — "attached", "attachment(s)" — never the bare verb, because
"attach a summary to it" instructs the run about its own output rather
than claiming a file rides along ("detached"/"unattached" cannot reach
the `\b` either). The arrest seam itself widened one notch: it used to
exist only for send-shaped plans (a channelAsk or a confirmed mention);
the attachment reason now computes for **any** sentence, with the
send-only walls still gated exactly as before. The two-press contract is
unchanged — first press relabels the button "Queue anyway — nothing
attached", the second queues regardless, because the sentence itself may
carry the content ("summarise the attached: <pasted text>").

Evidence: five new unit tests, suites green (server 1,410 + web 147),
typecheck clean. **The call site was proven live** rather than by a
component test (WorkBar has no test file — the wiring's only automated
gap, stated): the exact doomed sentence typed into the running app, one
Start press, and the armed label read back off the DOM — "Queue anyway —
nothing attached", nothing queued, and the armed state retired by the
next keystroke's re-plan as D-087 built it. Post-commit mutations, two
for two: the detector gutted (return false) killed exactly the 5.3c-wall
test; the regex loosened to admit the bare verb killed exactly the
never-claims test.

## D-135 — 2026-08-09 — The failed modal's reply reads as the action it is

The texture D-131's amendment recorded and D-134 left deliberately
unbuilt, built the same evening once Brian asked. On a failed job the
review's only verdict-free affordances are the reply and Close — but the
reply's placeholder, "Or tell them what to do differently…", was written
to trail the Approve/Discard pair, which a failed job deliberately does
not render (nothing was delivered; there is no verdict to give). The
"Or …" clause dangling after nothing read as decoration, and the modal's
first real reviewer took the whole thing for close-only — the
observation that opened the evening's desk work.

One conditional and three CSS rules: `status === 'failed'` swaps the
placeholder to the standalone **"Answer them…"** (aria "Answer the
agentling") and the clarify span gains `answer`, lifting the input in
btn-more's exact amber — #56412a border, #ffb86c placeholder — so it
invites without alarming and adds no new palette entries. Every other
status keeps the trailing wording untouched. Deliberately NOT added: a
"They asked:" quote beside the input (the failure's question already
renders at the body top — for the proof job twice, since `error` and
`summary` held the same text — and a third copy clarifies nothing) and a
reply cost line (the continuation is quoted where it is charged; a
number shown here would be a guess, D-097's mismatch invited back).

Verified live on the real jobs, both directions: the failed `a9d504f1`'s
modal read back badge `failed`, class `rv-clarify answer`, placeholder
"Answer them…", computed colours the amber pair exactly; the promoted
`f3124c4f`'s modal kept `rv-clarify`, the "Or …" wording and the grey
placeholder. 147 web tests green (none cover this panel — the live
read-back is the proof, D-134's precedent), typecheck clean.

## D-136 — 2026-08-10 — The failed card says what its door opens on, and every review carries its ask

Two review-surface honesty fixes, ordered together just past midnight —
the last crumb of the failed-modal diagnosis plus a traceability ask of
Brian's own.

**The button stops overselling.** The terminal card's one control read
`REVIEW` for every finished status, and a failed job's door opens on an
error and an answer box — no verdict to give (D-135's ground). The label
is now status-aware: `failed` → **SEE WHAT HAPPENED**; done and partial
keep REVIEW, their branch the old literal unchanged.

**Every review opens with `the ask`.** A collapsed `<details>` at the
body's top holds the job's prompt **verbatim**, plus the desk
clarifications that rode the queue when there are any (the calendar
shape: "Who's invited? …", "What's the event called? …") — the trace
from result back to what was actually asked. Continuation prompts arrive
stitched ("You said… The user replied…") and display whole with their
line breaks (`pre-wrap`), which is the point, and why it collapses: the
`<details>` idiom is D-125's, from the mermaid drawings. Deliberately
verbatim and unabridged — an ask paraphrased is D-027's shortcut grown
back at the display layer.

Verified live on both shapes, read back off the DOM: the failed
`a9d504f1`'s modal (badge failed, summary "the ask", the full sentence,
empty clarifications, its terminal card reading SEE WHAT HAPPENED) and
the promoted `f3124c4f`'s (the invite sentence plus both clarification
rows exactly as the desk collected them). 147 web tests green, typecheck
clean; neither panel has component tests, so the DOM read-back is the
proof — D-134/D-135's precedent, third use.

## D-137 — 2026-08-10 — The select screen wears switch-palace blocks

Brian's ask, mockup-first per his standing preference: Super Mario
World's notification grammar on the level cards — a row of blocks,
dashed outline when quiet, bevelled `!` when live. The mockup went up
first and all three recommendations were taken: **four blocks** (working
yellow, to-review red, scheduled green, new-results blue — SMW's own
four switch-palace colors), a **count badge on red alone** and only past
one (29 waiting and 1 are different errands; the rest answer on hover),
and the **dashed empties kept**, so every card shows the same four
positions and position alone says which signal fired.

The server half: `levelInfo` gains `toReview` (jobs whose outcome is
'to review'), `schedules` (unpaused, off `readSchedules`) and `finished`
— the inbox-capped newest finished ids. `deliveredIds` shares
`finishedNewest` with `deliveriesFor`, and the inbox's default cap
became the named `DELIVERIES_SHOWN` both read, so the two populations
cannot drift. Unread deliberately stays the browser's business: the
select screen subtracts the inbox's own seen set (`readSeen`, now
exported) from that same population — the inbox dot and the blue block
agree by construction, and no directory is read for ids.

Verified live on all three real cards, DOM read against the API: hq
`!29` red + green + blue; home-chores `!2` red + blue; training-ground
`!17` red + green (T5's schedule) + blue. **The seen-subtraction proved
itself unprompted**: the pane profile had opened exactly one review
earlier in the session, and its blue block read 11 new where the cap
holds 12. Post-commit mutation: the finished filter dropped from
`finishedNewest` killed both consumers' tests at once — the inbox's
leaves-out-unfinished and the new one-population-no-drift — exactly the
shared seam doing its job. 1,412 + 147 green, typecheck clean. One
grammar catch from reading the live title: "1 schedule firing on their
own" became singular-aware wording.

## D-138 — 2026-08-10 — A cut is a boundary, not an annulment: More time, the clock said out loud, and walls that can learn

Brian's review after the first authoring casualty: "Author a level pack"
(designer, hq) died at the flat 10-minute wall with an **empty sandbox**
and an **unknown cost** — the request annulled, ten minutes lost, and
nothing learned by anyone. The review named the asymmetry between the
three cut axes: turns are budgeted from the class's own ledger and a
turn-cut ends in a button ("More turns · charged only if it finishes");
money never kills mid-run — it shortens the leash up front; **time was a
flat constant whose cut was terminal**, filed `costUnknown` (the
least-learning failure mode — the killed process reports no meter), with
a recovery route that answered "that run did not stop for want of
turns". And beneath it the self-sealing prior: a class walled below what
its work needs never completes, so it never produces the evidence that
would re-wall it — G5's class tax, paid forever. This was the
designer's **second** wall casualty; D-128's amendment had already
recorded the deck run wanting headroom.

Built — options A+B+C of four, Brian's pick:

- **The stamp, and a meter no longer lost.** The timeout kill now rejects
  a `SessionFailure` carrying the streamed partials plus `timedOut` —
  it used to throw a bare `Error`, discarding the turns and tool calls
  the stream had already counted.
- **More time (B).** The continue and continue-quote routes accept
  `timedOut` beside `outOfTurns` — the refusal now reads "that run was
  not cut short by turns or the clock" — and the review modal's carry-on
  reads both, labelling itself **More time** for a pure clock-cut. Same
  sandbox, its own quote, charged only if it finishes. The D-016 posture
  is kept deliberately: budgets stay trusted-but-bounded and the human
  grants more; no auto-raise, no silent retry.
- **The clock said out loud (C).** The session brief names the minutes
  beside the turns — "You have N turns and about M minutes of clock.
  When either runs out…" — because a run never told about a wall cannot
  ration against it. The authoring brief gains **Write it as you go**: a
  small valid pack on disk early, grown region by region, so a cut
  delivers what is written instead of nothing.
- **The designer's own wall (A).** `timeoutMinutes: 25`, the
  researcher's D-129 precedent, justified by two recorded casualties.

**Deferred by decision — D, time funded like turns.** Ledger rows carry
no `durationMs` today, so no amount of history can tune a wall; the
follow-up adds the field and sets each class's wall from its own
observed durations (clamped 10–30), flat 10 only for history-less
classes. B is D's bootstrap: first run cut → More time → a completion
row finally exists → the wall has something to learn from.

Evidence: 1,414 + 147 green (two new brief tests), typecheck clean;
post-commit mutation on the brief line (minutes clause dropped) killed
exactly the names-the-clock test; the live server reloaded and answered.
Honestly unproven: the stamp, the widened gate and the More-time button
have no automated coverage (a child-process closure, untested routes, no
component tests) and no live time-cut exists yet to read them back — the
first real one is their gate, and A+C exist precisely to make it rare.
Old time-cut rows, today's casualty included, predate the stamp and stay
terminal: backfilling by parsing our own error string was considered and
skipped — one dead job is cheaper re-run than a string-match seam.

## D-139 — 2026-08-10 — An answered run stops asking: continuations stamp their parent

Brian answered the timed-out authoring job through the reply box — "Keep
going" — and the failed card kept sitting in the feed with its button, as
if nothing had happened. His words named the family: "same issue as
before when interrupted tasks get interacted with." He was right that it
is a family: both continuation doors — the reply route and More
turns/More time — stamped the **child** (`continues: previous.id`) and
never the parent, so the parent's surfaces kept offering what had
already been done: the feed card its button, the modal its reply box,
and carry-on a **second continuation for a second charge** against work
someone was already doing.

The fix is one field and its discipline. `Job.continuedBy` is set by
`markContinued` in both routes; the failed card retires from the feed
once answered (the continuation's own events follow right there);
`canCarryOn` refuses a job already continued; and the failed modal
replaces the reply box with "answered — a follow-up run is carrying it
on". Done and partial jobs deliberately keep their verdict buttons — a
continuation does not judge the files the original still holds.

**The backfill is the load-bearing half.** Stamping at reply time would
have shipped inert against the exact card complained about (the
hard-won rule: a fix must reach the data written before it). The child's
`continues` identifies the parent **exactly**, so `restore()` heals
history on boot — identification, never guessing — and the first tsx
reload proved it on the real store: three answered authoring parents
stamped in hq's jobs.json, Brian's "Keep going" case (`7f95be04` →
`690dbc0b`) among them. Where one parent has several children the first
wins; any child proves answered.

Evidence: 1,416 + 147 green (two new queue tests: the stamp's round
trip, and restore backfilling a pre-field parent); post-commit mutation
removed the backfill loop and killed exactly the backfill test. The
browser pane refused to boot past the title for the pixels check (the
recorded flake) — the answered-modal wording rides the proven field and
Brian's next open of an answered failure is its ten-second look.

## D-140 — 2026-08-10 — The capture's first catch: the "unexplained deaths" were the watcher, and serving stops watching

The authoring re-run (`97a25071`, the Iliad pack) died 190 seconds in as
"interrupted — the app restarted while this was running", and the capture
D-126 built finally had a body to examine. Its last line names the killer
to the millisecond: `9:12:26 [tsx] change in ./src/queue.ts —
Restarting...` — exactly the job's `finishedAt`. Nobody edited queue.ts
at 09:12; its last touch was a git checkout at 09:05:42. The repo lives
inside OneDrive, which echoes file operations minutes after the fact;
tsx watch heard the echo, restarted the server, and the restart killed
the paid session.

The same log laid the whole morning out: a dozen restarts between 08:50
and 09:05, one per source edit of this session's builds — any run live
during any of them would have died identically. D-118's two
deaths-with-sessions-live and D-126's third now have a shape that fits
every fact: not crashes at all, but **watch-mode doing its job at the
worst moment**, with OneDrive adding delayed echoes that strike even
when nobody is editing. Stated as shape, not proof, for the old deaths —
no log existed then; the 09:12 catch is proven.

The fix separates two modes that had been living in one command:
`dev-logged.mjs` takes `--no-watch` (same logger, same server, plain tsx
entry), `npm run serve` exists at both roots, and PROJECT.md's commands
now say it plainly — **drive the app with `serve`, develop with `dev`**.
Under serve, a session outlives everything except Ctrl+C. The capture
stays armed in both modes; the spawn test still guards the logging, and
the log's own `entry=` start stamp shows which mode is running.

Also settled by the dead run on its way down: D-138's brief was verified
live mid-flight — "You have 23 turns and about 25 minutes of clock",
23 funded turns over the role's standing 20 (the soft cap again), and
the write-as-you-go section riding the prompt. The wall was not the
killer and staged writes never got their test; the third attempt, under
`serve`, is the gate for both.

**Amendment (2026-08-10 afternoon — the partial card joins the
retirement).** The entry above deliberately kept partial cards visible
("a continuation does not judge the files the original still holds") and
the first live carry-on proved that scoping wrong for the feed: Brian
pressed More turns on the authored pack's partial (`0ca2fb4d` →
`3b67df24`, the stamp's first live firing) and the card kept soliciting
REVIEW from the terminal. His rule is the better one: **a task decided
on is not interacted with from the feed.** The partial card now retires
on `continuedBy` exactly as the failed card does; the record line stays,
and the verdict remains reachable where it belongs — the inbox row and
the panel, which keep Approve/Discard for the files the original still
holds. Verified live on the exact reported state: the 09:34 partial's
card gone from the feed, the continuation's events running below it.

## D-141 — 2026-08-10 — One Approve, one door: the install that refused itself

The Iliad chain ended with Brian's Approve refused — "a pack is already
installed as gates-of-troy" — for a pack he had never approved. The
audit found no unapproved install anywhere: **the installer was his own
first Approve, tripping over itself.** The session had delivered the
pack through two doors at once — `PACK.json` at the sandbox root (the
draft door, as briefed) and a second copy written into its repo clone at
`web/public/packs/gates-of-troy/` (plus three scratch measuring scripts),
because hq's `repoPath` rode the authoring job and the clone showed it
where packs live; its RESULT.md said so plainly ("installed at
repo/web/public/packs/…"). Approve #1 (14:31:00) ran the promote's first
door — `installPack` wrote the real folder — then its second door
failed: `git apply` refused the diff whose pack.json now existed on
disk, the route returned "patch did not apply", and the job stayed
reviewable with the install silently done. Approve #2 hit the third
seam: the modal prefills and always sends `packSlug`, the route treated
any sent slug as a rename, and the pre-check found the slug taken — by
approve #1. (The folder's 14:33 mtime matches OneDrive's echo, D-140's
signature, not a second write.)

Built, Brian's pick (A+B):
- **Authoring drops the repo.** `queueSentence` gains `noRepo` and the
  author-pack route uses it: the pack is a sandbox deliverable and the
  clone was pure cost — the chain paid five clones of the project for
  nothing but the collision. No repo, no diff, no second door.
- **An unchanged slug is not a rename.** Only a slug that differs from
  the draft's own takes the early collision check; a retry now flows
  into `installPack`, whose already-identical tolerance was built for
  exactly this ("a second Approve after a partly-failed one is safe").

**The stuck job resolves by Discard** — the installed pack is
byte-identical to the final draft ("The Horse at the Gates", 177 ops,
its provenance clean), and the diff holds only the scratch scripts;
nothing of value is lost and the world is already on the palette.

**Recorded, not built — the pricing seam.** Every leg of the chain was
cut, "charged only if it finishes" priced each at $0, and promote does
not re-price: a finished pack cost the platform $9.29 and the user
nothing. A D-012-compatible fix exists — price a cut leg up to its quote
when its chain's end promotes — and it waits for a decision, not for
evidence: the evidence is this chain.

What the long run taught, for the record: the More-turns loop works as a
pacing valve (five legs, ~22 turns each, every leg cut at allowed+1, the
pack growing 3540→6071 diff-lines to 177 ops with measured luminance
separations quoted, one Δ4.7 honestly flagged "fails by design");
D-138 held throughout (staged writes from leg one, the wall never again
the binder); and the funded leash, not the clock, is what bounds
iterate-until-done work.

**Second amendment (2026-08-10 — the last hole in the same rule).** Brian
discarded the Iliad chain's final leg from its terminal card and the
REVIEW button stayed. The path: the leg's feed event was failed-typed
("agent session failed (error_max_turns)"), harvest upgraded the job to
partial, the discard then made it `discarded` — and the plain-failed
card render checked `continuedBy` but never re-checked the status, a
gate the done-card has always had and this branch never needed while
failed was terminal. The card now requires `status === 'failed'`: it
renders only while the status still asks. The event log died with the
D-141 server reload before a pixel check was possible — the conditional
is its own proof, and the next resolved failure is its live gate. The
rule, complete at last: **a card solicits while a decision is open, and
not one moment after — whatever door closed it.**

## D-142 — 2026-08-10 — The plate lands: a raster behind the world, and the basin that proved it

Brian read `PRERENDER.md`'s deep dive — D-108's deferred raster seam mapped
against what DKC, the fixed-camera games and HD-2D actually did — and
greenlit v1 as recommended: one raster plate per pack, in-Pixi, on D-108's
quantized-128 finish, production Route 0 first (any provenance-recorded
image through `pack:quantize`), the render door's screenshot mode next.
Built the same session.

**The format grew one field and the interpreter grew none.**
`backdrop.plates` names files beside `pack.json`, drawn beneath everything —
plate, then backdrop ops, then scrim, then foreground. Not an op,
deliberately: `Surface` has three primitives, and D-109's gradient argument
applies to a raster twice over — every implementation would have to grow an
image method. Instead each consumer composites the plate *before* walking
`drawScene`: the world as a linear-sampled sprite under the scenery, the
level card via `drawImage`, the CLI renderer via a pixel blit whose 2×
branch averages each 2×2 block — the downsample D-108 blessed — with a test
whose 0/100/100/200 block would catch a decimation pretending.

**One plate, and why the field is still an array.** Depth-layered plates
need no migration later, but v1 refuses more than one: `decodePng`
composites alpha onto a background because `Raster` is opaque RGB, so a
stacked translucent plate cannot even be validated honestly, let alone
blitted. Stacking waits for tooling that keeps alpha, and the refusal says
so.

**The checker splits along what each half can see.** Shape rules in
`validateLevelPack`, because a draft can be judged by them: a plain `.png`
name — joined to the pack folder, so a path boundary exactly like the slug —
one plate, and `rim` required the moment plates appear, D-108's "mandatory"
finally a checked fact. Raster rules in `server/plates`, run by `scanPacks`
and `pack:check`, because they need the folder: file present, decodes,
sized to the pack's *own* geometry (1000×viewH or 2000×2·viewH — D-108's
450 generalised, since a stretched plate moves the ground line out from
under the crew), at most 128 colours, and separation measured at the seven
standing places on the plate itself — warnings, not errors, because they
describe the floor the rim starts from, not the finished picture. And
drafts refuse plates with one message on both sides, contract and CLI: a
`PACK.json` is one JSON file, a plate is an image beside it, and an Approve
that copies only the JSON would install a pack the loader then rejects —
after the money was spent. D-110's no-invisible-walls rule, applied before
this wall existed.

**The Amber Basin proved the path end to end.** A dusk-basin plate painted
in canvas 2D and rendered by the same headless Edge the render door drives —
with one lesson worth keeping: *paint arch openings, never punch them*;
`destination-out` on a single canvas reaches the page, which the first
render showed as white blobs and a 14.7 separation at x 80 that the repaint
lifted to 20.2. 45,696 colours quantized to 128 at mean error 2.78/255;
`pack:check` clean; `pack:render` composited plate under scrim under ops
with worst separation 20.8, every gown reading. Live, against the running
dev server: the pack installed by folder drop, `POST /api/levels` accepted
`amber-basin` through `themeExists` walking the new checks, the select
screen drew Basin Proof's card with the plate composited into the
thumbnail, and the level opened with Pip and Dot patrolling crisp in front
of the picture — the D-108 split visible on screen, DB32 crew over a
128-colour render. 1437 + 147 green, typecheck clean. Three mutations,
post-commit, each killed by exactly its test: the colour budget disabled
(the budget test), `scanPacks` skipping `checkPlates` (the missing-plate
rejection), the rim requirement dropped (the rim test).

**Deliberately not built**, with `PRERENDER.md` §5 as the record: the
smooth finish (would amend D-108), parallax and the occlusion strip (v2 —
the array field means neither needs a migration), and the render door's
screenshot mode — the next step, and the one that turns plate authoring
into a designer job inside the existing PACK.json → review → Approve
contract.

## D-143 — 2026-08-10 — The door learns to paint: render_plate, and the gate the loop built

Brian said go on D-142's named next step, and the studio door from D-128
grew the plate half of PRERENDER.md's Route 1: a session can now render a
3D backdrop and deliver it as a world, end to end, without a single new
install.

**The tool proves its own output.** `render_plate` takes one self-contained
HTML page, renders it at 2000×900 in the same headless Edge that prints
PDFs, waits for `document.title === 'ready'` (a page that never says so is
refused *by name*, not screenshotted early), then makes the screenshot a
legal backdrop before anyone asks: quantized into D-108's 128-colour budget
in the door itself, separation measured at the seven standing places, and
both carried in the receipt — `2000×900, 127 colours, worst crew separation
11.3 at x 240`. The numbers the pack checker will hold the plate to arrive
with the plate, which is D-011/D-021's rule made mechanical. One bug worth
the record: Playwright's `waitForFunction` takes options *third*; a timeout
planted in the second slot is silently no timeout at all, and only the live
test caught the wait running to the outer kill instead of its own.

**Three.js is vendored, and the offline rule keeps its shape.** The library
rides the server workspace (pinned, like playwright-core — never a root
dep, D-036), and the route serves exactly two paths from disk —
`/three.module.js` and the core file three's own module build imports as a
sibling — while every other URL still aborts. The exception is stated in
the catalog prose rather than discovered, and the live test proves both
halves at once: a scene whose page also fires an external fetch renders a
real WebGL picture while the listener counts zero hits. A flat screenshot
cannot pass that test — the colour floor would catch WebGL silently not
running.

**Drafts carry plates now, and D-142's wall came down the way it was
built.** `platesInDraftProblem` is deleted, not amended: harvest runs the
same `checkPlates` against the sandbox that the scan runs against a folder
(a missing or over-budget plate fails the draft at review, not at Approve),
the review's PackCard fetches the plate through the existing files route
and composites it into the preview — the world Approve would install, not
the world minus its picture — and `installPack` gained a `from`: plates are
re-checked at the moment of writing, copied *before* pack.json so the json
stays the commit point, and an identical re-Approve completes a
half-landed install instead of refusing (the outbox's own retry rule).
`plate-design` rides designer and teaches the contract: the import URL,
the ready title, the composition rules, and *read the PNG — the receipt
proves legibility, only your eye proves it reads*.

**The Ember Gate is the evidence, and the loop is the point.** Four takes
through the live door, each fault found by looking: take 1's camera stood
inside the scene with a sun forty percent of the frame tall; take 2 pulled
the lens back and found the sky washed pink; take 3 exposed why — the sky
gradient was 380 units tall and the visible window at that depth shows
barely a quarter of it, so the frame only ever saw the ramp's warm foot —
and take 4 sized the ramp to the window and separated the mesas into
depth-staggered masses. Receipts 11.5 → 12.7 → 11.5 → 11.3 worst
separation, 127-128 colours every time. The finished draft rode
`readPackDraft` → `installPack` out of a real sandbox into
`web/public/packs/ember-gate`, and level `gate-proof` opened on it live —
with the brief bar underneath reading "render backdrop plates", the
catalog line surfacing in the product's own copy. 1442 + 147 green,
typecheck clean. Three mutations, post-commit, each killed by exactly its
test: the vendored fulfill aborted (the three.js render test), harvest's
`checkPlates` skipped (the missing-plate draft test), the install's plate
copy dropped (both Approve tests).

**Deliberately not built:** multi-plate drafts (the one-plate rule stands
until the raster tooling keeps alpha), the Blender template (Route 2, the
quality ceiling, priced in PRERENDER.md §4), and any change to pricing —
designer keeps its earned class, exactly as the studio skills did (G5's
class tax is paid only where a class is new). The first *paid* designer run
through this door is the evidence gate left open, after the server restart
picks up the catalog and runner changes.

**Amendment, 2026-08-10 night — the gate is closed.** The first paid
designer run went through the whole road the same evening D-144 repaired
it: Brian pressed the 3D-backdrop button with his Odyssey description, and
job `cfa2a7a3` came back in ~17 minutes holding **The Wine-Dark Strait** —
a galley heeled under a backlit square sail, a sea-beast rearing in
near-silhouette to its right, one storm-break light source obeyed by every
form in the picture. Plate 2000×900 at exactly 128 colours; separation
iterated *by looking*, 10.5 → 15.9 → 13.6, quoted in RESULT.md exactly as
the role demands; `rim: stoneDark`; provenance naming the three.js render,
the primitives it was built from, and the public-domain theme. It kept
`plate.html` beside the PNG unprompted — the plate carries its own source.
The clock cut it with the ground strip still two placeholder rects, no
scrim and no ambient, and its RESULT says so under an "in progress" title:
write-as-you-go delivering exactly what was on disk, D-138's boundary
honestly worn. `pack:check` against the sandbox draft: clean, plate rules
included. What the run proved beyond the door itself: the plate-first
brief really does lead a paid session to render before composing, and the
see-your-work loop — render, read the PNG, fix what the eye finds — ran
whole with nobody watching. The review, and whether More Time finishes the
foreground, are Brian's.

## D-144 — 2026-08-10 — The Odyssey sentence: the desk points at the door, the door offers the plate

Brian restarted the server and typed the first real authoring sentence —
*"Build me a level inspired in The Odyssey, with a 3D backdrop of the sea
monster"* — at the HQ desk, and the desk planned it onto a worker at 53c.
Working as built: D-110 made world-authoring a button so a matcher designed
against no real phrasings could not misfire, and the phrasing it was
waiting for had finally arrived. Nothing ran and nothing was spent; what
the sentence exposed was that the road to the button had three stale
stretches, all older than the plates that made the request possible.

**The brief still described D-113's world.** `packBrief` taught the ops-only
pack — no `plates` in its skeleton, no `render_plate`, and a reference
section asserting the format "has no field for" a rendered painting, which
was true when written and false since D-142. It now teaches the plate in
the skeleton and in its own section (the tool, the vendored import URL, the
ready title, one-plate-and-rim, check and render still the gates), defers
technique to the `plate-design` skill riding the role, and — when the
button asks for a 3D backdrop — leads with it: *a pack without
`backdrop.plates` does not deliver this job, however good its ops are.*
One wall added in the same breath the door opened: **never embed the
reference image in a plate page** — `render_plate` would happily screenshot
a `data:` URI of someone else's picture, and a screenshot of their picture
is their picture with extra steps.

**The form demanded what it no longer needed.** "Pre-rendered" was D-113's
reference path — it *required* an upload because looking at a picture was
the only pre-rendered thing a session could do. The kinds are now
**Pixel / 3D backdrop**, the 3D pick saying plainly that the crew renders a
real scene as the plate behind the pixel frame, and the reference is its
own optional input for either kind, worked from and never copied. The
route passes `kind: 'plate'` through to the brief's lead.

**And the desk arrests the sentence it cannot serve.** `authoringSentence`
is the fifth Start arrest and D-134's contract exactly: claiming forms only
— a making verb, an article, then level/world within a couple of words —
so *"make the level select screen faster"*, the level as this codebase's
noun, queues untouched; and one extra press still queues anything, because
the desk warns and the user decides. The button reads **"Queue anyway —
worlds are authored from + New Level."** Routing the sentence to authoring
directly was offered and declined: D-110's button stands, now visible from
the desk instead of silent.

**Evidence.** Proven live on the exact sentence: the arrest armed on the
first press with the worker plan still honestly priced beneath it, and the
New Level modal showed the 3D backdrop kind against a palette whose eight
authored worlds all composite their thumbnails. 1446 + 151 green, typecheck
clean. Two mutations, post-commit, each killed by exactly its test: the
detector disabled (the proof-sentence case), the plate-first lead disabled
(the leads-with-the-plate case). The road now runs desk → arrest → door →
plate-leading brief → designer with the skill → review showing the plate →
Approve copying it — and the first paid run down it is still D-143's open
gate, one button press away.

## D-145 — 2026-08-10 — The review speaks D-138: the cut named as a boundary, the delivery in the same breath

Brian, reviewing the first paid plate run (`cfa2a7a3`, The Wine-Dark
Strait): the modal opened with `agent session failed (error_max_turns)`
in error red above a delivery that was pack:check-clean, its RESULT.md
honestly naming the small remainder — and with More turns waiting below,
the whole surface read "definitively unfinished". The doctrine already
disagreed: D-138 had ruled a cut a boundary, not an annulment, and
D-015/D-025's hard-won form — "ran out of turns" does not mean "needed
more turns" — sits in PROJECT.md itself. The feed's partial card even
had the wording right ("Ran out of turns, but what it got done is ready
to review"); the modal was the one surface still contradicting the rule
it sat on.

Built — presentation only, the mechanics untouched:

- **The sentence.** `cutNotice` (`web/src/panels/cut.ts`, the moves.ts
  shape: pure, tested) reads the meter and answers in one neutral line:
  *"The turn budget ended this run at turn 21 — below is everything it
  wrote, including a world draft and its RESULT.md account."* A pure
  clock-cut says "The clock"; turns win when both limits are stamped —
  the carry-on label's own precedence. Substance is three signals: a
  `packDraft`, a repo patch (`changes.files`), RESULT.md among the
  delivery files. Plain files get the plain clause; an empty sandbox
  gets the headline alone, because promising "below is everything it
  wrote" over nothing would be the opposite lie; and a still-loading
  file list claims nothing until it lands.
- **The styling.** `.rv-cut` is calm ink in the pending-item's own quiet
  box with a neutral bar — never `.error`'s red. A cut run's modal now
  contains no red unless something actually failed.
- **What did not move.** A run with no `outOfTurns`/`timedOut` renders
  exactly the red it always did — `cutNotice` returns null and the old
  branch takes over. `canCarryOn`, the More turns/More time button, its
  fetched quote and "charged only if it finishes" are untouched; the
  offer is exactly as reachable as before, it just no longer stands
  under an alarm. The terminal card is untouched too.

Evidence: 1,446 + 156 green (five new on the sentence), typecheck clean;
two post-commit mutations each killed by exactly its test (precedence
flipped → the both-limits case; the substance clause silenced → the
same-breath case). Proven live against the real store — the worktree's
own vite proxied to the live API, read-only: the Wine-Dark Strait parent
read back the turn-21 sentence above with zero `.error` nodes and no
second carry-on offered (D-139's gate holding), and its still-undecided
continuation leg was screenshotted at turn 13 — neutral notice, the
drawn world draft, and **More turns · up to $2.00 · charged only if it
finishes** in one frame. Honestly unproven: the modal render itself has
no component test, like the rest of the modal — the two JSX conditionals
ride the tested function, and the live read-back is their check.

## D-146 — 2026-08-10 — The handover the brief promised: a continuation reads its parent's report, and the decoder pointer stops hiding

The first paid More Time continuation (`cfa2a7a3` → `c19da3d1`, the
Wine-Dark Strait chain) exposed two seams, both of the sibling-seam form.

**The brief pointed at the exact file the carry deliberately leaves
behind.** `carryForward` skips the parent's paperwork — RESULT.md among it,
so "did this deliver" stays the new leg's own question (D-074's family,
D-119's PENDING.md rule) — while `continuationBrief` opened with "Read
RESULT.md first". Each right alone: the report is the best handover there
is (D-063), and inheriting it under its own name would mark a leg delivered
before it did anything. Together they sent the leg to a file that could not
exist. It wrote "the last run never reported" — false, the parent's RESULT
was thorough, separations quoted and all — and spent paid turns re-deriving
state the parent had written down.

The paperwork rule stands untouched; the report now rides **renamed**.
`carryForward` hands the parent's RESULT.md over as `PREVIOUS-RESULT.md`,
the newest report in the chain winning and a leg cut before reporting
passing on the one it was handed, so a chain never loses its last account.
The brief points at the inherited name and says why RESULT.md is the leg's
own to write — and brief and carry share the name through one exported
constant, so they cannot drift apart the way they did. What makes the
rename load-bearing rather than cosmetic: every check that asks "what did
this run do" was taught the inherited file is not an answer. It joined
`PAPERWORK` (so `producedArtefacts` and the send-approval extras ignore
it), `deliveredFiles` refuses to let it mark a do-nothing leg delivered
(the queue's failed→partial upgrade reads that), and `closeOutEvidence`
leaves it out of "files it produced".

**And the leg rebuilt the PNG decoder beside the copy it had** — D-113's
exact pattern, a `measure.cjs` written to measure its own plate — because
the brief's pointer to `decodePng`/`countColours` in `raster.ts` lived only
inside the reference-image section, and this leg had a plate to measure and
no reference. The pointer is unconditional now, beside the plates section
of every authoring brief, worded without the word "reference" so the
no-reference brief still says nothing about one.

Evidence: 1,452 + 151 green (six new tests: the hand-over, the newest-wins
and pass-it-on chain cases, the two delivery refusals, the inherited report
not counting as made), typecheck clean. Four mutations, post-commit, each
killed by exactly its test and nothing else: the hand-over loop dropped
(the three carry tests), the brief's pointer reverted to RESULT.md (the
handed-over-name test), the decoder paragraph dropped (the
reference-or-not test), `deliveredFiles` back to counting any file (the
inherited-report refusal). Its live gate is the next More Time press.
Observed on the way, not decided here: the reply route composes no brief,
so its legs meet PREVIOUS-RESULT.md only by listing the sandbox; and
`carryForward` copies top-level files only, so a continuation still starts
without the parent's `input/` — the reference image among it.

**Amendment, 2026-08-11 — the live gate is closed.** The next More Time
press came the same night: the Wine-Dark Strait's fourth leg (`a2f60fac`)
carried `PREVIOUS-RESULT.md` at exactly its parent's 4,099 bytes, opened
its own report with "this run looked at the previous plate," engaged the
inherited redesign point by point — and, unlike every leg before the
handover, finished with **no PENDING.md**: nothing left to reconstruct,
nothing to hand forward. Its predecessor had spent paid minutes concluding
"the last run never reported" about a parent that had reported thoroughly;
the leg after this change spent those minutes executing. The two seams
observed above remain open as written.

**Second amendment, 2026-08-11 — both observed seams closed** (with the
v2 build, D-148, because the Odyssey re-do would run straight into them).
`carryForward` now copies the parent's `input/` after the top-level files
— `outputNames` lists files only, so a reference image or an attached CSV
never followed a continuation; the leg's own attachments are on disk
before the carry runs and win any name they share. And the reply route
composes a brief at last: `replyBrief()` shares the exact
PREVIOUS-RESULT.md pointer sentence with `continuationBrief` through one
private helper, minus the ran-out framing — attached only when the parent
actually left a report for the carry to hand over, because a brief naming
a missing file would recreate the false premise this entry closed. Two
new carry tests (reference rides; the leg's own input wins), one brief
test (same pointer, no ran-out line); mutation: the `input/` block
disabled → exactly the reference-rides test fails.

## D-147 — 2026-08-11 — The floor that drew nothing: op names become the contract

Brian approved The Wine-Dark Strait — four designer legs, the first world
authored end to end through the 3D door — and the floor polish he asked
for next began by reading the installed pack. Its two ground ops said
`"kind": "rect"`. The checker walks colours and coordinates *by key* and
never reads the discriminant, so every value resolved and `pack:check`
said "looks good" — four times, once per leg, and once more at install.
The interpreter's switch on `op.op` then matched nothing, and its missing
`default` skipped both ops without a word. **The approved floor drew
nothing**, and nobody — not the legs looking at their own renders, not
the CLI, not the review, not the approve — could see the difference,
because the plate behind it already looked complete.

The hole was the walk's own virtue inverted: driven by keys rather than
the op union so a new op is covered without touching the checker (D-109),
it had no opinion about the union at all. And the misspelling was
invited: the brief lists the vocabulary as \`rect\` {x,y,w,h,…} and never
names the field the idiom rides in, so a run guessed `kind` — a
reasonable guess, wrong, and invisible.

Decided and built, the same hour:

- **`OP_NAMES` and `FX_NAMES` in the format**, each carrying THEME_SLOTS'
  compile-time assertion, so the lists cannot drift from the unions.
- **`validateLevelPack` refuses unknown discriminants** — top-level ops,
  backdrop ops, `of` children, and ambient `fx` — and the one misspelling
  that actually shipped gets its answer by name: *found `"kind": "rect"`;
  the field is called `"op"`*.
- **`drawOp` grew the `default` it never had**: an unknown op now throws
  its name instead of silently drawing nothing. The checker is the wall
  before money; the throw guards every path that never met the checker.
- **The brief names the field** — `{"op": "rect", …}`, "there is no other
  name for that field" — closing the guess at its source.
- The fleet was swept before the rule landed: only the Strait carried the
  disease, so no installed world flips to rejected.

The Strait's floor itself was rewritten in the same pass, as the polish
Brian asked for: wet shingle in the pack's own palette — dark strip,
speckle and veins, a faint sheen line at the waterline, wrack tufts —
plus glints riding the plate's sun-road, rain motes under the squall and
a flyer. No scrim, deliberately: the fourth leg built the crew band's
darkness into the plate itself, and the numbers respect it — worst
separation 16.2, every gown reading, `pack:check` clean under the new
rule. Committed in two acts: the pack exactly as approved first, because
the crew's artifact is the record, then the fix.

**Evidence.** 1458 + 156 green with the four built-ins and every
installed pack passing the new rule; typecheck clean. Two mutations,
post-commit, each killed by exactly its test: the checker call unwired
(three name tests), the interpreter's throw muted (the loud-unknown
test). The lesson joins D-030's family: the checker verified that values
*resolve* and was read as verifying that ops *draw* — two claims that
only sound alike, and the gap between them shipped an invisible floor
through four paid reviews.

## D-148 — 2026-08-11 — Backdrop v2 whole: the stack, the drift, the strip, the life

Brian: "Let's do v2 completely, step by step, then re-do The Odyssey level
with full v2 capabilities." The menu was PRERENDER §3/§5's; the unlock
order was the one D-143 recorded — alpha-keeping raster tooling first,
because the one-plate rule's blocker was that a stacked plate needs holes
and the tooling was opaque RGB. Two menu items deliberately stayed out:
the **smooth finish** (amends D-108, PRERENDER's own decision #2 says
quantized-only stands, and it costs a second composited surface plus
image-aware duplicates of every static drawing path — it remains a priced
option, one decision away), and **depth-map displacement** (PRERENDER's
own verdict: smears at silhouettes; multi-plane makes it redundant).

Built, in eight committed steps, each green before the next:

1. **Alpha primitives beside the opaque ones**, never a stride refactor:
   `RasterA`, `decodePngA`/`encodePngA` (one shared chunk walk, so the
   decoders cannot drift), `binariseAlpha` (cut-out = on-or-off, holes
   zeroed, partials counted), `countColoursA`/`alphaStats`,
   `histogramOfA`+`paletteFrom` (one palette across files),
   `applyPaletteA` (error never diffuses across a hole), `blitPlateA`
   (composite by coverage), `srcX` on both blits. Opaque paths
   byte-untouched.
2. **The format**: `plates` 1..3 back to front (`MAX_PLATES`),
   `backdrop.occlusion`, ambient `plateloop`, `PLATE_OVERSCAN` 60 — width
   at view size is pinned, width carrying overscan drifts, height never
   overscans (vertical drift slides the ground line from under the crew's
   feet). `packRasterFiles` is the ONE list install, review and checker
   share (the D-119/D-120 sibling-seam lesson applied in advance).
3. **The checker**: back plate fully opaque; upper plates binary alpha
   with holes; the strip clear of the signpost span and every standing
   box, both widened by the drift margin exactly when it drifts; tiles
   ≤512; **the 128 budget is the layer's** — one union across every
   raster file, per-file counts in the refusal and the joint quantize
   named as the fix; separation measured on the composite at rest.
4. **The motion law**, renderer-owned and pure (`web/src/world/parallax.ts`):
   sprites locked, pointer as a small camera pan; plates behind shift
   WITH it, far most — the moon out of a train window — the strip in
   front against it hardest (−1.4×); whole-pixel steps; the clamp equals
   the checker's clearance margin, which makes the clamp a contract;
   idle breathes a 26-second sine. A pack authors ORDER and sizes; what
   moves is app law, the way scrim semantics are. Slot containers fix a
   latent z-order race v1's single plate had hidden (Assets.load resolves
   in network order). The occlusion layer sits above sprites and dust,
   below emotes and labels; plate-life TilingSprites ride the back
   plate's drift.
5. **The door**: `render_plate` modes — plate | plate-overscan | cutout |
   cutout-overscan | tile — refused by name (D-147), booleans kept off
   the runner's string/number schema builder. Cut-outs screenshot with
   omitBackground, snap alpha hard, and report coverage instead of
   separation (legibility under a cut-out belongs to the composite).
6. **`pack:quantize` joint mode**: two-plus PNGs → one union, one median
   cut, each file redrawn under the shared palette, holes kept.
7. **The brief and the skill**: layers from ONE scene with one lighting
   rig (what keeps the union small and the light agreeing — integration
   rule #1), the five modes with the transparent-background trap, the
   strip's two placement walls verbatim, the layer-wide budget with the
   joint fix, plateloop in the vocabulary.
8. **Route 2 as files** (`art/blender/`): a headless template builder
   (2120×900 frame, long lens at crew eye height, FAR/MID/NEAR view
   layers with nearer-as-holdout, film transparency, mist with FIXED
   bounds — never per-frame Normalize) and a plates.py driver that ends
   by pointing at the joint quantize. UNTESTED LIVE and labelled so:
   Blender is not installed on this machine (checked); the first
   `blender -b` run is the gate.

**Evidence.** 1491 + 166 green (33 new server tests, 10 new web),
typecheck clean throughout. A generated 2-plate + strip + tile pack
passed `pack:check` clean and `pack:render` composited every layer
correctly (holes showing sky through the ridge, the strip over the
stand-ins, worst separation 21.9). Live Edge renders through the door:
cutout-overscan at 2120×900 with binary alpha and 16.9%-class coverage
receipts, a 64×64 tile at 50% opaque, the offline listener at zero hits.
Joint quantize live: a 100+100-colour pair, union 200 → exactly 128. The
running app after HMR: world draws, all six level cards composite through
the new path, zero console errors. Four mutations post-commit, each
killed by exactly its test: the strip's standing-box rule dropped, the
drift clamp removed, the input/ carry disabled (filed under D-146's
amendment), the door's binarise skipped — that last one killed by the
live Edge test, which is the kind of kill worth having.

**Honestly unproven, and whose gate is what:** live parallax in pixels —
no installed pack carries an overscanned plate yet; the Odyssey re-do run
is that gate, deliberately, since a designer authoring through the new
brief is the capability v2 exists for. Plate-life in a live browser rides
the same run. Route 2's first render waits on Brian's one-time Blender
install.

**Amendment, 2026-08-11 — the live gate is closed: The Rearing Strait.**
The Odyssey re-do ran the same night: authoring job `25e36d5f` on hq
(designer, kind plate, the v1 strait plate attached as reference) plus
five funded continuations — Brian's stated budget, four through the
More-turns door and the fifth through the reply door, which can carry
words. The chain converged BY THE CHECKER: leg 1 rendered all three
layers and a valid draft (10 errors — strip over the crew, union 382);
leg 2 fixed placement and union but left soft alpha on both cut-outs;
legs 3–5 burned turns hand-rolling pixel scripts past the one-command
fix; the reply leg was handed `npm run pack:quantize -- far.png mid.png
near.png water.png` verbatim and came back **clean** at $0.54. Approve
installed all four rasters (the packRasterFiles seam live); level
`the-odyssey` created in the world. **Pixel proof, headless Edge**:
pointer left→right shifted the sky band 10.47 mean-diff and the beast
band 10.22; the same bands 1.2s later at the same pointer: **0.00** —
drift is pointer-driven and settles dead still; the water sliver kept
scrolling (plate-life live); an earlier run with the pointer never
landing showed uniform ~2.4 diffs on every pair — the idle sine,
accidentally proven. far/mid shipped 2120×900 (both drift, at their
ranked rates); the designer pinned the strip at 2000×900 — legal, so the
counter-drift path is still unexercised live. Both D-146 seams fired en
route: the reference followed every carry in `input/`, and the reply leg
got the brief because a hand-me-down report existed. **The pricing seam
fired again, second occurrence**: six legs, all cut, $6.22 real,
**$0.00 charged** — the exact D-141 shape (a chain of cut legs whose end
promotes charges nothing); the recorded fix still awaits its decision.
Recorded, not built: the partial-alpha refusal names only the door
re-render as its fix — three legs hand-rolled scripts instead; the
message could also name the joint quantize, which is what actually
snapped them. And turnsAllowed 11–15 per leg says the $2-quoted class
funds ~12 turns; a v2 stack wants most of them for renders, so the class
rate will want rows (G5's tax, paying itself down as these six file).

**Amendment, 2026-08-11 — point 8's gate is closed: both Blender scripts
fired clean on their first real run.** Brian said "Do the Blender
install." Blender 4.5.9 LTS went on as a portable zip (no installer, no
registry, reversible by deleting the folder) at
`C:\Users\MSI\Tools\blender-4.5.9-windows-x64\` — outside OneDrive so
sync never grinds over ~900 MB of app tree, and outside the AppData
trees the MSIX sandbox redirects (the same class of path as the two
proven-real ones). The zip's sha256 matched blender.org's own manifest
(`41da973b…77cf`); extraction needed `C:\Windows\System32\tar.exe` —
Git Bash's GNU tar refuses zips. Then the entry's own gate, run with
`--python-exit-code 1` so a script throw can't hide behind Blender's
exit 0: `build_template.py` wrote the 432 KB template.blend first try,
and `plates.py` rendered far/mid/near from it at 2120×900 RGBA, all
three fully transparent (WIC-decoded: 0 nonzero-alpha pixels) — the
correct product of an undressed template, proving the layer muting, the
holdout wiring and the file writes with zero API corrections to either
blind-written script. Still open, deliberately: the MSIX rule means
"installed on Brian's real machine" is confirmed only by his own
terminal running `--version` once; and the quality gate — a DRESSED set
(CC0 assets appended per the README) rendering plates worth feeding
quantize/check/render — remains Route 2's first real outing.
template.blend is gitignored as regenerable; whether a dressed one gets
tracked is decided at dressing time, since BlenderKit assets would make
the `.blend` itself non-redistributable while CC0 keeps it clean.

## D-149 — 2026-08-11 — The parcel desk: a pile of forty shows forty

Brian clicked the parcel pile reading ×40 and got one ancient job's review,
blind: "no organized presentation or way to assess properly how to move
forward." The pile's click had always opened the *oldest* waiting delivery
— right when the pile was three, absurd at forty. Mockup first, then his
three calls, all the recommended way: group by **what Approve would do**
(acts on approval / code patches / files only — the triage question, since
a delivery whose approval sends or installs is blocked on him in a way a
files-only run never is); bulk **discard only**, multi-select with the
press-twice arm (D-134's idiom) — approve acts, so it stays one at a time;
and **auto-advance** — a verdict inside a review opened from the desk
slides the next parcel in, with a `◂ pile · n of m · skip ▸` strip in the
modal head.

Built web-only — the client already holds every waiting job via the world
socket, and bulk discard is N calls to the existing resolve route, so no
server surface moved. The shape: `parcels.ts` pure and tested (grouping
with side-effects outranking the patch, oldest-first, chips that say what
approving touches, ages); `ParcelDesk.tsx` on the ordinary modal chrome;
the flow order **snapshotted at entry** so verdicts shrinking the live
queue never reshuffle a pass mid-walk; `ReviewModal` grew `onDecided` —
called on promote, discard, more turns, a reply, a redo — beside `onClose`
(✕ and Esc), which is what lets a verdict advance while a plain close
returns to the desk. A continued job is not listed (D-139: More turns was
its decision) — and that surfaced an inconsistency the fix then closed:
the crates' ×N counted continued jobs the desk refused to show, so
`waitingReview` in the canvas now applies the same rule and the pile
cannot disagree with its own desk.

**Evidence.** 175 web tests green (+9 on the pure module), typecheck
clean. Proven live headless against hq's real backlog: the pile click
opened the desk at "27 waiting · oldest 10d", two sections, the flow
entered at 1 of 27, skip advanced to 2 of 27, ◂ pile returned with the
queue intact — no verdicts given to real jobs. Two post-commit mutations,
each killed by exactly its test: the continued-filter dropped (the D-139
test), the acts-priority inverted (the outrank test). Banked for testing:
synthetic `PointerEvent`s do not drive Pixi v8's interaction at all — the
door control proved it — so canvas UI is verified with real input
(headless Edge via playwright-core), the D-145 route now twice-used.

**Amendment, 2026-08-11 — the counting seams, swept.** Brian found the
rule's remaining siblings within hours: thirteen "pending" items on hq
that no pile or desk would show — the continued chain legs (the Odyssey's,
the Strait's, the Iliad's), decided by D-139's own definition yet still
dressed as to-review by the select screen's badge (`levelInfo.toReview`,
server-side) and the Backoffice's grouping, each holding a private copy of
the predicate. The D-119/D-120 shape, called in advance and hit anyway.
Fixed as one shared `awaitingVerdict(job)` in the domain model — to-review
AND not carried on — now the only implementation: the badge, the crates,
the desk and the record's tally all ask it. In the Backoffice a carried-on
leg files under **closed** wearing a "carried on" badge (Brian's pick):
the record stays whole, nothing solicits. Statuses and the ledger are
untouched — history stays true; this is counting and dress. Proven live:
hq's badge read 13 before the server restart and 0 after, agreeing with
the desk for the first time. 1499+178 green, three new ledger tests
(files-under-closed, tally excludes, promoted never rebranded).

## D-150 — 2026-08-11 — A promoted chain prices its cut legs: the $0 world stops shipping

The seam D-141 recorded fired twice before it was closed: the Iliad chain
cost $9.29 and charged nothing, the Odyssey $6.22 and nothing — every leg
cut, "charged only if it finishes" pricing each at zero, and the chain's
END finishing changing nothing. Brian said do it, and the recorded shape
was built as recorded: at promote, the route walks `queue.ancestry` (the
rootPrompt walk kept whole instead of keeping only the top), names the
legs cut by turns or the clock, and `repriceChain` sets each of their
still-unpriced failed rows to **min(cost, that leg's own quote)** — never
above what the leg was quoted, D-012 intact per leg. The row gains
`chainPriced: true`, which is three things at once: the idempotency guard
(a second Approve reprices nothing), the row's own explanation for a
failed outcome carrying a price, and the audit marker. Unmeasured spend
stays absorbed — a price on an unknown cost would be an invention — and
real failures inside a chain (a refusal someone replied past) stay
absorbed too: only the funded-leash cuts are the seam. The feed line
names the charge beside the approve. The ledger rewrite is
sibling-and-rename atomic, because a torn ledger is worse than any bug
this fixes. **Forward-only, deliberately**: the two shipped chains stay
as recorded — retroactively billing settled history is a different
decision nobody asked for.

**Evidence.** Six new ledger+queue tests (per-leg quote cap, idempotence,
unmeasured absorbed, done rows untouched, no-op leaves the file alone,
ancestry end-first) — 1513 green with the day's other work. Mutation: the
quote cap dropped from `repriceChain` → exactly the min(cost, quote) test
fails. The honest gate stated plainly: the first real promoted chain
under this rule is the live proof; nothing has been charged by it yet.

**Amendment, 2026-08-11 evening — the gate is closed, three chains
deep.** The D-156 sweep promoted three chains the same day: six legs,
every one cut at allowed+1, $10.54 charged against $11.85 real, the
per-leg min(cost, its own quote) cap biting on three legs ($1.31
absorbed), `chainPriced: true` on every row. The $0 world stopped
shipping the day the rule met its first promote.

**Amendment, 2026-08-11 — the recorded ask is decided: the shipped chains
stay $0.** The entry left retroactive billing as "a different decision
nobody asked for"; Brian asked the same day, reviewing the whole open
list, and chose to let them lie. The Horse at the Gates ($9.29) and the
Odyssey chain ($6.22) were the pricing seam's own discovery cost — the
runs that surfaced and proved the shape this entry fixes — and stay
absorbed. Forward-only is now the whole rule, not a pending half.

## D-151 — 2026-08-11 — The shelf taken: the smooth finish and the depth map

Brian: "do v2's shelf." Both deliberately-parked items land, each as a
per-pack opt-in with quantized untouched as the default — so this amends
D-108 the narrow way: the *decision* "quantized is the finish" becomes
"quantized is the default finish; a pack may declare the other medium".

**`backdrop.finish: "smooth"`** — PRERENDER's Option B, built as designed:
the plates leave the canvas entirely and render as native-resolution DOM
images under a now-transparent world canvas (the strip over it — document
order is the depth), browser-scaled, soft alpha welcome, no colour
budget, the drift applied unrounded (`layerOffsetRaw`: one motion law,
two media; the clamp identical, because overscan is registration, not
look). The canvas alone keeps `image-rendering: pixelated`, which is the
HD-2D contrast doing the work: crew rigidly pixel, picture photographic.
The checker waives exactly the palette world for smooth — binary alpha,
the 128 union — and holds everything that is registration: sizes, the
opaque back, the strip's placement walls. Cards, previews and the CLI
needed nothing: canvas `drawImage` was never quantizing.

**`backdrop.depthMap`** — continuous micro-depth from one image: a
grayscale map at the back plate's exact size, riding the plate's own slot
as a `DisplacementFilter` scaled by the same camera (`DEPTH_SCALE` 0.6 —
±12px at full pointer, inside the drift bound). Excluded from the colour
union — data, not picture — and **quantized finish only**, by checker
rule: the smooth finish carries depth as real layers, and one image
cannot be two media at once. The honest cost is in every doc that names
it: displacement smears at hard silhouettes; where an edge matters, a
cut-out layer beats the map.

The door grew `finish: quantized | smooth` (refused by name): smooth
keeps a render exactly as the page drew it, which depth maps need — a
128 cut would band their gradients into steps the displacement would
show as terraces.

**Evidence.** 1513 + 181 green (+17 across shape, checker, door,
parallax). Live Edge pair through the door: the same gradient cutout kept
371-class colours and its soft edge under `finish: "smooth"` and came
back snapped and ≤128 without it. In-app headless on two throwaway
installed packs (created, proven, closed and deleted): the smooth world
ran 2 DOM plates over an `alpha: true` WebGL canvas with the mid plate
drifting sub-pixel (-2.57% → -2.01%); the depth world displaced a PINNED
plate 1.56 mean-diff across a pointer sweep against **0.00** settled —
only the filter moves, and it stops dead. Three mutations, three exact
kills: the smooth waiver disabled, the map's size rule disabled, the
reprice quote cap dropped (D-150's). Unexercised live, stated: a smooth
pack authored by a designer through the brief — the first real smooth
ask is that gate.

**Amendment, 2026-08-11 evening — that gate is closed: The Aurora
Anchorage.** A paid designer, asked for an arctic night harbour, shipped
`finish: "smooth"` through the brief with 111,363 colours in its far
plate — continuous aurora curtains no 128 cut could carry — soft alpha
kept on both cut-outs, live on the palette beside the crisp crew (the
contrast this finish exists for). It took the D-156 sweep's runner-schema
fix to make `finish` reachable from a session at all, and its delivery
found the folder-shape seam recorded there; the smooth path itself
behaved exactly as this entry built it.

## D-152 — 2026-08-11 — The seam sweep: excerpt named, command handed over, arrival refused

Three seams recorded across three entries, closed in one idle-fleet pass
on Brian's review of the whole open list. None were decisions — each
entry had already written its fix's shape down; this pass built them.

1. **The close-out excerpt names itself** (D-130's seam,
`closeOutEvidence` in claude.ts). The close-out got the FIRST 1,500
characters of RESULT.md, so a complete 28K researcher brief arrived
visibly cut mid-sentence and the close-out wrote a PENDING claiming a
truncation the run never suffered — a redo would have forwarded the
fiction (D-114). Now ≤1,500 rides whole; anything longer arrives as
head (1,000) + `[… middle omitted …]` + tail (400) under a heading that
says "an excerpt … the full RESULT.md is in the sandbox". The tail is
the load-bearing half — it shows the report *concluded*.

2. **The partial-alpha refusals hand the joint cut over verbatim**
(D-148's tail; plates.ts × plate, strip, tile). The messages named only
the door re-render as the fix, and three Odyssey legs burned their turns
hand-rolling pixel scripts — what actually snapped them was the fifth
grant carrying `npm run pack:quantize -- …` through the reply door
verbatim. Each refusal now ends with that command, file list included,
the same idiom the layer-budget message already used.

3. **An arriving role stops overwriting a shipped one** (D-126, G6's
row; roles.ts). `registry.install` wrote `${name}.md` unconditionally —
how wshobson's architect landed on P1's. An arrival onto a taken name is
now refused ("rename the arriving role or retire the installed one
first") unless the file is identical, endings-agnostic — the retry
tolerance packs proved out (D-141). The one deliberate updater, the
add-a-skill line edit (D-089), passes `replace: true` and keeps its
behaviour. Refuse-or-rename, exactly as G6's row guessed.

**Evidence.** 1518+181 green (5 new tests: refusal, identical-retry
across endings, replace; the long-report excerpt with its ending intact
plus a short-report control; the plate refusal asserting both fixes),
typecheck clean. Three mutations, three exact kills: the install guard
disabled → only the refusal test fails; the head-only slice restored →
only the excerpt test fails; the command dropped from the message → only
its test fails. Live gates, stated honestly: the next long RESULT.md,
the next real library collision and the next partial-alpha refusal read
by a paid session are each their fix's first outing — all three go live
at the serve restart this pass ends with.

## D-153 — 2026-08-11 — The Pine Reach: Route 2's dressed set, and the first smooth world

Brian's go on the dressing arc, same day as the install. The whole Route
2 chain ran hand-driven end to end for the first time: a verified-CC0
kit (Poly Haven — coastal_cliff_01, fir_tree_01, boulder_01; Rob Tuytel,
Rico Cilliers; 1k blends + textures to `Tools\assets\polyhaven`, outside
OneDrive), a dressing script that appends it into the template's
FAR/MID/NEAR, `plates.py` renders at scale 2, and the result installed
as **web/public/packs/pine-reach** — level `pine-reach-proof` (project
Route 2) — with `finish: "smooth"`, the finish these gradient-rich
renders exist for.

**The see-your-work loop earned its keep — five iterations, each moved
by a measurement or a look.** v1: textures and layer separation worked
but the sky rendered flat, the cliff read as a close wall, and the near
stone measured wx 723–989 — 29,343 pixels over the furniture span plus
the exit stand (a scratch tsx measurer walked the same bands the checker
does, before the checker ever ran). v2: composition repaired, stone
slimmed to a menhir at d=14 (wx 802–897 exactly, zero violations — the
projection arithmetic in the script header landed it first try). v3:
cliffs had overshot the frame top; lowered. v4 found a real bug worth
banking: **a Blender plane primitive has no local-Z extent, so
`Generated.Z` on a rotated sky plane is a constant** — the "gradient"
was one sampled colour; the vertical axis after an X-rotation is
`Generated.Y`. Sky and haze both carried it. v5 compressed the moor
ramp into the band the camera actually sees (Generated 0.05–0.25).

**Template learning, recorded**: the template's nearer-as-holdout
wiring punches holes where mid scenery overlaps far — but the format
demands an opaque back plate, and drift must reveal picture behind an
edge, never a hole. The dress script flips holdouts to plain excludes,
so every layer renders complete. A future template rebuild should
default that way for drifting packs.

**Evidence.** `pack:check` clean on the first run (the measurer had
pre-cleared exactly what it checks); `pack:render` worst separation
**17.4** — above Ember Gate's 11.3 and the Strait's 16.2 — with the
menhir clear of every stand-in. Live in headless Edge: `.world-plates`
holds far/mid as native 2120×900 DOM images at 106% width (the overscan
hanging half off each side), near.png mounted as the occlusion; a
dispatched pointer sweep moved far **−0.1741%** against mid's
**−0.0958%** — differential rates, ~1.8:1, at unrounded offsets
(−2.22391%), which is D-151's layerOffsetRaw doing exactly what it
says. Screenshot sent to Brian. Provenance in the pack names authors,
licence and pipeline; `dress_pine_reach.py` ships beside pack.json so
the dressing is reproducible; pine-reach.blend stays gitignored as
regenerable.

**Honest boundaries.** D-151's own gate — a smooth pack authored by a
DESIGNER through the brief — remains open: this world proves the smooth
render path live (checker waiver, DOM stack, unrounded drift) but was
hand-authored through Route 2, not paid through the desk. The occlusion
strip's counter-drift is still unmeasured individually (D-148's note
stands). And the moor reads sparse below the treeline — a matter of
taste, left for a real level to improve on.

**Amendment, same evening — the first viewer caught what the live proof
never asserted: the whole pixel-art layer was invisible.** Brian opened
the level and the crew, strip, ops and signposts were missing — and they
are absent from my own hero shot too, unnoticed, because every assertion
I ran measured PLATES (mount, sizes, drift deltas) and none said "a
sprite is visible". The mechanism is CSS painting order, not Pixi:
`.world-plates` is absolutely positioned, the canvas was static, and
positioned siblings paint above in-flow content whatever the DOM order —
so `insertBefore(platesDiv, canvas)` never bought the layering it read
like it did, and every canvas pixel sat behind the plates. D-151's
throwaway proof measured drift by `style.left` and pixel-diffed the
plates, so the same hole passed through it unexercised. One line fixes
it, beside the file's own inline-pin precedent: the canvas gets
`position: relative`, making all three layers positioned so paint order
IS document order — plates, then canvas, then the occlusion img appended
after it ("doc order = depth" finally true as stated). Verified live
headless both ways: Pine Reach now shows Pip and Dot walking the strip
with the menhir occluding in front; hq's quantized world renders
byte-familiar (no DOM siblings, the position is a no-op). The lesson,
banked where the measure-first habit lives: a "proven live" scoped to
what was measured proves only that — the missing crew stood outside the
frame of every assertion I wrote, and one human look caught it in
seconds.

## D-154 — 2026-08-11 — Every world furnishes its own doorway and parcel stand

Brian's second look at Pine Reach: the parcel spot and the crew doorway
were clickable and invisible, "same in most new levels". True — and
truer than that: **no scene ever drew the doorway anywhere.** hover.ts
had confessed it since the box was added ("a hit rectangle over scenery
with no visual feedback of any kind — the only way to discover it was to
click the wall"), and the parcel spot had no standing asset in any
world; crates only appear while deliveries wait. Pack worlds made it
obvious because their art never happens to paint those spots; the
built-ins were only ever discovered by clicking the wall.

**The fix follows the crate's own precedent** ("drawn in the theme's own
timbers"): the app now draws a doorway and a low parcel pallet on the
dynamic layer, from each world's OWN sixteen theme slots — wood posts
and lintel, void opening with shadowed jambs, a flame lamp; deck and
feet for the stand, with the crate stack raised onto its deck. That is
Brian's "customized for each level design" without new format surface:
the furniture takes the dusk palette in Pine Reach, cave timbers on hq,
household wood in Home Chores — verified in pixels on all three, smooth
and quantized both.

**The geometry moved to shared, and the checker grew the two spots.**
doorBox/parcelsBox now live in `packages/shared/src/scene.ts` — one
source for the client's hit zones and the server's occlusion rule
(D-030's lesson: two copies of "where the door is" would drift). The
occlusion checker refuses a strip opaque over either box, band-limited
to each box's own height like the stands, widened by the drift margin.
Three new tests; the guard mutated away fails exactly the two spot
tests.

**The rule's first catch was this session's own world, and its second a
paid one.** Pine Reach's menhir — legally placed under the old rules —
sat square over the parcel spot (found by eye before the rule existed);
re-cut to the LEFT quarter (dress v6, wx ~125–193, clear of spawn's
band), checker-clean, worst separation 17.4 held. Then the grown checker
REJECTED the-rearing-strait live — its paid strip carried 316 px over
the two boxes — which would have dropped that world to the cave
fallback. Fixed mechanically: an exact alpha-erase inside the boxes
only (the original plate is one git checkout away), re-accepted,
`rejected: none` on the running server.

**Evidence.** 1521+181 green (+3 checker tests), typecheck clean,
mutation exact. Live screenshots across three themes show the furniture
in each palette; Pine Reach's stone occludes on the left with the door
and stand clear on the right. Honest boundary: gates-of-troy painted its
own arch at the door spot and no level currently runs it — the default
door would draw inside that arch in the pack's own palette, judged
compatible by construction but unverified in pixels; the first troy
level is that check.

**Amendment, 2026-08-11 evening — every boundary closed by the D-156
sweep.** Troy Gate Proof exists and the default door draws inside their
painted arch in their own palette, reading as designed together —
pixel-verified. Knossos showed the furniture coexisting with a paid
world the same hour. And the steering test passed at full difficulty:
asked for a loading crane over the right side, a paid designer threaded
a DRIFTING occlusion strip through doorway, parcel stand, signpost span
and stands — all margin-widened — checker-clean on the first attempt.
The bands teach; nobody burned a turn on a refusal.

## D-155 — 2026-08-11 — The crew rail names the trade

Brian's ask, verbatim shape: a crew row read "Pip idle — on patrol" and
answering "which one is the designer?" meant opening the Agentling panel
and recalling six roles by first name. `agentling.role` already rode the
world state (roster-persisted since the roles landed), so this is one
span and one style: the trade sits between the name and the state —
name bright, role muted slate (#7d8598), state in its status colour —
inside the existing nowrap/ellipsis line. Verified live on hq: all six
rows read their real trades (worker, scribe ×2, scout, designer,
architect), 181 web tests green, typecheck clean. No new data, no new
format surface; the panel keeps being the place the whole story lives.

**Amendment, same day:** on Brian's follow-up the tag took the level
tag's own pill (`.lvl-tag`'s navy/blue, fully rounded) instead of muted
text, so "what this is" reads in one voice from the header to the rail —
computed style verified identical in headless Edge.

## D-156 — 2026-08-11 — The full sweep: three gates closed, four seams found

Brian's ask, verbatim spine: queue real challenging work to test D-150,
D-151 and D-154, grant up to ten More-Times per chain, review every
partial thoroughly — "we need to build as much learning as possible."
Three tasks proposed and approved: The Halls of Knossos (quantized v2
stack + the first designer depth map, built to chain), The Aurora
Anchorage (smooth through the brief — D-151's own gate wording), The
Signal Quay (a drifting crane strip threaded through D-154's new bands
on purpose). Six paid legs, every boundary reviewed from the sandbox
before its grant.

**The tally.** Knossos: three legs, all cut at allowed+1, promoted —
$5.97 charged ($1.97 + $2.00 + $2.00), the per-leg cap biting once
($2.79 → $2.00). Aurora: a failed leg ($0.57) plus a delivering one
($2.13 → $2.00) — $2.57. Quay: one leg, whole stack first try, $2.39 →
$2.00. **$10.54 charged against $11.85 real; `chainPriced: true` on all
six rows; min(cost, its own quote) exact every time. D-150 closed.**
Aurora shipped `finish: smooth` with **111,363 colours** in its far
plate — the gate D-151 named (a smooth pack authored by a designer
through the brief) **closed**. The Quay's crane cleared doorway, parcel
stand, signposts and stands margin-widened, checker-clean on the first
attempt — D-154's steering **closed**, alongside the Troy-arch pixel
check (the default door draws inside their painted arch, same palette)
and Knossos furniture coexistence.

**Seam one — the runner's render_plate spoke none of the door's
vocabulary** (fixed mid-sweep, `9906f31`). Moss's first leg reported it
plainly: the tool "takes only html and file". True — the schema exposed
`{html, file}` and forwarded `{html}`, so D-148's five modes and
D-151's finish existed in the door, the brief and the skill, and were
unreachable from a session. D-097's family, on its fourth appearance.
Knossos leg 3 proved the fix live: 2120×900 overscans, a real 256×512
tile, depth at finish smooth, coverage receipts in the reply text.

**Seam two — the setup spiral, a failure shape with no prior row.**
Aurora leg 1 spent 16 turns in 70 seconds on skill loads, tool searches
and reads, wrote nothing, and died at max turns for $0.57 — the D-025
lesson inverted: not too few turns, turns spent on preamble. The reply
door carried a work-first correction and leg 2 delivered the whole
smooth stack in 643s. Recorded, not built: a brief line on turn
economy, if the shape recurs.

**Seams three and four — the folder-shaped delivery, and the stamp that
should have been a refusal** (fixed, `519f2f9`). Aurora leg 2 delivered
its pack as an installable folder — PACK.json and rasters one level
down, the exact shape `pack:check`'s own closing hint coaches ("Drop
the folder into web/public/packs to install it") — and harvest, which
reads only the root, saw no draft. The promote then took the worst
path the code's own comments name: **stamped `promoted`, installed
nothing, priced the chain, and locked D-143's retry door behind the
`promoted` status**. (One clause first written here was wrong and is
corrected: the route did NOT return a stale error as a refusal — it
returned the promoted job row, whose honest historical `error` field my
own audit parser misread as a refusal. The same-evening sweep of every
resolve refusal branch found each one naming a real, current reason.)
Fixes: `stampPackDraft` lifts a single child folder's PACK.json and
files to the root before reading (same bytes; dir-exists guarded for
never-started jobs; unit test + exact mutation kill), and an authoring
promote with no draft now refuses naming the truth — proven live on
Aurora leg 1's own row after the restart. The marker is the
author-pack route's prompt prefix read at the chain root, chosen after
the first marker I reached for (`plan.note`) turned out to be an event
detail no job ever carries — the inert-guard trap caught before it
shipped this time. Aurora itself was hand-installed byte-identical
under the install-as-approved precedent, so the world charged for is
the world on the palette.

**Worlds shipped**: halls-of-knossos, aurora-anchorage, signal-quay —
each with a level, beside troy-gate-proof. Both closing crumbs were done
the same evening: the checker's success line now says both installs in
order ("From a run: leave PACK.json and its files at the sandbox root —
Approve installs them. By hand: drop the folder into web/public/packs"),
and the resolve-refusal sweep ran — every branch names a real, current
reason, and the suspicion it chased is retracted above, where the
misread that spawned it is named.

## D-157 — 2026-08-11 — Phase 0: the report answers the expansion plan's four questions

An expansion plan was drafted off the architecture review (broaden the task
spectrum where repetition is intrinsic; push every repeat down the ladder),
and its four load-bearing premises were all inferences. Decision: before any
of it spends, `ledger-report` grows four sections that turn each premise into
a number read from the live file — instrument first, exactly the habit D-029
proved (its measurement took its own plan item away, and one of these did the
same within the hour).

The instrument proves its own output, per D-021's rule for generated
instruments: the absorbed buckets and clip slices must reconcile against
`totals()` — the shared function, not a second copy of the arithmetic — or
the report exits non-zero. Mutation-tested after committing (`f7f4cad`):
re-introducing D-043's historical bug (`absorbed` keyed on `outcome ===
'failed'` instead of `priceUsd === 0`) inflates the buckets to $71.07
against the true $60.05 and the report dies with the reconciliation line;
reverted by edit, never by checkout. New sections reuse the server's own
functions throughout — `readRecipes`, `usableTools`, `compileBlockers` with
the same connections file the route reads, `normalise` over each level's
schedules — because a report that re-derives a gate drifts from it (D-030).

What the four numbers said, at 252 rows:

**Absorption is a wall phenomenon, not tuition.** Of the $60.05 fully
absorbed: **$54.33 over 65 rows (90%) is runs cut at the turn wall**;
compiles are $4.57 over 4 rows (8%); tool fall-backs 83.4c over 2; honest
within-budget failures 31.3c over 3. A further $4.29 over 19 rows is
over-quote overruns clipped to the quote (4 of them chain legs repriced at
promote, D-150). The wall marker is the runner's own `turnsAllowed + 1`
shape and only failed rows may use it (D-052, D-066). Reading: much of the
wall bucket is the iterate-until-done authoring pattern that D-150 now
reprices forward; the actionable slice is wall-cuts that never delivered.

**Three recipes are compilable today, by the gate's own function** — all in
training-ground: the sourced UF/CLP note (successes 3, 68.2c/run, pays back
in ~2 runs), the indicators telegram (successes 3, 59.4c/run, ~2), the
code-host commit list (successes 4, 27.7c/run, ~4). The one SCHEDULED key —
the monthly indicators summary, successes 6 — is **blocked by its own
accumulated evidence**: `usedTools` is a union that never narrows (D-100, by
design), and early runs used browser, github and search, so the standing
~$1.09/month stays paid unless the sentence is re-earned under a narrower
method (a new key, three clean deliveries on `web` alone). Left as a
decision, not taken: rewording a sentence to slip a gate is also how a gate
gets gamed, and the difference deserves its own entry.

**A found asymmetry, recorded rather than changed:** the `usedTools` path
counts ambient `web` as a blocker — hq's anchor2 note (successes 5) now
reads `blocked: used web` — where the pre-evidence `capabilities` path
subtracts defaultOn connections, and D-044 passed that same recipe when the
surface was the only evidence. Deliberate conservatism (a method that
fetched pages cannot be "plain node, no network") or drift between the two
paths — it needs deciding, not assuming, because it controls whether any
web-touching method can ever reach the free tier.

**D-050's gate number has moved off zero.** Three sentences have been paid
for in two or more levels (the Messi question in hq + home-chores; the
sourced note in training-ground + random + bootcamp; csv→xlsx in
training-ground + bootcamp), and two recipe keys are stored in more than one
level. The stage-1 build (graduate a tool independently earned in two
levels) now has real candidates; what this section does not yet read is
per-level `successes` for those keys, so "independently earned" stays to be
confirmed before building.

**The clone tax measured small — B5 deprioritized by its own number.** Of 80
paid rows that carried a clone, 36 left a DIFF.patch, 44 left none, 0
unknowable. The no-artifact rows cost $27.76 against ~$19.98 for the same
grants at the no-repo rate: an upper bound of **~$7.8 over 13 days**, which
includes every legitimate read-the-clone survey. The plan had a router
change behind this number; the number does not justify it. Same-hour rates
also moved under the old prose: session per-turn now reads 4.8c with a repo
against 2.9c without, where D-017-era figures said 7.4c against 1.8c — one
more instance of "recompute, never quote the note".

One honesty note about the count: the 252nd row (`cba5ee82`, worker session,
failed, cost unknown) predates the instrument and is not its work.

**Amendment, the same evening — the compile-candidates half above was wrong,
and the wrongness was the instrument's.** The script's CONNECTIONS path
pointed at `.agentlings/catalog/connections.json`; index.ts's `ROOT` is the
**repo root**, so the real file is `catalog/connections.json` and
`readConnections` returned an empty list. An empty list voids the gate
silently, in both directions at once: `connectionsUsed` has nothing to match
against, so every recipe with recorded `usedTools` came back "compilable" —
including three whose own rows say `mcp__search__search_web`,
`mcp__web__fetch_page`, `mcp__github__list_commits` — and `connectionsIn`
subtracts no ambient, so every pre-recording recipe blocked with its full
token list. The rule that caught it is already in the notes: a result from
an instrument you just built is a claim about the instrument first, and the
raw recipes contradicted the verdicts before any money moved — the compile
requests this entry would have queued would have been 400'd by the route's
own recomputation, which is the gate doing its job where the report did not.

Fixed the same hour: the path now points at the repo-root catalog, and the
section refuses to print over an empty connections read — exits non-zero
with the cause — the same discipline as the reconciliation assertion, now
covering an input as well as the arithmetic.

Corrected verdicts, hand-checked against the recipes' own `usedTools` before
re-running: **exactly one recipe is compilable today** — hq's anchor2 note
(successes 5, capabilities-path, ambient `web` subtracted; 16.3c/run, pays
back in ~7 runs — a training sentence, not queued for compile: ~$1 of
absorbed compile against 16.3c/run of work nobody real recurs is D-029's
lesson pre-applied). Everything else blocks on what it *used*: the UF/CLP
note and the indicators telegram on `web and search`, the training-ground
commit list on `github`, hq's on `browser and github`, and T5's summary on
`browser and github and search` even with ambient web subtracted. The
asymmetry paragraph above also mis-attributed anchor2: it was never on the
usedTools path — it is the capabilities-path recipe that *passes* under the
real ambient list.

What the correction does not touch: the absorption buckets, the cross-level
counts and the clone-tax figures never read connections — the reconciliation
line is unchanged ($60.05 bucketed + $4.29 clipped = $64.34).

What replaces "three compilable": **the free tier's contract cannot take
live-data work.** Every recurring fetch-shaped job in the ledger — the two
~60c indicator recipes and T5's scheduled $1.09/month — blocks on genuine
use of `web`, `search` or `github`, and the defaultOn asymmetry between the
two gate paths, while real in the code, decides nothing today: `search` and
`github` are deliberate grants and block regardless of how ambient `web` is
treated. If those jobs are ever to graduate, the lever is a decision about
the tool contract itself — the `ToolManifest.capabilities` comment already
names its precondition ("a tool manifest to record which connections it was
compiled against") — a safety-model question (a $0 tier that reaches the
network is a different animal from plain node), to be proposed with options
and decided, not slipped in through a report.

## D-158 — 2026-08-11 — The reading desks: calendar first, sibling grants, a clerk on the cheap model

The expansion plan's A1 track, decided. Four options were put to Brian with
recommendations and he took all four as recommended; each option's deciding
fact was verified in source before it was offered, not remembered.

**Calendar-read lands first; mail-read follows as its own step.** The
deciding fact is `google.ts:32-35`: the stored consent already carries
`calendar.events` — which grants reading as well as writing events — so the
first reader needs no OAuth step at all. Mail needs `gmail.readonly`, a
restricted scope and a fresh consent on Brian's own published client; it is
a deliberate second bite, not a bundle.

**Read tools live on new read-only sibling connections** (`calendar`, later
`mail`) that reuse the google token but carry their own switch, tools
allowlist and `maxChars` — the github/search house pattern (D-040, D-053:
builtin transport, own the call, own the size of the answer). `google`
stays `sendsOnly`. The senders-grant-nothing invariant is test-pinned
(catalog.test.ts holds telegram's tools to `[]`) and stays untouched; one
switch never gates both reading and sending.

**A new `clerk` trade on the cheap model works the desks** — the ninth
trade beside analyst, architect, designer, mason, researcher, scout, scribe
and worker. A clean price class on Haiku from day one (the analyst is the
precedent: a full four-trap run at 13.5c), rather than retrofitting the
model onto an existing class — a model switch would silently invalidate the
class's own c/turn history, which the quote engine prices from, so B3
("cheap model by default") applies only to classes born on it. Class tax
expected small (measured range 5.1c–$4). The matcher replay — D-117's
83-prompt harness — runs before and after the role lands, because adding a
role moves BM25 under the roles already there (D-112).

**The first standing desk is a daily morning calendar brief** (today's
events, conflicts, invites awaiting a response), created through the same
quoted schedule door as everything else (D-103) and reviewed until standing
approval earns itself (D-082's three unchanged approvals).

What this deliberately does not change: sends stay outbox → review →
approval; P6 stays refused (D-133); reading grants no acting.

Two pieces of sequencing, both decisions: **the build starts only after
T5's first real scheduled firing** (2026-08-12 09:00) — the recurrence
timer's first live proof on real work is not to be raced by a server
change. And **the desks are uncompilable by construction, on purpose**:
every clerk run is live-data work whose `usedTools` will name the new read
connections, so under the plain-node tool contract none of it can ever
graduate — which makes the clerk's ledger the counted population that will
reopen or re-settle D-100's "tools reaching a connection: decided no" with
evidence instead of principle (reopen condition recorded in D-157's
amendment).

Build checklist, for the amendment that records what actually happened:
connections.json entries; builtin callers owning payload size;
`roles/clerk.md` (model, a small turn cap, the default clock);
catalog.test.ts pinning the read-only tools lists; matcher replay
before/after; hire, schedule through the UI, first reviewed runs; then
SPEC.md's milestone section and AGENTLING.md re-read from source.
