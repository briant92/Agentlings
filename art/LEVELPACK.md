# Level packs

A whole world a level can be set in, alongside the four built in. Where an
art pack ([PACK.md](PACK.md)) is the crew, a level pack is the place: the
palette, the terrain, the backdrop behind it.

Check it, then install it by dropping the folder into `web/public/packs/` and
reloading. There is no build step and no restart — the server reads the
folder on every request.

```
npm run pack:check -- web/public/packs/moby-dick/pack.json
```

The folder name is what a level stores, so it is the pack's identity. A pack
named after a built-in (`cave`, `chalkboard`, `household`, `marble`) is
refused rather than merged, because which one won would otherwise depend on
directory order.

`web/public/packs/moby-dick` is a worked example: The Pequod, 450 tall.

## What a pack has to contain

```jsonc
{
  "name": "The Pequod",          // shown on the level card and the palette picker
  "provenance": "…",             // required — see Licensing
  "viewH": 450, "groundY": 388,  // how tall the world is, and where the crew stand
  "rim": "rockEdge",             // optional; see Legibility
  "theme": { "void": 2236468, … },  // all 16 slots, as numbers
  "backdrop": {                  // optional
    "plates": ["far.png", "mid.png"],  // rasters behind everything, back to front — see The plates
    "occlusion": "near.png",     // optional cut-out IN FRONT of the crew, edges only (v2)
    "scrim": { "color": "void", "alpha": 0.38, "from": 300 },
    "ops": [ … ]
  },
  "ops": [ … ],                  // the foreground: required, non-empty
  "ambient": [ … ]               // optional idle life
}
```

A pack **is** a scene, plus a palette and provenance. Anything the format can
express, a pack can use; anything it cannot, no pack can smuggle in. The ops
vocabulary is the one described in `packages/shared/src/scene.ts` — a set of
parameterised idioms, deliberately not a drawing language.

## Rules

- **Every slot, or none.** All 16 have to be numbers between `0x000000` and
  `0xffffff`. A pack that defines only the slots it happens to use will throw
  the first time the renderer reaches for one it forgot, mid-level.
- **Slots are yours to repurpose.** They are named after the cave they came
  from, not after what they must be. The Pequod spends `grass` on the sea and
  `grassDark` on its swell; Arrakis could spend `void` on sky. The checker
  cares that a colour resolves, not what it is called.
- **Coordinates are numbers or anchors.** `"groundY-40"`, `"worldWidth"`,
  `"spawnX"`, `"exitX"`, `"viewH"`. One regex parses them; it is not an
  expression evaluator, so `"groundY*2"` is refused.
- **Leave the working surface alone.** The crew walk the ground line and the
  props sit at fixed x: the doorway at `exitX ± 34`, deliveries just left of
  it, and five signposts from x 240 every 130. `groundY` under 58 is refused
  outright — the doorway alone needs that much headroom.
- **Height is yours.** The built-ins are 320 with the ground at 258. A pack
  wanting sky says so; 450/388 keeps the same 62px below the line and spends
  the rest on air.

## Legibility

Set `rim`. A backdrop is the one thing that can swallow the crew, and the rim
— a permanent one-pixel outline in a slot of your choosing — is what stops it.

The scrim is **not** that device, and it was measured rather than assumed
(D-107). It separates sprite from ground by *value*, so it only helps while
the backdrop stays on one side of the crew's own luminance. On a bright
ground it drags the picture through the mid-tones the gowns occupy: on a sand
backdrop it took one agentling's separation from 20.9 to 0.3 — the same
luminance as the ground it stood on. Use the scrim for depth. Use the rim for
being able to see anybody.

## Colour

Unlike an art pack, a level pack is **not** snapped to DB32 — it brings its
own palette and the checker only asks that the numbers are colours. Staying on
the DB32 ramp is still what makes a pack look like it belongs beside the crew,
who are snapped.

The plate is the deliberate exception (D-108): it carries its own quantized
palette, budgeted at 128 colours and dithered, because snapping a soft-shaded
render to 32 colours destroys it. The split has a stated boundary: everything
drawn from theme slots stays DB32-adjacent; the picture behind it does not.

