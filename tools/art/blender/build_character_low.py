# The Low quality copy of a player character (PRD 9: Low draws under 250 calls and 300,000
# triangles a frame, and seven other players can be in view at once). The props fixed to a bone
# (hats, tools) become part of the skinned body, moved by that bone alone, and every piece is
# joined into one mesh, so build-characters.ts can draw each character with a few calls; it also
# simplifies the mesh and halves the textures. The full copy (build_character.py) is unchanged.
#
# Run (headless):
#   blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_character_low.py -- <id>
#   reads assets-src/build/char-<id>.glb, writes assets-src/build/char-<id>-low.glb
import json
import math
import os
import struct
import sys

import bpy
from mathutils import Matrix, Quaternion, Vector

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
args = sys.argv[sys.argv.index("--") + 1:] if "--" in sys.argv else []
WHO = args[0]
SOURCE = os.path.join(ROOT, f"assets-src/build/char-{WHO}.glb")
OUT = os.path.join(ROOT, f"assets-src/build/char-{WHO}-low.glb")

for o in list(bpy.data.objects):
    bpy.data.objects.remove(o, do_unlink=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
rig = next(o for o in bpy.data.objects if o.type == "ARMATURE")
if rig.animation_data:
    rig.animation_data.action = None
for b in rig.pose.bones:
    b.matrix_basis.identity()
bpy.context.view_layer.update()


def only(obs):
    for o in bpy.context.view_layer.objects:
        o.select_set(o in obs)
    bpy.context.view_layer.objects.active = obs[0]


# The importer adds an Icosphere, unparented, to draw bones with: not part of the character.
for o in [o for o in bpy.data.objects if o.type == "MESH" and o.parent is None]:
    bpy.data.objects.remove(o, do_unlink=True)
meshes = [o for o in bpy.data.objects if o.type == "MESH"]


def gltf_nodes(path):
    """The node list of a .glb's JSON."""
    with open(path, "rb") as f:
        data = f.read()
    length = struct.unpack_from("<I", data, 12)[0]
    return json.loads(data[20:20 + length])["nodes"]


NODES = gltf_nodes(SOURCE)
PARENT = {c: i for i, n in enumerate(NODES) for c in n.get("children", [])}
Y_UP_TO_Z_UP = Matrix.Rotation(math.radians(90), 4, "X")


def rest_place(name):
    """Where the prop called name sits in the rest pose, in Blender's space, from the file itself:
    Blender hangs a bone's children from the bone's far end, and the importer's bone ends are
    unreliable (some huge), so the importer's own placing of them is off."""
    i = next(k for k, n in enumerate(NODES) if n.get("name") == name)
    m = Matrix.Identity(4)
    while i is not None:
        n = NODES[i]
        if "matrix" in n:
            local = Matrix([n["matrix"][r::4] for r in range(4)])
        else:
            t = n.get("translation", (0, 0, 0))
            x, y, z, w = n.get("rotation", (0, 0, 0, 1))
            local = Matrix.LocRotScale(Vector(t), Quaternion((w, x, y, z)), Vector(n.get("scale", (1, 1, 1))))
        m = local @ m
        i = PARENT.get(i)
    return Y_UP_TO_Z_UP @ m @ Y_UP_TO_Z_UP.inverted()

for ob in meshes:
    if any(m.type == "ARMATURE" for m in ob.modifiers):
        continue
    # A prop on a bone: weighted wholly to that bone, where it is now.
    bone = ob.parent_bone if ob.parent_type == "BONE" else None
    if not bone:
        raise SystemExit(f"{ob.name} is neither skinned nor on a bone")
    world = rest_place(ob.name)
    ob.parent = rig
    ob.parent_type = "OBJECT"
    ob.matrix_world = world
    only([ob])
    bpy.ops.object.transform_apply(location=True, rotation=True, scale=True)
    group = ob.vertex_groups.new(name=bone)
    group.add(range(len(ob.data.vertices)), 1.0, "REPLACE")
    ob.modifiers.new("Armature", "ARMATURE").object = rig
    print(f"{ob.name} now moves with {bone}")

# One mesh: the skinned pieces share the armature, so they join as they are.
only(meshes)
bpy.context.view_layer.objects.active = max(meshes, key=lambda o: len(o.data.polygons))
bpy.ops.object.join()
joined = bpy.context.view_layer.objects.active
joined.name = joined.data.name = f"{WHO}_body"
print(f"joined into {joined.name}: {len(joined.data.polygons)} faces, {len(joined.material_slots)} materials")

for o in bpy.context.view_layer.objects:
    o.select_set(o in (rig, joined))
bpy.ops.export_scene.gltf(
    filepath=OUT,
    export_format="GLB",
    use_selection=True,
    export_yup=True,
    export_apply=False,
    export_skins=True,
    export_animations=False,
    export_def_bones=False,
    export_morph=False,
    export_image_format="AUTO",
    export_extras=False,
)
print("Wrote", OUT)
