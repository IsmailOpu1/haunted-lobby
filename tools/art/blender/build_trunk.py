# Builds the Staff Quarters' steamer trunk for the "Seal the old trunk" task (GDD 26.5): the game
# springs its lid against the latches and turns the latches, so these are live parts the game moves,
# not baked into the room. Plain colours (no textures), so the file stays small.
# Run: blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_trunk.py
# Writes client/public/assets/stations/trunk.glb with four nodes, each at its pivot:
#   "body"   the trunk without its lid: canvas over wood, wooden slats, iron corners, end handles,
#            the dark inside showing at the top; origin on the floor under its middle.
#   "lid"    the lid, origin at its hinge (the back top edge); it opens up and back.
#   "catch"  one iron hasp plate on the front, origin at its middle (the game places one per latch).
#   "latch"  one brass turn-button, origin at its pivot; it turns in the plane of the front.
# Sizes match the game's trunk (client/src/stations.ts): body 1.0 x 0.55 x 0.5, lid 1.02 x 0.57 x
# 0.12 hinged at the back top. In glTF axes the front faces +z (toward the player), like the station
# models; in Blender the front is -y.
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
OUT = os.path.join(ROOT, "client/public/assets/stations/trunk.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
_mats = {}


def mat(name, rgb, rough, metal=0.0):
    if name not in _mats:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*rgb, 1.0)
        b.inputs["Roughness"].default_value = rough
        b.inputs["Metallic"].default_value = metal
        _mats[name] = m
    return _mats[name]


# Black-green painted canvas gone dull, oak slats, blackened iron, brass worn brown; rough enough
# that the torch at arm's length does not throw a glare off them.
CANVAS = mat("trunk_canvas", (0.045, 0.055, 0.042), 0.82)
WOOD = mat("trunk_slat", (0.15, 0.085, 0.04), 0.62)
IRON = mat("trunk_iron", (0.035, 0.033, 0.03), 0.6, 0.6)
BRASS = mat("trunk_brass", (0.3, 0.2, 0.08), 0.55, 1.0)
LEATHER = mat("trunk_leather", (0.09, 0.045, 0.025), 0.7)
INSIDE = mat("trunk_inside", (0.012, 0.009, 0.008), 0.9)


def obj(name, bm, material):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    me.materials.append(material)
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    for p in me.polygons:
        p.use_smooth = False
    return ob


def box(name, a, b, material, bevel=0.004):
    lo = Vector(map(min, a, b))
    hi = Vector(map(max, a, b))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((lo.x + (v.co.x + 0.5) * (hi.x - lo.x), lo.y + (v.co.y + 0.5) * (hi.y - lo.y), lo.z + (v.co.z + 0.5) * (hi.z - lo.z)))
    ob = obj(name, bm, material)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = min(bevel, min(hi - lo) * 0.3)
        mod.segments = 2
    return ob


