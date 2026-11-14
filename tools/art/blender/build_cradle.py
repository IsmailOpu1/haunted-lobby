# Builds the Nursery's cradle for the "Rock the cradle" task (GDD 26.5): the game rocks it, the baby
# in it stirs and the mobile over it turns, so these are live parts the game moves, not baked into the
# room. Painted wood and cloth, plain colours (no textures), so the file stays small.
# Run: blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_cradle.py
# Writes client/public/assets/stations/cradle.glb with four nodes, each at its pivot:
#   "cradle"  the rocking part (rockers, posts, spindle sides, end boards, hood, mattress, blanket),
#             pivot on the floor under its middle; it rocks side to side about its length.
#   "baby"    the swaddled baby, at the same pivot (the game shakes it when it cries).
#   "stand"   the post beside the cradle and the arm out over it (it does not move).
#   "mobile"  the hanging mobile, its pivot where it hangs (1.3 m up over the middle); it turns.
# In glTF axes the foot of the cradle faces +z (toward the player at the task), the head and its
# hood -z (toward the wall), like the station models.
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
OUT = os.path.join(ROOT, "client/public/assets/stations/cradle.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene
_mats = {}


def mat(name, rgb, rough):
    if name not in _mats:
        m = bpy.data.materials.new(name)
        m.use_nodes = True
        b = m.node_tree.nodes["Principled BSDF"]
        b.inputs["Base Color"].default_value = (*rgb, 1.0)
        b.inputs["Roughness"].default_value = rough
        _mats[name] = m
    return _mats[name]


# Old cream paint gone grey, kept dark enough that the torch at arm's length does not blow it out.
PAINT = mat("cradle_paint", (0.27, 0.26, 0.22), 0.66)
SHEET = mat("cradle_sheet", (0.32, 0.3, 0.27), 0.9)
BLANKET = mat("cradle_blanket", (0.11, 0.14, 0.19), 0.92)
LACE = mat("baby_bonnet", (0.36, 0.34, 0.3), 0.85)
SKIN = mat("baby_skin", (0.42, 0.28, 0.22), 0.6)
STAND = mat("stand_wood", (0.07, 0.04, 0.022), 0.55)
STRING = mat("mobile_string", (0.2, 0.18, 0.15), 0.9)
TOYS = [mat("toy_red", (0.3, 0.06, 0.04), 0.6), mat("toy_blue", (0.06, 0.1, 0.22), 0.6), mat("toy_ochre", (0.36, 0.24, 0.06), 0.6), mat("toy_green", (0.08, 0.16, 0.08), 0.6)]


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


def box(name, a, b, material):
    lo = Vector(map(min, a, b))
    hi = Vector(map(max, a, b))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((lo.x + (v.co.x + 0.5) * (hi.x - lo.x), lo.y + (v.co.y + 0.5) * (hi.y - lo.y), lo.z + (v.co.z + 0.5) * (hi.z - lo.z)))
    ob = obj(name, bm, material)
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = min(0.006, min(hi - lo) * 0.3)
    mod.segments = 2
    return ob


def rod(name, a, b, r, material, segments=10):
    bm = bmesh.new()
    d = b - a
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=d.length)
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ d.to_track_quat("Z", "Y").to_matrix().to_4x4(), verts=bm.verts)
    ob = obj(name, bm, material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def lathe(name, profile, at, material, segments=20, scale=(1.0, 1.0, 1.0)):
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, h)) for r, h in profile]
    edges = [bm.edges.new((verts[k], verts[k + 1])) for k in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), steps=segments, angle=math.tau, use_duplicate=False)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ Matrix.Diagonal((*scale, 1.0)), verts=bm.verts)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = obj(name, bm, material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def blob(name, at, radii, material, segments=20):
    """A smooth rounded lump (a swaddled body, a head, a pillow)."""
    bm = bmesh.new()
    bmesh.ops.create_uvsphere(bm, u_segments=segments, v_segments=max(8, segments // 2), radius=1.0)
    bmesh.ops.transform(bm, matrix=Matrix.Translation(at) @ Matrix.Diagonal((*radii, 1.0)), verts=bm.verts)
    ob = obj(name, bm, material)
    for p in ob.data.polygons:
        p.use_smooth = True
    return ob


def rocker(name, y, half, material):
    """A curved rocker across the cradle's width at y: its underside an arc touching the floor in the
    middle and rising 0.05 to the tips; 0.025 thick."""
    bm = bmesh.new()
    n = 16
    R = (half * half + 0.05 * 0.05) / (2 * 0.05)
    top, under = [], []
    for k in range(n + 1):
        x = -half + 2 * half * k / n
        zb = R - math.sqrt(max(0.0, R * R - x * x))
        under.append((x, zb))
        top.append((x, zb + 0.065 - 0.02 * (abs(x) / half) ** 2))
    ring = under + list(reversed(top))
    vs0 = [bm.verts.new((x, y - 0.0125, z)) for x, z in ring]
    vs1 = [bm.verts.new((x, y + 0.0125, z)) for x, z in ring]
    bm.faces.new(vs0)
    bm.faces.new(list(reversed(vs1)))
    m = len(ring)
    for k in range(m):
        bm.faces.new((vs0[k], vs0[(k + 1) % m], vs1[(k + 1) % m], vs1[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, material)


def hood(name, y0, y1, hw, zc, material, steps=18):
    """A hood over the head end: a half-round shell across the width from y0 to y1, its rim on the
    side rails at zc, 0.012 thick, closed at the head (y1) by a half-round board."""
    bm = bmesh.new()
    rings = []
    for r in (hw, hw - 0.012):
        for y in (y0, y1):
            rings.append([bm.verts.new((r * math.cos(math.pi * k / steps), y, zc + r * 0.8 * math.sin(math.pi * k / steps))) for k in range(steps + 1)])
    o0, o1, i0, i1 = rings
    for k in range(steps):
        bm.faces.new((o0[k], o0[k + 1], o1[k + 1], o1[k]))
        bm.faces.new((i0[k], i1[k], i1[k + 1], i0[k + 1]))
        bm.faces.new((o0[k], i0[k], i0[k + 1], o0[k + 1]))
    back = [bm.verts.new((hw * math.cos(math.pi * k / steps), y1, zc + hw * 0.8 * math.sin(math.pi * k / steps))) for k in range(steps + 1)]
    bm.faces.new(back)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return obj(name, bm, material)


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


# ------------------------------------------------------------------ the cradle (Blender: +y the head)
W, L = 0.5, 0.92
hw, hl = W / 2, L / 2
FLOOR, TOP = 0.3, 0.68
parts = []
for k, y in enumerate((-hl + 0.07, hl - 0.07)):
    parts.append(rocker(f"rocker{k}", y, hw + 0.08, PAINT))
# Corner posts on the rockers, rails low and high, spindles between.
for k, (x, y) in enumerate(((-hw, -hl), (hw, -hl), (-hw, hl), (hw, hl))):
    top = TOP + (0.12 if y > 0 else 0.05)
    parts.append(box(f"post{k}", Vector((x - 0.02, y - 0.02, 0.04)), Vector((x + 0.02, y + 0.02, top)), PAINT))
    parts.append(lathe(f"knob{k}", [(0.0, 0.0), (0.016, 0.0), (0.022, 0.015), (0.014, 0.03), (0.0, 0.035)], Vector((x, y, top)), PAINT, 12))
for k, x in enumerate((-hw, hw)):
    for name, z, h in (("low", FLOOR - 0.02, 0.03), ("high", TOP - 0.03, 0.035)):
        parts.append(box(f"rail{name}{k}", Vector((x - 0.015, -hl + 0.02, z)), Vector((x + 0.015, hl - 0.02, z + h)), PAINT))
    n = 9
    for s in range(n):
        y = -hl + 0.02 + (s + 1) * (L - 0.04) / (n + 1)
        parts.append(rod(f"spindle{k}_{s}", Vector((x, y, FLOOR + 0.01)), Vector((x, y, TOP - 0.03)), 0.009, PAINT, 8))
# The foot board and the taller head board, the basket's floor.
parts.append(box("foot", Vector((-hw + 0.02, -hl - 0.012, FLOOR - 0.02)), Vector((hw - 0.02, -hl + 0.012, TOP + 0.02)), PAINT))
parts.append(box("head", Vector((-hw + 0.02, hl - 0.012, FLOOR - 0.02)), Vector((hw - 0.02, hl + 0.012, TOP + 0.1)), PAINT))
parts.append(box("floor", Vector((-hw + 0.015, -hl + 0.012, FLOOR - 0.02)), Vector((hw - 0.015, hl - 0.012, FLOOR)), PAINT))
# Low stretchers between the rockers, under the basket.
for k, x in enumerate((-hw + 0.06, hw - 0.06)):
    parts.append(box(f"stretcher{k}", Vector((x - 0.015, -hl + 0.06, 0.05)), Vector((x + 0.015, hl - 0.06, 0.08)), PAINT))
parts.append(hood("hood", hl - 0.3, hl, hw + 0.005, TOP, PAINT))
# The bedding: a mattress, a pillow at the head, a blanket over the lower part.
parts.append(box("mattress", Vector((-hw + 0.025, -hl + 0.025, FLOOR)), Vector((hw - 0.025, hl - 0.025, FLOOR + 0.07)), SHEET))
parts.append(blob("pillow", Vector((0.0, hl - 0.13, FLOOR + 0.09)), (0.16, 0.08, 0.035), SHEET))
parts.append(box("blanket", Vector((-hw + 0.022, -hl + 0.022, FLOOR + 0.05)), Vector((hw - 0.022, 0.06, FLOOR + 0.1)), BLANKET))
cradle = join("cradle", parts)

# ------------------------------------------------------------------ the baby, swaddled, head on the pillow
baby = join("baby", [
    blob("swaddle", Vector((0.0, 0.0, FLOOR + 0.11)), (0.085, 0.19, 0.06), LACE),
    blob("head", Vector((0.0, hl - 0.2, FLOOR + 0.135)), (0.058, 0.062, 0.055), SKIN),
    blob("bonnet", Vector((0.0, hl - 0.18, FLOOR + 0.14)), (0.066, 0.06, 0.062), LACE),
])

# ------------------------------------------------------------------ the stand and its arm
SX, SY = -hw - 0.17, hl - 0.18
ARM_Z = 1.42
stand = join("stand", [
    box("standFootA", Vector((SX - 0.16, SY - 0.025, 0.0)), Vector((SX + 0.16, SY + 0.025, 0.04)), STAND),
    box("standFootB", Vector((SX - 0.025, SY - 0.16, 0.0)), Vector((SX + 0.025, SY + 0.16, 0.04)), STAND),
    lathe("standPost", [(0.0, 0.0), (0.03, 0.0), (0.03, 0.06), (0.018, 0.1), (0.016, ARM_Z - 0.1), (0.022, ARM_Z - 0.04), (0.0, ARM_Z - 0.01)], Vector((SX, SY, 0.04)), STAND, 12),
    rod("standArm", Vector((SX, SY, ARM_Z)), Vector((0.0, 0.0, ARM_Z)), 0.011, STAND, 8),
    rod("standHook", Vector((0.0, 0.0, ARM_Z)), Vector((0.0, 0.0, 1.31)), 0.003, STRING, 6),
])

# ------------------------------------------------------------------ the mobile, its pivot at the hook
MZ = 1.3
mobile_parts = [
    rod("barA", Vector((-0.16, 0.0, MZ)), Vector((0.16, 0.0, MZ)), 0.004, STAND, 6),
    rod("barB", Vector((0.0, -0.16, MZ)), Vector((0.0, 0.16, MZ)), 0.004, STAND, 6),
]
for k, (x, y) in enumerate(((0.15, 0.0), (-0.15, 0.0), (0.0, 0.15), (0.0, -0.15))):
    drop = 0.12 + 0.04 * (k % 2)
    mobile_parts.append(rod(f"string{k}", Vector((x, y, MZ)), Vector((x, y, MZ - drop)), 0.0015, STRING, 5))
    # A little carved star: a flattened five-sided bead.
    mobile_parts.append(lathe(f"toy{k}", [(0.0, -0.032), (0.03, 0.0), (0.0, 0.032)], Vector((x, y, MZ - drop - 0.032)), TOYS[k], 5, (1.0, 0.35, 1.0)))
mobile = join("mobile", mobile_parts)
# Its origin at the hook, so the game turns it round the string it hangs from.
mobile.data.transform(Matrix.Translation((0.0, 0.0, -MZ)))
mobile.location = (0.0, 0.0, MZ)

for ob in (cradle, baby, stand, mobile):
    ob.select_set(True)
os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
for ob in (cradle, baby, stand, mobile):
    print(ob.name, len(ob.data.polygons), "faces")
print("Cradle written to", OUT)
