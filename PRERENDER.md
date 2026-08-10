# Pre-rendered 3D backdrops — the deep dive

Researched 2026-08-10 at Brian's request: how to put proper pre-rendered 3D
graphics behind the world, with the 2D pixel frame — crew, props, ground —
sitting on top, closer to the viewer. **Status: v1 was greenlit as
recommended the same day and is built — D-142.** Section 5 records what was
chosen; the file stays as the research record, the v2 menu (parallax,
occlusion strip, animated regions), and the production-route map (the render
door's screenshot mode and the Blender template are the next steps, in that
order). The plate rules as shipped live in `art/LEVELPACK.md`.

An interactive mockup accompanies this document (Claude artifact
"Pre-rendered backdrop — Agentlings mockup"): the same diorama in three
finishes — today's ops look, a smooth full-colour plate, and the plate
through a 128-colour ordered dither — with pointer parallax, the scrim and
rim toggleable, and an exploded view of the layer stack.

## 1. How far along this already is

The surprise of the research: most of the machinery exists. This feature was
decided in outline a week ago and the ground was prepared.

| In place | Where |
| --- | --- |
| The split decision: DB32 governs crew/props/ops; the backdrop layer carries its own palette, budgeted at 128, dithered | D-108 |
| Composition constraints: author at 1000×450 (or 2000×900 downsampled), bottom 62 px and ground line quiet, horizontal band not centred composition | D-108 |
| `backdrop` as a first-class scene layer (ops + scrim today), doc comment already reserving "may later be a raster file" | D-109, `packages/shared/src/scene.ts` |
| Rim mandatory over any backdrop; scrim is depth, never legibility — both measured | D-107, D-108, `art/LEVELPACK.md` |
| `pack:quantize`: median-cut to 128, dithering, and the crew-stand-in preview with per-position separation numbers | `scripts/quantize-pack.ts`, `server/src/quantize.ts`, `server/src/raster.ts` |
| The whole authoring loop: designer role, PACK.json at sandbox root, review preview through the app's own interpreter, Approve installs, slug as security boundary | D-110, D-111, D-112 |
| A headless renderer and the separation measure as code | D-112, `pack:render` |
| Headless system Edge via playwright-core, with an offline-enforced render door | D-128, `server/src/render.ts` |

What is missing is exactly one seam: `Backdrop` takes ops, not an image. The
rest of this document is about what filling that seam should look like, and
how plates get produced fast.

## 2. What the industry did, distilled

Full sources at the end; these are the findings that bear on our design.

- **Donkey Kong Country** modelled and lit everything on SGI workstations,
  then quantized down to console palettes — sprites *and* backgrounds through
  one pipeline, which is why nothing looks pasted on. The crunch to a limited
  palette was not a loss, it was the look. This is the lineage D-108's
  128-colour budget already chose.
- **FF7–9** stored three things per scene: the plate, the camera that
  rendered it, and the walk geometry. The registration between plate and
  gameplay space is the whole trick. Our equivalent triad is plate +
  `groundY` + the fixed furniture x-positions — and it is already law
  (D-108's quiet strip).
- **Resident Evil** did characters-behind-scenery with mask sprites: cut-out
  pieces of the plate composited *over* the actors at fixed priorities. On a
  2D scene graph that is just a sprite above the sprite layer — the cheapest
  and strongest depth cue available to a fixed camera.
- **Pillars of Eternity** rendered its plates with depth/normal/albedo
  passes — an offline G-buffer — so dynamic light and per-pixel occlusion
  still worked over static art. The lesson at our scale: export more than
  the beauty pass while the Blender file is open; a depth strip is free.
- **Octopath / HD-2D** is *not* pre-rendered — it is real-time 3D unified
  with sprites by depth of field, bloom, tilt-shift and one shared
  tone-map. Its transferable lesson is about resolution contrast: a hi-fi
  background under chunky sprites reads as intentional when the background
  is a *different medium* (photographic, soft, out of focus) and the sprites
  keep one rigid pixel grid. Their director's warning cuts the other way
  too: raise background fidelity and sprite proportions may need re-tuning —
  which is D-108's predicted cost, stated by the people who paid it.
- **Fantasian** photographed physical dioramas, scanned proxy geometry, and
  projected the photos onto it — occlusion and micro-parallax over an
  unchangeable plate. Proof that "plate + slight life" carries a whole game.
- **Dead Cells** is the production precedent rather than the look: one
  artist, crude 3D models, automated render-to-sprite pipeline — iteration
  speed was the entire point. That is the argument for a parametric template
  over hand-painting every plate.

**The integration checklist** (from compositing writeups and the HD-2D
pipeline breakdowns) — what makes sprites sit *in* a plate rather than on it:

1. **Matched key light.** Note the plate's light direction and temperature;
   sprite highlight/shadow sides must agree. Mismatch is the #1 tell.
2. **Contact shadows.** A soft dark ellipse under each agentling welds feet
   to ground. Bake a shadow-catcher strip into the plate, or draw a 2-px
   scenery band; without it sprites float.
3. **Depth of field baked into the render** — sharpest at the ground line,
   softening with distance. Converts the resolution mismatch into a
   photographic depth cue.
4. **One pixel grid.** The plate may be any resolution; sprites never scale
   fractionally or rotate off-grid. Mixed pixel sizes *within the pixel
   layer* are the error; a plate is exempt because it is another medium.
5. **One colour bridge.** Either quantize the plate toward the sprite
   palette's world (DKC route — D-108's decision), or keep it photographic
   under one shared grade. Half-measures — "almost sprite" resolution
   backgrounds — read worst of all.
