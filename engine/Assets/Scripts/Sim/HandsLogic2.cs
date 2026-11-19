using System;
using System.Linq;

namespace Haunted.Sim
{
    // client/src/hands/logic.ts, second part: shutters, stove, digging, the switchboard.

    /// <summary>
    /// Close the shutters: drag each one shut (dragging right closes it) and hold it until the
    /// latch clicks. The wind pulls them open, and gusts, heard coming as a rising whistle, pull
    /// harder, even on the one you hold. Let one go while it is nearly shut and it slams open.
    /// </summary>
    public class ShuttersLogic
    {
        readonly Play play;
        readonly Action noise;
        readonly Func<double> random;
        /// <summary>1 wide open, 0 shut.</summary>
        public readonly double[] Open;
        public readonly bool[] Latched;
        readonly double[] held;
        string wind = "calm";
        double windLeft;
        int lastHeld = -1;

        public ShuttersLogic(Play play, Action noise, Func<double> random)
        {
            this.play = play;
            this.noise = noise;
            this.random = random;
            int count = HandsConfig.I("shutters", "count");
            Open = Enumerable.Repeat(1.0, count).ToArray();
            Latched = new bool[count];
            held = new double[count];
            windLeft = CalmSec();
        }

        public bool Done { get { return Latched.All(l => l); } }
        public bool Gusting { get { return wind == "gust"; } }

        double CalmSec()
        {
            var every = HandsConfig.List("shutters", "gustEverySec");
            return every[0] + (every[1] - every[0]) * random();
        }

        /// <summary>heldNow: the shutter in your hand, or -1. dragX: pixels moved right while holding it.</summary>
        public void Update(double dt, int heldNow, double dragX)
        {
            windLeft -= dt;
            if (windLeft <= 0)
            {
                if (wind == "calm") { wind = "warning"; windLeft = HandsConfig.N("shutters", "warnSec"); play("whistle"); }
                else if (wind == "warning") { wind = "gust"; windLeft = HandsConfig.N("shutters", "gustSec"); }
                else { wind = "calm"; windLeft = CalmSec(); }
            }
            double gust = wind == "gust" ? HandsConfig.N("shutters", "gustPerSec") : 0;
            for (int i = 0; i < Open.Length; i++)
            {
                if (Latched[i]) continue;
                bool holding = heldNow == i;
                // In your hand only a gust pulls on it, and less than on a loose one.
                double pull = holding ? gust * HandsConfig.N("shutters", "heldGustFactor") : HandsConfig.N("shutters", "windPerSec") + gust;
                double pushed = holding ? dragX / HandsConfig.N("shutters", "pxToClose") : 0;
                Open[i] = Math.Min(1, Math.Max(0, Open[i] + pull * dt - pushed));
                if (holding && Open[i] <= HandsConfig.N("shutters", "latchAt"))
                {
                    held[i] += dt;
                    if (held[i] >= HandsConfig.N("shutters", "latchSec"))
                    {
                        Latched[i] = true;
                        Open[i] = 0;
                        play("click");
                    }
                }
                else held[i] = 0;
            }
            // Letting go of a nearly shut shutter: the wind throws it open with a bang.
            int letGo = lastHeld;
            if (letGo != -1 && heldNow != letGo && !Latched[letGo] && Open[letGo] < HandsConfig.N("shutters", "slamBelow"))
            {
                Open[letGo] = 1;
                play("bang");
                noise();
            }
            lastHeld = heldNow;
        }

        /// <summary>How long the shutter has been held shut, 0 to 1, for the latch's sound and look.</summary>
        public double LatchProgress(int i) { return Math.Min(1, held[i] / HandsConfig.N("shutters", "latchSec")); }
    }

    /// <summary>
    /// Turn off the stove: turn each knob to its narrow "off" notch at 0 degrees. Turned slowly it
    /// clicks into the notch and its flame dies; turned fast it slips past and the gas hisses on
    /// the other side. A knob in the notch needs a firm push to leave it.
    /// </summary>
    public class StoveLogic
    {
        readonly Play play;
        /// <summary>Degrees; the notch is at 0.</summary>
        public readonly double[] Angle;
        /// <summary>1 full flame, 0 out.</summary>
        public readonly double[] Flame;
        public readonly bool[] InNotch;
        readonly double[] push;

        public StoveLogic(Play play, Func<double> random)
        {
            this.play = play;
            int knobs = HandsConfig.I("stove", "knobs");
            double min = HandsConfig.N("stove", "startMinDeg"), max = HandsConfig.N("stove", "startMaxDeg");
            Angle = new double[knobs];
            for (int i = 0; i < knobs; i++) Angle[i] = min + (max - min) * random();
            Flame = Enumerable.Repeat(1.0, knobs).ToArray();
            InNotch = new bool[knobs];
            push = new double[knobs];
        }

