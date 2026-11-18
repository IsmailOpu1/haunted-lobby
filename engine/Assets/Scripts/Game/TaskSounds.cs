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
        /// <summary>Silence before each made sound (5.3 ms at 48 kHz): see Clip.</summary>
        const int LeadSamples = 256;
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

        /// <summary>
        /// audio.ts MASTER_LEVEL: every game sound (not the voices) goes through it in the browser.
        /// </summary>
        public const float MasterLevel = 0.8f;

        /// <summary>The placed sounds still playing, with their own loudness before the master.</summary>
        static readonly List<KeyValuePair<AudioSource, float>> placed = new List<KeyValuePair<AudioSource, float>>();
        static float level = 1;

        /// <summary>What a game sound is multiplied by now: the master, and the pre-hunt silence.</summary>
        public static float Out { get { return level * MasterLevel; } }

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
                if (flat != null) flat.volume = Out;
                placed.RemoveAll(x => x.Key == null);
                foreach (var x in placed) x.Key.volume = x.Value * Out;
            }
        }

        /// <summary>One of your own sounds at a volume (a heartbeat's strength).</summary>
        public static void PlayScaled(string kind, float volume)
        {
            Play(kind, -1, false);
            flat.PlayOneShot(BothEars(Clip(kind, -1)), volume);
        }

        /// <summary>A sound that loops for as long as it plays, silent until its volume is raised.</summary>
        public static AudioSource Loop(string kind)
        {
            var go = new GameObject("Loop " + kind);
            UnityEngine.Object.DontDestroyOnLoad(go);
            var s = go.AddComponent<AudioSource>();
            s.clip = BothEars(Clip(kind, -1));
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
                flat.volume = Out;
            }
            if (sound) flat.PlayOneShot(BothEars(Clip(kind, pitch)));
        }

        /// <summary>
        /// One footstep (audio.ts step): with a place it comes from there (inverse rolloff from 1.5 m,
        /// factor 1.3; a crawl's drag 0.2 m up), without one it is your own, in your ears. delaySec
        /// puts it that far ahead (the phantom steps' spacing).
        /// </summary>
        public static void Step(string kind, Vector3? at, double delaySec = 0)
        {
            // Each step is a little different: one of StepVariants clips made with audio.ts's 0.85-1.15 spread.
            var clip = Clip("step:" + kind + ":" + (FixedStepVariant ? StepVariants / 2 : noiseDice.Next(StepVariants)), -1);
            if (at.HasValue)
            {
                var from = at.Value + Vector3.up * (kind == "crawl" ? 0.2f : 0);
                if (Ears != null && Hrtf.Ready) PlayHrtf(clip, from, delaySec);
                else PlayClipAt(clip, from, STEP_REF_M, STEP_ROLLOFF, 1, 1, delaySec);
                return;
            }
            Play("", -1, false);
            flat.PlayOneShot(BothEars(clip));
        }

        /// <summary>A sound from a point on the floor (world space); it is heard 1 m up, as the browser's.</summary>
        public static void PlayAt(string kind, Vector3 floor) { PlayAt(kind, floor, REF_DISTANCE_M, 1); }

        /// <summary>Where you hear from (the camera): set each frame by the game.</summary>
        public static Transform Ears;

        static readonly Dictionary<AudioClip, float[]> monoData = new Dictionary<AudioClip, float[]>();

        /// <summary>
        /// A step through the browser's HRTF panner (Hrtf): heard from where it is, at the panner's
        /// distance gain (inverse from 1.5 m, factor 1.3), as a stereo sound in your ears.
        /// </summary>
        static void PlayHrtf(AudioClip clip, Vector3 at, double delaySec)
        {
            if (!monoData.TryGetValue(clip, out var mono))
            {
                mono = new float[clip.samples];
                clip.GetData(mono, 0);
                monoData[clip] = mono;
            }
            var d = at - Ears.position;
            Hrtf.Angles(d, Ears.forward, out float azimuth, out float elevation);
            float dist = d.magnitude;
            float gain = STEP_REF_M / (STEP_REF_M + STEP_ROLLOFF * (Mathf.Max(dist, STEP_REF_M) - STEP_REF_M));
            var heard = Hrtf.Render(mono, clip.name, azimuth, elevation);
            var go = new GameObject("Step " + clip.name);
            var s = go.AddComponent<AudioSource>();
            s.clip = heard;
            s.spatialBlend = 0;
            s.volume = gain * Out;
            placed.Add(new KeyValuePair<AudioSource, float>(s, gain));
            if (delaySec > 0) s.PlayScheduled(AudioSettings.dspTime + delaySec);
            else s.Play();
            float life = (float)delaySec + heard.length + 0.1f;
            UnityEngine.Object.Destroy(go, life);
            UnityEngine.Object.Destroy(heard, life + 0.1f);
        }

        /// <summary>A sound from a point (world space), lifted by up metres, with inverse rolloff from refM.</summary>
        public static void PlayAt(string kind, Vector3 floor, float refM, float up)
        {
            PlayClipAt(Clip(kind, -1), floor + Vector3.up * up, refM, 1, 1, 1, 0);
        }

        /// <summary>
        /// A clip from a point (world space), as a Web Audio panner with the "inverse" distance model
        /// gives it: refM / (refM + rolloff * (max(d, refM) - refM)). volume is its own loudness
        /// (before the master), pitch its playback rate.
        /// </summary>
        public static void PlayClipAt(AudioClip clip, Vector3 at, float refM, float rolloff, float volume, float pitch, double delaySec)
        {
            var go = new GameObject("Sound " + clip.name);
            go.transform.position = at;
            var s = go.AddComponent<AudioSource>();
            s.clip = clip;
            s.spatialBlend = 1;
            s.dopplerLevel = 0;
            s.spread = 0;
            s.rolloffMode = AudioRolloffMode.Custom;
            s.SetCustomCurve(AudioSourceCurveType.CustomRolloff, Rolloff(refM, rolloff));
            s.maxDistance = MAX_DISTANCE_M;
            s.pitch = pitch;
            s.volume = volume * Out;
            placed.Add(new KeyValuePair<AudioSource, float>(s, volume));
            if (delaySec > 0) s.PlayScheduled(AudioSettings.dspTime + delaySec);
            else s.Play();
            UnityEngine.Object.Destroy(go, (float)delaySec + clip.length / Mathf.Max(0.01f, pitch) + 0.1f);
        }

        static readonly Dictionary<long, AnimationCurve> curves = new Dictionary<long, AnimationCurve>();

        /// <summary>Web Audio's inverse distance model as a Unity rolloff curve (out to MAX_DISTANCE_M, then held).</summary>
        static AnimationCurve Rolloff(float refM, float rolloff)
        {
            long key = ((long)Mathf.RoundToInt(refM * 1000) << 32) | (uint)Mathf.RoundToInt(rolloff * 1000);
            if (curves.TryGetValue(key, out var curve)) return curve;
            curve = new AnimationCurve();
            for (float d = 0; d <= MAX_DISTANCE_M; d += 0.25f)
                curve.AddKey(d / MAX_DISTANCE_M, refM / (refM + rolloff * (Mathf.Max(d, refM) - refM)));
            curves[key] = curve;
            return curve;
        }

        static readonly Dictionary<AudioClip, AudioClip> bothEars = new Dictionary<AudioClip, AudioClip>();

        /// <summary>
        /// A mono clip as two channels. The browser plays a mono sound into both ears at full level;
        /// Unity plays a mono clip in 2D at -3 dB each side (measured: the ambience 3.1 dB under), so
        /// the sounds in your ears are given to it as stereo.
        /// </summary>
        public static AudioClip BothEars(AudioClip mono)
        {
            if (mono.channels != 1) return mono;
            if (bothEars.TryGetValue(mono, out var stereo)) return stereo;
            var data = new float[mono.samples];
            mono.GetData(data, 0);
            var two = new float[data.Length * 2];
            for (int i = 0; i < data.Length; i++) two[i * 2] = two[i * 2 + 1] = data[i];
            stereo = AudioClip.Create(mono.name + " (both ears)", mono.samples, 2, mono.frequency, false);
            stereo.SetData(two, 0);
            bothEars[mono] = stereo;
            return stereo;
        }

        static AudioClip Clip(string kind, int pitch)
        {
            if (kind != "note") pitch = 0;
            int step = PIANO_SCALE[Math.Max(0, pitch) % PIANO_SCALE.Length];
            string key = kind.StartsWith("step:", StringComparison.Ordinal) ? kind : kind + ":" + step;
            AudioClip clip;
            if (clips.TryGetValue(key, out clip)) return clip;
            if (rate == 0) rate = AudioSettings.outputSampleRate;
            var buf = kind.StartsWith("step:", StringComparison.Ordinal) ? MakeStep(kind) : Make(kind, step);
            // Unity fades every sound in over its first 64 samples or so (against clicks), which ate a
            // third of a tick (its loudness is in its first millisecond); a short silence takes the fade.
            // Not for the loop, which would then have a gap.
            int lead = kind == "pulse" ? 0 : LeadSamples;
            clip = AudioClip.Create(key, buf.Length + lead, 1, rate, false);
            var data = new float[buf.Length + lead];
            for (int i = 0; i < buf.Length; i++) data[lead + i] = (float)Math.Max(-1, Math.Min(1, buf[i]));
            clip.SetData(data, 0);
            clips[key] = clip;
            return clip;
        }

        // ---------- Footsteps (audio.ts STEP_SOUNDS and step) ----------

        const float STEP_REF_M = 1.5f, STEP_ROLLOFF = 1.3f;
        /// <summary>How many slightly different clips each kind of step has (audio.ts varies every step); odd, so the middle one is unvaried.</summary>
        const int StepVariants = 9;
        /// <summary>Test aid (-soundTest): every step the unvaried middle clip, as the browser's with Math.random at 0.5.</summary>
        public static bool FixedStepVariant;

        /// <summary>
        /// audio.ts STEP_SOUNDS: gain, the low body's pitch (thudHz) and share (thudMix), the tap's
        /// band (noiseHz, q) and length. Player steps are mostly tap, above the heartbeat; the
        /// ghost's are heavy stomps.
        /// </summary>
        static readonly Dictionary<string, double[]> StepSounds = new Dictionary<string, double[]>
        {
            { "walk", new[] { 0.3, 130, 0.25, 1100, 1.4, 0.06 } },
            { "run", new[] { 0.4, 140, 0.3, 1300, 1.2, 0.05 } },
            { "crouch", new[] { 0.08, 120, 0.2, 1000, 1.4, 0.05 } },
            { "crawl", new[] { 0.14, 90, 0.1, 600, 0.7, 0.28 } },
            { "ghost", new[] { 0.9, 45, 0.6, 260, 0.9, 0.22 } },
        };

        /// <summary>"step:kind:n": the step at the n-th of StepVariants spreads between 0.85 and 1.15.</summary>
        static double[] MakeStep(string key)
        {
            var parts = key.Split(':');
            var p = StepSounds[parts[1]];
            double gain = p[0], thudHz = p[1], thudMix = p[2], noiseHz = p[3], q = p[4], sec = p[5];
            double vary = 0.85 + 0.3 * (int.Parse(parts[2]) + 0.5) / StepVariants;
            var b = New(sec * 2);
            // The body: a short sine that drops in pitch.
            double body = gain * thudMix * vary;
            Osc(b, Wave.Sine, Exp(thudHz * vary, thudHz * 0.6, 0, sec), t => t < 0.006 ? ExpAt(0.0001, body, 0, 0.006, t) : ExpAt(body, 0.0001, 0.006, sec * 1.6, t), 0, sec * 2);
            // The tap: band-passed noise, like a shoe on old boards, driven harder for what the band-pass keeps.
            double tap = gain * (1 - thudMix) * 1.6 * vary;
            Noise(b, Filter.BandPass, Fixed(noiseHz * vary), q, t => t < 0.004 ? ExpAt(0.0001, tap, 0, 0.004, t) : ExpAt(tap, 0.0001, 0.004, sec, t), 0, sec + 0.05);
            return b;
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
                    // Muffled through a low-pass at HEARTBEAT_LOWPASS_HZ (Web Audio's default Q, 1 dB),
                    // then shaped.
                    var b = New(0.3);
                    Osc(b, Wave.Sine, Exp(52, 34, 0, 0.2), t => 1, 0, 0.3);
                    Biquad(b, Filter.LowPass, Fixed(110), Math.Pow(10, 1 / 20.0));
                    for (int n = 0; n < b.Length; n++)
                    {
                        double t = n / (double)rate;
                        b[n] *= t < 0.025 ? ExpAt(0.0001, 1, 0, 0.025, t) : ExpAt(1, 0.0001, 0.025, 0.25, t);
                    }
                    return b;
                }
                case "pulse":
                {
                    // The hunt pulse (audio.ts): a deep 46 Hz sine whose loudness wobbles at 1.2 Hz; 5 s loops cleanly.
                    var b = New(5);
                    Osc(b, Wave.Sine, Fixed(46), t => 0.6 + 0.4 * Math.Sin(2 * Math.PI * 1.2 * t), 0, 5);
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
        enum Filter { None, BandPass, HighPass, LowPass }

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
                else if (filter == Filter.LowPass) { b0 = (1 - cos) / 2; b1 = 1 - cos; b2 = (1 - cos) / 2; }
                else { b0 = (1 + cos) / 2; b1 = -(1 + cos); b2 = (1 + cos) / 2; }
                double y = (b0 * x[n] + b1 * x1 + b2 * x2 - a1 * y1 - a2 * y2) / a0;
                x2 = x1; x1 = x[n]; y2 = y1; y1 = y;
                x[n] = y;
            }
        }
    }
}
