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


# The garden courtyard's plain materials, shared by its shell and its builds.
def _stone():
    return plain("weathered_stone", (0.12, 0.115, 0.1), 0.92)


def _iron():
    # Painted cast iron, dark but not black and not shiny: it reads under the torch without glare.
    return plain("cast_iron", (0.035, 0.037, 0.04), 0.72)


def _soil():
    return plain("garden_soil", (0.045, 0.032, 0.022), 0.95)


def bevelled(ob, width, segments=3):
    mod = ob.modifiers.new("bevel", "BEVEL")
    mod.width = width
    mod.segments = segments
    mod.limit_method = "ANGLE"
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


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


def rod(name, a, b, r, mat, segments=12):
    """A round bar from a to b (Blender coordinates)."""
    bm = bmesh.new()
    dv = b - a
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=dv.length)
    turn = Vector((0, 0, 1)).rotation_difference(dv.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ turn, verts=bm.verts)
    return finish(name, bm, mat)


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
# Textures that show separate tiles keep the tiles' real size (Poly Haven's dimensions).
# Floor Tiles 06 holds 8 squares a side: at 1.6 m each square is 20 cm, a period checkerboard.
# Diagonal Parquet is 2.36 m across. Damask Gold (tint-texture.ts grid=3x2 of Floral Jacquard) is
# 0.76 m of the cloth: printed three times that size, as a wallpaper's repeat, so it reads across a room.
# Rectangular Paving is 2 m of 20 by 40 cm slabs: printed at 3 m so they read as flagstones.
# The courtyard's scans at their own sizes: Castle Brick 02 is 1.5 m, Grass Ground 2.51 m, Dry Decay Leaves 2 m.
TILE_M = {"floor_tiles_06": 1.6, "terracotta_floor_tiles": 2.08, "long_white_tiles_laid": 1.27, "diagonal_parquet": 2.36, "damask_gold": 2.28,
          "rectangular_paving": 3.0, "castle_brick_02_red": 1.5, "grass_ground": 2.51, "dry_decay_leaves": 2.0}
floor_m = surface(d["floor"], TILE_M.get(d["floor"], 1.6))
ceil_m = surface(d["ceiling"], 2.0)
wall_m = surface(d["wall"], TILE_M.get(d["wall"], 1.4))
wains = d.get("wainscot")
wains_m = surface(wains["material"], TILE_M.get(wains["material"], 1.2)) if wains else None
# A tiled dado still has wooden rails, skirting and frames: the trim's own wood if it names one.
trim_name = (wains.get("trim") or wains["material"]) if wains else None
trim_m = surface(trim_name, 0.6) if wains else plain("trim", (0.12, 0.07, 0.04), 0.5)

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
# An open courtyard's walls are the hotel's outside: brick on up past the floor above to the eaves,
# a stone plinth, a stone band at the upper floor and a cornice, and the upper floor's windows.
facade = d.get("facade")
WALL_TOP = facade["heightM"] if facade else H


def facade_windows(i, a, b, n):
    """Sash windows of the upper floor along one face: dark glass, painted frames and glazing
    bars, a stone sill and lintel. Spaced evenly, every facade["windowEveryM"] or so."""
    glass = plain("window_glass", (0.01, 0.012, 0.016), 0.15)
    paint = plain("window_paint", (0.3, 0.29, 0.25), 0.7)
    stone = _stone()
    ax, az = b[0] - a[0], b[1] - a[1]
    length = math.hypot(ax, az)
    e = (ax / length, az / length)
    count = int((length - 1.2) // facade["windowEveryM"]) + 1 if length > 2.2 else 0
    w, y0 = 0.9, H + 0.8
    y1 = y0 + 1.5

    def P(u, v, y):
        return B(a[0] + e[0] * u + n[0] * v, a[1] + e[1] * u + n[1] * v, y)

    def fbox(name, u0, u1, v0, v1, ya, yb, mat):
        return box(name, P(u0, v0, ya), P(u1, v1, yb), mat)

    for k in range(count):
        c = length / 2 + (k - (count - 1) / 2) * facade["windowEveryM"]
        u0, u1 = c - w / 2, c + w / 2
        facing_quad(f"win_{i}_{k}_glass", (a[0] + e[0] * u0 + n[0] * 0.002, a[1] + e[1] * u0 + n[1] * 0.002),
                    (a[0] + e[0] * u1 + n[0] * 0.002, a[1] + e[1] * u1 + n[1] * 0.002), n, y0, y1, glass)
        f = 0.07
        fbox(f"win_{i}_{k}_fl", u0 - f, u0, 0, 0.05, y0, y1, paint)
        fbox(f"win_{i}_{k}_fr", u1, u1 + f, 0, 0.05, y0, y1, paint)
        fbox(f"win_{i}_{k}_ft", u0 - f, u1 + f, 0, 0.05, y1, y1 + f, paint)
        fbox(f"win_{i}_{k}_fb", u0 - f, u1 + f, 0, 0.05, y0 - 0.03, y0, paint)
        mid = (y0 + y1) / 2
        fbox(f"win_{i}_{k}_meet", u0, u1, 0, 0.04, mid - 0.025, mid + 0.025, paint)
        for j in (1, 2):
            fbox(f"win_{i}_{k}_bar{j}", u0 + w * j / 3 - 0.012, u0 + w * j / 3 + 0.012, 0, 0.025, y0, y1, paint)
        for yb in ((y0 + mid) / 2, (mid + y1) / 2):
            fbox(f"win_{i}_{k}_hbar{yb:.2f}", u0, u1, 0, 0.025, yb - 0.01, yb + 0.01, paint)
        bevelled(fbox(f"win_{i}_{k}_sill", u0 - 0.14, u1 + 0.14, 0, 0.1, y0 - 0.1, y0 - 0.03, stone), 0.01)
        bevelled(fbox(f"win_{i}_{k}_lintel", u0 - 0.16, u1 + 0.16, 0, 0.035, y1 + f, y1 + f + 0.2, stone), 0.008)


for i, f in enumerate(job["faces"]):
    a, b, n = along(f)
    facing_quad(f"wall_{i}", a, b, n, split, WALL_TOP, wall_m)
    if wains:
        strip(f"panel_{i}", a, b, n, 0.0, split, PANEL_D, wains_m)
        strip(f"rail_{i}", a, b, n, split - RAIL_H / 2, split + RAIL_H / 2, RAIL_D, trim_m)
    if facade:
        stone = _stone()
        bevelled(strip(f"plinth_{i}", a, b, n, 0.0, 0.4, 0.04, stone), 0.01)
        bevelled(strip(f"band_{i}", a, b, n, H - SLAB - 0.12, H - SLAB + 0.06, 0.05, stone), 0.01)
        bevelled(strip(f"cornice_{i}", a, b, n, WALL_TOP - 0.3, WALL_TOP - 0.08, 0.08, stone), 0.01)
        bevelled(strip(f"eaves_{i}", a, b, n, WALL_TOP - 0.08, WALL_TOP, 0.16, stone), 0.01)
        facade_windows(i, a, b, n)
    else:
        strip(f"skirt_{i}", a, b, n, 0.0, SKIRT_H, SKIRT_D, trim_m)
    if not job.get("outdoor"):
        strip(f"crown_{i}", a, b, n, H - SLAB - CROWN_H, H - SLAB, CROWN_D, trim_m)

# Door frames (architraves) on the room side of every doorway, and the wall face above the door.
ARCH_W, ARCH_D = 0.1, 0.03
LINING_T = 0.02
for i, door in enumerate(job["doors"]):
    half = door["width"] / 2
    # The walls either side are solid half a thickness past their ends (shared/map.ts wallBox), so
    # the clear opening is a thickness narrower than the doorway: frame and line that.
    clear = half - T / 2
    n = door["into"]  # unit vector into this room
    off = T / 2 + FACE_GAP
    if door["axis"] == "x":
        a, b = (door["x"] - clear, door["z"] + n[1] * off), (door["x"] + clear, door["z"] + n[1] * off)
        wa, wb = (door["x"] - half, a[1]), (door["x"] + half, b[1])
        side = (1.0, 0.0)
    else:
        a, b = (door["x"] + n[0] * off, door["z"] - clear), (door["x"] + n[0] * off, door["z"] + clear)
        wa, wb = (a[0], door["z"] - half), (b[0], door["z"] + half)
        side = (0.0, 1.0)
    out = (n[0] * ARCH_D, n[1] * ARCH_D)
    for j, (p, s) in enumerate([(a, -1), (b, 1)]):
        p2 = (p[0] + side[0] * s * ARCH_W + out[0], p[1] + side[1] * s * ARCH_W + out[1])
        box(f"arch_{i}_{j}", B(p[0], p[1], 0), B(p2[0], p2[1], DOOR_H + ARCH_W), trim_m)
    lo = (a[0] - side[0] * ARCH_W, a[1] - side[1] * ARCH_W)
    hi = (b[0] + side[0] * ARCH_W + out[0], b[1] + side[1] * ARCH_W + out[1])
    box(f"arch_{i}_head", B(lo[0], lo[1], DOOR_H), B(hi[0], hi[1], DOOR_H + ARCH_W), trim_m)
    facing_quad(f"over_{i}", wa, wb, n, DOOR_H, WALL_TOP, wall_m)  # the wall over the whole doorway
    # The lining inside the opening, this side's half of the wall's depth: both jambs and the head,
    # so the wall's grey core never shows through a doorway.
    ax, az = (door["x"], door["z"])
    deep = (n[0] * off, n[1] * off)
    for j, s in enumerate((-1, 1)):
        e0 = (ax + side[0] * s * clear, az + side[1] * s * clear)
        e1 = (e0[0] - side[0] * s * LINING_T + deep[0], e0[1] - side[1] * s * LINING_T + deep[1])
        box(f"lining_{i}_{j}", B(min(e0[0], e1[0]), min(e0[1], e1[1]), 0), B(max(e0[0], e1[0]), max(e0[1], e1[1]), DOOR_H), trim_m)
    h0 = (ax - side[0] * clear, az - side[1] * clear)
    h1 = (ax + side[0] * clear + deep[0], az + side[1] * clear + deep[1])
    box(f"lining_{i}_head", B(min(h0[0], h1[0]), min(h0[1], h1[1]), DOOR_H - LINING_T), B(max(h0[0], h1[0]), max(h0[1], h1[1]), DOOR_H), trim_m)

for i, rug in enumerate(d.get("rugs", [])):
    o = box(f"rug_{i}", Vector((-rug["sizeX"] / 2, -rug["sizeZ"] / 2, 0)), Vector((rug["sizeX"] / 2, rug["sizeZ"] / 2, 0.012)), surface(rug["material"], 1.0))
    o.location = B(rug["x"], rug["z"], 0)
    o.rotation_euler.z = math.radians(rug.get("turn", 0))

# ---------------------------------------------------------------- hiding spots
# Wardrobes and cupboards are built here to the hiding spot's exact size: a plinth, a carcass, a
# cornice, two panelled doors and brass handles. Local frame: u across the front, v out of the front.
wood_m = surface(trim_name, 0.9) if wains else plain("wardrobe_wood", (0.10, 0.06, 0.035), 0.55)
if job.get("outdoor"):
    # Out in the garden a hiding cupboard is a potting shed's tool cupboard, its paint a faded green.
    wood_m = plain("shed_paint", (0.055, 0.085, 0.06), 0.85)
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


def curtain(i, sp):
    """A curtained alcove: a floor-length velvet drape in deep folds across the front, returning to
    the wall at each side, hung from a brass rod on brackets with a finial at each end."""
    fx, fz = sp["front"]
    sx_, sz_ = fz, -fx

    def P(u, v, y):
        return B(sp["x"] + sx_ * u + fx * v, sp["z"] + sz_ * u + fz * v, y)

    across_x = fz != 0
    w = sp["sizeX"] if across_x else sp["sizeZ"]
    dpt = sp["sizeZ"] if across_x else sp["sizeX"]
    hw, back, face = w / 2 + 0.05, -dpt / 2 + FACE_GAP, dpt / 2 - 0.05
    velvet = surface("velour_velvet_wine", 0.28)  # the scan is 28 cm across
    rod_y = 2.4
    # The drape's line seen from above: from the wall out along one side, across the front in
    # folds, back to the wall along the other side.
    import random
    rnd = random.Random(i * 31 + 7)
    path = [(-hw, back), (-hw, face - 0.12)]
    # Gathered on the rod: a fold every 13 cm or so, each a little different in depth and width.
    folds = max(6, round(2 * hw / 0.13))
    per = 12
    n = folds * per
    depth = [rnd.uniform(0.75, 1.25) for _ in range(folds)]
    for k in range(n + 1):
        f = k / n
        path.append((-hw + f * 2 * hw, face))
    path += [(hw, face - 0.12), (hw, back)]
    # (height, fold depth in metres, sway): tight at the rod, opening out and swinging a little
    # toward the floor, the hem just clear of it.
    rows = [(rod_y - 0.03, 0.02, 0.0), (rod_y - 0.1, 0.035, 0.0)]
    for k in range(1, 13):
        f = k / 12
        rows.append((rod_y - 0.1 - (rod_y - 0.12) * f, 0.035 + 0.035 * f, 0.012 * f * f))
    rows.append((0.0, 0.07, 0.012))
    bm = bmesh.new()
    grid = []
    for y, amp, sway in rows:
        line = []
        for k, (u, v) in enumerate(path):
            if 2 <= k <= n + 2:  # across the front: rounded folds, each its own depth
                j = k - 2
                fold, t = min(j // per, folds - 1), (j % per) / per
                if j == n:
                    t = 1.0
                v += amp * depth[fold] * 0.5 * (1 - math.cos(t * math.tau)) - amp * 0.5
                u += sway * math.sin(j / n * math.pi * 3 + i)
            line.append(bm.verts.new(P(u, v, y)))
        grid.append(line)
    for r in range(len(grid) - 1):
        for k in range(len(path) - 1):
            bm.faces.new((grid[r][k], grid[r][k + 1], grid[r + 1][k + 1], grid[r + 1][k]))
    for f in bm.faces:
        f.smooth = True
    finish(f"hide_{i}_{sp['id']}_drape", bm, velvet)
    # The rod over the front, on two brackets from the wall, a turned finial at each end.
    rv = face + 0.02
    rod(f"hide_{i}_{sp['id']}_rod", P(-hw - 0.08, rv, rod_y), P(hw + 0.08, rv, rod_y), 0.016, brass_m, 14)
    for k, u in enumerate((-hw + 0.04, hw - 0.04)):
        rod(f"hide_{i}_{sp['id']}_bracket{k}", P(u, back, rod_y + 0.03), P(u, rv, rod_y), 0.01, brass_m, 10)
        end = P(-hw - 0.08 if k == 0 else hw + 0.08, rv, rod_y)
        out = (P(1, rv, rod_y) - P(0, rv, rod_y)) * (-1 if k == 0 else 1)
        bm2 = bmesh.new()
        bmesh.ops.create_uvsphere(bm2, u_segments=12, v_segments=8, radius=0.03)
        for vtx in bm2.verts:
            vtx.co += end + out * 0.03
        finish(f"hide_{i}_{sp['id']}_finial{k}", bm2, brass_m)


for i, sp in enumerate(job.get("hidingSpots", [])):
    if sp["kind"] == "curtain":
        curtain(i, sp)
        continue
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
# The tablecloths: old cream linen, not laundry white.
linen_m = surface("terlenka", 0.27)  # cream woven cloth; the scan is 27 cm across


def lathe(name, profile, at, mat, segments=24, turn=None):
    """A turned part: profile is (radius, height) points from the bottom up, spun around the vertical.
    turn (a matrix) tips it before it is moved to at (a pan hung on its side)."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, h)) for r, h in profile]
    edges = [bm.edges.new((verts[k], verts[k + 1])) for k in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segments, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-5)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    if turn is not None:
        bmesh.ops.transform(bm, matrix=turn, verts=bm.verts)
    for v in bm.verts:
        v.co += at
    return finish(name, bm, mat)


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


def place(parts, i, kind, t):
    """Groups parts built at the origin (front toward -y, the map's south at turn 0) and puts them in place."""
    pivot = bpy.data.objects.new(f"build_{i}_{kind}", None)
    scene.collection.objects.link(pivot)
    for o in parts:
        o.parent = pivot
    pivot.rotation_euler.z = math.radians(t.get("turn", 0))
    pivot.location = B(t["x"], t["z"], 0.0)
    if t.get("draws"):
        pivot["draws"] = t["draws"]


def reception_counter(i, t):
    place(counter_parts(i, t), i, "receptionCounter", t)


def bar_counter(i, t):
    """The reception counter's panelled body with a brass foot rail along the drinkers' side (-y),
    held off the plinth on brackets."""
    parts = counter_parts(i, t)
    hl, hw = t["lengthM"] / 2, t["widthM"] / 2
    rail_y, rail_out, rail_r = 0.17, 0.13, 0.019
    ends = (-hl + 0.12, hl - 0.12)
    parts.append(rod(f"bc{i}_rail", Vector((ends[0], -hw - rail_out, rail_y)), Vector((ends[1], -hw - rail_out, rail_y)), rail_r, brass_m, 16))
    n = max(2, round((ends[1] - ends[0]) / 0.7) + 1)
    for k in range(n):
        x = ends[0] + (ends[1] - ends[0]) * k / (n - 1)
        parts.append(rod(f"bc{i}_bracket{k}", Vector((x, -hw + 0.05, rail_y + 0.04)), Vector((x, -hw - rail_out, rail_y)), 0.011, brass_m, 10))
    join_by_material(parts, f"barcounter_{i}")
    place([o for o in statics if o.name.startswith(f"barcounter_{i}_")], i, "barCounter", t)


def counter_parts(i, t):
    """A hotel counter: a plinth, a front of raised panels between pilasters, a moulded top that
    overhangs the guests' side, and a lower shelf on the clerk's side. Built along x; the guests'
    side is -y (the map's south at turn 0, so turn 180 faces the guests north)."""
    L, W, H = t["lengthM"], t["widthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.8)
    parts = []
    hl, hw = L / 2, W / 2
    plinth_h, top_t, over = 0.1, 0.05, 0.05
    parts.append(box(f"rc{i}_plinth", Vector((-hl + 0.02, -hw + 0.02, 0)), Vector((hl - 0.02, hw - 0.02, plinth_h)), wood))
    parts.append(box(f"rc{i}_body", Vector((-hl + over, -hw + over, plinth_h)), Vector((hl - over, hw - over, H - top_t)), wood))
    parts.append(bevelled(box(f"rc{i}_top", Vector((-hl, -hw, H - top_t)), Vector((hl, hw, H)), wood), 0.012))
    # A moulding under the top on every side.
    parts.append(bevelled(box(f"rc{i}_lip", Vector((-hl + over - 0.02, -hw + over - 0.02, H - top_t - 0.04)), Vector((hl - over + 0.02, hw - over + 0.02, H - top_t)), wood), 0.008))
    # The guests' front: pilasters and raised panels.
    face = -hw + over
    bays = max(2, round((L - 2 * over) / 0.8))
    bay = (L - 2 * over) / bays
    pil = 0.08
    for k in range(bays + 1):
        x = -hl + over + k * bay
        parts.append(box(f"rc{i}_pil{k}", Vector((x - pil / 2, face - 0.025, plinth_h)), Vector((x + pil / 2, face, H - top_t - 0.04)), wood))
    for k in range(bays):
        x0 = -hl + over + k * bay + pil / 2 + 0.06
        x1 = -hl + over + (k + 1) * bay - pil / 2 - 0.06
        parts.append(bevelled(box(f"rc{i}_panel{k}", Vector((x0, face - 0.015, plinth_h + 0.1)), Vector((x1, face, H - top_t - 0.14)), wood), 0.01))
    # Side panels on both ends.
    for k, sx in enumerate((-1, 1)):
        x = sx * (hl - over)
        parts.append(bevelled(box(f"rc{i}_end{k}", Vector((x, -hw + over + 0.1, plinth_h + 0.1)), Vector((x + sx * 0.015, hw - over - 0.1, H - top_t - 0.14)), wood), 0.008))
    # The clerk's side: an open shelf under the top for the ledger and the pens.
    parts.append(box(f"rc{i}_shelf", Vector((-hl + over + 0.05, 0.0, 0.72)), Vector((hl - over - 0.05, hw - over + 0.02, 0.75)), wood))
    return parts


def key_rack(i, t):
    """The key rack behind the counter: a low cupboard, then a case of pigeonholes with a brass hook
    and a numbered tag under each, and a cornice. Its back is against the wall at +y."""
    W, D, H = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.6)
    tag_m = plain("key_tag", (0.55, 0.45, 0.32), 0.7)
    parts = []
    hw, back, front = W / 2, D / 2, -D / 2
    low = 0.9
    parts.append(box(f"kr{i}_base", Vector((-hw, front, 0)), Vector((hw, back, low)), wood))
    for k, sx in enumerate((-1, 1)):
        parts.append(bevelled(box(f"kr{i}_door{k}", Vector((sx * 0.004, front - 0.015, 0.1)), Vector((sx * (hw - 0.03), front, low - 0.06)), wood), 0.006))
        parts.append(box(f"kr{i}_knob{k}", Vector((sx * 0.04 - 0.01, front - 0.04, 0.6)), Vector((sx * 0.04 + 0.01, front - 0.015, 0.64)), brass_m))
    parts.append(bevelled(box(f"kr{i}_ledge", Vector((-hw - 0.02, front - 0.03, low)), Vector((hw + 0.02, back, low + 0.03)), wood), 0.006))
    # The case: shallower than the cupboard, sides, back, shelves and dividers.
    cf = back - 0.2
    top = H - 0.1
    parts.append(box(f"kr{i}_back", Vector((-hw, back - 0.015, low + 0.03)), Vector((hw, back, top)), wood))
    for k, sx in enumerate((-1, 1)):
        parts.append(box(f"kr{i}_side{k}", Vector((sx * hw - (0.025 if sx > 0 else 0), cf, low + 0.03)), Vector((sx * hw + (0.025 if sx < 0 else 0), back, top)), wood))
    cols, rows = 8, 5
    x0, x1, y0, y1 = -hw + 0.025, hw - 0.025, low + 0.06, top
    for r in range(rows + 1):
        y = y0 + (y1 - y0) * r / rows
        parts.append(box(f"kr{i}_shelf{r}", Vector((x0, cf, y - 0.012)), Vector((x1, back - 0.015, y + 0.012)), wood))
    for c in range(1, cols):
        x = x0 + (x1 - x0) * c / cols
        parts.append(box(f"kr{i}_div{c}", Vector((x - 0.008, cf, y0)), Vector((x + 0.008, back - 0.015, y1)), wood))
    # A key on a hook under most pigeonholes; some guests never came down for theirs.
    import random
    rnd = random.Random(7)
    for r in range(rows):
        for c in range(cols):
            if rnd.random() < 0.3:
                continue
            x = x0 + (x1 - x0) * (c + 0.5) / cols
            y = y0 + (y1 - y0) * r / rows + 0.03
            parts.append(rod(f"kr{i}_hook{r}_{c}", Vector((x, cf + 0.01, y + 0.07)), Vector((x, cf - 0.02, y + 0.07)), 0.003, brass_m, 6))
            parts.append(box(f"kr{i}_tag{r}_{c}", Vector((x - 0.016, cf - 0.025, y + 0.0)), Vector((x + 0.016, cf - 0.019, y + 0.065)), tag_m))
    parts.append(bevelled(box(f"kr{i}_cornice", Vector((-hw - 0.03, cf - 0.03, top)), Vector((hw + 0.03, back, H)), wood), 0.01))
    join_by_material(parts, f"keyrack_{i}")
    place([o for o in statics if o.name.startswith(f"keyrack_{i}_")], i, "keyRack", t)


def pillar(i, t):
    """A square panelled pillar from floor to ceiling: a plinth, a shaft with a sunk panel on each
    face, and a moulded capital."""
    S = t["sizeM"]
    wood = surface(t.get("material", "dark_paneled_wood"), 1.0)
    trim = surface(t.get("trim", t.get("material", "dark_paneled_wood")), 0.5)
    top = H - SLAB
    h = S / 2
    parts = [
        bevelled(box(f"pl{i}_plinth", Vector((-h - 0.04, -h - 0.04, 0)), Vector((h + 0.04, h + 0.04, 0.22)), trim), 0.01),
        box(f"pl{i}_shaft", Vector((-h, -h, 0.22)), Vector((h, h, top - 0.26)), wood),
        bevelled(box(f"pl{i}_neck", Vector((-h - 0.02, -h - 0.02, top - 0.26)), Vector((h + 0.02, h + 0.02, top - 0.2)), trim), 0.008),
        bevelled(box(f"pl{i}_cap", Vector((-h - 0.06, -h - 0.06, top - 0.2)), Vector((h + 0.06, h + 0.06, top)), trim), 0.012),
    ]
    # A raised moulding frames a panel on each face.
    m, r = 0.07, 0.02
    for k, (ax, sgn) in enumerate(((0, -1), (0, 1), (1, -1), (1, 1))):
        for j, (u0, u1, v0, v1) in enumerate(((-h + m, h - m, 0.4, 0.4 + r), (-h + m, h - m, top - 0.45 - r, top - 0.45), (-h + m, -h + m + r, 0.4, top - 0.45), (h - m - r, h - m, 0.4, top - 0.45))):
            if ax == 0:
                a, b = Vector((u0, sgn * h, v0)), Vector((u1, sgn * (h + 0.012), v1))
            else:
                a, b = Vector((sgn * h, u0, v0)), Vector((sgn * (h + 0.012), u1, v1))
            parts.append(box(f"pl{i}_mould{k}_{j}", a, b, trim))
    place(parts, i, "pillar", t)


# Linear colours: oxblood, tan, dark brown, bottle green, navy. Dark and saturated, as old leather
# is; lighter values read as cardboard under the torch.
LEATHERS = [(0.075, 0.012, 0.008), (0.085, 0.035, 0.012), (0.045, 0.022, 0.01), (0.015, 0.03, 0.017), (0.015, 0.018, 0.045)]


def suitcase(name, rnd, x0, x1, y0, y1, z0, parts):
    """An old leather suitcase lying flat inside the box (x0..x1, y0..y1) from height z0: a bevelled
    case, two straps round it, brass corner caps and a handle on the side facing -y."""
    w, d = x1 - x0, y1 - y0
    h = rnd.uniform(0.14, 0.22)
    col = LEATHERS[rnd.randrange(len(LEATHERS))]
    # Worn, matte leather: a shinier finish catches the torch and washes the colour out.
    leather = plain(f"leather_{col}", col, 0.78)
    strap = plain("strap", (0.025, 0.014, 0.008), 0.7)
    parts.append(bevelled(box(f"{name}_case", Vector((x0, y0, z0)), Vector((x1, y1, z0 + h)), leather), 0.02))
    for k in (0.25, 0.75):
        sx = x0 + w * k
        parts.append(box(f"{name}_strap{k}", Vector((sx - 0.02, y0 - 0.004, z0 - 0.002)), Vector((sx + 0.02, y1 + 0.004, z0 + h + 0.004)), strap))
    for k, (cx, cy) in enumerate(((x0, y0), (x1, y0), (x0, y1), (x1, y1))):
        ox = 1 if cx == x0 else -1
        oy = 1 if cy == y0 else -1
        parts.append(box(f"{name}_corner{k}", Vector((cx - ox * 0.004, cy - oy * 0.004, z0 + h - 0.035)), Vector((cx + ox * 0.04, cy + oy * 0.04, z0 + h + 0.004)), brass_m))
    mid = (x0 + x1) / 2
    parts.append(box(f"{name}_handle", Vector((mid - 0.07, y0 - 0.03, z0 + h * 0.45)), Vector((mid + 0.07, y0 - 0.008, z0 + h * 0.6)), strap))
    return h


def luggage_rack(i, t):
    """A porter's luggage rack: four square posts, slatted shelves, and guests' suitcases left on
    them (built here in leather of a few colours, sizes varied). Back toward +y, front -y."""
    W, D, H = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.6)
    import random
    rnd = random.Random(t.get("seed", i))
    parts = []
    hw, hd, post = W / 2, D / 2, 0.05
    for k, (px, py) in enumerate(((-hw, -hd), (hw - post, -hd), (-hw, hd - post), (hw - post, hd - post))):
        parts.append(box(f"lr{i}_post{k}", Vector((px, py, 0)), Vector((px + post, py + post, H)), wood))
    tiers = t.get("tiers", 3)
    levels = [0.12 + (H - 0.2) * k / (tiers - 1) for k in range(tiers)] if tiers > 1 else [0.12]
    slats = 5
    for k, z in enumerate(levels):
        parts.append(box(f"lr{i}_rail{k}f", Vector((-hw + post, -hd, z - 0.05)), Vector((hw - post, -hd + 0.025, z)), wood))
        parts.append(box(f"lr{i}_rail{k}b", Vector((-hw + post, hd - 0.025, z - 0.05)), Vector((hw - post, hd, z)), wood))
        for s in range(slats):
            y = -hd + 0.03 + (D - 0.06) * (s + 0.5) / slats
            parts.append(box(f"lr{i}_slat{k}_{s}", Vector((-hw + post, y - 0.035, z)), Vector((hw - post, y + 0.035, z + 0.018)), wood))
        # Suitcases on every shelf but the top one sometimes, side by side or stacked.
        if k == len(levels) - 1 and rnd.random() < 0.4:
            continue
        x = -hw + post + 0.03
        while x < hw - post - 0.35:
            cw = min(rnd.uniform(0.45, 0.7), hw - post - 0.03 - x)
            if cw < 0.35:
                break
            cd = rnd.uniform(0.32, min(0.46, D - 0.08))
            yb = hd - 0.04 - cd
            z0 = z + 0.018
            h = suitcase(f"lr{i}_case{k}_{x:.2f}", rnd, x, x + cw, yb, yb + cd, z0, parts)
            space = (levels[k + 1] - 0.05 - z0 - h) if k + 1 < len(levels) else 0.4
            if space > 0.2 and rnd.random() < 0.5:
                inset = rnd.uniform(0.02, 0.06)
                suitcase(f"lr{i}_top{k}_{x:.2f}", rnd, x + inset, x + cw - inset, yb + 0.02, yb + cd - 0.01, z0 + h, parts)
            x += cw + rnd.uniform(0.03, 0.08)
    join_by_material(parts, f"rack_{i}")
    place([o for o in statics if o.name.startswith(f"rack_{i}_")], i, "luggageRack", t)


def file_chest(i, t):
    """The hotel's card-file chest: rows of small drawers with brass pulls and label frames, on a
    plinth under a moulded top. Front toward -y."""
    W, D, H = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.6)
    card = plain("label_card", (0.3, 0.26, 0.18), 0.85)
    parts = []
    hw, hd = W / 2, D / 2
    plinth, top_t = 0.1, 0.04
    parts.append(box(f"fc{i}_plinth", Vector((-hw + 0.02, -hd + 0.02, 0)), Vector((hw - 0.02, hd, plinth)), wood))
    parts.append(box(f"fc{i}_body", Vector((-hw, -hd, plinth)), Vector((hw, hd, H - top_t)), wood))
    parts.append(bevelled(box(f"fc{i}_top", Vector((-hw - 0.025, -hd - 0.025, H - top_t)), Vector((hw + 0.025, hd, H)), wood), 0.01))
    cols, rows = t.get("cols", 4), t.get("rows", 7)
    gap = 0.008
    x0, x1, z0, z1 = -hw + 0.03, hw - 0.03, plinth + 0.03, H - top_t - 0.03
    for r in range(rows):
        for c in range(cols):
            a = x0 + (x1 - x0) * c / cols + gap / 2
            b = x0 + (x1 - x0) * (c + 1) / cols - gap / 2
            lo = z0 + (z1 - z0) * r / rows + gap / 2
            hi = z0 + (z1 - z0) * (r + 1) / rows - gap / 2
            parts.append(box(f"fc{i}_drawer{r}_{c}", Vector((a, -hd - 0.012, lo)), Vector((b, -hd, hi)), wood))
            mx, mz = (a + b) / 2, (lo + hi) / 2
            parts.append(box(f"fc{i}_label{r}_{c}", Vector((mx - 0.035, -hd - 0.016, mz + 0.012)), Vector((mx + 0.035, -hd - 0.012, mz + 0.04)), card))
            parts.append(box(f"fc{i}_frame{r}_{c}", Vector((mx - 0.04, -hd - 0.015, mz + 0.008)), Vector((mx + 0.04, -hd - 0.012, mz + 0.044)), brass_m))
            parts.append(box(f"fc{i}_pull{r}_{c}", Vector((mx - 0.03, -hd - 0.03, mz - 0.025)), Vector((mx + 0.03, -hd - 0.012, mz - 0.012)), brass_m))
    join_by_material(parts, f"files_{i}")
    place([o for o in statics if o.name.startswith(f"files_{i}_")], i, "fileChest", t)


def luggage_cart(i, t):
    """A bellboy's luggage cart: a carpeted wooden deck on four castors, two brass uprights joined by
    an arched rail, and a couple of suitcases on the deck. Long side along x, uprights at both ends."""
    W, D, H = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.6)
    carpet = surface(t.get("carpet", "dirty_carpet"), 0.8)
    old_brass = plain("cart_brass", (0.5, 0.36, 0.16), 0.5, 1.0)
    rubber = plain("castor", (0.02, 0.02, 0.02), 0.8)
    import random
    rnd = random.Random(t.get("seed", i))
    parts = []
    hw, hd = W / 2, D / 2
    deck0, deck1 = 0.16, 0.2
    parts.append(bevelled(box(f"lc{i}_deck", Vector((-hw, -hd, deck0)), Vector((hw, hd, deck1)), wood), 0.01))
    parts.append(box(f"lc{i}_carpet", Vector((-hw + 0.03, -hd + 0.03, deck1)), Vector((hw - 0.03, hd - 0.03, deck1 + 0.008)), carpet))
    for k, (cx, cy) in enumerate(((-hw + 0.08, -hd + 0.08), (hw - 0.08, -hd + 0.08), (-hw + 0.08, hd - 0.08), (hw - 0.08, hd - 0.08))):
        parts.append(box(f"lc{i}_fork{k}", Vector((cx - 0.02, cy - 0.012, 0.07)), Vector((cx + 0.02, cy + 0.012, deck0)), old_brass))
        parts.append(rod(f"lc{i}_wheel{k}", Vector((cx - 0.015, cy, 0.06)), Vector((cx + 0.015, cy, 0.06)), 0.06, rubber, 16))
    # Uprights at both ends, each a pair of tubes, and an arched rail over the deck between them.
    r = 0.016
    top = H - 0.25
    for sx in (-1, 1):
        x = sx * (hw - 0.04)
        for sy in (-1, 1):
            y = sy * (hd - 0.06)
            parts.append(rod(f"lc{i}_up{sx}{sy}", Vector((x, y, deck1)), Vector((x, y, top)), r, old_brass))
        parts.append(rod(f"lc{i}_cross{sx}", Vector((x, -(hd - 0.06), top - 0.25)), Vector((x, hd - 0.06, top - 0.25)), r * 0.8, old_brass))
    steps = 12
    for sy in (-1, 1):
        y = sy * (hd - 0.06)
        pts = [Vector((-(hw - 0.04) * math.cos(math.pi * k / steps), y, top + (H - top) * math.sin(math.pi * k / steps))) for k in range(steps + 1)]
        for k in range(steps):
            parts.append(rod(f"lc{i}_arch{sy}_{k}", pts[k], pts[k + 1], r, old_brass))
    parts.append(rod(f"lc{i}_ridge", Vector((0, -(hd - 0.06), H)), Vector((0, hd - 0.06, H)), r, old_brass))
    # Luggage on the deck.
    z = deck1 + 0.008
    h = suitcase(f"lc{i}_case0", rnd, -hw + 0.1, -hw + 0.1 + rnd.uniform(0.5, 0.62), -hd + 0.1, hd - 0.1, z, parts)
    if rnd.random() < 0.8:
        suitcase(f"lc{i}_case1", rnd, -hw + 0.14, -hw + 0.56, -hd + 0.13, hd - 0.16, z + h, parts)
    join_by_material(parts, f"cart_{i}")
    place([o for o in statics if o.name.startswith(f"cart_{i}_")], i, "luggageCart", t)


