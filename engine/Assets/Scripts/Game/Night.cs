using System;
using System.Collections;
using System.Collections.Generic;
using System.Globalization;
using Colyseus;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The night as this player knows it (step C1 of docs/plans/engine-port.md): the server's private
    /// and public messages (shared/src/protocol.ts) and the prompts for what E would do here, as
    /// client/src/game.ts and main.ts work them out in the browser. Every rule stays on the server:
    /// this only remembers what it was told and words it the same way the browser does.
    /// </summary>
    public class Night
    {
        public class TaskEntry { public string StationId, Name, Room; public bool Done; }
        public class RelicNear { public string Id, SpotId; public double X, Z; public bool Hidden; }
        public class Award { public string Title, Why; public List<string> Names = new List<string>(); }
        public class TimelineLine { public string Time, Text; }
        public class RoleLine { public string Name, Role; }
        /// <summary>A Spirit Camera photo once it develops (GDD 15.2): who is in it, and the ghost if it was.</summary>
        public class Photo
        {
            public class Subject { public string Name; public double FrameX, Dist; public bool Demon; }
            public string By;
            public double NightTime;
            public List<Subject> Subjects = new List<Subject>();
            public bool Ghost;
            public double GhostX, GhostDist;
        }
        /// <summary>A power of the possessed and where it stands (GDD 14.2).</summary>
        public class Power { public string Kind, State; public double CooldownLeft; }
        /// <summary>A meeting's vote, to everyone (GDD 16.3).</summary>
        public class VoteResult
        {
            public string Removed, Role;
            public List<KeyValuePair<string, int>> Tally = new List<KeyValuePair<string, int>>();
            public int Skip;
            public List<string> Votes = new List<string>();
        }
        public class MatchEnd
        {
            public string Winner, Reason, Ghost;
            public List<RoleLine> Roles = new List<RoleLine>();
            public List<TimelineLine> Timeline = new List<TimelineLine>();
            public List<Award> Awards = new List<Award>();
            public int Photos;
        }

        /// <summary>End screen wording for each way a match ends (GDD 18), as the browser.</summary>
        public static readonly Dictionary<string, string[]> EndText = new Dictionary<string, string[]>
        {
            { "ritual", new[] { "The sun rises. The investigators win.", "The ritual is complete." } },
            { "dawn", new[] { "Dawn. The possessed win.", "The ritual was not finished before dawn." } },
            { "allDead", new[] { "Nobody is left. The possessed win.", "Every investigator died." } },
            { "outnumbered", new[] { "The possessed win.", "The possessed now equal or outnumber the living investigators." } },
        };

        public static readonly Dictionary<string, string> PartNames = new Dictionary<string, string>
        {
            { "quiet", "Quiet" }, { "calm", "Calm" }, { "restless", "Restless" }, { "furious", "Furious" }, { "dawn", "Dawn" }, { "overtime", "Overtime" },
        };

        /// <summary>Said once as the night moves on, so nobody misses the ghost getting worse.</summary>
        static readonly Dictionary<string, string> PartBanners = new Dictionary<string, string>
        {
            { "calm", "The ghost wakes." },
            { "restless", "The ghost grows restless. It hunts more often." },
            { "furious", "The ghost is furious. It hunts fast and often." },
            { "overtime", "Overtime: hold the circle and finish the ritual." },
        };
        const double PartBannerSec = 4;

        public static readonly Dictionary<string, string> ActionLabels = new Dictionary<string, string>
        {
            { "revive", "Reviving" }, { "hide", "Hiding" }, { "unhide", "Stepping out" }, { "salt", "Pouring salt" },
            { "placeRelic", "Placing relic" }, { "fixFuse", "Fixing the fuse box" }, { "cleanse", "Putting out the flames" },
            { "ringBell", "Ringing the bell" }, { "report", "Reporting the body" }, { "offer", "Offering the relic" },
        };

        readonly Room<GameState> room;
        readonly MapInfo map;
        readonly object config;

        public string Role;
        public List<string> Partners = new List<string>();
        public string GhostWas;
        public readonly List<TaskEntry> Tasks = new List<TaskEntry>();
        public List<RelicNear> RelicsNear = new List<RelicNear>();
        public readonly List<string> Log = new List<string>();
        /// <summary>
        /// The room page's log (main.ts addLogLine), every line since you joined: "You joined the
        /// room" first, as your own join message can come before anything listens.
        /// </summary>
        public readonly List<string> RoomLog = new List<string> { "You joined the room" };
        /// <summary>The room page's two hints (lobbyView.ts readyHint, main.ts startHint) and when the start one came.</summary>
        public string LobbyRefusal = "", StartRefusal;
        public double StartRefusalAt = double.NegativeInfinity;
        /// <summary>Why the host removed you ("kicked"), or null.</summary>
        public string KickedReason;
        /// <summary>Every photo that developed this night, for the room page's "Developed photos" (main.ts addPhotos).</summary>
        public readonly List<Photo> Developed = new List<Photo>();
        /// <summary>Your name as you joined, to skip the server's echo of your own join.</summary>
        public string MyName;
        public MatchEnd End;
        public string Refusal;
        public double RefusalUntil;
        public string Banner;
        public double BannerUntil;
        public string HuntPhase = "";
        public int Hunts;
        /// <summary>The photos that developed as the last meeting began: its evidence.</summary>
        public List<Photo> NewPhotos = new List<Photo>();
        /// <summary>Every photo of the night, for the end screen (GDD 19).</summary>
        public List<Photo> EndPhotos = new List<Photo>();
        /// <summary>Your powers (possessed only), or null; and how long your curse glow lasts.</summary>
        public List<Power> Powers;
        public double CurseLeft;
        /// <summary>Where the Ouija planchette rests this meeting: a name, "" for "I don't know", null if it has not moved.</summary>
        public string OuijaTarget;
        public string OuijaLog = "";
        public VoteResult Result;
        public event Action<Dictionary<string, object>> GhostMoved;
        public event Action<string> Hunted;
        /// <summary>A sound from somewhere (bellRing, doorSlam, powerWhisper, relicDrop) and where (simulation x, z).</summary>
        public event Action<string, double, double> SoundAt;
        public event Action<string> EyesGlow;
        /// <summary>A camera flash: who took it and where they stood.</summary>
        public event Action<string, double, double> Flashed;
        /// <summary>Hands-on work (GDD 26.5): the server opened a task or place for you (id, minigame), closed it (id, reason), found the relic in it (id), or someone's task made a noise (x, z, minigame).</summary>
        public event Action<string, string> TaskOpened;
        public event Action<string, string> TaskClosed;
        public event Action<string> SearchFound;
        public event Action<double, double, string> TaskNoise;
        string partShown = "";
        bool blackoutShown;
        double taintShown;

        public Night(Room<GameState> room, MapInfo map, object config)
        {
            this.room = room;
            this.map = map;
            this.config = config;
            Listen();
        }

        double Now { get { return Time.realtimeSinceStartupAsDouble; } }
        GameState S { get { return room.State; } }
        public Player Me { get { Player p; return S != null && S.players.TryGetValue(room.SessionId, out p) ? p : null; } }
        public bool IsHost { get { return S != null && S.host == room.SessionId; } }
        /// <summary>True while the lamps are out (the ghost's Blackout, until the fuse box is fixed).</summary>
        public bool Blackout { get { return S != null && S.blackout; } }

        double Cfg(string section, string key) { return Json.Num(Json.Obj(config, section), key); }
        bool CfgBool(string section, string key) { return (bool)Json.Obj(config, section)[key]; }

        public void ShowBanner(string text, double seconds)
        {
            Banner = text;
            BannerUntil = Now + seconds;
            Debug.Log("Banner: " + text);
        }

        void AddLog(string line)
        {
            Log.Add(line);
            if (Log.Count > 8) Log.RemoveAt(0);
            Debug.Log("Log: " + line);
        }

        void Listen()
        {
            room.OnMessage<Dictionary<string, object>>("system", m =>
            {
                AddLog(Str(m, "text"));
                // main.ts: your own join, when the log has only "You joined the room", is not said twice.
                if (m.ContainsKey("kind") && Str(m, "kind") == "join" && m.ContainsKey("name") && Str(m, "name") == (MyName ?? "").Trim() && RoomLog.Count <= 1) return;
                RoomLog.Add(Str(m, "text"));
            });
            room.OnMessage<Dictionary<string, object>>("roster", m => { });
            room.OnMessage<Dictionary<string, object>>("role", m =>
            {
                Role = Str(m, "role");
                Partners = new List<string>();
                foreach (var p in Items(m, "partners")) Partners.Add((string)p);
                GhostWas = m.ContainsKey("ghost") ? Str(m, "ghost") : null;
                Debug.Log("Role: " + Role);
                // The task list now shows whether it is real.
                room.Send("tasksRequest");
            });
            room.OnMessage<Dictionary<string, object>>("tasks", m =>
            {
                Tasks.Clear();
                foreach (var o in Items(m, "list"))
                {
                    var t = (IDictionary)o;
                    Tasks.Add(new TaskEntry { StationId = (string)t["stationId"], Name = (string)t["name"], Room = (string)t["room"], Done = (bool)t["done"] });
                }
            });
            room.OnMessage<Dictionary<string, object>>("relicsNear", m =>
            {
                var list = new List<RelicNear>();
                foreach (var o in Items(m, "list"))
                {
                    var r = (IDictionary)o;
                    list.Add(new RelicNear { Id = (string)r["id"], SpotId = (string)r["spotId"], X = Num(r["x"]), Z = Num(r["z"]), Hidden = (bool)r["hidden"] });
                }
                RelicsNear = list;
            });
            room.OnMessage<Dictionary<string, object>>("matchEnd", m =>
            {
                var end = new MatchEnd { Winner = Str(m, "winner"), Reason = Str(m, "reason"), Ghost = m.ContainsKey("ghost") ? m["ghost"] as string : null };
                foreach (var o in Items(m, "roles")) { var r = (IDictionary)o; end.Roles.Add(new RoleLine { Name = (string)r["name"], Role = (string)r["role"] }); }
                foreach (var o in Items(m, "timeline")) { var l = (IDictionary)o; end.Timeline.Add(new TimelineLine { Time = (string)l["time"], Text = (string)l["text"] }); }
                foreach (var o in Items(m, "awards"))
                {
                    var a = (IDictionary)o;
                    var award = new Award { Title = (string)a["title"], Why = (string)a["why"] };
                    foreach (var n in (IList)a["names"]) award.Names.Add((string)n);
                    end.Awards.Add(award);
                }
                end.Photos = Items(m, "photos").Count;
                EndPhotos = Photos(m);
                End = end;
                Debug.Log("Match end: " + end.Winner + " (" + end.Reason + ")");
            });
            room.OnMessage<Dictionary<string, object>>("hunt", m =>
            {
                HuntPhase = Str(m, "phase");
                if (HuntPhase == "start") Hunts++;
                Debug.Log("Hunt " + HuntPhase);
                if (Hunted != null) Hunted(HuntPhase);
            });
            room.OnMessage<Dictionary<string, object>>("startRefused", m =>
            {
                Refuse(Str(m, "reason"));
                StartRefusal = Str(m, "reason");
                StartRefusalAt = Now;
            });
            room.OnMessage<Dictionary<string, object>>("lobbyRefused", m => { Refuse(Str(m, "reason")); LobbyRefusal = Str(m, "reason"); });
            room.OnMessage<Dictionary<string, object>>("kicked", m => { AddLog(Str(m, "reason")); KickedReason = Str(m, "reason"); });
            room.OnMessage<Dictionary<string, object>>("meetingRefused", m => ShowBanner(Str(m, "reason"), 3));
            room.OnMessage<Dictionary<string, object>>("offering", m =>
            {
                int left = S != null ? Math.Max(0, S.tasksTotal - S.tasksDone) : 0;
                ShowBanner((bool)m["right"]
                    ? Str(m, "by") + " offered " + Str(m, "relic") + ". It glows: the ghost was " + Str(m, "ghost") + "! " + (left > 0 ? "Finish the tasks (" + left + " left), then gather in the circle." : "Gather in the circle.")
                    : Str(m, "by") + " offered " + Str(m, "relic") + ". It crumbles to dust, and the ghost is coming!", 6);
            });
            room.OnMessage<Dictionary<string, object>>("flash", m =>
            {
                if (Flashed != null) Flashed(Str(m, "by"), Num(m["x"]), Num(m["z"]));
            });
            room.OnMessage<Dictionary<string, object>>("photoTaken", m =>
                ShowBanner("Photo taken. It develops by the next meeting. Shots left: " + Num(m["shotsLeft"]), 4));
            room.OnMessage<Dictionary<string, object>>("debugGhost", m => ShowBanner((bool)m["paused"] ? "Ghost paused for testing (K to bring it back)" : "Ghost is back", 3));
            room.OnMessage<Dictionary<string, object>>("debugBasement", m => ShowBanner("Basement door opened for testing", 3));
            room.OnMessage<Dictionary<string, object>>("taskOpen", m => { if (TaskOpened != null) TaskOpened(Str(m, "stationId"), Str(m, "minigame")); });
            room.OnMessage<Dictionary<string, object>>("taskClosed", m => { if (TaskClosed != null) TaskClosed(Str(m, "stationId"), Str(m, "reason")); });
            room.OnMessage<Dictionary<string, object>>("searchFound", m => { if (SearchFound != null) SearchFound(Str(m, "stationId")); });
            room.OnMessage<Dictionary<string, object>>("taskNoise", m => { if (TaskNoise != null) TaskNoise(Num(m["x"]), Num(m["z"]), Str(m, "minigame")); });
            // The ghost, meetings and powers (step C4).
            room.OnMessage<Dictionary<string, object>>("ghost", m => { if (GhostMoved != null) GhostMoved(m); });
            foreach (var type in new[] { "bellRing", "doorSlam", "powerWhisper", "relicDrop" })
            {
                string kind = type;
                room.OnMessage<Dictionary<string, object>>(kind, m => { if (SoundAt != null) SoundAt(kind, Num(m["x"]), Num(m["z"])); });
            }
            room.OnMessage<Dictionary<string, object>>("eyeGlow", m => { Debug.Log("Eyes glow: " + Str(m, "id")); if (EyesGlow != null) EyesGlow(Str(m, "id")); });
            room.OnMessage<Dictionary<string, object>>("photosDeveloped", m =>
            {
                NewPhotos = Photos(m);
                Developed.AddRange(NewPhotos);
                Debug.Log("Photos developed: " + NewPhotos.Count);
            });
            room.OnMessage<Dictionary<string, object>>("powers", m =>
            {
                var list = new List<Power>();
                foreach (var o in Items(m, "list"))
                {
                    var p = (IDictionary)o;
                    list.Add(new Power { Kind = (string)p["kind"], State = (string)p["state"], CooldownLeft = Num(p["cooldownLeft"]) });
                }
                Powers = list;
                CurseLeft = Num(m["curseLeft"]);
            });
            room.OnMessage<Dictionary<string, object>>("powerRefused", m =>
            {
                string name;
                ShowBanner((PowerNames.TryGetValue(Str(m, "kind"), out name) ? name : Str(m, "kind")) + ": " + Str(m, "reason"), 3);
            });
            room.OnMessage<Dictionary<string, object>>("ouijaMove", m =>
            {
                // The planchette slides onto the name (or "I don't know").
                string target = m.ContainsKey("target") ? m["target"] as string : null;
                OuijaTarget = target ?? "";
                OuijaLog = (OuijaLog != "" ? OuijaLog + "  " : "The planchette moves: ") + (target ?? "I don't know") + ".";
                Debug.Log("Ouija: " + OuijaLog);
            });
            room.OnMessage<Dictionary<string, object>>("meetingResult", m =>
            {
                var r = new VoteResult { Removed = m.ContainsKey("removed") ? m["removed"] as string : null, Role = m.ContainsKey("role") ? m["role"] as string : null, Skip = (int)Num(m["skip"]) };
                foreach (var o in Items(m, "tally")) { var t = (IDictionary)o; r.Tally.Add(new KeyValuePair<string, int>((string)t["name"], (int)Num(t["votes"]))); }
                if (m.ContainsKey("votes") && m["votes"] != null)
                    foreach (var o in Items(m, "votes")) { var v = (IDictionary)o; r.Votes.Add(v["voter"] + " voted " + v["target"]); }
                Result = r;
                Debug.Log("Meeting result: " + (r.Removed ?? "nobody") + " (" + (r.Role ?? "role hidden") + ")");
            });
            // Voice is not tested here (step B covers it); heard so the SDK does not warn.
            foreach (var type in new[] { "micLost" })
                room.OnMessage<object>(type, m => { });
        }

        public static readonly Dictionary<string, string> PowerNames = new Dictionary<string, string>
        {
            { "slamDoor", "Slam Door" }, { "summon", "Summon" }, { "blackout", "Blackout" }, { "taint", "Taint" }, { "alterClue", "Alter a clue" },
        };

        /// <summary>A new meeting: its Ouija board and result start empty.</summary>
        public void NewMeeting()
        {
            OuijaTarget = null;
            OuijaLog = "";
            Result = null;
        }

        static List<Photo> Photos(Dictionary<string, object> m)
        {
            var list = new List<Photo>();
            foreach (var o in Items(m, "photos"))
            {
                var p = (IDictionary)o;
                var photo = new Photo { By = (string)p["by"], NightTime = Num(p["nightTime"]) };
                foreach (var so in (IList)p["subjects"])
                {
                    var sd = (IDictionary)so;
                    photo.Subjects.Add(new Photo.Subject { Name = (string)sd["name"], FrameX = Num(sd["frameX"]), Dist = Num(sd["dist"]), Demon = (bool)sd["demon"] });
                }
                var g = p.Contains("ghost") ? p["ghost"] as IDictionary : null;
                if (g != null) { photo.Ghost = true; photo.GhostX = Num(g["frameX"]); photo.GhostDist = Num(g["dist"]); }
                list.Add(photo);
            }
            return list;
        }

        void Refuse(string reason)
        {
            Refusal = reason;
            RefusalUntil = Now + 4;
            Debug.Log("Refused: " + reason);
        }

        /// <summary>Banners that come from the state changing: the night's parts, the blackout, Taint.</summary>
        public void OnState()
        {
            var s = S;
            if (s == null) return;
            if (s.stage == "waiting" && End != null) { End = null; Role = null; Tasks.Clear(); partShown = ""; }
            string part = s.part ?? "";
            if (s.stage == "night" && part != partShown)
            {
                string text;
                if (partShown != "" && PartBanners.TryGetValue(part, out text)) ShowBanner(text, PartBannerSec);
                partShown = part;
            }
            if (s.blackout != blackoutShown)
            {
                blackoutShown = s.blackout;
                ShowBanner(s.blackout ? "The lights went out. The fuse box is in the Service Room." : "The lights are back.", 4);
            }
            if (s.taintLeft > 0 && taintShown == 0) ShowBanner("Black flames on the altar! Hold E in the circle to put them out with salt.", 4);
            taintShown = s.taintLeft;
        }

        /// <summary>The night clock's text: "Dawn in 12:34", as the browser.</summary>
        public string ClockText()
        {
            var s = S;
            int left = (int)Math.Max(0, Math.Ceiling(s.nightLength - s.nightTime));
            return s.part == "dawn" ? "Dawn" : s.part == "overtime" ? "Dawn is here" : "Dawn in " + (left / 60) + ":" + (left % 60).ToString("00");
        }

        /// <summary>Where the parts of the night begin, as fractions of the night (for marks on the bar).</summary>
        public List<double> PartMarks()
        {
            var marks = new List<double>();
            var s = S;
            if (s.nightLength <= 0) return marks;
            marks.Add(Cfg("match", "quietSec") / s.nightLength);
            foreach (var pct in Json.Arr(Json.Obj(config, "match"), "partSplitsPct")) marks.Add(Convert.ToDouble(pct, CultureInfo.InvariantCulture) / 100);
            return marks;
        }

        public static string RelicStatusText(Relic r)
        {
            switch (r.status)
            {
                case "carried": return "Carried by " + r.carrier;
                case "dropped": return "Dropped (last carried by " + r.carrier + ")";
                case "placed": return "Placed";
                case "crumbled": return "Crumbled to dust on the altar";
                default: return "Hidden";
            }
        }

        public bool BasementOpen()
        {
            var s = S;
            if (s.relics.Count == 0) return false;
            foreach (var kv in s.relics) if (kv.Value.status != "placed" && kv.Value.status != "crumbled") return false;
            return true;
        }

        /// <summary>The ritual panel's lines (label, count text, progress 0..100), or null when hidden.</summary>
        public string[] RitualText(out double progress)
        {
            var s = S;
            progress = s.ritualProgress;
            bool offering = map.Suspects.Count > 0 && BasementOpen() && string.IsNullOrEmpty(s.ghostNamed);
            if (!s.ritualReady && !s.ritualStarted && !offering) return null;
            if (offering && !s.ritualStarted) { progress = 0; return new[] { "Who was the ghost?", "Offer the ghost's own belonging on the altar" }; }
            bool shortOf = s.circleCount < s.circleNeeded;
            return new[]
            {
                s.ritualStarted ? "Ritual" : "Ritual ready",
                s.ritualStarted || !shortOf ? s.circleCount + " / " + s.circleNeeded + " in the circle" : "Gather " + s.circleNeeded + " at the altar (" + s.circleCount + " there)",
            };
        }

        // --- What E would do here (client/src/game.ts promptAt; the server decides for real) ---

        static double Dist(double ax, double az, double bx, double bz) { double dx = ax - bx, dz = az - bz; return Math.Sqrt(dx * dx + dz * dz); }

        public string PromptAt(double x, double z)
        {
            var s = S;
            var me = Me;
            if (s == null || me == null || s.stage != "night" || me.health == "downed" || !string.IsNullOrEmpty(me.action)) return null;
            if (me.health == "dead") return CfgBool("wisps", "canDoTasks") ? TaskPrompt(x, z) : null;
            if (!string.IsNullOrEmpty(me.hidingSpot)) return "Hold E  Step out";

            foreach (var kv in s.players)
            {
                if (kv.Key == room.SessionId) continue;
                var p = kv.Value;
                if (p.health == "downed" && Dist(p.x, p.z, x, z) <= Cfg("interact", "reviveRangeM")) return "Hold E  Revive " + p.name;
            }
            // Report a body or ring the bell (GDD 16.1).
            string body = null;
            double bodyD = double.MaxValue;
            foreach (var kv in s.players)
            {
                if (kv.Key == room.SessionId) continue;
                var p = kv.Value;
                double d = Dist(p.x, p.z, x, z);
                if (p.health == "dead" && !p.bodyGone && d <= Cfg("meetings", "reportRangeM") && d < bodyD) { body = p.name; bodyD = d; }
            }
            if (body != null) return "Hold E  Report " + body + "'s body";
            if (map.Bell.HasValue && Dist(map.Bell.Value.X, map.Bell.Value.Z, x, z) <= Cfg("interact", "rangeM"))
                return me.bellUses > 0 ? "Hold E  Ring the bell for a meeting (" + me.bellUses + " left)" : "You have used your bell. Each player has their own";
            if (s.taintLeft > 0 && map.Altar.HasValue && Dist(map.Altar.Value.X, map.Altar.Value.Z, x, z) <= Cfg("ritual", "circleRadiusM"))
            {
                int cost = (int)Cfg("taint", "cleanseSaltCost");
                return me.salt >= cost ? "Hold E  Put out the black flames (" + cost + " salt)" : "You need salt to put out the flames";
            }
            string offer = OfferPrompt(x, z);
            if (offer != null) return offer;
            if (s.blackout && map.FuseBox.HasValue && Dist(map.FuseBox.Value.X, map.FuseBox.Value.Z, x, z) <= Cfg("interact", "rangeM")) return "Hold E  Fix the fuse box";
            string near = NearestDoor(x, z);
            Door door;
            if (near != null && s.doors.TryGetValue(near, out door) && door.locked)
                return "Hold E  Push the door open (" + (int)Json.Num(Json.Obj(Json.Obj(config, "powers"), "slamDoor"), "breakPushers") + " people)";
            double useRange = Cfg("relics", "useRangeM");
            if (string.IsNullOrEmpty(me.relic))
            {
                foreach (var r in RelicsNear)
                {
                    if (r.Hidden || Dist(r.X, r.Z, x, z) > useRange) continue;
                    Relic relic;
                    return "E  Pick up " + (s.relics.TryGetValue(r.Id, out relic) ? relic.name : "the relic");
                }
            }
            var relicDoor = map.RelicDoor != null ? map.Doors.Find(d => d.Id == map.RelicDoor) : null;
            bool atRelicDoor = relicDoor != null && Dist(relicDoor.At.X, relicDoor.At.Z, x, z) <= Cfg("interact", "rangeM");
            if (atRelicDoor && !string.IsNullOrEmpty(me.relic))
            {
                Relic carried;
                return "Hold E  Place " + (s.relics.TryGetValue(me.relic, out carried) ? carried.name : "the relic");
            }
            if (me.salt < Cfg("salt", "carryMax"))
            {
                foreach (var jar in map.SaltJars)
                {
                    SaltJar state;
                    bool taken = s.saltJars.TryGetValue(jar.Key, out state) && state.taken;
                    if (!taken && Dist(jar.Value.X, jar.Value.Z, x, z) <= Cfg("salt", "jarRangeM")) return "E  Pick up salt";
                }
            }
            string task = TaskPrompt(x, z);
            if (task != null) return task;
            if (string.IsNullOrEmpty(me.relic))
            {
                // Every unsearched place in a group can be searched, so the prompt gives nothing away (GDD 26.5).
                foreach (var spot in map.RelicSpots)
                {
                    if (spot.Places == null) continue;
                    foreach (var place in spot.Places)
                    {
                        SearchPlace sp;
                        bool searched = s.searchPlaces.TryGetValue(place.Id, out sp) && sp.searched;
                        if (!searched && Dist(place.At.X, place.At.Z, x, z) <= useRange) return "E  " + spot.Label;
                    }
                }
                // A spot with one place: you only know it holds a relic once you can hear it whisper.
                foreach (var r in RelicsNear)
                {
                    if (!r.Hidden || Dist(r.X, r.Z, x, z) > useRange) continue;
                    var spot = map.RelicSpots.Find(sp => sp.Id == r.SpotId && sp.Places == null);
                    if (spot != null) return "E  " + spot.Label;
                }
            }
            var taken2 = new HashSet<string>();
            foreach (var kv in s.players) if (!string.IsNullOrEmpty(kv.Value.hidingSpot)) taken2.Add(kv.Value.hidingSpot);
            foreach (var spot in map.HidingSpots)
                if (!taken2.Contains(spot.Id) && Dist(spot.Exit.X, spot.Exit.Z, x, z) <= Cfg("interact", "hideRangeM")) return "Hold E  Hide";
            // A clue that is showing: what it says, for anyone who walks up (GDD 26.13).
            foreach (var kv in s.stations)
            {
                if (string.IsNullOrEmpty(kv.Value.clue)) continue;
                var def = map.TaskById(kv.Key);
                if (def != null && Dist(def.At.X, def.At.Z, x, z) <= Cfg("interact", "rangeM")) return "Clue: " + (map.ClueLabel(kv.Key, kv.Value.clue) ?? "");
            }
            if (atRelicDoor)
            {
                int placed = 0;
                foreach (var kv in s.relics) if (kv.Value.status == "placed" || kv.Value.status == "crumbled") placed++;
                // Once every slot is full the door stays open, and there is nothing to do here.
                if (placed < s.relics.Count) return "Locked: " + placed + " of " + s.relics.Count + " relics placed";
            }
            if (near != null) return "E  Open / close door";
            return null;
        }

        string TaskPrompt(double x, double z)
        {
            foreach (var task in Tasks)
            {
                if (task.Done) continue;
                var def = map.TaskById(task.StationId);
                if (def != null && Dist(def.At.X, def.At.Z, x, z) <= Cfg("tasks", "useRangeM")) return "E  " + def.Name;
            }
            return null;
        }

        /// <summary>The door within reach, nearest first, never the relic door. Mirrors HauntedRoom.nearestDoor.</summary>
        public string NearestDoor(double x, double z)
        {
            string best = null;
            double bestD = double.MaxValue;
            foreach (var door in map.Doors)
            {
                if (door.Id == map.RelicDoor) continue;
                double d = Dist(door.At.X, door.At.Z, x, z);
                if (d <= Cfg("interact", "rangeM") && d < bestD) { best = door.Id; bestD = d; }
            }
            return best;
        }

        /// <summary>The offering at the altar (GDD 26.13). Mirrors HauntedRoom.relicToOffer.</summary>
        string OfferPrompt(double x, double z)
        {
            var s = S;
            if (map.Suspects.Count == 0 || !map.Altar.HasValue || !string.IsNullOrEmpty(s.ghostNamed) || s.ritualStarted || !BasementOpen()) return null;
            var altar = map.Altar.Value;
            if (Dist(altar.X, altar.Z, x, z) > Cfg("ritual", "circleRadiusM")) return null;
            if (s.altarWait > 0) return "The altar takes no offering for " + Math.Ceiling(s.altarWait) + " s";
            var ids = new List<string>(s.relics.Keys);
            ids.Sort(string.CompareOrdinal);
            double gap = Cfg("mystery", "standSpacingM");
            string found = null;
            double best = Cfg("interact", "rangeM");
            for (int i = 0; i < ids.Count; i++)
            {
                // shared/src/mystery.ts altarStands: in a row across the altar.
                double sx = altar.X + (i - (ids.Count - 1) / 2.0) * gap, sz = altar.Z;
                double d = Dist(sx, sz, x, z);
                if (s.relics[ids[i]].status == "placed" && d <= best) { best = d; found = ids[i]; }
            }
            return found == null ? null : "Hold E  Offer " + s.relics[found].name + ": was it the ghost's?";
        }

        static string Str(Dictionary<string, object> m, string key) { object v; return m.TryGetValue(key, out v) ? v as string : null; }
        static IList Items(Dictionary<string, object> m, string key) { object v; return m.TryGetValue(key, out v) && v is IList ? (IList)v : new List<object>(); }
        static double Num(object v) { return Convert.ToDouble(v, CultureInfo.InvariantCulture); }
    }
}
