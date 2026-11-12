# Builds the hotel's doors in Blender (tools/art/build-doors.ts): every door style at every leaf
# width it is used at, and the fixed panel over each doorway (the transom), all from this script.
# Run: blender --background --factory-startup --python-exit-code 1 --python build_doors.py -- <job.json>
#
# Each piece is an empty named "<style>_leaf_<cm>" (or "<style>_leaf_<cm>_n<number>" with a door
# number, "<style>_transom_<cm>") holding one mesh per material. A leaf is built with its hinge
# edge on the origin, reaching along +x, its bottom on the floor, its thickness centred on zero; a
# transom is centred on the origin along x with its bottom at zero. Every leaf is dressed the same
# on both faces, so the game turns one round for a door hung from the other side.
#
# Blender is z up, so a leaf stands in Blender's x-z plane with its faces towards -y and +y; the
# glTF exporter turns it to y up, where the faces look along +z and -z.
import bpy, bmesh, json, math, os, random, sys
from mathutils import Matrix, Vector

job = json.load(open(sys.argv[sys.argv.index("--") + 1], encoding="utf-8"))
TEX = job["texturesDir"]
LEAF_H = job["leafHeight"]
TRANSOM_H = job["transomHeight"]

bpy.ops.wm.read_factory_settings(use_empty=True)
scene = bpy.context.scene

# ---------------------------------------------------------------- materials
_mats = {}


def textured(name, tile_m, grain="u", metal=0.0):
    """A PBR material from assets-src/textures/<name>. grain: which way the texture's grain runs
    (u across, v up), so a piece can turn it to run along its length."""
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    bsdf = nt.nodes["Principled BSDF"]
    bsdf.inputs["Metallic"].default_value = metal
    folder = os.path.join(TEX, name)

    def img(kind, non_color):
        path = os.path.join(folder, f"{name}_{kind}_2k.jpg")
        if not os.path.exists(path):
            return None
        n = nt.nodes.new("ShaderNodeTexImage")
        n.image = bpy.data.images.load(path, check_existing=True)
        if non_color:
            n.image.colorspace_settings.name = "Non-Color"
        return n

    d = img("diff", False)
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
    m["grain"] = grain
    _mats[name] = m
    return m


def plain(name, rgb, rough=0.6, metal=0.0):
    if name in _mats:
        return _mats[name]
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    m["tile_m"] = 1.0
    m["grain"] = "u"
    _mats[name] = m
    return m


def wood(name):
    return textured(name, 1.2, "u")


def paint(name):
    return textured(name, 1.0, "u")


def pine(name, rail_at):
    """The pine door photo: its boards run up the picture already, and it has a cross rail just
    above half way up (PINE_RAIL_V), which is put at rail_at metres up, under an iron strap."""
    m = textured(name, 2.0, "v")
    m["rail_at"] = rail_at
    return m


PINE_RAIL_V = 0.51


def iron():
    return textured("door_rust_iron", 0.3, "u", 0.35)


def brass():
    return textured("door_old_brass", 0.3, "u", 1.0)


def glass():
    # Dark old glass, dulled with grime: night behind it, the room's lamps soft in its reflections.
    return plain("door_glass", (0.012, 0.014, 0.015), 0.55)


def gilt():
    return plain("door_gilt", (0.42, 0.3, 0.12), 0.42, 1.0)


def keyhole():
    return plain("door_keyhole", (0.004, 0.004, 0.004), 0.9)


# ---------------------------------------------------------------- geometry
parts = []  # the meshes of the piece being built
rng = random.Random(7)


