using System;
using System.Collections.Generic;
using System.Linq;

namespace Haunted.Sim
{
    // client/src/hands/logic.ts, third part: mirror, trunk, sheets, cradle, lockbox, drain, and the
    // puzzle tasks (clock, piano, roses).

    /// <summary>
    /// Wipe the fogged mirror: hold the button on the glass and rub with a cloth. Rub too hard and
    /// it only smears. Sometimes a face shows in the glass once enough is clear.
    /// </summary>
    public class MirrorLogic
    {
        /// <summary>A smear makes its scrape at most this often.</summary>
        const double SmearSoundSec = 0.35;

        readonly Play play;
        /// <summary>Fog on each patch of glass, row by row from the bottom left: 1 fogged, 0 clean.</summary>
        public readonly int[] Fog;
        /// <summary>Where the cloth is on the glass while you wipe, or null.</summary>
        public FacePoint Cloth;
        /// <summary>Seconds the face still shows, or 0.</summary>
        public double FaceLeft;
        /// <summary>How fast the cloth moves, smoothed, in m/s.</summary>
        public double Speed;
        bool faceComing;
        double smearWait;

        public MirrorLogic(Play play, Func<double> random)
        {
            this.play = play;
            Fog = Enumerable.Repeat(1, HandsConfig.I("mirror", "cols") * HandsConfig.I("mirror", "rows")).ToArray();
            faceComing = random() < HandsConfig.N("mirror", "faceChance");
        }

        public double ClearPct { get { return 100.0 * Fog.Count(f => f == 0) / Fog.Length; } }
        public bool Done { get { return ClearPct >= HandsConfig.N("mirror", "clearPct"); } }

        /// <summary>The middle of a patch of glass, from the mirror's middle.</summary>
        public FacePoint Cell(int i)
        {
            int cols = HandsConfig.I("mirror", "cols"), rows = HandsConfig.I("mirror", "rows");
            int col = i % cols, row = i / cols;
            return new FacePoint(((col + 0.5) / cols - 0.5) * HandsConfig.N("mirror", "widthM"), ((row + 0.5) / rows - 0.5) * HandsConfig.N("mirror", "heightM"));
        }

        /// <summary>grab: where the crosshair is on the glass (null when off it). holding: the button is down.</summary>
        public void Update(double dt, FacePoint grab, bool holding, double dragX, double dragY)
        {
            if (dt <= 0) return;
            FaceLeft = Math.Max(0, FaceLeft - dt);
            smearWait = Math.Max(0, smearWait - dt);
            if (!holding)
            {
                Cloth = null;
                Speed = 0;
                return;
            }
            if (Cloth == null)
            {
                if (grab == null) return;
                Cloth = grab.Copy();
            }
            double w = HandsConfig.N("mirror", "widthM"), h = HandsConfig.N("mirror", "heightM");
            double moved = FacePoint.Drag(Cloth, dragX, dragY, HandsConfig.N("mirror", "mPerPx"), double.PositiveInfinity);
            Cloth.U = HandsMath.Clamp(Cloth.U, -w / 2, w / 2);
            Cloth.V = HandsMath.Clamp(Cloth.V, -h / 2, h / 2);
            Speed += (moved / dt - Speed) * Math.Min(1, dt / HandsConfig.N("mirror", "paceSec"));
            if (Speed > HandsConfig.N("mirror", "maxMPerSec"))
            {
                if (smearWait == 0)
                {
                    smearWait = SmearSoundSec;
                    play("scrape");
                }
                return;
            }
            if (moved == 0) return;
            double brush = HandsConfig.N("mirror", "brushM");
            for (int i = 0; i < Fog.Length; i++)
                if (Fog[i] != 0 && FacePoint.Distance(Cell(i), Cloth) <= brush) Fog[i] = 0;
            if (faceComing && ClearPct >= HandsConfig.N("mirror", "faceAtPct"))
            {
                faceComing = false;
                FaceLeft = HandsConfig.N("mirror", "faceSec");
                play("scare");
            }
        }
    }