# Linear cloth and leather colours for book covers: oxblood, bottle green, navy, brown, black, ochre.
BOOK_COLOURS = [(0.09, 0.012, 0.01), (0.012, 0.04, 0.02), (0.01, 0.015, 0.05), (0.06, 0.03, 0.012),
                (0.012, 0.01, 0.01), (0.16, 0.09, 0.025), (0.05, 0.012, 0.03)]


def shelf_books(i, t):
    """Fills a bookcase model's shelves with ledgers and books, built in its own frame (same place
    and turn as the model, spines toward -y)."""
    import random
    rnd = random.Random(t.get("seed", i))
    parts = book_rows(f"sb{i}", rnd, t["widthM"], t["depthM"], t["shelves"])
    join_by_material(parts, f"books_{i}")
    place([o for o in statics if o.name.startswith(f"books_{i}_")], i, "shelfBooks", t)


def book_rows(prefix, rnd, W, D, shelves, x_mid=0.0, front_y=None):
    """Books on shelves W wide and D deep, centred on x_mid, spines toward -y. Rows stand upright
    with gaps, some books lean on their neighbour, some lie in a stack; no shelf is quite full."""
    pages = plain("book_pages", (0.42, 0.37, 0.27), 0.9)
    gilt = plain("book_gilt", (0.55, 0.4, 0.15), 0.45, 1.0)
    covers = [plain(f"book_{k}", c, 0.7) for k, c in enumerate(BOOK_COLOURS)]
    parts = []
    front = (-D / 2 if front_y is None else front_y) + 0.03

    def book(n, x0, thick, h, d, y0, lean=0.0):
        """Upright from x0 to x0 + thick. A leaning book stands on its bottom left corner at x0 and
        tips its top left (toward -x) onto the book before it."""
        cover = covers[rnd.randrange(len(covers))]
        a = 0.0
        objs = [box(f"{n}_cover", Vector((a, 0, 0)), Vector((a + thick, d, h)), cover),
                box(f"{n}_pages", Vector((a + 0.004, 0.006, 0.004)), Vector((a + thick - 0.004, d + 0.002, h - 0.004)), pages)]
        if rnd.random() < 0.6:
            for k in range(2):
                band = h * (0.78 + 0.08 * k)
                objs.append(box(f"{n}_band{k}", Vector((a + 0.001, -0.002, band)), Vector((a + thick - 0.001, 0.0, band + 0.008)), gilt))
        for o in objs:
            o.rotation_euler.y = -lean
            o.location = Vector((x0, front, y0))
        parts.extend(objs)

    for s, shelf in enumerate(shelves):
        y0, clear = shelf["y"], shelf["clearM"]
        x = x_mid - W / 2 + 0.01
        end = x_mid + W / 2 - 0.01
        filled = rnd.uniform(0.55, 0.9) * W
        start = x
        while x < start + filled and x < end - 0.05:
            r = rnd.random()
            if r < 0.08 and x < end - 0.35:
                # A stack lying flat.
                count = rnd.randint(2, 4)
                y = y0
                for k in range(count):
                    th = rnd.uniform(0.03, 0.05)
                    w = rnd.uniform(0.22, min(0.3, clear - 0.02))
                    c = covers[rnd.randrange(len(covers))]
                    parts.append(box(f"{prefix}_{s}_lie{x:.2f}_{k}", Vector((x, front, y)), Vector((x + w, front + rnd.uniform(0.16, 0.22), y + th)), c))
                    y += th
                x += 0.32
                continue
            if r < 0.14:
                x += rnd.uniform(0.04, 0.12)  # a gap where a book was taken
                continue
            thick = rnd.uniform(0.025, 0.06)
            h = rnd.uniform(0.7, 0.95) * min(clear - 0.015, 0.34)
            d = rnd.uniform(0.16, min(0.26, D - 0.08))
            if r > 0.5 and x > start + filled - 0.12:
                # The row's last book, leaning on the one before it.
                lean = rnd.uniform(0.15, 0.3)
                book(f"{prefix}_{s}_{x:.3f}", x + h * math.sin(lean), thick, h, d, y0, lean)
                break
            book(f"{prefix}_{s}_{x:.3f}", x, thick, h, d, y0)
            x += thick + rnd.uniform(0.0, 0.004)
    return parts


# The switchboard station's face, in its own frame (client/src/stations.ts BOARD_*): the game draws
# the sockets, lamps, hooks, plugs and cables on a plane this far in front of the station's place.
SWITCHBOARD_FACE_F = -0.025
SWITCHBOARD_DESK_F = 0.25
SWITCHBOARD_DESK_TOP = 0.8


def switchboard_cabinet(i, t):
    """The switchboard task's cabinet (GDD 9): a panelled operator's cabinet from the wall to the
    game's board face, a black board in a wooden frame, a writing desk in front, doors below and a
    crown on top. Built at the station's place, its front toward -y; backM is the distance from the
    station's place back to the wall's face. Only the live parts are left to the game."""
    W, H, back = t["widthM"], t["heightM"], t["backM"] - FACE_GAP
    wood = surface(t.get("material", "dark_wood"), 0.6)
    board = plain("bakelite", (0.016, 0.013, 0.011), 0.45)
    gilt = plain("plate_brass", (0.55, 0.4, 0.15), 0.4, 1.0)
    hw = W / 2
    face = -SWITCHBOARD_FACE_F + 0.001  # y of the board's surface, just behind the game's parts
    desk = -SWITCHBOARD_DESK_F
    top_y = SWITCHBOARD_DESK_TOP
    parts = []
    # Upper case behind the board, and the board itself in a proud wooden frame.
    parts.append(box(f"sw{i}_case", Vector((-hw + 0.04, face + 0.014, top_y)), Vector((hw - 0.04, back, H - 0.08)), wood))
    b0, b1, bx = top_y + 0.06, H - 0.14, 0.5
    parts.append(box(f"sw{i}_board", Vector((-bx, face, b0)), Vector((bx, face + 0.014, b1)), board))
    fr = 0.06
    for k, (a, b) in enumerate((((-bx - fr, b0 - fr), (-bx, b1 + fr)), ((bx, b0 - fr), (bx + fr, b1 + fr)), ((-bx, b1), (bx, b1 + fr)), ((-bx, b0 - fr), (bx, b0)))):
        parts.append(bevelled(box(f"sw{i}_frame{k}", Vector((a[0], face - 0.02, a[1])), Vector((b[0], face + 0.014, b[1])), wood), 0.006))
    # Side cheeks: full height at the back, desk height out to the desk's front.
    for k, sx in enumerate((-1, 1)):
        x0, x1 = sorted((sx * (hw - 0.04), sx * hw))
        parts.append(box(f"sw{i}_cheek{k}", Vector((x0, face - 0.03, top_y)), Vector((x1, back, H - 0.08)), wood))
        parts.append(box(f"sw{i}_leg{k}", Vector((x0, desk + 0.02, 0)), Vector((x1, back, top_y - 0.02)), wood))
    # The desk: a moulded top, a cupboard under it with two panelled doors on a plinth.
    parts.append(bevelled(box(f"sw{i}_desk", Vector((-hw - 0.015, desk - 0.02, top_y - 0.035)), Vector((hw + 0.015, face + 0.014, top_y)), wood), 0.01))
    parts.append(box(f"sw{i}_under", Vector((-hw + 0.04, desk + 0.04, 0.07)), Vector((hw - 0.04, back, top_y - 0.035)), wood))
    parts.append(box(f"sw{i}_plinth", Vector((-hw + 0.02, desk + 0.05, 0)), Vector((hw - 0.02, back, 0.07)), wood))
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * 0.004, sx * (hw - 0.05)))
        parts.append(bevelled(box(f"sw{i}_door{k}", Vector((a, desk + 0.025, 0.1)), Vector((b, desk + 0.04, top_y - 0.07)), wood), 0.006))
        parts.append(bevelled(box(f"sw{i}_dpanel{k}", Vector((a + 0.06, desk + 0.015, 0.18)), Vector((b - 0.06, desk + 0.025, top_y - 0.15)), wood), 0.006))
        parts.append(box(f"sw{i}_knob{k}", Vector((sx * 0.04 - 0.01, desk, 0.55)), Vector((sx * 0.04 + 0.01, desk + 0.025, 0.59)), brass_m))
    # Crown and a brass maker's plate over the board.
    parts.append(box(f"sw{i}_head", Vector((-hw, face - 0.03, H - 0.08)), Vector((hw, back, H - 0.03)), wood))
    parts.append(bevelled(box(f"sw{i}_crown", Vector((-hw - 0.035, face - 0.065, H - 0.03)), Vector((hw + 0.035, back, H)), wood), 0.01))
    parts.append(box(f"sw{i}_plate", Vector((-0.16, face - 0.034, H - 0.075)), Vector((0.16, face - 0.03, H - 0.035)), gilt))
    join_by_material(parts, f"switchboard_{i}")
    place([o for o in statics if o.name.startswith(f"switchboard_{i}_")], i, "switchboard", t)


def bookcase(i, t):
    """A tall library bookcase: a plinth, sides, a panelled back, fixed shelves in one or two bays
    and a moulded cornice, filled with books. Front toward -y, back against the wall at +y."""
    import random
    rnd = random.Random(t.get("seed", i))
    W, D, Ht = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.8)
    parts = []
    hw, hd = W / 2, D / 2
    side, plinth, corn, shelf_t = 0.035, 0.12, 0.12, 0.025
    parts.append(box(f"bc{i}_plinth", Vector((-hw + 0.015, -hd + 0.015, 0)), Vector((hw - 0.015, hd, plinth)), wood))
    for k, sx in enumerate((-1, 1)):
        x0, x1 = sorted((sx * hw, sx * (hw - side)))
        parts.append(box(f"bc{i}_side{k}", Vector((x0, -hd, 0)), Vector((x1, hd, Ht - corn)), wood))
    parts.append(box(f"bc{i}_back", Vector((-hw + side, hd - 0.015, plinth)), Vector((hw - side, hd, Ht - corn)), wood))
    bays = 2 if W > 1.3 else 1
    mid_t = 0.03
    inner = W - 2 * side - (bays - 1) * mid_t
    bay_w = inner / bays
    if bays == 2:
        parts.append(box(f"bc{i}_mid", Vector((-mid_t / 2, -hd + 0.01, plinth)), Vector((mid_t / 2, hd - 0.015, Ht - corn)), wood))
    # Shelves: the bottom one on the plinth, the rest evenly up to the cornice.
    rows = max(4, round((Ht - corn - plinth) / 0.36))
    levels = [plinth + (Ht - corn - plinth - 0.02) * k / rows for k in range(rows)]
    for k, y in enumerate(levels):
        parts.append(box(f"bc{i}_shelf{k}", Vector((-hw + side, -hd + 0.01, y)), Vector((hw - side, hd - 0.015, y + shelf_t)), wood))
        # A thin lipped front edge on each shelf.
        parts.append(box(f"bc{i}_lip{k}", Vector((-hw + side, -hd, y - 0.012)), Vector((hw - side, -hd + 0.012, y + shelf_t)), wood))
    parts.append(box(f"bc{i}_top", Vector((-hw + side, -hd + 0.01, Ht - corn - 0.02)), Vector((hw - side, hd - 0.015, Ht - corn)), wood))
    parts.append(box(f"bc{i}_frieze", Vector((-hw, -hd - 0.012, Ht - corn)), Vector((hw, hd, Ht - 0.04)), wood))
    parts.append(bevelled(box(f"bc{i}_cornice", Vector((-hw - 0.035, -hd - 0.045, Ht - 0.04)), Vector((hw + 0.035, hd, Ht)), wood), 0.012))
    # Fluted pilasters on the front of each side.
    for k, sx in enumerate((-1, 1)):
        x0, x1 = sorted((sx * hw, sx * (hw - side - 0.01)))
        parts.append(box(f"bc{i}_pil{k}", Vector((x0, -hd - 0.015, plinth)), Vector((x1, -hd, Ht - corn)), wood))
    shelves = [{"y": y + shelf_t, "clearM": (levels[k + 1] if k + 1 < len(levels) else Ht - corn - 0.02) - y - shelf_t} for k, y in enumerate(levels)]
    for b in range(bays):
        mid = -hw + side + bay_w / 2 + b * (bay_w + mid_t)
        parts.extend(book_rows(f"bc{i}_b{b}", rnd, bay_w, D - 0.03, shelves, mid, -hd))
    join_by_material(parts, f"bookcase_{i}")
    place([o for o in statics if o.name.startswith(f"bookcase_{i}_")], i, "bookcase", t)


