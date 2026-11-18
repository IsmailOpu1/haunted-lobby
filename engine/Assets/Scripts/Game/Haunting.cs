using System;
using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;
using static Haunted.Game.Shapes;

namespace Haunted.Game
{
    /// <summary>
    /// The ghost and what goes with it (step C4), ported from the browser: the ghost itself
    /// (client/src/ghostView.ts, drawn only while it hunts), the flashlight flicker near it
    /// (flicker.ts), the hunt's silence, sting, pulse and heavy steps and the heartbeat
    /// (audio.ts), other Wisps seen by the dead (wispsView.ts), the clue pictures and the relics on
    /// the altar (mysteryView.ts) and the chalk circle with its black flames (world.ts
    /// RitualCircleView). Plain shapes until step D brings the art.
    /// </summary>
    public class Haunting
    {
        // ghostView.ts: a placeholder look until the art pass.
        const float HeadRadiusM = 0.16f, AuraIntensity = 1.5f, AuraRangeM = 4, ShimmerPerSec = 6;
        const int MaxSnapshots = 30;
        // audio.ts: the heartbeat is heard within this distance of the ghost; the hunt pulse's level.
        const double HeartbeatRangeM = 12, HuntPulseLevel = 0.14;
        // game.ts GHOST_CUE_M: how near its steps or your heart give a subtitle.
        const double GhostCueM = 12;
        // wispsView.ts
        const float WispRadiusM = 0.12f, WispHeightM = 1.3f, WispLight = 1.2f, WispRangeM = 3, FollowPerSec = 12, BobM = 0.08f;
        // mysteryView.ts
        const double CardHeightM = 2.65, CardW = 1.4, CardH = 0.79, AltarTopM = 1, RelicSizeM = 0.18, DustRadiusM = 0.14;
        // world.ts RitualCircleView
        static readonly Dictionary<string, int> CircleColors = new Dictionary<string, int> { { "waiting", 0x8a1c1c }, { "ready", 0xd04a2a }, { "running", 0xe0b25a }, { "tainted", 0x3a1048 } };
        const int FlameCount = 5;
        const double FlameRingM = 0.35, FlameHeightM = 0.7;

        class Snapshot { public double T; public Vector3 At; public double Yaw; public bool Visible; }
        class Card { public Transform Root; public TextMesh Icon, Label; public string Shown = ""; }
        class AltarRelic { public GameObject Box, Dust; public Light Glow; }

        readonly WorldData world;
        readonly MapInfo map;
        readonly object config;
        readonly Transform root;

        // The ghost.
        readonly List<Snapshot> snapshots = new List<Snapshot>();
        readonly Transform ghost;
        readonly Material body;
        readonly Light aura;
        /// <summary>The ghost's latest known place (for the flicker and the heartbeat), or null when it is far or gone.</summary>
        public Vector3? Known;
        /// <summary>The ghost is drawn and walking (it hunts).</summary>
        public bool Shown { get { return ghost.gameObject.activeSelf; } }

        // The flicker.
        double deadLeft, flickerLeft;
        bool wasClose;
        // Photosensitivity mode (flicker.ts): how fast the light eases toward its level, per second, and
        // how dim it gets with the ghost right beside you, in place of flickering.
        const double GentleRatePerSec = 1.5, GentleLowest = 0.35;
        double gentle = 1;
        readonly System.Random dice = new System.Random();

        // The sounds.
        AudioSource pulse;
        double silentUntil, nextBeatAt;
        bool hunting;
        readonly StepTracker steps = new StepTracker();
        readonly List<KeyValuePair<double, Action>> later = new List<KeyValuePair<double, Action>>();

        // The Wisps, the clues, the altar and the circle.
        readonly Dictionary<string, Transform> wisps = new Dictionary<string, Transform>();
        readonly Dictionary<string, Vector3> wispTargets = new Dictionary<string, Vector3>();
        readonly Dictionary<string, Card> cards = new Dictionary<string, Card>();
        readonly List<AltarRelic> altar = new List<AltarRelic>();
        Material circle;
        readonly List<Transform> flames = new List<Transform>();

        /// <summary>What you hear of the ghost, in words (GDD 23 subtitles), or null.</summary>
        public string Cue;
        /// <summary>Where the cue comes from (an arrow points there), or null for none (your heart).</summary>
        public Vector3? CueAt;
        /// <summary>The pre-hunt silence is on (audio.ts silentUntil): no creaks, no distant steps.</summary>
        public bool Silent { get { return silentUntil > 0; } }
        /// <summary>A hunt is on (no distant steps then).</summary>
        public bool Hunting { get { return hunting; } }

