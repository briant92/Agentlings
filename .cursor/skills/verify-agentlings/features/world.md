# Feature Map: World

**Status:** stub — PROVE_STATUS not yet. Selectors read from `web/src/`, not
yet measured live by this skill.

## Sub-features

- **World canvas** (`web/src/world/WorldCanvas.tsx`, `.world`) — the PixiJS
  side-view scene: the horde walking, working, resting; the parcel pile;
  hover outlines; emotes.
- **Header** — `◂ levels`, the level tag, the `live` / `connecting…` socket
  status, and `+ hire`, `crew`, `library`, `reading`.
- **Crew rail** (`web/src/panels/CrewRail.tsx`) — the roster beside the world;
  click an agentling for its profile.
- **Level packs** — the scene theme comes from the level; packs live under
  `web/public/packs/`.

## How to get to it

1. Title screen → **START** (or **CONTINUE**).
2. Level picker → a level card.
3. The world fills `main`; the socket status in the header should read `live`.

## Driving with CLI

```bash
node scripts/control-agentlings.mjs doctor
node scripts/control-agentlings.mjs screenshot --out .agentlings/evidence/world-cold.png
```

`screenshot` captures the cold open (login or title screen). Entering a level
and capturing the canvas is Phase-2 drive — not built. The canvas is WebGL:
a headless capture may render a blank `.world` where a headed one draws.

## Gotchas

- Server state is authoritative; the canvas only renders the world feed over
  `/ws`. A `connecting…` status means nothing on screen is current.
- `/ws` is behind the gate off loopback; the socket's close code is one of the
  two ways the app learns it was signed out.
- A hosted install has no desktop; anything that opens a headed window there
  is a refusal, not a detour. Prefer loopback.
- Never paste `AGENTLINGS_PASSWORD` or any key here or in a caption.
