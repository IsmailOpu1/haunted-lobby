using System;
using System.Collections.Generic;

// The hotel as the simulation sees it: floors, stairs and solid boxes. Data comes from
// engine-data/map.json and world.json (tools/engine-export.ts). Levels is shared/src/levels.ts
// line for line (checked by engine/Tools/WorldCheck.cs); Collision is the client's own wall
// stop, measured against the server's Rapier collision by the same check.
// Plain C# 5, so Windows' built-in compiler can check it without Unity.
namespace Haunted.Sim
{
    public struct Point
    {
        public double X, Z;
        public Point(double x, double z) { X = x; Z = z; }
    }

    public struct WorldPoint
    {
        public double X, Y, Z;
        public WorldPoint(double x, double y, double z) { X = x; Y = y; Z = z; }
    }

    /// <summary>One floor: its area of the simulation plane, its height, and how far its area is moved from where it really is.</summary>
    public class LevelDef
    {
        public string Id, Name;
        public double MinX, MaxX, MinZ, MaxZ, Y, ShiftX, ShiftZ;
    }

    /// <summary>A flight of stairs, given in the lower floor's area. Dir is "+x", "-x", "+z" or "-z" (the way up).</summary>
    public class StairDef
    {
        public string Id, Lower, Upper, Dir;
        public double X, Z, LengthM, WidthM;
    }

    /// <summary>An axis-aligned solid box on the floor: center, full size and height. Kind is wall, stairWall, door, hide or furniture.</summary>
    public class SolidBox
    {
        public string Kind, Id;
        public double X, Z, SizeX, SizeZ, HeightM;
    }

    public class RoomDef
    {
        public string Name;
        public double MinX, MaxX, MinZ, MaxZ;
    }

    public class WorldData
    {
        public double WallHeightM, WallThicknessM;
        public List<LevelDef> Levels = new List<LevelDef>();
        public List<StairDef> Stairs = new List<StairDef>();
        public List<RoomDef> Rooms = new List<RoomDef>();
        public List<SolidBox> Solids = new List<SolidBox>();
        public Dictionary<string, string> RoomColors = new Dictionary<string, string>();
        public List<Point> Spawns = new List<Point>();
    }

    /// <summary>Floors and stairs (GDD 21.1): shared/src/levels.ts.</summary>
    public static class Levels
    {
        static readonly LevelDef Ground = new LevelDef { Id = "ground", Name = "Ground", MinX = double.NegativeInfinity, MaxX = double.PositiveInfinity, MinZ = double.NegativeInfinity, MaxZ = double.PositiveInfinity };

        static Point Dir(string dir)
        {
            switch (dir)
            {
                case "+x": return new Point(1, 0);
                case "-x": return new Point(-1, 0);
                case "+z": return new Point(0, 1);
                case "-z": return new Point(0, -1);
            }
            throw new ArgumentException("Unknown stair direction " + dir);
        }

        /// <summary>The floor whose area holds this point. Points outside every area count as the first floor.</summary>
        public static LevelDef LevelOf(WorldData map, double x, double z)
        {
            foreach (var l in map.Levels)
                if (x >= l.MinX && x <= l.MaxX && z >= l.MinZ && z <= l.MaxZ) return l;
            return map.Levels.Count > 0 ? map.Levels[0] : Ground;
        }

        static LevelDef LevelById(WorldData map, string id)
        {
            foreach (var l in map.Levels) if (l.Id == id) return l;
            throw new ArgumentException("Unknown level " + id);
        }

        struct Geometry
        {
            public LevelDef Lower, Upper;
            public Point U, Shift;
        }

        static Geometry Geo(WorldData map, StairDef stair)
        {
            var lower = LevelById(map, stair.Lower);
            var upper = LevelById(map, stair.Upper);
            return new Geometry { Lower = lower, Upper = upper, U = Dir(stair.Dir), Shift = new Point(lower.ShiftX - upper.ShiftX, lower.ShiftZ - upper.ShiftZ) };
        }

        static void OnStair(StairDef stair, Point u, Point p, out double along, out double side)
        {
            double dx = p.X - stair.X;
            double dz = p.Z - stair.Z;
            along = dx * u.X + dz * u.Z;
            side = dx * -u.Z + dz * u.X;
        }

        static bool Inside(StairDef stair, double along, double side)
        {
            return along >= 0 && along <= stair.LengthM && Math.Abs(side) <= stair.WidthM / 2;
        }

