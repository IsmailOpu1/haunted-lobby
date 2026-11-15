using System;
using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The sounds a task makes (GDD 9 and 26.5), the browser's audio.ts taskSound recipes worked
    /// out sample by sample into clips once: the same oscillators, noise, filters and envelopes.
    /// Your own play in your ears; others' noisy tasks from where they are (inverse rolloff from 2 m).
    /// </summary>
    public static class TaskSounds
    {
        // audio.ts: the piano's old, slightly sad scale.
        const double PIANO_BASE_HZ = 220;
        static readonly int[] PIANO_SCALE = { 0, 2, 3, 5, 7, 8, 10, 12 };
        const float REF_DISTANCE_M = 2, MAX_DISTANCE_M = 40;

        static readonly Dictionary<string, AudioClip> clips = new Dictionary<string, AudioClip>();
        static AudioSource flat;
        static int rate;
        static readonly System.Random noiseDice = new System.Random(7);

        /// <summary>Which sound a noisy task makes for others (game.ts TASK_NOISES).</summary>
        public static string NoiseOf(string minigame)
        {
            switch (minigame)
            {
                case "cradle": return "cry";
                case "piano": return "badNote";
                case "shutters": return "bang";
                case "dig": return "scrape";
                default: return "badNote";
            }
        }

        static readonly List<AudioSource> placed = new List<AudioSource>();
        static float level = 1;

        /// <summary>
        /// How loud the game's own sounds are, 0 to 1: the hunt's warning drops them all to silence
        /// (audio.ts huntWarning). Voices are not touched, as in the browser.
        /// </summary>
        public static float Level
        {
            get { return level; }
            set
            {
                level = value;
                if (flat != null) flat.volume = value;
                placed.RemoveAll(x => x == null);
                foreach (var x in placed) x.volume = value;
            }
        }

        /// <summary>One of your own sounds at a volume (a heartbeat's strength).</summary>
        public static void PlayScaled(string kind, float volume)
        {
            Play(kind, -1, false);
            flat.PlayOneShot(Clip(kind, -1), volume);
        }

        /// <summary>A sound that loops for as long as it plays, silent until its volume is raised.</summary>
        public static AudioSource Loop(string kind)
        {
            var go = new GameObject("Loop " + kind);
            UnityEngine.Object.DontDestroyOnLoad(go);
            var s = go.AddComponent<AudioSource>();
            s.clip = Clip(kind, -1);
            s.loop = true;
            s.spatialBlend = 0;
            s.volume = 0;
            s.Play();
            return s;
        }

        public static void Play(string kind, int pitch = -1) { Play(kind, pitch, true); }

        static void Play(string kind, int pitch, bool sound)
        {
            if (flat == null)
            {
                var go = new GameObject("Task sounds");
                UnityEngine.Object.DontDestroyOnLoad(go);
                flat = go.AddComponent<AudioSource>();
                flat.spatialBlend = 0;
                flat.volume = level;
            }
            if (sound) flat.PlayOneShot(Clip(kind, pitch));
        }

        /// <summary>A sound from a point on the floor (world space); it is heard 1 m up, as the browser's.</summary>
        public static void PlayAt(string kind, Vector3 floor) { PlayAt(kind, floor, REF_DISTANCE_M, 1); }

        /// <summary>A sound from a point (world space), lifted by up metres, with inverse rolloff from refM.</summary>
        public static void PlayAt(string kind, Vector3 floor, float refM, float up)
        {
            var clip = Clip(kind, -1);
            var go = new GameObject("Sound " + kind);
            go.transform.position = floor + Vector3.up * up;
            var s = go.AddComponent<AudioSource>();
            s.clip = clip;
            s.spatialBlend = 1;
            s.dopplerLevel = 0;
            s.rolloffMode = AudioRolloffMode.Custom;
            var curve = new AnimationCurve();
            for (float d = 0; d <= MAX_DISTANCE_M; d += 0.5f) curve.AddKey(d / MAX_DISTANCE_M, refM / Mathf.Max(refM, d));
            s.SetCustomCurve(AudioSourceCurveType.CustomRolloff, curve);
            s.maxDistance = MAX_DISTANCE_M;
            s.volume = level;
            placed.Add(s);
            s.Play();
            UnityEngine.Object.Destroy(go, clip.length + 0.1f);
        }

        static AudioClip Clip(string kind, int pitch)
        {
            if (kind != "note") pitch = 0;
            int step = PIANO_SCALE[Math.Max(0, pitch) % PIANO_SCALE.Length];
            string key = kind + ":" + step;
            AudioClip clip;
            if (clips.TryGetValue(key, out clip)) return clip;
            if (rate == 0) rate = AudioSettings.outputSampleRate;
            var buf = Make(kind, step);
            clip = AudioClip.Create(key, buf.Length, 1, rate, false);
            var data = new float[buf.Length];
            for (int i = 0; i < buf.Length; i++) data[i] = (float)Math.Max(-1, Math.Min(1, buf[i]));
            clip.SetData(data, 0);
            clips[key] = clip;
            return clip;
        }

        // ---------- The recipes (audio.ts taskSound) ----------

        static double[] Make(string kind, int step)
        {
            switch (kind)
            {
                case "strike": { var b = New(0.25); Noise(b, Filter.BandPass, Fixed(3000), 1, Tone(0.3, 0.25, 0), 0, 0.25); return b; }
                case "fizz": { var b = New(0.4); Noise(b, Filter.HighPass, Fixed(5000), Math.Pow(10, 1 / 20.0), Tone(0.12, 0.4, 0), 0, 0.4); return b; }
                case "tick": return Simple(Wave.Triangle, Fixed(1800), 0.12, 0.03);
                case "click": return Simple(Wave.Triangle, Fixed(900), 0.18, 0.06);
                case "wrong": return Simple(Wave.Square, Exp(140, 80, 0, 0.2), 0.2, 0.2);
                case "note":
                {
                    double f = PIANO_BASE_HZ * Math.Pow(2, step / 12.0);
                    var b = New(1.22);
                    Osc(b, Wave.Triangle, Fixed(f), Tone(0.22, 1.2, 0), 0, 1.22);
                    Osc(b, Wave.Sine, Fixed(f * 2), Tone(0.06, 0.8, 0), 0, 0.82);
                    return b;
                }
                case "badNote":
                {
                    // Three neighbouring notes at once: a loud, ugly clash.
                    var b = New(1.42);
                    foreach (var f in new double[] { 233, 247, 262 }) Osc(b, Wave.Saw, Fixed(f), Tone(0.12, 1.4, 0), 0, 1.42);
                    return b;
                }
                case "cry":
                {
                    // Two rising-and-falling wails through a band-pass.
                    var b = New(1.4);
                    for (int i = 0; i < 2; i++)
                    {
                        double s = i * 0.7;
                        var wail = New(1.4);
                        Func<double, double> freq = t => t < s ? 480 : t < s + 0.25 ? 480 + (720 - 480) * (t - s) / 0.25 : t < s + 0.65 ? 720 + (430 - 720) * (t - s - 0.25) / 0.4 : 430;
                        Func<double, double> gain = t => t < s + 0.08 ? ExpAt(0.0001, 0.3, s, s + 0.08, t) : ExpAt(0.3, 0.0001, s + 0.08, s + 0.65, t);
                        Osc(wail, Wave.Saw, freq, t => 1, s, s + 0.7);
                        Biquad(wail, Filter.BandPass, Fixed(1100), 1.5);
                        for (int n = 0; n < b.Length; n++) b[n] += wail[n] * gain(n / (double)rate);
                    }
                    return b;
                }
                case "scrape": { var b = New(0.18); Noise(b, Filter.BandPass, Fixed(700), 1, Tone(0.18, 0.18, 0), 0, 0.18); return b; }
                case "splash": { var b = New(0.35); Noise(b, Filter.BandPass, Exp(1200, 400, 0, 0.35), 1, Tone(0.2, 0.35, 0), 0, 0.35); return b; }
                case "spark": { var b = New(0.12); Noise(b, Filter.BandPass, Fixed(6000), 1, Tone(0.15, 0.12, 0), 0, 0.12); return b; }
                case "thud": return Simple(Wave.Sine, Exp(90, 45, 0, 0.25), 0.4, 0.25);
                case "bang":
                {
                    // A wooden shutter slamming: a deep knock with a crack of noise on top.
                    var b = New(0.37);
                    Osc(b, Wave.Sine, Exp(110, 50, 0, 0.35), Tone(0.6, 0.35, 0), 0, 0.37);
                    Osc(b, Wave.Square, Fixed(70), Tone(0.15, 0.12, 0), 0, 0.14);
                    Noise(b, Filter.None, Fixed(0), 1, Tone(0.35, 0.15, 0), 0, 0.15);
                    return b;
                }
                case "whistle":
                {
                    // Wind rising before a gust.
                    var b = New(1.1);
                    Noise(b, Filter.BandPass, Exp(500, 1400, 0, 1.1), 8, t => t < 0.935 ? ExpAt(0.0001, 0.5, 0, 0.935, t) : ExpAt(0.5, 0.0001, 0.935, 1.1, t), 0, 1.1);
                    return b;
                }
                case "hiss":
                {
                    // Gas escaping from a burner. (Web Audio reads a high-pass's Q in dB.)
                    var b = New(0.6);
                    Noise(b, Filter.HighPass, Fixed(4000), Math.Pow(10, 0.7 / 20), t => t < 0.05 ? ExpAt(0.0001, 0.15, 0, 0.05, t) : ExpAt(0.15, 0.0001, 0.05, 0.6, t), 0, 0.6);
                    return b;
                }
                case "bell":
                {
                    // The Bellboy's service bell (audio.ts serviceBell): two strikes of bright, slightly out-of-tune partials.
                    var b = New(2.6);
                    for (int i = 0; i < 2; i++)
                    {
                        double start = i * 0.32;
                        foreach (var part in new[] { new[] { 1870, 0.22, 2.2 }, new[] { 2690, 0.12, 1.4 }, new[] { 4310, 0.07, 0.8 } })
                            Osc(b, Wave.Sine, Fixed(part[0] * (i == 0 ? 1 : 0.998)), Tone(part[1], part[2], start), start, start + part[2]);
                    }
                    return b;
                }
                case "slam":
                {
                    // A door slammed shut and locked (audio.ts doorSlam): a heavy bang, then a latch.
                    var b = New(0.45);
                    Noise(b, Filter.BandPass, Fixed(90), 0.8, Tone(1.2, 0.4, 0), 0, 0.4);
                    Noise(b, Filter.BandPass, Fixed(1600), 6, Tone(0.35, 0.06, 0.22), 0.22, 0.28);
                    return b;
                }
                case "whisper":
                {
                    // A breathy whisper (audio.ts powerWhisper): five syllables, pitch and loudness wobbling like speech.
                    const int Syllables = 5;
                    const double Sec = 0.22, Level = 0.5;
                    double end = Syllables * Sec;
                    var b = New(end + 0.15);
                    var gains = new List<double[]> { new[] { 0.0, 0.0 } };
                    var freqs = new List<double[]> { new[] { 0.0, 2600.0 } };
                    for (int i = 0; i < Syllables; i++)
                    {
                        double st = i * Sec;
                        gains.Add(new[] { st + Sec * 0.3, Level });
                        gains.Add(new[] { st + Sec, Level * 0.15 });
                        freqs.Add(new[] { st + Sec, i % 2 == 1 ? 2200.0 : 3400.0 });
                    }
                    gains.Add(new[] { end + 0.1, 0.0 });
                    Noise(b, Filter.BandPass, Linear(freqs), 3, Linear(gains), 0, end + 0.15);
                    return b;
                }
                case "sting":
                {
                    // The hunt's start (audio.ts sting): three soft triangles sliding down an octave.
                    var b = New(1.5);
                    foreach (var f in new double[] { 233, 247, 277 }) Osc(b, Wave.Triangle, Exp(f, f * 0.5, 0, 1.2), Tone(0.1, 1.4, 0), 0, 1.5);
                    return b;
                }
                case "beat":
                {
                    // One heartbeat at full strength (audio.ts beat); the volume sets how hard it beats.
                    var b = New(0.3);
                    Osc(b, Wave.Sine, Exp(52, 34, 0, 0.2), t => t < 0.025 ? ExpAt(0.0001, 1, 0, 0.025, t) : ExpAt(1, 0.0001, 0.025, 0.25, t), 0, 0.3);
                    return b;
                }
                case "pulse":
                {
                    // The hunt pulse (audio.ts): a deep 46 Hz sine whose loudness wobbles at 1.2 Hz; 5 s loops cleanly.
                    var b = New(5);
                    Osc(b, Wave.Sine, Fixed(46), t => 0.6 + 0.4 * Math.Sin(2 * Math.PI * 1.2 * t), 0, 5);
                    return b;
                }
                case "ghostStep":
                {
                    // The ghost's heavy step (audio.ts step "ghost"): a deep thud and a dull scuff.
                    const double Gain = 0.9, ThudHz = 45, ThudMix = 0.6, NoiseHz = 260, Q = 0.9, Seconds = 0.22;
                    var b = New(Seconds * 2);
                    Osc(b, Wave.Sine, Exp(ThudHz, ThudHz * 0.6, 0, Seconds), t => t < 0.006 ? ExpAt(0.0001, Gain * ThudMix, 0, 0.006, t) : ExpAt(Gain * ThudMix, 0.0001, 0.006, Seconds * 1.6, t), 0, Seconds * 2);
                    double tap = Gain * (1 - ThudMix) * 1.6;
                    Noise(b, Filter.BandPass, Fixed(NoiseHz), Q, t => t < 0.004 ? ExpAt(0.0001, tap, 0, 0.004, t) : ExpAt(tap, 0.0001, 0.004, Seconds, t), 0, Seconds + 0.05);
                    return b;
                }
                default:
                {
                    // scare: a sudden dissonant swell.
                    var b = New(1.12);
                    foreach (var f in new double[] { 311, 330, 466 }) Osc(b, Wave.Saw, Exp(f, f * 0.7, 0, 1.1), Tone(0.1, 1.1, 0), 0, 1.12);
                    return b;
                }
            }
        }

        // ---------- The parts ----------

        enum Wave { Sine, Triangle, Square, Saw }
        enum Filter { None, BandPass, HighPass }

        static double[] New(double seconds) { return new double[(int)Math.Ceiling(seconds * rate)]; }

        /// <summary>audio.ts tone(): one oscillator from level falling to silence over len.</summary>
        static double[] Simple(Wave wave, Func<double, double> freq, double level, double len)
        {
            var b = New(len + 0.02);
            Osc(b, wave, freq, Tone(level, len, 0), 0, len + 0.02);
            return b;
        }

        static Func<double, double> Fixed(double v) { return t => v; }

        /// <summary>Web Audio's linearRampToValueAtTime through (time, value) points, held after the last.</summary>
        static Func<double, double> Linear(List<double[]> points)
        {
            return t =>
            {
                for (int i = 1; i < points.Count; i++)
                    if (t < points[i][0]) return points[i - 1][1] + (points[i][1] - points[i - 1][1]) * (t - points[i - 1][0]) / (points[i][0] - points[i - 1][0]);
                return points[points.Count - 1][1];
            };
        }
        static Func<double, double> Exp(double from, double to, double t0, double t1) { return t => ExpAt(from, to, t0, t1, t); }

        /// <summary>Web Audio's exponentialRampToValueAtTime from (t0, from) to (t1, to).</summary>
        static double ExpAt(double from, double to, double t0, double t1, double t)
        {
            if (t <= t0) return from;
            if (t >= t1) return to;
            return from * Math.Pow(to / from, (t - t0) / (t1 - t0));
        }

        /// <summary>A gain set to level at start that falls to 0.0001 over len.</summary>
        static Func<double, double> Tone(double level, double len, double start) { return t => ExpAt(level, 0.0001, start, start + len, t); }

        static void Osc(double[] b, Wave wave, Func<double, double> freq, Func<double, double> gain, double start, double stop)
        {
            double phase = 0;
            int from = (int)(start * rate), to = Math.Min(b.Length, (int)(stop * rate));
            for (int n = from; n < to; n++)
            {
                double t = n / (double)rate;
                double dp = freq(t) / rate;
                double v;
                switch (wave)
                {
                    case Wave.Sine: v = Math.Sin(2 * Math.PI * phase); break;
                    case Wave.Triangle: v = 4 * Math.Abs(phase - 0.5) - 1; break;
                    case Wave.Square: v = (phase < 0.5 ? 1 : -1) + Blep(phase, dp) - Blep((phase + 0.5) % 1, dp); break;
                    default: v = 2 * phase - 1 - Blep(phase, dp); break;
                }
                b[n] += v * gain(t);
                phase = (phase + dp) % 1;
            }
        }

        /// <summary>PolyBLEP: smooths the jumps of a square or saw wave, as Web Audio's band-limited ones are.</summary>
        static double Blep(double t, double dt)
        {
            if (t < dt) { t /= dt; return t + t - t * t - 1; }
            if (t > 1 - dt) { t = (t - 1) / dt; return t * t + t + t + 1; }
            return 0;
        }

        static void Noise(double[] b, Filter filter, Func<double, double> freq, double q, Func<double, double> gain, double start, double stop)
        {
            var src = new double[b.Length];
            int from = (int)(start * rate), to = Math.Min(b.Length, (int)(stop * rate));
            for (int n = from; n < to; n++) src[n] = noiseDice.NextDouble() * 2 - 1;
            if (filter != Filter.None) Biquad(src, filter, freq, q);
            for (int n = from; n < to; n++) b[n] += src[n] * gain(n / (double)rate);
        }

        /// <summary>A biquad as Web Audio's (the RBJ cookbook), its frequency able to move.</summary>
        static void Biquad(double[] x, Filter filter, Func<double, double> freq, double q)
        {
            double x1 = 0, x2 = 0, y1 = 0, y2 = 0;
            for (int n = 0; n < x.Length; n++)
            {
                double w0 = 2 * Math.PI * Math.Min(freq(n / (double)rate), rate * 0.49) / rate;
                double cos = Math.Cos(w0), alpha = Math.Sin(w0) / (2 * q);
                double b0, b1, b2, a0 = 1 + alpha, a1 = -2 * cos, a2 = 1 - alpha;
                if (filter == Filter.BandPass) { b0 = alpha; b1 = 0; b2 = -alpha; }
                else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
                double y = (b0 * x[n] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
                x2 = x1; x1 = x[n]; y2 = y1; y1 = y;
                x[n] = y;
            }
        }
    }
}
