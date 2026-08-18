# Teamwork — several agentlings on one job (2026-08-18)

**Status: proposal. This file decides nothing.** It follows `EXPANSION.md`'s
precedent exactly: each shape below ends in the decisions it waits on; a shape
Brian picks goes through the ordinary gate — a `DECISIONS.md` entry when
settled, a `SPEC.md` milestone when scoped (this is M6 territory: the one
milestone still holding metaphor work), `AGENTLING.md` re-read from source
when it lands (its boundaries section currently says *"not autonomous — takes
one job, does it, and stops"* and *"not a planner"*; both lines are revised by
this feature and must be re-derived, not hand-edited).

The question asked (2026-08-18): can agentlings leverage each other — same
class (2–4 workers splitting a challenging task) or cross class (an
architect + scribe + worker, a researcher + scribe + clerk) — for three named
goals: **speed** (parallelism, fewer bottlenecks), **depth** (combined
skills and reach on one deliverable), and **accountability** (agentlings
reviewing each other's output, contrasting findings, learning from a shared
process).

Method: the engine re-read from source this session (queue, sim, steps,
executors, ledger, match, roles, world), `DECISIONS.md` swept for every
entry that constrains the design, and every figure below recomputed from
`npm run ledger:report` today — 335 jobs, 2026-07-30 → 2026-08-18. The
standing rule applies: recompute before trusting any of these numbers later.

---

## 1. What the code already holds

Five findings frame everything below. The surprise is how much of a team
feature already exists.

**Concurrency is built and live.** Effective parallelism today is
min(awake crew, 5 stations): every idle agentling asks the queue for work
each tick (`sim.ts` `tryPickUp`), and each running job is its own detached
child process. N agentlings already run N jobs at once — D-118 drove 27 runs
in one night this way. What does not exist is N agentlings on *one* job.
The upgrade is plan-and-join logic, not runtime.

**Sequential cross-class relays exist in embryo.** A "then" sentence splits
into up to `MAX_STEPS = 4` sibling jobs (D-105, D-183), each an ordinary job
with its own prompt, recipe key, tier and quote, files riding into the next
step's `input/` with the report renamed `previous-step.md`. Each step matches
its *own* role — so "survey X, then implement it, then document it" already
runs scout → mason → scribe, by accident rather than by control. Nothing pins
a step to a role on purpose, and nothing runs steps side by side.

**The handoff primitive is proven.** D-146 built it for continuations: the
inherited report arrives under a distinct name (`PREVIOUS-RESULT.md`), the
brief points at that exact name through one shared constant, and every
delivery check (`PAPERWORK`, `deliveredFiles`, `closeOutEvidence`) was taught
an inherited artefact is not this run's work — because D-119 measured what
happens otherwise: a sibling's paperwork inherited, the close-out
short-circuited, and the record told the parent's story.

**One job with several outputs is the settled shape for fan-out results.**
D-179 (multi-channel) refused one-job-per-channel because fanning one
sentence into N jobs collides `approvalKey` (standing approval resets
forever) and recipe keys (both halves bank one method). The work happens
once; the outputs are stamped separately under one claim. Any team design
inherits that taxonomy: legs must have *distinct* prompts, and anything
keyed on the sentence must key on the root.

**Cross-review has an existence proof in this repo's own history.** D-021
already encodes the principle — a compiled tool's output is verified by a
second process *"because a run that crashed cannot be trusted to report that
it crashed"*. And D-163 is the live episode: an independent session working
the same problem in parallel reached the same refutation by its own path,
made the same dedup fix blind — and caught a false claim the main session
had already committed (the resolve route has two awaits, not one). The costs
are recorded in the same entry: duplicated work, divergent verdicts on
identical evidence, an ID collision, an unmergeable branch. A team design
must own merge and identity before it owns parallelism.

The world, for its part, is ready: the sim is presentation-only by contract
(*"nothing in the world may block or corrupt a job"*), sprites already pass
through each other, and stations are drawn from shared constants, not
authored in packs — so however many bodies work a site, no pack migrates.

## 2. What a team must respect (constraints, from the log)

Distilled from the sweep; each cites its entry. These are inherited, not
negotiable per-feature.

1. **All cost control is before the run.** The stream carries no running
   cost — `total_cost_usd` arrives on the last message (D-016). A team's
   budget is ex-ante turn allocation per member; there is no watching spend
   live, and no "cut the member that falls behind".
