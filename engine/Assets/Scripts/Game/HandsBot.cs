using System;
using System.Collections;
using System.Collections.Generic;
using System.Linq;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// Test only (-handsTest): robot hands that do each task the way a player would, so every kind
    /// can be tried unattended. They stand at the station, turn the view onto its real parts, and
    /// press and drag through the same path as the mouse (HandsWork.Press and Move), at speeds a
    /// careful player would use. They read the task's state only to decide what to do next.
    /// </summary>
    public class HandsBot
    {
        const double AIM_RAD_PER_SEC = 1.5, STAND_M = 1.0, KIND_TIMEOUT_SEC = 120;

        public Action<string, Dictionary<string, object>> Send;
        public Action<string> Shot;
        public Func<string> TaskState;
        public HandsWork Hands;
        public LocalPlayer Me;
        public MapInfo Map;
        public Stations Stations;
        public string ShotDir;
        /// <summary>The relic in your hands ("" for none), and a relic's status by id.</summary>
        public Func<string> Carrying;
        public Func<string, string> RelicStatus;
        /// <summary>The relic door (sim x, z) and the axis its wall runs along.</summary>
        [NonSerialized] public double DoorX, DoorZ;
        [NonSerialized] public bool DoorAlongX;
        public readonly List<string> Results = new List<string>();

        double vx, vy;

        static double Dt { get { return Time.deltaTime; } }

        /// <summary>Each frame: the drag the robot hand is making (pixels per second, right and down positive).</summary>
        public void Frame()
        {
            if (Hands.Active && Me.HandDown && (vx != 0 || vy != 0)) Hands.Move(vx * Dt, vy * Dt);
        }

        public IEnumerator Run(List<string> ids)
        {
            Send("debug", new Dictionary<string, object> { { "toggleGhost", true } });
            Send("debug", new Dictionary<string, object> { { "freezeClock", true } });
            yield return new WaitForSeconds(1);
            foreach (var id in ids)
            {
                double x, z;
                bool place = !Where(id, out x, out z);
                Send("debug", new Dictionary<string, object> { { place ? "hideRelicAt" : "giveTask", id } });
                double yaw = Stations.FacingYaw(Map, x, z);
                Send("debug", new Dictionary<string, object> { { "teleport", new Dictionary<string, object> { { "x", x + Math.Sin(yaw) * STAND_M }, { "z", z + Math.Cos(yaw) * STAND_M } } } });
                yield return new WaitForSeconds(1.2f);
                // Face the station (its front looks along yaw, so you look back along it), a little down.
                Me.Yaw = yaw;
                Me.Pitch = -0.35;
                yield return new WaitForSeconds(0.5f);
                Send("use", new Dictionary<string, object> { { "down", true } });
                yield return new WaitForSeconds(0.2f);
                Send("use", new Dictionary<string, object> { { "down", false } });
                double waited = 0;
                while (!Hands.Active && waited < 3) { waited += Dt; yield return null; }
                if (!Hands.Active) { Result(id, "did not open"); continue; }
                var task = Hands.Task;
                foreach (var part in task.Parts.Take(3))
                {
                    var r = part.GetComponent<Renderer>();
                    var mf = part.GetComponent<MeshFilter>();
                    Debug.Log("Part " + part.name + ": active " + part.activeInHierarchy + ", drawn " + (r != null && r.enabled) + ", at " + part.transform.position + ", bounds " + (r != null ? r.bounds.size.ToString() : "-") + ", verts " + (mf != null && mf.sharedMesh != null ? mf.sharedMesh.vertexCount : -1) + ", shader " + (r != null ? r.sharedMaterial.shader.name : "-") + ", colour " + (r != null ? r.sharedMaterial.color.ToString() : "-") + ", queue " + (r != null ? r.sharedMaterial.renderQueue : 0) + ", keywords " + (r != null ? string.Join(" ", r.sharedMaterial.shaderKeywords) : "") + ", layer " + part.layer + ", scale " + part.transform.lossyScale);
                }
                yield return new WaitForSeconds(0.6f);
                Shot(ShotDir + "/" + id + "-open.png");
                double started = Time.realtimeSinceStartupAsDouble;
                var solve = Solve(task);
                while (Hands.Active && Hands.Task == task && Time.realtimeSinceStartupAsDouble - started < KIND_TIMEOUT_SEC)
                {
                    if (!solve.MoveNext()) { yield return null; continue; }
                    yield return solve.Current;
                }
                Release();
                // Done on this side: the server's answer closes it.
                waited = 0;
                while (Hands.Active && waited < 5) { waited += Dt; yield return null; }
                Result(id, task.Done ? "done in " + (Time.realtimeSinceStartupAsDouble - started).ToString("0.0") + " s" : "NOT done (timed out)");
                yield return new WaitForSeconds(0.8f);
                Shot(ShotDir + "/" + id + "-after.png");
                yield return new WaitForSeconds(0.5f);
                if (!string.IsNullOrEmpty(Carrying())) yield return PlaceRelic(id);
            }
            Debug.Log("Hands test finished: " + string.Join("; ", Results.ToArray()));
        }

        /// <summary>Carries the relic you found to the relic door and holds E to place it there (GDD 10).</summary>
        IEnumerator PlaceRelic(string from)
        {
            string relic = Carrying();
            Shot(ShotDir + "/" + from + "-carrying.png");
            foreach (var side in new[] { 1, -1 })
            {
                double x = DoorX + (DoorAlongX ? 0 : side * 0.9), z = DoorZ + (DoorAlongX ? side * 0.9 : 0);
                Send("debug", new Dictionary<string, object> { { "teleport", new Dictionary<string, object> { { "x", x }, { "z", z } } } });
                yield return new WaitForSeconds(1.2f);
                Send("use", new Dictionary<string, object> { { "down", true } });
                double waited = 0;
                while (RelicStatus(relic) != "placed" && waited < 6) { waited += Dt; yield return null; }
                Send("use", new Dictionary<string, object> { { "down", false } });
                if (RelicStatus(relic) == "placed") break;
            }
            Result(from + " relic " + relic, RelicStatus(relic) == "placed" ? "carried and placed at the relic door" : "NOT placed (status " + RelicStatus(relic) + ")");
            Shot(ShotDir + "/" + from + "-placed.png");
            yield return new WaitForSeconds(0.5f);
        }

        void Result(string id, string what)
        {
            Results.Add(id + " " + what);
            Debug.Log("Hands test: " + id + " " + what);
        }

        /// <summary>Where a task or a place to search is (sim x and z); false for a place.</summary>
        bool Where(string id, out double x, out double z)
        {
            var t = Map.TaskById(id);
            if (t != null) { x = t.At.X; z = t.At.Z; return true; }
            foreach (var s in Map.RelicSpots)
            {
                var list = s.Places ?? new List<MapInfo.Place> { new MapInfo.Place { Id = s.Id, At = s.At } };
                foreach (var p in list) if (p.Id == id) { x = p.At.X; z = p.At.Z; return false; }
            }
            throw new Exception("No task or place " + id);
        }

        // ---------- Hands ----------

        IEnumerator Aim(Vector3 target)
        {
            while (true)
            {
                var d = (target - Me.Camera.transform.position).normalized;
                double wantYaw = Math.Atan2(-d.x, d.z), wantPitch = Math.Asin(d.y);
                double dy = Math.Atan2(Math.Sin(wantYaw - Me.Yaw), Math.Cos(wantYaw - Me.Yaw)), dp = wantPitch - Me.Pitch;
                double len = Math.Sqrt(dy * dy + dp * dp), step = AIM_RAD_PER_SEC * Dt;
                if (len <= step) { Me.Yaw += dy; Me.Pitch = wantPitch; yield return null; yield break; }
                Me.Yaw += dy / len * step;
                Me.Pitch += dp / len * step;
                yield return null;
            }
        }

        static Vector3 Centre(GameObject g) { return g.GetComponent<Renderer>().bounds.center; }

        void Press() { Hands.Press(true); Me.HandDown = true; }
        void Release() { vx = vy = 0; if (Me.HandDown) { Hands.Press(false); Me.HandDown = false; } }

        IEnumerator Grab(GameObject part) { yield return Aim(Centre(part)); yield return null; Press(); yield return null; }

        IEnumerator Click(GameObject part)
        {
            yield return Grab(part);
            yield return null;
            Release();
            yield return null;
        }

        IEnumerator Wait(double sec) { yield return new WaitForSeconds((float)sec); }

        /// <summary>A sharp flick down with the button held: strikes a match.</summary>
        IEnumerator Strike()
        {
            Press();
            yield return null;
            Hands.Move(0, 400);
            yield return null;
            Release();
            yield return Wait(0.3);
        }

        IEnumerator Solve(HandsTask task)
        {
            if (task is CandelabraTask) return Candelabra((CandelabraTask)task);
            if (task is LetterTask) return Letter((LetterTask)task);
            if (task is StoveTask) return Stove((StoveTask)task);
            if (task is ShuttersTask) return Shutters((ShuttersTask)task);
            if (task is PortraitsTask) return Portraits((PortraitsTask)task);
            if (task is ClockTask) return Clock((ClockTask)task);
            if (task is BoilerTask) return Boiler((BoilerTask)task);
            if (task is RosesTask) return Roses((RosesTask)task);
            if (task is SwitchboardTask) return Switchboard((SwitchboardTask)task);
            if (task is MirrorTask) return Mirror((MirrorTask)task);
            if (task is TrunkTask) return Trunk((TrunkTask)task);
            if (task is PianoTask) return Piano((PianoTask)task);
            if (task is SheetsTask) return Sheets((SheetsTask)task);
            if (task is CradleTask) return Cradle((CradleTask)task);
            if (task is LockboxTask) return Lockbox((LockboxTask)task);
            if (task is DigTask) return Dig((DigTask)task);
            return Drain((DrainTask)task);
        }

        // ---------- Each task ----------

        IEnumerator Candelabra(CandelabraTask t)
        {
            var tips = t.model.Tips;
            yield return Aim(tips[2].position);
            while (!t.Done)
            {
                if (!t.logic.MatchLit) { yield return Strike(); continue; }
                int i = Array.FindIndex(t.logic.Lit, l => !l);
                if (i < 0) break;
                // The match head hangs just in front of the wick, at the crosshair.
                yield return Aim(tips[i].position);
                double held = 0;
                while (t.logic.MatchLit && !t.logic.Lit[i] && held < 4) { held += Dt; yield return null; }
            }
        }

        IEnumerator Letter(LetterTask t)
        {
            while (!t.Done)
            {
                if (!t.logic.Match.Lit) { yield return Aim(t.model.Bottom.position); yield return Strike(); continue; }
                // Follow the swaying letter's bottom edge.
                yield return Aim(t.model.Bottom.position);
            }
        }

        IEnumerator Stove(StoveTask t)
        {
            for (int i = 0; i < t.model.Knobs.Count; i++)
            {
                if (t.logic.InNotch[i]) continue;
                yield return Grab(t.model.Knobs[i]);
                while (!t.logic.InNotch[i])
                {
                    double a = t.logic.Angle[i];
                    // Fast while far from the off mark, slowly near it so the notch catches.
                    vx = -Math.Sign(a) * (Math.Abs(a) > 25 ? 600 : 160);
                    yield return null;
                }
                Release();
                yield return Wait(0.3);
            }
            while (!t.Done) yield return null;
        }

        IEnumerator Shutters(ShuttersTask t)
        {
            while (!t.Done)
            {
                int i = Array.FindIndex(t.logic.Latched, l => !l);
                yield return Grab(t.model.Panels[i]);
                while (!t.logic.Latched[i])
                {
                    vx = t.logic.Open[i] > 0.02 ? 500 : 60;
                    yield return null;
                }
                Release();
                yield return Wait(0.3);
            }
        }

        IEnumerator Portraits(PortraitsTask t)
        {
            while (!t.Done)
            {
                int i = Array.FindIndex(t.logic.Level, l => !l);
                yield return Grab(t.model.Frames[i]);
                double sign = 1, last = Math.Abs(t.logic.Tilt[i]);
                while (Math.Abs(t.logic.Tilt[i]) > 0.8)
                {
                    vx = -sign * Math.Sign(t.logic.Tilt[i]) * Math.Min(100, 20 + Math.Abs(t.logic.Tilt[i]) * 8);
                    yield return Wait(0.15);
                    double now = Math.Abs(t.logic.Tilt[i]);
                    if (now > last + 0.3) sign = -sign;
                    last = now;
                }
                Release();
                double waited = 0;
                while (!t.logic.Level[i] && waited < 3) { waited += Dt; yield return null; }
            }
        }

        IEnumerator Clock(ClockTask t)
        {
            yield return Grab(t.model.Face);
            while (true)
            {
                double diff = ((t.logic.Target - t.logic.Minutes) % 720 + 720) % 720;
                double gap = Math.Min(diff, 720 - diff);
                if (gap <= 1) break;
                vx = (diff < 360 ? 1 : -1) * (gap > 30 ? 450 : 60);
                yield return null;
            }
            Release();
            while (!t.Done) yield return null;
        }

        IEnumerator Boiler(BoilerTask t)
        {
            yield return Grab(t.model.Wheel[0]);
            double mid = (HandsConfig.N("boiler", "safeMin") + HandsConfig.N("boiler", "safeMax")) / 2;
            while (!t.Done)
            {
                // Open the valve while the pressure is high, close it while low; the needle lags.
                double err = t.logic.Pressure - mid;
                vx = Math.Abs(err) < 0.02 ? 0 : Math.Sign(err) * Math.Min(200, Math.Abs(err) * 2000);
                yield return null;
            }
        }

        IEnumerator Roses(RosesTask t)
        {
            var l = t.logic;
            var plan = PlanRoses(l.Jugs, HandsConfig.I("roses", "vaseCap"), l.Target);
            Debug.Log("Roses plan: " + string.Join(", ", plan.Select(a => a.Kind + (a.Jug >= 0 ? " " + a.Jug : "")).ToArray()));
            foreach (var step in plan)
            {
                // step.Jug: the jug that acts (for a pour, the one poured into is in step.Kind's target).
                int from = step.From;
                if (from >= 0 && l.InHand != from)
                {
                    if (l.InHand >= 0) { yield return Click(t.model.Mats[l.InHand]); yield return Settle(l); }
                    yield return Click(t.model.Jugs[from]);
                    yield return Settle(l);
                }
                GameObject target = step.Kind == JugKind.Fill ? t.model.Pump : step.Kind == JugKind.Empty ? t.model.Bucket : step.Kind == JugKind.PourVase ? t.model.Vase : t.model.Jugs[step.Jug];
                yield return Click(target);
                yield return Settle(l);
            }
            if (l.InHand >= 0 && !t.Done) { yield return Click(t.model.Mats[l.InHand]); yield return Settle(l); }
            while (!t.Done) yield return null;
        }

        IEnumerator Settle(RosesLogic l) { yield return null; while (l.Busy > 0) yield return null; yield return Wait(0.15); }

        struct RoseStep { public JugKind Kind; public int From, Jug; }

        /// <summary>The fewest fills, pours and empties that leave exactly target in the vase.</summary>
        static List<RoseStep> PlanRoses(int[] caps, int vaseCap, int target)
        {
            var start = new[] { 0, 0, 0 };
            var seen = new Dictionary<string, KeyValuePair<string, RoseStep>>();
            Func<int[], string> key = s => s[0] + "," + s[1] + "," + s[2];
            var queue = new Queue<int[]>();
            queue.Enqueue(start);
            seen[key(start)] = new KeyValuePair<string, RoseStep>(null, new RoseStep());
            while (queue.Count > 0)
            {
                var s = queue.Dequeue();
                if (s[2] == target)
                {
                    var steps = new List<RoseStep>();
                    for (string k = key(s); seen[k].Key != null; k = seen[k].Key) steps.Add(seen[k].Value);
                    steps.Reverse();
                    return steps;
                }
                var next = new List<KeyValuePair<int[], RoseStep>>();
                for (int j = 0; j < 2; j++)
                {
                    var f = (int[])s.Clone(); f[j] = caps[j];
                    next.Add(new KeyValuePair<int[], RoseStep>(f, new RoseStep { Kind = JugKind.Fill, From = j, Jug = -1 }));
                    var e = (int[])s.Clone(); e[j] = 0;
                    next.Add(new KeyValuePair<int[], RoseStep>(e, new RoseStep { Kind = JugKind.Empty, From = j, Jug = -1 }));
                    int k2 = 1 - j;
                    var p = (int[])s.Clone(); int m = Math.Min(p[j], caps[k2] - p[k2]); p[j] -= m; p[k2] += m;
                    next.Add(new KeyValuePair<int[], RoseStep>(p, new RoseStep { Kind = JugKind.Pour, From = j, Jug = k2 }));
                    var v = (int[])s.Clone(); int mv = Math.Min(v[j], vaseCap - v[2]); v[j] -= mv; v[2] += mv;
                    next.Add(new KeyValuePair<int[], RoseStep>(v, new RoseStep { Kind = JugKind.PourVase, From = j, Jug = -1 }));
                }
                foreach (var n in next)
                {
                    if (seen.ContainsKey(key(n.Key))) continue;
                    seen[key(n.Key)] = new KeyValuePair<string, RoseStep>(key(s), n.Value);
                    queue.Enqueue(n.Key);
                }
            }
            throw new Exception("No way to fill the vase to " + target);
        }

        IEnumerator Switchboard(SwitchboardTask t)
        {
            var l = t.logic;
            for (int i = 0; i < l.Plug.Length; i++)
            {
                if (l.Plugged[i]) continue;
                yield return Grab(t.model.Plugs[i]);
                var socket = t.model.Sockets[l.SocketOf[i]];
                double mPerPx = HandsConfig.N("switchboard", "mPerPx");
                while (!l.Plugged[i])
                {
                    double du = socket.U - l.Plug[i].U, dv = socket.V - l.Plug[i].V, d = Math.Sqrt(du * du + dv * dv);
                    // Towards the socket at a steady pace; once on it, hold still until it seats.
                    double speed = d < 0.01 ? 0 : Math.Min(300, d / mPerPx / Math.Max(Dt, 0.001));
                    vx = d > 0 ? du / d * speed : 0;
                    vy = d > 0 ? -dv / d * speed : 0;
                    yield return null;
                }
                Release();
                yield return Wait(0.3);
            }
        }

        IEnumerator Mirror(MirrorTask t)
        {
            var l = t.logic;
            yield return Grab(t.model.Glass);
            double mPerPx = HandsConfig.N("mirror", "mPerPx");
            while (!t.Done)
            {
                if (l.Cloth == null) { yield return null; continue; }
                // Wipe toward the nearest fogged patch, slowly.
                int best = -1;
                double bestD = double.PositiveInfinity;
                for (int i = 0; i < l.Fog.Length; i++)
                {
                    if (l.Fog[i] == 0) continue;
                    double d = FacePoint.Distance(l.Cell(i), l.Cloth);
                    if (d < bestD) { bestD = d; best = i; }
                }
                if (best < 0) { vx = vy = 0; yield return null; continue; }
                var c = l.Cell(best);
                double du = c.U - l.Cloth.U, dv = c.V - l.Cloth.V, len = Math.Max(1e-6, Math.Sqrt(du * du + dv * dv));
                double speed = Math.Min(220, Math.Max(40, len / mPerPx / 0.2));
                vx = du / len * speed;
                vy = -dv / len * speed;
                yield return null;
            }
        }

        IEnumerator Trunk(TrunkTask t)
        {
            var l = t.logic;
            yield return Grab(t.model.Lid);
            while (!l.Shut) { vy = 120; yield return null; }
            Release();
            for (int i = 0; i < l.Latch.Length; i++)
            {
                if (!l.Shut) yield break; // burst open: the task starts over (the robot tries again next pass)
                yield return Grab(t.model.Latches[i]);
                while (l.Latch[i] < 90 && l.Shut) { vx = 100; yield return null; }
                Release();
            }
            while (!t.Done) yield return null;
        }

        IEnumerator Piano(PianoTask t)
        {
            var l = t.logic;
            while (!t.Done)
            {
                if (l.Listening) { yield return null; continue; }
                int key = l.Tune[l.Step];
                int before = l.Step, round = l.Round;
                yield return Click(t.model.Keys[key]);
                double waited = 0;
                while (l.Step == before && l.Round == round && !l.Listening && waited < 1) { waited += Dt; yield return null; }
                yield return Wait(0.1);
            }
        }

        IEnumerator Sheets(SheetsTask t)
        {
            var l = t.logic;
            while (!t.Done)
            {
                int folds = l.Folds;
                yield return Grab(t.model.Flap);
                bool toward = l.TowardYou;
                while (l.Folds == folds) { vx = toward ? 0 : -150; vy = toward ? 150 : 0; yield return null; }
                Release();
                yield return Wait(0.4);
            }
        }

        IEnumerator Cradle(CradleTask t)
        {
            var l = t.logic;
            yield return Grab(t.model.Basket);
            while (!t.Done)
            {
                // Push with the swing, gently, only until it swings in the calm band.
                vx = l.Amplitude < 0.2 ? Math.Sign(l.Speed == 0 ? 1 : l.Speed) * 220 : 0;
                yield return null;
            }
        }

        IEnumerator Lockbox(LockboxTask t)
        {
            var l = t.logic;
            yield return Grab(t.model.Dial);
            while (!t.Done)
            {
                // Right for the first pin, left for the next, and so on.
                vx = (l.Set % 2 == 0 ? 1 : -1) * 180;
                yield return null;
            }
        }

        IEnumerator Dig(DigTask t)
        {
            yield return Grab(t.model.Soil);
            while (!t.Done) { vy = 500; yield return null; }
            Release();
            // The server says whether the relic is here; if so, dig on until it is out.
            yield return Wait(1);
            if (t.logic.Found)
            {
                yield return Grab(t.model.Soil);
                while (!t.Done) { vy = 500; yield return null; }
            }
        }

        IEnumerator Drain(DrainTask t)
        {
            var l = t.logic;
            yield return Grab(t.model.Water);
            while (!t.Done)
            {
                if (!l.Gripped)
                {
                    double du = l.Relic.U - l.Hand.U, dv = l.Relic.V - l.Hand.V, d = Math.Sqrt(du * du + dv * dv);
                    double speed = d < 0.01 ? 0 : 90;
                    vx = d > 0 ? du / d * speed : 0;
                    vy = d > 0 ? -dv / d * speed : 0;
                }
                else { vx = 0; vy = -150; }
                yield return null;
            }
        }
    }
}
