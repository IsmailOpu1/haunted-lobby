# Builds one dressed room in Blender from a JSON description (tools/art/build-room.ts), bakes its
# practical lights into a lightmap, and exports a .glb plus the lightmap image.
#
# Run: blender --background --python tools/art/blender/build_room.py -- <room.json>
#
# Axes: the map has x east, z south and y up. Blender is z up, so a map point (x, y, z) is the
# Blender point (x, -z, y). The glTF exporter turns it back (glTF is y up), so the .glb is in
# world coordinates and the game places it as it is.
import bpy, bmesh, json, math, os, sys
import numpy as np
from mathutils import Matrix, Vector

job = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
H = job["wallHeight"]
T = job["wallThickness"]
Y0 = job["levelY"]
DOOR_H = job["doorHeight"]
SLAB = 0.05
# Everything on a wall sits this far off the wall's face, so it never flickers against the game's
# grey wall boxes (client/src/world.ts FACE_GAP_M).
FACE_GAP = 0.005
TEX = job["texturesDir"]


def B(x, z, y=0.0):
    return Vector((x, -z, y + Y0))


bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- materials
_mats = {}


def surface(name, tile_m):
    """A PBR material from assets-src/textures/<name>, tiling every tile_m metres (world-mapped UVs)."""
    key = (name, tile_m)
    if key in _mats:
        return _mats[key]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    folder = os.path.join(TEX, name)

    def img(kind, non_color):
        path = os.path.join(folder, f"{name}_{kind}_2k.jpg")
        if not os.path.exists(path):
            return None
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            n.image.colorspace_settings.name = "Non-Color"
        uv = nt.nodes.new("ShaderNodeUVMap")
        uv.uv_map = "UVMap"
        nt.links.new(uv.outputs["UV"], n.inputs["Vector"])
        return n

    d = img("diff", False)
    if d:
        nt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
    r = img("rough", True)
    if r:
        nt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    n = img("nor_gl", True)
    if n:
        nm = nt.nodes.new("ShaderNodeNormalMap")
        nt.links.new(n.outputs["Color"], nm.inputs["Color"])
        nt.links.new(nm.outputs["Normal"], bsdf.inputs["Normal"])
    m["tile_m"] = tile_m
    _mats[key] = m
    return m


def plain(name, rgb, rough=0.6, metal=0.0, emit=None):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if emit:
        b.inputs["Emission Color"].default_value = (*emit[0], 1)
        b.inputs["Emission Strength"].default_value = emit[1]
    _mats[name] = m
    return m


# ---------------------------------------------------------------- geometry helpers
statics = []  # every mesh that gets a place in the lightmap


def finish(name, bm, mat, tile_m=None):
    """Box-projects UVs in world space (tile_m metres per texture), so textures keep their size."""
    tile = tile_m or mat.get("tile_m", 1.0)
    uv = bm.loops.layers.uv.new("UVMap")
    bm.normal_update()
    for f in bm.faces:
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            u, v = {0: (c.y, c.z), 1: (c.x, c.z), 2: (c.x, c.y)}[ax]
            if (ax == 0 and n.x < 0) or (ax == 1 and n.y > 0):
                u = -u
            l[uv].uv = (u / tile, v / tile)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    scene.collection.objects.link(ob)
    statics.append(ob)
    return ob


def box(name, a, b, mat, tile_m=None):
    """An axis-aligned box between two corner points (Blender coordinates, any order)."""
    lo = Vector(map(min, a, b))
    hi = Vector(map(max, a, b))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((lo.x if v.co.x < 0 else hi.x, lo.y if v.co.y < 0 else hi.y, lo.z if v.co.z < 0 else hi.z))
    return finish(name, bm, mat, tile_m)


def quad(name, corners, mat, tile_m=None):
    bm = bmesh.new()
    bm.faces.new([bm.verts.new(c) for c in corners])
    return finish(name, bm, mat, tile_m)


def blackbody(k):
    """Approximate linear RGB of a black body at k kelvin (Tanner Helland's fit)."""
    t = k / 100
    r = 255 if t <= 66 else 329.698727446 * ((t - 60) ** -0.1332047592)
    g = 99.4708025861 * math.log(t) - 161.1195681661 if t <= 66 else 288.1221695283 * ((t - 60) ** -0.0755148492)
    b = 255 if t >= 66 else (0 if t <= 19 else 138.5177312231 * math.log(t - 10) - 305.0447927307)
    srgb = [max(0, min(255, c)) / 255 for c in (r, g, b)]
    return tuple(((c + 0.055) / 1.055) ** 2.4 if c > 0.04045 else c / 12.92 for c in srgb)


# ---------------------------------------------------------------- the room shell
d = job["dressing"]
floor_m = surface(d["floor"], 1.6)
ceil_m = surface(d["ceiling"], 2.0)
wall_m = surface(d["wall"], 1.4)
wains = d.get("wainscot")
wains_m = surface(wains["material"], 1.2) if wains else None
trim_m = surface(wains["material"], 0.6) if wains else plain("trim", (0.12, 0.07, 0.04), 0.5)

for i, p in enumerate(job["parts"]):
    quad(f"floor_{i}", [B(p["minX"], p["maxZ"]), B(p["maxX"], p["maxZ"]), B(p["maxX"], p["minZ"]), B(p["minX"], p["minZ"])], floor_m)
    if not job.get("outdoor"):
        top = H - SLAB
        quad(f"ceiling_{i}", [B(p["minX"], p["minZ"], top), B(p["maxX"], p["minZ"], top), B(p["maxX"], p["maxZ"], top), B(p["minX"], p["maxZ"], top)], ceil_m)

