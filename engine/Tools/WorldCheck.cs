using System;
using System.Collections.Generic;
using System.IO;
using Haunted.Sim;

// Checks World.cs against the TypeScript: engine-data/level-cases.json holds where levels.ts puts
// simulation points (toWorld) and moves across stairs (crossStairs); both must match within 1e-9.
// Then measures the client's own collision against the server's Rapier collision on the walks in
// collide-cases.json: each step starts where Rapier was, so errors do not pile up. They need not
// match exactly (the server corrects the client), so this fails only past MaxCollideOffM.
// Built with Windows' own C# compiler by check-sim.ps1, so no Unity is needed.
static class WorldCheck
{
    const double Tolerance = 1e-9;
    /// <summary>A step that ends further than this from Rapier's would make a visible nudge.</summary>
    const double MaxCollideOffM = 0.05;

    static int Main(string[] args)
    {
        string root = args.Length > 0 ? args[0] : ".";
        Func<string, string> read = name => File.ReadAllText(Path.Combine(root, "engine-data", name));
        WorldData world = GameData.LoadWorld(read("map.json"), read("world.json"));
        Console.WriteLine("Loaded " + world.Levels.Count + " floors, " + world.Stairs.Count + " stairs, " + world.Rooms.Count + " rooms, " + world.Solids.Count + " solids");
        int failures = 0;

        // Floors and stairs: exact.
        var levelCases = Json.Arr(Json.Parse(read("level-cases.json")), "cases");
        double worst = 0;
        int levelFails = 0;
        foreach (var c in levelCases)
        {
            var from = Json.Obj(c, "from");
            var to = Json.Obj(c, "to");
            var w = Levels.ToWorld(world, Json.Num(from, "x"), Json.Num(from, "z"));
            var ew = Json.Obj(c, "world");
            var crossed = Levels.CrossStairs(world, new Point(Json.Num(from, "x"), Json.Num(from, "z")), new Point(Json.Num(to, "x"), Json.Num(to, "z")));
            var ec = Json.Obj(c, "crossed");
            double off = Math.Max(Math.Max(Math.Abs(w.X - Json.Num(ew, "x")), Math.Abs(w.Y - Json.Num(ew, "y"))), Math.Abs(w.Z - Json.Num(ew, "z")));
            off = Math.Max(off, Math.Max(Math.Abs(crossed.X - Json.Num(ec, "x")), Math.Abs(crossed.Z - Json.Num(ec, "z"))));
            worst = Math.Max(worst, off);
            if (off > Tolerance)
            {
                if (levelFails < 10) Console.WriteLine("MISMATCH level case from (" + Json.Num(from, "x") + ", " + Json.Num(from, "z") + "): off by " + off.ToString("E2"));
                levelFails++;
            }
        }
        Console.WriteLine((levelFails == 0 ? "OK" : "FAILED") + ": floors and stairs, " + levelCases.Count + " cases, " + levelFails + " mismatches, largest difference " + worst.ToString("E2"));
        failures += levelFails;

        // Collision: close to Rapier.
        var collision = new Collision(world, 0.3);
        var walks = Json.Arr(Json.Parse(read("collide-cases.json")), "walks");
        int steps = 0, far = 0;
        double sum = 0, max = 0;
        foreach (var walk in walks)
        {
            var start = Json.Obj(walk, "start");
            double x = Json.Num(start, "x"), z = Json.Num(start, "z");
            foreach (var m in Json.Arr(walk, "moves"))
            {
                var d = Json.Obj(m, "d");
                var to = Json.Obj(m, "to");
                double tx, tz;
                collision.Collide(x, z, Json.Num(d, "x"), Json.Num(d, "z"), out tx, out tz);
                double ex = Json.Num(to, "x"), ez = Json.Num(to, "z");
                double off = Math.Sqrt((tx - ex) * (tx - ex) + (tz - ez) * (tz - ez));
                steps++;
                sum += off;
                max = Math.Max(max, off);
                if (off > MaxCollideOffM)
                {
                    if (far < 10) Console.WriteLine("FAR collide step at (" + x.ToString("F3") + ", " + z.ToString("F3") + "): client (" + tx.ToString("F3") + ", " + tz.ToString("F3") + "), server (" + ex.ToString("F3") + ", " + ez.ToString("F3") + ")");
                    far++;
                }
                x = ex;
                z = ez;
            }
        }
        Console.WriteLine((far == 0 ? "OK" : "FAILED") + ": collision, " + steps + " steps against Rapier, mean difference " + (sum / steps).ToString("E2") + " m, largest " + max.ToString("E2") + " m, " + far + " over " + MaxCollideOffM + " m");
        failures += far;
        return failures == 0 ? 0 : 1;
    }
}
