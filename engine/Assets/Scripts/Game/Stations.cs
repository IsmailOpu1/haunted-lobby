using System;
using System.Collections.Generic;
using System.Linq;
using Haunted.Sim;
using UnityEngine;
using static Haunted.Game.Shapes;

namespace Haunted.Game
{
    // The task stations and relic places (GDD 9, 26.5), ported from client/src/stations.ts: the
    // browser's plain models (its "not dressed" ones, as the hotel here is still the grey box until
    // step D), every number the same. Positions and turns are in three.js's axes (Shapes.P, Shapes.R).

    /// <summary>The parts of a station your hands work on, and how to show what they do (stations.ts HandsModel).</summary>
    public abstract class HandsModel
    {
        public string Kind;
        /// <summary>Where the station stands: its own axes for reading directions (the drain).</summary>
        public Transform Root;
    }

    public class CandelabraModel : HandsModel { public List<GameObject> Wicks; public List<Transform> Tips; public Action<bool[]> SetLit; }
    public class StoveModel : HandsModel { public List<GameObject> Knobs; public Action<double[], double[]> SetKnobs; }
    public class ShuttersModel : HandsModel { public List<GameObject> Panels; public Action<double[]> SetOpen; }
    public class DigModel : HandsModel { public GameObject Soil; public Action<double, bool> SetDepth; }
    public class LetterModel : HandsModel { public GameObject Letter; public Transform Bottom; public Action<double, double, double> SetLetter; }
    public class ClockModel : HandsModel { public GameObject Face; public int Target; public Action<double, double> SetHands; }
    public class BoilerModel : HandsModel { public List<GameObject> Wheel; public Action<double, double> SetValve; }
    public class PortraitsModel : HandsModel { public List<GameObject> Frames; public Action<double[]> SetTilt; }
    public class RosesModel : HandsModel
    {
        public List<GameObject> Jugs, Mats;
        public GameObject Vase, Pump, Bucket;
        public Action<int[], int> SetPuzzle;
        /// <summary>The jug in your hand (or -1) leaves the table.</summary>
        public Action<int[], int, int> SetWater;
    }
    public class SwitchboardModel : HandsModel
    {
        public List<GameObject> Plugs;
        public FacePoint[] Hooks, Sockets;
        /// <summary>Marks each socket with the colour and sign of the cable that belongs in it (by socket).</summary>
        public Action<int[]> SetSockets;
        public Action<FacePoint[], bool[]> SetPlugs;
    }
    public class MirrorModel : HandsModel { public GameObject Glass; public Action<int[], double> SetFog; }
    public class TrunkModel : HandsModel { public GameObject Lid; public List<GameObject> Latches; public Action<double, double[], double> SetTrunk; }
    public class PianoModel : HandsModel { public List<GameObject> Keys; public GameObject Card; public Action<PianoCard, int> SetPiano; }
    public class SheetsModel : HandsModel { public GameObject Flap; public Action<int, double> SetSheet; }
    public class CradleModel : HandsModel { public GameObject Basket; public Action<double, double, bool> SetCradle; }
    public class LockboxModel : HandsModel { public GameObject Dial; public Action<double, int, bool> SetDial; }
    public class DrainModel : HandsModel { public GameObject Water; public Action<DrainShow> SetDrain; }

    public struct PianoCard
    {
        public int Round, Rounds, Notes, Played;
        /// <summary>"listen", "again", "play" or "done".</summary>
        public string Mode;
        public string Key { get { return Round + "/" + Rounds + "/" + Notes + "/" + Played + "/" + Mode; } }
    }

    /// <summary>Your arm in the drain: where (in the drain's own three.js x and z, or null), the ripple, and how far it is pulled up.</summary>
    public struct DrainShow
    {
        public Vector2? At;
        public double Ripple, Strength, Lift;
        public bool Gripped;
    }

    /// <summary>A station or a place to search, as built.</summary>
    public class StationView
    {
        public Transform Root;
        /// <summary>A station's done state, or a place's searched state, from the server.</summary>
        public Action<bool> SetDone = d => { };
        public Action<double> Tick;
        public Action<int> SetClue;
        public HandsModel Hands;
    }

    public class Stations
    {
        const int BRASS = 0xa07a34, WOOD = 0x3b2416, IRON = 0x2a2c30, PAPER = 0xe9dfc6, SCORCH = 0x3a2010, WATER = 0x3a5a78, INK = 0x3a2a1a, PAPER_SHADE = 0xa49c8c, LINEN = 0xd9d4c4;
        const double CANDLE_LIGHT_RANGE_M = 5, FIRE_LIGHT_RANGE_M = 7, PENDULUM_SWING_RAD = 0.3, PENDULUM_PERIOD_SEC = 1.5, CANDLE_LIGHT = 2.5;
        const double SHUTTER_OPEN_RAD = 1.9, LETTER_DROP_M = 0.2, LETTER_HEIGHT_M = 0.2;
        const double GAUGE_SWEEP_RAD = 135 * Math.PI / 180, VASE_HEIGHT_M = 0.3, CLOCK_FACE_Y = 1.75, CLOCK_FACE_M = 0.22;
        const double JUG_M_PER_MEASURE = 0.035, JUG_RADIUS_M = 0.065, ROSES_TABLE_Y = 0.75, AWAY_Y = -10;
        const double DIG_DEPTH_M = 0.3, SEARCHED_DEPTH = 0.4, PIANO_KEYS_M = 1.3, PIANO_KEY_Y = 0.785, PIANO_CARD_Y = 1.12;
        const int PIANO_KEY = 0xe6decb, PIANO_KEY_LIT = 0xf0b040;
        const double MOBILE_TURN_RAD_PER_SEC = 1.5, BOARD_Y = 1.3, BOARD_FRONT_Z = -0.025, BOARD_ROW_M = 0.2, SOCKET_GAP_M = 0.2, SOCKET_PLATE_M = 0.07;
        static readonly int[] CABLE_COLORS = { 0xb03a2e, 0x2e7d4f, 0x2f5fa8, 0xc9a23a, 0x8a4aa0, 0xd8d0c0 };
        static readonly string[] CABLE_SIGNS = { "circle", "triangle", "square", "cross", "diamond", "star" };
        const double MIRROR_Y = 1.45, TRUNK_LID_OPEN_RAD = 0.6, TRUNK_RATTLE_RAD = 0.04, SHEET_W_M = 0.9, SHEET_D_M = 0.5, SHEET_THICK_M = 0.004, LOCKBOX_OPEN_RAD = 1.2;
        const double DRAIN_INNER_M = 0.56, DRAIN_CURB_M = 0.08, DRAIN_CURB_WIDTH_M = 0.07, DRAIN_WATER_Y = 0.05, DRAIN_HAND_DEPTH_M = 0.15, DRAIN_LIFT_M = 0.35;

        readonly Dictionary<string, StationView> views = new Dictionary<string, StationView>();
        readonly Dictionary<string, StationView> places = new Dictionary<string, StationView>();
        readonly List<KeyValuePair<string, Action<int>>> clues = new List<KeyValuePair<string, Action<int>>>();
        readonly Transform root;
        string busy;
        GameState lastState;

        static double H(string task, string key) { return HandsConfig.N(task, key); }

        public Stations(WorldData world, MapInfo map, object config)
        {
            root = new GameObject("Stations").transform;
            foreach (var def in map.Tasks)
            {
                var view = Make(def.Minigame);
                Place(view.Root, world, map, def.At.X, def.At.Z, FacingYaw(map, def.At.X, def.At.Z));
                // Only visible tasks change for everyone; the rest never show a result.
                if (!def.Visible) view.SetDone = d => { };
                views[def.Id] = view;
                if (def.Clue != null)
                {
                    Action<int> setTime;
                    var book = GuestBook(def.Clue.HeightM, def.Clue.Stand, out setTime);
                    // Its foot toward the clock, so you read it the right way up from the clock's side.
                    Place(book, world, map, def.Clue.At.X, def.Clue.At.Z, Math.Atan2(def.At.X - def.Clue.At.X, def.At.Z - def.Clue.At.Z));
                    var station = view;
                    string id = def.Id;
                    clues.Add(new KeyValuePair<string, Action<int>>(id, minutes => { setTime(minutes); if (station.SetClue != null) station.SetClue(minutes); }));
                }
            }
            foreach (var spot in map.RelicSpots)
            {
                var list = spot.Places ?? new List<MapInfo.Place> { new MapInfo.Place { Id = spot.Id, At = spot.At } };
                foreach (var place in list)
                {
                    var view = spot.Minigame == "lockbox" ? LockboxSpot() : spot.Minigame == "dig" ? DigSpot() : DrainSpot();
                    Place(view.Root, world, map, place.At.X, place.At.Z, FacingYaw(map, place.At.X, place.At.Z));
                    places[place.Id] = view;
                }
            }
        }

