using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using System.Text;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The speed test (Options; step E6 of docs/plans/engine-port.md): how fast this computer draws
    /// the hotel at High and at Low. Its own design rather than the browser's speedTest.ts (GDD 26):
    /// - the frame-rate cap and the screen's refresh (vsync) are lifted while it runs, so it measures
    ///   what the computer can do, not what the screen shows;
    /// - it stands in every room (each piece of one) and turns a full circle by torchlight, as a
    ///   player looks round, instead of picking a handful of still views;
    /// - it times the processor and the graphics card apart (Unity's frame timing), so the result
    ///   says which one holds the game back;
    /// - it gives a verdict, which Auto quality then uses on this computer from then on.
    /// Nothing is sent anywhere: the result is text to copy, also saved as speed-test.txt.
    /// Looks and timing only, so its numbers are not game numbers (shared/config.ts).
    /// </summary>
    public class SpeedTest : MonoBehaviour
    {
        /// <summary>Each room piece: frames let settle first (the view jumped there), then one full turn.</summary>
        const float SettleSec = 0.35f, TurnSec = 1.25f;
        /// <summary>How often the bar is told how far it has got (its text and layout are work in the frames timed).</summary>
        const float ProgressEverySec = 0.1f;
        /// <summary>A level is smooth here when it averages this many frames a second...</summary>
        public const double SmoothFps = 60;
        /// <summary>...and its slowest 1 % of frames still come this often (no visible stutter).</summary>
        public const double SmoothLowFps = 45;
        /// <summary>The verdict names what holds the game back only below this frame rate, and only when one part takes this much longer than the other.</summary>
        const double LimitSaidBelowFps = 120, ClearlyMore = 1.25;

        [NonSerialized] public WorldData World;
        [NonSerialized] public float EyeHeightM;
        [NonSerialized] public object Flashlight;
        [NonSerialized] public float HorizontalFovDeg = Options.DefaultFov;
        /// <summary>Whether the hotel is ready to be drawn (its reflections taken).</summary>
        [NonSerialized] public Func<bool> Ready;
        /// <summary>Progress: what is measured now, how far through (0 to 1), and the frame rate this moment.</summary>
        [NonSerialized] public Action<string, float, int> Progress;
        /// <summary>The result (null if stopped).</summary>
        [NonSerialized] public Action<Result> Finished;

        public class Room
        {
            public string Name;
            public HauntedQuality.Level Level;
            public readonly List<float> FrameMs = new List<float>();
            public readonly List<float> CpuMs = new List<float>();
            public readonly List<float> GpuMs = new List<float>();
            public long Draws, Triangles;
            public double Fps => FrameMs.Count == 0 ? 0 : 1000.0 / FrameMs.Average();
        }

        public class LevelResult
        {
            public HauntedQuality.Level Level;
            public double Fps, LowFps, CpuMs, GpuMs;
            public bool Smooth => Fps >= SmoothFps && LowFps >= SmoothLowFps;
            public List<Room> Rooms;
        }

        public class Result
        {
            public LevelResult High, Low;
            public HauntedQuality.Level Recommended;
            public bool GpuTimed;
            /// <summary>One or two sentences for the Options screen.</summary>
            public string Verdict;
            /// <summary>The whole result as text to pass on.</summary>
            public string Text;
        }

        bool stopped;
        public void Stop() { stopped = true; }

        IEnumerator Start()
        {
            while (Ready != null && !Ready() && !stopped) yield return null;
            int vSyncWas = QualitySettings.vSyncCount, rateWas = Application.targetFrameRate;
            var levelWas = HauntedQuality.Current;
            QualitySettings.vSyncCount = 0;
            Application.targetFrameRate = -1;

            var camera = new GameObject("Speed test view").AddComponent<Camera>();
            camera.cullingMask = HauntedHeld.WorldMask;
            camera.nearClipPlane = Game.CameraNearM;
            camera.farClipPlane = 60;
            camera.clearFlags = CameraClearFlags.SolidColor;
            camera.backgroundColor = Color.black;
            camera.depth = 50;
            if (Flashlight != null)
            {
                var torch = Torch.Make(camera.transform, LocalPlayer.TorchAt, Vector3.forward * LocalPlayer.BeamAimM, Json.Num(Flashlight, "coneM"), Json.Num(Flashlight, "coneHalfAngleDeg"));
                torch.enabled = true;
            }
            var draws = Unity.Profiling.ProfilerRecorder.StartNew(Unity.Profiling.ProfilerCategory.Render, "Draw Calls Count");
            var tris = Unity.Profiling.ProfilerRecorder.StartNew(Unity.Profiling.ProfilerCategory.Render, "Triangles Count");
            var timings = new FrameTiming[1];
            bool gpuTimed = false;

            // Each piece of a room named apart, as "Main Hall (2 of 5)".
            var pieces = World.Rooms.GroupBy(r => r.Name).ToDictionary(g => g.Key, g => g.Count());
            var seen = new Dictionary<string, int>();
            var spots = new List<KeyValuePair<string, Vector3>>();
            foreach (var r in World.Rooms)
            {
                seen[r.Name] = seen.TryGetValue(r.Name, out int n) ? n + 1 : 1;
                string name = pieces[r.Name] > 1 ? r.Name + " (" + seen[r.Name] + " of " + pieces[r.Name] + ")" : r.Name;
                spots.Add(new KeyValuePair<string, Vector3>(name, Coords.Place(World, (r.MinX + r.MaxX) / 2, (r.MinZ + r.MaxZ) / 2) + Vector3.up * EyeHeightM));
            }

            var rooms = new List<Room>();
            var levels = new[] { HauntedQuality.Level.High, HauntedQuality.Level.Low };
            int total = spots.Count * levels.Length, done = 0;
            float liveSec = 0, toldAt = -1;
            int liveFrames = 0, liveFps = 0;
            foreach (var level in levels)
            {
                HauntedQuality.Apply(level);
                string levelName = level == HauntedQuality.Level.High ? "High" : "Low";
                foreach (var spot in spots)
                {
                    if (stopped) break;
                    var room = new Room { Name = spot.Key, Level = level };
                    camera.transform.position = spot.Value;
                    float t = -SettleSec;
                    while (t < TurnSec && !stopped)
                    {
                        float aspect = Mathf.Max(0.1f, camera.aspect);
                        camera.fieldOfView = 2 * Mathf.Atan(Mathf.Tan(HorizontalFovDeg * Mathf.Deg2Rad / 2) / aspect) * Mathf.Rad2Deg;
                        camera.transform.rotation = Coords.Look(Mathf.Clamp01(t / TurnSec) * Mathf.PI * 2, 0);
                        if (Time.realtimeSinceStartup - toldAt >= ProgressEverySec)
                        {
                            toldAt = Time.realtimeSinceStartup;
                            Progress?.Invoke(levelName + "  ·  " + spot.Key, (done + Mathf.Clamp01((t + SettleSec) / (TurnSec + SettleSec))) / total, liveFps);
                        }
                        yield return null;
                        float dt = Time.unscaledDeltaTime;
                        t += dt;
                        liveSec += dt;
                        liveFrames++;
                        if (liveSec >= 0.5f) { liveFps = Mathf.RoundToInt(liveFrames / liveSec); liveSec = 0; liveFrames = 0; }
                        var keyboard = UnityEngine.InputSystem.Keyboard.current;
                        if (keyboard != null && keyboard.escapeKey.wasPressedThisFrame) stopped = true;
                        // The settling frames are not counted, and neither are their timings (which
                        // arrive a few frames late).
                        FrameTimingManager.CaptureFrameTimings();
                        if (t <= 0) continue;
                        room.FrameMs.Add(dt * 1000);
                        if (FrameTimingManager.GetLatestTimings(1, timings) > 0)
                        {
                            double cpu = Math.Max(timings[0].cpuMainThreadFrameTime, timings[0].cpuRenderThreadFrameTime);
                            if (cpu > 0) room.CpuMs.Add((float)cpu);
                            if (timings[0].gpuFrameTime > 0) { room.GpuMs.Add((float)timings[0].gpuFrameTime); gpuTimed = true; }
                        }
                        if (draws.Valid) room.Draws = Math.Max(room.Draws, draws.LastValue);
                        if (tris.Valid) room.Triangles = Math.Max(room.Triangles, tris.LastValue);
                    }
                    rooms.Add(room);
                    done++;
                }
            }

            draws.Dispose();
            tris.Dispose();
            Destroy(camera.gameObject);
            QualitySettings.vSyncCount = vSyncWas;
            Application.targetFrameRate = rateWas;
            HauntedQuality.Apply(levelWas);
            var result = stopped ? null : Report(rooms, gpuTimed, HorizontalFovDeg);
            Destroy(this);
            Finished?.Invoke(result);
        }

        static double Median(List<float> v)
        {
            if (v.Count == 0) return 0;
            var s = v.OrderBy(x => x).ToList();
            return s[s.Count / 2];
        }

        /// <summary>The frame time the slowest 1 % of frames reach (the 99th percentile).</summary>
        static double Slowest(List<float> v)
        {
            if (v.Count == 0) return 0;
            var s = v.OrderBy(x => x).ToList();
            return s[Math.Min(s.Count - 1, (int)Math.Floor(0.99 * s.Count))];
        }

        static LevelResult Sum(List<Room> rooms, HauntedQuality.Level level)
        {
            var mine = rooms.Where(r => r.Level == level).ToList();
            var frames = mine.SelectMany(r => r.FrameMs).ToList();
            return new LevelResult
            {
                Level = level,
                Rooms = mine,
                Fps = frames.Count == 0 ? 0 : 1000.0 / frames.Average(),
                LowFps = frames.Count == 0 ? 0 : 1000.0 / Slowest(frames),
                CpuMs = Median(mine.SelectMany(r => r.CpuMs).ToList()),
                GpuMs = Median(mine.SelectMany(r => r.GpuMs).ToList()),
            };
        }

        static string F(double v, string format = "0") => v.ToString(format, CultureInfo.InvariantCulture);

        public static Result Report(List<Room> rooms, bool gpuTimed, float fov)
        {
            var high = Sum(rooms, HauntedQuality.Level.High);
            var low = Sum(rooms, HauntedQuality.Level.Low);
            var r = new Result { High = high, Low = low, GpuTimed = gpuTimed };
            r.Recommended = high.Smooth ? HauntedQuality.Level.High : HauntedQuality.Level.Low;
            // What holds it back, at the level it would play at.
            var at = high.Smooth ? high : low;
            // Which part holds it back, said only when one clearly does and the frame rate is near
            // the line (at two hundred frames a second neither matters).
            string limit = !gpuTimed || at.Fps >= LimitSaidBelowFps ? ""
                : at.GpuMs > at.CpuMs * ClearlyMore ? " The graphics card is what holds it back."
                : at.CpuMs > at.GpuMs * ClearlyMore ? " The processor is what holds it back." : "";
            r.Verdict = high.Smooth ? "High runs smoothly on this computer" + (high.Fps >= LimitSaidBelowFps ? ", with room to spare." : ".") + limit
                : low.Smooth ? "Low runs smoothly on this computer; High is too slow here." + limit
                : "Even Low drops below " + F(SmoothFps) + " FPS in places here. Low still plays best; a smaller window helps." + limit;

            var sb = new StringBuilder();
            sb.AppendLine("Haunted Lobby speed test (version " + Release.Version + ", Windows)");
            sb.AppendLine("Graphics: " + SystemInfo.graphicsDeviceName + " (" + F(SystemInfo.graphicsMemorySize / 1024.0, "0.#") + " GB, " + SystemInfo.graphicsDeviceType + ")");
            sb.AppendLine("Processor: " + SystemInfo.processorType.Trim() + " (" + SystemInfo.processorCount + " threads), memory " + F(SystemInfo.systemMemorySize / 1024.0) + " GB");
            sb.AppendLine("Picture: " + Screen.width + " x " + Screen.height + " pixels, field of view " + F(fov) + "°, screen refresh " + F(Screen.currentResolution.refreshRateRatio.value) + " Hz");
            sb.AppendLine("Measured with no frame cap (it can go above the screen's refresh), by torchlight, turning round in every room.");
            sb.AppendLine(gpuTimed ? "Card / processor = the time each spent on a frame (16.7 ms or less keeps 60 FPS)." : "This computer doesn't report the graphics card's own time; only the frame rate is shown.");
            sb.AppendLine();
            sb.AppendLine("Verdict: " + r.Verdict);
            foreach (var l in new[] { high, low })
            {
                sb.AppendLine();
                string name = l.Level == HauntedQuality.Level.High ? "High" : "Low";
                sb.Append(name + ": " + F(l.Fps) + " FPS on average, slowest 1% " + F(l.LowFps) + " FPS");
                if (gpuTimed) sb.Append(", card " + F(l.GpuMs, "0.0") + " ms, processor " + F(l.CpuMs, "0.0") + " ms");
                sb.AppendLine(l.Smooth ? " (smooth)" : " (not smooth)");
                // The slowest rooms first: the ones that decide it.
                foreach (var room in l.Rooms.OrderBy(x => x.Fps))
                {
                    string ok = room.Fps >= SmoothFps ? "ok  " : "SLOW";
                    string card = room.GpuMs.Count > 0 ? ", card " + F(Median(room.GpuMs), "0.0") + " ms" : "";
                    sb.AppendLine("  " + ok + " " + F(room.Fps).PadLeft(4) + " FPS" + card + ", " + "up to " + room.Draws + " draws, " + F(room.Triangles / 1000.0) + "k triangles: " + room.Name);
                }
            }
            r.Text = sb.ToString().TrimEnd();
            return r;
        }
    }
}
