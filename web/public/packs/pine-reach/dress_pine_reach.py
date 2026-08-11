# Dresses the Route 2 template into "The Pine Reach" (first smooth-finish
# world). Run:
#   blender -b art/blender/template.blend --python-exit-code 1 \
#     -P dress_pine_reach.py -- --out art/blender/pine-reach.blend
#
# Kit: Poly Haven CC0 — coastal_cliff_01, fir_tree_01, boulder_01
# (authors Rob Tuytel, Rico Cilliers), 1k blends fetched to Tools\assets.
#
# Camera facts (template): at (0,-40,1.6), 85mm, level, +Y forward.
# tan(hFOV/2)=0.2118, tan(vFOV/2)=0.0899; frame-u for lateral X at
# camera-distance d: u = 0.5 + X/(d*0.4235). Frame z-span at d: 1.6 ± d*0.0899.
# Occlusion legality (drifting strip): opaque only outside world-x 200-800
# and clear of spawn/exit stand bands in the crew band. The stone targets
# wx 800-900: at d=14 that is X ~1.96, visible width <= 0.56 m.
#
# v2 after the first look + measure (near spanned wx 723-989, sky ramp
# nearly invisible, cliffs read as a close wall, talus floated, treeline
# sparse): stone slimmed/pushed to d14 rot90; sky plane resized to the
# visible band with dusk stops; cliffs z-stretched, rotated, one more far
# left; haze plane at d200 for aerial depth; talus sunk and pushed back;
# firs moved to d52-88 at fuller scales, nine of them.
import argparse
import math
import os
import sys

import bpy

KITS = {
    "cliff": r"C:\Users\MSI\Tools\assets\polyhaven\coastal_cliff_01\coastal_cliff_01.blend",
    "fir": r"C:\Users\MSI\Tools\assets\polyhaven\fir_tree_01\fir_tree_01.blend",
    "boulder": r"C:\Users\MSI\Tools\assets\polyhaven\boulder_01\boulder_01.blend",
}
CAM_Y = -40.0

# (asset object, camera distance, lateral X, z, scale or (sx,sy,sz), rot z deg)
FAR_PIECES = [
    ("coastal_cliff_01_LOD3", 230, -55, -1, (1.8, 1.8, 1.55), 30),
    ("coastal_cliff_01_LOD3", 320, 55, -1, (2.2, 2.2, 1.9), -18),
    ("coastal_cliff_01_LOD3", 400, -120, -1, (2.6, 2.6, 2.1), 45),
    ("boulder_01_LOD2", 150, -30, -1.5, 4.5, 40),
    ("boulder_01_LOD2", 185, 20, -1.5, 5.5, 160),
    ("boulder_01_LOD2", 160, 48, -1.5, 4.0, 250),
    ("boulder_01_LOD2", 60, -14, -0.4, 1.8, 70),
    ("boulder_01_LOD2", 78, 6, -0.4, 2.2, 190),
    ("boulder_01_LOD2", 95, 26, -0.4, 2.5, 310),
    ("boulder_01_LOD2", 70, 18, -0.4, 1.5, 20),
    ("boulder_01_LOD2", 30, -8, -0.25, 0.9, 55),
    ("boulder_01_LOD2", 36, 3, -0.25, 1.2, 145),
    ("boulder_01_LOD2", 42, -16, -0.25, 1.5, 220),
    ("boulder_01_LOD2", 33, 12, -0.25, 0.8, 305),
    ("boulder_01_LOD2", 46, 20, -0.25, 1.6, 80),
    ("boulder_01_LOD2", 28, -2, -0.2, 0.7, 170),
]
MID_PIECES = [
    ("fir_tree_01_a_LOD2", 88, -17.0, 0, 0.58, 0),
    ("fir_tree_01_b_LOD2", 72, -12.0, 0, 0.55, 70),
    ("fir_tree_01_c_LOD2", 56, -8.0, 0, 0.50, 140),
    ("fir_tree_01_b_LOD2", 64, -4.0, 0, 0.60, 200),
    ("fir_tree_01_a_LOD2", 52, -0.5, 0, 0.48, 250),
    ("fir_tree_01_c_LOD2", 78, 5.0, 0, 0.62, 290),
    ("fir_tree_01_b_LOD2", 60, 9.0, 0, 0.52, 330),
    ("fir_tree_01_c_LOD2", 84, 13.5, 0, 0.56, 30),
    ("fir_tree_01_a_LOD2", 70, 17.0, 0, 0.50, 110),
    ("boulder_01_LOD1", 50, -6.0, -0.3, 1.8, 15),
    ("boulder_01_LOD1", 54, 2.0, -0.3, 1.5, 120),
    ("boulder_01_LOD1", 58, 11.0, -0.3, 2.2, 230),
]
NEAR_PIECES = [
    # The standing stone, LEFT quarter (v6): the right spot the checker once
    # allowed sits over the parcel stand and doorway it now protects (D-154).
    # Legal there: wx < 200 whole-column, clear of the spawn band 41-119 in
    # the crew band. Target wx 125-193: X -1.91 at d 14, presented width
    # 1.83*0.21 = 0.38 m.
    ("boulder_01_LOD1", 14, -1.91, 0, (0.21, 0.21, 3.4), 90),
]


