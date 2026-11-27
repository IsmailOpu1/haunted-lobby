# Builds the ghost (GDD 26: its look after the art pass) for the Unity version: a too-tall, starved
# figure in a torn grave shroud, long wet black hair hanging over a face you never quite see, two
# cold pinpoint eyes and a dark stretched mouth. Pale, with a faint glow, so it is seen in the dark.
# It is made from one Mixamo body (assets-src/characters/mixamo, docs/ASSETS.md) on the same
# skeleton as the players, so the players' shared animations move it; its limbs are stretched and
# thinned in the rest pose (only the hips' movement is in the clips, scaled to its legs in the game).
# Run (headless):
#   blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_ghost.py -- OUT.glb [--preview DIR]
import math
import os
import random
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector, noise

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
# assets-src is not in git: a worktree points at the main checkout's with ASSETS_SRC.
SRC = os.path.join(os.environ.get("ASSETS_SRC", os.path.join(ROOT, "assets-src")), "characters/mixamo")
BASE = "megan"

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
OUT = args[0] if args else os.path.join(ROOT, "assets-src/build/ghost.glb")
PREVIEW = args[args.index("--preview") + 1] if "--preview" in args else None

# Each bone's stretch along itself and its thickness across (1 is as Mixamo made it).
SHAPE = {
    "Spine": (1.05, 0.86), "Spine1": (1.05, 0.84), "Spine2": (1.04, 0.86),
    "Neck": (1.55, 0.72), "Head": (1.06, 0.9),
    "Shoulder": (1.0, 0.85), "Arm": (1.12, 0.74), "ForeArm": (1.32, 0.7), "Hand": (1.22, 0.8),
    "UpLeg": (1.07, 0.78), "Leg": (1.1, 0.72), "Foot": (1.05, 0.82),
}
FINGER = (1.4, 0.78)


def clear():
    bpy.ops.wm.read_factory_settings(use_empty=True)


def import_body():
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, BASE + ".fbx"))
    arm = next(o for o in bpy.data.objects if o.type == "ARMATURE")
    arm.name = "Armature"
    for bone in arm.data.bones:
        bone.name = re.sub(r"^mixamorig\d*:", "mixamorig:", bone.name)
    body = None
    for ob in list(bpy.data.objects):
        if ob.type != "MESH":
            continue
        if ob.name.endswith("_Body"):
            body = ob
            for g in ob.vertex_groups:
                g.name = re.sub(r"^mixamorig\d*:", "mixamorig:", g.name)
        else:
            bpy.data.objects.remove(ob, do_unlink=True)
    if arm.animation_data:
        arm.animation_data.action = None
    for a in list(bpy.data.actions):
        bpy.data.actions.remove(a)
    body.name = "Ghost_Body"
    return arm, body


def shape_of(name):
    short = name.replace("mixamorig:", "")
    short = re.sub(r"^(Left|Right)", "", short)
    if re.match(r"Hand(Thumb|Index|Middle|Ring|Pinky)\d", short):
        return FINGER
    return SHAPE.get(short)


def reshape(arm, body):
    """Stretches and thins the bones in a pose, then makes that pose the rest pose, mesh and all."""
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    kept = {}
    for pb in arm.pose.bones:
        s = shape_of(pb.name)
        if s is None:
            continue
        along, across = s
        pb.scale = (across, along, across)
        for child in pb.children:
            kept[child.name] = child.bone.inherit_scale
            child.bone.inherit_scale = "NONE"
    bpy.ops.object.mode_set(mode="OBJECT")
    bpy.context.view_layer.update()
    # The mesh takes the pose for good, then the pose becomes the rest.
    mod = next(m for m in body.modifiers if m.type == "ARMATURE")
    bpy.context.view_layer.objects.active = body
    keep = body.modifiers.new("Armature_keep", "ARMATURE")
    keep.object = arm
    bpy.ops.object.modifier_apply(modifier=mod.name)
    keep.name = "Armature"
    bpy.context.view_layer.objects.active = arm
    bpy.ops.object.mode_set(mode="POSE")
    bpy.ops.pose.select_all(action="SELECT")
    bpy.ops.pose.armature_apply(selected=False)
    bpy.ops.object.mode_set(mode="OBJECT")
    for name, mode in kept.items():
        arm.data.bones[name].inherit_scale = mode


def world_bone(arm, name, tail=False):
    b = arm.data.bones[name]
    return arm.matrix_world @ (b.tail_local if tail else b.head_local)


def preview(arm, tag):
    """Front and side renders of the figure, lit flat, for judging its shape."""
    os.makedirs(PREVIEW, exist_ok=True)
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    top = world_bone(arm, "mixamorig:HeadTop_End")
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.02, 0.02, 0.025, 1)
    scene.world = world
    sun = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
    sun.data.energy = 3
    sun.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(sun)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    h = top.z
    for name, at in (("front", Vector((0, -4.2, h * 0.5))), ("side", Vector((4.2, 0, h * 0.5))), ("face", Vector((0, -1.1, h - 0.12)))):
        cam.location = at
        target = Vector((0, 0, h * 0.5)) if name != "face" else Vector((0, 0, h - 0.14))
        cam.rotation_euler = (target - at).to_track_quat("-Z", "Y").to_euler()
        scene.render.filepath = os.path.join(PREVIEW, f"{tag}-{name}.png")
        bpy.ops.render.render(write_still=True)