SKIRT_H, SKIRT_D = 0.16, 0.025
RAIL_H, RAIL_D = 0.06, 0.03
CROWN_H, CROWN_D = 0.14, 0.06
PANEL_D = 0.015


def along(f):
    """A wall face's two ends on the room side of the wall, and the unit vector into the room."""
    half = f["length"] / 2
    n = (0.0, float(f["facing"])) if f["axis"] == "x" else (float(f["facing"]), 0.0)
    if f["axis"] == "x":
        a, b = (f["x"] - half, f["z"]), (f["x"] + half, f["z"])
    else:
        a, b = (f["x"], f["z"] - half), (f["x"], f["z"] + half)
    off = T / 2 + FACE_GAP
    return (a[0] + n[0] * off, a[1] + n[1] * off), (b[0] + n[0] * off, b[1] + n[1] * off), n


def facing_quad(name, a, b, n, y0, y1, mat):
    corners = [B(a[0], a[1], y0), B(b[0], b[1], y0), B(b[0], b[1], y1), B(a[0], a[1], y1)]
    # Wind the quad so its front looks into the room.
    edge = corners[1] - corners[0]
    normal = edge.cross(Vector((0, 0, 1)))
    if normal.dot(Vector((n[0], -n[1], 0))) < 0:
        corners.reverse()
    return quad(name, corners, mat)


def strip(name, a, b, n, y0, y1, depth, mat):
    """A board along the wall, depth deep, from height y0 to y1."""
    return box(name, B(a[0], a[1], y0), B(b[0] + n[0] * depth, b[1] + n[1] * depth, y1), mat)


split = wains["heightM"] if wains else 0.0
for i, f in enumerate(job["faces"]):
    a, b, n = along(f)
    facing_quad(f"wall_{i}", a, b, n, split, H, wall_m)
    if wains:
        strip(f"panel_{i}", a, b, n, 0.0, split, PANEL_D, wains_m)
        strip(f"rail_{i}", a, b, n, split - RAIL_H / 2, split + RAIL_H / 2, RAIL_D, trim_m)
    strip(f"skirt_{i}", a, b, n, 0.0, SKIRT_H, SKIRT_D, trim_m)
    if not job.get("outdoor"):
        strip(f"crown_{i}", a, b, n, H - SLAB - CROWN_H, H - SLAB, CROWN_D, trim_m)

# Door frames (architraves) on the room side of every doorway, and the wall face above the door.
ARCH_W, ARCH_D = 0.1, 0.03
for i, door in enumerate(job["doors"]):
    half = door["width"] / 2
    n = door["into"]  # unit vector into this room
    off = T / 2 + FACE_GAP
    if door["axis"] == "x":
        a, b = (door["x"] - half, door["z"] + n[1] * off), (door["x"] + half, door["z"] + n[1] * off)
        side = (1.0, 0.0)
    else:
        a, b = (door["x"] + n[0] * off, door["z"] - half), (door["x"] + n[0] * off, door["z"] + half)
        side = (0.0, 1.0)
    out = (n[0] * ARCH_D, n[1] * ARCH_D)
    for j, (p, s) in enumerate([(a, -1), (b, 1)]):
        p2 = (p[0] + side[0] * s * ARCH_W + out[0], p[1] + side[1] * s * ARCH_W + out[1])
        box(f"arch_{i}_{j}", B(p[0], p[1], 0), B(p2[0], p2[1], DOOR_H + ARCH_W), trim_m)
    lo = (a[0] - side[0] * ARCH_W, a[1] - side[1] * ARCH_W)
    hi = (b[0] + side[0] * ARCH_W + out[0], b[1] + side[1] * ARCH_W + out[1])
    box(f"arch_{i}_head", B(lo[0], lo[1], DOOR_H), B(hi[0], hi[1], DOOR_H + ARCH_W), trim_m)
    facing_quad(f"over_{i}", a, b, n, DOOR_H, H, wall_m)

for i, rug in enumerate(d.get("rugs", [])):
    o = box(f"rug_{i}", Vector((-rug["sizeX"] / 2, -rug["sizeZ"] / 2, 0)), Vector((rug["sizeX"] / 2, rug["sizeZ"] / 2, 0.012)), surface(rug["material"], 1.0))
    o.location = B(rug["x"], rug["z"], 0)
    o.rotation_euler.z = math.radians(rug.get("turn", 0))

# ---------------------------------------------------------------- hiding spots
# Wardrobes and cupboards are built here to the hiding spot's exact size: a plinth, a carcass, a
# cornice, two panelled doors and brass handles. Local frame: u across the front, v out of the front.
wood_m = surface(wains["material"], 0.9) if wains else plain("wardrobe_wood", (0.10, 0.06, 0.035), 0.55)
brass_m = plain("brass", (0.62, 0.45, 0.2), 0.35, 1.0)
PLINTH_H, CORNICE_H, CORNICE_OUT = 0.09, 0.09, 0.03
DOOR_PROUD, DOOR_GAP, PANEL_PROUD, PANEL_INSET = 0.018, 0.006, 0.01, 0.075
HANDLE = (0.018, 0.03, 0.16)  # across, out, tall


