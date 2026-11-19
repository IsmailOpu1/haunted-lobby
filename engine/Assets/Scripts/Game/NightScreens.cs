using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;

namespace Haunted.Game
{
    /// <summary>
    /// Step E5: the night's own screens in the menus' panel (index.html's #night ... #mic-lost, laid
    /// out as style.css lays them out, filled as main.ts's ui functions fill them). Hud decides what
    /// shows each frame and calls these; a test run without menus keeps Hud's plain drawing.
    /// </summary>
    public partial class Menus
    {
        VisualElement nightLayer, topLayer;
        VisualElement nightRow, nightFill, nightBar, teamRow, teamFill, ritualRow, ritualFill;
        Label nightPart, nightLeft, teamCount, ritualLabel, ritualCount;
        VisualElement taskList, items, promptRow, actionCol, actionFill, staminaRow, staminaFill, bannerRow;
        Label carrying, promptText, actionLabel, bannerText, workHint, escHint, micLost;
        VisualElement workRow, escRow, crosshair, viewfinder, overlay, roomName, soundCues, statusWrap, relicList;
        Label overlayTitle, overlayText, viewfinderText, roomNameRoom, roomNameFloor;
        VisualElement powersBar, powerWheel, intro, micLostRow, screenFlash;
        Label introTitle, introText, introExtra;
        readonly List<string> nightMarksShown = new List<string>();
        string tasksKey, itemsKey, relicsKey, powersKey, wheelKey, cuesKey, statusKind;
        double roomNameUntil;
        string roomShown;
        bool nightOn;

        /// <summary>How long the room name stays after you walk in (main.ts ROOM_NAME_SEC).</summary>
        const float RoomNameSec = 3;
        /// <summary>How far out the wheel's sectors sit, in % of its size (main.ts WHEEL_RADIUS_PCT).</summary>
        const double WheelRadiusPct = 33;

