using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Haunted.Sim;

// Checks the hands-on task rules (HandsLogic*.cs) the way client/src/hands/logic.test.ts checks the
// browser's: each task is played by a simulated steady player, who must finish in the GDD's time,
// and by careless ones, who must pay for it. Built with Windows' own C# compiler by check-sim.ps1.
static class HandsCheck
{
    const double DT = 1.0 / 60;
    static int failures;
    static string group = "";

    static void Expect(bool ok, string what)
    {
        if (ok) return;
        failures += 1;
        Console.WriteLine("FAIL " + group + ": " + what);
    }

    class Sounds
    {
        public readonly List<string> Heard = new List<string>();
        public readonly Play Play;
        public Sounds() { Play = (k, p) => Heard.Add(k); }
        public int Count(string k) { return Heard.Count(h => h == k); }
    }

    static readonly Play Quiet = (k, p) => { };
    static readonly Action None = () => { };

    /// <summary>Runs until done or the time runs out; returns the seconds taken.</summary>
    static double Run(Action step, Func<bool> done, double maxSec = 60)
    {
        double t = 0;
        while (!done() && t < maxSec)
        {
            step();
            t += DT;
        }
        return t;
    }

    static double Cfg(params string[] path) { return HandsConfig.Path(path); }

    /// <summary>The GDD's time for a task (10 to 20 s), but no faster than the server accepts.</summary>
    static void InTaskTime(double t, string what)
    {
        Expect(t >= Cfg("tasks", "serverMinSec") && t <= Cfg("tasks", "maxSec"), what + " took " + t.ToString("0.00") + " s");
    }

    static void InRelicTime(double t, string what)
    {
        Expect(t >= Cfg("relics", "serverMinSec") && t <= Cfg("relics", "extractMaxSec"), what + " took " + t.ToString("0.00") + " s");
    }

    /// <summary>A repeatable random number source for a given seed (the browser test's seeded()).</summary>
    static Func<double> Seeded(double seed)
    {
        double x = seed * 9301 + 49297;
        return () => { x = (x * 9301 + 49297) % 233280; return x / 233280; };
    }

    /// <summary>The browser test's seededRandom(): the first number comes from the seed itself.</summary>
    static Func<double> SeededRandom(double seed)
    {
        return () => { seed = (seed * 9301 + 49297) % 233280; return seed / 233280; };
    }

    static Func<double> Fixed(double v) { return () => v; }

    /// <summary>The pixels to move the mouse this frame to move a point toward `to` at mPerSec.</summary>
    static double[] Toward(FacePoint from, FacePoint to, double mPerSec, double mPerPx)
    {
        double du = to.U - from.U, dv = to.V - from.V;
        double d = Math.Sqrt(du * du + dv * dv);
        double step = Math.Min(d, mPerSec * DT);
        if (d == 0) return new double[] { 0, 0 };
        return new double[] { du / d * step / mPerPx, -dv / d * step / mPerPx };
    }

    static void Strike(MatchLogic match)
    {
        for (int i = 0; i < 6 && !match.Lit; i++) match.Update(DT, true, 2000 * DT, 0);
    }

    static double H(string task, string key) { return HandsConfig.N(task, key); }

    static int Main(string[] args)
    {
        string root = args.Length > 0 ? args[0] : ".";
        HandsConfig.Load(Json.Parse(File.ReadAllText(Path.Combine(root, "engine-data", "config.json"))));
        Candelabra(); Shutters(); Stove(); Dig(); Letter(); Boiler(); Portraits(); Switchboard();
        Mirror(); Trunk(); Sheets(); Cradle(); Lockbox(); Drain(); Clock(); Piano(); Roses(); ClueTime();
        Console.WriteLine(failures == 0 ? "Hands-on tasks: all checks pass" : "Hands-on tasks: " + failures + " checks FAILED");
        return failures == 0 ? 0 : 1;
    }