    /// <summary>
    /// Seal the old trunk: press the sprung lid down and hold it until it clicks shut, then turn each
    /// latch a quarter. Dawdle between latches and the lid bursts open again.
    /// </summary>
    public class TrunkLogic
    {
        readonly Play play;
        /// <summary>How far the lid is open: 1 sprung up, 0 shut.</summary>
        public double Lid = 1;
        /// <summary>Seconds the lid has been held shut.</summary>
        public double Pressed;
        public bool Shut;
        /// <summary>Each latch's turn, 0 to 90 degrees.</summary>
        public readonly double[] Latch;
        /// <summary>Seconds left to turn the next latch before the lid bursts open.</summary>
        public double PopLeft;
        readonly Pace pace;

        public TrunkLogic(Play play)
        {
            this.play = play;
            Latch = new double[HandsConfig.I("trunk", "latches")];
            pace = new Pace(HandsConfig.N("trunk", "maxDegPerSec"));
        }

        public bool Done { get { return Latch.All(l => l >= 90); } }

        /// <summary>onLid: holding the lid. latch: the latch in your hand, or -1. dragX/dragY: pixels right and down.</summary>
        public void Update(double dt, bool onLid, int latch, double dragX, double dragY)
        {
            if (dt <= 0 || Done) return;
            if (!Shut)
            {
                if (onLid) Lid = HandsMath.Clamp(Lid - dragY / HandsConfig.N("trunk", "pressPx"), 0, 1);
                else Lid = Math.Min(1, Lid + HandsConfig.N("trunk", "springPerSec") * dt);
                Pressed = onLid && Lid == 0 ? Pressed + dt : 0;
                if (Pressed >= HandsConfig.N("trunk", "pressSec"))
                {
                    Shut = true;
                    PopLeft = HandsConfig.N("trunk", "popSec");
                    play("click");
                }
                return;
            }
            PopLeft -= dt;
            if (PopLeft <= 0)
            {
                // It bursts open: start again.
                Shut = false;
                Lid = 1;
                Pressed = 0;
                for (int k = 0; k < Latch.Length; k++) Latch[k] = 0;
                play("thud");
                return;
            }
            int i = latch;
            if (i == -1 || Latch[i] >= 90) return;
            Latch[i] = HandsMath.Clamp(Latch[i] + pace.Take(dt, dragX * HandsConfig.N("trunk", "degPerPx")), 0, 90);
            if (Latch[i] >= 90)
            {
                PopLeft = HandsConfig.N("trunk", "popSec");
                play("click");
            }
        }
    }

    /// <summary>
    /// Fold the bedsheets: fold the sheet in half three times. Grab it and pull: toward you for the
    /// first and last folds, from right to left for the middle one. Let go early and it slides back.
    /// </summary>
    public class SheetsLogic
    {
        readonly Play play;
        public int Folds;
        /// <summary>How far through the current fold, 0 to 1.</summary>
        public double Progress;
        readonly Pace pace;

        public SheetsLogic(Play play)
        {
            this.play = play;
            pace = new Pace(HandsConfig.N("sheets", "maxPerSec"));
        }

        public bool Done { get { return Folds >= HandsConfig.I("sheets", "folds"); } }
        /// <summary>Whether the current fold pulls toward you (down the screen) rather than right to left.</summary>
        public bool TowardYou { get { return Folds % 2 == 0; } }

        /// <summary>held: holding the sheet. dragX/dragY: pixels moved right and down while holding it.</summary>
        public void Update(double dt, bool held, double dragX, double dragY)
        {
            if (dt <= 0 || Done) return;
            if (!held)
            {
                Progress = Math.Max(0, Progress - HandsConfig.N("sheets", "dropPerSec") * dt);
                return;
            }
            double pull = (TowardYou ? dragY : -dragX) / HandsConfig.N("sheets", "pxPerFold");
            Progress = HandsMath.Clamp(Progress + pace.Take(dt, pull), 0, 1);
            if (Progress >= HandsConfig.N("sheets", "snapAt"))
            {
                Folds += 1;
                Progress = 0;
                play("thud");
            }
        }
    }

