using System;
using System.Globalization;
using System.Collections.Generic;
using Haunted.Sim;

namespace Haunted.Game
{
    /// <summary>
    /// The map's interactive places (GDD 10), read from the same map data the server uses
    /// (Resources/Data/map.json, written by tools/engine-export.ts): where the tasks, relic spots,
    /// hiding spots, salt jars, bell, altar and fuse box are. Rules never live here.
    /// </summary>
    public class MapInfo
    {
        public struct Point { public double X, Z; public Point(double x, double z) { X = x; Z = z; } }

        public class Task { public string Id, Name, Room, Minigame; public Point At; public bool Visible; public Clue Clue; }
        /// <summary>Where a task's clue lies (the clock's guest book): on a stand, or on furniture heightM up.</summary>
        public class Clue { public Point At; public double HeightM; public bool Stand; }
        public class RelicSpot { public string Id, Label, Room, Minigame; public Point At; public List<Place> Places; }
        public class Place { public string Id; public Point At; }
        public class HidingSpot { public string Id, Kind; public Point At, Exit; }
        public class Door { public string Id; public Point At; }
        public class Suspect { public string Id, Name, Belonging, Icon; public Dictionary<string, string> Clues = new Dictionary<string, string>(); }
        public class Room { public string Name; public double MinX, MaxX, MinZ, MaxZ; }

        public readonly List<Task> Tasks = new List<Task>();
        public readonly List<RelicSpot> RelicSpots = new List<RelicSpot>();
        public readonly List<HidingSpot> HidingSpots = new List<HidingSpot>();
        public readonly List<Door> Doors = new List<Door>();
        public readonly Dictionary<string, Point> SaltJars = new Dictionary<string, Point>();
        public readonly List<Suspect> Suspects = new List<Suspect>();
        public readonly List<Room> Rooms = new List<Room>();
        /// <summary>Every wall as x1, z1, x2, z2 (axis-aligned).</summary>
        public readonly List<double[]> Walls = new List<double[]>();
        public readonly string RelicDoor;
        public readonly Point? Bell, Altar, FuseBox;

        public MapInfo(string mapJson)
        {
            var map = Json.Parse(mapJson);
            foreach (var t in List(map, "tasks"))
                {
                var task = new Task { Id = Str(t, "id"), Name = Str(t, "name"), Room = Str(t, "room"), Minigame = Str(t, "minigame"), At = Pt(t) };
                task.Visible = Has(t, "visible") && (bool)((Dictionary<string, object>)t)["visible"];
                if (Has(t, "clue"))
                {
                    var c = Json.Obj(t, "clue");
                    task.Clue = new Clue { At = Pt(c), HeightM = Json.Num(c, "heightM"), Stand = Has(c, "stand") && (bool)c["stand"] };
                }
                Tasks.Add(task);
            }
            foreach (var s in List(map, "relicSpots"))
            {
                var spot = new RelicSpot { Id = Str(s, "id"), Label = Str(s, "label"), Room = Str(s, "room"), Minigame = Str(s, "minigame"), At = Pt(s) };
                if (Has(s, "places"))
                {
                    spot.Places = new List<Place>();
                    foreach (var p in List(s, "places")) spot.Places.Add(new Place { Id = Str(p, "id"), At = Pt(p) });
                }
                RelicSpots.Add(spot);
            }
            foreach (var h in List(map, "hidingSpots"))
                HidingSpots.Add(new HidingSpot { Id = Str(h, "id"), Kind = Str(h, "kind"), At = Pt(h), Exit = Pt(Json.Obj(h, "exit")) });
            foreach (var d in List(map, "doors")) Doors.Add(new Door { Id = Str(d, "id"), At = Pt(d) });
            foreach (var j in List(map, "saltJars")) SaltJars[Str(j, "id")] = Pt(j);
            if (Has(map, "suspects"))
            {
                foreach (var s in List(map, "suspects"))
                {
                    var suspect = new Suspect { Id = Str(s, "id"), Name = Str(s, "name"), Belonging = Str(s, "belonging"), Icon = Str(s, "icon") };
                    foreach (var kv in Json.Obj(s, "clues")) suspect.Clues[kv.Key] = (string)kv.Value;
                    Suspects.Add(suspect);
                }
            }
            foreach (var r in List(map, "rooms"))
                Rooms.Add(new Room { Name = Str(r, "name"), MinX = Json.Num(r, "minX"), MaxX = Json.Num(r, "maxX"), MinZ = Json.Num(r, "minZ"), MaxZ = Json.Num(r, "maxZ") });
            foreach (var w in List(map, "walls"))
            {
                var a = (List<object>)w;
                Walls.Add(new[] { Convert.ToDouble(a[0], CultureInfo.InvariantCulture), Convert.ToDouble(a[1], CultureInfo.InvariantCulture), Convert.ToDouble(a[2], CultureInfo.InvariantCulture), Convert.ToDouble(a[3], CultureInfo.InvariantCulture) });
            }
            RelicDoor = Has(map, "relicDoor") ? Str(map, "relicDoor") : null;
            if (Has(map, "bell")) Bell = Pt(Json.Obj(map, "bell"));
            if (Has(map, "altar")) Altar = Pt(Json.Obj(map, "altar"));
            if (Has(map, "fuseBox")) FuseBox = Pt(Json.Obj(map, "fuseBox"));
        }

        /// <summary>The room a point is in, as the shared roomAt does: the first room whose box holds it.</summary>
        public string RoomAt(double x, double z)
        {
            foreach (var r in Rooms) if (x >= r.MinX && x <= r.MaxX && z >= r.MinZ && z <= r.MaxZ) return r.Name;
            return null;
        }

        public Task TaskById(string id) { return Tasks.Find(t => t.Id == id); }

        /// <summary>A clue's words for a suspect at a station (shared/src/mystery.ts clueLabel).</summary>
        public string ClueLabel(string stationId, string suspectId)
        {
            var station = TaskById(stationId);
            var suspect = Suspects.Find(s => s.Id == suspectId);
            string label;
            return station != null && suspect != null && suspect.Clues.TryGetValue(station.Minigame, out label) ? label : null;
        }

        static IEnumerable<object> List(object o, string key) { return Json.Arr(o, key); }
        static string Str(object o, string key) { return (string)((Dictionary<string, object>)o)[key]; }
        static bool Has(object o, string key) { return ((Dictionary<string, object>)o).ContainsKey(key); }
        static Point Pt(object o) { return new Point(Json.Num(o, "x"), Json.Num(o, "z")); }
    }
}