    static void Candelabra()
    {
        group = "candelabra";
        {
            var s = new Sounds();
            var game = new CandelabraLogic(s.Play);
            for (int i = 0; i < 10; i++) game.Update(DT, -1, true, 400 * DT, 0);
            Expect(!game.MatchLit && s.Heard.Count == 0, "400 px/s does nothing");
            for (int i = 0; i < 10; i++) game.Update(DT, -1, true, 900 * DT, 0);
            Expect(!game.MatchLit && s.Heard.Contains("spark"), "900 px/s sparks");
            for (int i = 0; i < 10; i++) game.Update(DT, -1, true, 2000 * DT, 0);
            Expect(game.MatchLit && s.Heard.Contains("strike"), "2000 px/s strikes");
        }
        {
            var game = new CandelabraLogic(Quiet);
            int wick = 0;
            double moving = 0;
            double t = Run(() =>
            {
                if (!game.MatchLit) { game.Update(DT, -1, true, 2000 * DT, 0); return; }
                if (game.Lit[wick]) { wick += 1; moving = 0.3; }
                moving -= DT;
                game.Update(DT, moving > 0 ? -1 : wick, false, 0, 1);
            }, () => game.Done);
            Expect(game.Done && t >= Cfg("tasks", "minSec") && t <= Cfg("tasks", "maxSec"), "steady player lights every wick in time (" + t.ToString("0.0") + " s)");
        }
        {
            var s = new Sounds();
            var game = new CandelabraLogic(s.Play);
            for (int i = 0; i < 6; i++) game.Update(DT, -1, true, 2000 * DT, 0);
            Expect(game.MatchLit, "struck");
            game.Update(DT, -1, false, 0, H("match", "outRadPerSec") + 1);
            Expect(!game.MatchLit && s.Heard.Contains("fizz"), "turning fast blows it out");
            for (int i = 0; i < 6; i++) game.Update(DT, -1, true, 2000 * DT, 0);
            Expect(!game.MatchLit, "a new match takes a moment");
        }
        {
            var game = new CandelabraLogic(Quiet);
            for (int i = 0; i < 8; i++) game.Update(DT, -1, true, i % 2 == 1 ? 0 : 4000 * DT, 0);
            Expect(game.MatchLit, "strikes with frames between mouse moves");
        }
        {
            var game = new CandelabraLogic(Quiet);
            for (int i = 0; i < 6; i++) game.Update(DT, -1, true, 2000 * DT, 0);
            for (double t = 0; t < H("candelabra", "lightSec") * 0.8; t += DT) game.Update(DT, 0, false, 0, 0);
            double warm = game.Heat[0];
            for (double t = 0; t < 0.5; t += DT) game.Update(DT, -1, false, 0, 0);
            Expect(game.Heat[0] < warm && !game.Lit[0], "a wick cools when the flame leaves");
        }
    }

    static void Shutters()
    {
        group = "shutters";
        Func<ShuttersLogic, Action> steady = game =>
        {
            int held = 0;
            return () =>
            {
                while (held < game.Latched.Length && game.Latched[held]) held += 1;
                if (held >= game.Latched.Length) return;
                double speed = game.Open[held] > 0 ? 300 : game.Gusting ? 200 : 0;
                game.Update(DT, held, speed * DT);
            };
        };
        {
            double seed = 0.37;
            Func<double> random = () => { seed = (seed * 9301 + 0.4927) % 1; return seed; };
            var game = new ShuttersLogic(Quiet, None, random);
            double t = Run(steady(game), () => game.Done);
            Expect(game.Done && t >= Cfg("tasks", "minSec") && t <= Cfg("tasks", "maxSec"), "steady player closes all in time (" + t.ToString("0.0") + " s)");
        }
        {
            var s = new Sounds();
            var game = new ShuttersLogic(s.Play, None, Fixed(0));
            game.Update(DT, 0, H("shutters", "pxToClose") * 0.8);
            double before = game.Open[0];
            Run(() => game.Update(DT, 0, 0), () => game.Gusting);
            Expect(s.Heard.Contains("whistle"), "whistles before a gust");
            for (double t = 0; t < 0.5; t += DT) game.Update(DT, 0, 0);
            Expect(game.Open[0] > before, "the gust pulls the held shutter");
        }
        {
            var s = new Sounds();
            int noises = 0;
            var game = new ShuttersLogic(s.Play, () => noises++, Fixed(0.99));
            game.Update(DT, 1, H("shutters", "pxToClose") * 0.9);
            Expect(game.Open[1] < H("shutters", "slamBelow"), "nearly shut");
            game.Update(DT, -1, 0);
            Expect(game.Open[1] == 1 && s.Heard.Contains("bang") && noises == 1, "slams open with a noise");
        }
        {
            var game = new ShuttersLogic(Quiet, None, Fixed(0.99));
            game.Update(DT, 2, H("shutters", "pxToClose"));
            for (double t = 0; t < H("shutters", "latchSec") / 2; t += DT) game.Update(DT, 2, 0);
            Expect(!game.Latched[2], "not latched yet");
            for (double t = 0; t < H("shutters", "latchSec"); t += DT) game.Update(DT, 2, 0);
            Expect(game.Latched[2], "latched once held long enough");
        }
    }

