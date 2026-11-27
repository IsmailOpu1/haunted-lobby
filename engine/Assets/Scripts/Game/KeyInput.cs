using System.Collections.Generic;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Haunted.Game
{
    /// <summary>
    /// The bound keys (Options.Keys, Sim/Keys.cs) read from the keyboard. Bindings name keys by the
    /// browser's KeyboardEvent.code, so a binding means the same key in both versions; this turns a
    /// code into the Input System's key (both sides of Shift, Ctrl, Alt and Win count, as keys.ts's
    /// side()), and a key the player presses while rebinding back into a code.
    /// </summary>
    public static class KeyInput
    {
        /// <summary>The action's key is held now.</summary>
        public static bool Held(string action) { return Any(action, c => c.isPressed); }

        /// <summary>The action's key went down this frame.</summary>
        public static bool Pressed(string action) { return Any(action, c => c.wasPressedThisFrame); }

        /// <summary>The action's key came up this frame.</summary>
        public static bool Released(string action) { return Any(action, c => c.wasReleasedThisFrame); }

        static bool Any(string action, System.Func<UnityEngine.InputSystem.Controls.KeyControl, bool> test)
        {
            var k = Keyboard.current;
            if (k == null) return false;
            foreach (var key in Keys(Options.Keys.Code(action)))
                if (test(k[key])) return true;
            return false;
        }

        static readonly Dictionary<string, Key[]> keysOf = new Dictionary<string, Key[]>();

        /// <summary>The Input System keys for a code: both sides of a modifier, as keys.ts treats them alike.</summary>
        public static Key[] Keys(string code)
        {
            Key[] found;
            if (keysOf.TryGetValue(code, out found)) return found;
            var list = new List<Key>();
            string plain = Haunted.Sim.KeyBindings.Side(code);
            if (plain != code)
            {
                Key key;
                if (ToKey(plain + "Left", out key)) list.Add(key);
                if (ToKey(plain + "Right", out key)) list.Add(key);
            }
            else
            {
                Key key;
                if (ToKey(code, out key)) list.Add(key);
            }
            found = list.ToArray();
            keysOf[code] = found;
            return found;
        }

        /// <summary>KeyboardEvent.code to the Input System's key.</summary>
        static bool ToKey(string code, out Key key)
        {
            key = Key.None;
            string name;
            if (code.StartsWith("Key") && code.Length == 4) name = code.Substring(3);
            else if (code.StartsWith("Digit")) name = code;
            else if (code.StartsWith("Numpad") && code.Length == 7 && char.IsDigit(code[6])) name = code;
            else if (code.StartsWith("Arrow")) name = code.Substring(5) + "Arrow";
            else if (code.EndsWith("Left") || code.EndsWith("Right"))
            {
                bool left = code.EndsWith("Left");
                string what = code.Substring(0, code.Length - (left ? 4 : 5));
                string side = left ? "Left" : "Right";
                if (what == "Shift") name = side + "Shift";
                else if (what == "Control") name = side + "Ctrl";
                else if (what == "Alt") name = side + "Alt";
                else if (what == "Meta") name = side + "Meta";
                else if (what == "Bracket") name = side + "Bracket";
                else return false;
            }
            else if (!WebToUnity.TryGetValue(code, out name)) name = code;
            return System.Enum.TryParse(name, out key) && key != Key.None;
        }

        // Codes whose Input System names differ, beyond the patterns above.
        static readonly Dictionary<string, string> WebToUnity = new Dictionary<string, string>
        {
            { "Equal", "Equals" }, { "NumpadAdd", "NumpadPlus" }, { "NumpadSubtract", "NumpadMinus" },
            { "NumpadDecimal", "NumpadPeriod" }, { "NumpadEqual", "NumpadEquals" }, { "IntlBackslash", "OEM1" },
        };

        /// <summary>The code of an Input System key (rebinding from the keyboard itself).</summary>
        public static string CodeOf(Key key)
        {
            string n = key.ToString();
            if (n.Length == 1) return "Key" + n;
            if (n.StartsWith("Digit") || (n.StartsWith("Numpad") && n.Length == 7 && char.IsDigit(n[6]))) return n;
            if (n.EndsWith("Arrow")) return "Arrow" + n.Substring(0, n.Length - 5);
            foreach (var side in new[] { "Left", "Right" })
            {
                if (!n.StartsWith(side)) continue;
                string what = n.Substring(side.Length);
                if (what == "Shift") return "Shift" + side;
                if (what == "Ctrl") return "Control" + side;
                if (what == "Alt") return "Alt" + side;
                if (what == "Meta" || what == "Windows" || what == "Command" || what == "Apple") return "Meta" + side;
                if (what == "Bracket") return "Bracket" + side;
            }
            foreach (var kv in WebToUnity) if (kv.Value == n) return kv.Key;
            return n;
        }

        /// <summary>
        /// The code of a key the window reported (UI Toolkit's key events carry the old KeyCode; they come
        /// from the window's own key messages, the way a test types too).
        /// </summary>
        public static string CodeOf(KeyCode key)
        {
            if (key >= KeyCode.A && key <= KeyCode.Z) return "Key" + key;
            if (key >= KeyCode.Alpha0 && key <= KeyCode.Alpha9) return "Digit" + (key - KeyCode.Alpha0);
            if (key >= KeyCode.Keypad0 && key <= KeyCode.Keypad9) return "Numpad" + (key - KeyCode.Keypad0);
            if (key >= KeyCode.F1 && key <= KeyCode.F15) return key.ToString();
            switch (key)
            {
                case KeyCode.LeftShift: return "ShiftLeft";
                case KeyCode.RightShift: return "ShiftRight";
                case KeyCode.LeftControl: return "ControlLeft";
                case KeyCode.RightControl: return "ControlRight";
                case KeyCode.LeftAlt: return "AltLeft";
                case KeyCode.RightAlt: return "AltRight";
                case KeyCode.LeftWindows: return "MetaLeft";
                case KeyCode.RightWindows: return "MetaRight";
                case KeyCode.UpArrow: return "ArrowUp";
                case KeyCode.DownArrow: return "ArrowDown";
                case KeyCode.LeftArrow: return "ArrowLeft";
                case KeyCode.RightArrow: return "ArrowRight";
                case KeyCode.Space: return "Space";
                case KeyCode.Tab: return "Tab";
                case KeyCode.Return: return "Enter";
                case KeyCode.KeypadEnter: return "NumpadEnter";
                case KeyCode.Backspace: return "Backspace";
                case KeyCode.CapsLock: return "CapsLock";
                case KeyCode.Escape: return "Escape";
                case KeyCode.BackQuote: return "Backquote";
                case KeyCode.Minus: return "Minus";
                case KeyCode.Equals: return "Equal";
                case KeyCode.LeftBracket: return "BracketLeft";
                case KeyCode.RightBracket: return "BracketRight";
                case KeyCode.Backslash: return "Backslash";
                case KeyCode.Semicolon: return "Semicolon";
                case KeyCode.Quote: return "Quote";
                case KeyCode.Comma: return "Comma";
                case KeyCode.Period: return "Period";
                case KeyCode.Slash: return "Slash";
                case KeyCode.Insert: return "Insert";
                case KeyCode.Delete: return "Delete";
                case KeyCode.Home: return "Home";
                case KeyCode.End: return "End";
                case KeyCode.PageUp: return "PageUp";
                case KeyCode.PageDown: return "PageDown";
                case KeyCode.KeypadPlus: return "NumpadAdd";
                case KeyCode.KeypadMinus: return "NumpadSubtract";
                case KeyCode.KeypadMultiply: return "NumpadMultiply";
                case KeyCode.KeypadDivide: return "NumpadDivide";
                case KeyCode.KeypadPeriod: return "NumpadDecimal";
            }
            return null;
        }
    }
}
