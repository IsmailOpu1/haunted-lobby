using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// Builds the task stations the way client/src/stations.ts does, from the same numbers. The
    /// browser builds in three.js's right-handed axes with the front of a model at +z; here every
    /// position and turn is given in those same axes and flipped on the way in (Coords: Unity z is
    /// -z), so the numbers can be copied as they are: positions negate z, turns about x and y negate,
    /// turns about z stay. Shapes match three.js's: boxes, cylinders and cones stand on their middle
    /// along y; discs, rings, planes and tori lie in the x-y plane.
    /// </summary>
    public static class Shapes
    {
        static Material lit, glow, clear, unlit, unlitClear;
        static Mesh cube, cylinder, sphere;
        static Material textMaterial;
        static readonly Dictionary<string, Mesh> meshes = new Dictionary<string, Mesh>();

        public static void Load(Material greyBox)
        {
            lit = greyBox;
            glow = Resources.Load<Material>("Materials/Glow") ?? greyBox;
            clear = Resources.Load<Material>("Materials/Clear") ?? greyBox;
            unlit = Resources.Load<Material>("Materials/Unlit") ?? greyBox;
            unlitClear = Resources.Load<Material>("Materials/UnlitClear") ?? unlit;
            cube = Builtin(PrimitiveType.Cube);
            cylinder = Builtin(PrimitiveType.Cylinder);
            sphere = Builtin(PrimitiveType.Sphere);
        }

        static Mesh Builtin(PrimitiveType type)
        {
            var go = GameObject.CreatePrimitive(type);
            var mesh = go.GetComponent<MeshFilter>().sharedMesh;
            Object.Destroy(go);
            return mesh;
        }

        public static Color Hex(int hex) { return new Color32((byte)(hex >> 16), (byte)(hex >> 8), (byte)hex, 255); }

        /// <summary>A position in three.js's axes, in Unity's.</summary>
        public static Vector3 P(double x, double y, double z) { return new Vector3((float)x, (float)y, (float)-z); }

        /// <summary>A turn in radians about three.js's x, y or z (one axis at a time), in Unity's.</summary>
        public static Quaternion R(double x, double y, double z)
        {
            return Quaternion.Euler((float)(-x * Mathf.Rad2Deg), (float)(-y * Mathf.Rad2Deg), (float)(z * Mathf.Rad2Deg));
        }

        public enum Look { Lit, Glow, Clear, Unlit, UnlitClear }

        public static Material Mat(Color c, Look look = Look.Lit, float alpha = 1)
        {
            var source = look == Look.Glow ? glow : look == Look.Clear ? clear : look == Look.Unlit ? unlit : look == Look.UnlitClear ? unlitClear : lit;
            var m = new Material(source);
            c.a = alpha;
            m.color = c;
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
            return m;
        }

        /// <summary>A new empty object at a three.js position under a parent.</summary>
        public static Transform Group(Transform parent, string name, double x = 0, double y = 0, double z = 0)
        {
            var g = new GameObject(name).transform;
            g.SetParent(parent, false);
            g.localPosition = P(x, y, z);
            return g;
        }

        /// <summary>A shape under a parent at a three.js position. part: its name for the hands (it gets a collider), or null.</summary>
        public static GameObject Shape(Transform parent, Mesh mesh, Vector3 scale, Material mat, double x, double y, double z, string part = null)
        {
            var go = new GameObject(part ?? mesh.name);
            go.transform.SetParent(parent, false);
            go.transform.localPosition = P(x, y, z);
            go.transform.localScale = scale;
            go.AddComponent<MeshFilter>().sharedMesh = mesh;
            go.AddComponent<MeshRenderer>().sharedMaterial = mat;
            if (part != null)
            {
                go.AddComponent<MeshCollider>().sharedMesh = mesh;
                go.AddComponent<HandPart>().Name = part;
            }
            return go;
        }

        /// <summary>A material for a shape: a part gets one that can glow.</summary>
        public static Material For(int hex, string part) { return Mat(Hex(hex), part != null ? Look.Glow : Look.Lit); }

        public static GameObject Box(Transform parent, double w, double h, double d, int hex, double x = 0, double y = 0, double z = 0, string part = null)
        {
            return Shape(parent, cube, new Vector3((float)w, (float)h, (float)d), For(hex, part), x, y, z, part);
        }

        public static GameObject Box(Transform parent, double w, double h, double d, Material mat, double x = 0, double y = 0, double z = 0, string part = null)
        {
            return Shape(parent, cube, new Vector3((float)w, (float)h, (float)d), mat, x, y, z, part);
        }

        /// <summary>three.js CylinderGeometry(top, bottom, h): along y, centred. Equal ends use Unity's smooth cylinder.</summary>
        public static GameObject Cylinder(Transform parent, double top, double bottom, double h, Material mat, double x = 0, double y = 0, double z = 0, string part = null, int segments = 16, bool open = false)
        {
            if (top == bottom && !open) return Shape(parent, cylinder, new Vector3((float)(2 * top), (float)(h / 2), (float)(2 * top)), mat, x, y, z, part);
            return Shape(parent, Frustum(top, bottom, h, segments, open), Vector3.one, mat, x, y, z, part);
        }

        public static GameObject Sphere(Transform parent, double r, Material mat, double x = 0, double y = 0, double z = 0, string part = null)
        {
            return Shape(parent, sphere, Vector3.one * (float)(2 * r), mat, x, y, z, part);
        }

        // ---------- Meshes (cached by size) ----------

        static Mesh Cached(string key, System.Func<Builder> make)
        {
            Mesh m;
            if (meshes.TryGetValue(key, out m)) return m;
            m = make().Mesh();
            m.name = key;
            meshes[key] = m;
            return m;
        }

        /// <summary>A cylinder with different ends, or a cone (top 0). open: no caps.</summary>
        public static Mesh Frustum(double top, double bottom, double h, int segments, bool open)
        {
            return Cached("frustum " + top + " " + bottom + " " + h + " " + segments + " " + open, () =>
            {
                var b = new Builder();
                float y = (float)h / 2;
                for (int i = 0; i < segments; i++)
                {
                    float a0 = i * Mathf.PI * 2 / segments, a1 = (i + 1) * Mathf.PI * 2 / segments;
                    Vector3 b0 = Around(a0, bottom, -y), b1 = Around(a1, bottom, -y), t0 = Around(a0, top, y), t1 = Around(a1, top, y);
                    b.Quad(b0, t0, t1, b1);
                    if (open) continue;
                    if (top > 0) b.Tri(new Vector3(0, y, 0), t1, t0);
                    if (bottom > 0) b.Tri(new Vector3(0, -y, 0), b0, b1);
                }
                return b;
            });
        }

        static Vector3 Around(float a, double r, float y) { return new Vector3(Mathf.Cos(a) * (float)r, y, Mathf.Sin(a) * (float)r); }

        /// <summary>A flat disc in the x-y plane.</summary>
        public static Mesh Disc(double r, int segments = 24) { return RingMesh(0, r, segments, 0, Mathf.PI * 2); }

        /// <summary>three.js RingGeometry: in the x-y plane, from start (counterclockwise from +x, as three.js draws it) round by length.</summary>
        public static Mesh RingMesh(double inner, double outer, int segments, double start, double length)
        {
            return Cached("ring " + inner + " " + outer + " " + segments + " " + start + " " + length, () =>
            {
                var b = new Builder();
                for (int i = 0; i < segments; i++)
                {
                    // Flipping z leaves x and y alone, so three.js's angles hold as they are.
                    float a0 = (float)(start + length * i / segments), a1 = (float)(start + length * (i + 1) / segments);
                    b.Quad(Polar(a0, inner), Polar(a0, outer), Polar(a1, outer), Polar(a1, inner));
                }
                return b;
            });
        }

        static Vector3 Polar(float a, double r) { return new Vector3(Mathf.Cos(a) * (float)r, Mathf.Sin(a) * (float)r, 0); }

        /// <summary>A flat w x h rectangle in the x-y plane, seen from both sides, its picture (0,0) at the bottom left as seen from in front.</summary>
        public static Mesh Plane(double w, double h)
        {
            string key = "plane " + w + " " + h;
            Mesh mesh;
            if (meshes.TryGetValue(key, out mesh)) return mesh;
            float x = (float)w / 2, y = (float)h / 2;
            mesh = new Mesh { name = key };
            // The front (three.js +z) is Unity -z: seen from there x runs right, so pictures are not mirrored.
            mesh.vertices = new[] { new Vector3(-x, -y, 0), new Vector3(x, -y, 0), new Vector3(x, y, 0), new Vector3(-x, y, 0), new Vector3(-x, -y, 0), new Vector3(x, -y, 0), new Vector3(x, y, 0), new Vector3(-x, y, 0) };
            mesh.uv = new[] { new Vector2(0, 0), new Vector2(1, 0), new Vector2(1, 1), new Vector2(0, 1), new Vector2(1, 0), new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1) };
            mesh.triangles = new[] { 0, 3, 2, 0, 2, 1, 4, 5, 6, 4, 6, 7 };
            mesh.normals = new[] { Vector3.back, Vector3.back, Vector3.back, Vector3.back, Vector3.forward, Vector3.forward, Vector3.forward, Vector3.forward };
            mesh.RecalculateBounds();
            meshes[key] = mesh;
            return mesh;
        }

        /// <summary>three.js TorusGeometry: a ring of radius r round the z axis, its tube of radius tube.</summary>
        public static Mesh Torus(double r, double tube, int radial = 6, int tubular = 16)
        {
            return Cached("torus " + r + " " + tube + " " + radial + " " + tubular, () =>
            {
                var b = new Builder();
                for (int i = 0; i < tubular; i++)
                    for (int j = 0; j < radial; j++)
                        b.Quad(TorusAt(r, tube, i, j, tubular, radial), TorusAt(r, tube, i, j + 1, tubular, radial), TorusAt(r, tube, i + 1, j + 1, tubular, radial), TorusAt(r, tube, i + 1, j, tubular, radial));
                return b;
            });
        }

        static Vector3 TorusAt(double r, double tube, int i, int j, int tubular, int radial)
        {
            float u = i * Mathf.PI * 2 / tubular, v = j * Mathf.PI * 2 / radial;
            float ring = (float)(r + tube * Mathf.Cos(v));
            return new Vector3(ring * Mathf.Cos(u), ring * Mathf.Sin(u), (float)tube * Mathf.Sin(v));
        }

        /// <summary>Lays a one-metre rod (a cylinder of height 1, under the same parent) from a to b, both in the parent's Unity axes.</summary>
        public static void Stretch(Transform rod, Vector3 a, Vector3 b, double radius)
        {
            rod.localPosition = (a + b) / 2;
            var dir = b - a;
            float len = dir.magnitude;
            // Unity's cylinder is 2 m tall and 1 m across.
            rod.localScale = new Vector3((float)(2 * radius), Mathf.Max(len, 0.001f) / 2, (float)(2 * radius));
            if (len > 0) rod.localRotation = Quaternion.FromToRotation(Vector3.up, dir / len);
        }

        /// <summary>Sets how a part glows (black for none).</summary>
        public static void SetGlow(GameObject part, Color c)
        {
            var r = part.GetComponent<Renderer>();
            if (r != null && r.material.HasProperty("_EmissionColor")) r.material.SetColor("_EmissionColor", c);
        }

        public static void SetColor(GameObject go, Color c)
        {
            var m = go.GetComponent<Renderer>().material;
            c.a = m.color.a;
            m.color = c;
            if (m.HasProperty("_BaseColor")) m.SetColor("_BaseColor", c);
        }

        /// <summary>Text in the x-y plane, read from in front (three.js +z); size: its letters' height in metres.</summary>
        public static TextMesh Text(Transform parent, string text, double size, Color color, double x, double y, double z, FontStyle style = FontStyle.Bold)
        {
            var go = new GameObject("Text");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = P(x, y, z);
            var t = go.AddComponent<TextMesh>();
            t.font = Resources.GetBuiltinResource<Font>("LegacyRuntime.ttf");
            if (textMaterial == null)
            {
                // The font's own material draws over everything (GUI text); in the world it must hide behind things.
                textMaterial = new Material(t.font.material);
                textMaterial.SetFloat("unity_GUIZTestMode", (float)UnityEngine.Rendering.CompareFunction.LessEqual);
            }
            go.GetComponent<MeshRenderer>().sharedMaterial = textMaterial;
            t.fontSize = 64;
            t.fontStyle = style;
            // At fontSize 64 a characterSize of 1 makes letters about 6.4 m tall... scaled to size.
            t.characterSize = (float)size * 10f / 64f;
            t.anchor = TextAnchor.MiddleCenter;
            t.alignment = TextAlignment.Center;
            t.color = color;
            t.text = text;
            return t;
        }

        /// <summary>Collects triangles; every face is drawn from both sides, so no shape can show inside out.</summary>
        class Builder
        {
            readonly List<Vector3> v = new List<Vector3>();
            readonly List<int> t = new List<int>();

            public void Tri(Vector3 a, Vector3 b, Vector3 c)
            {
                foreach (var tri in new[] { new[] { a, b, c }, new[] { a, c, b } })
                {
                    int n = v.Count;
                    v.AddRange(tri);
                    t.Add(n); t.Add(n + 1); t.Add(n + 2);
                }
            }

            public void Quad(Vector3 a, Vector3 b, Vector3 c, Vector3 d)
            {
                Tri(a, b, c);
                Tri(a, c, d);
            }

            public Mesh Mesh()
            {
                var m = new Mesh();
                if (v.Count > 65000) m.indexFormat = UnityEngine.Rendering.IndexFormat.UInt32;
                m.SetVertices(v);
                m.SetTriangles(t, 0);
                m.RecalculateNormals();
                m.RecalculateBounds();
                return m;
            }
        }
    }

    /// <summary>A part of a station your hands can work on ("wick:2", "knob:0", "soil").</summary>
    public class HandPart : MonoBehaviour
    {
        public string Name;
    }
}