        /// <summary>The real 3D place of a simulation point: on a floor, or partway up a flight of stairs.</summary>
        public static WorldPoint ToWorld(WorldData map, double x, double z)
        {
            var level = LevelOf(map, x, z);
            double y = level.Y;
            foreach (var stair in map.Stairs)
            {
                var g = Geo(map, stair);
                Point fromLower;
                if (level == g.Lower) fromLower = new Point(x, z);
                else if (level == g.Upper) fromLower = new Point(x - g.Shift.X, z - g.Shift.Z);
                else continue;
                double along, side;
                OnStair(stair, g.U, fromLower, out along, out side);
                if (!Inside(stair, along, side)) continue;
                y = g.Lower.Y + ((g.Upper.Y - g.Lower.Y) * along) / stair.LengthM;
                break;
            }
            return new WorldPoint(x + level.ShiftX, y, z + level.ShiftZ);
        }

        /// <summary>
        /// A walker moved from `from` to `to`. If that took it past the middle of a flight of stairs,
        /// it is now on the other floor: returns where it is in that floor's area. Otherwise `to`.
        /// </summary>
        public static Point CrossStairs(WorldData map, Point from, Point to)
        {
            foreach (var stair in map.Stairs)
            {
                var g = Geo(map, stair);
                double half = stair.LengthM / 2;
                var level = LevelOf(map, from.X, from.Z);
                double aAlong, aSide, bAlong, bSide;
                if (level == g.Lower)
                {
                    OnStair(stair, g.U, from, out aAlong, out aSide);
                    OnStair(stair, g.U, to, out bAlong, out bSide);
                    if (aAlong < half && bAlong >= half && Inside(stair, bAlong, bSide)) return new Point(to.X + g.Shift.X, to.Z + g.Shift.Z);
                }
                else if (level == g.Upper)
                {
                    var backFrom = new Point(from.X - g.Shift.X, from.Z - g.Shift.Z);
                    var backTo = new Point(to.X - g.Shift.X, to.Z - g.Shift.Z);
                    OnStair(stair, g.U, backFrom, out aAlong, out aSide);
                    OnStair(stair, g.U, backTo, out bAlong, out bSide);
                    if (aAlong >= half && bAlong < half && Inside(stair, bAlong, bSide)) return backTo;
                }
            }
            return to;
        }

        /// <summary>Each flight's corners in real 3D (for drawing the ramp): bottom-left, bottom-right, top-left, top-right.</summary>
        public static WorldPoint[] StairCorners(WorldData map, StairDef stair)
        {
            var g = Geo(map, stair);
            double w = stair.WidthM / 2;
            Func<double, double, double, WorldPoint> at = (along, side, y) => new WorldPoint(
                stair.X + g.U.X * along - g.U.Z * side + g.Lower.ShiftX,
                y,
                stair.Z + g.U.Z * along + g.U.X * side + g.Lower.ShiftZ);
            return new[] { at(0, -w, g.Lower.Y), at(0, w, g.Lower.Y), at(stair.LengthM, -w, g.Upper.Y), at(stair.LengthM, w, g.Upper.Y) };
        }
    }

    /// <summary>
    /// The client's own collision: a circle (the body's radius) against the solid boxes, sliding
    /// along what it hits, then across the stairs. The server's Rapier capsule decides; this only
    /// predicts it, so your view does not wait for the server.
    /// </summary>
    public class Collision
    {
        readonly WorldData map;
        readonly double radius;
        readonly List<SolidBox> boxes = new List<SolidBox>();
        readonly HashSet<string> openDoors = new HashSet<string>();

        /// <summary>Rapier's character controller keeps this gap from what it touches.</summary>
        public const double Offset = 0.01;

        public Collision(WorldData map, double bodyRadiusM)
        {
            this.map = map;
            radius = bodyRadiusM + Offset;
            boxes.AddRange(map.Solids);
        }

        /// <summary>An open door stops blocking movement.</summary>
        public void SetDoorOpen(string id, bool open)
        {
            if (open) openDoors.Add(id);
            else openDoors.Remove(id);
        }

        bool Blocks(SolidBox b)
        {
            return !(b.Kind == "door" && b.Id != null && openDoors.Contains(b.Id));
        }

        /// <summary>Most slides a move can make before it stops (Rapier stops after a few too).</summary>
        const int MaxSlides = 8;

