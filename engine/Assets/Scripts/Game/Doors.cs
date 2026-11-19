using System;
using System.Collections.Generic;
using System.Text.RegularExpressions;
using Haunted.Sim;
using UnityEngine;
using static Haunted.Game.Shapes;

namespace Haunted.Game
{
    /// <summary>
    /// The doors as the browser draws them (client/src/world.ts DoorView and buildDoorSigns; step D2
    /// of docs/plans/engine-port.md): each doorway's leaves swinging on their hinges into the room,
    /// the fixed panel above them, the wall over the doorway, and a brass plaque on each side naming
    /// the room beyond. A door with a style in the map dressing is the built model
    /// (client/src/doorModels.ts, imported into HotelArt.doors), lit by its room's reflection as
    /// dressedRooms.ts lightMovable does; any other is a plain box. The relic door carries a slot per
    /// relic, lit gold once filled. Positions and turns are in three.js's axes (Shapes.P, Shapes.R).
    /// </summary>
    public class Doors
    {
        // world.ts and shared/src/dressing.ts.
        const int DOOR = 0x6b5a45, RELIC_DOOR = 0x5a1f1f, TRANSOM = 0x4a3c2e, WALL = 0x8a8a8a;
        const int SLOT_EMPTY = 0x140c0c, SLOT_FULL = 0xc9a640;
        const double DOOR_THICKNESS = 0.08, SWING_RAD_PER_SEC = 4, SLOT_SIZE_M = 0.2, SLOT_HEIGHT_M = 1.3, SLOT_GLOW = 0.4;
        const double DOOR_LEAF_HEIGHT_M = 2.2, DOOR_HEIGHT_FRACTION = 0.9, DOUBLE_DOOR_MIN_WIDTH_M = 1.4, LEAF_GAP_M = 0.01;
        const double SLAB_M = 0.05, FACE_GAP_M = 0.005;
        const double SIGN_WIDTH_M = 1.3, SIGN_HEIGHT_M = 0.2, SIGN_Y_FRACTION = 0.948, DRESSED_SIGN_OUT_M = 0.04;
        static readonly Regex Corridor = new Regex("Corridor|Passage");

        class Leaf
        {
            public Transform Pivot;
            public double Hinge, Angle, OpenAngle;
            public int Reach;
        }

        class Door
        {
            public MapInfo.Door Def;
            public readonly List<Leaf> Leaves = new List<Leaf>();
            public bool Open;
            public readonly List<GameObject> Slots = new List<GameObject>();
        }

        readonly Dictionary<string, Door> doors = new Dictionary<string, Door>();
        readonly Transform root;
        readonly WorldData world;
        readonly MapInfo map;
        readonly Dictionary<string, Transform> pieces = new Dictionary<string, Transform>();

        /// <summary>art: the imported door models and styles, or null for plain boxes; dressed: the dressed rooms (their reflections light the models).</summary>
        public Doors(WorldData world, MapInfo map, HotelArt art, DressedRooms dressed)
        {
            this.world = world;
            this.map = map;
            root = new GameObject("Doors").transform;
            Dictionary<string, object> styles = null;
            if (art != null && art.doors != null && !string.IsNullOrEmpty(art.doorStyles) && map.Id != null)
            {
                var byMap = (Dictionary<string, object>)Json.Parse(art.doorStyles);
                object mine;
                if (byMap.TryGetValue(map.Id, out mine)) styles = (Dictionary<string, object>)mine;
                foreach (var t in art.doors.GetComponentsInChildren<Transform>(true))
                    if (!pieces.ContainsKey(t.name)) pieces[t.name] = t;
            }
            double height = world.WallHeightM;
            foreach (var def in map.Doors)
            {
                object style = null;
                if (styles != null) styles.TryGetValue(def.Id, out style);
                doors[def.Id] = Build(def, height, (Dictionary<string, object>)style, dressed);
            }
            Signs(height, dressed);
        }