        void BuildNight()
        {
            // Under the menu screens (the room page covers the HUD) ...
            nightLayer = Div(null, "night-layer", null);
            nightLayer.pickingMode = PickingMode.Ignore;
            root.Insert(0, nightLayer);
            // ... and the countdown, role reveal and flash over them (style.css #intro z-index 6).
            topLayer = Div(root, "night-layer", null);
            topLayer.pickingMode = PickingMode.Ignore;

            overlay = Div(nightLayer, "", "overlay");
            overlayTitle = HudLine(overlay, "", "overlay-title");
            overlayText = HudLine(overlay, "", "overlay-text");

            nightRow = Div(nightLayer, "hud-row hud-small", "night-row");
            nightPart = HudLine(nightRow, "hud-side", "night-part");
            nightBar = Div(nightRow, "hud-bar", "night-bar");
            nightFill = Div(nightBar, "hud-fill", "night-fill");
            nightFill.style.backgroundImage = Gradient(new Color32(0x1d, 0x2b, 0x55, 255), new Color32(0xc9, 0x77, 0x3b, 255));
            nightLeft = HudLine(nightRow, "hud-count", "night-left");

            teamRow = Div(nightLayer, "hud-row hud-small", "team-row");
            HudLine(teamRow, "hud-side", null, "Tasks");
            teamFill = Div(Div(teamRow, "hud-bar", "team-bar"), "hud-fill", "team-fill");
            teamCount = HudLine(teamRow, "hud-count", "team-count");

            ritualRow = Div(nightLayer, "hud-row hud-small", "ritual-row");
            ritualLabel = HudLine(ritualRow, "hud-side", "ritual-label");
            ritualFill = Div(Div(ritualRow, "hud-bar", "ritual-bar"), "hud-fill", "ritual-fill");
            ritualCount = HudLine(ritualRow, "hud-count", "ritual-count");

            taskList = Div(nightLayer, "", "task-list");
            items = Div(nightLayer, "", "items");
            carrying = HudLine(nightLayer, "", "carrying");

            roomName = Div(nightLayer, "hud-col", "room-name");
            roomNameRoom = HudLine(roomName, "", "room-name-room");
            roomNameFloor = HudLine(roomName, "", "room-name-floor");

            viewfinder = Div(nightLayer, "", "viewfinder");
            viewfinderText = HudLine(viewfinder, "hud-panel", null);

            soundCues = Div(nightLayer, "hud-col", "sound-cues");
            crosshair = Div(nightLayer, "", "crosshair");

            promptRow = Div(nightLayer, "hud-row", "prompt-row");
            promptText = HudLine(promptRow, "hud-panel", "prompt");
            actionCol = Div(nightLayer, "hud-col", "action-col");
            actionLabel = HudLine(actionCol, "", "action-label");
            actionFill = Div(Div(actionCol, "hud-bar", "action-bar"), "hud-fill", "action-fill");
            staminaRow = Div(nightLayer, "hud-row", "stamina-row");
            staminaFill = Div(Div(staminaRow, "hud-bar", "stamina-bar"), "hud-fill", "stamina-fill");
            workRow = Div(nightLayer, "hud-row", "work-row");
            workHint = HudLine(workRow, "hud-panel", "work-hint");
            powersBar = Div(nightLayer, "hud-row", "powers-bar");
            powerWheel = Div(nightLayer, "", "power-wheel");
            powerWheel.style.backgroundImage = WheelDisc();
            escRow = Div(nightLayer, "hud-row", "esc-row");
            escHint = HudLine(escRow, "hud-panel", "esc-hint", "Esc for the room menu");
            bannerRow = Div(nightLayer, "hud-row", "banner-row");
            bannerText = HudLine(bannerRow, "hud-panel", "banner");
            micLostRow = Div(nightLayer, "hud-row", "mic-lost-row");
            micLost = HudLine(micLostRow, "", "mic-lost", "Your mic is off. Turn it back on. Until then the ghost hears you as if you were talking.");

            statusWrap = Div(nightLayer, "", "status-wrap");
            var panel = Div(statusWrap, "", "status-panel");
            HudLine(panel, "hud-h3", null, "Relics");
            relicList = Div(panel, "", "relic-list");

            intro = Div(topLayer, "", "intro");
            intro.style.backgroundImage = Radial(0.2f, new Color(0, 0, 0, 0.55f), 1f, new Color(0, 0, 0, 0.9f));
            introTitle = HudLine(intro, "", "intro-title");
            introText = HudLine(intro, "", "intro-text");
            introExtra = HudLine(intro, "", "intro-extra");
            screenFlash = Div(topLayer, "", "screen-flash");

            foreach (var e in new[] { overlay, nightRow, teamRow, ritualRow, taskList, items, carrying, viewfinder, crosshair, promptRow, actionCol, staminaRow, workRow, powersBar, powerWheel, escRow, bannerRow, micLostRow, statusWrap, intro })
                Show(e, false);
            ShowNight(false);
        }

        static VisualElement Div(VisualElement parent, string cls, string id)
        {
            var e = Box(parent ?? new VisualElement(), cls);
            if (id != null) e.name = id;
            e.pickingMode = PickingMode.Ignore;
            return e;
        }

        static Label HudLine(VisualElement parent, string cls, string id, string text = "")
        {
            var l = new Label(text) { enableRichText = true, pickingMode = PickingMode.Ignore };
            foreach (var c in cls.Split(' ')) if (c != "") l.AddToClassList(c);
            if (id != null) l.name = id;
            parent.Add(l);
            return l;
        }

        static void Show(VisualElement e, bool on)
        {
            var d = on ? DisplayStyle.Flex : DisplayStyle.None;
            if (e.style.display != d) e.style.display = d;
        }

        static void Set(Label l, string text)
        {
            if (l.text != text) l.text = text;
        }

        static void Width(VisualElement fill, double fraction)
        {
            var w = Length.Percent(Mathf.Round(Mathf.Clamp01((float)fraction) * 100));
            if (fill.style.width != w) fill.style.width = w;
            // The right end rounds once it reaches the bar's (the bar does not clip: see Night.uss).
            var r = new StyleLength(fraction >= 0.99 ? 3f : 0f);
            fill.style.borderTopRightRadius = r;
            fill.style.borderBottomRightRadius = r;
        }

        /// <summary>The night's screens on or off as a whole (off: in the lobby and test runs that never start).</summary>
        public void ShowNight(bool on)
        {
            nightOn = on;
            Show(nightLayer, on);
            ShowPanel();
        }

