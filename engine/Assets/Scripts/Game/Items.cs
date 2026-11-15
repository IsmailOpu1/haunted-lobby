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
        const float FlashIntensity = 6, FlashSec = 0.15f;
        static readonly Color SaltColor = new Color32(0xf2, 0xef, 0xe6, 0xff);
        static readonly Color RelicColor = new Color32(0xe0, 0xb2, 0x4a, 0xff);

        readonly WorldData world;
        readonly object config;
        readonly Transform root;
        readonly Material saltMat, relicMat, jarMat, lidMat;
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
            relicMat = Tinted(baseMaterial, RelicColor);
            relicMat.EnableKeyword("_EMISSION");
            relicMat.SetColor("_EmissionColor", RelicColor * 1.5f);
            jarMat = Tinted(baseMaterial, new Color32(0xc9, 0xbc, 0x9c, 0xff));
            lidMat = Tinted(baseMaterial, new Color32(0x4e, 0x30, 0x18, 0xff));
            foreach (var jar in map.SaltJars)
            {
                // A crock on a sideboard (its top 0.79 m up), so it is easy to spot with a flashlight.
                var crock = new GameObject("Salt " + jar.Key);
                crock.transform.SetParent(root);
                crock.transform.position = Coords.Place(world, jar.Value.X, jar.Value.Z) + Vector3.up * JarFootM;
                Part(crock, PrimitiveType.Cylinder, jarMat, new Vector3(0, 0.0625f, 0), new Vector3(0.18f, 0.0625f, 0.18f));
                Part(crock, PrimitiveType.Cylinder, lidMat, new Vector3(0, 0.15f, 0), new Vector3(0.16f, 0.025f, 0.16f));
                Part(crock, PrimitiveType.Sphere, lidMat, new Vector3(0, 0.185f, 0), new Vector3(0.04f, 0.03f, 0.04f));
                jars[jar.Key] = crock;
            }
            musicBox = new MusicBox(root);
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
                    glow.intensity = 1.2f;
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
            source.volume = (float)((1 + NearGain * near) / (1 + NearGain));
            source.Play();
            nextAt = t + Phrase + GapFarSec - (GapFarSec - GapNearSec) * near;
        }
    }
}