    /// <summary>
    /// Rock the cradle: it swings on its own; push it gently in time with its swing to keep the
    /// baby calm. Too big a swing, or a hard shove, and the baby cries, which the ghost can hear.
    /// </summary>
    public class CradleLogic
    {
        /// <summary>How long a moment a push's speed is judged over.</summary>
        public const double PushPaceSec = 0.15;

        readonly Play play;
        readonly Action noise;
        /// <summary>The swing, in radians, and how fast it is moving.</summary>
        public double Angle, Speed;
        /// <summary>Seconds of calm so far.</summary>
        public double Calm;
        /// <summary>Seconds the baby still cries.</summary>
        public double Crying;
        double pushSpeed;

        public CradleLogic(Play play, Action noise)
        {
            this.play = play;
            this.noise = noise;
        }

        public bool Done { get { return Calm >= HandsConfig.N("cradle", "fillSec"); } }

        /// <summary>How far the cradle swings each way now, in radians.</summary>
        public double Amplitude
        {
            get
            {
                double w = 2 * Math.PI / HandsConfig.N("cradle", "periodSec");
                double s = Speed / w;
                return Math.Sqrt(Angle * Angle + s * s);
            }
        }

        /// <summary>held: your hand is on the cradle. dragX: pixels pushed right.</summary>
        public void Update(double dt, bool held, double dragX)
        {
            if (dt <= 0 || Done) return;
            double w = 2 * Math.PI / HandsConfig.N("cradle", "periodSec");
            double push = held ? dragX : 0;
            pushSpeed += (Math.Abs(push) / dt - pushSpeed) * Math.Min(1, dt / PushPaceSec);
            Speed += (-w * w * Angle - HandsConfig.N("cradle", "dampPerSec") * Speed) * dt + push * HandsConfig.N("cradle", "pushRadPerPx");
            Angle += Speed * dt;
            Crying = Math.Max(0, Crying - dt);
            double amp = Amplitude;
            if (amp > HandsConfig.N("cradle", "cryAmpRad") || pushSpeed > HandsConfig.N("cradle", "cryPxPerSec"))
            {
                if (Crying == 0)
                {
                    play("cry");
                    noise();
                    Calm = Math.Max(0, Calm - HandsConfig.N("cradle", "cryLoseSec"));
                }
                Crying = HandsConfig.N("cradle", "cryPauseSec");
                return;
            }
            if (Crying == 0 && amp >= HandsConfig.N("cradle", "minAmpRad") && amp <= HandsConfig.N("cradle", "maxAmpRad")) Calm += dt;
        }
    }

    /// <summary>
    /// Open the jewellery box (a relic spot): a dial lock. Turn the dial right until the first pin
    /// clicks, then left to the next, and so on. The dial is stiff, so dragging faster does not turn
    /// it faster, and it can never skip a pin.
    /// </summary>
    public class LockboxLogic
    {
        readonly Play play;
        /// <summary>The dial, in degrees turned right from where it started.</summary>
        public double Dial;
        /// <summary>Where each pin is, in the same degrees.</summary>
        public readonly double[] Pins;
        /// <summary>Pins set so far.</summary>
        public int Set;
        readonly Pace stiff;

        public LockboxLogic(Play play, Func<double> random)
        {
            this.play = play;
            stiff = new Pace(HandsConfig.N("lockbox", "maxDegPerSec"));
            int count = HandsConfig.I("lockbox", "pins");
            double min = HandsConfig.N("lockbox", "minGapDeg"), max = HandsConfig.N("lockbox", "maxGapDeg");
            Pins = new double[count];
            double at = 0;
            for (int i = 0; i < count; i++)
            {
                // Right to the first pin, left to the second, and so on.
                double gap = min + (max - min) * random();
                at += (i % 2 == 0 ? 1 : -1) * gap;
                Pins[i] = at;
            }
        }

