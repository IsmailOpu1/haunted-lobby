using System;
using System.Collections.Generic;
using System.Globalization;
using System.Linq;

namespace Haunted.Sim
{
    // The rules of the hands-on tasks (GDD 26.5), ported from client/src/hands/logic.ts and kept
    // apart from the 3D scene so they can be tested (engine/Tools/check-sim.ps1 runs HandsCheck.cs).
    // Each one is updated every frame with what your hands are doing; mouse movement is in screen
    // pixels. Every number comes from config.tasks.hands / config.relics.hands or is the browser's own.

    /// <summary>Plays a task sound. pitch is a note number for the piano (0 is the lowest key).</summary>
    public delegate void Play(string kind, int pitch = -1);

    /// <summary>config.tasks.hands and config.relics.hands, read from config.json.</summary>
    public static class HandsConfig
    {
        static object root;

        public static void Load(object config) { root = config; }

        static Dictionary<string, object> Section(string task)
        {
            var tasks = (Dictionary<string, object>)Json.Obj(root, "tasks")["hands"];
            object found;
            if (tasks.TryGetValue(task, out found)) return (Dictionary<string, object>)found;
            return (Dictionary<string, object>)((Dictionary<string, object>)Json.Obj(root, "relics")["hands"])[task];
        }

        public static double N(string task, string key) { return Convert.ToDouble(Section(task)[key], CultureInfo.InvariantCulture); }
        public static int I(string task, string key) { return (int)N(task, key); }
        public static double[] List(string task, string key) { return ((List<object>)Section(task)[key]).Select(v => Convert.ToDouble(v, CultureInfo.InvariantCulture)).ToArray(); }
        public static object Raw(string task, string key) { return Section(task)[key]; }
        /// <summary>Any other number in the config, by path ("relics", "search", "closeM").</summary>
        public static double Path(params string[] keys)
        {
            object o = root;
            foreach (var k in keys) o = ((Dictionary<string, object>)o)[k];
            return Convert.ToDouble(o, CultureInfo.InvariantCulture);
        }
    }

    static class HandsMath
    {
        public static double Clamp(double v, double min, double max) { return Math.Max(min, Math.Min(max, v)); }
    }

    /// <summary>
    /// A match in your hand (candelabra, letter): strike it with a sharp downward flick while holding
    /// the button. Turning your view too fast blows it out, and each one only burns so long.
    /// </summary>
    public class MatchLogic
    {
        /// <summary>How long, after a flick starts, its pixels still count toward a strike.</summary>
        const double FlickWindowSec = 0.12;
        /// <summary>A weak flick sparks at most this often.</summary>
        const double SparkEverySec = 0.3;

        readonly Play play;
        /// <summary>Seconds the match still burns, or 0 when it is out.</summary>
        public double BurnLeft;
        /// <summary>Seconds until you can strike a new match.</summary>
        double reach;
        List<double[]> flicks = new List<double[]>(); // [age, px]
        double sparkWait;

        public MatchLogic(Play play) { this.play = play; }

        public bool Lit { get { return BurnLeft > 0; } }

        /// <summary>dragY: pixels moved down while holding the button. lookSpeed: how fast the view turns, rad/s.</summary>
        public void Update(double dt, bool holding, double dragY, double lookSpeed)
        {
            reach = Math.Max(0, reach - dt);
            sparkWait = Math.Max(0, sparkWait - dt);
            if (!Lit) Strike(dt, holding ? dragY : 0);
            else
            {
                BurnLeft -= dt;
                if (BurnLeft <= 0 || lookSpeed > HandsConfig.N("match", "outRadPerSec")) GoOut();
            }
        }

        /// <summary>Puts a lit match out (the job is done).</summary>
        public void Out() { if (Lit) GoOut(); }

        void GoOut()
        {
            BurnLeft = 0;
            reach = HandsConfig.N("match", "newMatchSec");
            play("fizz");
        }