        public Haunting(WorldData world, MapInfo map, object config)
        {
            this.world = world;
            this.map = map;
            this.config = config;
            root = new GameObject("Haunting").transform;

            // A pale, faintly glowing figure: visible in the dark on its own, brighter in a flashlight (GDD 8).
            var g = Json.Obj(config, "ghost");
            double radius = Json.Num(g, "radiusM"), height = Json.Num(g, "heightM");
            ghost = Group(root, "Ghost");
            body = Mat(Hex(0xc8d0dc), Look.Clear, 0.8f);
            body.SetColor("_EmissionColor", Hex(0x4a5566));
            Cylinder(ghost, 0, radius * 1.4, height * 0.85, body, 0, height * 0.85 / 2, 0, null, 12, true);
            Sphere(ghost, HeadRadiusM, body, 0, height - HeadRadiusM, 0);
            // Dark sockets with bright eyes, facing where it walks (three.js -z).
            var socket = Mat(Color.black, Look.Unlit);
            var eye = Mat(Hex(0xe8f4ff), Look.Unlit);
            foreach (int side in new[] { -1, 1 })
            {
                Sphere(ghost, 0.045, socket, side * 0.06, height - HeadRadiusM + 0.02, -HeadRadiusM + 0.03);
                Sphere(ghost, 0.02, eye, side * 0.06, height - HeadRadiusM + 0.02, -HeadRadiusM - 0.005);
            }
            // A cold glow that lights the floor and walls around it.
            aura = Group(ghost, "Aura", 0, height * 0.6, 0).gameObject.AddComponent<Light>();
            aura.type = LightType.Point;
            aura.color = Hex(0x9fb4ff);
            aura.range = AuraRangeM;
            aura.intensity = AuraIntensity;
            ghost.gameObject.SetActive(false);

            BuildClues();
            BuildAltar();
        }

        // ---------- The ghost ----------

        /// <summary>The server's "ghost" message: where it is, or null when it is out of range or gone.</summary>
        public void Push(Dictionary<string, object> msg, double now)
        {
            if (msg == null)
            {
                snapshots.Clear();
                Known = null;
                ghost.gameObject.SetActive(false);
                return;
            }
            var at = Coords.Place(world, Json.Num(msg, "x"), Json.Num(msg, "z"));
            object visible;
            snapshots.Add(new Snapshot { T = now, At = at, Yaw = Json.Num(msg, "yaw"), Visible = msg.TryGetValue("visible", out visible) && visible is bool && (bool)visible });
            if (snapshots.Count > MaxSnapshots) snapshots.RemoveAt(0);
            Known = at;
        }

        /// <summary>The hunt's phases (GDD 12.1): all sound drops out for the warning, then the sting and the pulse.</summary>
        public void Hunt(string phase, double now)
        {
            if (phase == "warning")
            {
                silentUntil = now + Json.Num(Json.Obj(config, "ghost"), "preHuntSilenceSec");
                TaskSounds.Level = 0;
            }
            else if (phase == "start")
            {
                hunting = true;
                silentUntil = 0;
                TaskSounds.Level = 1;
                TaskSounds.Play("sting");
            }
            else if (phase == "end") hunting = false;
        }

        /// <summary>
        /// Each frame: the ghost drawn between its updates, the sounds near it, the Wisps, the
        /// flames. Returns how bright your flashlight is (0 to 1) with the ghost this far from you.
        /// </summary>
        public float Update(double now, float dt, Vector3 feet, Camera camera)
        {
            for (int i = later.Count - 1; i >= 0; i--)
            {
                if (later[i].Key > now) continue;
                var a = later[i].Value;
                later.RemoveAt(i);
                a();
            }
            DrawGhost(now);
            double distance = Known.HasValue ? Vector3.Distance(Known.Value, feet) : double.PositiveInfinity;
            UpdateSounds(now, dt, distance);
            bool heard = Shown && Vector3.Distance(ghost.position, feet) <= GhostCueM;
            Cue = heard ? "Heavy footsteps" : distance <= GhostCueM ? "Your heart pounds" : null;
            CueAt = heard ? ghost.position : (Vector3?)null;
            float k = Mathf.Min(1, FollowPerSec * dt);
            int n = 0;
            foreach (var kv in wisps)
            {
                var target = wispTargets[kv.Key];
                var p = kv.Value.position;
                float y = target.y + WispHeightM + Mathf.Sin((float)now * 2 + n++) * BobM;
                kv.Value.position = new Vector3(p.x + (target.x - p.x) * k, p.y + (y - p.y) * k, p.z + (target.z - p.z) * k);
            }
            // The flames lick up and down.
            for (int f = 0; f < flames.Count; f++)
            {
                if (!flames[f].gameObject.activeSelf) continue;
                float s = 0.75f + 0.35f * Mathf.Abs(Mathf.Sin((float)now * 6 + f * 1.7f));
                flames[f].localScale = new Vector3(1, s, 1);
                var lp = flames[f].localPosition;
                flames[f].localPosition = new Vector3(lp.x, (float)(AltarTopM + FlameHeightM * s / 2), lp.z);
            }
            // The clue pictures face you, as the browser's sprites do: +z away from the camera, so text reads.
            foreach (var card in cards.Values)
                if (card.Root.gameObject.activeSelf) card.Root.rotation = Quaternion.LookRotation(card.Root.position - camera.transform.position);
            return Flicker(dt, distance);
        }