        public bool Done { get { return Flame.All(f => f == 0); } }

        /// <summary>i: the knob in your hand, or -1. dragX: pixels moved right (clockwise) while holding it.</summary>
        public void Update(double dt, int i, double dragX)
        {
            double notch = HandsConfig.N("stove", "notchDeg");
            if (i != -1 && dragX != 0 && dt > 0)
            {
                double turn = dragX * HandsConfig.N("stove", "degPerPx");
                if (InNotch[i])
                {
                    push[i] += turn;
                    if (Math.Abs(push[i]) > HandsConfig.N("stove", "detentDeg"))
                    {
                        // Pushed out of the notch: the gas comes back on.
                        InNotch[i] = false;
                        Angle[i] = Math.Sign(push[i]) * (notch / 2 + 1);
                        Flame[i] = 1;
                        play("hiss");
                    }
                }
                else
                {
                    double from = Angle[i], to = from + turn;
                    bool reaches = Math.Abs(to) <= notch / 2 || Math.Sign(to) != Math.Sign(from);
                    if (reaches && Math.Abs(turn) / dt <= HandsConfig.N("stove", "catchDegPerSec"))
                    {
                        InNotch[i] = true;
                        Angle[i] = 0;
                        push[i] = 0;
                        play("click");
                    }
                    else
                    {
                        Angle[i] = to;
                        if (Math.Sign(to) != Math.Sign(from)) play("hiss");
                    }
                }
            }
            for (int k = 0; k < Flame.Length; k++)
                Flame[k] = InNotch[k] ? Math.Max(0, Flame[k] - dt / HandsConfig.N("stove", "settleSec")) : 1;
        }
    }

    /// <summary>
    /// Dig in soil with a trowel: scoop by moving the mouse down while holding the button. A short
    /// dig tells you whether the relic is there; if the server says it is, keep digging to take it.
    /// Frantic scooping counts for less and throws soil about, which the ghost can hear.
    /// </summary>
    public class DigLogic
    {
        /// <summary>How long a moment the digging pace is judged over.</summary>
        public const double PaceSec = 0.2;
        /// <summary>Scooping makes a sound every this many pixels of soil moved.</summary>
        const double ScoopSoundPx = 160;

        readonly Play play;
        readonly Action noise;
        public double Dug;
        /// <summary>The server said this place holds the relic.</summary>
        public bool Found;
        double scoopSound;
        /// <summary>Steady scooping not yet used: mouse events bunch up between frames, so the pace is judged over a moment.</summary>
        double allowance;

        public DigLogic(Play play, Action noise)
        {
            this.play = play;
            this.noise = noise;
            allowance = HandsConfig.N("dig", "maxPxPerSec") * PaceSec;
        }

        /// <summary>Pixels of scooping until this stage is done: the search, then the taking.</summary>
        public double Needed { get { return Found ? HandsConfig.N("dig", "searchPx") + HandsConfig.N("dig", "takePx") : HandsConfig.N("dig", "searchPx"); } }
        public bool Done { get { return Dug >= Needed; } }
        /// <summary>How much of the soil is dug out, 0 to 1.</summary>
        public double Depth { get { return Math.Min(1, Dug / (HandsConfig.N("dig", "searchPx") + HandsConfig.N("dig", "takePx"))); } }

        /// <summary>The server says the relic is here: carry on digging.</summary>
        public void SetFound() { Found = true; }

        public void Update(double dt, bool onSoil, bool holding, double dragY)
        {
            double maxPx = HandsConfig.N("dig", "maxPxPerSec");
            if (dt > 0) allowance = Math.Min(maxPx * PaceSec, allowance + maxPx * dt);
            if (!onSoil || !holding || dragY <= 0 || dt <= 0 || Done) return;
            double moved = dragY;
            if (moved > allowance)
            {
                moved = allowance + (moved - allowance) * HandsConfig.N("dig", "fastFactor");
                noise();
            }
            allowance = Math.Max(0, allowance - dragY);
            Dug = Math.Min(Needed, Dug + moved);
            scoopSound += moved;
            if (scoopSound >= ScoopSoundPx)
            {
                scoopSound = 0;
                play("scrape");
            }
        }
    }

    /// <summary>A point on a flat face of a station (a switchboard, a mirror, a drain), in meters: u right, v up.</summary>
    public class FacePoint
    {
        public double U, V;
        public FacePoint(double u, double v) { U = u; V = v; }
        public FacePoint Copy() { return new FacePoint(U, V); }
        public void Set(FacePoint p) { U = p.U; V = p.V; }
        public static double Distance(FacePoint a, FacePoint b) { return Math.Sqrt((a.U - b.U) * (a.U - b.U) + (a.V - b.V) * (a.V - b.V)); }

