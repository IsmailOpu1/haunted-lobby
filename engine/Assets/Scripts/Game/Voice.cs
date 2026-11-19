using System;
using System.Collections;
using System.Collections.Generic;
using LiveKit;
using LiveKit.Proto;
using UnityEngine;
using Room = LiveKit.Room;
using RoomOptions = LiveKit.RoomOptions;

namespace Haunted.Game
{
    /// <summary>
    /// Proximity voice (GDD Section 13), as client/src/voice.ts does it in the browser. LiveKit
    /// carries the audio; the game server decides who receives whose voice (it subscribes us) and
    /// how loud ("voiceMix": volume, muffled, boost for a quiet mic). Each voice plays from where
    /// that player stands, muffled through walls.
    /// </summary>
    public class Voice
    {
        public enum State { Off, Connecting, On, NoMic, Failed }

        /// <summary>A wall between you: low-pass filter (as the browser).</summary>
        public const float MuffledHz = 900;
        public const float ClearHz = 20000;
        /// <summary>Changes glide instead of jumping: abrupt changes to a playing voice crackle.</summary>
        public const float GainSmoothingSec = 0.15f;

        public State Status { get; private set; } = State.Off;
        public event Action<State> StatusChanged;

        readonly MonoBehaviour host;
        readonly Transform parent;
        Room room;
        RtcAudioSource micSource;
        LocalAudioTrack micTrack;
        GameObject micObject;
        readonly Dictionary<string, Speaker> speakers = new Dictionary<string, Speaker>();
        Dictionary<string, float[]> mix = new Dictionary<string, float[]>();
        readonly HashSet<string> muted = new HashSet<string>();

        /// <summary>For unattended tests: publish a steady tone at this pitch instead of the microphone.</summary>
        public float TestToneHz;

        class Speaker
        {
            public GameObject Object;
            public AudioStream Stream;
            public VoiceShaper Shaper;
        }

        public Voice(MonoBehaviour host)
        {
            this.host = host;
            parent = new GameObject("Voices").transform;
        }

        /// <summary>Voices playing now (for tests and the HUD).</summary>
        public int SpeakerCount { get { return speakers.Count; } }

        /// <summary>How loud a speaker is right now as heard here (0..1 peak of the last audio block).</summary>
        public float HeardLevel(string id)
        {
            Speaker s;
            return speakers.TryGetValue(id, out s) ? s.Shaper.Level : 0;
        }

        void SetStatus(State state)
        {
            Status = state;
            Debug.Log("Voice: " + state);
            if (StatusChanged != null) StatusChanged(state);
        }

        public void Connect(string url, string token)
        {
            host.StartCoroutine(ConnectRoutine(url, token));
        }

        IEnumerator ConnectRoutine(string url, string token)
        {
            SetStatus(State.Connecting);
            room = new Room();
            room.TrackSubscribed += OnTrackSubscribed;
            room.TrackUnsubscribed += (track, publication, participant) => RemoveSpeaker(participant.Identity);
            room.ParticipantDisconnected += participant => RemoveSpeaker(participant.Identity);
            // The server subscribes us to nearby voices; we never pick them ourselves.
            var connect = room.Connect(url, token, new RoomOptions { AutoSubscribe = false, Dynacast = false, AdaptiveStream = false });
            yield return connect;
            if (connect.IsError)
            {
                SetStatus(State.Failed);
                yield break;
            }
            yield return PublishMicrophone();
        }

        IEnumerator PublishMicrophone()
        {
            micObject = new GameObject(TestToneHz > 0 ? "Test tone" : "Microphone");
            micObject.transform.SetParent(parent);
            if (TestToneHz > 0)
            {
                var source = micObject.AddComponent<AudioSource>();
                source.clip = Tone(TestToneHz);
                source.loop = true;
                micSource = new BasicAudioSource(source, RtcAudioSourceType.AudioSourceMicrophone);
            }
            else
            {
                if (Microphone.devices.Length == 0)
                {
                    SetStatus(State.NoMic);
                    yield break;
                }
                // As the browser: echo cancellation on so your speakers do not feed your mic; noise
                // suppression and automatic gain off, so whispers stay quiet and shouts stay loud
                // (the ghost hears your real voice).
                var processing = new AudioProcessingOptions { EchoCancellation = true, NoiseSuppression = false, AutoGainControl = false };
                micSource = new MicrophoneSource(Microphone.devices[0], micObject, processing);
            }
            // The mic meter (voice.ts micLevel): the loudness of what is sent, read as it is sent.
            micSource.AudioRead += (data, channels, rate) =>
            {
                double sum = 0;
                for (int i = 0; i < data.Length; i++) sum += data[i] * data[i];
                micRms = data.Length > 0 ? (float)Math.Sqrt(sum / data.Length) : 0;
            };
            micTrack = LocalAudioTrack.CreateAudioTrack("microphone", micSource, room);
            // A steady stream at a good speech bitrate: no gaps in quiet moments (no DTX).
            var options = new TrackPublishOptions
            {
                AudioEncoding = new AudioEncoding { MaxBitrate = 64000 },
                Dtx = false,
                Source = TrackSource.SourceMicrophone,
            };
            var publish = room.LocalParticipant.PublishTrack(micTrack, options);
            yield return publish;
            if (publish.IsError)
            {
                micSource.Dispose();
                micSource = null;
                SetStatus(State.NoMic);
                yield break;
            }
            micSource.Start();
            SetStatus(State.On);
        }