6. **Aerial recession in the plate**: distant bands lose contrast and
   saturation toward the sky colour. Also protects crew legibility: a plate
   that keeps foreground contrast at the ground line competes with sprites.
7. **Camera: long lens or orthographic, at sprite eye height.** Sprites have
   no vanishing point; a wide-angle plate fights the flat ground line.
   Horizon sits low, roughly at the crew's head band.
8. **Grain/dither as unifier** — a light shared texture signature over both
   layers; the scrim's banding and the dither already do part of this.

## 3. The architecture for this app

### Format (v1)

```jsonc
"backdrop": {
  "plates": ["far.png"],        // NEW: back-to-front raster plates in the pack folder
  "ops": [ … ],                 // still allowed, drawn over the plates
  "scrim": { … }                // unchanged, lands between backdrop and foreground
}
```

An array from day one so layered parallax later needs no migration, but v1
ships and validates a single plate. Files live beside `pack.json`; the server
already serves the pack folder statically and validates per request.

Checker additions (all mechanical, using `server/src/raster.ts`):
decode → exact size 1000×450 or 2000×900; colour count ≤ 128 (D-108's budget
becomes the checkable fact it was meant to be); separation measured at the
seven standing positions against the pack's own theme, warnings under 10,
errors under 5 unless `rim` is set (mandatory-rim rule enforced, not
documented); file referenced but missing → the same named-problem shape every
other check emits.

### Rendering (the one real fork)

- **Option A — in-Pixi, quantized finish (recommended v1).** The plate is a
  `Sprite` under the scenery `Graphics` in `WorldCanvas`. The canvas buffer
  stays 1000-wide and the CSS `image-rendering: pixelated` upscale makes any
  plate chunky at display size — which is exactly the DKC/D-108 finish, so
  the constraint and the decision agree. One renderer owns the frame;
  thumbnails (`canvasSurface`) draw the image first via `drawImage`; the CLI
  renderer blits it via `raster.ts`; the review preview of a draft fetches
  the plate through the existing sandbox files route. Pixi v8 notes from
  research: per-texture sampling is `texture.source.scaleMode` (BaseTexture
  is gone), and app-level `roundPixels: true` is force-OR'd into every
  sprite — irrelevant for a static plate, binding later for parallax, where
  whole-pixel steps are what pixel art wants anyway.
- **Option B — smooth finish, plate outside Pixi.** A DOM `<img>` under a
  transparent canvas (`backgroundAlpha: 0`), browser-scaled smoothly at
  native resolution, CSS-transform parallax for free. This is the HD-2D
  contrast the mockup's SMOOTH mode shows, and it cannot be had inside the
  current canvas (the pixelated upscale applies to everything in it; the
  alternative — raising the app to devicePixelRatio resolution — reopens
  label/crispness questions app-wide). Costs a second composited surface and
  image-aware duplicates of thumbnail/preview/CLI drawing. **Amends D-108**,
  which chose quantized precisely because flat sprites on a soft render read
  pasted on.

Recommendation: A for v1 — smallest change, honors the standing decision,
tooling exists. Look at both finishes in the mockup before deciding; if the
smooth plate wins your eye, B is buildable and the amendment is honest about
what it re-opens.

### What deliberately does not change

The sim (x-only, server-authoritative), anchors and the working surface
rules, DB32 for everything drawn from theme slots, scrim/rim semantics,
provenance-required licensing, review-then-Approve as the only install path,
`lookFor` never failing. Ambient ops already draw above the painting, so
drips, motes and beams work over a plate unchanged.

### v2, priced but deferred

- **Pointer/idle micro-parallax** — 2–3 plates with 6 % overscan, positions
  lerped, whole-pixel steps. Cheap; needs nothing new in the format if
  `plates` is an array from v1.
- **Occlusion strip** — a cut-out plate *above* the sprite layer near the
  screen edges (never over the furniture zone): the RE mask trick, the
  strongest single depth cue we could add.
