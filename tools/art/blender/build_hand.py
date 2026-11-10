# Builds what you hold in first person: your right hand and coat sleeve around the torch.
# The hand is MakeHuman's human (CC0), made with the MPFB add-on (GPL code, used here only as a
# tool; installed in a private Blender settings folder, see below). The script grips the torch:
# it lays the torch diagonally across the palm (index knuckle to the heel of the hand), turns the
# arm so the forearm runs back to the lower right of the screen, then curls each finger joint until
# it touches the grip. It keeps only the forearm and hand, adds a wool coat sleeve fitted to the
# forearm, and bakes skin and wool (procedural shaders) on the GPU into textures.
#
# Run (headless, MPFB installed in assets-src/blender-user; no --factory-startup, which would hide it):
#   BLENDER_USER_RESOURCES=assets-src/blender-user blender --background --python-exit-code 1 --python tools/art/blender/build_hand.py
# Reads assets-src/models/hand_torch/hand_torch.gltf (tools/art/blender/build_torch.py), writes
# assets-src/models/held_torch/held_torch.gltf; then: npx tsx tools/art/build-held.ts held_torch
import math
import os

import addon_utils
import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
TORCH = os.path.join(ROOT, "assets-src/models/hand_torch/hand_torch.gltf")
MPFB_DATA = os.path.join(ROOT, "assets-src/blender-user/extensions/user_default/mpfb/data")
NAIL_MASK = os.path.join(MPFB_DATA, "textures/mpfb_fingernails.jpg")
OUT_DIR = os.path.join(ROOT, "assets-src/models/held_torch")
OUT = os.path.join(OUT_DIR, "held_torch.gltf")

SKIN_PX = 2048  # the hand is always close to your eye
SLEEVE_PX = 1024
BAKE_SAMPLES = 64

# The torch (build_torch.py): along Blender Y, lens at -Y, centred on its length (0.245 m). The
# ribbed grip runs from 0.025 to 0.106 m from the tail, which is at +Y.
TORCH_LENGTH = 0.245
GRIP_FROM_TAIL = (0.025, 0.106)
GRIP_Y = TORCH_LENGTH / 2 - sum(GRIP_FROM_TAIL) / 2  # the grip's middle on the torch's axis
# The game shows the torch with the camera up, back and to the left of it (heldFlashlight.ts HOLD;
# Blender -X is screen right). The forearm runs back, right and down, out of the screen's corner.
FOREARM_TOWARD = Vector((-0.5, 0.72, -0.48)).normalized()
# Held overhand: the back of the hand up toward your eye, the palm facing down and to the left
# (Blender +X is screen left), fingers wrapping under the torch and the thumb along its left side.
# (A palm facing straight left would need the forearm to come from above; a wrist can't bend that far.)
PALM_TOWARD = Vector((0.5, 0, -0.85)).normalized()
WRIST_BEND = (50, 35)  # the most the wrist bends up or down, and to the side, in degrees
WRIST_COST = 0.004  # per degree of bend, so the wrist bends no more than it needs
# Where the bar sits in the hand (see the grip below): its surface this far under the index
# knuckle's joint and this far back from it, and under the little finger's palm pad.
BAR_UNDER_KNUCKLE = 0.015
BAR_BEHIND_KNUCKLE = 0.008
BAR_ACROSS_LITTLE = 0.45  # along the little finger's palm bone, from the wrist
BAR_UNDER_PAD = 0.021
FINGER_PAD = 0.0085  # from a finger bone to the skin on its palm side
CURL_MAX = [math.radians(d) for d in (90, 100, 80)]  # knuckle, middle and end joints, as a real hand

THUMB_PAST_KNUCKLE = 0.012  # the thumb's tip, this far past the index knuckle toward the lens

SLEEVE_START = 0.035  # the cuff, this far up the forearm from the wrist joint
SLEEVE_PAST_ELBOW = 0.25  # well off the screen
SLEEVE_EASE = 0.009  # cloth stands this far off the skin
SLEEVE_RINGS, SLEEVE_SIDES = 24, 40

