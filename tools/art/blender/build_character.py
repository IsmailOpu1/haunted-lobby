# Builds the 8 player characters (GDD 22.1) from the Mixamo downloads in assets-src/characters/mixamo
# (listed in docs/ASSETS.md), and one shared file of their animations:
#   - every skeleton's bones get the same names ("mixamorig:Hips", ...) so one set of animations fits all;
#   - the glossy look the FBX import gives is put back to cloth and skin (no specular maps);
#   - textures are brought down to the size they are seen at (body 2K, hair 1K);
#   - each character gets the things that tell them apart (the priest's collar and cross, the nurse's
#     cap and bag, ...), modelled here and fixed to the bone that carries them.
# Run (headless):
#   blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_character.py -- <id> [--preview]
#   <id> is a character id from shared/src/characters.ts, or "anims" for the animations.
# Writes assets-src/build/char-<id>.glb; tools/art/build-characters.ts makes the game files from them.
import math
import os
import re
import sys

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SRC = os.path.join(ROOT, "assets-src/characters/mixamo")
OUT = os.path.join(ROOT, "assets-src/build")

# Which Mixamo download each character is (owner, 2026-11-14: "Yes, these 8").
MODELS = {
    "priest": "joe",
    "journalist": "elizabeth",
    "nurse": "suzie",
    "student": "bryce",
    "detective": "brian",
    "photographer": "kate",
    "mechanic": "pete",
    "caretaker": "megan",
}
# The game's names for the animations, and the Mixamo files they come from.
# Each game clip and the Mixamo file it comes from (assets-src/characters/mixamo). The downed ones
# all lie on the back on the floor, so the fall, the lying and the crawl follow on from each other.
ANIMS = {
    "idle": "anim-idle",
    "walk": "anim-walk",
    "run": "anim-run",
    "crouch-idle": "anim-crouch-idle",
    "crouch-walk": "anim-crouch-walk",
    "knocked-down": "anim-knocked-out-back",
    "downed-idle": "anim-writhing",
    "crawl": "anim-crawl-back",
    "dying": "anim-dying",
}
BODY_TEX = 2048
HAIR_TEX = 1024
CLOTH_ROUGHNESS = 0.78
HAIR_ROUGHNESS = 0.55

args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHO = args[0] if args else "priest"
PREVIEW = "--preview" in args


def clear():
    for ob in list(bpy.data.objects):
        bpy.data.objects.remove(ob, do_unlink=True)
    for coll in (bpy.data.meshes, bpy.data.materials, bpy.data.images, bpy.data.actions, bpy.data.armatures):
        for block in list(coll):
            if block.users == 0:
                coll.remove(block)


def import_fbx(name):
    bpy.ops.import_scene.fbx(filepath=os.path.join(SRC, name + ".fbx"))
    arm = next(o for o in bpy.context.selected_objects if o.type == "ARMATURE")
    return arm


def standard_bone_names(arm):
    """Mixamo numbers its rigs (mixamorig7:Hips); the game wants one name for every rig."""
    for bone in arm.data.bones:
        bone.name = re.sub(r"^mixamorig\d*:", "mixamorig:", bone.name)
    for ob in bpy.data.objects:
        if ob.type == "MESH":
            for group in ob.vertex_groups:
                group.name = re.sub(r"^mixamorig\d*:", "mixamorig:", group.name)


# ---------------------------------------------------------------------------------------------
# Materials and textures


