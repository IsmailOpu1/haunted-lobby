using System;
using System.Collections;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Haunted.Game
{
    /// <summary>
    /// The dressed rooms in the hotel (step D of docs/plans/engine-port.md), as the browser's
    /// client/src/dressedRooms.ts shows them: each build where Blender put it, lit by its own baked
    /// lightmap; bulbs and flames are not lightmapped, they glow by themselves. Each build reflects
    /// itself: a reflection probe in its middle (or where its dressing says), taken once the hotel
    /// stands, showing only the lit world.
    /// </summary>
    public class DressedRooms
    {
        /// <summary>The browser's BULB_PREFIX: meshes named so are light sources, never lightmapped.</summary>
        const string BulbPrefix = "bulb_";
        // dressedRooms.ts: probes stand this high over the build's floor, and see this much of it.
        const float ProbeHeightM = 1.6f;
        const int ProbeSizePx = 256;
        const float ProbeNearM = 0.05f;
        const float ProbeFarM = 50;
        /// <summary>
        /// Each probe's box: tiny, and every surface's probe anchor stands in the middle of its own
        /// probe's, so each surface reflects exactly the probe the browser gives it (the nearest).
        /// The box is not used for the reflection itself (no box projection, like the browser).
        /// </summary>
        const float ProbeBoxM = 0.1f;

        public readonly HashSet<string> Rooms = new HashSet<string>();
        public readonly HashSet<string> Drawn = new HashSet<string>();
        public readonly GameObject Root;
        readonly List<ReflectionProbe> probes = new List<ReflectionProbe>();
        /// <summary>Every lightmapped piece: each reflects (and is lit by) its nearest probe.</summary>
        readonly List<MeshRenderer> lit = new List<MeshRenderer>();
        /// <summary>
        /// The patched URP's (Packages/com.unity.render-pipelines.universal/HAUNTED-PATCHES.md) share of
        /// a probe's light that falls on lightmapped surfaces, as three's envMap lights them as well.
        /// </summary>
        static readonly int ProbeDiffuse = Shader.PropertyToID("_HauntedProbeDiffuse");
        /// <summary>True once every probe has been taken (CaptureReflections).</summary>
        public bool ReflectionsReady { get; private set; }

        public DressedRooms(HotelArt art)
        {
            Shader.SetGlobalFloat(ProbeDiffuse, 1);
            Root = new GameObject("Dressed rooms");
            // glTFast brings glTF (x, y, z) in as Unity (-x, y, z); the game's Unity space is (x, y, -z)
            // (Coords), which is that turned half a circle around y.
            Root.transform.rotation = Quaternion.Euler(0, 180, 0);
            var reflections = new GameObject("Dressed reflections").transform;
            QualitySettings.realtimeReflectionProbes = true;
            var lightmaps = new List<LightmapData>();
            var glass = new Dictionary<string, GlassArt>();
            foreach (var g in art.glass ?? new List<GlassArt>()) glass[g.material] = g;
            foreach (var room in art.rooms)
            {
                if (room.model == null || room.lightmap == null) continue;
                int index = lightmaps.Count;
                lightmaps.Add(new LightmapData { lightmapColor = room.lightmap });
                var build = UnityEngine.Object.Instantiate(room.model, Root.transform, false);
                build.name = room.name;
                var renderers = build.GetComponentsInChildren<MeshRenderer>(true);
                if (renderers.Length == 0) continue;
                var bounds = renderers[0].bounds;
                foreach (var r in renderers) bounds.Encapsulate(r.bounds);
                var spots = Spots(room, bounds);
                var mine = new ReflectionProbe[spots.Length];
                for (int i = 0; i < spots.Length; i++) mine[i] = MakeProbe(reflections, room.name + " " + i, spots[i]);
                foreach (var r in renderers)
                {
                    if (r.gameObject.name.StartsWith(BulbPrefix, StringComparison.Ordinal))
                    {
                        // The browser gives bulbs no reflection, only their glow.
                        r.reflectionProbeUsage = ReflectionProbeUsage.Off;
                        continue;
                    }
                    UseGlass(r, glass);
                    // The lightmap covers the whole build with its own UVs (glTF TEXCOORD_1 = Unity uv2).
                    r.lightmapIndex = index;
                    r.lightmapScaleOffset = new Vector4(1, 1, 0, 0);
                    r.reflectionProbeUsage = ReflectionProbeUsage.Simple;
                    r.probeAnchor = Nearest(mine, r.bounds.center).transform;
                    lit.Add(r);
                }
                foreach (var name in room.rooms ?? new string[0]) Rooms.Add(name);
                foreach (var id in room.drawn ?? new string[0]) Drawn.Add(id);
            }
            LightmapSettings.lightmapsMode = LightmapsMode.NonDirectional;
            LightmapSettings.lightmaps = lightmaps.ToArray();
        }

        static Shader glassShader;
        /// <summary>Each glass material made so far, by the glTFast material it stands in for.</summary>
        readonly Dictionary<Material, Material> glassMade = new Dictionary<Material, Material>();

        /// <summary>The glTFast properties HauntedGlass reads, copied over as they are.</summary>
        static readonly string[] GlassTextures = { "baseColorTexture", "metallicRoughnessTexture", "normalTexture", "emissiveTexture", "occlusionTexture" };
        static readonly string[] GlassFloats = { "metallicFactor", "roughnessFactor", "normalTexture_scale", "occlusionTexture_strength" };

        /// <summary>
        /// Draws a build's glass (GlassArt) as the browser does (HauntedGlass, with HauntedTransmission):
        /// what is behind it, blurred by its roughness, tinted by its colour, under its own shine.
        /// </summary>
        void UseGlass(Renderer r, Dictionary<string, GlassArt> glass)
        {
            if (glass.Count == 0) return;
            var materials = r.sharedMaterials;
            bool changed = false;
            for (int i = 0; i < materials.Length; i++)
            {
                var m = materials[i];
                if (m == null || !glass.TryGetValue(m.name, out var art)) continue;
                if (!glassMade.TryGetValue(m, out var made))
                {
                    if (glassShader == null) glassShader = Resources.Load<Shader>("Shaders/HauntedGlass");
                    if (glassShader == null) return;
                    made = new Material(glassShader) { name = m.name + " (glass)" };
                    foreach (var p in GlassTextures)
                    {
                        if (!m.HasProperty(p)) continue;
                        made.SetTexture(p, m.GetTexture(p));
                        if (m.HasProperty(p + "_ST")) made.SetVector(p + "_ST", m.GetVector(p + "_ST"));
                        if (m.HasProperty(p + "_texCoord")) made.SetFloat(p + "_texCoord", m.GetFloat(p + "_texCoord"));
                    }
                    foreach (var p in GlassFloats) if (m.HasProperty(p)) made.SetFloat(p, m.GetFloat(p));
                    if (m.HasProperty("emissiveFactor")) made.SetVector("emissiveFactor", m.GetVector("emissiveFactor"));
                    // glTFast's stand-in changed the alpha; the file's colour is linear as given.
                    made.SetVector("baseColorFactor", (Vector4)art.baseColor);
                    made.SetFloat("transmissionFactor", art.transmission);
                    if (art.transmissionMap != null) made.SetTexture("transmissionTexture", art.transmissionMap);
                    made.SetFloat("_SrcBlend", (float)(art.blend ? BlendMode.SrcAlpha : BlendMode.One));
                    made.SetFloat("_DstBlend", (float)(art.blend ? BlendMode.OneMinusSrcAlpha : BlendMode.Zero));
                    // three's GLTFLoader: blended glass writes no depth.
                    made.SetFloat("_ZWrite", art.blend ? 0 : 1);
                    made.renderQueue = (int)RenderQueue.Transparent;
                    glassMade[m] = made;
                }
                materials[i] = made;
                changed = true;
            }
            if (changed) r.sharedMaterials = materials;
        }

        /// <summary>
        /// Where a build's probes stand: its dressing's spots (the browser's world x, z, which is Unity
        /// x, -z) or its middle, at eye height over its lowest point (its floor), as dressedRooms.ts.
        /// </summary>
        static Vector3[] Spots(RoomArt room, Bounds bounds)
        {
            float y = bounds.min.y + ProbeHeightM;
            if (room.probes == null || room.probes.Length == 0) return new[] { new Vector3(bounds.center.x, y, bounds.center.z) };
            var spots = new Vector3[room.probes.Length];
            for (int i = 0; i < spots.Length; i++) spots[i] = new Vector3(room.probes[i].x, y, -room.probes[i].y);
            return spots;
        }

        ReflectionProbe MakeProbe(Transform parent, string name, Vector3 at)
        {
            var go = new GameObject("Reflection " + name);
            go.transform.SetParent(parent, false);
            go.transform.position = at;
            var probe = go.AddComponent<ReflectionProbe>();
            probe.mode = ReflectionProbeMode.Realtime;
            probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
            probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
            probe.resolution = ProbeSizePx;
            probe.hdr = true;
            probe.nearClipPlane = ProbeNearM;
            probe.farClipPlane = ProbeFarM;
            probe.boxProjection = false;
            probe.size = Vector3.one * ProbeBoxM;
            probe.clearFlags = ReflectionProbeClearFlags.SolidColor;
            probe.backgroundColor = Color.black;
            probes.Add(probe);
            return probe;
        }

        // dressedRooms.ts lightMovable: the nearest probe within this, on the same floor (within SameFloorM).
        const float MovableProbeRangeM = 20, SameFloorM = 1.5f;
        /// <summary>The rendering layer the patched URP lights by its probe without a lightmap (HAUNTED-PATCHES.md).</summary>
        const uint MovableLayer = 1u << 7;

        /// <summary>
        /// Lights something that moves (a door), which the baked lightmaps can't, by the nearest dressed
        /// room's probe on its floor, as dressedRooms.ts lightMovable: its reflection and its light.
        /// With none near (an undressed floor) it is lit by the faint fill alone. floorY: the Unity
        /// height of the floor it stands on.
        /// </summary>
        public void LightMovable(GameObject obj, float floorY)
        {
            var at = obj.transform.position;
            ReflectionProbe best = null;
            float bestD = MovableProbeRangeM * MovableProbeRangeM;
            foreach (var p in probes)
            {
                var o = p.transform.position;
                if (Mathf.Abs(o.y - ProbeHeightM - floorY) > SameFloorM) continue;
                float d = (o.x - at.x) * (o.x - at.x) + (o.z - at.z) * (o.z - at.z);
                if (d < bestD)
                {
                    bestD = d;
                    best = p;
                }
            }
            if (best == null) return;
            foreach (var r in obj.GetComponentsInChildren<MeshRenderer>(true))
            {
                r.renderingLayerMask |= MovableLayer;
                r.reflectionProbeUsage = ReflectionProbeUsage.Simple;
                r.probeAnchor = best.transform;
                lit.Add(r);
            }
        }

        /// <summary>The probe nearest across the floor, as dressedRooms.ts picks one for each piece.</summary>
        static ReflectionProbe Nearest(ReflectionProbe[] choices, Vector3 at)
        {
            var best = choices[0];
            float bestD = float.MaxValue;
            foreach (var p in choices)
            {
                var o = p.transform.position;
                float d = (o.x - at.x) * (o.x - at.x) + (o.z - at.z) * (o.z - at.z);
                if (d < bestD)
                {
                    bestD = d;
                    best = p;
                }
            }
            return best;
        }

        /// <summary>
        /// Takes every reflection once the hotel stands and has been drawn: only the world is there yet
        /// (no players), and the fog is off while they are taken, as in the browser. Run as a coroutine.
        /// </summary>
        public IEnumerator CaptureReflections()
        {
            yield return null;
            bool fog = RenderSettings.fog;
            RenderSettings.fog = false;
            // Each probe shows the rooms by their lightmaps alone, never another probe's light or
            // shine, as the browser's are blank while they are taken: so each is the same whichever
            // is taken first.
            Shader.SetGlobalFloat(ProbeDiffuse, 0);
            foreach (var r in lit) r.reflectionProbeUsage = ReflectionProbeUsage.Off;
            var ids = new int[probes.Count];
            for (int i = 0; i < probes.Count; i++) ids[i] = probes[i].RenderProbe();
            for (int i = 0; i < probes.Count; i++)
            {
                while (!probes[i].IsFinishedRendering(ids[i])) yield return null;
            }
            foreach (var r in lit) r.reflectionProbeUsage = ReflectionProbeUsage.Simple;
            Shader.SetGlobalFloat(ProbeDiffuse, 1);
            RenderSettings.fog = fog;
            ReflectionsReady = true;
        }
    }
}