- **Animated regions** — `TilingSprite` scroll loops (waterfall, clouds) and
  small `AnimatedSprite` patches; the AmbientOp vocabulary is the natural
  home ("plate life" idioms, live-only like the others).
- **Depth-map displacement parallax** (single plate + mist pass through a
  `DisplacementFilter`) — gorgeous in demos, smears at silhouettes; only
  worth it if we ever want continuous depth from one image.

## 4. Production — the actual capacity question

Render time is not the bottleneck anywhere in the research; authoring is.
Three routes, cheapest-to-start first:

**Route 0 — any graded image, today + one format change.** Once `plates`
lands, any image with recorded provenance goes through `pack:quantize` and
the checker. This is how the *first* plate should ship — it proves the seam
with zero pipeline investment. AI-generated plates sit here too, with eyes
open: fastest single plate, weak cross-level consistency, no layer
separation without inpainting debt, and (per the US Copyright Office's
Jan 2025 report) no copyright in pure generations — fine for a personal
tool, a real consideration if packs are ever published.

**Route 1 — the render door grows a screenshot mode (the differentiator).**
`/internal/render` already drives headless Edge offline (`setContent`, every
request aborted, caps owned by the module — D-128). Edge renders WebGL. Add
a `screenshot` variant beside `page.pdf` — fixed 2000×900 viewport, PNG
bytes to the sandbox root, same 400/404/403 shape, same offline rule — and a
session can author a **self-contained three.js scene** and *see its own
render*. The see-your-work loop this needs was proven end to end in D-128's
deck run (rasterise → name seven visual faults → fix → verify). That makes
"author a 3D level" a designer job inside the existing PACK.json → review →
Approve contract: the crew builds 3D worlds, no installs, no new deps beyond
a decision on whether three.js rides inline in the session's HTML (~600 KB,
under the door's 2 MB cap) or is vendored and injected by the door (pinned
version, smaller prompts — recommended). This is the option that turns the
feature into level-production *capacity* rather than a nicer wallpaper.

**Route 2 — the Blender template (the quality ceiling).** One template
`.blend`: locked long-lens/ortho camera framing 2000×900 at crew eye height;
far/mid collections on separate view layers with holdouts (each renders as
its own RGBA plate from one camera); Mist pass with **fixed** near/far via
Map Range — never the per-frame Normalize node — so every level shares one
depth encoding; compositor AO/colour-ramp post. Kit assets from CC0 sources
(Kenney, Quaternius, Poly Haven — all verified CC0; BlenderKit royalty-free
items are fine *baked into plates* but the `.blend` itself must not be
redistributed). Geometry-nodes scatter with a seed for set dressing. Driver
script: `blender -b template.blend -P plates.py -- --level X --palette Y`,
headless, agentling-runnable once Blender is installed on this machine (a
one-time manual install; Claude's own tools sit in an MSIX sandbox and
cannot confirm installs — known limitation). A global restyle becomes an
overnight batch re-render, which is the property no hand-painted pipeline
has. Existing prior art for agent-driven headless Blender: `blenderless`,
`blender-auto-render`; Infinigen proves the ceiling.

Recommended order: **format v1 → first plate via Route 0 → Route 1 →
Route 2.** Each step ships alone and none blocks the next.

### Performance (checked, not guessed)

A 2000×900 plate is ~7 MB decoded on the GPU; three would be ~21 MB —
trivial on desktop, and the 4096-px hardware ceiling is respected. Ship
WebP (~26 % smaller lossless than PNG; Pixi's Assets resolver picks formats
natively). Static sprites cost nothing per frame; parallax is two position
writes. Nothing here needs the Pixi 8.6 → 8.7+ upgrade, though 8.7 adds
RenderLayer and the sanctioned three.js-shared-context path if live 3D is
ever wanted — the research verdict on live 3D behind the world: buys dynamic
viewpoint and lighting a fixed diorama doesn't use, at the price of a second
engine; pre-rendered plates put unlimited render quality on screen for the
cost of three textured quads.

## 5. The decisions — taken 2026-08-10, as recommended (D-142)

1. **Adopt raster plates v1** — yes. Single plate, in-Pixi, quantized-128,
   checker rules as §3. Built.
2. **Finish** — quantized-only; D-108 stands. The smooth finish remains a
   possible v2, priced in §3 Option B.
3. **Production order** — Route 0 → 1 → 2 confirmed. The first plate shipped
   by Route 0 (painted in-repo, quantized). **Route 1 is built — D-143**:
   `render_plate` on the render door, three.js vendored, drafts carrying
   plates through review and Approve; The Ember Gate is its proof. Route 2,
   the Blender template, remains the quality ceiling when wanted.
