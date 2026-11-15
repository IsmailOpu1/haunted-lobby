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

        public static void Play(string kind, int pitch = -1)
        {
            if (flat == null)
            {
                var go = new GameObject("Task sounds");
                UnityEngine.Object.DontDestroyOnLoad(go);
                flat = go.AddComponent<AudioSource>();
                flat.spatialBlend = 0;
            }
            flat.PlayOneShot(Clip(kind, pitch));
        }

        /// <summary>A sound from a point on the floor (world space); it is heard 1 m up, as the browser's.</summary>
        public static void PlayAt(string kind, Vector3 floor)
        {
            var clip = Clip(kind, -1);
            var go = new GameObject("Task sound");
            go.transform.position = floor + Vector3.up;
            var s = go.AddComponent<AudioSource>();
            s.clip = clip;
            s.spatialBlend = 1;
            s.dopplerLevel = 0;
            s.rolloffMode = AudioRolloffMode.Custom;
            var curve = new AnimationCurve();
            for (float d = 0; d <= MAX_DISTANCE_M; d += 0.5f) curve.AddKey(d / MAX_DISTANCE_M, REF_DISTANCE_M / Mathf.Max(REF_DISTANCE_M, d));
            s.SetCustomCurve(AudioSourceCurveType.CustomRolloff, curve);
            s.maxDistance = MAX_DISTANCE_M;
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