leather_green = plain("desk_leather", (0.014, 0.04, 0.02), 0.62)


def tooled_top(name, x0, x1, y0, y1, z, parts):
    """A green leather writing surface let into a top, with a gilt tooled line round it."""
    gilt = plain("book_gilt", (0.55, 0.4, 0.15), 0.45, 1.0)
    parts.append(box(f"{name}_leather", Vector((x0, y0, z)), Vector((x1, y1, z + 0.002)), leather_green))
    m, w = 0.03, 0.006
    for k, (a, b) in enumerate((((x0 + m, y0 + m), (x1 - m, y0 + m + w)), ((x0 + m, y1 - m - w), (x1 - m, y1 - m)),
                                ((x0 + m, y0 + m), (x0 + m + w, y1 - m)), ((x1 - m - w, y0 + m), (x1 - m, y1 - m)))):
        parts.append(box(f"{name}_tool{k}", Vector((a[0], a[1], z + 0.002)), Vector((b[0], b[1], z + 0.0028)), gilt))


def reading_table(i, t):
    """A library reading table: a thick moulded top with a leather surface let in, deep aprons, four
    square legs with chamfered corners, joined low down by an H stretcher. Long side along x."""
    L, W, Ht = t["lengthM"], t["widthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.8)
    parts = []
    hl, hw = L / 2, W / 2
    top_t, apron_h, leg = 0.055, 0.15, 0.085
    parts.append(bevelled(box(f"rt{i}_top", Vector((-hl, -hw, Ht - top_t)), Vector((hl, hw, Ht - 0.002)), wood), 0.014))
    tooled_top(f"rt{i}", -hl + 0.09, hl - 0.09, -hw + 0.09, hw - 0.09, Ht - 0.002, parts)
    ax, ay = hl - 0.1, hw - 0.1
    y0, y1 = Ht - top_t - apron_h, Ht - top_t
    for k, (a, b) in enumerate((((-ax, -ay), (ax, -ay + 0.025)), ((-ax, ay - 0.025), (ax, ay)), ((-ax, -ay), (-ax + 0.025, ay)), ((ax - 0.025, -ay), (ax, ay)))):
        parts.append(box(f"rt{i}_apron{k}", Vector((a[0], a[1], y0)), Vector((b[0], b[1], y1)), wood))
        parts.append(box(f"rt{i}_bead{k}", Vector((a[0] - 0.006, a[1] - 0.006, y0)), Vector((b[0] + 0.006, b[1] + 0.006, y0 + 0.018)), wood))
    for k, (lx, ly) in enumerate(((-ax, -ay), (ax, -ay), (-ax, ay), (ax, ay))):
        parts.append(bevelled(box(f"rt{i}_leg{k}", Vector((lx - leg / 2, ly - leg / 2, 0)), Vector((lx + leg / 2, ly + leg / 2, y1)), wood), 0.01, 1))
    # The H stretcher: one across each end, one down the middle.
    s = 0.045
    for k, sx in enumerate((-1, 1)):
        parts.append(box(f"rt{i}_end{k}", Vector((sx * ax - s / 2, -ay, 0.12)), Vector((sx * ax + s / 2, ay, 0.18)), wood))
    parts.append(box(f"rt{i}_spine", Vector((-ax, -s / 2, 0.12)), Vector((ax, s / 2, 0.18)), wood))
    join_by_material(parts, f"readingtable_{i}")
    place([o for o in statics if o.name.startswith(f"readingtable_{i}_")], i, "readingTable", t)


def pedestal_desk(i, t):
    """A pedestal writing desk: two pedestals of three drawers each and a drawer over the kneehole on
    the sitter's side (+y), raised panels on the visitor's side (-y), a leather top."""
    L, W, Ht = t["lengthM"], t["widthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.7)
    parts = []
    hl, hw = L / 2, W / 2
    top_t, ped = 0.04, 0.42
    parts.append(bevelled(box(f"pd{i}_top", Vector((-hl, -hw, Ht - top_t)), Vector((hl, hw, Ht - 0.002)), wood), 0.01))
    tooled_top(f"pd{i}", -hl + 0.07, hl - 0.07, -hw + 0.07, hw - 0.07, Ht - 0.002, parts)
    body_top = Ht - top_t
    for k, sx in enumerate((-1, 1)):
        x0, x1 = sorted((sx * (hl - 0.03), sx * (hl - 0.03 - ped)))
        parts.append(box(f"pd{i}_plinth{k}", Vector((x0 - 0.01, -hw + 0.02, 0)), Vector((x1 + 0.01, hw - 0.02, 0.07)), wood))
        parts.append(box(f"pd{i}_ped{k}", Vector((x0, -hw + 0.04, 0.07)), Vector((x1, hw - 0.04, body_top)), wood))
        # Three graduated drawers on the sitter's side.
        edges = [0.09, 0.32, 0.5, body_top - 0.14]
        for d in range(3):
            a, b = edges[d] + 0.006, edges[d + 1] - 0.006
            parts.append(bevelled(box(f"pd{i}_drawer{k}_{d}", Vector((x0 + 0.025, hw - 0.04, a)), Vector((x1 - 0.025, hw - 0.025, b)), wood), 0.005, 1))
            mx, mz = (x0 + x1) / 2, (a + b) / 2
            parts.append(box(f"pd{i}_pull{k}_{d}", Vector((mx - 0.045, hw - 0.025, mz - 0.008)), Vector((mx + 0.045, hw - 0.01, mz + 0.008)), brass_m))
        # A raised panel on the visitor's side.
        parts.append(bevelled(box(f"pd{i}_panel{k}", Vector((x0 + 0.05, -hw + 0.025, 0.14)), Vector((x1 - 0.05, -hw + 0.04, body_top - 0.07)), wood), 0.006))
    # Over the kneehole: a frieze drawer on the sitter's side, a panelled modesty board on the other.
    kx = hl - 0.03 - ped
    parts.append(box(f"pd{i}_frieze", Vector((-kx, -hw + 0.04, body_top - 0.12)), Vector((kx, hw - 0.04, body_top)), wood))
    parts.append(bevelled(box(f"pd{i}_kdrawer", Vector((-kx + 0.03, hw - 0.04, body_top - 0.11)), Vector((kx - 0.03, hw - 0.025, body_top - 0.01)), wood), 0.005, 1))
    parts.append(box(f"pd{i}_kpull", Vector((-0.06, hw - 0.025, body_top - 0.068)), Vector((0.06, hw - 0.01, body_top - 0.052)), brass_m))
    parts.append(box(f"pd{i}_modesty", Vector((-kx, -hw + 0.04, 0.2)), Vector((kx, -hw + 0.06, body_top - 0.12)), wood))
    parts.append(bevelled(box(f"pd{i}_mpanel", Vector((-kx + 0.06, -hw + 0.025, 0.28)), Vector((kx - 0.06, -hw + 0.04, body_top - 0.18)), wood), 0.006))
    join_by_material(parts, f"desk_{i}")
    place([o for o in statics if o.name.startswith(f"desk_{i}_")], i, "pedestalDesk", t)


def banker_lamp(i, t):
    """A banker's desk lamp: a round brass foot, a short stem and harp, and a green cased-glass shade
    lying across it. The room's light (its bulb) sits under the shade."""
    green = plain("lamp_glass", (0.02, 0.12, 0.04), 0.15, 0.0, ((0.05, 0.3, 0.08), 0.6))
    parts = [
        lathe(f"bl{i}_foot", [(0.0, 0.0), (0.075, 0.0), (0.078, 0.01), (0.06, 0.025), (0.02, 0.035), (0.0, 0.035)], Vector((0, 0, 0)), brass_m),
        rod(f"bl{i}_stem", Vector((0, 0.02, 0.03)), Vector((0, 0.02, 0.33)), 0.008, brass_m),
        rod(f"bl{i}_arm", Vector((0, 0.02, 0.33)), Vector((0, -0.03, 0.36)), 0.006, brass_m),
    ]
    # The shade: half a cylinder lying along x, open below.
    bm = bmesh.new()
    r, half, seg = 0.085, 0.14, 12
    rings = []
    for k in range(seg + 1):
        a = math.pi * k / seg
        rings.append((bm.verts.new((-half, -0.03 + r * math.cos(a), 0.36 + r * 0.55 * math.sin(a) - 0.02)),
                      bm.verts.new((half, -0.03 + r * math.cos(a), 0.36 + r * 0.55 * math.sin(a) - 0.02))))
    for k in range(seg):
        bm.faces.new((rings[k][0], rings[k][1], rings[k + 1][1], rings[k + 1][0]))
    bm.faces.new([v for v, _ in rings])
    bm.faces.new([w for _, w in reversed(rings)])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    parts.append(finish(f"bl{i}_shade", bm, green))
    join_by_material(parts, f"banker_{i}")
    objs = [o for o in statics if o.name.startswith(f"banker_{i}_")]
    place(objs, i, "bankerLamp", t)
    objs[0].parent.location.z += t.get("y", 0.0)


# The letter station's fireplace, in its own frame (client/src/stations.ts fireplace): the game
# shows flames 0.2 m up and 0.08 m out from the station's place, and hangs the letter from a hook
# 1.1 m up and 0.3 m out. Out from the wall is -y here.
FIRE_OPEN_W = 0.82
FIRE_OPEN_H = 0.74
FIRE_FACE = 0.18  # how far out the surround's face stands
MANTEL_Y = 1.12  # the mantel shelf's underside; the letter's hook hangs from it
MANTEL_OUT = 0.36


def fireplace(i, t):
    """The study fireplace: a chimney breast from floor to ceiling in the room's wall finish, a
    polished slate surround with pilasters, a frieze and a mantel shelf on corbels, a sooty firebox with an
    iron grate and logs, a stone hearth on the floor."""
    W, back = t["widthM"], t["backM"] - FACE_GAP
    breast_m = surface(t.get("wall", "worn_cracked_plaster"), 1.4)
    # Polished black slate unless a texture is named: a tiled texture reads as brickwork at this size.
    stone = surface(t["material"], 0.7) if t.get("material") else plain("black_slate", (0.018, 0.018, 0.02), 0.22)
    soot = plain("firebrick_soot", (0.028, 0.02, 0.016), 0.95)
    ash = plain("ash", (0.09, 0.085, 0.08), 0.95)
    iron = plain("cast_iron", (0.018, 0.018, 0.02), 0.6, 1.0)
    bark = plain("log_bark", (0.045, 0.028, 0.016), 0.9)
    parts = []
    hw = W / 2
    ow, oh = FIRE_OPEN_W / 2, FIRE_OPEN_H
    face = -FIRE_FACE
    bf = face + 0.06  # the breast's face, behind the surround
    top = H - SLAB
    fb = 0.32  # the firebox's back
    # The breast, around the opening.
    parts.append(box(f"fp{i}_breastL", Vector((-hw, bf, 0)), Vector((-ow, back, top)), breast_m))
    parts.append(box(f"fp{i}_breastR", Vector((ow, bf, 0)), Vector((hw, back, top)), breast_m))
    parts.append(box(f"fp{i}_breastT", Vector((-ow, bf, oh)), Vector((ow, back, top)), breast_m))
    for k, sx in enumerate((-1, 1)):
        x0, x1 = sorted((sx * (hw + 0.012), sx * (ow + 0.2)))
        parts.append(box(f"fp{i}_skirt{k}", Vector((x0, bf - 0.012, 0)), Vector((x1, back, 0.16)), stone))
        side = sx * (hw + 0.012)
        parts.append(box(f"fp{i}_sideSkirt{k}", Vector((side - 0.012 * sx, bf - 0.012, 0)), Vector((side, back, 0.16)), stone))
    # The firebox: sooty brick sides, back and roof, ash on its floor.
    parts.append(box(f"fp{i}_fbL", Vector((-ow, face, 0)), Vector((-ow + 0.03, fb, oh)), soot))
    parts.append(box(f"fp{i}_fbR", Vector((ow - 0.03, face, 0)), Vector((ow, fb, oh)), soot))
    parts.append(box(f"fp{i}_fbT", Vector((-ow, face, oh - 0.03)), Vector((ow, fb, oh)), soot))
    parts.append(box(f"fp{i}_fbBack", Vector((-ow, fb - 0.03, 0)), Vector((ow, fb, oh)), soot))
    parts.append(box(f"fp{i}_ash", Vector((-ow + 0.03, face, 0.0)), Vector((ow - 0.03, fb - 0.03, 0.035)), ash))
    # The surround: pilasters, a frieze with a raised panel, corbels and the mantel shelf.
    pw = 0.2
    for k, sx in enumerate((-1, 1)):
        x0, x1 = sorted((sx * ow, sx * (ow + pw)))
        parts.append(box(f"fp{i}_pil{k}", Vector((x0, face, 0.04)), Vector((x1, bf, MANTEL_Y - 0.14)), stone))
        parts.append(bevelled(box(f"fp{i}_base{k}", Vector((x0 - 0.02, face - 0.02, 0.0)), Vector((x1 + 0.02, bf, 0.12)), stone), 0.008))
        parts.append(bevelled(box(f"fp{i}_corbel{k}", Vector((x0 + 0.02, -MANTEL_OUT + 0.06, MANTEL_Y - 0.14)), Vector((x1 - 0.02, bf, MANTEL_Y)), stone), 0.01))
    parts.append(box(f"fp{i}_frieze", Vector((-ow, face, oh)), Vector((ow, bf, MANTEL_Y - 0.03)), stone))
    parts.append(bevelled(box(f"fp{i}_fpanel", Vector((-ow + 0.12, face - 0.012, oh + 0.07)), Vector((ow - 0.12, face, MANTEL_Y - 0.1)), stone), 0.006))
    parts.append(bevelled(box(f"fp{i}_arch", Vector((-ow - 0.01, face - 0.015, oh - 0.02)), Vector((ow + 0.01, face, oh + 0.03)), stone), 0.008))
    parts.append(box(f"fp{i}_bed", Vector((-ow - pw - 0.03, face - 0.03, MANTEL_Y - 0.03)), Vector((ow + pw + 0.03, bf, MANTEL_Y)), stone))
    parts.append(bevelled(box(f"fp{i}_shelf", Vector((-ow - pw - 0.08, -MANTEL_OUT, MANTEL_Y)), Vector((ow + pw + 0.08, bf, MANTEL_Y + 0.055)), stone), 0.014))
    # The hearth: a stone slab on the floor in front.
    parts.append(bevelled(box(f"fp{i}_hearth", Vector((-ow - pw - 0.1, -0.5, 0)), Vector((ow + pw + 0.1, face, 0.025)), stone), 0.006))
    # An iron grate basket on legs, with logs laid in it, and a fender rail.
    gy0, gy1, gz = -0.12, 0.12, 0.1
    for k, x in enumerate((-0.26, 0.26)):
        parts.append(rod(f"fp{i}_gleg{k}a", Vector((x, gy0, 0.03)), Vector((x, gy0, gz + 0.12)), 0.012, iron, 8))
        parts.append(rod(f"fp{i}_gleg{k}b", Vector((x, gy1, 0.03)), Vector((x, gy1, gz)), 0.012, iron, 8))
        parts.append(lathe(f"fp{i}_finial{k}", [(0.0, 0.0), (0.022, 0.0), (0.026, 0.02), (0.012, 0.04), (0.0, 0.05)], Vector((x, gy0, gz + 0.12)), iron, 10))
    for k in range(6):
        y = gy0 + (gy1 - gy0) * k / 5
        parts.append(rod(f"fp{i}_gbar{k}", Vector((-0.26, y, gz)), Vector((0.26, y, gz)), 0.008, iron, 6))
    for k in range(4):
        z = gz + 0.03 * (k + 1)
        parts.append(rod(f"fp{i}_gfront{k}", Vector((-0.26, gy0, z)), Vector((0.26, gy0, z)), 0.006, iron, 6))
    for k, (a, b, z) in enumerate((((-0.22, -0.05), (0.22, -0.02), gz + 0.05), ((-0.2, 0.06), (0.21, 0.04), gz + 0.05), ((-0.16, 0.02), (0.18, -0.03), gz + 0.13))):
        parts.append(rod(f"fp{i}_log{k}", Vector((a[0], a[1], z)), Vector((b[0], b[1], z)), 0.045, bark, 10))
    parts.append(rod(f"fp{i}_fender", Vector((-ow - 0.05, -0.42, 0.09)), Vector((ow + 0.05, -0.42, 0.09)), 0.014, brass_m, 10))
    for k, sx in enumerate((-1, 1)):
        parts.append(rod(f"fp{i}_fside{k}", Vector((sx * (ow + 0.05), -0.42, 0.09)), Vector((sx * (ow + 0.05), face - 0.02, 0.09)), 0.014, brass_m, 10))
        parts.append(rod(f"fp{i}_fpost{k}", Vector((sx * (ow + 0.05), -0.42, 0.025)), Vector((sx * (ow + 0.05), -0.42, 0.09)), 0.01, brass_m, 8))
    join_by_material(parts, f"fireplace_{i}")
    place([o for o in statics if o.name.startswith(f"fireplace_{i}_")], i, "fireplace", t)


# The jewellery box stands on this height (client/src/stations.ts lockboxSpot).
LOCKBOX_TOP = 0.85


def jewel_cabinet(i, t):
    """The side cabinet a relic spot's jewellery box stands on: a moulded top, a drawer over two
    panelled doors, on bun feet. From the wall (+y) to just in front of the box (-y). As a "sideboard"
    it takes its own height (heightM)."""
    W, back, front = t["widthM"], t["backM"] - FACE_GAP, -t["frontM"]
    wood = surface(t.get("material", "dark_wood"), 0.6)
    TOP = t.get("heightM", LOCKBOX_TOP)
    parts = []
    hw = W / 2
    feet, top_t = 0.09, 0.035
    for k, (x, y) in enumerate(((-hw + 0.06, front + 0.06), (hw - 0.06, front + 0.06), (-hw + 0.06, back - 0.06), (hw - 0.06, back - 0.06))):
        parts.append(lathe(f"jc{i}_foot{k}", [(0.0, 0.0), (0.03, 0.0), (0.042, 0.03), (0.036, 0.06), (0.026, feet), (0.0, feet)], Vector((x, y, 0)), wood, 12))
    parts.append(box(f"jc{i}_body", Vector((-hw + 0.02, front + 0.02, feet)), Vector((hw - 0.02, back, TOP - top_t)), wood))
    parts.append(bevelled(box(f"jc{i}_base", Vector((-hw, front, feet)), Vector((hw, back, feet + 0.05)), wood), 0.008))
    parts.append(bevelled(box(f"jc{i}_top", Vector((-hw - 0.02, front - 0.02, TOP - top_t)), Vector((hw + 0.02, back, TOP)), wood), 0.01))
    d0, d1 = TOP - top_t - 0.16, TOP - top_t - 0.02
    parts.append(bevelled(box(f"jc{i}_drawer", Vector((-hw + 0.05, front + 0.005, d0)), Vector((hw - 0.05, front + 0.02, d1)), wood), 0.005, 1))
    for k, sx in enumerate((-1, 1)):
        parts.append(box(f"jc{i}_pull{k}", Vector((sx * 0.2 - 0.04, front - 0.012, (d0 + d1) / 2 - 0.008)), Vector((sx * 0.2 + 0.04, front + 0.005, (d0 + d1) / 2 + 0.008)), brass_m))
        a, b = sorted((sx * 0.004, sx * (hw - 0.05)))
        parts.append(bevelled(box(f"jc{i}_door{k}", Vector((a, front + 0.005, feet + 0.07)), Vector((b, front + 0.02, d0 - 0.02)), wood), 0.005, 1))
        parts.append(bevelled(box(f"jc{i}_panel{k}", Vector((a + 0.05, front - 0.005, feet + 0.13)), Vector((b - 0.05, front + 0.005, d0 - 0.08)), wood), 0.006))
        parts.append(box(f"jc{i}_knob{k}", Vector((sx * 0.035 - 0.01, front - 0.02, 0.5)), Vector((sx * 0.035 + 0.01, front + 0.005, 0.53)), brass_m))
    join_by_material(parts, f"jewelcab_{i}")
    place([o for o in statics if o.name.startswith(f"jewelcab_{i}_")], i, t["kind"], t)


def clothed_table(i, t):
    """A round dining table under a long linen cloth: a flat top with a rounded edge, then a skirt
    that falls to just above the floor, flaring a little and folding more deeply toward the hem."""
    import random
    R, H = t["diameterM"] / 2, t["heightM"]
    rnd = random.Random(t.get("seed", i))
    seg = 160
    # Where the cloth falls from the table's edge it hangs in loose, uneven folds: one every 25 cm
    # or so round the rim, each its own depth.
    folds = rnd.choice((13, 14, 15))
    depth = [rnd.uniform(0.6, 1.4) for _ in range(folds)]
    phase = rnd.uniform(0, math.tau)
    hem = 0.035
    # (height, radius, fold depth) from the middle of the top outward and down.
    rings = [(H + 0.004, R - 0.03, 0.0), (H + 0.003, R - 0.004, 0.0), (H - 0.004, R + 0.008, 0.0), (H - 0.03, R + 0.014, 0.003)]
    steps = 10
    for k in range(1, steps + 1):
        f = k / steps
        rings.append((H - 0.03 - f * (H - 0.03 - hem), R + 0.014 + 0.07 * f * f, 0.06 * f ** 0.7))
    rings.append((hem - 0.006, rings[-1][1] - 0.012, rings[-1][2]))  # the hem turned under
    bm = bmesh.new()
    centre = bm.verts.new((0, 0, H + 0.004))
    grid = []
    for y, r, amp in rings:
        row = []
        for s in range(seg):
            a = s / seg * math.tau
            w = (a * folds / math.tau + phase) % folds
            fold = int(w)
            # A rounded fold outward, its depth eased into the next fold's.
            d0, d1 = depth[fold], depth[(fold + 1) % folds]
            along = w - fold
            dep = d0 + (d1 - d0) * (0.5 - 0.5 * math.cos(along * math.pi))
            rr = r + amp * dep * (0.5 - 0.5 * math.cos(along * math.tau)) - amp * 0.4
            row.append(bm.verts.new((rr * math.cos(a), rr * math.sin(a), y)))
        grid.append(row)
    for s in range(seg):
        bm.faces.new((centre, grid[0][s], grid[0][(s + 1) % seg]))
    for k in range(len(grid) - 1):
        for s in range(seg):
            s2 = (s + 1) % seg
            bm.faces.new((grid[k][s], grid[k + 1][s], grid[k + 1][s2], grid[k][s2]))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    for f in bm.faces:
        f.smooth = True
    place([finish(f"cloth{i}", bm, linen_m)], i, "clothedTable", t)


def back_bar(i, t):
    """The back bar: a panelled cupboard with a serving top, then a shallower case of mirrored bays
    with shelves of bottles, under a cornice. Its back is against the wall at +y; it faces -y."""
    import random
    rnd = random.Random(t.get("seed", i))
    W, D, H = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.6)
    mirror_m = plain("bar_mirror", (0.34, 0.33, 0.3), 0.06, 1.0)
    glass = [plain("glass_green", (0.012, 0.05, 0.018), 0.08), plain("glass_amber", (0.16, 0.06, 0.012), 0.08),
             plain("glass_smoke", (0.05, 0.045, 0.04), 0.08), plain("glass_clear", (0.42, 0.42, 0.38), 0.05)]
    label_m = plain("bottle_label", (0.5, 0.42, 0.28), 0.8)
    parts = []
    hw, back, front = W / 2, D / 2 - FACE_GAP, -D / 2
    low, top_t = 0.92, 0.04
    parts.append(box(f"bb{i}_plinth", Vector((-hw + 0.02, front + 0.03, 0)), Vector((hw - 0.02, back, 0.1)), wood))
    parts.append(box(f"bb{i}_body", Vector((-hw, front + 0.02, 0.1)), Vector((hw, back, low)), wood))
    parts.append(bevelled(box(f"bb{i}_top", Vector((-hw - 0.02, front - 0.02, low)), Vector((hw + 0.02, back, low + top_t)), wood), 0.01))
    bays = max(2, round(W / 0.9))
    bay = W / bays
    for k in range(bays):
        x0, x1 = -hw + k * bay + 0.03, -hw + (k + 1) * bay - 0.03
        xm = (x0 + x1) / 2
        for side, (a, b) in enumerate(((x0, xm - 0.003), (xm + 0.003, x1))):
            parts.append(bevelled(box(f"bb{i}_door{k}_{side}", Vector((a, front + 0.005, 0.16)), Vector((b, front + 0.02, low - 0.06)), wood), 0.005, 1))
            parts.append(bevelled(box(f"bb{i}_panel{k}_{side}", Vector((a + 0.05, front - 0.005, 0.22)), Vector((b - 0.05, front + 0.005, low - 0.12)), wood), 0.006))
            kx = xm + (-0.03 if side == 0 else 0.03)
            parts.append(box(f"bb{i}_knob{k}_{side}", Vector((kx - 0.01, front - 0.02, 0.62)), Vector((kx + 0.01, front + 0.005, 0.65)), brass_m))
    # The upper case: shallower, mirrored at the back of each bay, posts between the bays.
    cd = 0.26
    cf = back - cd
    case0, case1 = low + top_t, H - 0.12
    parts.append(box(f"bb{i}_mirror", Vector((-hw + 0.04, back - 0.02, case0)), Vector((hw - 0.04, back - 0.012, case1)), mirror_m))
    parts.append(box(f"bb{i}_backing", Vector((-hw, back - 0.012, case0)), Vector((hw, back, case1)), wood))
    post = 0.07
    for k in range(bays + 1):
        x = -hw + k * bay
        a, b = max(-hw, x - post / 2), min(hw, x + post / 2)
        parts.append(box(f"bb{i}_post{k}", Vector((a, cf, case0)), Vector((b, back - 0.012, case1)), wood))
    shelves = [case0 + 0.36, case0 + 0.72, case1 - 0.3]
    for k, y in enumerate(shelves):
        parts.append(box(f"bb{i}_shelf{k}", Vector((-hw, cf, y - 0.018)), Vector((hw, back - 0.02, y)), wood))
    parts.append(bevelled(box(f"bb{i}_cornice", Vector((-hw - 0.04, cf - 0.05, case1)), Vector((hw + 0.04, back, case1 + 0.06)), wood), 0.012))
    parts.append(box(f"bb{i}_frieze", Vector((-hw - 0.02, cf - 0.03, case1 + 0.06)), Vector((hw + 0.02, back, H)), wood))
    # Bottles on the serving top's back edge and on every shelf; a few gaps where some were drunk.
    shapes = [  # radius and height pairs, bottom up: wine, spirits, squat liqueur, tall hock
        [(0.0, 0.0), (0.037, 0.0), (0.038, 0.2), (0.03, 0.235), (0.014, 0.26), (0.013, 0.31), (0.016, 0.315), (0.0, 0.315)],
        [(0.0, 0.0), (0.042, 0.0), (0.043, 0.17), (0.036, 0.2), (0.015, 0.22), (0.014, 0.27), (0.017, 0.275), (0.0, 0.275)],
        [(0.0, 0.0), (0.05, 0.0), (0.052, 0.1), (0.04, 0.14), (0.016, 0.16), (0.015, 0.2), (0.018, 0.205), (0.0, 0.205)],
        [(0.0, 0.0), (0.033, 0.0), (0.034, 0.18), (0.02, 0.25), (0.012, 0.3), (0.011, 0.34), (0.014, 0.345), (0.0, 0.345)],
    ]

    def row(name, y, v):
        x = -hw + 0.06
        k = 0
        while x < hw - 0.06:
            if rnd.random() < 0.15:
                x += 0.09
                continue
            shape = rnd.choice(shapes)
            prof = [(r, h * rnd.uniform(0.95, 1.05)) for r, h in shape]
            r0 = prof[1][0]
            if x + r0 > hw - 0.05:
                break
            parts.append(lathe(f"{name}_b{k}", prof, Vector((x + r0, v, y)), rnd.choice(glass), 12))
            if rnd.random() < 0.6:
                hgt = prof[2][1]
                parts.append(lathe(f"{name}_l{k}", [(0.0, hgt * 0.3), (r0 + 0.001, hgt * 0.3), (r0 + 0.001, hgt * 0.62), (0.0, hgt * 0.62)], Vector((x + r0, v, y)), label_m, 12))
            x += 2 * r0 + rnd.uniform(0.012, 0.03)
            k += 1

    row(f"bb{i}_top_row", low + top_t, back - 0.13)
    for k, y in enumerate(shelves):
        row(f"bb{i}_row{k}", y, (cf + back) / 2 - 0.005)
    join_by_material(parts, f"backbar_{i}")
    place([o for o in statics if o.name.startswith(f"backbar_{i}_")], i, "backBar", t)


# The candelabra's candles stand in cups this high (client/src/stations.ts candelabra), in a row
# along x, CANDLE_GAP apart.
CANDLE_BASE, CANDLE_GAP, CANDLES = 1.1, 0.14, 5


def candelabra_stand(i, t):
    """The candelabra task's round pedestal table (its top at 0.75) and a five-light brass
    candelabra: a weighted base, a turned stem, a cross-arm with a drip cup under each candle."""
    wood = surface(t.get("material", "dark_wood"), 0.6)
    parts = []
    top = 0.75
    parts.append(lathe(f"cs{i}_top", [(0.0, top - 0.04), (0.4, top - 0.04), (0.42, top - 0.025), (0.42, top - 0.01), (0.41, top), (0.0, top)], Vector((0, 0, 0)), wood, 48))
    parts.append(lathe(f"cs{i}_column", [(0.0, 0.08), (0.07, 0.08), (0.06, 0.13), (0.045, 0.2), (0.05, 0.3), (0.035, 0.42), (0.04, 0.55), (0.06, 0.62), (0.07, top - 0.04), (0.0, top - 0.04)], Vector((0, 0, 0)), wood, 24))
    for k in range(3):
        a = k / 3 * math.tau + math.pi / 2
        tip = Vector((math.cos(a) * 0.3, math.sin(a) * 0.3, 0.0))
        parts.append(rod(f"cs{i}_foot{k}", Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, 0.12)), tip + Vector((0, 0, 0.03)), 0.028, wood, 10))
        parts.append(lathe(f"cs{i}_pad{k}", [(0.0, 0.0), (0.03, 0.0), (0.034, 0.03), (0.0, 0.03)], tip, wood, 10))
    arm_y = CANDLE_BASE - 0.045
    parts.append(lathe(f"cs{i}_base", [(0.0, top), (0.1, top), (0.1, top + 0.012), (0.075, top + 0.03), (0.03, top + 0.06), (0.0, top + 0.06)], Vector((0, 0, 0)), brass_m, 32))
    parts.append(lathe(f"cs{i}_stem", [(0.0, top + 0.06), (0.018, top + 0.06), (0.014, top + 0.14), (0.03, top + 0.18), (0.014, top + 0.22), (0.012, arm_y - 0.04), (0.022, arm_y - 0.015), (0.0, arm_y - 0.015)], Vector((0, 0, 0)), brass_m, 20))
    half = (CANDLES - 1) / 2 * CANDLE_GAP
    parts.append(rod(f"cs{i}_arm", Vector((-half, 0, arm_y)), Vector((half, 0, arm_y)), 0.011, brass_m, 12))
    for k in range(CANDLES):
        x = -half + k * CANDLE_GAP
        parts.append(rod(f"cs{i}_post{k}", Vector((x, 0, arm_y)), Vector((x, 0, CANDLE_BASE - 0.02)), 0.008, brass_m, 10))
        parts.append(lathe(f"cs{i}_cup{k}", [(0.0, CANDLE_BASE - 0.022), (0.012, CANDLE_BASE - 0.022), (0.036, CANDLE_BASE - 0.006), (0.038, CANDLE_BASE), (0.022, CANDLE_BASE), (0.0, CANDLE_BASE - 0.006)], Vector((x, 0, 0)), brass_m, 20))
    join_by_material(parts, f"candelabra_{i}")
    place([o for o in statics if o.name.startswith(f"candelabra_{i}_")], i, "candelabraStand", t)