def spot_box(name, sp, u0, u1, v0, v1, y0, y1, mat):
    fx, fz = sp["front"]
    sx_, sz_ = fz, -fx  # across the front
    pts = [(sp["x"] + sx_ * u + fx * v, sp["z"] + sz_ * u + fz * v) for u in (u0, u1) for v in (v0, v1)]
    xs = [p[0] for p in pts]; zs = [p[1] for p in pts]
    return box(name, B(min(xs), min(zs), y0), B(max(xs), max(zs), y1), mat)


for i, sp in enumerate(job.get("hidingSpots", [])):
    across_x = sp["front"][1] != 0
    w = sp["sizeX"] if across_x else sp["sizeZ"]
    dpt = (sp["sizeZ"] if across_x else sp["sizeX"]) - DOOR_PROUD
    h = sp["heightM"]
    hw, back, face = w / 2, -dpt / 2 - DOOR_PROUD / 2, dpt / 2 - DOOR_PROUD / 2
    n = f"hide_{i}_{sp['id']}"
    spot_box(f"{n}_plinth", sp, -hw + 0.02, hw - 0.02, back, face - 0.02, 0.0, PLINTH_H, wood_m)
    spot_box(f"{n}_body", sp, -hw, hw, back, face, PLINTH_H, h - CORNICE_H, wood_m)
    spot_box(f"{n}_cornice", sp, -hw - CORNICE_OUT, hw + CORNICE_OUT, back, face + DOOR_PROUD + CORNICE_OUT, h - CORNICE_H, h, wood_m)
    y0, y1 = PLINTH_H + 0.02, h - CORNICE_H - 0.02
    split = y0 + (y1 - y0) * 0.62
    for side in (-1, 1):
        a, b = sorted((side * DOOR_GAP / 2, side * (hw - 0.02)))
        spot_box(f"{n}_door{side}", sp, a, b, face, face + DOOR_PROUD, y0, y1, wood_m)
        for k, (p0, p1) in enumerate(((y0 + PANEL_INSET, split - PANEL_INSET / 2), (split + PANEL_INSET / 2, y1 - PANEL_INSET))):
            spot_box(f"{n}_panel{side}_{k}", sp, a + PANEL_INSET, b - PANEL_INSET, face + DOOR_PROUD, face + DOOR_PROUD + PANEL_PROUD, p0, p1, wood_m)
        hu = side * (DOOR_GAP / 2 + 0.045)
        spot_box(f"{n}_handle{side}", sp, hu - HANDLE[0] / 2, hu + HANDLE[0] / 2, face + DOOR_PROUD, face + DOOR_PROUD + HANDLE[1], 1.0 - HANDLE[2] / 2, 1.0 + HANDLE[2] / 2, brass_m)

# ---------------------------------------------------------------- built furniture
RUNNER_T = 0.004  # maps/marrow-hotel/dressing.ts RUNNER_M
linen_m = plain("linen", (0.62, 0.58, 0.5), 0.92)