2. **The billing promise is per ledger row** (D-012, `priceFor`). Legs must
   each carry their own quote so no row can breach it; the desk shows the
   sum. One pooled team quote spread over N rows would quietly break the
   never-billed-above-quote promise.
3. **`MAX_STEPS = 4` is the fan-out bound** (D-105: beyond that "the box has
   become a script"). Stations are 5; a team that fills them all starves the
   level.
4. **No waiting status — refused five times** (D-105). Whatever exists is
   queued, running, or delivered; a join that "waits" must simply not exist
   until the last member delivers, exactly as step N+1 does not.
5. **Fan-out is licensed by the user's own words, never inferred** (D-182,
   D-184). The desk quotes back what it read, with one click to run solo.
   And the word "team" alone claims nothing — it already lives in send
   sentences ("post the release notes to the team on Slack" is a
   `channel.ts` example).
6. **Standing instructions ride `Job.brief`, never the prompt** (D-074).
   Prompts are recipe keys, quote classes and matcher input; composing
   protocol into them corrupts all three.
7. **Obligations ride the whole team, not one member's slice** (D-183:
   withholding follows the chain; D-181: the gate refuses the whole send).
   Safety gates are what fall through a split first.
8. **Paperwork does not inherit** (D-119, D-146). Every "already present,
   skip" short-circuit becomes a lie generator when files arrive from a
   sibling; forwarded artefacts arrive renamed and excluded from delivery
   checks.
9. **Peer text read as instruction is the measured G8 hazard** — ~1 run in
   5, mitigation honestly unproven, per-job isolation parked with hosting
   (D-189, D-169). A teammate's output is data under a named file; briefs
   are server-composed; no member ever acts on another's say-so because no
   member acts at all.
10. **Only the outbox acts, at Approve** (D-075, D-193's `stampOutbox`
    enforcement). N members converge on one deliverable, one outbox, one
    review. A checker improves what reaches review; it never authorises.
11. **Shared context is a per-turn tax** — ~2.9k chars measured at +14% per
    turn (D-190); the store's lines are input tokens on every turn (D-049).
    Handoffs are file pointers under distinct names, not pasted bodies.
12. **No role-file edits ship with this.** Any role/skill text change moves
    BM25 under every role (D-117; 163-prompt replay owed via
    `scripts/matcher-replay.ts`). Team protocol lives in per-job briefs,
    which are routing-inert. No new class either: a new `jobClass` pays the
    G5 tax (first ~3 runs strangled learning its rate) — members run as the
    roles they already hold, so every leg prices off existing history.
13. **One Windows machine** (D-169, D-175). Members share one CPU, one
    disk, one repo path; parallelism is bounded there, not at the API. And
    a server restart kills N paid runs instead of one — `serve` discipline
    matters more, not less.
14. **"Ran out of turns" carries no information about need** (D-022, D-025:
    a cut run reports `turnsAllowed + 1` and nothing more). Member
    arbitration by "who needed more" is unmeasurable by construction.
15. **The dominant loss is the turn wall** — 85% of absorbed spend, 42% of
    last week's total (D-157, D-192). A team is justified when N
    smaller-scoped runs each fit inside their walls where one big run dies
    at its own — and measured against exactly that, not against "felt
    faster".

## 3. The shapes

Four, ordered smallest first. Each names what it unlocks, the build against
real seams, the cost with today's figures, the evidence gate, and the
decisions it waits on. T1 and T2 are independent; T3 builds on T2; T4 is
the summit and waits on a trial.

### T1 — The check pass *(accountability first; smallest; the live felt need)* — **built and live-proven, D-194 + amendment: the loop ran twice end to end, the control passed n=2, and the refuted branch stands on fail-closed grounds — two seeding attempts could not make an honest run assert a falsehood**

**Unlocks:** "have it checked" on any job — a second agentling, in its own
session and sandbox, reads the delivered work against the brief and the
world (the same doors the primary had), recomputes what can be recomputed,
and files `CHECK.md`: a verdict per claim — confirmed / refuted / could not
check — plus what it would fix. The review card shows the verdict beside
the deliverable. Nothing auto-sends while a check is pending or refuted.

This is the recap audit's scenario 6 made real: *"content-truth is the
reviewer's half — no gate reads a brief against the world."* On 2026-08-18
the mail desk's first brief said "no mail arrived" against 16 real messages,
and it was approved and sent before the advice landed. A checker with the
mail door would have read the same inbox and refuted the claim for ~the
cost of the brief itself. D-163 is the proof the mechanism catches what the
author cannot: a run that wrote a false claim does not re-read it into a
true one; a second process does (D-021's own principle, promoted from
compiled tools to sessions).