def finish(name, bm, mat, along="z", smooth=False):
    """World box-projected UVs (tile_m metres per texture), turned so the grain runs `along` the
    piece (z up, x across), and moved by a random amount so no two boards share their grain."""
    tile = mat["tile_m"]
    turn = (along == "z") == (mat["grain"] == "u")
    du, dv = rng.random(), rng.random()
    if "rail_at" in mat:
        dv = PINE_RAIL_V - mat["rail_at"] / tile
    uv = bm.loops.layers.uv.new("UVMap")
    bm.normal_update()
    for f in bm.faces:
        f.smooth = smooth
        n = f.normal
        ax = max(range(3), key=lambda i: abs(n[i]))
        for l in f.loops:
            c = l.vert.co
            u, v = {0: (c.y, c.z), 1: (c.x, c.z), 2: (c.x, c.y)}[ax]
            if (ax == 0 and n.x < 0) or (ax == 1 and n.y > 0):
                u = -u
            if turn and ax != 2:
                u, v = v, u
            l[uv].uv = (u / tile + du, v / tile + dv)
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    ob = bpy.data.objects.new(name, me)
    ob.data.materials.append(mat)
    scene.collection.objects.link(ob)
    parts.append(ob)
    return ob


def box(name, lo, hi, mat, along="z", bevel=0.0, segments=1):
    """An axis-aligned box between two corners (Blender x, y, z), its edges bevelled."""
    a = Vector(map(min, lo, hi))
    b = Vector(map(max, lo, hi))
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    for v in bm.verts:
        v.co = Vector((a.x if v.co.x < 0 else b.x, a.y if v.co.y < 0 else b.y, a.z if v.co.z < 0 else b.z))
    if bevel > 0:
        bmesh.ops.bevel(bm, geom=list(bm.edges), offset=bevel, offset_type="OFFSET", segments=segments, profile=0.5, affect="EDGES", clamp_overlap=True)
    return finish(name, bm, mat, along)


def rod(name, a, b, r, mat, segments=14):
    """A round bar from a to b."""
    a, b = Vector(a), Vector(b)
    bm = bmesh.new()
    dv = b - a
    bmesh.ops.create_cone(bm, cap_ends=True, segments=segments, radius1=r, radius2=r, depth=dv.length)
    turn = Vector((0, 0, 1)).rotation_difference(dv.normalized()).to_matrix().to_4x4()
    bmesh.ops.transform(bm, matrix=Matrix.Translation((a + b) / 2) @ turn, verts=bm.verts)
    return finish(name, bm, mat, smooth=True)


def lathe(name, profile, x, z, y0, out, mat, segments=24):
    """A round thing turned about an axis through the door at (x, z): profile is (radius, distance
    out from y0) pairs, from the door outwards; out is -1 (the -y face) or +1."""
    bm = bmesh.new()
    rings = []
    for r, d in profile:
        y = y0 + out * d
        if r < 1e-6:
            rings.append([bm.verts.new((x, y, z))])
        else:
            rings.append([bm.verts.new((x + r * math.cos(a), y, z + r * math.sin(a))) for a in (2 * math.pi * i / segments for i in range(segments))])
    for ra, rb in zip(rings, rings[1:]):
        if len(ra) == 1 and len(rb) == 1:
            continue
        for i in range(segments):
            j = (i + 1) % segments
            if len(ra) == 1:
                q = [ra[0], rb[j], rb[i]]
            elif len(rb) == 1:
                q = [ra[i], ra[j], rb[0]]
            else:
                q = [ra[i], ra[j], rb[j], rb[i]]
            bm.faces.new(q)
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, smooth=True)


def torus(name, x, z, y, R, r, mat, segments=36, sides=12):
    """A ring lying flat on the door, round the axis through the door."""
    bm = bmesh.new()
    grid_ = []
    for i in range(segments):
        a = 2 * math.pi * i / segments
        ring = []
        for k in range(sides):
            b = 2 * math.pi * k / sides
            rr = R + r * math.cos(b)
            ring.append(bm.verts.new((x + rr * math.cos(a), y + r * math.sin(b), z + rr * math.sin(a))))
        grid_.append(ring)
    for i in range(segments):
        for k in range(sides):
            i2, k2 = (i + 1) % segments, (k + 1) % sides
            bm.faces.new([grid_[i][k], grid_[i2][k], grid_[i2][k2], grid_[i][k2]])
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return finish(name, bm, mat, smooth=True)