        void DrawGhost(double now)
        {
            if (snapshots.Count == 0) return;
            double renderTime = now - Json.Num(Json.Obj(config, "net"), "interpolationMs") / 1000;
            Snapshot a = snapshots[0], b = a;
            for (int i = snapshots.Count - 1; i >= 0; i--)
            {
                if (snapshots[i].T > renderTime) continue;
                a = snapshots[i];
                b = i + 1 < snapshots.Count ? snapshots[i + 1] : a;
                break;
            }
            double span = b.T - a.T;
            float t = span > 0 ? (float)Math.Min(1, (renderTime - a.T) / span) : 1;
            ghost.position = Vector3.Lerp(a.At, b.At, t);
            double diff = Math.Atan2(Math.Sin(b.Yaw - a.Yaw), Math.Cos(b.Yaw - a.Yaw));
            ghost.rotation = Coords.Facing(a.Yaw + diff * t);
            ghost.gameObject.SetActive(b.Visible);
            // A slow shimmer, so it never looks quite solid.
            float shimmer = Mathf.Sin((float)now * ShimmerPerSec);
            var c = body.color;
            c.a = 0.72f + 0.1f * shimmer;
            body.color = c;
            if (body.HasProperty("_BaseColor")) body.SetColor("_BaseColor", c);
            aura.intensity = AuraIntensity * (0.85f + 0.15f * shimmer);
        }

        /// <summary>
        /// flicker.ts: random flicker within flickerGhostM; the light dies for deadSec within deadGhostM. In
        /// photosensitivity mode the same warning comes as a slow dimming instead (GDD 23).
        /// </summary>
        float Flicker(float dt, double distance)
        {
            float sharp = SharpFlicker(dt, distance);
            if (!Options.Photosensitive) { gentle = sharp; return sharp; }
            double range = Json.Num(Json.Obj(config, "flashlight"), "flickerGhostM");
            double closeness = distance > range ? 0 : 1 - distance / range;
            double target = deadLeft > 0 ? 0 : 1 - (1 - GentleLowest) * closeness;
            gentle += (target - gentle) * (1 - Math.Exp(-GentleRatePerSec * dt));
            return (float)gentle;
        }

        float SharpFlicker(float dt, double distance)
        {
            var f = Json.Obj(config, "flashlight");
            bool veryClose = distance <= Json.Num(f, "deadGhostM");
            if (veryClose && !wasClose) deadLeft = Json.Num(f, "deadSec");
            wasClose = veryClose;
            if (deadLeft > 0) { deadLeft -= dt; return 0; }
            double range = Json.Num(f, "flickerGhostM");
            if (distance > range) return 1;
            double closeness = 1 - distance / range;
            if (flickerLeft > 0) { flickerLeft -= dt; return 0.15f; }
            if (dice.NextDouble() < closeness * dt * 6) flickerLeft = 0.05 + dice.NextDouble() * 0.15;
            return 1;
        }

