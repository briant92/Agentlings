# Agentlings

Behavioral base adapted from the Karpathy-inspired CLAUDE.md
(https://github.com/multica-ai/andrej-karpathy-skills), followed by
project-specific instructions. Where they conflict, project-specific wins.

## Behavioral guidelines

**Tradeoff:** These guidelines bias toward caution over speed. For trivial
tasks, use judgment.

### 1. Think Before Coding

**Don't assume. Don't hide confusion. Surface tradeoffs.**

Before implementing:
- State your assumptions explicitly. If uncertain, ask.
- If multiple interpretations exist, present them - don't pick silently.
- If a simpler approach exists, say so. Push back when warranted.
- If something is unclear, stop. Name what's confusing. Ask.

### 2. Simplicity First

**Minimum code that solves the problem. Nothing speculative.**

- No features beyond what was asked.
- No abstractions for single-use code.
- No "flexibility" or "configurability" that wasn't requested.
- No error handling for impossible scenarios.
- If you write 200 lines and it could be 50, rewrite it.

Ask yourself: "Would a senior engineer say this is overcomplicated?" If yes,
simplify.

### 3. Surgical Changes

**Touch only what you must. Clean up only your own mess.**

When editing existing code:
- Don't "improve" adjacent code, comments, or formatting.
- Don't refactor things that aren't broken.
- Match existing style, even if you'd do it differently.
- If you notice unrelated dead code, mention it - don't delete it.

When your changes create orphans:
- Remove imports/variables/functions that YOUR changes made unused.
- Don't remove pre-existing dead code unless asked.

The test: Every changed line should trace directly to the user's request.

### 4. Goal-Driven Execution

**Define success criteria. Loop until verified.**

Transform tasks into verifiable goals:
- "Add validation" → "Write tests for invalid inputs, then make them pass"
- "Fix the bug" → "Write a test that reproduces it, then make it pass"
- "Refactor X" → "Ensure tests pass before and after"

For multi-step tasks, state a brief plan:
```
1. [Step] → verify: [check]
2. [Step] → verify: [check]
3. [Step] → verify: [check]
```

Strong success criteria let you loop independently. Weak criteria ("make it
work") require constant clarification.

**These guidelines are working if:** fewer unnecessary changes in diffs, fewer
rewrites due to overcomplication, and clarifying questions come before
implementation rather than after mistakes.

---

## Project: Agentlings

A personal orchestration tool with Lemmings-style presentation: a horde of
small agentlings marches through a side-view 2D world, picks up real coding
jobs, works them in per-job sandboxes, and delivers results for review.

Greenfield, started 2026-07-29. Solo developer (Brian).

- `PROJECT.md` — the working rules for this repo. Imported below, so it is
  resident every session and everything in it applies.
- `SPEC.md` — what the product is, milestone by milestone.
- `AGENTLING.md` — what one agentling can do, tagged Live / Partial / Not built.
- `DECISIONS.md` — why each choice was made and what proved it. Opened on
  demand, never imported.
- `HORDE.md` — the board of the expansion line (D-235 → D-257), closed
  2026-09-03 (D-281): the fourteen tickets in order, the three premises it
  had wrong, and how the machine was left. Opened on demand. It exists because job deliverables live under the gitignored
  `.agentlings/`, so a plan nobody condensed into the repo is a plan one sweep
  from gone. The demand line that followed (D-283) lives on the issue
  tracker, not in a file.

@PROJECT.md

## Agent skills

### Issue tracker

GitHub Issues on `briant92/Agentlings`, via the `gh` CLI. See `docs/agents/issue-tracker.md`.

### Triage labels

The five default labels, each named as its role (`needs-triage` … `wontfix`). See `docs/agents/triage-labels.md`.

### Domain docs

Single-context: `CONTEXT.md` at the root is the glossary; decisions are `D-` entries in `DECISIONS.md`, never a `docs/adr/`. See `docs/agents/domain.md`.
