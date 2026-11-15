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
            public readonly List<Snapshot> Snapshots = new List<Snapshot>();
        }

        readonly WorldData world;
        readonly double delaySec;
        readonly float height, radius;
        readonly Material material;
        readonly Dictionary<string, View> views = new Dictionary<string, View>();

        public RemotePlayers(WorldData world, object config, Material baseMaterial)
        {
            this.world = world;
            delaySec = Json.Num(Json.Obj(config, "net"), "interpolationMs") / 1000;
            var body = Json.Obj(config, "body");
            height = (float)Json.Num(body, "heightM");
            radius = (float)Json.Num(body, "radiusM");
            material = new Material(baseMaterial) { color = new Color(0.75f, 0.72f, 0.66f) };
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

            var torch = new GameObject("Torch");
            torch.transform.SetParent(head, false);
            torch.transform.localPosition = new Vector3(0.15f, -0.25f, 0);
            v.Torch = torch.AddComponent<Light>();
            v.Torch.type = LightType.Spot;
            v.Torch.spotAngle = 52;
            v.Torch.range = 12;
            v.Torch.intensity = 6;

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
            }
        }
    }
}
