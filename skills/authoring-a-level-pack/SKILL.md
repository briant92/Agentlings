---
name: authoring-a-level-pack
description: How to author, check and hand over a level pack — the PACK.json contract, slug rules, the ops vocabulary and layer order, the palette split, the rim and scrim, and the render-check loop. Use when writing a new world for a level, or reviewing one somebody else wrote.
---

# Authoring a level pack

A level pack is **a whole world a level can be set in**: the palette, the terrain,
the backdrop behind it. Where an art pack is the crew, a level pack is the place.

It is data, not code. A pack **is** a `Scene` plus a palette plus provenance —
it extends the renderer's own scene type rather than restating it, so a pack
cannot describe something the renderer would refuse to draw. Anything the format
can express, a pack can use; anything it cannot, no pack can smuggle in.

Install is a folder drop: put the directory in `web/public/packs/` and reload.
No build step, no restart — the server reads the folder on every request.

---

## 1. The contract

One `pack.json` per folder. Everything the checker demands, in order:

```jsonc
{
  "name": "The Pequod",             // required — shown on the level card and palette picker
  "provenance": "…",                // required — where it came from, under what terms
  "viewH": 450,                     // required — how tall the world is
  "groundY": 388,                   // required — where the crew stand
  "rim": "rockEdge",                // optional but do it — see §5
  "theme": { "void": 2236468, … },  // required — all 16 slots, as numbers
  "backdrop": {                     // optional
    "scrim": { "color": "void", "alpha": 0.38, "from": 300, "steps": 12 },
    "ops": [ … ]
  },
  "ops": [ … ],                     // required, non-empty — the foreground
  "ambient": [ … ]                  // optional idle life
}
```

**What the checker enforces**

| Field | Rule |
| --- | --- |
| `name`, `provenance` | non-empty strings, both |
| `theme` | all 16 slots present, each an integer `0x000000`–`0xffffff` |
| extra theme slots | warning — "nothing draws with" them |
| `viewH`, `groundY` | positive finite numbers; `groundY < viewH` |
| `groundY` | **≥ 58**, refused outright below it — the doorway alone needs that headroom |
| `viewH - groundY` | warning under 10px — the floor reads as a hairline |
| `ops` | present and non-empty; a pack with no foreground draws nothing |
| every colour name | must resolve to a slot this pack's theme defines — anywhere, at any nesting depth |
| every coordinate | a finite number, or a string the renderer's own parser accepts |
| `rim` | if set, must name a slot the theme defines |

The colour/coordinate walk is the half worth having. An unknown colour name
otherwise reaches the renderer as a **throw at draw time** — a level that will
not open, with a stack trace behind it. The checker turns that into a line
naming the op and the slot, before anything is installed.

The walk is driven by key names, not by the op union, so it reaches a colour
nested inside a `repeat` inside a `band`:

- **paint keys**: `color`, `light`, `dark`, `alt`, `fill`, `edge`, `tip`, `rim`
- **coord keys**: `x`, `y`, `w`, `h`, `at`, `from`, `to`, `minY`, `maxY`,
  `below`, `topLeft`, `topRight`, `topY`, `botLeft`, `botRight`, `botY`, and
  each half of every `points` pair

If you add an op with a new colour- or coordinate-typed field, add its key to
those sets or it goes unchecked.

### The 16 slots

`void`, `rock`, `rockLight`, `rockDark`, `rockEdge`, `accent`, `accentLight`,
`accentDark`, `grass`, `grassDark`, `wood`, `woodDark`, `stoneDark`, `flame`,
`flameCore`, `hover`.

**Every slot, or none.** A pack that defines only the slots it happens to use
will throw the first time the renderer reaches for one it forgot, mid-level.

**Slots are yours to repurpose.** They are named after the cave they came from,
not after what they must be. The Pequod spends `grass` on the sea and
`grassDark` on its swell; The Drained Pool spends `flameCore` on white noon
light; Arrakis could spend `void` on sky. The checker cares that a colour
resolves, not what it is called.

