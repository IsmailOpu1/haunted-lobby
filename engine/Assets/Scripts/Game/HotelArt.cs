using System;
using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>One dressed build: a room (or a few that share one build, like the corridors), its model and baked light.</summary>
    [Serializable]
    public class RoomArt
    {
        public string name;
        /// <summary>The map rooms this build dresses; their grey floors are left out.</summary>
        public string[] rooms;
        /// <summary>The imported glTF (engine/Assets/Hotel/Rooms), in the browser's world coordinates.</summary>
        public GameObject model;
        /// <summary>Its Blender-baked light as a Unity lightmap (light itself, not light / scale).</summary>
        public Texture2D lightmap;
        /// <summary>Map furniture, hiding spots and stairs the model draws, so their grey boxes are left out.</summary>
        public string[] drawn;
        /// <summary>
        /// Where its reflections are taken (the browser's world x, z), from its dressing; none means
        /// one in the middle of the build.
        /// </summary>
        public Vector2[] probes;
    }

    /// <summary>
    /// A glass material of the rooms (KHR_materials_transmission), as its glTF file says: glTFast
    /// keeps none of this when URP draws no opaque texture at import, so the import reads it from the
    /// file and DressedRooms draws such glass with the browser's transmission (HauntedGlass).
    /// </summary>
    [Serializable]
    public class GlassArt
    {
        /// <summary>The material's glTF name (glTFast names its Unity material the same).</summary>
        public string material;
        /// <summary>How much light passes (transmissionFactor), and per texel (red of the map) when set.</summary>
        public float transmission;
        public Texture2D transmissionMap;
        /// <summary>baseColorFactor, linear, alpha as given (glTFast's stand-in alters it).</summary>
        public Color baseColor;
        /// <summary>alphaMode BLEND: drawn over what is behind by its alpha, without writing depth.</summary>
        public bool blend;
    }

    /// <summary>
    /// Every dressed build, made by the editor command ImportHotel (Haunted.Editor.HotelImport) from
    /// tools/engine-rooms.ts's output. Lives in engine/Assets/Hotel/Resources, which is never committed:
    /// without it the game shows the grey-box hotel, as before step D.
    /// </summary>
    public class HotelArt : ScriptableObject
    {
        public List<RoomArt> rooms = new List<RoomArt>();
        /// <summary>The door models (client/src/doorModels.ts): a piece per style, part and width, by name.</summary>
        public GameObject doors;
        /// <summary>Each door's style by map id, then door id: the dressing's doors (JSON).</summary>
        public string doorStyles;
        /// <summary>The stations' own models (stations.ts): the clock's hands, the cradle, the trunk.</summary>
        public GameObject clockHands, cradle, trunk;
        /// <summary>The rooms' and models' glass materials.</summary>
        public List<GlassArt> glass = new List<GlassArt>();

        public static HotelArt Load()
        {
            return Resources.Load<HotelArt>("HotelArt");
        }
    }
}