    static void Stove()
    {
        group = "stove";
        {
            var game = new StoveLogic(Quiet, Fixed(0.5));
            int knob = 0;
            double t = Run(() =>
            {
                if (game.InNotch[knob])
                {
                    if (game.Flame[knob] == 0 && knob < game.Angle.Length - 1) knob += 1;
                    game.Update(DT, knob, 0);
                    return;
                }
                game.Update(DT, knob, -Math.Sign(game.Angle[knob]) * 100 * DT / H("stove", "degPerPx"));
            }, () => game.Done);
            Expect(game.Done && t >= Cfg("tasks", "minSec") && t <= Cfg("tasks", "maxSec"), "steady player turns every knob off in time (" + t.ToString("0.0") + " s)");
        }
        {
            var s = new Sounds();
            var game = new StoveLogic(s.Play, Fixed(0));
            double start = game.Angle[0];
            double fast = H("stove", "catchDegPerSec") * 3 * DT / H("stove", "degPerPx");
            Run(() => game.Update(DT, 0, -fast), () => game.Angle[0] < 0, 10);
            Expect(start > 0 && !game.InNotch[0] && game.Flame[0] == 1 && s.Heard.Contains("hiss"), "slips past the notch when fast");
        }
        {
            var s = new Sounds();
            var game = new StoveLogic(s.Play, Fixed(0));
            double slow = H("stove", "catchDegPerSec") / 2 * DT / H("stove", "degPerPx");
            Run(() => game.Update(DT, 0, -slow), () => game.InNotch[0], 10);
            Expect(s.Heard.Contains("click") && game.Angle[0] == 0, "clicks into the notch when slow");
            game.Update(DT, 0, H("stove", "detentDeg") / 2 / H("stove", "degPerPx"));
            Expect(game.InNotch[0], "a small nudge stays in");
            game.Update(DT, 0, H("stove", "detentDeg") / H("stove", "degPerPx"));
            Expect(!game.InNotch[0] && game.Flame[0] == 1, "a firm push takes it out");
        }
    }

    static void Dig()
    {
        group = "dig";
        {
            var game = new DigLogic(Quiet, None);
            double t = Run(() => game.Update(DT, true, true, 500 * DT), () => game.Done);
            Expect(t > Cfg("relics", "search", "serverMinSec") && t < 5 && !game.Found, "a search takes a few seconds (" + t.ToString("0.0") + " s)");
        }
        {
            var game = new DigLogic(Quiet, None);
            double t = Run(() => game.Update(DT, true, true, 500 * DT), () => game.Done);
            game.SetFound();
            Expect(!game.Done, "keeps digging once found");
            t += Run(() => game.Update(DT, true, true, 500 * DT), () => game.Done);
            Expect(t >= Cfg("relics", "extractMinSec") && t <= Cfg("relics", "extractMaxSec"), "takes the relic in time (" + t.ToString("0.0") + " s)");
        }
        {
            int noises = 0;
            var game = new DigLogic(Quiet, () => noises++);
            for (int i = 0; i < 60; i++) game.Update(DT, true, true, 5000 * DT);
            double max = H("dig", "maxPxPerSec");
            Expect(game.Dug < max * 0.2 + max + (5000 - max) * H("dig", "fastFactor") + 0.01, "frantic digging is no faster");
            Expect(noises > 45, "frantic digging is noisy");
            Expect(H("dig", "searchPx") / max > Cfg("relics", "search", "serverMinSec"), "search slower than the server's limit");
            Expect((H("dig", "searchPx") + H("dig", "takePx")) / max > Cfg("relics", "serverMinSec"), "taking slower than the server's limit");
        }
        {
            int noises = 0;
            var game = new DigLogic(Quiet, () => noises++);
            for (int i = 0; i < 120; i++) game.Update(DT, true, true, i % 2 == 1 ? 0 : 1000 * DT);
            Expect(noises == 0, "steady digging with bunched mouse moves is quiet");
        }
        {
            var game = new DigLogic(Quiet, None);
            game.Update(DT, false, true, 10);
            game.Update(DT, true, false, 10);
            game.Update(DT, true, true, -10);
            Expect(game.Dug == 0, "only digs in the soil, holding, moving down");
        }
    }

    static void Letter()
    {
        group = "letter";
        {
            var game = new LetterLogic(Quiet, Fixed(0.3));
            double t = Run(() =>
            {
                if (!game.Match.Lit && !game.Caught) Strike(game.Match);
                game.Update(DT, true, false, 0, 0.3);
            }, () => game.Done);
            InTaskTime(t, "steady burn");
        }
        {
            var game = new LetterLogic(Quiet, Fixed(0.3));
            int frame = 0;
            Run(() =>
            {
                if (!game.Match.Lit) Strike(game.Match);
                game.Update(DT, frame++ % 60 < 30, false, 0, 0.3);
            }, () => game.Done, Cfg("tasks", "maxSec"));
            Expect(!game.Done, "a slipping flame does not burn it in time");
        }
        for (int seed = 1; seed <= 6; seed++)
        {
            var game = new LetterLogic(Quiet, Seeded(seed));
            double t = Run(() =>
            {
                if (!game.Match.Lit && !game.Caught) Strike(game.Match);
                game.Update(DT, Math.Abs(game.Sway) < H("letter", "aimM"), false, 0, 0);
            }, () => game.Done);
            Expect(game.Done && t <= Cfg("tasks", "maxSec"), "still hand burns it, seed " + seed);
        }
        {
            var game = new LetterLogic(Quiet, Fixed(0));
            var seen = new HashSet<double>();
            for (int i = 0; i < 120; i++)
            {
                game.Update(DT, false, false, 0, 0);
                seen.Add(Math.Round(game.Sway * 100, MidpointRounding.AwayFromZero));
            }
            Expect(seen.Max() - seen.Min() > H("letter", "swayM") * 100, "sways in the draught");
        }
    }

