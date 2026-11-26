using System;
using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;
using Object = UnityEngine.Object;

namespace Haunted.Game
{
    /// <summary>
    /// One player's copy of a character (client/src/characterModels.ts CharacterModels.body): its own
    /// bones and materials, the shared clips, standing on the floor at its root, facing forward,
    /// config.body.heightM tall.
    /// </summary>
    public class CharacterBody
    {
        public readonly GameObject Root;
        public readonly Animation Animation;
        readonly Transform hips;
        /// <summary>The animations' hips movement scaled to this body's legs.</summary>
        readonly float legs;
        Vector3 hipsSet;
        readonly List<(Material material, int property, Color colour)> materials = new List<(Material, int, Color)>();

        const string HipsName = "mixamorig:Hips";
        const string HeadTopName = "mixamorig:HeadTop_End";
        static readonly int BaseColorFactor = Shader.PropertyToID("baseColorFactor");
        static readonly int BaseColor = Shader.PropertyToID("_BaseColor");

        CharacterBody(GameObject root, Animation animation, Transform hips, float legs)
        {
            Root = root;
            Animation = animation;
            this.hips = hips;
            this.legs = legs;
        }

        /// <summary>A fresh body of this character (its Low copy for Low), or null without its art.</summary>
        public static CharacterBody Make(string character, bool low, float heightM)
        {
            var art = CharacterArt.Load();
            var c = art != null ? art.Of(character) : null;
            var source = c == null ? null : low && c.low != null ? c.low : c.model;
            if (source == null) return null;
            var copy = Object.Instantiate(source);
            Transform top = null, hips = null;
            foreach (var t in copy.GetComponentsInChildren<Transform>(true))
            {
                if (t.name == HeadTopName) top = t;
                else if (t.name == HipsName) hips = t;
            }
            // glTFast makes a lone glTF root node (the Armature, at 1/100 scale) the copy itself: put it
            // under a body of its own, named as the clips' paths ("Armature/mixamorig:Hips") expect.
            var root = new GameObject("Body " + character + (low ? " (Low)" : ""));
            if (hips != null && hips.parent == copy.transform) copy.name = "Armature";
            copy.transform.SetParent(root.transform, false);
            // Measured standing, before it is placed: scaled to config.body.heightM.
            float topY = top != null ? top.position.y : heightM;
            root.transform.localScale = Vector3.one * (heightM / Mathf.Max(0.01f, topY));
            float legs = hips != null && art.animHipsM > 0 ? hips.localPosition.magnitude / art.animHipsM : 1;
            var animation = root.AddComponent<Animation>();
            animation.cullingType = AnimationCullingType.AlwaysAnimate;
            animation.playAutomatically = false;
            foreach (var clip in art.clips) animation.AddClip(clip, clip.name);
            var body = new CharacterBody(root, animation, hips, legs);
            foreach (var r in root.GetComponentsInChildren<Renderer>(true))
            {
                // Bounds are from the standing pose; a body lying down or crawling would be culled wrongly.
                if (r is SkinnedMeshRenderer s) s.updateWhenOffscreen = true;
                // The browser lights people by the torches and the night fill only: no room reflection,
                // no shadows. Light probes "off" would drop the fill too; the scene has none of its
                // own, so blending them is the fill (the ambient probe) alone.
                r.reflectionProbeUsage = UnityEngine.Rendering.ReflectionProbeUsage.Off;
                r.lightProbeUsage = UnityEngine.Rendering.LightProbeUsage.BlendProbes;
                r.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
                r.receiveShadows = false;
                var materials = Characters.BackThenFront(r, r.materials);
                r.materials = materials;
                foreach (var m in materials)
                {
                    int property = m.HasProperty(BaseColorFactor) ? BaseColorFactor : m.HasProperty(BaseColor) ? BaseColor : 0;
                    if (property != 0) body.materials.Add((m, property, m.GetColor(property)));
                }
            }
            var shaders = new HashSet<string>();
            foreach (var r in root.GetComponentsInChildren<Renderer>(true)) foreach (var m in r.sharedMaterials) shaders.Add(m == null ? "none" : m.shader.name + (m.shader.isSupported ? "" : " (unsupported)"));
            Debug.Log("Body " + character + (low ? " (Low)" : "") + ": " + root.GetComponentsInChildren<Renderer>(true).Length + " pieces, scale " + root.transform.localScale.x.ToString("0.000") + ", head top " + topY.ToString("0.00") + " m, legs " + legs.ToString("0.00") + ", " + art.clips.Count + " clips, shaders " + string.Join(", ", shaders));
            return body;
        }