        void Place(Transform t, WorldData world, MapInfo map, double x, double z, double yaw)
        {
            t.SetParent(root, false);
            t.position = Coords.Place(world, x, z);
            t.rotation = R(0, yaw, 0);
        }

        /// <summary>Turns a station to face away from the nearest wall (walls are axis-aligned). Models face +z.</summary>
        public static double FacingYaw(MapInfo map, double x, double z)
        {
            double best = double.PositiveInfinity, yaw = 0;
            foreach (var w in map.Walls)
            {
                double x1 = w[0], z1 = w[1], x2 = w[2], z2 = w[3];
                double cx = Math.Max(Math.Min(x1, x2), Math.Min(Math.Max(x1, x2), x));
                double cz = Math.Max(Math.Min(z1, z2), Math.Min(Math.Max(z1, z2), z));
                double d = Math.Sqrt((x - cx) * (x - cx) + (z - cz) * (z - cz));
                if (d >= best) continue;
                best = d;
                if (x1 == x2) yaw = x > x1 ? Math.PI / 2 : -Math.PI / 2;
                else yaw = z > z1 ? 0 : Math.PI;
            }
            return yaw;
        }

        static StationView Make(string kind)
        {
            switch (kind)
            {
                case "candelabra": return Candelabra();
                case "clock": return Clock();
                case "stove": return Stove();
                case "letter": return Fireplace();
                case "cradle": return Cradle();
                case "piano": return Piano();
                case "boiler": return Boiler();
                case "switchboard": return Switchboard();
                case "mirror": return Mirror();
                case "trunk": return Trunk();
                case "sheets": return Sheets();
                case "roses": return Roses();
                case "shutters": return Shutters();
                default: return Portraits();
            }
        }

        /// <summary>The match's seed (its room id) picks what the clues say, the same for everyone.</summary>
        public void SetSeed(string seed)
        {
            foreach (var kv in clues) kv.Value(Clue.Time(seed, kv.Key));
        }

        public HandsModel Hands(string id)
        {
            StationView v;
            if (views.TryGetValue(id, out v) || places.TryGetValue(id, out v)) return v.Hands;
            return null;
        }

        /// <summary>While you work on one, keep the server's state off it; afterwards show the server's state again.</summary>
        public void SetBusy(string id)
        {
            busy = id;
            if (id == null && lastState != null) OnState(lastState);
        }

        public void OnState(GameState state)
        {
            lastState = state;
            foreach (var kv in state.stations)
            {
                StationView v;
                if (kv.Key != busy && views.TryGetValue(kv.Key, out v)) v.SetDone(kv.Value.done);
            }
            foreach (var kv in state.searchPlaces)
            {
                StationView v;
                if (kv.Key != busy && places.TryGetValue(kv.Key, out v)) v.SetDone(kv.Value.searched);
            }
        }

        public void Update(double time)
        {
            foreach (var v in views.Values) if (v.Tick != null) v.Tick(time);
        }

        // ---------- Small pieces ----------

        static Transform NewRoot(string name) { return new GameObject(name).transform; }

        static Light PointLight(Transform parent, int hex, double range, double x, double y, double z)
        {
            var go = new GameObject("Light");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = P(x, y, z);
            var l = go.AddComponent<Light>();
            l.type = LightType.Point;
            l.color = Hex(hex);
            l.range = (float)range;
            l.intensity = 0;
            return l;
        }

        static void Turn(Transform t, double x, double y, double z) { t.localRotation = R(x, y, z); }
        static void Turn(GameObject g, double x, double y, double z) { g.transform.localRotation = R(x, y, z); }
        static void Show(GameObject g, bool on) { g.GetComponent<Renderer>().enabled = on; }

        /// <summary>A label with a number on it (the roses' jugs and vase): paper, an ink border, the number.</summary>
        static Action<string> NumberTag(Transform parent, double sizeM, out Transform tag)
        {
            tag = Group(parent, "Tag");
            Shape(tag, Plane(sizeM, sizeM), Vector3.one, Mat(Hex(PAPER_SHADE)), 0, 0, 0);
            double e = sizeM * 0.47, w = sizeM * 0.047;
            foreach (var s in new[] { -1, 1 })
            {
                Box(tag, sizeM * 0.94, w, 0.001, INK, 0, s * e, 0.001);
                Box(tag, w, sizeM * 0.94, 0.001, INK, s * e, 0, 0.001);
            }
            var text = Text(tag, "", sizeM * 0.45, Hex(INK), 0, -sizeM * 0.03, 0.002);
            return s2 => text.text = s2;
        }

        // ---------- The stations ----------

        static StationView Candelabra()
        {
            var g = NewRoot("Candelabra");
            Box(g, 0.9, 0.75, 0.9, WOOD, 0, 0.375, 0); // table
            Box(g, 0.06, 0.35, 0.06, BRASS, 0, 0.92, 0);
            Box(g, 0.6, 0.04, 0.04, BRASS, 0, 1.08, 0);
            var flames = new List<GameObject>();
            var wicks = new List<GameObject>();
            var tips = new List<Transform>();
            var flameMat = Mat(Hex(0xffc966), Look.Unlit);
            for (int i = 0; i < 5; i++)
            {
                double x = -0.28 + i * 0.14;
                double h = 0.12 + Math.Sin(i / 4.0 * Math.PI) * 0.06;
                wicks.Add(Box(g, 0.035, h, 0.035, 0xe9dfc6, x, 1.1 + h / 2, 0, "wick:" + i));
                // Where a flame must touch to light it: the top of the candle.
                tips.Add(Group(g, "Tip", x, 1.1 + h + 0.01, 0));
                var flame = Shape(g, Frustum(0, 0.018, 0.05, 6, false), Vector3.one, flameMat, x, 1.1 + h + 0.03, 0);
                Show(flame, false);
                flames.Add(flame);
            }
            var light = PointLight(g, 0xffb060, CANDLE_LIGHT_RANGE_M, 0, 1.4, 0);
            Action<bool[]> setLit = lit =>
            {
                for (int i = 0; i < flames.Count; i++) Show(flames[i], i < lit.Length && lit[i]);
                light.intensity = (float)(CANDLE_LIGHT * lit.Count(l => l) / flames.Count);
            };
            return new StationView
            {
                Root = g,
                SetDone = done => setLit(flames.Select(f => done).ToArray()),
                Tick = time =>
                {
                    int lit = flames.Count(f => f.GetComponent<Renderer>().enabled);
                    if (lit > 0) light.intensity = (float)((CANDLE_LIGHT + Math.Sin(time * 13) * 0.25 + Math.Sin(time * 31) * 0.15) * lit / flames.Count);
                },
                Hands = new CandelabraModel { Kind = "candelabra", Root = g, Wicks = wicks, Tips = tips, SetLit = setLit },
            };
        }

        static StationView Clock()
        {
            var g = NewRoot("Clock");
            Box(g, 0.55, 2.1, 0.35, WOOD, 0, 1.05, 0);
            // The face is what you grab to turn the hands.
            var face = Shape(g, Disc(CLOCK_FACE_M, 32), Vector3.one, For(PAPER, "face"), 0, CLOCK_FACE_Y, 0.18, "face");
            double px = CLOCK_FACE_M / 128; // the browser draws the face on 256 px
            for (int n = 1; n <= 12; n++)
            {
                double a = n / 12.0 * Math.PI * 2;
                Text(g, n.ToString(), 30 * px * 0.75, Hex(INK), Math.Sin(a) * 100 * px, CLOCK_FACE_Y + Math.Cos(a) * 100 * px, 0.182);
            }
            for (int m = 0; m < 60; m++)
            {
                double a = m / 60.0 * Math.PI * 2;
                double r = (m % 5 == 0 ? 74 : 79) * px;
                Box(g, 3 * px, 3 * px, 0.001, INK, Math.Sin(a) * r, CLOCK_FACE_Y + Math.Cos(a) * r, 0.181);
            }
            Func<double, double, double, Transform> hand = (length, width, z) =>
            {
                var pivot = Group(g, "Hand", 0, CLOCK_FACE_Y, z);
                Box(pivot, width, length, 0.004, 0x1a1410, 0, length / 2 - 0.02, 0);
                return pivot;
            };
            var hourHand = hand(0.12, 0.018, 0.186);
            var minuteHand = hand(0.18, 0.01, 0.19);
            var pend = Group(g, "Pendulum", 0, 1.35, 0.19);
            Box(pend, 0.02, 0.55, 0.02, BRASS, 0, -0.275, 0);
            Turn(Cylinder(pend, 0.07, 0.07, 0.02, Mat(Hex(BRASS)), 0, -0.55, 0), Math.PI / 2, 0, 0);
            Action<double, double> setHands = (minuteDeg, hourDeg) =>
            {
                Turn(minuteHand, 0, 0, -minuteDeg * Math.PI / 180);
                Turn(hourHand, 0, 0, -hourDeg * Math.PI / 180);
            };
            var model = new ClockModel { Kind = "clock", Root = g, Face = face, Target = 0, SetHands = setHands };
            bool swinging = false;
            // Stopped, it shows half a day from the time in the book; going, the time itself.
            Action showTime = () =>
            {
                double minutes = swinging ? model.Target : (model.Target + 360) % 720;
                setHands(minutes % 60 * 6, minutes / 720 * 360);
            };
            showTime();
            return new StationView
            {
                Root = g,
                SetDone = done => { swinging = done; if (!done) Turn(pend, 0, 0, 0); showTime(); },
                SetClue = minutes => { model.Target = minutes; showTime(); },
                Tick = time => { if (swinging) Turn(pend, 0, 0, Math.Sin(time / PENDULUM_PERIOD_SEC * Math.PI * 2) * PENDULUM_SWING_RAD); },
                Hands = model,
            };
        }