        public bool Done { get { return Set >= Pins.Length; } }

        /// <summary>held: the dial is in your hand. dragX: pixels moved right (turning it right).</summary>
        public void Update(double dt, bool held, double dragX)
        {
            if (dt <= 0 || Done) return;
            double turn = stiff.Take(dt, held ? dragX * HandsConfig.N("lockbox", "degPerPx") : 0);
            if (turn == 0) return;
            double from = Dial;
            // The last pin set stops the dial turning back the wrong way, so no turning is wasted.
            double stop = Set == 0 ? 0 : Pins[Set - 1];
            double to = Set % 2 == 0 ? Math.Max(stop, from + turn) : Math.Min(stop, from + turn);
            if (to == from) return;
            Dial = to;
            double tick = HandsConfig.N("lockbox", "tickDeg");
            if (Math.Floor(from / tick) != Math.Floor(to / tick)) play("tick");
            double pin = Pins[Set];
            bool rightward = Set % 2 == 0;
            bool passes = rightward ? from < pin && to >= pin : from > pin && to <= pin;
            if (passes)
            {
                Set += 1;
                play("click");
            }
        }
    }

    /// <summary>
    /// Reach into the drain (a relic spot): feel about in the dark water for the relic. Near it the
    /// water ripples and laps louder. Hold still on it to grip it, then pull it up; let go while
    /// pulling and it slips back.
    /// </summary>
    public class DrainLogic
    {
        const double LapSlowestSec = 0.9;
        const double LapFastestSec = 0.25;

        readonly Play play;
        /// <summary>Your hand in the water, from the drain's middle: u to the right, v away from you.</summary>
        public readonly FacePoint Hand = new FacePoint(0, 0);
        public readonly FacePoint Relic;
        /// <summary>Seconds you have held still on the relic.</summary>
        public double Grip;
        public bool Gripped;
        /// <summary>Pixels pulled up so far.</summary>
        public double Pulled;
        double speed;
        double lapWait;
        readonly Pace reach, pull;

        public DrainLogic(Play play, Func<double> random)
        {
            this.play = play;
            reach = new Pace(HandsConfig.N("drain", "maxMPerSec"));
            pull = new Pace(HandsConfig.N("drain", "pullPxPerSec"));
            double angle = random() * Math.PI * 2;
            double min = HandsConfig.N("drain", "relicMinM");
            double r = min + (HandsConfig.N("drain", "sizeM") / 2 - 0.04 - min) * random();
            Relic = new FacePoint(Math.Cos(angle) * r, Math.Sin(angle) * r);
        }

        public bool Done { get { return Pulled >= HandsConfig.N("drain", "pullPx"); } }

        /// <summary>How near the hand is to the relic, 0 (far) to 1 (on it): the ripple you see and hear.</summary>
        public double Closeness { get { return Math.Max(0, 1 - FacePoint.Distance(Hand, Relic) / (HandsConfig.N("drain", "feelM") * 3)); } }

