using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// Test aid for step D4 (-soundTest DIR): records what you hear and plays a fixed list of the
    /// game's sounds, so their levels can be set beside the browser's (the same list played there
    /// from the console). First the ambience alone, then, with the loops silenced, each sound by
    /// itself two seconds apart, placed from your ears the same way. Writes DIR/unity-sound.wav
    /// (32-bit float, stereo, the mix as it leaves Unity) and DIR/unity-sound.txt (each sound's
    /// start in the recording), then quits.
    /// </summary>
    public class SoundTest
    {
        /// <summary>Seconds of ambience alone (after its fade-in), then the gap between sounds.</summary>
        public const double AmbienceSec = 12, GapSec = 2;
        const float EarsOverFloorM = 1.6f;

        readonly string dir;
        double startAt = -1;
        int next;
        SoundRecorder recorder;
        readonly List<string> log = new List<string>();

        /// <summary>-recordSound DIR: only record, the whole run as it plays (saved as DIR/night-sound.wav on quitting).</summary>
        readonly bool recordOnly;
        public bool RecordOnly { get { return recordOnly; } }

        public SoundTest(string dir, bool recordOnly = false)
        {
            this.dir = dir;
            this.recordOnly = recordOnly;
        }

        /// <summary>The sounds, in order: a name, and how to play it from these ears (facing forward, right).</summary>
        static readonly List<KeyValuePair<string, Action<HouseSounds, Vector3, Vector3, Vector3>>> Sounds = new List<KeyValuePair<string, Action<HouseSounds, Vector3, Vector3, Vector3>>>
        {
            Entry("own-walk", (h, e, f, r) => TaskSounds.Step("walk", null)),
            Entry("own-run", (h, e, f, r) => TaskSounds.Step("run", null)),
            Entry("own-crouch", (h, e, f, r) => TaskSounds.Step("crouch", null)),
            Entry("walk-3m-ahead", (h, e, f, r) => TaskSounds.Step("walk", Floor(e) + f * 3)),
            Entry("walk-3m-right", (h, e, f, r) => TaskSounds.Step("walk", Floor(e) + r * 3)),
            Entry("walk-8m-ahead", (h, e, f, r) => TaskSounds.Step("walk", Floor(e) + f * 8)),
            Entry("ghost-5m-ahead", (h, e, f, r) => TaskSounds.Step("ghost", Floor(e) + f * 5)),
            Entry("creak1-5m-ahead", (h, e, f, r) => h.Creak(e, 0, Angle(f), 5, 0.4f, 1)),
            Entry("creak4-4m-right", (h, e, f, r) => h.Creak(e, 3, Angle(r), 4, 0.4f, 1)),
            Entry("creak2-8m-ahead-fast", (h, e, f, r) => h.Creak(e, 1, Angle(f), 8, 0.55f, 1.12f)),
            Entry("bell-6m-ahead", (h, e, f, r) => TaskSounds.PlayAt("bell", Floor(e) + f * 6, 4, 1)),
            Entry("own-tick", (h, e, f, r) => TaskSounds.Play("tick")),
            Entry("own-beat", (h, e, f, r) => TaskSounds.PlayScaled("beat", 0.6f)),
        };

        static KeyValuePair<string, Action<HouseSounds, Vector3, Vector3, Vector3>> Entry(string name, Action<HouseSounds, Vector3, Vector3, Vector3> play)
        {
            return new KeyValuePair<string, Action<HouseSounds, Vector3, Vector3, Vector3>>(name, play);
        }

        static Vector3 Floor(Vector3 ears) { return ears - Vector3.up * EarsOverFloorM; }

        /// <summary>HouseSounds places a creak at (cos a, sin a) on the ground: the angle that points along dir.</summary>
        static float Angle(Vector3 dir) { return Mathf.Atan2(dir.z, dir.x); }

        public void Frame(double now, Transform ears, HouseSounds house)
        {
            if (recordOnly)
            {
                if (recorder != null) return;
                recorder = ears.gameObject.AddComponent<SoundRecorder>();
                Application.quitting += () =>
                {
                    Directory.CreateDirectory(dir);
                    recorder.Save(Path.Combine(dir, "night-sound.wav"));
                };
                Debug.Log("Recording sound from " + now.ToString("0.0", CultureInfo.InvariantCulture));
                return;
            }
            if (startAt < 0)
            {
                // Once the ambience has faded in, with nothing of its own playing.
                house.Scripted = true;
                TaskSounds.FixedStepVariant = true;
                recorder = ears.gameObject.AddComponent<SoundRecorder>();
                startAt = now;
                log.Add("rate " + AudioSettings.outputSampleRate);
                log.Add("ambience 0");
                return;
            }
            double t = now - startAt;
            if (t >= AmbienceSec && !house.AmbienceMuted) house.AmbienceMuted = true;
            double due = AmbienceSec + GapSec * (next + 1);
            if (next < Sounds.Count && t >= due)
            {
                var fwd = ears.forward; fwd.y = 0; fwd.Normalize();
                var right = Vector3.Cross(Vector3.up, fwd);
                Sounds[next].Value(house, ears.position, fwd, right);
                log.Add(Sounds[next].Key + " " + recorder.Seconds.ToString("0.000", CultureInfo.InvariantCulture));
                next++;
            }
            else if (next >= Sounds.Count && t >= due + GapSec)
            {
                Directory.CreateDirectory(dir);
                recorder.Save(Path.Combine(dir, "unity-sound.wav"));
                File.WriteAllLines(Path.Combine(dir, "unity-sound.txt"), log);
                Debug.Log("Sound test written to " + dir);
                Application.Quit();
                next = int.MaxValue / 2;
            }
        }
    }

    /// <summary>Keeps the mix as it leaves the listener (put on the AudioListener's object).</summary>
    public class SoundRecorder : MonoBehaviour
    {
        readonly List<float> samples = new List<float>();
        int channels = 2, rate;
        readonly object gate = new object();

        void Awake() { rate = AudioSettings.outputSampleRate; }

        /// <summary>How far into the recording it is, in seconds.</summary>
        public double Seconds { get { lock (gate) return samples.Count / (double)Math.Max(1, channels) / Math.Max(1, rate); } }

        void OnAudioFilterRead(float[] data, int count)
        {
            lock (gate)
            {
                channels = count;
                samples.AddRange(data);
            }
        }

        public void Save(string path)
        {
            float[] all;
            lock (gate) all = samples.ToArray();
            using (var w = new BinaryWriter(File.Create(path)))
            {
                int bytes = all.Length * 4;
                w.Write(new[] { (byte)'R', (byte)'I', (byte)'F', (byte)'F' });
                w.Write(36 + bytes);
                w.Write(new[] { (byte)'W', (byte)'A', (byte)'V', (byte)'E', (byte)'f', (byte)'m', (byte)'t', (byte)' ' });
                w.Write(16);
                w.Write((short)3);
                w.Write((short)channels);
                w.Write(rate);
                w.Write(rate * channels * 4);
                w.Write((short)(channels * 4));
                w.Write((short)32);
                w.Write(new[] { (byte)'d', (byte)'a', (byte)'t', (byte)'a' });
                w.Write(bytes);
                foreach (var v in all) w.Write(v);
            }
        }
    }
}
