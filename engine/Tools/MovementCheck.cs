using System;
using System.Collections;
using System.Collections.Generic;
using System.IO;
using System.Web.Script.Serialization;
using Haunted.Sim;

// Checks Movement.cs against the TypeScript movement: engine-data/movement-cases.json holds 780
// steps of inputs and where shared/src/sim/movement.ts ended up after each. Every step must match
// within 1e-9. Built with Windows' own C# compiler by check-movement.ps1, so no Unity is needed.
static class MovementCheck
{
    const double Tolerance = 1e-9;

    static double D(object v) { return Convert.ToDouble(v); }

    static int Main(string[] args)
    {
        string root = args.Length > 0 ? args[0] : ".";
        var json = new JavaScriptSerializer { MaxJsonLength = int.MaxValue };
        var config = (Dictionary<string, object>)json.DeserializeObject(File.ReadAllText(Path.Combine(root, "engine-data/config.json")));
        var move = (Dictionary<string, object>)config["movement"];
        var wisps = (Dictionary<string, object>)config["wisps"];
        var m = new MovementConfig
        {
            Walk = D(move["walk"]), Run = D(move["run"]), Crouch = D(move["crouch"]), Crawl = D(move["crawl"]),
            StaminaSec = D(move["staminaSec"]), StaminaRegenDelaySec = D(move["staminaRegenDelaySec"]),
            StaminaRefillSec = D(move["staminaRefillSec"]), RelicSlowPct = D(move["relicSlowPct"]), WispSpeed = D(wisps["speed"]),
        };

        CollideFn open = (double fx, double fz, double dx, double dz, out double tx, out double tz) => { tx = fx + dx; tz = fz + dz; };
        CollideFn wall = (double fx, double fz, double dx, double dz, out double tx, out double tz) => { tx = Math.Min(fx + dx, 1); tz = fz + dz; };
        var modes = new Dictionary<string, MoveMode> { { "normal", MoveMode.Normal }, { "carry", MoveMode.Carry }, { "crawl", MoveMode.Crawl }, { "frozen", MoveMode.Frozen }, { "wisp", MoveMode.Wisp } };

        var data = (Dictionary<string, object>)json.DeserializeObject(File.ReadAllText(Path.Combine(root, "engine-data/movement-cases.json")));
        int failures = 0, steps = 0;
        double worst = 0;
        foreach (Dictionary<string, object> c in (IEnumerable)data["cases"])
        {
            var start = (Dictionary<string, object>)c["start"];
            MoveState s = Movement.Initial(D(start["x"]), D(start["z"]), m);
            double dt = D(c["dt"]);
            CollideFn collide = (string)c["walls"] == "wall" ? wall : open;
            MoveMode mode = modes[(string)c["mode"]];
            int n = 0;
            foreach (Dictionary<string, object> step in (IEnumerable)c["steps"])
            {
                n++;
                steps++;
                var i = (Dictionary<string, object>)step["input"];
                var input = new MoveInput { Seq = Convert.ToInt32(i["seq"]), Forward = D(i["forward"]), Right = D(i["right"]), Run = (bool)i["run"], Crouch = (bool)i["crouch"], Yaw = D(i["yaw"]), Pitch = D(i["pitch"]) };
                s = Movement.Step(s, input, dt, collide, m, mode);
                var a = (Dictionary<string, object>)step["after"];
                double off = Math.Max(Math.Max(Math.Abs(s.X - D(a["x"])), Math.Abs(s.Z - D(a["z"]))), Math.Max(Math.Abs(s.Stamina - D(a["stamina"])), Math.Abs(s.RegenWait - D(a["regenWait"]))));
                worst = Math.Max(worst, off);
                if (off > Tolerance || s.Crouching != (bool)a["crouching"])
                {
                    if (failures < 10) Console.WriteLine("MISMATCH " + c["name"] + ", step " + n + ": off by " + off.ToString("E2"));
                    failures++;
                }
            }
        }
        Console.WriteLine((failures == 0 ? "OK" : "FAILED") + ": " + steps + " steps, " + failures + " mismatches, largest difference " + worst.ToString("E2"));
        return failures == 0 ? 0 : 1;
    }
}
