"""
Builds and renders the title screen's Starbase backdrop, procedurally —
no modeling by hand, no external assets, so it can be re-tuned by editing
numbers and re-running rather than reopening a hand-sculpted .blend.

Run:
  blender -b -P art/blender/starbase_render.py -- --out web/public/starbase.png

Output is a single flat PNG (no plates/cut-outs — this is the title screen's
own decorative backdrop, not a level pack asset, so none of PRERENDER.md's
plate/occlusion rules apply). The DB32 pixel-art horde is composited over it
in the browser afterwards (TitleScreen.tsx), the HD-2D contrast PRERENDER.md
scoped as the "smooth finish".
"""

import math
import sys

import bpy
import mathutils

# ---- args ----------------------------------------------------------------
argv = sys.argv
argv = argv[argv.index("--") + 1 :] if "--" in argv else []
out_path = "web/public/starbase.png"
if "--out" in argv:
    out_path = argv[argv.index("--out") + 1]

# ---- clean slate -----------------------------------------------------------
bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene


def add_box(name, location, size, material, group=None):
    bpy.ops.mesh.primitive_cube_add(size=2, location=location)
    obj = bpy.context.object
    obj.name = name
    obj.scale = size
    obj.data.materials.append(material)
    if group is not None:
        group.append(obj)
    return obj