def args_after_dashes():
    argv = sys.argv[sys.argv.index("--") + 1 :] if "--" in sys.argv else []
    p = argparse.ArgumentParser()
    p.add_argument("--out", required=True)
    return p.parse_args(argv)


def append_objects(blend_path, names):
    with bpy.data.libraries.load(blend_path) as (data_from, data_to):
        missing = [n for n in names if n not in set(data_from.objects)]
        if missing:
            raise SystemExit(f"{blend_path}: no such object(s) {missing}")
        data_to.objects = list(names)
    return [o for o in data_to.objects if o is not None]


def fix_texture_paths():
    roots = [os.path.join(os.path.dirname(p), "textures") for p in KITS.values()]
    fixed = 0
    for img in bpy.data.images:
        if not img.filepath:
            continue
        ab = bpy.path.abspath(img.filepath)
        if os.path.exists(ab):
            continue
        base = os.path.basename(ab)
        for root in roots:
            cand = os.path.join(root, base)
            if os.path.exists(cand):
                img.filepath = cand
                fixed += 1
                break
        else:
            print(f"WARNING: texture not found anywhere: {base}")
    print(f"textures repointed: {fixed}")


def gradient_sky_material():
    mat = bpy.data.materials.new("PR_Sky")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    tex = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tex.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])  # rotated plane: local Y is up
    nt.links.new(ramp.outputs["Color"], emit.inputs["Color"])
    nt.links.new(emit.outputs["Emission"], out.inputs["Surface"])
    # Sky plane spans z -40.9..44.1; skyline tops out near z 30 (ramp ~0.83
    # on the tallest ridge, lower elsewhere). Dusk: warm band above the
    # ridge line, rose haze, then steel blue.
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.85, 0.58, 0.36, 1)
    warm2 = ramp.color_ramp.elements.new(0.70)
    warm2.color = (0.82, 0.55, 0.38, 1)
    rose = ramp.color_ramp.elements.new(0.80)
    rose.color = (0.56, 0.46, 0.50, 1)
    ramp.color_ramp.elements[-1].position = 1.0
    ramp.color_ramp.elements[-1].color = (0.10, 0.16, 0.30, 1)
    emit.inputs["Strength"].default_value = 1.0
    return mat


def haze_material():
    """Alpha-gradient emissive: dense at the ridge line, gone above."""
    mat = bpy.data.materials.new("PR_Haze")
    mat.use_nodes = True
    try:
        mat.surface_render_method = "BLENDED"
    except AttributeError:
        pass
    try:
        mat.blend_method = "BLEND"
    except AttributeError:
        pass
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    emit = nt.nodes.new("ShaderNodeEmission")
    mix = nt.nodes.new("ShaderNodeMixShader")
    transp = nt.nodes.new("ShaderNodeBsdfTransparent")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    tex = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tex.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])  # rotated plane: local Y is up
    nt.links.new(ramp.outputs["Color"], mix.inputs["Fac"])
    nt.links.new(transp.outputs["BSDF"], mix.inputs[1])
    nt.links.new(emit.outputs["Emission"], mix.inputs[2])
    nt.links.new(mix.outputs["Shader"], out.inputs["Surface"])
    emit.inputs["Color"].default_value = (0.66, 0.60, 0.56, 1)
    emit.inputs["Strength"].default_value = 1.0
    # Fac is emission weight: strong at the plane's base, zero at the top.
    ramp.color_ramp.elements[0].position = 0.0
    ramp.color_ramp.elements[0].color = (0.5, 0.5, 0.5, 1)
    ramp.color_ramp.elements[-1].position = 0.85
    ramp.color_ramp.elements[-1].color = (0, 0, 0, 1)
    return mat


