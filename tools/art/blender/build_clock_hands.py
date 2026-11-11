# Exports the grandfather clock's two hands for the game, which turns them (the clock task, GDD 26.5).
# The case is baked into the room (build_room.py grandfather_clock); the hands are taken from the
# same model, each turned to point at 12 around its own pivot (the dial's centre), so the game's
# angles start from 12. Black metal, no textures: the hands are black on the model too.
# Run: blender --background --factory-startup --python-exit-code 1 --python tools/art/blender/build_clock_hands.py
# Writes client/public/assets/stations/clock_hands.glb with nodes "hour" and "minute", each at
# its pivot, in the model's own axes (front +z in glTF, the same as the case).
import math
import os

import bpy
from mathutils import Matrix

ROOT = os.path.abspath(os.path.join(os.path.dirname(__file__), "../../.."))
SOURCE = os.path.join(ROOT, "assets-src/models/vintage_grandfather_clock_01/vintage_grandfather_clock_01_2k.gltf")
OUT = os.path.join(ROOT, "client/public/assets/stations/clock_hands.glb")

bpy.ops.wm.read_factory_settings(use_empty=True)
bpy.ops.import_scene.gltf(filepath=SOURCE)
scene = bpy.context.scene

metal = bpy.data.materials.new("clock_hand")
metal.use_nodes = True
bsdf = metal.node_tree.nodes["Principled BSDF"]
bsdf.inputs["Base Color"].default_value = (0.018, 0.016, 0.014, 1)
bsdf.inputs["Metallic"].default_value = 1.0
bsdf.inputs["Roughness"].default_value = 0.38

for ob in list(scene.objects):
    if ob.name.endswith("HourHand"):
        name = "hour"
    elif ob.name.endswith("MinuteHand"):
        name = "minute"
    else:
        bpy.data.objects.remove(ob, do_unlink=True)
        continue
    me = ob.data
    # Point it at 12: find its tip (the vertex farthest from the pivot, in the dial's plane, x-z)
    # and turn the mesh around the dial's axis (y) until the tip is straight up.
    tip = max(me.vertices, key=lambda v: v.co.x * v.co.x + v.co.z * v.co.z).co
    angle = math.atan2(tip.x, tip.z)
    me.transform(Matrix.Rotation(-angle, 4, "Y"))
    me.materials.clear()
    me.materials.append(metal)
    ob.name = name
    print(f"{name}: tip was {math.degrees(angle):.1f} degrees from 12, at", tuple(round(c, 4) for c in ob.location))

os.makedirs(os.path.dirname(OUT), exist_ok=True)
bpy.ops.export_scene.gltf(filepath=OUT, export_format="GLB", export_yup=True, export_apply=True)
print("Clock hands written to", OUT)