    static void Boiler()
    {
        group = "boiler";
        double target = (H("boiler", "startPressure") - (H("boiler", "safeMin") + H("boiler", "safeMax")) / 2) / H("boiler", "dropFullOpen") * H("boiler", "maxOpenDeg");
        {
            var game = new BoilerLogic(Quiet);
            double t = Run(() => game.Update(DT, true, (target - game.OpenDeg) / H("boiler", "degPerPx")), () => game.Done);
            InTaskTime(t, "settles in the safe band");
        }
        {
            var game = new BoilerLogic(Quiet);
            Run(() => game.Update(DT, true, 50), () => game.Done, Cfg("tasks", "maxSec"));
            Expect(!game.Done && game.Pressure < H("boiler", "safeMin"), "wide open drops out of the band");
        }
    }

    static void Portraits()
    {
        group = "portraits";
        Action<PortraitsLogic> steady = game =>
        {
            int i = Array.FindIndex(game.Level, l => !l);
            double tilt = game.Tilt[i];
            int held = Math.Abs(tilt) > 0.5 ? i : -1;
            game.Update(DT, held, held == -1 ? 0 : -Math.Sign(tilt) * Math.Min(Math.Abs(tilt), 3) / H("portraits", "degPerPx"));
        };
        var any = new Random(7);
        foreach (var random in new Func<double>[] { Fixed(0), Fixed(0.99), () => any.NextDouble() })
        {
            var s = new Sounds();
            var game = new PortraitsLogic(s.Play, random);
            double t = Run(() => steady(game), () => game.Done);
            InTaskTime(t, "straightens all three");
            Expect(s.Heard.Contains("thud"), "the haunted one thuds");
        }
        {
            var game = new PortraitsLogic(Quiet, Fixed(0.5));
            for (int i = 0; i < 600; i++) game.Update(DT, -1, 0);
            Expect(!game.Level.Any(l => l), "does not settle crooked");
        }
    }

    static void Switchboard()
    {
        group = "switchboard";
        double mPerPx = H("switchboard", "mPerPx");
        Func<FacePoint[]> hooksOf = () => Enumerable.Range(0, 4).Select(i => new FacePoint(-0.18 + i * 0.12, -0.2)).ToArray();
        Func<FacePoint[]> socketsOf = () => Enumerable.Range(0, 4).Select(i => new FacePoint(-0.18 + i * 0.12, 0.2)).ToArray();
        for (int seed = 1; seed <= 5; seed++)
        {
            var s = new Sounds();
            var sockets = socketsOf();
            var game = new SwitchboardLogic(s.Play, hooksOf(), sockets, Seeded(seed));
            int held = -1;
            double reach = 0;
            double t = Run(() =>
            {
                int next = Array.FindIndex(game.Plugged, p => !p);
                if (held != next)
                {
                    held = -1;
                    reach += DT;
                    if (reach < 0.4) { game.Update(DT, -1, 0, 0); return; }
                    reach = 0;
                    held = next;
                }
                var drag = Toward(game.Plug[next], sockets[game.SocketOf[next]], 0.4, mPerPx);
                game.Update(DT, held, drag[0], drag[1]);
            }, () => game.Done);
            InTaskTime(t, "plugs every cable, seed " + seed);
            Expect(!s.Heard.Contains("spark"), "no sparks, seed " + seed);
        }
        {
            var s = new Sounds();
            var hooks = hooksOf();
            var sockets = socketsOf();
            var game = new SwitchboardLogic(s.Play, hooks, sockets, Seeded(3));
            var wrong = sockets[(game.SocketOf[0] + 1) % 4];
            Run(() => { var d = Toward(game.Plug[0], wrong, 0.4, mPerPx); game.Update(DT, 0, d[0], d[1]); }, () => s.Heard.Count > 0, 5);
            Expect(s.Heard.Count == 1 && s.Heard[0] == "spark", "the wrong socket sparks");
            Expect(game.Plug[0].U == hooks[0].U && game.Plug[0].V == hooks[0].V, "the plug goes back to its hook");
            game.Update(DT, 0, 0, -100);
            Expect(game.Plug[0].U == hooks[0].U && game.Plug[0].V == hooks[0].V, "stays on the hook until grabbed again");
        }
        {
            var hooks = hooksOf();
            var sockets = socketsOf();
            var game = new SwitchboardLogic(Quiet, hooks, sockets, Seeded(2));
            var right = sockets[game.SocketOf[1]];
            Run(() => { var d = Toward(game.Plug[1], right, 0.4, mPerPx); game.Update(DT, 1, d[0], d[1]); }, () => game.Seat > 0, 5);
            game.Update(DT, -1, 0, 0);
            Expect(!game.Plugged[1] && game.Plug[1].U == hooks[1].U && game.Plug[1].V == hooks[1].V, "let go early: back on its hook");
        }
    }

