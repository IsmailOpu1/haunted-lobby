using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;

namespace Haunted.Game
{
    /// <summary>
    /// Step E5: the floor plan on the Tab panel (client/src/floorplan.ts; GDD 6 "Map and status",
    /// 26.10): every floor side by side, lowest on the left, rooms in their colours with names, the
    /// rooms of your unfinished tasks outlined, and you as an arrow. It never shows other players, the
    /// ghost or relics. Laid out in meters as the browser's SVG is and drawn at style.css's
    /// #floor-plan svg width, min(860px, 100vw - 68px): the shapes with Painter2D, the names as labels
    /// (the room names' dark edge is a second label under each, as SVG's paint-order: stroke, both in
    /// a distance-field Manrope so the edge can be drawn).
    /// </summary>
    public class FloorPlan
    {
        // floorplan.ts: the plan's own layout, in meters.
        const float GapM = 4, TitleM = 3, LabelMinM = 4;
        // style.css #floor-plan svg and .plan-*: looks only, so not game numbers.
        const float MaxWidthPx = 860, ViewportMarginPx = 68, BelowPx = 12;
        const float RoomOpacity = 0.75f, TaskStrokeM = 0.6f, StairStrokeM = 0.15f, StairDashM = 0.5f, WallM = 0.3f;
        const float LabelFontM = 1.25f, LabelStrokeM = 0.4f, FloorFontM = 2, YouStrokeM = 0.25f, MiterLimit = 4;
        static readonly Color NoColor = Hex("#555555"), TaskStroke = Hex("#e0b84a"), StairFill = Hex("#1c1c1c"), StairStroke = Hex("#9a9a9a");
        static readonly Color WallColor = Hex("#d8d4cc"), LabelColor = Hex("#f0ece4"), LabelEdge = new Color(0, 0, 0, 0.6f), FloorColor = Hex("#8d887c");
        /// <summary>You: drawn facing north (-z), then turned.</summary>
        static readonly Vector2[] Arrow = { new Vector2(0, -1.6f), new Vector2(1.1f, 1.2f), new Vector2(0, 0.5f), new Vector2(-1.1f, 1.2f) };
        /// <summary>
        /// Where a label's text sits: a UI Toolkit label centres its line (Manrope's ascender 2132 and
        /// descender 600 of 2000), so its middle is 0.383 em above the baseline. SVG's
        /// dominant-baseline: middle puts the baseline half the x-height (1080 / 2000) below the point.
        /// </summary>
        const float LineMiddleEm = (2132 - 600) / 2f / 2000, XMiddleEm = 1080 / 2f / 2000;

        class RoomShape { public string Name; public Rect R; public Color Fill; }
        class Text { public Label Front, Back; public Vector2 At; public float SizeM; public bool Middle; }

        /// <summary>The plan, as the browser's #floor-plan svg (its 12 px margin below included).</summary>
        public readonly VisualElement Element;
        readonly VisualElement shapes, you;
        readonly float viewW, viewH;
        readonly Sim.WorldData map;
        readonly List<RoomShape> rooms = new List<RoomShape>();
        readonly List<Rect> stairs = new List<Rect>();
        readonly List<Vector4> walls = new List<Vector4>();
        readonly List<Text> texts = new List<Text>();
        readonly Dictionary<string, Label> titles = new Dictionary<string, Label>();
        /// <summary>Where each floor's drawing starts: plan x = sim x + offset.x.</summary>
        readonly Dictionary<string, Vector2> offsets = new Dictionary<string, Vector2>();
        readonly HashSet<string> taskRooms = new HashSet<string>();
        float scale = -1;
        string youLevel = "";
        Vector2 youAt;
        float youDeg;

