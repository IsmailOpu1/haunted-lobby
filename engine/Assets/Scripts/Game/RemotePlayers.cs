using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// Everyone else: a body (a capsule until step D brings the characters), a name over the head,
    /// and their torch. Drawn config.net.interpolationMs in the past, blending between the two
    /// server states around that moment, so they move smoothly between the server's 20 updates a second.
    /// </summary>
    public class RemotePlayers
    {
        class Snapshot
        {
            public double Time, X, Z, Yaw, Pitch;
            public bool Crouching;
        }

        class View
        {
            public GameObject Body;
            public Transform Head;
            public TextMesh Label;
            public Light Torch;
            /// <summary>Red eyes that glow for a moment after they Summon (GDD 14.2).</summary>
            public GameObject Eyes;
            public double EyesUntil;
            public readonly List<Snapshot> Snapshots = new List<Snapshot>();
        }

        readonly WorldData world;
        readonly double delaySec;
        readonly float height, radius;
        readonly Material material;
        readonly double coneM, coneHalfAngleDeg;
        /// <summary>remotePlayers.ts: the torch's lens on the head (Unity's z forward), and its colour.</summary>
        static readonly Vector3 RemoteTorchAt = new Vector3(0.2f, -0.25f, 0.2f);
        const float LensRadiusM = 0.05f;
        const int LensColour = 0xfff2d6;
        Material lens;
        readonly Dictionary<string, View> views = new Dictionary<string, View>();

        public RemotePlayers(WorldData world, object config, Material baseMaterial)
        {
            this.world = world;
            delaySec = Json.Num(Json.Obj(config, "net"), "interpolationMs") / 1000;
            var body = Json.Obj(config, "body");
            height = (float)Json.Num(body, "heightM");
            radius = (float)Json.Num(body, "radiusM");
            material = new Material(baseMaterial) { color = new Color(0.75f, 0.72f, 0.66f) };
            var flashlight = Json.Obj(config, "flashlight");
            coneM = Json.Num(flashlight, "coneM");
            coneHalfAngleDeg = Json.Num(flashlight, "coneHalfAngleDeg");
        }

        public int Count { get { return views.Count; } }

        /// <summary>The players drawn now, by session id.</summary>
        public IEnumerable<string> Ids { get { return views.Keys; } }

        /// <summary>Where a player's head is drawn now (their voice comes from there); null if unknown.</summary>
        public Vector3? PositionOf(string id)
        {
            View v;
            if (!views.TryGetValue(id, out v)) return null;
            return v.Head.position;
        }

        /// <summary>A new server state for one player.</summary>
        public void Push(string id, string name, double time, double x, double z, double yaw, double pitch, bool crouching, bool flashlightOn, bool visible)
        {
            View v;
            if (!views.TryGetValue(id, out v))
            {
                v = Create(id);
                views[id] = v;
            }
            v.Label.text = name;
            v.Torch.enabled = flashlightOn;
            v.Body.SetActive(visible);
            var last = v.Snapshots.Count > 0 ? v.Snapshots[v.Snapshots.Count - 1] : null;
            if (last != null && last.X == x && last.Z == z && last.Yaw == yaw && last.Pitch == pitch && last.Crouching == crouching)
            {
                last.Time = time; // standing still: keep the newest time so the blend does not stretch
                return;
            }
            v.Snapshots.Add(new Snapshot { Time = time, X = x, Z = z, Yaw = yaw, Pitch = pitch, Crouching = crouching });
            if (v.Snapshots.Count > 30) v.Snapshots.RemoveAt(0);
        }

        public void Remove(string id)
        {
            View v;
            if (!views.TryGetValue(id, out v)) return;
            Object.Destroy(v.Body);
            views.Remove(id);
        }

        /// <summary>Removes players that are no longer in the room.</summary>
        public void Keep(HashSet<string> ids)
        {
            var gone = new List<string>();
            foreach (var id in views.Keys) if (!ids.Contains(id)) gone.Add(id);
            foreach (var id in gone) Remove(id);
        }

        View Create(string id)
        {
            var v = new View();
            v.Body = new GameObject("Player " + id);
            var capsule = GameObject.CreatePrimitive(PrimitiveType.Capsule);
            Object.Destroy(capsule.GetComponent<Collider>());
            capsule.transform.SetParent(v.Body.transform, false);
            capsule.transform.localScale = new Vector3(radius * 2, height / 2, radius * 2);
            capsule.transform.localPosition = new Vector3(0, height / 2, 0);
            capsule.GetComponent<MeshRenderer>().sharedMaterial = material;

            var head = new GameObject("Head").transform;
            head.SetParent(v.Body.transform, false);
            head.localPosition = new Vector3(0, height - 0.15f, 0);
            v.Head = head;
            // A nose, so you can see which way they face.
            var nose = GameObject.CreatePrimitive(PrimitiveType.Cube);
            Object.Destroy(nose.GetComponent<Collider>());
            nose.transform.SetParent(head, false);
            nose.transform.localPosition = new Vector3(0, 0, radius);
            nose.transform.localScale = new Vector3(0.08f, 0.08f, 0.12f);
            nose.GetComponent<MeshRenderer>().sharedMaterial = material;

            v.Eyes = new GameObject("Eyes");
            v.Eyes.transform.SetParent(head, false);
            var red = Shapes.Mat(Shapes.Hex(0xff2a1a), Shapes.Look.Unlit);
            foreach (int side in new[] { -1, 1 })
            {
                var eye = GameObject.CreatePrimitive(PrimitiveType.Sphere);
                Object.Destroy(eye.GetComponent<Collider>());
                eye.transform.SetParent(v.Eyes.transform, false);
                eye.transform.localPosition = new Vector3(side * 0.06f, 0.03f, radius * 0.95f);
                eye.transform.localScale = Vector3.one * 0.05f;
                eye.GetComponent<MeshRenderer>().sharedMaterial = red;
            }
            v.Eyes.SetActive(false);

            // remotePlayers.ts: the torch at the right hip of the head, pointing straight ahead.
            v.Torch = Torch.Make(head, RemoteTorchAt, RemoteTorchAt + Vector3.forward, coneM, coneHalfAngleDeg);
            var glass = GameObject.CreatePrimitive(PrimitiveType.Sphere);
            Object.Destroy(glass.GetComponent<Collider>());
            glass.name = "Lens";
            glass.transform.SetParent(head, false);
            glass.transform.localPosition = RemoteTorchAt;
            glass.transform.localScale = Vector3.one * LensRadiusM * 2;
            if (lens == null) lens = Shapes.Mat(Shapes.Hex(LensColour), Shapes.Look.Unlit);
            glass.GetComponent<MeshRenderer>().sharedMaterial = lens;

            var label = new GameObject("Name");
            label.transform.SetParent(v.Body.transform, false);
            label.transform.localPosition = new Vector3(0, height + 0.3f, 0);
            v.Label = label.AddComponent<TextMesh>();
            // A TextMesh draws nothing until it has a font and that font's material.
            var font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            v.Label.font = font;
            label.GetComponent<MeshRenderer>().sharedMaterial = font.material;
            v.Label.anchor = TextAnchor.MiddleCenter;
            v.Label.alignment = TextAlignment.Center;
            v.Label.characterSize = 0.05f;
            v.Label.fontSize = 48;
            v.Label.color = new Color(0.92f, 0.88f, 0.8f);
            return v;
        }

        /// <summary>Places everyone where they were delaySec ago, facing the camera's way for their names.</summary>
        /// <summary>This player's eyes glow red for seconds (they just Summoned the ghost).</summary>
        public void GlowEyes(string id, double until)
        {
            View v;
            if (views.TryGetValue(id, out v)) v.EyesUntil = until;
        }

        public void Update(double now, Camera camera)
        {
            double at = now - delaySec;
            foreach (var v in views.Values)
            {
                var s = v.Snapshots;
                if (s.Count == 0) continue;
                Snapshot a = s[0], b = s[0];
                for (int i = 0; i < s.Count; i++)
                {
                    if (s[i].Time <= at) a = s[i];
                    if (s[i].Time >= at) { b = s[i]; break; }
                    b = s[i];
                }
                double t = b.Time > a.Time ? (at - a.Time) / (b.Time - a.Time) : 1;
                t = System.Math.Max(0, System.Math.Min(1, t));
                double x = a.X + (b.X - a.X) * t;
                double z = a.Z + (b.Z - a.Z) * t;
                // A walker crossing a flight's middle jumps between floor areas: do not blend across it.
                Vector3 pos = Levels.LevelOf(world, a.X, a.Z) == Levels.LevelOf(world, b.X, b.Z) ? Coords.Place(world, x, z) : Coords.Place(world, (t < 0.5 ? a : b).X, (t < 0.5 ? a : b).Z);
                double yaw = a.Yaw + Movement.NormalizeAngle(b.Yaw - a.Yaw) * t;
                double pitch = a.Pitch + (b.Pitch - a.Pitch) * t;
                v.Body.transform.position = pos;
                v.Body.transform.rotation = Coords.Facing(yaw);
                v.Head.localRotation = Quaternion.Euler((float)(-pitch * Mathf.Rad2Deg), 0, 0);
                v.Body.transform.localScale = new Vector3(1, b.Crouching ? 0.6f : 1, 1);
                if (camera != null) v.Label.transform.rotation = camera.transform.rotation;
                v.Eyes.SetActive(now < v.EyesUntil);
            }
        }
    }
}
