# Route 2 — the Blender template (PRERENDER §4)

The quality ceiling for backdrop plates: one template `.blend` whose view
layers render straight into the pack format's layer stack — far plate, mid
cut-out, occlusion strip — from one locked camera, so a global restyle is an
overnight batch re-render.

**Status: both scripts fired clean on their first real run (2026-08-11).**
Blender 4.5.9 LTS lives as a portable extraction at
`C:\Users\MSI\Tools\blender-4.5.9-windows-x64\blender.exe` (not on PATH —
use the full path; zip sha256-verified against blender.org's manifest).
`build_template.py` wrote template.blend and `plates.py` rendered
far/mid/near at 2120×900 RGBA — fully transparent, correct for the
undressed template. The MSIX caveat is settled: Brian ran the
`--version` confirm from his own terminal (2026-08-11) — the extraction
is real-machine, not sandbox-side. The remaining live gate is a dressed
set rendering real plates through quantize/check/render.

## One-time setup

1. ~~Install Blender~~ Done 2026-08-11: portable 4.5.9 LTS at the path
   above (zip deleted after the real-terminal confirm; re-download from
   blender.org if it's ever needed again).
2. Build the template from a stock file:

   ```
   blender -b -P art/blender/build_template.py -- --out art/blender/template.blend
   ```

   This writes a `.blend` with: a locked long-lens camera framing 2120×900
   (the overscan width — crop-compose for the centre 2000) at crew eye
   height; `FAR` / `MID` / `NEAR` collections wired to three view layers,
   each seeing its own collection with the nearer ones as holdouts; film
   transparency on (RGBA out); mist with **fixed** start/depth — never the
   per-frame Normalize node — so every level shares one depth encoding.

3. Dress the set: append CC0 kit assets into the collections (all verified
   CC0 — Kenney, Quaternius, Poly Haven; BlenderKit royalty-free items are
   fine *baked into renders* but the `.blend` itself must not be
   redistributed — keep provenance honest either way). Far skyline into
   `FAR`, the middle band into `MID`, one near piece (arch leg, mast, rock)
   into `NEAR`, hugging the frame's left or right quarter — the checker
   refuses an occlusion strip over the signpost span or a standing place.

## Rendering plates

```
blender -b art/blender/template.blend -P art/blender/plates.py -- --out <dir> [--layers far,mid,near] [--scale 2]
```

One PNG per layer: `far.png` (opaque), `mid.png` and `near.png` (RGBA
cut-outs). Then the ordinary pipeline judges them exactly like door renders:

```
npm run pack:quantize -- <dir>/far.png <dir>/mid.png <dir>/near.png
npm run pack:check   -- <sandbox>/PACK.json
npm run pack:render  -- <sandbox>/PACK.json
```

The joint quantize cuts the one 128-colour palette the layer budget
demands; the checker holds sizes, the cut-out contract and occlusion
placement; the composite render is the look-at-it step.
