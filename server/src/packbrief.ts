import {
  EXIT_X,
  MAX_STATIONS,
  SPAWN_X,
  STATION_BASE_X,
  STATION_SPACING,
  THEME_SLOTS,
  WORLD_WIDTH,
} from '@agentlings/shared';
import { PACK_FILE } from './packcontract';

/**
 * What a session is told before it authors a world (M4).
 *
 * The parts most likely to drift are read from the code rather than typed
 * here — the slot list, the anchor names, where the props stand. A brief that
 * teaches a format by describing it from memory goes stale the first time the
 * format moves, and the session has no way to notice.
 *
 * It stays deliberately short on taste and long on constraints. What a
 * whaling deck should look like is the session's job; what will fail the
 * checker is ours, and every rule below is one the checker actually enforces.
 */
export function packBrief(taken: readonly string[] = [], reference?: string): string {
  // A picture to work from changes the job enough to be said up front, and
  // says what the format cannot do with it. D-113 measured both halves: a
  // session reads an image accurately and reasons about it, and the ops
  // vocabulary cannot reproduce a rendered painting at any budget.
  const fromReference = reference
    ? `

## You have been given a picture to work from

\`input/${reference}\` is a reference image. **Open it and look at it** before
you write anything — it is the best statement of what is wanted, better than
the sentence.

**You cannot reproduce it, and you are not being asked to.** The ops are a
fixed set of idioms, not a drawing language: soft shading, photographic
texture and painted detail are not expressible, and a pack that tries to
trace the picture will come out worse than one that reads it. Take from it
the things the format *can* carry — the staging and where the ground sits,
the palette and how light and dark are distributed, the depth layers, the
shapes that repeat and at what rhythm — and compose your own scene from those.

Say in \`RESULT.md\` what you took from the reference and what you knowingly
left, and **name the reference in \`provenance\`**: a pack drawn from someone
else's picture inherits a question about that picture's licence, and the file
is the only place that question can be answered later.

There is a PNG decoder in the repository already — \`decodePng\` and
\`countColours\` in \`server/src/raster.ts\`, run with \`npx tsx\`. Use it to
crop or measure the reference rather than writing your own; the last run that
needed one spent a third of its turns rebuilding it beside the copy it had.`
    : '';

  const slots = THEME_SLOTS.join(', ');
  const stations = Array.from(
    { length: MAX_STATIONS },
    (_, i) => STATION_BASE_X + i * STATION_SPACING,
  ).join(', ');
  // What is already installed. The first real run picked a slug that was
  // taken, and nothing told it until Approve refused — after the money was
  // spent. A list is cheaper than a wall.
  const inUse =
    taken.length > 0
      ? `\n\nAlready installed, so **not available**: ${taken.map((s) => `\`${s}\``).join(', ')}.`
      : '';

  return `You are authoring a LEVEL PACK: a whole world for a level to be set in.

## The deliverable

Write **${PACK_FILE}** at the root of your working directory:

    { "slug": "<your-slug>", "pack": { …the pack… } }

