# Builds what you hold in first person with your own character's arm: their real hand and sleeve
# (owner, 2026-11-14: the character's own hand, not a separate hand model) closed around the torch.
# The grip is worked out as in build_hand.py: the torch lies diagonally across the palm (index
# knuckle to the pad under the little finger), the hand is turned so the forearm runs back to the
# lower right of the screen, then each finger joint curls until it rests on the torch and the thumb
# is laid along its side. Only the forearm and hand are kept, with the character's own textures.
#
# Run (headless):
#   blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_held_hand.py -- <id> [--preview]
#   <id> is a character id (build_character.py); reads assets-src/build/char-<id>.glb and
#   assets-src/models/hand_torch/hand_torch.gltf (build_torch.py), writes
#   assets-src/models/held_<id>/held_<id>.gltf; then: npx tsx tools/art/build-held.ts held_<id>
import math
import os
import re
import sys

import bmesh
import bpy
import numpy as np
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHO = args[0] if args else "priest"
PREVIEW = "--preview" in args
TORCH = os.path.join(ROOT, "assets-src/models/hand_torch/hand_torch.gltf")
CHARACTER = os.path.join(ROOT, f"assets-src/build/char-{WHO}.glb")
OUT_DIR = os.path.join(ROOT, f"assets-src/models/held_{WHO}")
OUT = os.path.join(OUT_DIR, f"held_{WHO}.gltf")

# The torch (build_torch.py): along Blender Y, lens at -Y, centred on its length (0.245 m). The
# ribbed grip runs from 0.025 to 0.106 m from the tail, which is at +Y.
TORCH_LENGTH = 0.245
GRIP_FROM_TAIL = (0.025, 0.106)
GRIP_Y = TORCH_LENGTH / 2 - sum(GRIP_FROM_TAIL) / 2
# As build_hand.py, so the game holds it the same way (heldFlashlight.ts HOLD): the forearm runs
# back, right and down, out of the screen's corner; overhand, the palm facing down and to the left.
FOREARM_TOWARD = Vector((-0.5, 0.72, -0.48)).normalized()
PALM_TOWARD = Vector((0.5, 0, -0.85)).normalized()
WRIST_BEND = 45  # the most the wrist bends either way about each of its two axes, in degrees
WRIST_COST = 0.004  # per degree of bend, so the wrist bends no more than it needs
BAR_BEHIND_KNUCKLE = 0.008
FINGER_PAD = 0.0085  # from a finger bone to the skin on its palm side
CURL_MAX = (90, 100, 80)  # knuckle, middle and end joints, as a real hand, in degrees
THUMB_PAST_KNUCKLE = 0.012
THUMB_GAP = 0.013
# What is kept: the forearm and hand (vertices mostly moved by these bones).
KEEP = ("RightForeArm", "RightHand")

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)


def only(ob):
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


# ---------------------------------------------------------------- the torch
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=TORCH)
torch_objs = [o for o in bpy.data.objects if o not in before]
AXIS_DIR = Vector((0, -1, 0))
AXIS_AT = Vector((0, GRIP_Y, 0))


def axis_distance(p):
    return math.hypot(p.x, p.z)


BIN = 0.002
outline = {}
for o in torch_objs:
    if o.type != "MESH":
        continue
    for v in o.data.vertices:
        p = o.matrix_world @ v.co
        k = math.floor(p.y / BIN)
        outline[k] = max(outline.get(k, 0.0), axis_distance(p))


def torch_radius(y):
    k = math.floor(y / BIN)
    near = [outline[j] for j in (k - 1, k, k + 1) if j in outline]
    return max(near) if near else None


def inside_torch(p, margin):
    r = torch_radius(p.y)
    return r is not None and axis_distance(p) < r + margin


# ---------------------------------------------------------------- the character
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=CHARACTER)
mine = [o for o in bpy.data.objects if o not in before]
rig = next(o for o in mine if o.type == "ARMATURE")
skinned = [o for o in mine if o.type == "MESH" and any(m.type == "ARMATURE" for m in o.modifiers)]
if rig.animation_data:
    rig.animation_data.action = None
pb = rig.pose.bones
for b in pb:
    b.rotation_mode = "XYZ"
    b.rotation_euler = (0, 0, 0)
    b.location = (0, 0, 0)