# The stove task's range: the game draws its burner plates, flames and knobs (client/src/stations.ts
# stove) on a hotplate this high, the knobs on a panel this far in front of the station's place.
STOVE_TOP, STOVE_FRONT = 0.9, 0.35
RECESS_TOP = 1.75  # the chimney recess's lintel, the mantel shelf on it
MANTEL_D = 0.26


def kitchen_range(i, t):
    """The stove task's cast-iron kitchen range set in a chimney recess: two ovens under a panel (the
    game adds the knobs), a hotplate (the game adds the burners), a brass rail along the front, a
    flue into the chimney; the recess tiled, plaster piers and breast over it with a mantel shelf.
    Faces -y, its back to the wall at +y."""
    W, back = t["widthM"], t["backM"] - FACE_GAP
    tiles = surface(t["tiles"], TILE_M.get(t["tiles"], 1.2))
    breast_m = surface(t.get("wall", "worn_cracked_plaster"), 1.4)
    wood = surface(t.get("material", "dark_wood"), 0.6)
    iron = plain("range_iron", (0.05, 0.05, 0.055), 0.45, 1.0)
    vent_m = plain("range_vent", (0.008, 0.007, 0.006), 0.9)
    parts = []
    hw, front, top = W / 2, -STOVE_FRONT, H - SLAB
    # The range.
    parts.append(box(f"kr{i}_plinth", Vector((-hw + 0.03, front + 0.04, 0)), Vector((hw - 0.03, back, 0.08)), iron))
    parts.append(box(f"kr{i}_body", Vector((-hw, front + 0.02, 0.08)), Vector((hw, back, STOVE_TOP - 0.03)), iron))
    parts.append(bevelled(box(f"kr{i}_plate", Vector((-hw - 0.015, front - 0.025, STOVE_TOP - 0.03)), Vector((hw + 0.015, back, STOVE_TOP)), iron), 0.006))
    # The knob panel, a brass bead along its top and bottom edges.
    pw_ = 0.58
    parts.append(box(f"kr{i}_panel", Vector((-pw_, front, 0.6)), Vector((pw_, front + 0.02, 0.86)), iron))
    for k, z in enumerate((0.6, 0.86)):
        parts.append(rod(f"kr{i}_bead{k}", Vector((-pw_, front - 0.002, z)), Vector((pw_, front - 0.002, z)), 0.006, brass_m, 8))
    # Two ovens under it, each a door with a raised panel, a brass handle and hinges.
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * 0.04, sx * (hw - 0.05)))
        parts.append(bevelled(box(f"kr{i}_oven{k}", Vector((a, front, 0.14)), Vector((b, front + 0.02, 0.55)), iron), 0.006, 1))
        parts.append(bevelled(box(f"kr{i}_ovenp{k}", Vector((a + 0.06, front - 0.01, 0.2)), Vector((b - 0.06, front, 0.44)), iron), 0.008))
        h0, h1 = a + 0.09, b - 0.09
        parts.append(rod(f"kr{i}_handle{k}", Vector((h0, front - 0.045, 0.5)), Vector((h1, front - 0.045, 0.5)), 0.009, brass_m, 10))
        for j, hx in enumerate((h0, h1)):
            parts.append(rod(f"kr{i}_hpost{k}_{j}", Vector((hx, front, 0.5)), Vector((hx, front - 0.045, 0.5)), 0.006, brass_m, 8))
        hinge = b + 0.01 if sx > 0 else a - 0.01
        for j, z in enumerate((0.19, 0.5)):
            parts.append(rod(f"kr{i}_hinge{k}_{j}", Vector((hinge, front + 0.005, z - 0.03)), Vector((hinge, front + 0.005, z + 0.03)), 0.011, iron, 10))
        # A small fire door either side of the panel, with vent slots.
        f0, f1 = sorted((sx * (pw_ + 0.03), sx * (hw - 0.03)))
        parts.append(bevelled(box(f"kr{i}_fire{k}", Vector((f0, front, 0.62)), Vector((f1, front + 0.02, 0.84)), iron), 0.005, 1))
        for j in range(4):
            z = 0.66 + j * 0.04
            parts.append(box(f"kr{i}_vent{k}_{j}", Vector((f0 + 0.025, front - 0.002, z)), Vector((f1 - 0.025, front, z + 0.012)), vent_m))
    # A brass rail across the front on brackets, under the knobs.
    rz, ry = 0.575, front - 0.075
    parts.append(rod(f"kr{i}_rail", Vector((-hw + 0.01, ry, rz)), Vector((hw - 0.01, ry, rz)), 0.013, brass_m, 14))
    for k, sx in enumerate((-1, 1)):
        x = sx * (hw - 0.04)
        parts.append(rod(f"kr{i}_bracket{k}", Vector((x, front + 0.02, rz)), Vector((x, ry, rz)), 0.009, brass_m, 10))
    # The flue from the hotplate's back up into the chimney, a damper collar on it.
    fy = back - 0.085
    parts.append(rod(f"kr{i}_flue", Vector((0, fy, STOVE_TOP)), Vector((0, fy, RECESS_TOP)), 0.07, iron, 20))
    parts.append(rod(f"kr{i}_collar", Vector((0, fy, 1.25)), Vector((0, fy, 1.29)), 0.078, iron, 20))
    parts.append(rod(f"kr{i}_damper", Vector((-0.11, fy, 1.27)), Vector((0.11, fy, 1.27)), 0.007, brass_m, 8))
    # The recess: tiles behind the range, piers either side (tiled to the dado like the walls, plaster
    # above), the breast over it to the ceiling.
    out = -0.15
    parts.append(box(f"kr{i}_splash", Vector((-hw, back - 0.008, STOVE_TOP)), Vector((hw, back, RECESS_TOP)), tiles))
    pier = 0.25
    split = t.get("tilesM", 1.5)
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * hw, sx * (hw + pier)))
        parts.append(box(f"kr{i}_pierT{k}", Vector((a, out, 0)), Vector((b, back, split)), tiles))
        parts.append(box(f"kr{i}_pierP{k}", Vector((a, out, split)), Vector((b, back, RECESS_TOP)), breast_m))
        # Skirting and the dado rail round the pier's front and outer side, as on the walls.
        o0, o1 = sorted((sx * (hw + pier), sx * (hw + pier + 0.025)))
        fa, fb = sorted((sx * hw, sx * (hw + pier + 0.025)))
        parts.append(box(f"kr{i}_skirtF{k}", Vector((fa, out - 0.025, 0)), Vector((fb, out, 0.16)), wood))
        parts.append(box(f"kr{i}_skirtS{k}", Vector((o0, out - 0.025, 0)), Vector((o1, back, 0.16)), wood))
        ra, rb = sorted((sx * hw, sx * (hw + pier + 0.03)))
        r0, r1 = sorted((sx * (hw + pier), sx * (hw + pier + 0.03)))
        parts.append(box(f"kr{i}_railF{k}", Vector((ra, out - 0.03, split - 0.03)), Vector((rb, out, split + 0.03)), wood))
        parts.append(box(f"kr{i}_railS{k}", Vector((r0, out - 0.03, split - 0.03)), Vector((r1, back, split + 0.03)), wood))
    edge = hw + pier
    parts.append(box(f"kr{i}_breast", Vector((-edge, out, RECESS_TOP)), Vector((edge, back, top)), breast_m))
    parts.append(box(f"kr{i}_crownF", Vector((-edge - 0.06, out - 0.06, top - 0.14)), Vector((edge + 0.06, out, top)), wood))
    for k, sx in enumerate((-1, 1)):
        o0, o1 = sorted((sx * edge, sx * (edge + 0.06)))
        parts.append(box(f"kr{i}_crownS{k}", Vector((o0, out - 0.06, top - 0.14)), Vector((o1, back, top)), wood))
    # The mantel: a board across the lintel, a shelf on it, a bracket under each end.
    parts.append(box(f"kr{i}_fascia", Vector((-edge, out - 0.02, RECESS_TOP - 0.16)), Vector((edge, out, RECESS_TOP)), wood))
    parts.append(box(f"kr{i}_lintel", Vector((-hw, out, RECESS_TOP - 0.16)), Vector((hw, back, RECESS_TOP)), breast_m))
    parts.append(bevelled(box(f"kr{i}_shelf", Vector((-edge - 0.06, out - MANTEL_D, RECESS_TOP)), Vector((edge + 0.06, out, RECESS_TOP + 0.045)), wood), 0.01))
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * (edge - 0.03), sx * (edge - 0.09)))
        parts.append(bevelled(box(f"kr{i}_corbel{k}", Vector((a, out - MANTEL_D + 0.04, RECESS_TOP - 0.2)), Vector((b, out - 0.02, RECESS_TOP)), wood), 0.01))
    join_by_material(parts, f"range_{i}")
    place([o for o in statics if o.name.startswith(f"range_{i}_")], i, "kitchenRange", t)


def turned_leg(name, x, y, z1, r, mat):
    """A turned table leg standing at (x, y) up to z1: a foot, a taper, a bulb, rings."""
    h = z1
    prof = [(0.0, 0.0), (r * 0.75, 0.0), (r * 0.8, 0.03), (r * 0.6, 0.06), (r * 0.62, 0.3 * h), (r * 0.95, 0.5 * h),
            (r * 1.05, 0.6 * h), (r * 0.85, 0.7 * h), (r * 0.7, 0.78 * h), (r * 0.9, 0.84 * h), (r * 0.7, 0.9 * h), (r * 0.75, h), (0.0, h)]
    return lathe(name, prof, Vector((x, y, 0)), mat, 16)


def work_table(i, t):
    """A kitchen work table: a thick scrubbed-pine top, aprons with a row of drawers down each long
    side, four turned legs, a pot-board low down. Long side along x."""
    L, W, Ht = t["lengthM"], t["widthM"], t["heightM"]
    top_m = surface(t.get("top", "scrubbed_wood"), 0.9)
    wood = surface(t.get("material", "dark_wood"), 0.7)
    parts = []
    hl, hw = L / 2, W / 2
    top_t, apron = 0.07, 0.17
    parts.append(bevelled(box(f"wt{i}_top", Vector((-hl, -hw, Ht - top_t)), Vector((hl, hw, Ht)), top_m), 0.012))
    lx, ly, leg = hl - 0.13, hw - 0.12, 0.09
    a0, a1 = Ht - top_t - apron, Ht - top_t
    for k, (x, y) in enumerate(((-lx, -ly), (lx, -ly), (-lx, ly), (lx, ly))):
        parts.append(box(f"wt{i}_block{k}", Vector((x - leg / 2, y - leg / 2, a0)), Vector((x + leg / 2, y + leg / 2, a1)), wood))
        parts.append(turned_leg(f"wt{i}_leg{k}", x, y, a0, leg / 2, wood))
    # The aprons, and drawers in the long ones.
    parts.append(box(f"wt{i}_apronE0", Vector((-lx, -ly - leg / 2, a0)), Vector((-lx + 0.025, ly + leg / 2, a1)), wood))
    parts.append(box(f"wt{i}_apronE1", Vector((lx - 0.025, -ly - leg / 2, a0)), Vector((lx, ly + leg / 2, a1)), wood))
    n = max(1, round((2 * lx - leg) / 0.75))
    span = (2 * lx - leg) / n
    for side, sy in enumerate((-1, 1)):
        y0, y1 = sorted((sy * (ly + leg / 2), sy * (ly + leg / 2 - 0.025)))
        parts.append(box(f"wt{i}_apron{side}", Vector((-lx, y0, a0)), Vector((lx, y1, a1)), wood))
        face = sy * (ly + leg / 2)
        for k in range(n):
            x0 = -lx + leg / 2 + k * span + 0.025
            x1 = x0 + span - 0.05
            f0, f1 = sorted((face, face + sy * 0.012))
            parts.append(bevelled(box(f"wt{i}_drawer{side}_{k}", Vector((x0, f0, a0 + 0.02)), Vector((x1, f1, a1 - 0.015)), wood), 0.004, 1))
            parts.append(lathe(f"wt{i}_knob{side}_{k}", [(0.0, 0.0), (0.012, 0.0), (0.014, 0.012), (0.02, 0.026), (0.016, 0.034), (0.0, 0.036)],
                               Vector(((x0 + x1) / 2, face + sy * 0.012, (a0 + a1) / 2 + 0.003)), wood, 12,
                               Matrix.Rotation(math.radians(-90 * sy), 4, "X")))
    # The pot-board, between the legs low down.
    parts.append(box(f"wt{i}_board", Vector((-lx, -ly, 0.13)), Vector((lx, ly, 0.16)), top_m))
    join_by_material(parts, f"worktable_{i}")
    place([o for o in statics if o.name.startswith(f"worktable_{i}_")], i, "workTable", t)