def both(fn):
    """Dresses both faces: fn(out) with out -1 for the -y face and +1 for the +y face."""
    for out in (-1, 1):
        fn(out)


# ---------------------------------------------------------------- doors: the wood
def framed(W, H, T, mat, panels, mould=None, glazed=()):
    """A frame-and-panel door: stiles and rails round each panel, each panel a raised field.
    panels: (x0, z0, x1, z1) holes in the frame. glazed: indexes of panels that are glass instead.
    mould: a material for a bead round each panel's edge (the frame's own wood, or gilt)."""
    xs = sorted({0.0, W, *[p[0] for p in panels], *[p[2] for p in panels]})
    zs = sorted({0.0, H, *[p[1] for p in panels], *[p[3] for p in panels]})

    def hole(cx, cz):
        return any(p[0] <= cx <= p[2] and p[1] <= cz <= p[3] for p in panels)

    cols = list(zip(xs, xs[1:]))
    rows = list(zip(zs, zs[1:]))
    solid_col = [all(not hole((a + b) / 2, (c + d) / 2) for c, d in rows) for a, b in cols]
    for (a, b), solid in zip(cols, solid_col):
        if solid:
            box("stile", (a, -T / 2, 0), (b, T / 2, H), mat, "z", 0.004)
    for c, d in rows:
        run = None
        for (a, b), solid in zip(cols, solid_col):
            filled = not solid and not hole((a + b) / 2, (c + d) / 2)
            if filled:
                run = (run[0], b) if run else (a, b)
            elif run:
                rail(run, c, d, T, mat)
                run = None
        if run:
            rail(run, c, d, T, mat)
    glazed = set(glazed)
    for i, (x0, z0, x1, z1) in enumerate(panels):
        if i in glazed:
            box("pane", (x0, -0.004, z0), (x1, 0.004, z1), glass())
            # The bead that holds the glass, both sides.
            bead = 0.012
            for s in (-1, 1):
                for lo, hi in (((x0, z0), (x1, z0 + bead)), ((x0, z1 - bead), (x1, z1)), ((x0, z0 + bead), (x0 + bead, z1 - bead)), ((x1 - bead, z0 + bead), (x1, z1 - bead))):
                    box("bead", (lo[0], s * 0.004, lo[1]), (hi[0], s * T * 0.3, hi[1]), mat, "z", 0.002)
            continue
        along = "z" if (z1 - z0) >= (x1 - x0) else "x"
        box("panel", (x0, -T * 0.18, z0), (x1, T * 0.18, z1), mat, along)
        inset = min(0.04, (x1 - x0) / 5, (z1 - z0) / 5)
        box("field", (x0 + inset, -T * 0.32, z0 + inset), (x1 - inset, T * 0.32, z1 - inset), mat, along, min(0.012, T * 0.12), 2)
        if mould is not None:
            b = 0.014
            for s in (-1, 1):
                y0, y1 = s * T * 0.18, s * (T / 2 - 0.003)
                box("mould", (x0, y0, z0), (x1, y1, z0 + b), mould, "x", 0.004, 2)
                box("mould", (x0, y0, z1 - b), (x1, y1, z1), mould, "x", 0.004, 2)
                box("mould", (x0, y0, z0 + b), (x0 + b, y1, z1 - b), mould, "z", 0.004, 2)
                box("mould", (x1 - b, y0, z0 + b), (x1, y1, z1 - b), mould, "z", 0.004, 2)


def rail(run, c, d, T, mat):
    a, b = run
    box("rail", (a, -T / 2, c), (b, T / 2, d), mat, "x" if (b - a) > (d - c) else "z", 0.004)