        /// <summary>The guest book, open at the page that says when to wake the house (the clock's clue).</summary>
        static Transform GuestBook(double heightM, bool stand, out Action<int> setTime)
        {
            var g = NewRoot("Guest book");
            if (stand)
            {
                Box(g, 0.08, heightM - 0.05, 0.08, WOOD, 0, (heightM - 0.05) / 2, 0);
                Box(g, 0.46, 0.04, 0.34, WOOD, 0, heightM - 0.03, 0);
            }
            var book = Group(g, "Book", 0, heightM, 0);
            // Tipped toward you a little, so it can be read standing.
            Turn(book, 0.25, 0, 0);
            Box(book, 0.6, 0.02, 0.42, 0x4a1a14, 0, 0.01, 0);
            var page = Group(book, "Page", 0, 0.022, 0);
            Turn(page, -Math.PI / 2, 0, 0);
            Shape(page, Plane(0.58, 0.4), Vector3.one, Mat(Hex(PAPER_SHADE), Look.Unlit), 0, 0, 0);
            // The browser draws the page on 512 x 352 px: x right, y down from the top left.
            Func<double, double, Vector2> at = (x, y) => new Vector2((float)((x / 512 - 0.5) * 0.58), (float)((0.5 - y / 352) * 0.4));
            const double PX = 0.58 / 512;
            var shade = Hex(PAPER_SHADE);
            Func<int, Color> ink = hex => Hex(hex) * shade;
            Box(page, 4 * PX, 0.4, 0.0005, 0x8a7f69, 0, 0, 0.0005); // the fold
            var title = at(128, 40);
            Text(page, "Guest Book", 26 * PX * 0.75, ink(INK), title.x, title.y, 0.001);
            for (int i = 0; i < 7; i++)
            {
                // Old entries: scribbled lines.
                var a = at(30, 90 + i * 34);
                var b = at(226, 90 + i * 34);
                Box(page, b.x - a.x, 2 * PX, 0.0005, 0x45392d, (a.x + b.x) / 2, a.y, 0.0008);
            }
            var l1 = at(384, 70);
            var l2 = at(384, 112);
            var l3 = at(384, 210);
            Text(page, "Wake the", 34 * PX * 0.75, ink(INK), l1.x, l1.y, 0.001, FontStyle.BoldAndItalic);
            Text(page, "house at", 34 * PX * 0.75, ink(INK), l2.x, l2.y, 0.001, FontStyle.BoldAndItalic);
            var time = Text(page, "12:00", 92 * PX * 0.75, ink(0x7a1008), l3.x, l3.y, 0.001);
            setTime = minutes => time.text = Clue.ClockText(minutes);
            setTime(0);
            return g;
        }

        static StationView Stove()
        {
            var g = NewRoot("Stove");
            Box(g, 1.2, 0.9, 0.7, IRON, 0, 0.45, 0);
            var knobs = new List<GameObject>();
            var pivots = new List<Transform>();
            var flames = new List<GameObject>();
            var flameMat = Mat(Hex(0x4a7dff), Look.UnlitClear, 0.85f);
            for (int i = 0; i < 3; i++)
            {
                double x = -0.38 + i * 0.38;
                Box(g, 0.26, 0.03, 0.26, 0x18191b, x, 0.915, -0.05);
                var flamePivot = Group(g, "Flame", x, 0.97, -0.05);
                Shape(flamePivot, Frustum(0, 0.09, 0.08, 10, true), Vector3.one, flameMat, 0, 0, 0);
                flames.Add(flamePivot.gameObject);
                // The knob turns about the axis that points at you; its pointer shows where it is set.
                var pivot = Group(g, "Knob", x, 0.72, 0.37);
                var knob = Cylinder(pivot, 0.055, 0.055, 0.05, For(0x5a5c62, "knob"), 0, 0, 0.025, "knob:" + i);
                Turn(knob, Math.PI / 2, 0, 0);
                Box(pivot, 0.012, 0.045, 0.01, 0xe9dfc6, 0, 0.025, 0.055);
                pivots.Add(pivot);
                knobs.Add(knob);
                // The "off" mark above each knob.
                Box(g, 0.01, 0.025, 0.005, 0xe9dfc6, x, 0.8, 0.352);
            }
            Action<double[], double[]> setKnobs = (angle, flame) =>
            {
                for (int i = 0; i < pivots.Count; i++) Turn(pivots[i], 0, 0, -(i < angle.Length ? angle[i] : 0) * Math.PI / 180);
                for (int i = 0; i < flames.Count; i++)
                {
                    double level = i < flame.Length ? flame[i] : 1;
                    flames[i].SetActive(level > 0);
                    flames[i].transform.localScale = Vector3.one * (float)Math.Max(0.15, level);
                }
            };
            setKnobs(new double[] { 150, 150, 150 }, new double[] { 1, 1, 1 });
            return new StationView { Root = g, Hands = new StoveModel { Kind = "stove", Root = g, Knobs = knobs, SetKnobs = setKnobs } };
        }

        static StationView Fireplace()
        {
            var g = NewRoot("Fireplace");
            Box(g, 1.4, 1.1, 0.5, 0x4a4440, 0, 0.55, -0.05);
            Box(g, 1.6, 0.1, 0.6, 0x2a2522, 0, 1.15, -0.05); // mantel
            Box(g, 0.8, 0.7, 0.42, 0x0b0807, 0, 0.35, 0.02); // opening
            var fireMat = Mat(Hex(0xff8a3a), Look.Unlit);
            var flames = new List<GameObject>();
            for (int i = 0; i < 3; i++)
            {
                var flame = Shape(g, Frustum(0, 0.08, 0.3, 6, false), Vector3.one, fireMat, -0.18 + i * 0.18, 0.2, 0.08);
                Show(flame, false);
                flames.Add(flame);
            }
            var light = PointLight(g, 0xff7a30, FIRE_LIGHT_RANGE_M, 0, 0.5, 0.5);
            // The cursed letter hangs on a string from a hook under the mantel, swaying in the draught.
            var hook = Group(g, "Hook", 0, 1.1, 0.3);
            Box(hook, 0.004, LETTER_DROP_M, 0.004, 0x8a8070, 0, -LETTER_DROP_M / 2, 0);
            var letter = Box(hook, 0.15, LETTER_HEIGHT_M, 0.004, PAPER, 0, -LETTER_DROP_M - LETTER_HEIGHT_M / 2, 0, "letter");
            // Where the flame must be: just under the letter's bottom edge.
            var bottom = Group(hook, "Bottom", 0, -LETTER_DROP_M - LETTER_HEIGHT_M - 0.02, 0);
            Color paper = Hex(PAPER), scorch = Hex(SCORCH);
            Action<double, double, double> setLetter = (sway, heat, burned) =>
            {
                Turn(hook, 0, 0, -Math.Atan2(sway, LETTER_DROP_M + LETTER_HEIGHT_M));
                SetColor(letter, Color.Lerp(paper, scorch, (float)(Math.Min(1, heat) * 0.6)));
                // Burning, it glows; until then the hands' glow shows when you aim at it.
                if (burned > 0) SetGlow(letter, Hex(0xff6a20));
                float s = (float)Math.Max(0.05, 1 - burned);
                letter.transform.localScale = new Vector3(0.15f, (float)LETTER_HEIGHT_M * s, 0.004f);
                letter.transform.localPosition = P(0, -LETTER_DROP_M - LETTER_HEIGHT_M * s / 2, 0);
                Show(letter, burned < 1);
            };
            return new StationView
            {
                Root = g,
                SetDone = done =>
                {
                    foreach (var f in flames) Show(f, done);
                    light.intensity = done ? 3 : 0;
                    setLetter(0, 0, done ? 1 : 0);
                    if (!done) SetGlow(letter, Color.black);
                },
                Tick = time =>
                {
                    if (light.intensity == 0) return;
                    light.intensity = (float)(3 + Math.Sin(time * 9) * 0.4 + Math.Sin(time * 23) * 0.3);
                    for (int i = 0; i < flames.Count; i++) flames[i].transform.localScale = new Vector3(1, (float)(1 + Math.Sin(time * 11 + i * 2) * 0.2), 1);
                },
                Hands = new LetterModel { Kind = "letter", Root = g, Letter = letter, Bottom = bottom, SetLetter = setLetter },
            };
        }