## The plates

`backdrop.plates` names pre-rendered rasters drawn beneath everything —
plates back to front, then backdrop ops, then the scrim, then the foreground
(D-142, v2: D-148). The rules, all checked before a pack installs:

- **One to three plates, back to front.** The first is the picture and must
  be **fully opaque**; every plate above it is a **cut-out** — binary alpha
  (on-or-off, no soft edges) with at least one hole.
- **A plain `.png` name beside `pack.json`** — no paths; the name is joined
  to the pack folder, so like the slug it is a security boundary.
- **Sized to the pack's own geometry**: `1000×viewH`, or `2000×(2·viewH)`
  for a 2× author-and-downsample — or, for a plate that **drifts** under
  the pointer, `1060`/`2120` wide (the +60 overscan, D-148). Width is the
  opt-in: exact-size plates hold still, overscanned ones move at
  renderer-owned rates (far most, nearer less). Height never overscans.
- **`backdrop.occlusion` is the strip in front** (v2): a cut-out drawn
  above the crew, drifting against the pointer when overscanned. Opaque
  only clear of the signpost span and of every standing place — each
  widened by the drift margin exactly when the strip drifts; the checker
  refuses both by name.
- **`plateloop` ambient entries** scroll a small raster tile (≤512×512)
  inside a region — a waterfall, drifting cloud. Live-only, like every
  ambient idiom; the tile is a pack file under all the same rules.
- **At most 128 colours — for the layer, not per file**: one union across
  every raster the pack carries. `npm run pack:quantize -- far.png mid.png
  near.png` cuts one palette across them; single-file mode still previews
  the crew standing on it.
- **`backdrop.finish: "smooth"` opts the whole layer out of the palette
  world** (D-151, amending D-108 — quantized stays the default): plates
  render as native-resolution DOM images under a transparent world canvas,
  soft alpha welcome, no colour budget, drift unrounded. Registration
  rules — sizes, the opaque back, strip placement, rim — hold unchanged.
- **`backdrop.depthMap`** (quantized finish only): a grayscale map at the
  back plate's exact size; the app displaces the picture under the pointer.
  Data, not picture — outside the colour union. Honestly: it smears at
  hard silhouettes; prefer a real cut-out layer where an edge matters.
- **`rim` is required** the moment any raster is present — the outline is
  the one legibility device that survives standing in front of a picture.
- **Drafts carry every raster as files beside `PACK.json`** (D-143): a run
  renders each through the `render_plate` tool's modes (`plate`,
  `plate-overscan`, `cutout`, `cutout-overscan`, `tile` — cut-outs are
  snapped binary in the door and report coverage), names them in the pack,
  and leaves everything at the sandbox root. Harvest runs the raster rules
  against the sandbox, the review composites the whole stack into the
  preview, and **Approve copies every referenced raster before
  `pack.json`** — the json is the commit point, and approving again
  completes a half-landed install.

`npm run pack:check` on a `pack.json` — installed folder or sandbox draft —
runs every rule above; `npm run pack:render` composites the stack under the
drawn scene (occlusion over the stand-ins, as the app draws it) and reports
per-position crew separation.
`web/public/packs/amber-basin` (painted, folder-dropped),
`web/public/packs/ember-gate` (three.js through the door, carried by a
draft) and `web/public/packs/wine-dark-strait` (four designer legs) are the
worked examples. Provenance matters doubly here — a plate is
exactly the kind of file that arrives from a renderer, a model or a
marketplace, and its licence lands in this repository with it.

## Licensing

`provenance` is required, and the checker refuses a pack without it. This is
not ceremony: a pack lands in this repository, so its licence becomes this
project's problem, and "free" routinely still means attribution-required or
redistribution-forbidden — which committing it here is. Record where it came
from and under what terms, in the file, before installing it.

Worlds drawn from books and films need the same care. Public-domain source
text is one question; a studio's designs, marks and names are another, and the
answer is not the same for a private tool as for anything shared.