        void Strike(double dt, double dragY)
        {
            foreach (var f in flicks) f[0] += dt;
            flicks = flicks.Where(f => f[0] < FlickWindowSec).ToList();
            // Frames with no mouse event between them are common: let the flick age out instead.
            // Moving back up starts over.
            if (dragY < 0) flicks.Clear();
            if (dragY <= 0) return;
            flicks.Add(new[] { 0, dragY });
            if (reach > 0) return;
            double speed = flicks.Sum(f => f[1]) / FlickWindowSec;
            if (speed >= HandsConfig.N("match", "strikePxPerSec"))
            {
                BurnLeft = HandsConfig.N("match", "burnSec");
                flicks.Clear();
                play("strike");
            }
            else if (speed >= HandsConfig.N("match", "sparkPxPerSec") && sparkWait == 0)
            {
                sparkWait = SparkEverySec;
                play("spark");
            }
        }
    }

    /// <summary>Light the candelabra: strike a match, then hold its flame on each wick until it catches.</summary>
    public class CandelabraLogic
    {
        readonly Play play;
        public readonly MatchLogic Match;
        public readonly bool[] Lit;
        public readonly double[] Heat;

        public CandelabraLogic(Play play)
        {
            this.play = play;
            Match = new MatchLogic(play);
            Lit = new bool[HandsConfig.I("candelabra", "wicks")];
            Heat = new double[Lit.Length];
        }

        public bool MatchLit { get { return Match.Lit; } }
        public bool Done { get { return Lit.All(l => l); } }

        /// <summary>wick: the wick under the flame (the crosshair), or -1. dragY: pixels moved down while holding.</summary>
        public void Update(double dt, int wick, bool holding, double dragY, double lookSpeed)
        {
            Match.Update(dt, holding, dragY, lookSpeed);
            for (int i = 0; i < Lit.Length; i++)
            {
                if (Lit[i]) continue;
                if (Match.Lit && wick == i)
                {
                    Heat[i] += dt;
                    if (Heat[i] >= HandsConfig.N("candelabra", "lightSec"))
                    {
                        Lit[i] = true;
                        play("tick");
                    }
                }
                else Heat[i] = Math.Max(0, Heat[i] - HandsConfig.N("candelabra", "coolPerSec") * dt);
            }
        }
    }

    /// <summary>
    /// Burn the cursed letter: it hangs from the mantel and sways in the draught. Keep a lit match
    /// under it until it catches (it cools whenever the flame slips away), then it burns and drops.
    /// </summary>
    public class LetterLogic
    {
        readonly Play play;
        public readonly MatchLogic Match;
        public double Heat;
        /// <summary>Seconds it has burned, once it caught.</summary>
        public double Burned;
        double time;

        public LetterLogic(Play play, Func<double> random)
        {
            this.play = play;
            Match = new MatchLogic(play);
            // Each letter starts its sway somewhere different.
            time = random() * HandsConfig.N("letter", "swayPeriodSec") * 3;
        }

        public bool Caught { get { return Heat >= HandsConfig.N("letter", "catchSec"); } }
        public bool Done { get { return Burned >= HandsConfig.N("letter", "burnSec"); } }

        /// <summary>How far the letter has swayed sideways now, in meters: an uneven swing, like a draught.</summary>
        public double Sway
        {
            get
            {
                double t = time / HandsConfig.N("letter", "swayPeriodSec") * Math.PI * 2;
                return HandsConfig.N("letter", "swayM") * (0.7 * Math.Sin(t) + 0.3 * Math.Sin(t * 2.7 + 1));
            }
        }

        /// <summary>under: the flame is under the letter.</summary>
        public void Update(double dt, bool under, bool holding, double dragY, double lookSpeed)
        {
            time += dt;
            if (Caught)
            {
                Burned = Math.Min(HandsConfig.N("letter", "burnSec"), Burned + dt);
                return;
            }
            Match.Update(dt, holding, dragY, lookSpeed);
            if (Match.Lit && under)
            {
                Heat += dt;
                if (Caught)
                {
                    play("strike");
                    Match.Out();
                }
            }
            else Heat = Math.Max(0, Heat - HandsConfig.N("letter", "coolPerSec") * dt);
        }
    }

    /// <summary>
    /// Turn the boiler valve: turn the heavy wheel to bring the gauge's needle into the safe band,
    /// and keep it there. The needle follows the wheel slowly and draughts push it about.
    /// </summary>
    public class BoilerLogic
    {
        readonly Play play;
        /// <summary>How far the valve is open, in degrees.</summary>
        public double OpenDeg;
        /// <summary>The needle: pressure from 0 to 1.</summary>
        public double Pressure;
        /// <summary>Seconds the needle has stayed in the safe band.</summary>
        public double SafeFor;
        double time;

