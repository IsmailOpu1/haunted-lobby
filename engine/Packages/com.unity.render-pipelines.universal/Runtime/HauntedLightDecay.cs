using System.Collections.Generic;

namespace UnityEngine.Rendering.Universal
{
    /// <summary>
    /// Haunted Lobby (see HAUNTED-PATCHES.md): how fast each light fades with distance, as three.js's
    /// light.decay: 1 / d^decay, then URP's own fade to nothing at its range (the same as three's).
    /// Unity's lights are all 2 (inverse square); the browser's torch is 1.2 and its camera flash 1.5.
    /// Read as each frame's lights are set up (InitializeLightConstants_Common) and sent to the
    /// shaders in the y of the light's distance attenuation (RealtimeLights.hlsl DistanceAttenuation).
    /// </summary>
    public static class HauntedLightDecay
    {
        /// <summary>Unity's own: inverse square.</summary>
        public const float Default = 2;

        static readonly Dictionary<Light, float> decays = new Dictionary<Light, float>();
        static readonly List<Light> prune = new List<Light>();

        /// <summary>Sets a light's decay; Default (2) forgets it.</summary>
        public static void Set(Light light, float decay)
        {
            if (light == null) return;
            // Forget lights destroyed since (flashes, players who left).
            prune.Clear();
            foreach (var l in decays.Keys) if (l == null) prune.Add(l);
            foreach (var l in prune) decays.Remove(l);
            if (decay == Default) decays.Remove(light);
            else decays[light] = decay;
        }

        /// <summary>The light's decay: 2 unless set.</summary>
        public static float Of(Light light)
        {
            if (light == null || decays.Count == 0) return Default;
            return decays.TryGetValue(light, out float decay) ? decay : Default;
        }
    }
}