        /// <summary>A looping tone for tests: one second, so it loops without a click.</summary>
        static AudioClip Tone(float hz)
        {
            int rate = AudioSettings.outputSampleRate;
            var samples = new float[rate];
            for (int i = 0; i < rate; i++) samples[i] = 0.3f * Mathf.Sin(2 * Mathf.PI * Mathf.Round(hz) * i / rate);
            var clip = AudioClip.Create("tone", rate, 1, rate, false);
            clip.SetData(samples, 0);
            return clip;
        }

        void OnTrackSubscribed(IRemoteTrack track, RemoteTrackPublication publication, RemoteParticipant participant)
        {
            var audio = track as RemoteAudioTrack;
            if (audio == null) return;
            string id = participant.Identity;
            RemoveSpeaker(id);
            var obj = new GameObject("Voice " + id);
            obj.transform.SetParent(parent);
            var source = obj.AddComponent<AudioSource>();
            // Direction only: the server's mix sets the volume by distance, as in the browser.
            source.spatialBlend = 1;
            source.rolloffMode = AudioRolloffMode.Custom;
            source.SetCustomCurve(AudioSourceCurveType.CustomRolloff, AnimationCurve.Constant(0, 1, 1));
            source.maxDistance = 1000;
            source.dopplerLevel = 0;
            source.spread = 0;
            var stream = new AudioStream(audio, source);
            // Added after the stream's own reader, so it shapes the voice the stream writes.
            var shaper = obj.AddComponent<VoiceShaper>();
            speakers[id] = new Speaker { Object = obj, Stream = stream, Shaper = shaper };
            Debug.Log("Voice: hearing " + id);
        }

        void RemoveSpeaker(string id)
        {
            Speaker s;
            if (!speakers.TryGetValue(id, out s)) return;
            s.Stream.Dispose();
            UnityEngine.Object.Destroy(s.Object);
            speakers.Remove(id);
            Debug.Log("Voice: no longer hearing " + id);
        }

        /// <summary>Volumes from the server: [volume, muffled, boost] per speaker.</summary>
        public void SetMix(Dictionary<string, float[]> newMix)
        {
            mix = newMix;
        }

        /// <summary>Call every frame: places each voice where its player is and applies the server's volumes.</summary>
        public void Update(Func<string, Vector3?> positionOf)
        {
            foreach (var kv in speakers)
            {
                float[] m;
                float volume = 0, muffled = 0, boost = 1;
                if (mix.TryGetValue(kv.Key, out m) && m.Length >= 3) { volume = m[0]; muffled = m[1]; boost = m[2]; }
                if (muted.Contains(kv.Key)) volume = 0;
                kv.Value.Shaper.TargetGain = volume * boost;
                kv.Value.Shaper.TargetCutoffHz = muffled > 0 ? MuffledHz : ClearHz;
                var at = positionOf(kv.Key);
                if (at.HasValue) kv.Value.Object.transform.position = at.Value;
            }
        }

        /// <summary>Whether you have muted this player (the room page's Mute / Unmute).</summary>
        public bool IsMuted(string id) => muted.Contains(id);

        volatile float micRms;

        /// <summary>
        /// How loud your own microphone is, 0 to 1, as voice.ts micLevel: about -60..-10 dBFS onto
        /// 0..1, so normal talking fills about half the meter.
        /// </summary>
        public float MicLevel()
        {
            if (Status != State.On) return 0;
            float rms = micRms;
            float db = rms > 0 ? 20 * Mathf.Log10(rms) : -100;
            return Mathf.Clamp01((db + 60) / 50);
        }

        /// <summary>Mute or unmute one player, only for you. Returns whether they are now muted.</summary>
        public bool ToggleMute(string id)
        {
            if (!muted.Remove(id)) muted.Add(id);
            return muted.Contains(id);
        }

        public void Disconnect()
        {
            foreach (var id in new List<string>(speakers.Keys)) RemoveSpeaker(id);
            if (micSource != null) { micSource.Dispose(); micSource = null; }
            if (room != null) { room.Disconnect(); room = null; }
            SetStatus(State.Off);
        }
    }

    /// <summary>
    /// Shapes one voice on the audio thread: the server's volume (with a quiet mic's boost, which
    /// can go above 1, so it is not the AudioSource's volume) and the wall muffle, both gliding.
    /// </summary>
    public class VoiceShaper : MonoBehaviour
    {
        public volatile float TargetGain;
        public volatile float TargetCutoffHz = Voice.ClearHz;
        /// <summary>Peak of the last block after shaping (for tests).</summary>
        public volatile float Level;

        float gain, cutoff = Voice.ClearHz;
        float[] low = new float[8];
        int rate;

        void Awake()
        {
            rate = AudioSettings.outputSampleRate;
        }

        void OnAudioFilterRead(float[] data, int channels)
        {
            if (rate <= 0 || channels <= 0) return;
            if (low.Length < channels) low = new float[channels];
            float glide = 1 - Mathf.Exp(-1f / (rate * Voice.GainSmoothingSec));
            float peak = 0;
            for (int i = 0; i < data.Length; i += channels)
            {
                gain += (TargetGain - gain) * glide;
                cutoff += (TargetCutoffHz - cutoff) * glide;
                float a = 1 - Mathf.Exp(-2 * Mathf.PI * Mathf.Min(cutoff, rate * 0.45f) / rate);
                for (int c = 0; c < channels; c++)
                {
                    low[c] += (data[i + c] - low[c]) * a;
                    float v = low[c] * gain;
                    data[i + c] = v;
                    if (v > peak) peak = v; else if (-v > peak) peak = -v;
                }
            }
            Level = peak;
        }
    }
}