        public BoilerLogic(Play play)
        {
            this.play = play;
            Pressure = HandsConfig.N("boiler", "startPressure");
        }

        public bool Done { get { return SafeFor >= HandsConfig.N("boiler", "holdSec"); } }
        public bool Safe { get { return Pressure >= HandsConfig.N("boiler", "safeMin") && Pressure <= HandsConfig.N("boiler", "safeMax"); } }

        /// <summary>holding: the wheel is in your hand. dragX: pixels moved right (opening it) while holding it.</summary>
        public void Update(double dt, bool holding, double dragX)
        {
            if (Done || dt <= 0) return;
            time += dt;
            double maxOpen = HandsConfig.N("boiler", "maxOpenDeg");
            if (holding && dragX != 0)
            {
                double max = HandsConfig.N("boiler", "maxDegPerSec") * dt;
                double turn = HandsMath.Clamp(dragX * HandsConfig.N("boiler", "degPerPx"), -max, max);
                double to = HandsMath.Clamp(OpenDeg + turn, 0, maxOpen);
                if ((to == 0 || to == maxOpen) && to != OpenDeg) play("thud");
                OpenDeg = to;
            }
            double steady = HandsConfig.N("boiler", "startPressure") - HandsConfig.N("boiler", "dropFullOpen") * (OpenDeg / maxOpen);
            double wobble = HandsConfig.N("boiler", "wobble") * (Math.Sin(time * 1.7) * 0.6 + Math.Sin(time * 4.3 + 2) * 0.4);
            Pressure += (steady + wobble - Pressure) * Math.Min(1, HandsConfig.N("boiler", "followPerSec") * dt);
            bool wasSafe = SafeFor > 0;
            SafeFor = Safe ? SafeFor + dt : 0;
            if (Safe && !wasSafe) play("tick");
            if (Done) play("click");
        }
    }

    /// <summary>
    /// Straighten the portraits: grab a crooked one and drag sideways to level it (they are heavy
    /// and turn slowly). Let go when level and it settles. One is haunted and swings crooked once more.
    /// </summary>
    public class PortraitsLogic
    {
        readonly Play play;
        readonly Func<double> random;
        /// <summary>Degrees off level, positive leaning clockwise.</summary>
        public readonly double[] Tilt;
        public readonly bool[] Level;
        readonly double[] settle;
        readonly int haunted;
        bool hauntUsed;

        public PortraitsLogic(Play play, Func<double> random)
        {
            this.play = play;
            this.random = random;
            int count = HandsConfig.I("portraits", "count");
            double min = HandsConfig.N("portraits", "minTiltDeg"), maxT = HandsConfig.N("portraits", "maxTiltDeg");
            Tilt = new double[count];
            for (int i = 0; i < count; i++) Tilt[i] = Side() * (min + (maxT - min) * random());
            Level = new bool[count];
            settle = new double[count];
            haunted = (int)Math.Floor(random() * count);
        }

        public bool Done { get { return Level.All(l => l); } }

        double Side() { return random() < 0.5 ? -1 : 1; }

        /// <summary>held: the portrait in your hand, or -1. dragX: pixels moved right (turning it clockwise).</summary>
        public void Update(double dt, int held, double dragX)
        {
            if (dt <= 0) return;
            for (int i = 0; i < Tilt.Length; i++)
            {
                if (Level[i]) continue;
                if (held == i)
                {
                    double max = HandsConfig.N("portraits", "maxDegPerSec") * dt;
                    Tilt[i] += HandsMath.Clamp(dragX * HandsConfig.N("portraits", "degPerPx"), -max, max);
                    settle[i] = 0;
                    continue;
                }
                if (Math.Abs(Tilt[i]) > HandsConfig.N("portraits", "levelDeg")) continue;
                settle[i] += dt;
                if (settle[i] < HandsConfig.N("portraits", "holdSec")) continue;
                if (i == haunted && !hauntUsed)
                {
                    // It swings crooked again, once.
                    hauntUsed = true;
                    Tilt[i] = Side() * HandsConfig.N("portraits", "hauntedReturnDeg");
                    settle[i] = 0;
                    play("thud");
                    continue;
                }
                Tilt[i] = 0;
                Level[i] = true;
                play("click");
            }
        }
    }
}
