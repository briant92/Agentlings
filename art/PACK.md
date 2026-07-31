# Art packs

Everything the crew is drawn with is data. This is what a pack has to
contain, whoever made it — you, a free pack from itch, or a commission.

Check anything before installing it:

```
npm run art:check -- path/to/atlas.json
```

Install it by putting the two files in `web/public/art/`. There is no build
step and no rebuild; reload the page. If a pack is missing or broken the app
silently uses its own art, so a bad pack degrades rather than breaks.

## The two files

**`agentling.png`** — one image holding every frame, transparent background.

**`agentling.json`** — an Aseprite-shaped atlas naming the frames:

```json
{
  "frames": {
    "stand": { "frame": { "x": 0, "y": 0, "w": 18, "h": 20 } }
  },
  "animations": {
    "walk":    ["walk-contact", "walk-down", "stand", "walk-high"],
    "work":    ["work-raised", "work-mid", "work-struck", "work-mid"],
    "deliver": ["deliver-a", "deliver-b"]
  },
  "meta": { "image": "agentling.png", "size": { "w": 162, "h": 20 } }
}
```

Cycles name their frames rather than spanning a range, because frames get
reused — the pickaxe passes through `work-mid` on the way out and back.
Aseprite's `frameTags` cannot express that, so `animations` is what the app
reads.

## Rules

- **Three cycles, by name: `walk`, `work`, `deliver`.** Missing one means the
  whole pack is refused — half the crew freezing mid-stride is worse than art
  that is merely not yours.
- **Every frame the same size.** The world anchors sprites by their feet; a
  ragged pack jitters as it animates.
- **Any resolution.** The built-in art is 18×20, but a pack at 36×40 or 32×32
  is fine — the world scales to the frame height, so a finer pack reads as
  more detail rather than as a giant.
- **Facing right.** The renderer flips horizontally for leftward movement, so
  draw one direction only.
- **Feet on the bottom edge.** The sprite is anchored bottom-centre onto the
  ground line.
- **Transparent, not a background colour.** Fully transparent pixels are left
  alone when the palette is applied; a matte colour would be snapped and show
  up as a halo.

## Colour

Anything loaded is snapped onto the DB32 palette
(`packages/shared/src/palette.ts`). Art already drawn in DB32 comes through
untouched — our own sheet is byte-identical after a snapping pass — and art
that is not gets pulled onto the ramp, which is what stops an outside pack
looking grafted on.

You do not have to author in DB32. You do have to accept that colours will
move if you do not.

## Licensing

A pack lands in this repository, so its licence becomes this project's
problem. Record where each pack came from and under what terms before
installing it. Free does not mean unconditional: most permissive pixel-art
licences still require attribution, and some forbid redistribution — which
is exactly what committing it here does.
