# Feature Map: Inbox

**Status:** stub — PROVE_STATUS not yet. Selectors read from `web/src/`, not
yet measured live by this skill.

## Sub-features

- **Inbox** (`web/src/panels/Inbox.tsx`, `.inbox`) — finished work: what the
  crew produced, still there after the feed has scrolled on. Opens a job's
  review from a row; a file opens the file viewer.
- **Terminal feed** (`web/src/panels/Terminal.tsx`) — the live feed above the
  inbox, `following` / `paused`.

## How to get to it

1. Title screen → **START** (or **CONTINUE**).
2. Level picker → a level card.
3. In the level: right-hand aside (`.side`) → terminal → the inbox beneath it.

## Driving with CLI

```bash
node scripts/control-agentlings.mjs doctor
node scripts/control-agentlings.mjs open-inbox         # URL + click path + selectors
node scripts/control-agentlings.mjs screenshot --out .agentlings/evidence/inbox-cold.png
```

`open-inbox` reports where the inbox is; it does not click. Entering a level
and capturing the aside is Phase-2 drive — not built.

## Gotchas

- The inbox is rendered inside the terminal panel, not as its own screen; there
  is no URL for it.
- Empty on a fresh level — a delivery has to exist before there is anything to
  capture. Do not stage one with real credentials from this skill.
- A hosted install may refuse supervised live acting without a desktop. Prefer
  loopback.
- Never paste `AGENTLINGS_PASSWORD` or any key here or in a caption.