KEEP_BONES = ("lowerarm01.R", "lowerarm02.R", "wrist.R", "metacarpal", "finger")

# ---------------------------------------------------------------- scene and GPU
for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
scene = bpy.context.scene
scene.render.engine = "CYCLES"
prefs = bpy.context.preferences.addons["cycles"].preferences
for kind in ("OPTIX", "CUDA"):
    try:
        prefs.compute_device_type = kind
    except TypeError:
        continue
    prefs.get_devices()
    if any(dev.type == kind for dev in prefs.devices):
        for dev in prefs.devices:
            dev.use = dev.type == kind
        scene.cycles.device = "GPU"
        print("BAKE on", kind)
        break
else:
    # Never bake on the CPU (owner, 2026-11-10: keep the CPU cool).
    raise SystemExit("No OptiX or CUDA GPU found; not baking on the CPU.")
scene.cycles.samples = BAKE_SAMPLES
# Baked colours are saved as they are: Blender's default AgX view would lift them pale.
scene.view_settings.view_transform = "Standard"
scene.view_settings.look = "None"
scene.view_settings.exposure = 0.0
scene.view_settings.gamma = 1.0


def only(ob):
    """Makes ob the one selected, active object (what operators work on)."""
    for o in bpy.context.view_layer.objects:
        o.select_set(False)
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob


# ---------------------------------------------------------------- the torch
before = set(bpy.data.objects)
bpy.ops.import_scene.gltf(filepath=TORCH)
torch_objs = [o for o in bpy.data.objects if o not in before]
AXIS_DIR = Vector((0, -1, 0))  # toward the lens
AXIS_AT = Vector((0, GRIP_Y, 0))


def axis_distance(p):
    """How far a point (torch space) is from the torch's axis."""
    return math.hypot(p.x, p.z)


# The torch's outline: its radius every 2 mm along its length, read from its mesh.
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
    """The torch's radius at y along its length, or None past its ends."""
    k = math.floor(y / BIN)
    near = [outline[j] for j in (k - 1, k, k + 1) if j in outline]
    return max(near) if near else None


def inside_torch(p, margin):
    r = torch_radius(p.y)
    return r is not None and axis_distance(p) < r + margin


# ---------------------------------------------------------------- the human
addon_utils.enable("bl_ext.user_default.mpfb", default_set=True)
from bl_ext.user_default.mpfb.services.humanservice import HumanService  # noqa: E402

body = HumanService.create_human()
rig = HumanService.add_builtin_rig(body, "default")
rig.matrix_world = Matrix.Identity(4)
# MPFB's mask hides helper geometry (joints, clothes helpers). Apply it now, on the rest mesh, so
# vertex numbers stay the same through posing. The body's shape keys (MPFB's proportions) are
# folded into the mesh first; modifiers can't be applied over them.
if body.data.shape_keys:
    only(body)
    bpy.ops.object.shape_key_remove(all=True, apply_mix=True)
for m in list(body.modifiers):
    if m.type == "MASK":
        only(body)
        bpy.ops.object.modifier_apply(modifier=m.name)
bpy.context.view_layer.update()
pb = rig.pose.bones


def head(n):
    return rig.matrix_world @ pb[n].head


def tail(n):
    return rig.matrix_world @ pb[n].tail


# The hand's frame, in the rest pose.
K2, K5 = head("finger2-1.R"), head("finger5-1.R")  # index and little-finger knuckles
WRIST = head("wrist.R")
ELBOW = head("lowerarm01.R")
across = (K5 - K2).normalized()
finger_dir = (tail("finger3-3.R") - head("finger3-1.R")).normalized()
palm = across.cross(finger_dir).normalized()
# The palm is the side fingers curl toward (a positive X turn curls them).
tip0 = tail("finger3-3.R")
pb["finger3-1.R"].rotation_mode = "XYZ"
pb["finger3-1.R"].rotation_euler.x = 0.5
bpy.context.view_layer.update()
if (tail("finger3-3.R") - tip0).dot(palm) < 0:
    palm = -palm