        /// <summary>Moves a point by mouse pixels (right, down), no further than maxM; returns how far it moved.</summary>
        public static double Drag(FacePoint p, double dragX, double dragY, double mPerPx, double maxM)
        {
            double du = dragX * mPerPx, dv = -dragY * mPerPx;
            double d = Math.Sqrt(du * du + dv * dv);
            if (d > maxM && d > 0) { du *= maxM / d; dv *= maxM / d; }
            p.U += du;
            p.V += dv;
            return Math.Min(d, maxM);
        }
    }

    /// <summary>
    /// A speed limit judged over a short moment (PaceSec) rather than frame by frame, so mouse
    /// movement that arrives unevenly between frames is not thrown away.
    /// </summary>
    public class Pace
    {
        readonly double perSec;
        double left;

        public Pace(double perSec) { this.perSec = perSec; left = perSec * DigLogic.PaceSec; }

        /// <summary>How much may move this frame.</summary>
        public double Room(double dt)
        {
            left = Math.Min(perSec * DigLogic.PaceSec, left + perSec * Math.Max(0, dt));
            return left;
        }

        /// <summary>Moves want (either way), no further than the room left; returns how far it moved.</summary>
        public double Take(double dt, double want)
        {
            double room = Room(dt);
            double got = Math.Sign(want) * Math.Min(Math.Abs(want), room);
            left -= Math.Abs(got);
            return got;
        }

        public void Use(double amount) { left = Math.Max(0, left - amount); }
    }

    public static class Shuffle
    {
        public static int[] Of(int n, Func<double> random)
        {
            var o = Enumerable.Range(0, n).ToArray();
            for (int i = n - 1; i > 0; i--)
            {
                int j = (int)Math.Floor(random() * (i + 1));
                int t = o[i]; o[i] = o[j]; o[j] = t;
            }
            return o;
        }
    }

    /// <summary>
    /// Repair the switchboard: take each plug off its hook and drag it onto the socket of the same
    /// colour, then hold it there while it seats. The wrong socket sparks and throws the plug back.
    /// </summary>
    public class SwitchboardLogic
    {
        readonly Play play;
        readonly FacePoint[] hooks, sockets;
        /// <summary>Where each plug is now.</summary>
        public readonly FacePoint[] Plug;
        public readonly bool[] Plugged;
        /// <summary>The socket each cable belongs in (sockets are coloured in a shuffled order).</summary>
        public readonly int[] SocketOf;
        /// <summary>How long the plug in hand has been held in its socket.</summary>
        public double Seat;
        int holding = -1;
        readonly Pace pace;
        /// <summary>After a spark or a seated plug, the button must be let go before grabbing again.</summary>
        bool waitForRelease;

        public SwitchboardLogic(Play play, FacePoint[] hooks, FacePoint[] sockets, Func<double> random)
        {
            this.play = play;
            this.hooks = hooks;
            this.sockets = sockets;
            Plug = hooks.Select(h => h.Copy()).ToArray();
            Plugged = new bool[hooks.Length];
            SocketOf = Shuffle.Of(sockets.Length, random);
            pace = new Pace(HandsConfig.N("switchboard", "maxMPerSec"));
        }

        public bool Done { get { return Plugged.All(p => p); } }

        /// <summary>heldIn: the plug you grabbed, or -1. dragX/dragY: pixels moved right and down while holding it.</summary>
        public void Update(double dt, int heldIn, double dragX, double dragY)
        {
            if (heldIn == -1) waitForRelease = false;
            int held = waitForRelease || (heldIn != -1 && Plugged[heldIn]) ? -1 : heldIn;
            if (held != holding)
            {
                // Let go before it seated: the cable pulls it back to its hook.
                if (holding != -1 && !Plugged[holding]) ToHook(holding);
                holding = held;
                Seat = 0;
            }
            int h = holding;
            if (h == -1 || dt <= 0) return;
            var p = Plug[h];
            pace.Use(FacePoint.Drag(p, dragX, dragY, HandsConfig.N("switchboard", "mPerPx"), pace.Room(dt)));
            int near = Array.FindIndex(sockets, s => FacePoint.Distance(s, p) < HandsConfig.N("switchboard", "snapM"));
            if (near == -1)
            {
                Seat = 0;
                return;
            }
            bool taken = false;
            for (int k = 0; k < Plugged.Length; k++) if (Plugged[k] && SocketOf[k] == near) taken = true;
            if (near != SocketOf[h] || taken)
            {
                play("spark");
                Release(h);
                ToHook(h);
                return;
            }
            p.Set(sockets[near]);
            Seat += dt;
            if (Seat >= HandsConfig.N("switchboard", "seatSec"))
            {
                Plugged[h] = true;
                play("click");
                Release(h);
            }
        }

        void Release(int h)
        {
            if (holding == h) holding = -1;
            waitForRelease = true;
            Seat = 0;
        }

        void ToHook(int h) { Plug[h].Set(hooks[h]); }
    }
}