        void UpdateSounds(double now, float dt, double distance)
        {
            if (pulse == null) pulse = TaskSounds.Loop("pulse");
            if (silentUntil > 0 && now >= silentUntil) { silentUntil = 0; TaskSounds.Level = 1; }
            // The pulse swells in slowly and fades out slower (audio.ts setTargetAtTime 0.4 s and 0.6 s).
            float want = hunting && silentUntil == 0 ? (float)HuntPulseLevel * TaskSounds.MasterLevel : 0;
            pulse.volume += (want - pulse.volume) * (1 - Mathf.Exp(-dt / (hunting ? 0.4f : 0.6f)));
            // The ghost's heavy steps while it hunts, one every stride (game.ts playFootsteps).
            if (Shown)
            {
                var at = ghost.position;
                if (steps.Update(at.x, at.z, dt, "ghost")) TaskSounds.Step("ghost", at);
            }
            else steps.Reset();
            // Heartbeat: about 60 bpm at the edge of range, about 150 bpm right next to the ghost.
            if (silentUntil > 0 || distance > HeartbeatRangeM) return;
            double closeness = 1 - distance / HeartbeatRangeM;
            double interval = 1 / (1 + closeness * 1.5) + (hunting ? -0.1 : 0);
            if (now < nextBeatAt) return;
            // "Lub-dub": a stronger beat, then a softer one.
            TaskSounds.PlayScaled("beat", (float)(0.25 + closeness * 0.35));
            float soft = (float)(0.15 + closeness * 0.25);
            later.Add(new KeyValuePair<double, Action>(now + 0.2, () => TaskSounds.PlayScaled("beat", soft)));
            nextBeatAt = now + interval;
        }

        // ---------- The state: Wisps, clues, the altar, the circle ----------

        /// <summary>What the state shows: Wisps (only the dead see them), clue pictures, relics on the altar, the circle.</summary>
        public void OnState(GameState s, string myId, bool basementOpen)
        {
            Player me;
            bool iAmDead = s.players.TryGetValue(myId, out me) && me.health == "dead";
            var seen = new HashSet<string>();
            foreach (var kv in s.players)
            {
                if (kv.Key == myId || kv.Value.health != "dead" || !iAmDead || s.stage != "night") continue;
                seen.Add(kv.Key);
                var at = Coords.Place(world, kv.Value.x, kv.Value.z);
                wispTargets[kv.Key] = at;
                if (!wisps.ContainsKey(kv.Key)) wisps[kv.Key] = MakeWisp(at);
            }
            foreach (var id in new List<string>(wisps.Keys))
            {
                if (seen.Contains(id)) continue;
                UnityEngine.Object.Destroy(wisps[id].gameObject);
                wisps.Remove(id);
                wispTargets.Remove(id);
            }

            foreach (var kv in s.stations)
            {
                Card card;
                string clue = kv.Value.clue ?? "";
                if (!cards.TryGetValue(kv.Key, out card) || clue == card.Shown) continue;
                card.Shown = clue;
                card.Root.gameObject.SetActive(clue != "");
                if (clue == "") continue;
                var suspect = map.Suspects.Find(x => x.Id == clue);
                card.Icon.text = suspect != null && suspect.Icon != null ? suspect.Icon : "?";
                card.Label.text = map.ClueLabel(kv.Key, clue) ?? "";
            }

            var ids = new List<string>(s.relics.Keys);
            ids.Sort(string.CompareOrdinal);
            for (int i = 0; i < ids.Count && i < altar.Count; i++)
            {
                var relic = s.relics[ids[i]];
                bool named = !string.IsNullOrEmpty(s.ghostNamed) && map.Suspects.Exists(x => x.Name == s.ghostNamed && x.Belonging == relic.name);
                altar[i].Box.SetActive(basementOpen && relic.status == "placed");
                altar[i].Dust.SetActive(basementOpen && relic.status == "crumbled");
                // The right relic glows once it names the ghost.
                altar[i].Glow.enabled = altar[i].Box.activeSelf && named;
            }

            if (circle != null)
            {
                string state = s.taintLeft > 0 ? "tainted" : s.ritualStarted ? "running" : s.ritualReady ? "ready" : "waiting";
                var c = Hex(CircleColors[state]);
                circle.color = c;
                if (circle.HasProperty("_BaseColor")) circle.SetColor("_BaseColor", c);
                foreach (var f in flames) f.gameObject.SetActive(state == "tainted");
            }
        }

        Transform MakeWisp(Vector3 at)
        {
            var w = Group(root, "Wisp");
            w.position = at + Vector3.up * WispHeightM;
            Sphere(w, WispRadiusM, Mat(Hex(0xbfe3ff), Look.Unlit), 0, 0, 0);
            var light = w.gameObject.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = Hex(0xbfe3ff);
            light.intensity = WispLight;
            light.range = WispRangeM;
            return w;
        }