def grid(W, H, cols, weights, stile=0.11, top=0.11, bottom=0.22, rail=0.1, mullion=0.09, skip=()):
    """Panel holes in `cols` columns and rows weighted top to bottom, inside stiles and rails."""
    stile = min(stile, W * 0.16)
    mullion = min(mullion, W * 0.12)
    inner_w = W - 2 * stile - (cols - 1) * mullion
    pw = inner_w / cols
    inner_h = H - top - bottom - (len(weights) - 1) * rail
    total = sum(weights)
    out = []
    z1 = H - top
    for r, wgt in enumerate(weights):
        ph = inner_h * wgt / total
        for c in range(cols):
            if (r, c) in skip:
                continue
            x0 = stile + c * (pw + mullion)
            out.append((x0, z1 - ph, x0 + pw, z1))
        z1 -= ph + rail
    return out


def planks(W, H, T, mat, width=0.13):
    """Upright boards with chamfered edges, on a thin backing so no light shows between them."""
    n = max(3, round(W / width))
    pw = W / n
    box("backing", (0.004, -T * 0.15, 0.004), (W - 0.004, T * 0.15, H - 0.004), mat)
    for i in range(n):
        box("plank", (i * pw + 0.0015, -T / 2, 0), ((i + 1) * pw - 0.0015, T / 2, H), mat, "z", 0.006)


# ---------------------------------------------------------------- doors: the metal
HANDLE_IN = 0.075  # the handle's middle from the leaf's free edge
HANDLE_Z = 1.0


def butt_hinges(H, mat):
    """The hinge knuckles on the hinge edge, each with a pin cap top and bottom."""
    for z in (0.22, H / 2, H - 0.25):
        rod("knuckle", (0.0, 0.0, z - 0.055), (0.0, 0.0, z + 0.055), 0.0105, mat)
        rod("pin", (0.0, 0.0, z + 0.055), (0.0, 0.0, z + 0.064), 0.008, mat)
        rod("pin", (0.0, 0.0, z - 0.064), (0.0, 0.0, z - 0.055), 0.008, mat)


def escutcheon(x, z, T, out, mat):
    y = out * T / 2
    box("escutcheon", (x - 0.018, y, z - 0.035), (x + 0.018, y + out * 0.004, z + 0.035), mat, "z", 0.0015)
    box("keyhole", (x - 0.0035, y + out * 0.0041, z - 0.012), (x + 0.0035, y + out * 0.0046, z + 0.008), keyhole())
    lathe("keyhole", [(0, 0), (0.0065, 0), (0.0065, 0.0006), (0, 0.0006)], x, z + 0.01, y + out * 0.0041, out, keyhole(), 16)


def knob(W, T, mat, z=HANDLE_Z):
    """A round knob on a round rose, both faces, with a key escutcheon below."""
    x = W - HANDLE_IN

    def one(out):
        lathe("knob", [(0, 0), (0.03, 0), (0.03, 0.005), (0.024, 0.01), (0.0085, 0.013), (0.008, 0.042), (0.016, 0.046), (0.025, 0.056), (0.0275, 0.066), (0.022, 0.076), (0.011, 0.081), (0, 0.082)], x, z, out * T / 2, out, mat)
        escutcheon(x, z - 0.1, T, out, mat)

    both(one)


def lever(W, T, mat, z=HANDLE_Z):
    """A lever on a round rose, pointing back towards the hinges, both faces."""
    x = W - HANDLE_IN

    def one(out):
        y = out * T / 2
        lathe("rose", [(0, 0), (0.03, 0), (0.03, 0.005), (0.022, 0.01), (0.009, 0.013), (0, 0.013)], x, z, y, out, mat)
        rod("neck", (x, y, z), (x, y + out * 0.058, z), 0.0085, mat)
        rod("lever", (x + 0.006, y + out * 0.058, z), (x - 0.115, y + out * 0.062, z - 0.004), 0.0085, mat)
        lathe("end", [(0, 0), (0.012, 0), (0.012, 0.012), (0, 0.014)], x - 0.115, z - 0.004, y + out * 0.055, out, mat, 16)
        escutcheon(x, z - 0.1, T, out, mat)

    both(one)


