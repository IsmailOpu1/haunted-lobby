using System;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The browser's 3D footsteps go through Web Audio's "HRTF" panner (audio.ts step); Unity has
    /// none, and its plain left-right panning gives the steps another sound and loudness. This uses
    /// the browser's own panner: its response from every direction, taken by tools/engine-hrtf.js
    /// (Resources/Data/hrtf.bytes, 48 kHz, every 5 degrees round and 7.5 degrees up). Each step is
    /// convolved with the response for where it is from your ears (blended between the four
    /// nearest), then played as a stereo sound at the distance gain the panner would give.
    /// </summary>
    public static class Hrtf
    {
        static bool loaded;
        static int rate, azimuths, elevations, taps;
        static float elevationMin, elevationStep;
        /// <summary>[elevation, azimuth, ear] responses, taps long.</summary>
        static float[][] responses;

        /// <summary>The responses are there (the file is in the build and at the game's rate).</summary>
        public static bool Ready
        {
            get
            {
                if (!loaded) Load();
                return responses != null;
            }
        }

        static void Load()
        {
            loaded = true;
            var file = Resources.Load<TextAsset>("Data/hrtf");
            if (file == null) { Debug.LogWarning("HRTF: no Data/hrtf (tools/engine-hrtf.js); steps panned plainly"); return; }
            var b = file.bytes;
            if (b.Length < 32 || b[0] != 'H' || b[1] != 'R' || b[2] != 'T' || b[3] != 'F') { Debug.LogWarning("HRTF: bad file"); return; }
            rate = BitConverter.ToInt32(b, 4);
            azimuths = BitConverter.ToInt32(b, 8);
            elevations = BitConverter.ToInt32(b, 12);
            elevationMin = BitConverter.ToSingle(b, 16);
            elevationStep = BitConverter.ToSingle(b, 20);
            taps = BitConverter.ToInt32(b, 24);
            float scale = BitConverter.ToSingle(b, 28);
            if (rate != AudioSettings.outputSampleRate)
            {
                Debug.LogWarning("HRTF: taken at " + rate + " Hz, the game runs at " + AudioSettings.outputSampleRate + "; steps panned plainly");
                return;
            }
            var all = new float[elevations * azimuths * 2][];
            int o = 32;
            for (int i = 0; i < all.Length; i++)
            {
                var r = new float[taps];
                for (int t = 0; t < taps; t++, o += 2) r[t] = BitConverter.ToInt16(b, o) / scale;
                all[i] = r;
            }
            responses = all;
        }

        /// <summary>
        /// The panner's angles for a sound at d (world space, from the ears): azimuth clockwise from
        /// straight ahead and elevation up from level, in degrees (Web Audio's azimuthElevation).
        /// The browser's listener faces where you look round, never up or down (audio.ts setListener).
        /// </summary>
        public static void Angles(Vector3 d, Vector3 look, out float azimuth, out float elevation)
        {
            var up = Vector3.up;
            var forward = new Vector3(look.x, 0, look.z).normalized;
            var right = Vector3.Cross(up, forward);
            float len = d.magnitude;
            if (len < 1e-4f) { azimuth = 0; elevation = 0; return; }
            var n = d / len;
            elevation = 90 - Mathf.Acos(Mathf.Clamp(Vector3.Dot(n, up), -1, 1)) * Mathf.Rad2Deg;
            var flat = n - up * Vector3.Dot(n, up);
            azimuth = flat.sqrMagnitude < 1e-8f ? 0 : Mathf.Atan2(Vector3.Dot(flat, right), Vector3.Dot(flat, forward)) * Mathf.Rad2Deg;
            if (azimuth < 0) azimuth += 360;
        }

        /// <summary>A mono sound as heard from this direction: a stereo clip (left, right interleaved).</summary>
        public static AudioClip Render(float[] mono, string name, float azimuth, float elevation)
        {
            // The response here, blended from the four nearest taken.
            float a = azimuth / (360f / azimuths);
            int a0 = (int)Mathf.Floor(a) % azimuths, a1 = (a0 + 1) % azimuths;
            float fa = a - Mathf.Floor(a);
            float e = Mathf.Clamp((elevation - elevationMin) / elevationStep, 0, elevations - 1);
            int e0 = Mathf.Min((int)e, elevations - 2), e1 = e0 + 1;
            float fe = e - e0;
            var ir = new float[2][];
            for (int ear = 0; ear < 2; ear++)
            {
                var h = new float[taps];
                Add(h, Response(e0, a0, ear), (1 - fe) * (1 - fa));
                Add(h, Response(e0, a1, ear), (1 - fe) * fa);
                Add(h, Response(e1, a0, ear), fe * (1 - fa));
                Add(h, Response(e1, a1, ear), fe * fa);
                ir[ear] = h;
            }
            int length = mono.Length + taps - 1;
            int n = 1;
            while (n < length) n <<= 1;
            var x = Spectrum(mono, n);
            var stereo = new float[length * 2];
            for (int ear = 0; ear < 2; ear++)
            {
                var h = Spectrum(ir[ear], n);
                var re = new float[n];
                var im = new float[n];
                for (int k = 0; k < n; k++)
                {
                    re[k] = x[0][k] * h[0][k] - x[1][k] * h[1][k];
                    im[k] = x[0][k] * h[1][k] + x[1][k] * h[0][k];
                }
                Fft(re, im, true);
                for (int i = 0; i < length; i++) stereo[i * 2 + ear] = re[i];
            }
            var clip = AudioClip.Create(name, length, 2, AudioSettings.outputSampleRate, false);
            clip.SetData(stereo, 0);
            return clip;
        }

        static float[] Response(int e, int a, int ear) { return responses[(e * azimuths + a) * 2 + ear]; }

        static void Add(float[] into, float[] r, float w)
        {
            if (w == 0) return;
            for (int i = 0; i < into.Length; i++) into[i] += r[i] * w;
        }

        static float[][] Spectrum(float[] x, int n)
        {
            var re = new float[n];
            var im = new float[n];
            Array.Copy(x, re, Math.Min(x.Length, n));
            Fft(re, im, false);
            return new[] { re, im };
        }

        /// <summary>In-place radix-2 FFT; the inverse is scaled by 1/n.</summary>
        static void Fft(float[] re, float[] im, bool inverse)
        {
            int n = re.Length;
            for (int i = 1, j = 0; i < n; i++)
            {
                int bit = n >> 1;
                for (; (j & bit) != 0; bit >>= 1) j ^= bit;
                j ^= bit;
                if (i < j)
                {
                    float t = re[i]; re[i] = re[j]; re[j] = t;
                    t = im[i]; im[i] = im[j]; im[j] = t;
                }
            }
            for (int len = 2; len <= n; len <<= 1)
            {
                double angle = 2 * Math.PI / len * (inverse ? 1 : -1);
                double wr = Math.Cos(angle), wi = Math.Sin(angle);
                for (int i = 0; i < n; i += len)
                {
                    double cr = 1, ci = 0;
                    for (int k = 0; k < len / 2; k++)
                    {
                        int p = i + k, q = i + k + len / 2;
                        float ur = re[p], ui = im[p];
                        float vr = (float)(re[q] * cr - im[q] * ci), vi = (float)(re[q] * ci + im[q] * cr);
                        re[p] = ur + vr; im[p] = ui + vi;
                        re[q] = ur - vr; im[q] = ui - vi;
                        double nr = cr * wr - ci * wi;
                        ci = cr * wi + ci * wr;
                        cr = nr;
                    }
                }
            }
            if (inverse)
                for (int i = 0; i < n; i++) { re[i] /= n; im[i] /= n; }
        }
    }
}