        static StationView Boiler()
        {
            var g = NewRoot("Boiler");
            Cylinder(g, 0.45, 0.45, 1.8, Mat(Hex(0x4a3a2a)), 0, 0.9, -0.1);
            // The valve wheel turns about the axis pointing at you; its rim and spokes are all handles.
            var wheelPivot = Group(g, "Wheel", 0.25, 1.1, 0.42);
            const int red = 0xa8392a;
            var rim = Shape(wheelPivot, Torus(0.14, 0.025, 6, 16), Vector3.one, For(red, "wheel"), 0, 0, 0, "wheel");
            var spokeA = Box(wheelPivot, 0.28, 0.025, 0.025, red, 0, 0, 0, "wheel");
            var spokeB = Box(wheelPivot, 0.025, 0.28, 0.025, red, 0, 0, 0, "wheel");
            // The pressure gauge: a dial with a green safe band and a needle.
            var gauge = Group(g, "Gauge", -0.2, 1.4, 0.37);
            Shape(gauge, Disc(0.12, 24), Vector3.one, Mat(Hex(0xe9dfc6)), 0, 0, 0);
            double safeMin = H("boiler", "safeMin"), safeMax = H("boiler", "safeMax");
            Func<double, double> angleOf = p => GAUGE_SWEEP_RAD - p * 2 * GAUGE_SWEEP_RAD; // from straight up, counterclockwise
            Shape(gauge, RingMesh(0.085, 0.11, 16, Math.PI / 2 + angleOf(safeMax), angleOf(safeMin) - angleOf(safeMax)), Vector3.one, Mat(Hex(0x3e8a4a)), 0, 0, 0.002);
            var needle = Group(gauge, "Needle", 0, 0, 0.004);
            Box(needle, 0.008, 0.1, 0.004, 0x1a1010, 0, 0.05, 0);
            Action<double, double> setValve = (openDeg, pressure) =>
            {
                Turn(wheelPivot, 0, 0, -openDeg * Math.PI / 180);
                Turn(needle, 0, 0, angleOf(Math.Max(0, Math.Min(1, pressure))));
            };
            setValve(0, H("boiler", "startPressure"));
            return new StationView { Root = g, Hands = new BoilerModel { Kind = "boiler", Root = g, Wheel = new List<GameObject> { rim, spokeA, spokeB }, SetValve = setValve } };
        }

        /// <summary>A jug for the roses (on the table, or in your hand): glass, its water, and its size on a tag.</summary>
        public static Action<int, int> JugModel(Transform parent, out Transform group, out GameObject glass, string part = null)
        {
            var g = Group(parent, "Jug");
            group = g;
            var glassGo = Shape(g, Frustum(JUG_RADIUS_M, JUG_RADIUS_M * 0.9, 1, 12, false), Vector3.one, Mat(Hex(0xb8c8d0), Look.Clear, 0.4f), 0, 0, 0, part);
            glass = glassGo;
            var water = Shape(g, Frustum(JUG_RADIUS_M * 0.9, JUG_RADIUS_M * 0.85, 1, 12, false), Vector3.one, Mat(Hex(WATER)), 0, 0, 0);
            Transform tag;
            var setTag = NumberTag(g, 0.09, out tag);
            int shown = 0;
            return (capacity, amount) =>
            {
                double h = capacity * JUG_M_PER_MEASURE;
                glassGo.transform.localScale = new Vector3(1, (float)h, 1);
                glassGo.transform.localPosition = P(0, h / 2, 0);
                double w = Math.Max(0.001, h * amount / Math.Max(1, capacity));
                Show(water, amount > 0);
                water.transform.localScale = new Vector3(1, (float)w, 1);
                water.transform.localPosition = P(0, w / 2, 0);
                tag.localPosition = P(0, h / 2, JUG_RADIUS_M + 0.003);
                if (capacity != shown) setTag(capacity.ToString());
                shown = capacity;
            };
        }

        static StationView Roses()
        {
            var g = NewRoot("Roses");
            double y = ROSES_TABLE_Y;
            Box(g, 1.5, y, 0.5, WOOD, 0, y / 2, 0);
            // The pump, at the left end: you fill a jug from its spout.
            var pump = Box(g, 0.1, 0.36, 0.1, IRON, -0.62, y + 0.18, -0.05, "pump");
            Box(g, 0.04, 0.03, 0.12, IRON, -0.62, y + 0.3, 0.05);
            Box(g, 0.02, 0.02, 0.22, IRON, -0.62, y + 0.38, -0.1);
            // Two jugs, each on its own mat.
            var jugs = new List<GameObject>();
            var mats = new List<GameObject>();
            var jugSet = new List<Action<int, int>>();
            var jugGroups = new List<Transform>();
            var xs = new[] { -0.34, -0.06 };
            for (int i = 0; i < 2; i++)
            {
                mats.Add(Box(g, 0.18, 0.006, 0.18, 0x2a1e18, xs[i], y + 0.003, 0.05, "mat:" + i));
                Transform jg;
                GameObject glass;
                jugSet.Add(JugModel(g, out jg, out glass, "jug:" + i));
                jg.localPosition = P(xs[i], y + 0.006, 0.05);
                jugGroups.Add(jg);
                jugs.Add(glass);
            }
            // The vase of dead roses, with the line to fill to and a tag saying how much that is.
            var vase = Shape(g, Frustum(0.08, 0.065, VASE_HEIGHT_M, 12, false), Vector3.one, Mat(Hex(0xb8c8d0), Look.Clear, 0.35f), 0.28, y + VASE_HEIGHT_M / 2, 0.02, "vase");
            var vaseWater = Shape(g, Frustum(0.075, 0.063, 1, 12, false), Vector3.one, Mat(Hex(WATER), Look.Clear, 0.85f), 0.28, y, 0.02);
            var line = Shape(g, Torus(0.079, 0.005, 4, 20), Vector3.one, Mat(Hex(0x1a1410), Look.Unlit), 0.28, y, 0.02);
            Turn(line, Math.PI / 2, 0, 0);
            // Propped up in front of the vase.
            Transform vaseTagT;
            var vaseTag = NumberTag(g, 0.12, out vaseTagT);
            vaseTagT.localPosition = P(0.28, y + 0.07, 0.17);
            Turn(vaseTagT, -0.4, 0, 0);
            Box(g, 0.12, 0.12, 0.12, 0x5a2a26, 0.28, y + VASE_HEIGHT_M + 0.08, 0.02);
            // The bucket, at the right end: you empty a jug into it.
            var bucket = Shape(g, Frustum(0.11, 0.09, 0.2, 12, false), Vector3.one, For(0x4a4a48, "bucket"), 0.6, y + 0.1, 0.02, "bucket");
            int vaseCap = HandsConfig.I("roses", "vaseCap");
            int[] puzzleJugs = { 0, 0 };
            Action<int[], int, int> setWater = (amounts, inVase, inHand) =>
            {
                for (int i = 0; i < jugSet.Count; i++)
                {
                    jugSet[i](puzzleJugs[i], i < amounts.Length ? amounts[i] : 0);
                    jugGroups[i].localPosition = P(xs[i], i == inHand ? AWAY_Y : y + 0.006, 0.05);
                }
                double h = Math.Max(0.001, VASE_HEIGHT_M * inVase / vaseCap);
                Show(vaseWater, inVase > 0);
                vaseWater.transform.localScale = new Vector3(1, (float)h, 1);
                vaseWater.transform.localPosition = P(0.28, y + h / 2, 0.02);
            };
            Action<int[], int> setPuzzle = (jugSizes, target) =>
            {
                puzzleJugs = jugSizes;
                line.transform.localPosition = P(0.28, y + VASE_HEIGHT_M * target / vaseCap, 0.02);
                vaseTag(target.ToString());
                setWater(new[] { 0, 0 }, 0, -1);
            };
            var first = (Dictionary<string, object>)((List<object>)HandsConfig.Raw("roses", "puzzles"))[0];
            setPuzzle(((List<object>)first["jugs"]).Select(v => Convert.ToInt32(v)).ToArray(), Convert.ToInt32(first["target"]));
            return new StationView { Root = g, Hands = new RosesModel { Kind = "roses", Root = g, Jugs = jugs, Mats = mats, Vase = vase, Pump = pump, Bucket = bucket, SetPuzzle = setPuzzle, SetWater = setWater } };
        }