        /// <summary>After the clip has posed the bones: the hips' movement scaled to this body's legs.</summary>
        public void AfterAnimation()
        {
            if (hips == null || legs == 1) return;
            // Only when the clip set it this frame; otherwise it would grow every frame.
            if (hips.localPosition == hipsSet) return;
            hipsSet = hips.localPosition * legs;
            hips.localPosition = hipsSet;
        }

        /// <summary>Every material's own colour times this (in linear light), as three multiplies them.</summary>
        public void Tint(Color tint)
        {
            var t = tint.linear;
            foreach (var (material, property, colour) in materials)
            {
                var c = colour.linear;
                material.SetColor(property, new Color(c.r * t.r, c.g * t.g, c.b * t.b, c.a * t.a).gamma);
            }
        }

        public void Destroy()
        {
            foreach (var (material, _, _) in materials) Object.Destroy(material);
            Object.Destroy(Root);
        }
    }

    /// <summary>
    /// Everyone else (client/src/remotePlayers.ts): their character's body, animated by what they are
    /// doing (characterModels.ts chooseClip), a nameless shadow in the dark until you can tell who
    /// they are (GDD 22.2), a name over the head, and their torch. A plain body stands in until a
    /// character is dealt. Drawn config.net.interpolationMs in the past, blending between the two
    /// server states around that moment, so they move smoothly between the server's 20 updates a second.
    /// </summary>
    public class RemotePlayers
    {
        class Snapshot
        {
            public double Time, X, Z, Yaw, Pitch;
            public bool Crouching;
        }

        /// <summary>What the server says about a player now (the newest state, not blended).</summary>
        public class Latest
        {
            public string Name = "", Health = "alive", Character = "", Colour;
            public bool FlashlightOn, Visible;
            /// <summary>Where they are in the simulation (the dead: where their body lies).</summary>
            public double X, Z;
        }

        class View
        {
            public GameObject Root;
            /// <summary>The plain body, while no character's model is in.</summary>
            public GameObject Plain;
            public Material PlainMaterial;
            public Transform Head;
            /// <summary>The name over the head: a quad turned to the camera, with its picture (NameLabel).</summary>
            public GameObject Label;
            public Material LabelMaterial;
            public Texture2D LabelPicture;
            public string LabelText;
            public Light Torch;
            public GameObject Lens;
            /// <summary>Red eyes that glow for a moment after they Summon (GDD 14.2).</summary>
            public GameObject Eyes;
            public double EyesUntil;
            public readonly List<Snapshot> Snapshots = new List<Snapshot>();
            public Latest State = new Latest();

            public CharacterBody Model;
            /// <summary>The character and quality the model is (or is to be) of.</summary>
            public string ModelCharacter = "";
            public bool ModelLow;
            public string Clip;
            public double Speed;
            public Vector3 LastAt;
            public bool HasLast;
            public float BodyTurn;
            /// <summary>0 a nameless shadow, 1 fully recognised; eased toward RevealTarget.</summary>
            public float Reveal, RevealTarget;
        }