pb["finger3-1.R"].rotation_euler.x = 0.0
bpy.context.view_layer.update()

def frame(x, y):
    """A rotation whose columns are x, y and x cross y, made orthonormal."""
    x = x.normalized()
    y = (y - x * x.dot(y)).normalized()
    return Matrix((x, y, x.cross(y))).transposed()


GRIP_RADIUS = torch_radius(GRIP_Y)
forearm_back = (ELBOW - WRIST).normalized()
palm_sign = 1 if across.cross(finger_dir).dot(palm) > 0 else -1


def fit():
    """For the hand as the wrist is now bent: where the bar lies in it, and the turn that puts
    the bar on the torch's axis with the forearm and palm as close as can be to FOREARM_TOWARD
    and PALM_TOWARD. Returns (score, turn, bar middle, palm normal)."""
    k2, k5 = head("finger2-1.R"), head("finger5-1.R")
    fdir = (tail("finger3-3.R") - head("finger3-1.R")).normalized()
    pal = ((k5 - k2).normalized().cross(fdir) * palm_sign).normalized()
    # The bar of a power grip lies across the palm: from just under the index knuckle diagonally
    # to the pad below the little finger (how a hand closes on a torch, a hammer or a rail).
    bar_index = k2 - fdir * BAR_BEHIND_KNUCKLE + pal * (GRIP_RADIUS + BAR_UNDER_KNUCKLE)
    bar_little = head("metacarpal4.R").lerp(tail("metacarpal4.R"), BAR_ACROSS_LITTLE) + pal * (GRIP_RADIUS + BAR_UNDER_PAD)
    gdir = (bar_index - bar_little).normalized()  # toward the lens
    # The middle of the fingers' span goes on the middle of the ribbed grip.
    mid = bar_little + gdir * ((k2 + k5) / 2 - bar_little).dot(gdir)
    best = None
    for step in range(0, 360, 2):
        ref = Matrix.Rotation(math.radians(step), 3, AXIS_DIR) @ Vector((1, 0, 0))
        turn = frame(AXIS_DIR, ref) @ frame(gdir, pal).inverted()
        score = (turn @ forearm_back).dot(FOREARM_TOWARD) + (turn @ pal).dot(PALM_TOWARD)
        if best is None or score > best[0]:
            best = (score, turn, mid, pal)
    return best


# Bend the wrist (up and down, side to side) to whatever lets the forearm leave the screen's corner
# with the palm against the torch's side, a little bend costing a little.
wrist = pb["wrist.R"]
wrist.rotation_mode = "XYZ"
best = None
for wx in range(-WRIST_BEND[0], WRIST_BEND[0] + 1, 5):
    for wz in range(-WRIST_BEND[1], WRIST_BEND[1] + 1, 5):
        wrist.rotation_euler = (math.radians(wx), 0, math.radians(wz))
        bpy.context.view_layer.update()
        score, turn, mid, pal = fit()
        score -= WRIST_COST * (abs(wx) + abs(wz))
        if best is None or score > best[0]:
            best = (score, turn, mid, pal, wx, wz)
_, rot, grip_mid, palm, wx, wz = best
wrist.rotation_euler = (math.radians(wx), 0, math.radians(wz))
bpy.context.view_layer.update()
print(f"wrist bent {wx}, {wz} degrees")
for what, v, want in (("forearm", forearm_back, FOREARM_TOWARD), ("palm", palm, PALM_TOWARD)):
    print(f"{what} aim: {math.degrees((rot @ v).angle(want)):.1f} degrees off")
palm_t = (rot @ palm).normalized()


def place(off):
    """Puts the hand on the torch, moved off the axis by off along the palm's normal."""
    rig.matrix_world = Matrix.Translation(AXIS_AT - palm_t * off) @ rot.to_4x4() @ Matrix.Translation(-grip_mid)
    bpy.context.view_layer.update()


