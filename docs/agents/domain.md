# Domain Docs

How the engineering skills should consume this repo's domain documentation when exploring the codebase.

## Before exploring, read these

- **`CONTEXT.md`** at the repo root: the glossary. Definitions only — no implementation, no reasons.
- **`DECISIONS.md`** at the repo root: every settled question with the evidence that settled it, as `D-` entries. Read its *By theme* index before reopening anything settled, and read the entries that touch the area you are about to work in.

If `CONTEXT.md` doesn't exist, **proceed silently**. Don't flag its absence; don't suggest creating it upfront. The `/domain-modeling` skill (reached via `/grill-with-docs` and `/improve-codebase-architecture`) creates it lazily when terms actually get resolved.

## File structure

Single-context repo:

```
/
├── CONTEXT.md        ← the glossary
├── DECISIONS.md      ← the decision record (D-001 …), in place of docs/adr/
└── packages/ server/ web/
```

**This repo keeps no `docs/adr/`.** Where a skill would write an ADR — a decision that is hard to reverse, surprising without context, and the result of a real trade-off — append a `D-` entry to `DECISIONS.md` instead: the next ID, both of its indexes updated in the same edit, the decision plus what proved it. Cite entries by ID (`D-219`), never by title or line number. Where an entry and the code disagree, the entry stands and the code is what drifted.

`AGENTLING.md` is the derived capability surface (Live / Partial / Not built) and `HORDE.md` the open board for the expansion line; neither is a glossary or a decision record. Read them for what is built and what is owed, not for what words mean.

## Use the glossary's vocabulary

When your output names a domain concept (in an issue title, a refactor proposal, a hypothesis, a test name), use the term as defined in `CONTEXT.md`. Don't drift to synonyms the glossary explicitly avoids.

If the concept you need isn't in the glossary yet, that's a signal: either you're inventing language the project doesn't use (reconsider) or there's a real gap (note it for `/domain-modeling`).

## Flag decision conflicts

If your output contradicts an existing `D-` entry, surface it explicitly rather than silently overriding:

> _Contradicts D-219 (payments on the shelf of never), but worth reopening because…_
