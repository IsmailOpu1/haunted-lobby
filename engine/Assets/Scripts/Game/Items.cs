using System;
using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// Step C2: what the items and relics look and sound like (client/src/items.ts, relicsView.ts and
    /// the music box in audio.ts): salt jars and salt lines from the state, dropped relics the server
    /// says you can see, camera flashes, and the music box a hidden relic plays (GDD 10). The shapes
    /// are the browser's simple stand-ins; step D brings the real models.
    /// </summary>
    public class Items
    {
        // As the browser (items.ts, relicsView.ts).
        const float JarFootM = 0.79f;
        const float SaltLineThicknessM = 0.18f;
        const float RelicSizeM = 0.2f, RelicHeightM = 0.18f, BobM = 0.04f, BobPerSec = 2.2f, RelicGlowRangeM = 2.5f;
        // items.ts flashAt: PointLight(white, 60, flashVisibleM, decay 1.5) for 0.15 s; three's lights are π brighter than Unity's.
        const float FlashIntensity = 60 / Mathf.PI, FlashSec = 0.15f, FlashDecay = 1.5f;
        static readonly Color SaltColor = new Color32(0xf2, 0xef, 0xe6, 0xff);
        static readonly Color RelicColor = new Color32(0xe0, 0xb2, 0x4a, 0xff);

        readonly WorldData world;
        readonly object config;
        readonly Transform root;
        readonly Material saltMat, relicMat;
        readonly Dictionary<string, GameObject> jars = new Dictionary<string, GameObject>();
        readonly Dictionary<string, GameObject> lines = new Dictionary<string, GameObject>();
        readonly Dictionary<string, GameObject> relics = new Dictionary<string, GameObject>();
        readonly List<KeyValuePair<Light, double>> flashes = new List<KeyValuePair<Light, double>>();
        readonly MusicBox musicBox;
        /// <summary>Your own photo: the screen goes white until then.</summary>
        public double ScreenFlashUntil;

        public Items(WorldData world, MapInfo map, object config, Material baseMaterial)
        {
            this.world = world;
            this.config = config;
            root = new GameObject("Items").transform;
            saltMat = Tinted(baseMaterial, SaltColor);
            // relicsView.ts: a plain unlit gold box (MeshBasicMaterial) with a point light.
            relicMat = Shapes.Mat(RelicColor, Shapes.Look.Unlit);
            var crockParts = SaltCrockParts();
            foreach (var jar in map.SaltJars)
            {
                // A crock on a sideboard (its top 0.79 m up), so it is easy to spot with a flashlight.
                var crock = new GameObject("Salt " + jar.Key);
                crock.transform.SetParent(root);
                crock.transform.position = Coords.Place(world, jar.Value.X, jar.Value.Z) + Vector3.up * JarFootM;
                // The label toward the room.
                crock.transform.rotation = Shapes.R(0, Stations.FacingYaw(map, jar.Value.X, jar.Value.Z), 0);
                foreach (var p in crockParts)
                {
                    var part = new GameObject(p.Key.name);
                    part.transform.SetParent(crock.transform, false);
                    part.AddComponent<MeshFilter>().sharedMesh = p.Key;
                    part.AddComponent<MeshRenderer>().sharedMaterial = p.Value;
                }
                jars[jar.Key] = crock;
            }
            musicBox = new MusicBox(root);
        }

        /// <summary>
        /// items.ts saltCrockParts: cream stoneware with its top dipped in brown glaze, a turned wooden
        /// lid, and a paper label lettered SALT. 0.22 m tall, its foot at the origin. Shared by every jar.
        /// </summary>
        static List<KeyValuePair<Mesh, Material>> SaltCrockParts()
        {
            Func<double[], Vector2[]> pts = a => { var v = new Vector2[a.Length / 2]; for (int i = 0; i < v.Length; i++) v[i] = new Vector2((float)a[2 * i], (float)a[2 * i + 1]); return v; };
            Func<int, double, Material> std = (hex, roughness) =>
            {
                var m = Shapes.Mat(Shapes.Hex(hex), Shapes.Look.Standard);
                m.SetFloat("_Smoothness", (float)(1 - roughness));
                m.SetFloat("_Metallic", 0);
                return m;
            };
            var stoneware = std(0xc9bc9c, 0.45);
            var glaze = std(0x4e3018, 0.3);
            var wood = std(0x3b2616, 0.75);
            // The body to the glaze line, then the glazed shoulder and rim.
            var body = Shapes.Lathe(pts(new[] { 0, 0, 0.078, 0, 0.084, 0.006, 0.092, 0.05, 0.094, 0.1, 0.093, 0.125 }), 28);
            var top = Shapes.Lathe(pts(new[] { 0.093, 0.125, 0.09, 0.16, 0.078, 0.18, 0.072, 0.188, 0.074, 0.196, 0.066, 0.198 }), 28);
            // The lid sits in the rim: a flat disc with a turned knob.
            var lid = Shapes.Lathe(pts(new[] { 0, 0.2, 0.072, 0.2, 0.072, 0.208, 0.03, 0.212, 0.016, 0.218, 0.014, 0.228, 0.02, 0.236, 0, 0.24 }), 24);
            // The label: a band of paper round the front of the belly (an open cylinder, 1.5 rad of it).
            var label = Shapes.Lathe(pts(new[] { 0.0955, 0.075 - 0.0275, 0.0955, 0.075 + 0.0275 }), 24, -0.75, 1.5);
            var paper = std(0xffffff, 0.85);
            var picture = LabelTexture();
            paper.mainTexture = picture;
            if (paper.HasProperty("_BaseMap")) paper.SetTexture("_BaseMap", picture);
            body.name = "Stoneware";
            top.name = "Glaze";
            lid.name = "Lid";
            label.name = "Label";
            return new List<KeyValuePair<Mesh, Material>>
            {
                new KeyValuePair<Mesh, Material>(body, stoneware),
                new KeyValuePair<Mesh, Material>(top, glaze),
                new KeyValuePair<Mesh, Material>(lid, wood),
                new KeyValuePair<Mesh, Material>(label, paper),
            };
        }

        /// <summary>The crock's label (items.ts): SALT in bold Georgia on paper in a ruled border, 256 x 96 px.</summary>
        static Texture2D LabelTexture()
        {
            const int w = 256, h = 96;
            Color32 paper = new Color32(0xcd, 0xbf, 0x98, 0xff), rule = new Color32(0x3a, 0x2a, 0x18, 0xff), ink = new Color32(0x2a, 0x1c, 0x10, 0xff);
            var px = new Color32[w * h];
            for (int i = 0; i < px.Length; i++) px[i] = paper;
            // strokeRect(10, 10, 236, 76) with a 3 px line: 8.5 to 11.5 px in from each edge.
            for (int y = 9; y < h - 9; y++)
                for (int x = 9; x < w - 9; x++)
                    if (x < 12 || x >= w - 12 || y < 12 || y >= h - 12) px[(h - 1 - y) * w + x] = rule;
            new TextPainter(52, "SALT").Write(px, w, h, "SALT", 128, 52, ink, float.MaxValue);
            return TextPainter.Picture(px, w, h);
        }

        static Material Tinted(Material baseMaterial, Color c)
        {
            var m = new Material(baseMaterial) { color = c };
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            return m;
        }

        static GameObject Part(GameObject parent, PrimitiveType type, Material mat, Vector3 at, Vector3 scale)
        {
            var part = GameObject.CreatePrimitive(type);
            UnityEngine.Object.Destroy(part.GetComponent<Collider>());
            part.transform.SetParent(parent.transform, false);
            part.transform.localPosition = at;
            part.transform.localScale = scale;
            part.GetComponent<Renderer>().sharedMaterial = mat;
            return part;
        }

        public void OnState(GameState s)
        {
            foreach (var kv in s.saltJars)
            {
                GameObject jar;
                if (jars.TryGetValue(kv.Key, out jar)) jar.SetActive(!kv.Value.taken);
            }
            var seen = new HashSet<string>();
            double width = Json.Num(Json.Obj(config, "salt"), "lineWidthM");
            foreach (var kv in s.saltLines)
            {
                seen.Add(kv.Key);
                if (lines.ContainsKey(kv.Key)) continue;
                var line = GameObject.CreatePrimitive(PrimitiveType.Cube);
                UnityEngine.Object.Destroy(line.GetComponent<Collider>());
                line.name = "Salt line";
                line.transform.SetParent(root);
                line.transform.position = Coords.Place(world, kv.Value.x, kv.Value.z) + Vector3.up * 0.011f;
                // Across the way the pourer faced (shared/src/items.ts saltLineEnds).
                line.transform.rotation = Coords.Facing(kv.Value.yaw);
                line.transform.localScale = new Vector3((float)width, 0.02f, SaltLineThicknessM);
                line.GetComponent<Renderer>().sharedMaterial = saltMat;
                lines[kv.Key] = line;
            }
            foreach (var id in new List<string>(lines.Keys))
            {
                if (seen.Contains(id)) continue;
                UnityEngine.Object.Destroy(lines[id]);
                lines.Remove(id);
            }
        }

        /// <summary>Dropped relics within sight: exactly the ones in the latest relicsNear message.</summary>
        public void SetDropped(List<Night.RelicNear> list)
        {
            var seen = new HashSet<string>();
            foreach (var r in list)
            {
                if (r.Hidden) continue;
                seen.Add(r.Id);
                GameObject relic;
                if (!relics.TryGetValue(r.Id, out relic))
                {
                    relic = new GameObject("Relic " + r.Id);
                    relic.transform.SetParent(root);
                    var box = Part(relic, PrimitiveType.Cube, relicMat, Vector3.zero, Vector3.one * RelicSizeM);
                    var glow = box.AddComponent<Light>();
                    glow.type = LightType.Point;
                    glow.color = new Color32(0xff, 0xc8, 0x60, 0xff);
                    glow.intensity = 1.2f / Mathf.PI; // three's 1.2 (its lights are pi brighter)
                    glow.range = RelicGlowRangeM;
                    relics[r.Id] = relic;
                }
                relic.transform.position = Coords.Place(world, r.X, r.Z);
            }
            foreach (var id in new List<string>(relics.Keys))
            {
                if (seen.Contains(id)) continue;
                UnityEngine.Object.Destroy(relics[id]);
                relics.Remove(id);
            }
        }

        /// <summary>A camera flash: your own whitens the screen, anyone else's lights up where they stand.</summary>
        public void Flash(bool mine, double x, double z)
        {
            double now = Time.realtimeSinceStartupAsDouble;
            if (mine) { ScreenFlashUntil = now + FlashSec * 2; return; }
            var light = new GameObject("Flash").AddComponent<Light>();
            light.type = LightType.Point;
            light.intensity = FlashIntensity;
            light.range = (float)Json.Num(Json.Obj(config, "camera"), "flashVisibleM");
            light.transform.position = Coords.Place(world, x, z) + Vector3.up * 1.6f;
            light.shadows = LightShadows.None;
            UnityEngine.Rendering.Universal.HauntedLightDecay.Set(light, FlashDecay);
            flashes.Add(new KeyValuePair<Light, double>(light, now + FlashSec));
        }

        /// <summary>Every frame: bob the relics, end flashes, and play the nearest hidden relic's music box.</summary>
        public void Update(double now, Vector3? whisperAt, double closeness)
        {
            foreach (var kv in relics)
            {
                var box = kv.Value.transform.GetChild(0);
                box.localPosition = new Vector3(0, RelicHeightM + Mathf.Sin((float)now * BobPerSec) * BobM, 0);
                box.localRotation = Quaternion.Euler(0, (float)now * 0.8f * Mathf.Rad2Deg, 0);
            }
            for (int i = flashes.Count - 1; i >= 0; i--)
            {
                if (now < flashes[i].Value) continue;
                UnityEngine.Object.Destroy(flashes[i].Key.gameObject);
                flashes.RemoveAt(i);
            }
            musicBox.Update(whisperAt, closeness);
        }
    }

    /// <summary>
    /// A hidden relic calling (GDD 10): a music box playing a short tune from where the nearest hidden
    /// relic is. Closer, it plays more often and louder. As audio.ts relicWhisper, with the same
    /// tune, notes, echo and timing; the tune is made once as a sound and played again each time.
    /// </summary>
    public class MusicBox
    {
        // As audio.ts: [semitones above A4, beat].
        static readonly double[,] Tune = { { 0, 0 }, { 3, 0.5 }, { 7, 1 }, { 11, 1.5 }, { 8, 2.5 }, { 7, 3 }, { 3, 3.5 }, { 2, 4 }, { -1, 5 } };
        const double BeatSec = 0.32, NoteSec = 1.4, ShineGain = 0.25, GapFarSec = 6, GapNearSec = 2.2, Level = 0.16, NearGain = 1.2, EchoSec = 0.27, EchoFeedback = 0.3;
        const float RefDistanceM = 1.5f, MaxDistanceM = 30;

        readonly AudioSource source;
        double nextAt;

        public MusicBox(Transform parent)
        {
            var obj = new GameObject("Music box");
            obj.transform.SetParent(parent);
            source = obj.AddComponent<AudioSource>();
            source.clip = MakeTune();
            source.spatialBlend = 1;
            source.dopplerLevel = 0;
            // Inverse distance from 1.5 m, as the browser's panner.
            source.rolloffMode = AudioRolloffMode.Custom;
            var curve = new AnimationCurve();
            for (float d = 0; d <= MaxDistanceM; d += 0.5f) curve.AddKey(d / MaxDistanceM, RefDistanceM / Mathf.Max(RefDistanceM, d));
            source.SetCustomCurve(AudioSourceCurveType.CustomRolloff, curve);
            source.maxDistance = MaxDistanceM;
        }

        static double Phrase { get { return Tune[Tune.GetLength(0) - 1, 1] * BeatSec; } }

        /// <summary>The tune at its loudest (right on top of the relic); the volume brings it down.</summary>
        static AudioClip MakeTune()
        {
            int rate = AudioSettings.outputSampleRate;
            int length = (int)((Phrase + NoteSec + EchoSec * 8) * rate);
            var dry = new double[length];
            int notes = (int)(NoteSec * rate);
            for (int n = 0; n < Tune.GetLength(0); n++)
            {
                double hz = 440 * Math.Pow(2, Tune[n, 0] / 12.0);
                int start = (int)(Tune[n, 1] * BeatSec * rate);
                for (int i = 0; i < notes && start + i < length; i++)
                {
                    double t = (double)i / rate;
                    // A quick start (5 ms) and a long ring down to silence.
                    double env = t < 0.005 ? t / 0.005 : Math.Exp(Math.Log(0.0001) * (t - 0.005) / (NoteSec - 0.005));
                    dry[start + i] += env * (Math.Sin(2 * Math.PI * hz * t) + ShineGain * Math.Sin(2 * Math.PI * hz * 4 * t));
                }
            }
            // The echo loop, as the browser wires it: the delay line takes the tune plus its own fed-back
            // output; what is fed back (EchoFeedback of the delayed sound) is also heard.
            int delay = (int)(EchoSec * rate);
            var loop = new double[length];
            var output = new float[length];
            double gain = Level * (1 + NearGain);
            for (int i = 0; i < length; i++)
            {
                double fed = (i >= delay ? loop[i - delay] : 0) * EchoFeedback;
                loop[i] = dry[i] + fed;
                output[i] = (float)Math.Max(-1, Math.Min(1, (dry[i] + fed) * gain));
            }
            var clip = AudioClip.Create("music box", length, 1, rate, false);
            clip.SetData(output, 0);
            return clip;
        }

        public void Update(Vector3? at, double closeness)
        {
            double t = AudioSettings.dspTime;
            if (!at.HasValue)
            {
                // Start the tune again soon after you come back in range.
                nextAt = t + 1;
                return;
            }
            source.transform.position = at.Value + Vector3.up * 0.8f;
            if (t < nextAt) return;
            double near = Math.Max(0, Math.Min(1, closeness));
            // Through the master and the pre-hunt silence, as audio.ts relicWhisper.
            source.volume = (float)((1 + NearGain * near) / (1 + NearGain)) * TaskSounds.Out;
            source.Play();
            nextAt = t + Phrase + GapFarSec - (GapFarSec - GapNearSec) * near;
        }
    }
}
