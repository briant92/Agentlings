---
name: verify-agentlings
description: >-
  use this when verifying Agentlings live — the desk, the world, the inbox —
  against a running local install
---

# Verify Agentlings

Closed-loop verification for the Agentlings app: doctor → drive → screenshot →
evidence. Prefer the control CLI over throwaway click scripts.

**Repo:** `briant92/Agentlings`
**Where it runs:** this machine, loopback. API/WS on `http://127.0.0.1:4600`,
web dev server on `http://127.0.0.1:5173`. After `npm run build` the API port
serves the web bundle too (one origin, D-272). Override with `AGENTLINGS_BASE_URL`.
**CLI:** `node scripts/control-agentlings.mjs`
**Feature maps:** `features/`
**Owner of the prove:** Nest. **PROVE_STATUS:** not yet.
**Firewall:** Agentlings only — not FO/IGPL. Never put `AGENTLINGS_PASSWORD`,
API keys, `.env` contents or session cookies into maps, evidence or captions.

## Launch

1. Prefer a loopback install: `npm install`, copy `.env.example` → `.env` (Brian
   fills it; do not invent credentials), then `npm run serve` (stable, no file
   watching — D-140). Use `npm run dev` only while changing server code.
2. One-origin: `npm run build`, then the server alone on `:4600`. This is what a
   container does; `dev`/`serve` do not need it.
3. On loopback with no `AGENTLINGS_PASSWORD` there is no gate (D-271). Anywhere
   else the gate is on and the app opens on the login screen. This skill does
   not hold the password: stop at login evidence and mark `inconclusive`.
4. A hosted install refuses supervised live acting and anything else that needs
   the operator's desktop or disk (README: *What an install cannot do hosted*).
   Do not drive those there; prefer loopback or a Nest-owned install.

## Doctor

```bash
node scripts/control-agentlings.mjs doctor
# optional: --dry-run  (prints the planned probes only)
```

Probes `GET /api/session` — the one ungated route — on each candidate origin
and reports `{ required, authed }`. No server answering → `ok: false` with an
`inconclusive` line and exit code 1. **Do not claim green.**

## Drive

Read the Feature Map for the surface first, then the CLI:

```bash
node scripts/control-agentlings.mjs open-desk
node scripts/control-agentlings.mjs open-inbox
node scripts/control-agentlings.mjs screenshot --out .agentlings/evidence/title.png
```

All commands print **JSON** on stdout. The app is a single-origin SPA with no
deep links — every screen is the same URL — so `open-*` returns the URL plus
the click path and the DOM selectors, not a route. `screenshot` captures what
the app shows on a cold open (login or title screen); reaching a level is the
Phase-2 drive step and is not built yet.

## Evidence

- Save screenshots and JSON under `.agentlings/evidence/` (gitignored) or a
  PR-attached path. Never under `features/`.
- A claim of done requires an artifact path **or** an explicit
  `inconclusive: …`. Matches PROJECT.md's definition of done: show the evidence.
- `npm test` (vitest) is complementary; it does not replace a live doctor →
  drive → screenshot. The repo's `scripts/prove-*-ui.mjs` scripts are the
  existing live probes and read `.env` themselves — this CLI never does.

## Cleanup

- Each CLI command closes the browser it opened.
- Do not leave headed browser windows on the shared desktop; supervised live
  acting is headed by construction and is not this skill's business.
- Do not commit `.env`, `browser-state*.json`, session cookies or evidence.
- `node scripts/control-agentlings.mjs cleanup` — best-effort note; no
  persistent control browser exists yet.

## Maintain

Audit Feature Map drift against `web/src/` (screens, panels, world) and
`DECISIONS.md`. PR only inside this skill directory and
`scripts/control-agentlings.mjs`; never "fix" a product bug by editing a map.
