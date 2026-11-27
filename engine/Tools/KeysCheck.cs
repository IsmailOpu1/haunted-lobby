using System;
using System.Collections.Generic;
using Haunted.Sim;

// Checks the key bindings (Sim/Keys.cs) as client/src/keys.test.ts checks keys.ts, test for test.
// Built with Windows' own C# compiler by check-sim.ps1.
static class KeysCheck
{
    static int failures;
    static string group = "";

    static void Expect<T>(T got, T want)
    {
        if (EqualityComparer<T>.Default.Equals(got, want)) return;
        failures += 1;
        Console.WriteLine("FAIL " + group + ": got " + got + ", want " + want);
    }

    class Memory : IKeyStore
    {
        readonly Dictionary<string, string> data = new Dictionary<string, string>();
        public string Get(string key) { string v; return data.TryGetValue(key, out v) ? v : null; }
        public void Set(string key, string value) { data[key] = value; }
    }

    static int Main(string[] args)
    {
        group = "starts with the default keys and treats left and right Shift alike";
        var k = new KeyBindings(new Memory());
        Expect(k.Code("use"), KeyBindings.Defaults["use"]);
        Expect(k.Is("ShiftRight", "run"), true);

        group = "swaps keys so no action is left without one, and remembers the change";
        var store = new Memory();
        k = new KeyBindings(store);
        Expect(k.Set("use", "KeyF"), true);
        Expect(k.Set("drop", "KeyF"), true);
        Expect(k.Code("drop"), "KeyF");
        Expect(k.Code("use"), "KeyG");
        Expect(new KeyBindings(store).Code("drop"), "KeyF");

        group = "refuses Esc and the debug keys";
        k = new KeyBindings(new Memory());
        Expect(k.Set("use", "Escape"), false);
        Expect(k.Code("use"), "KeyE");

        group = "names keys and rewrites hints with the player's keys, once each";
        k = new KeyBindings(new Memory());
        k.Set("use", "ShiftLeft");
        k.Set("run", "KeyQ");
        Expect(k.Hint("Hold E  Hide"), "Hold Shift  Hide");
        Expect(k.Hint("Hidden. Hold Shift to hold your breath, hold E to step out."), "Hidden. Hold Q to hold your breath, hold Shift to step out.");
        Expect(k.Hint("E  Pick up salt"), "Shift  Pick up salt");
        Expect(KeyBindings.KeyName("Digit2"), "2");
        Expect(KeyBindings.KeyName("Space"), "Space");

        group = "ignores a damaged save";
        store = new Memory();
        store.Set("keyBindings", "{not json");
        Expect(new KeyBindings(store).Code("use"), "KeyE");

        Console.WriteLine(failures == 0 ? "KeysCheck: 5 tests passed" : "KeysCheck: " + failures + " failed");
        return failures == 0 ? 0 : 1;
    }
}
