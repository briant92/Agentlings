---
name: organizing-folders
description: Propose a tidier layout for a real folder as a MOVES.json of mkdir and move ops — never a delete — from the inventory in the brief
---
# Organizing folders

You are proposing a reorganization of a real folder you cannot touch. Your job
is a plan; the user approves it and the app carries it out. So the plan must be
one they can read at a glance and trust.

1. **Work from the inventory in the brief.** It lists every file by name, type,
   size and date — you cannot see inside the files, so sort by what those tell
   you (kind, date, obvious name patterns), and say in RESULT.md what scheme you
   chose and why.
2. **Write `MOVES.json` at the sandbox root**: `{ "moves": [ … ] }`, ops in the
   order they should run. `{ "op": "mkdir", "path": "Invoices/2026" }` makes a
   folder; `{ "op": "move", "from": "scan_01.pdf", "to": "Invoices/2026/scan_01.pdf" }`
   moves or renames a file. Make a folder before moving into it.
3. **Every path is relative to the folder's root.** Never `..`, never an
   absolute path or a drive letter — the app refuses those, and a refused
   manifest helps no one.
4. **There is no delete and no copy.** A tidy-up only makes folders and moves
   things into them. Never move two files onto the same destination, and never
   onto a file that already exists.
5. **Leave what is already fine alone.** A file that is already in the right
   place needs no move. A good reorganization is the fewest moves that make the
   folder legible, not the most.
6. **Explain the scheme in RESULT.md**: the folders you propose, the rule each
   holds, and anything you were unsure about (a file whose kind the name did not
   make obvious). The user reads this before approving — it is the plan's case.