        /// <summary>main.ts setNight: the part, the bar from night to dawn with its marks, and the time left.</summary>
        public void SetNight(bool on, string part, string partName, double fraction, string left, List<double> marks)
        {
            Show(nightRow, on);
            if (!on) return;
            Set(nightPart, partName);
            nightPart.EnableInClassList("part-calm", part == "calm");
            nightPart.EnableInClassList("part-restless", part == "restless");
            nightPart.EnableInClassList("part-furious", part == "furious" || part == "overtime");
            Width(nightFill, fraction);
            Set(nightLeft, left);
            var key = new List<string>();
            foreach (var m in marks) key.Add((m * 100).ToString("0.0", System.Globalization.CultureInfo.InvariantCulture));
            if (string.Join(",", key) != string.Join(",", nightMarksShown))
            {
                nightBar.Query(className: "night-mark").ForEach(m => m.RemoveFromHierarchy());
                foreach (var k in key)
                {
                    var mark = Div(nightBar, "night-mark", null);
                    mark.style.left = Length.Percent(float.Parse(k, System.Globalization.CultureInfo.InvariantCulture));
                }
                nightMarksShown.Clear();
                nightMarksShown.AddRange(key);
            }
        }

        public void SetTeamTasks(int done, int total)
        {
            Show(teamRow, total > 0);
            Width(teamFill, total > 0 ? (double)done / total : 0);
            Set(teamCount, done + " / " + total);
        }

        /// <summary>main.ts setRitual: null lines hide it.</summary>
        public void SetRitual(string[] lines, double progress, bool draining)
        {
            Show(ritualRow, lines != null);
            if (lines == null) return;
            Set(ritualLabel, lines[0]);
            Set(ritualCount, lines[1]);
            Width(ritualFill, progress / 100);
            ritualFill.EnableInClassList("draining", draining);
        }

        /// <summary>main.ts setTasks: your list top left; the possessed's has the reminder first.</summary>
        public void SetTasks(List<Night.TaskEntry> list, bool possessed)
        {
            var key = (possessed ? "p" : "i") + string.Join(";", list.ConvertAll(t => t.Name + "|" + t.Room + "|" + t.Done));
            Show(taskList, list.Count > 0);
            if (key == tasksKey) return;
            tasksKey = key;
            taskList.Clear();
            if (possessed) HudLine(taskList, "role-note", null, "<i>Fake tasks: pretend to do them</i>");
            foreach (var t in list)
            {
                // text-decoration: line-through, on the name and its room alike.
                string text = t.Name + "<color=#8D887C> (" + t.Room + ")</color>";
                HudLine(taskList, t.Done ? "task-done" : "", null, t.Done ? "<s>" + t.Name + " (" + t.Room + ")</s>" : text);
            }
        }

        /// <summary>main.ts setItems: Salt ×n (key) · Camera ×n (key) · Bell ×n, with the counts in bold.</summary>
        public void SetItems(bool on, int salt, string saltKey, int shots, string cameraKey, int bells)
        {
            Show(items, on);
            string key = salt + saltKey + shots + cameraKey + bells;
            if (!on || key == itemsKey) return;
            itemsKey = key;
            items.Clear();
            // " &nbsp; " between the three. A label drops a space at its end, so each space
            // starts the next label (the counts' spaces in bold, a hair wider than the browser's).
            HudLine(items, "", null, "Salt");
            HudLine(items, "items-count", null, " ×" + salt);
            HudLine(items, "", null, " (" + saltKey + ")   Camera");
            HudLine(items, "items-count", null, " ×" + shots);
            HudLine(items, "", null, " (" + cameraKey + ")   Bell");
            HudLine(items, "items-count", null, " ×" + bells);
        }

        public void SetCarrying(string text)
        {
            Show(carrying, text != null);
            if (text != null) Set(carrying, text);
        }

        /// <summary>main.ts setRoom: the room you walked into, for 3 s; in a doorway the last one stays.</summary>
        public void SetRoom(string room, string floor)
        {
            double now = Time.realtimeSinceStartupAsDouble;
            if (!string.IsNullOrEmpty(room) && room != roomShown)
            {
                roomShown = room;
                Set(roomNameRoom, room);
                Set(roomNameFloor, floor);
                roomNameUntil = now + RoomNameSec;
            }
            roomName.EnableInClassList("on", now < roomNameUntil);
        }