4. **v2 scope** — parallax and the occlusion strip deferred; the format
   carries `plates[]` from day one, so neither needs a migration.
   *Refined 2026-08-10 evening:* a single-plane shortcut (drifting the one
   plate under the fixed frame, ~25 renderer lines) was offered and
   **declined** — parallax arrives only as the full multi-plane version,
   far and mid layers at their own rates, which is gated on multi-plate
   packs and therefore on raster tooling that keeps alpha (the one-plate
   rule's own blocker, D-142/D-143). Until then the worlds hold still and
   the ambient idioms carry the motion.

## Sources

Precedents: DKC pipeline ([New Player Ready](https://medium.com/@newplayerready/donkey-kong-country-how-pre-rendered-graphics-saved-the-snes-late-in-its-life-new-player-ready-90a07cb2b76f), [GameGrin](https://www.gamegrin.com/articles/why-donkey-kong-country-was-a-technical-marvel/)) · FF7 triad ([GamingBolt](https://gamingbolt.com/final-fantasy-7-a-tech-deep-dive-into-the-rpg-classic)) · RE-style plates + depth buffers, the best single writeup ([jmeiners.com](https://www.jmeiners.com/pre-rendered-backgrounds/)) · Pillars of Eternity offline G-buffer ([Obsidian update #79](https://eternity.obsidian.net/eternity/news/update--79-graphics-and-rendering-), [analysis](https://projectionspace.wordpress.com/2016/05/06/pillars-of-eternitys-rendering-techniques/)) · HD-2D ([UE spotlight](https://www.unrealengine.com/en-US/spotlights/octopath-traveler-s-hd-2d-art-style-and-story-make-for-a-jrpg-dream-come-true), [Octopath II interview](https://nintendoeverything.com/octopath-traveler-ii-devs-on-the-games-evolved-use-of-hd-2d-and-more/), [DX12 pipeline writeup](https://dev.to/gaurav_de/creating-an-hd-2d-rendering-pipeline-on-dx12-205k)) · Fantasian ([Unity case study](https://unity.com/resources/case-study-fantasian)) · Dead Cells 3D-to-2D pipeline ([Game Developer](https://www.gamedeveloper.com/production/art-design-deep-dive-using-a-3d-pipeline-for-2d-animation-in-i-dead-cells-i-)) · The Last Night ([Retronator](https://medium.com/retronator-magazine/the-future-of-pixel-art-with-the-last-night-a9a4eb61e824)).

Pixi v8: [textures/scaleMode](https://pixijs.com/8.x/guides/components/textures) · roundPixels force-OR verified in [SpritePipe.ts](https://github.com/pixijs/pixijs/blob/dev/src/scene/sprite/SpritePipe.ts) · [Assets resolver](https://pixijs.com/8.x/guides/components/assets/resolver) · [pixi-filters v6 for v8](https://github.com/pixijs/filters) · [three.js interop guide (needs ≥8.7)](https://pixijs.com/8.x/guides/third-party/mixing-three-and-pixi) · pixi3d dormant, v7-only ([repo](https://github.com/jnsmalm/pixi3d)) · [WebP study](https://developers.google.com/speed/webp/docs/webp_lossless_alpha_study).

Blender pipeline: [view layers](https://docs.blender.org/manual/en/latest/render/layers/layers.html) · [cryptomatte](https://docs.blender.org/manual/en/latest/compositing/types/mask/cryptomatte.html) · Mist-vs-Z and the Normalize gotcha ([Milanese](https://www.francescomilanese.com/tutorials-en-all/tut-056-en-b3d-z-depth-vs-mist-compositing-guide.html), [Artisticrender passes guide](https://artisticrender.com/render-passes-in-blender-cycles-complete-guide/)) · [CLI arguments](https://docs.blender.org/manual/en/latest/advanced/command_line/arguments.html) · pixel-art rendering ([Blender Studio](https://studio.blender.org/blog/3d-pixel-art-in-blender/), [Javin ortho math](https://www.javin-inc.com/blenderpixel/)) · kits: [Kenney](https://kenney.nl/support), [Quaternius](https://quaternius.com), [Poly Haven](https://polyhaven.com/license), [BlenderKit licensing](https://www.blenderkit.com/docs/licenses/licensing-faq/) · [libimagequant](https://pngquant.org/lib/) · agent-adjacent headless Blender: [blenderless](https://github.com/oqton/blenderless), [blender-auto-render](https://github.com/miolini/blender-auto-render), [Infinigen](https://github.com/princeton-vl/infinigen).

AI plates: [Depth Anything V2](https://github.com/DepthAnything/Depth-Anything-V2) · [DepthFlow](https://github.com/BrokenSource/DepthFlow) · [US Copyright Office report coverage](https://www.skadden.com/insights/publications/2025/02/copyright-office-publishes-report) · [HF ML-for-games series](https://huggingface.co/blog/ml-for-games-4).