def lathe(name, profile, at, mat, segments=24):
    """A turned part: profile is (radius, height) points from the bottom up, spun around the vertical."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, h)) for r, h in profile]
    edges = [bm.edges.new((verts[k], verts[k + 1])) for k in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segments, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for v in bm.verts:
        v.co += at
    return finish(name, bm, mat)


def bevelled(ob, width, segments=3):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def banquet_table(i, t):
    """A Victorian banquet table: moulded top, aprons, six turned legs, a linen runner. Built at the
    origin along x, then turned and moved into place as one group."""
    L, W, H = t["lengthM"], t["widthM"], t["heightM"]
    mat = surface(t["material"], 1.0)
    top_t, apron_h, apron_t, block = 0.045, 0.12, 0.025, 0.085
    parts = []
    parts.append(bevelled(box(f"bt{i}_top", Vector((-L / 2, -W / 2, H - top_t)), Vector((L / 2, W / 2, H)), mat), 0.012))
    lip = 0.02  # a thinner moulding under the top, set in a little
    parts.append(bevelled(box(f"bt{i}_lip", Vector((-L / 2 + lip, -W / 2 + lip, H - top_t - 0.02)), Vector((L / 2 - lip, W / 2 - lip, H - top_t)), mat), 0.006))
    inset = 0.09
    ax, az = L / 2 - inset, W / 2 - inset
    y0, y1 = H - top_t - 0.02 - apron_h, H - top_t - 0.02
    for k, (a, b) in enumerate([((-ax, az - apron_t), (ax, az)), ((-ax, -az), (ax, -az + apron_t)), ((-ax, -az), (-ax + apron_t, az)), ((ax - apron_t, -az), (ax, az))]):
        parts.append(box(f"bt{i}_apron{k}", Vector((a[0], a[1], y0)), Vector((b[0], b[1], y1)), mat))
    leg_top = y1
    turned = y0 - 0.01
    # Radius and height pairs for the turned part, bottom up: a bun foot, a long taper, a vase, rings.
    prof = [(0.0, 0.0), (0.038, 0.0), (0.046, 0.03), (0.04, 0.06), (0.03, 0.08), (0.032, 0.1), (0.026, 0.14),
            (0.028, 0.3), (0.036, 0.38), (0.044, 0.45), (0.04, 0.5), (0.03, 0.54), (0.036, 0.57), (0.036, 0.6),
            (0.03, 0.62), (0.034, 0.64), (0.0, 0.64)]
    scale = turned / prof[-1][1]
    prof = [(r, h * scale) for r, h in prof]
    legs = [(-ax + block / 2, -az + block / 2), (ax - block / 2, -az + block / 2), (-ax + block / 2, az - block / 2), (ax - block / 2, az - block / 2), (0, -az + block / 2), (0, az - block / 2)]
    for k, (lx, ly) in enumerate(legs):
        parts.append(lathe(f"bt{i}_leg{k}", prof, Vector((lx, ly, 0)), mat))
        parts.append(box(f"bt{i}_block{k}", Vector((lx - block / 2, ly - block / 2, turned)), Vector((lx + block / 2, ly + block / 2, leg_top)), mat))
    # The runner: down the middle, hanging a little over each end.
    rw, drop = 0.42, 0.22
    parts.append(box(f"bt{i}_runner", Vector((-L / 2 - 0.003, -rw / 2, H)), Vector((L / 2 + 0.003, rw / 2, H + RUNNER_T)), linen_m))
    for k, sx in enumerate((-1, 1)):
        x0 = sx * (L / 2 + 0.003)
        parts.append(box(f"bt{i}_runner_end{k}", Vector((x0, -rw / 2, H + RUNNER_T - drop)), Vector((x0 + sx * RUNNER_T, rw / 2, H + RUNNER_T)), linen_m))
    pivot = bpy.data.objects.new(f"build_{i}_banquetTable", None)
    scene.collection.objects.link(pivot)
    for o in parts:
        o.parent = pivot
    pivot.rotation_euler.z = math.radians(t.get("turn", 0))
    pivot.location = B(t["x"], t["z"], 0.0)
    if t.get("draws"):
        pivot["draws"] = t["draws"]


# The grandfather clock (Poly Haven vintage_grandfather_clock_01), in the model's own axes: front
# toward -y, centre at x = y = 0. Its trunk door's panel is at y = -0.1302 between x = +-0.13 and
# heights 0.55 to 1.35 (measured). The window is cut inside that panel; the game's pendulum swings
# behind it (client/src/stations.ts DRESSED_CLOCK, which must match these numbers).
GLASS_ALPHA = 0.06  # how much of the light the clock glass keeps (the rest shows the dial and pendulum)
CLOCK_MIN_ROUGHNESS = 0.6  # satin, not mirror: see grandfather_clock
CLOCK_WINDOW_X = 0.105
CLOCK_WINDOW_Z = (0.66, 1.27)
CLOCK_DOOR_Y = -0.1302
CLOCK_CAVITY_BACK_Y = 0.08
CLOCK_FRAME_W = 0.014


def grandfather_clock(i, t):
    folder = os.path.join(job["modelsDir"], t["model"])
    gltf = next(f for f in os.listdir(folder) if f.endswith(".gltf"))
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, gltf))
    new = [o for o in scene.objects if o not in before]
    # The hands move, so the game draws them.
    for o in [o for o in new if o.name.endswith("Hand")]:
        new.remove(o)
        bpy.data.objects.remove(o, do_unlink=True)
    body = next(o for o in new if o.type == "MESH")
    # Clear glass for the hood and the window. The model's glass is metallic in its texture, so it
    # mirrored the torch (which sits at the player's eye) straight back as a white glare.
    glass_i = next(k for k, m in enumerate(body.data.materials) if m.name.endswith("_glass"))
    glass_m = plain("clock_glass", (0.9, 0.92, 0.9), 0.08)
    glass_m.node_tree.nodes["Principled BSDF"].inputs["Alpha"].default_value = GLASS_ALPHA
    glass_m.surface_render_method = "BLENDED"
    body.data.materials[glass_i] = glass_m
    # The dial and brass are polished metal in the model's texture: they mirrored the torch back as
    # a white glare from across the room. Satin them: no roughness under CLOCK_MIN_ROUGHNESS.
    for m in body.data.materials:
        if m is glass_m or not m.use_nodes or "Principled BSDF" not in m.node_tree.nodes:
            continue
        rough_in = m.node_tree.nodes["Principled BSDF"].inputs["Roughness"]
        link = next((l for l in m.node_tree.links if l.to_socket == rough_in), None)
        if link is None:
            rough_in.default_value = max(rough_in.default_value, CLOCK_MIN_ROUGHNESS)
            continue
        src, channel = link.from_node, 0
        if src.type in ("SEPARATE_COLOR", "SEPRGB"):  # glTF packs roughness in green
            channel = {"Red": 0, "R": 0, "Green": 1, "G": 1, "Blue": 2, "B": 2}[link.from_socket.name]
            src = src.inputs[0].links[0].from_node
        px = np.array(src.image.pixels[:], dtype=np.float32).reshape(-1, 4)
        px[:, channel] = np.maximum(px[:, channel], CLOCK_MIN_ROUGHNESS)
        satin = src.image.copy()
        satin.name = src.image.name + "_satin"
        satin.pixels[:] = px.ravel()
        satin.pack()
        src.image = satin
        print(f"  clock: roughness floored at {CLOCK_MIN_ROUGHNESS} in {satin.name}")
    inside_m = plain("clock_inside", (0.035, 0.024, 0.016), 0.85)
    # The window: a box cut through the door into the trunk, lined with the dark inside.
    x0, x1 = -CLOCK_WINDOW_X, CLOCK_WINDOW_X
    z0, z1 = CLOCK_WINDOW_Z
    cutter = box(f"clock{i}_cutter", Vector((x0, -0.4, z0)), Vector((x1, CLOCK_CAVITY_BACK_Y, z1)), inside_m)
    mod = body.modifiers.new("window", "BOOLEAN")
    mod.operation = "DIFFERENCE"
    mod.solver = "EXACT"
    mod.material_mode = "TRANSFER"  # the cut faces take the dark inside
    mod.object = cutter
    bpy.context.view_layer.objects.active = body
    bpy.ops.object.modifier_apply(modifier=mod.name)
    statics.remove(cutter)
    bpy.data.objects.remove(cutter, do_unlink=True)
    parts = [body]
    # Glass just inside the door, and a thin moulded frame around the opening.
    pane = quad(f"clock{i}_window_glass", [Vector((x0, CLOCK_DOOR_Y + 0.004, z0)), Vector((x1, CLOCK_DOOR_Y + 0.004, z0)),
                                           Vector((x1, CLOCK_DOOR_Y + 0.004, z1)), Vector((x0, CLOCK_DOOR_Y + 0.004, z1))], glass_m)
    parts.append(pane)
    frame_m = surface("dark_wood", 0.5)
    w, fy0, fy1 = CLOCK_FRAME_W, CLOCK_DOOR_Y - 0.006, CLOCK_DOOR_Y + 0.001
    for k, (a, b) in enumerate([((x0 - w, z0 - w), (x1 + w, z0)), ((x0 - w, z1), (x1 + w, z1 + w)), ((x0 - w, z0), (x0, z1)), ((x1, z0), (x1 + w, z1))]):
        parts.append(bevelled(box(f"clock{i}_frame{k}", Vector((a[0], fy0, a[1])), Vector((b[0], fy1, b[1])), frame_m), 0.002))
    want_size([body], 2.2)
    pivot = bpy.data.objects.new(f"build_{i}_grandfatherClock", None)
    scene.collection.objects.link(pivot)
    for o in parts:
        o.parent = pivot
    pivot.rotation_euler.z = math.radians(t.get("turn", 0))
    pivot.location = B(t["x"], t["z"], 0.0)
    if t.get("draws"):
        pivot["draws"] = t["draws"]
    statics.append(body)  # the glass and frame are in already (box, quad)



# ---------------------------------------------------------------- props
MAX_PROP_TRIS = 20000
# Each prop's textures are sized to the prop (about 10 pixels per centimetre of its longest side,
# like most first-person games): a 20 cm candlestick never shows more than 512 pixels on screen,
# so a 2K texture there only costs memory and download. Never bigger than the source.
TEXELS_PER_M = 1024
MIN_TEX, MAX_TEX = 512, 2048
tex_size = {}


def want_size(meshes, size_m):
    want = 2 ** math.ceil(math.log2(max(1.0, TEXELS_PER_M * size_m)))
    want = max(MIN_TEX, min(MAX_TEX, want))
    for o in meshes:
        for slot in o.material_slots:
            m = slot.material
            if not (m and m.node_tree):
                continue
            for n in m.node_tree.nodes:
                if n.type == "TEX_IMAGE" and n.image:
                    tex_size[n.image] = max(tex_size.get(n.image, 0), want)


def meeting_bell(i, t):
    """The meeting bell (GDD 16): a brass hotel service bell on a turned mahogany pedestal."""
    wood = surface(t.get("material", "dark_wood"), 0.6)
    # Old, slightly dulled brass: polished brass mirrored the torch back as a white glare.
    brass = plain("bell_brass", (0.62, 0.45, 0.2), 0.6, 1.0)
    top = t.get("heightM", 0.95)
    parts = []
    # Pedestal, bottom up: a stepped round foot, a long tapering column with rings, a dished top.
    foot = [(0.0, 0.0), (0.2, 0.0), (0.2, 0.018), (0.19, 0.03), (0.165, 0.042), (0.15, 0.06), (0.12, 0.07),
            (0.07, 0.085), (0.062, 0.1)]
    column = [(0.07, 0.11), (0.07, 0.125), (0.055, 0.14), (0.05, 0.3), (0.045, 0.6), (0.042, top - 0.16),
              (0.055, top - 0.145), (0.055, top - 0.13), (0.045, top - 0.115), (0.06, top - 0.08)]
    plate = [(0.1, top - 0.05), (0.125, top - 0.035), (0.13, top - 0.02), (0.13, top), (0.0, top)]
    parts.append(lathe(f"bell{i}_stand", foot + column + plate, Vector((0, 0, 0)), wood, segments=40))
    # The service bell: a heavy round base, a dome on a short post, a plunger with a knob.
    base = [(0.0, top), (0.068, top), (0.07, top + 0.004), (0.068, top + 0.012), (0.06, top + 0.016), (0.0, top + 0.016)]
    parts.append(lathe(f"bell{i}_base", base, Vector((0, 0, 0)), brass, segments=40))
    parts.append(lathe(f"bell{i}_post", [(0.0, top + 0.016), (0.008, top + 0.016), (0.006, top + 0.024), (0.0, top + 0.024)], Vector((0, 0, 0)), brass, segments=16))
    d0 = top + 0.022  # the dome's rim, a little above the base
    dome = [(0.058, d0), (0.0595, d0 + 0.003)] + [
        (0.058 * math.cos(a), d0 + 0.004 + 0.046 * math.sin(a)) for a in [k * math.pi / 2 / 10 for k in range(1, 11)]
    ]
    dome += [(0.0, d0 + 0.05)]
    # Its inside (the same curve a little smaller), so the rim has thickness.
    inner = [(0.053 * math.cos(a), d0 + 0.042 * math.sin(a)) for a in [k * math.pi / 2 / 10 for k in range(10, -1, -1)]]
    parts.append(lathe(f"bell{i}_dome", [(0.0, d0 + 0.042)] + inner[1:] + dome, Vector((0, 0, 0)), brass, segments=48))
    parts.append(lathe(f"bell{i}_plunger", [(0.0, d0 + 0.05), (0.0035, d0 + 0.05), (0.0035, d0 + 0.066), (0.0, d0 + 0.066)], Vector((0, 0, 0)), brass, segments=12))
    knob = [(0.0, d0 + 0.064)] + [(0.008 * math.sin(a), d0 + 0.072 - 0.008 * math.cos(a)) for a in [k * math.pi / 8 for k in range(1, 8)]] + [(0.0, d0 + 0.08)]
    parts.append(lathe(f"bell{i}_knob", knob, Vector((0, 0, 0)), brass, segments=16))
    pivot = bpy.data.objects.new(f"build_{i}_meetingBell", None)
    scene.collection.objects.link(pivot)
    for o in parts:
        o.parent = pivot
    pivot.rotation_euler.z = math.radians(t.get("turn", 0))
    pivot.location = B(t["x"], t["z"], 0.0)
    if t.get("draws"):
        pivot["draws"] = t["draws"]


# ---------------------------------------------------------------- stairwells
# Each flight that opens into the room: dark wood treads and risers under a carpet runner held by
# brass stair rods, a sloped string board, panelling and a dado rail up both walls, a handrail on
# brass brackets, wallpaper, a crown and a plaster ceiling. The game keeps its grey steps and walls
# behind these as the solid core (client/src/world.ts buildStairs), so the steps here sit exactly
# where the game's steps are: the same count and rise.
STEP_RISE = 0.2  # client/src/world.ts STEP_RISE_M
TREAD_T, NOSE, RISER_T = 0.035, 0.03, 0.02
RUNNER_W, CARPET_T = 1.3, 0.008
ROD_R = 0.007
STRING_BELOW, STRING_ABOVE, STRING_D = 0.06, 0.08, 0.03
DADO_UP = 0.9  # dado rail height above the line of the step nosings
HANDRAIL_UP, HANDRAIL_OUT, HANDRAIL_W, HANDRAIL_H = 0.86, 0.07, 0.055, 0.06
HEADER_H = 0.14
PILASTER_OUT = 0.025


def rod(name, a, b, r, mat, segments=12):
    """A round bar from a to b (Blender coordinates)."""
    bm = bmesh.new()
    dv = b - a
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=dv.length)
    turn = Vector((0, 0, 1)).rotation_difference(dv.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ turn, verts=bm.verts)
    return finish(name, bm, mat)


def join_by_material(objs, name):
    """Few draw calls: one mesh per material."""
    groups = {}
    for o in objs:
        groups.setdefault(o.data.materials[0].name, []).append(o)
    for mat_name, group in groups.items():
        for o in list(bpy.context.selected_objects):
            o.select_set(False)
        for o in group:
            o.select_set(True)
            statics.remove(o)
        bpy.context.view_layer.objects.active = group[0]
        bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = f"{name}_{mat_name}"
        statics.append(joined)


def stairwell(i, s):
    ux, uz = s["ux"], s["uz"]
    sx_, sz_ = -uz, ux  # across the flight (shared/src/levels.ts stairWalls)
    W, L, R = s["widthM"], s["lengthM"], s["rise"]
    base = s["y"] - Y0
    count = max(1, round(R / STEP_RISE))
    run, rise = L / count, R / count
    inner = W / 2 - T / 2  # the side walls' faces
    first = len(statics)

    def P(u, v, y):
        return B(s["x"] + sx_ * u + ux * v, s["z"] + sz_ * u + uz * v, base + y)

    def lbox(name, u0, u1, v0, v1, y0, y1, mat):
        return box(name, P(u0, v0, y0), P(u1, v1, y1), mat)

    def wall_prism(name, uw, dn, depth, pts, mat):
        """A board on a side wall (plane u = uw), depth deep toward dn, outline (v, y) points."""
        bm = bmesh.new()
        vs = [bm.verts.new(P(uw + dn * t, v, y)) for t in (0.0, depth) for v, y in pts]
        bmesh.ops.convex_hull(bm, input=vs)
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        return finish(name, bm, mat)

    def sheet(name, corners, toward, mat):
        """A flat face through the corners, its front toward the point `toward`."""
        c = [Vector(p) for p in corners]
        nrm = (c[1] - c[0]).cross(c[2] - c[0])
        if nrm.dot(toward - c[0]) < 0:
            c.reverse()
        return quad(name, c, mat)

    def nosing(v):
        return R * v / L + rise

    tread_m = surface("dark_wood", 1.0)
    carpet_m = surface(d["rugs"][0]["material"] if d.get("rugs") else "dirty_carpet", 1.0)
    n = f"stair_{i}"

    # Steps: tread k is the top of the game's step k, at height rise * (k + 1), from v = k * run.
    hw = RUNNER_W / 2
    for k in range(count):
        v0, v1, top, below = k * run, (k + 1) * run, rise * (k + 1), rise * k
        lbox(f"{n}_tread{k}", -inner, inner, v0 - NOSE, v1, top - TREAD_T, top, tread_m)
        lbox(f"{n}_riser{k}", -inner, inner, v0, v0 + RISER_T, below, top - TREAD_T, tread_m)
        lbox(f"{n}_runT{k}", -hw, hw, v0 - NOSE - CARPET_T, v1, top, top + CARPET_T, carpet_m)
        lbox(f"{n}_runN{k}", -hw, hw, v0 - NOSE - CARPET_T, v0 - NOSE, top - TREAD_T, top, carpet_m)
        lbox(f"{n}_runR{k}", -hw, hw, v0 - CARPET_T, v0, below + (CARPET_T if k else 0.0), top - TREAD_T, carpet_m)
        if k:  # a rod in the corner where the runner turns from tread to riser
            ry = below + CARPET_T + ROD_R
            rv = v0 - CARPET_T - ROD_R
            rod(f"{n}_rod{k}", P(-hw - 0.04, rv, ry), P(hw + 0.04, rv, ry), ROD_R, brass_m)

    ceiling = R + H - SLAB
    for side in (-1, 1):
        uw = side * (inner - FACE_GAP)
        dn = -side
        sn = f"{n}_{'l' if side < 0 else 'r'}"
        wall_prism(f"{sn}_string", uw, dn, STRING_D, [(0, 0), (L, R - STRING_BELOW), (L, nosing(L) + STRING_ABOVE), (0, nosing(0) + STRING_ABOVE)], trim_m)
        if wains_m:
            wall_prism(f"{sn}_panel", uw, dn, PANEL_D, [(0, nosing(0) + STRING_ABOVE), (L, nosing(L) + STRING_ABOVE), (L, nosing(L) + DADO_UP), (0, nosing(0) + DADO_UP)], wains_m)
            wall_prism(f"{sn}_dado", uw, dn, RAIL_D, [(0, nosing(0) + DADO_UP - RAIL_H / 2), (L, nosing(L) + DADO_UP - RAIL_H / 2), (L, nosing(L) + DADO_UP + RAIL_H / 2), (0, nosing(0) + DADO_UP + RAIL_H / 2)], trim_m)
        sheet(f"{sn}_paper", [P(uw, 0, nosing(0) + DADO_UP), P(uw, L, nosing(L) + DADO_UP), P(uw, L, ceiling), P(uw, 0, ceiling)], P(uw + dn, L / 2, ceiling / 2), wall_m)
        lbox(f"{sn}_crown", uw, uw + dn * CROWN_D, 0, L, ceiling - CROWN_H, ceiling, trim_m)
        # A handrail on brass brackets, clear of the dado rail.
        ends = (0.3, L - 0.3)
        hu = uw + dn * HANDRAIL_OUT
        wall_prism(f"{sn}_handrail", hu, dn, HANDRAIL_W, [(ends[0], nosing(ends[0]) + HANDRAIL_UP), (ends[1], nosing(ends[1]) + HANDRAIL_UP), (ends[1], nosing(ends[1]) + HANDRAIL_UP + HANDRAIL_H), (ends[0], nosing(ends[0]) + HANDRAIL_UP + HANDRAIL_H)], trim_m)
        for j, bv in enumerate((ends[0] + 0.25, L / 2, ends[1] - 0.25)):
            by = nosing(bv) + HANDRAIL_UP
            lbox(f"{sn}_bracket{j}", uw, hu + dn * HANDRAIL_W / 2, bv - 0.015, bv + 0.015, by - 0.05, by + 0.005, brass_m)
            lbox(f"{sn}_rose{j}", uw, uw + dn * 0.012, bv - 0.035, bv + 0.035, by - 0.08, by - 0.01, brass_m)

    # A plaster ceiling over the flight, and the wall over its bottom end (the floor above's wall).
    sheet(f"{n}_ceiling", [P(-inner, 0, ceiling), P(inner, 0, ceiling), P(inner, L, ceiling), P(-inner, L, ceiling)], P(0, L / 2, 0), ceil_m)
    lv = T / 2 + FACE_GAP
    sheet(f"{n}_over", [P(-inner, lv, R), P(inner, lv, R), P(inner, lv, ceiling), P(-inner, lv, ceiling)], P(0, L / 2, R + 1), wall_m)
    lbox(f"{n}_header", -inner, inner, -T / 2 - 0.02, T / 2 + 0.02, R - HEADER_H, R, trim_m)
    lbox(f"{n}_overcrown", -inner, inner, lv, lv + CROWN_D, ceiling - CROWN_H, ceiling, trim_m)

    # Where the flight opens into the room, a pilaster covers each side wall's end, floor to ceiling.
    e = -1 if s["open"] == 0 else 1
    floor_y = 0.0 if s["open"] == 0 else R
    for side in (-1, 1):
        lbox(f"{n}_pilaster{side}", side * (inner - PILASTER_OUT), side * (W / 2 + T / 2 + PILASTER_OUT), s["open"], s["open"] + e * PILASTER_OUT, floor_y, floor_y + H - SLAB, trim_m)

    join_by_material(statics[first:], n)


for i, s in enumerate(job.get("stairs", [])):
    stairwell(i, s)


BUILDERS = {"banquetTable": banquet_table, "grandfatherClock": grandfather_clock, "meetingBell": meeting_bell}
for i, t in enumerate(d.get("builds", [])):
    BUILDERS[t["kind"]](i, t)

for i, prop in enumerate(d["props"]):
    folder = os.path.join(job["modelsDir"], prop["model"])
    gltf = next(f for f in os.listdir(folder) if f.endswith(".gltf"))
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, gltf))
    new = [o for o in scene.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    meshes = [o for o in new if o.type == "MESH"]
    # Scanned models can be far too detailed for a game: simplify anything over the budget.
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    if tris > MAX_PROP_TRIS:
        for o in meshes:
            mod = o.modifiers.new("decimate", "DECIMATE")
            mod.ratio = MAX_PROP_TRIS / tris
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
        print(f"  {prop['model']}: {tris} -> about {MAX_PROP_TRIS} triangles")
    bpy.context.view_layer.update()
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9))
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
    # Centre the footprint on the pivot, base on the floor.
    centre = Vector(((lo.x + hi.x) / 2, (lo.y + hi.y) / 2, lo.z))
    pivot = bpy.data.objects.new(f"prop_{i}_{prop['model']}", None)
    scene.collection.objects.link(pivot)
    for r in roots:
        r.location -= centre
        r.parent = pivot
    s = prop.get("scale", 1.0)
    want_size(meshes, max(hi.x - lo.x, hi.y - lo.y, hi.z - lo.z) * s)
    pivot.scale = (s, s, s)
    pivot.rotation_euler.z = math.radians(prop.get("turn", 0))
    pivot.location = B(prop["x"], prop["z"], prop.get("y", 0.0))
    if prop.get("draws"):
        pivot["draws"] = prop["draws"]
    statics.extend(meshes)

for img, want in tex_size.items():
    w, h = img.size
    if w > want:
        img.scale(want, max(1, round(h * want / w)))
        print(f"  {img.name}: {w} -> {want} px")

# ---------------------------------------------------------------- lights
for i, l in enumerate(d["lights"]):
    data = bpy.data.lights.new(f"lamp_{i}", "POINT")
    data.energy = l["watts"]
    data.shadow_soft_size = l["radius"]
    data.color = blackbody(l["kelvin"])
    ob = bpy.data.objects.new(f"lamp_{i}", data)
    ob.location = B(l["x"], l["z"], l["y"])
    scene.collection.objects.link(ob)
    # A small glowing bulb the game can see (for bloom) and dim during Blackout.
    bpy.ops.mesh.primitive_uv_sphere_add(radius=min(0.035, l["radius"]), segments=12, ring_count=8, location=ob.location)
    bulb = bpy.context.active_object
    bulb.name = f"bulb_{i}"
    bulb.visible_shadow = False
    bulb.data.materials.append(plain(f"bulb_{l['kelvin']}", blackbody(l["kelvin"]), emit=(blackbody(l["kelvin"]), 6.0)))

# ---------------------------------------------------------------- bake
bpy.context.view_layer.update()
for o in list(bpy.context.selected_objects):
    o.select_set(False)
for o in statics:
    if o.data.users > 1:
        o.data = o.data.copy()  # each copy needs its own place in the lightmap
    if "lightmap" not in o.data.uv_layers:
        o.data.uv_layers.new(name="lightmap")
    o.data.uv_layers.active = o.data.uv_layers["lightmap"]
    o.select_set(True)
bpy.context.view_layer.objects.active = statics[0]
bpy.ops.object.mode_set(mode="EDIT")
bpy.ops.mesh.select_all(action="SELECT")
bpy.ops.uv.smart_project(angle_limit=math.radians(66), island_margin=0.003, scale_to_bounds=False)
bpy.ops.uv.pack_islands(margin=0.002, rotate=True)
bpy.ops.object.mode_set(mode="OBJECT")

SIZE = job["lightmapPx"]
lm = bpy.data.images.new("lightmap", SIZE, SIZE, float_buffer=True)
for o in statics:
    for slot in o.material_slots:
        m = slot.material
        if m is None or m.get("_lm"):
            continue
        n = m.node_tree.nodes.new("ShaderNodeTexImage")
        n.name = "LM_TARGET"
        n.image = lm
        m.node_tree.nodes.active = n
        m["_lm"] = 1

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
    # Never fall back to the CPU: a bake there is slow and pins every core (owner, 2026-11-10).
    raise SystemExit("No NVIDIA GPU found for baking (OptiX or CUDA). Stopping instead of using the CPU.")
scene.cycles.samples = job["samples"]
scene.world = bpy.data.worlds.new("night")
scene.world.use_nodes = True
scene.world.node_tree.nodes["Background"].inputs["Strength"].default_value = 0.0
bpy.ops.object.bake(type="DIFFUSE", pass_filter={"DIRECT", "INDIRECT"}, margin=6, use_clear=True)

# Store as 8-bit sRGB, scaled so the brightest useful value fits; the game multiplies back.
px = np.array(lm.pixels[:], dtype=np.float32).reshape(-1, 4)
print("LIGHTMAP max", float(px[:, :3].max()), "p99", float(np.percentile(px[:, :3], 99)))
lin = np.clip(px[:, :3] / job["lightmapScale"], 0, 1)
# A byte image's pixels are already sRGB-encoded values, so encode here (more precision in the darks).
px[:, :3] = np.where(lin <= 0.0031308, lin * 12.92, 1.055 * np.power(lin, 1 / 2.4) - 0.055)
px[:, 3] = 1
out = bpy.data.images.new("lightmap_out", SIZE, SIZE, float_buffer=False)
out.colorspace_settings.name = "sRGB"
out.pixels[:] = px.ravel()
out.filepath_raw = job["lightmapOut"]
out.file_format = "PNG"
out.save()

# Drop the bake-only nodes, then export (lights stay out of the file; bulbs stay in).
for m in bpy.data.materials:
    n = m.node_tree.nodes.get("LM_TARGET") if m.node_tree else None
    if n:
        m.node_tree.nodes.remove(n)
for o in [o for o in scene.objects if o.type == "LIGHT"]:
    bpy.data.objects.remove(o)
bpy.ops.export_scene.gltf(filepath=job["glbOut"], export_format="GLB", export_texcoords=True, export_normals=True, export_extras=True, export_yup=True)
print("DONE", job["glbOut"])