        Door Build(MapInfo.Door def, double wallHeight, Dictionary<string, object> style, DressedRooms dressed)
        {
            var door = new Door { Def = def };
            bool along = def.Axis == "x";
            int count = def.Width >= DOUBLE_DOOR_MIN_WIDTH_M ? 2 : 1;
            double slot = def.Width / count, leafWidth = slot - LEAF_GAP_M;
            double top = wallHeight * DOOR_HEIGHT_FRACTION;
            double leafH = Math.Min(DOOR_LEAF_HEIGHT_M, top), transomHeight = top - leafH;
            var plain = Mat(Hex(def.Id == map.RelicDoor ? RELIC_DOOR : DOOR));
            int swing = SwingSide(def);
            double half = def.Width / 2;
            var floor = Coords.Place(world, def.At.X, def.At.Z);
            string styleName = style != null ? (string)style["style"] : null;
            int? number = style != null && style.ContainsKey("number") ? (int?)Convert.ToInt32(style["number"]) : null;
            for (int i = 0; i < count; i++)
            {
                int reach = i == 0 ? 1 : -1;
                double hinge = reach == 1 ? -half : half;
                var pivot = new GameObject("Door " + def.Id + " " + i).transform;
                pivot.SetParent(root, false);
                pivot.position = floor + P(along ? hinge : 0, 0, along ? 0 : hinge);
                Transform model = null;
                if (styleName != null)
                {
                    if (i == 0 && number != null) model = Piece(ModelName(styleName, "leaf", leafWidth, number));
                    if (model == null) model = Piece(ModelName(styleName, "leaf", leafWidth, null));
                }
                if (model != null)
                {
                    // Built reaching along +x from its hinge; turned to reach this leaf's way, half the gap in.
                    double turn = along ? (reach == 1 ? 0 : Math.PI) : reach == 1 ? -Math.PI / 2 : Math.PI / 2;
                    Put(model, pivot, P(along ? reach * LEAF_GAP_M / 2 : 0, 0, along ? 0 : reach * LEAF_GAP_M / 2), turn);
                    if (dressed != null) dressed.LightMovable(model.gameObject, floor.y);
                }
                else
                {
                    double mid = reach * slot / 2;
                    Box(pivot, along ? leafWidth : DOOR_THICKNESS, leafH, along ? DOOR_THICKNESS : leafWidth, plain, along ? mid : 0, leafH / 2, along ? 0 : mid);
                }
                // Turning by +90 degrees takes +x to -z and +z to +x; pick the turn that sends this leaf to `swing`.
                double openAngle = (along ? -swing * reach : swing * reach) * (Math.PI / 2);
                door.Leaves.Add(new Leaf { Pivot = pivot, Hinge = hinge, Reach = reach, OpenAngle = openAngle });
            }
            if (transomHeight > 0.01)
            {
                var model = styleName != null ? Piece(ModelName(styleName, "transom", def.Width, null)) : null;
                if (model != null)
                {
                    var at = new GameObject("Transom " + def.Id).transform;
                    at.SetParent(root, false);
                    at.position = floor + Vector3.up * (float)leafH;
                    Put(model, at, Vector3.zero, along ? 0 : Math.PI / 2);
                    if (dressed != null) dressed.LightMovable(model.gameObject, floor.y);
                }
                else
                {
                    var at = Group(root, "Transom " + def.Id);
                    at.position = floor;
                    Box(at, along ? def.Width : DOOR_THICKNESS, transomHeight, along ? DOOR_THICKNESS : def.Width, TRANSOM, 0, (top + leafH) / 2, 0);
                }
            }
            return door;
        }

        /// <summary>shared/src/dressing.ts doorModelName.</summary>
        static string ModelName(string style, string part, double widthM, int? number)
        {
            return style + "_" + part + "_" + (int)Math.Round(widthM * 100, MidpointRounding.AwayFromZero) + (number == null ? "" : "_n" + number);
        }

        /// <summary>A copy of a built door piece, or null if it was not built.</summary>
        Transform Piece(string name)
        {
            Transform t;
            return pieces.TryGetValue(name, out t) ? UnityEngine.Object.Instantiate(t.gameObject).transform : null;
        }

