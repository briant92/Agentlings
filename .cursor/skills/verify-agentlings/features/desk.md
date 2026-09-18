# Feature Map: Desk

**Status:** stub — PROVE_STATUS not yet. Selectors read from `web/src/`, not
yet measured live by this skill.

## Sub-features

- **Work bar** (`web/src/panels/WorkBar.tsx`, `.work-bar`) — where a sentence
  is handed to the horde; shows the intake card (shape, role, quote,
  questions) before Start.
- **Parcel desk** (`web/src/panels/ParcelDesk.tsx`, `.modal.parcels`) — the
  pile of deliveries awaiting a verdict, opened from the parcel pile in the
  world; "work the pile" walks the review flow job by job.
- **Review modal** (`web/src/panels/ReviewModal.tsx`) — one delivery: files,
  turns strip, the verdict (promote / discard / clear).

## How to get to it

1. Title screen → **START** (or **CONTINUE** for the last level).
2. Level picker → a level card.
3. In the level the work bar sits under the world canvas.
4. Click the parcel pile in the world to open the parcel desk.

Behind a gate (off loopback, or `AGENTLINGS_PASSWORD` set) step 1 is preceded
by the login screen, which this skill cannot pass.

## Driving with CLI

```bash
node scripts/control-agentlings.mjs doctor
node scripts/control-agentlings.mjs open-desk          # URL + click path + selectors
node scripts/control-agentlings.mjs screenshot --out .agentlings/evidence/desk-cold.png
```

`open-desk` reports where the desk is; it does not click. `screenshot` captures
the cold open (login or title screen). Entering a level and capturing the work
bar is Phase-2 drive — not built.

## Gotchas

- No deep link to a level or to the desk. The URL is the same for every screen.
- Everything at the desk is gated on `/api`: with the gate on and no session
  the panels get 401 and the app returns to the login screen.
- A hosted install may refuse supervised live acting without a desktop. Prefer
  loopback.
- "Desk" in `CONTEXT.md` is the surface that shows a reading; the reading
  itself is *intake*. Do not conflate them in evidence captions.
- Never paste `AGENTLINGS_PASSWORD` or any key here or in a caption.
