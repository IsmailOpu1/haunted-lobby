using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;
using Collision = Haunted.Sim.Collision;

namespace Haunted.Game
{
    /// <summary>
    /// The grey-box hotel (step A of docs/plans/engine-port.md), built from map data: a floor for each
    /// room in its colour, every wall, door, hiding spot and piece of furniture as a box, and a ramp
    /// for each flight of stairs. Also owns the client's collision, so doors open in both at once.
    /// Step D replaces the boxes with the dressed rooms.
    /// </summary>
    public class Hotel
    {
        public readonly WorldData World;
        public readonly Collision Collision;
        readonly GameObject root;
        readonly Dictionary<string, GameObject> doorPanels = new Dictionary<string, GameObject>();
        readonly Dictionary<Color, Material> materials = new Dictionary<Color, Material>();
        readonly Material baseMaterial;

        static readonly Color WallColor = new Color(0.55f, 0.52f, 0.48f);
        static readonly Color DoorColor = new Color(0.42f, 0.29f, 0.18f);
        static readonly Color HideColor = new Color(0.24f, 0.17f, 0.13f);
        static readonly Color FurnitureColor = new Color(0.36f, 0.28f, 0.2f);
        static readonly Color StairColor = new Color(0.45f, 0.4f, 0.36f);
        const float FloorThicknessM = 0.1f;

        /// <summary>replaced: whether a model stands in this furniture's place (a task station), so its grey box is left out, as the browser leaves out boxes its models replace. Collision still has it.
        /// dressed: the dressed rooms (step D), whose floors, furniture, hiding spots and stairs are drawn by their builds (as client/src/world.ts leaves them out); null for the plain grey box.</summary>
        public Hotel(WorldData world, double bodyRadiusM, Material baseMaterial, System.Func<SolidBox, bool> replaced = null, DressedRooms dressed = null)
        {
            World = world;
            Collision = new Collision(world, bodyRadiusM);
            this.baseMaterial = baseMaterial;
            root = new GameObject("Hotel");

            foreach (var room in world.Rooms)
            {
                if (dressed != null && dressed.Rooms.Contains(room.Name)) continue;
                string hex;
                world.RoomColors.TryGetValue(room.Name, out hex);
                var floor = Box("Floor " + room.Name, (room.MinX + room.MaxX) / 2, (room.MinZ + room.MaxZ) / 2, room.MaxX - room.MinX, room.MaxZ - room.MinZ, -FloorThicknessM, FloorThicknessM, Coords.ParseColor(hex, Color.gray));
                floor.transform.SetParent(root.transform, true);
            }

            foreach (var s in world.Solids)
            {
                if (s.Kind == "furniture" && replaced != null && replaced(s)) continue;
                // Walls and doors stay grey boxes, as in the browser: the builds line the walls from inside.
                if (dressed != null && s.Id != null && (s.Kind == "furniture" || s.Kind == "hide") && dressed.Drawn.Contains(s.Id)) continue;
                Color color = s.Kind == "door" ? DoorColor : s.Kind == "hide" ? HideColor : s.Kind == "furniture" ? FurnitureColor : WallColor;
                var go = Box((s.Id ?? s.Kind), s.X, s.Z, s.SizeX, s.SizeZ, 0, s.HeightM, color);
                go.transform.SetParent(root.transform, true);
                if (s.Kind == "door" && s.Id != null) doorPanels[s.Id] = go;
            }

            foreach (var stair in world.Stairs)
            {
                if (dressed != null && dressed.Drawn.Contains(stair.Id)) continue;
                Ramp(stair).transform.SetParent(root.transform, true);
            }
        }

        Material MaterialFor(Color color)
        {
            Material m;
            if (materials.TryGetValue(color, out m)) return m;
            m = new Material(baseMaterial) { color = color };
            materials[color] = m;
            return m;
        }

        /// <summary>A box standing on the floor that holds simulation point (x, z), raised by bottomM.</summary>
        GameObject Box(string name, double x, double z, double sizeX, double sizeZ, double bottomM, double heightM, Color color)
        {
            var go = GameObject.CreatePrimitive(PrimitiveType.Cube);
            go.name = name;
            // Unity's own colliders are not used: the simulation's Collision decides where you can go.
            Object.Destroy(go.GetComponent<BoxCollider>());
            var level = Levels.LevelOf(World, x, z);
            var floorAt = Coords.ToUnity(new WorldPoint(x + level.ShiftX, level.Y, z + level.ShiftZ));
            go.transform.position = floorAt + new Vector3(0, (float)(bottomM + heightM / 2), 0);
            go.transform.localScale = new Vector3((float)sizeX, (float)heightM, (float)sizeZ);
            go.GetComponent<MeshRenderer>().sharedMaterial = MaterialFor(color);
            go.isStatic = true;
            return go;
        }

        /// <summary>A sloped slab from the bottom of a flight to its top.</summary>
        GameObject Ramp(StairDef stair)
        {
            var c = Levels.StairCorners(World, stair);
            Vector3 bl = Coords.ToUnity(c[0]), br = Coords.ToUnity(c[1]), tl = Coords.ToUnity(c[2]), tr = Coords.ToUnity(c[3]);
            Vector3 down = Vector3.down * FloorThicknessM;
            var mesh = new Mesh { name = "Ramp " + stair.Id };
            var v = new[] { bl, br, tr, tl, bl + down, br + down, tr + down, tl + down };
            // Top and underside, each wound so it faces outward whichever way the flight runs.
            var tris = new List<int>();
            Vector3 up = Vector3.Cross(br - bl, tl - bl);
            bool flip = up.y < 0;
            int[] top = flip ? new[] { 0, 2, 1, 0, 3, 2 } : new[] { 0, 1, 2, 0, 2, 3 };
            int[] under = flip ? new[] { 4, 5, 6, 4, 6, 7 } : new[] { 4, 6, 5, 4, 7, 6 };
            tris.AddRange(top);
            tris.AddRange(under);
            mesh.vertices = v;
            mesh.triangles = tris.ToArray();
            mesh.RecalculateNormals();
            mesh.RecalculateBounds();
            var go = new GameObject("Stairs " + stair.Id);
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = MaterialFor(StairColor);
            go.isStatic = true;
            return go;
        }

        /// <summary>An open door stops blocking and is drawn open (step A: the panel simply goes).</summary>
        public void SetDoorOpen(string id, bool open)
        {
            Collision.SetDoorOpen(id, open);
            GameObject panel;
            if (doorPanels.TryGetValue(id, out panel) && panel.activeSelf == open) panel.SetActive(!open);
        }
    }
}
