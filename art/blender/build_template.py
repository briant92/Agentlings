# Builds template.blend for the plate pipeline (PRERENDER §4, Route 2).
#   blender -b -P art/blender/build_template.py -- --out art/blender/template.blend
#
# UNTESTED LIVE: written on a machine with no Blender install; the first
# headless run is this file's gate. Everything here is stock bpy API against
# 4.x LTS, chosen to fail loudly rather than approximate.
import argparse
import sys

import bpy

def args_after_dashes() -> argparse.Namespace:
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def main() -> None:
    opts = args_after_dashes()
    scene = bpy.context.scene

    # A clean file: drop the default cube/light/camera, keep the world.
    for obj in list(bpy.data.objects):
        bpy.data.objects.remove(obj, do_unlink=True)

    # The frame: 2120x900 = the 2x plate with drift overscan; compose for
    # the centre 2000. Render at --scale 1 for tests, 2 is the shipped size.
    scene.render.resolution_x = 2120
    scene.render.resolution_y = 900
    scene.render.film_transparent = True  # RGBA out: cut-outs are the point
    scene.render.image_settings.file_format = "PNG"
    scene.render.image_settings.color_mode = "RGBA"

    # The camera: long lens, pulled back, level with the crew's eye band.
    # World ground line is y 388 of 450 => ~86% down the frame; the camera
    # sits low and looks dead level so verticals stay vertical.
    cam_data = bpy.data.cameras.new("PlateCamera")
    cam_data.lens = 85.0  # long lens: the flat-ground look the skill demands
    cam_data.clip_end = 500.0
    cam = bpy.data.objects.new("PlateCamera", cam_data)
    cam.location = (0.0, -40.0, 1.6)
    cam.rotation_euler = (1.5707963, 0.0, 0.0)  # level, facing +Y
    scene.collection.objects.link(cam)
    scene.camera = cam

    # One key light the whole stack shares — matched light direction across
    # layers is integration rule #1.
    sun_data = bpy.data.lights.new("Key", type="SUN")
    sun_data.energy = 3.0
    sun = bpy.data.objects.new("Key", sun_data)
    sun.rotation_euler = (0.9, 0.2, -0.6)
    scene.collection.objects.link(sun)

    # FAR / MID / NEAR collections, one view layer each. Each layer sees its
    # own collection; the collections in front of it are holdouts, so every
    # render is a correctly-masked RGBA cut-out from the same camera.
    names = ["FAR", "MID", "NEAR"]
    cols = {}
    for name in names:
        col = bpy.data.collections.new(name)
        scene.collection.children.link(col)
        cols[name] = col

    # The default view layer becomes FAR's.
    base = scene.view_layers[0]
    base.name = "far"
    layers = {"far": base}
    for name in ("mid", "near"):
        layers[name] = scene.view_layers.new(name)

    def layer_col(view_layer, collection):
        for child in view_layer.layer_collection.children:
            if child.collection is collection:
                return child
        raise RuntimeError(f"collection {collection.name} not under {view_layer.name}")

    plan = {"far": "FAR", "mid": "MID", "near": "NEAR"}
    for layer_name, own in plan.items():
        vl = layers[layer_name]
        own_index = names.index(own)
        for col_name in names:
            lc = layer_col(vl, cols[col_name])
            if col_name == own:
                lc.exclude = False
                lc.holdout = False
            elif names.index(col_name) > own_index:
                # Nearer scenery punches a hole: holdout, so the far plate
                # keeps a mask where the mid ridge will sit.
                lc.exclude = False
                lc.holdout = True
            else:
                lc.exclude = True

    # Mist with FIXED bounds via the world settings — never the per-frame
    # Normalize node, which re-scales depth per image and breaks the shared
    # encoding across levels (PRERENDER's own warning).
    world = scene.world or bpy.data.worlds.new("World")
    scene.world = world
    world.mist_settings.use_mist = True
    world.mist_settings.start = 20.0
    world.mist_settings.depth = 120.0
    world.mist_settings.falloff = "LINEAR"

    bpy.ops.wm.save_as_mainfile(filepath=opts.out)
    print(f"template written to {opts.out}")


main()