        public FloorPlan(Sim.WorldData map, List<double[]> wallLines)
        {
            this.map = map;
            Element = new VisualElement { name = "floor-plan", pickingMode = PickingMode.Ignore };
            Element.style.marginBottom = BelowPx;
            Element.style.flexShrink = 0;
            shapes = new VisualElement { pickingMode = PickingMode.Ignore };
            shapes.style.position = Position.Absolute;
            shapes.style.left = shapes.style.top = shapes.style.right = shapes.style.bottom = 0;
            shapes.generateVisualContent += DrawShapes;
            Element.Add(shapes);

            // Lowest floor on the left, highest on the right.
            var levels = map.Levels.OrderBy(l => l.Y).ToList();
            if (levels.Count == 0) levels.Add(Sim.Levels.LevelOf(map, 0, 0));
            var onLevel = new Dictionary<Sim.LevelDef, List<Sim.RoomDef>>();
            var bounds = new Dictionary<Sim.LevelDef, Rect>();
            foreach (var level in levels)
            {
                var list = map.Rooms.Where(r => Sim.Levels.LevelOf(map, (r.MinX + r.MaxX) / 2, (r.MinZ + r.MaxZ) / 2) == level).ToList();
                onLevel[level] = list;
                if (list.Count == 0) { bounds[level] = Rect.zero; continue; }
                float minX = (float)list.Min(r => r.MinX), maxX = (float)list.Max(r => r.MaxX), minZ = (float)list.Min(r => r.MinZ), maxZ = (float)list.Max(r => r.MaxZ);
                bounds[level] = Rect.MinMaxRect(minX, minZ, maxX, maxZ);
            }
            float height = bounds.Values.Max(b => b.height);
            float left = GapM;
            foreach (var level in levels)
            {
                var b = bounds[level];
                offsets[level.Id] = new Vector2(left - b.xMin, GapM + TitleM - b.yMin);
                left += b.width + GapM;
            }
            viewW = left;
            viewH = height + 2 * GapM + TitleM;

            foreach (var level in levels)
            {
                var b = bounds[level];
                var o = offsets[level.Id];
                var title = AddText(level.Name, new Vector2(b.center.x, b.yMin - 1) + o, FloorFontM, false, FloorColor, false);
                titles[level.Id] = title.Front;

                foreach (var r in onLevel[level])
                {
                    string hex;
                    map.RoomColors.TryGetValue(r.Name, out hex);
                    rooms.Add(new RoomShape { Name = r.Name, R = Rect.MinMaxRect((float)r.MinX + o.x, (float)r.MinZ + o.y, (float)r.MaxX + o.x, (float)r.MaxZ + o.y), Fill = hex != null ? Hex(hex) : NoColor });
                }
                foreach (var s in map.Stairs)
                {
                    var lower = map.Levels.Find(l => l.Id == s.Lower);
                    var upper = map.Levels.Find(l => l.Id == s.Upper);
                    // On the upper floor, the same flight sits in that floor's area of the plane.
                    float? shift = level == lower ? 0f : level == upper ? (float)(lower.ShiftX - upper.ShiftX) : (float?)null;
                    if (shift == null) continue;
                    var f = StairRect(s);
                    stairs.Add(new Rect(f.x + shift.Value + o.x, f.y + o.y, f.width, f.height));
                }
                foreach (var w in wallLines)
                {
                    if (Sim.Levels.LevelOf(map, (w[0] + w[2]) / 2, (w[1] + w[3]) / 2) != level) continue;
                    walls.Add(new Vector4((float)w[0] + o.x, (float)w[1] + o.y, (float)w[2] + o.x, (float)w[3] + o.y));
                }
                // Each room's name once, on its biggest rectangle.
                foreach (var name in onLevel[level].Select(r => r.Name).Distinct())
                {
                    var biggest = onLevel[level].Where(r => r.Name == name).OrderByDescending(r => (r.MaxX - r.MinX) * (r.MaxZ - r.MinZ)).First();
                    if (Math.Min(biggest.MaxX - biggest.MinX, biggest.MaxZ - biggest.MinZ) < LabelMinM) continue;
                    AddText(name, new Vector2((float)(biggest.MinX + biggest.MaxX) / 2, (float)(biggest.MinZ + biggest.MaxZ) / 2) + o, LabelFontM, true, LabelColor, true);
                }
            }

            you = new VisualElement { pickingMode = PickingMode.Ignore };
            you.style.position = Position.Absolute;
            you.style.left = you.style.top = you.style.right = you.style.bottom = 0;
            you.generateVisualContent += DrawYou;
            Element.Add(you);
        }

        /// <summary>The plan at style.css's width for a screen this wide (in the panel's pixels).</summary>
        public void Fit(float screenWidth)
        {
            float w = Mathf.Max(1, Mathf.Min(MaxWidthPx, screenWidth - ViewportMarginPx));
            if (Mathf.Approximately(w, scale * viewW)) return;
            scale = w / viewW;
            Element.style.width = w;
            Element.style.height = viewH * scale;
            foreach (var t in texts) Place(t);
            shapes.MarkDirtyRepaint();
            you.MarkDirtyRepaint();
        }

        /// <summary>floorplan.ts setTaskRooms: outlines the rooms that hold your unfinished tasks.</summary>
        public void SetTaskRooms(IEnumerable<string> names)
        {
            var want = new HashSet<string>(names);
            if (want.SetEquals(taskRooms)) return;
            taskRooms.Clear();
            taskRooms.UnionWith(want);
            shapes.MarkDirtyRepaint();
        }

