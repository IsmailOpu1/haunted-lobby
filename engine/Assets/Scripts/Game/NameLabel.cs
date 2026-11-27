using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;

namespace Haunted.Game
{
    /// <summary>
    /// Step E5: a name over a player's head as remotePlayers.ts drawLabel paints it on a canvas:
    /// Manrope SemiBold at 44 px in #f2ead8, centred on its middle in a picture the text's width
    /// plus 44 px wide and 71 px high, over a black shadow (0.9) blurred by 8.8 px, shown 0.22 m
    /// high. The text is laid out as Chrome shapes it, from Resources/Data/label-shaping.json
    /// (tools/engine-label-shaping.py): the font's own fractional advances, its kerning pairs, and
    /// its ligatures' widths (Unity's font API cannot draw a ligature's glyph, so its letters are
    /// spread over that width). The letters are drawn from the font's glyphs into a render texture
    /// and read back; the shadow is the canvas's Gaussian blur of them.
    /// </summary>
    public static class NameLabel
    {
        public const int FontPx = 44;
        public const float HeightM = 0.22f;
        /// <summary>canvas.height = ceil(44 × 1.6).</summary>
        static readonly int PictureH = Mathf.CeilToInt(FontPx * 1.6f);
        /// <summary>ctx.shadowBlur = 44 / 5; a canvas shadow blurs with a Gaussian of σ half of that.</summary>
        const float ShadowBlurPx = FontPx / 5f;
        const float ShadowAlpha = 0.9f;
        static readonly Color32 TextColour = new Color32(0xf2, 0xea, 0xd8, 255);
        /// <summary>
        /// textBaseline "middle" is the middle of the em box: Manrope's ascent 2132 and descent 600
        /// scaled to fill one em, so the baseline is (ascent − descent) / 2 of that below the middle
        /// (12.3 px at 44 px; measured against Chrome's canvas within half a pixel).
        /// </summary>
        const float BaselineBelowMiddleEm = (2132 - 600) / 2f / (2132 + 600);

        static Font font;
        static Font Font => font != null ? font : font = Resources.Load<Font>("Fonts/Manrope-SemiBold");

        static float unitsPerEm;
        static Dictionary<string, object> advances, kerning;
        static List<KeyValuePair<string, double>> ligatures;

        static void LoadShaping()
        {
            if (advances != null) return;
            var data = Sim.Json.Parse(Resources.Load<TextAsset>("Data/label-shaping").text);
            unitsPerEm = (float)Sim.Json.Num(data, "unitsPerEm");
            advances = Sim.Json.Obj(data, "advances");
            kerning = Sim.Json.Obj(data, "kerning");
            ligatures = new List<KeyValuePair<string, double>>();
            foreach (var l in Sim.Json.Arr(data, "ligatures")) ligatures.Add(new KeyValuePair<string, double>(Sim.Json.Text(l, "chars"), Sim.Json.Num(l, "advance")));
        }

        /// <summary>One glyph as shaped: its letters (several for a ligature), where its pen starts and its advance, in pixels.</summary>
        struct Piece { public string Letters; public float X, Advance; }

        /// <summary>The text shaped as ctx.fillText does it: ligatures (longest first), advances and kerning.</summary>
        static List<Piece> Shape(string text, out float width)
        {
            LoadShaping();
            float scale = FontPx / unitsPerEm;
            var pieces = new List<Piece>();
            float x = 0;
            for (int i = 0; i < text.Length;)
            {
                string letters = null;
                double units = 0;
                foreach (var l in ligatures)
                    if (i + l.Key.Length <= text.Length && string.CompareOrdinal(text, i, l.Key, 0, l.Key.Length) == 0) { letters = l.Key; units = l.Value; break; }
                if (letters == null)
                {
                    letters = text.Substring(i, 1);
                    object a;
                    if (advances.TryGetValue(letters, out a)) units = Convert.ToDouble(a);
                    else
                    {
                        // A character outside the table: the font's own (whole-pixel) advance.
                        CharacterInfo ci;
                        units = Font.GetCharacterInfo(letters[0], out ci, FontPx, FontStyle.Normal) ? ci.advance / scale : 0;
                    }
                }
                if (pieces.Count > 0)
                {
                    object k;
                    if (kerning.TryGetValue(pieces[pieces.Count - 1].Letters + "\t" + letters, out k)) x += (float)(Convert.ToDouble(k) * scale);
                }
                pieces.Add(new Piece { Letters = letters, X = x, Advance = (float)(units * scale) });
                x += (float)(units * scale);
                i += letters.Length;
            }
            width = x;
            return pieces;
        }