    static void Mirror()
    {
        group = "mirror";
        double mPerPx = H("mirror", "mPerPx");
        Func<double, Action<MirrorLogic>> wiper = speed =>
        {
            var rows = new[] { -0.4, -0.25, -0.1, 0.05, 0.2, 0.35, 0.45 };
            var path = new List<FacePoint>();
            for (int i = 0; i < rows.Length; i++)
            {
                var left = new FacePoint(-0.3, rows[i]);
                var right = new FacePoint(0.3, rows[i]);
                if (i % 2 == 0) { path.Add(left); path.Add(right); } else { path.Add(right); path.Add(left); }
            }
            int at = 0;
            return game =>
            {
                var target = path[Math.Min(at, path.Count - 1)];
                var from = game.Cloth ?? path[0];
                if (game.Cloth != null && FacePoint.Distance(target, from) < 1e-6) at += 1;
                var d = Toward(from, target, speed, mPerPx);
                game.Update(DT, path[0], true, d[0], d[1]);
            };
        };
        for (int seed = 1; seed <= 4; seed++)
        {
            var s = new Sounds();
            var game = new MirrorLogic(s.Play, Seeded(seed));
            var wipe = wiper(0.3);
            double t = Run(() => wipe(game), () => game.Done);
            InTaskTime(t, "steady wiping, seed " + seed);
            Expect(!s.Heard.Contains("scrape"), "no smearing, seed " + seed);
        }
        {
            var s = new Sounds();
            var game = new MirrorLogic(s.Play, Fixed(0.9));
            var wipe = wiper(H("mirror", "maxMPerSec") * 2);
            Run(() => wipe(game), () => false, 5);
            Expect(game.ClearPct < 10 && s.Heard.Contains("scrape"), "scrubbing too fast only smears");
        }
        {
            var s = new Sounds();
            var game = new MirrorLogic(s.Play, Fixed(0));
            var wipe = wiper(0.3);
            Run(() => wipe(game), () => game.Done);
            Expect(s.Count("scare") == 1, "the face shows once");
            var quiet = new Sounds();
            var plain = new MirrorLogic(quiet.Play, Fixed(0.99));
            var wipe2 = wiper(0.3);
            Run(() => wipe2(plain), () => plain.Done);
            Expect(!quiet.Heard.Contains("scare"), "no face when it does not come");
        }
    }

    static void Trunk()
    {
        group = "trunk";
        Action<TrunkLogic, double[]> steady = (game, rest) =>
        {
            if (!game.Shut) { game.Update(DT, true, -1, 0, 400 * DT); return; }
            int next = Array.FindIndex(game.Latch, l => l < 90);
            if (rest[0] > 0 || (next > 0 && game.Latch[next] == 0 && game.PopLeft == H("trunk", "popSec")))
            {
                rest[0] = rest[0] > 0 ? rest[0] - DT : 0.5;
                game.Update(DT, false, -1, 0, 0);
                return;
            }
            game.Update(DT, false, next, 80 * DT, 0);
        };
        {
            var s = new Sounds();
            var game = new TrunkLogic(s.Play);
            var rest = new double[] { 0 };
            double t = Run(() => steady(game, rest), () => game.Done);
            InTaskTime(t, "shuts and latches");
            Expect(!s.Heard.Contains("thud"), "never bursts open");
        }
        {
            var game = new TrunkLogic(Quiet);
            Run(() => game.Update(DT, true, -1, 0, 400 * DT), () => false, H("trunk", "pressSec") / 2);
            Run(() => game.Update(DT, false, -1, 0, 0), () => false, 1);
            Expect(game.Lid == 1 && !game.Shut, "springs open if let go early");
        }
        {
            var s = new Sounds();
            var game = new TrunkLogic(s.Play);
            var rest = new double[] { 0 };
            Run(() => steady(game, rest), () => game.Shut);
            Run(() => game.Update(DT, false, -1, 0, 0), () => false, H("trunk", "popSec") + 0.1);
            Expect(s.Heard.Contains("thud") && !game.Shut && game.Lid == 1, "bursts open if you dawdle");
        }
    }

    static void Sheets()
    {
        group = "sheets";
        {
            var s = new Sounds();
            var game = new SheetsLogic(s.Play);
            double t = Run(() =>
            {
                double px = 200 * DT;
                game.Update(DT, true, game.TowardYou ? 0 : -px, game.TowardYou ? px : 0);
            }, () => game.Done);
            InTaskTime(t, "three steady folds");
            Expect(s.Count("thud") == H("sheets", "folds"), "a thud per fold");
        }
        {
            var game = new SheetsLogic(Quiet);
            game.Update(DT, true, -1000, 0);
            Expect(game.Progress == 0, "only folds the way it goes");
            Run(() => game.Update(DT, true, 0, 1000), () => false, 1);
            Expect(game.Folds == 0 && game.Progress <= H("sheets", "maxPerSec") * 1.2 + 0.01, "no faster than a steady pull");
        }
        {
            var game = new SheetsLogic(Quiet);
            int k = 0;
            double t = Run(() => game.Update(DT, true, 0, k++ % 3 == 0 ? 3 * 170 * DT : 0), () => game.Folds > 0, 10);
            Expect(t < H("sheets", "snapAt") / H("sheets", "maxPerSec") + 0.3, "uneven mouse moves still count");
        }
        {
            var game = new SheetsLogic(Quiet);
            Run(() => game.Update(DT, true, 0, 200 * DT), () => game.Progress > 0.8, 5);
            Run(() => game.Update(DT, false, 0, 0), () => false, 1);
            Expect(game.Progress == 0 && game.Folds == 0, "slides back when let go");
        }
    }

