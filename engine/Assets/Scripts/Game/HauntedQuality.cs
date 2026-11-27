using System;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Haunted.Game
{
    /// <summary>
    /// The browser's two graphics levels (client/src/post.ts, game.ts applyQuality), step D2 of
    /// docs/plans/engine-port.md. High: full size and ambient occlusion (HauntedAO). Low: at most 720
    /// lines, scaled up; no ambient occlusion; glass drawn plain (DressedRooms); big textures at the
    /// 1K set's size; the lighter copies of the most detailed pieces. Looks only, so not game numbers.
    /// </summary>
    public static class HauntedQuality
    {
        public enum Level { High, Low }

        /// <summary>post.ts LOW_LINES: Low draws this many lines high and scales up.</summary>
        public const int LowLines = 720;
        /// <summary>
        /// The texture group HotelImport puts every texture over 1024 pixels in: Low drops its top
        /// level, as the browser's 1K set halves exactly those (the rest are the same in both sets).
        /// </summary>
        public const string LargeTextures = "Large";

        public static Level Current { get; private set; } = Level.High;
        public static bool AmbientOcclusion => Current == Level.High;
        public static bool PlainGlass => Current == Level.Low;

        /// <summary>Told when the level changes (DressedRooms swaps its glass and pieces).</summary>
        public static event Action<Level> Changed;

        public static void Apply(Level level)
        {
            Current = level;
            if (GraphicsSettings.currentRenderPipeline is UniversalRenderPipelineAsset pipeline)
            {
                pipeline.renderScale = level == Level.Low ? Mathf.Min(1f, LowLines / (float)Mathf.Max(1, Screen.height)) : 1f;
                // The browser's canvas is scaled up by the page, smoothly.
                pipeline.upscalingFilter = UpscalingFilterSelection.Linear;
            }
            try
            {
                QualitySettings.SetTextureMipmapLimitSettings(LargeTextures, new TextureMipmapLimitSettings
                {
                    limitBiasMode = TextureMipmapLimitBiasMode.OverrideGlobalLimit,
                    limitBias = level == Level.Low ? 1 : 0,
                });
            }
            catch (ArgumentException)
            {
                // No such group: the hotel's art was imported before the groups existed.
                Debug.LogWarning("No '" + LargeTextures + "' texture group; run Haunted/Set up project and reimport the hotel");
            }
            Shader.SetGlobalFloat("_HauntedPlainGlass", level == Level.Low ? 1 : 0);
            Changed?.Invoke(level);
        }

        /// <summary>"-quality low" or "-quality high" (default High; the menus come in step E).</summary>
        public static Level Parse(string arg)
        {
            return string.Equals(arg, "low", StringComparison.OrdinalIgnoreCase) ? Level.Low : Level.High;
        }
    }
}