# The rig is moved as a whole below; whatever hangs under it moves with it.
top = rig
while top.parent:
    top = top.parent
bpy.context.view_layer.update()


def bone(name):
    """The pose bone called mixamorig:<name> (however the importer wrote the prefix)."""
    for b in pb:
        if re.sub(r"^mixamorig\d*:?", "", b.name) == name:
            return b
    raise KeyError(name)


def head(n):
    return rig.matrix_world @ bone(n).head


def tail(n):
    """Where bone n ends: the start of the next joint (the importer's own bone ends are unreliable)."""
    b = bone(n)
    if b.children:
        return rig.matrix_world @ b.children[0].head
    return rig.matrix_world @ (b.head + (b.head - b.parent.head))


FINGERS = {2: "Index", 3: "Middle", 4: "Ring", 5: "Pinky"}


def joint(f, j):
    return f"RightHand{FINGERS[f]}{j}"


def frame(x, y):
    x = x.normalized()
    y = (y - x * x.dot(y)).normalized()
    return Matrix((x, y, x.cross(y))).transposed()


def palm_now():
    k2, k5 = head(joint(2, 1)), head(joint(5, 1))
    fdir = (tail(joint(3, 3)) - head(joint(3, 1))).normalized()
    return k2, k5, fdir, (k5 - k2).normalized().cross(fdir).normalized()


# Which way the palm faces: Mixamo's T-pose has the palms down.
_, _, _, n0 = palm_now()
palm_sign = 1 if n0.z < 0 else -1

# Each finger joint's curl: the axis and direction that bends it toward the palm.
curl = {}
for f in (1, 2, 3, 4, 5):
    for j in (1, 2, 3):
        name = f"RightHandThumb{j}" if f == 1 else joint(f, j)
        b = bone(name)
        pal = palm_now()[3] * palm_sign
        tip0 = tail(name)
        best = None
        for axis in (0, 2):
            e = [0.0, 0.0, 0.0]
            e[axis] = 0.4
            b.rotation_euler = e
            bpy.context.view_layer.update()
            toward = (tail(name) - tip0).dot(pal)
            b.rotation_euler = (0, 0, 0)
            bpy.context.view_layer.update()
            if best is None or abs(toward) > abs(best[1]):
                best = (axis, toward)
        curl[name] = (best[0], 1 if best[1] > 0 else -1)


def set_curl(name, rad):
    axis, sign = curl[name]
    e = list(bone(name).rotation_euler)
    e[axis] = rad * sign
    bone(name).rotation_euler = e


GRIP_RADIUS = torch_radius(GRIP_Y)


def fit(under_knuckle, under_pad, across):
    k2, k5, fdir, pal = palm_now()
    pal = pal * palm_sign
    heel = head("RightHand") + (k5 - k2) * 0.4
    bar_index = k2 - fdir * BAR_BEHIND_KNUCKLE + pal * (GRIP_RADIUS + under_knuckle)
    bar_little = heel.lerp(k5, across) + pal * (GRIP_RADIUS + under_pad)
    gdir = (bar_index - bar_little).normalized()
    mid = bar_little + gdir * ((k2 + k5) / 2 - bar_little).dot(gdir)
    back = (head("RightForeArm") - head("RightHand")).normalized()
    best = None
    for step in range(0, 360, 2):
        ref = Matrix.Rotation(math.radians(step), 3, AXIS_DIR) @ Vector((1, 0, 0))
        turn = frame(AXIS_DIR, ref) @ frame(gdir, pal).inverted()
        score = (turn @ back).dot(FOREARM_TOWARD) + (turn @ pal).dot(PALM_TOWARD)
        if best is None or score > best[0]:
            best = (score, turn, mid, pal)
    return best


wrist = bone("RightHand")
rig_rest = top.matrix_world.copy()
FINGER_JOINTS = [joint(f, j) for f in (2, 3, 4, 5) for j in (1, 2, 3)]


def open_hand():
    top.matrix_world = rig_rest
    for n in FINGER_JOINTS:
        set_curl(n, 0.0)
    bpy.context.view_layer.update()


def aim(wx, wz, under_knuckle, under_pad, across):
    """The best turn of the hand for this wrist bend and this line of the torch across the palm."""
    wrist.rotation_euler = (math.radians(wx), 0, math.radians(wz))
    bpy.context.view_layer.update()
    return fit(under_knuckle, under_pad, across)


