# Builds the torch you hold in first person: an old nickel-plated metal torch with a ribbed rubber
# grip, a brass bezel, a polished reflector and a glass lens. Shapes are turned (lathed) in code;
# the wear (brushed nickel, brass showing through on the edges, grime in the grooves) is made with
# procedural shaders and baked on the GPU into 1K textures, so the glTF needs no source images.
# Run (headless): blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_torch.py
# Writes assets-src/models/hand_torch/hand_torch.gltf; tools/art/build-held.ts hand_torch builds it for the game.
import math
import os

import bmesh
import bpy
from mathutils import Matrix, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
OUT = os.path.join(ROOT, "assets-src/models/hand_torch")
TEX_SIZE = 1024
SEGMENTS = 40
BAKE_SAMPLES = 16

# Lengths in metres along the torch, tail (0) to lens (LENGTH).
LENGTH = 0.245
BODY_R = 0.0165

scene = bpy.context.scene
for ob in list(bpy.data.objects):
    bpy.data.objects.remove(ob, do_unlink=True)

# Bake on the GPU only (owner, 2026-11-10: keep the CPU cool).
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
    raise SystemExit("No OptiX or CUDA GPU found; not baking on the CPU.")
scene.cycles.samples = BAKE_SAMPLES

# The torch lies along -Y in Blender (glTF +Z), tail at +Y, lens at -Y, centred on its length.
TO_AXIS = Matrix(((1, 0, 0), (0, 0, -1), (0, 1, 0)))