# ---- small tools ---------------------------------------------------------------------------------

def smooth(e0, e1, x):
    t = min(1.0, max(0.0, (x - e0) / (e1 - e0)))
    return t * t * (3 - 2 * t)


def lerp(a, b, t):
    return a + (b - a) * t


def fbm(p, octaves=4):
    v, a, f = 0.0, 0.5, 1.0
    for _ in range(octaves):
        v += a * noise.noise(p * f)
        a *= 0.5
        f *= 2.0
    return v


def bone(arm, name, tail=False):
    return world_bone(arm, "mixamorig:" + name, tail)


class Piece:
    """A mesh made point by point: positions, bone weights and UVs per point, faces of indices."""

    def __init__(self):
        self.co, self.w, self.uv, self.faces = [], [], [], []

    def add(self, co, weights, uv=(0.0, 0.0)):
        self.co.append(Vector(co))
        total = sum(weights.values())
        self.w.append({k: v / total for k, v in weights.items() if v / total > 0.004})
        self.uv.append(uv)
        return len(self.co) - 1

    def make(self, name, arm, material, solidify=0.0):
        me = bpy.data.meshes.new(name)
        me.from_pydata([tuple(c) for c in self.co], [], self.faces)
        uvl = me.uv_layers.new(name="UVMap")
        for loop in me.loops:
            uvl.data[loop.index].uv = self.uv[loop.vertex_index]
        ob = bpy.data.objects.new(name, me)
        bpy.context.scene.collection.objects.link(ob)
        groups = {}
        for i, ws in enumerate(self.w):
            for g, v in ws.items():
                if g not in groups:
                    groups[g] = ob.vertex_groups.new(name="mixamorig:" + g)
                groups[g].add([i], v, "REPLACE")
        bm = bmesh.new()
        bm.from_mesh(me)
        bmesh.ops.delete(bm, geom=[v for v in bm.verts if not v.link_faces], context="VERTS")
        bm.to_mesh(me)
        bm.free()
        me.materials.append(material)
        for p in me.polygons:
            p.use_smooth = True
        if solidify:
            mod = ob.modifiers.new("Solidify", "SOLIDIFY")
            mod.thickness = solidify
            mod.offset = -1
            mod.use_rim = True
            bpy.context.view_layer.objects.active = ob
            bpy.ops.object.modifier_apply(modifier=mod.name)
        bind(ob, arm)
        return ob


def bind(ob, arm):
    ob.parent = arm
    ob.matrix_parent_inverse = arm.matrix_world.inverted()
    mod = ob.modifiers.new("Armature", "ARMATURE")
    mod.object = arm


def rings_faces(piece, rings, closed=True, keep=lambda i, j: True):
    """Faces between rings of point indices (each ring the same count, going round the same way)."""
    for i in range(len(rings) - 1):
        a, b = rings[i], rings[i + 1]
        n = len(a)
        for j in range(n if closed else n - 1):
            k = (j + 1) % n
            if keep(i, j):
                piece.faces.append((a[j], b[j], b[k], a[k]))


def outward(piece, first_face, centre):
    """Turns every face round if the first one faces in towards `centre`."""
    f = piece.faces[first_face]
    p = [piece.co[i] for i in f]
    n = (p[1] - p[0]).cross(p[2] - p[1])
    mid = sum(p, Vector()) / len(p)
    if n.dot(mid - centre(mid)) < 0:
        piece.faces[first_face:] = [tuple(reversed(f)) for f in piece.faces[first_face:]]


# ---- noise images (numpy, tileable) ---------------------------------------------------------------

import numpy as np


def value_noise(w, h, cx, cy, rng):
    g = rng.random((cy, cx))
    def axis(size, cells):
        x = np.arange(size) * cells / size
        i0 = np.floor(x).astype(int)
        f = x - i0
        return i0 % cells, (i0 + 1) % cells, f * f * (3 - 2 * f)
    y0, y1, fy = axis(h, cy)
    x0, x1, fx = axis(w, cx)
    fy, fx = fy[:, None], fx[None, :]
    a, b = g[y0][:, x0], g[y0][:, x1]
    c, d = g[y1][:, x0], g[y1][:, x1]
    return (a * (1 - fx) + b * fx) * (1 - fy) + (c * (1 - fx) + d * fx) * fy


def noise_img(w, h, cx, cy, octaves, rng):
    v, a, total = np.zeros((h, w)), 0.5, 0.0
    for o in range(octaves):
        v += a * value_noise(w, h, cx << o, cy << o, rng)
        total += a
        a *= 0.5
    return v / total


def to_image(name, rgb, non_colour=False):
    h, w, _ = rgb.shape
    img = bpy.data.images.new(name, w, h, alpha=False)
    if non_colour:
        img.colorspace_settings.name = "Non-Color"
    rgba = np.concatenate([np.clip(rgb, 0, 1), np.ones((h, w, 1))], axis=2)
    img.pixels.foreach_set(rgba.astype(np.float32).ravel())
    img.pack()
    return img


def image_array(img, size):
    img.scale(size, size)
    a = np.empty(size * size * 4, dtype=np.float32)
    img.pixels.foreach_get(a)
    return a.reshape(size, size, 4)[:, :, :3].astype(np.float64)


