using System;
using System.Collections.Generic;
using System.Text;
using System.Text.RegularExpressions;

namespace Haunted.Sim
{
    /// <summary>Where the key bindings are kept between runs (PlayerPrefs in the game, memory in the checks).</summary>
    public interface IKeyStore
    {
        /// <summary>The saved text, or null.</summary>
        string Get(string key);
        void Set(string key, string value);
    }

    /// <summary>
    /// Remappable keys (GDD 23 accessibility), client/src/keys.ts line for line: every action's key can
    /// be changed in Options and is remembered on this computer. Keys are named by the browser's
    /// KeyboardEvent.code ("KeyE", "ShiftLeft", "Digit2"), so both versions mean the same thing by
    /// them; the game turns a code into an Input System key (Game/KeyInput.cs). The mouse button
    /// (flashlight, photo, your hand) and Esc stay fixed.
    /// </summary>
    public class KeyBindings
    {
        /// <summary>The actions in the order Options lists them, with what each does.</summary>
        public static readonly string[][] Actions =
        {
            new[] { "forward", "Move forward" },
            new[] { "back", "Move back" },
            new[] { "left", "Move left" },
            new[] { "right", "Move right" },
            new[] { "run", "Run (5 s of stamina); hold your breath when hidden" },
            new[] { "crouch", "Crouch (quiet and slow); a Wisp floats down" },
            new[] { "use", "Use: doors, salt, relics, tasks, searching; hold to revive, hide, report, ring the bell" },
            new[] { "drop", "Drop the relic you carry" },
            new[] { "status", "Hold for the map and relic status" },
            new[] { "flashlight", "Flashlight on / off (also the mouse button)" },
            new[] { "camera", "Raise the Spirit Camera, then click" },
            new[] { "salt", "Pour a salt line" },
            new[] { "powers", "Hold for the possessed's powers" },
            new[] { "floatUp", "A Wisp floats up" },
        };

        public static readonly Dictionary<string, string> Defaults = new Dictionary<string, string>
        {
            { "forward", "KeyW" }, { "back", "KeyS" }, { "left", "KeyA" }, { "right", "KeyD" },
            { "run", "ShiftLeft" }, { "crouch", "KeyC" }, { "use", "KeyE" }, { "drop", "KeyG" },
            { "status", "Tab" }, { "flashlight", "Digit1" }, { "camera", "Digit2" }, { "salt", "Digit3" },
            { "powers", "KeyR" }, { "floatUp", "Space" },
        };

        /// <summary>Keys that can never be bound: Esc frees the mouse, and the debug keys stay where they are.</summary>
        public static readonly HashSet<string> Reserved = new HashSet<string> { "Escape", "KeyL", "KeyK", "KeyB" };

        const string StorageKey = "keyBindings";

        readonly IKeyStore storage;
        Dictionary<string, string> map;

        public KeyBindings(IKeyStore storage)
        {
            this.storage = storage;
            map = new Dictionary<string, string>(Defaults);
            try
            {
                string text = storage != null ? storage.Get(StorageKey) : null;
                var saved = Json.Parse(text ?? "{}") as Dictionary<string, object>;
                if (saved == null) return;
                foreach (var a in Actions)
                {
                    object code;
                    var s = saved.TryGetValue(a[0], out code) ? code as string : null;
                    if (!string.IsNullOrEmpty(s) && !Reserved.Contains(s)) map[a[0]] = s;
                }
            }
            catch (Exception)
            {
                // A damaged save: keep the defaults.
                map = new Dictionary<string, string>(Defaults);
            }
        }

        /// <summary>Left and right modifier keys count as the same key.</summary>
        public static string Side(string code)
        {
            return Regex.Replace(code, "(Left|Right)$", "");
        }

        /// <summary>True if this key code is the one bound to the action.</summary>
        public bool Is(string code, string action)
        {
            return Side(code) == Side(map[action]);
        }

        public string Code(string action)
        {
            return map[action];
        }

        /// <summary>
        /// Binds a key to an action. A key already used by another action swaps over to this action's
        /// old key, so no action is ever left without one. Returns false for a reserved key.
        /// </summary>
        public bool Set(string action, string code)
        {
            if (Reserved.Contains(code)) return false;
            string old = map[action];
            foreach (var a in Actions)
                if (a[0] != action && Side(map[a[0]]) == Side(code)) map[a[0]] = old;
            map[action] = code;
            Save();
            return true;
        }

        public void Reset()
        {
            map = new Dictionary<string, string>(Defaults);
            Save();
        }

        void Save()
        {
            if (storage == null) return;
            var sb = new StringBuilder("{");
            bool first = true;
            foreach (var a in Actions)
            {
                if (!first) sb.Append(',');
                first = false;
                sb.Append('"').Append(a[0]).Append("\":\"").Append(map[a[0]].Replace("\\", "\\\\").Replace("\"", "\\\"")).Append('"');
            }
            storage.Set(StorageKey, sb.Append('}').ToString());
        }

        /// <summary>What to call the action's key on screen, e.g. "E", "Shift", "Space", "2".</summary>
        public string Name(string action)
        {
            return KeyName(map[action]);
        }

        /// <summary>
        /// Rewrites a hint written with the default keys ("Hold E  Hide", "G to drop") to name the keys
        /// this player uses.
        /// </summary>
        public string Hint(string text)
        {
            // Mark every key first and name them after, so a key renamed to another default key's name
            // (E bound to Shift, say) is not renamed twice.
            Func<string, string> mark = a => "\u0001" + a + "\u0001";
            text = new Regex("^(Hold )?E {2}").Replace(text, m => m.Groups[1].Value + mark("use") + "  ", 1);
            text = Regex.Replace(text, @"\b([Hh]old) E\b", m => m.Groups[1].Value + " " + mark("use"));
            text = Regex.Replace(text, @"\b([Hh]old) Shift\b", m => m.Groups[1].Value + " " + mark("run"));
            text = Regex.Replace(text, @"\bG to drop\b", mark("drop") + " to drop");
            text = Regex.Replace(text, @"\b([Hh]old) R\b", m => m.Groups[1].Value + " " + mark("powers"));
            return Regex.Replace(text, "\u0001(\\w+)\u0001", m => Name(m.Groups[1].Value));
        }

        public static string KeyName(string code)
        {
            if (code.StartsWith("Key")) return code.Substring(3);
            if (code.StartsWith("Digit")) return code.Substring(5);
            if (code.StartsWith("Numpad")) return "Num " + code.Substring(6);
            if (code.StartsWith("Arrow")) return code.Substring(5) + " arrow";
            string plain = Side(code);
            return plain == "Control" ? "Ctrl" : plain == "Meta" ? "Win" : plain;
        }
    }
}