        void BuildClues()
        {
            // The suspects' signs are emoji (map data): Windows draws them with its emoji font.
            var emoji = Font.CreateDynamicFontFromOSFont(new[] { "Segoe UI Emoji", "Segoe UI Symbol" }, 96);
            var iconMat = new Material(emoji.material);
            iconMat.SetFloat("unity_GUIZTestMode", (float)UnityEngine.Rendering.CompareFunction.LessEqual);
            var dark = Mat(new Color(20 / 255f, 14 / 255f, 10 / 255f), Look.UnlitClear, 0.86f);
            var gold = Mat(Hex(0xc9a45a), Look.Unlit);
            foreach (var t in map.Tasks)
            {
                if (!map.Suspects.Exists(x => x.Clues.ContainsKey(t.Minigame))) continue;
                var card = new Card { Root = Group(root, "Clue " + t.Id) };
                card.Root.position = Coords.Place(world, t.At.X, t.At.Z) + Vector3.up * (float)CardHeightM;
                // Turned so +z points away from you: three.js +z (Unity -z) is the side you see.
                Shape(card.Root, Plane(CardW, CardH), Vector3.one, dark, 0, 0, 0);
                double edge = 0.016;
                Box(card.Root, CardW, edge, 0.005, gold, 0, CardH / 2 - edge / 2, 0.004);
                Box(card.Root, CardW, edge, 0.005, gold, 0, -CardH / 2 + edge / 2, 0.004);
                Box(card.Root, edge, CardH, 0.005, gold, -CardW / 2 + edge / 2, 0, 0.004);
                Box(card.Root, edge, CardH, 0.005, gold, CardW / 2 - edge / 2, 0, 0.004);
                card.Icon = Text(card.Root, "", 0.3, new Color(0.94f, 0.89f, 0.77f), 0, 0.07, 0.01);
                card.Icon.font = emoji;
                card.Icon.GetComponent<MeshRenderer>().sharedMaterial = iconMat;
                card.Label = Text(card.Root, "", 0.085, Hex(0xefe2c4), 0, -0.25, 0.01, FontStyle.Bold);
                card.Root.gameObject.SetActive(false);
                cards[t.Id] = card;
            }
        }

        void BuildAltar()
        {
            if (!map.Altar.HasValue) return;
            var a = map.Altar.Value;
            var place = Group(root, "Altar");
            place.position = Coords.Place(world, a.X, a.Z);
            // The chalk circle: stand inside it to do the ritual (GDD 11).
            double r = Json.Num(Json.Obj(config, "ritual"), "circleRadiusM");
            circle = Mat(Hex(CircleColors["waiting"]), Look.Unlit);
            var ring = Shape(place, RingMesh(r - 0.08, r, 64, 0, Mathf.PI * 2), Vector3.one, circle, 0, 0.012, 0);
            ring.transform.localRotation = R(-Math.PI / 2, 0, 0);
            var flame = Mat(Hex(0x0b0410), Look.UnlitClear, 0.92f);
            for (int i = 0; i < FlameCount; i++)
            {
                double ang = i * Math.PI * 2 / FlameCount;
                var f = Cylinder(place, 0, 0.09, FlameHeightM, flame, Math.Sin(ang) * FlameRingM, AltarTopM + FlameHeightM / 2, Math.Cos(ang) * FlameRingM, null, 7);
                f.SetActive(false);
                flames.Add(f.transform);
            }
            if (map.Suspects.Count == 0) return;
            // The placed relics wait on the altar for the offering (GDD 26.13), in a row across it.
            var gold = Mat(Hex(0xe0b24a), Look.Unlit);
            var dust = Mat(Hex(0x5a5650), Look.Unlit);
            double gap = Json.Num(Json.Obj(config, "mystery"), "standSpacingM");
            for (int i = 0; i < 3; i++)
            {
                double sx = (i - 1) * gap;
                var relic = new AltarRelic
                {
                    Box = Box(place, RelicSizeM, RelicSizeM, RelicSizeM, gold, sx, AltarTopM + RelicSizeM / 2, 0),
                    Dust = Shape(place, Disc(DustRadiusM, 16), Vector3.one, dust, sx, AltarTopM + 0.01, 0),
                };
                relic.Dust.transform.localRotation = R(-Math.PI / 2, 0, 0);
                relic.Glow = Group(place, "Glow", sx, AltarTopM + RelicSizeM / 2 + 0.3, 0).gameObject.AddComponent<Light>();
                relic.Glow.type = LightType.Point;
                relic.Glow.color = Hex(0xffc860);
                relic.Glow.intensity = 2;
                relic.Glow.range = 3;
                relic.Glow.enabled = false;
                relic.Box.SetActive(false);
                relic.Dust.SetActive(false);
                altar.Add(relic);
            }
        }

        /// <summary>A new night: the ghost, the hunt and the sounds start over.</summary>
        public void Reset()
        {
            Push(null, 0);
            hunting = false;
            silentUntil = 0;
            TaskSounds.Level = 1;
            deadLeft = flickerLeft = 0;
            gentle = 1;
        }
    }
}