def moor_material():
    mat = bpy.data.materials.new("PR_Moor")
    mat.use_nodes = True
    nt = mat.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Roughness"].default_value = 0.95
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    tex = nt.nodes.new("ShaderNodeTexCoord")
    nt.links.new(tex.outputs["Generated"], sep.inputs[0])
    nt.links.new(sep.outputs["Y"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    # Visible moor is Generated Y ~0.05-0.25 (camera sees y -22..~200 of
    # the plane span -70..830); the ramp lives inside that band.
    ramp.color_ramp.elements[0].position = 0.05
    ramp.color_ramp.elements[0].color = (0.055, 0.062, 0.048, 1)  # near, dark
    far_stop = ramp.color_ramp.elements.new(0.16)
    far_stop.color = (0.128, 0.120, 0.098, 1)  # dusk-lit distance
    ramp.color_ramp.elements[-1].position = 0.35
    ramp.color_ramp.elements[-1].color = (0.158, 0.145, 0.118, 1)
    return mat


def flat_material(name, rgb, rough=0.9):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*rgb, 1)
    bsdf.inputs["Roughness"].default_value = rough
    return mat


def into_collection(obj, col):
    for c in list(obj.users_collection):
        c.objects.unlink(obj)
    col.objects.link(obj)


def main():
    opts = args_after_dashes()
    scene = bpy.context.scene
    cols = {c.name: c for c in scene.collection.children}
    for want in ("FAR", "MID", "NEAR"):
        if want not in cols:
            raise SystemExit(f"template has no {want} collection")

    # Complete layers, not holdout holes: the opaque-back rule, and drift
    # must reveal picture behind an edge, never a hole.
    for vl in scene.view_layers:
        for child in vl.layer_collection.children:
            if child.holdout:
                child.holdout = False
                child.exclude = True

    needed = {}
    for pieces in (FAR_PIECES, MID_PIECES, NEAR_PIECES):
        for name, *_ in pieces:
            needed.setdefault(name, None)
    by_kit = {}
    for name in needed:
        kit = KITS["cliff" if "cliff" in name else "fir" if "fir_tree" in name else "boulder"]
        by_kit.setdefault(kit, []).append(name)
    sources = {}
    for kit, names in by_kit.items():
        for obj in append_objects(kit, names):
            sources[obj.name] = obj
    fix_texture_paths()

    used = set()
    for pieces, colname in ((FAR_PIECES, "FAR"), (MID_PIECES, "MID"), (NEAR_PIECES, "NEAR")):
        for name, dist, x, z, scale, rot in pieces:
            src = sources[name]
            obj = src.copy() if name in used else src
            used.add(name)
            obj.location = (x, dist + CAM_Y, z)
            obj.scale = scale if isinstance(scale, tuple) else (scale, scale, scale)
            obj.rotation_euler = (0, 0, math.radians(rot))
            into_collection(obj, cols[colname])

    # Sky: must cover the full frame at its depth (far stays 100% opaque).
    # Frame at d=440 spans z 1.6±39.6; plane z 1.6±42.5 covers it.
    bpy.ops.mesh.primitive_plane_add(size=1)
    sky = bpy.context.active_object
    sky.name = "PR_Sky"
    sky.rotation_euler = (math.radians(90), 0, 0)
    sky.scale = (500, 85, 1)
    sky.location = (0, 400 + CAM_Y, 1.6)
    sky.data.materials.append(gradient_sky_material())
    into_collection(sky, cols["FAR"])

    # Haze band between the talus and the cliffs: aerial perspective.
    bpy.ops.mesh.primitive_plane_add(size=1)
    haze = bpy.context.active_object
    haze.name = "PR_HazeBand"
    haze.rotation_euler = (math.radians(90), 0, 0)
    haze.scale = (400, 22, 1)
    haze.location = (0, 200 + CAM_Y, 9)
    haze.data.materials.append(haze_material())
    into_collection(haze, cols["FAR"])

    bpy.ops.mesh.primitive_plane_add(size=1)
    ground = bpy.context.active_object
    ground.name = "PR_Ground"
    ground.scale = (1200, 900, 1)
    ground.location = (0, 420 + CAM_Y, 0)
    ground.data.materials.append(moor_material())
    into_collection(ground, cols["FAR"])

    world = scene.world
    world.use_nodes = True
    bg = world.node_tree.nodes.get("Background")
    if bg:
        bg.inputs[0].default_value = (0.055, 0.075, 0.105, 1)
        bg.inputs[1].default_value = 0.7

    bpy.ops.wm.save_as_mainfile(filepath=opts.out)
    print(f"dressed scene written to {opts.out}")


main()