        /// <summary>A new night, or out of the room: the next room you enter is named again.</summary>
        public void ForgetRoom()
        {
            roomShown = null;
            roomNameUntil = 0;
            roomName.RemoveFromClassList("on");
        }

        public void SetCameraRaised(bool raised, string cameraKey)
        {
            Show(viewfinder, raised);
            if (raised) Set(viewfinderText, "Click to take the photo · " + cameraKey + " to lower");
        }

        /// <summary>main.ts setSoundCues: one row each, an arrow toward it unless it is everywhere.</summary>
        public void SetSoundCues(List<SoundCue> cues, bool on)
        {
            Show(soundCues, on && cues.Count > 0);
            var key = new System.Text.StringBuilder();
            foreach (var c in cues) key.Append(c.Text).Append(c.Vertical).Append(c.Angle.HasValue ? c.Angle.Value.ToString("0.00") : "-").Append(';');
            if (key.ToString() == cuesKey) return;
            cuesKey = key.ToString();
            soundCues.Clear();
            foreach (var cue in cues)
            {
                var row = Div(soundCues, "cue hud-panel", null);
                if (cue.Angle.HasValue)
                {
                    var arrow = Div(row, "cue-arrow", null);
                    arrow.style.backgroundImage = Hud.CueArrow();
                    arrow.style.rotate = new Rotate(Angle.Radians(cue.Angle.Value));
                }
                HudLine(row, "", null, cue.Vertical != null ? cue.Text + " (" + cue.Vertical + ")" : cue.Text);
            }
        }

        /// <summary>body.looking: the crosshair while the mouse looks, and in a room the Esc hint with it.</summary>
        public void SetLooking(bool looking, bool inRoom)
        {
            Show(crosshair, looking);
            Show(escRow, looking && inRoom);
        }

        public void SetPrompt(string text)
        {
            Show(promptRow, !string.IsNullOrEmpty(text));
            if (!string.IsNullOrEmpty(text)) Set(promptText, text);
        }

        public void SetAction(string label, double progress)
        {
            Show(actionCol, label != null);
            if (label == null) return;
            Set(actionLabel, label);
            Width(actionFill, progress);
        }

        public void SetStamina(double fraction)
        {
            Show(staminaRow, fraction < 1);
            Width(staminaFill, fraction);
        }

        public void SetWorkHint(string text)
        {
            Show(workRow, !string.IsNullOrEmpty(text));
            if (!string.IsNullOrEmpty(text)) Set(workHint, text);
        }

        public void SetBanner(string text)
        {
            Show(bannerRow, text != null);
            if (text != null) Set(bannerText, text);
        }

        public void SetMicLost(bool lost) => Show(micLostRow, lost);

        /// <summary>main.ts setStatus: down, a Wisp, or hidden (with the wardrobe's slats); nothing when alive.</summary>
        public void SetStatus(string kind, string title, string text)
        {
            Show(overlay, kind != "alive");
            if (kind == "alive") return;
            if (kind != statusKind)
            {
                statusKind = kind;
                overlay.EnableInClassList("dead", kind == "dead");
                overlay.EnableInClassList("hidden-in", kind == "hidden");
                overlay.style.backgroundImage = kind == "downed" ? Radial(0.3f, new Color(120 / 255f, 0, 0, 0), 1f, new Color(120 / 255f, 0, 0, 0.65f))
                    : kind == "hidden" ? Wardrobe() : (StyleBackground)StyleKeyword.None;
            }
            Show(overlayTitle, title != "");
            Set(overlayTitle, title);
            Set(overlayText, text);
        }

        /// <summary>Hold Tab: every relic and how it is (main.ts setRelics). The floor plan is not drawn yet.</summary>
        public void SetStatusPanel(bool open, List<KeyValuePair<string, string>> relics)
        {
            Show(statusWrap, open);
            if (!open) return;
            var key = string.Join(";", relics.ConvertAll(r => r.Key + "|" + r.Value));
            if (key == relicsKey) return;
            relicsKey = key;
            relicList.Clear();
            foreach (var r in relics)
            {
                var row = Div(relicList, "relic-row", null);
                HudLine(row, "", null, r.Key);
                HudLine(row, "relic-status", null, r.Value);
            }
        }