        /// <summary>The label's picture (sRGB colour, straight alpha) and its width in metres.</summary>
        public static Texture2D Bake(string text, out float widthM, bool keepReadable = false)
        {
            var f = Font;
            f.RequestCharactersInTexture(text, FontPx, FontStyle.Normal);
            float advance;
            var pieces = Shape(text, out advance);
            // ctx.measureText(text).width, rounded up, plus the font size; textAlign centre.
            int w = Mathf.CeilToInt(advance) + FontPx, h = PictureH;
            float[] mask = Letters(f, pieces, w, h, w / 2f - advance / 2f, h / 2f + BaselineBelowMiddleEm * FontPx);
            float[] shadow = Blur(mask, w, h, ShadowBlurPx / 2);

            var px = new Color32[w * h];
            for (int i = 0; i < px.Length; i++)
            {
                // The letters over their shadow (source-over); the shadow is black.
                float at = mask[i], ash = ShadowAlpha * shadow[i] * (1 - at);
                float a = at + ash;
                float k = a > 0 ? at / a : 0;
                px[i] = new Color32((byte)Mathf.RoundToInt(TextColour.r * k), (byte)Mathf.RoundToInt(TextColour.g * k), (byte)Mathf.RoundToInt(TextColour.b * k), (byte)Mathf.RoundToInt(a * 255));
            }
            // three.js mipmaps a canvas texture and samples it as sRGB.
            var tex = new Texture2D(w, h, TextureFormat.RGBA32, true, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Trilinear, name = "Name " + text };
            tex.SetPixels32(px);
            tex.Apply(true, !keepReadable);
            widthM = HeightM * w / h;
            return tex;
        }

        /// <summary>
        /// The letters' coverage, rows bottom-up as a texture's: each glyph's quad drawn from the font's
        /// atlas into a render texture, the text starting at x0, baseline y pixels down from the top.
        /// </summary>
        static float[] Letters(Font f, List<Piece> pieces, int w, int h, float x0, float baselineFromTop)
        {
            var verts = new List<Vector3>();
            var uvs = new List<Vector2>();
            var tris = new List<int>();
            float baseY = h - baselineFromTop;
            foreach (var piece in pieces)
            {
                // A ligature's letters, spread over its width in proportion to their own advances.
                float own = 0;
                foreach (char c in piece.Letters) own += LetterAdvance(f, c);
                float spread = own > 0 ? piece.Advance / own : 1, x = x0 + piece.X;
                foreach (char c in piece.Letters)
                {
                    CharacterInfo ci;
                    // Each glyph on whole pixels, as Chrome draws a canvas's text (the pen itself keeps its fractions).
                    if (f.GetCharacterInfo(c, out ci, FontPx, FontStyle.Normal)) AddGlyph(ci, Mathf.Round(x), Mathf.Round(baseY), verts, uvs, tris);
                    x += LetterAdvance(f, c) * spread;
                }
            }
            return Draw(f, verts, uvs, tris, w, h);
        }

        /// <summary>A letter's own advance in pixels (the table's, or the font's whole-pixel one).</summary>
        static float LetterAdvance(Font f, char c)
        {
            object a;
            if (advances.TryGetValue(c.ToString(), out a)) return (float)(Convert.ToDouble(a) * FontPx / unitsPerEm);
            CharacterInfo ci;
            return f.GetCharacterInfo(c, out ci, FontPx, FontStyle.Normal) ? ci.advance : 0;
        }

        static void AddGlyph(CharacterInfo ci, float x, float baseY, List<Vector3> verts, List<Vector2> uvs, List<int> tris)
        {
            int at = verts.Count;
            verts.Add(new Vector3(x + ci.minX, baseY + ci.minY));
            verts.Add(new Vector3(x + ci.minX, baseY + ci.maxY));
            verts.Add(new Vector3(x + ci.maxX, baseY + ci.maxY));
            verts.Add(new Vector3(x + ci.maxX, baseY + ci.minY));
            uvs.Add(ci.uvBottomLeft);
            uvs.Add(ci.uvTopLeft);
            uvs.Add(ci.uvTopRight);
            uvs.Add(ci.uvBottomRight);
            tris.AddRange(new[] { at, at + 1, at + 2, at, at + 2, at + 3 });
        }