# Hand vertices (weighted to the palm's bones), for keeping the palm out of the torch.
hand_groups = {g.index for g in body.vertex_groups if g.name.startswith(("metacarpal", "wrist")) and g.name.endswith(".R")}
hand_verts = [v.index for v in body.data.vertices if sum(g.weight for g in v.groups if g.group in hand_groups) > 0.5]


def hand_points():
    ev = body.evaluated_get(bpy.context.evaluated_depsgraph_get())
    me = ev.to_mesh()
    pts = [ev.matrix_world @ me.vertices[i].co for i in hand_verts]
    ev.to_mesh_clear()
    return pts


def bone_gap(n):
    """How far bone n's flesh is from the torch's surface (negative: inside it)."""
    gap = 1.0
    a, b = head(n), tail(n)
    for k in range(1, 5):
        p = a.lerp(b, k / 4)
        r = torch_radius(p.y)
        if r is not None:
            gap = min(gap, axis_distance(p) - r - FINGER_PAD)
    return gap


def settle(f):
    """Turns each joint of finger f, knuckle first, to where its bone just rests on the torch."""
    out = []
    for j in (1, 2, 3):
        n = f"finger{f}-{j}.R"
        bone = pb[n]
        bone.rotation_mode = "XYZ"
        lo, hi = 0, math.degrees(CURL_MAX[j - 1])
        best = None
        for deg in range(int(lo), int(hi) + 1):
            bone.rotation_euler.x = math.radians(deg)
            bpy.context.view_layer.update()
            gap = bone_gap(n)
            score = abs(gap - 0.0005) + (0.05 if gap < 0 else 0)
            if best is None or score < best[0]:
                best = (score, deg, gap)
        bone.rotation_euler.x = math.radians(best[1])
        bpy.context.view_layer.update()
        out.append(f"{best[1]} ({best[2] * 1000:+.1f} mm)")
    print(f"  finger{f}: " + ", ".join(out))


place(0.0)
press = min(axis_distance(p) - torch_radius(p.y) for p in hand_points() if torch_radius(p.y) is not None)
print(f"palm skin {press * 1000:+.1f} mm from the torch (negative: pressed in, hidden inside)")
for f in (2, 3, 4, 5):
    settle(f)
for n in ("finger2-1.R", "finger3-1.R", "finger4-1.R", "finger5-1.R", "wrist.R"):
    p = head(n)
    print(f"  {n} at y {p.y:.3f}, {axis_distance(p) * 1000:.0f} mm off the axis")


# The thumb lies along the torch's side, pointing at the lens, its tip level with the index
# knuckle. Its pose is searched: closest to that spot without going into the torch or the fingers.
THUMB = ["finger1-1.R", "finger1-2.R", "finger1-3.R"]
THUMB_GAP = 0.013  # thumb bone to finger bone, both with their flesh (pressed together a little)
base = head("finger1-2.R")
tip_y = head("finger2-1.R").y - THUMB_PAST_KNUCKLE
side = Vector((base.x, 0, base.z)).normalized()
thumb_target = Vector((0, tip_y, 0)) + side * (torch_radius(tip_y) + FINGER_PAD)
finger_pts = [head(n).lerp(tail(n), k / 4) for f in (2, 3) for n in (f"finger{f}-1.R", f"finger{f}-2.R", f"finger{f}-3.R") for k in range(5)]


def thumb_cost(params):
    ax, az, bx, cx, bz = params
    pb[THUMB[0]].rotation_euler = (ax, 0, az)
    pb[THUMB[1]].rotation_euler = (bx, 0, bz)
    pb[THUMB[2]].rotation_euler.x = cx
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


for n in THUMB:
    pb[n].rotation_mode = "XYZ"
LIMITS = [(-1.2, 1.2), (-1.2, 1.2), (-1.4, 1.4), (-1.4, 1.4), (-0.35, 0.35)]
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
print(f"  thumb {' '.join(f'{math.degrees(a):.0f}' for a in params)} degrees, tip {best_cost * 1000:.1f} mm from its spot")

# Where the forearm ended up (torch space), for the sleeve.
wrist_t = head("wrist.R")
elbow_t = head("lowerarm01.R")