        /// <summary>floorplan.ts setYou: your arrow, at your simulation position and facing (yaw 0 looks north, toward -z).</summary>
        public void SetYou(double x, double z, double yaw)
        {
            var level = Sim.Levels.LevelOf(map, x, z);
            Vector2 o;
            if (!offsets.TryGetValue(level.Id, out o)) return;
            var at = new Vector2((float)x + o.x, (float)z + o.y);
            float deg = (float)(-yaw * 180 / Math.PI);
            if (at != youAt || deg != youDeg)
            {
                youAt = at;
                youDeg = deg;
                you.MarkDirtyRepaint();
            }
            if (youLevel != level.Id)
            {
                foreach (var kv in titles)
                {
                    bool here = kv.Key == level.Id;
                    kv.Value.EnableInClassList("sans-700", here);
                    kv.Value.style.color = here ? LabelColor : FloorColor;
                }
                youLevel = level.Id;
            }
        }

        /// <summary>
        /// The room names' font: Manrope as a signed-distance font with half an em of padding, so an
        /// outline as wide as SVG's stroke fits round each letter (the panel's own font has too little
        /// room for one and draws none).
        /// </summary>
        static UnityEngine.TextCore.Text.FontAsset edgedFont;
        /// <summary>
        /// Matched by eye against Chrome's plan at 1280 x 720 (a few pixels per meter): UI Toolkit's
        /// outline sits half inside the letters, so the edge needs 1.5 times SVG's stroke width to show
        /// as much of it outside them; and the distance font draws letters thinner than Chrome's, so
        /// they get a 0.07 m outline in their own colour.
        /// </summary>
        const float EdgeWidthTimes = 1.5f, LetterWeightM = 0.07f;

        Text AddText(string words, Vector2 at, float sizeM, bool middle, Color colour, bool edged)
        {
            var t = new Text { At = at, SizeM = sizeM, Middle = middle };
            if (edged)
            {
                // paint-order: stroke: the dark edge under the letters, half of it outside them.
                t.Back = NewLabel(words, LabelEdge);
                t.Back.style.unityTextOutlineColor = LabelEdge;
            }
            t.Front = NewLabel(words, colour);
            if (edged)
            {
                if (edgedFont == null) edgedFont = UnityEngine.TextCore.Text.FontAsset.CreateFontAsset(Resources.Load<Font>("Fonts/Manrope-Regular"), 64, 32, UnityEngine.TextCore.LowLevel.GlyphRenderMode.SDFAA, 1024, 1024);
                foreach (var l in new[] { t.Back, t.Front }) l.style.unityFontDefinition = new StyleFontDefinition(FontDefinition.FromSDFFont(edgedFont));
                t.Front.style.unityTextOutlineColor = colour;
            }
            texts.Add(t);
            return t;
        }

        Label NewLabel(string words, Color colour)
        {
            var l = new Label(words) { pickingMode = PickingMode.Ignore };
            l.style.position = Position.Absolute;
            l.style.color = colour;
            l.style.paddingLeft = l.style.paddingRight = l.style.paddingTop = l.style.paddingBottom = 0;
            l.style.marginLeft = l.style.marginRight = l.style.marginTop = l.style.marginBottom = 0;
            l.style.unityTextAlign = TextAnchor.MiddleCenter;
            l.style.whiteSpace = WhiteSpace.NoWrap;
            l.style.overflow = Overflow.Visible;
            Element.Add(l);
            return l;
        }

        /// <summary>A text centred on its point (text-anchor: middle), its baseline as SVG puts it.</summary>
        void Place(Text t)
        {
            float px = t.SizeM * scale;
            // The baseline: the point itself, or half the x-height below it (dominant-baseline: middle).
            float baseline = t.At.y * scale + (t.Middle ? XMiddleEm * px : 0);
            float boxW = 40 * px, boxH = 3 * px;
            foreach (var l in new[] { t.Back, t.Front })
            {
                if (l == null) continue;
                l.style.fontSize = px;
                l.style.width = boxW;
                l.style.height = boxH;
                l.style.left = t.At.x * scale - boxW / 2;
                l.style.top = baseline - LineMiddleEm * px - boxH / 2;
            }
            if (t.Back != null)
            {
                t.Back.style.unityTextOutlineWidth = LabelStrokeM * scale * EdgeWidthTimes;
                t.Front.style.unityTextOutlineWidth = LetterWeightM * scale;
            }
        }