        static float[] Draw(Font f, List<Vector3> verts, List<Vector2> uvs, List<int> tris, int w, int h)
        {
            var mesh = new Mesh();
            mesh.SetVertices(verts);
            mesh.SetUVs(0, uvs);
            mesh.SetColors(Enumerable(Color.white, verts.Count));
            mesh.SetTriangles(tris, 0);

            var rt = RenderTexture.GetTemporary(w, h, 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear);
            var cb = new CommandBuffer { name = "Name label" };
            cb.SetRenderTarget(rt);
            cb.ClearRenderTarget(false, true, Color.clear);
            cb.SetViewProjectionMatrices(Matrix4x4.identity, GL.GetGPUProjectionMatrix(Matrix4x4.Ortho(0, w, 0, h, -1, 1), false));
            cb.DrawMesh(mesh, Matrix4x4.identity, f.material);
            Graphics.ExecuteCommandBuffer(cb);
            cb.Release();

            var was = RenderTexture.active;
            RenderTexture.active = rt;
            var read = new Texture2D(w, h, TextureFormat.RGBA32, false, true);
            read.ReadPixels(new Rect(0, 0, w, h), 0, 0);
            RenderTexture.active = was;
            RenderTexture.ReleaseTemporary(rt);
            UnityEngine.Object.Destroy(mesh);

            // The font shader writes white × its alpha over clear: red is the coverage (alpha would be squared).
            var got = read.GetPixels32();
            UnityEngine.Object.Destroy(read);
            var mask = new float[w * h];
            for (int i = 0; i < mask.Length; i++) mask[i] = got[i].r / 255f;
            return mask;
        }

        static List<Color> Enumerable(Color c, int n)
        {
            var list = new List<Color>(n);
            for (int i = 0; i < n; i++) list.Add(c);
            return list;
        }

        /// <summary>A Gaussian blur of σ pixels, clear beyond the picture's edges.</summary>
        static float[] Blur(float[] src, int w, int h, float sigma)
        {
            int r = Mathf.CeilToInt(sigma * 3);
            var k = new float[2 * r + 1];
            float sum = 0;
            for (int i = -r; i <= r; i++) sum += k[i + r] = Mathf.Exp(-i * i / (2 * sigma * sigma));
            for (int i = 0; i < k.Length; i++) k[i] /= sum;
            var tmp = new float[w * h];
            var dst = new float[w * h];
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float v = 0;
                    for (int i = -r; i <= r; i++) { int xx = x + i; if (xx >= 0 && xx < w) v += src[y * w + xx] * k[i + r]; }
                    tmp[y * w + x] = v;
                }
            for (int y = 0; y < h; y++)
                for (int x = 0; x < w; x++)
                {
                    float v = 0;
                    for (int i = -r; i <= r; i++) { int yy = y + i; if (yy >= 0 && yy < h) v += tmp[yy * w + x] * k[i + r]; }
                    dst[y * w + x] = v;
                }
            return dst;
        }

        static Mesh quad;
        /// <summary>A 1 × 1 quad centred on its origin, facing −z (toward a camera it is turned to).</summary>
        public static Mesh Quad
        {
            get
            {
                if (quad != null) return quad;
                quad = new Mesh { name = "Name label" };
                quad.SetVertices(new List<Vector3> { new Vector3(-0.5f, -0.5f), new Vector3(-0.5f, 0.5f), new Vector3(0.5f, 0.5f), new Vector3(0.5f, -0.5f) });
                quad.SetUVs(0, new List<Vector2> { new Vector2(0, 0), new Vector2(0, 1), new Vector2(1, 1), new Vector2(1, 0) });
                quad.SetColors(Enumerable(Color.white, 4));
                quad.SetTriangles(new[] { 0, 1, 2, 0, 2, 3 }, 0);
                quad.RecalculateBounds();
                return quad;
            }
        }
    }
}
