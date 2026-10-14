# Agentlings

The glossary for the Hireable Horde line — the words the plan, the board and
the decisions use, pinned to one meaning each. Definitions only; the reasons
live in `DECISIONS.md`, the capabilities in `AGENTLING.md`.

## Language

**Score**:
Real work done under supervision — a job on a real level that Brian would
otherwise have done by hand, promoted or auto-sent, with every refusal and
failure counted as demand. It is what the Hireable Horde is measured by,
counted weekly from the ledger and the job records. A `done` nobody reviewed
is not yet real work, and a check of another job is never counted: the job
it checked counts once, by Brian's verdict.
_Avoid_: hireable count, coverage percentage, KPI

**Demand**:
Work the horde should have done and did not, from two sources: what it
refused or failed on a real level, counted by the app, and what Brian did by
hand and names each week, one issue each. An item leaves the log when the
horde has scored it, or when what it needs is owed by a person.
_Avoid_: backlog, wishlist, feature request

**Report row**:
A schedule row the app composes itself (`report: realwork`): its firing
sends last week's score as an ordinary send in review, at $0 with no model
and no door, and earns standing approval like any other. The score never
counts it.
_Avoid_: report job, flywheel, digest

**Real level**:
Any level not named for a proof or a check — HQ, home-chores and
training-ground alike. Whether a job there was real work is decided by its
verdict, never by the level's name.
_Avoid_: production, live level, practice room

**Platform**:
Agentlings as extensible — any door, any act type, any MCP server a user adds
— for one operator per install, wherever that install runs. Never
multi-tenant. The catalog is written for any business, not for the operator
at hand.
_Avoid_: product, service, "any user" (meaning a second person on one install)

**Install**:
One operator's copy of Agentlings: one secrets file, one data directory, one
ledger, jobs running as that operator. A laptop and a container the operator
owns are the same thing; what differs is only whether the operator's own disk
is under it, which decides which doors the install can open.
_Avoid_: instance, deployment, tenant

**Reference install**:
The hosted install the maintainer keeps with no real keys, so that the
template others deploy from has something it is proven against. It does no
real work and its score is never counted.
_Avoid_: staging, demo, production

**Hosted**:
Said of an install with no operator disk under it. A capability tagged *Not
available hosted* is one such an install refuses at its probe — repo work
from a local path, the folder organizer, OCR, the knowledge store over
folders, supervised live acting.
_Avoid_: cloud, remote, online

**Catalog**:
What Settings offers to connect: a browse over the public MCP registry, which
fills the add-a-connection form and is verified by reading the server's own
tool list on connect, plus a *verified here* shelf of doors someone on this
install has authenticated to, each with its source and date.
_Avoid_: suggestions, curated list, shelf (for the registry half)

**Outreach**:
The horde holding a thread with a named counterparty across several exchanges
under a commitments policy — what it may promise, when it must escalate to
Brian. A single reviewed send, or the one threaded reply, is a send, not
outreach.
_Avoid_: chat, conversation, messaging, presence

**Sensitive**:
An act a second act cannot undo — money moved, a document signed, a payroll
period closed, a first message to a stranger, a public post. Sensitive acts
are approved one by one by Brian, always; nothing earns standing above them.
_Avoid_: risky, important, dangerous

**Standing authority**:
Permission earned for a non-sensitive act to run without Brian, inside an
allowlist of targets and under per-act and per-day caps that plain code
checks before review is offered. Outside the list or above a cap, the act
drops back to approve-each. A schedule or trigger rule is standing authority
to *run*: its firing holds exactly the doors the rule names, and none by
default. Standing approval (D-082) is the one built instance, for sends.
_Avoid_: autonomy, trust, leash

**Trigger rule**:
A schedule row that fires on mail arriving — a Gmail query the server polls
— instead of on a cadence. Like any schedule it is standing authority to
run, and holds only the doors it names.
_Avoid_: webhook, listener, automation

**Wire file**:
A transfer batch (a bank *nómina*) composed here as a deliverable and
uploaded for Brian to authorise with the bank's own token. Composing one is
ordinary work; the app never calls a payment endpoint.
_Avoid_: payment, transfer, wire (the act the bank performs)

**Credential**:
What a door holds to reach a system: an API key, an OAuth token (rotated by
the door's own store where the provider rotates it), or a certificate file.
A portal username and password, or a 2FA device, is never one.
_Avoid_: password, login, secret (for anything the app holds)

**Door**:
A connection a run may be granted to *reach* a system from inside its
sandbox — the web, a browser, GitHub, search, BLS, the calendar, the mailbox,
any MCP server a user added. A door reads; a sending channel is not a door.
_Avoid_: tool (for the connection), integration, plugin

**Channel**:
A way a message reaches or leaves the horde. Inbound channels are polled by
the server — Telegram, Gmail, SMS — never delivered to a public endpoint. A
voice note is a file on a channel, transcribed on this machine into the
sentence the desk takes.
_Avoid_: webhook, integration

**Act**:
A change to the world outside the sandbox, composed by a run as a typed
record, validated by plain code, shown at review, and performed by the
server on Approve. A send is the one act type built; a prepared sheet that
Brian keys in himself is a deliverable, not an act.
_Avoid_: action, tool call, write (for what the app performs)

**Verdict**:
What a reviewed job receives — promote, discard or clear — and everything
performing it entails: the gates that may refuse it by name, the acts it
carries out on Approve, and the settlement that stamps the job, records the
approval and prices the work. One verdict, whoever gives it: a person at the
desk, or the app under a standing approval.
_Avoid_: resolve (the stamp alone), approval (one of the three), review outcome

**Supervised live acting**:
A run driving a visible browser on an allowlisted domain, in a profile Brian
logged into himself, for one job he queued by hand and is watching. It never
earns standing, a trigger rule can never hold it, and closing the window
ends it.
_Avoid_: browser automation, headless acting, autonomous browsing

**Team**:
The set of standing instructions Brian wrote — schedules, trigger rules,
chains — plus the sentences he queues. Brian is the manager; nothing
dispatches work but him.
_Avoid_: horde (the crew, not the instructions), manager trade, orchestrator

**Hireable**:
The coverage benchmark's grade for an occupation — most of its duties covered
or partial, every acting duty with a supervision row. It is a map of where the
crew cannot go, never the score.
_Avoid_: progress, headline

**Refusal**:
A sentence the desk was handed that claims a shelf-of-never row — a payment,
a licensed act, an act on the world, a send on a channel refused by decision
— or names a capability graded not built, whether or not it is queued anyway.
Ordinary work is never one.
_Avoid_: rejection, error, blocked job

**Intake**:
What the horde does with a sentence before any job exists: one reading of
it — the shape it licenses (plain, chain, party or party plan), its role,
the channels it settles, its quote and its questions — shown at the desk as
the card and performed at Start or at a firing. The card and the job are
the same reading, never two.
_Avoid_: parsing, planning, submission, dispatch, desk (the surface that
shows a reading)

**Way in**:
Any caller that hands intake a sentence — Start, a schedule or trigger rule
firing, a chain queuing its next step, a check pass, a party's hands and
gather, pack authoring. A way in says which shapes it admits; it never
decides the shape itself.
_Avoid_: entry point, route (for the notion), source
