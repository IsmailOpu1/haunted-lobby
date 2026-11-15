using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The simulation (and the browser version, three.js) is right-handed with yaw 0 looking toward -z.
    /// Unity is left-handed. Flipping z keeps every room the same way round as in the browser:
    /// simulation (x, y, z) is Unity (x, y, -z), and yaw turns into Unity's angle around y as -yaw.
    /// </summary>
    public static class Coords
    {
        public static Vector3 ToUnity(WorldPoint p)
        {
            return new Vector3((float)p.X, (float)p.Y, (float)-p.Z);
        }

        /// <summary>A simulation point on its floor (or partway up the stairs), in Unity.</summary>
        public static Vector3 Place(WorldData world, double x, double z)
        {
            return ToUnity(Levels.ToWorld(world, x, z));
        }

        /// <summary>The rotation for a simulation look direction.</summary>
        public static Quaternion Look(double yaw, double pitch)
        {
            return Quaternion.Euler((float)(-pitch * Mathf.Rad2Deg), (float)(-yaw * Mathf.Rad2Deg), 0);
        }

        public static Quaternion Facing(double yaw)
        {
            return Quaternion.Euler(0, (float)(-yaw * Mathf.Rad2Deg), 0);
        }

        public static Color ParseColor(string hex, Color fallback)
        {
            Color c;
            return hex != null && ColorUtility.TryParseHtmlString(hex, out c) ? c : fallback;
        }
    }
}