def principled(mat):
    return next((n for n in mat.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None) if mat.use_nodes else None


def image_behind(socket):
    """The image texture feeding a socket, through a normal-map node if there is one."""
    if not socket.is_linked:
        return None
    node = socket.links[0].from_node
    if node.type == "NORMAL_MAP":
        return image_behind(node.inputs["Color"])
    return node.image if node.type == "TEX_IMAGE" else None


def matte_materials(meshes):
    """Cloth and skin, not plastic: only colour, alpha and normal maps stay."""
    for ob in meshes:
        for mat in ob.data.materials:
            bsdf = principled(mat) if mat else None
            if not bsdf:
                continue
            hair = "hair" in mat.name.lower()
            tree = mat.node_tree
            for name in ("Metallic", "Roughness", "Specular IOR Level", "Specular Tint", "Coat Weight", "Sheen Weight"):
                sock = bsdf.inputs.get(name)
                if sock is not None:
                    for link in list(sock.links):
                        tree.links.remove(link)
            bsdf.inputs["Metallic"].default_value = 0.0
            bsdf.inputs["Roughness"].default_value = HAIR_ROUGHNESS if hair else CLOTH_ROUGHNESS
            bsdf.inputs["Specular IOR Level"].default_value = 0.35
            size = HAIR_TEX if hair else BODY_TEX
            for sock in (bsdf.inputs["Base Color"], bsdf.inputs["Alpha"], bsdf.inputs["Normal"]):
                img = image_behind(sock)
                if img and img.size[0] > size:
                    img.scale(size, size)
            if bsdf.inputs["Alpha"].is_linked:
                mat.surface_render_method = "DITHERED"


def material(name, colour, roughness=0.7, metallic=0.0):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    bsdf = principled(mat)
    bsdf.inputs["Base Color"].default_value = (*colour, 1.0)
    bsdf.inputs["Roughness"].default_value = roughness
    bsdf.inputs["Metallic"].default_value = metallic
    return mat


# ---------------------------------------------------------------------------------------------
# Modelling helpers (all sizes in metres, in the character's rest pose: facing -Y, up +Z)


def world_bone(arm, name, tail=False):
    bone = arm.data.bones["mixamorig:" + name]
    return arm.matrix_world @ (bone.tail_local if tail else bone.head_local)


def new_mesh(name, bm, mat, smooth=True):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    bpy.context.scene.collection.objects.link(ob)
    me.materials.append(mat)
    if smooth:
        for p in me.polygons:
            p.use_smooth = True
    return ob


def box(name, size, mat, at, bevel=0.004, rot=(0, 0, 0)):
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    bmesh.ops.scale(bm, vec=Vector(size), verts=bm.verts)
    if bevel:
        bmesh.ops.bevel(bm, geom=bm.edges[:], offset=bevel, segments=2, profile=0.5, affect="EDGES")
    ob = new_mesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    return ob


def cylinder(name, radius, depth, mat, at, rot=(0, 0, 0), segments=24, bevel=0.0, radius2=None):
    bm = bmesh.new()
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=radius, radius2=radius if radius2 is None else radius2, depth=depth)
    if bevel:
        rims = [e for e in bm.edges if not e.is_manifold or abs(e.verts[0].co.z - e.verts[1].co.z) < 1e-6 and abs(abs(e.verts[0].co.z) - depth / 2) < 1e-6]
        bmesh.ops.bevel(bm, geom=rims, offset=bevel, segments=2, profile=0.5, affect="EDGES")
    ob = new_mesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    return ob


def torus(name, major, minor, mat, at, rot=(0, 0, 0), major_seg=32, minor_seg=10):
    bm = bmesh.new()
    for i in range(major_seg):
        a = 2 * math.pi * i / major_seg
        for j in range(minor_seg):
            b = 2 * math.pi * j / minor_seg
            r = major + minor * math.cos(b)
            bm.verts.new((r * math.cos(a), r * math.sin(a), minor * math.sin(b)))
    bm.verts.ensure_lookup_table()
    for i in range(major_seg):
        for j in range(minor_seg):
            v = lambda ii, jj: bm.verts[(ii % major_seg) * minor_seg + (jj % minor_seg)]
            bm.faces.new((v(i, j), v(i + 1, j), v(i + 1, j + 1), v(i, j + 1)))
    ob = new_mesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    return ob


