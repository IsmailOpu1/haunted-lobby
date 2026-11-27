using System;
using System.Globalization;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// Your choices on this computer (the Options screen, step E2), kept between runs in PlayerPrefs
    /// under the names the browser keeps them in localStorage (client/src/main.ts, comfort.ts), with
    /// its defaults and limits. Menus.cs changes them; the night reads them.
    /// </summary>
    public static class Options
    {
        // main.ts DEFAULT_VOLUME; input.ts SENSITIVITY_*; game.ts FOV_*.
        public const int DefaultVolume = 70;
        public const double SensitivityMin = 0.1, SensitivityMax = 10, DefaultSensitivity = 2.5;
        public const int FovMin = 70, FovMax = 100, DefaultFov = 90;

        /// <summary>Something changed (the night picks up the new values).</summary>
        public static event Action Changed;

        /// <summary>Sound volume, 0 to 100 (everything you hear, voices too, as the browser's volume node).</summary>
        public static int Volume { get { return Int("volume", DefaultVolume, 0, 100); } set { Save("volume", value); } }

        /// <summary>Jump-scare loudness, 0 to 100 (the hunt sting and slammed doors, GDD 23).</summary>
        public static int ScareVolume { get { return Int("scareVolume", 100, 0, 100); } set { Save("scareVolume", value); } }

        /// <summary>Screen shake strength, 0 to 100 (GDD 23).</summary>
        public static int Shake { get { return Int("screenShake", 100, 0, 100); } set { Save("screenShake", value); } }

        /// <summary>Photosensitivity mode: flicker becomes slow dimming, flashes become soft glows (GDD 23).</summary>
        public static bool Photosensitive { get { return Text("photosensitive") == "1"; } set { Save("photosensitive", value ? "1" : "0"); } }

        /// <summary>Mouse sensitivity on the Counter-Strike scale (input.ts).</summary>
        public static double Sensitivity { get { return Number("mouseSensitivityCs", DefaultSensitivity, SensitivityMin, SensitivityMax); } set { Save("mouseSensitivityCs", Num(value)); } }

        /// <summary>Field of view, side to side, in degrees.</summary>
        public static int Fov { get { return Int("fieldOfView", DefaultFov, FovMin, FovMax); } set { Save("fieldOfView", value); } }

        /// <summary>"auto", "high" or "low".</summary>
        public static string Quality
        {
            get { string q = Text("quality"); return q == "high" || q == "low" ? q : "auto"; }
            set { Save("quality", value); }
        }

        /// <summary>What Auto chose for this computer ("high" or "low"), or null before it has tested.</summary>
        public static string AutoQuality
        {
            get { string q = Text("autoQuality"); return q == "high" || q == "low" ? q : null; }
            set { Save("autoQuality", value); }
        }

        public static bool ShowFps { get { return Text("showFps") == "1"; } set { Save("showFps", value ? "1" : "0"); } }

        /// <summary>The first-launch photosensitivity warning was answered.</summary>
        public static bool PhotoWarningSeen { get { return Text("photoWarningSeen") != null; } set { if (value) Save("photoWarningSeen", "1"); } }

        /// <summary>The keys (Sim/Keys.cs, keys.ts), kept under "keyBindings".</summary>
        public static readonly KeyBindings Keys = new KeyBindings(new PrefsStore());

        /// <summary>The level to draw at: the choice, or what Auto chose (High until it has tested).</summary>
        public static HauntedQuality.Level QualityLevel
        {
            get
            {
                string q = Quality == "auto" ? AutoQuality ?? "high" : Quality;
                return q == "low" ? HauntedQuality.Level.Low : HauntedQuality.Level.High;
            }
        }

        /// <summary>Puts the volume into effect (the browser's volume node: every sound, voices too).</summary>
        public static void ApplyVolume()
        {
            AudioListener.volume = Volume / 100f;
        }

        /// <summary>Tells the night something changed; Menus.cs calls it after each change.</summary>
        public static void Notify()
        {
            ApplyVolume();
            if (Changed != null) Changed();
        }

        class PrefsStore : IKeyStore
        {
            public string Get(string key) { return PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null; }
            public void Set(string key, string value) { PlayerPrefs.SetString(key, value); PlayerPrefs.Save(); }
        }

        // The browser keeps every value as text; so does this, so a value reads the same either way.
        static string Text(string key) { return PlayerPrefs.HasKey(key) ? PlayerPrefs.GetString(key) : null; }

        static void Save(string key, string value)
        {
            PlayerPrefs.SetString(key, value);
            PlayerPrefs.Save();
        }

        static void Save(string key, int value) { Save(key, value.ToString(CultureInfo.InvariantCulture)); }

        static string Num(double v) { return v.ToString("R", CultureInfo.InvariantCulture); }

        static double Number(string key, double fallback, double min, double max)
        {
            double v;
            string s = Text(key);
            if (s == null || !double.TryParse(s, NumberStyles.Float, CultureInfo.InvariantCulture, out v) || double.IsNaN(v) || double.IsInfinity(v)) return fallback;
            return Math.Min(max, Math.Max(min, v));
        }

        static int Int(string key, int fallback, int min, int max)
        {
            return (int)Math.Round(Number(key, fallback, min, max));
        }
    }
}
