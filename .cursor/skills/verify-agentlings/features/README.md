# Agentlings Feature Map index

Materialized memory for agents driving Agentlings live. Each map has:

1. **Sub-features** — what the surface includes
2. **How to get to it (user POV)**
3. **Driving with CLI** — `node scripts/control-agentlings.mjs`
4. **Gotchas**

| Map | Surface | Where in the app | Priority |
| --- | --- | --- | --- |
| [desk.md](./desk.md) | the work bar and the parcel desk | inside a level, under the world / from the parcel pile | P0 |
| [world.md](./world.md) | the side-view 2D world | inside a level, `main` | P0 |
| [inbox.md](./inbox.md) | finished work | inside a level, right-hand aside under the terminal | P1 |

**Status:** honest stubs. PROVE_STATUS not yet; Nest owns the prove.

**Source of truth:** `web/src/` (screens, panels, world), `CONTEXT.md` for the
words, `DECISIONS.md` for why — not this folder alone. The app has no deep
links: every screen is one URL and the click path is the route. Update a map
when the DOM hooks or the click path drift; never fix a product bug by editing
a map. Never write `AGENTLINGS_PASSWORD`, an API key or a cookie into a map.