        /// <summary>holding: your hand is in the water. dragX/dragY: pixels moved right and down.</summary>
        public void Update(double dt, bool holding, double dragX, double dragY)
        {
            if (dt <= 0 || Done) return;
            lapWait = Math.Max(0, lapWait - dt);
            if (Gripped)
            {
                if (!holding)
                {
                    // It slips back into the water.
                    Gripped = false;
                    Grip = 0;
                    Pulled = 0;
                    play("splash");
                    return;
                }
                Pulled += Math.Max(0, pull.Take(dt, Math.Max(0, -dragY)));
                if (Done) play("click");
                return;
            }
            if (!holding)
            {
                Grip = 0;
                speed = 0;
                return;
            }
            double moved = FacePoint.Drag(Hand, dragX, dragY, HandsConfig.N("drain", "mPerPx"), reach.Room(dt));
            reach.Use(moved);
            double half = HandsConfig.N("drain", "sizeM") / 2;
            Hand.U = HandsMath.Clamp(Hand.U, -half, half);
            Hand.V = HandsMath.Clamp(Hand.V, -half, half);
            speed += (moved / dt - speed) * Math.Min(1, dt / CradleLogic.PushPaceSec);
            // The water laps against your hand, quicker the nearer the relic.
            if (Closeness > 0 && lapWait == 0)
            {
                lapWait = LapSlowestSec - (LapSlowestSec - LapFastestSec) * Closeness;
                play("splash");
            }
            bool on = FacePoint.Distance(Hand, Relic) <= HandsConfig.N("drain", "feelM");
            Grip = on && speed <= HandsConfig.N("drain", "stillMPerSec") ? Grip + dt : 0;
            if (Grip >= HandsConfig.N("drain", "grabSec"))
            {
                Gripped = true;
                play("thud");
            }
        }
    }

    // ---------- Puzzle tasks (the pilot of GDD 26.5's brain-game tasks) ----------

    public static class Clue
    {
        /// <summary>
        /// The time a station's clue gives (the clock's guest book), the same on every screen in a
        /// match: a five-minute mark, never twelve o'clock exactly. In minutes past twelve (0 to 715).
        /// </summary>
        public static int Time(string seed, string stationId)
        {
            // FNV-1a, as the browser does it.
            uint h = 0x811c9dc5;
            foreach (char ch in seed + "/" + stationId) h = unchecked((h ^ ch) * 0x01000193u);
            int minutes = (int)(h % 144) * 5;
            return minutes == 0 ? 15 : minutes;
        }

        /// <summary>A time in minutes past twelve as a clock shows it: "7:05", "12:30".</summary>
        public static string ClockText(int minutes)
        {
            int hour = minutes / 60;
            return (hour == 0 ? 12 : hour) + ":" + (minutes % 60).ToString("00");
        }

        /// <summary>The short way between two times on a clock face, in minutes.</summary>
        public static double Gap(double a, double b)
        {
            double d = ((a - b) % 720 + 720) % 720;
            return Math.Min(d, 720 - d);
        }
    }

    /// <summary>
    /// Set the grandfather clock: it has stopped, and the guest book in the hall says when the house
    /// must be woken. Grab the clock face and drag to turn the minute hand (the hour hand follows).
    /// Let go with the hands at that time and the clock starts again.
    /// </summary>
    public class ClockLogic
    {
        readonly Play play;
        /// <summary>The time the hands show, in minutes past twelve (0 to 719).</summary>
        public double Minutes;
        /// <summary>Seconds the hands have rested on the right time.</summary>
        public double Settled;
        public readonly int Target;
        readonly Pace pace;

        /// <summary>target: the time in the guest book, in minutes past twelve.</summary>
        public ClockLogic(Play play, int target)
        {
            this.play = play;
            Target = target;
            pace = new Pace(HandsConfig.N("clock", "maxDegPerSec"));
            // Stopped half a day round from it, so either way round is the same long turn.
            Minutes = (target + 360) % 720;
        }

        public bool Done { get { return Settled >= HandsConfig.N("clock", "settleSec"); } }
        /// <summary>The hands, in degrees clockwise from twelve.</summary>
        public double MinuteDeg { get { return (Minutes % 60) * 6; } }
        public double HourDeg { get { return Minutes / 720 * 360; } }
        /// <summary>Whether the hands show the time in the book.</summary>
        public bool Right { get { return Clue.Gap(Minutes, Target) <= HandsConfig.N("clock", "toleranceMin"); } }

