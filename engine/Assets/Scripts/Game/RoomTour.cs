using System.Collections;
using System.Globalization;
using System.IO;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The room-by-room picture test of step D (docs/plans/engine-port.md): with `-roomShots DIR` the
    /// game needs no server; a camera stands in the middle of each room at eye height and takes a
    /// picture looking each of four ways (yaw 0, 90, 180, 270 degrees, the browser's yaw), saved as
    /// DIR/&lt;room&gt;-&lt;yaw&gt;.png; with -torch, by the light of your torch. The browser's game.ts
    /// roomTour takes the same views.
    /// Then the game quits.
    /// </summary>
    public class RoomTour : MonoBehaviour
    {
        /// <summary>The same in the browser's tour: a fixed up-down view angle, so both frame alike.</summary>
        public const float VerticalFovDeg = 60;
        /// <summary>Frames for textures and shaders to settle before each picture.</summary>
        const int SettleFrames = 3;

        [System.NonSerialized] public string Dir;
        [System.NonSerialized] public WorldData World;
        [System.NonSerialized] public float EyeHeightM;
        /// <summary>Only rooms whose names contain this (case-insensitive), or every room.</summary>
        [System.NonSerialized] public string Only;
        /// <summary>Whether the hotel is ready to be pictured (its reflections taken).</summary>
        [System.NonSerialized] public System.Func<bool> Ready;
        /// <summary>With `-torch`: config.flashlight, and every picture is taken by your torch, at full strength.</summary>
        [System.NonSerialized] public object Flashlight;
        /// <summary>With `-closeUps`: the map, and the tour takes each station, search place, salt jar and door instead of the rooms.</summary>
        [System.NonSerialized] public MapInfo Map;
        public bool Done { get; private set; }

        /// <summary>The same in the browser's tour (game.ts closeUpViews): how far in front of a station, and of a door on each side, you stand.</summary>
        public const double StationStandM = 1.6, StationPitchRad = -0.35, DoorStandM = 2.0;

        public struct View { public string Name; public double X, Z, Yaw, Pitch; }

        /// <summary>
        /// The close-ups (sim x, z): each task station, relic search place and salt jar from in front
        /// (it faces away from its wall: Stations.FacingYaw), looking a little down; each door from
        /// both sides, level. Named close-&lt;kind&gt;-&lt;id&gt;, doors -a (the + side) and -b.
        /// </summary>
        public static System.Collections.Generic.List<View> CloseUpViews(MapInfo map)
        {
            var views = new System.Collections.Generic.List<View>();
            void Front(string name, double x, double z)
            {
                double yaw = Stations.FacingYaw(map, x, z);
                views.Add(new View { Name = name, X = x + System.Math.Sin(yaw) * StationStandM, Z = z + System.Math.Cos(yaw) * StationStandM, Yaw = yaw, Pitch = StationPitchRad });
            }
            foreach (var t in map.Tasks) Front("close-task-" + t.Id, t.At.X, t.At.Z);
            foreach (var spot in map.RelicSpots)
                foreach (var p in spot.Places ?? new System.Collections.Generic.List<MapInfo.Place> { new MapInfo.Place { Id = spot.Id, At = spot.At } })
                    Front("close-search-" + p.Id, p.At.X, p.At.Z);
            foreach (var jar in map.SaltJars) Front("close-salt-" + jar.Key, jar.Value.X, jar.Value.Z);
            foreach (var d in map.Doors)
            {
                // A door across x is passed along z, and the other way round.
                double dx = d.Axis == "x" ? 0 : DoorStandM, dz = d.Axis == "x" ? DoorStandM : 0;
                views.Add(new View { Name = "close-door-" + d.Id + "-a", X = d.At.X + dx, Z = d.At.Z + dz, Yaw = System.Math.Atan2(dx, dz), Pitch = 0 });
                views.Add(new View { Name = "close-door-" + d.Id + "-b", X = d.At.X - dx, Z = d.At.Z - dz, Yaw = System.Math.Atan2(-dx, -dz), Pitch = 0 });
            }
            return views;
        }

        IEnumerator Start()
        {
            while (Ready != null && !Ready()) yield return null;
            Directory.CreateDirectory(Dir);
            var camera = new GameObject("Tour view").AddComponent<Camera>();
            camera.nearClipPlane = 0.05f;
            camera.farClipPlane = 60;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = Color.black;
            camera.fieldOfView = VerticalFovDeg;
            if (Flashlight != null)
            {
                var torch = Torch.Make(camera.transform, LocalPlayer.TorchAt, Vector3.forward * LocalPlayer.BeamAimM, Json.Num(Flashlight, "coneM"), Json.Num(Flashlight, "coneHalfAngleDeg"));
                torch.enabled = true;
                // Test aid: -torchDecay D tries another fall-off.
                string decay = System.Array.IndexOf(System.Environment.GetCommandLineArgs(), "-torchDecay") is int at && at >= 0 ? System.Environment.GetCommandLineArgs()[at + 1] : null;
                if (decay != null) UnityEngine.Rendering.Universal.HauntedLightDecay.Set(torch, float.Parse(decay, CultureInfo.InvariantCulture));
                Debug.Log("Room tour by torchlight: intensity " + torch.intensity + ", range " + torch.range + ", angles " + torch.spotAngle + "/" + torch.innerSpotAngle + ", baked " + torch.bakingOutput.isBaked + " " + torch.bakingOutput.lightmapBakeType + ", decay " + UnityEngine.Rendering.Universal.HauntedLightDecay.Of(torch));
            }
            if (Map != null)
            {
                foreach (var v in CloseUpViews(Map))
                {
                    if (!string.IsNullOrEmpty(Only) && v.Name.IndexOf(Only, System.StringComparison.OrdinalIgnoreCase) < 0) continue;
                    camera.transform.position = Coords.Place(World, v.X, v.Z) + Vector3.up * EyeHeightM;
                    camera.transform.rotation = Coords.Look(v.Yaw, v.Pitch);
                    for (int i = 0; i < SettleFrames; i++) yield return null;
                    yield return new WaitForEndOfFrame();
                    var shot = ScreenCapture.CaptureScreenshotAsTexture();
                    File.WriteAllBytes(Path.Combine(Dir, v.Name + ".png"), shot.EncodeToPNG());
                    Destroy(shot);
                }
                Done = true;
                Debug.Log("Close-up tour done: " + Dir);
                Application.Quit();
                yield break;
            }
            foreach (var room in World.Rooms)
            {
                if (!string.IsNullOrEmpty(Only) && room.Name.IndexOf(Only, System.StringComparison.OrdinalIgnoreCase) < 0) continue;
                var middle = Coords.Place(World, (room.MinX + room.MaxX) / 2, (room.MinZ + room.MaxZ) / 2);
                camera.transform.position = middle + Vector3.up * EyeHeightM;
                foreach (int yaw in new[] { 0, 90, 180, 270 })
                {
                    camera.transform.rotation = Coords.Look(yaw * Mathf.Deg2Rad, 0);
                    for (int i = 0; i < SettleFrames; i++) yield return null;
                    yield return new WaitForEndOfFrame();
                    string path = Path.Combine(Dir, room.Name + "-" + yaw.ToString(CultureInfo.InvariantCulture) + ".png");
                    var shot = ScreenCapture.CaptureScreenshotAsTexture();
                    File.WriteAllBytes(path, shot.EncodeToPNG());
                    Destroy(shot);
                }
                Debug.Log("Room tour: " + room.Name);
            }
            Done = true;
            Debug.Log("Room tour done: " + Dir);
            Application.Quit();
        }
    }
}
