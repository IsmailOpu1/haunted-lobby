using System;
using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>One sound subtitle (game.ts SoundCue): its words, the arrow's turn from straight ahead (radians, clockwise; none when null), and "above" or "below".</summary>
    public struct SoundCue
    {
        public string Text;
        public float? Angle;
        public string Vertical;
    }

    /// <summary>
    /// What the player sees on top of the 3D view during a night (step C1), with the browser's
    /// wording: the lobby, the countdown and role card, the night clock with its parts, the task
    /// bar and your task list (hold Tab), the ritual, being down / a Wisp / hidden, held actions,
    /// the prompt for E, banners, and the end screen. Drawn plainly for now; step E gives it the
    /// real menus' look and the font pair.
    /// </summary>
    public class Hud
    {
        readonly Night night;
        readonly Func<GameState> state;
        readonly Func<string> sessionId;
        readonly Action<string, object> send;
        readonly object config;
        GUIStyle label, big, title, small, box;
        static readonly Color Dim = new Color(0, 0, 0, 0.6f);
        static readonly Color NightFill = new Color(0.55f, 0.6f, 0.8f, 0.9f);
        static readonly Color TaskFill = new Color(0.45f, 0.75f, 0.45f, 0.9f);
        static readonly Color RitualFill = new Color(0.9f, 0.75f, 0.35f, 0.9f);
        static readonly Color Possessed = new Color(0.9f, 0.25f, 0.2f);

        public string Prompt;
        public bool ShowTasks;
        /// <summary>The Spirit Camera's viewfinder is up (key 2).</summary>
        public bool CameraRaised;
        /// <summary>
        /// What you hear that matters, in words, each with an arrow toward it (GDD 23 subtitles;
        /// game.ts updateWhereabouts): the relic's music box, the bell, a slammed door, the ghost.
        /// </summary>
        public readonly List<SoundCue> SoundCues = new List<SoundCue>();
        public double ScreenFlashUntil;
        /// <summary>While you work with your hands (GDD 26.5): how to, and how to stop; null otherwise.</summary>
        public string WorkHint;
        /// <summary>The meeting screen (GDD 16), drawn over everything while one runs.</summary>
        public MeetingScreen Meeting;
        /// <summary>The possessed's power wheel is open (hold R), and the power the mouse points at.</summary>
        public bool WheelOpen;
        public string WheelSelected;

        public Hud(Night night, Func<GameState> state, Func<string> sessionId, Action<string, object> send, object config)
        {
            this.night = night;
            this.state = state;
            this.sessionId = sessionId;
            this.send = send;
            this.config = config;
        }

        void Styles()
        {
            if (label != null) return;
            label = new GUIStyle(GUI.skin.label) { fontSize = 18, wordWrap = true };
            small = new GUIStyle(label) { fontSize = 15 };
            big = new GUIStyle(label) { fontSize = 26, alignment = TextAnchor.MiddleCenter };
            title = new GUIStyle(label) { fontSize = 44, alignment = TextAnchor.MiddleCenter, fontStyle = FontStyle.Bold };
            box = new GUIStyle(GUI.skin.box);
        }

        // style.css #sound-cues and .cue: a column of rows 22% up from the bottom, 6 px apart; each a
        // panel (--panel) with 4 x 12 px padding, a 20 px arrow 8 px before 15 px text.
        static readonly Color CuePanel = new Color(12 / 255f, 12 / 255f, 16 / 255f, 0.88f);
        static Texture2D cueArrow;

        /// <summary>The cue's arrow (main.ts's SVG polygon 0,-1.6 1.1,1.2 0,0.5 -1.1,1.2 in a 4 x 4 box), pointing up, smoothed.</summary>
        static Texture2D CueArrow()
        {
            if (cueArrow != null) return cueArrow;
            const int Size = 64, Samples = 4;
            var pts = new[] { new Vector2(0, -1.6f), new Vector2(1.1f, 1.2f), new Vector2(0, 0.5f), new Vector2(-1.1f, 1.2f) };
            var pixels = new Color32[Size * Size];
            for (int y = 0; y < Size; y++)
                for (int x = 0; x < Size; x++)
                {
                    int inside = 0;
                    for (int sy = 0; sy < Samples; sy++)
                        for (int sx = 0; sx < Samples; sx++)
                        {
                            var p = new Vector2(-2 + 4 * (x + (sx + 0.5f) / Samples) / Size, -2 + 4 * (y + (sy + 0.5f) / Samples) / Size);
                            bool odd = false;
                            for (int i = 0, j = pts.Length - 1; i < pts.Length; j = i++)
                                if ((pts[i].y > p.y) != (pts[j].y > p.y) && p.x < (pts[j].x - pts[i].x) * (p.y - pts[i].y) / (pts[j].y - pts[i].y) + pts[i].x) odd = !odd;
                            if (odd) inside++;
                        }
                    // Texture rows run bottom-up; the SVG's run top-down.
                    pixels[(Size - 1 - y) * Size + x] = new Color32(0xf0, 0xec, 0xe4, (byte)(255 * inside / (Samples * Samples)));
                }
            cueArrow = new Texture2D(Size, Size, TextureFormat.RGBA32, false) { filterMode = FilterMode.Bilinear, wrapMode = TextureWrapMode.Clamp };
            cueArrow.SetPixels32(pixels);
            cueArrow.Apply();
            return cueArrow;
        }

        void DrawSoundCues()
        {
            var s = state();
            if (SoundCues.Count == 0 || night.End != null || (s != null && !string.IsNullOrEmpty(s.meeting))) return;
            const float Gap = 6, PadX = 12, PadY = 4, Arrow = 20, ArrowGap = 8;
            var text = new GUIStyle(small) { wordWrap = false, alignment = TextAnchor.MiddleLeft, padding = new RectOffset(0, 0, 0, 0), margin = new RectOffset(0, 0, 0, 0) };
            float rowH = Mathf.Max(Arrow, text.CalcSize(new GUIContent("Ag")).y) + PadY * 2;
            float y = Screen.height * (1 - 0.22f) - SoundCues.Count * rowH - (SoundCues.Count - 1) * Gap;
            foreach (var cue in SoundCues)
            {
                string words = cue.Vertical != null ? cue.Text + " (" + cue.Vertical + ")" : cue.Text;
                float textW = text.CalcSize(new GUIContent(words)).x;
                float w = PadX * 2 + textW + (cue.Angle.HasValue ? Arrow + ArrowGap : 0);
                var row = new Rect(Screen.width / 2f - w / 2, y, w, rowH);
                Fill(row, CuePanel);
                float x = row.x + PadX;
                if (cue.Angle.HasValue)
                {
                    var arrow = new Rect(x, row.y + (rowH - Arrow) / 2, Arrow, Arrow);
                    var matrix = GUI.matrix;
                    GUIUtility.RotateAroundPivot(cue.Angle.Value * Mathf.Rad2Deg, arrow.center);
                    GUI.DrawTexture(arrow, CueArrow());
                    GUI.matrix = matrix;
                    x += Arrow + ArrowGap;
                }
                GUI.Label(new Rect(x, row.y, textW + 1, rowH), words, text);
                y += rowH + Gap;
            }
        }

        public static void Fill(Rect r, Color c)
        {
            var old = GUI.color;
            GUI.color = c;
            GUI.DrawTexture(r, Texture2D.whiteTexture);
            GUI.color = old;
        }

        static void Bar(Rect r, double fraction, Color fill)
        {
            Fill(r, Dim);
            Fill(new Rect(r.x, r.y, r.width * Mathf.Clamp01((float)fraction), r.height), fill);
        }

        public void Draw(string roomCode)
        {
            var s = state();
            if (s == null) return;
            Styles();
            double now = Time.realtimeSinceStartupAsDouble;
            if (night.End != null) { DrawEnd(s); return; }
            switch (s.stage)
            {
                case "waiting": DrawLobby(s, roomCode, now); break;
                case "countdown": DrawCentre(Math.Max(1, Math.Ceiling(s.stageLeft)).ToString(), "The night begins", "", Color.white); break;
                case "intro": DrawIntro(s); break;
                case "night": DrawNight(s, now); break;
            }
            if (now < ScreenFlashUntil) Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(1, 1, 1, (float)((ScreenFlashUntil - now) / 0.3)));
            if (night.Banner != null && now < night.BannerUntil)
                GUI.Label(new Rect(Screen.width / 2f - 400, 90, 800, 70), night.Banner, big);
        }

        void DrawLobby(GameState s, string roomCode, double now)
        {
            bool host = s.host == sessionId();
            var area = new Rect(40, 60, 460, Screen.height - 120);
            Fill(area, Dim);
            GUILayout.BeginArea(new Rect(area.x + 16, area.y + 12, area.width - 32, area.height - 24));
            GUILayout.Label("Room " + roomCode, big);
            GUILayout.Label(host
                ? "You are the host. Start when everyone else is Ready (" + (int)Sim.Json.Num(Sim.Json.Obj(config, "players"), "min") + " to " + (int)Sim.Json.Num(Sim.Json.Obj(config, "players"), "max") + " players). Pressing Start counts as your Ready."
                : "Do the mic check and press Ready. The host starts the night.", small);
            GUILayout.Space(8);
            foreach (var kv in s.players)
            {
                var p = kv.Value;
                string mark = kv.Key == s.host ? "  (host)" : p.ready ? "  Ready" : "";
                GUILayout.Label(p.name + mark + (p.connected ? "" : "  (reconnecting)"), label);
            }
            GUILayout.Space(8);
            Player me;
            s.players.TryGetValue(sessionId(), out me);
            if (host)
            {
                if (GUILayout.Button("Start", GUILayout.Height(40))) send("start", null);
            }
            else if (me != null)
            {
                if (GUILayout.Button(me.ready ? "Not ready" : "Ready", GUILayout.Height(40))) send("ready", new Dictionary<string, object> { { "ready", !me.ready } });
            }
            if (night.Refusal != null && now < night.RefusalUntil) GUILayout.Label(night.Refusal, small);
            GUILayout.Space(8);
            foreach (var line in night.Log) GUILayout.Label(line, small);
            GUILayout.EndArea();
        }

        void DrawCentre(string head, string text, string extra, Color headColor)
        {
            Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(0, 0, 0, 0.75f));
            var old = GUI.color;
            GUI.color = headColor;
            GUI.Label(new Rect(0, Screen.height / 2f - 110, Screen.width, 80), head, title);
            GUI.color = old;
            GUI.Label(new Rect(Screen.width / 2f - 400, Screen.height / 2f - 20, 800, 40), text, big);
            GUI.Label(new Rect(Screen.width / 2f - 400, Screen.height / 2f + 30, 800, 80), extra, new GUIStyle(label) { alignment = TextAnchor.UpperCenter });
        }

        void DrawIntro(GameState s)
        {
            if (night.Role == null) return;
            Player me;
            s.players.TryGetValue(sessionId(), out me);
            string character = me != null ? Characters.NameOf(me.character) : null;
            if (night.Role == "possessed")
            {
                string partners = night.Partners.Count > 0 ? "Also possessed: " + string.Join(", ", night.Partners) + ". " : "";
                // Only the possessed know who the ghost was (GDD 26.13): lie about the clues.
                string ghost = night.GhostWas != null ? "The ghost was " + night.GhostWas + ". Lead the team to the wrong relic. " : "";
                DrawCentre("YOU ARE POSSESSED", "Stop the ritual. Do not get caught.", (character != null ? "You are " + character + ". " : "") + partners + ghost + "Hold R for your powers.", Possessed);
            }
            else
            {
                DrawCentre("INVESTIGATOR", "Do your tasks, find the relics, finish the ritual before dawn.", character != null ? "Tonight you are " + character + "." : "", Color.white);
            }
        }

        void DrawNight(GameState s, double now)
        {
            if (!string.IsNullOrEmpty(s.meeting) && Meeting != null) { Meeting.Draw(s, sessionId()); return; }
            Player me;
            s.players.TryGetValue(sessionId(), out me);
            // The night bar, its parts, and the time to dawn (top left).
            string part;
            Night.PartNames.TryGetValue(s.part ?? "", out part);
            GUI.Label(new Rect(20, 12, 400, 26), (part ?? s.part) + "    " + night.ClockText(), label);
            var bar = new Rect(20, 40, 320, 10);
            Bar(bar, s.nightLength > 0 ? s.nightTime / s.nightLength : 0, NightFill);
            foreach (var at in night.PartMarks()) Fill(new Rect(bar.x + bar.width * (float)at - 1, bar.y - 3, 2, bar.height + 6), Color.white);

            // The team's task bar (top right).
            var tasks = new Rect(Screen.width - 340, 40, 320, 10);
            GUI.Label(new Rect(Screen.width - 340, 12, 320, 26), "Tasks  " + s.tasksDone + " / " + s.tasksTotal, label);
            Bar(tasks, s.tasksTotal > 0 ? (double)s.tasksDone / s.tasksTotal : 0, TaskFill);

            // The ritual, once there is one.
            double progress;
            var ritual = night.RitualText(out progress);
            if (ritual != null)
            {
                GUI.Label(new Rect(Screen.width / 2f - 200, 12, 400, 26), ritual[0], new GUIStyle(label) { alignment = TextAnchor.UpperCenter });
                Bar(new Rect(Screen.width / 2f - 160, 40, 320, 10), progress / 100, RitualFill);
                GUI.Label(new Rect(Screen.width / 2f - 250, 54, 500, 26), ritual[1], new GUIStyle(small) { alignment = TextAnchor.UpperCenter });
            }

            // Your items (bottom left).
            if (me != null)
            {
                var items = new List<string>();
                if (me.salt > 0) items.Add("Salt " + me.salt);
                if (me.cameraShots > 0) items.Add("Camera " + me.cameraShots);
                Relic relic;
                if (!string.IsNullOrEmpty(me.relic) && s.relics.TryGetValue(me.relic, out relic)) items.Add("Carrying " + relic.name + " (G to drop)");
                GUI.Label(new Rect(20, Screen.height - 40, 700, 30), string.Join("    ", items), label);
            }

            // Hold Tab: your tasks and the relics.
            if (ShowTasks) DrawStatus(s);

            if (me != null) DrawPlayerState(me);

            // The possessed's powers: the bar, and the wheel while R is held (GDD 14.2).
            if (night.Role == "possessed" && night.Powers != null && me != null && me.health == "alive")
            {
                PowerHud.DrawBar(night.Powers, night.CurseLeft, small);
                if (WheelOpen) PowerHud.DrawWheel(night.Powers, WheelSelected, label);
            }

            if (CameraRaised)
            {
                var frame = new Rect(Screen.width * 0.2f, Screen.height * 0.18f, Screen.width * 0.6f, Screen.height * 0.6f);
                foreach (var edge in new[] { new Rect(frame.x, frame.y, frame.width, 2), new Rect(frame.x, frame.yMax, frame.width, 2), new Rect(frame.x, frame.y, 2, frame.height), new Rect(frame.xMax, frame.y, 2, frame.height + 2) })
                    Fill(edge, new Color(1, 1, 1, 0.7f));
                GUI.Label(new Rect(frame.x, frame.yMax + 8, frame.width, 30), "Click to take the photo · 2 to lower", new GUIStyle(label) { alignment = TextAnchor.UpperCenter });
            }
            DrawSoundCues();

            // The crosshair is your hand while you work, and your aim otherwise.
            if (Cursor.lockState == CursorLockMode.Locked) Fill(new Rect(Screen.width / 2f - 3, Screen.height / 2f - 3, 6, 6), new Color(1, 1, 1, 0.8f));

            // The held action's progress, then how to work with your hands, or the prompt for E.
            string action;
            if (me != null && !string.IsNullOrEmpty(me.action) && Night.ActionLabels.TryGetValue(me.action, out action))
            {
                GUI.Label(new Rect(Screen.width / 2f - 200, Screen.height - 150, 400, 26), action, new GUIStyle(label) { alignment = TextAnchor.UpperCenter });
                Bar(new Rect(Screen.width / 2f - 150, Screen.height - 120, 300, 10), me.actionProgress, Color.white);
            }
            else if (!string.IsNullOrEmpty(WorkHint))
            {
                var hintStyle = new GUIStyle(small) { fontSize = 14, alignment = TextAnchor.MiddleCenter };
                float w = Mathf.Min(560, Screen.width - 32);
                float h = hintStyle.CalcHeight(new GUIContent(WorkHint), w - 24) + 12;
                var r = new Rect(Screen.width / 2f - w / 2, Screen.height * 0.88f - h, w, h);
                Fill(r, Dim);
                GUI.Label(new Rect(r.x + 12, r.y + 6, w - 24, h - 12), WorkHint, hintStyle);
            }
            else if (!string.IsNullOrEmpty(Prompt))
            {
                GUI.Label(new Rect(Screen.width / 2f - 300, Screen.height - 130, 600, 30), Prompt, new GUIStyle(big) { fontSize = 20 });
            }
        }

        void DrawStatus(GameState s)
        {
            var area = new Rect(Screen.width / 2f - 260, 90, 520, Screen.height - 220);
            Fill(area, Dim);
            GUILayout.BeginArea(new Rect(area.x + 16, area.y + 12, area.width - 32, area.height - 24));
            GUILayout.Label(night.Role == "possessed" ? "Your tasks (fake: they move no bar)" : "Your tasks", big);
            foreach (var t in night.Tasks) GUILayout.Label((t.Done ? "Done   " : "          ") + t.Name + "  (" + t.Room + ")", label);
            GUILayout.Space(10);
            GUILayout.Label("Relics", big);
            foreach (var kv in s.relics) GUILayout.Label(kv.Value.name + "   " + Night.RelicStatusText(kv.Value), label);
            GUILayout.EndArea();
        }

        void DrawPlayerState(Player me)
        {
            string head = null, text = null;
            if (me.health == "downed")
            {
                head = "You are down";
                text = "A friend must hold E on you within " + Math.Ceiling(me.bleedLeft) + " s. You can crawl.";
            }
            else if (me.health == "dead")
            {
                head = "You are a Wisp";
                bool tasks = (bool)Sim.Json.Obj(config, "wisps")["canDoTasks"];
                text = "Fly with W A S D, through walls. Space and C float up and down a floor." + (tasks ? " You can still do your tasks." : "") + " Only other Wisps can hear you.";
            }
            else if (!string.IsNullOrEmpty(me.hidingSpot))
            {
                text = me.holdingBreath ? "Holding your breath"
                    : me.breathCooldown > 0 ? "Catching your breath (" + Math.Ceiling(me.breathCooldown) + " s)"
                    : "Hidden. Hold Shift to hold your breath, hold E to step out.";
            }
            if (text == null) return;
            var r = new Rect(Screen.width / 2f - 360, Screen.height / 2f + 60, 720, 110);
            Fill(r, Dim);
            if (head != null) GUI.Label(new Rect(r.x, r.y + 8, r.width, 36), head, big);
            GUI.Label(new Rect(r.x + 16, r.y + (head != null ? 48 : 30), r.width - 32, 60), text, new GUIStyle(label) { alignment = TextAnchor.UpperCenter });
        }

        Vector2 endScroll;

        void DrawEnd(GameState s)
        {
            var end = night.End;
            string[] text;
            if (!Night.EndText.TryGetValue(end.Reason ?? "", out text)) text = new[] { end.Winner, "" };
            Fill(new Rect(0, 0, Screen.width, Screen.height), new Color(0, 0, 0, 0.85f));
            GUILayout.BeginArea(new Rect(Screen.width / 2f - 450, 50, 900, Screen.height - 100));
            endScroll = GUILayout.BeginScrollView(endScroll);
            var old = GUI.color;
            GUI.color = end.Winner == "possessed" ? Possessed : Color.white;
            GUILayout.Label(text[0], new GUIStyle(title) { fontSize = 34 });
            GUI.color = old;
            GUILayout.Label(end.Ghost != null ? text[1] + " The ghost was " + end.Ghost + "." : text[1], big);
            GUILayout.Space(12);
            foreach (var r in end.Roles) GUILayout.Label(r.Name + "    " + (r.Role == "possessed" ? "Possessed" : "Investigator"), label);
            if (end.Awards.Count > 0)
            {
                GUILayout.Space(10);
                GUILayout.Label("Awards", big);
                foreach (var a in end.Awards) GUILayout.Label(a.Title + "   " + string.Join(", ", a.Names) + "   " + a.Why, small);
            }
            if (night.EndPhotos.Count > 0)
            {
                GUILayout.Space(10);
                GUILayout.Label("The photos", big);
                for (int i = 0; i < night.EndPhotos.Count; i += 3)
                {
                    GUILayout.BeginHorizontal();
                    for (int j = i; j < Math.Min(i + 3, night.EndPhotos.Count); j++) PhotoPrint.DrawCard(night.EndPhotos[j], new GUIStyle(small) { alignment = TextAnchor.UpperCenter });
                    GUILayout.EndHorizontal();
                }
            }
            if (end.Timeline.Count > 0)
            {
                GUILayout.Space(10);
                GUILayout.Label("The night", big);
                foreach (var l in end.Timeline) GUILayout.Label(l.Time + "   " + l.Text, small);
            }
            GUILayout.Space(14);
            bool host = s.host == sessionId();
            if (host)
            {
                GUILayout.Label("Rematch takes everyone back to the lobby with the same settings. Everyone gets a new character.", small);
                if (GUILayout.Button("Rematch", GUILayout.Height(40))) send("rematch", null);
            }
            else GUILayout.Label("Waiting for the host to start a rematch.", small);
            GUILayout.EndScrollView();
            GUILayout.EndArea();
        }
    }
}