def raster(values, tris, size):
    """Paints per-corner values over UV triangles (uv in 0..1) into a size x size map; max wins."""
    out = np.zeros((size, size))
    for (uv, val) in tris:
        if max(val) <= 0.001:
            continue
        pts = np.array(uv) * size
        x0, y0 = np.floor(pts.min(0)).astype(int)
        x1, y1 = np.ceil(pts.max(0)).astype(int)
        x0, y0, x1, y1 = max(x0, 0), max(y0, 0), min(x1, size - 1), min(y1, size - 1)
        if x1 < x0 or y1 < y0:
            continue
        xs, ys = np.meshgrid(np.arange(x0, x1 + 1) + 0.5, np.arange(y0, y1 + 1) + 0.5)
        (ax, ay), (bx, by), (cx, cy) = pts
        det = (by - cy) * (ax - cx) + (cx - bx) * (ay - cy)
        if abs(det) < 1e-9:
            continue
        l1 = ((by - cy) * (xs - cx) + (cx - bx) * (ys - cy)) / det
        l2 = ((cy - ay) * (xs - cx) + (ax - cx) * (ys - cy)) / det
        l3 = 1 - l1 - l2
        inside = (l1 >= -0.02) & (l2 >= -0.02) & (l3 >= -0.02)
        v = l1 * val[0] + l2 * val[1] + l3 * val[2]
        block = out[y0:y1 + 1, x0:x1 + 1]
        np.maximum(block, np.where(inside, v, 0), out=block)
    return out


# ---- materials -----------------------------------------------------------------------------------

def material(name, colour=(0.5, 0.5, 0.5), image=None, rough=0.8, normal=None, emit_image=None,
             emit=(0, 0, 0), strength=0.0, double=False):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    m.use_backface_culling = not double
    nodes, links = m.node_tree.nodes, m.node_tree.links
    bsdf = next(n for n in nodes if n.type == "BSDF_PRINCIPLED")
    bsdf.inputs["Base Color"].default_value = (*colour, 1)
    bsdf.inputs["Roughness"].default_value = rough
    bsdf.inputs["Metallic"].default_value = 0.0
    if image is not None:
        tex = nodes.new("ShaderNodeTexImage")
        tex.image = image
        links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    if normal is not None:
        ntex = nodes.new("ShaderNodeTexImage")
        ntex.image = normal
        nmap = nodes.new("ShaderNodeNormalMap")
        links.new(ntex.outputs["Color"], nmap.inputs["Color"])
        links.new(nmap.outputs["Normal"], bsdf.inputs["Normal"])
    if strength > 0:
        if emit_image is not None:
            etex = nodes.new("ShaderNodeTexImage")
            etex.image = emit_image
            links.new(etex.outputs["Color"], bsdf.inputs["Emission Color"])
        else:
            bsdf.inputs["Emission Color"].default_value = (*emit, 1)
        bsdf.inputs["Emission Strength"].default_value = strength
    return m


# ---- the face ------------------------------------------------------------------------------------

def loose_parts(bm):
    seen, parts = set(), []
    for v in bm.verts:
        if v.index in seen:
            continue
        stack, comp = [v], []
        seen.add(v.index)
        while stack:
            a = stack.pop()
            comp.append(a.index)
            for e in a.link_edges:
                b = e.other_vert(a)
                if b.index not in seen:
                    seen.add(b.index)
                    stack.append(b)
        parts.append(comp)
    return parts


class Face:
    """Where Mixamo put the eyes (two small loose parts in the head) and so the mouth and the skull."""

    def __init__(self, body):
        mw = body.matrix_world
        bm = bmesh.new()
        bm.from_mesh(body.data)
        bm.verts.ensure_lookup_table()
        eyes = []
        for part in loose_parts(bm):
            pts = [mw @ bm.verts[i].co for i in part]
            centre = sum(pts, Vector()) / len(pts)
            if len(part) < 1000 and centre.z > 1.2:
                eyes.append((centre, max((p - centre).length for p in pts), set(part)))
        bm.free()
        eyes.sort(key=lambda e: e[0].x)
        assert len(eyes) == 2, f"expected two eyeballs, found {len(eyes)}"
        self.eyes = [e[0] for e in eyes]
        self.eye_r = eyes[0][1]
        self.eyeball = eyes[0][2] | eyes[1][2]
        mid = (self.eyes[0] + self.eyes[1]) / 2
        self.front_y = mid.y - self.eye_r
        self.mouth = Vector((0, mid.y - 0.01, mid.z - MOUTH_BELOW_EYES))
        self.skull = Vector((0, mid.y + 0.085, mid.z + 0.012))


MOUTH_BELOW_EYES = 0.075
JAW_DROP = 0.02


def face_shape(body, face):
    """A longer face: the jaw pulled down below the mouth (a mouth hanging open), the eyes sunk."""
    mw = body.matrix_world
    inv = mw.inverted()
    for v in body.data.vertices:
        if v.index in face.eyeball:
            p = mw @ v.co
            v.co = inv @ (p + Vector((0, 0.003, 0)))
            continue
        p = mw @ v.co
        if p.z < 1.3 or p.y > face.skull.y:
            continue
        front = smooth(face.skull.y, face.front_y, p.y)
        dz = p.z - face.mouth.z
        jaw = (1 - smooth(-0.004, 0.003, dz)) * smooth(-0.075, -0.035, dz) * front
        sunk = 0.0
        for e in face.eyes:
            d = (Vector((p.x, 0, p.z)) - Vector((e.x, 0, e.z))).length
            sunk = max(sunk, 1 - smooth(face.eye_r * 1.0, face.eye_r * 2.4, d))
        q = p + Vector((0, 0.004 * sunk, -JAW_DROP * jaw))
        v.co = inv @ q