def add_cylinder(name, location, radius, depth, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cylinder_add(
        radius=radius, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def add_cone(name, location, radius, depth, material, rotation=(0, 0, 0)):
    bpy.ops.mesh.primitive_cone_add(
        radius1=radius, radius2=0, depth=depth, location=location, rotation=rotation
    )
    obj = bpy.context.object
    obj.name = name
    obj.data.materials.append(material)
    return obj


def material(name, color, roughness=0.6, metallic=0.0, emission=None, emission_strength=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = mat.node_tree.nodes["Principled BSDF"]
    bsdf.inputs["Base Color"].default_value = (*color, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    if emission:
        bsdf.inputs["Emission Color"].default_value = (*emission, 1.0)
        bsdf.inputs["Emission Strength"].default_value = emission_strength
    return mat


def gradient_material(name, base_color, top_color, roughness=0.15, metallic=0.6):
    """A vertical gradient (object-local Z) — the building's glass reflecting
    the sky near its top, darker toward its base, instead of one flat colour."""
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    tex_coord = nt.nodes.new("ShaderNodeTexCoord")
    sep = nt.nodes.new("ShaderNodeSeparateXYZ")
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].color = (*base_color, 1.0)
    ramp.color_ramp.elements[1].color = (*top_color, 1.0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    nt.links.new(tex_coord.outputs["Generated"], sep.inputs["Vector"])
    nt.links.new(sep.outputs["Z"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    nt.links.new(bsdf.outputs["BSDF"], out.inputs["Surface"])
    return mat


# ---- materials -------------------------------------------------------------
mat_lawn = material("lawn", (0.09, 0.55, 0.07), roughness=0.9)
mat_pavement = material("pavement", (0.48, 0.49, 0.48), roughness=0.8)
mat_tarmac = material("tarmac", (0.14, 0.14, 0.15), roughness=0.85)
mat_beach = material("beach", (0.72, 0.66, 0.5), roughness=0.9)
mat_marsh = material("marsh", (0.4, 0.48, 0.46), roughness=0.5)
mat_sandbar = material("sandbar", (0.68, 0.64, 0.5), roughness=0.8)
mat_glass = gradient_material("glass", (0.015, 0.015, 0.02), (0.28, 0.4, 0.55), roughness=0.06, metallic=0.75)
mat_wing = material("wing", (0.72, 0.74, 0.76), roughness=0.4, metallic=0.3)
mat_mullion = material("mullion", (0.5, 0.53, 0.58), roughness=0.4, metallic=0.3)
mat_mark = material("mark", (0.92, 0.94, 0.97), roughness=0.3, emission=(0.9, 0.95, 1.0), emission_strength=0.4)
mat_trunk = material("trunk", (0.30, 0.20, 0.12), roughness=0.9)
mat_frond = material("frond", (0.14, 0.36, 0.14), roughness=0.8)
mat_flagpole = material("flagpole", (0.6, 0.6, 0.62), roughness=0.4, metallic=0.6)
mat_flag_white = material("flag_white", (0.9, 0.9, 0.92), roughness=0.6)
mat_flag_red = material("flag_red", (0.6, 0.08, 0.08), roughness=0.6)
mat_flag_blue = material("flag_blue", (0.06, 0.1, 0.35), roughness=0.6)
mat_hull = material("hull", (0.72, 0.73, 0.75), roughness=0.25, metallic=0.85)
mat_hull_dark = material("hull_dark", (0.35, 0.35, 0.37), roughness=0.35, metallic=0.8)
mat_car_a = material("car_a", (0.55, 0.05, 0.05), roughness=0.3, metallic=0.5)
mat_car_b = material("car_b", (0.08, 0.08, 0.09), roughness=0.3, metallic=0.5)
mat_car_c = material("car_c", (0.75, 0.78, 0.8), roughness=0.3, metallic=0.5)

# ---- ground: pavement plaza near camera, lawn/road/beach/marsh receding ----
bpy.ops.mesh.primitive_plane_add(size=500, location=(0, 0, 0))
ground = bpy.context.object
ground.name = "ground"
ground.data.materials.append(mat_pavement)

add_box("marsh", (-20, 115, 0.01), (110, 55, 0.01), mat_marsh)
add_box("sandbar_a", (-40, 128, 0.015), (22, 4, 0.01), mat_sandbar)
add_box("sandbar_b", (-85, 108, 0.015), (16, 3, 0.01), mat_sandbar)
add_box("beach", (-20, 58, 0.015), (110, 6, 0.01), mat_beach)
add_box("road", (-20, 45, 0.02), (115, 8, 0.01), mat_tarmac)
add_box("lawn_patch", (55, -2, 0.025), (20, 9, 0.01), mat_lawn)
add_box("parking", (100, 8, 0.03), (12, 5, 0.01), mat_tarmac)
for i, (dx, mat) in enumerate([(-10, mat_car_a), (6, mat_car_b), (22, mat_car_c)]):
    add_box(f"car{i}", (100 + dx * 0.6, 8, 0.7), (2.2, 1, 0.7), mat)
for i, x in enumerate((-30, -15)):
    add_box(f"road_car{i}", (x, 45, 0.7), (2, 0.9, 0.65), mat_flag_white)

# ---- the HQ, built then rotated as one group for real 3/4 perspective -----
hq_group = []
hq_main = add_box("hq_main", (60, 13, 16), (20, 9, 16), mat_glass, hq_group)
hq_wing = add_box("hq_wing", (93, 8, 10), (14, 7, 10), mat_wing, hq_group)
for i in range(13):
    x = 42 + i * 3
    add_box(f"mullion_v{i}", (x, 4.05, 16), (0.05, 0.02, 15.8), mat_mullion, hq_group)
for i in range(5):
    z = 3 + i * 6
    add_box(f"mullion_h{i}", (60, 4.05, z), (19.8, 0.02, 0.05), mat_mullion, hq_group)
# The mark, two crossing bars on the building's face — tilted about the
# depth axis (Y) so they lean across the face rather than spin flat on it.
mark1 = add_box("mark1", (52, 3.9, 18), (0.5, 0.02, 6), mat_mark, hq_group)
mark1.rotation_euler = (0, math.radians(35), 0)
mark2 = add_box("mark2", (52, 3.9, 18), (0.5, 0.02, 6), mat_mark, hq_group)
mark2.rotation_euler = (0, math.radians(-35), 0)

# The flag, on the lower wing's near corner.
flagpole = add_cylinder("flagpole", (104, 3, 10), 0.15, 20, mat_flagpole)
hq_group.append(flagpole)
flag_white = add_box("flag_white", (105.6, 3, 18), (1.6, 0.02, 0.9), mat_flag_white, hq_group)
flag_canton = add_box("flag_canton", (104.3, 3, 18.6), (0.55, 0.03, 0.35), mat_flag_blue, hq_group)
for i in range(2):
    add_box(f"flag_stripe{i}", (105.6, 3.02, 17.4 + i * 0.45), (1.6, 0.02, 0.18), mat_flag_red, hq_group)

# Each object tilts about its own centre by the same small angle — the
# building reads as turned away from the camera without the group-pivot
# maths (which needs a depsgraph refresh before matrix_world is trustworthy).
for obj in hq_group:
    obj.rotation_euler = (obj.rotation_euler[0], obj.rotation_euler[1], obj.rotation_euler[2] - math.radians(11))

# ---- palms ---------------------------------------------------------------
def palm(x, y, r=2.0):
    add_cylinder(f"trunk_{x}_{y}", (x, y, 3), 0.35, 6, mat_trunk)
    bpy.ops.mesh.primitive_uv_sphere_add(radius=r, location=(x, y, 6.6))
    obj = bpy.context.object
    obj.name = f"canopy_{x}_{y}"
    obj.scale = (1, 1, 0.55)
    obj.data.materials.append(mat_frond)


# The walkway row, lining the lawn in front of the HQ.
for px in range(45, 96, 6):
    palm(px, 2)
# A near-camera row, bigger for being closer, cropped at the frame's edges.
for px in (-95, -85, -20, -8, 5):
    palm(px, -25, r=2.6)

# ---- Starship, standing upright on its transporter, beside the road ------
ship_x, ship_y = -70, 45
transporter_top = 2
add_box("transporter", (ship_x, ship_y, 1), (14, 4, 1), mat_hull_dark)
for i in range(6):
    wx = ship_x - 12 + i * 5
    add_cylinder(f"wheel{i}a", (wx, ship_y - 3.6, 0.5), 0.5, 1.4, mat_hull_dark, rotation=(math.radians(90), 0, 0))
    add_cylinder(f"wheel{i}b", (wx, ship_y + 3.6, 0.5), 0.5, 1.4, mat_hull_dark, rotation=(math.radians(90), 0, 0))

body_h = 42
body_r = 4.3
body_z = transporter_top + body_h / 2
add_cylinder("ship_body", (ship_x, ship_y, body_z), body_r, body_h, mat_hull)
nose_h = 9
nose_z = transporter_top + body_h + nose_h / 2
add_cone("ship_nose", (ship_x, ship_y, nose_z), body_r, nose_h, mat_hull)

# Forward flaps, near the nose end, and aft flaps, near the transporter —
# both pairs canted outward the way the real vehicle's actuated flaps sit.
flap_z_fwd = transporter_top + body_h - 6
for side in (-1, 1):
    flap = add_box(
        f"ship_flap_fwd{side}", (ship_x, ship_y + side * (body_r + 2), flap_z_fwd), (0.4, 2.2, 3.2), mat_hull_dark
    )
    flap.rotation_euler = (math.radians(side * 12), 0, 0)
flap_z_aft = transporter_top + 7
for side in (-1, 1):
    flap = add_box(
        f"ship_flap_aft{side}", (ship_x, ship_y + side * (body_r + 1.6), flap_z_aft), (0.4, 1.8, 2.6), mat_hull_dark
    )
    flap.rotation_euler = (math.radians(side * 10), 0, 0)

# ---- sky + sun -------------------------------------------------------------
# A flat two-stop gradient rather than a physically-lit sky: Nishita's actual
# radiance fought Blender's exposure pipeline (blown white under Standard,
# washed to cream under AgX) no matter how it was tuned. This is deterministic.
world = bpy.data.worlds.new("sky")
scene.world = world
world.use_nodes = True
nt = world.node_tree
nt.nodes.clear()
tex_coord = nt.nodes.new("ShaderNodeTexCoord")
sep = nt.nodes.new("ShaderNodeSeparateXYZ")
map_range = nt.nodes.new("ShaderNodeMapRange")
map_range.inputs["From Min"].default_value = -0.1
map_range.inputs["From Max"].default_value = 0.6
ramp = nt.nodes.new("ShaderNodeValToRGB")
ramp.color_ramp.elements[0].color = (0.55, 0.78, 0.97, 1.0)
ramp.color_ramp.elements[1].color = (0.16, 0.42, 0.85, 1.0)
# Fluffy clouds: noise broken into blobs, mixed over the blue as white.
cloud_noise = nt.nodes.new("ShaderNodeTexNoise")
cloud_noise.inputs["Scale"].default_value = 2.2
cloud_noise.inputs["Detail"].default_value = 4.0
cloud_ramp = nt.nodes.new("ShaderNodeValToRGB")
cloud_ramp.color_ramp.elements[0].position = 0.5
cloud_ramp.color_ramp.elements[0].color = (1, 1, 1, 0)
cloud_ramp.color_ramp.elements[1].position = 0.64
cloud_ramp.color_ramp.elements[1].color = (1, 1, 1, 1)
cloud_mix = nt.nodes.new("ShaderNodeMix")
cloud_mix.data_type = "RGBA"
cloud_mix.inputs["B"].default_value = (1.0, 1.0, 1.0, 1.0)
bg = nt.nodes.new("ShaderNodeBackground")
out = nt.nodes.new("ShaderNodeOutputWorld")
nt.links.new(tex_coord.outputs["Generated"], sep.inputs["Vector"])
nt.links.new(sep.outputs["Z"], map_range.inputs["Value"])
nt.links.new(map_range.outputs["Result"], ramp.inputs["Fac"])
nt.links.new(tex_coord.outputs["Generated"], cloud_noise.inputs["Vector"])
nt.links.new(cloud_noise.outputs["Fac"], cloud_ramp.inputs["Fac"])
nt.links.new(ramp.outputs["Color"], cloud_mix.inputs["A"])
nt.links.new(cloud_ramp.outputs["Alpha"], cloud_mix.inputs["Factor"])
nt.links.new(cloud_mix.outputs["Result"], bg.inputs["Color"])
nt.links.new(bg.outputs["Background"], out.inputs["Surface"])

sun_elevation = math.radians(27)
sun_rotation = math.radians(230)
sun_data = bpy.data.lights.new("sun", type="SUN")
sun_data.energy = 3.5
sun_obj = bpy.data.objects.new("sun", sun_data)
scene.collection.objects.link(sun_obj)
sun_obj.rotation_euler = (math.pi / 2 - sun_elevation, 0, sun_rotation + math.pi)

# ---- camera ----------------------------------------------------------------
cam_data = bpy.data.cameras.new("cam")
cam_data.lens = 24
cam_obj = bpy.data.objects.new("cam", cam_data)
scene.collection.objects.link(cam_obj)
scene.camera = cam_obj
cam_obj.location = (20, -120, 40)
target = mathutils.Vector((20, 30, 10))
direction = target - cam_obj.location
cam_obj.rotation_euler = direction.to_track_quat("-Z", "Y").to_euler()

# ---- render ----------------------------------------------------------------
# AgX (Blender's default since 4.0) tone-maps a bright sky toward pale cream;
# Standard keeps the sky the blue the Nishita texture actually computed.
scene.view_settings.view_transform = "Standard"
try:
    scene.render.engine = "BLENDER_EEVEE_NEXT"
except Exception:
    scene.render.engine = "BLENDER_EEVEE"
scene.render.resolution_x = 1920
scene.render.resolution_y = 1092
scene.eevee.taa_render_samples = 128
scene.render.film_transparent = False
scene.render.image_settings.file_format = "PNG"
scene.render.filepath = out_path
bpy.ops.render.render(write_still=True)
