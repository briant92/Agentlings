# Artwork

Source images dropped in by hand: references to work from, and renders to
quantize into a backdrop. **Inputs, not outputs.**

Put anything here. Nothing in this folder is loaded by the app at runtime —
`web/public/packs/<slug>/` is where an installed pack lives, and that is the
only place the app reads a world from.

## The contents are gitignored, deliberately

This README is tracked; everything beside it is not.

A folder people drop images into fills up with things this project has no
right to redistribute — screenshots taken as reference, stock art under a
licence nobody re-read, an image model's output whose terms changed last
month. `LEVELPACK.md` is already strict about this for packs, for the reason
that applies twice over here: **a file in this repository makes its licence
this project's problem**, and "free" routinely still means
attribution-required or redistribution-forbidden.

So the rule is the split, not a judgement call about any one file:

- **`Artwork/` — inputs, untracked.** Reference material, working files,
  anything you are still deciding about. Use whatever you like here; it never
  leaves your machine.
- **`web/public/packs/<slug>/` — outputs, tracked, and each carries its own
  `provenance` string that the checker refuses to let you omit.**

Anything that crosses from the first to the second needs its provenance
written down first. That is not ceremony — D-111's pack was kept partly
because its provenance was better than the hand-written one it replaced.

## Tools that read from here

```bash
npm run pack:quantize -- Artwork/whatever.png out.png --colors 128
```

Reduces an image to a backdrop-sized palette and reports what it cost, plus a
`-crew` preview with crew stand-ins and the rim over it, because the question
is never only "did it survive" but "can anybody be seen standing on it"
(D-107, D-108).