def face_darks(body, face):
    """How dark each point of the skin is painted: hollow sockets, the open mouth."""
    mw = body.matrix_world
    dark = []
    for v in body.data.vertices:
        p = mw @ v.co
        d = 0.0
        if v.index not in face.eyeball and p.y < face.skull.y - 0.04 and p.z > 1.3:
            for e in face.eyes:
                r = (Vector((p.x, 0, p.z * 1.0)) - Vector((e.x, 0, e.z))).length
                d = max(d, (1 - smooth(face.eye_r * 0.9, face.eye_r * 2.3, r)) * 0.85)
            mx = p.x / 0.024
            mz = (p.z - (face.mouth.z - JAW_DROP * 0.5)) / (0.008 + JAW_DROP * 0.55)
            d = max(d, 1 - smooth(0.7, 1.25, math.sqrt(mx * mx + mz * mz)))
        r = p - face.skull
        if v.index not in face.eyeball and p.z > 1.6 and r.length > 1e-4 and hair_grows(r.normalized()):
            d = 1.0
        dark.append(d)
    return dark


def hair_grows(d):
    """Whether hair grows from the scalp in this direction from the middle of the skull."""
    front = -d.y
    if d.z < -0.2:
        return False
    return not (front > 0.2 and d.z < 0.36 + 0.55 * (front - 0.2))


def skin(body, face, size, rng):
    """The body's own colours turned to a drowned grey, veins showing, the sockets and mouth dark."""
    old = body.data.materials[0]
    imgs = [n.image for n in old.node_tree.nodes if n.type == "TEX_IMAGE" and n.image]
    diffuse = next(i for i in imgs if "diffuse" in (i.name + i.filepath).lower())
    normal = next(i for i in imgs if "normal" in (i.name + i.filepath).lower())
    base = image_array(diffuse, size)
    lum = base @ np.array([0.3, 0.59, 0.11])
    lum = np.clip(lum / max(np.percentile(lum, 92), 1e-3), 0, 1.2)
    col = np.array([0.60, 0.64, 0.66])[None, None, :] * (0.42 + 0.62 * lum)[..., None]
    mottle = noise_img(size, size, 5, 5, 4, rng)
    col *= (0.82 + 0.3 * mottle)[..., None]
    bruise = np.clip((noise_img(size, size, 3, 3, 3, rng) - 0.55) / 0.15, 0, 1)
    col = col * (1 - 0.35 * bruise[..., None]) + np.array([0.36, 0.33, 0.42]) * 0.35 * bruise[..., None]
    n1 = noise_img(size, size, 7, 7, 5, rng)
    ridge = 1 - np.abs(n1 - 0.5) * 2
    vein = np.clip((ridge - 0.9) / 0.08, 0, 1) ** 2
    vmask = np.clip((noise_img(size, size, 4, 4, 2, rng) - 0.42) / 0.2, 0, 1)
    vein = (vein * vmask)[..., None] * 0.6
    col = col * (1 - vein) + np.array([0.24, 0.28, 0.40]) * vein
    # the sockets and the mouth, painted over the UVs
    dark = face_darks(body, face)
    me = body.data
    uvl = me.uv_layers.active.data
    tris = []
    for poly in me.polygons:
        loops = list(poly.loop_indices)
        for k in range(1, len(loops) - 1):
            idx = (loops[0], loops[k], loops[k + 1])
            tris.append(([tuple(uvl[l].uv) for l in idx], [dark[me.loops[l].vertex_index] for l in idx]))
    d = raster(None, tris, size)[..., None]
    col = col * (1 - 0.92 * d) + np.array([0.035, 0.025, 0.03]) * 0.92 * d
    skin_img = to_image("ghost_skin", col)
    nrm_img = to_image("ghost_skin_normal", image_array(normal, size), non_colour=True)
    return material("Ghost_Skin", image=skin_img, rough=0.5, normal=nrm_img, emit_image=skin_img, strength=0.1)


def eyes(arm, face):
    """Black eyeballs, and in each a point of cold light."""
    bm = bmesh.new()
    for e in face.eyes:
        at = e + Vector((0, -face.eye_r * 0.93, 0))
        bmesh.ops.create_uvsphere(bm, u_segments=10, v_segments=6, radius=face.eye_r * 0.36,
                                  matrix=Matrix.Translation(at))
    me = bpy.data.meshes.new("Ghost_Eyes")
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new("Ghost_Eyes", me)
    bpy.context.scene.collection.objects.link(ob)
    ob.vertex_groups.new(name="mixamorig:Head").add(list(range(len(me.vertices))), 1.0, "REPLACE")
    me.materials.append(material("Ghost_EyeLight", colour=(0.8, 0.9, 1.0), rough=0.2,
                                 emit=(0.78, 0.9, 1.0), strength=14.0))
    bind(ob, arm)
    return ob


# ---- the shroud ----------------------------------------------------------------------------------

HEM = 0.0