def push_plate(W, T, mat, z0=1.05, h=0.36, w=0.1, pull=False):
    x = W - HANDLE_IN - 0.03

    def one(out):
        y = out * T / 2
        box("push_plate", (x - w / 2, y, z0), (x + w / 2, y + out * 0.003, z0 + h), mat, "z", 0.0015)
        if pull:
            for zz in (z0 + 0.06, z0 + h - 0.06):
                rod("pull_post", (x, y, zz), (x, y + out * 0.055, zz), 0.008, mat)
            rod("pull", (x, y + out * 0.055, z0 + 0.04), (x, y + out * 0.055, z0 + h - 0.04), 0.012, mat)

    both(one)


def kick_plate(W, T, mat, h=0.25):
    both(lambda out: box("kick_plate", (0.025, out * T / 2, 0.02), (W - 0.025, out * (T / 2 + 0.0025), 0.02 + h), mat, "x", 0.0015))


def stud(x, z, y, out, mat, r=0.012):
    lathe("stud", [(0, 0), (r, 0), (r, 0.002), (r * 0.75, r * 0.65), (0, r * 0.85)], x, z, y, out, mat, 14)


def strap(W, T, z, mat, length=0.85, width=0.06, bolts=True):
    """A long iron strap hinge from the hinge edge across the door, both faces, bolted through."""
    L = W * length

    def one(out):
        y = out * T / 2
        box("strap", (-0.012, y, z - width / 2), (L, y + out * 0.006, z + width / 2), mat, "x", 0.0018)
        lathe("strap_end", [(0, 0), (width * 0.62, 0), (width * 0.62, 0.006), (0, 0.006)], L, z, y, out, mat, 20)
        if bolts:
            n = max(2, int(L / 0.14))
            for i in range(n + 1):
                stud(0.05 + (L - 0.05) * i / n, z, y + out * 0.006, out, mat, 0.0095)

    both(one)
    rod("pintle", (-0.012, 0.0, z - width * 0.75), (-0.012, 0.0, z + width * 0.75), 0.013, mat)


def ring_pull(W, T, mat, z=HANDLE_Z, R=0.05, r=0.007):
    x = W - HANDLE_IN - 0.05

    def one(out):
        y = out * T / 2
        lathe("ring_boss", [(0, 0), (0.035, 0), (0.035, 0.006), (0.02, 0.012), (0.012, 0.03), (0, 0.032)], x, z, y, out, mat)
        torus("ring", x, z - R + 0.012, y + out * (r + 0.004), R, r, mat)

    both(one)


def digits(W, H, T, n, mat):
    """The room number in brass on a dark iron plate on the top rail, readable from both sides."""
    for out in (-1, 1):
        y = out * T / 2
        box("number_plate", (W / 2 - 0.045, y, H - 0.065 - 0.05), (W / 2 + 0.045, y + out * 0.003, H - 0.065 + 0.05), iron(), "z", 0.0015)
        bpy.ops.object.text_add()
        ob = bpy.context.object
        ob.data.body = str(n)
        ob.data.size = 0.085
        ob.data.extrude = 0.0015
        ob.data.align_x = "CENTER"
        ob.data.align_y = "CENTER"
        bpy.ops.object.convert(target="MESH")
        ob = bpy.context.object
        # The text lies face up (+z), reading along +x. Stand it up facing out of this face: towards
        # -y it reads along +x as you face it; towards +y it must read along -x, so turn it round.
        turn = Matrix.Rotation(math.pi / 2, 4, "X")
        if out > 0:
            turn = Matrix.Rotation(math.pi, 4, "Z") @ turn
        ob.data.transform(turn)
        ob.data.transform(Matrix.Translation((W / 2, out * (T / 2 + 0.0038), H - 0.065)))
        bm = bmesh.new()
        bm.from_mesh(ob.data)
        bpy.data.objects.remove(ob, do_unlink=True)
        finish("number", bm, mat)


