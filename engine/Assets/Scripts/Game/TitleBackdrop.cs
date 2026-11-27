using System.Linq;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// Behind the menus before you are in a room (owner, 2026-11-27: "background should be animated",
    /// a horror one): the hotel itself. A torch creeps slowly down the East Corridor in the fog. The
    /// beam dips, and when it comes back there is someone standing far down the corridor; it dips
    /// again and they are closer; once more and they are gone. Then the view fades to black and the
    /// walk starts over. No sound, no sudden jump: it is meant to be watched, not to startle.
    ///
    /// Lives on the menu camera's object, so it goes when that camera goes (into a room) and its torch
    /// and figure are hidden while the camera's object is (the speed test). The torch's slight wobble
    /// stays off until the photosensitivity warning is answered, and for good with the mode on; the
    /// dips are slow fades either way, never flashes.
    /// </summary>
    public class TitleBackdrop : MonoBehaviour
    {
        /// <summary>The corridor walked, as map.json names it.</summary>
        const string Corridor = "East Corridor";
        /// <summary>One walk, in seconds, from fading in to fading out.</summary>
        const float LoopSec = 50;
        const float FadeSec = 3;
        /// <summary>From the corridor's south end, how far in the walk starts, and how far it goes.</summary>
        const float StartInM = 0.6f, WalkM = 3.2f;
        /// <summary>Where the figure stands, metres down the corridor from the walk's start: first far, then near.</summary>
        const float FarM = 10.5f, NearM = 6.2f;
        /// <summary>When the beam dips (seconds into the walk): the figure is there after the first, closer after the second, gone after the third.</summary>
        static readonly float[] DipAt = { 13, 25, 37 };
        const float DipDownSec = 1.1f, DipHoldSec = 0.7f, DipUpSec = 1.3f;
        /// <summary>How dark the beam goes in a dip (0 is off).</summary>
        const float DipTo = 0.04f;
        const float VerticalFovDeg = 58;
        /// <summary>The careful walk's sway: metres side to side and up and down, degrees of turn.</summary>
        const float SwayM = 0.05f, BobM = 0.02f, TurnDeg = 2.4f;
        /// <summary>The torch's wobble when allowed: a share of its brightness.</summary>
        const float Wobble = 0.06f;
        /// <summary>The figure stands this far to one side of the corridor's middle.</summary>
        const float FigureAsideM = 0.25f;

        Camera view;
        Light torch;
        Transform figure, head;
        Vector3 from, ahead, side;
        float eyeM, started;
        bool ready;

        /// <summary>Whether the torch may wobble (the warning answered and the mode off); asked each frame.</summary>
        public System.Func<bool> WobbleAllowed;

        /// <summary>Sets it up on the menu camera: the hotel drawn, the corridor found, the figure made.</summary>
        public void Begin(Camera camera, WorldData world, object config, Material baseMaterial)
        {
            view = camera;
            var room = world.Rooms.FirstOrDefault(r => r.Name == Corridor);
            if (room == null) { Debug.LogWarning("Title backdrop: no " + Corridor + " in the map; black behind the menus."); return; }
            view.cullingMask = HauntedHeld.WorldMask;
            view.clearFlags = CameraClearFlags.SolidColor;
            view.backgroundColor = Color.black;
            view.nearClipPlane = Game.CameraNearM;
            view.farClipPlane = 60;
            view.fieldOfView = VerticalFovDeg;

            eyeM = (float)Json.Num(Json.Obj(config, "movement"), "eyeHeightM");
            double cx = (room.MinX + room.MaxX) / 2;
            // Down the corridor from its south end (map z falls going north).
            var floor = Coords.Place(world, cx, room.MaxZ - StartInM);
            var end = Coords.Place(world, cx, room.MinZ);
            from = floor + Vector3.up * eyeM;
            ahead = (end - floor).normalized;
            side = Vector3.Cross(Vector3.up, ahead).normalized;

            var f = Json.Obj(config, "flashlight");
            torch = Torch.Make(transform, LocalPlayer.TorchAt, Vector3.forward * LocalPlayer.BeamAimM, Json.Num(f, "coneM"), Json.Num(f, "coneHalfAngleDeg"));
            torch.enabled = true;

            MakeFigure(baseMaterial);
            started = Time.unscaledTime;
            ready = true;
        }

        /// <summary>
        /// Someone tall and thin in a long dark coat, head bowed a little, arms hanging: a shape, not a
        /// face. Near black, so the beam finds an outline rather than detail.
        /// </summary>
        void MakeFigure(Material baseMaterial)
        {
            var cloth = new Material(baseMaterial) { name = "Title figure" };
            var dark = new Color(0.018f, 0.017f, 0.02f);
            cloth.color = dark;
            if (cloth.HasProperty("_BaseColor")) cloth.SetColor("_BaseColor", dark);
            if (cloth.HasProperty("_Smoothness")) cloth.SetFloat("_Smoothness", 0.08f);
            if (cloth.HasProperty("_Metallic")) cloth.SetFloat("_Metallic", 0);
            cloth.mainTexture = null;

            figure = new GameObject("Title figure").transform;
            // Beside the camera's object, not under it: it stands still while the view moves.
            figure.SetParent(transform.parent, false);
            // The coat: wider at the hem, narrow at the shoulders.
            Part(PrimitiveType.Cylinder, cloth, figure, new Vector3(0, 0.55f, 0), new Vector3(0.52f, 0.55f, 0.36f), Quaternion.identity);
            Part(PrimitiveType.Cylinder, cloth, figure, new Vector3(0, 1.25f, 0), new Vector3(0.42f, 0.32f, 0.27f), Quaternion.identity);
            Part(PrimitiveType.Sphere, cloth, figure, new Vector3(0, 1.58f, 0.02f), new Vector3(0.5f, 0.2f, 0.3f), Quaternion.identity);
            // Arms hanging long, a little apart from the body.
            foreach (int s in new[] { -1, 1 })
                Part(PrimitiveType.Capsule, cloth, figure, new Vector3(s * 0.27f, 1.1f, 0.02f), new Vector3(0.1f, 0.42f, 0.1f), Quaternion.Euler(0, 0, s * 4));
            // The neck, and the head bowed forward and tipped.
            Part(PrimitiveType.Cylinder, cloth, figure, new Vector3(0, 1.7f, 0.03f), new Vector3(0.11f, 0.08f, 0.11f), Quaternion.identity);
            head = new GameObject("Head").transform;
            head.SetParent(figure, false);
            head.localPosition = new Vector3(0, 1.82f, 0.06f);
            head.localRotation = Quaternion.Euler(14, 0, 6);
            Part(PrimitiveType.Sphere, cloth, head, Vector3.zero, new Vector3(0.2f, 0.25f, 0.22f), Quaternion.identity);
            figure.gameObject.SetActive(false);
        }

        static void Part(PrimitiveType shape, Material material, Transform parent, Vector3 at, Vector3 size, Quaternion turn)
        {
            var go = GameObject.CreatePrimitive(shape);
            Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            go.transform.localScale = size;
            go.transform.localRotation = turn;
            var r = go.GetComponent<MeshRenderer>();
            r.sharedMaterial = material;
            r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
        }

        /// <summary>Tests: the walk as it is `sec` seconds in.</summary>
        public void SkipTo(float sec) { started = Time.unscaledTime - sec; }

        /// <summary>The figure hides with the camera's object (the speed test) and goes with it.</summary>
        void OnDisable() { if (figure != null) figure.gameObject.SetActive(false); }
        void OnDestroy() { if (figure != null) Destroy(figure.gameObject); }

        void LateUpdate()
        {
            if (!ready) return;
            float t = (Time.unscaledTime - started) % LoopSec;
            float clock = Time.unscaledTime;

            // The slow creep forward, easing in and out, with the sway of someone walking carefully.
            float walk = Mathf.SmoothStep(0, 1, t / LoopSec) * WalkM;
            transform.position = from + ahead * walk
                + side * (SwayM * Mathf.Sin(clock * 0.9f))
                + Vector3.up * (BobM * Mathf.Sin(clock * 1.8f));
            float yaw = TurnDeg * Mathf.Sin(clock * 0.23f) + 0.8f * Mathf.Sin(clock * 0.61f);
            float pitch = 1.5f + 0.8f * Mathf.Sin(clock * 0.37f);
            transform.rotation = Quaternion.LookRotation(ahead) * Quaternion.Euler(pitch, yaw, 0);

            // Brightness: faded in and out at the ends of the walk, dipping three times.
            float light = Mathf.Clamp01(t / FadeSec) * Mathf.Clamp01((LoopSec - t) / FadeSec);
            int dips = 0;
            float dip = 1;
            foreach (float d in DipAt)
            {
                if (t - d >= DipDownSec) dips++;
                dip = Mathf.Min(dip, Dip(t - d));
            }
            light *= dip;
            if (WobbleAllowed != null && WobbleAllowed())
                light *= 1 - Wobble * Mathf.PerlinNoise(clock * 2.2f, 0.37f);
            torch.intensity = Torch.Intensity * light;

            // The figure: there after the first dip (in its darkest moment), closer after the second, gone after the third.
            bool there = dips == 1 || dips == 2;
            if (figure.gameObject.activeSelf != there) figure.gameObject.SetActive(there);
            if (there)
            {
                var stand = from - Vector3.up * eyeM + ahead * (dips == 1 ? FarM : NearM) + side * FigureAsideM;
                figure.position = stand;
                figure.rotation = Quaternion.LookRotation(-ahead);
                // Its head turns, very slowly, as if listening.
                head.localRotation = Quaternion.Euler(14, 7 * Mathf.Sin(clock * 0.17f), 6);
            }
        }

        /// <summary>A dip's brightness, `into` seconds after it begins: down slowly, held, back up.</summary>
        static float Dip(float into)
        {
            if (into < 0) return 1;
            if (into < DipDownSec) return Mathf.Lerp(1, DipTo, Mathf.SmoothStep(0, 1, into / DipDownSec));
            into -= DipDownSec;
            if (into < DipHoldSec) return DipTo;
            into -= DipHoldSec;
            if (into < DipUpSec) return Mathf.Lerp(DipTo, 1, Mathf.SmoothStep(0, 1, into / DipUpSec));
            return 1;
        }
    }
}