        static StationView Shutters()
        {
            // Three windows on the wall, each with a shutter banging in the wind until the task closes it.
            // A shutter hangs on its left side; open 1 is swung out into the corridor, 0 is shut.
            var g = NewRoot("Shutters");
            var hinges = new List<Transform>();
            var panels = new List<GameObject>();
            for (int i = -1; i <= 1; i++)
            {
                double x = i * 0.7;
                Box(g, 0.55, 1.3, 0.06, 0x0b1018, x, 1.5, -0.08);
                var hinge = Group(g, "Hinge", x - 0.27, 1.5, -0.02);
                panels.Add(Box(hinge, 0.54, 1.3, 0.04, 0x5e4630, 0.27, 0, 0, "shutter:" + (i + 1)));
                hinges.Add(hinge);
            }
            double[] open = { 1, 1, 1 };
            bool shut = false, working = false;
            return new StationView
            {
                Root = g,
                SetDone = done => { shut = done; working = false; },
                Tick = time =>
                {
                    for (int i = 0; i < hinges.Count; i++)
                    {
                        // Loose shutters sway in the wind; while you work on them they go where the task says.
                        double o = working ? open[i] : shut ? 0 : 1;
                        double sway = o > 0 ? Math.Sin(time * 1.3 + i) * 0.08 * o : 0;
                        Turn(hinges[i], 0, -(o * SHUTTER_OPEN_RAD + sway), 0);
                    }
                },
                Hands = new ShuttersModel { Kind = "shutters", Root = g, Panels = panels, SetOpen = o => { working = true; open = o; } },
            };
        }

        static StationView Portraits()
        {
            var g = NewRoot("Portraits");
            var pivots = new List<Transform>();
            var frames = new List<GameObject>();
            double[] tilts = { 17, -26, 14 };
            for (int i = -1; i <= 1; i++)
            {
                // Each hangs from a nail at the top and swings about it.
                var pivot = Group(g, "Portrait", i * 0.75, 1.9, -0.06);
                frames.Add(Box(pivot, 0.5, 0.65, 0.05, BRASS, 0, -0.4, 0, "portrait:" + (i + 1)));
                Box(pivot, 0.4, 0.55, 0.02, 0x2e2a24, 0, -0.4, 0.03);
                pivots.Add(pivot);
            }
            Action<double[]> setTilt = deg => { for (int i = 0; i < pivots.Count; i++) Turn(pivots[i], 0, 0, -(i < deg.Length ? deg[i] : 0) * Math.PI / 180); };
            setTilt(tilts);
            return new StationView { Root = g, SetDone = done => setTilt(done ? new double[] { 0, 0, 0 } : tilts), Hands = new PortraitsModel { Kind = "portraits", Root = g, Frames = frames, SetTilt = setTilt } };
        }

        static StationView Piano()
        {
            var g = NewRoot("Piano");
            Box(g, 1.5, 1.2, 0.6, 0x1e1410, 0, 0.6, -0.05);
            Box(g, 1.5, 0.05, 0.32, 0x1e1410, 0, 0.74, 0.39); // keybed
            int count = HandsConfig.I("piano", "keys");
            var keys = new List<GameObject>();
            double width = PIANO_KEYS_M / count;
            for (int i = 0; i < count; i++)
            {
                double x = (i - (count - 1) / 2.0) * width;
                keys.Add(Box(g, width - 0.012, 0.04, 0.26, PIANO_KEY, x, PIANO_KEY_Y, 0.4, "key:" + i));
                // The black keys between, as on a real piano (no gap after the third and seventh).
                if (i < count - 1 && i % 7 != 2 && i % 7 != 6) Box(g, width * 0.5, 0.03, 0.15, 0x0d0a08, x + width / 2, PIANO_KEY_Y + 0.03, 0.34);
            }
            // The card on the music stand: what the piano wants from you. Click it to hear the tune again.
            Box(g, 0.9, 0.42, 0.02, 0x1e1410, 0, PIANO_CARD_Y, 0.24);
            var card = Shape(g, Plane(0.84, 0.36), Vector3.one, Mat(Hex(0xe8dcc0) * Hex(PAPER_SHADE), Look.Glow), 0, PIANO_CARD_Y, 0.28, "card");
            // Leaning back on the stand, its top clear of the board behind.
            Turn(card, -0.12, 0, 0);
            // The browser draws the card on 512 x 256 px.
            const double PX = 0.84 / 512;
            Func<double, double> cy = py => (0.5 - py / 256) * 0.36;
            var shade = Hex(PAPER_SHADE);
            Color ink = Hex(INK) * shade, red = Hex(0x8a1a10) * shade;
            var roundText = Text(card.transform, "", 24 * PX * 0.75, ink, 0, cy(28), 0.002);
            var mainText = Text(card.transform, "", 42 * PX * 0.75, ink, 0, cy(98), 0.002);
            var hintText = Text(card.transform, "", 20 * PX * 0.75, ink, 0, cy(224), 0.002, FontStyle.Italic);
            Transform dots = null;
            string shown = "";
            Action<PianoCard, int> setPiano = (c, down) =>
            {
                // The key sounding goes down and lights up, so you can see the tune as well as hear it.
                for (int i = 0; i < keys.Count; i++)
                {
                    double x = (i - (count - 1) / 2.0) * width;
                    keys[i].transform.localPosition = P(x, i == down ? PIANO_KEY_Y - 0.02 : PIANO_KEY_Y, 0.4);
                    SetColor(keys[i], Hex(i == down ? PIANO_KEY_LIT : PIANO_KEY));
                }
                if (c.Key == shown) return;
                shown = c.Key;
                if (dots != null) UnityEngine.Object.Destroy(dots.gameObject);
                dots = Group(card.transform, "Dots");
                roundText.text = mainText.text = hintText.text = "";
                if (c.Rounds == 0) return;
                if (c.Mode != "done") roundText.text = "Round " + (c.Round + 1) + " of " + c.Rounds;
                mainText.text = c.Mode == "listen" ? "Listen..." : c.Mode == "again" ? "Wrong note. Listen again" : c.Mode == "play" ? "Your turn: play it back" : "In tune";
                mainText.color = c.Mode == "again" ? red : ink;
                mainText.characterSize = (float)((c.Mode == "again" ? 34 : 42) * PX * 0.75 * 10 / 64);
                if (c.Mode == "done") return;
                double gap = 46 * PX, left = -(c.Notes - 1) * gap / 2;
                var dotMat = Mat(ink, Look.Unlit);
                for (int i = 0; i < c.Notes; i++)
                    Shape(dots, i < c.Played ? Disc(14 * PX, 20) : RingMesh(12.5 * PX, 15.5 * PX, 20, 0, Math.PI * 2), Vector3.one, dotMat, left + i * gap, cy(166), 0.002);
                if (c.Mode == "play") hintText.text = "Click this card to hear it again";
            };
            setPiano(new PianoCard { Mode = "listen" }, -1);
            return new StationView { Root = g, Hands = new PianoModel { Kind = "piano", Root = g, Keys = keys, Card = card, SetPiano = setPiano } };
        }