def disc(name, at, r, depth, material, segments=16):
    """A round boss or rivet facing -y (out of the front)."""
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r * 0.8, depth=depth)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ Matrix.Rotation(math.radians(90), 4, "X"), verts=bm.verts)
    ob = obj(name, bm, material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def join(name, parts):
    for o in parts:
        bpy.context.view_layer.objects.active = o
        for m in list(o.modifiers):
            bpy.ops.object.modifier_apply(modifier=m.name)
    for o in bpy.context.selected_objects:
        o.select_set(False)
    for o in parts:
        o.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    ob.select_set(False)
    return ob


# ------------------------------------------------------------------ the body (front -y)
W, D, H = 1.0, 0.55, 0.5
hw, hd = W / 2, D / 2
S = 0.012  # how far slats and irons stand proud of the canvas
parts = [box("canvas", Vector((-hw, -hd, 0.02)), Vector((hw, hd, H - 0.005)), CANVAS, 0.006)]
# The dark inside, seen when the lid lifts.
parts.append(box("inside", Vector((-hw + 0.03, -hd + 0.03, H - 0.006)), Vector((hw - 0.03, hd - 0.03, H - 0.002)), INSIDE, 0))
# Two skids underneath.
for k, y in enumerate((-hd + 0.06, hd - 0.06)):
    parts.append(box(f"skid{k}", Vector((-hw + 0.02, y - 0.03, 0.0)), Vector((hw - 0.02, y + 0.03, 0.025)), WOOD))
# Horizontal slats round all four sides, low and high; the high one sits below the latches.
for k, z in enumerate((0.06, 0.33)):
    parts.append(box(f"slatF{k}", Vector((-hw, -hd - S, z)), Vector((hw, -hd + 0.002, z + 0.055)), WOOD))
    parts.append(box(f"slatB{k}", Vector((-hw, hd - 0.002, z)), Vector((hw, hd + S, z + 0.055)), WOOD))
    parts.append(box(f"slatL{k}", Vector((-hw - S, -hd, z)), Vector((-hw + 0.002, hd, z + 0.055)), WOOD))
    parts.append(box(f"slatR{k}", Vector((hw - 0.002, -hd, z)), Vector((hw + S, hd, z + 0.055)), WOOD))
# Upright slats on the front and back, clear of the latches (at x -0.3, 0, 0.3).
for k, x in enumerate((-0.42, -0.15, 0.15, 0.42)):
    for side, (y0, y1) in (("F", (-hd - S - 0.002, -hd)), ("B", (hd, hd + S + 0.002))):
        parts.append(box(f"up{side}{k}", Vector((x - 0.028, y0, 0.03)), Vector((x + 0.028, y1, H - 0.02)), WOOD))
# Iron caps on the eight corners.
for k, (sx, sy) in enumerate(((-1, -1), (1, -1), (-1, 1), (1, 1))):
    x, y = sx * hw, sy * hd
    for j, (z0, z1) in enumerate(((0.0, 0.085), (H - 0.075, H))):
        parts.append(box(f"capX{k}{j}", Vector((x - sx * 0.08, y - sy * 0.003, z0)), Vector((x + sx * (S + 0.004), y + sy * (S + 0.004), z1)), IRON, 0.003))
        parts.append(box(f"capY{k}{j}", Vector((x - sx * 0.003, y - sy * 0.08, z0)), Vector((x + sx * (S + 0.004), y + sy * (S + 0.004), z1)), IRON, 0.003))
# Leather handles on the ends, in iron loops.
for k, sx in enumerate((-1, 1)):
    x = sx * (hw + S)
    parts.append(box(f"loop{k}a", Vector((x, -0.11, 0.37)), Vector((x + sx * 0.012, -0.08, 0.41)), IRON, 0.002))
    parts.append(box(f"loop{k}b", Vector((x, 0.08, 0.37)), Vector((x + sx * 0.012, 0.11, 0.41)), IRON, 0.002))
    parts.append(box(f"handle{k}", Vector((x + sx * 0.006, -0.1, 0.35)), Vector((x + sx * 0.03, 0.1, 0.37)), LEATHER, 0.004))
# Brass lock plate in the middle of the front, under the middle latch's catch.
parts.append(box("lockplate", Vector((-0.045, -hd - S - 0.004, 0.2)), Vector((0.045, -hd - S + 0.002, 0.29)), BRASS, 0.003))
parts.append(box("keyhole", Vector((-0.006, -hd - S - 0.006, 0.23)), Vector((0.006, -hd - S - 0.003, 0.26)), INSIDE, 0))
body = join("body", parts)

# ------------------------------------------------------------------ the lid, origin at the hinge
# The hinge is at the back top edge; the lid runs forward (-y) from it.
LW, LD, LH = 1.02, 0.57, 0.12
lw = LW / 2
lid_parts = [
    box("lidCanvas", Vector((-lw, -LD, 0.0)), Vector((lw, 0.0, LH - 0.025)), CANVAS, 0.006),
    # A low dome on top.
    box("lidDome", Vector((-lw + 0.04, -LD + 0.04, LH - 0.03)), Vector((lw - 0.04, -0.04, LH)), CANVAS, 0.012),
]
# Slats round the lid's edge and across its top.
lid_parts.append(box("lidSlatF", Vector((-lw, -LD - S, 0.025)), Vector((lw, -LD + 0.002, 0.08)), WOOD))
lid_parts.append(box("lidSlatB", Vector((-lw, -0.002, 0.025)), Vector((lw, S, 0.08)), WOOD))
for k, x in enumerate((-0.42, -0.15, 0.15, 0.42)):
    lid_parts.append(box(f"lidTop{k}", Vector((x - 0.028, -LD - S, LH - 0.03)), Vector((x + 0.028, S, LH + 0.008)), WOOD))
# Iron binding along the lid's front lower edge, and iron corners.
lid_parts.append(box("lidBand", Vector((-lw, -LD - S - 0.004, 0.0)), Vector((lw, -LD + 0.01, 0.022)), IRON, 0.002))
for k, (sx, y) in enumerate(((-1, -LD), (1, -LD), (-1, 0.0), (1, 0.0))):
    x = sx * lw
    lid_parts.append(box(f"lidCap{k}", Vector((x - sx * 0.07, y - 0.015, 0.0)), Vector((x + sx * (S + 0.004), y + 0.015, LH + 0.004)), IRON, 0.003))
# The hinges at the back.
for k, x in enumerate((-0.3, 0.3)):
    lid_parts.append(box(f"hinge{k}", Vector((x - 0.04, S - 0.002, -0.04)), Vector((x + 0.04, S + 0.006, 0.06)), IRON, 0.002))
lid = join("lid", lid_parts)

# ------------------------------------------------------------------ one hasp plate, origin at its middle
catch = join("catch", [
    box("catchPlate", Vector((-0.032, -0.005, -0.04)), Vector((0.032, 0.005, 0.035)), IRON, 0.003),
    disc("catchRivetA", Vector((-0.02, -0.006, -0.025)), 0.005, 0.004, IRON, 8),
    disc("catchRivetB", Vector((0.02, -0.006, -0.025)), 0.005, 0.004, IRON, 8),
])

# ------------------------------------------------------------------ one brass turn-button, origin at its pivot
# It stands upright when shut (its long way up), in front of the catch; it turns about its boss.
latch = join("latch", [
    box("latchBar", Vector((-0.013, -0.016, -0.05)), Vector((0.013, -0.004, 0.05)), BRASS, 0.004),
    disc("latchBoss", Vector((0.0, -0.018, 0.0)), 0.016, 0.008, BRASS, 16),
])

for ob in (body, lid, catch, latch):
    ob.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
for ob in (body, lid, catch, latch):
    print(ob.name, len(ob.data.polygons), "faces")
print("Trunk written to", OUT)