        readonly WorldData world;
        readonly double delaySec;
        readonly float height, radius, eyeHeight, crouchEyeHeight;
        readonly Material baseMaterial;
        readonly double coneM, coneHalfAngleDeg;
        /// <summary>remotePlayers.ts: the torch's lens on the head (Unity's z forward), and its colour.</summary>
        static readonly Vector3 RemoteTorchAt = new Vector3(0.2f, -0.25f, 0.2f);
        const float LensRadiusM = 0.05f;
        const int LensColour = 0xfff2d6;
        /// <summary>remotePlayers.ts: a nameless shadow in the dark (GDD 22.2), and a dead body.</summary>
        const int BodyColour = 0x3a3a40;
        const int DeadColour = 0x1a1a1c;
        const float RevealFadePerSec = 6;
        const float LabelAboveHeadM = 0.35f;
        const int EyeColour = 0xff2a1a;
        const float EyeRadiusM = 0.035f, EyeApartM = 0.08f;
        /// <summary>Where the red eyes sit in front of the head's centre, on a character model.</summary>
        const float ModelEyesForwardM = 0.11f;
        /// <summary>Seconds one clip blends into the next.</summary>
        const float ClipBlendSec = 0.25f;
        /// <summary>How quickly the measured walking speed follows the real one, per second.</summary>
        const double SpeedSmoothingPerSec = 8;
        /// <summary>The speed (m/s) each moving clip was made at, so feet keep pace with the ground.</summary>
        static readonly Dictionary<string, double> ClipSpeedMps = new Dictionary<string, double> { { "walk", 1.6 }, { "run", 4.2 }, { "crouch-walk", 1.1 }, { "crawl", 0.6 } };
        const double ClipRateMin = 0.6, ClipRateMax = 1.8;
        /// <summary>characterModels.ts: slower than this counts as standing still (m/s).</summary>
        const double MovingMps = 0.2;
        /// <summary>characterModels.ts CRAWL_TURN_RAD: the downed clips lie head toward the body's back, so a crawler turns round.</summary>
        const float CrawlTurnDeg = 180;
        const float CrawlTurnPerSec = 5;
        readonly double walkMps, runMps;
        Material lens, eyeMaterial;
        readonly Dictionary<string, View> views = new Dictionary<string, View>();

