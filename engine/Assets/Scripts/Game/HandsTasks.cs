using System;
using System.Collections.Generic;
using System.Linq;
using Haunted.Sim;
using UnityEngine;
using static Haunted.Game.Shapes;

namespace Haunted.Game
{
    // Hands-on tasks in the 3D world (GDD 26.5), ported from client/src/hands/tasks.ts and work.ts:
    // each task ties its rules (Sim/HandsLogic*.cs) to the real parts of its station (Stations.cs)
    // and the tool in your hand. The crosshair is your hand: point at a part, hold the mouse button
    // to grab it, and the mouse moves it instead of your view.

    /// <summary>What your hands are doing this frame (tasks.ts HandsFrame).</summary>
    public class HandsFrame
    {
        public double Dt;
        /// <summary>From your eye through the crosshair, in world space.</summary>
        public Ray Ray;
        /// <summary>The part under the crosshair within reach ("knob:1"), or null.</summary>
        public string Aim;
        /// <summary>The part you grabbed when you pressed the button, or null.</summary>
        public string Held;
        public bool Holding;
        /// <summary>Mouse movement this frame while the button is down, in pixels (right and down are positive, as the browser's).</summary>
        public double DragX, DragY;
        /// <summary>How fast your view is turning, in radians per second.</summary>
        public double LookSpeed;
    }

    public class HandsEvents
    {
        public Play Play;
        /// <summary>A noise the ghost can hear (Game limits how often it is sent).</summary>
        public Action Noise;
    }

    public abstract class HandsTask
    {
        public abstract bool Done { get; }
        public abstract string Hint { get; }
        public List<GameObject> Parts = new List<GameObject>();
        /// <summary>The tool in your hand, if any: shown while you work.</summary>
        public Transform Tool;
        public abstract bool CanHold(string part);
        public virtual bool Glows(string part) { return CanHold(part); }
        public abstract void Update(HandsFrame f);
        public virtual void SetFound() { }

        protected static readonly System.Random Dice = new System.Random();
        protected static double Random() { return Dice.NextDouble(); }

        /// <summary>The number in a part name: "knob:2" is 2, or -1.</summary>
        protected static int Index(string part, string kind)
        {
            if (part == null || !part.StartsWith(kind + ":")) return -1;
            return int.Parse(part.Substring(kind.Length + 1));
        }

        protected const double TOOL_REST_M = 0.7, TOOL_LIGHT_RANGE_M = 2, TOOL_LIGHT = 1.2;

        protected static float DistanceToRay(Ray r, Vector3 p)
        {
            float t = Mathf.Max(0, Vector3.Dot(p - r.origin, r.direction));
            return Vector3.Distance(r.GetPoint(t), p);
        }

        /// <summary>A match: stick, head and flame, with a small light. Built in Unity's own axes (LookAt points +z at the eye, as three.js's does).</summary>
        protected static Transform MatchTool(out GameObject flame, out Light light)
        {
            var tool = new GameObject("Match").transform;
            Box(tool, 0.006, 0.006, 0.09, Mat(Hex(0x8a6a40), Look.Unlit), 0, 0, -0.045);
            Sphere(tool, 0.006, Mat(Hex(0x5a1a12), Look.Unlit));
            flame = Shape(tool, Frustum(0, 0.008, 0.03, 6, false), Vector3.one, Mat(Hex(0xffc966), Look.Unlit), 0, 0.015, 0);
            var lg = new GameObject("Light");
            lg.transform.SetParent(tool, false);
            light = lg.AddComponent<Light>();
            light.type = LightType.Point;
            light.color = Hex(0xffa040);
            light.range = (float)TOOL_LIGHT_RANGE_M;
            light.intensity = 0;
            return tool;
        }