    static void Cradle()
    {
        group = "cradle";
        Action<CradleLogic> steady = game =>
        {
            double push = game.Amplitude < 0.2 ? (game.Speed >= 0 ? 1 : -1) * 250 * DT : 0;
            game.Update(DT, true, push);
        };
        {
            int noise = 0;
            var game = new CradleLogic(Quiet, () => noise++);
            double t = Run(() => steady(game), () => game.Done);
            InTaskTime(t, "rocks the baby to sleep");
            Expect(noise == 0, "no crying");
        }
        {
            var s = new Sounds();
            int noise = 0;
            var game = new CradleLogic(s.Play, () => noise++);
            Run(() => game.Update(DT, true, 2500 * DT), () => false, 0.3);
            Expect(s.Heard.Contains("cry") && noise > 0, "a shove makes it cry");
        }
        {
            int noise = 0;
            var game = new CradleLogic(Quiet, () => noise++);
            Run(() => steady(game), () => game.Calm > 4);
            double calm = game.Calm;
            Run(() => game.Update(DT, true, (game.Speed >= 0 ? 1 : -1) * 600 * DT), () => noise > 0, 5);
            Expect(noise == 1 && game.Calm < calm, "too high a swing cries and takes calm away");
        }
        {
            var game = new CradleLogic(Quiet, None);
            Run(() => game.Update(DT, false, 0), () => false, 5);
            Expect(game.Calm == 0 && H("cradle", "minAmpRad") > 0, "no calm while it barely swings");
        }
    }

    static void Lockbox()
    {
        group = "lockbox";
        double degPerPx = H("lockbox", "degPerPx"), maxDeg = H("lockbox", "maxDegPerSec");
        Action<LockboxLogic, double> steady = (game, degPerSec) =>
        {
            bool right = game.Set % 2 == 0;
            game.Update(DT, true, (right ? 1 : -1) * degPerSec * DT / degPerPx);
        };
        for (int seed = 1; seed <= 8; seed++)
        {
            var s = new Sounds();
            var game = new LockboxLogic(s.Play, Seeded(seed));
            double t = Run(() => steady(game, 60), () => game.Done);
            InRelicTime(t, "opens, seed " + seed);
            Expect(s.Count("click") == H("lockbox", "pins") && s.Heard.Contains("tick"), "a click per pin, seed " + seed);
        }
        for (int seed = 1; seed <= 8; seed++)
        {
            var game = new LockboxLogic(Quiet, Seeded(seed));
            double last = game.Dial;
            bool stiff = true;
            double t = Run(() =>
            {
                steady(game, maxDeg * 10);
                if (Math.Abs(game.Dial - last) > maxDeg * 0.2 + 1e-9) stiff = false;
                last = game.Dial;
            }, () => game.Done);
            Expect(stiff, "a wild drag turns it no faster, seed " + seed);
            InRelicTime(t, "wild drag, seed " + seed);
        }
        {
            var game = new LockboxLogic(Quiet, Seeded(2));
            Action<int> back = sign => Run(() => game.Update(DT, true, sign * 60 * DT / degPerPx), () => false, 3);
            back(-1);
            Expect(game.Dial == 0, "will not turn left first");
            Run(() => steady(game, 60), () => game.Set == 1);
            back(1);
            Expect(game.Dial == game.Pins[0], "will not turn back past the last pin");
        }
    }

    static void Drain()
    {
        group = "drain";
        double feel = H("drain", "feelM"), mPerPx = H("drain", "mPerPx");
        for (int seed = 1; seed <= 20; seed++)
        {
            var game = new DrainLogic(Quiet, Seeded(seed));
            double r = Math.Sqrt(game.Relic.U * game.Relic.U + game.Relic.V * game.Relic.V);
            Expect(r >= H("drain", "relicMinM") && r <= H("drain", "sizeM") / 2, "the relic is away from the middle, seed " + seed);
        }
        for (int seed = 1; seed <= 5; seed++)
        {
            var s = new Sounds();
            var game = new DrainLogic(s.Play, Seeded(seed));
            double feelLeft = 1.5;
            double t = Run(() =>
            {
                if (game.Gripped) { game.Update(DT, true, 0, -150 * DT); return; }
                feelLeft -= DT;
                if (feelLeft > 0) { game.Update(DT, true, 0, 0); return; }
                bool near = FacePoint.Distance(game.Hand, game.Relic) < feel * 0.5;
                var d = near ? new double[] { 0, 0 } : Toward(game.Hand, game.Relic, 0.08, mPerPx);
                game.Update(DT, true, d[0], d[1]);
            }, () => game.Done);
            InRelicTime(t, "pulled up, seed " + seed);
            Expect(s.Heard.Contains("splash"), "the water laps, seed " + seed);
        }
        {
            var game = new DrainLogic(Quiet, Seeded(1));
            int dir = 1;
            Run(() => { dir = -dir; game.Update(DT, true, dir * 200, 0); }, () => false, 10);
            Expect(!game.Gripped, "never grips while thrashing");
        }
        {
            var game = new DrainLogic(Quiet, Seeded(2));
            game.Hand.Set(game.Relic);
            Run(() => game.Update(DT, true, 0, 0), () => game.Gripped, 5);
            Run(() => game.Update(DT, true, 0, -150 * DT), () => game.Pulled > H("drain", "pullPx") / 2, 5);
            game.Update(DT, false, 0, 0);
            Expect(!game.Gripped && game.Pulled == 0, "slips back when let go");
        }
    }

