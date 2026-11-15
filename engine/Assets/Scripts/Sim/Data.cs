using System;
using System.Collections.Generic;
using System.Globalization;
using System.Text;

// Reads engine-data/*.json (tools/engine-export.ts) into the simulation's own types. One loader
// for both Unity and the checks in engine/Tools, so both read the data the same way.
// Plain C# 5 with no libraries.
namespace Haunted.Sim
{
    /// <summary>A small JSON reader: objects become Dictionary&lt;string, object&gt;, arrays List&lt;object&gt;, numbers double.</summary>
    public static class Json
    {
        public static object Parse(string text)
        {
            int i = 0;
            object v = Value(text, ref i);
            Skip(text, ref i);
            if (i != text.Length) throw new FormatException("Extra text after JSON at " + i);
            return v;
        }

        static void Skip(string s, ref int i)
        {
            while (i < s.Length && char.IsWhiteSpace(s[i])) i++;
        }

        static object Value(string s, ref int i)
        {
            Skip(s, ref i);
            if (i >= s.Length) throw new FormatException("JSON ended early");
            char c = s[i];
            if (c == '{')
            {
                var obj = new Dictionary<string, object>();
                i++;
                Skip(s, ref i);
                if (s[i] == '}') { i++; return obj; }
                while (true)
                {
                    Skip(s, ref i);
                    string key = Str(s, ref i);
                    Skip(s, ref i);
                    if (s[i] != ':') throw new FormatException("Expected : at " + i);
                    i++;
                    obj[key] = Value(s, ref i);
                    Skip(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == '}') { i++; return obj; }
                    throw new FormatException("Expected , or } at " + i);
                }
            }
            if (c == '[')
            {
                var list = new List<object>();
                i++;
                Skip(s, ref i);
                if (s[i] == ']') { i++; return list; }
                while (true)
                {
                    list.Add(Value(s, ref i));
                    Skip(s, ref i);
                    if (s[i] == ',') { i++; continue; }
                    if (s[i] == ']') { i++; return list; }
                    throw new FormatException("Expected , or ] at " + i);
                }
            }
            if (c == '"') return Str(s, ref i);
            if (s.Substring(i, Math.Min(4, s.Length - i)) == "true") { i += 4; return true; }
            if (s.Substring(i, Math.Min(5, s.Length - i)) == "false") { i += 5; return false; }
            if (s.Substring(i, Math.Min(4, s.Length - i)) == "null") { i += 4; return null; }
            int start = i;
            while (i < s.Length && "+-0123456789.eE".IndexOf(s[i]) >= 0) i++;
            if (start == i) throw new FormatException("Unexpected character at " + i);
            return double.Parse(s.Substring(start, i - start), NumberStyles.Float, CultureInfo.InvariantCulture);
        }

        static string Str(string s, ref int i)
        {
            if (s[i] != '"') throw new FormatException("Expected a string at " + i);
            i++;
            var sb = new StringBuilder();
            while (s[i] != '"')
            {
                char c = s[i++];
                if (c != '\\') { sb.Append(c); continue; }
                char e = s[i++];
                switch (e)
                {
                    case 'n': sb.Append('\n'); break;
                    case 't': sb.Append('\t'); break;
                    case 'r': sb.Append('\r'); break;
                    case 'b': sb.Append('\b'); break;
                    case 'f': sb.Append('\f'); break;
                    case 'u':
                        sb.Append((char)int.Parse(s.Substring(i, 4), NumberStyles.HexNumber, CultureInfo.InvariantCulture));
                        i += 4;
                        break;
                    default: sb.Append(e); break;
                }
            }
            i++;
            return sb.ToString();
        }

        // Small helpers for reading parsed objects.
        public static Dictionary<string, object> Obj(object o, string key) { return (Dictionary<string, object>)((Dictionary<string, object>)o)[key]; }
        public static List<object> Arr(object o, string key) { return (List<object>)((Dictionary<string, object>)o)[key]; }
        public static double Num(object o, string key) { return Convert.ToDouble(((Dictionary<string, object>)o)[key], CultureInfo.InvariantCulture); }
        public static string Text(object o, string key)
        {
            object v;
            return ((Dictionary<string, object>)o).TryGetValue(key, out v) ? v as string : null;
        }
    }

    public static class GameData
    {
        /// <summary>The hotel from map.json (floors, stairs, rooms, spawns) and world.json (solid boxes).</summary>
        public static WorldData LoadWorld(string mapJson, string worldJson)
        {
            object map = Json.Parse(mapJson);
            object world = Json.Parse(worldJson);
            var w = new WorldData { WallHeightM = Json.Num(map, "wallHeightM"), WallThicknessM = Json.Num(map, "wallThicknessM") };
            foreach (var l in Json.Arr(map, "levels"))
                w.Levels.Add(new LevelDef
                {
                    Id = Json.Text(l, "id"), Name = Json.Text(l, "name"),
                    MinX = Json.Num(l, "minX"), MaxX = Json.Num(l, "maxX"), MinZ = Json.Num(l, "minZ"), MaxZ = Json.Num(l, "maxZ"),
                    Y = Json.Num(l, "y"), ShiftX = Json.Num(l, "shiftX"), ShiftZ = Json.Num(l, "shiftZ"),
                });
            foreach (var s in Json.Arr(map, "stairs"))
                w.Stairs.Add(new StairDef
                {
                    Id = Json.Text(s, "id"), Lower = Json.Text(s, "lower"), Upper = Json.Text(s, "upper"), Dir = Json.Text(s, "dir"),
                    X = Json.Num(s, "x"), Z = Json.Num(s, "z"), LengthM = Json.Num(s, "lengthM"), WidthM = Json.Num(s, "widthM"),
                });
            foreach (var r in Json.Arr(map, "rooms"))
                w.Rooms.Add(new RoomDef { Name = Json.Text(r, "name"), MinX = Json.Num(r, "minX"), MaxX = Json.Num(r, "maxX"), MinZ = Json.Num(r, "minZ"), MaxZ = Json.Num(r, "maxZ") });
            foreach (var kv in Json.Obj(map, "roomColors")) w.RoomColors[kv.Key] = (string)kv.Value;
            foreach (var p in Json.Arr(map, "spawns")) w.Spawns.Add(new Point(Json.Num(p, "x"), Json.Num(p, "z")));
            foreach (var b in Json.Arr(world, "solids"))
                w.Solids.Add(new SolidBox
                {
                    Kind = Json.Text(b, "kind"), Id = Json.Text(b, "id"),
                    X = Json.Num(b, "x"), Z = Json.Num(b, "z"), SizeX = Json.Num(b, "sizeX"), SizeZ = Json.Num(b, "sizeZ"), HeightM = Json.Num(b, "heightM"),
                });
            return w;
        }

        /// <summary>The numbers movement needs, from config.json.</summary>
        public static MovementConfig LoadMovement(object config)
        {
            var move = Json.Obj(config, "movement");
            var wisps = Json.Obj(config, "wisps");
            return new MovementConfig
            {
                Walk = Json.Num(move, "walk"), Run = Json.Num(move, "run"), Crouch = Json.Num(move, "crouch"), Crawl = Json.Num(move, "crawl"),
                StaminaSec = Json.Num(move, "staminaSec"), StaminaRegenDelaySec = Json.Num(move, "staminaRegenDelaySec"),
                StaminaRefillSec = Json.Num(move, "staminaRefillSec"), RelicSlowPct = Json.Num(move, "relicSlowPct"), WispSpeed = Json.Num(wisps, "speed"),
            };
        }
    }
}