        public RemotePlayers(WorldData world, object config, Material baseMaterial)
        {
            this.world = world;
            this.baseMaterial = baseMaterial;
            delaySec = Json.Num(Json.Obj(config, "net"), "interpolationMs") / 1000;
            var body = Json.Obj(config, "body");
            height = (float)Json.Num(body, "heightM");
            radius = (float)Json.Num(body, "radiusM");
            var movement = Json.Obj(config, "movement");
            eyeHeight = (float)Json.Num(movement, "eyeHeightM");
            crouchEyeHeight = (float)Json.Num(movement, "crouchEyeHeightM");
            walkMps = Json.Num(movement, "walk");
            runMps = Json.Num(movement, "run");
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

        /// <summary>The newest server state of a player, or null.</summary>
        public Latest StateOf(string id)
        {
            View v;
            return views.TryGetValue(id, out v) ? v.State : null;
        }

        /// <summary>A new server state for one player. The dead are placed where their body lies.</summary>
        public void Push(string id, double time, double x, double z, double yaw, double pitch, bool crouching, Latest state)
        {
            View v;
            if (!views.TryGetValue(id, out v))
            {
                v = Create(id);
                views[id] = v;
            }
            v.State = state;
            if (v.LabelText != state.Name) SetName(v, state.Name);
            v.Torch.enabled = state.FlashlightOn;
            v.Lens.SetActive(state.FlashlightOn);
            v.Root.SetActive(state.Visible);
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
            v.Model?.Destroy();
            Object.Destroy(v.PlainMaterial);
            Object.Destroy(v.LabelMaterial);
            Object.Destroy(v.LabelPicture);
            Object.Destroy(v.Root);
            views.Remove(id);
        }

        /// <summary>Removes players that are no longer in the room.</summary>
        public void Keep(HashSet<string> ids)
        {
            var gone = new List<string>();
            foreach (var id in views.Keys) if (!ids.Contains(id)) gone.Add(id);
            foreach (var id in gone) Remove(id);
        }

        /// <summary>Marks who you can recognise right now (GDD 22.2); the rest stay nameless shadows.</summary>
        public void Reveal(Func<string, bool> recognised)
        {
            foreach (var kv in views) kv.Value.RevealTarget = recognised(kv.Key) ? 1 : 0;
        }

        static GameObject Primitive(PrimitiveType type, Transform parent, Material material)
        {
            var go = GameObject.CreatePrimitive(type);
            Object.Destroy(go.GetComponent<Collider>());
            go.transform.SetParent(parent, false);
            go.GetComponent<MeshRenderer>().sharedMaterial = material;
            return go;
        }

        View Create(string id)
        {
            var v = new View();
            v.Root = new GameObject("Player " + id);
            v.PlainMaterial = new Material(baseMaterial) { color = Shapes.Hex(BodyColour) };
            v.Plain = Primitive(PrimitiveType.Capsule, v.Root.transform, v.PlainMaterial);
            v.Plain.transform.localScale = new Vector3(radius * 2, height / 2, radius * 2);
            v.Plain.transform.localPosition = new Vector3(0, height / 2, 0);

            var head = new GameObject("Head").transform;
            head.SetParent(v.Root.transform, false);
            head.localPosition = new Vector3(0, eyeHeight, 0);
            v.Head = head;

            v.Eyes = new GameObject("Eyes");
            v.Eyes.transform.SetParent(head, false);
            if (eyeMaterial == null) eyeMaterial = Shapes.Mat(Shapes.Hex(EyeColour), Shapes.Look.Unlit);
            foreach (int side in new[] { -1, 1 })
            {
                var eye = Primitive(PrimitiveType.Sphere, v.Eyes.transform, eyeMaterial);
                eye.transform.localPosition = new Vector3(side * EyeApartM, 0, 0);
                eye.transform.localScale = Vector3.one * EyeRadiusM * 2;
            }
            v.Eyes.transform.localPosition = new Vector3(0, 0, radius + 0.01f);
            v.Eyes.SetActive(false);

            // remotePlayers.ts: the torch at the right hip of the head, pointing straight ahead.
            v.Torch = Torch.Make(head, RemoteTorchAt, RemoteTorchAt + Vector3.forward, coneM, coneHalfAngleDeg);
            if (lens == null) lens = Shapes.Mat(Shapes.Hex(LensColour), Shapes.Look.Unlit);
            v.Lens = Primitive(PrimitiveType.Sphere, head, lens);
            v.Lens.name = "Lens";
            v.Lens.transform.localPosition = RemoteTorchAt;
            v.Lens.transform.localScale = Vector3.one * LensRadiusM * 2;

            v.Label = new GameObject("Name");
            v.Label.transform.SetParent(v.Root.transform, false);
            v.Label.transform.localPosition = new Vector3(0, eyeHeight + LabelAboveHeadM, 0);
            v.Label.AddComponent<MeshFilter>().sharedMesh = NameLabel.Quad;
            // Names are hidden by what is nearer and fogged, as the browser's sprites are (Haunted/Label).
            v.LabelMaterial = new Material(Resources.Load<Material>("Materials/Label"));
            var labelRenderer = v.Label.AddComponent<MeshRenderer>();
            labelRenderer.sharedMaterial = v.LabelMaterial;
            // A sprite casts no shadow in three; the quad would darken the wall behind it in the torch.
            labelRenderer.shadowCastingMode = UnityEngine.Rendering.ShadowCastingMode.Off;
            labelRenderer.receiveShadows = false;
            // Out of the occlusion's normals too (HauntedAO), or it would darken a box behind the name.
            v.Label.layer = HauntedHeld.LabelLayer;
            v.Label.SetActive(false);
            return v;
        }

        /// <summary>remotePlayers.ts drawLabel: a new picture for a new name, 0.22 m high.</summary>
        static void SetName(View v, string name)
        {
            v.LabelText = name;
            Object.Destroy(v.LabelPicture);
            v.LabelPicture = null;
            if (string.IsNullOrEmpty(name)) return;
            float widthM;
            v.LabelPicture = NameLabel.Bake(name, out widthM);
            v.LabelMaterial.mainTexture = v.LabelPicture;
            v.Label.transform.localScale = new Vector3(widthM, NameLabel.HeightM, 1);
        }

        /// <summary>This player's eyes glow red for seconds (they just Summoned the ghost).</summary>
        public void GlowEyes(string id, double until)
        {
            View v;
            if (views.TryGetValue(id, out v)) v.EyesUntil = until;
        }

        /// <summary>characterModels.ts chooseClip: which clip a body plays (GDD 9: alive, downed, dead).</summary>
        string ChooseClip(string health, bool crouching, double speed, bool knockedDownDone)
        {
            bool moving = speed > MovingMps;
            if (health == "dead") return "dying";
            if (health == "downed")
            {
                if (!knockedDownDone) return "knocked-down";
                return moving ? "crawl" : "downed-idle";
            }
            if (crouching) return moving ? "crouch-walk" : "crouch-idle";
            if (speed > (walkMps + runMps) / 2) return "run";
            return moving ? "walk" : "idle";
        }

        /// <summary>Swaps in this character's model (Low's copy on Low), or the plain body with none dealt.</summary>
        void UseCharacter(View v, string character, bool low)
        {
            v.Model?.Destroy();
            v.Model = null;
            v.Clip = null;
            v.ModelCharacter = character;
            v.ModelLow = low;
            v.Model = string.IsNullOrEmpty(character) ? null : CharacterBody.Make(character, low, height);
            v.Plain.SetActive(v.Model == null);
            if (v.Model == null)
            {
                v.Eyes.transform.localPosition = new Vector3(0, 0, radius + 0.01f);
                return;
            }
            v.Model.Root.transform.SetParent(v.Root.transform, false);
            v.Eyes.transform.localPosition = new Vector3(0, 0, radius + 0.01f - ModelEyesForwardM);
            // A player first seen downed or dead is already on the floor.
            if (v.State.Health == "dead") Play(v, "dying", true);
            else if (v.State.Health == "downed") Play(v, "downed-idle", true);
        }

        /// <summary>Blends into a clip; `atEnd` jumps straight to its last frame (a fall that already happened).</summary>
        void Play(View v, string name, bool atEnd = false)
        {
            var animation = v.Model.Animation;
            var next = animation[name];
            if (next == null || v.Clip == name) return;
            bool first = v.Clip == null;
            v.Clip = name;
            if (atEnd || first)
            {
                animation.Play(name);
                if (atEnd) next.time = next.length;
            }
            else
            {
                next.time = 0;
                animation.CrossFade(name, ClipBlendSec);
            }
        }

        /// <summary>
        /// Each player in view as drawn this frame, for their footsteps (game.ts playFootsteps reads
        /// remotes.views()): id, feet, crouching, health, hidden.
        /// </summary>
        public void ForEachWalker(Action<string, Vector3, bool, string, bool> walker)
        {
            foreach (var kv in views)
            {
                var v = kv.Value;
                if (v.Snapshots.Count == 0) continue;
                walker(kv.Key, v.Root.transform.position, v.Snapshots[v.Snapshots.Count - 1].Crouching, v.State.Health, !v.State.Visible);
            }
        }

        public void Update(double now, Camera camera)
        {
            double at = now - delaySec;
            float dt = Time.deltaTime;
            bool low = HauntedQuality.Current == HauntedQuality.Level.Low;
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
                t = Math.Max(0, Math.Min(1, t));
                double x = a.X + (b.X - a.X) * t;
                double z = a.Z + (b.Z - a.Z) * t;
                // A walker crossing a flight's middle jumps between floor areas: do not blend across it.
                Vector3 pos = Levels.LevelOf(world, a.X, a.Z) == Levels.LevelOf(world, b.X, b.Z) ? Coords.Place(world, x, z) : Coords.Place(world, (t < 0.5 ? a : b).X, (t < 0.5 ? a : b).Z);
                double yaw = a.Yaw + Movement.NormalizeAngle(b.Yaw - a.Yaw) * t;
                double pitch = a.Pitch + (b.Pitch - a.Pitch) * t;
                v.Root.transform.position = pos;
                v.Root.transform.rotation = Coords.Facing(yaw);
                v.Head.localRotation = Quaternion.Euler((float)(-pitch * Mathf.Rad2Deg), 0, 0);

                string health = v.State.Health;
                bool lying = health != "alive";
                if (lying)
                {
                    // Downed or dead: lying on the floor.
                    v.Plain.transform.localRotation = Quaternion.Euler(90, 0, 0);
                    v.Plain.transform.localScale = new Vector3(radius * 2, height / 2, radius * 2);
                    v.Plain.transform.localPosition = new Vector3(0, radius, 0);
                    v.Head.localPosition = new Vector3(0, radius, 0);
                }
                else
                {
                    float crouch = b.Crouching ? crouchEyeHeight / eyeHeight : 1;
                    v.Plain.transform.localRotation = Quaternion.identity;
                    v.Plain.transform.localScale = new Vector3(radius * 2, height / 2 * crouch, radius * 2);
                    v.Plain.transform.localPosition = new Vector3(0, height / 2 * crouch, 0);
                    v.Head.localPosition = new Vector3(0, b.Crouching ? crouchEyeHeight : eyeHeight, 0);
                }
                v.Label.transform.localPosition = new Vector3(0, v.Head.localPosition.y + LabelAboveHeadM, 0);
                if (camera != null) v.Label.transform.rotation = camera.transform.rotation;
                v.Eyes.SetActive(now < v.EyesUntil);

                if (v.State.Character != v.ModelCharacter || (v.Model != null && v.ModelLow != low)) UseCharacter(v, v.State.Character, low);
                MeasureSpeed(v, pos, dt);
                Animate(v, b.Crouching, dt);
                Fade(v, dt);
            }
        }