    static void Clock()
    {
        group = "clock";
        double degPerPx = H("clock", "degPerPx"), maxDeg = H("clock", "maxDegPerSec");
        Action<ClockLogic> steady = game =>
        {
            if (game.Right) { game.Update(DT, false, 0); return; }
            double ahead = ((game.Target - game.Minutes) % 720 + 720) % 720;
            int dir = ahead <= 360 ? 1 : -1;
            double want = Math.Min(Math.Abs(ahead <= 360 ? ahead : 720 - ahead) * 6, maxDeg * DT);
            game.Update(DT, true, dir * want / degPerPx);
        };
        foreach (int target in new[] { 0, 7 * 60 + 15, 11 * 60 + 55, 3 * 60 + 40 })
        {
            var s = new Sounds();
            var game = new ClockLogic(s.Play, target);
            Expect(!game.Right, "starts wrong, " + target);
            double t = Run(() => steady(game), () => game.Done);
            Expect(t >= Cfg("tasks", "serverMinSec") && t <= Cfg("tasks", "maxSec"), "set in time, " + target + " (" + t.ToString("0.0") + " s)");
            Expect(s.Heard.Contains("tick") && s.Heard.Last() == "click", "ticks, then clicks, " + target);
        }
        {
            var game = new ClockLogic(Quiet, 0);
            Expect(Math.Abs(game.HourDeg - 180) < 0.005 && Math.Abs(game.MinuteDeg) < 0.005, "stopped at six");
            Run(() => game.Update(DT, true, maxDeg * DT / degPerPx), () => false, 1);
            Expect(Math.Abs(game.MinuteDeg - maxDeg % 360) < 0.5, "the minute hand turns");
            Expect(Math.Abs(game.HourDeg - (180 + maxDeg / 12)) < 0.5, "the hour hand follows");
        }
        {
            var game = new ClockLogic(Quiet, 7 * 60 + 15);
            Run(() => game.Update(DT, false, 0), () => false, 3);
            Expect(!game.Done, "not at the wrong time");
            game.Minutes = game.Target;
            Run(() => game.Update(DT, true, 0), () => false, 3);
            Expect(!game.Done, "not while held");
        }
    }

    static void Piano()
    {
        group = "piano";
        int keys = HandsConfig.I("piano", "keys"), first = HandsConfig.I("piano", "firstNotes");
        Func<PianoLogic, int, Action> player = (game, mistakeAt) =>
        {
            double wait = 0;
            int presses = 0;
            return () =>
            {
                wait -= DT;
                bool ready = !game.Listening && wait <= 0 && game.Ring == 0;
                int pressed = -1;
                if (ready)
                {
                    pressed = presses++ == mistakeAt ? (game.Tune[game.Step] + 1) % keys : game.Tune[game.Step];
                    wait = 0.5;
                }
                game.Update(DT, pressed);
            };
        };
        {
            int noise = 0;
            var game = new PianoLogic(Quiet, () => noise++, Fixed(0.3));
            Expect(game.Listening, "starts by playing");
            var lengths = new List<int>();
            var step = player(game, -1);
            double t = Run(() =>
            {
                if (!game.Listening && game.Step == 0 && (lengths.Count == 0 || lengths.Last() != game.Length)) lengths.Add(game.Length);
                step();
            }, () => game.Done);
            Expect(lengths.SequenceEqual(new[] { first, first + 1, first + 2 }), "one note longer each round");
            InTaskTime(t, "plays it back");
            Expect(noise == 0, "no sour notes");
        }
        {
            var game = new PianoLogic(Quiet, None, SeededRandom(2));
            game.Update(DT, game.Tune[0]);
            Expect(game.Listening && game.Step == 0, "ignores keys while it plays");
        }
        {
            var s = new Sounds();
            int noise = 0;
            var game = new PianoLogic(s.Play, () => noise++, SeededRandom(3));
            var step = player(game, 1);
            Run(step, () => noise > 0);
            Expect(s.Heard.Contains("badNote") && game.Listening && game.Again && game.Round == 0, "a wrong key is sour and replays");
            Run(step, () => game.Done);
            Expect(game.Done, "still finishes after a mistake");
        }
        {
            var game = new PianoLogic(Quiet, None, SeededRandom(4));
            Run(() => game.Update(DT, -1), () => !game.Listening);
            game.Update(DT, -1, true);
            Expect(game.Listening, "plays again when asked");
        }
    }