        /// <summary>
        /// The earliest point along p + v*t (t from 0 to 1) where the body touches box b (the box
        /// grown by the body's radius, with rounded corners), and the push-back direction there.
        /// Only counts touches the move goes into, so sliding along a face does not stop.
        /// </summary>
        bool Cast(SolidBox b, double px, double pz, double vx, double vz, ref double best, ref double nx, ref double nz)
        {
            double hx = b.SizeX / 2, hz = b.SizeZ / 2, R = radius;
            double lx = px - b.X, lz = pz - b.Z;
            // Quick reject: the whole move stays away from the grown box.
            double minX = Math.Min(lx, lx + vx), maxX = Math.Max(lx, lx + vx), minZ = Math.Min(lz, lz + vz), maxZ = Math.Max(lz, lz + vz);
            if (minX > hx + R || maxX < -hx - R || minZ > hz + R || maxZ < -hz - R) return false;
            bool hit = false;

            // Already touching (start inside the grown box, by rounding): stop at once if moving further in.
            double qx = Math.Max(-hx, Math.Min(lx, hx)), qz = Math.Max(-hz, Math.Min(lz, hz));
            double ox = lx - qx, oz = lz - qz;
            double dist = Math.Sqrt(ox * ox + oz * oz);
            if (dist < R - 1e-7)
            {
                double inx, inz;
                if (dist > 1e-9) { inx = ox / dist; inz = oz / dist; }
                else
                {
                    double left = lx + hx, right = hx - lx, back = lz + hz, front = hz - lz;
                    double m = Math.Min(Math.Min(left, right), Math.Min(back, front));
                    inx = m == left ? -1 : m == right ? 1 : 0;
                    inz = m == back ? -1 : m == front ? 1 : 0;
                    if (inx != 0) inz = 0;
                }
                if (vx * inx + vz * inz < 0 && 0 < best) { best = 0; nx = inx; nz = inz; return true; }
                return false;
            }

            // The four flat faces, pushed out by R.
            for (int s = -1; s <= 1; s += 2)
            {
                if (vx * s < 0)
                {
                    double t = (s * (hx + R) - lx) / vx;
                    double zz = lz + vz * t;
                    if (t >= -1e-9 && t <= 1 && Math.Abs(zz) <= hz && t < best) { best = Math.Max(0, t); nx = s; nz = 0; hit = true; }
                }
                if (vz * s < 0)
                {
                    double t = (s * (hz + R) - lz) / vz;
                    double xx = lx + vx * t;
                    if (t >= -1e-9 && t <= 1 && Math.Abs(xx) <= hx && t < best) { best = Math.Max(0, t); nx = 0; nz = s; hit = true; }
                }
            }
            // The four rounded corners.
            double a = vx * vx + vz * vz;
            for (int cx = -1; cx <= 1; cx += 2)
                for (int cz = -1; cz <= 1; cz += 2)
                {
                    double kx = lx - cx * hx, kz = lz - cz * hz;
                    double bq = kx * vx + kz * vz;
                    // Moving along the corner (a graze, as when sliding past it) or away is no touch:
                    // a move along a circle's edge leaves it.
                    if (bq >= -1e-6 * Math.Sqrt(a) * R) continue;
                    double c = kx * kx + kz * kz - R * R;
                    double disc = bq * bq - a * c;
                    if (disc < 0) continue;
                    double t = (-bq - Math.Sqrt(disc)) / a;
                    if (t < -1e-9 || t > 1 || t >= best) continue;
                    double hx2 = kx + vx * t, hz2 = kz + vz * t;
                    // Only the corner's own quarter: elsewhere a flat face is hit first.
                    if (hx2 * cx < 0 || hz2 * cz < 0) continue;
                    best = Math.Max(0, t);
                    nx = hx2 / R;
                    nz = hz2 / R;
                    hit = true;
                }
            return hit;
        }

        /// <summary>
        /// Moves a body by a desired delta and returns where it really ends up (walls stop it). Matches
        /// CollideFn. Like Rapier's character controller: move until touching, keep a small gap, then
        /// slide the rest of the move along what was touched.
        /// </summary>
        public void Collide(double fromX, double fromZ, double dx, double dz, out double toX, out double toZ)
        {
            double x = fromX, z = fromZ, rx = dx, rz = dz;
            for (int i = 0; i < MaxSlides; i++)
            {
                if (rx * rx + rz * rz < 1e-14) break;
                double best = double.PositiveInfinity, nx = 0, nz = 0;
                foreach (var b in boxes)
                    if (Blocks(b)) Cast(b, x, z, rx, rz, ref best, ref nx, ref nz);
                if (double.IsPositiveInfinity(best))
                {
                    x += rx;
                    z += rz;
                    break;
                }
                x += rx * best;
                z += rz * best;
                rx *= 1 - best;
                rz *= 1 - best;
                double into = rx * nx + rz * nz;
                rx -= nx * into;
                rz -= nz * into;
            }
            var to = Levels.CrossStairs(map, new Point(fromX, fromZ), new Point(x, z));
            toX = to.X;
            toZ = to.Z;
        }
    }
}
