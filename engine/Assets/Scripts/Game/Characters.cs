using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>The characters dealt each night (GDD 26.14), from shared/src/characters.ts via Resources/Data/characters.json.</summary>
    public static class Characters
    {
        static Dictionary<string, string> names, colours;

        static void Read()
        {
            if (names != null) return;
            names = new Dictionary<string, string>();
            colours = new Dictionary<string, string>();
            foreach (var c in (List<object>)Json.Parse(Resources.Load<TextAsset>("Data/characters").text))
            {
                var d = (Dictionary<string, object>)c;
                names[(string)d["id"]] = (string)d["name"];
                if (d.ContainsKey("colour")) colours[(string)d["id"]] = (string)d["colour"];
            }
        }

        /// <summary>"The Priest" for "priest", or null before the first night ("").</summary>
        public static string NameOf(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            Read();
            string name;
            return names.TryGetValue(id, out name) ? name : null;
        }

        /// <summary>The character's colour ("#d8d2c0"), shown when you recognise them (GDD 22.2); null for none.</summary>
        public static string ColourOf(string id)
        {
            if (string.IsNullOrEmpty(id)) return null;
            Read();
            string colour;
            return colours.TryGetValue(id, out colour) ? colour : null;
        }

        /// <summary>
        /// three draws a see-through two-sided material in two passes, its back faces and then its
        /// front ones (WebGLRenderer renderObject); URP draws it once with nothing culled, so the inside
        /// of a head or a shirt could land over the face (the detective's skin and hair are glTF BLEND).
        /// Each such part is drawn twice in turn: its back faces, then its front ones (a copy of the
        /// mesh with the part listed twice, made once per mesh). Takes the piece's own (instanced)
        /// materials and gives the ones to use.
        /// </summary>
        public static Material[] BackThenFront(Renderer r, Material[] materials)
        {
            var skinned = r as SkinnedMeshRenderer;
            var filter = skinned == null ? r.GetComponent<MeshFilter>() : null;
            var mesh = skinned != null ? skinned.sharedMesh : filter != null ? filter.sharedMesh : null;
            if (mesh == null || materials.Length != mesh.subMeshCount) return materials;
            var split = new bool[materials.Length];
            bool any = false;
            for (int i = 0; i < materials.Length; i++)
            {
                var m = materials[i];
                split[i] = m != null && m.HasProperty(Surface) && m.GetFloat(Surface) == 1
                    && m.HasProperty(Cull) && m.GetFloat(Cull) == (float)UnityEngine.Rendering.CullMode.Off;
                any |= split[i];
            }
            if (!any) return materials;
            if (!twice.TryGetValue(mesh, out var doubled))
            {
                doubled = Object.Instantiate(mesh);
                doubled.name = mesh.name + " (back, then front)";
                var parts = new List<int[]>();
                for (int i = 0; i < mesh.subMeshCount; i++)
                {
                    var indices = mesh.GetIndices(i);
                    if (split[i]) parts.Add(indices);
                    parts.Add(indices);
                }
                doubled.subMeshCount = parts.Count;
                for (int i = 0; i < parts.Count; i++) doubled.SetIndices(parts[i], MeshTopology.Triangles, i, false);
                twice[mesh] = doubled;
            }
            if (skinned != null) skinned.sharedMesh = doubled;
            else filter.sharedMesh = doubled;
            var result = new List<Material>();
            for (int i = 0; i < materials.Length; i++)
            {
                var m = materials[i];
                if (split[i])
                {
                    var back = new Material(m) { name = m.name + " (back)" };
                    back.SetFloat(Cull, (float)UnityEngine.Rendering.CullMode.Front);
                    m.SetFloat(Cull, (float)UnityEngine.Rendering.CullMode.Back);
                    result.Add(back);
                }
                result.Add(m);
            }
            return result.ToArray();
        }

        /// <summary>Each mesh with its see-through parts listed twice (BackThenFront), shared by every copy.</summary>
        static readonly Dictionary<Mesh, Mesh> twice = new Dictionary<Mesh, Mesh>();
        static readonly int Surface = Shader.PropertyToID("_Surface"), Cull = Shader.PropertyToID("_Cull");
    }
}