# ---------------------------------------------------------------- the styles
def leaf_hall(W, H):
    T = 0.065
    m = wood("door_walnut")
    framed(W, H, T, m, grid(W, H, 2, [0.9, 2.3, 1.2], stile=0.13, bottom=0.26), mould=m)
    push_plate(W, T, brass(), pull=True)
    kick_plate(W, T, brass(), 0.2)
    butt_hinges(H, brass())


def leaf_reception(W, H):
    T = 0.06
    m = wood("dark_wood")
    framed(W, H, T, m, grid(W, H, 2, [1.0, 1.7, 1.2]))
    lever(W, T, brass())
    butt_hinges(H, brass())


def leaf_restaurant(W, H):
    T = 0.06
    m = wood("door_oak")
    framed(W, H, T, m, grid(W, H, 1, [1.0], top=1.3, bottom=0.25))
    # The round window, high up: dark glass through the door, a brass ring on each face.
    x, z = W / 2, 1.62
    R = min(0.15, W * 0.22)
    lathe("porthole", [(0, -0.001), (R, -0.001), (R, T + 0.002), (0, T + 0.002)], x, z, -T / 2, 1, glass(), 40)
    both(lambda out: torus("porthole_ring", x, z, out * (T / 2 + 0.006), R + 0.012, 0.016, brass(), 48, 14))
    push_plate(W, T, brass(), 0.95, 0.3, 0.085)
    kick_plate(W, T, brass(), 0.22)
    butt_hinges(H, brass())


def leaf_library(W, H):
    T = 0.065
    m = wood("door_walnut")
    panels = grid(W, H, 2 if W > 0.6 else 1, [2.8, 1.0], stile=0.12, bottom=0.24, rail=0.14)
    framed(W, H, T, m, panels)
    # Iron studs at the corners of each panel.
    for x0, z0, x1, z1 in panels:
        for x, z in ((x0 - 0.03, z0 - 0.03), (x1 + 0.03, z0 - 0.03), (x0 - 0.03, z1 + 0.03), (x1 + 0.03, z1 + 0.03)):
            if 0.02 < x < W - 0.02:
                both(lambda out, x=x, z=z: stud(x, z, out * T / 2, out, iron(), 0.011))
    lever(W, T, iron())
    butt_hinges(H, iron())


def leaf_ballroom(W, H):
    T = 0.06
    m = paint("door_paint_ivory")
    framed(W, H, T, m, grid(W, H, 2, [0.8, 2.4, 1.0], stile=0.12), mould=gilt())
    knob(W, T, brass())
    butt_hinges(H, brass())


def leaf_courtyard(W, H):
    T = 0.06
    m = paint("door_paint_charcoal")
    cols = 2 if W > 0.6 else 1
    lites = grid(W, H, cols, [1, 1, 1], top=0.1, bottom=1.02, rail=0.035, mullion=0.035, stile=0.1)
    lower = (0.1, 0.22, W - 0.1, 0.84)
    framed(W, H, T, m, lites + [lower], glazed=range(len(lites)))
    lever(W, T, iron(), 0.97)
    butt_hinges(H, iron())


def leaf_service(W, H):
    T = 0.055
    m = paint("door_paint_green")
    framed(W, H, T, m, grid(W, H, 1, [1.6, 1.0], bottom=0.32, rail=0.16))
    kick_plate(W, T, iron(), 0.28)
    push_plate(W, T, iron(), 1.08, 0.3, 0.09)
    knob(W, T, iron())
    butt_hinges(H, iron())


def leaf_guest(W, H, number=None):
    T = 0.055
    m = wood("door_oak")
    framed(W, H, T, m, grid(W, H, 2, [2.0, 1.0], top=0.13))
    knob(W, T, brass())
    butt_hinges(H, iron())
    if number is not None:
        digits(W, H, T, number, brass())


