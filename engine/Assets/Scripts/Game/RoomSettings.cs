using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;
using UnityEngine;
using Haunted.Sim;

namespace Haunted.Game
{
    /// <summary>
    /// The room settings (GDD 20) as lobbyView.ts shows them: each setting's choices, which preset the
    /// room's settings are, and their one-line summary. The choices and the presets' whole sets come
    /// from shared/src/settings.ts through tools/engine-export.ts (Resources/Data/settings.json).
    /// </summary>
    public static class RoomSettings
    {
        public class Row
        {
            public string Key, Label, Unit;
            public Row(string key, string label, string unit = null) { Key = key; Label = label; Unit = unit; }
        }

        public static readonly Row[] Basic =
        {
            new Row("lengthMin", "Match length", "min"),
            new Row("possessed", "Number of possessed"),
            new Row("difficulty", "Ghost difficulty"),
        };

        public static readonly KeyValuePair<string, Row[]>[] Advanced =
        {
            new KeyValuePair<string, Row[]>("Objectives", new[]
            {
                new Row("relics", "Relics"),
                new Row("tasksPerPlayer", "Tasks per player"),
                new Row("ritualSec", "Ritual length", "s"),
                new Row("circle", "Players needed in circle"),
                new Row("mystery", "Who was the ghost?"),
            }),
            new KeyValuePair<string, Row[]>("Possessed", new[]
            {
                new Row("knowEachOther", "Possessed know each other"),
                new Row("cooldownSpeed", "Power cooldown speed"),
                new Row("blackout", "Blackout"),
            }),
            new KeyValuePair<string, Row[]>("Items", new[]
            {
                new Row("cameraShots", "Camera shots per player"),
                new Row("saltPerPlayer", "Salt per player"),
            }),
            new KeyValuePair<string, Row[]>("Meetings", new[]
            {
                new Row("bellUses", "Bell uses per player"),
                new Row("evidenceSec", "Evidence time", "s"),
                new Row("discussionSec", "Discussion time", "s"),
                new Row("voteSec", "Voting time", "s"),
                new Row("revealRole", "Reveal role when removed"),
                new Row("anonymousVoting", "Anonymous voting"),
            }),
            new KeyValuePair<string, Row[]>("Voice", new[] { new Row("ghostHearsMic", "Ghost hears real mic") }),
            new KeyValuePair<string, Row[]>("The dead", new[]
            {
                new Row("wispTasks", "Wisps can do tasks"),
                new Row("ouija", "Ouija board"),
            }),
        };

        public static readonly KeyValuePair<string, string>[] Presets =
        {
            new KeyValuePair<string, string>("standard", "Standard"),
            new KeyValuePair<string, string>("beginner", "Beginner"),
            new KeyValuePair<string, string>("hardcore", "Hardcore"),
        };

        static object data;
        static object Data => data ?? (data = Json.Parse(Resources.Load<TextAsset>("Data/settings").text));

        /// <summary>A setting's choices, in the lobby's order (numbers, words or true and false).</summary>
        public static List<object> Options(string key) => Json.Arr(Json.Obj(Data, "options"), key);

        /// <summary>The room state's settings (a JSON string) as a dictionary, or null.</summary>
        public static Dictionary<string, object> Parse(string json) =>
            string.IsNullOrEmpty(json) ? null : Json.Parse(json) as Dictionary<string, object>;

        /// <summary>Two JSON values as the same choice (numbers whatever their type).</summary>
        public static bool Same(object a, object b)
        {
            if (a == null || b == null) return a == b;
            if (a is bool || b is bool || a is string || b is string) return a.Equals(b);
            return Convert.ToDouble(a, CultureInfo.InvariantCulture) == Convert.ToDouble(b, CultureInfo.InvariantCulture);
        }

        /// <summary>Where a value stands among a setting's choices, or -1.</summary>
        public static int IndexOf(string key, object value)
        {
            var options = Options(key);
            for (int i = 0; i < options.Count; i++) if (Same(options[i], value)) return i;
            return -1;
        }

        /// <summary>settings.ts presetOf: which preset these settings are, or "custom" once anything differs.</summary>
        public static string PresetOf(Dictionary<string, object> s)
        {
            var keys = Json.Arr(Data, "keys");
            foreach (var p in Presets)
            {
                var preset = Json.Obj(Json.Obj(Data, "presets"), p.Key);
                if (keys.All(k => s.ContainsKey((string)k) && Same(preset[(string)k], s[(string)k]))) return p.Key;
            }
            return "custom";
        }

        /// <summary>lobbyView.ts optionText: On, Off, Auto, a capitalised word, or a number with its unit.</summary>
        public static string OptionText(object value, string unit = null)
        {
            if (value is bool b) return b ? "On" : "Off";
            if (value is string w) return w == "auto" ? "Auto" : w.Length == 0 ? w : char.ToUpperInvariant(w[0]) + w.Substring(1);
            string n = Convert.ToDouble(value, CultureInfo.InvariantCulture).ToString(CultureInfo.InvariantCulture);
            return unit != null ? n + " " + unit : n;
        }

        /// <summary>lobbyView.ts settingsSummary: "Standard · 15 min · Possessed: auto · Normal ghost".</summary>
        public static string Summary(Dictionary<string, object> s)
        {
            string preset = PresetOf(s);
            string name = Presets.Where(p => p.Key == preset).Select(p => p.Value).FirstOrDefault() ?? "Custom";
            string possessed = s["possessed"] as string == "auto" ? "Possessed: auto" : OptionText(s["possessed"]) + " possessed";
            return name + " · " + OptionText(s["lengthMin"]) + " min · " + possessed + " · " + OptionText(s["difficulty"]) + " ghost";
        }
    }
}