def place(rot, grip_mid):
    # Turn and move the rig (and its meshes) so the grip's middle lies on the torch's axis.
    top.matrix_world = Matrix.Translation(AXIS_AT) @ rot.to_4x4() @ Matrix.Translation(-grip_mid) @ rig_rest
    bpy.context.view_layer.update()


def bone_gap(n):
    gap = 1.0
    a, b = head(n), tail(n)
    for k in range(1, 5):
        p = a.lerp(b, k / 4)
        r = torch_radius(p.y)
        if r is not None:
            gap = min(gap, axis_distance(p) - r - FINGER_PAD)
    return gap


def settle(f):
    """Curls each joint of finger f in turn until it rests on the torch; returns (degrees, gap) per joint."""
    out = []
    for j in (1, 2, 3):
        n = joint(f, j)
        best = None
        for deg in range(0, CURL_MAX[j - 1] + 1, 2):
            set_curl(n, math.radians(deg))
            bpy.context.view_layer.update()
            gap = bone_gap(n)
            score = abs(gap - 0.0005) + (0.05 if gap < 0 else 0)
            if best is None or score < best[0]:
                best = (score, deg, gap)
        set_curl(n, math.radians(best[1]))
        bpy.context.view_layer.update()
        out.append((best[1], best[2]))
    return out


# Where the torch lies across the palm is searched too: whichever line lets every finger close on
# it, with the hand turned nearest the game's hold. Each try: the wrist bend that aims the hand
# best, then the fingers closed; the cost is the fingers' gaps (mm) and the aim (degrees).
FINGER_GAP_COST = 1.0  # per mm a finger joint stays off the torch
AIM_COST = 1.0  # per degree the forearm or palm is off its aim
best = None
for under_knuckle in (0.008, 0.015):
    for under_pad in (0.005, 0.012, 0.019, 0.026):
        for across in (0.3, 0.45, 0.6, 0.75):
            open_hand()
            line = (under_knuckle, under_pad, across)
            pick = None
            for wx in range(-WRIST_BEND, WRIST_BEND + 1, 5):
                for wz in range(-WRIST_BEND, WRIST_BEND + 1, 5):
                    score, rot, mid, pal = aim(wx, wz, *line)
                    score -= WRIST_COST * (abs(wx) + abs(wz))
                    if pick is None or score > pick[0]:
                        pick = (score, rot, mid, pal, wx, wz)
            _, rot, mid, pal, wx, wz = pick
            aim(wx, wz, *line)
            off = [math.degrees((rot @ v).angle(want)) for v, want in (((head("RightForeArm") - head("RightHand")).normalized(), FOREARM_TOWARD), (pal, PALM_TOWARD))]
            place(rot, mid)
            fingers = {f: settle(f) for f in (2, 3, 4, 5)}
            gaps = sum(max(g, 0.0) * 1000 for joints in fingers.values() for _, g in joints)
            cost = FINGER_GAP_COST * gaps + AIM_COST * sum(off)
            if best is None or cost < best[0]:
                best = (cost, line, wx, wz, rot, mid, pal, off)
cost, line, wx, wz, rot, grip_mid, palm, off = best
open_hand()
aim(wx, wz, *line)
place(rot, grip_mid)
print(f"torch line {line}, wrist bent {wx}, {wz} degrees, cost {cost:.1f}")
print(f"forearm aim: {off[0]:.1f} degrees off; palm aim: {off[1]:.1f} degrees off")
for f in (2, 3, 4, 5):
    print(f"  {FINGERS[f]}: " + ", ".join(f"{d} ({g * 1000:+.1f} mm)" for d, g in settle(f)))

# The thumb along the torch's side, pointing at the lens, its tip level with the index knuckle.
THUMB = ["RightHandThumb1", "RightHandThumb2", "RightHandThumb3"]
base = head(THUMB[1])
tip_y = head(joint(2, 1)).y - THUMB_PAST_KNUCKLE
side = Vector((base.x, 0, base.z)).normalized()
thumb_target = Vector((0, tip_y, 0)) + side * (torch_radius(tip_y) + FINGER_PAD)
finger_pts = [head(n).lerp(tail(n), k / 4) for f in (2, 3) for n in (joint(f, 1), joint(f, 2), joint(f, 3)) for k in range(5)]


