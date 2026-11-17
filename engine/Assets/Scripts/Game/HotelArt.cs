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
    }

    /// <summary>
    /// Every dressed build, made by the editor command ImportHotel (Haunted.Editor.HotelImport) from
    /// tools/engine-rooms.ts's output. Lives in engine/Assets/Hotel/Resources, which is never committed:
    /// without it the game shows the grey-box hotel, as before step D.
    /// </summary>
    public class HotelArt : ScriptableObject
    {
        public List<RoomArt> rooms = new List<RoomArt>();

        public static HotelArt Load()
        {
            return Resources.Load<HotelArt>("HotelArt");
        }
    }
}