        /// <summary>main.ts setPowers: a chip each along the bottom, and the curse glow's time while it lasts.</summary>
        public void SetPowers(List<Night.Power> list, double curseLeft)
        {
            Show(powersBar, list != null);
            if (list == null) return;
            var key = new System.Text.StringBuilder();
            foreach (var p in list) key.Append(p.Kind).Append(p.State).Append(PowerHud.StateText(p)).Append(';');
            if (curseLeft > 0) key.Append("curse").Append(Math.Ceiling(curseLeft));
            if (key.ToString() == powersKey) return;
            powersKey = key.ToString();
            powersBar.Clear();
            foreach (var p in list)
            {
                string name;
                Night.PowerNames.TryGetValue(p.Kind, out name);
                var chip = HudLine(powersBar, "power", null, (name ?? p.Kind) + " " + PowerHud.StateText(p));
                chip.EnableInClassList("off", p.State != "ready");
            }
            if (curseLeft > 0) HudLine(powersBar, "power curse", null, "Curse glow " + Math.Ceiling(curseLeft) + " s");
        }

        /// <summary>main.ts setWheel: hold R, a sector each clockwise from the top.</summary>
        public void SetWheel(bool open, List<Night.Power> list, string selected)
        {
            Show(powerWheel, open);
            if (!open) return;
            var key = new System.Text.StringBuilder(selected ?? "-");
            foreach (var kind in PowerHud.WheelOrder) { var p = PowerHud.Find(list, kind); key.Append(p.State).Append(PowerHud.StateText(p)); }
            if (key.ToString() == wheelKey) return;
            wheelKey = key.ToString();
            powerWheel.Clear();
            for (int i = 0; i < PowerHud.WheelOrder.Length; i++)
            {
                var p = PowerHud.Find(list, PowerHud.WheelOrder[i]);
                var sector = Div(powerWheel, "sector", null);
                sector.EnableInClassList("off", p.State != "ready");
                sector.EnableInClassList("selected", selected == p.Kind);
                double a = (double)i / PowerHud.WheelOrder.Length * Math.PI * 2;
                sector.style.left = Length.Percent((float)(50 + Math.Sin(a) * WheelRadiusPct));
                sector.style.top = Length.Percent((float)(50 - Math.Cos(a) * WheelRadiusPct));
                string name;
                Night.PowerNames.TryGetValue(p.Kind, out name);
                HudLine(sector, "sector-name", null, name ?? p.Kind);
                string state = PowerHud.StateText(p);
                HudLine(sector, "", null, state == "" ? "Ready" : state);
            }
            HudLine(powerWheel, "wheel-hint", null, "Move the mouse, let go of R");
        }

        /// <summary>main.ts showIntro: the countdown, then the role reveal; null hides it.</summary>
        public void SetIntro(string title, string text, string extra, bool possessed)
        {
            Show(intro, title != null);
            if (title == null) return;
            Set(introTitle, title);
            Set(introText, text);
            Set(introExtra, extra);
            introTitle.EnableInClassList("possessed", possessed);
        }

        /// <summary>#screen-flash's opacity now (Hud works out the fade).</summary>
        public void SetFlash(float opacity)
        {
            if (screenFlash.style.opacity != opacity) screenFlash.style.opacity = opacity;
        }

        // --- Pictures CSS draws with gradients ---

        static Texture2D nightGradient, wheelDisc, wardrobe;
        static readonly Dictionary<string, Texture2D> radials = new Dictionary<string, Texture2D>();