def thumb_cost(params):
    ax, az, bx, cx, bz = params
    bone(THUMB[0]).rotation_euler = (ax, 0, az)
    bone(THUMB[1]).rotation_euler = (bx, 0, bz)
    e = [0.0, 0.0, 0.0]
    axis, sign = curl[THUMB[2]]
    e[axis] = cx * sign
    bone(THUMB[2]).rotation_euler = e
    bpy.context.view_layer.update()
    cost = (tail(THUMB[2]) - thumb_target).length
    for n in THUMB[1:]:
        for k in range(1, 5):
            p = head(n).lerp(tail(n), k / 4)
            if inside_torch(p, FINGER_PAD):
                cost += 1.0 + (torch_radius(p.y) + FINGER_PAD - axis_distance(p)) * 50
            d = min((p - q).length for q in finger_pts)
            if d < THUMB_GAP:
                cost += 1.0 + (THUMB_GAP - d) * 50
    return cost


LIMITS = [(-1.2, 1.2), (-1.2, 1.2), (-1.4, 1.4), (0.0, 1.4), (-0.35, 0.35)]
params = [0.0] * len(LIMITS)
best_cost = thumb_cost(params)
step = math.radians(16)
while step > math.radians(0.5):
    better = False
    for i in range(len(params)):
        for d in (step, -step):
            trial = params.copy()
            trial[i] = min(LIMITS[i][1], max(LIMITS[i][0], trial[i] + d))
            c = thumb_cost(trial)
            if c < best_cost:
                params, best_cost, better = trial, c, True
    if not better:
        step /= 2
thumb_cost(params)
print(f"  thumb tip {best_cost * 1000:.1f} mm from its spot")

# ---------------------------------------------------------------- keep the forearm and hand
kept = []
for ob in skinned:
    names = {g.index: re.sub(r"^mixamorig\d*:?", "", g.name) for g in ob.vertex_groups}
    keep = {i for i, n in names.items() if n.startswith(KEEP)}
    weights = [sum(g.weight for g in v.groups if g.group in keep) for v in ob.data.vertices]
    if max(weights, default=0) < 0.5:
        continue
    only(ob)
    if ob.data.shape_keys:
        bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
    for m in list(ob.modifiers):
        bpy.ops.object.modifier_apply(modifier=m.name)
    mw = ob.matrix_world.copy()
    ob.parent = None
    ob.matrix_world = mw
    bm = bmesh.new()
    bm.from_mesh(ob.data)
    bm.verts.ensure_lookup_table()
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if weights[v.index] < 0.5], context="VERTS")
    bm.to_mesh(ob.data)
    bm.free()
    ob.vertex_groups.clear()
    for slot in ob.material_slots:
        if slot.material and not slot.material.name.startswith("skin_"):
            slot.material.name = "skin_" + slot.material.name
            # Skin and sleeves are solid: an alpha channel in the texture drew the hand see-through
            # in patches (the detective's), the far side showing through.
            for node in slot.material.node_tree.nodes if slot.material.node_tree else ():
                if node.type == "BSDF_PRINCIPLED":
                    for link in list(node.inputs["Alpha"].links):
                        slot.material.node_tree.links.remove(link)
                    node.inputs["Alpha"].default_value = 1.0
    kept.append(ob)
    print(f"kept {len(ob.data.vertices)} vertices of {ob.name}")
for o in list(bpy.data.objects):
    if o not in kept and o not in torch_objs:
        bpy.data.objects.remove(o, do_unlink=True)
for ob in kept:
    only(ob)
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    ob.name = ob.data.name = "hand_" + ob.name

# The textures are the whole character's; only the part the forearm and hand use is kept (the
# rest was 90% of each file), at the same resolution.
TEXTURE_PAD_PX = 8


def material_images(mat):
    return [n.image for n in mat.node_tree.nodes if n.type == "TEX_IMAGE" and n.image] if mat.node_tree else []


rects = {}  # material: [u0, v0, u1, v1]
for ob in kept:
    uv = ob.data.uv_layers.active.data
    for poly in ob.data.polygons:
        mat = ob.material_slots[poly.material_index].material
        r = rects.setdefault(mat, [1e9, 1e9, -1e9, -1e9])
        for li in poly.loop_indices:
            u, v = uv[li].uv
            r[:] = [min(r[0], u), min(r[1], v), max(r[2], u), max(r[3], v)]