def leaf_bridal(W, H):
    T = 0.06
    m = paint("door_paint_rose")
    panels = grid(W, H, 1, [0.9, 2.4, 1.0], stile=0.12)
    framed(W, H, T, m, panels, mould=m)
    x0, z0, x1, z1 = panels[0]
    both(lambda out: lathe("rose_boss", [(0, 0), (0.05, 0), (0.05, 0.004), (0.042, 0.008), (0.03, 0.011), (0.018, 0.017), (0.008, 0.021), (0, 0.022)], (x0 + x1) / 2, (z0 + z1) / 2, out * T * 0.32, out, brass(), 32))
    knob(W, T, brass())
    butt_hinges(H, brass())


def leaf_nursery(W, H):
    T = 0.055
    m = paint("door_paint_blue")
    framed(W, H, T, m, grid(W, H, 2, [1, 1, 1, 1], rail=0.08))
    knob(W, T, brass(), 0.95)
    butt_hinges(H, iron())


def leaf_staff(W, H):
    T = 0.05
    m = paint("door_paint_brown")
    planks(W, H, T, m, 0.12)
    # Ledges (cross boards) top and bottom and a brace between them, on both faces.
    low, high, b = 0.28, H - 0.3, 0.11

    def one(out):
        y0, y1 = out * T / 2, out * (T / 2 + 0.022)
        box("ledge", (0.03, y0, low - b / 2), (W - 0.03, y1, low + b / 2), m, "x", 0.004)
        box("ledge", (0.03, y0, high - b / 2), (W - 0.03, y1, high + b / 2), m, "x", 0.004)
        bm = bmesh.new()
        a = Vector((0.08, 0, low + b / 2))
        c = Vector((W - 0.08, 0, high - b / 2))
        d = (c - a).normalized()
        nrm = Vector((-d.z, 0, d.x)) * (b * 0.45)
        quad = [a - nrm, c - nrm, c + nrm, a + nrm]
        vs = [bm.verts.new((p.x, y0, p.z)) for p in quad] + [bm.verts.new((p.x, y1, p.z)) for p in quad]
        for f in ([0, 1, 2, 3], [7, 6, 5, 4], [0, 4, 5, 1], [1, 5, 6, 2], [2, 6, 7, 3], [3, 7, 4, 0]):
            bm.faces.new([vs[i] for i in f])
        bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
        finish("brace", bm, m, "x")

    both(one)
    strap(W, T + 0.044, low, iron(), 0.42, 0.045)
    strap(W, T + 0.044, high, iron(), 0.42, 0.045)
    knob(W, T + 0.044, iron(), 1.0)


def leaf_cellar(W, H):
    T = 0.07
    m = pine("rough_pine_door", H - 0.36)
    planks(W, H, T, m, 0.14)
    strap(W, T, 0.36, iron())
    strap(W, T, H - 0.36, iron())
    ring_pull(W, T, iron())


def leaf_relic(W, H):
    T = 0.09
    m = pine("door_relic_pine", 1.1)
    planks(W, H, T, m, 0.15)
    for z in (0.3, 1.1, H - 0.3):
        strap(W, T, z, iron(), 0.9, 0.075)
    # An iron band round the edge, and rows of nail heads.
    b = 0.05

    def one(out):
        y0, y1 = out * T / 2, out * (T / 2 + 0.005)
        box("band", (0, y0, 0), (W, y1, b), iron(), "x", 0.0015)
        box("band", (0, y0, H - b), (W, y1, H), iron(), "x", 0.0015)
        box("band", (W - b, y0, b), (W, y1, H - b), iron(), "z", 0.0015)
        for z in (0.7, 1.55):
            n = max(3, int((W - 0.2) / 0.13))
            for i in range(n + 1):
                stud(0.1 + (W - 0.2 - b) * i / n, z, y0, out, iron(), 0.013)

    both(one)
    ring_pull(W, T, iron(), 0.92, 0.075, 0.01)