# ---------------------------------------------------------------- keep the forearm and hand
only(body)
for m in list(body.modifiers):
    bpy.ops.object.modifier_apply(modifier=m.name)
mw = body.matrix_world.copy()
body.parent = None
body.matrix_world = mw
keep = {g.index for g in body.vertex_groups if g.name.endswith(".R") and g.name.startswith(KEEP_BONES)}
bm = bmesh.new()
bm.from_mesh(body.data)
deform = bm.verts.layers.deform.active
drop = [v for v in bm.verts if sum(w for g, w in v[deform].items() if g in keep) < 0.5]
bmesh.ops.delete(bm, geom=drop, context="VERTS")
bm.to_mesh(body.data)
bm.free()
# Which skin belongs to the fingertips (the nail mask also marks spots elsewhere on the body's UVs).
tips = {g.index for g in body.vertex_groups if g.name.startswith("finger") and g.name.endswith("-3.R")}
tip_attr = body.data.attributes.new("fingertip", "FLOAT", "POINT")
for v in body.data.vertices:
    tip_attr.data[v.index].value = sum(g.weight for g in v.groups if g.group in tips)
body.vertex_groups.clear()
bpy.data.objects.remove(rig, do_unlink=True)
for o in list(bpy.data.objects):
    if o is not body and o not in torch_objs:
        bpy.data.objects.remove(o, do_unlink=True)
only(body)
bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
sub = body.modifiers.new("smooth", "SUBSURF")
sub.levels = sub.render_levels = 1
bpy.ops.object.modifier_apply(modifier=sub.name)
bpy.ops.object.shade_smooth()
body.name = body.data.name = "hand"
print("hand vertices:", len(body.data.vertices))

# ---------------------------------------------------------------- the coat sleeve
arm_dir = (elbow_t - wrist_t).normalized()
s0 = wrist_t + arm_dir * SLEEVE_START
s1 = elbow_t + arm_dir * SLEEVE_PAST_ELBOW
side_a = arm_dir.cross(Vector((0, 0, 1))).normalized()
side_b = arm_dir.cross(side_a).normalized()
arm_pts = [v.co.copy() for v in body.data.vertices]


def ring_radii(c):
    """The arm's outline around point c, a radius per side, or None past the end of the arm."""
    radii = [0.0] * SLEEVE_SIDES
    found = 0
    for p in arm_pts:
        d = p - c
        if abs(d.dot(arm_dir)) > 0.012:
            continue
        x, y = d.dot(side_a), d.dot(side_b)
        k = round(math.atan2(y, x) / math.tau * SLEEVE_SIDES) % SLEEVE_SIDES
        radii[k] = max(radii[k], math.hypot(x, y))
        found += 1
    if found < SLEEVE_SIDES:
        return None
    top = max(radii)
    radii = [r if r > 0 else top for r in radii]
    # Cloth drapes over the arm: fill the hollows so it reads as fabric, not skin.
    for _ in range(3):
        radii = [max(radii[k], (radii[k - 1] + radii[k] + radii[(k + 1) % SLEEVE_SIDES]) / 3) for k in range(SLEEVE_SIDES)]
    return [r + SLEEVE_EASE for r in radii]


profiles = []
for i in range(SLEEVE_RINGS):
    t = i / (SLEEVE_RINGS - 1)
    c = s0.lerp(s1, t)
    radii = ring_radii(c)
    if radii is None:  # past the elbow: the sleeve carries on, widening a little
        radii = [r * 1.02 for r in profiles[-1][1]]
    profiles.append((c, radii))

bm = bmesh.new()
rings = []
for i, (c, radii) in enumerate(profiles):
    ring = []
    for k in range(SLEEVE_SIDES):
        a = k / SLEEVE_SIDES * math.tau
        fold = 0.0025 * math.sin(a * 3 + i * 0.9) * min(1, i / 4)  # soft folds, none at the cuff
        ring.append(bm.verts.new(c + (side_a * math.cos(a) + side_b * math.sin(a)) * (radii[k] + fold)))
    rings.append(ring)