def kitchen_counter(i, t):
    """Base cupboards along a wall under a scrubbed top: a recessed plinth, a drawer over a panelled
    door in each bay. With sinkX, a glazed fireclay sink let in there on brick piers in an open bay,
    brass pillar taps on the wall above it. Faces -y, its back to the wall at +y."""
    L, D, Ht = t["lengthM"], t["depthM"], t["heightM"]
    top_m = surface(t.get("top", "scrubbed_wood"), 0.9)
    wood = surface(t.get("material", "dark_wood"), 0.7)
    clay = plain("fireclay", (0.5, 0.48, 0.43), 0.3)
    dark = plain("cupboard_dark", (0.02, 0.015, 0.012), 0.9)
    parts = []
    hl, back, front = L / 2, D / 2 - FACE_GAP, -D / 2
    top_t = 0.045
    body_top = Ht - top_t
    sink = t.get("sinkX")
    sw, sd, sh, wall_t = 0.62, 0.46, 0.25, 0.04
    gaps = [(sink - sw / 2 - 0.03, sink + sw / 2 + 0.03)] if sink is not None else []
    # Runs of cupboards between the ends and the sink's bay.
    edges = [-hl] + [e for g in gaps for e in g] + [hl]
    runs = [(edges[k], edges[k + 1]) for k in range(0, len(edges), 2)]
    for r, (x0, x1) in enumerate(runs):
        if x1 - x0 < 0.05:
            continue
        parts.append(box(f"kc{i}_plinth{r}", Vector((x0, front + 0.07, 0)), Vector((x1, back, 0.1)), wood))
        parts.append(box(f"kc{i}_body{r}", Vector((x0, front + 0.02, 0.1)), Vector((x1, back, body_top)), wood))
        n = max(1, round((x1 - x0) / 0.6))
        bay = (x1 - x0) / n
        for k in range(n):
            b0, b1 = x0 + k * bay + 0.012, x0 + (k + 1) * bay - 0.012
            m = (b0 + b1) / 2
            parts.append(bevelled(box(f"kc{i}_drawer{r}_{k}", Vector((b0, front, body_top - 0.17)), Vector((b1, front + 0.02, body_top - 0.025)), wood), 0.004, 1))
            parts.append(box(f"kc{i}_pull{r}_{k}", Vector((m - 0.05, front - 0.012, body_top - 0.105)), Vector((m + 0.05, front, body_top - 0.09)), brass_m))
            parts.append(bevelled(box(f"kc{i}_door{r}_{k}", Vector((b0, front, 0.13)), Vector((b1, front + 0.02, body_top - 0.2)), wood), 0.004, 1))
            parts.append(bevelled(box(f"kc{i}_panel{r}_{k}", Vector((b0 + 0.06, front - 0.008, 0.2)), Vector((b1 - 0.06, front, body_top - 0.27)), wood), 0.006))
            parts.append(lathe(f"kc{i}_knob{r}_{k}", [(0.0, 0.0), (0.01, 0.0), (0.012, 0.01), (0.017, 0.022), (0.013, 0.03), (0.0, 0.032)],
                               Vector((b1 - 0.05, front, body_top - 0.3)), brass_m, 12, Matrix.Rotation(math.radians(90), 4, "X")))
        parts.append(bevelled(box(f"kc{i}_top{r}", Vector((x0, front - 0.025, body_top)), Vector((x1, back, Ht)), top_m), 0.006))
    if sink is not None:
        g0, g1 = gaps[0]
        s0, s1 = sink - sw / 2, sink + sw / 2
        y0, y1 = front - 0.01, front - 0.01 + sd
        z0 = Ht - sh
        # The open bay under the sink: a dark back, a strip of top behind the sink.
        parts.append(box(f"kc{i}_bayback", Vector((g0, back - 0.02, 0)), Vector((g1, back, Ht)), dark))
        parts.append(bevelled(box(f"kc{i}_topback", Vector((g0, y1, body_top)), Vector((g1, back - 0.02, Ht)), top_m), 0.006))
        parts.append(bevelled(box(f"kc{i}_sinkF", Vector((s0, y0, z0)), Vector((s1, y0 + wall_t, Ht + 0.01)), clay), 0.01))
        parts.append(bevelled(box(f"kc{i}_sinkB", Vector((s0, y1 - wall_t, z0)), Vector((s1, y1, Ht + 0.01)), clay), 0.01))
        for k, (a, b) in enumerate(((s0, s0 + wall_t), (s1 - wall_t, s1))):
            parts.append(bevelled(box(f"kc{i}_sinkS{k}", Vector((a, y0, z0)), Vector((b, y1, Ht + 0.01)), clay), 0.01))
        parts.append(box(f"kc{i}_sinkBase", Vector((s0, y0, z0)), Vector((s1, y1, z0 + wall_t)), clay))
        parts.append(lathe(f"kc{i}_plughole", [(0.0, 0.0), (0.03, 0.0), (0.03, 0.002), (0.0, 0.002)], Vector((sink, (y0 + y1) / 2, z0 + wall_t)), dark, 16))
        # Brick piers hold the sink up in the open bay.
        brick = plain("sink_brick", (0.16, 0.06, 0.04), 0.9)
        for k, x in enumerate((s0 + 0.07, s1 - 0.07)):
            parts.append(box(f"kc{i}_pier{k}", Vector((x - 0.055, y0 + 0.06, 0)), Vector((x + 0.055, y1 - 0.02, z0)), brick))
        # Two brass pillar taps out of the wall, their spouts over the sink, crossheads on top.
        tz = Ht + 0.3
        spout_y = (y0 + y1) / 2 + 0.08
        for k, x in enumerate((sink - 0.12, sink + 0.12)):
            parts.append(lathe(f"kc{i}_rose{k}", [(0.0, 0.0), (0.03, 0.0), (0.025, 0.012), (0.0, 0.014)], Vector((x, back, tz)), brass_m, 12, Matrix.Rotation(math.radians(90), 4, "X")))
            parts.append(rod(f"kc{i}_pipe{k}", Vector((x, back, tz)), Vector((x, spout_y, tz)), 0.011, brass_m, 12))
            parts.append(rod(f"kc{i}_spout{k}", Vector((x, spout_y, tz + 0.01)), Vector((x, spout_y, tz - 0.07)), 0.013, brass_m, 12))
            parts.append(rod(f"kc{i}_stem{k}", Vector((x, spout_y, tz)), Vector((x, spout_y, tz + 0.06)), 0.007, brass_m, 8))
            parts.append(rod(f"kc{i}_cross{k}", Vector((x - 0.035, spout_y, tz + 0.06)), Vector((x + 0.035, spout_y, tz + 0.06)), 0.006, brass_m, 8))
    join_by_material(parts, f"counter_{i}")
    place([o for o in statics if o.name.startswith(f"counter_{i}_")], i, "kitchenCounter", t)


def chain(name, x, y, z0, z1, parts, mat):
    """A chain of oval links from z1 down to z0 at (x, y), each link turned a quarter from the last,
    and a cup on the ceiling it hangs from."""
    R, r, pitch = 0.009, 0.0024, 0.024
    ring = [(R + r * math.cos(a), r * math.sin(a)) for a in (math.tau * k / 6 for k in range(7))]
    upright = Matrix.Rotation(math.radians(90), 4, "X")
    stretch = Matrix.Diagonal((1.0, 1.0, 1.65, 1.0))
    n = max(1, int((z1 - z0) / pitch))
    for k in range(n):
        z = z1 - (k + 0.5) * pitch
        turn = Matrix.Rotation(math.radians(90 * (k % 2)), 4, "Z")
        parts.append(lathe(f"{name}_l{k}", ring, Vector((x, y, z)), mat, 8, turn @ stretch @ upright))
    parts.append(lathe(f"{name}_cup", [(0.0, 0.0), (0.012, 0.0), (0.03, 0.03), (0.04, 0.035), (0.0, 0.035)], Vector((x, y, z1 - 0.035)), mat, 16))


def hanging_chain(i, t):
    """A chain from the ceiling for a lamp (a prop) to hang from."""
    iron = plain("wrought_iron", (0.035, 0.034, 0.036), 0.55, 1.0)
    parts = []
    chain(f"hc{i}", 0.0, 0.0, t["bottomM"], H - SLAB, parts, iron)
    join_by_material(parts, f"hchain_{i}")
    place([o for o in statics if o.name.startswith(f"hchain_{i}_")], i, "chain", t)


def pan_rack(i, t):
    """A wrought-iron pan rack hung on four chains, a rail along each long side with S-hooks, copper
    pans and saucepans hanging from them by their handles. Long side along x."""
    import random
    rnd = random.Random(t.get("seed", i))
    L, W, Hr = t["lengthM"], t["widthM"], t["heightM"]
    iron = plain("wrought_iron", (0.035, 0.034, 0.036), 0.55, 1.0)
    copper = plain("copper", (0.45, 0.22, 0.12), 0.6, 1.0)
    tin = plain("pan_tin", (0.4, 0.4, 0.38), 0.6, 1.0)
    parts = []
    hl, hw = L / 2, W / 2
    for k, y in enumerate((-hw, hw)):
        parts.append(rod(f"pr{i}_rail{k}", Vector((-hl, y, Hr)), Vector((hl, y, Hr)), 0.011, iron, 10))
    for k, x in enumerate((-hl, hl)):
        parts.append(rod(f"pr{i}_end{k}", Vector((x, -hw, Hr)), Vector((x, hw, Hr)), 0.011, iron, 10))
    parts.append(rod(f"pr{i}_mid", Vector((0, -hw, Hr)), Vector((0, hw, Hr)), 0.009, iron, 10))
    for k, (x, y) in enumerate(((-hl, -hw), (hl, -hw), (-hl, hw), (hl, hw))):
        parts.append(lathe(f"pr{i}_knob{k}", [(0.0, -0.02), (0.016, -0.012), (0.02, 0.0), (0.016, 0.012), (0.0, 0.02)], Vector((x, y, Hr)), iron, 12))
        chain(f"pr{i}_c{k}", x, y, Hr + 0.02, H - SLAB, parts, iron)
    # Pans on S-hooks along both rails, of mixed sizes, hung by their handles with their bottoms
    # facing out from the rack (their insides catch the torch like mirrors).
    for side, y in enumerate((-hw, hw)):
        out = -1 if side == 0 else 1
        x = -hl + 0.2
        k = 0
        while True:
            r = rnd.choice((0.085, 0.1, 0.12, 0.14))
            if x + r > hl - 0.08:
                break
            deep = rnd.choice((0.05, 0.065)) if r > 0.09 else 0.1
            hook_z = Hr - 0.07
            parts.append(rod(f"pr{i}_hook{side}_{k}", Vector((x, y, Hr)), Vector((x, y, hook_z)), 0.004, iron, 6))
            handle = 0.14 + r * 0.5
            rim_top = hook_z - handle
            mat = copper if rnd.random() < 0.8 else tin
            # Turned with its axis along y: the base out, the open side toward the rack's middle.
            prof = [(0.0, 0.0), (r * 0.82, 0.0), (r * 0.9, 0.004), (r, deep), (r + 0.006, deep + 0.002), (r - 0.004, deep + 0.004),
                    (r * 0.9 - 0.004, 0.006), (0.0, 0.006)]
            turn = Matrix.Rotation(math.radians(90 * out), 4, "X")
            parts.append(lathe(f"pr{i}_pan{side}_{k}", prof, Vector((x, y + out * (0.012 + deep + 0.004), rim_top - r)), mat, 24, turn))
            parts.append(rod(f"pr{i}_handle{side}_{k}", Vector((x, y + out * (0.012 + deep / 2), rim_top - 0.01)), Vector((x, y, hook_z)), 0.008, copper if mat is copper else iron, 8))
            x += 2 * r + 0.06
            k += 1
    join_by_material(parts, f"panrack_{i}")
    place([o for o in statics if o.name.startswith(f"panrack_{i}_")], i, "panRack", t)


# The piano task's upright piano: the game draws its keys and the card on its music desk
# (client/src/stations.ts piano): keys from 0.765 up, between these distances in front of the
# station's place, the card leaning on a ledge at the desk.
PIANO_KEYS_FRONT, PIANO_KEYS_BACK, PIANO_KEYBED = 0.56, 0.2, 0.765
PIANO_DESK = 0.93


def gilt_m():
    # Rubbed gilding: rough enough not to flare white under the torch.
    return plain("gilt", (0.5, 0.36, 0.14), 0.55, 1.0)


def candle(name, x, y, z, parts, h=0.12, lit=True):
    """An ivory candle standing at (x, y, z) with a small glowing flame (none when burnt out)."""
    wax = plain("candle_wax", (0.7, 0.66, 0.56), 0.6)
    flame = plain("candle_flame", (1.0, 0.75, 0.4), 0.5, 0.0, ((1.0, 0.62, 0.25), 6.0))
    parts.append(lathe(f"{name}_wax", [(0.0, 0.0), (0.013, 0.0), (0.013, h), (0.011, h + 0.004), (0.0, h + 0.004)], Vector((x, y, z)), wax, 12))
    if not lit:
        # A burnt-out stub: a blackened wick, no flame.
        parts.append(rod(f"{name}_wick", Vector((x, y, z + h + 0.004)), Vector((x, y, z + h + 0.012)), 0.0012, plain("burnt_wick", (0.02, 0.018, 0.016), 0.8), 4))
        return
    parts.append(lathe(f"{name}_flame", [(0.0, 0.0), (0.006, 0.006), (0.007, 0.014), (0.004, 0.024), (0.0, 0.032)], Vector((x, y, z + h + 0.006)), flame, 8))


def upright_piano(i, t):
    """The piano task's upright piano in rosewood: a panelled case from the floor to a lid, turned
    front legs under the key cheeks, a fallboard folded back, a music desk with a ledge, a fretwork
    panel of silk, brass candle arms either side and two pedals. The game adds the keys and the card.
    Faces -y, its back to the wall at +y."""
    back = t["backM"] - FACE_GAP
    wood = surface(t.get("material", "dark_wood"), 0.5)
    silk = surface(t.get("silk", "velour_velvet_wine"), 0.28)
    parts = []
    hw, kf, kb = 0.75, -PIANO_KEYS_FRONT, -PIANO_KEYS_BACK
    case_f = -0.27
    top = 1.25
    # The carcass: sides, back, lid.
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * (hw - 0.06), sx * hw))
        parts.append(box(f"pn{i}_side{k}", Vector((a, case_f, 0.06)), Vector((b, back, top)), wood))
        # The key cheek: the arm each end of the keys, and the toe block and turned leg under it.
        parts.append(bevelled(box(f"pn{i}_cheek{k}", Vector((sx * (hw - 0.09) if sx < 0 else hw - 0.09, kf - 0.02, 0.7)), Vector((sx * hw if sx < 0 else hw, kb, 0.88)), wood), 0.012))
        parts.append(bevelled(box(f"pn{i}_toe{k}", Vector((a, kf + 0.02, 0)), Vector((b, case_f, 0.07)), wood), 0.008))
        parts.append(lathe(f"pn{i}_leg{k}", [(0.0, 0.0), (0.03, 0.0), (0.032, 0.03), (0.022, 0.08), (0.024, 0.32), (0.04, 0.42), (0.042, 0.5),
                                             (0.03, 0.56), (0.034, 0.6), (0.03, 0.63), (0.0, 0.63)], Vector((sx * (hw - 0.04), kf + 0.07, 0.07)), wood, 14))
    parts.append(box(f"pn{i}_back", Vector((-hw, back - 0.02, 0)), Vector((hw, back, top)), wood))
    parts.append(box(f"pn{i}_plinth", Vector((-hw + 0.06, case_f + 0.06, 0)), Vector((hw - 0.06, back, 0.07)), wood))
    parts.append(bevelled(box(f"pn{i}_lid", Vector((-hw - 0.02, case_f - 0.02, top)), Vector((hw + 0.02, back, top + 0.04)), wood), 0.012))
    # The bottom board under the keys, a raised panel on it, and the pedals on their rail.
    parts.append(box(f"pn{i}_bottom", Vector((-hw + 0.06, case_f + 0.08, 0.07)), Vector((hw - 0.06, case_f + 0.1, 0.7)), wood))
    parts.append(bevelled(box(f"pn{i}_bpanel", Vector((-0.5, case_f + 0.065, 0.16)), Vector((0.5, case_f + 0.08, 0.6)), wood), 0.008))
    parts.append(box(f"pn{i}_pedalrail", Vector((-0.2, case_f + 0.02, 0.0)), Vector((0.2, case_f + 0.08, 0.05)), wood))
    for k, x in enumerate((-0.07, 0.07)):
        parts.append(box(f"pn{i}_pedal{k}", Vector((x - 0.022, case_f - 0.09, 0.05)), Vector((x + 0.022, case_f + 0.04, 0.065)), brass_m))
    # The keybed and the lip under the keys' front; the fallboard folded back behind them.
    parts.append(bevelled(box(f"pn{i}_keybed", Vector((-hw + 0.09, kf - 0.02, 0.7)), Vector((hw - 0.09, case_f + 0.1, PIANO_KEYBED)), wood), 0.006))
    parts.append(box(f"pn{i}_keyslip", Vector((-hw + 0.09, kf - 0.02, PIANO_KEYBED)), Vector((hw - 0.09, kf + 0.005, PIANO_KEYBED + 0.012)), wood))
    parts.append(box(f"pn{i}_keyback", Vector((-hw + 0.09, kb + 0.002, PIANO_KEYBED)), Vector((hw - 0.09, case_f + 0.1, 0.8)), wood))
    # Its front stops just behind the black keys' back ends.
    parts.append(bevelled(box(f"pn{i}_fall", Vector((-hw + 0.09, case_f + 0.008, 0.8)), Vector((hw - 0.09, kb + 0.005, PIANO_DESK - 0.02)), wood), 0.008))
    # The upper front: the music desk's ledge the card stands on, a silk fretwork panel between two
    # raised panels, all kept behind the card as it leans back (its top is 0.26 out).
    parts.append(bevelled(box(f"pn{i}_ledge", Vector((-0.55, case_f - 0.04, PIANO_DESK - 0.03)), Vector((0.55, case_f + 0.02, PIANO_DESK)), wood), 0.006))
    up = case_f + 0.035
    parts.append(box(f"pn{i}_upper", Vector((-hw + 0.06, up, PIANO_DESK - 0.02)), Vector((hw - 0.06, up + 0.03, top)), wood))
    parts.append(box(f"pn{i}_silk", Vector((-0.3, up - 0.005, PIANO_DESK + 0.05)), Vector((0.3, up - 0.001, top - 0.07)), silk))
    for k, (a, b) in enumerate(((-0.34, -0.3), (0.3, 0.34), (-0.34, 0.34), (-0.34, 0.34))):
        z0, z1 = ((PIANO_DESK + 0.03, top - 0.05), (PIANO_DESK + 0.03, top - 0.05), (PIANO_DESK + 0.03, PIANO_DESK + 0.05), (top - 0.07, top - 0.05))[k]
        parts.append(box(f"pn{i}_fret{k}", Vector((a, up - 0.015, z0)), Vector((b, up, z1)), wood))
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * 0.4, sx * (hw - 0.1)))
        parts.append(bevelled(box(f"pn{i}_upanel{k}", Vector((a, up - 0.013, PIANO_DESK + 0.05)), Vector((b, up, top - 0.06)), wood), 0.006))
        # A brass candle arm out from the case, a candle in its cup.
        ax, ay, az = sx * (hw - 0.12), case_f - 0.17, 1.02
        parts.append(rod(f"pn{i}_arm{k}", Vector((sx * (hw - 0.12), up - 0.013, az + 0.03)), Vector((ax, ay, az)), 0.008, brass_m, 8))
        parts.append(lathe(f"pn{i}_cup{k}", [(0.0, -0.01), (0.012, -0.01), (0.04, 0.012), (0.036, 0.016), (0.02, 0.016), (0.018, 0.03), (0.0, 0.03)], Vector((ax, ay, az)), brass_m, 14))
        candle(f"pn{i}_candle{k}", ax, ay, az + 0.03, parts, 0.11)
    join_by_material(parts, f"piano_{i}")
    place([o for o in statics if o.name.startswith(f"piano_{i}_")], i, "uprightPiano", t)


def pleats(name, x0, x1, y0, z0, z1, mat, rnd, amp=0.05, every=0.16):
    """A pleated cloth hanging against a wall: from x0 to x1 with its back at y0, from z0 up to z1,
    its folds standing out toward -y, each a little different."""
    folds = max(3, round((x1 - x0) / every))
    per = 10
    n = folds * per
    depth = [rnd.uniform(0.7, 1.3) for _ in range(folds)]
    bm = bmesh.new()
    grid = []
    for r in range(11):
        z = z0 + (z1 - z0) * r / 10
        line = []
        for j in range(n + 1):
            fold = min(j // per, folds - 1)
            f = (j % per) / per if j < n else 1.0
            y = y0 - amp * depth[fold] * 0.5 * (1 - math.cos(f * math.tau))
            line.append(bm.verts.new((x0 + (x1 - x0) * j / n, y, z)))
        grid.append(line)
    for r in range(len(grid) - 1):
        for k in range(n):
            bm.faces.new((grid[r][k], grid[r][k + 1], grid[r + 1][k + 1], grid[r + 1][k]))
    for f in bm.faces:
        f.smooth = True
    return finish(name, bm, mat)


def tilted_box(name, a, b, mat, angle, pivot):
    """A box tipped back about the x axis through pivot (a music stand's desk)."""
    ob = box(name, a, b, mat)
    ob.data.transform(Matrix.Translation(pivot) @ Matrix.Rotation(angle, 4, "X") @ Matrix.Translation(-pivot))
    return ob


def bandstand(i, t):
    """The ballroom's bandstand against a wall: a platform of boards with a panelled front and a
    gilt nosing, gold satin pleated across the wall behind it, wine velvet curtains at its sides, a
    pelmet over all, and the band's music stands with music on them. Faces -y, back to the wall."""
    import random
    rnd = random.Random(t.get("seed", i))
    W, D, Ht = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.7)
    satin = surface(t.get("backdrop", "crepe_satin"), 0.265)
    velvet = surface("velour_velvet_wine", 0.28)
    gilt = gilt_m()
    paper = plain("sheet_music", (0.62, 0.58, 0.48), 0.8)
    parts = []
    hw, back, front = W / 2, D / 2 - FACE_GAP, -D / 2
    top = H - SLAB
    # The platform.
    parts.append(box(f"bs{i}_body", Vector((-hw, front + 0.02, 0)), Vector((hw, back, Ht - 0.03)), wood))
    parts.append(box(f"bs{i}_boards", Vector((-hw, front, Ht - 0.03)), Vector((hw, back, Ht)), wood))
    parts.append(rod(f"bs{i}_nosing", Vector((-hw, front, Ht - 0.015)), Vector((hw, front, Ht - 0.015)), 0.018, gilt, 12))
    n = max(2, round(W / 0.8))
    for k in range(n):
        a = -hw + k * W / n + 0.07
        b = -hw + (k + 1) * W / n - 0.07
        parts.append(bevelled(box(f"bs{i}_panel{k}", Vector((a, front + 0.005, 0.1)), Vector((b, front + 0.02, Ht - 0.1)), wood), 0.008))
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * hw, sx * (hw - 0.02)))
        parts.append(box(f"bs{i}_end{k}", Vector((a, front, 0)), Vector((b, back, Ht)), wood))
    # The drapes: gold satin across the wall, velvet curtains at the sides, a pelmet over them.
    span = hw + 0.5
    pelmet = top - 0.35
    # Hung clear of the dado rail, so the panelling never shows between its folds.
    parts.append(pleats(f"bs{i}_satin", -span + 0.4, span - 0.4, back - 0.045, Ht, pelmet, satin, rnd, 0.045, 0.14))
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * (span - 0.6), sx * span))
        parts.append(pleats(f"bs{i}_side{k}", a, b, back - 0.09, 0.0, pelmet, velvet, rnd, 0.09, 0.15))
    parts.append(box(f"bs{i}_pelmet", Vector((-span - 0.05, back - 0.2, pelmet)), Vector((span + 0.05, back, top - 0.12)), velvet))
    for k, z in enumerate((pelmet, top - 0.12)):
        parts.append(rod(f"bs{i}_pelmetbead{k}", Vector((-span - 0.05, back - 0.2, z)), Vector((span + 0.05, back - 0.2, z)), 0.012, gilt, 10))
    # Three music stands with music on them, the band's chairs behind them (props).
    for k, (x, y) in enumerate(t.get("stands", [])):
        z0 = Ht
        for j in range(3):
            a = math.tau * j / 3 + 0.4
            parts.append(rod(f"bs{i}_st{k}_leg{j}", Vector((x + 0.17 * math.cos(a), y + 0.17 * math.sin(a), z0)), Vector((x, y, z0 + 0.22)), 0.006, brass_m, 6))
        parts.append(rod(f"bs{i}_st{k}_post", Vector((x, y, z0 + 0.22)), Vector((x, y, z0 + 1.02)), 0.008, brass_m, 8))
        # The desk faces the player behind it (+y), its top leaning away from them.
        pivot = Vector((x, y, z0 + 1.02))
        tip = math.radians(25)
        parts.append(tilted_box(f"bs{i}_st{k}_desk", Vector((x - 0.24, y - 0.006, z0 + 1.0)), Vector((x + 0.24, y + 0.006, z0 + 1.32)), brass_m, tip, pivot))
        parts.append(tilted_box(f"bs{i}_st{k}_lip", Vector((x - 0.24, y + 0.006, z0 + 1.0)), Vector((x + 0.24, y + 0.03, z0 + 1.012)), brass_m, tip, pivot))
        parts.append(tilted_box(f"bs{i}_st{k}_music", Vector((x - 0.2, y + 0.006, z0 + 1.013)), Vector((x - 0.005, y + 0.008, z0 + 1.29)), paper, tip, pivot))
        parts.append(tilted_box(f"bs{i}_st{k}_music2", Vector((x + 0.005, y + 0.006, z0 + 1.013)), Vector((x + 0.22, y + 0.008, z0 + 1.29)), paper, tip, pivot))
    join_by_material(parts, f"bandstand_{i}")
    place([o for o in statics if o.name.startswith(f"bandstand_{i}_")], i, "bandstand", t)


