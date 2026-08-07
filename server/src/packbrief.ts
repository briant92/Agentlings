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
export function packBrief(): string {
  const slots = THEME_SLOTS.join(', ');
  const stations = Array.from(
    { length: MAX_STATIONS },
    (_, i) => STATION_BASE_X + i * STATION_SPACING,
  ).join(', ');

  return `You are authoring a LEVEL PACK: a whole world for a level to be set in.

## The deliverable

Write **${PACK_FILE}** at the root of your working directory:

    { "slug": "moby-dick", "pack": { …the pack… } }

\`slug\` is the folder name it installs under: lower-case words joined by
hyphens. Nothing else installs the pack — you do not copy it anywhere, and you
have no tool that could. The user reviews what you wrote and approving it is
what installs it.

Write nothing else at the top level except a short RESULT.md saying what you
made and why it looks the way it does.

## The pack

    {
      "name": "The Pequod",          // shown on the level card
      "provenance": "…",             // required — see below
      "viewH": 450, "groundY": 388,  // world height, and the ground line
      "rim": "rockEdge",             // set this — see Legibility
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
be installed, so a run that ends without passing it has delivered nothing.`;
}