# The cuff: the cloth turns in at the opening, so you never see through the sleeve's edge.
c0, r0 = profiles[0]
cuff_in = []
for k in range(SLEEVE_SIDES):
    a = k / SLEEVE_SIDES * math.tau
    cuff_in.append(bm.verts.new(c0 + arm_dir * 0.012 + (side_a * math.cos(a) + side_b * math.sin(a)) * (r0[k] - 0.0045)))
for i in range(len(rings) - 1):
    for k in range(SLEEVE_SIDES):
        k2 = (k + 1) % SLEEVE_SIDES
        bm.faces.new((rings[i][k], rings[i][k2], rings[i + 1][k2], rings[i + 1][k]))
for k in range(SLEEVE_SIDES):
    k2 = (k + 1) % SLEEVE_SIDES
    bm.faces.new((cuff_in[k], cuff_in[k2], rings[0][k2], rings[0][k]))
bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
# Normals out of the arm (the cloth's thickness goes outward).
mid = len(rings) // 2
probe = next(f for f in bm.faces if rings[mid][0] in f.verts)
axis_pt = profiles[mid][0]
if probe.normal.dot(probe.calc_center_median() - axis_pt) < 0:
    bmesh.ops.reverse_faces(bm, faces=bm.faces)
sleeve_me = bpy.data.meshes.new("sleeve")
bm.to_mesh(sleeve_me)
bm.free()
sleeve = bpy.data.objects.new("sleeve", sleeve_me)
scene.collection.objects.link(sleeve)
for p in sleeve_me.polygons:
    p.use_smooth = True
only(sleeve)
sol = sleeve.modifiers.new("cloth", "SOLIDIFY")
sol.thickness = 0.003
sol.offset = 1
bpy.ops.object.modifier_apply(modifier=sol.name)
sub = sleeve.modifiers.new("smooth", "SUBSURF")
sub.levels = sub.render_levels = 1
bpy.ops.object.modifier_apply(modifier=sub.name)


# ---------------------------------------------------------------- materials, baked
def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for k, v in inputs.items():
        n.inputs[k].default_value = v
    return n


def textures_in_metres(nt):
    """Feeds every procedural texture object coordinates, so their scales are per metre."""
    coord = nt.nodes.new("ShaderNodeTexCoord")
    for n in list(nt.nodes):
        if n.bl_idname in ("ShaderNodeTexNoise", "ShaderNodeTexWave"):
            nt.links.new(coord.outputs["Object"], n.inputs["Vector"])