        /// <summary>How fast they move across the floor, smoothed (m/s), from where they are drawn.</summary>
        static void MeasureSpeed(View v, Vector3 pos, float dt)
        {
            if (dt > 0 && v.HasLast)
            {
                double now = new Vector2(pos.x - v.LastAt.x, pos.z - v.LastAt.z).magnitude / dt;
                v.Speed += (now - v.Speed) * (1 - Math.Exp(-SpeedSmoothingPerSec * dt));
            }
            v.LastAt = pos;
            v.HasLast = true;
        }

        /// <summary>Picks the clip for what they are doing and keeps its pace (remotePlayers.ts animate).</summary>
        void Animate(View v, bool crouching, float dt)
        {
            if (v.Model == null) return;
            var animation = v.Model.Animation;
            var current = v.Clip != null ? animation[v.Clip] : null;
            // Downed: the fall plays once, then they lie breathing or crawl.
            bool knockedDownDone = v.Clip == "knocked-down"
                ? current != null && current.time >= current.length - ClipBlendSec
                : v.Clip == "downed-idle" || v.Clip == "crawl";
            string want = ChooseClip(v.State.Health, crouching, v.Speed, knockedDownDone);
            Play(v, want);
            var state = animation[want];
            double made;
            if (state != null) state.speed = ClipSpeedMps.TryGetValue(want, out made) ? (float)Math.Max(ClipRateMin, Math.Min(ClipRateMax, v.Speed / made)) : 1;
            // Turned round to crawl, they stay that way while lying there; standing up or a new fall resets it.
            if (want == "crawl") v.BodyTurn = CrawlTurnDeg;
            else if (want != "downed-idle" && want != "dying") v.BodyTurn = 0;
            var body = v.Model.Root.transform;
            float turn = body.localEulerAngles.y;
            if (turn > 180) turn -= 360;
            body.localRotation = Quaternion.Euler(0, turn + (v.BodyTurn - turn) * (1 - Mathf.Exp(-CrawlTurnPerSec * dt)), 0);
        }

        /// <summary>Called after Unity's animations have run this frame.</summary>
        public void LateUpdate()
        {
            foreach (var v in views.Values) v.Model?.AfterAnimation();
        }

        /// <summary>Eases the name and colour toward what you can see (remotePlayers.ts fade).</summary>
        void Fade(View v, float dt)
        {
            v.Reveal += (v.RevealTarget - v.Reveal) * (1 - Mathf.Exp(-RevealFadePerSec * dt));
            bool dead = v.State.Health == "dead";
            var shadow = Shapes.Hex(BodyColour);
            var own = Coords.ParseColor(v.State.Colour, shadow);
            v.PlainMaterial.color = dead ? Shapes.Hex(DeadColour) : Color.Lerp(shadow.linear, own.linear, v.Reveal).gamma;
            // A model keeps its own colours when recognised and falls to a shadow when not (GDD 22.2).
            if (v.Model != null) v.Model.Tint(dead ? Shapes.Hex(DeadColour) : Color.Lerp(shadow.linear, Color.white, v.Reveal).gamma);
            v.LabelMaterial.SetFloat("_Opacity", v.Reveal);
            v.Label.SetActive(v.Reveal > 0.02f && v.LabelPicture != null);
        }
    }
}