        static StationView Cradle()
        {
            var g = NewRoot("Cradle");
            var rock = Group(g, "Rock");
            var baby = Group(rock, "Baby");
            var mobile = Group(g, "Mobile", 0, 1.3, 0);
            Box(rock, 1.0, 0.05, 0.08, 0x5a3a22, 0, 0.12, 0.22);
            Box(rock, 1.0, 0.05, 0.08, 0x5a3a22, 0, 0.12, -0.22);
            var basket = Box(rock, 0.9, 0.35, 0.5, 0x6b4a2e, 0, 0.5, 0, "basket");
            Box(baby, 0.36, 0.1, 0.24, 0xd8cfc0, -0.05, 0.7, 0);
            Sphere(baby, 0.07, Mat(Hex(0xc8a890)), 0.2, 0.72, 0);
            // A mobile on a post over the cradle.
            Box(g, 0.04, 1.4, 0.04, 0x5a3a22, -0.55, 0.7, -0.3);
            var arm = Cylinder(g, 0.5, 0.5, 2, Mat(Hex(0x5a3a22)), 0, 0, 0);
            Stretch(arm.transform, P(-0.55, 1.38, -0.3), P(0, 1.38, 0), 0.012);
            var stringMat = Mat(Hex(0x8a8070));
            var starMat = Mat(Hex(0xc9a640));
            for (int i = 0; i < 3; i++)
            {
                double a = i / 3.0 * Math.PI * 2, x = Math.Cos(a) * 0.12, z = Math.Sin(a) * 0.12;
                var s = Cylinder(mobile, 0.5, 0.5, 2, stringMat, 0, 0, 0);
                Stretch(s.transform, P(x, 0.08, z), P(x, -0.08, z), 0.002);
                var star = Sphere(mobile, 0.035, starMat, x, -0.1, z);
                star.transform.localScale = new Vector3(0.05f, 0.07f, 0.05f);
                star.transform.localRotation = Quaternion.Euler(0, 45, 0);
            }
            double angle = 0, calm = 0, last = 0, spin = 0;
            bool crying = false;
            return new StationView
            {
                Root = g,
                Tick = time =>
                {
                    double dt = Math.Min(0.1, Math.Max(0, time - last));
                    last = time;
                    Turn(rock, 0, 0, -angle);
                    baby.localPosition = P(crying ? Math.Sin(time * 37) * 0.012 : 0, crying ? Math.Abs(Math.Sin(time * 23)) * 0.01 : 0, 0);
                    spin += dt * calm * MOBILE_TURN_RAD_PER_SEC;
                    Turn(mobile, 0, spin, 0);
                },
                Hands = new CradleModel { Kind = "cradle", Root = g, Basket = basket, SetCradle = (a, c, cry) => { angle = a; calm = c; crying = cry; } },
            };
        }

        static readonly Dictionary<int, Texture2D> signTextures = new Dictionary<int, Texture2D>();

        /// <summary>A cable's sign in ink on enamel, with a ring of the cable's colour round it (64 px, as the browser draws it).</summary>
        static Texture2D SignTexture(int cable)
        {
            Texture2D made;
            if (signTextures.TryGetValue(cable, out made)) return made;
            var tex = new Texture2D(64, 64, TextureFormat.RGBA32, true);
            Color enamel = Hex(0x9c917a), ring = Hex(CABLE_COLORS[cable % CABLE_COLORS.Length]), ink = Hex(0x140d08);
            string sign = CABLE_SIGNS[cable % CABLE_SIGNS.Length];
            var star = new List<Vector2>();
            for (int k = 0; k < 10; k++)
            {
                double r = k % 2 == 1 ? 8 : 19, a = -Math.PI / 2 + k * Math.PI / 5;
                star.Add(new Vector2((float)(32 + r * Math.Cos(a)), (float)(33 + r * Math.Sin(a))));
            }
            var tri = new[] { new Vector2(32, 15), new Vector2(49, 46), new Vector2(15, 46) };
            var diamond = new[] { new Vector2(32, 13), new Vector2(51, 32), new Vector2(32, 51), new Vector2(13, 32) };
            for (int py = 0; py < 64; py++)
                for (int px = 0; px < 64; px++)
                {
                    // Canvas y runs down; the texture's row 0 is the bottom.
                    var p = new Vector2(px + 0.5f, 63 - py + 0.5f);
                    Color c = enamel;
                    // The cable's colour in a band round the edge (the browser's 8 px stroke at 4 px in).
                    if (Math.Max(Math.Abs(p.x - 32), Math.Abs(p.y - 32)) >= 24) c = ring;
                    bool on;
                    switch (sign)
                    {
                        case "circle": on = Math.Abs(Vector2.Distance(p, new Vector2(32, 32)) - 15) <= 3.5f; break;
                        case "triangle": on = Inside(p, tri); break;
                        case "square": on = p.x >= 18 && p.x <= 46 && p.y >= 18 && p.y <= 46; break;
                        case "diamond": on = Inside(p, diamond); break;
                        case "cross": on = SegmentDistance(p, new Vector2(18, 18), new Vector2(46, 46)) <= 3.5f || SegmentDistance(p, new Vector2(46, 18), new Vector2(18, 46)) <= 3.5f; break;
                        default: on = Inside(p, star.ToArray()); break;
                    }
                    if (on) c = ink;
                    tex.SetPixel(px, py, c);
                }
            tex.Apply();
            signTextures[cable] = tex;
            return tex;
        }