def skin_material():
    m = bpy.data.materials.new("skin_src")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    tone = (0.47, 0.27, 0.19, 1)  # a pale, slightly warm skin
    flush = (0.49, 0.245, 0.175, 1)  # faintly redder patches
    blotch = node(nt, "ShaderNodeTexNoise", Scale=22.0, Detail=3.0)
    ramp = nt.nodes.new("ShaderNodeValToRGB")
    ramp.color_ramp.elements[0].position = 0.45
    ramp.color_ramp.elements[1].position = 0.7
    nt.links.new(blotch.outputs["Fac"], ramp.inputs["Fac"])
    mix = node(nt, "ShaderNodeMix")
    mix.data_type = "RGBA"
    mix.inputs[6].default_value = tone
    mix.inputs[7].default_value = flush
    nt.links.new(ramp.outputs["Color"], mix.inputs["Factor"])
    # Darker in the creases between fingers and where the hand meets the torch.
    ao = node(nt, "ShaderNodeAmbientOcclusion", Distance=0.012)
    crease = nt.nodes.new("ShaderNodeValToRGB")
    crease.color_ramp.elements[0].color = (0.62, 0.5, 0.46, 1)
    nt.links.new(ao.outputs["AO"], crease.inputs["Fac"])
    shade = node(nt, "ShaderNodeMix")
    shade.data_type = "RGBA"
    shade.blend_type = "MULTIPLY"
    shade.inputs["Factor"].default_value = 1.0
    nt.links.new(mix.outputs[2], shade.inputs[6])
    nt.links.new(crease.outputs["Color"], shade.inputs[7])
    nt.links.new(shade.outputs[2], bsdf.inputs["Base Color"])
    pores = node(nt, "ShaderNodeTexNoise", Scale=900.0, Detail=4.0)
    rough = node(nt, "ShaderNodeMapRange", **{"To Min": 0.42, "To Max": 0.62})
    nt.links.new(pores.outputs["Fac"], rough.inputs["Value"])
    nt.links.new(rough.outputs["Result"], bsdf.inputs["Roughness"])
    bump = node(nt, "ShaderNodeBump", Strength=0.05, Distance=0.0002)
    nt.links.new(pores.outputs["Fac"], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    textures_in_metres(nt)
    # Nails: MakeHuman's nail mask, read through the body's own UVs (kept for this as "body_uv").
    uvn = nt.nodes.new("ShaderNodeUVMap")
    uvn.uv_map = "body_uv"
    mask = nt.nodes.new("ShaderNodeTexImage")
    mask.image = bpy.data.images.load(NAIL_MASK)
    mask.image.colorspace_settings.name = "Non-Color"
    nt.links.new(uvn.outputs["UV"], mask.inputs["Vector"])
    tip = nt.nodes.new("ShaderNodeAttribute")
    tip.attribute_name = "fingertip"
    on_tip = node(nt, "ShaderNodeMath")
    on_tip.operation = "MULTIPLY"
    on_tip.use_clamp = True
    nt.links.new(mask.outputs["Color"], on_tip.inputs[0])
    nt.links.new(tip.outputs["Fac"], on_tip.inputs[1])
    nail = node(nt, "ShaderNodeMix")
    nail.data_type = "RGBA"
    nt.links.new(on_tip.outputs[0], nail.inputs["Factor"])
    nt.links.new(shade.outputs[2], nail.inputs[6])
    nail.inputs[7].default_value = (0.56, 0.39, 0.35, 1)
    nt.links.new(nail.outputs[2], bsdf.inputs["Base Color"])
    nail_rough = node(nt, "ShaderNodeMix")
    nt.links.new(on_tip.outputs[0], nail_rough.inputs["Factor"])
    nt.links.new(rough.outputs["Result"], nail_rough.inputs[2])
    nail_rough.inputs[3].default_value = 0.28
    nt.links.new(nail_rough.outputs[0], bsdf.inputs["Roughness"])
    return m


def wool_material():
    m = bpy.data.materials.new("wool_src")
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    weave = node(nt, "ShaderNodeTexWave", Scale=500.0, Distortion=1.5, Detail=2.0)
    weave.bands_direction = "DIAGONAL"
    fibres = node(nt, "ShaderNodeTexNoise", Scale=1500.0, Detail=8.0)
    mottle = node(nt, "ShaderNodeTexNoise", Scale=8.0, Detail=3.0)
    fac = node(nt, "ShaderNodeMath")
    fac.operation = "MULTIPLY_ADD"
    nt.links.new(weave.outputs["Fac"], fac.inputs[0])
    fac.inputs[1].default_value = 0.4
    nt.links.new(fibres.outputs["Fac"], fac.inputs[2])
    col = nt.nodes.new("ShaderNodeValToRGB")
    col.color_ramp.elements[0].color = (0.018, 0.016, 0.015, 1)  # charcoal wool
    col.color_ramp.elements[1].color = (0.075, 0.062, 0.05, 1)
    nt.links.new(fac.outputs[0], col.inputs["Fac"])
    mtone = nt.nodes.new("ShaderNodeValToRGB")
    mtone.color_ramp.elements[0].color = (0.8, 0.8, 0.8, 1)
    nt.links.new(mottle.outputs["Fac"], mtone.inputs["Fac"])
    tint = node(nt, "ShaderNodeMix")
    tint.data_type = "RGBA"
    tint.blend_type = "MULTIPLY"
    tint.inputs["Factor"].default_value = 1.0
    nt.links.new(col.outputs["Color"], tint.inputs[6])
    nt.links.new(mtone.outputs["Color"], tint.inputs[7])
    nt.links.new(tint.outputs[2], bsdf.inputs["Base Color"])
    bsdf.inputs["Roughness"].default_value = 0.92
    bump = node(nt, "ShaderNodeBump", Strength=0.35, Distance=0.0008)
    nt.links.new(fac.outputs[0], bump.inputs["Height"])
    nt.links.new(bump.outputs["Normal"], bsdf.inputs["Normal"])
    textures_in_metres(nt)
    return m


def unwrap(ob, keep_as=None):
    """Fresh UVs for the bake: one clean layout over the whole texture. keep_as keeps the old
    UVs under that name (for reading masks made for them); the bake goes to the new ones."""
    for i, layer in reversed(list(enumerate(ob.data.uv_layers))):
        if keep_as and i == 0:
            layer.name = keep_as
        else:
            ob.data.uv_layers.remove(layer)
    new = ob.data.uv_layers.new(name="UVMap")
    ob.data.uv_layers.active = new
    new.active_render = True
    only(ob)
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.004)
    bpy.ops.object.mode_set(mode="OBJECT")