        public static HandsTask Create(HandsModel model, HandsEvents events)
        {
            switch (model.Kind)
            {
                case "candelabra": return new CandelabraTask((CandelabraModel)model, events);
                case "shutters": return new ShuttersTask((ShuttersModel)model, events);
                case "stove": return new StoveTask((StoveModel)model, events);
                case "dig": return new DigTask((DigModel)model, events);
                case "letter": return new LetterTask((LetterModel)model, events);
                case "clock": return new ClockTask((ClockModel)model, events);
                case "boiler": return new BoilerTask((BoilerModel)model, events);
                case "portraits": return new PortraitsTask((PortraitsModel)model, events);
                case "roses": return new RosesTask((RosesModel)model, events);
                case "switchboard": return new SwitchboardTask((SwitchboardModel)model, events);
                case "mirror": return new MirrorTask((MirrorModel)model, events);
                case "trunk": return new TrunkTask((TrunkModel)model, events);
                case "piano": return new PianoTask((PianoModel)model, events);
                case "sheets": return new SheetsTask((SheetsModel)model, events);
                case "cradle": return new CradleTask((CradleModel)model, events);
                case "lockbox": return new LockboxTask((LockboxModel)model, events);
                default: return new DrainTask((DrainModel)model, events);
            }
        }
    }