def catmull(keys, per_m):
    """Points along a Catmull-Rom curve through `keys` (tuples), about `per_m` per metre of the first value."""
    out = []
    for i in range(len(keys) - 1):
        p0, p1, p2, p3 = (Vector(keys[max(0, min(len(keys) - 1, j))]) for j in (i - 1, i, i + 1, i + 2))
        n = max(2, int(abs(p2[0] - p1[0]) * per_m))
        for k in range(n):
            t = k / n
            out.append(0.5 * ((2 * p1) + (-p0 + p2) * t + (2 * p0 - 5 * p1 + 4 * p2 - p3) * t * t
                              + (-p0 + 3 * p1 - 3 * p2 + p3) * t * t * t))
    out.append(Vector(keys[-1]))
    return out


def spine_weights(arm, z):
    hips = bone(arm, "Hips").z
    neck = bone(arm, "Neck").z
    knots = [("Hips", hips + 0.04), ("Spine", hips + 0.15), ("Spine1", hips + 0.26), ("Spine2", hips + 0.39), ("Neck", neck + 0.03)]
    if z <= knots[0][1]:
        return {"Hips": 1.0}
    for (a, za), (b, zb) in zip(knots, knots[1:]):
        if z <= zb:
            t = (z - za) / (zb - za)
            return {a: 1 - t, b: t}
    return {"Neck": 1.0}


def shroud_weights(arm, p):
    hips = bone(arm, "Hips").z
    sh = bone(arm, "LeftArm").z
    w = spine_weights(arm, p.z)
    side = "Left" if p.x > 0 else "Right"
    s = smooth(0.10, 0.19, abs(p.x)) * smooth(sh - 0.10, sh - 0.02, p.z)
    if s > 0:
        w = {k: v * (1 - 0.85 * s) for k, v in w.items()}
        w[side + "Shoulder"] = w.get(side + "Shoulder", 0) + 0.6 * s
        w[side + "Arm"] = 0.25 * s
    if p.z < hips - 0.02:
        d = smooth(0.0, 1.0, (hips - 0.02 - p.z) / 0.55) * 0.5
        lr = smooth(-0.10, 0.10, p.x)
        w = {"Hips": 1 - d, "LeftUpLeg": d * lr, "RightUpLeg": d * (1 - lr)}
    return w