LEAVES = {
    "hall": leaf_hall,
    "reception": leaf_reception,
    "restaurant": leaf_restaurant,
    "library": leaf_library,
    "ballroom": leaf_ballroom,
    "courtyard": leaf_courtyard,
    "service": leaf_service,
    "guest": leaf_guest,
    "bridal": leaf_bridal,
    "nursery": leaf_nursery,
    "staff": leaf_staff,
    "cellar": leaf_cellar,
    "relic": leaf_relic,
}

# The panel over the doors: the style's own wood, glass in the grand and garden doorways.
TRANSOMS = {
    "hall": ("glass", lambda: wood("door_walnut"), 0.065),
    "reception": ("panel", lambda: wood("dark_wood"), 0.06),
    "restaurant": ("glass", lambda: wood("door_oak"), 0.06),
    "library": ("panel", lambda: wood("door_walnut"), 0.065),
    "ballroom": ("gilt", lambda: paint("door_paint_ivory"), 0.06),
    "courtyard": ("glass", lambda: paint("door_paint_charcoal"), 0.06),
    "service": ("panel", lambda: paint("door_paint_green"), 0.055),
    "guest": ("panel", lambda: wood("door_oak"), 0.055),
    "bridal": ("panel", lambda: paint("door_paint_rose"), 0.06),
    "nursery": ("panel", lambda: paint("door_paint_blue"), 0.055),
    "staff": ("planks", lambda: paint("door_paint_brown"), 0.05),
    "cellar": ("planks", lambda: pine("rough_pine_door", LEAF_H - 0.36), 0.07),
    "relic": ("planks", lambda: pine("door_relic_pine", 1.1), 0.09),
}


def transom(style, W, h):
    kind, mat, T = TRANSOMS[style]
    m = mat()
    # Built from x = 0, then moved to be centred.
    if kind == "planks":
        planks(W, h, T, m, 0.14)
        strap(W, T, h / 2, iron(), 0.96, 0.05)
    else:
        n = max(1, round(W / (0.42 if kind == "glass" else 0.7)))
        frame = 0.07
        bar = 0.035 if kind == "glass" else 0.08
        pw = (W - 2 * frame - (n - 1) * bar) / n
        holes = [(frame + i * (pw + bar), frame, frame + i * (pw + bar) + pw, h - frame) for i in range(n)]
        framed(W, h, T, m, holes, mould=gilt() if kind == "gilt" else None, glazed=range(n) if kind == "glass" else ())
    for ob in parts:
        ob.data.transform(Matrix.Translation((-W / 2, 0, 0)))


# ---------------------------------------------------------------- build and export
def piece(name, build):
    global parts
    parts = []
    build()
    groups = {}
    for o in parts:
        groups.setdefault(o.data.materials[0].name, []).append(o)
    holder = bpy.data.objects.new(name, None)
    scene.collection.objects.link(holder)
    for mat_name, group in groups.items():
        for o in list(bpy.context.selected_objects):
            o.select_set(False)
        for o in group:
            o.select_set(True)
        bpy.context.view_layer.objects.active = group[0]
        if len(group) > 1:
            bpy.ops.object.join()
        joined = bpy.context.view_layer.objects.active
        joined.name = f"{name}_{mat_name}"
        joined.parent = holder
    print(f"{name}: {sum(len(o.data.polygons) for o in holder.children)} faces")


# Names come from the job (shared/src/dressing.ts doorModelName), so the game finds each piece.
for v in job["leaves"]:
    if v.get("number") is not None:
        piece(v["name"], lambda v=v: LEAVES[v["style"]](v["width"], LEAF_H, v["number"]))
    else:
        piece(v["name"], lambda v=v: LEAVES[v["style"]](v["width"], LEAF_H))
for v in job["transoms"]:
    piece(v["name"], lambda v=v: transom(v["style"], v["width"], TRANSOM_H))

os.makedirs(os.path.dirname(job["out"]), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=job["out"], export_format="GLB", export_yup=True, export_apply=True, export_image_format="JPEG")
print("Doors written to", job["out"])
