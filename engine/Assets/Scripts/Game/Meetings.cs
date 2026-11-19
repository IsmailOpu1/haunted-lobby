using System;
using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The meeting (GDD 16, client/src/main.ts setMeeting): who called it, the step and its time,
    /// the new photos, the Ouija board for the dead (GDD 17), the players with their Voted stamps
    /// and Vote buttons, Skip, and the result. Drawn plainly in a run without menus; ShowUi puts it in the menus' panel (MeetingView.cs).
    /// </summary>
    public class MeetingScreen
    {
        public const string Skip = "skip", OuijaUnknown = "unknown";
        static readonly Dictionary<string, string> StepText = new Dictionary<string, string>
        {
            { "evidence", "Evidence: look at the new photos." },
            { "discussion", "Discussion: talk it over." },
            { "vote", "Vote: pick a player, or skip." },
            { "result", "The vote is in." },
        };

        readonly Night night;
        readonly object config;
        readonly Action<string, object> send;
        bool ouijaPushed;
        string shownMeeting = "";
        GUIStyle head, text, small, button;
        Vector2 scroll;

        public MeetingScreen(Night night, object config, Action<string, object> send)
        {
            this.night = night;
            this.config = config;
            this.send = send;
        }

        /// <summary>A meeting began: the Ouija pushes and the result start over.</summary>
        public void Begin()
        {
            ouijaPushed = false;
            night.NewMeeting();
        }

        /// <summary>
        /// Step E5: the meeting in the menus' panel (main.ts setMeeting); on is false when it is not
        /// shown (no meeting, the room page up, the night over).
        /// </summary>
        public void ShowUi(bool on, GameState s, string myId, Menus ui)
        {
            if (!on) { ui.SetMeeting(null, null, null, false, false, null, false, null, "", null); return; }
            Player me;
            s.players.TryGetValue(myId, out me);
            string step = s.meeting;
            bool canVote = step == "vote" && me != null && me.health != "dead" && !me.voted;
            bool anyDead = false;
            var seats = new List<Menus.MeetingSeat>();
            foreach (var kv in s.players)
            {
                bool dead = kv.Value.health == "dead";
                if (dead) anyDead = true;
                seats.Add(new Menus.MeetingSeat { Id = kv.Key, Name = kv.Value.name, Dead = dead, Me = kv.Key == myId, Voted = kv.Value.voted });
            }
            bool ouija = step == "evidence" && (bool)Sim.Json.Obj(config, "wisps")["ouija"] && anyDead;
            bool canOuija = ouija && me != null && me.health == "dead" && !ouijaPushed;
            ui.MeetingVote = target => send("vote", new Dictionary<string, object> { { "target", target } });
            ui.MeetingOuija = target =>
            {
                if (ouijaPushed) return;
                ouijaPushed = true;
                send("ouija", new Dictionary<string, object> { { "target", target } });
            };
            string stepText;
            StepText.TryGetValue(step, out stepText);
            string title = !string.IsNullOrEmpty(s.meetingBody) ? s.meetingCaller + " reported " + s.meetingBody + "'s body" : s.meetingCaller + " rang the bell";
            // HTML folds main.ts's two spaces into one.
            ui.SetMeeting(title, (stepText ?? "") + " " + Math.Ceiling(s.meetingLeft) + " s", night.NewPhotos, ouija, canOuija, seats, canVote,
                night.OuijaTarget, night.OuijaLog, step == "result" ? night.Result : null);
        }

        public void Draw(GameState s, string myId)
        {
            if (head == null)
            {
                head = new GUIStyle(GUI.skin.label) { fontSize = 28, fontStyle = FontStyle.Bold, alignment = TextAnchor.MiddleCenter, wordWrap = true };
                text = new GUIStyle(GUI.skin.label) { fontSize = 18, wordWrap = true };
                small = new GUIStyle(text) { fontSize = 14, alignment = TextAnchor.UpperCenter };
                button = new GUIStyle(GUI.skin.button) { fontSize = 16 };
            }
            string key = s.meetingCaller + "|" + s.meetingBody;
            if (key != shownMeeting) { shownMeeting = key; scroll = Vector2.zero; }
            Player me;
            s.players.TryGetValue(myId, out me);
            string step = s.meeting;
            bool canVote = step == "vote" && me != null && me.health != "dead" && !me.voted;
            bool anyDead = false;
            foreach (var kv in s.players) if (kv.Value.health == "dead") anyDead = true;
            bool ouijaOn = (bool)Sim.Json.Obj(config, "wisps")["ouija"];
            bool ouija = step == "evidence" && ouijaOn && anyDead;
            bool canOuija = ouija && me != null && me.health == "dead" && !ouijaPushed;

            Hud.Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(0, 0, 0, 0.82f));
            float w = Mathf.Min(980, Screen.width - 40);
            var area = new Rect((Screen.width - w) / 2, 30, w, Screen.height - 60);
            GUILayout.BeginArea(area);
            scroll = GUILayout.BeginScrollView(scroll);
            GUILayout.Label(!string.IsNullOrEmpty(s.meetingBody) ? s.meetingCaller + " reported " + s.meetingBody + "'s body" : s.meetingCaller + " rang the bell", head);
            string stepText;
            StepText.TryGetValue(step, out stepText);
            GUILayout.Label((stepText ?? "") + "  " + Math.Ceiling(s.meetingLeft) + " s", new GUIStyle(text) { alignment = TextAnchor.MiddleCenter });
            GUILayout.Space(10);

            // The photos that developed as this meeting began.
            if (night.NewPhotos.Count > 0)
            {
                GUILayout.BeginHorizontal();
                GUILayout.FlexibleSpace();
                foreach (var photo in night.NewPhotos) PhotoPrint.DrawCard(photo, small);
                GUILayout.FlexibleSpace();
                GUILayout.EndHorizontal();
                GUILayout.Space(10);
            }

            // The Ouija board: one slot per living player and "I don't know"; a Wisp clicks one (GDD 17).
            if (ouija)
            {
                GUILayout.Label("The Ouija board", new GUIStyle(text) { alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold });
                GUILayout.BeginHorizontal();
                GUILayout.FlexibleSpace();
                var slots = new List<KeyValuePair<string, string>>();
                foreach (var kv in s.players) if (kv.Value.health != "dead") slots.Add(new KeyValuePair<string, string>(kv.Key, kv.Value.name));
                slots.Add(new KeyValuePair<string, string>(OuijaUnknown, "I don't know"));
                foreach (var slot in slots)
                {
                    // The planchette rests on the name it was pushed to.
                    bool here = night.OuijaTarget != null && night.OuijaTarget == (slot.Key == OuijaUnknown ? "" : slot.Value);
                    GUI.enabled = canOuija;
                    var old = GUI.backgroundColor;
                    if (here) GUI.backgroundColor = new Color(0.95f, 0.8f, 0.4f);
                    if (GUILayout.Button((here ? "> " : "") + slot.Value, button, GUILayout.Height(36), GUILayout.MinWidth(120)))
                    {
                        ouijaPushed = true;
                        send("ouija", new Dictionary<string, object> { { "target", slot.Key } });
                    }
                    GUI.backgroundColor = old;
                    GUI.enabled = true;
                }
                GUILayout.FlexibleSpace();
                GUILayout.EndHorizontal();
                if (night.OuijaLog != "") GUILayout.Label(night.OuijaLog, small);
                GUILayout.Space(10);
            }

            // The players: the dead greyed out, who has voted, and your Vote buttons.
            foreach (var kv in s.players)
            {
                var p = kv.Value;
                GUILayout.BeginHorizontal();
                GUILayout.FlexibleSpace();
                var old = GUI.color;
                if (p.health == "dead") GUI.color = new Color(0.55f, 0.55f, 0.55f);
                GUILayout.Label(kv.Key == myId ? p.name + " (you)" : p.name, text, GUILayout.Width(260));
                GUILayout.Label(p.voted ? "Voted" : "", text, GUILayout.Width(80));
                GUI.color = old;
                if (canVote && p.health != "dead")
                {
                    if (GUILayout.Button("Vote", button, GUILayout.Width(90), GUILayout.Height(30))) send("vote", new Dictionary<string, object> { { "target", kv.Key } });
                }
                else GUILayout.Space(94);
                GUILayout.FlexibleSpace();
                GUILayout.EndHorizontal();
            }
            if (canVote)
            {
                GUILayout.BeginHorizontal();
                GUILayout.FlexibleSpace();
                if (GUILayout.Button("Skip vote", button, GUILayout.Width(160), GUILayout.Height(34))) send("vote", new Dictionary<string, object> { { "target", Skip } });
                GUILayout.FlexibleSpace();
                GUILayout.EndHorizontal();
            }

            var r = night.Result;
            if (r != null && step == "result")
            {
                GUILayout.Space(12);
                string verdict = r.Removed == null ? (r.Skip > 0 ? "Nobody was removed." : "Nobody was removed: a tie.")
                    : r.Role != null ? r.Removed.ToUpperInvariant() + " WAS " + (r.Role == "possessed" ? "" : "NOT ") + "POSSESSED."
                    : r.Removed + " is gone.";
                var old = GUI.color;
                if (r.Role == "possessed") GUI.color = new Color(0.9f, 0.25f, 0.2f);
                GUILayout.Label(verdict, head);
                GUI.color = old;
                var counts = new List<string>();
                foreach (var t in r.Tally) counts.Add(t.Key + " " + t.Value);
                counts.Add("Skip " + r.Skip);
                GUILayout.Label(string.Join("  ·  ", counts.ToArray()), new GUIStyle(text) { alignment = TextAnchor.MiddleCenter });
                foreach (var v in r.Votes) GUILayout.Label(v, small);
            }
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }
    }

    /// <summary>
    /// A developed Spirit Camera photo (client/src/photoView.ts): a dim sepia room with the
    /// figures that were in the frame, a demon face on the cursed possessed, the ghost as a pale
    /// shape, film grain and a vignette. Drawn into a texture once per photo.
    /// </summary>
    public static class PhotoPrint
    {
        const int W = 280, H = 180;
        const float Horizon = H * 0.6f, FigureH = 110, FullSizeM = 2.5f, MinScale = 0.3f, MaxScale = 1.3f;
        const int GrainDots = 900;
        static readonly Color Figure = new Color32(0x17, 0x12, 0x0d, 255);
        static readonly Color DemonEyes = new Color32(0xff, 0x2a, 0x1a, 255);
        static readonly Dictionary<Night.Photo, Texture2D> made = new Dictionary<Night.Photo, Texture2D>();

        /// <summary>The print with who took it when, laid out in a GUILayout row.</summary>
        public static void DrawCard(Night.Photo photo, GUIStyle caption)
        {
            GUILayout.BeginVertical(GUILayout.Width(W + 12));
            var rect = GUILayoutUtility.GetRect(W, H, GUILayout.Width(W), GUILayout.Height(H));
            GUI.DrawTexture(rect, Print(photo));
            // The names under each figure, as the browser writes them on the print.
            var label = new GUIStyle(caption) { fontSize = 11, alignment = TextAnchor.UpperCenter };
            label.normal.textColor = new Color32(0xd8, 0xcf, 0xbf, 255);
            foreach (var s in photo.Subjects)
            {
                float sc = Scale(s.Dist);
                float x = Mathf.Clamp((float)(s.FrameX + 1) / 2 * W, 24, W - 24);
                float feet = Horizon + 40 * sc;
                GUI.Label(new Rect(rect.x + x - 60, rect.y + Mathf.Min(H - 18, feet + 2), 120, 16), s.Name, label);
            }
            bool empty = photo.Subjects.Count == 0 && !photo.Ghost;
            GUILayout.Label(photo.By + "'s photo, " + ClockTime(photo.NightTime) + (empty ? " (nobody in it)" : ""), caption, GUILayout.Width(W));
            GUILayout.EndVertical();
        }

        /// <summary>The night's clock time for a night time in seconds (shared clockTime: the night runs from midnight).</summary>
        public static string ClockTime(double nightTime)
        {
            int m = (int)Math.Floor(nightTime / 60), sec = (int)Math.Floor(nightTime % 60);
            return m + ":" + sec.ToString("00");
        }

        static float Scale(double dist) { return Mathf.Clamp(FullSizeM / (float)Math.Max(0.01, dist), MinScale, MaxScale); }

        public static Texture2D Print(Night.Photo photo)
        {
            Texture2D tex;
            if (made.TryGetValue(photo, out tex)) return tex;
            var px = new Color[W * H];
            // A dim sepia room: a radial glow, the floor a little darker.
            var inner = new Color32(0x4a, 0x3b, 0x2a, 255);
            var outer = new Color32(0x0d, 0x0a, 0x07, 255);
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(W / 2f, H * 0.45f));
                    float t = Mathf.Clamp01((d - 10) / (W * 0.7f - 10));
                    var c = Color.Lerp(inner, outer, t);
                    if (y >= Horizon) c = Color.Lerp(c, Color.black, 0.25f);
                    px[Idx(x, y)] = c;
                }
            // Far ones first, so near ones stand in front.
            var figures = new List<KeyValuePair<double, Action>>();
            foreach (var s in photo.Subjects)
            {
                var sub = s;
                figures.Add(new KeyValuePair<double, Action>(s.Dist, () => Person(px, (float)(sub.FrameX + 1) / 2 * W, Horizon + 40 * Scale(sub.Dist), Scale(sub.Dist), sub.Demon)));
            }
            if (photo.Ghost) figures.Add(new KeyValuePair<double, Action>(photo.GhostDist, () => Ghost(px, (float)(photo.GhostX + 1) / 2 * W, Horizon + 40 * Scale(photo.GhostDist), Scale(photo.GhostDist))));
            figures.Sort((a, b) => b.Key.CompareTo(a.Key));
            foreach (var f in figures) f.Value();
            // Film grain, the same for the same photo.
            long seed = (long)Math.Floor(photo.NightTime * 1000) + photo.By.Length;
            Func<double> rand = () => (seed = (seed * 1103515245 + 12345) & 0x7fffffff) / (double)0x7fffffff;
            for (int i = 0; i < GrainDots; i++)
            {
                bool light = rand() < 0.5;
                int gx = (int)(rand() * W), gy = (int)(rand() * H);
                Blend(px, gx, gy, light ? new Color(1, 240 / 255f, 210 / 255f, 0.06f) : new Color(0, 0, 0, 0.12f));
            }
            // The vignette.
            for (int y = 0; y < H; y++)
                for (int x = 0; x < W; x++)
                {
                    float d = Vector2.Distance(new Vector2(x, y), new Vector2(W / 2f, H / 2f));
                    float a = Mathf.Clamp01((d - W * 0.3f) / (W * 0.35f)) * 0.75f;
                    Blend(px, x, y, new Color(0, 0, 0, a));
                }
            tex = new Texture2D(W, H, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            tex.SetPixels(px);
            tex.Apply();
            made[photo] = tex;
            return tex;
        }

        // The canvas's y grows downward; a texture's grows upward.
        static int Idx(int x, int y) { return (H - 1 - y) * W + x; }

        static void Blend(Color[] px, int x, int y, Color c)
        {
            if (x < 0 || y < 0 || x >= W || y >= H) return;
            int i = Idx(x, y);
            var o = px[i];
            px[i] = new Color(o.r + (c.r - o.r) * c.a, o.g + (c.g - o.g) * c.a, o.b + (c.b - o.b) * c.a, 1);
        }

        /// <summary>Fills where inside(x, y) holds, within a box, softening edges by 2x2 supersampling.</summary>
        static void Fill(Color[] px, float x0, float y0, float x1, float y1, Func<float, float, bool> inside, Color c)
        {
            for (int y = Mathf.Max(0, (int)y0 - 1); y <= Mathf.Min(H - 1, (int)y1 + 1); y++)
                for (int x = Mathf.Max(0, (int)x0 - 1); x <= Mathf.Min(W - 1, (int)x1 + 1); x++)
                {
                    int hits = 0;
                    for (int sy = 0; sy < 2; sy++)
                        for (int sx = 0; sx < 2; sx++)
                            if (inside(x + 0.25f + sx * 0.5f, y + 0.25f + sy * 0.5f)) hits++;
                    if (hits > 0) Blend(px, x, y, new Color(c.r, c.g, c.b, c.a * hits / 4f));
                }
        }

        static bool InPolygon(Vector2[] poly, float x, float y)
        {
            bool inside = false;
            for (int i = 0, j = poly.Length - 1; i < poly.Length; j = i++)
                if ((poly[i].y > y) != (poly[j].y > y) && x < (poly[j].x - poly[i].x) * (y - poly[i].y) / (poly[j].y - poly[i].y) + poly[i].x) inside = !inside;
            return inside;
        }

        static void Polygon(Color[] px, Vector2[] poly, Color c)
        {
            float x0 = float.MaxValue, y0 = float.MaxValue, x1 = float.MinValue, y1 = float.MinValue;
            foreach (var p in poly) { x0 = Mathf.Min(x0, p.x); y0 = Mathf.Min(y0, p.y); x1 = Mathf.Max(x1, p.x); y1 = Mathf.Max(y1, p.y); }
            Fill(px, x0, y0, x1, y1, (x, y) => InPolygon(poly, x, y), c);
        }

        static void Ellipse(Color[] px, float cx, float cy, float rx, float ry, Color c)
        {
            Fill(px, cx - rx, cy - ry, cx + rx, cy + ry, (x, y) => ((x - cx) * (x - cx)) / (rx * rx) + ((y - cy) * (y - cy)) / (ry * ry) <= 1, c);
        }

        static void Person(Color[] px, float x, float feet, float s, bool demon)
        {
            float h = FigureH * s, headR = 12 * s, headY = feet - h + headR;
            // Shoulders and body: the browser's curve over the shoulders, in short steps.
            var body = new List<Vector2> { new Vector2(x - 20 * s, feet), new Vector2(x - 22 * s, headY + headR + 14 * s) };
            Vector2 p0 = new Vector2(x - 22 * s, headY + headR + 14 * s), cp = new Vector2(x, headY + headR - 2 * s), p1 = new Vector2(x + 22 * s, headY + headR + 14 * s);
            for (int i = 1; i <= 10; i++)
            {
                float t = i / 10f;
                body.Add((1 - t) * (1 - t) * p0 + 2 * (1 - t) * t * cp + t * t * p1);
            }
            body.Add(new Vector2(x + 20 * s, feet));
            Polygon(px, body.ToArray(), Figure);
            Ellipse(px, x, headY, headR, headR, Figure);
            if (!demon) return;
            // Horns, glowing slanted eyes and a jagged grin.
            foreach (int side in new[] { -1, 1 })
                Polygon(px, new[] { new Vector2(x + side * headR * 0.5f, headY - headR * 0.7f), new Vector2(x + side * headR * 1.1f, headY - headR * 1.9f), new Vector2(x + side * headR * 0.9f, headY - headR * 0.4f) }, Figure);
            var glow = new Color(DemonEyes.r, DemonEyes.g, DemonEyes.b, 0.35f);
            foreach (int side in new[] { -1, 1 })
            {
                var eye = new[] { new Vector2(x + side * headR * 0.15f, headY - headR * 0.05f), new Vector2(x + side * headR * 0.7f, headY - headR * 0.35f), new Vector2(x + side * headR * 0.6f, headY + headR * 0.1f) };
                Ellipse(px, x + side * headR * 0.48f, headY - headR * 0.1f, headR * 0.5f, headR * 0.35f, glow);
                Polygon(px, eye, DemonEyes);
            }
            const int Teeth = 5;
            var grin = new List<Vector2> { new Vector2(x - headR * 0.6f, headY + headR * 0.4f) };
            for (int i = 1; i <= Teeth * 2; i++) grin.Add(new Vector2(x - headR * 0.6f + i * headR * 1.2f / (Teeth * 2), headY + headR * (i % 2 == 1 ? 0.7f : 0.4f)));
            Polygon(px, grin.ToArray(), DemonEyes);
        }

        static void Ghost(Color[] px, float x, float feet, float s)
        {
            float h = FigureH * 1.1f * s;
            // A soft pale glow, then the body at 0.55, as the canvas's shadowBlur and globalAlpha.
            Ellipse(px, x, feet - h / 2, 16 * s + 6 * s, h / 2 + 6 * s, new Color(0.91f, 0.89f, 0.85f, 0.18f));
            Ellipse(px, x, feet - h / 2, 16 * s, h / 2, new Color32(0xcf, 0xc9, 0xbc, 140));
            // Hollow eyes.
            foreach (int side in new[] { -1, 1 }) Ellipse(px, x + side * 5 * s, feet - h + 18 * s, 2.5f * s, 4 * s, Color.black);
        }
    }

    /// <summary>The possessed's powers on screen (GDD 14.2): the bar with each one's state, and the wheel held on R.</summary>
    public static class PowerHud
    {
        /// <summary>game.ts WHEEL_ORDER: up is Slam Door, then clockwise.</summary>
        public static readonly string[] WheelOrder = { "slamDoor", "summon", "blackout", "taint", "alterClue" };
        /// <summary>How far the mouse must move from the middle before a power is picked (pixels).</summary>
        public const float PickPx = 30;
        const float RadiusPct = 0.38f;

        /// <summary>A power's state in a few words: "" when ready.</summary>
        public static string StateText(Night.Power p)
        {
            if (p.State == "cooldown") return Math.Ceiling(p.CooldownLeft) + " s";
            if (p.State == "locked") return p.Kind == "taint" ? "(ritual)" : "(not yet)";
            if (p.State == "used") return "(used)";
            return "";
        }

        public static Night.Power Find(List<Night.Power> list, string kind)
        {
            if (list != null) foreach (var p in list) if (p.Kind == kind) return p;
            return new Night.Power { Kind = kind, State = "locked" };
        }

        /// <summary>The power the mouse points at, clockwise from straight up, one equal slice each; null near the middle.</summary>
        public static string Pick(Vector2 mouse)
        {
            if (mouse.magnitude < PickPx) return null;
            // Screen y grows downward here, as the browser's.
            double a = Math.Atan2(mouse.x, -mouse.y);
            double slice = Math.PI * 2 / WheelOrder.Length;
            double turn = (a + Math.PI * 2 + slice / 2) % (Math.PI * 2);
            return WheelOrder[(int)Math.Floor(turn / slice) % WheelOrder.Length];
        }

        public static void DrawBar(List<Night.Power> list, double curseLeft, GUIStyle style)
        {
            if (list == null) return;
            float x = Screen.width / 2f - 420, y = Screen.height - 46;
            foreach (var p in list)
            {
                string name;
                Night.PowerNames.TryGetValue(p.Kind, out name);
                string t = (name ?? p.Kind) + " " + StateText(p);
                Chip(new Rect(x, y, 160, 30), t, p.State == "ready" ? new Color(0.55f, 0.12f, 0.1f, 0.85f) : new Color(0, 0, 0, 0.6f), style);
                x += 166;
            }
            if (curseLeft > 0) Chip(new Rect(Screen.width / 2f - 80, y - 36, 160, 30), "Curse glow " + Math.Ceiling(curseLeft) + " s", new Color(0.5f, 0.05f, 0.05f, 0.9f), style);
        }

        static void Chip(Rect r, string text, Color fill, GUIStyle style)
        {
            Hud.Fill(r, fill);
            GUI.Label(r, text, new GUIStyle(style) { alignment = TextAnchor.MiddleCenter });
        }

        public static void DrawWheel(List<Night.Power> list, string selected, GUIStyle style)
        {
            float size = Mathf.Min(Screen.width, Screen.height) * 0.6f;
            var centre = new Vector2(Screen.width / 2f, Screen.height / 2f);
            for (int i = 0; i < WheelOrder.Length; i++)
            {
                var p = Find(list, WheelOrder[i]);
                double a = i * Math.PI * 2 / WheelOrder.Length;
                var at = centre + new Vector2((float)Math.Sin(a), -(float)Math.Cos(a)) * size * RadiusPct;
                var r = new Rect(at.x - 85, at.y - 34, 170, 68);
                Color fill = selected == p.Kind ? new Color(0.75f, 0.2f, 0.15f, 0.95f) : p.State == "ready" ? new Color(0.25f, 0.06f, 0.05f, 0.9f) : new Color(0, 0, 0, 0.75f);
                Hud.Fill(r, fill);
                string name;
                Night.PowerNames.TryGetValue(p.Kind, out name);
                string state = StateText(p);
                GUI.Label(r, "<b>" + name + "</b>\n" + (state == "" ? "Ready" : state), new GUIStyle(style) { alignment = TextAnchor.MiddleCenter, richText = true });
            }
            GUI.Label(new Rect(centre.x - 200, centre.y - 14, 400, 28), "Move the mouse, let go of R", new GUIStyle(style) { alignment = TextAnchor.MiddleCenter });
        }
    }
}
