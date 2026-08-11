# OneDrive exit — the migration plan (drafted 2026-08-11, D-152 session)

Working doc on `GAPS.md`'s precedent: execute, record the result as a
DECISIONS entry, delete this file. Decided-to-plan on Brian's 2026-08-11
review; the execution day is his pick.

**Why.** OneDrive has caused two incident classes the junction cannot fix:
replayed file events restarting the server minutes after an edit, killing
paid sessions (D-140), and sync CPU starvation failing 15 tests by load
alone (2026-08-10). Serve-mode discipline mitigates; moving the repo out
ends the family.

**Target.** `C:\Users\MSI\Dev\Agentlings` — outside OneDrive, outside the
MSIX-redirected AppData trees (same class as `C:\Users\MSI\Tools`, the
Blender precedent).

## What is actually path-keyed (measured, not guessed)

- **One live key**: `.agentlings/levels/hq/level.json` → `"repoPath":
  "C:\\Users\\MSI\\OneDrive\\Escritorio\\Agentlings"` (hq's clones come
  from it). home-chores / training-ground / ui-check: empty.
- **Historical only**: per-job `.session.json` / `.closeout.json` rows
  carry old absolute paths — records of finished runs, read by nothing
  that plans future work. Left as history, like ledger rows.
- **Memory dir slug**: `~\.claude\projects\
  C--Users-MSI-OneDrive-Escritorio-Agentlings\memory` — the slug derives
  from the project path, so the new path gets a new slug. Copy the memory
  dir (its git repo included) to the new slug; verify the derived name
  empirically on the first session at the new path BEFORE deleting the
  old (do not guess the slug format).
- **Not keyed**: `.env` (0 hits), `.claude/launch.json` (0 hits), git
  remotes, the Blender install, T5's schedule (rides `.agentlings/`,
  moves with the tree; downtime collapses to one catch-up firing, D-103).

## Execution day (fleet idle; ~1–2 h, reversible until the final delete)

1. **Preflight**: `jobsRunning` 0 fleet-wide; stop the server; push both
   repos; pause OneDrive.
2. **Copy, don't move**: robocopy the tree to the target EXCLUDING
   `node_modules` and `.claude\worktrees` (the two locked husks stay
   behind and die with the old tree — the junction plan becomes moot).
3. **Rewire**: hq `repoPath` → the new path; fresh `npm install` at the
   target.
4. **Memory**: copy the memory dir to the new slug (verify slug first,
   step above); old dir stays until the new one is proven loaded.
5. **Verify** (the gate): full suite green at the target; `npm run serve`
   up; hq jobs/ledger intact through the API; one level renders in the
   browser; a session at the new path sees MEMORY.md.
6. **Decommission**: delete the old local tree; the OneDrive cloud copy
   is Brian's separate call (keep as archive or delete online). Rewrite
   PROJECT.md's Environment section (the OneDrive block retires to a
   line); DECISIONS entry with the evidence; delete this file.

**Timing note**: not within the hour before a scheduled firing (T5 is
Wednesdays 09:00) unless the catch-up firing is acceptable — it is, by
design, but a clean window is cleaner.