# Materials that share a texture share its crop.
for _ in range(2):
    for a in rects:
        for b in rects:
            if a is not b and set(material_images(a)) & set(material_images(b)):
                r = [min(rects[a][0], rects[b][0]), min(rects[a][1], rects[b][1]), max(rects[a][2], rects[b][2]), max(rects[a][3], rects[b][3])]
                rects[a][:] = r
                rects[b][:] = list(r)
cropped = {}  # image name: crop in uv
for mat, (u0, v0, u1, v1) in rects.items():
    imgs = material_images(mat)
    if not imgs or u0 < 0 or v0 < 0 or u1 > 1 or v1 > 1:
        continue  # tiled or no texture: left whole
    # The crop's edges fall on whole pixels (in fours, for the GPU's blocks) of every texture of the
    # material, whatever their sizes, so one change of the UVs suits them all.
    W = max(i.size[0] for i in imgs)
    H = max(i.size[1] for i in imgs)
    step_x = 4 * W // min(i.size[0] for i in imgs)
    step_y = 4 * H // min(i.size[1] for i in imgs)
    x0 = max(0, (math.floor(u0 * W) - TEXTURE_PAD_PX) // step_x * step_x)
    y0 = max(0, (math.floor(v0 * H) - TEXTURE_PAD_PX) // step_y * step_y)
    x1 = min(W, -(-(math.ceil(u1 * W) + TEXTURE_PAD_PX) // step_x) * step_x)
    y1 = min(H, -(-(math.ceil(v1 * H) + TEXTURE_PAD_PX) // step_y) * step_y)
    crop = (x0 / W, y0 / H, x1 / W, y1 / H)
    for img in imgs:
        if img.name in cropped:
            continue
        w, h = img.size
        a, b = round(crop[0] * w), round(crop[1] * h)
        c, d = round(crop[2] * w), round(crop[3] * h)
        px = np.empty(w * h * 4, dtype=np.float32)
        img.pixels.foreach_get(px)
        part = px.reshape(h, w, 4)[b:d, a:c].copy()
        name, colorspace = img.name, img.colorspace_settings.name
        img.name = name + ".whole"
        new = bpy.data.images.new(name, c - a, d - b, alpha=False, float_buffer=False)
        new.colorspace_settings.name = colorspace
        new.pixels.foreach_set(part.ravel())
        new.file_format = "PNG"
        new.pack()
        img.user_remap(new)
        cropped[name] = crop
        print(f"texture {name}: {w}x{h} cut to {c - a}x{d - b}")
    for ob in kept:
        uv = ob.data.uv_layers.active.data
        for poly in ob.data.polygons:
            if ob.material_slots[poly.material_index].material is mat:
                for li in poly.loop_indices:
                    u, v = uv[li].uv
                    uv[li].uv = ((u - crop[0]) / (crop[2] - crop[0]), (v - crop[1]) / (crop[3] - crop[1]))

os.makedirs(OUT_DIR, exist_ok=True)
for o in bpy.context.view_layer.objects:
    o.select_set(o in torch_objs or o in kept)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", use_selection=True, export_yup=True, export_apply=True)
print("Hand and torch written to", OUT)

if PREVIEW:
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 900, 600
    world = bpy.data.worlds.new("preview")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.25, 0.25, 0.28, 1)
    sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(40), 0, math.radians(200))
    scene.collection.objects.link(sun)
    # The game's view (Blender: -Y toward the lens, +Z up, -X screen right): the camera up, back and
    # left of the torch; and two more, from the side and from below.
    for view, at in (("game", Vector((0.19, 0.42, 0.23))), ("side", Vector((0.45, -0.05, 0.05))), ("below", Vector((0.05, -0.1, -0.4)))):
        cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
        cam.data.lens = 35 if view == "game" else 50
        scene.collection.objects.link(cam)
        cam.location = at
        look = (Vector((0, -0.4 if view == "game" else 0.0, 0)) - at).normalized()
        cam.rotation_euler = look.to_track_quat("-Z", "Y").to_euler()
        scene.camera = cam
        scene.render.filepath = os.path.join(ROOT, f"assets-src/build/preview-held-{WHO}-{view}.png")
        bpy.ops.render.render(write_still=True)
        bpy.data.objects.remove(cam)
