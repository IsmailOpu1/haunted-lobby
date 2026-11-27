using System;
using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The hotel's own sounds, as client/src/audio.ts plays them (GDD 23): the ambience (an old
    /// room's tone, a distant low rumble and wind behind the walls, far below the footsteps), the
    /// house creaking somewhere near you now and then, a few distant steps that belong to no one,
    /// and the footsteps that are the game's real background: yours, and others' from where they
    /// are (game.ts playFootsteps). The recordings come from tools/engine-rooms.ts (Resources/Sounds);
    /// if they are missing the game goes without them, as the browser does.
    /// </summary>
    public class HouseSounds
    {
        // audio.ts AMBIENCE_LOOPS and AMBIENCE_FADE_IN_SEC.
        static readonly string[] LoopFiles = { "room-tone", "rumble", "wind" };
        static readonly float[] LoopGains = { 0.05f, 0.05f, 0.035f };
        const float FadeInSec = 4;
        // audio.ts: the creaks.
        static readonly string[] CreakFiles = { "creak-1", "creak-2", "creak-3", "creak-4", "creak-5" };
        const double CreakMinGapSec = 12, CreakMaxGapSec = 35;
        const float CreakMinM = 3, CreakMaxM = 9, CreakMinGain = 0.25f, CreakMaxGain = 0.55f, CreakMinRate = 0.85f, CreakMaxRate = 1.12f;
        /// <summary>audio.ts: a creak is in the floor or the walls round you, placed 0.5 m up, heard by inverse rolloff from 2 m.</summary>
        const float CreakUpM = 0.5f, CreakRefM = 2;
        // audio.ts: the phantom footsteps.
        const double PhantomMinGapSec = 30, PhantomMaxGapSec = 60, PhantomStepSec = 0.55;
        const float PhantomMinM = 10, PhantomMaxM = 16, PhantomStrideM = 0.7f;
        /// <summary>audio.ts: the floor under your ears (creaks and phantom steps are placed from it).</summary>
        const float EarsOverFloorM = 1.6f;
        /// <summary>audio.ts: the master gain glides (setTargetAtTime): 0.05 s, or 0.02 s as a hunt starts.</summary>
        const float MasterGlideSec = 0.05f, HuntGlideSec = 0.02f;

        readonly System.Random dice = new System.Random();
        readonly AudioSource[] loops = new AudioSource[3];
        readonly AudioClip[] creaks;
        readonly double walkMps, runMps;
        readonly double started;
        double nextCreakAt, nextPhantomAt;
        float master = TaskSounds.MasterLevel;

        readonly StepTracker mySteps = new StepTracker();
        readonly Dictionary<string, StepTracker> theirSteps = new Dictionary<string, StepTracker>();

        /// <summary>Test aid (-soundTest): the loops alone can be silenced, to hear the rest by itself.</summary>
        public bool AmbienceMuted;
        /// <summary>Test aid (-soundTest): no creaks or distant steps of their own, only those asked for.</summary>
        public bool Scripted;

        public HouseSounds(object config, double now)
        {
            var movement = Json.Obj(config, "movement");
            walkMps = Json.Num(movement, "walk");
            runMps = Json.Num(movement, "run");
            started = now;
            nextCreakAt = now + Between(CreakMinGapSec, CreakMaxGapSec);
            nextPhantomAt = now + Between(PhantomMinGapSec, PhantomMaxGapSec);
            var root = new GameObject("House sounds");
            UnityEngine.Object.DontDestroyOnLoad(root);
            for (int i = 0; i < LoopFiles.Length; i++)
            {
                var clip = Resources.Load<AudioClip>("Sounds/" + LoopFiles[i]);
                if (clip == null) { Debug.LogWarning("House sounds: no " + LoopFiles[i] + " (run tools/engine-rooms.ts --sounds)"); continue; }
                var go = new GameObject("Ambience " + LoopFiles[i]);
                go.transform.SetParent(root.transform, false);
                var s = go.AddComponent<AudioSource>();
                s.clip = TaskSounds.BothEars(clip);
                s.loop = true;
                s.spatialBlend = 0;
                s.volume = 0;
                // Each loop starts at a different point, so their seams never line up.
                s.timeSamples = dice.Next(s.clip.samples);
                s.Play();
                loops[i] = s;
            }
            creaks = new AudioClip[CreakFiles.Length];
            for (int i = 0; i < CreakFiles.Length; i++) creaks[i] = Resources.Load<AudioClip>("Sounds/" + CreakFiles[i]);
        }

        double Between(double a, double b) { return a + dice.NextDouble() * (b - a); }
        float Between(float a, float b) { return a + (float)dice.NextDouble() * (b - a); }

        /// <summary>
        /// Each frame: the loops' level (fading in, and dropping out with everything else in the
        /// pre-hunt silence), and now and then a creak or distant steps round your ears.
        /// </summary>
        public void Update(double now, float dt, Vector3 ears, bool silent, bool hunting)
        {
            float want = TaskSounds.Out;
            float glide = want > master && hunting ? HuntGlideSec : MasterGlideSec;
            master += (want - master) * (1 - Mathf.Exp(-dt / glide));
            float fade = Mathf.Clamp01((float)(now - started) / FadeInSec);
            for (int i = 0; i < loops.Length; i++)
                if (loops[i] != null) loops[i].volume = AmbienceMuted ? 0 : LoopGains[i] * fade * master;
            if (Scripted) return;

            // Now and then the old house creaks somewhere near you, never in the pre-hunt silence.
            if (now >= nextCreakAt)
            {
                nextCreakAt = now + Between(CreakMinGapSec, CreakMaxGapSec);
                if (!silent)
                    Creak(ears, dice.Next(CreakFiles.Length), Between(0, Mathf.PI * 2), Between(CreakMinM, CreakMaxM), Between(CreakMinGain, CreakMaxGain), Between(CreakMinRate, CreakMaxRate));
            }
            // Now and then, a few steps somewhere in the dark that belong to no one.
            if (now >= nextPhantomAt)
            {
                nextPhantomAt = now + Between(PhantomMinGapSec, PhantomMaxGapSec);
                if (!hunting && !silent)
                    PhantomSteps(ears, Between(0, Mathf.PI * 2), Between(PhantomMinM, PhantomMaxM), Between(0, Mathf.PI * 2), 3 + dice.Next(4));
            }
        }

        /// <summary>One creak: file index, direction (radians) and distance from your ears, its own gain and playback rate.</summary>
        public void Creak(Vector3 ears, int index, float angle, float distM, float gain, float rate)
        {
            var clip = creaks[index];
            if (clip == null) return;
            var at = new Vector3(ears.x + Mathf.Cos(angle) * distM, ears.y - EarsOverFloorM + CreakUpM, ears.z + Mathf.Sin(angle) * distM);
            TaskSounds.PlayClipAt(clip, at, CreakRefM, 1, gain, rate, 0);
            Debug.Log("Creak " + CreakFiles[index] + " " + distM.ToString("0.0") + " m away, gain " + gain.ToString("0.00") + ", rate " + rate.ToString("0.00"));
        }

        /// <summary>A few distant walking steps, starting this far off in this direction and heading another way.</summary>
        public void PhantomSteps(Vector3 ears, float angle, float distM, float heading, int count)
        {
            float x = ears.x + Mathf.Cos(angle) * distM, z = ears.z + Mathf.Sin(angle) * distM;
            Debug.Log("Distant steps: " + count + ", " + distM.ToString("0.0") + " m away");
            for (int i = 0; i < count; i++)
            {
                // At about your floor: your ears are above it.
                TaskSounds.Step("walk", new Vector3(x, ears.y - EarsOverFloorM, z), i * PhantomStepSec);
                x += Mathf.Cos(heading) * PhantomStrideM;
                z += Mathf.Sin(heading) * PhantomStrideM;
            }
        }

        /// <summary>Your own steps, in your ears; none while you hide or are dead (game.ts playFootsteps).</summary>
        public void MySteps(float dt, Vector3 ears, bool walking, bool crouching, bool downed)
        {
            if (!walking) { mySteps.Reset(); return; }
            string kind = StepTracker.PlayerKind(mySteps.Speed, crouching, downed, walkMps, runMps);
            if (mySteps.Update(ears.x, ears.z, dt, kind)) TaskSounds.Step(kind, null);
        }

        /// <summary>One other player's steps, from where they are drawn (their feet); none while hidden or dead.</summary>
        public void TheirSteps(string id, float dt, Vector3 feet, bool crouching, string health, bool hidden)
        {
            if (!theirSteps.TryGetValue(id, out var tracker)) theirSteps[id] = tracker = new StepTracker();
            if (hidden || health == "dead") { tracker.Reset(); return; }
            string kind = StepTracker.PlayerKind(tracker.Speed, crouching, health == "downed", walkMps, runMps);
            if (tracker.Update(feet.x, feet.z, dt, kind)) TaskSounds.Step(kind, feet);
        }

        /// <summary>Forgets the steps of players no longer in view.</summary>
        public void KeepOnly(IEnumerable<string> inView)
        {
            var ids = new HashSet<string>(inView);
            var gone = new List<string>();
            foreach (var id in theirSteps.Keys) if (!ids.Contains(id)) gone.Add(id);
            foreach (var id in gone) theirSteps.Remove(id);
        }
    }
}