def gilt_chair(name, x, parts, gilt, cushion):
    """A gilt ballroom chair at (x, 0) facing -y: slim legs with stretchers, a velvet cushion, a
    back of three rails between its posts."""
    seat = 0.43
    sx, sy = 0.19, 0.18
    for j, (lx, ly) in enumerate(((-sx, -sy), (sx, -sy), (-sx, sy), (sx, sy))):
        tip = 0.9 if ly > 0 else seat
        parts.append(rod(f"{name}_leg{j}", Vector((x + lx * 0.92, ly * 0.92, 0)), Vector((x + lx, ly, tip)), 0.013, gilt, 8))
    for j, (a, b) in enumerate((((-sx, -sy), (sx, -sy)), ((-sx, sy), (sx, sy)), ((-sx, -sy), (-sx, sy)), ((sx, -sy), (sx, sy)))):
        parts.append(rod(f"{name}_frame{j}", Vector((x + a[0], a[1], seat - 0.01)), Vector((x + b[0], b[1], seat - 0.01)), 0.012, gilt, 6))
        parts.append(rod(f"{name}_stretch{j}", Vector((x + a[0] * 0.95, a[1] * 0.95, 0.16)), Vector((x + b[0] * 0.95, b[1] * 0.95, 0.16)), 0.007, gilt, 6))
    for j, z in enumerate((0.6, 0.72, 0.88)):
        parts.append(rod(f"{name}_rail{j}", Vector((x - sx, sy, z)), Vector((x + sx, sy, z)), 0.011 if j == 2 else 0.008, gilt, 6))
    parts.append(bevelled(box(f"{name}_cushion", Vector((x - sx + 0.005, -sy + 0.005, seat)), Vector((x + sx - 0.005, sy - 0.005, seat + 0.05)), cushion), 0.015, 2))


def chair_row(i, t):
    """Gilt ballroom chairs in a row along x against a wall, facing -y, evenly spaced."""
    L, n = t["lengthM"], t["count"]
    gilt = gilt_m()
    cushion = surface("velour_velvet_wine", 0.28)
    parts = []
    for k in range(n):
        x = -L / 2 + L * (k + 0.5) / n
        gilt_chair(f"cr{i}_c{k}", x, parts, gilt, cushion)
    join_by_material(parts, f"chairrow_{i}")
    place([o for o in statics if o.name.startswith(f"chairrow_{i}_")], i, "chairRow", t)


def pier_mirror(i, t):
    """A tall gilt pier mirror flat on a wall: a moulded frame, a bead inside it and a crest. Placed
    at the wall's face (x, z), facing out of it (south at turn 0); y is its bottom edge."""
    W, Hm, y0 = t["widthM"], t["heightM"], t["y"]
    gilt = gilt_m()
    # Old silvering gone dark: glossy, but not a metal (a baked lightmap leaves metal black).
    glass = plain("pier_glass", (0.06, 0.065, 0.06), 0.3)
    parts = []
    hw, fw = W / 2, 0.09
    parts.append(box(f"pm{i}_glass", Vector((-hw + fw, -0.03, y0 + fw)), Vector((hw - fw, -0.005, y0 + Hm - fw)), glass))
    for k, (a, b) in enumerate((((-hw, y0), (hw, y0 + fw)), ((-hw, y0 + Hm - fw), (hw, y0 + Hm)), ((-hw, y0), (-hw + fw, y0 + Hm)), ((hw - fw, y0), (hw, y0 + Hm)))):
        parts.append(bevelled(box(f"pm{i}_frame{k}", Vector((a[0], -0.06, a[1])), Vector((b[0], -0.005, b[1])), gilt), 0.02, 2))
    for k, (a, b) in enumerate((((-hw + fw, y0 + fw), (hw - fw, y0 + fw + 0.012)), ((-hw + fw, y0 + Hm - fw - 0.012), (hw - fw, y0 + Hm - fw)),
                                ((-hw + fw, y0 + fw), (-hw + fw + 0.012, y0 + Hm - fw)), ((hw - fw - 0.012, y0 + fw), (hw - fw, y0 + Hm - fw)))):
        parts.append(box(f"pm{i}_bead{k}", Vector((a[0], -0.042, a[1])), Vector((b[0], -0.03, b[1])), gilt))
    # The crest: a cartouche over the frame, a little shell either side.
    parts.append(bevelled(box(f"pm{i}_crest", Vector((-0.16, -0.05, y0 + Hm)), Vector((0.16, -0.005, y0 + Hm + 0.14)), gilt), 0.04, 3))
    for k, sx in enumerate((-1, 1)):
        parts.append(lathe(f"pm{i}_shell{k}", [(0.0, 0.0), (0.05, 0.0), (0.045, 0.02), (0.0, 0.03)], Vector((sx * 0.22, -0.005, y0 + Hm + 0.03)), gilt, 12, Matrix.Rotation(math.radians(90), 4, "X")))
    join_by_material(parts, f"mirror_{i}")
    place([o for o in statics if o.name.startswith(f"mirror_{i}_")], i, "pierMirror", t)


def wall_sconce(i, t):
    """A brass two-candle wall sconce at the wall's face (x, z), facing out of it; y is the height
    of its backplate's middle."""
    y = t["y"]
    parts = []
    parts.append(lathe(f"sc{i}_plate", [(0.0, 0.0), (0.05, 0.0), (0.045, 0.015), (0.03, 0.025), (0.012, 0.035), (0.0, 0.04)], Vector((0, 0, y)), brass_m, 16, Matrix.Rotation(math.radians(90), 4, "X")))
    for k, sx in enumerate((-1, 1)):
        ex, ey = sx * 0.13, -0.15
        parts.append(rod(f"sc{i}_arm{k}", Vector((0, -0.03, y)), Vector((ex, ey, y - 0.05)), 0.007, brass_m, 8))
        parts.append(rod(f"sc{i}_up{k}", Vector((ex, ey, y - 0.05)), Vector((ex, ey, y + 0.06)), 0.007, brass_m, 8))
        parts.append(lathe(f"sc{i}_cup{k}", [(0.0, 0.0), (0.014, 0.0), (0.042, 0.02), (0.038, 0.024), (0.02, 0.024), (0.018, 0.04), (0.0, 0.04)], Vector((ex, ey, y + 0.05)), brass_m, 14))
        # A dead sconce's candles burnt down to stubs.
        candle(f"sc{i}_candle{k}", ex, ey, y + 0.09, parts, 0.12 if t.get("lit", True) else 0.035, t.get("lit", True))
    parts.append(lathe(f"sc{i}_drop", [(0.0, -0.08), (0.008, -0.06), (0.014, -0.03), (0.0, 0.0)], Vector((0, -0.03, y)), brass_m, 10))
    join_by_material(parts, f"sconce_{i}")
    place([o for o in statics if o.name.startswith(f"sconce_{i}_")], i, "wallSconce", t)


def text_mesh(name, body, x, y, z, size, mat):
    """Painted lettering standing upright, its middle at (x, y, z), facing -y (Blender's own font)."""
    cu = bpy.data.curves.new(name, "FONT")
    cu.body = body
    cu.size = size
    cu.align_x = "CENTER"
    cu.align_y = "CENTER"
    cu.extrude = 0.0006
    ob = bpy.data.objects.new(f"{name}_curve", cu)
    scene.collection.objects.link(ob)
    bpy.context.view_layer.update()
    ev = ob.evaluated_get(bpy.context.evaluated_depsgraph_get())
    bm = bmesh.new()
    bm.from_mesh(ev.to_mesh())
    ev.to_mesh_clear()
    bpy.data.objects.remove(ob)
    bpy.data.curves.remove(cu)
    # Blender lays text flat facing +z: stood up, its face toward -y.
    bmesh.ops.rotate(bm, verts=bm.verts, matrix=Matrix.Rotation(math.radians(90), 3, "X"))
    bmesh.ops.translate(bm, verts=bm.verts, vec=Vector((x, y, z)))
    return finish(name, bm, mat)


def torus(name, at, r, tube, mat, turn=None, segments=12):
    """A ring of wire (one coil of a bell's spring), turned like lathe's."""
    prof = [(r + tube * math.cos(a), tube * math.sin(a)) for a in (math.tau * k / 8 for k in range(9))]
    return lathe(name, prof, at, mat, segments, turn)


def bench(i, t):
    """A scrubbed deal bench: a thick plank seat on two splayed end frames, a rail under each long
    edge and a stretcher low down. Long side along x."""
    L, W, Ht = t["lengthM"], t["widthM"], t["heightM"]
    wood = surface(t.get("material", "scrubbed_wood"), 0.8)
    parts = []
    hl, hw, seat = L / 2, W / 2, 0.045
    parts.append(bevelled(box(f"bn{i}_seat", Vector((-hl, -hw, Ht - seat)), Vector((hl, hw, Ht)), wood), 0.01))
    ex = hl - 0.14
    for k, sx in enumerate((-1, 1)):
        x = sx * ex
        for j, sy in enumerate((-1, 1)):
            # Each leg splays out a little toward its end.
            parts.append(rod(f"bn{i}_leg{k}_{j}", Vector((x + sx * 0.03, sy * (hw - 0.03), 0)), Vector((x, sy * (hw - 0.07), Ht - seat)), 0.024, wood, 8))
        parts.append(box(f"bn{i}_cross{k}", Vector((x - 0.02, -hw + 0.05, Ht - seat - 0.07)), Vector((x + 0.02, hw - 0.05, Ht - seat)), wood))
        parts.append(box(f"bn{i}_low{k}", Vector((x - 0.015, -hw + 0.04, 0.16)), Vector((x + 0.015, hw - 0.04, 0.2)), wood))
    for j, sy in enumerate((-1, 1)):
        a, b = sorted((sy * (hw - 0.06), sy * (hw - 0.085)))
        parts.append(box(f"bn{i}_rail{j}", Vector((-ex - 0.02, a, Ht - seat - 0.06)), Vector((ex + 0.02, b, Ht - seat)), wood))
    parts.append(box(f"bn{i}_stretch", Vector((-ex, -0.015, 0.17)), Vector((ex, 0.015, 0.21)), wood))
    join_by_material(parts, f"bench_{i}")
    place([o for o in statics if o.name.startswith(f"bench_{i}_")], i, "bench", t)


def bell_board(i, t):
    """The servants' bell board, flat on a wall at its face (x, z) facing out of it: a framed
    mahogany board under a cornice, a brass bell on a coiled spring for each room, and an enamel
    plate under each bell with the room's name. y is the board's bottom edge."""
    W, Hb, y0 = t["widthM"], t["heightM"], t["y"]
    labels = t["labels"]
    rows = t.get("rows", 2)
    wood = surface(t.get("material", "dark_wood"), 0.5)
    enamel = plain("enamel", (0.36, 0.35, 0.32), 0.45)
    ink = plain("enamel_ink", (0.02, 0.02, 0.025), 0.5)
    parts = []
    hw = W / 2
    parts.append(box(f"bb{i}_back", Vector((-hw, -0.025, y0)), Vector((hw, -FACE_GAP, y0 + Hb)), wood))
    fw = 0.045
    for k, (a, b) in enumerate((((-hw, y0), (hw, y0 + fw)), ((-hw, y0 + Hb - fw), (hw, y0 + Hb)), ((-hw, y0), (-hw + fw, y0 + Hb)), ((hw - fw, y0), (hw, y0 + Hb)))):
        parts.append(bevelled(box(f"bb{i}_frame{k}", Vector((a[0], -0.042, a[1])), Vector((b[0], -0.02, b[1])), wood), 0.01, 2))
    parts.append(bevelled(box(f"bb{i}_cornice", Vector((-hw - 0.04, -0.075, y0 + Hb)), Vector((hw + 0.04, -FACE_GAP, y0 + Hb + 0.06)), wood), 0.015, 2))
    cols = math.ceil(len(labels) / rows)
    row_h = (Hb - 2 * fw) / rows
    pitch = (W - 2 * fw) / cols
    upright = Matrix.Rotation(math.radians(90), 4, "X")
    for n, label in enumerate(labels):
        r, c = divmod(n, cols)
        cx = -hw + fw + pitch * (c + 0.5)
        top = y0 + Hb - fw - r * row_h
        cz = top - 0.05
        # The spring: a coil out from the board, an arm bending down to the bell.
        for k in range(6):
            parts.append(torus(f"bb{i}_coil{n}_{k}", Vector((cx, -0.03 - k * 0.008, cz)), 0.014, 0.0028, brass_m, upright))
        parts.append(rod(f"bb{i}_arm{n}a", Vector((cx, -0.075, cz)), Vector((cx, -0.1, cz - 0.03)), 0.003, brass_m, 6))
        parts.append(rod(f"bb{i}_arm{n}b", Vector((cx, -0.1, cz - 0.03)), Vector((cx, -0.1, cz - 0.07)), 0.003, brass_m, 6))
        bz = cz - 0.07
        parts.append(lathe(f"bb{i}_bell{n}", [(0.0, 0.0), (0.008, 0.0), (0.022, -0.012), (0.033, -0.035), (0.04, -0.055), (0.043, -0.062),
                                               (0.038, -0.062), (0.03, -0.04), (0.0, -0.025)], Vector((cx, -0.1, bz)), brass_m, 20))
        parts.append(lathe(f"bb{i}_clapper{n}", [(0.0, -0.06), (0.008, -0.055), (0.009, -0.05), (0.0, -0.045)], Vector((cx, -0.1, bz)), brass_m, 8))
        # The room's name on an enamel plate under it.
        pz = top - row_h + 0.04
        parts.append(bevelled(box(f"bb{i}_plate{n}", Vector((cx - pitch * 0.42, -0.05, pz - 0.022)), Vector((cx + pitch * 0.42, -0.042, pz + 0.022)), enamel), 0.003, 1))
        parts.append(text_mesh(f"bb{i}_name{n}", label, cx, -0.0507, pz, min(0.03, pitch * 0.84 * 1.6 / max(4, len(label))), ink))
    # The bells' wires run up to the ceiling in two iron conduits.
    iron = plain("wrought_iron", (0.035, 0.034, 0.036), 0.55, 1.0)
    for k, x in enumerate((-hw + 0.15, hw - 0.15)):
        parts.append(rod(f"bb{i}_conduit{k}", Vector((x, -0.025, y0 + Hb + 0.06)), Vector((x, -0.025, H - SLAB)), 0.011, iron, 10))
    join_by_material(parts, f"bellboard_{i}")
    place([o for o in statics if o.name.startswith(f"bellboard_{i}_")], i, "bellBoard", t)


def fuse_board(i, t):
    """The hotel's fuse board (the Blackout's fuse box), flat on a wall at its face (x, z) facing out
    of it: a slate panel on a wooden backboard, a main knife switch on porcelain, two rows of
    porcelain fuse carriers, a meter, a DANGER plate, and iron conduits up to the ceiling."""
    W, Hb, y0 = t["widthM"], t["heightM"], t["y"]
    wood = surface(t.get("material", "dark_wood"), 0.5)
    # Under the torch a dark, smooth panel reads white (specular wins) and pale glaze blows out:
    # the slate kept matt, the porcelain a little darker and duller.
    slate = plain("slate", (0.03, 0.032, 0.035), 0.75)
    porcelain = plain("porcelain", (0.25, 0.24, 0.22), 0.6)
    copper = plain("copper_bright", (0.5, 0.26, 0.14), 0.45, 1.0)
    black = plain("ebonite", (0.02, 0.02, 0.02), 0.4)
    iron = plain("wrought_iron", (0.035, 0.034, 0.036), 0.55, 1.0)
    red = plain("danger_red", (0.45, 0.04, 0.03), 0.4)
    enamel = plain("enamel", (0.36, 0.35, 0.32), 0.45)
    parts = []
    hw = W / 2
    parts.append(bevelled(box(f"fb{i}_back", Vector((-hw, -0.03, y0)), Vector((hw, -FACE_GAP, y0 + Hb)), wood), 0.01, 2))
    sw, sh = hw - 0.05, Hb - 0.1
    parts.append(box(f"fb{i}_slate", Vector((-sw, -0.05, y0 + 0.05)), Vector((sw, -0.03, y0 + 0.05 + sh)), slate))
    face = -0.05
    # The main switch near the top: two porcelain bases, copper blades thrown up, a black handle.
    mz = y0 + Hb - 0.22
    for k, x in enumerate((-0.07, 0.07)):
        parts.append(bevelled(box(f"fb{i}_base{k}", Vector((x - 0.03, face - 0.03, mz - 0.1)), Vector((x + 0.03, face, mz + 0.1)), porcelain), 0.006, 1))
        parts.append(box(f"fb{i}_blade{k}", Vector((x - 0.004, face - 0.15, mz - 0.01)), Vector((x + 0.004, face - 0.03, mz + 0.005)), copper))
        parts.append(box(f"fb{i}_jaw{k}", Vector((x - 0.012, face - 0.05, mz - 0.09)), Vector((x + 0.012, face - 0.03, mz - 0.05)), copper))
    parts.append(rod(f"fb{i}_handlebar", Vector((-0.09, face - 0.15, mz - 0.003)), Vector((0.09, face - 0.15, mz - 0.003)), 0.009, black, 10))
    parts.append(lathe(f"fb{i}_knob", [(0.0, 0.0), (0.012, 0.0), (0.016, 0.03), (0.014, 0.06), (0.0, 0.065)], Vector((0, face - 0.15, mz)), black, 12,
                       Matrix.Rotation(math.radians(90), 4, "X")))
    # Two rows of fuse carriers with brass contacts.
    for r, z in enumerate((y0 + 0.47, y0 + 0.3)):
        n = 5
        for k in range(n):
            x = -sw + 0.07 + (2 * sw - 0.14) * k / (n - 1)
            parts.append(bevelled(box(f"fb{i}_fuse{r}_{k}", Vector((x - 0.028, face - 0.045, z - 0.06)), Vector((x + 0.028, face, z + 0.06)), porcelain), 0.008, 1))
            for j, dz in enumerate((-0.045, 0.045)):
                parts.append(lathe(f"fb{i}_cap{r}_{k}_{j}", [(0.0, 0.0), (0.01, 0.0), (0.01, 0.006), (0.0, 0.008)], Vector((x, face - 0.045, z + dz)), brass_m, 10,
                                   Matrix.Rotation(math.radians(90), 4, "X")))
    # The meter: a brass case with a pale dial and a needle.
    my = y0 + Hb - 0.22
    mx = sw - 0.1
    parts.append(lathe(f"fb{i}_meter", [(0.0, 0.0), (0.07, 0.0), (0.072, 0.03), (0.065, 0.035), (0.0, 0.035)], Vector((mx, face, my)), brass_m, 24,
                       Matrix.Rotation(math.radians(90), 4, "X")))
    parts.append(lathe(f"fb{i}_dial", [(0.0, 0.0), (0.058, 0.0), (0.0, 0.001)], Vector((mx, face - 0.0352, my)), porcelain, 24, Matrix.Rotation(math.radians(90), 4, "X")))
    parts.append(box(f"fb{i}_needle", Vector((mx - 0.002, face - 0.0375, my - 0.005)), Vector((mx + 0.045, face - 0.0365, my - 0.001)), black))
    # The warning plate low on the board.
    pz = y0 + 0.12
    parts.append(bevelled(box(f"fb{i}_plate", Vector((-0.16, face - 0.006, pz - 0.035)), Vector((0.16, face, pz + 0.035)), enamel), 0.003, 1))
    parts.append(text_mesh(f"fb{i}_danger", "DANGER", 0, face - 0.0068, pz, 0.045, red))
    # Iron conduits from the top of the board up to the ceiling, each held by a saddle.
    top = H - SLAB
    for k, x in enumerate((-0.2, -0.06, 0.2)):
        parts.append(rod(f"fb{i}_conduit{k}", Vector((x, -0.02, y0 + Hb)), Vector((x, -0.02, top)), 0.013, iron, 10))
        parts.append(lathe(f"fb{i}_saddle{k}", [(0.0, 0.0), (0.02, 0.0), (0.02, 0.025), (0.0, 0.025)], Vector((x, -0.02, y0 + Hb + 0.5)), iron, 10))
    join_by_material(parts, f"fuseboard_{i}")
    place([o for o in statics if o.name.startswith(f"fuseboard_{i}_")], i, "fuseBoard", t)


def linen_shelves(i, t):
    """A linen press against a wall: an open-fronted pine case, its shelves stacked with folded
    sheets and towels in piles of different heights. Faces -y, its back to the wall at +y."""
    import random
    rnd = random.Random(t.get("seed", i))
    W, D, Ht = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "scrubbed_wood"), 0.7)
    # Sheets in cream and grey, towels in faded colours; none brilliant white under the torch.
    cloths = [plain("linen_cream", (0.5, 0.47, 0.4), 0.9), plain("linen_grey", (0.4, 0.4, 0.38), 0.9), plain("linen_oat", (0.45, 0.4, 0.32), 0.9),
              plain("towel_blue", (0.25, 0.3, 0.36), 0.95), plain("towel_rose", (0.45, 0.3, 0.28), 0.95)]
    parts = []
    hw, hd = W / 2, D / 2
    back = hd - FACE_GAP
    side, base = 0.03, 0.1
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * hw, sx * (hw - side)))
        parts.append(box(f"ls{i}_side{k}", Vector((a, -hd, 0)), Vector((b, back, Ht)), wood))
    back -= RAIL_D + 0.006  # the back board clear of a dado's panelling and rail
    parts.append(box(f"ls{i}_back", Vector((-hw + side, back - 0.012, 0)), Vector((hw - side, back, Ht)), wood))
    parts.append(box(f"ls{i}_plinth", Vector((-hw + side, -hd + 0.02, 0)), Vector((hw - side, back, base)), wood))
    parts.append(bevelled(box(f"ls{i}_top", Vector((-hw - 0.02, -hd - 0.025, Ht)), Vector((hw + 0.02, hd - FACE_GAP, Ht + 0.04)), wood), 0.01, 2))
    shelves = t.get("shelves", 4)
    levels = [base + (Ht - base - 0.05) * k / shelves for k in range(shelves)]
    for k, z in enumerate(levels):
        parts.append(box(f"ls{i}_shelf{k}", Vector((-hw + side, -hd + 0.01, z)), Vector((hw - side, back - 0.012, z + 0.022)), wood))
        clear = (levels[k + 1] if k + 1 < len(levels) else Ht) - z - 0.022
        x = -hw + side + 0.025
        n = 0
        while x < hw - side - 0.25:
            sw = min(rnd.uniform(0.3, 0.42), hw - side - 0.02 - x)
            if sw < 0.22:
                break
            sd = rnd.uniform(D - 0.16, D - 0.08)
            y1 = back - 0.03
            zz = z + 0.022
            mat = rnd.choice(cloths)
            want = clear * rnd.uniform(0.45, 0.85)
            j = 0
            while zz < z + 0.022 + want:
                # Folded cloth: soft, rounded edges, each fold a little askew on the one under it.
                th = rnd.uniform(0.045, 0.085)
                jx, jy = rnd.uniform(-0.02, 0.02), rnd.uniform(-0.015, 0.015)
                fw = sw * rnd.uniform(0.9, 1.0)
                parts.append(bevelled(box(f"ls{i}_fold{k}_{n}_{j}", Vector((x + jx, y1 - sd + jy, zz)), Vector((x + fw + jx, y1 + jy, zz + th)), mat), th * 0.45, 4))
                zz += th
                j += 1
                if rnd.random() < 0.35:
                    mat = rnd.choice(cloths)
            x += sw + rnd.uniform(0.03, 0.07)
            n += 1
    join_by_material(parts, f"linen_{i}")
    place([o for o in statics if o.name.startswith(f"linen_{i}_")], i, "linenShelves", t)


ALONG_X = Matrix.Rotation(math.radians(90), 4, "Y")  # a lathe's axis laid along x
DADO_CLEAR = RAIL_D + 0.006  # a back board this far off the wall face clears a dado and its rail