        /// <summary>
        /// Sets a piece under parent at a three.js position and turn about y, in place of its own (as
        /// the browser sets a clone's). glTFast's axes are three's turned half a circle (DressedRooms).
        /// </summary>
        static void Put(Transform piece, Transform parent, Vector3 at, double turnY)
        {
            var frame = new GameObject(piece.name).transform;
            frame.SetParent(parent, false);
            frame.localPosition = at;
            frame.localRotation = R(0, turnY, 0);
            piece.SetParent(frame, false);
            piece.localPosition = Vector3.zero;
            piece.localRotation = Quaternion.Euler(0, 180, 0);
        }

        /// <summary>world.ts swingSide: +1 south (or east), -1 north (or west). Into a room, not a corridor; between two of a kind, into the bigger.</summary>
        int SwingSide(MapInfo.Door def)
        {
            const double probe = 0.3;
            double nx = def.Axis == "x" ? 0 : 1, nz = def.Axis == "x" ? 1 : 0;
            var south = RoomAt(def.At.X + nx * probe, def.At.Z + nz * probe);
            var north = RoomAt(def.At.X - nx * probe, def.At.Z - nz * probe);
            if (south == null) return -1;
            if (north == null) return 1;
            bool sc = Corridor.IsMatch(south.Name), nc = Corridor.IsMatch(north.Name);
            if (sc != nc) return sc ? -1 : 1;
            return Area(south) >= Area(north) ? 1 : -1;
        }

        MapInfo.Room RoomAt(double x, double z)
        {
            return map.Rooms.Find(r => x >= r.MinX && x <= r.MaxX && z >= r.MinZ && z <= r.MaxZ);
        }

        static double Area(MapInfo.Room r) { return (r.MaxX - r.MinX) * (r.MaxZ - r.MinZ); }

        /// <summary>Over every doorway: the wall above the door, and on each side a plaque naming the room you walk into.</summary>
        void Signs(double wallHeight, DressedRooms dressed)
        {
            double doorTop = wallHeight * DOOR_HEIGHT_FRACTION, lintelTop = wallHeight - SLAB_M;
            double off = world.WallThicknessM / 2 + FACE_GAP_M * 2;
            var lintel = Mat(Hex(WALL));
            var quad = Quad();
            var plates = new Dictionary<string, Material>();
            var names = new List<string>();
            var sides = new List<KeyValuePair<MapInfo.Door, int>>();
            foreach (var def in map.Doors)
            {
                var at = Group(root, "Over " + def.Id);
                at.position = Coords.Place(world, def.At.X, def.At.Z);
                bool along = def.Axis == "x";
                Box(at, along ? def.Width : world.WallThicknessM, lintelTop - doorTop, along ? world.WallThicknessM : def.Width, lintel, 0, (lintelTop + doorTop) / 2, 0);
                foreach (int side in new[] { -1, 1 })
                {
                    double nx = along ? 0 : side, nz = along ? side : 0;
                    var here = RoomAt(def.At.X + nx * 0.3, def.At.Z + nz * 0.3);
                    var beyond = RoomAt(def.At.X - nx * 0.3, def.At.Z - nz * 0.3);
                    if (here == null || beyond == null || here.Name == beyond.Name) continue;
                    if (!names.Contains(beyond.Name)) names.Add(beyond.Name);
                    sides.Add(new KeyValuePair<MapInfo.Door, int>(def, side));
                }
            }
            // 600 weight Georgia at half the plate's height (world.ts signTexture).
            var painter = new TextPainter(40, string.Join("", names).ToUpperInvariant());
            foreach (var kv in sides)
            {
                var def = kv.Key;
                int side = kv.Value;
                bool along = def.Axis == "x";
                double nx = along ? 0 : side, nz = along ? side : 0;
                string here = RoomAt(def.At.X + nx * 0.3, def.At.Z + nz * 0.3).Name;
                string beyond = RoomAt(def.At.X - nx * 0.3, def.At.Z - nz * 0.3).Name;
                Material plate;
                if (!plates.TryGetValue(beyond, out plate))
                {
                    plate = Mat(Color.white);
                    var texture = SignTexture(painter, beyond);
                    plate.mainTexture = texture;
                    if (plate.HasProperty("_BaseMap")) plate.SetTexture("_BaseMap", texture);
                    plates[beyond] = plate;
                }
                double signOff = dressed != null && dressed.Rooms.Contains(here) ? off + DRESSED_SIGN_OUT_M : off;
                var holder = Group(root, "Sign " + def.Id + " " + side);
                holder.position = Coords.Place(world, def.At.X, def.At.Z) + P(nx * signOff, wallHeight * SIGN_Y_FRACTION, nz * signOff);
                // A plane faces +z; turn it to face into the room it hangs in.
                holder.rotation = R(0, Math.Atan2(nx, nz), 0);
                Shape(holder, quad, new Vector3((float)SIGN_WIDTH_M, (float)SIGN_HEIGHT_M, 1), plate, 0, 0, 0);
            }
        }