**Build:**
- `Job.checked?: boolean` set at the desk (a toggle on the plan card, a
  per-schedule flag, or the words "have it checked" — under-firing, quoted
  back). On delivery, the completion hook queues the check job exactly as
  `queueNextStep` queues a chain step — it does not exist before then
  (constraint 4).
- The check job: own prompt ("check the delivered work: <title>" — a
  distinct sentence, so no recipe/approval collision), `forceRole` to the
  primary's role (same doors, same class rate — a clerk checks a clerk),
  preferring a *different* agentling when one holds the role (D-021 says
  the second process is what matters; a second identity is better when
  available). The primary's deliverables + brief arrive in `input/` under
  distinct names, framed as material to verify, with the withholding flag
  riding (constraint 7).
- The checker cannot act: its job carries no channels, so any outbox it
  writes refuses at `stampOutbox` by the seam D-193 built. Reader and actor
  stay separate people — D-133's own line, applied internally.
- Review: the primary's card gains the verdict row (confirmed / refuted /
  unchecked, with the checker named). `autoBlocker` gains one clause: a
  pending or refuting check blocks auto-send; the check job's completion
  re-runs `autoSendIfApproved` on the primary, so a scheduled brief under
  standing approval sends itself only once its check confirms — the false
  mail brief, structurally prevented, with no waiting status anywhere (the
  primary sits honestly in review the whole time).
- Learning both ways: a refuted claim appends to the *primary's* memory as
  a lesson ("checked: X was refuted — verify Y before claiming"), which is
  the learns-only-from-clean-successes trap deliberately dodged — the
  disagreements are the training signal. The checker's close-out banks its
  own method like any run.
- The feed labels check jobs (`Queue.continuationDetail` precedent), and
  `bench:intake` gains the "have it checked" sentences as labelled cases.

**Cost, honestly:** a second session at the primary's class rate — ~6–10c
to check a Haiku desk brief, ~30–75c to check a session job (session mean
today: 75.1c). Checking a 9c brief roughly doubles it; that is what a
second opinion costs, and the toggle is per job and per schedule so Brian
prices it case by case. No new class, no class tax, no matcher movement.

**Evidence gate:** seed a wrong claim (the mutation discipline, live): run
a job whose RESULT.md asserts something false about the world, and the
check must refute it by name. Then arm it on the mail desk's schedule and
let a real morning run prove the auto-send hold. Also the honest control:
one check pass on a *correct* brief, to see the false-positive rate before
trusting the verdict row.

**Decisions it waits on:**
1. Checker identity — different agentling required when the role has two
   holders, else same agentling in a fresh session *(recommended)*; or any
   holder regardless.
2. Whether the checker may spend more than the primary — recommend no:
   its quote is capped at the primary's class ceiling.

### T2 — Work parties *(parallel fan-out on the user's own list; the speed goal)* — **built and live-proven, D-195 + amendment: the gate ran both arms. The machinery held whole (concurrent hands, same-tick gather, one card, attribution survived its spot-check with genuine triangulation); the honest verdict is depth, not speed — a healthy solo run was faster and cheaper, and the party bought 86 turns of independent coverage at 2.3× charged. Parties are for work whose value scales with independent coverage, priced per hand at the desk**

**Unlocks:** "research A, B and C — as a team of three" runs three hands at
once, each on its own item, then a gather job assembles one deliverable
from their reports. Same-class parties (3 researchers, 2 analysts) on any
divisible non-repo work: research, analysis, documents, level packs. Wall
clock falls from the sum of the legs to the slowest leg plus the gather —
and each hand's scope is smaller, so each fits inside the turn wall that
kills 42% of spend today (constraint 15 is the honest pitch, speed is the
felt one).

**Build (the steps machinery, generalised from a line to a fan):**
- Party grammar at the desk, under-firing: a number plus worker-words
  ("team of 3", "three researchers", "split between two workers") in
  instruction position; bare "team" never claims (constraint 5). Quoted
  back per D-184: *read "a team of three" as a party of 3 — run solo
  instead?* — one click off, and the desk shows the per-hand quotes and
  the sum before Start.