        void DrawShapes(MeshGenerationContext ctx)
        {
            if (scale <= 0) return;
            var p = ctx.painter2D;
            p.lineJoin = LineJoin.Miter;
            p.miterLimit = MiterLimit;
            foreach (var r in rooms)
            {
                bool task = taskRooms.Contains(r.Name);
                var fill = r.Fill;
                fill.a *= task ? 1 : RoomOpacity;
                Box(p, r.R);
                p.fillColor = fill;
                p.Fill();
                if (!task) continue;
                Box(p, r.R);
                p.strokeColor = TaskStroke;
                p.lineWidth = TaskStrokeM * scale;
                p.lineCap = LineCap.Butt;
                p.Stroke();
            }
            foreach (var s in stairs)
            {
                Box(p, s);
                p.fillColor = StairFill;
                p.Fill();
                Dashes(p, s);
            }
            // stroke-linecap: square: each wall half its width longer at both ends.
            p.strokeColor = WallColor;
            p.lineWidth = WallM * scale;
            p.lineCap = LineCap.Butt;
            foreach (var w in walls)
            {
                var a = new Vector2(w.x, w.y);
                var b = new Vector2(w.z, w.w);
                var d = (b - a).normalized * (WallM / 2);
                p.BeginPath();
                p.MoveTo((a - d) * scale);
                p.LineTo((b + d) * scale);
                p.Stroke();
            }
        }

        /// <summary>stroke-dasharray 0.5 0.5 round a rectangle, from its top-left corner clockwise as SVG walks it.</summary>
        void Dashes(Painter2D p, Rect r)
        {
            p.strokeColor = StairStroke;
            p.lineWidth = StairStrokeM * scale;
            p.lineCap = LineCap.Butt;
            var corners = new[] { new Vector2(r.xMin, r.yMin), new Vector2(r.xMax, r.yMin), new Vector2(r.xMax, r.yMax), new Vector2(r.xMin, r.yMax), new Vector2(r.xMin, r.yMin) };
            float along = 0;
            bool open = false;
            p.BeginPath();
            for (int i = 0; i < 4; i++)
            {
                Vector2 a = corners[i], b = corners[i + 1];
                float length = (b - a).magnitude, done = 0;
                while (done < length)
                {
                    float phase = along % (2 * StairDashM);
                    bool on = phase < StairDashM;
                    float step = Mathf.Min(length - done, (on ? StairDashM : 2 * StairDashM) - phase);
                    var from = Vector2.Lerp(a, b, done / length);
                    var to = Vector2.Lerp(a, b, (done + step) / length);
                    if (on)
                    {
                        // A dash round a corner stays one line, joined as SVG joins it.
                        if (!open) p.MoveTo(from * scale);
                        p.LineTo(to * scale);
                        open = true;
                    }
                    else open = false;
                    done += step;
                    along += step;
                }
            }
            p.Stroke();
        }

        void DrawYou(MeshGenerationContext ctx)
        {
            if (scale <= 0) return;
            var p = ctx.painter2D;
            float rad = youDeg * Mathf.Deg2Rad, c = Mathf.Cos(rad), s = Mathf.Sin(rad);
            p.BeginPath();
            for (int i = 0; i < Arrow.Length; i++)
            {
                var v = Arrow[i];
                var at = (youAt + new Vector2(v.x * c - v.y * s, v.x * s + v.y * c)) * scale;
                if (i == 0) p.MoveTo(at); else p.LineTo(at);
            }
            p.ClosePath();
            p.fillColor = Color.white;
            p.Fill();
            p.strokeColor = Color.black;
            p.lineWidth = YouStrokeM * scale;
            p.lineJoin = LineJoin.Miter;
            p.miterLimit = MiterLimit;
            p.Stroke();
        }

        void Box(Painter2D p, Rect r)
        {
            p.BeginPath();
            p.MoveTo(new Vector2(r.xMin, r.yMin) * scale);
            p.LineTo(new Vector2(r.xMax, r.yMin) * scale);
            p.LineTo(new Vector2(r.xMax, r.yMax) * scale);
            p.LineTo(new Vector2(r.xMin, r.yMax) * scale);
            p.ClosePath();
        }

        /// <summary>floorplan.ts stairRect: a flight's footprint in the lower floor's coordinates.</summary>
        static Rect StairRect(Sim.StairDef s)
        {
            float ux = s.Dir == "+x" ? 1 : s.Dir == "-x" ? -1 : 0, uz = s.Dir == "+z" ? 1 : s.Dir == "-z" ? -1 : 0;
            float x = (float)s.X, z = (float)s.Z, endX = x + ux * (float)s.LengthM, endZ = z + uz * (float)s.LengthM, w = (float)s.WidthM / 2;
            return Rect.MinMaxRect(Mathf.Min(x, endX) - (ux == 0 ? w : 0), Mathf.Min(z, endZ) - (uz == 0 ? w : 0), Mathf.Max(x, endX) + (ux == 0 ? w : 0), Mathf.Max(z, endZ) + (uz == 0 ? w : 0));
        }

        static Color Hex(string hex)
        {
            Color c;
            return ColorUtility.TryParseHtmlString(hex, out c) ? c : Color.magenta;
        }
    }
}