def bake_maps(ob, src, px, name):
    """Bakes base colour, roughness and normal from src into images on ob's UVs, and gives ob a
    plain material made of those images (what the glTF carries)."""
    ob.data.materials.clear()
    ob.data.materials.append(src)
    nt = src.node_tree
    target = nt.nodes.new("ShaderNodeTexImage")
    nt.nodes.active = target
    only(ob)
    images = {}
    for kind, bake, non_color in (("color", "DIFFUSE", False), ("rough", "ROUGHNESS", True), ("normal", "NORMAL", True)):
        img = bpy.data.images.new(f"{name}_{kind}", px, px)
        if non_color:
            img.colorspace_settings.name = "Non-Color"
        target.image = img
        if bake == "DIFFUSE":
            bpy.ops.object.bake(type=bake, pass_filter={"COLOR"}, margin=8, use_clear=True)
        else:
            bpy.ops.object.bake(type=bake, margin=8, use_clear=True)
        img.filepath_raw = os.path.join(OUT_DIR, f"{name}_{kind}.png")
        img.file_format = "PNG"
        img.save()
        images[kind] = img
        print(f"baked {name} {kind}")
    out = bpy.data.materials.new(name)
    out.use_nodes = True
    ont = out.node_tree
    bsdf = ont.nodes["Principled BSDF"]
    c = ont.nodes.new("ShaderNodeTexImage")
    c.image = images["color"]
    ont.links.new(c.outputs["Color"], bsdf.inputs["Base Color"])
    r = ont.nodes.new("ShaderNodeTexImage")
    r.image = images["rough"]
    sep = ont.nodes.new("ShaderNodeSeparateColor")
    ont.links.new(r.outputs["Color"], sep.inputs["Color"])
    ont.links.new(sep.outputs["Green"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = 0.0
    nimg = ont.nodes.new("ShaderNodeTexImage")
    nimg.image = images["normal"]
    nmap = ont.nodes.new("ShaderNodeNormalMap")
    ont.links.new(nimg.outputs["Color"], nmap.inputs["Color"])
    ont.links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    ob.data.materials.clear()
    ob.data.materials.append(out)


os.makedirs(OUT_DIR, exist_ok=True)
unwrap(body, keep_as="body_uv")
unwrap(sleeve)
bake_maps(body, skin_material(), SKIN_PX, "skin")
bake_maps(sleeve, wool_material(), SLEEVE_PX, "wool")
body.data.uv_layers.remove(body.data.uv_layers["body_uv"])

# ---------------------------------------------------------------- export
for o in bpy.context.view_layer.objects:
    o.select_set(o in torch_objs or o is body or o is sleeve)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLTF_SEPARATE", use_selection=True, export_yup=True, export_apply=True)
print("Hand and torch written to", OUT)