### Coordinates

Numbers, or anchor strings: `worldWidth`, `viewH`, `groundY`, `spawnX`, `exitX`,
with an optional integer offset — `"groundY-40"`, `"exitX+34"`.

One regex parses them. It is **not an expression evaluator**: `"groundY*2"` is
refused, and so is anything else arithmetic.

### Provenance

Required, and the checker refuses a pack without it. Not ceremony: a pack lands
in this repository, so its licence becomes this project's problem, and "free"
routinely still means attribution-required or redistribution-forbidden — which
committing it here is. Record where it came from and under what terms, **in the
file**, before installing.

Worlds drawn from books and films need the same care. Public-domain source text
is one question; a studio's designs, marks and names are another, and the answer
is not the same for a private tool as for anything shared.

A pack drawn from nothing still says so. The Drained Pool's line is the model:
it names the spec it was drawn against, states that no external image, font or
reference pack was used, names the palette, and concludes that no third-party
rights attach.

---

## 2. The slug

The **folder name is what a level stores**, so it is the pack's identity — not
`name`, which is only a label.

- lower-case words joined by hyphens: `^[a-z0-9]+(?:-[a-z0-9]+)*$`, e.g. `orlop-deck`
- 40 characters maximum
- **not** a built-in theme name — `cave`, `chalkboard`, `household`, `marble`
  are refused rather than merged, because which one won would otherwise depend
  on directory order
- **not** a slug already installed

This is a security boundary as well as a tidiness one: a slug becomes a
directory name, so anything with a separator, a drive letter or a `..` in it
would let a sandbox choose where on disk an approval writes.

The same rule lives in shared code precisely so the CLI checker and the install
cannot disagree — a slug the checker waves through and the install then refuses
is a wall a session cannot see coming. Where the taken list is known, the clash
is reported early; the alternative is finding out at Approve, after the money is
spent.

> Pick the slug **first** and check it. A name clash discovered at Approve has
> already cost a whole authoring run.

---

## 3. Ops: the vocabulary

Nine idioms. Deliberately **not** a drawing language — a set of parameterised
idioms, so that what a pack can say is what the renderer can be trusted to draw.

**Primitives**

| Op | Fields | Notes |
| --- | --- | --- |
| `rect` | `x, y, w, h, color, alpha?` | the workhorse — 55 of The Drained Pool's 96 ops |
| `circle` | `x, y, r, color, alpha?` | `r` is a plain number, not a coord |
| `poly` | `points: [x,y][], color, alpha?` | each half of each pair is a coord |

**Combinators**

| Op | Fields | Notes |
| --- | --- | --- |
| `repeat` | `at: Coord[], of: SceneOp[]` | draws children once per `at`, offset in **x**. Children are written around x 0 — negative x is normal |
| `band` | `axis: 'x'\|'y', from, to, step, of` | steps `from` → `to` by `step`, drawing children at each row/column |

**Textures** (seeded, deterministic)

| Op | Fields | Notes |
| --- | --- | --- |
| `speckle` | `x, y, w, h, count, light, dark` | 2/4/6px flecks, alternating the two slots, fixed alpha 0.6 |
| `veins` | `x, y, w, h, count, color, alpha?` | short drifting 2px trails; alpha defaults 0.8 |
| `tufts` | `x, y, w, count, height, color, alt?, alpha?` | 2px uprights with an occasional second blade in `alt`; alpha defaults 0.95 |
| `ceiling` | `minY, maxY, step, fill, edge, hang?, flatNear?` | a jagged roof mass with optional stalactites (`hang.spike`) and vines (`hang.vine`); `hang.clearOf` keeps an area free |

### Two gotchas that cost renders

