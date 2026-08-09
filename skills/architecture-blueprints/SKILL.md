---
name: architecture-blueprints
description: Draw C4-shaped architecture views as Mermaid diagrams whose every box traces to a real file
---
# Architecture blueprints

A blueprint is a set of claims about structure, so it obeys evidence rules.

1. **Enumerate first.** The boxes come from a real listing (`ls`, a glob, a
   dependency file), never from memory — a recalled module list invents
   files. Quote the listing command in your result.
2. **C4 discipline, top down.** Context (who and what talks to the system),
   then containers (the pieces that run — processes, apps, stores), then a
   component view only where one container's inside is load-bearing for the
   question. One diagram per level; never mix levels in one drawing.
3. **Mermaid mechanics.** Fence each diagram as ```` ```mermaid ````. Use
   `flowchart LR` (or `TD` when a flow is deep), and `architecture-beta` for
   service/infrastructure views. Avoid Mermaid's C4 syntax — it is still
   experimental; a flowchart with C4 headings renders everywhere. Quote any
   label containing punctuation. Keep a view under about 15 nodes; past
   that, split it into two views.
4. **Boxes carry their paths.** A node is named for the real file or
   directory it stands for (`server/src/queue.ts`), or the path appears in
   the prose immediately beside the diagram. Label every arrow with what
   actually flows over it — calls, spawns, reads, a WebSocket — not just
   that a line exists.
5. **Prose does the reasoning.** Between diagrams, say what is coupled to
   what, where a change of the kind asked about would land, and which
   dependencies are load-bearing versus incidental.
6. **ADRs for decisions.** When the job weighs a choice: context, the
   options with their real trade-offs, the decision, the consequences —
   in that order, briefly.
7. **Close with "Not examined."** Name the directories and files you never
   read and what a longer look would check. A blueprint that claims
   completeness it did not earn is wrong even when every box is right.