    static void Roses()
    {
        group = "roses";
        double pourSec = H("roses", "pourSec");
        int count = ((List<object>)HandsConfig.Raw("roses", "puzzles")).Count;
        for (int n = 0; n < count; n++)
        {
            int puzzle = n;
            Func<RosesLogic> make = () => new RosesLogic(Quiet, Fixed((double)puzzle / count + 0.001));
            Func<RosesLogic, string> key = g => string.Join(",", g.Water) + "|" + g.Vase + "|" + g.InHand;
            var all = new List<JugAction>();
            for (int j = 0; j < make().Jugs.Length; j++) { all.Add(new JugAction(JugKind.Pick, j)); all.Add(new JugAction(JugKind.Pour, j)); }
            foreach (var k in new[] { JugKind.PutDown, JugKind.Fill, JugKind.PourVase, JugKind.Empty, JugKind.TipVase }) all.Add(new JugAction(k));
            Func<List<JugAction>, RosesLogic> replay = path =>
            {
                var g = make();
                foreach (var a in path) { g.Act(a); g.Update(pourSec); }
                return g;
            };
            var seen = new HashSet<string> { key(make()) };
            var frontier = new List<List<JugAction>> { new List<JugAction>() };
            List<JugAction> solution = null;
            for (int depth = 0; depth < 30 && frontier.Count > 0 && solution == null; depth++)
            {
                var next = new List<List<JugAction>>();
                foreach (var path in frontier)
                {
                    var g = replay(path);
                    if (g.Done) { solution = path; break; }
                    foreach (var a in all.Where(a => g.Can(a)))
                    {
                        var longer = new List<JugAction>(path) { a };
                        string k = key(replay(longer));
                        if (seen.Contains(k)) continue;
                        seen.Add(k);
                        next.Add(longer);
                    }
                }
                frontier = next;
            }
            Expect(solution != null, "puzzle " + n + " can be solved");
            if (solution != null)
            {
                int pours = solution.Count(a => a.Kind != JugKind.Pick && a.Kind != JugKind.PutDown);
                Expect(pours * pourSec + solution.Count * 0.4 >= Cfg("tasks", "serverMinSec"), "puzzle " + n + " takes the server's minimum");
            }
        }
        {
            var s = new Sounds();
            var game = new RosesLogic(s.Play, Fixed(0));
            int small = game.Jugs[0] < game.Jugs[1] ? 0 : 1, big = 1 - small;
            Action<JugAction> act = a => { Expect(game.Act(a), "can " + a.Kind); game.Update(pourSec); };
            act(new JugAction(JugKind.Pick, big));
            act(new JugAction(JugKind.Fill));
            act(new JugAction(JugKind.Pour, small));
            Expect(game.Water[small] == game.Jugs[small] && game.Water[big] == game.Jugs[big] - game.Jugs[small], "pours until the jug is full");
            act(new JugAction(JugKind.PourVase));
            Expect(game.Vase == game.Jugs[big] - game.Jugs[small] && s.Heard.Contains("splash"), "pours all into the vase");
        }
        {
            var game = new RosesLogic(Quiet, Fixed(0));
            int big = game.Jugs[0] > game.Jugs[1] ? 0 : 1;
            foreach (var a in new[] { new JugAction(JugKind.Pick, big), new JugAction(JugKind.Fill), new JugAction(JugKind.PourVase) })
            {
                game.Act(a);
                game.Update(pourSec);
            }
            Expect(game.Vase > game.Target && !game.Done, "too much is not done");
            Expect(!game.Can(new JugAction(JugKind.TipVase)), "hands full: cannot tip");
            game.Act(new JugAction(JugKind.PutDown));
            Expect(game.Act(new JugAction(JugKind.TipVase)), "tips the vase");
            game.Update(pourSec);
            Expect(game.Vase == 0, "the vase is empty");
        }
        {
            var game = new RosesLogic(Quiet, Fixed(0));
            game.Act(new JugAction(JugKind.Pick, 0));
            game.Act(new JugAction(JugKind.Fill));
            Expect(!game.Can(new JugAction(JugKind.PourVase)), "busy while pouring");
            game.Update(pourSec);
            Expect(game.Can(new JugAction(JugKind.PourVase)), "free once poured");
        }
    }

    static void ClueTime()
    {
        group = "clue time";
        var seen = new HashSet<int>();
        for (int i = 0; i < 300; i++)
        {
            int t = Clue.Time("room" + i, "task-clock");
            Expect(t == Clue.Time("room" + i, "task-clock") && t % 5 == 0 && t > 0 && t < 720, "a five-minute mark, room" + i);
            seen.Add(t);
        }
        Expect(seen.Count > 50, "spread out");
        Expect(Clue.ClockText(7 * 60 + 5) == "7:05" && Clue.ClockText(30) == "12:30", "clock text");
    }
}