        /// <summary>held: the clock face is in your hand. dragX: pixels moved right (clockwise).</summary>
        public void Update(double dt, bool held, double dragX)
        {
            if (dt <= 0 || Done) return;
            if (!held)
            {
                Settled = Right ? Settled + dt : 0;
                if (Done) play("click");
                return;
            }
            Settled = 0;
            double turn = pace.Take(dt, dragX * HandsConfig.N("clock", "degPerPx")) / 6;
            if (turn == 0) return;
            double tick = HandsConfig.N("clock", "tickMin");
            double before = Math.Floor(Minutes / tick);
            Minutes = ((Minutes + turn) % 720 + 720) % 720;
            if (Math.Floor(Minutes / tick) != before) play("tick");
        }
    }

    /// <summary>
    /// Tune the piano by ear: it plays a short tune, its keys going down as it plays. Play it back.
    /// Each round the tune gets one note longer. A wrong key is a sour note the ghost can hear, and
    /// the piano plays the tune again.
    /// </summary>
    public class PianoLogic
    {
        readonly Play play;
        readonly Action noise;
        public int Round;
        /// <summary>The whole tune; each round plays the first firstNotes + round notes of it.</summary>
        public readonly int[] Tune;
        /// <summary>True while the piano plays the tune, false while it waits for you.</summary>
        public bool Listening = true;
        /// <summary>The next note to sound (listening) or to press (playing).</summary>
        public int Step;
        /// <summary>The key the piano is sounding now, for the keys to move, or -1.</summary>
        public int Showing = -1;
        /// <summary>Seconds a pressed key still rings, before the next can go down.</summary>
        public double Ring;
        /// <summary>True after a wrong note, until you play the tune through.</summary>
        public bool Again;
        double wait;

        public PianoLogic(Play play, Action noise, Func<double> random)
        {
            this.play = play;
            this.noise = noise;
            int keys = HandsConfig.I("piano", "keys");
            var tune = new List<int>();
            int count = HandsConfig.I("piano", "firstNotes") + HandsConfig.I("piano", "rounds") - 1;
            for (int i = 0; i < count; i++)
            {
                int key = (int)Math.Floor(random() * keys);
                // Never the same key twice running, so every note is a new key to find.
                if (i > 0 && key == tune[i - 1]) key = (key + 1) % keys;
                tune.Add(key);
            }
            Tune = tune.ToArray();
            wait = HandsConfig.N("piano", "listenPauseSec");
        }

        public bool Done { get { return Round >= HandsConfig.I("piano", "rounds"); } }
        /// <summary>How many notes this round's tune has.</summary>
        public int Length { get { return HandsConfig.I("piano", "firstNotes") + Math.Min(Round, HandsConfig.I("piano", "rounds") - 1); } }

        /// <summary>Plays the tune again from the start, after a pause.</summary>
        void Listen(double pauseSec)
        {
            Listening = true;
            Step = 0;
            wait = pauseSec;
        }

        /// <summary>pressed: the key pressed this frame, or -1. replay: you asked to hear the tune again.</summary>
        public void Update(double dt, int pressed, bool replay = false)
        {
            if (dt <= 0 || Done) return;
            Ring = Math.Max(0, Ring - dt);
            if (Listening)
            {
                wait -= dt;
                if (wait <= HandsConfig.N("piano", "notePlaySec") - HandsConfig.N("piano", "noteShowSec")) Showing = -1;
                if (wait > 0) return;
                if (Step < Length)
                {
                    int key = Tune[Step];
                    play("note", key);
                    Showing = key;
                    Step += 1;
                    wait = HandsConfig.N("piano", "notePlaySec");
                    return;
                }
                Listening = false;
                Step = 0;
                Showing = -1;
                return;
            }
            if (replay) { Listen(HandsConfig.N("piano", "listenPauseSec")); return; }
            if (pressed == -1 || Ring > 0) return;
            Ring = HandsConfig.N("piano", "ringSec");
            if (pressed != Tune[Step])
            {
                play("badNote");
                noise();
                Again = true;
                Listen(HandsConfig.N("piano", "wrongPauseSec"));
                return;
            }
            play("note", pressed);
            Step += 1;
            if (Step < Length) return;
            Round += 1;
            Again = false;
            if (!Done) Listen(HandsConfig.N("piano", "listenPauseSec"));
        }
    }