def open_rack(name, W, D, Ht, levels, wood, parts):
    """An open-fronted rack against a wall (back at +y): two sides, a back, a top and shelves at
    the given heights. Returns the back's front face (y)."""
    hw, hd = W / 2, D / 2
    back = hd - FACE_GAP
    side = 0.03
    for k, sx in enumerate((-1, 1)):
        a, b = sorted((sx * hw, sx * (hw - side)))
        parts.append(box(f"{name}_side{k}", Vector((a, -hd, 0)), Vector((b, back, Ht)), wood))
    # The back board stands clear of a dado's panelling and rail (build_room's PANEL_D, RAIL_D),
    # which would otherwise show through it.
    board = back - DADO_CLEAR
    parts.append(box(f"{name}_back", Vector((-hw + side, board - 0.012, 0)), Vector((hw - side, board, Ht)), wood))
    parts.append(bevelled(box(f"{name}_top", Vector((-hw - 0.015, -hd - 0.015, Ht)), Vector((hw + 0.015, back, Ht + 0.03)), wood), 0.008, 2))
    for k, z in enumerate(levels):
        parts.append(box(f"{name}_shelf{k}", Vector((-hw + side, -hd + 0.01, z - 0.022)), Vector((hw - side, board - 0.012, z)), wood))
    return board - 0.012