**`band` with `axis: 'y'` only shifts `rect` and `circle` children, and only
when their `y` is a literal number.** A `poly` child, or a `rect` whose `y` is
`"groundY-40"`, is drawn at the same place on every row — the band silently
overdraws itself. Use `axis: 'x'` for anything else, or unroll it into `repeat`.

**Children of `band`/`repeat` are relative.** A child says `y: 0` (or `x: 0`)
and means "wherever this row is".

### Determinism

Each **top-level** op gets its own seed rather than sharing one stream, so
inserting an op does not reshuffle the grain of every op after it. Authoring
terrain means adding and removing things constantly, and a format where that
silently repaints the whole world is one nobody can work in. The backdrop is
seeded off its own base for the same reason: adding a rock to the foreground
must not reshuffle the grain of the sky.

Two consequences you can rely on: a pack looks the same every time it is drawn,
and a render diff after an edit is honest about what you changed.

### Ambient

`ambient` is optional idle life, and its entries are `fx` effects, not ops:
`{"fx":"motes", count, x, y, w, h}`, `{"fx":"flyer"}`,
`{"fx":"glints", points, strips}`. They are drawn by the live world, not by the
headless scene pass — so a render check will not show them. Keep the picture
legible without them.

---

## 4. Layer order

The renderer draws in exactly this order:

1. **`backdrop.ops`** — furthest back
2. **`backdrop.scrim`** — over the backdrop, under everything else
3. **`ops`** — the foreground
4. *the crew, props and doorway* — drawn by the world, not by your pack
5. *the sprite rim* — a permanent one-pixel outline, on top of the sprite

Within each list, ops draw in array order: later ops paint over earlier ones.

**Leave the working surface alone.** The crew walk the ground line and the props
sit at fixed x, which no pack can move:

- the doorway at `exitX ± 34`
- deliveries just left of it
- five signposts from x 240, every 130

Draw terrain that accommodates them. Anything you put at those coordinates will
be drawn over, or will draw over a control the player needs to see.

**Height is yours.** The built-ins are `viewH` 320 with the ground at 258. A
pack wanting sky says so: 450/388 keeps the same 62px below the line and spends
the rest on air.

---

## 5. Legibility: the rim, and what the scrim is not

**Set `rim`.** A backdrop is the one thing that can swallow the crew, and the
rim — a permanent one-pixel outline, in a slot of your choosing — is what stops
it. It is one field. There is no reason not to.

Pick a rim slot that contrasts with **your backdrop**, not with the crew. Its
whole job is to hold an edge against whatever is behind the sprite.

**The scrim is not that device**, and this was measured rather than assumed
(D-107). Mechanically it is bands of rising alpha from `from` down to `groundY`
(default 12 steps, tiled exactly so alphas never compound, rows snapped to whole
pixels so no bright seam appears between bands), then a solid remainder beneath
the ground line.

That means it separates sprite from ground **by value**, so it only helps while
the backdrop stays on one side of the crew's own luminance. On a bright ground
it drags the picture *through* the mid-tones the gowns occupy: on a sand
backdrop it took one agentling's separation from **20.9 to 0.3** — the same
luminance as the ground it stood on.

> **Use the scrim for depth. Use the rim for being able to see anybody.**

---

## 6. Colour: the palette split

Two palettes, two rules, and they are not the same rule.

**The crew are snapped to DB32.** DawnBringer's 32-colour palette is the master
the whole product draws from — themes, sprites, crew tints and any art dropped
in from outside all resolve to those 32 colours. Snapping is done with a
perceptually weighted nearest match (`2·dr² + 4·dg² + 3·db²` — green carries
most of perceived brightness, blue least; plain Euclidean RGB picks visibly
wrong greys), and fully transparent pixels are left alone so scaling cannot
bleed a tint into the edges.

**A level pack is not snapped.** It brings its own palette and the checker only
asks that the numbers are colours in range. You may go off-ramp deliberately —
The Drained Pool spends two near-whites DB32 does not have on blown-out noon
surfaces, and says so in its provenance.