def lathe(name, profile, segments=SEGMENTS):
    """A turned part: profile is (radius, t) points from the tail toward the lens."""
    bm = bmesh.new()
    verts = [bm.verts.new((r, 0.0, t)) for r, t in profile]
    edges = [bm.edges.new((verts[k], verts[k + 1])) for k in range(len(verts) - 1)]
    bmesh.ops.spin(bm, geom=verts + edges, cent=(0, 0, 0), axis=(0, 0, 1), angle=math.tau, steps=segments, use_merge=True)
    bmesh.ops.remove_doubles(bm, verts=bm.verts, dist=1e-6)
    for v in bm.verts:
        v.co = TO_AXIS @ Vector((v.co.x, v.co.y, v.co.z - LENGTH / 2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    return to_object(name, bm)


def block(name, lo, hi, bevel=0.0):
    """A box from lo to hi in torch space (x across, y up, t along)."""
    bm = bmesh.new()
    bmesh.ops.create_cube(bm, size=1.0)
    size = Vector(hi) - Vector(lo)
    mid = (Vector(lo) + Vector(hi)) / 2
    for v in bm.verts:
        p = Vector((v.co.x * size.x + mid.x, v.co.y * size.y + mid.y, v.co.z * size.z + mid.z))
        v.co = TO_AXIS @ Vector((p.x, -p.y, p.z - LENGTH / 2))
    bmesh.ops.recalc_face_normals(bm, faces=bm.faces)
    ob = to_object(name, bm)
    if bevel:
        mod = ob.modifiers.new("bevel", "BEVEL")
        mod.width = bevel
        mod.segments = 2
        bpy.context.view_layer.objects.active = ob
        bpy.ops.object.modifier_apply(modifier=mod.name)
    return ob


def to_object(name, bm):
    me = bpy.data.meshes.new(name)
    bm.to_mesh(me)
    bm.free()
    for p in me.polygons:
        p.use_smooth = True
    ob = bpy.data.objects.new(name, me)
    scene.collection.objects.link(ob)
    return ob


def ribbed(t0, t1, r_out, r_in, pitch):
    """Rings for a grip: alternating raised and sunk bands from t0 to t1."""
    pts = []
    t = t0
    while t < t1 - 1e-6:
        half = min(pitch / 2, t1 - t)
        pts += [(r_in, t), (r_out, t + 0.0008), (r_out, t + half - 0.0008), (r_in, t + half)]
        t += pitch
    return pts


# --- Shapes ---------------------------------------------------------------------------------
nickel_parts = [
    # Tail cap with a knurled ring and a flat end.
    lathe("tail", [(0.0, 0.0), (0.0145, 0.0), (0.0165, 0.0015), (0.0172, 0.004)]
          + ribbed(0.004, 0.016, 0.0176, 0.0170, 0.002) + [(0.0168, 0.0165), (0.0168, 0.02), (0.0, 0.02)]),
    # Body tube between grip and switch, then the neck flaring out to the head.
    lathe("body", [(0.0, 0.11), (BODY_R, 0.11), (BODY_R, 0.17), (0.0175, 0.176), (0.0215, 0.19),
                   (0.0245, 0.203), (0.0255, 0.207), (0.0255, 0.233), (0.0, 0.233)]),
    # Pocket clip along the top of the body.
    block("clip", (-0.004, BODY_R, 0.118), (0.004, BODY_R + 0.0016, 0.168), bevel=0.0006),
]
brass_parts = [
    # Bezel ring at the head, with a lip holding the glass.
    lathe("bezel", [(0.0225, 0.2325), (0.0262, 0.2325), (0.0266, 0.236), (0.0266, 0.2425), (0.0258, 0.245),
                    (0.0222, 0.245), (0.0222, 0.2425), (0.0225, 0.2325)]),
    # A thin collar between grip and body.
    lathe("collar", [(0.0, 0.106), (0.0178, 0.106), (0.0181, 0.108), (0.0181, 0.112), (0.0178, 0.114), (0.0, 0.114)]),
    # Brass ring at the tail.
    lathe("tail_ring", [(0.0, 0.019), (0.0172, 0.019), (0.0175, 0.0205), (0.0175, 0.0235), (0.0172, 0.025), (0.0, 0.025)]),
]
rubber_parts = [
    # Ribbed grip sleeve, where your hand holds it.
    lathe("grip", [(0.0, 0.025), (0.0168, 0.025)] + ribbed(0.026, 0.105, 0.0182, 0.0171, 0.0045) + [(0.0168, 0.106), (0.0, 0.106)]),
    # The push switch on top of the body.
    block("switch", (-0.0045, BODY_R - 0.001, 0.138), (0.0045, BODY_R + 0.0032, 0.152), bevel=0.0012),
]
reflector = lathe("reflector", [(0.004, 0.214), (0.010, 0.222), (0.016, 0.229), (0.0221, 0.2405), (0.0, 0.2405)])
glass = lathe("lens", [(0.0, 0.2408), (0.0222, 0.2408), (0.0222, 0.2428), (0.0, 0.2428)])
bulb = lathe("bulb", [(0.0, 0.2135), (0.0028, 0.214), (0.0032, 0.2165), (0.0022, 0.219), (0.0, 0.2195)], segments=16)


def join(name, parts):
    bpy.ops.object.select_all(action="DESELECT")
    for p in parts:
        p.select_set(True)
    bpy.context.view_layer.objects.active = parts[0]
    bpy.ops.object.join()
    ob = bpy.context.active_object
    ob.name = name
    return ob


nickel = join("torch_body", nickel_parts)
brass = join("torch_brass", brass_parts)
rubber = join("torch_grip", rubber_parts)


# --- Materials ------------------------------------------------------------------------------
def node(nt, kind, **inputs):
    n = nt.nodes.new(kind)
    for key, value in inputs.items():
        n.inputs[key].default_value = value
    return n


def mix(nt, a, b, factor):
    m = nt.nodes.new("ShaderNodeMix")
    m.data_type = "RGBA"
    nt.links.new(factor, m.inputs["Factor"])
    for socket, value in ((m.inputs[6], a), (m.inputs[7], b)):
        if isinstance(value, tuple):
            socket.default_value = (*value, 1)
        else:
            nt.links.new(value, socket)
    return m.outputs[2]


def ramp(nt, value, lo, hi):
    """Maps value from [lo, hi] to [0, 1], clamped."""
    m = node(nt, "ShaderNodeMapRange", **{"From Min": lo, "From Max": hi})
    nt.links.new(value, m.inputs["Value"])
    return m.outputs["Result"]


def procedural(name, base, worn, rough_lo, rough_hi, metal, wear_amount, grime_amount, brushed):
    """Returns (material, colour socket, roughness socket) for baking."""
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    nt = m.node_tree
    coord = nt.nodes.new("ShaderNodeTexCoord").outputs["Object"]
    # Brushed: noise stretched along the torch (Y), so streaks run lengthwise.
    mapping = node(nt, "ShaderNodeMapping")
    mapping.inputs["Scale"].default_value = (900.0, 12.0, 900.0) if brushed else (60.0, 60.0, 60.0)
    nt.links.new(coord, mapping.inputs["Vector"])
    streak = node(nt, "ShaderNodeTexNoise", Detail=6.0, Roughness=0.6)
    nt.links.new(mapping.outputs["Vector"], streak.inputs["Vector"])
    blotch = node(nt, "ShaderNodeTexNoise", Scale=90.0, Detail=4.0, Roughness=0.55)
    nt.links.new(coord, blotch.inputs["Vector"])
    # Wear on raised edges (pointiness) broken up by blotches.
    geo = nt.nodes.new("ShaderNodeNewGeometry")
    edge = ramp(nt, geo.outputs["Pointiness"], 0.52, 0.62)
    wear_mask = node(nt, "ShaderNodeMath")
    wear_mask.operation = "MULTIPLY"
    nt.links.new(edge, wear_mask.inputs[0])
    nt.links.new(ramp(nt, blotch.outputs["Fac"], 0.35, 0.6), wear_mask.inputs[1])
    wear = node(nt, "ShaderNodeMath")
    wear.operation = "MULTIPLY"
    nt.links.new(wear_mask.outputs[0], wear.inputs[0])
    wear.inputs[1].default_value = wear_amount
    # Grime where the surface is hidden (grooves, under the bezel).
    ao = nt.nodes.new("ShaderNodeAmbientOcclusion")
    ao.inputs["Distance"].default_value = 0.006
    grime = node(nt, "ShaderNodeMath")
    grime.operation = "MULTIPLY"
    nt.links.new(ramp(nt, ao.outputs["AO"], 0.95, 0.4), grime.inputs[0])
    grime.inputs[1].default_value = grime_amount
    shade = mix(nt, base, (base[0] * 0.8, base[1] * 0.8, base[2] * 0.8), streak.outputs["Fac"])
    colour = mix(nt, shade, worn, wear.outputs[0])
    colour = mix(nt, colour, (0.035, 0.03, 0.025), grime.outputs[0])
    rough = node(nt, "ShaderNodeMapRange", **{"To Min": rough_lo, "To Max": rough_hi})
    nt.links.new(streak.outputs["Fac"], rough.inputs["Value"])
    rough_out = node(nt, "ShaderNodeMath")
    rough_out.operation = "ADD"
    rough_out.use_clamp = True
    nt.links.new(rough.outputs["Result"], rough_out.inputs[0])
    nt.links.new(grime.outputs[0], rough_out.inputs[1])
    m["metal"] = metal
    return m, colour, rough_out.outputs[0]


def bake(ob, name, base, worn, rough_lo, rough_hi, metal, wear_amount, grime_amount, brushed):
    """Unwraps ob, bakes the procedural colour and roughness into 1K images, and gives ob a plain
    image-textured material the glTF exporter understands."""
    bpy.ops.object.select_all(action="DESELECT")
    ob.select_set(True)
    bpy.context.view_layer.objects.active = ob
    bpy.ops.object.mode_set(mode="EDIT")
    bpy.ops.mesh.select_all(action="SELECT")
    bpy.ops.uv.smart_project(angle_limit=math.radians(60), island_margin=0.006)
    bpy.ops.object.mode_set(mode="OBJECT")
    src, colour, rough = procedural(name, base, worn, rough_lo, rough_hi, metal, wear_amount, grime_amount, brushed)
    ob.data.materials.clear()
    ob.data.materials.append(src)
    nt = src.node_tree
    out = nt.nodes["Material Output"]
    emit = nt.nodes.new("ShaderNodeEmission")
    nt.links.new(emit.outputs[0], out.inputs["Surface"])
    target = nt.nodes.new("ShaderNodeTexImage")
    images = {}
    for kind, socket, non_color in (("diff", colour, False), ("rough", rough, True)):
        img = bpy.data.images.new(f"{name}_{kind}", TEX_SIZE, TEX_SIZE)
        if non_color:
            img.colorspace_settings.name = "Non-Color"
        target.image = img
        nt.nodes.active = target
        nt.links.new(socket, emit.inputs["Color"])
        bpy.ops.object.bake(type="EMIT", margin=8)
        img.filepath_raw = os.path.join(OUT, "textures", f"{name}_{kind}.png")
        img.file_format = "PNG"
        img.save()
        images[kind] = img
    final = bpy.data.materials.new(name)
    final.use_nodes = True
    fnt = final.node_tree
    bsdf = fnt.nodes["Principled BSDF"]
    d = fnt.nodes.new("ShaderNodeTexImage")
    d.image = images["diff"]
    fnt.links.new(d.outputs["Color"], bsdf.inputs["Base Color"])
    r = fnt.nodes.new("ShaderNodeTexImage")
    r.image = images["rough"]
    fnt.links.new(r.outputs["Color"], bsdf.inputs["Roughness"])
    bsdf.inputs["Metallic"].default_value = metal
    ob.data.materials.clear()
    ob.data.materials.append(final)
    bpy.data.materials.remove(src)


def plain(ob, name, rgb, rough, metal, transmission=0.0):
    m = bpy.data.materials.new(name)
    m.use_nodes = True
    b = m.node_tree.nodes["Principled BSDF"]
    b.inputs["Base Color"].default_value = (*rgb, 1)
    b.inputs["Roughness"].default_value = rough
    b.inputs["Metallic"].default_value = metal
    if transmission:
        b.inputs["Transmission Weight"].default_value = transmission
    ob.data.materials.append(m)


os.makedirs(os.path.join(OUT, "textures"), exist_ok=True)
NICKEL = (0.56, 0.55, 0.52)
BRASS = (0.72, 0.53, 0.28)
bake(nickel, "torch_nickel", NICKEL, BRASS, 0.22, 0.42, 1.0, 0.85, 0.75, brushed=True)
bake(brass, "torch_brass", BRASS, (0.85, 0.68, 0.42), 0.25, 0.45, 1.0, 0.6, 0.8, brushed=True)
bake(rubber, "torch_rubber", (0.03, 0.028, 0.026), (0.07, 0.065, 0.06), 0.62, 0.85, 0.0, 0.5, 0.4, brushed=False)
plain(reflector, "torch_reflector", (0.9, 0.88, 0.84), 0.06, 1.0)
plain(bulb, "torch_bulb", (0.95, 0.9, 0.8), 0.1, 0.0)
# Named "glass" so the game finds the lens (heldFlashlight.ts) and makes it glow.
plain(glass, "torch_lens_glass", (0.92, 0.94, 0.95), 0.03, 0.0, transmission=0.0)

bpy.ops.export_scene.gltf(filepath=os.path.join(OUT, "hand_torch.gltf"), export_format="GLTF_SEPARATE",
                          export_texture_dir="textures", export_yup=True, export_apply=True)
print("Torch written to", OUT)
