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
        static Material lit, glow, clear, unlit, unlitClear, standard, standardGlow;
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
            // three's MeshStandardMaterial: it shines and reflects (Lit and Glow are Lambert, which doesn't).
            standard = Resources.Load<Material>("Materials/Standard") ?? greyBox;
            standardGlow = Resources.Load<Material>("Materials/StandardGlow") ?? glow;
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

        /// <summary>Lit and Glow: three's Lambert (no shine); Standard and StandardGlow: its MeshStandardMaterial.</summary>
        public enum Look { Lit, Glow, Clear, Unlit, UnlitClear, Standard, StandardGlow }

        public static Material Mat(Color c, Look look = Look.Lit, float alpha = 1)
        {
            var source = look == Look.Standard ? standard : look == Look.StandardGlow ? standardGlow : look == Look.Glow ? glow : look == Look.Clear ? clear : look == Look.Unlit ? unlit : look == Look.UnlitClear ? unlitClear : lit;
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

        static Mesh quad;

        /// <summary>Unity's quad, 1 x 1: it faces three.js's +z (Shapes.P), its picture the right way round from there.</summary>
        public static Mesh Quad()
        {
            if (quad == null) quad = Builtin(PrimitiveType.Quad);
            return quad;
        }

        /// <summary>
        /// three.js LatheGeometry: (radius, height) points turned round y, one-sided and facing out,
        /// smooth like three's. phiStart and phiLength as three's (0 is three's +z).
        /// With uv: u across the turn, v up the points (three's CylinderGeometry, open, when two points).
        /// </summary>
        public static Mesh Lathe(Vector2[] points, int segments, double phiStart = 0, double phiLength = Mathf.PI * 2)
        {
            var v = new List<Vector3>();
            var uv = new List<Vector2>();
            for (int i = 0; i <= segments; i++)
            {
                double phi = phiStart + phiLength * i / segments;
                for (int j = 0; j < points.Length; j++)
                {
                    v.Add(P(points[j].x * System.Math.Sin(phi), points[j].y, points[j].x * System.Math.Cos(phi)));
                    uv.Add(new Vector2((float)i / segments, (float)j / (points.Length - 1)));
                }
            }
            var t = new List<int>();
            for (int i = 0; i < segments; i++)
                for (int j = 0; j < points.Length - 1; j++)
                {
                    int a = i * points.Length + j, b = a + points.Length, c = b + 1, d = a + 1;
                    t.AddRange(new[] { a, b, d, b, c, d });
                }
            var m = new Mesh { name = "Lathe" };
            m.SetVertices(v);
            m.SetUVs(0, uv);
            m.SetTriangles(t, 0);
            // Whichever way that winds, make the faces look out from the axis.
            if (SideFacing(v, t) < 0)
            {
                for (int k = 0; k < t.Count; k += 3) { int x = t[k + 1]; t[k + 1] = t[k + 2]; t[k + 2] = x; }
                m.SetTriangles(t, 0);
            }
            m.RecalculateNormals();
            m.RecalculateTangents();
            m.RecalculateBounds();
            return m;
        }

        /// <summary>Sums how much each face looks away from the y axis (positive: out).</summary>
        static float SideFacing(List<Vector3> v, List<int> t)
        {
            float sum = 0;
            for (int k = 0; k < t.Count; k += 3)
            {
                Vector3 p0 = v[t[k]], p1 = v[t[k + 1]], p2 = v[t[k + 2]];
                var c = (p0 + p1 + p2) / 3;
                sum += Vector3.Dot(Vector3.Cross(p1 - p0, p2 - p0), new Vector3(c.x, 0, c.z));
            }
            return sum;
        }

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
            if (r == null) return;
            if (r.material.name.StartsWith(AddedGlowName, System.StringComparison.Ordinal)) r.material.SetColor("_BaseColor", c);
            else if (r.material.HasProperty("_EmissionColor")) r.material.SetColor("_EmissionColor", c);
        }

        const string AddedGlowName = "AddedGlow";

        /// <summary>
        /// Black and added over what is behind (three's AdditiveBlending): unseen until it glows. Its
        /// glow (SetGlow) is its colour.
        /// </summary>
        public static Material AddedGlow()
        {
            var m = Mat(Color.black, Look.UnlitClear, 1);
            m.name = AddedGlowName;
            foreach (var p in new[] { "_SrcBlend", "_DstBlend", "_SrcBlendAlpha", "_DstBlendAlpha" })
                if (m.HasProperty(p)) m.SetFloat(p, (float)UnityEngine.Rendering.BlendMode.One);
            if (m.HasProperty("_ZWrite")) m.SetFloat("_ZWrite", 0);
            return m;
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

    /// <summary>
    /// Writes text on a picture as a canvas's fillText does (textAlign centre, textBaseline middle,
    /// maxWidth squeezing): the browser's labels and signs, in Georgia (bold) from the system's fonts,
    /// drawn on the CPU from the font's glyphs.
    /// </summary>
    public class TextPainter
    {
        readonly Font font;
        readonly int fontPx;
        readonly Texture2D atlas;

        /// <summary>fontPx: the letters' size in picture pixels; text: every letter it will write.</summary>
        public TextPainter(int fontPx, string text)
        {
            this.fontPx = fontPx;
            font = Font.CreateDynamicFontFromOSFont(new[] { "Georgia", "Times New Roman" }, fontPx);
            font.RequestCharactersInTexture("H" + text, fontPx, FontStyle.Bold);
            // The font's glyphs live on the GPU: copy them back once to read.
            var source = font.material.mainTexture;
            var rt = RenderTexture.GetTemporary(source.width, source.height, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear);
            // Before the blit, which leaves rt active: restoring that would release the active texture.
            var was = RenderTexture.active;
            Graphics.Blit(source, rt);
            RenderTexture.active = rt;
            atlas = new Texture2D(source.width, source.height, TextureFormat.RGBA32, false, true);
            atlas.ReadPixels(new Rect(0, 0, source.width, source.height), 0, 0);
            atlas.Apply();
            RenderTexture.active = was;
            RenderTexture.ReleaseTemporary(rt);
        }

        /// <summary>Writes text centred on (cx, midY) (canvas pixels, y down) on a w x h picture whose row 0 is its bottom.</summary>
        public void Write(Color32[] px, int w, int h, string text, float cx, float midY, Color32 ink, float maxWidth)
        {
            float total = 0;
            CharacterInfo ci;
            foreach (char c in text) if (font.GetCharacterInfo(c, out ci, fontPx, FontStyle.Bold)) total += ci.advance;
            // The canvas squeezes text wider than its maxWidth.
            float sx = total > maxWidth ? maxWidth / total : 1;
            float capH = font.GetCharacterInfo('H', out ci, fontPx, FontStyle.Bold) ? ci.maxY : fontPx * 0.7f;
            // textBaseline "middle" sets capitals' middle about 2 px above midY.
            float baseline = midY - 2 + capH / 2;
            float pen = cx - total * sx / 2;
            foreach (char c in text)
            {
                if (!font.GetCharacterInfo(c, out ci, fontPx, FontStyle.Bold)) continue;
                Glyph(px, w, h, ci, pen + ci.minX * sx, (ci.maxX - ci.minX) * sx, baseline, ink);
                pen += ci.advance * sx;
            }
        }

        void Glyph(Color32[] px, int w, int h, CharacterInfo ci, float x0, float width, float baseline, Color32 ink)
        {
            if (width <= 0 || ci.maxY <= ci.minY) return;
            int top = Mathf.FloorToInt(baseline - ci.maxY), bottom = Mathf.CeilToInt(baseline - ci.minY);
            for (int y = Mathf.Max(0, top); y < Mathf.Min(h, bottom); y++)
            {
                float t = (baseline - (y + 0.5f) - ci.minY) / (ci.maxY - ci.minY); // 0 at the glyph's bottom
                for (int x = Mathf.Max(0, Mathf.FloorToInt(x0)); x < Mathf.Min(w, Mathf.CeilToInt(x0 + width)); x++)
                {
                    float s = (x + 0.5f - x0) / width;
                    if (s < 0 || s > 1 || t < 0 || t > 1) continue;
                    Vector2 uv = Vector2.Lerp(Vector2.Lerp(ci.uvBottomLeft, ci.uvBottomRight, s), Vector2.Lerp(ci.uvTopLeft, ci.uvTopRight, s), t);
                    float a = atlas.GetPixelBilinear(uv.x, uv.y).a;
                    if (a <= 0) continue;
                    int i = (h - 1 - y) * w + x;
                    px[i] = Color32.Lerp(px[i], ink, a);
                }
            }
        }

        /// <summary>A finished picture: sRGB, mipmapped, clamped.</summary>
        public static Texture2D Picture(Color32[] px, int w, int h)
        {
            var t = new Texture2D(w, h, TextureFormat.RGBA32, true, false) { anisoLevel = 4, wrapMode = TextureWrapMode.Clamp };
            t.SetPixels32(px);
            t.Apply(true, true);
            return t;
        }
    }

    /// <summary>A part of a station your hands can work on ("wick:2", "knob:0", "soil").</summary>
    public class HandPart : MonoBehaviour
    {
        public string Name;
    }
}
