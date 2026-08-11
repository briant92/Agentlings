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
export function packBrief(
  taken: readonly string[] = [],
  reference?: string,
  /** The user asked for a pre-rendered 3D backdrop: the plate is the point. */
  wantsPlate = false,
): string {
  // A picture to work from changes the job enough to be said up front, and
  // says what the format can and cannot do with it. D-113 measured the ops
  // half: a session reads an image accurately and reasons about it, and the
  // ops vocabulary cannot reproduce a rendered painting at any budget. D-143
  // added the other half: a *plate* can carry a rendered picture — one the
  // session renders itself, never the reference laundered through a page.
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
If the world wants a rendered picture *as its backdrop*, that is what a plate
is for (below) — and the plate must be your own scene: **never embed the
reference image itself in a plate page**; a screenshot of someone else's
picture is their picture with extra steps.

Say in \`RESULT.md\` what you took from the reference and what you knowingly
left, and **name the reference in \`provenance\`**: a pack drawn from someone
else's picture inherits a question about that picture's licence, and the file
is the only place that question can be answered later.`
    : '';

  // The plate-first lead, when the button said so: the run must not deliver
  // a lovely ops world with the one thing the user asked for missing.
  const plateLead = wantsPlate
    ? `

## This world's backdrop is a rendered plate — that is the ask

The user chose a pre-rendered 3D backdrop. **Render the back plate first**
with the \`render_plate\` tool and *look at the PNG*, then compose the theme
and the foreground ops around what you rendered. A pack without
\`backdrop.plates\` does not deliver this job, however good its ops are.
The format carries up to three plates and an occlusion strip (below): a far
plate plus one cut-out layer drifting apart under the pointer is the
difference between a wallpaper and a place — add layers once the back
plate is good. The full discipline — the import URL, the ready title, the
composition rules, the crew band — is in your \`plate-design\` skill; the
format rules are below.`
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
example installs, is the one outcome this brief is not asking for.${inUse}${plateLead}${fromReference}

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
      "backdrop": {                  // optional
        "plates": ["plate.png"],     //   a rendered picture behind everything — see below
        "scrim": {…}, "ops": [ … ]
      },
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
language, and anything not listed here does not exist. Every op is an object
whose **\`"op"\` field names the idiom** — \`{"op": "rect", "x": 0, …}\` —
and there is no other name for that field; the checker refuses \`kind\`,
\`type\` or anything else by name:

- \`rect\` {x,y,w,h,color,alpha?} and \`circle\` {x,y,r,color,alpha?}
- \`poly\` {points:[[x,y],…],color,alpha?}
- \`repeat\` {at:[x,…],of:[ops]} — children drawn once per offset, relative
- \`band\` {axis?:'x'|'y',from,to,step,of:[ops]} — children at a regular step
- \`speckle\` {x,y,w,h,count,light,dark} — seeded grain
- \`veins\` {x,y,w,h,count,color,alpha?} — seeded stepped cracks
- \`tufts\` {x,y,w,h,count,height,color,alt?} — upright tufts along a line
- \`ceiling\` {step,minY,maxY,fill,edge,flatNear?,hang?} — the lid of the world

**ambient** effects: \`drips\`, \`flyer\`, \`motes\`, \`beam\`, \`glints\`, \`clock\`,
and \`plateloop\` {file,x,y,w,h,dx,dy} — a small raster tile scroll-looping
inside a region (a waterfall, drifting cloud); live-only, like the rest.

## The backdrop can be a rendered picture (plates — up to three, plus a strip)

What the ops cannot paint, **plates** can carry: raster files drawn behind
everything, back to front — plates, then backdrop ops, then scrim, then
foreground (D-142, D-143, v2).

- Render each yourself with the \`render_plate\` tool: one self-contained
  HTML page, three.js importable from \`http://three.local/three.module.js\`
  (the only URL that resolves during the render), \`document.title =
  "ready"\` once the scene has drawn. It writes the PNG at your sandbox
  root already quantized to the 128-colour backdrop budget, and its receipt
  reports the numbers the checker will hold it to. **Read the PNG and look
  at it** — then iterate; the render is cheap. The full discipline is in
  your \`plate-design\` skill.
- Name the files in \`backdrop.plates: ["far.png", "mid.png"]\`, back to
  front, and leave them at the sandbox root beside ${PACK_FILE}. They ride
  your delivery: the review shows the composite, and Approve installs them
  with the pack.
- **The back plate is the picture** — fully opaque, mode \`plate\` (2000×900)
  or \`plate-overscan\` (2120×900, and the app drifts it gently with the
  pointer). **Every plate above it is a cut-out** — mode \`cutout\` or
  \`cutout-overscan\`, rendered on a transparent page background: its holes
  are what the plates behind show through, and the door snaps its alpha
  hard. An overscanned layer drifts at its own rate (nearer = less); an
  exact-size layer holds still. Depth comes from the drift — a far
  skyline, a mid ridge, and they move apart under the pointer.
- \`backdrop.occlusion: "near.png"\` is the strongest depth cue: a cut-out
  drawn **in front of the crew**, drifting against the pointer. It may be
  opaque only near the screen edges — never over the signpost span
  (x ~230–770), never over a standing place (spawn 80, the signposts, exit
  940, widened by the drift margin when it drifts) — the checker refuses
  both by name. Think an arch leg, a foreground rock, rigging at the frame's
  edge.
- **The 128-colour budget is the layer's, not the file's**: one palette
  across every raster you ship (plates, strip, tiles). Render every layer
  from the same scene with one lighting rig and the union stays small; if
  the checker names an over-budget union, \`npm run pack:quantize --
  far.png mid.png near.png\` cuts one palette across them.
- **The finish is a choice** (D-151). The default is the quantized finish
  above — the pixel world's own. \`"finish": "smooth"\` in \`backdrop\`
  switches this world to the photographic finish: plates render at native
  resolution outside the pixel canvas, soft alpha is welcome, and there is
  no colour budget — render every layer with \`finish: "smooth"\` on the
  door and never quantize. Pick it only when the ask is painterly or
  photographic; the crew stay crisp pixel art in front either way, and the
  contrast is the point.
- \`backdrop.depthMap\` (quantized finish only): a grayscale map, exactly
  the back plate's size, and the app displaces the picture under the
  pointer — continuous depth from one image. Render the map with
  \`finish: "smooth"\` so its gradients stay smooth. Honest cost:
  displacement smears at hard silhouettes; where an edge matters, a real
  cut-out layer beats the map.
- \`rim\` stays **required** the moment any raster rides — the checker
  refuses a plate without one.
- \`pack:check\` validates every file beside ${PACK_FILE} (sizes, the
  cut-out contract, occlusion placement, the union budget); \`pack:render\`
  composites the whole stack under your ops so the picture you judge is the
  picture the app will draw.

There is a PNG decoder in the repository already — \`decodePng\` and
\`countColours\` in \`server/src/raster.ts\`, run with \`npx tsx\`. Use it to
crop or measure any image in front of you rather than writing your own; the
last run that needed one spent a third of its turns rebuilding it beside the
copy it had.

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
