---
name: plate-design
description: Author pre-rendered 3D backdrop plates with three.js through render_plate — a layered stack with parallax and an occlusion strip, composed for the crew's ground line, read back and delivered in a PACK.json world
---
# Plate design

A plate stack is the picture a whole world stands in front of. The crew,
signposts and doorway are drawn by the app **over** the backdrop plates and
**under** the occlusion strip — you are painting the distance and, if you
choose, one piece of near scenery they walk behind. PACK.json rules are
`authoring-a-level-pack`'s; this adds the plates.

1. **One self-contained HTML page per render.** Import three.js from
   `http://three.local/three.module.js` — the only URL that resolves during
   the render; every other request is blocked. Build the scene, call
   `renderer.render(scene, camera)` once, then set
   `document.title = 'ready'` — the screenshot waits for that title and
   fails loudly without it.
2. **Layers come from ONE scene.** Build the whole 3D scene once, then
   render it several times toggling group visibility: everything far for
   the back plate, the mid band alone for the cut-out, the near piece alone
   for the occlusion strip. One camera, one lighting rig — that is what
   keeps the light direction agreeing across layers and the colour union
   inside the one 128 budget all your files share.
3. **The modes.** Back plate: `mode: "plate"` (2000×900) or
   `"plate-overscan"` (2120×900 — it drifts gently with the pointer). Upper
   plates and the strip: `"cutout"` / `"cutout-overscan"`, **with
   `renderer.setClearAlpha(0)` or `alpha: true` on the WebGLRenderer and a
   transparent page background** — the holes are the feature; the door
   snaps soft alpha hard and its receipt reports coverage. Overscanned
   layers drift at their own rates (far most, near least, strip against);
   exact-size layers hold still. Loop tiles (a waterfall strip, drifting
   cloud): `"tile"` with `tileWidth`/`tileHeight` ≤ 512, named by an
   `ambient` `plateloop` entry.
4. **The frame is 2000×900** (2× of a 1000-wide, 450-tall world; 2120 when
   overscanned — compose for the centre 2000, the margin is drift room).
   The crew stand at plate y **776**; the bottom **124px** belong to the
   ground strip your ops will draw — keep it dark and calm. Horizon around
   y 500–560. Camera: a long lens (fov 15–20, pulled well back) or an
   `OrthographicCamera`, level with the ground.
5. **The occlusion strip lives at the frame's edges.** An arch leg, a mast,
   a foreground rock — opaque only near the screen edges, never over the
   signpost span (x ≈ 230–770 in world units, i.e. 460–1540 on the 2×
   plate) and never over a standing place (spawn x 80, the five signposts,
   exit x 940 — widened by the drift margin when the strip drifts). The
   checker refuses both by name; design clear of them from the start.
6. **Compose for separation.** The band the crew occupy (y ≈ 736–776) must
   sit apart from every gown's luminance — dark is the reliable side. The
   back-plate receipt tells you: `worst crew separation N at x M`. Under 5,
   a gown vanishes there; under 10 is thin. Fix the picture before leaning
   on the rim.
7. **Depth is the point.** Haze that lightens with distance, contrast that
   falls off, one light direction carried by every form — note that
   direction in your result. The parallax sells depth only if the layers
   really sit at different distances in the scene; a mid cut-out five
   metres from the far wall reads as a sticker. No text in any plate,
   nothing that looks clickable, none of the app's own furniture.
8. **Call `render_plate`, then LOOK — at every layer and at the stack.**
   Each render lands at the sandbox root quantized; read each PNG, then run
   `npm run pack:check` and `npm run pack:render` so you see the composite
   with the crew stand-ins. If the checker names an over-budget union, cut
   one palette across the files: `npm run pack:quantize -- far.png mid.png
   near.png`. Iterate; the render is cheap.
9. **Deliver it as a world.** In PACK.json: `backdrop.plates: ["far.png",
   "mid.png"]` back to front, `backdrop.occlusion: "near.png"` if you made
   a strip, `plateloop` entries for any tiles, `rim` set — the checker
   refuses a raster backdrop without one — a theme picked *from* the
   plates' own colours, foreground ops for the ground strip, and provenance
   saying the renders are your own. Everything is installed with the pack
   at Approve; nothing ships until then.