        static bool Inside(Vector2 p, Vector2[] poly)
        {
            bool inside = false;
            for (int i = 0, j = poly.Length - 1; i < poly.Length; j = i++)
                if ((poly[i].y > p.y) != (poly[j].y > p.y) && p.x < (poly[j].x - poly[i].x) * (p.y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
            return inside;
        }

        static float SegmentDistance(Vector2 p, Vector2 a, Vector2 b)
        {
            var ab = b - a;
            float t = Mathf.Clamp01(Vector2.Dot(p - a, ab) / ab.sqrMagnitude);
            return Vector2.Distance(p, a + ab * t);
        }

        static StationView Switchboard()
        {
            var g = NewRoot("Switchboard");
            Box(g, 1.0, 1.0, 0.15, WOOD, 0, BOARD_Y, -0.1);
            Box(g, 1.0, 0.8, 0.4, WOOD, 0, 0.4, 0.05); // desk
            int cables = HandsConfig.I("switchboard", "cables");
            var hooks = new FacePoint[cables];
            var sockets = new FacePoint[cables];
            var rings = new List<GameObject>();
            var plates = new List<GameObject>();
            var lamps = new List<GameObject>();
            var plugs = new List<GameObject>();
            var wires = new List<Transform>();
            var roots = new List<Vector3>();
            for (int i = 0; i < cables; i++)
            {
                double u = (i - (cables - 1) / 2.0) * SOCKET_GAP_M;
                hooks[i] = new FacePoint(u, -BOARD_ROW_M);
                sockets[i] = new FacePoint(u, BOARD_ROW_M);
                rings.Add(Shape(g, Torus(0.03, 0.009, 6, 16), Vector3.one, Mat(Hex(0x555555)), u, BOARD_Y + BOARD_ROW_M, BOARD_FRONT_Z + 0.004));
                Box(g, 0.035, 0.035, 0.01, 0x050403, u, BOARD_Y + BOARD_ROW_M, BOARD_FRONT_Z);
                plates.Add(Shape(g, Plane(SOCKET_PLATE_M, SOCKET_PLATE_M), Vector3.one, Mat(Hex(0x555555)), u, BOARD_Y + BOARD_ROW_M - 0.085, BOARD_FRONT_Z + 0.004));
                lamps.Add(Sphere(g, 0.016, Mat(Hex(0x3a3020), Look.Glow), u, BOARD_Y + BOARD_ROW_M + 0.1, BOARD_FRONT_Z + 0.01));
                Box(g, 0.05, 0.012, 0.04, BRASS, u, BOARD_Y - BOARD_ROW_M - 0.035, BOARD_FRONT_Z + 0.02); // hook
                var holder = Group(g, "Plug " + i);
                var plug = Shape(holder, Frustum(0.018, 0.024, 0.06, 10, false), Vector3.one, For(CABLE_COLORS[i], "plug"), 0, 0, 0, "plug:" + i);
                Turn(plug, Math.PI / 2, 0, 0);
                // Its sign on the end you look at, facing out of the board.
                var capMat = Mat(Color.white);
                capMat.mainTexture = SignTexture(i);
                Shape(holder, Disc(0.017, 20), Vector3.one, capMat, 0, 0, 0.0305);
                plugs.Add(plug);
                var wire = Cylinder(g, 0.5, 0.5, 2, Mat(Hex(CABLE_COLORS[i])), 0, 0, 0);
                wires.Add(wire.transform);
                roots.Add(P(u, BOARD_Y - 0.46, BOARD_FRONT_Z + 0.01));
            }
            Action<FacePoint[], bool[]> setPlugs = (at, lit) =>
            {
                for (int i = 0; i < at.Length; i++)
                {
                    var p = at[i];
                    // A seated plug sits flush in its socket; a loose one stands out from the board.
                    bool seated = sockets.Any(s => s.U == p.U && s.V == p.V);
                    var holder = plugs[i].transform.parent;
                    holder.localPosition = P(p.U, BOARD_Y + p.V, BOARD_FRONT_Z + (seated ? 0.02 : 0.05));
                    Stretch(wires[i], roots[i], holder.localPosition, 0.008);
                }
                for (int j = 0; j < lamps.Count; j++)
                {
                    bool on = j < lit.Length && lit[j];
                    SetColor(lamps[j], Hex(on ? 0xffd27a : 0x3a3020));
                    SetGlow(lamps[j], on ? Hex(0x8a5a10) : Color.black);
                }
            };
            setPlugs(hooks, new bool[0]);
            return new StationView
            {
                Root = g,
                Hands = new SwitchboardModel
                {
                    Kind = "switchboard", Root = g, Plugs = plugs, Hooks = hooks, Sockets = sockets, SetPlugs = setPlugs,
                    SetSockets = bySocket =>
                    {
                        for (int j = 0; j < rings.Count; j++) SetColor(rings[j], Hex(CABLE_COLORS[bySocket[j]]));
                        for (int j = 0; j < plates.Count; j++)
                        {
                            var m = plates[j].GetComponent<Renderer>().material;
                            m.mainTexture = SignTexture(bySocket[j]);
                            SetColor(plates[j], Color.white);
                        }
                    },
                },
            };
        }

        /// <summary>A pale face, for the mirror (128 x 160 px, as the browser draws it).</summary>
        static Texture2D FaceTexture()
        {
            var tex = new Texture2D(128, 160, TextureFormat.RGBA32, true);
            for (int py = 0; py < 160; py++)
                for (int px = 0; px < 128; px++)
                {
                    double x = px + 0.5, y = 159 - py + 0.5;
                    double r = Math.Sqrt((x - 64) * (x - 64) + (y - 80) * (y - 80));
                    bool inGlow = (x - 64) * (x - 64) / (46.0 * 46) + (y - 80) * (y - 80) / (64.0 * 64) <= 1;
                    double glow = inGlow ? 0.9 * Math.Max(0, 1 - Math.Max(0, r - 10) / 60) : 0;
                    var c = new Color(220 / 255f, 225 / 255f, 220 / 255f, (float)glow);
                    bool dark = Ellipse(x, y, 46, 66, 9, 12) || Ellipse(x, y, 82, 66, 9, 12) || Ellipse(x, y, 64, 112, 8, 14);
                    if (dark) c = new Color(10 / 255f, 8 / 255f, 8 / 255f, 0.95f);
                    tex.SetPixel(px, py, c);
                }
            tex.Apply();
            return tex;
        }

        static bool Ellipse(double x, double y, double cx, double cy, double rx, double ry) { return (x - cx) * (x - cx) / (rx * rx) + (y - cy) * (y - cy) / (ry * ry) <= 1; }

        static StationView Mirror()
        {
            var g = NewRoot("Mirror");
            double w = H("mirror", "widthM"), h = H("mirror", "heightM");
            int cols = HandsConfig.I("mirror", "cols"), rows = HandsConfig.I("mirror", "rows");
            Box(g, w + 0.16, h + 0.16, 0.05, BRASS, 0, MIRROR_Y, -0.05);
            var glassMat = Mat(Hex(0x1c2226), Look.Glow);
            glassMat.SetFloat("_Smoothness", 0.9f);
            var glass = Shape(g, Plane(w, h), Vector3.one, glassMat, 0, MIRROR_Y, -0.02, "glass");
            var faceMat = Mat(Color.white, Look.UnlitClear, 0);
            faceMat.mainTexture = FaceTexture();
            Shape(g, Plane(0.26, 0.33), Vector3.one, faceMat, 0.06, MIRROR_Y + 0.14, -0.018);
            // The fog: one texel for each patch of glass.
            var fogTex = new Texture2D(cols, rows, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            var fogMat = Mat(Color.white, Look.Clear, 1);
            fogMat.mainTexture = fogTex;
            fogMat.SetFloat("_Smoothness", 0.2f);
            Shape(g, Plane(w, h), Vector3.one, fogMat, 0, MIRROR_Y, -0.016);
            Box(g, 0.9, 0.8, 0.4, WOOD, 0, 0.4, 0.1); // dresser
            var pixels = new Color32[cols * rows];
            Action<int[], double> setFog = (patches, showFace) =>
            {
                for (int i = 0; i < patches.Length; i++) pixels[i] = new Color32(200, 204, 206, (byte)Math.Round(225.0 * patches[i]));
                fogTex.SetPixels32(pixels);
                fogTex.Apply();
                var c = faceMat.color;
                c.a = (float)(showFace * 0.85);
                faceMat.color = c;
                if (faceMat.HasProperty("_BaseColor")) faceMat.SetColor("_BaseColor", c);
            };
            setFog(Enumerable.Repeat(1, cols * rows).ToArray(), 0);
            return new StationView { Root = g, Hands = new MirrorModel { Kind = "mirror", Root = g, Glass = glass, SetFog = setFog } };
        }

        static StationView Trunk()
        {
            var g = NewRoot("Trunk");
            Box(g, 1.0, 0.5, 0.55, 0x4b3420, 0, 0.25, 0);
            Box(g, 0.94, 0.02, 0.49, 0x0b0807, 0, 0.495, 0); // the dark inside
            var hinge = Group(g, "Hinge", 0, 0.5, -0.285);
            var lid = Box(hinge, 1.02, 0.12, 0.57, 0x553a22, 0, 0.06, 0.285, "lid");
            var pivots = new List<Transform>();
            var latches = new List<GameObject>();
            int count = HandsConfig.I("trunk", "latches");
            for (int i = 0; i < count; i++)
            {
                double x = (i - (count - 1) / 2.0) * 0.3;
                Box(g, 0.06, 0.06, 0.01, 0x2a2016, x, 0.44, 0.28); // the catch
                var pivot = Group(g, "Latch", x, 0.44, 0.29);
                latches.Add(Box(pivot, 0.026, 0.1, 0.016, BRASS, 0, 0, 0.006, "latch:" + i));
                pivots.Add(pivot);
            }
            double open = 0, rattle = 0;
            return new StationView
            {
                Root = g,
                // The lid strains against the latches when it is about to burst.
                Tick = time => Turn(hinge, -open * TRUNK_LID_OPEN_RAD - rattle * TRUNK_RATTLE_RAD * Math.Abs(Math.Sin(time * 31)), 0, 0),
                Hands = new TrunkModel
                {
                    Kind = "trunk", Root = g, Lid = lid, Latches = latches,
                    SetTrunk = (lidOpen, latchDeg, r) =>
                    {
                        open = lidOpen;
                        rattle = r;
                        for (int i = 0; i < pivots.Count; i++) Turn(pivots[i], 0, 0, -(i < latchDeg.Length ? latchDeg[i] : 0) * Math.PI / 180);
                    },
                },
            };
        }

        struct Sheet { public double Cx, Cz, W, D; }

        /// <summary>The half of a sheet that stays down when it is folded: the near half, or the left half.</summary>
        static Sheet FoldedHalf(Sheet r, int fold)
        {
            return fold % 2 == 0 ? new Sheet { Cx = r.Cx, Cz = r.Cz + r.D / 4, W = r.W, D = r.D / 2 } : new Sheet { Cx = r.Cx - r.W / 4, Cz = r.Cz, W = r.W / 2, D = r.D };
        }

        static StationView Sheets()
        {
            var g = NewRoot("Sheets");
            Box(g, 1.2, 0.75, 0.7, WOOD, 0, 0.375, 0); // table
            const double top = 0.75;
            var flat = Box(g, 1, SHEET_THICK_M, 1, LINEN);
            var pivot = Group(g, "Fold");
            var flap = Box(pivot, 1, SHEET_THICK_M, 1, LINEN, 0, 0, 0, "sheet");
            int total = HandsConfig.I("sheets", "folds");
            Action<int, double> setSheet = (folds, progress) =>
            {
                var r = new Sheet { W = SHEET_W_M, D = SHEET_D_M };
                for (int k = 0; k < Math.Min(folds, total); k++) r = FoldedHalf(r, k);
                double layers = Math.Pow(2, Math.Min(folds, total));
                var still = folds < total ? FoldedHalf(r, folds) : r;
                flat.transform.localScale = new Vector3((float)still.W, (float)(SHEET_THICK_M * layers), (float)still.D);
                flat.transform.localPosition = P(still.Cx, top + SHEET_THICK_M * layers / 2, still.Cz);
                flap.SetActive(folds < total);
                if (folds >= total) return;
                pivot.localPosition = P(r.Cx, top + SHEET_THICK_M * layers * 1.5, r.Cz);
                if (folds % 2 == 0)
                {
                    // The far half lifts and comes over toward you.
                    flap.transform.localScale = new Vector3((float)r.W, (float)(SHEET_THICK_M * layers), (float)(r.D / 2));
                    flap.transform.localPosition = P(0, 0, -r.D / 4);
                    Turn(pivot, progress * Math.PI, 0, 0);
                }
                else
                {
                    // The right half lifts and goes over to the left.
                    flap.transform.localScale = new Vector3((float)(r.W / 2), (float)(SHEET_THICK_M * layers), (float)r.D);
                    flap.transform.localPosition = P(r.W / 4, 0, 0);
                    Turn(pivot, 0, 0, progress * Math.PI);
                }
            };
            setSheet(0, 0);
            return new StationView { Root = g, Hands = new SheetsModel { Kind = "sheets", Root = g, Flap = flap, SetSheet = setSheet } };
        }

        // ---------- Places to search for a relic ----------

        static StationView LockboxSpot()
        {
            var g = NewRoot("Lockbox");
            Box(g, 1.0, 0.85, 0.45, WOOD, 0, 0.425, 0); // sideboard or shelf
            // A walnut box with brass bands round its foot and its lid's edge, on four brass feet.
            const int walnut = 0x1e1008;
            Box(g, 0.3, 0.15, 0.2, walnut, 0, 0.935, 0);
            Box(g, 0.31, 0.012, 0.21, BRASS, 0, 0.866, 0);
            foreach (var f in new[] { new[] { -0.13, -0.08 }, new[] { 0.13, -0.08 }, new[] { -0.13, 0.08 }, new[] { 0.13, 0.08 } }) Box(g, 0.025, 0.01, 0.025, BRASS, f[0], 0.855, f[1]);
            var hinge = Group(g, "Lid", 0, 1.01, -0.1);
            Box(hinge, 0.31, 0.03, 0.21, walnut, 0, 0.015, 0.1);
            Box(hinge, 0.316, 0.01, 0.216, BRASS, 0, 0.004, 0.1);
            Box(hinge, 0.08, 0.006, 0.05, BRASS, 0, 0.032, 0.1); // a cartouche on the lid
            var pivot = Group(g, "Dial", 0, 0.92, 0.1);
            var dial = Cylinder(pivot, 0.06, 0.06, 0.02, For(BRASS, "dial"), 0, 0, 0.01, "dial");
            Turn(dial, Math.PI / 2, 0, 0);
            Box(pivot, 0.008, 0.035, 0.004, 0x1a1010, 0, 0.022, 0.022); // its pointer
            Box(g, 0.012, 0.012, 0.004, 0xe9dfc6, 0, 0.976, 0.102); // the mark at the top
            int pins = HandsConfig.I("lockbox", "pins");
            var studs = new List<GameObject>();
            for (int i = 0; i < pins; i++) studs.Add(Sphere(g, 0.008, Mat(Hex(0x2a2016), Look.Glow), (i - (pins - 1) / 2.0) * 0.03, 0.99, 0.102));
            Action<double, int, bool> setDial = (deg, set, open) =>
            {
                Turn(pivot, 0, 0, -deg * Math.PI / 180);
                for (int i = 0; i < studs.Count; i++)
                {
                    SetColor(studs[i], Hex(i < set ? 0xd8b050 : 0x2a2016));
                    SetGlow(studs[i], i < set ? Hex(0x4a3008) : Color.black);
                }
                Turn(hinge, open ? -LOCKBOX_OPEN_RAD : 0, 0, 0);
            };
            return new StationView { Root = g, SetDone = searched => setDial(0, searched ? pins : 0, searched), Hands = new LockboxModel { Kind = "lockbox", Root = g, Dial = dial, SetDial = setDial } };
        }

        static StationView DigSpot()
        {
            var g = NewRoot("Dig");
            Box(g, 0.8, 0.5, 0.8, 0x5a3b22, 0, 0.25, 0);
            const double soilY = 0.51;
            var soil = Box(g, 0.7, 0.04, 0.7, 0x2e2014, 0, soilY, 0, "soil");
            var plant = Group(g, "Plant");
            Box(plant, 0.06, 0.9, 0.06, 0x3d6a33, 0, 0.95, 0);
            Box(plant, 0.6, 0.06, 0.06, 0x3d6a33, 0, 1.3, 0);
            // Soil thrown out of a dug pot, and the relic glinting at the bottom.
            var heap = Box(g, 0.3, 0.12, 0.3, 0x2e2014, 0.55, 0.06, 0.2);
            heap.SetActive(false);
            var relicMat = Mat(Hex(0xc9a640), Look.Glow);
            relicMat.SetColor("_EmissionColor", Hex(0x3a2a08));
            var relic = Box(g, 0.08, 0.05, 0.08, relicMat, 0, 0.25, 0);
            relic.SetActive(false);
            Action<double, bool> setDepth = (depth, shows) =>
            {
                soil.transform.localPosition = P(0, soilY - depth * DIG_DEPTH_M, 0);
                plant.gameObject.SetActive(depth < 0.1);
                heap.SetActive(depth > 0.1);
                heap.transform.localScale = new Vector3(0.3f, (float)(0.12 * Math.Max(0.3, depth)), 0.3f);
                relic.SetActive(shows);
            };
            return new StationView { Root = g, SetDone = searched => setDepth(searched ? SEARCHED_DEPTH : 0, false), Hands = new DigModel { Kind = "dig", Root = g, Soil = soil, SetDepth = setDepth } };
        }

        static StationView DrainSpot()
        {
            var g = NewRoot("Drain");
            const int stone = 0x4a4a44;
            double half = DRAIN_INNER_M / 2, t = DRAIN_CURB_WIDTH_M, outer = DRAIN_INNER_M + 2 * t;
            foreach (var s in new[] { -1, 1 })
            {
                Box(g, outer, DRAIN_CURB_M, t, stone, 0, DRAIN_CURB_M / 2, s * (half + t / 2));
                Box(g, t, DRAIN_CURB_M, DRAIN_INNER_M, stone, s * (half + t / 2), DRAIN_CURB_M / 2, 0);
            }
            var water = Shape(g, Plane(DRAIN_INNER_M, DRAIN_INNER_M), Vector3.one, For(0x10160f, "water"), 0, DRAIN_WATER_Y, 0, "water");
            Turn(water, -Math.PI / 2, 0, 0);
            for (int i = -2; i <= 2; i++) Box(g, 0.03, 0.02, 0.5, 0x555048, half + t + 0.16 + i * 0.05, 0.01, 0); // the grate
            var rippleMat = Mat(Hex(0xa0b0a0), Look.UnlitClear, 0);
            var ripple = Shape(g, RingMesh(0.8, 1, 24, 0, Math.PI * 2), Vector3.one, rippleMat, 0, 0, 0);
            Turn(ripple, -Math.PI / 2, 0, 0);
            ripple.SetActive(false);
            // Your forearm going down into the water, and the relic in your hand once you have it.
            var arm = Group(g, "Arm");
            Box(arm, 0.07, 0.4, 0.07, 0xb8a090, 0, 0.2, 0);
            var relicMat = Mat(Hex(0xc9a640), Look.Glow);
            relicMat.SetColor("_EmissionColor", Hex(0x3a2a08));
            var relic = Box(arm, 0.08, 0.05, 0.08, relicMat);
            arm.gameObject.SetActive(false);
            Action<DrainShow> setDrain = s =>
            {
                arm.gameObject.SetActive(s.At.HasValue);
                ripple.SetActive(s.At.HasValue);
                if (!s.At.HasValue) return;
                var at = s.At.Value;
                arm.localPosition = P(at.x, DRAIN_WATER_Y - DRAIN_HAND_DEPTH_M + s.Lift * DRAIN_LIFT_M, at.y);
                relic.SetActive(s.Gripped);
                ripple.transform.localPosition = P(at.x, DRAIN_WATER_Y + 0.002, at.y);
                ripple.transform.localScale = Vector3.one * (float)(0.03 + s.Ripple * 0.12);
                var c = rippleMat.color;
                c.a = (float)((1 - s.Ripple) * (0.12 + 0.6 * s.Strength));
                rippleMat.color = c;
                if (rippleMat.HasProperty("_BaseColor")) rippleMat.SetColor("_BaseColor", c);
            };
            return new StationView { Root = g, Hands = new DrainModel { Kind = "drain", Root = g, Water = water, SetDrain = setDrain } };
        }
    }
}