def lathe(name, profile, mat, at, rot=(0, 0, 0), segments=32):
    """Turns a profile [(radius, height), ...] (bottom to top) around the Z axis."""
    bm = bmesh.new()
    rings = []
    for r, z in profile:
        ring = [bm.verts.new((r * math.cos(2 * math.pi * i / segments), r * math.sin(2 * math.pi * i / segments), z)) for i in range(segments)]
        rings.append(ring)
    for a, b in zip(rings, rings[1:]):
        for i in range(segments):
            bm.faces.new((a[i], a[(i + 1) % segments], b[(i + 1) % segments], b[i]))
    if profile[0][0] > 0:
        bm.faces.new(list(reversed(rings[0])))
    if profile[-1][0] > 0:
        bm.faces.new(rings[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    ob = new_mesh(name, bm, mat)
    ob.location = at
    ob.rotation_euler = rot
    return ob


def attach(arm, parts, bone):
    """Fixes the parts to a bone, keeping where they are in the rest pose."""
    for ob in parts:
        # matrix_basis, not matrix_world: a new object has no world matrix until the scene updates.
        world = ob.matrix_basis.copy()
        ob.parent = arm
        ob.parent_type = "BONE"
        ob.parent_bone = "mixamorig:" + bone
        bpy.context.view_layer.update()
        ob.matrix_world = world


def in_hand(arm, side, build):
    """Something hanging from a hand by its handle. In the rest pose the arm points out sideways,
    so the item is built upright at the origin (handle top at z=0) and laid along the arm, its
    bottom pointing away from the body: when the arm hangs down, it hangs below the hand."""
    hand = world_bone(arm, side + "Hand")
    middle = world_bone(arm, side + "HandMiddle1")
    out = (middle - hand).normalized()
    parts = build()
    # Turn "down" (-Z) to point along the arm, outward.
    turn = Vector((0, 0, -1)).rotation_difference(out).to_matrix().to_4x4()
    grip = hand + (middle - hand) * 0.9 + Vector((0, 0, -0.015))
    for ob in parts:
        ob.matrix_basis = Matrix.Translation(grip) @ turn @ ob.matrix_basis
    attach(arm, parts, side + "Hand")
    return parts


def head_frame(arm):
    head = world_bone(arm, "Head")
    top = world_bone(arm, "HeadTop_End")
    return head, top


# ---------------------------------------------------------------------------------------------
# The things that tell each character apart (GDD 22.1)

def chest_point(arm, forward, up=0.0):
    s2 = world_bone(arm, "Spine2")
    neck = world_bone(arm, "Neck")
    return s2 + (neck - s2) * up + Vector((0, -forward, 0))


def surface_y(meshes, x, z, front=True, window=0.04):
    """How far forward (most negative Y) the body's surface is near a point (rest pose)."""
    best = None
    for ob in meshes:
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            if abs(w.x - x) < window and abs(w.z - z) < window:
                if best is None or (w.y < best if front else w.y > best):
                    best = w.y
    return best


def ribbon(name, points, width, thickness, mat, side=None, out=Vector((0, -1, 0))):
    """A flat band (a strap, a stole) through points, `width` across, with thickness. Across is
    `side` if given, else square to the path; `out` is the way the band's face looks."""
    bm = bmesh.new()
    half = width / 2
    pts = [Vector(p) for p in points]
    rows = []
    for i, p in enumerate(pts):
        d = (pts[min(i + 1, len(pts) - 1)] - pts[max(i - 1, 0)]).normalized()
        across = side if side is not None else d.cross(out).normalized()
        rows.append([bm.verts.new(p + across * half * sx + out * (thickness / 2) * ty) for sx, ty in ((-1, 1), (1, 1), (1, -1), (-1, -1))])
    for r0, r1 in zip(rows, rows[1:]):
        for i in range(4):
            bm.faces.new((r0[i], r0[(i + 1) % 4], r1[(i + 1) % 4], r1[i]))
    bm.faces.new(list(reversed(rows[0])))
    bm.faces.new(rows[-1])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_mesh(name, bm, mat, smooth=False)


def over_body(meshes, path, steps, gap, front=True, window=0.025):
    """Points along a path of (x, z) waypoints laid on the front (or back) of the body, `gap` off it."""
    pts = []
    stops = []
    for (x0, z0), (x1, z1) in zip(path, path[1:]):
        stops += [(x0 + (x1 - x0) * i / steps, z0 + (z1 - z0) * i / steps) for i in range(steps)]
    stops.append(path[-1])
    for x, z in stops:
        y = surface_y(meshes, x, z, front=front, window=window)
        if y is not None:
            pts.append((x, y - gap if front else y + gap, z))
    return pts


def follow_front(meshes, x, z_top, z_bottom, steps, gap, window=0.025):
    """Points down the front of the body at x, kept `gap` off the surface."""
    return over_body(meshes, [(x, z_top), (x, z_bottom)], steps, gap, window=window)


def strap(name, meshes, path, steps, width, mat, front=True, gap=0.008):
    return ribbon(name, over_body(meshes, path, steps, gap, front=front), width, 0.005, mat, out=Vector((0, -1 if front else 1, 0)))


def skull_top(meshes, head):
    """The real top of the head (or hair), not the rig's HeadTop_End."""
    top = None
    for ob in meshes:
        if "lash" in ob.name.lower():
            continue
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            if abs(w.x - head.x) < 0.06 and abs(w.y - head.y) < 0.06 and w.z > head.z:
                top = w.z if top is None else max(top, w.z)
    return top


def band_around(name, meshes, centre, z, height, gap, thickness, mat, segments=36):
    """A band hugging the body all the way round at height z (a waist tie)."""
    found = [0.0] * segments
    for ob in meshes:
        for v in ob.data.vertices:
            w = ob.matrix_world @ v.co
            if abs(w.z - z) < 0.02:
                d = Vector((w.x - centre.x, w.y - centre.y))
                if d.length > 0.25:
                    continue
                k = int(((math.atan2(d.y, d.x) + math.pi) / (2 * math.pi)) * segments) % segments
                found[k] = max(found[k], d.length)
    bm = bmesh.new()
    rings = []
    for extra in (0.0, thickness):
        for zz in (z - height / 2, z + height / 2):
            ring = []
            for k in range(segments):
                a = (k + 0.5) / segments * 2 * math.pi - math.pi
                r = max(found[k], found[k - 1], found[(k + 1) % segments]) + gap + extra
                ring.append(bm.verts.new((centre.x + r * math.cos(a), centre.y + r * math.sin(a), zz)))
            rings.append(ring)
    inner_lo, inner_hi, outer_lo, outer_hi = rings
    for k in range(segments):
        n = (k + 1) % segments
        bm.faces.new((outer_lo[k], outer_lo[n], outer_hi[n], outer_hi[k]))
        bm.faces.new((inner_lo[n], inner_lo[k], inner_hi[k], inner_hi[n]))
        bm.faces.new((inner_hi[k], outer_hi[k], outer_hi[n], inner_hi[n]))
        bm.faces.new((inner_lo[n], outer_lo[n], outer_lo[k], inner_lo[k]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_mesh(name, bm, mat)


def cloth_panel(name, meshes, x_range, z_top, z_bottom, cols, rows, gap, thickness, mat):
    """A cloth panel (an apron) lying on the front of the body, following its shape."""
    bm = bmesh.new()
    grid = []
    for r in range(rows + 1):
        z = z_top + (z_bottom - z_top) * r / rows
        line = []
        for c in range(cols + 1):
            x = x_range[0] + (x_range[1] - x_range[0]) * c / cols
            y = surface_y(meshes, x, z, window=0.03)
            line.append([x, (y if y is not None else -0.1) - gap, z])
        grid.append(line)
    # Cloth falls straight below the widest point: it never tucks back in under the belly.
    for c in range(cols + 1):
        for r in range(1, rows + 1):
            grid[r][c][1] = min(grid[r][c][1], grid[r - 1][c][1])
    front = [[bm.verts.new(p) for p in line] for line in grid]
    back = [[bm.verts.new((p[0], p[1] + thickness, p[2])) for p in line] for line in grid]
    for r in range(rows):
        for c in range(cols):
            bm.faces.new((front[r][c], front[r][c + 1], front[r + 1][c + 1], front[r + 1][c]))
            bm.faces.new((back[r][c], back[r + 1][c], back[r + 1][c + 1], back[r][c + 1]))
    rims = [(front[0][c], front[0][c + 1], back[0][c + 1], back[0][c]) for c in range(cols)]
    rims += [(front[rows][c + 1], front[rows][c], back[rows][c], back[rows][c + 1]) for c in range(cols)]
    rims += [(front[r + 1][0], front[r][0], back[r][0], back[r + 1][0]) for r in range(rows)]
    rims += [(front[r][cols], front[r + 1][cols], back[r + 1][cols], back[r][cols]) for r in range(rows)]
    for f in rims:
        bm.faces.new(f)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces[:])
    return new_mesh(name, bm, mat)


def priest(arm, meshes):
    """A purple stole over the shoulders and a gold cross on the chest (GDD 22.1: holds a cross)."""
    purple = material("stole_purple", (0.2, 0.03, 0.18), 0.7)
    gold = material("cross_gold", (0.85, 0.62, 0.25), 0.3, 1.0)
    neck = world_bone(arm, "Neck")
    hips = world_bone(arm, "Hips")
    s2 = world_bone(arm, "Spine2")
    parts = []
    for side in (-1, 1):
        x = neck.x + side * 0.075
        pts = follow_front(meshes, x, neck.z + 0.01, hips.z + 0.08, 12, 0.012)
        parts.append(ribbon(f"priest_stole_{side}", pts, 0.075, 0.006, purple))
        # A small gold cross near the end of each side.
        end = Vector(pts[-2])
        parts.append(box(f"priest_stole_cross_v_{side}", (0.012, 0.004, 0.04), gold, end + Vector((0, -0.005, 0)), bevel=0.001))
        parts.append(box(f"priest_stole_cross_h_{side}", (0.03, 0.004, 0.011), gold, end + Vector((0, -0.005, 0.008)), bevel=0.001))
    # Over the back of the neck.
    parts.append(ribbon("priest_stole_back", [(neck.x - 0.075, neck.y + 0.02, neck.z + 0.01), (neck.x, neck.y + 0.075, neck.z + 0.03), (neck.x + 0.075, neck.y + 0.02, neck.z + 0.01)], 0.06, 0.006, purple, side=Vector((0, 0, 1))))
    cz = s2.z + 0.02
    cy = (surface_y(meshes, s2.x, cz, window=0.012) or (s2.y - 0.12)) - 0.012
    parts.append(box("priest_cross_upright", (0.028, 0.012, 0.15), gold, (s2.x, cy, cz), bevel=0.003))
    parts.append(box("priest_cross_bar", (0.095, 0.012, 0.026), gold, (s2.x, cy, cz + 0.033), bevel=0.003))
    attach(arm, parts, "Spine2")


def journalist(arm, meshes):
    """A leather satchel on a strap across the body, and a notebook in the hand."""
    leather = material("satchel_leather", (0.2, 0.1, 0.05), 0.6)
    buckle = material("satchel_brass", (0.72, 0.55, 0.25), 0.35, 1.0)
    paper = material("notebook_paper", (0.88, 0.85, 0.76), 0.85)
    cover = material("notebook_cover", (0.06, 0.07, 0.09), 0.55)
    hips = world_bone(arm, "Hips")
    # Bag on the right hip, a little behind.
    bag_at = Vector((hips.x - 0.19, hips.y + 0.02, hips.z - 0.02))
    bag = box("journalist_satchel", (0.07, 0.27, 0.21), leather, bag_at, bevel=0.012)
    flap = box("journalist_flap", (0.012, 0.275, 0.13), leather, bag_at + Vector((-0.04, 0, 0.045)), bevel=0.004)
    clasp = box("journalist_clasp", (0.006, 0.03, 0.02), buckle, bag_at + Vector((-0.048, 0, 0.0)), bevel=0.001)
    attach(arm, [bag, flap, clasp], "Hips")
    # The strap: from the bag across the chest to the left shoulder, and back down behind.
    ls = world_bone(arm, "LeftShoulder")
    path = [(bag_at.x + 0.03, bag_at.z + 0.11), (ls.x + 0.03, ls.z + 0.02)]
    front = strap("journalist_strap_front", meshes, path, 14, 0.04, leather)
    back = strap("journalist_strap_back", meshes, path, 14, 0.04, leather, front=False)
    attach(arm, [front, back], "Spine1")

    def notebook():
        pages = box("journalist_pages", (0.10, 0.018, 0.145), paper, (0, 0.0, -0.085), bevel=0.002)
        back_cover = box("journalist_cover", (0.106, 0.004, 0.15), cover, (0, 0.011, -0.085), bevel=0.0015)
        front_cover = box("journalist_cover_front", (0.106, 0.004, 0.15), cover, (0, -0.011, -0.085), bevel=0.0015)
        return [pages, back_cover, front_cover]

    in_hand(arm, "Left", notebook)


def nurse(arm, meshes):
    """A starched white cap with a red cross, and a doctor's bag."""
    white = material("cap_white", (0.9, 0.9, 0.88), 0.5)
    red = material("cap_cross_red", (0.65, 0.03, 0.03), 0.5)
    bag_leather = material("nursebag_leather", (0.16, 0.05, 0.04), 0.5)
    brass = material("nursebag_brass", (0.75, 0.6, 0.3), 0.3, 1.0)
    head = world_bone(arm, "Head")
    top = skull_top(meshes, head)
    tilt = (math.radians(-18), 0, 0)
    cap_z = top - 0.045
    cap = lathe("nurse_cap", [(0.09, 0.0), (0.094, 0.03), (0.078, 0.062), (0.0, 0.066)], white, (head.x, head.y - 0.005, cap_z), rot=tilt)
    band = cylinder("nurse_cap_band", 0.093, 0.022, white, (head.x, head.y - 0.008, cap_z + 0.01), rot=tilt, segments=32)
    fy = head.y - 0.098
    c1 = box("nurse_cross_v", (0.02, 0.006, 0.055), red, (head.x, fy, cap_z + 0.045), rot=tilt, bevel=0.001)
    c2 = box("nurse_cross_h", (0.055, 0.006, 0.02), red, (head.x, fy, cap_z + 0.045), rot=tilt, bevel=0.001)
    attach(arm, [cap, band, c1, c2], "Head")

    def doctors_bag():
        body = box("nurse_bag", (0.13, 0.30, 0.17), bag_leather, (0, 0, -0.14), bevel=0.03)
        frame = box("nurse_bag_frame", (0.135, 0.31, 0.012), brass, (0, 0, -0.06), bevel=0.003)
        handle = torus("nurse_bag_handle", 0.045, 0.008, bag_leather, (0, 0, -0.04), rot=(math.radians(90), 0, math.radians(90)), major_seg=20, minor_seg=8)
        handle.scale = (1.0, 0.6, 1.0)
        return [body, frame, handle]

    in_hand(arm, "Right", doctors_bag)


def student(arm, meshes):
    """A school backpack on both shoulders."""
    canvas = material("backpack_canvas", (0.08, 0.12, 0.24), 0.85)
    trim = material("backpack_trim", (0.04, 0.04, 0.05), 0.75)
    s1 = world_bone(arm, "Spine1")
    back_y = surface_y(meshes, s1.x, s1.z + 0.05, front=False) or (s1.y + 0.12)
    at = Vector((s1.x, back_y + 0.075, s1.z + 0.04))
    pack = box("student_backpack", (0.3, 0.14, 0.4), canvas, at, bevel=0.04)
    pocket = box("student_pocket", (0.22, 0.05, 0.17), canvas, at + Vector((0, 0.085, -0.09)), bevel=0.02)
    zip_ = box("student_zip", (0.24, 0.006, 0.01), trim, at + Vector((0, 0.11, -0.03)), bevel=0.002)
    parts = [pack, pocket, zip_]
    for side in (-1, 1):
        sh = world_bone(arm, ("Left" if side > 0 else "Right") + "Shoulder")
        x = sh.x + side * 0.02
        # Over the shoulder, down the front to under the arm, and down the back into the pack.
        parts.append(strap(f"student_strap_front_{side}", meshes, [(x, sh.z + 0.05), (x + side * 0.03, sh.z - 0.2)], 10, 0.045, trim))
        parts.append(strap(f"student_strap_back_{side}", meshes, [(x, sh.z + 0.05), (x - side * 0.02, at.z + 0.18)], 6, 0.045, trim, front=False))
    attach(arm, parts, "Spine2")


def detective(arm, meshes):
    """A felt fedora and a magnifying glass."""
    felt = material("fedora_felt", (0.15, 0.12, 0.1), 0.85)
    ribbon_mat = material("fedora_ribbon", (0.03, 0.025, 0.02), 0.6)
    brass = material("glass_brass", (0.7, 0.55, 0.28), 0.3, 1.0)
    lens = material("glass_lens", (0.8, 0.85, 0.9), 0.05)
    wood = material("glass_handle", (0.25, 0.13, 0.06), 0.5)
    head = world_bone(arm, "Head")
    z = skull_top(meshes, head) - 0.085
    brim = lathe("detective_brim", [(0.145, 0.0), (0.147, 0.006), (0.1, 0.01), (0.0, 0.01)], felt, (head.x, head.y, z))
    brim.scale = (0.92, 1.08, 1)
    # A pinched crown: narrower at the top, with a dent along the middle.
    crown = lathe("detective_crown", [(0.1, 0.0), (0.098, 0.05), (0.088, 0.095), (0.05, 0.115), (0.0, 0.1)], felt, (head.x, head.y, z + 0.008))
    crown.scale = (0.88, 1.06, 1)
    band = cylinder("detective_band", 0.1, 0.028, ribbon_mat, (head.x, head.y, z + 0.024), segments=32)
    band.scale = (0.89, 1.07, 1)
    attach(arm, [brim, crown, band], "Head")

    def magnifier():
        handle = cylinder("detective_handle", 0.012, 0.1, wood, (0, 0, -0.03), segments=12)
        rim = torus("detective_rim", 0.05, 0.006, brass, (0, 0, -0.14), rot=(math.radians(90), 0, 0), major_seg=28, minor_seg=8)
        glass = cylinder("detective_lens", 0.048, 0.004, lens, (0, 0, -0.14), rot=(math.radians(90), 0, 0), segments=28)
        return [handle, rim, glass]

    in_hand(arm, "Left", magnifier)


def photographer(arm, meshes):
    """A big old box camera on a strap round the neck."""
    leatherette = material("camera_leatherette", (0.04, 0.04, 0.04), 0.65)
    chrome = material("camera_chrome", (0.75, 0.75, 0.75), 0.25, 1.0)
    glass = material("camera_glass", (0.04, 0.05, 0.08), 0.05)
    strap_mat = material("camera_strap", (0.18, 0.1, 0.06), 0.6)
    s1 = world_bone(arm, "Spine1")
    neck = world_bone(arm, "Neck")
    # Below the bust, where a camera on a neck strap really rests.
    cz = s1.z - 0.035
    cy = (surface_y(meshes, s1.x, cz, window=0.03) or (s1.y - 0.12)) - 0.046
    at = Vector((s1.x, cy, cz))
    body = box("photographer_camera", (0.17, 0.085, 0.11), leatherette, at, bevel=0.008)
    top_plate = box("photographer_top", (0.172, 0.087, 0.012), chrome, at + Vector((0, 0, 0.058)), bevel=0.003)
    finder = box("photographer_finder", (0.05, 0.04, 0.025), chrome, at + Vector((0.04, 0.0, 0.075)), bevel=0.004)
    lens_barrel = cylinder("photographer_lens", 0.036, 0.055, chrome, at + Vector((0, -0.07, -0.005)), rot=(math.radians(90), 0, 0), segments=28)
    lens_ring = torus("photographer_lens_ring", 0.036, 0.004, leatherette, at + Vector((0, -0.095, -0.005)), rot=(math.radians(90), 0, 0), major_seg=28, minor_seg=6)
    lens_glass = cylinder("photographer_glass", 0.03, 0.004, glass, at + Vector((0, -0.098, -0.005)), rot=(math.radians(90), 0, 0), segments=28)
    parts = [body, top_plate, finder, lens_barrel, lens_ring, lens_glass]
    for side in (-1, 1):
        x0 = at.x + side * 0.075
        parts.append(strap(f"photographer_strap_{side}", meshes, [(x0, at.z + 0.05), (neck.x + side * 0.06, neck.z + 0.03)], 10, 0.022, strap_mat))
    attach(arm, parts, "Spine2")


def mechanic(arm, meshes):
    """A red steel toolbox."""
    red = material("toolbox_red", (0.3, 0.035, 0.02), 0.5, 0.5)
    steel = material("toolbox_steel", (0.55, 0.55, 0.55), 0.35, 1.0)

    def toolbox():
        body = box("mechanic_toolbox", (0.13, 0.36, 0.15), red, (0, 0, -0.15), bevel=0.008)
        lid = box("mechanic_lid", (0.135, 0.365, 0.035), red, (0, 0, -0.062), bevel=0.01)
        handle = box("mechanic_handle", (0.02, 0.13, 0.012), steel, (0, 0, -0.022), bevel=0.004)
        posts = [box(f"mechanic_post_{s}", (0.012, 0.012, 0.035), steel, (0, s * 0.06, -0.035), bevel=0.002) for s in (-1, 1)]
        latches = [box(f"mechanic_latch_{s}", (0.008, 0.03, 0.025), steel, (-0.069, s * 0.12, -0.08), bevel=0.002) for s in (-1, 1)]
        return [body, lid, handle, *posts, *latches]

    in_hand(arm, "Left", toolbox)


def caretaker(arm, meshes):
    """A canvas work apron at the waist and an oil lantern."""
    canvas = material("apron_canvas", (0.13, 0.09, 0.055), 0.92)
    tie = material("apron_tie", (0.07, 0.05, 0.03), 0.85)
    metal = material("lantern_metal", (0.1, 0.09, 0.08), 0.45, 0.8)
    glass = material("lantern_glass", (0.95, 0.8, 0.55), 0.1)
    hips = world_bone(arm, "Hips")
    spine = world_bone(arm, "Spine")
    waist_z = spine.z + 0.02
    # Short enough that the thighs never swing through it.
    apron = cloth_panel("caretaker_apron", meshes, (hips.x - 0.15, hips.x + 0.15), waist_z, hips.z - 0.17, 12, 10, 0.012, 0.006, canvas)
    pocket = cloth_panel("caretaker_pocket", meshes, (hips.x - 0.1, hips.x + 0.1), hips.z - 0.05, hips.z - 0.14, 8, 4, 0.02, 0.005, canvas)
    band = band_around("caretaker_tie", meshes, Vector((spine.x, spine.y)), waist_z, 0.025, 0.006, 0.005, tie)
    attach(arm, [apron, pocket, band], "Hips")

    def lantern():
        ring = torus("caretaker_ring", 0.035, 0.004, metal, (0, 0, -0.035), rot=(0, math.radians(90), 0), major_seg=20, minor_seg=6)
        cap = lathe("caretaker_cap", [(0.06, 0.0), (0.055, 0.02), (0.03, 0.045), (0.012, 0.05), (0.0, 0.05)], metal, (0, 0, -0.13))
        chimney = cylinder("caretaker_glass", 0.045, 0.11, glass, (0, 0, -0.19), segments=20)
        cage = [cylinder(f"caretaker_wire_{i}", 0.003, 0.12, metal, (0.05 * math.cos(i * math.pi / 2), 0.05 * math.sin(i * math.pi / 2), -0.19), segments=6) for i in range(4)]
        base = lathe("caretaker_base", [(0.0, 0.0), (0.065, 0.0), (0.067, 0.03), (0.05, 0.04), (0.0, 0.04)], metal, (0, 0, -0.29))
        return [ring, cap, chimney, *cage, base]

    in_hand(arm, "Right", lantern)


PROPS = {
    "priest": priest,
    "journalist": journalist,
    "nurse": nurse,
    "student": student,
    "detective": detective,
    "photographer": photographer,
    "mechanic": mechanic,
    "caretaker": caretaker,
}


# ---------------------------------------------------------------------------------------------


def export(path, animations):
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_apply=False,
        export_skins=True,
        export_animations=animations,
        export_animation_mode="ACTIONS",
        export_force_sampling=True,
        export_frame_step=1,
        export_def_bones=False,
        export_morph=False,
        export_image_format="AUTO",
        export_extras=False,
    )


def build_character(who):
    clear()
    arm = import_fbx(MODELS[who])
    arm.name = "Armature"
    standard_bone_names(arm)
    if arm.animation_data:
        arm.animation_data.action = None
    for action in list(bpy.data.actions):
        bpy.data.actions.remove(action)
    meshes = [o for o in bpy.data.objects if o.type == "MESH"]
    matte_materials(meshes)
    bpy.context.view_layer.update()
    PROPS[who](arm, meshes)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, f"char-{who}.glb")
    export(path, animations=False)
    print(f"Wrote {path}")
    if PREVIEW:
        preview(who, arm)


def build_anims():
    clear()
    keep = None
    for anim, source in ANIMS.items():
        arm = import_fbx(source)
        standard_bone_names(arm)
        action = arm.animation_data.action
        action.name = anim
        # Only the hips move the body; every other bone only turns, so one set of animations fits
        # every character's proportions.
        fcurves = action.fcurves if hasattr(action, "fcurves") else None
        if fcurves is None:
            fcurves = [fc for layer in action.layers for strip in layer.strips for bag in strip.channelbags for fc in bag.fcurves]
            remove = lambda fc: next(bag for layer in action.layers for strip in layer.strips for bag in strip.channelbags if fc in bag.fcurves[:]).fcurves.remove(fc)
        else:
            remove = lambda fc: action.fcurves.remove(fc)
        for fc in list(fcurves):
            if fc.data_path.endswith(".location") and '"mixamorig:Hips"' not in fc.data_path:
                remove(fc)
            elif fc.data_path.endswith(".scale"):
                remove(fc)
        action.use_fake_user = True
        if keep is None:
            keep = arm
            keep.name = "Armature"
        else:
            bpy.data.objects.remove(arm, do_unlink=True)
    # One armature carries every animation, each as its own action.
    keep.animation_data.action = None
    for action in bpy.data.actions:
        track = keep.animation_data.nla_tracks.new()
        track.name = action.name
        track.strips.new(action.name, int(action.frame_range[0]), action)
    for ob in list(bpy.data.objects):
        if ob is not keep:
            bpy.data.objects.remove(ob, do_unlink=True)
    os.makedirs(OUT, exist_ok=True)
    path = os.path.join(OUT, "char-anims.glb")
    bpy.ops.export_scene.gltf(
        filepath=path,
        export_format="GLB",
        export_yup=True,
        export_skins=True,
        export_animations=True,
        export_animation_mode="NLA_TRACKS",
        export_force_sampling=True,
        export_frame_step=1,
        export_def_bones=False,
        export_extras=False,
    )
    print(f"Wrote {path}: {[a.name for a in bpy.data.actions]}")


def preview(who, arm):
    """Front and side pictures with the walk applied, for checking the props sit right."""
    scene = bpy.context.scene
    scene.render.engine = "BLENDER_EEVEE"
    scene.render.resolution_x, scene.render.resolution_y = 520, 720
    world = bpy.data.worlds.new("preview")
    scene.world = world
    world.use_nodes = True
    world.node_tree.nodes["Background"].inputs[0].default_value = (0.3, 0.3, 0.33, 1)
    for pose in ("rest", "idle", "walk"):
        if pose != "rest":
            src = import_fbx("anim-" + pose)
            standard_bone_names(src)
            arm.animation_data_create()
            arm.animation_data.action = src.animation_data.action
            bpy.data.objects.remove(src, do_unlink=True)
            scene.frame_set(12)
        for view, yaw in (("front", 0), ("side", 90), ("back", 180)):
            cam = bpy.data.objects.new("cam", bpy.data.cameras.new("cam"))
            cam.data.lens = 60
            scene.collection.objects.link(cam)
            a = math.radians(yaw)
            cam.location = (4.5 * math.sin(a), -4.5 * math.cos(a), 1.0)
            cam.rotation_euler = (math.radians(90), 0, a)
            scene.camera = cam
            sun = bpy.data.objects.new("sun", bpy.data.lights.new("sun", "SUN"))
            sun.data.energy = 3.5
            sun.rotation_euler = (math.radians(50), 0, a + math.radians(30))
            scene.collection.objects.link(sun)
            scene.render.filepath = os.path.join(OUT, f"preview-{who}-{pose}-{view}.png")
            bpy.ops.render.render(write_still=True)
            bpy.data.objects.remove(cam)
            bpy.data.objects.remove(sun)


if WHO == "anims":
    build_anims()
else:
    build_character(WHO)