But: **staying on the DB32 ramp is what makes a pack look like it belongs beside
the crew, who are snapped.** Off-ramp is a choice you should be able to justify
in a sentence, not a default. The measured version of this: flat crew blocks
against a richly-shaded background read as *pasted on* — a coherence problem,
not a legibility one, and the rim does not fix it (D-113).

**Raster backdrops are decided and not yet built** (D-108). `backdrop` takes
ops, not an image. When it lands it gets its own quantized budget rather than
DB32's 32 colours — 128 colours has been measured to hold a photographic
backdrop (4.37 error) where 32 destroys it (15.30). Until then, an image
backdrop is not something to attempt in a pack.

---

## 7. The render-check loop

Author blind and you will hand over a world nobody can be seen in. The loop:

```
edit pack.json
  → npm run pack:check -- web/public/packs/<slug>/pack.json      # will it load at all
  → npm run pack:render -- web/public/packs/<slug>/pack.json     # what does it look like, and what is the separation
  → look at the PNG
  → repeat
```

`pack:check` is the contract from §1: structure, all 16 slots, every colour name
and coordinate resolved. Fix every error; read every warning and either fix it
or be able to say why not.

`pack:render` draws the pack **through the app's own scene interpreter**, so
what it shows is what the live world shows — the same code path serves the live
world, the level card, the review preview and this headless renderer, and none
of them can show a pack a picture the others would not. It reports the
**separation** measure: how far the crew stand out from what is behind them.

Reading the number:

- Two packs, two failure modes, mirror images of each other. In one the gowns
  carry the picture and the rim contributes nothing (2.4); in the other the rim
  carries it (47.5) but a gown vanishes into the background. Both need looking
  at, and only one of them is visible in the number alone.
- **If separation will not rise however you tune it, the backdrop is inside the
  crew's own luminance ramp.** Move the background out of that band — do not
  keep adjusting the scrim. One pack sat at ~9.5 with no improvement reachable;
  moving its background out of the ramp took it to 17.6 in a single edit
  (D-112).
- Ambient `fx` are not in the render. Neither are the crew's own animations.
  Judge the still.

And look at the picture, not only the figure. The number cannot tell you the
horizon cuts a signpost in half.

---

## 8. Checklist before handing over

Run this list as written. Every row is something that has actually gone wrong.

**Identity**
- [ ] Slug chosen and checked: lower-case-hyphenated, ≤ 40 chars, not `cave`/`chalkboard`/`household`/`marble`, not already installed.
- [ ] `name` reads well on a level card; it is a label, the slug is the identity.

**Contract**
- [ ] `npm run pack:check` passes with **zero errors**.
- [ ] Every warning read, and each one fixed or consciously accepted.
- [ ] All 16 theme slots present, in range, no extras.
- [ ] `ops` non-empty.
- [ ] `groundY` ≥ 58 and comfortably below `viewH`; at least 10px of floor beneath the line.

**Licensing**
- [ ] `provenance` names the source and the terms — or states plainly that nothing external was used.
- [ ] If it derives from a book, film or third-party pack: the marks, names and designs question has been answered, not just the source-text one.

**Picture**
- [ ] `rim` is set, and its slot contrasts with the backdrop.
- [ ] The scrim (if any) is there for depth, not for legibility.
- [ ] `npm run pack:render` produces a PNG you have actually looked at.
- [ ] Separation measured and reported in the hand-over. If it is low, you have moved the backdrop out of the crew's luminance ramp, not just re-tuned the scrim.
- [ ] Nothing important sits under the doorway (`exitX ± 34`), the delivery spot just left of it, or the five signposts from x 240 every 130.
- [ ] The world reads without `ambient` — the fx are garnish.

**Hand-over**
- [ ] State the slug, the separation number, and any deliberate off-DB32 colours with the reason.
- [ ] Say what you did **not** do — an unrendered variant, an accepted warning, a compromise you would revisit.