def shroud(arm, mat, around, per_m):
    """A long sack of grave cloth from the throat to the floor: narrow, starved, no waist or chest
    to tell who it was; hanging in folds, its hem torn into strips, a few holes rotted through.
    The sleeves are part of it."""
    hips = bone(arm, "Hips").z
    neck = bone(arm, "Neck").z
    sh = bone(arm, "LeftArm").z
    keys = [
        (neck + 0.035, 0.062, 0.058),
        (neck - 0.006, 0.13, 0.082),
        (sh, 0.19, 0.098),
        (sh - 0.09, 0.165, 0.098),
        (hips + 0.20, 0.138, 0.092),
        (hips + 0.09, 0.152, 0.104),
        (hips, 0.18, 0.128),
        (hips - 0.25, 0.215, 0.168),
        (hips - 0.55, 0.25, 0.205),
        (0.22, 0.275, 0.235),
        (HEM, 0.295, 0.255),
    ]
    prof = catmull(keys, per_m)
    piece = Piece()
    rings = []
    def tear_at(th):
        c = Vector((math.cos(th) * 2.5, math.sin(th) * 2.5, 7.3))
        spike = max(0.0, noise.noise(Vector((math.cos(th) * 5, math.sin(th) * 5, 1.7))) - 0.05)
        return 0.02 + 0.17 * max(0.0, fbm(c, 3) + 0.2) + 0.45 * spike

    tear = [tear_at(2 * math.pi * (j + 0.5) / around) for j in range(around)]
    for z, rx, ry in prof:
        ring = []
        lower = smooth(hips, HEM, z)
        amp = lerp(0.018, 0.075, lower)
        for j in range(around):
            th = 2 * math.pi * j / around
            c = Vector((math.cos(th), math.sin(th), 0))
            fold = (0.55 * math.sin(th * 7 + 2.2 * noise.noise(Vector((c.x, c.y, z * 0.8))))
                    + 0.8 * fbm(Vector((c.x * 1.7, c.y * 1.7, z * 0.9)), 3))
            k = 1 + amp * fold
            p = Vector((rx * k * math.cos(th), ry * k * math.sin(th), z))
            ring.append(piece.add(p, shroud_weights(arm, p), (j / around, z / 2.1)))
        rings.append(ring)

    def keep(i, j):
        return prof[i].x >= HEM + tear[j]

    rings_faces(piece, rings, keep=keep)
    # the torn edge pulled down to where the tear runs, so it is ragged, not stepped
    used = {v for f in piece.faces for v in f}
    for j in range(around):
        line = HEM + tear_at(2 * math.pi * j / around)
        for i in range(len(rings) - 1, -1, -1):
            v = rings[i][j]
            if v in used:
                upper = prof[i - 1].x - 0.004 if i > 0 else piece.co[v].z
                piece.co[v].z = min(max(piece.co[v].z, line), upper)
                break
    outward(piece, 0, lambda m: Vector((0, 0, m.z)))
    sleeves(arm, piece, per_m, around // 2)
    return piece.make("Ghost_Shroud", arm, mat, solidify=0.006)


def sleeves(arm, piece, per_m, around):
    """Wide sleeves, ragged at the ends, to the middle of the forearm."""
    for side, sx in (("Left", 1), ("Right", -1)):
        elbow = abs(bone(arm, side + "ForeArm").x)
        wrist = abs(bone(arm, side + "Hand").x)
        axis_y = bone(arm, side + "Arm").y
        axis_z = bone(arm, side + "Arm").z
        end = elbow + 0.62 * (wrist - elbow)
        keys = [(0.10, 0.072), (0.2, 0.062), (elbow, 0.058), (end - 0.07, 0.092), (end, 0.12)]
        prof = catmull(keys, per_m * 1.3)
        tear = []
        for j in range(around):
            ph = 2 * math.pi * j / around
            tear.append(0.01 + 0.11 * max(0.0, fbm(Vector((math.cos(ph) * 2.5, math.sin(ph) * 2.5, 2.9 * sx)), 3) + 0.25))
        rings = []
        start = len(piece.faces)
        for x, r in prof:
            ring = []
            for j in range(around):
                ph = 2 * math.pi * j / around
                c = Vector((x * 1.3, math.cos(ph), math.sin(ph)))
                k = 1 + 0.08 * fbm(c * 1.8, 3) + 0.05 * math.sin(ph * 5 + x * 9)
                p = Vector((sx * x, axis_y + r * k * math.cos(ph), axis_z + r * k * math.sin(ph)))
                tw = smooth(0.12, 0.20, x)
                fw = smooth(elbow - 0.04, elbow + 0.04, x)
                spine = 1 - smooth(0.10, 0.16, x)
                w = {
                    side + "Shoulder": (1 - tw) * (1 - spine) + 0.001,
                    "Spine2": spine,
                    side + "Arm": tw * (1 - fw),
                    side + "ForeArm": tw * fw,
                }
                ring.append(piece.add(p, w, (j / around, x)))
            rings.append(ring)
        rings_faces(piece, rings, keep=lambda i, j, prof=prof, end=end, tear=tear: prof[i + 1].x < end - tear[j])
        outward(piece, start, lambda m, y=axis_y, z=axis_z: Vector((m.x, y, z)))


def skirt_cap(arm, mat):
    """A dark disc inside the skirt, so a low look up it finds cloth, not the empty inside."""
    hips = bone(arm, "Hips").z
    z = hips - 0.32
    piece = Piece()
    centre = piece.add((0, 0, z), {"Hips": 1}, (0.5, 0.5))
    ring = []
    n = 24
    for j in range(n):
        th = 2 * math.pi * j / n
        p = Vector((0.19 * math.cos(th), 0.15 * math.sin(th), z))
        ring.append(piece.add(p, {"Hips": 1}, (0.5 + 0.5 * math.cos(th), 0.5 + 0.5 * math.sin(th))))
    for j in range(n):
        piece.faces.append((centre, ring[(j + 1) % n], ring[j]))
        piece.faces.append((centre, ring[j], ring[(j + 1) % n]))
    return piece.make("Ghost_Cap", arm, mat)


def linen(size, rng):
    """Old grave linen: grey, stained, streaked darker down the folds, filthy at the hem."""
    base = np.array([0.40, 0.39, 0.37])
    n = noise_img(size, size, 6, 6, 5, rng)
    streak = noise_img(size, size, 48, 3, 2, rng)
    stain = np.clip((noise_img(size, size, 4, 4, 4, rng) - 0.55) / 0.12, 0, 1)
    v = np.linspace(0, 1, size)[:, None]
    grime = np.clip(1 - v / 0.25, 0, 1) ** 1.5 * (0.6 + 0.4 * noise_img(size, size, 16, 4, 2, rng))
    shade = (0.72 + 0.4 * n) * (0.85 + 0.3 * streak)
    col = base[None, None, :] * shade[..., None]
    col = col * (1 - 0.45 * stain[..., None]) + np.array([0.20, 0.18, 0.15]) * 0.45 * stain[..., None]
    col = col * (1 - 0.7 * grime[..., None]) + np.array([0.08, 0.075, 0.07]) * 0.7 * grime[..., None]
    return to_image("ghost_linen", col)


# ---- the hair ------------------------------------------------------------------------------------

def bvh_of(objs):
    from mathutils.bvhtree import BVHTree
    dg = bpy.context.evaluated_depsgraph_get()
    verts, polys = [], []
    for ob in objs:
        ev = ob.evaluated_get(dg)
        me = ev.to_mesh()
        off = len(verts)
        verts += [ev.matrix_world @ v.co for v in me.vertices]
        polys += [[off + i for i in p.vertices] for p in me.polygons]
        ev.to_mesh_clear()
    return BVHTree.FromPolygons(verts, polys)


def hair(arm, body, shroud_ob, face, count, segs, width, rng):
    """Long black hair, wet and clumped, hanging from the crown: over the face to the chest in front,
    down the back behind. Ribbons, a few hundred, drawn from both sides."""
    head = bvh_of([body])
    both = [head, bvh_of([cloth])]
    C = face.skull
    down = Vector((0, 0, -1))
    roots = []
    total = 2600
    golden = math.pi * (3 - math.sqrt(5))
    for i in range(total):
        dz = 1 - 2 * (i + 0.5) / total
        r = math.sqrt(1 - dz * dz)
        d = Vector((r * math.cos(i * golden), r * math.sin(i * golden), dz))
        front = -d.y
        if not hair_grows(d):
            continue
        hit = head.ray_cast(C + d * 0.4, -d, 0.6)
        if hit[0] is None or hit[0].z < 1.6:
            continue
        roots.append((hit[0], hit[1].normalized(), front))
    rng.shuffle(roots)
    roots = roots[:count]
    guides = roots[: max(8, count // 7)]

    def collide(p, push):
        for t in both:
            loc, nrm, _, dist = t.find_nearest(p)
            if loc is None:
                continue
            if (p - loc).dot(nrm) < 0 or dist < push:
                p = loc + nrm * push
        return p

    def push_of(front):
        return 0.007 + 0.03 * smooth(0.1, 0.6, front)

    def fall(root, nrm, front, length, seed):
        push = push_of(front)
        p = collide(root + nrm * push, push)
        vel = down - nrm * nrm.dot(down)
        vel = vel.normalized() if vel.length > 1e-4 else down
        pts = [p.copy()]
        step = length / segs
        for _ in range(segs):
            wob = Vector((noise.noise(p * 7 + Vector((seed, 0, 0))), noise.noise(p * 7 + Vector((0, seed, 0))), 0)) * 0.3
            vel = (vel * 0.5 + down * 0.5 + wob).normalized()
            p = collide(p + vel * step, push)
            pts.append(p.copy())
        return pts

    eye = face.eyes[0]
    gap = 0.017

    def part(p):
        """The hair parted over one eye, a slit for its light to show through."""
        dx = p.x - eye.x
        if abs(dx) >= gap or p.y > face.skull.y - 0.05:
            return p
        open_ = 1 - smooth(0.012, 0.06, abs(p.z - eye.z))
        x = eye.x + math.copysign(lerp(abs(dx), gap, open_), dx if dx else 1)
        return Vector((x, p.y, p.z))

    paths = []
    for gi, (root, nrm, front) in enumerate(guides):
        length = (0.62 if front > 0.2 else 0.78) * (0.85 + 0.3 * rng.random())
        paths.append(fall(root, nrm, front, length, gi * 3.7))
    piece = Piece()
    for root, nrm, front in roots:
        gi = min(range(len(guides)), key=lambda g: (guides[g][0] - root).length)
        g = paths[gi]
        off = root - guides[gi][0]
        push = push_of(front)
        pts = [part(collide(gp + off * (1 - 0.85 * k / segs), push * 0.8)) for k, gp in enumerate(g)]
        w0 = width * (0.7 + 0.6 * rng.random())
        prev = None
        for k, p in enumerate(pts):
            t = k / segs
            tan = pts[min(k + 1, segs)] - pts[max(k - 1, 0)]
            out = Vector((p.x - C.x, p.y - C.y, 0))
            out = out.normalized() if out.length > 1e-4 else Vector((0, -1, 0))
            side = tan.cross(out)
            side = side.normalized() if side.length > 1e-6 else Vector((1, 0, 0))
            w = w0 * (1 - 0.8 * t * t)
            wh = smooth(1.38, 1.60, p.z)
            rest = "Neck" if p.z > 1.42 else "Spine2"
            weights = {"Head": wh + 0.001, rest: 1 - wh}
            a = piece.add(p - side * w / 2, weights, (0, t))
            b = piece.add(p + side * w / 2, weights, (1, t))
            if prev:
                piece.faces.append((prev[0], a, b, prev[1]))
            prev = (a, b)
    mat = material("Ghost_Hair", colour=(0.010, 0.010, 0.012), rough=0.4, double=True)
    return piece.make("Ghost_Hair", arm, mat)


# ---- looking at it -------------------------------------------------------------------------------

def load_clip(name):
    """One of the players' animations on the ghost's armature, turning only (as the game plays them)."""
    before = set(bpy.data.objects)
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, f"anim-{name}.fbx"))
    new = [o for o in bpy.data.objects if o not in before]
    src = next(o for o in new if o.type == "ARMATURE")
    action = src.animation_data.action
    for o in new:
        bpy.data.objects.remove(o, do_unlink=True)
    for layer in action.layers:
        for strip in layer.strips:
            for bag in strip.channelbags:
                for fc in list(bag.fcurves):
                    fc.data_path = re.sub(r"mixamorig\d*:", "mixamorig:", fc.data_path)
                    if fc.data_path.endswith("location") or fc.data_path.endswith("scale"):
                        bag.fcurves.remove(fc)
    return action


def setup_view(arm, night):
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 900, 1200
    world = bpy.data.worlds.new("W")
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs["Color"].default_value = (0.004, 0.004, 0.006, 1) if night else (0.03, 0.03, 0.035, 1)
    scene.world = world
    for o in [o for o in bpy.data.objects if o.type in ("LIGHT", "CAMERA")]:
        bpy.data.objects.remove(o, do_unlink=True)
    if night:
        # the aura only: a cold point light at the chest, as the game's
        lamp = bpy.data.objects.new("Aura", bpy.data.lights.new("Aura", "POINT"))
        lamp.data.energy = 6
        lamp.data.color = (0.62, 0.7, 1.0)
        lamp.location = (0, -0.45, 1.3)
    else:
        lamp = bpy.data.objects.new("Key", bpy.data.lights.new("Key", "SUN"))
        lamp.data.energy = 3
        lamp.rotation_euler = (math.radians(50), 0, math.radians(30))
    scene.collection.objects.link(lamp)
    cam = bpy.data.objects.new("Cam", bpy.data.cameras.new("Cam"))
    scene.collection.objects.link(cam)
    scene.camera = cam
    cam.data.lens = 50
    return cam


def shoot(cam, at, target, path):
    cam.location = at
    cam.rotation_euler = (Vector(target) - Vector(at)).to_track_quat("-Z", "Y").to_euler()
    bpy.context.scene.render.filepath = path
    bpy.ops.render.render(write_still=True)


def previews(arm, tag):
    os.makedirs(PREVIEW, exist_ok=True)
    h = world_bone(arm, "mixamorig:HeadTop_End").z
    mid = (0, 0, h * 0.5)
    for night in (False, True):
        cam = setup_view(arm, night)
        n = "night" if night else "day"
        shoot(cam, (0, -4.4, h * 0.5), mid, os.path.join(PREVIEW, f"{tag}-{n}-front.png"))
        shoot(cam, (1.1, -1.25, h - 0.12), (0, -0.05, h - 0.2), os.path.join(PREVIEW, f"{tag}-{n}-face.png"))
        if not night:
            shoot(cam, (4.4, 0, h * 0.5), mid, os.path.join(PREVIEW, f"{tag}-{n}-side.png"))
            shoot(cam, (0, -1.0, h - 0.14), (0, 0, h - 0.16), os.path.join(PREVIEW, f"{tag}-{n}-closeface.png"))
            shoot(cam, (0.3, -1.6, 0.15), (0, 0, 0.8), os.path.join(PREVIEW, f"{tag}-{n}-low.png"))
    cam = setup_view(arm, False)
    arm.animation_data_create()
    for clip in ("idle", "walk", "run"):
        action = load_clip(clip)
        arm.animation_data.action = action
        if action.slots:
            arm.animation_data.action_slot = action.slots[0]
        start, end = (int(v) for v in action.frame_range)
        for k, f in enumerate((start, (start + end) // 3, 2 * (start + end) // 3)):
            bpy.context.scene.frame_set(f)
            shoot(cam, (2.6, -3.4, h * 0.5), mid, os.path.join(PREVIEW, f"{tag}-{clip}-{k}.png"))
    arm.animation_data.action = None
    bpy.context.scene.frame_set(0)


# ---- out -----------------------------------------------------------------------------------------

def export(path):
    os.makedirs(os.path.dirname(path), exist_ok=True)
    bpy.ops.object.select_all(action="DESELECT")
    for ob in bpy.data.objects:
        ob.select_set(ob.type in ("ARMATURE", "MESH"))
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        use_selection=True,
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=False,
        export_def_bones=False,
        export_morph=False,
        export_image_format="JPEG",
        export_jpeg_quality=88,
        export_extras=False,
    )
    print("ghost: wrote", path, os.path.getsize(path) // 1024, "KB")


def build(low):
    clear()
    rng = np.random.default_rng(7)
    random.seed(7)
    arm, body = import_body()
    bpy.context.view_layer.update()
    reshape(arm, body)
    bpy.context.view_layer.update()
    # no feet: the shroud drags on the floor over nothing
    bm = bmesh.new()
    bm.from_mesh(body.data)
    mw = body.matrix_world
    bmesh.ops.delete(bm, geom=[v for v in bm.verts if (mw @ v.co).z < 0.3], context="VERTS")
    bm.to_mesh(body.data)
    bm.free()
    face = Face(body)
    print("ghost: eyes", [tuple(round(c, 3) for c in e) for e in face.eyes], "r", round(face.eye_r, 4))
    face_shape(body, face)
    size = 512 if low else 1024
    body.data.materials[0] = skin(body, face, size, rng)
    dark_eye = material("Ghost_EyeDark", colour=(0.008, 0.008, 0.01), rough=0.15)
    body.data.materials.append(dark_eye)
    for p in body.data.polygons:
        if all(v in face.eyeball for v in p.vertices):
            p.material_index = 1
    cloth = linen(256 if low else 512, rng)
    cloth_mat = material("Ghost_Shroud", image=cloth, rough=0.95, emit_image=cloth, strength=0.22)
    shroud_ob = shroud(arm, cloth_mat, 40 if low else 72, 22 if low else 45)
    skirt_cap(arm, cloth_mat)
    eyes(arm, face)
    hair(arm, body, cloth, face, 180 if low else 640, 14 if low else 26, 0.02 if low else 0.012, rng)
    if low:
        dec = body.modifiers.new("Decimate", "DECIMATE")
        dec.ratio = 0.3
        body.modifiers.move(len(body.modifiers) - 1, 0)
        bpy.context.view_layer.objects.active = body
        bpy.ops.object.modifier_apply(modifier=dec.name)
    tris = 0
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            ob.data.calc_loop_triangles()
            tris += len(ob.data.loop_triangles)
            print("ghost:", ob.name, len(ob.data.loop_triangles), "triangles")
    print("ghost: total", tris, "triangles", "(Low)" if low else "")
    return arm


def main():
    arm = build(low=False)
    if PREVIEW:
        previews(arm, "ghost")
    export(OUT)
    if "--low" in args:
        build(low=True)
        export(args[args.index("--low") + 1])


if __name__ == "__main__":
    main()