    /// <summary>What a click does in the roses puzzle.</summary>
    public enum JugKind { Pick, PutDown, Fill, Pour, PourVase, Empty, TipVase }

    public struct JugAction
    {
        public JugKind Kind;
        /// <summary>The jug picked or poured into (Pick, Pour).</summary>
        public int Jug;
        public JugAction(JugKind kind, int jug = -1) { Kind = kind; Jug = jug; }
    }

    /// <summary>
    /// Water the dead roses: a puzzle with two jugs that hold different amounts, a pump to fill them,
    /// a bucket to empty them, and a vase marked with a line. Pouring always pours all you can, so
    /// get exactly the right amount into the vase by pouring between the jugs. Past the line, tip the
    /// vase out and try again.
    /// </summary>
    public class RosesLogic
    {
        readonly Play play;
        /// <summary>Jug sizes, and how much the vase must hold.</summary>
        public readonly int[] Jugs;
        public readonly int Target;
        /// <summary>Water in each jug, and in the vase.</summary>
        public readonly int[] Water;
        public int Vase;
        /// <summary>The jug in your hand, or -1.</summary>
        public int InHand = -1;
        /// <summary>Seconds left of the pour in progress (nothing else can be done meanwhile).</summary>
        public double Busy;

        public RosesLogic(Play play, Func<double> random)
        {
            this.play = play;
            var list = (List<object>)HandsConfig.Raw("roses", "puzzles");
            var puzzle = (Dictionary<string, object>)list[(int)Math.Floor(random() * list.Count)];
            Jugs = ((List<object>)puzzle["jugs"]).Select(v => Convert.ToInt32(v)).ToArray();
            Target = Convert.ToInt32(puzzle["target"]);
            Water = new int[Jugs.Length];
        }

        public bool Done { get { return Vase == Target && Busy == 0; } }

        /// <summary>Whether this would do anything now.</summary>
        public bool Can(JugAction a)
        {
            if (Busy > 0 || Done) return false;
            int h = InHand;
            switch (a.Kind)
            {
                case JugKind.Pick: return h == -1;
                case JugKind.PutDown: return h != -1;
                case JugKind.Fill: return h != -1 && Water[h] < Jugs[h];
                case JugKind.Pour: return h != -1 && a.Jug != h && Water[h] > 0 && Water[a.Jug] < Jugs[a.Jug];
                case JugKind.PourVase:
                case JugKind.Empty: return h != -1 && Water[h] > 0;
                case JugKind.TipVase: return h == -1 && Vase > 0;
            }
            return false;
        }

        /// <summary>Does it, if it can. Returns whether it did.</summary>
        public bool Act(JugAction a)
        {
            if (!Can(a)) return false;
            int h = InHand;
            switch (a.Kind)
            {
                case JugKind.Pick: InHand = a.Jug; return true;
                case JugKind.PutDown: InHand = -1; return true;
                case JugKind.Fill: Water[h] = Jugs[h]; break;
                case JugKind.Pour:
                    {
                        int amount = Math.Min(Water[h], Jugs[a.Jug] - Water[a.Jug]);
                        Water[h] -= amount;
                        Water[a.Jug] += amount;
                        break;
                    }
                case JugKind.PourVase:
                    // Past the brim it runs over.
                    Vase = Math.Min(HandsConfig.I("roses", "vaseCap"), Vase + Water[h]);
                    Water[h] = 0;
                    break;
                case JugKind.Empty: Water[h] = 0; break;
                case JugKind.TipVase: Vase = 0; break;
            }
            Busy = HandsConfig.N("roses", "pourSec");
            play("splash");
            return true;
        }

        public void Update(double dt) { if (dt > 0) Busy = Math.Max(0, Busy - dt); }
    }
}
