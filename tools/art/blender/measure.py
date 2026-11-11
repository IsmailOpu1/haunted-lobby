# Prints each model's size in metres (x = width, y = depth, z = height in Blender's axes) and
# triangle count, so dressing can place pieces flush against walls.
# Run: blender --background --python tools/art/blender/measure.py -- assets-src/models
import bpy, sys, os, json
from mathutils import Vector

root = sys.argv[sys.argv.index("--") + 1]
out = {}
for name in sorted(os.listdir(root)):
    folder = os.path.join(root, name)
    gltf = next((f for f in os.listdir(folder) if f.endswith(".gltf")), None)
    if not gltf:
        continue
    bpy.ops.wm.read_factory_settings(use_empty=True)
    bpy.ops.import_scene.gltf(filepath=os.path.join(folder, gltf))
    meshes = [o for o in bpy.context.scene.objects if o.type == "MESH"]
    lo = Vector((1e9, 1e9, 1e9)); hi = Vector((-1e9, -1e9, -1e9)); tris = 0
    for o in meshes:
        for c in o.bound_box:
            w = o.matrix_world @ Vector(c)
            lo = Vector(map(min, lo, w)); hi = Vector(map(max, hi, w))
        tris += sum(len(p.vertices) - 2 for p in o.data.polygons)
    size = hi - lo
    out[name] = {"w": round(size.x, 3), "d": round(size.y, 3), "h": round(size.z, 3), "minZ": round(lo.z, 3), "tris": tris, "meshes": len(meshes)}
print("MEASURE " + json.dumps(out))
