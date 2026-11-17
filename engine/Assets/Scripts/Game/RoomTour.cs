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
        public bool Done { get; private set; }

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