        /// <summary>The server's door states.</summary>
        public void SetOpen(string id, bool open)
        {
            Door d;
            if (doors.TryGetValue(id, out d)) d.Open = open;
        }

        /// <summary>The relic door's slots, one per relic, lit gold once filled (GDD 10). They show on both faces.</summary>
        public void SetSlots(int placed, int total)
        {
            Door door;
            if (map.RelicDoor == null || !doors.TryGetValue(map.RelicDoor, out door)) return;
            var def = door.Def;
            bool along = def.Axis == "x";
            if (door.Slots.Count != total)
            {
                foreach (var s in door.Slots) UnityEngine.Object.Destroy(s);
                door.Slots.Clear();
                double spacing = def.Width / (total + 1);
                for (int i = 0; i < total; i++)
                {
                    double depth = DOOR_THICKNESS + 0.04;
                    // On whichever leaf covers that spot, so it swings with it.
                    double offset = -def.Width / 2 + spacing * (i + 1);
                    var leaf = door.Leaves.Find(l => (offset - l.Hinge) * l.Reach >= 0 && Math.Abs(offset - l.Hinge) <= def.Width / door.Leaves.Count) ?? door.Leaves[0];
                    double local = offset - leaf.Hinge;
                    door.Slots.Add(Box(leaf.Pivot, along ? SLOT_SIZE_M : depth, SLOT_SIZE_M, along ? depth : SLOT_SIZE_M, Mat(Hex(SLOT_EMPTY), Look.Glow), along ? local : 0, SLOT_HEIGHT_M, along ? 0 : local));
                }
            }
            for (int i = 0; i < door.Slots.Count; i++)
            {
                bool full = i < placed;
                SetColor(door.Slots[i], Hex(full ? SLOT_FULL : SLOT_EMPTY));
                SetGlow(door.Slots[i], full ? Hex(SLOT_FULL) * (float)SLOT_GLOW : Color.black);
            }
        }

        /// <summary>Swings each door toward its state.</summary>
        public void Update(float dt)
        {
            double step = SWING_RAD_PER_SEC * dt;
            foreach (var door in doors.Values)
            {
                foreach (var leaf in door.Leaves)
                {
                    double diff = (door.Open ? leaf.OpenAngle : 0) - leaf.Angle;
                    if (diff == 0) continue;
                    leaf.Angle += Math.Abs(diff) <= step ? diff : Math.Sign(diff) * step;
                    leaf.Pivot.localRotation = R(0, leaf.Angle, 0);
                }
            }
        }

        /// <summary>world.ts signTexture: a dark plate with a gold border and the room's name in capitals, 512 x 80 px.</summary>
        static Texture2D SignTexture(TextPainter painter, string name)
        {
            const int w = 512, h = 80;
            Color32 plate = new Color32(0x2a, 0x21, 0x18, 0xff), ink = new Color32(0xd8, 0xb7, 0x66, 0xff);
            var px = new Color32[w * h];
            for (int i = 0; i < px.Length; i++) px[i] = plate;
            // strokeRect(6, 6, w - 12, h - 12) with a 4 px line: 4 to 8 px in from each edge.
            for (int y = 4; y < h - 4; y++)
                for (int x = 4; x < w - 4; x++)
                    if (x < 8 || x >= w - 8 || y < 8 || y >= h - 8) px[(h - 1 - y) * w + x] = ink;
            painter.Write(px, w, h, name.ToUpperInvariant(), w / 2f, h / 2f + 2, ink, w - 40);
            return TextPainter.Picture(px, w, h);
        }
    }
}