    class CandelabraTask : HandsTask
    {
        readonly CandelabraModel model;
        readonly CandelabraLogic logic;
        readonly GameObject flame;
        readonly Light light;
        public override string Hint { get { return "Hold the mouse button and flick down to strike a match. Hold the flame on each wick until it catches. Turn slowly, or it goes out."; } }
        public CandelabraTask(CandelabraModel m, HandsEvents e)
        {
            model = m;
            logic = new CandelabraLogic(e.Play);
            Parts.AddRange(m.Wicks);
            Tool = MatchTool(out flame, out light);
            m.SetLit(logic.Lit);
        }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return false; }
        public override bool Glows(string part) { int i = Index(part, "wick"); return logic.MatchLit && i >= 0 && !logic.Lit[i]; }
        public override void Update(HandsFrame f)
        {
            // The match head is where the crosshair meets the candles' depth.
            var tips = model.Tips.Select(t => t.position).ToList();
            float depth = Vector3.Distance(f.Ray.origin, tips[tips.Count / 2]);
            Tool.position = f.Ray.GetPoint(Mathf.Min(depth, (float)TOOL_REST_M * 2));
            Tool.LookAt(f.Ray.origin);
            int wick = -1;
            double best = HandsConfig.N("candelabra", "aimM");
            for (int i = 0; i < tips.Count; i++)
            {
                double d = DistanceToRay(f.Ray, tips[i]);
                if (d < best) { best = d; wick = i; }
            }
            logic.Update(f.Dt, wick, f.Holding, f.DragY, f.LookSpeed);
            flame.SetActive(logic.MatchLit);
            light.intensity = logic.MatchLit ? (float)TOOL_LIGHT : 0;
            model.SetLit(logic.Lit);
        }
    }

    class ShuttersTask : HandsTask
    {
        readonly ShuttersModel model;
        readonly ShuttersLogic logic;
        public override string Hint { get { return "Point at a shutter, hold the mouse button and drag right to shut it. Hold it shut until the latch clicks. Gusts whistle before they hit."; } }
        public ShuttersTask(ShuttersModel m, HandsEvents e) { model = m; logic = new ShuttersLogic(e.Play, e.Noise, Random); Parts.AddRange(m.Panels); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { int i = Index(part, "shutter"); return i >= 0 && !logic.Latched[i]; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, Index(f.Held, "shutter"), f.DragX); model.SetOpen(logic.Open); }
    }

    class StoveTask : HandsTask
    {
        readonly StoveModel model;
        readonly StoveLogic logic;
        public override string Hint { get { return "Point at a knob, hold the mouse button and drag left or right to turn it. Turn slowly near the off mark and it clicks into place."; } }
        public StoveTask(StoveModel m, HandsEvents e) { model = m; logic = new StoveLogic(e.Play, Random); Parts.AddRange(m.Knobs); m.SetKnobs(logic.Angle, logic.Flame); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return Index(part, "knob") >= 0; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, Index(f.Held, "knob"), f.DragX); model.SetKnobs(logic.Angle, logic.Flame); }
    }

    class DigTask : HandsTask
    {
        /// <summary>When the relic starts to show near the bottom of the hole.</summary>
        const double RELIC_SHOWS_DEPTH = 0.8;
        /// <summary>How far the trowel dips into the soil as you scoop.</summary>
        const double SCOOP_DIP_M = 0.06;
        readonly DigModel model;
        readonly DigLogic logic;
        double dip;
        public override string Hint { get { return "Point at the soil, hold the mouse button and move the mouse down to scoop. Dig steadily: frantic digging is loud."; } }
        public DigTask(DigModel m, HandsEvents e)
        {
            model = m;
            logic = new DigLogic(e.Play, e.Noise);
            Parts.Add(m.Soil);
            Tool = new GameObject("Trowel").transform;
            Box(Tool, 0.07, 0.005, 0.12, 0x8a8d92, 0, 0, 0.06);
            Box(Tool, 0.025, 0.025, 0.1, 0x5a3b22, 0, 0, -0.05);
        }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "soil"; }
        public override void SetFound() { logic.SetFound(); }
        public override void Update(HandsFrame f)
        {
            bool onSoil = f.Held == "soil";
            logic.Update(f.Dt, onSoil, f.Holding, f.DragY);
            // The trowel rests where you look at the soil, and dips as you scoop.
            float depth = Mathf.Min(Vector3.Distance(f.Ray.origin, model.Soil.transform.position), (float)TOOL_REST_M * 2);
            dip = onSoil && f.DragY > 0 ? SCOOP_DIP_M : Math.Max(0, dip - f.Dt * 0.3);
            var p = f.Ray.GetPoint(depth);
            p.y -= (float)dip;
            Tool.position = p;
            Tool.LookAt(new Vector3(f.Ray.origin.x, p.y + 0.3f, f.Ray.origin.z));
            model.SetDepth(logic.Depth, logic.Found && logic.Depth >= RELIC_SHOWS_DEPTH);
        }
    }

    class LetterTask : HandsTask
    {
        readonly LetterModel model;
        readonly LetterLogic logic;
        readonly GameObject flame;
        readonly Light light;
        public override string Hint { get { return "Hold the mouse button and flick down to strike a match. Keep the flame just under the swaying letter until it catches. Turn slowly, or it goes out."; } }
        public LetterTask(LetterModel m, HandsEvents e)
        {
            model = m;
            logic = new LetterLogic(e.Play, Random);
            Parts.Add(m.Letter);
            Tool = MatchTool(out flame, out light);
        }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return false; }
        public override bool Glows(string part) { return logic.Match.Lit && !logic.Caught; }
        public override void Update(HandsFrame f)
        {
            var bottom = model.Bottom.position;
            float depth = Vector3.Distance(f.Ray.origin, bottom);
            Tool.position = f.Ray.GetPoint(Mathf.Min(depth, (float)TOOL_REST_M * 2));
            Tool.LookAt(f.Ray.origin);
            bool under = DistanceToRay(f.Ray, bottom) < HandsConfig.N("letter", "aimM");
            logic.Update(f.Dt, under, f.Holding, f.DragY, f.LookSpeed);
            flame.SetActive(logic.Match.Lit);
            light.intensity = logic.Match.Lit ? (float)TOOL_LIGHT : 0;
            model.SetLetter(logic.Sway, logic.Heat / HandsConfig.N("letter", "catchSec"), logic.Burned / HandsConfig.N("letter", "burnSec"));
        }
    }

    class ClockTask : HandsTask
    {
        readonly ClockModel model;
        readonly ClockLogic logic;
        public override string Hint { get { return "The clock has stopped. The guest book in this room says when to wake the house: grab the clock face and drag right or left to turn the hands to that time, then let go."; } }
        public ClockTask(ClockModel m, HandsEvents e) { model = m; logic = new ClockLogic(e.Play, m.Target); Parts.Add(m.Face); m.SetHands(logic.MinuteDeg, logic.HourDeg); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "face" && !logic.Done; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, f.Held == "face", f.DragX); model.SetHands(logic.MinuteDeg, logic.HourDeg); }
    }

    class BoilerTask : HandsTask
    {
        readonly BoilerModel model;
        readonly BoilerLogic logic;
        public override string Hint { get { return "Point at the wheel, hold the mouse button and drag right to open the valve, left to close it. Bring the needle into the dark green band on the dial and keep it there."; } }
        public BoilerTask(BoilerModel m, HandsEvents e) { model = m; logic = new BoilerLogic(e.Play); Parts.AddRange(m.Wheel); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "wheel"; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, f.Held == "wheel", f.DragX); model.SetValve(logic.OpenDeg, logic.Pressure); }
    }

    class PortraitsTask : HandsTask
    {
        readonly PortraitsModel model;
        readonly PortraitsLogic logic;
        public override string Hint { get { return "Point at a crooked portrait, hold the mouse button and drag sideways to level it, then let go. They are heavy: turn them slowly."; } }
        public PortraitsTask(PortraitsModel m, HandsEvents e) { model = m; logic = new PortraitsLogic(e.Play, Random); Parts.AddRange(m.Frames); m.SetTilt(logic.Tilt); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { int i = Index(part, "portrait"); return i >= 0 && !logic.Level[i]; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, Index(f.Held, "portrait"), f.DragX); model.SetTilt(logic.Tilt); }
    }

    class RosesTask : HandsTask
    {
        /// <summary>How far above the thing you aim at the jug in your hand hangs.</summary>
        const double JUG_ABOVE_M = 0.32;
        /// <summary>How far the jug in your hand tips while it pours.</summary>
        const double JUG_TIP_RAD = 1.6;
        readonly RosesModel model;
        readonly RosesLogic logic;
        readonly Transform jug;
        readonly Action<int, int> setJug;
        string last;
        public override string Hint { get { return "Get exactly the vase's number of measures into it. Click a jug to pick it up. With a jug in hand, click the pump to fill it, the other jug or the vase to pour into it, the bucket to empty it, or its mat to put it down. Too much in the vase? Click it with empty hands to tip it out."; } }
        public RosesTask(RosesModel m, HandsEvents e)
        {
            model = m;
            logic = new RosesLogic(e.Play, Random);
            Parts.AddRange(m.Jugs);
            Parts.AddRange(m.Mats);
            Parts.Add(m.Vase);
            Parts.Add(m.Pump);
            Parts.Add(m.Bucket);
            Tool = new GameObject("Jug in hand").transform;
            GameObject glass;
            setJug = Stations.JugModel(Tool, out jug, out glass);
            m.SetPuzzle(logic.Jugs, logic.Target);
            Show();
        }
        public override bool Done { get { return logic.Done; } }

        /// <summary>What clicking this part does now, or null.</summary>
        JugAction? Action(string part)
        {
            int hand = logic.InHand;
            int j = Index(part, "jug");
            if (j >= 0) return hand == -1 ? new JugAction(JugKind.Pick, j) : new JugAction(JugKind.Pour, j);
            int mat = Index(part, "mat");
            if (mat >= 0) return mat == hand ? new JugAction(JugKind.PutDown) : (JugAction?)null;
            if (part == "vase") return hand == -1 ? new JugAction(JugKind.TipVase) : new JugAction(JugKind.PourVase);
            if (part == "pump") return new JugAction(JugKind.Fill);
            if (part == "bucket") return new JugAction(JugKind.Empty);
            return null;
        }

        public override bool CanHold(string part) { var a = Action(part); return a.HasValue && logic.Can(a.Value); }

        public override void Update(HandsFrame f)
        {
            // A click counts once, when the button goes down on a part.
            string clicked = f.Held != null && f.Held != last ? f.Held : null;
            last = f.Held;
            var a = Action(clicked);
            if (a.HasValue) logic.Act(a.Value);
            logic.Update(f.Dt);
            Show();
            // The jug in your hand hangs over what you aim at, or in front of you; it tips as it pours.
            int hand = logic.Done ? -1 : logic.InHand;
            jug.gameObject.SetActive(hand != -1);
            if (hand == -1) return;
            var aimed = f.Aim != null ? Parts.FirstOrDefault(p => p.GetComponent<HandPart>().Name == f.Aim) : null;
            Vector3 at = aimed != null ? aimed.transform.position + Vector3.up * (float)JUG_ABOVE_M : f.Ray.GetPoint((float)TOOL_REST_M);
            Tool.position = at - f.Ray.direction * 0.12f;
            // Faces you (three.js: rotation.y = atan2(-dir.x, -dir.z)), in Unity's axes.
            var d = f.Ray.direction;
            Tool.rotation = R(0, Math.Atan2(-d.x, d.z), 0);
            double pouring = logic.Busy > 0 ? Math.Sin(logic.Busy / HandsConfig.N("roses", "pourSec") * Math.PI) : 0;
            jug.localRotation = R(-pouring * JUG_TIP_RAD, 0, 0);
        }

        void Show()
        {
            // Done, the jug in your hand goes back on its mat.
            model.SetWater(logic.Water, logic.Vase, logic.Done ? -1 : logic.InHand);
            if (logic.InHand != -1) setJug(logic.Jugs[logic.InHand], logic.Water[logic.InHand]);
        }
    }

    class SwitchboardTask : HandsTask
    {
        readonly SwitchboardModel model;
        readonly SwitchboardLogic logic;
        public override string Hint { get { return "Point at a plug, hold the mouse button and drag it up to the socket with the same sign and colour. Hold it there until the lamp lights. The wrong socket sparks."; } }
        public SwitchboardTask(SwitchboardModel m, HandsEvents e)
        {
            model = m;
            logic = new SwitchboardLogic(e.Play, m.Hooks, m.Sockets, Random);
            Parts.AddRange(m.Plugs);
            // Each socket wears the colour and sign of the cable that belongs in it.
            var cables = new int[m.Sockets.Length];
            for (int cable = 0; cable < logic.SocketOf.Length; cable++) cables[logic.SocketOf[cable]] = cable;
            m.SetSockets(cables);
            Show();
        }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { int i = Index(part, "plug"); return i >= 0 && !logic.Plugged[i]; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, Index(f.Held, "plug"), f.DragX, f.DragY); Show(); }
        void Show()
        {
            var lit = new bool[model.Sockets.Length];
            for (int i = 0; i < logic.Plugged.Length; i++) if (logic.Plugged[i]) lit[logic.SocketOf[i]] = true;
            model.SetPlugs(logic.Plug, lit);
        }
    }

    class MirrorTask : HandsTask
    {
        /// <summary>How far in front of the glass the cloth sits as you wipe.</summary>
        const float CLOTH_OFF_M = 0.02f;
        readonly MirrorModel model;
        readonly MirrorLogic logic;
        public override string Hint { get { return "Hold the mouse button on the glass and move the mouse to wipe the fog away. Wipe slowly: scrubbing fast only smears it."; } }
        public MirrorTask(MirrorModel m, HandsEvents e)
        {
            model = m;
            logic = new MirrorLogic(e.Play, Random);
            Parts.Add(m.Glass);
            Tool = new GameObject("Cloth").transform;
            Box(Tool, 0.12, 0.1, 0.015, 0xd8d0c0);
            m.SetFog(logic.Fog, 0);
        }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "glass"; }
        public override void Update(HandsFrame f)
        {
            bool holding = f.Held == "glass";
            var grab = holding && logic.Cloth == null ? OnGlass(f.Ray) : null;
            logic.Update(f.Dt, grab, holding, f.DragX, f.DragY);
            model.SetFog(logic.Fog, logic.FaceLeft / HandsConfig.N("mirror", "faceSec"));
            // The cloth is on the glass while you wipe, and in your hand in front of you otherwise.
            var glass = model.Glass.transform;
            if (logic.Cloth != null)
            {
                // The glass's front is three.js +z, which is Unity's -z.
                Tool.position = glass.TransformPoint(new Vector3((float)logic.Cloth.U, (float)logic.Cloth.V, -CLOTH_OFF_M));
                Tool.rotation = glass.rotation;
            }
            else
            {
                Tool.position = f.Ray.GetPoint((float)TOOL_REST_M);
                Tool.LookAt(f.Ray.origin);
            }
        }

        /// <summary>Where the crosshair meets the glass, from the glass's middle.</summary>
        FacePoint OnGlass(Ray ray)
        {
            var glass = model.Glass.transform;
            var plane = new UnityEngine.Plane(glass.forward, glass.position);
            float enter;
            if (!plane.Raycast(ray, out enter)) return null;
            var local = glass.InverseTransformPoint(ray.GetPoint(enter));
            return new FacePoint(local.x, local.y);
        }
    }

    class TrunkTask : HandsTask
    {
        /// <summary>The lid strains harder this long before it bursts open.</summary>
        const double RATTLE_FROM_SEC = 2;
        readonly TrunkModel model;
        readonly TrunkLogic logic;
        public override string Hint { get { return "Point at the lid, hold the mouse button and drag down to press it shut. Hold it until it clicks, then drag each latch to the right before the lid bursts open."; } }
        public TrunkTask(TrunkModel m, HandsEvents e) { model = m; logic = new TrunkLogic(e.Play); Parts.Add(m.Lid); Parts.AddRange(m.Latches); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part)
        {
            if (part == "lid") return !logic.Shut;
            int i = Index(part, "latch");
            return i >= 0 && logic.Shut && logic.Latch[i] < 90;
        }
        public override void Update(HandsFrame f)
        {
            logic.Update(f.Dt, f.Held == "lid", Index(f.Held, "latch"), f.DragX, f.DragY);
            double rattle = logic.Shut && !logic.Done ? 1 - Math.Min(1, logic.PopLeft / RATTLE_FROM_SEC) : 0;
            model.SetTrunk(logic.Lid, logic.Latch, rattle);
        }
    }

    class PianoTask : HandsTask
    {
        readonly PianoModel model;
        readonly PianoLogic logic;
        string last;
        int down = -1;
        public override string Hint { get { return "Listen: the piano plays a tune, its keys going down as it plays. Then click the same keys in the same order. Each round adds a note. A wrong key is a sour note the ghost can hear. Click the card to hear the tune again."; } }
        public PianoTask(PianoModel m, HandsEvents e)
        {
            model = m;
            logic = new PianoLogic(e.Play, e.Noise, Random);
            Parts.AddRange(m.Keys);
            Parts.Add(m.Card);
            Show();
        }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return (Index(part, "key") >= 0 || part == "card") && !logic.Listening && !logic.Done; }
        public override void Update(HandsFrame f)
        {
            // A key (or the card) counts once each time the button goes down on it.
            string clicked = f.Held != null && f.Held != last ? f.Held : null;
            last = f.Held;
            int pressed = Index(clicked, "key");
            logic.Update(f.Dt, pressed, clicked == "card");
            if (pressed >= 0 && logic.Ring == HandsConfig.N("piano", "ringSec")) down = pressed;
            Show();
        }
        void Show()
        {
            string mode = logic.Done ? "done" : !logic.Listening ? "play" : logic.Again ? "again" : "listen";
            var card = new PianoCard { Round = logic.Round, Rounds = HandsConfig.I("piano", "rounds"), Notes = logic.Length, Played = !logic.Listening ? logic.Step : 0, Mode = mode };
            // Once in tune no key stays down: the piano is left as it was.
            model.SetPiano(card, logic.Done ? -1 : logic.Listening ? logic.Showing : logic.Ring > 0 ? down : -1);
        }
    }

    class SheetsTask : HandsTask
    {
        readonly SheetsModel model;
        readonly SheetsLogic logic;
        public override string Hint { get { return "Point at the loose half of the sheet, hold the mouse button and pull it over: drag down to pull it toward you, left to pull it across. Let go too soon and it slides back."; } }
        public SheetsTask(SheetsModel m, HandsEvents e) { model = m; logic = new SheetsLogic(e.Play); Parts.Add(m.Flap); m.SetSheet(0, 0); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "sheet" && !logic.Done; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, f.Held == "sheet", f.DragX, f.DragY); model.SetSheet(logic.Folds, logic.Progress); }
    }

    class CradleTask : HandsTask
    {
        readonly CradleModel model;
        readonly CradleLogic logic;
        public override string Hint { get { return "Hold the mouse button on the cradle and push it gently left and right in time with its swing. Push too hard and the baby cries, and the ghost hears it."; } }
        public CradleTask(CradleModel m, HandsEvents e) { model = m; logic = new CradleLogic(e.Play, e.Noise); Parts.Add(m.Basket); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "basket"; }
        public override void Update(HandsFrame f)
        {
            logic.Update(f.Dt, f.Held == "basket", f.DragX);
            model.SetCradle(logic.Angle, logic.Calm / HandsConfig.N("cradle", "fillSec"), logic.Crying > 0);
        }
    }

    class LockboxTask : HandsTask
    {
        readonly LockboxModel model;
        readonly LockboxLogic logic;
        public override string Hint { get { return "Hold the dial and drag right until a pin clicks, then drag left until the next one clicks, then right, then left. A stud lights up for each pin."; } }
        public LockboxTask(LockboxModel m, HandsEvents e) { model = m; logic = new LockboxLogic(e.Play, Random); Parts.Add(m.Dial); m.SetDial(0, 0, false); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "dial" && !logic.Done; }
        public override void Update(HandsFrame f) { logic.Update(f.Dt, f.Held == "dial", f.DragX); model.SetDial(logic.Dial, logic.Set, logic.Done); }
    }

    class DrainTask : HandsTask
    {
        /// <summary>How often a ripple spreads from your hand: far from the relic, and right on it.</summary>
        const double RIPPLE_SLOW_PER_SEC = 0.6, RIPPLE_FAST_PER_SEC = 2.5;
        readonly DrainModel model;
        readonly DrainLogic logic;
        /// <summary>Right and away from you, in the drain's own three.js x and z.</summary>
        Vector2? right, away;
        double ripple;
        public override string Hint { get { return "Hold the mouse button to reach into the water, and feel about slowly. The water ripples faster near the relic. Hold still on it to grip it, then drag up to pull it out."; } }
        public DrainTask(DrainModel m, HandsEvents e) { model = m; logic = new DrainLogic(e.Play, Random); Parts.Add(m.Water); }
        public override bool Done { get { return logic.Done; } }
        public override bool CanHold(string part) { return part == "water"; }
        public override bool Glows(string part) { return CanHold(part) && !logic.Gripped; }
        public override void Update(HandsFrame f)
        {
            if (!away.HasValue) Sides(f.Ray.direction);
            bool holding = f.Held == "water";
            logic.Update(f.Dt, holding, f.DragX, f.DragY);
            double near = logic.Closeness;
            ripple = (ripple + f.Dt * (RIPPLE_SLOW_PER_SEC + (RIPPLE_FAST_PER_SEC - RIPPLE_SLOW_PER_SEC) * near)) % 1;
            var r = right.Value;
            var a = away.Value;
            var h = logic.Hand;
            Vector2? at = null;
            if (holding || logic.Gripped) at = new Vector2((float)(r.x * h.U + a.x * h.V), (float)(r.y * h.U + a.y * h.V));
            model.SetDrain(new DrainShow { At = at, Ripple = ripple, Strength = near, Lift = logic.Pulled / HandsConfig.N("drain", "pullPx"), Gripped = logic.Gripped });
        }

        /// <summary>Along the drain's sides, so your hand stays in the water.</summary>
        void Sides(Vector3 look)
        {
            var u = model.Root.InverseTransformDirection(look);
            // In three.js's axes (z flipped).
            float dx = u.x, dz = -u.z;
            var aw = Math.Abs(dx) > Math.Abs(dz) ? new Vector2(Math.Sign(dx), 0) : new Vector2(0, dz != 0 ? Math.Sign(dz) : -1);
            away = aw;
            right = new Vector2(-aw.y, aw.x);
        }
    }

    /// <summary>Your hands at work (work.ts): picks the part under the crosshair, makes it glow, and feeds the task.</summary>
    public class HandsWork
    {
        /// <summary>How far your hand reaches from your eye.</summary>
        const float REACH_M = 2.2f;
        /// <summary>How a usable part glows under the crosshair.</summary>
        const int GLOW = 0x3a2c14;
        /// <summary>How quickly the measured turning speed of your view follows the real one.</summary>
        const double LOOK_SMOOTH_SEC = 0.08;

        HandsTask task;
        bool holding;
        string held, aim, heldSinceFrame;
        bool pressedSinceFrame;
        GameObject glowing;
        double dragX, dragY, lookSpeed, lastYaw, lastPitch;
        bool wasDone;

        public bool Active { get { return task != null; } }
        /// <summary>The mouse button is down: the hands get the mouse, not the view.</summary>
        public bool Grabbing { get { return task != null && holding; } }
        public string Hint { get { return task != null ? task.Hint : null; } }

        public void Start(HandsTask t, double yaw, double pitch)
        {
            Stop();
            task = t;
            wasDone = false;
            lastYaw = yaw;
            lastPitch = pitch;
            lookSpeed = 0;
        }

        public void Stop()
        {
            if (task == null) return;
            if (task.Tool != null) UnityEngine.Object.Destroy(task.Tool.gameObject);
            SetGlow(null);
            task = null;
            holding = false;
            held = null;
        }

        public void Press(bool down)
        {
            holding = down;
            held = down && aim != null && task != null && task.CanHold(aim) ? aim : null;
            if (down)
            {
                pressedSinceFrame = true;
                heldSinceFrame = held;
            }
        }

        /// <summary>Mouse movement while holding, in the browser's pixels (right and down positive).</summary>
        public void Move(double dx, double dy) { dragX += dx; dragY += dy; }

        /// <summary>The server says the relic is in this place: dig on.</summary>
        public void Found()
        {
            if (task != null) task.SetFound();
            wasDone = false;
        }

        /// <summary>One frame of work. Returns true the moment the task (or this stage of it) is done.</summary>
        public bool Frame(double dt, double yaw, double pitch, Camera camera)
        {
            if (task == null || dt <= 0) return false;
            // The shorter way round, in case the view's yaw was set across the half turn.
            double dYaw = Math.Atan2(Math.Sin(yaw - lastYaw), Math.Cos(yaw - lastYaw));
            double turned = Math.Sqrt(dYaw * dYaw + (pitch - lastPitch) * (pitch - lastPitch)) / dt;
            lookSpeed += (turned - lookSpeed) * Math.Min(1, dt / LOOK_SMOOTH_SEC);
            lastYaw = yaw;
            lastPitch = pitch;

            var ray = camera.ViewportPointToRay(new Vector3(0.5f, 0.5f, 0));
            // Only the task's own parts can be picked, as the browser's raycast does.
            GameObject hitPart = null;
            float nearest = float.PositiveInfinity;
            foreach (var hit in Physics.RaycastAll(ray, REACH_M, ~0, QueryTriggerInteraction.Collide))
            {
                var go = hit.collider.gameObject;
                if (hit.distance < nearest && go.GetComponent<HandPart>() != null && task.Parts.Contains(go)) { nearest = hit.distance; hitPart = go; }
            }
            aim = hitPart != null ? hitPart.GetComponent<HandPart>().Name : null;
            SetGlow(hitPart != null && task.Glows(aim) ? hitPart : null);

            var f = new HandsFrame
            {
                Dt = dt, Ray = ray, Aim = aim,
                Held = held ?? heldSinceFrame,
                Holding = holding || pressedSinceFrame,
                DragX = dragX, DragY = dragY, LookSpeed = lookSpeed,
            };
            dragX = dragY = 0;
            pressedSinceFrame = false;
            heldSinceFrame = null;
            task.Update(f);
            bool justDone = task.Done && !wasDone;
            wasDone = task.Done;
            return justDone;
        }

        void SetGlow(GameObject part)
        {
            if (part == glowing) return;
            if (glowing != null) Shapes.SetGlow(glowing, Color.black);
            if (part != null) Shapes.SetGlow(part, Hex(GLOW));
            glowing = part;
        }
    }
}