        /// <summary>linear-gradient(90deg, a, b), stretched over the element (sRGB blending, as browsers do).</summary>
        static Texture2D Gradient(Color32 a, Color32 b)
        {
            if (nightGradient != null) return nightGradient;
            const int W = 256;
            var px = new Color32[W * 2];
            for (int x = 0; x < W; x++) px[x] = px[W + x] = Color32.Lerp(a, b, (x + 0.5f) / W);
            nightGradient = new Texture2D(W, 2, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            nightGradient.SetPixels32(px);
            nightGradient.Apply();
            return nightGradient;
        }

        /// <summary>
        /// radial-gradient(ellipse at center, a at a%, b at b%) over the whole element: the ellipse's
        /// 100% is the farthest corner, so a point's place is its distance in half-sizes over √2.
        /// </summary>
        static Texture2D Radial(float at0, Color c0, float at1, Color c1)
        {
            string key = at0 + "," + c0 + "," + at1 + "," + c1;
            Texture2D tex;
            if (radials.TryGetValue(key, out tex)) return tex;
            const int N = 256;
            var px = new Color32[N * N];
            for (int y = 0; y < N; y++)
                for (int x = 0; x < N; x++)
                {
                    float u = (x + 0.5f) / N * 2 - 1, v = (y + 0.5f) / N * 2 - 1;
                    float d = Mathf.Sqrt(u * u + v * v) / Mathf.Sqrt(2);
                    float t = Mathf.Clamp01((d - at0) / (at1 - at0));
                    // Premultiplied interpolation, as CSS does: the colour of a transparent stop does not show.
                    float a = Mathf.Lerp(c0.a, c1.a, t);
                    Color c = a > 0 ? (c0 * c0.a * (1 - t) + c1 * c1.a * t) / a : c1;
                    px[y * N + x] = new Color(c.r, c.g, c.b, a);
                }
            tex = new Texture2D(N, N, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            tex.SetPixels32(px);
            tex.Apply();
            radials[key] = tex;
            return tex;
        }

        /// <summary>
        /// Inside a wardrobe (body[data-status="hidden"] #overlay): slats, 26 px dark in every 40 px
        /// counted from the bottom, over a vignette (transparent 20%, black 0.9 at 75%). Drawn at the
        /// window's size, so the slats stay 40 px apart as in the browser.
        /// </summary>
        static Texture2D Wardrobe()
        {
            int w = Mathf.Max(1, UnityEngine.Screen.width), h = Mathf.Max(1, UnityEngine.Screen.height);
            if (wardrobe != null && wardrobe.width == w && wardrobe.height == h) return wardrobe;
            if (wardrobe != null) UnityEngine.Object.Destroy(wardrobe);
            var px = new Color32[w * h];
            for (int y = 0; y < h; y++)
            {
                // Texture rows run bottom-up, as the slats are counted.
                float slat = (y % 40) < 26 ? 0.85f : 0;
                for (int x = 0; x < w; x++)
                {
                    float u = (x + 0.5f) / w * 2 - 1, v = (y + 0.5f) / h * 2 - 1;
                    float d = Mathf.Sqrt(u * u + v * v) / Mathf.Sqrt(2);
                    float vignette = 0.9f * Mathf.Clamp01((d - 0.2f) / 0.55f);
                    // The slats lie over the vignette (the first background is on top).
                    float a = slat + vignette * (1 - slat);
                    px[y * w + x] = new Color32(0, 0, 0, (byte)Mathf.RoundToInt(a * 255));
                }
            }
            wardrobe = new Texture2D(w, h, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Point };
            wardrobe.SetPixels32(px);
            wardrobe.Apply();
            return wardrobe;
        }

        /// <summary>
        /// #power-wheel: a 300 px disc (border-radius 50%), radial-gradient(circle, rgba(40,6,6,.55)
        /// to 22%, rgba(12,6,8,.82) from 23%); the circle's 100% is the farthest corner, 150√2 px.
        /// </summary>
        static Texture2D WheelDisc()
        {
            if (wheelDisc != null) return wheelDisc;
            const int N = 300;
            var inner = new Color(40 / 255f, 6 / 255f, 6 / 255f, 0.55f);
            var outer = new Color(12 / 255f, 6 / 255f, 8 / 255f, 0.82f);
            var px = new Color32[N * N];
            float full = 150 * Mathf.Sqrt(2);
            for (int y = 0; y < N; y++)
                for (int x = 0; x < N; x++)
                {
                    float dx = x + 0.5f - 150, dy = y + 0.5f - 150, r = Mathf.Sqrt(dx * dx + dy * dy);
                    float t = Mathf.Clamp01((r / full - 0.22f) / 0.01f);
                    Color c = Color.Lerp(inner, outer, t);
                    c.a *= Mathf.Clamp01(150 - r + 0.5f);
                    px[y * N + x] = c;
                }
            wheelDisc = new Texture2D(N, N, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
            wheelDisc.SetPixels32(px);
            wheelDisc.Apply();
            return wheelDisc;
        }
    }
}
