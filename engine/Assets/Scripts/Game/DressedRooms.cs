using System;
using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The dressed rooms in the hotel (step D1 of docs/plans/engine-port.md), as the browser's
    /// client/src/dressedRooms.ts shows them: each build where Blender put it, lit by its own baked
    /// lightmap; bulbs and flames are not lightmapped, they glow by themselves.
    /// </summary>
    public class DressedRooms
    {
        /// <summary>The browser's BULB_PREFIX: meshes named so are light sources, never lightmapped.</summary>
        const string BulbPrefix = "bulb_";

        public readonly HashSet<string> Rooms = new HashSet<string>();
        public readonly HashSet<string> Drawn = new HashSet<string>();
        public readonly GameObject Root;

        public DressedRooms(HotelArt art)
        {
            Root = new GameObject("Dressed rooms");
            // glTFast brings glTF (x, y, z) in as Unity (-x, y, z); the game's Unity space is (x, y, -z)
            // (Coords), which is that turned half a circle around y.
            Root.transform.rotation = Quaternion.Euler(0, 180, 0);
            var lightmaps = new List<LightmapData>();
            foreach (var room in art.rooms)
            {
                if (room.model == null || room.lightmap == null) continue;
                int index = lightmaps.Count;
                lightmaps.Add(new LightmapData { lightmapColor = room.lightmap });
                var build = UnityEngine.Object.Instantiate(room.model, Root.transform, false);
                build.name = room.name;
                foreach (var r in build.GetComponentsInChildren<MeshRenderer>(true))
                {
                    if (r.gameObject.name.StartsWith(BulbPrefix, StringComparison.Ordinal)) continue;
                    // The lightmap covers the whole build with its own UVs (glTF TEXCOORD_1 = Unity uv2).
                    r.lightmapIndex = index;
                    r.lightmapScaleOffset = new Vector4(1, 1, 0, 0);
                }
                foreach (var name in room.rooms ?? new string[0]) Rooms.Add(name);
                foreach (var id in room.drawn ?? new string[0]) Drawn.Add(id);
            }
            LightmapSettings.lightmapsMode = LightmapsMode.NonDirectional;
            LightmapSettings.lightmaps = lightmaps.ToArray();
        }
    }
}