def battery_rack(i, t):
    """The bells' (and the fuse room's) batteries: a pine rack against a wall, rows of glass cells
    on its shelves, each with a zinc rod and a carbon plate, copper wire from cell to cell, and the
    leads up the wall to the ceiling. Faces -y, back to the wall at +y."""
    W, D, Ht = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "scrubbed_wood"), 0.7)
    glass = plain("cell_glass", (0.16, 0.2, 0.17), 0.2)
    fluid = plain("cell_fluid", (0.22, 0.24, 0.2), 0.5)
    zinc = plain("zinc", (0.4, 0.4, 0.41), 0.5, 1.0)
    carbon = plain("carbon", (0.05, 0.05, 0.05), 0.8)
    copper = plain("copper_bright", (0.5, 0.26, 0.14), 0.45, 1.0)
    rubber = plain("rubber", (0.03, 0.03, 0.03), 0.75)
    parts = []
    tiers = t.get("tiers", 2)
    levels = [0.08 + (Ht - 0.12) * k / tiers for k in range(tiers)]
    back = open_rack(f"br{i}", W, D, Ht, levels, wood, parts)
    hw = W / 2
    n = max(2, int((W - 0.12) // 0.15))
    pitch = (W - 0.12) / n
    for r, z in enumerate(levels):
        tops = []
        for k in range(n):
            x = -hw + 0.06 + pitch * (k + 0.5)
            y = -0.02
            parts.append(lathe(f"br{i}_jar{r}_{k}", [(0.0, 0.0), (0.055, 0.0), (0.058, 0.005), (0.058, 0.17), (0.062, 0.18), (0.052, 0.18), (0.0, 0.17)],
                               Vector((x, y, z)), glass, 18))
            parts.append(lathe(f"br{i}_fluid{r}_{k}", [(0.0, 0.0), (0.054, 0.0), (0.054, 0.12), (0.0, 0.12)], Vector((x, y, z + 0.006)), fluid, 18))
            parts.append(box(f"br{i}_carbon{r}_{k}", Vector((x - 0.025, y - 0.008, z + 0.03)), Vector((x + 0.025, y + 0.008, z + 0.24)), carbon))
            parts.append(rod(f"br{i}_zinc{r}_{k}", Vector((x + 0.035, y + 0.02, z + 0.04)), Vector((x + 0.035, y + 0.02, z + 0.23)), 0.007, zinc, 8))
            parts.append(lathe(f"br{i}_cap{r}_{k}", [(0.0, 0.0), (0.009, 0.0), (0.009, 0.015), (0.0, 0.018)], Vector((x, y, z + 0.24)), brass_m, 8))
            tops.append((x, y, z))
        # Each zinc wired to the next cell's carbon, a little arc over the gap.
        for k in range(n - 1):
            x0, y0, _ = tops[k]
            x1, y1, _ = tops[k + 1]
            a = Vector((x0 + 0.035, y0 + 0.02, z + 0.23))
            m = Vector(((x0 + x1) / 2 + 0.02, y0 + 0.01, z + 0.29))
            b = Vector((x1, y1, z + 0.255))
            parts.append(rod(f"br{i}_link{r}_{k}a", a, m, 0.0025, copper, 5))
            parts.append(rod(f"br{i}_link{r}_{k}b", m, b, 0.0025, copper, 5))
        # The row's two leads to the back and up.
        for j, (x, y, _) in enumerate((tops[0], tops[-1])):
            parts.append(rod(f"br{i}_lead{r}_{j}a", Vector((x + (0.035 if j else 0), y, z + 0.25)), Vector((x, back - 0.015, z + 0.3)), 0.004, rubber, 6))
            parts.append(rod(f"br{i}_lead{r}_{j}b", Vector((x, back - 0.015, z + 0.3)), Vector((x, back - 0.015, Ht)), 0.004, rubber, 6))
    # The leads go on up the wall to the ceiling, clipped to it.
    for j, x in enumerate((-hw + 0.06 + pitch * 0.5, hw - 0.06 - pitch * 0.5)):
        parts.append(rod(f"br{i}_riser{j}", Vector((x, back + 0.005, Ht + 0.03)), Vector((x, back + 0.005, H - SLAB)), 0.006, rubber, 6))
    join_by_material(parts, f"battery_{i}")
    place([o for o in statics if o.name.startswith(f"battery_{i}_")], i, "batteryRack", t)


def dynamo(i, t):
    """The hotel's dynamo: a green-enamelled iron machine on a timber bed, its armature turning
    in a round field frame, a brass commutator and brushes, the shaft in two bearings and a broad
    iron pulley for the engine's belt; heavy cables from its terminals up to the ceiling. Long
    side along x."""
    oak = surface(t.get("material", "dark_wood"), 0.6)
    iron = plain("cast_iron", (0.06, 0.06, 0.065), 0.6, 1.0)
    paint = plain("dynamo_green", (0.07, 0.15, 0.1), 0.55)
    steel = plain("steel_bright", (0.45, 0.45, 0.46), 0.4, 1.0)
    copper = plain("copper_bright", (0.5, 0.26, 0.14), 0.45, 1.0)
    black = plain("ebonite", (0.02, 0.02, 0.02), 0.4)
    rubber = plain("rubber", (0.03, 0.03, 0.03), 0.75)
    enamel = plain("enamel", (0.36, 0.35, 0.32), 0.45)
    ink = plain("enamel_ink", (0.02, 0.02, 0.025), 0.5)
    parts = []
    # The timber bed and the iron bedplate bolted to it.
    parts.append(bevelled(box(f"dy{i}_bed", Vector((-0.75, -0.38, 0)), Vector((0.75, 0.38, 0.14)), oak), 0.012, 2))
    parts.append(bevelled(box(f"dy{i}_plate", Vector((-0.68, -0.3, 0.14)), Vector((0.68, 0.3, 0.2)), iron), 0.01, 2))
    for k, (x, y) in enumerate(((-0.62, -0.25), (-0.62, 0.25), (0.62, -0.25), (0.62, 0.25), (0, -0.25), (0, 0.25))):
        parts.append(lathe(f"dy{i}_bolt{k}", [(0.0, 0.0), (0.018, 0.0), (0.018, 0.015), (0.0, 0.02)], Vector((x, y, 0.2)), iron, 6))
    # The field frame: a round yoke with end rims, on two feet.
    cz = 0.56
    parts.append(lathe(f"dy{i}_yoke", [(0.0, 0.0), (0.27, 0.0), (0.3, 0.02), (0.3, 0.5), (0.27, 0.52), (0.0, 0.52)], Vector((-0.4, 0, cz)), paint, 32, ALONG_X))
    for k, x in enumerate((-0.42, 0.1)):
        parts.append(lathe(f"dy{i}_rim{k}", [(0.0, 0.0), (0.31, 0.0), (0.31, 0.04), (0.0, 0.04)], Vector((x, 0, cz)), iron, 32, ALONG_X))
    for k, sy in enumerate((-1, 1)):
        a, b = sorted((sy * 0.12, sy * 0.28))
        parts.append(box(f"dy{i}_foot{k}", Vector((-0.36, a, 0.2)), Vector((0.06, b, cz - 0.2)), paint))
    # The end shield, bearing pedestals, the shaft, commutator, brushes and the pulley.
    parts.append(lathe(f"dy{i}_shield", [(0.0, 0.0), (0.24, 0.0), (0.2, 0.06), (0.08, 0.1), (0.0, 0.1)], Vector((0.14, 0, cz)), paint, 28, ALONG_X))
    for k, x in enumerate((-0.55, 0.42)):
        parts.append(bevelled(box(f"dy{i}_ped{k}", Vector((x - 0.06, -0.09, 0.2)), Vector((x + 0.06, 0.09, cz - 0.04)), iron), 0.01, 2))
        parts.append(lathe(f"dy{i}_bearing{k}", [(0.0, 0.0), (0.06, 0.0), (0.065, 0.02), (0.065, 0.1), (0.06, 0.12), (0.0, 0.12)], Vector((x - 0.06, 0, cz)), brass_m, 16, ALONG_X))
    parts.append(lathe(f"dy{i}_shaft", [(0.0, 0.0), (0.028, 0.0), (0.028, 1.4), (0.0, 1.4)], Vector((-0.68, 0, cz)), steel, 12, ALONG_X))
    parts.append(lathe(f"dy{i}_comm", [(0.0, 0.0), (0.085, 0.0), (0.085, 0.12), (0.0, 0.12)], Vector((0.25, 0, cz)), copper, 20, ALONG_X))
    for k, sy in enumerate((-1, 1)):
        parts.append(box(f"dy{i}_brush{k}", Vector((0.27, sy * 0.085 - 0.012, cz - 0.015)), Vector((0.35, sy * 0.13, cz + 0.015)), black))
        parts.append(rod(f"dy{i}_brusharm{k}", Vector((0.31, sy * 0.13, cz)), Vector((0.31, sy * 0.13, cz + 0.16)), 0.008, brass_m, 8))
    parts.append(lathe(f"dy{i}_pulley", [(0.0, 0.0), (0.06, 0.0), (0.06, 0.03), (0.16, 0.035), (0.2, 0.0), (0.22, 0.0), (0.22, 0.14), (0.2, 0.14),
                                         (0.16, 0.105), (0.06, 0.11), (0.06, 0.14), (0.0, 0.14)], Vector((0.53, 0, cz)), iron, 32, ALONG_X))
    # The terminal board on top, and its cables up to the ceiling.
    parts.append(bevelled(box(f"dy{i}_tboard", Vector((-0.3, -0.08, cz + 0.29)), Vector((-0.1, 0.08, cz + 0.33)), black), 0.006, 1))
    for k, x in enumerate((-0.25, -0.15)):
        parts.append(lathe(f"dy{i}_term{k}", [(0.0, 0.0), (0.014, 0.0), (0.014, 0.03), (0.0, 0.035)], Vector((x, 0, cz + 0.33)), brass_m, 10))
        parts.append(rod(f"dy{i}_cable{k}a", Vector((x, 0, cz + 0.36)), Vector((x, 0.05, cz + 0.6)), 0.014, rubber, 8))
        parts.append(rod(f"dy{i}_cable{k}b", Vector((x, 0.05, cz + 0.6)), Vector((x, 0.05, H - SLAB)), 0.014, rubber, 8))
    # The maker's plate on the frame's front.
    parts.append(bevelled(box(f"dy{i}_plate_n", Vector((-0.27, -0.307, cz - 0.05)), Vector((-0.03, -0.297, cz + 0.05)), enamel), 0.003, 1))
    parts.append(text_mesh(f"dy{i}_name", "DYNAMO No 2", -0.15, -0.3077, cz, 0.022, ink))
    join_by_material(parts, f"dynamo_{i}")
    place([o for o in statics if o.name.startswith(f"dynamo_{i}_")], i, "dynamo", t)


def cable_drum(i, t):
    """A wooden drum of rubber cable standing on its rims, a loose end trailing to the floor. Its
    axle along x."""
    R, Wd = t["diameterM"] / 2, t["widthM"]
    wood = surface(t.get("material", "scrubbed_wood"), 0.6)
    rubber = plain("rubber", (0.03, 0.03, 0.03), 0.75)
    iron = plain("wrought_iron", (0.035, 0.034, 0.036), 0.55, 1.0)
    parts = []
    hw = Wd / 2
    for k, x in enumerate((-hw, hw - 0.035)):
        parts.append(lathe(f"cd{i}_rim{k}", [(0.0, 0.0), (R, 0.0), (R, 0.035), (0.0, 0.035)], Vector((x, 0, R)), wood, 28, ALONG_X))
        parts.append(lathe(f"cd{i}_hub{k}", [(0.0, 0.0), (0.06, 0.0), (0.06, 0.01), (0.0, 0.01)], Vector((x - 0.01 if k == 0 else x + 0.035, 0, R)), iron, 12, ALONG_X))
    parts.append(lathe(f"cd{i}_coil", [(0.0, 0.0), (R * 0.82, 0.0), (R * 0.84, 0.03), (R * 0.84, Wd - 0.1), (R * 0.82, Wd - 0.07), (0.0, Wd - 0.07)],
                       Vector((-hw + 0.035, 0, R)), rubber, 28, ALONG_X))
    # The loose end, down the front and along the floor.
    a = Vector((hw - 0.1, -R * 0.84, R))
    b = Vector((hw - 0.1, -R - 0.08, 0.15))
    c = Vector((hw - 0.05, -R - 0.25, 0.012))
    d = Vector((hw + 0.15, -R - 0.4, 0.012))
    for k, (p, q) in enumerate(((a, b), (b, c), (c, d))):
        parts.append(rod(f"cd{i}_end{k}", p, q, 0.012, rubber, 8))
    join_by_material(parts, f"drum_{i}")
    place([o for o in statics if o.name.startswith(f"drum_{i}_")], i, "cableDrum", t)


def tool_board(i, t):
    """The electrician's tool board, flat on a wall at its face (x, z) facing out of it: boards
    with each tool hung on its pegs, coils of wire on hooks. y is the board's bottom edge."""
    W, Hb, y0 = t["widthM"], t["heightM"], t["y"]
    wood = surface(t.get("material", "scrubbed_wood"), 0.6)
    steel = plain("tool_steel", (0.3, 0.3, 0.31), 0.5, 1.0)
    handle = surface("dark_wood", 0.3)
    copper = plain("copper_bright", (0.5, 0.26, 0.14), 0.45, 1.0)
    rubber = plain("rubber", (0.03, 0.03, 0.03), 0.75)
    red = plain("danger_red", (0.45, 0.04, 0.03), 0.4)
    parts = []
    hw = W / 2
    nb = max(3, round(W / 0.18))
    bw = W / nb
    for k in range(nb):
        x0 = -hw + k * bw
        parts.append(box(f"tb{i}_board{k}", Vector((x0 + 0.002, -0.022, y0)), Vector((x0 + bw - 0.002, -FACE_GAP, y0 + Hb)), wood))
    f = -0.022
    peg = lambda n, x, z: parts.append(rod(f"tb{i}_peg{n}", Vector((x, f, z)), Vector((x, f - 0.05, z + 0.006)), 0.005, steel, 6))
    top = y0 + Hb - 0.12
    # A hammer, a hand saw, spanners, pliers, screwdrivers, an oilcan and coils of wire.
    x = -hw + 0.12
    peg("h", x, top + 0.02)
    parts.append(rod(f"tb{i}_hammer_h", Vector((x, f - 0.02, top - 0.3)), Vector((x, f - 0.02, top + 0.02)), 0.013, handle, 8))
    parts.append(bevelled(box(f"tb{i}_hammer_head", Vector((x - 0.06, f - 0.04, top - 0.33)), Vector((x + 0.05, f - 0.005, top - 0.3)), steel), 0.006, 1))
    x += 0.2
    peg("s", x + 0.12, top + 0.02)
    parts.append(box(f"tb{i}_saw", Vector((x - 0.02, f - 0.012, top - 0.42)), Vector((x + 0.12, f - 0.01, top - 0.02)), steel))
    parts.append(bevelled(box(f"tb{i}_saw_h", Vector((x + 0.06, f - 0.02, top - 0.05)), Vector((x + 0.16, f - 0.004, top + 0.06)), handle), 0.01, 2))
    x += 0.28
    for k, L in enumerate((0.22, 0.18, 0.15)):
        xx = x + k * 0.06
        peg(f"sp{k}", xx, top + 0.02)
        parts.append(box(f"tb{i}_spanner{k}", Vector((xx - 0.008, f - 0.012, top - L)), Vector((xx + 0.008, f - 0.004, top)), steel))
        parts.append(torus(f"tb{i}_spring{k}", Vector((xx, f - 0.008, top - L)), 0.016, 0.005, steel, Matrix.Rotation(math.radians(90), 4, "X")))
    x += 0.24
    peg("pl", x, top + 0.02)
    for k, s in enumerate((-1, 1)):
        parts.append(rod(f"tb{i}_pliers{k}", Vector((x + s * 0.03, f - 0.015, top - 0.2)), Vector((x - s * 0.006, f - 0.015, top - 0.02)), 0.007, red, 6))
    x += 0.12
    for k in range(3):
        xx = x + k * 0.045
        peg(f"sd{k}", xx, top + 0.02)
        parts.append(lathe(f"tb{i}_sdh{k}", [(0.0, 0.0), (0.012, 0.005), (0.013, 0.08), (0.0, 0.09)], Vector((xx, f - 0.02, top - 0.1)), handle, 8))
        parts.append(rod(f"tb{i}_sdb{k}", Vector((xx, f - 0.02, top - 0.1)), Vector((xx, f - 0.02, top - 0.24 + k * 0.03)), 0.003, steel, 6))
    # Coils of wire hung low, on the left and right.
    for k, (cx, mat) in enumerate(((-hw + 0.22, copper), (hw - 0.22, rubber), (0.05, copper))):
        if cx > hw - 0.15 or cx < -hw + 0.15:
            continue
        cz = y0 + 0.22
        peg(f"coil{k}", cx, cz + 0.11)
        for j in range(5):
            parts.append(torus(f"tb{i}_coil{k}_{j}", Vector((cx + j * 0.002, f - 0.02 - j * 0.006, cz)), 0.1, 0.006, mat, Matrix.Rotation(math.radians(90), 4, "X")))
    join_by_material(parts, f"toolboard_{i}")
    place([o for o in statics if o.name.startswith(f"toolboard_{i}_")], i, "toolBoard", t)


def ladder(i, t):
    """A wooden step ladder leaning on the wall behind it (+y): two stiles from the floor out in
    front to the wall, rungs between them."""
    Ht, W = t["heightM"], t.get("widthM", 0.42)
    wood = surface(t.get("material", "scrubbed_wood"), 0.6)
    parts = []
    out = Ht * 0.25
    back = t.get("depthM", 0.6) / 2 - FACE_GAP - 0.03
    foot, head = Vector((0, back - out, 0)), Vector((0, back, Ht))
    for k, sx in enumerate((-1, 1)):
        a = foot + Vector((sx * W / 2, 0, 0))
        b = head + Vector((sx * W / 2, 0, 0))
        parts.append(rod(f"ld{i}_stile{k}", a, b, 0.024, wood, 6))
    n = int(Ht / 0.28)
    for k in range(1, n + 1):
        p = foot.lerp(head, k / (n + 0.6))
        parts.append(rod(f"ld{i}_rung{k}", p + Vector((-W / 2, 0, 0)), p + Vector((W / 2, 0, 0)), 0.016, wood, 6))
    join_by_material(parts, f"ladder_{i}")
    place([o for o in statics if o.name.startswith(f"ladder_{i}_")], i, "ladder", t)


def store_shelves(i, t):
    """A storeman's open shelves against a wall: boxes of spares, tins, glass bulbs in a tray,
    coils of wire and folded sacking, seeded so each set differs. Faces -y, back to the wall."""
    import random
    rnd = random.Random(t.get("seed", i))
    W, D, Ht = t["widthM"], t["depthM"], t["heightM"]
    wood = surface(t.get("material", "scrubbed_wood"), 0.7)
    card = [plain("card_brown", (0.36, 0.26, 0.16), 0.85), plain("card_grey", (0.3, 0.29, 0.26), 0.85), plain("card_green", (0.2, 0.26, 0.2), 0.85)]
    tin = plain("tin", (0.42, 0.42, 0.43), 0.45, 1.0)
    tin_red = plain("tin_red", (0.35, 0.06, 0.04), 0.45)
    bulb = plain("bulb_glass", (0.4, 0.4, 0.37), 0.25)
    copper = plain("copper_bright", (0.5, 0.26, 0.14), 0.45, 1.0)
    rubber = plain("rubber", (0.03, 0.03, 0.03), 0.75)
    sack = plain("sacking", (0.33, 0.27, 0.19), 0.95)
    parts = []
    shelves = t.get("shelves", 4)
    levels = [0.1 + (Ht - 0.15) * k / shelves for k in range(shelves)]
    back = open_rack(f"ss{i}", W, D, Ht, levels, wood, parts)
    hw = W / 2
    up = Matrix.Rotation(math.radians(90), 4, "X")
    for k, z in enumerate(levels):
        clear = (levels[k + 1] if k + 1 < len(levels) else Ht) - z - 0.03
        x = -hw + 0.06
        n = 0
        while x < hw - 0.2:
            kind = rnd.choice(("box", "box", "tins", "bulbs", "coil", "sack"))
            if kind == "box":
                w, d, h = rnd.uniform(0.18, 0.32), rnd.uniform(D - 0.2, D - 0.08), min(clear * 0.9, rnd.uniform(0.1, 0.24))
                parts.append(bevelled(box(f"ss{i}_box{k}_{n}", Vector((x, back - 0.02 - d, z)), Vector((x + w, back - 0.02, z + h)), rnd.choice(card)), 0.004, 1))
                if rnd.random() < 0.5 and clear > 2 * h:
                    parts.append(bevelled(box(f"ss{i}_box{k}_{n}b", Vector((x + 0.02, back - 0.03 - d * 0.9, z + h)), Vector((x + w - 0.01, back - 0.03, z + h + h * 0.8)), rnd.choice(card)), 0.004, 1))
            elif kind == "tins":
                w = 0.24
                for j in range(3):
                    parts.append(lathe(f"ss{i}_tin{k}_{n}_{j}", [(0.0, 0.0), (0.04, 0.0), (0.04, 0.11), (0.036, 0.115), (0.0, 0.115)],
                                       Vector((x + 0.04 + j * 0.08, -0.03 + (j % 2) * 0.05, z)), rnd.choice((tin, tin, tin_red)), 14))
            elif kind == "bulbs":
                w = 0.3
                parts.append(box(f"ss{i}_tray{k}_{n}", Vector((x, -0.12, z)), Vector((x + w, 0.08, z + 0.04)), rnd.choice(card)))
                for j in range(8):
                    bx, by = x + 0.04 + (j % 4) * 0.07, -0.07 + (j // 4) * 0.1
                    parts.append(lathe(f"ss{i}_bulb{k}_{n}_{j}", [(0.0, 0.0), (0.012, 0.0), (0.013, 0.025), (0.03, 0.05), (0.032, 0.075), (0.02, 0.1), (0.0, 0.105)],
                                       Vector((bx, by, z + 0.02)), bulb, 12))
            elif kind == "coil":
                w = 0.26
                mat = rnd.choice((copper, rubber))
                for j in range(6):
                    parts.append(torus(f"ss{i}_coil{k}_{n}_{j}", Vector((x + 0.13, -0.01, z + 0.008 + j * 0.013)), 0.1, 0.007, mat))
            else:
                w = 0.32
                for j in range(3):
                    parts.append(bevelled(box(f"ss{i}_sack{k}_{n}_{j}", Vector((x, back - 0.36, z + j * 0.03)), Vector((x + w - 0.02, back - 0.04, z + j * 0.03 + 0.028)), sack), 0.012, 3))
            x += w + rnd.uniform(0.03, 0.08)
            n += 1
    join_by_material(parts, f"stores_{i}")
    place([o for o in statics if o.name.startswith(f"stores_{i}_")], i, "storeShelves", t)


# ---------------------------------------------------------------- the garden courtyard
def fountain(i, t):
    """A stone fountain gone still: an eight-sided basin of black water round a turned pedestal,
    a wide bowl on it and a smaller one above, a pine cone on top. Dead leaves float on the water."""
    import random
    rnd = random.Random(i * 13 + 5)
    R, rim = t["diameterM"] / 2, t["rimM"]
    stone, water = _stone(), plain("still_water", (0.008, 0.012, 0.011), 0.06)
    leaf = plain("dead_leaf", (0.11, 0.065, 0.03), 0.85)
    k = 1 / math.cos(math.pi / 8)  # an octagon's corners are this much further out than its flats
    eight = Matrix.Rotation(math.pi / 8, 4, "Z")  # flats square to the paths
    parts = []
    ro, ri, yw = R * k, (R - 0.17) * k, rim - 0.14
    basin = [(ro - 0.03, 0.0), (ro - 0.03, 0.08), (ro - 0.07, 0.11), (ro - 0.07, rim - 0.1), (ro, rim - 0.07), (ro, rim), (ri + 0.02, rim + 0.01),
             (ri, rim - 0.02), (ri, yw - 0.01), (0.0, yw - 0.01)]
    # The basin is laid in dressed stone blocks: the flagstones' scan reads as ashlar courses.
    ashlar = surface("rectangular_paving", TILE_M["rectangular_paving"])
    parts.append(lathe(f"ft{i}_basin", basin, Vector((0, 0, 0)), ashlar, 8, eight))
    parts.append(lathe(f"ft{i}_water", [(ri - 0.001, yw), (0.0, yw)], Vector((0, 0, 0)), water, 8, eight))
    ped = [(0.33, yw - 0.01), (0.33, yw + 0.07), (0.27, yw + 0.11), (0.17, yw + 0.2), (0.12, 0.62), (0.11, 0.86), (0.15, 0.9), (0.2, 0.93),
           (0.45, 0.99), (0.58, 1.06), (0.62, 1.12), (0.6, 1.15), (0.54, 1.13), (0.3, 1.07), (0.1, 1.05),
           (0.075, 1.1), (0.07, 1.3), (0.1, 1.34), (0.2, 1.38), (0.27, 1.43), (0.27, 1.46), (0.23, 1.46), (0.1, 1.42),
           (0.06, 1.44), (0.075, 1.52), (0.07, 1.6), (0.045, 1.68), (0.0, 1.74)]
    parts.append(lathe(f"ft{i}_pedestal", ped, Vector((0, 0, 0)), stone, 28))
    parts.append(lathe(f"ft{i}_bowlwater", [(0.53, 1.118), (0.11, 1.118)], Vector((0, 0, 0)), water, 28))
    # A scatter of dead leaves on the basin and in the bowl.
    for n in range(46):
        if n < 38:
            a, r = rnd.uniform(0, math.tau), rnd.uniform(0.4, ri * 0.92)
            z = yw + 0.003
        else:
            a, r = rnd.uniform(0, math.tau), rnd.uniform(0.16, 0.48)
            z = 1.121
        c = Vector((math.cos(a) * r, math.sin(a) * r, z))
        s, turn = rnd.uniform(0.025, 0.045), rnd.uniform(0, math.tau)
        u, v = Vector((math.cos(turn), math.sin(turn), 0)) * s, Vector((-math.sin(turn), math.cos(turn), 0)) * s * 0.55
        parts.append(quad(f"ft{i}_leaf{n}", [c - u, c - v * 0.6, c + u, c + v], leaf))
    join_by_material(parts, f"fountain_{i}")
    place([o for o in statics if o.name.startswith(f"fountain_{i}_")], i, "fountain", t)


def paving(i, t):
    """Flagstone paths, laid in map coordinates: each rectangle is minX, maxX, minZ, maxZ."""
    mat = surface(t.get("material", "rectangular_paving"), TILE_M.get(t.get("material", "rectangular_paving"), 3.0))
    for k, (x0, x1, z0, z1) in enumerate(t["rects"]):
        box(f"pave_{i}_{k}", B(x0, z1, 0.0), B(x1, z0, 0.02), mat)


def leaf_bed(i, t):
    """Flower beds gone to dead leaves, edged with a kerb of bricks on end; map rectangles."""
    brick = surface("castle_brick_02_red", TILE_M["castle_brick_02_red"])
    leaves = surface("dry_decay_leaves", TILE_M["dry_decay_leaves"])
    K, KH = 0.11, 0.16
    for k, (x0, x1, z0, z1) in enumerate(t["rects"]):
        box(f"bed_{i}_{k}_fill", B(x0 + K, z1 - K, 0.0), B(x1 - K, z0 + K, 0.1), leaves)
        box(f"bed_{i}_{k}_n", B(x0, z0 + K, 0.0), B(x1, z0, KH), brick)
        box(f"bed_{i}_{k}_s", B(x0, z1, 0.0), B(x1, z1 - K, KH), brick)
        box(f"bed_{i}_{k}_w", B(x0, z1 - K, 0.0), B(x0 + K, z0 + K, KH), brick)
        box(f"bed_{i}_{k}_e", B(x1 - K, z1 - K, 0.0), B(x1, z0 + K, KH), brick)


def raised_bed(i, t):
    """A raised flower bed in brick with a stone coping, long side along x. Where the relic may be
    buried (pits: offsets along it) the soil is dug out in a square: the game draws the loose soil
    there (client/src/stations.ts digSpot), which sinks as you dig."""
    L, W, Ht, P = t["lengthM"], t["widthM"], t["heightM"], t["pitM"]
    brick = surface("castle_brick_02_red", TILE_M["castle_brick_02_red"])
    leaves = surface("dry_decay_leaves", TILE_M["dry_decay_leaves"])
    stone, soil = _stone(), _soil()
    parts = []
    hl, hw, wall, cope = L / 2, W / 2, 0.11, 0.05
    top, bottom = Ht - 0.02, 0.18
    parts.append(box(f"rb{i}_n", Vector((-hl, hw - wall, 0)), Vector((hl, hw, Ht - cope)), brick))
    parts.append(box(f"rb{i}_s", Vector((-hl, -hw, 0)), Vector((hl, -hw + wall, Ht - cope)), brick))
    parts.append(box(f"rb{i}_w", Vector((-hl, -hw + wall, 0)), Vector((-hl + wall, hw - wall, Ht - cope)), brick))
    parts.append(box(f"rb{i}_e", Vector((hl - wall, -hw + wall, 0)), Vector((hl, hw - wall, Ht - cope)), brick))
    o = 0.025  # the coping overhangs the brick
    parts.append(bevelled(box(f"rb{i}_cn", Vector((-hl - o, hw - wall, Ht - cope)), Vector((hl + o, hw + o, Ht)), stone), 0.008))
    parts.append(bevelled(box(f"rb{i}_cs", Vector((-hl - o, -hw - o, Ht - cope)), Vector((hl + o, -hw + wall, Ht)), stone), 0.008))
    parts.append(bevelled(box(f"rb{i}_cw", Vector((-hl - o, -hw + wall, Ht - cope)), Vector((-hl + wall, hw - wall, Ht)), stone), 0.008))
    parts.append(bevelled(box(f"rb{i}_ce", Vector((hl - wall, -hw + wall, Ht - cope)), Vector((hl + o, hw - wall, Ht)), stone), 0.008))
    # The soil, its top a skin of dead leaves, cut round each pit; the pits' floors far below.
    ix0, ix1, iy = -hl + wall, hl - wall, hw - wall
    cuts = sorted((p - P / 2, p + P / 2) for p in t["pits"])
    xs = [ix0] + [c for a, b in cuts for c in (a, b)] + [ix1]
    for k in range(len(xs) - 1):
        a, b = xs[k], xs[k + 1]
        pit = k % 2 == 1
        spans = [(-iy, -P / 2), (P / 2, iy)] if pit else [(-iy, iy)]
        for j, (y0, y1) in enumerate(spans):
            parts.append(box(f"rb{i}_soil{k}_{j}", Vector((a, y0, bottom)), Vector((b, y1, top - 0.012)), soil))
            parts.append(box(f"rb{i}_leaf{k}_{j}", Vector((a, y0, top - 0.012)), Vector((b, y1, top)), leaves))
        if pit:
            parts.append(box(f"rb{i}_pit{k}", Vector((a, -P / 2, bottom - 0.02)), Vector((b, P / 2, bottom)), soil))
    join_by_material(parts, f"rbed_{i}")
    place([o for o in statics if o.name.startswith(f"rbed_{i}_")], i, "raisedBed", t)


def potting_bench(i, t):
    """A weathered potting bench against the wall, a cast-iron hand pump at one end and a zinc pail
    at the other, dead roses in the middle. The game draws the jugs and the glass vase on top and
    picks the pump and pail through invisible stand-ins in the same places (stations.ts roses)."""
    import random
    rnd = random.Random(i * 7 + 3)
    L, W, Ht = t["lengthM"], t["widthM"], t["heightM"]
    wood = surface(t.get("material", "dark_wood"), 0.8)
    iron, zinc = _iron(), plain("zinc", (0.2, 0.2, 0.19), 0.5)
    stem_m, rose_m = plain("dead_stem", (0.05, 0.04, 0.022), 0.85), plain("dead_rose", (0.085, 0.02, 0.022), 0.8)
    parts = []
    hl, hw, plank = L / 2, W / 2, 0.035
    n = 5
    for k in range(n):
        y0 = -hw + k * W / n + 0.003
        parts.append(bevelled(box(f"pb{i}_plank{k}", Vector((-hl, y0, Ht - plank)), Vector((hl, y0 + W / n - 0.006, Ht)), wood), 0.004))
    for k, sx in enumerate((-1, 1)):
        for j, sy in enumerate((-1, 1)):
            x, y = sx * (hl - 0.07), sy * (hw - 0.05)
            parts.append(box(f"pb{i}_leg{k}{j}", Vector((x - 0.025, y - 0.025, 0)), Vector((x + 0.025, y + 0.025, Ht - plank)), wood))
        parts.append(box(f"pb{i}_end{k}", Vector((sx * (hl - 0.07) - 0.012, -hw + 0.05, 0.11)), Vector((sx * (hl - 0.07) + 0.012, hw - 0.05, 0.14)), wood))
    for k in range(4):
        y0 = -hw + 0.05 + k * (W - 0.1) / 4 + 0.004
        parts.append(box(f"pb{i}_shelf{k}", Vector((-hl + 0.05, y0, 0.14)), Vector((hl - 0.05, y0 + (W - 0.1) / 4 - 0.008, 0.16)), wood))
    parts.append(box(f"pb{i}_rail", Vector((-hl + 0.04, -hw + 0.03, Ht - plank - 0.08)), Vector((hl - 0.04, -hw + 0.055, Ht - plank)), wood))
    parts.append(bevelled(box(f"pb{i}_upstand", Vector((-hl, hw - 0.022, Ht)), Vector((hl, hw, Ht + 0.2)), wood), 0.004))
    # The pump: a fluted column on a flange, its spout out over the front, the handle back and up.
    px, py = t["pumpX"], 0.05
    col = [(0.065, Ht), (0.065, Ht + 0.02), (0.048, Ht + 0.035), (0.045, Ht + 0.3), (0.056, Ht + 0.33), (0.058, Ht + 0.37), (0.035, Ht + 0.395), (0.0, Ht + 0.405)]
    parts.append(lathe(f"pb{i}_pump", col, Vector((px, py, 0)), iron, 18))
    spout = Vector((px, py - 0.155, Ht + 0.28))
    parts.append(rod(f"pb{i}_spout", Vector((px, py - 0.03, Ht + 0.3)), spout, 0.017, iron, 10))
    parts.append(rod(f"pb{i}_lip", spout, spout + Vector((0, -0.012, -0.045)), 0.016, iron, 10))
    pivot = Vector((px, py + 0.04, Ht + 0.385))
    grip = Vector((px, py + 0.2, Ht + 0.56))
    parts.append(rod(f"pb{i}_handle", pivot, grip, 0.011, iron, 8))
    parts.append(rod(f"pb{i}_grip", grip, grip + Vector((0, 0.03, 0.06)), 0.016, iron, 8))
    parts.append(rod(f"pb{i}_link", Vector((px, py + 0.02, Ht + 0.38)), pivot + Vector((0, 0, 0.025)), 0.008, iron, 6))
    # The pail where the stand-in bucket is (0.11 m at the rim, 0.09 at the foot, 0.2 tall).
    bx, by = t["bucketX"], -0.02
    pail = [(0.09, Ht), (0.11, Ht + 0.2), (0.116, Ht + 0.204), (0.112, Ht + 0.21), (0.104, Ht + 0.2), (0.084, Ht + 0.012), (0.0, Ht + 0.012)]
    parts.append(lathe(f"pb{i}_pail", pail, Vector((bx, by, 0)), zinc, 20))
    arc = [Vector((bx + math.cos(a) * 0.112, by, Ht + 0.2 + math.sin(a) * 0.1)) for a in (math.pi * k / 8 for k in range(9))]
    for k in range(8):
        parts.append(rod(f"pb{i}_bail{k}", arc[k], arc[k + 1], 0.004, iron, 6))
    # Dead roses in the vase the game draws: stems from its foot, heads hanging, petals dropped.
    vx, vy = t["vaseX"], -0.02
    for k in range(7):
        a, lean = rnd.uniform(0, math.tau), rnd.uniform(0.02, 0.07)
        foot = Vector((vx + math.cos(a) * 0.015, vy + math.sin(a) * 0.015, Ht + 0.01))
        h = t["vaseM"] + rnd.uniform(0.12, 0.24)
        tip = foot + Vector((math.cos(a) * lean, math.sin(a) * lean, h))
        parts.append(rod(f"pb{i}_stem{k}", foot, tip, 0.0045, stem_m, 5))
        droop = tip + Vector((math.cos(a) * 0.05, math.sin(a) * 0.05, -rnd.uniform(0.03, 0.07)))
        parts.append(rod(f"pb{i}_neck{k}", tip, droop, 0.004, stem_m, 5))
        head = [(0.0, -0.035), (0.018, -0.03), (0.026, -0.012), (0.022, 0.0), (0.0, 0.006)]
        parts.append(lathe(f"pb{i}_rose{k}", [(r * rnd.uniform(0.85, 1.15), h_) for r, h_ in head], droop, rose_m, 8))
    for k in range(6):
        c = Vector((vx + rnd.uniform(-0.2, 0.2), vy + rnd.uniform(-0.18, 0.1), Ht + 0.001))
        s = rnd.uniform(0.012, 0.02)
        parts.append(quad(f"pb{i}_petal{k}", [c + Vector((-s, 0, 0)), c + Vector((0, -s * 0.7, 0)), c + Vector((s, 0, 0)), c + Vector((0, s * 0.7, 0))], rose_m))
    join_by_material(parts, f"potbench_{i}")
    place([o for o in statics if o.name.startswith(f"potbench_{i}_")], i, "pottingBench", t)


def garden_bench(i, t):
    """A garden seat: cast-iron ends with arms, wooden slats for the seat and the sloped back."""
    L, D = t["lengthM"], t.get("depthM", 0.55)
    seat, back = 0.45, 0.86
    wood, iron = surface(t.get("material", "dark_wood"), 0.8), _iron()
    parts = []
    hl, hd = L / 2, D / 2
    for k, sx in enumerate((-1, 1)):
        x = sx * (hl - 0.06)
        fl0, fl1 = Vector((x, -hd + 0.05, 0)), Vector((x, -hd + 0.07, seat - 0.03))
        bl0, bl1 = Vector((x, hd - 0.04, 0)), Vector((x, hd - 0.12, seat - 0.03))
        top = Vector((x, hd - 0.02, back))
        parts.append(rod(f"gb{i}_fleg{k}", fl0, fl1, 0.02, iron, 8))
        parts.append(rod(f"gb{i}_bleg{k}", bl0, bl1, 0.02, iron, 8))
        parts.append(rod(f"gb{i}_stay{k}", bl1, top, 0.018, iron, 8))
        parts.append(rod(f"gb{i}_rail{k}", Vector((x, -hd + 0.04, seat - 0.04)), Vector((x, hd - 0.1, seat - 0.04)), 0.016, iron, 8))
        arm0, arm1 = Vector((x, -hd + 0.03, seat + 0.22)), Vector((x, hd - 0.08, seat + 0.25))
        parts.append(rod(f"gb{i}_arm{k}", arm0, arm1, 0.016, iron, 8))
        parts.append(rod(f"gb{i}_armpost{k}", fl1, arm0 + Vector((0, 0.015, 0)), 0.014, iron, 8))
        parts.append(torus(f"gb{i}_scroll{k}", arm0 + Vector((0, -0.005, -0.02)), 0.025, 0.007, iron, Matrix.Rotation(math.pi / 2, 4, "Y")))
        parts.append(rod(f"gb{i}_foot{k}", Vector((x, -hd + 0.03, 0.02)), Vector((x, hd - 0.02, 0.02)), 0.012, iron, 6))
    for k in range(4):
        y0 = -hd + 0.04 + k * 0.095
        parts.append(bevelled(box(f"gb{i}_seat{k}", Vector((-hl + 0.02, y0, seat - 0.03)), Vector((hl - 0.02, y0 + 0.08, seat)), wood), 0.006))
    for k in range(3):
        z0 = seat + 0.1 + k * 0.12
        y = hd - 0.1 + (z0 - seat) * 0.16
        parts.append(bevelled(box(f"gb{i}_back{k}", Vector((-hl + 0.02, y - 0.012, z0)), Vector((hl - 0.02, y + 0.012, z0 + 0.09)), wood), 0.005))
    join_by_material(parts, f"gbench_{i}")
    place([o for o in statics if o.name.startswith(f"gbench_{i}_")], i, "gardenBench", t)


def urn(i, t):
    """A stone garden urn on a square plinth, its soil gone to weeds."""
    stone, soil = _stone(), _soil()
    parts = []
    p, ph = 0.2, 0.45
    parts.append(bevelled(box(f"urn{i}_plinth", Vector((-p, -p, 0)), Vector((p, p, ph - 0.05)), stone), 0.01))
    parts.append(bevelled(box(f"urn{i}_cap", Vector((-p - 0.03, -p - 0.03, ph - 0.05)), Vector((p + 0.03, p + 0.03, ph)), stone), 0.01))
    parts.append(bevelled(box(f"urn{i}_base", Vector((-p - 0.03, -p - 0.03, 0)), Vector((p + 0.03, p + 0.03, 0.06)), stone), 0.01))
    h = t["heightM"] - ph
    body = [(0.12, 0), (0.12, 0.05), (0.08, 0.1), (0.07, 0.16), (0.12, 0.2), (0.2, 0.28), (0.24, 0.38), (0.25, 0.45), (0.27, 0.48), (0.27, 0.52), (0.235, 0.52), (0.225, 0.48), (0.0, 0.46)]
    body = [(r, z * h / 0.52) for r, z in body]
    parts.append(lathe(f"urn{i}_body", body, Vector((0, 0, ph)), stone, 28))
    parts.append(lathe(f"urn{i}_soil", [(0.226, t["heightM"] - 0.03), (0.0, t["heightM"] - 0.03)], Vector((0, 0, 0)), soil, 28))
    join_by_material(parts, f"urn_{i}")
    place([o for o in statics if o.name.startswith(f"urn_{i}_")], i, "urn", t)


BUILDERS = {"bookcase": bookcase, "readingTable": reading_table, "pedestalDesk": pedestal_desk, "bankerLamp": banker_lamp, "fireplace": fireplace, "jewelCabinet": jewel_cabinet,
            "switchboard": switchboard_cabinet,"shelfBooks": shelf_books, "luggageCart": luggage_cart, "luggageRack": luggage_rack, "fileChest": file_chest, "banquetTable": banquet_table, "grandfatherClock": grandfather_clock, "meetingBell": meeting_bell,
            "receptionCounter": reception_counter, "keyRack": key_rack, "pillar": pillar,
            "sideboard": jewel_cabinet, "clothedTable": clothed_table, "barCounter": bar_counter, "backBar": back_bar, "candelabraStand": candelabra_stand,
            "kitchenRange": kitchen_range, "workTable": work_table, "kitchenCounter": kitchen_counter, "panRack": pan_rack, "chain": hanging_chain,
            "uprightPiano": upright_piano, "bandstand": bandstand, "chairRow": chair_row, "pierMirror": pier_mirror, "wallSconce": wall_sconce,
            "bench": bench, "bellBoard": bell_board, "fuseBoard": fuse_board, "linenShelves": linen_shelves,
            "batteryRack": battery_rack, "dynamo": dynamo, "cableDrum": cable_drum, "toolBoard": tool_board, "ladder": ladder, "storeShelves": store_shelves,
            "fountain": fountain, "paving": paving, "leafBed": leaf_bed, "raisedBed": raised_bed, "pottingBench": potting_bench, "gardenBench": garden_bench, "urn": urn}
for i, t in enumerate(d.get("builds", [])):
    BUILDERS[t["kind"]](i, t)

for i, prop in enumerate(d["props"]):
    folder = os.path.join(job["modelsDir"], prop["model"])
    gltf = next(f for f in os.listdir(folder) if f.endswith(".gltf"))
    before = set(scene.objects)
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, gltf))
    new = [o for o in scene.objects if o not in before]
    if prop.get("part"):
        # One plant of a scan that holds several side by side (a row of shrubs or nettles).
        def kept(o):
            while o is not None:
                if o.name.startswith(prop["part"]):
                    return True
                o = o.parent
            return False

        for o in [o for o in new if o.type == "MESH" and not kept(o)]:
            bpy.data.objects.remove(o)
        new = [o for o in scene.objects if o not in before]
    roots = [o for o in new if o.parent is None]
    meshes = [o for o in new if o.type == "MESH"]
    if prop.get("lay"):
        # Tip it onto its back, front up, before measuring its footprint.
        tilt = bpy.data.objects.new(f"tilt_{i}", None)
        scene.collection.objects.link(tilt)
        for r in roots:
            r.parent = tilt
        tilt.rotation_euler.x = math.radians(-90)
        roots = [tilt]
    # Scanned models can be far too detailed for a game: simplify anything over the budget.
    tris = sum(sum(len(p.vertices) - 2 for p in o.data.polygons) for o in meshes)
    # A prop repeated many times in a room (dining chairs) can ask for a lower limit.
    limit = prop.get("maxTris", MAX_PROP_TRIS)
    if tris > limit:
        for o in meshes:
            mod = o.modifiers.new("decimate", "DECIMATE")
            mod.ratio = limit / tris
            bpy.context.view_layer.objects.active = o
            bpy.ops.object.modifier_apply(modifier=mod.name)
        print(f"  {prop['model']}: {tris} -> about {limit} triangles")
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
    for glow in prop.get("glow", []):
        # The lantern's own bulb and glass lit, so it glows where the baked light comes from.
        for o in meshes:
            for slot in o.material_slots:
                m = slot.material
                if m and m.name.split(".")[0] == glow["material"] and m.node_tree:
                    bsdf = next((n for n in m.node_tree.nodes if n.type == "BSDF_PRINCIPLED"), None)
                    if bsdf:
                        bsdf.inputs["Emission Color"].default_value = (*blackbody(glow["kelvin"]), 1.0)
                        bsdf.inputs["Emission Strength"].default_value = glow["strength"]
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
moon = d.get("moon")
if moon:
    # Out of doors: a faint blue night sky all round and a low moon throwing the walls' shadows.
    bg = scene.world.node_tree.nodes["Background"]
    bg.inputs["Color"].default_value = (*moon["sky"], 1.0)
    bg.inputs["Strength"].default_value = 1.0
    sun = bpy.data.lights.new("moon", "SUN")
    sun.energy = moon["strength"]
    sun.color = moon["color"]
    sun.angle = math.radians(1.0)
    ob = bpy.data.objects.new("moon", sun)
    # Shining toward (dx, dz) on the map, from moon["elevation"] degrees up.
    dx, dz = moon["toward"]
    ob.rotation_euler = Vector((dx, -dz, -math.tan(math.radians(moon["elevation"])) * math.hypot(dx, dz))).to_track_quat("-Z", "Y").to_euler()
    scene.collection.objects.link(ob)
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