\`slug\` is the folder name it installs under: lower-case words joined by
hyphens. Nothing else installs the pack — you do not copy it anywhere, and you
have no tool that could. The user reviews what you wrote and approving it is
what installs it.

**Name it from the description you were given, never from the examples in
this brief.** Every placeholder below written as \`<like this>\` is yours to
fill in; the concrete values are illustrations of the *format*, not defaults
to adopt. A world called what the example is called, installing where the
example installs, is the one outcome this brief is not asking for.${inUse}${fromReference}

Write nothing else at the top level except a short RESULT.md saying what you
made and why it looks the way it does.

## Write it as you go

Put a small **valid** pack on disk early — slug, name, provenance, the theme
slots, the ground, one region of ops — and grow it in place from there. The
clock is real, and a cut run delivers only what is already written: a pack
with three regions on disk is three regions delivered, while a whole world
composed in your head and written at the end is nothing. That exact run has
already happened once.

## The pack

    {
      "name": "<Your World>",        // shown on the level card
      "provenance": "…",             // required — see below
      "viewH": 450, "groundY": 388,  // world height, and the ground line
      "rim": "<a dark slot>",        // set this — see Legibility
      "theme": { …16 slots… },
      "backdrop": { "scrim": {…}, "ops": [ … ] },   // optional
      "ops": [ … ],                  // the foreground; required, non-empty
      "ambient": [ … ]               // optional
    }

**theme** must define all ${THEME_SLOTS.length} slots, each an integer colour
0x000000–0xffffff: ${slots}.

The names come from the cave they were written for, not from what they must
be. Spend them however the world needs — a sea level can put water in
\`grass\` and its swell in \`grassDark\`. The checker asks that a colour
resolves, never what it is called.

**ops** is the drawing vocabulary. It is a fixed set of idioms, not a
language, and anything not listed here does not exist:

- \`rect\` {x,y,w,h,color,alpha?} and \`circle\` {x,y,r,color,alpha?}
- \`poly\` {points:[[x,y],…],color,alpha?}
- \`repeat\` {at:[x,…],of:[ops]} — children drawn once per offset, relative
- \`band\` {axis?:'x'|'y',from,to,step,of:[ops]} — children at a regular step
- \`speckle\` {x,y,w,h,count,light,dark} — seeded grain
- \`veins\` {x,y,w,h,count,color,alpha?} — seeded stepped cracks
- \`tufts\` {x,y,w,h,count,height,color,alt?} — upright tufts along a line
- \`ceiling\` {step,minY,maxY,fill,edge,flatNear?,hang?} — the lid of the world

**ambient** effects: \`drips\`, \`flyer\`, \`motes\`, \`beam\`, \`glints\`, \`clock\`.

## Coordinates

Every coordinate is a number, or an anchor with an optional offset written as
a string: \`"groundY-40"\`, \`"worldWidth"\`, \`"viewH"\`, \`"spawnX"\`,
\`"exitX"\`. One regex parses these — \`"groundY*2"\` and \`"groundY-spawnX"\`
are refused.

## The working surface — leave it clear

The world is ${WORLD_WIDTH} wide. The renderer draws its own props on top of
your scene at fixed positions, and they are not yours to move:

- the doorway at exitX ± 34 (exitX is ${EXIT_X})
- deliveries stacked just left of it
- ${MAX_STATIONS} signposts at x ${stations}
- the crew walk the ground line; they drop in at spawnX (${SPAWN_X})

So: keep the band just above \`groundY\` uncluttered, and do not put detail
where it will be covered. \`groundY\` below 58 is refused outright — the
doorway alone needs that much headroom above the line.

The built-ins are 320 tall with the ground at 258. If your world wants sky,
say so: 450/388 keeps the same 62px below the line and spends the rest on air.

## Legibility

**Set \`rim\`** to a dark slot. It draws a permanent one-pixel outline around
the crew, and it is what stops a busy backdrop swallowing them.

Do not rely on the scrim for this. It was measured: a scrim separates the crew
from the ground by *brightness*, so it only helps while the backdrop stays on
one side of their own. On a bright ground it drags the picture through the
mid-tones the crew occupy and can bury one completely. Use the scrim for
depth; use the rim for being seen.

## Provenance

\`provenance\` is required and must say where this came from and under what
terms. A pack lands in the user's repository, so its licence becomes their
problem. If you drew it yourself from the format, say so plainly. If a world
is inspired by a book or a film, name the source and keep to what is yours:
compose your own scene, and do not reproduce a studio's designs, marks or
names.

## Check your work before you finish

    npm run pack:check -- ${PACK_FILE}

It names the op and the slot for anything wrong. A pack that fails this cannot
be installed, so a run that ends without passing it has delivered nothing.

## And look at it — checking is not seeing

    npm run pack:render -- ${PACK_FILE} world.png

This draws your pack through the very interpreter the app draws it with, and
writes a PNG. **Open it and look.** A pack can pass the checker and still be
a picture nobody can read; the checker only knows that every colour and
coordinate resolved.

The renderer also measures what the checker cannot. It stands a crew-sized
block at each of the places agentlings actually stand and prints the
luminance separation between the scene behind them and each of the eight crew
gowns, 0–100. Under 5 a gown disappears into your background; the \`rim\`
outline is what rescues it, and the renderer says whether yours can. **Quote
those numbers in your result**, and if something vanishes, either change what
the pack draws behind that spot or set \`rim\` to a slot that contrasts with it.

Two things the render deliberately does not show: ambient effects, which are
animated, and the doorway, signposts and deliveries, which the app draws on
top of your scene.

## Finish early, then improve — and improve the right thing

**Get a complete pack rendered and looked at well before you are halfway
through your turns.** Not a sketch to expand — the whole scene, every layer,
end to end. Everything after that is improving what exists.

**What separates the worlds that worked from the ones that did not is
variation and light, never size.** The two best so far are a ship's
between-decks whose lamps throw light cones down the hull, and a glasshouse
built on one-point perspective with the sun as the brightest thing in it.
The weakest was a jungle of identical palms at an even interval, one flat
foliage texture, and no light direction anywhere — and it was the *largest*
of the four. So when you look at your render, fix what a picture is judged on:

- **A rhythm too even to be alive.** Anything repeated wants its spacing,
  size or tint varied, or it reads as wallpaper.
- **No light.** Decide where the light comes from and let it fall — a
  gradient, a cone, a bright edge, something darker on the far side.
- **Nothing to look at.** One place the eye goes first, and depth behind it.
- **A band that reads as a stripe** rather than as a thing seen from a
  distance.

None of those is fixed by adding more ops, and none of them is fixed by
removing ops either. A count is not a target in either direction: a world was
once cut down to a fifth of its ops on that reasoning and came back thinner
and worse.

**Keep back enough turns to write \`RESULT.md\`.** A run that is cut delivers
its pack but reports nothing: what you saw, what you chose, and what you would
do next are lost, and those are worth more to the next run than the ops are.
If you are running short, write the result *first* and improve afterwards.`;
}
