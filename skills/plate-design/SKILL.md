---
name: plate-design
description: Author a pre-rendered 3D backdrop plate with three.js through render_plate — compose for the crew's ground line, read the PNG back, and deliver it in a PACK.json world
---
# Plate design

A plate is the picture a whole world stands in front of. The crew, signposts
and doorway are drawn by the app **over** it — you are painting the distance,
not the stage. PACK.json rules are `authoring-a-level-pack`'s; this adds the
plate.

1. **One self-contained HTML page.** Import three.js from
   `http://three.local/three.module.js` — the only URL that resolves during
   the render; every other request is blocked. Build the scene, call
   `renderer.render(scene, camera)` once, then set
   `document.title = 'ready'` — the screenshot waits for that title and
   fails loudly without it.
2. **The frame is 2000×900** (2× of a 1000-wide, 450-tall world). The crew
   stand at plate y **776**; the bottom **124px** belong to the ground strip
   your ops will draw — keep it dark and calm, and put nothing there you
   care about. Horizon around y 500–560. Camera: a long lens
   (`PerspectiveCamera` with fov 15–20, pulled well back) or an
   `OrthographicCamera`, level with the ground — a wide angle splays the
   floor against the flat pixel world in front.
3. **Compose for separation.** The band the crew occupy (y ≈ 736–776) must
   sit apart from every gown's luminance — dark is the reliable side. The
   receipt tells you: `worst crew separation N at x M`. Under 5, a gown
   vanishes there; under 10 is thin. Fix the picture before leaning on the
   rim.
4. **Depth is the point.** Haze that lightens with distance, contrast that
   falls off, one light direction carried by every form — and note that
   direction in your result, because the foreground ops and any future props
   must agree with it. No text in the plate, nothing that looks clickable,
   none of the app's own furniture.
5. **Call `render_plate`, then LOOK.** It writes the PNG at the sandbox
   root, already quantized to the 128-colour backdrop budget, and reports
   size, colours and separation. **Read the PNG** and judge it like a
   painting — the receipt proves legibility, only your eye proves it reads.
   Iterate; the render is cheap.
6. **Deliver it as a world.** In PACK.json: `backdrop.plates: ["plate.png"]`
   (the file you rendered, beside it at the sandbox root), `rim` set — the
   checker refuses a plate without one — a theme picked *from* the plate's
   own colours, foreground ops for the ground strip drawn over it, and
   provenance saying the plate is your own three.js render. The plate is
   installed with the pack at Approve; nothing ships until then.