- The split itself, v1, is deterministic: the sentence's own enumeration
  (a list of ≥2 items) becomes the hands' prompts — user language, never
  the app's judgement. A party asked for with no visible list parks at the
  desk with the honest sentence ("name the pieces, or let a planner
  propose them — T3") rather than guessing.
- `Job.party?: {id, hand: n, of, gather?: boolean}` — the fan twin of
  `Job.step`. All hands queue at Start (genuinely runnable, no waiting
  status); the gather job does not exist until the last hand delivers —
  the completion hook counts delivered siblings exactly as `queueNextStep`
  fires today. Hands carry distinct prompts (their list items), so recipe
  keys and approvals stay honest per constraint 2/D-179's taxonomy; the
  chain-wide flags (withholding, answers) ride every hand and the gather.
- The gather: `forceRole` per the work (scribe for prose, analyst for
  numbers — decided at the desk, shown on the card), hands' reports and
  deliverables forwarded into `input/hand-1/…` namespaces with reports as
  `input/hand-1-report.md` (the D-146 renaming discipline, N-wide), its
  brief naming each file as material — pointers, not pasted bodies
  (constraint 11). It produces the one deliverable, and the outbox if the
  sentence sends: hands carry no channels, so a hand that tries to send
  refuses at the existing seam.
- Failure shape: a failed hand is named in the gather's brief and the
  review card ("hand 2 of 3 failed at its wall; its scope is uncovered"),
  and the gather proceeds if at least one hand delivered — the Gaps-section
  posture, applied to parties. All hands failing fails the party. A failed
  hand is absorbed per D-012; delivered hands are charged inside their own
  quotes.
- Caps: hands ≤ 3 v1 (with the gather, 4 jobs — `MAX_STEPS`' own bound,
  and a 3-hand party leaves 2 stations free; 4 hands is one constant away
  if wanted, at the cost of hogging the level). Cancel on the party
  cancels every live hand.
- World and feed, v1: each hand works its own station — zero sim change,
  and the world honestly shows three agentlings working at once (that IS
  the feature, visible). Feed lines label "hand 1 of 3 — <its item>"; the
  inbox shows one delivery row for the gather with hands grouped under it.
  The huddle-at-one-signpost presentation is deliberate polish for later
  (an x-offset table; the pack checker's stand positions were validated as
  points, so widening them is its own small check).

**Cost, honestly:** a 3-hand researcher party quotes ~3 × class ceiling +
gather — ceilings summing $2.50–3.50 against today's quotes running a
median 2.2× real cost, so expect ~$1.20–1.80 spent on a party that would
have been one 75c–$2 run. Roughly 1.5–2× the money for ~⅓ the wall clock
and headroom under every wall. The desk shows the sum before Start; the
decision is priced, per job, by the person paying.

**Evidence gate:** one real 3-item research question Brian actually wants
answered, run once solo and once as a party (redo door, `noRouter`, turns
pinned — the D-190 instrument lessons): compare wall clock, spend, wall
deaths, and whether the gathered brief's per-item citations survive the
spot-check. And `bench:intake` gains the party sentences — including the
ones that must NOT claim ("post it to the team on Slack").

**Decisions it waits on:**
1. Hand cap — 3 *(recommended)* or 4.
2. Gather-role default — desk-picked with an override *(recommended)*, or
   always the matched role of the whole sentence.
3. Whether a party is offered on scheduled sentences v1 — recommend no
   (schedules repeat verbatim and multiply cost silently; a schedule that
   wants a party says so in its own sentence later).

### T3 — The planned party *(bounded goal decomposition, through review)* — **built and live-proven, D-196 + two amendments: the first press caught a contract trap (a defensively-forbidden send refused as a send — the brief now bans mentioning sends at all), and the whole-gate then ran clean: the split judged at review before any hand ran, Approve firing the hands with their load-bearing marks, and the reviewed plan's own consistency checks producing the briefing's doubly-sourced central claim**

**Unlocks:** "take this hard job, split it between three workers sensibly"
— the case Brian actually named, where nobody wrote the list. A plan job
(architect class, read-only tools) studies the task and writes
`PARTY.json`: the hands' prompts, scopes, and which are load-bearing. The
desk shows the proposed split with per-hand quotes — and queueing the
hands happens only when Brian starts them. The model proposes; the person
disposes; the promote grammar answers M6's trust question the way it
answered the organizer's (D-132: the manifest is reviewed, then replayed).

This is deliberately the third shape, not the first: it is the open-ended
decomposition SPEC parks in M6 as a trust question, and G3's note stands —
"inventing steps is a different trust question". The answer here is that
the invention is *reviewed before it runs*, exactly like MOVES.json. The
never-guess rule holds because the app still never silently acts on its
own decomposition; it prices one and shows it.

**Build:** small once T2 exists — a plan-tier job whose deliverable is the
validated `PARTY.json` (schema checked at the seam like every contract),
a desk card rendering the proposed hands with the sum, Start queueing them
as an ordinary T2 party. The plan run costs one architect-class session
(~30–60c today) and is quoted like any job. Load-bearing hands make the
failure shape explicit: a load-bearing hand failing halts before the
gather rather than delivering around a hole.

**Evidence gate:** one genuinely hard real task; the plan's split judged
by Brian *before* any hand runs (that judgement is the feature working);
then the party's outcome against the same task run solo, same protocol as
T2's gate.

**Decisions it waits on:**
1. Whether the plan is a separate reviewed step *(recommended — Approve is
   the fan-out)* or the desk trusts `PARTY.json` and queues immediately.
2. Whether the planner may propose cross-class hands (architect + scribe +
   worker) v1, or same-class only until one cross-class party has landed.

### T4 — Repo parties *(the summit; waits on a trial)*

**Unlocks:** 2–3 masons/workers on one repository at once — the flagship
"challenging coding task" case — with disjoint scopes and one merged
patch.

**Build (the shape, if the trial says yes):**
- The plan (T3) partitions by paths; every hand's brief names its scope
  and forbids the rest; each hand clones as today and leaves its own
  `DIFF.patch`.
- The gather is a mason with a fresh clone: applies the hands' patches in
  order (plain `git apply` — `--3way` tested negative here, D-noted in the
  repo-review file), reconciles any refusal by hand with the patches as
  material, runs the check the brief names, and emits the one `DIFF.patch`
  the review shows. Promote stays exactly what it is: one patch, one
  apply, one job promoted. The hands' clones are scratch, swept as today.
- Merge and identity are the D-163 lessons paid up front: hands never
  share a working copy, only the gather writes the final patch, and the
  gather's brief carries the ordering.

**Why it waits:** this is where the goals meet their measured risks —
clone-carrying turns cost 2.7c against 3.0c flat but repo runs die at
walls most, patches can conflict, and a gather that reconciles badly
produces a plausible wrong merge, the one outcome worse than a loud
failure. So T4 is gated on a pre-registered paired trial (D-190's
protocol, with its two corrections: pin granted turns, and decide up front
what artefact proves each hand stayed in scope — the patch's own paths
are that artefact, checkable in code):

> Bar, set before any number exists: over 3 paired tasks, the party arm
> must cut wall-clock ≥ 30% AND wall-deaths per task, at ≤ 1.8× solo
> spend, with the merged patch applying clean and its checks passing on
> every pair. Miss the bar → repo parties stay unbuilt, T1–T3 stand on
> their own, and this section records the numbers.

**Decisions it waits on:** the trial itself, then: scope enforcement
(brief-only v1 *(recommended)* vs a code check that a hand's patch stayed
inside its declared paths — the code check is small and honest, do it),
and hand cap 2 vs 3 for repo work.

---

## 4. What none of this changes

Approve stays the send, the install, the apply and the replay; a checker
informs a verdict and never renders one. Sessions still cannot hire,
queue, spawn, message each other live, or act — every fan-out is decided
at the desk by the person paying, priced before Start, visible in the
world while it runs. `Job.brief` carries every team instruction; prompts
stay verbatim; role files stay untouched (no matcher movement, no class
tax). Nothing is billed above its quote; failed hands are absorbed; the
turn wall stays the enforcement. The sandbox plus review stays the
guarantee, one machine stays the boundary, and the world stays
presentation — three agentlings at three signposts is the feature drawn
honestly with zero sim risk.

## 5. Recommended order

| # | Shape | Why this position | Rough size |
|---|---|---|---|
| 1 | T1 check pass | Live felt need (the false brief); smallest; teaches the peer-file grammar | ~a day |
| 2 | T2 parties | The speed goal on the safest work; all join machinery lands here | 2–3 days |
| 3 | T3 planned party | Brian's named case; small once T2 exists; trust answered by review | 1–2 days |
| 4 | T4 repo parties | The summit; gated on the pre-registered trial | 2–3 days + the trial |

T1 alone is a complete, honest feature. T2+T3 deliver the stated goals for
everything except repo work. T4 is earned by its trial or honestly
declined by it — either outcome is a result.
