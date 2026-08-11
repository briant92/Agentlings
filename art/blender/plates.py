# Renders the template's view layers into plate files (PRERENDER §4).
#   blender -b art/blender/template.blend -P art/blender/plates.py -- \
#       --out <dir> [--layers far,mid,near] [--scale 2]
#
# One PNG per layer: far.png opaque-intended (quantize decides), mid.png and
# near.png RGBA cut-outs. Outputs then flow through the ordinary pipeline —
# pack:quantize (jointly!), pack:check, pack:render — exactly like door
# renders; nothing here bypasses a wall.
#
# UNTESTED LIVE: written on a machine with no Blender install; the first
# headless run is this file's gate.
import argparse
import os
import sys

import bpy

def args_after_dashes() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    p.add_argument("--layers", default="far,mid,near")
    p.add_argument("--scale", type=int, default=2, choices=[1, 2])
    return p.parse_args(argv)


def main() -> None:
    opts = args_after_dashes()
    os.makedirs(opts.out, exist_ok=True)
    scene = bpy.context.scene

    # 2x is the shipped plate; 1x halves both axes for quick look-loops.
    scene.render.resolution_x = 1060 * opts.scale
    scene.render.resolution_y = 450 * opts.scale
    scene.render.film_transparent = True
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    wanted = [name.strip() for name in opts.layers.split(",") if name.strip()]
    known = {vl.name for vl in scene.view_layers}
    missing = [name for name in wanted if name not in known]
    if missing:
        raise SystemExit(f"no such view layer(s): {', '.join(missing)} — template has {sorted(known)}")

    for name in wanted:
        # Render one layer at a time by muting the others' use flag.
        for vl in scene.view_layers:
            vl.use = vl.name == name
        scene.render.filepath = os.path.join(opts.out, f"{name}.png")
        bpy.ops.render.render(write_still=True, layer=name)
        print(f"rendered {scene.render.filepath}")

    print("now: npm run pack:quantize -- " + " ".join(os.path.join(opts.out, f"{n}.png") for n in wanted))


main()
