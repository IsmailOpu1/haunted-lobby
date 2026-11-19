using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using Haunted.Sim;

namespace Haunted.Game
{
    /// <summary>
    /// The menus (step E), one screen at a time as the browser's screens.ts and index.html have
    /// them: Start, Create, Join (E1), then Options, Mic check, the Room and its settings. Drawn with
    /// UI Toolkit from Resources/UI/Menus.uss, which follows client/src/style.css; the wording is the
    /// browser's. Back goes one step back, as the browser's Back buttons and history do.
    /// </summary>
    public partial class Menus
    {
        /// <summary>Asked to make a room (with the player's name) or join one (code, name).</summary>
        public Action<string> Create;
        public Action<string, string> Join;

        readonly VisualElement root;
        readonly Dictionary<string, VisualElement> screens = new Dictionary<string, VisualElement>();
        readonly Dictionary<string, Label> errors = new Dictionary<string, Label>();
        readonly List<string> history = new List<string>();
        readonly List<Button> enterButtons = new List<Button>();
        readonly object config;
        string shown = "";
        TextField createName, joinName, joinCode;
        VisualElement photoWarning;

        static readonly string[] Upper ={ "eyebrow", "field-name", "back", "photo-warning-title", "group-title", "range-name", "chip", "tag", "ready-mark", "tab", "set-title" };

        public Menus(object config)
        {
            this.config = config;
            var go = new GameObject("Menus");
            UnityEngine.Object.DontDestroyOnLoad(go);
            var doc = go.AddComponent<UIDocument>();
            // Drawn in gamma space into a texture of the window's size, which HauntedUi lays over
            // the picture as a browser blends a page (Unity's linear blending draws text heavier).
            panel = UnityEngine.Object.Instantiate(Resources.Load<PanelSettings>("UI/Panel"));
            panel.forceGammaRendering = true;
            panel.clearColor = true;
            panel.colorClearValue = Color.clear;
            // The texture covers the whole window at one texel a pixel, and the position given here is
            // already measured from the top, so the panel's space is the window's.
            panel.SetScreenToPanelSpaceFunction(p => p);
            Resize();
            doc.panelSettings = panel;
            root = doc.rootVisualElement;
            root.styleSheets.Add(Resources.Load<StyleSheet>("UI/Menus"));
            root.styleSheets.Add(Resources.Load<StyleSheet>("UI/Night"));
            root.pickingMode = PickingMode.Ignore;

            // Every character in every font drawn once, before any screen (KerningFix): glyphs join a
            // font's atlas as they are drawn, so this is drawn, clipped to one pixel in the corner.
            warmUp = new VisualElement { pickingMode = PickingMode.Ignore };
            warmUp.style.position = Position.Absolute;
            warmUp.style.width = 1;
            warmUp.style.height = 1;
            warmUp.style.overflow = Overflow.Hidden;
            foreach (var font in new[] { "", "sans-500", "sans-600", "sans-700", "serif", "serif-italic" })
            {
                var all = new Label(KerningFix.Characters) { enableRichText = false };
                if (font != "") all.AddToClassList(font);
                warmUp.Add(all);
            }
            warmUp.RegisterCallback<GeometryChangedEvent>(_ => warmLaidOut = true);
            root.Add(warmUp);

            BuildStart();
            BuildCreate();
            BuildJoin();
            BuildOptions();
            BuildRoom();
            BuildSettings();
            BuildMic();
            BuildNight();
            string name = PlayerPrefs.GetString("playerName", "");
            createName.value = joinName.value = name;
            Reset("start");
            Visible = true;
            Debug.Log("Menus built at " + Time.realtimeSinceStartup.ToString("0.00") + " s");
        }

        readonly PanelSettings panel;
        VisualElement warmUp;
        bool warmLaidOut, warm, nudge;
        int kerningCheck;

        /// <summary>Each frame: the menus' texture follows the window's size.</summary>
        public void Tick()
        {
            // The fonts' new kerning records cleared every few frames (KerningFix). When some were,
            // every text is drawn again: a 0.001 px word-spacing nudge, invisible, makes Unity
            // regenerate it with the cleared records.
            if (warmLaidOut && ++kerningCheck % 5 == 0)
            {
                int fixedNow = KerningFix.Run();
                if (fixedNow > 0)
                {
                    nudge = !nudge;
                    root.Query<TextElement>().ForEach(t => t.style.wordSpacing = nudge ? 0.001f : 0f);
                    if (!warm) Debug.Log("Kerning: " + KerningFix.Records + " pairs, " + fixedNow + " flags cleared, at " + Time.realtimeSinceStartup.ToString("0.00") + " s");
                }
                if (!warm && kerningCheck >= 60) { warm = true; warmUp.RemoveFromHierarchy(); }
            }
            if (updateLine.style.display == DisplayStyle.None && Release.Newer != null)
            {
                updateLine.text = "<line-height=18.75px>Version " + Release.Newer + " is out (you have " + Release.Version + "). Download it from itch.io.";
                updateLine.style.display = DisplayStyle.Flex;
                regapDue = true;
            }
            var rt = panel.targetTexture;
            if (rt == null || rt.width != UnityEngine.Screen.width || rt.height != UnityEngine.Screen.height) Resize();
            // Gaps once the columns are laid out (a panel's scheduler skips what was built before
            // it joined the panel).
            if (regapDue) { regapDue = false; RegapAll(); }
            TickMic();
            PollKeys();
        }

        void Resize()
        {
            var old = panel.targetTexture;
            var rt = new RenderTexture(Mathf.Max(1, UnityEngine.Screen.width), Mathf.Max(1, UnityEngine.Screen.height), 0, RenderTextureFormat.ARGB32, RenderTextureReadWrite.Linear) { name = "Menus" };
            rt.Create();
            panel.targetTexture = rt;
            if (HauntedUi.Texture == old) HauntedUi.Texture = rt;
            if (old != null) old.Release();
        }

        /// <summary>The screen shown now.</summary>
        public string Current => shown;

        /// <summary>Shows the menus or hides them all (once in a room, until step E3's room screen).</summary>
        public bool Visible
        {
            get => visible;
            set
            {
                visible = value;
                if (!value) StopListening();
                if (!value && openList != null) openList.style.display = DisplayStyle.None;
                foreach (var kv in screens) kv.Value.style.display = value && kv.Key == shown ? DisplayStyle.Flex : DisplayStyle.None;
                ShowPanel();
            }
        }

        bool visible;
        Label fps;

        /// <summary>
        /// The FPS counter (game.ts setFps, style.css #fps): over the night and the menus alike, or
        /// null to take it away.
        /// </summary>
        public string Fps
        {
            set
            {
                if (fps == null)
                {
                    fps = new Label { pickingMode = PickingMode.Ignore };
                    fps.AddToClassList("fps");
                    root.Add(fps);
                }
                fps.text = value ?? "";
                fps.style.display = value != null ? DisplayStyle.Flex : DisplayStyle.None;
                fps.BringToFront();
                ShowPanel();
            }
        }

        /// <summary>The panel is laid over the picture while a screen or the counter is up.</summary>
        void ShowPanel()
        {
            bool any = visible || nightOn || fps != null && fps.style.display == DisplayStyle.Flex;
            HauntedUi.Texture = any ? panel.targetTexture : null;
        }

        /// <summary>Opens a screen as a new step (Back returns from it).</summary>
        public void Go(string name)
        {
            if (!screens.ContainsKey(name) || name == shown) return;
            history.Add(shown);
            Show(name);
        }

        /// <summary>One step back, to the home screen at the bottom (Start; the room once in one, screens.ts setRoot).</summary>
        public void Back()
        {
            string to = history.Count > 0 ? history[history.Count - 1] : home;
            if (history.Count > 0) history.RemoveAt(history.Count - 1);
            Show(to == "" ? home : to);
        }

        /// <summary>Shows a screen with no step to go back to.</summary>
        public void Reset(string name)
        {
            history.Clear();
            Show(name);
        }

        /// <summary>An error, on the screen you are on (main.ts showError).</summary>
        public void ShowError(string message)
        {
            string on = errors.ContainsKey(shown) ? shown : "start";
            foreach (var kv in errors)
            {
                kv.Value.text = kv.Key == on ? message : "";
                kv.Value.style.display = kv.Key == on && message != "" ? DisplayStyle.Flex : DisplayStyle.None;
            }
            RegapAll();
        }

        /// <summary>While a room is being made or joined, its buttons wait.</summary>
        public void SetBusy(bool busy)
        {
            foreach (var b in enterButtons) b.SetEnabled(!busy);
        }

        void Show(string name)
        {
            if (!screens.ContainsKey(name)) name = "start";
            shown = name;
            StopListening();
            if (openList != null) openList.style.display = DisplayStyle.None;
            foreach (var kv in screens) kv.Value.style.display = visible && kv.Key == name ? DisplayStyle.Flex : DisplayStyle.None;
            if (name == "options") foreach (var view in optionViews) view();
            if (name == "room" || name == "settings") RoomShown();
            var screen = screens[name];
            var body = screen.Q<ScrollView>(className: "screen-body");
            if (body != null) body.scrollOffset = Vector2.zero;
            regapDue = true;
            Rise(body != null ? body.contentContainer : screen);
            // The keyboard on the screen's first empty field, so typing works straight away.
            var field = screen.Query<TextField>().Where(f => string.IsNullOrEmpty(f.value)).First();
            if (field != null) field.schedule.Execute(() => field.Focus());
        }

        /// <summary>Each part of a screen rises in, one after another (style.css screen-rise).</summary>
        static void Rise(VisualElement column)
        {
            int i = 0;
            foreach (var child in column.Children())
            {
                child.AddToClassList("rise");
                child.AddToClassList("before");
                float delay = Mathf.Min(i, 5) * 0.04f;
                child.style.transitionDelay = new List<TimeValue> { new TimeValue(delay), new TimeValue(delay) };
                i++;
            }
            column.schedule.Execute(() => { foreach (var child in column.Children()) child.RemoveFromClassList("before"); }).ExecuteLater(16);
        }

        // ---- Building blocks (index.html's elements) ----

        /// <summary>A whole screen: its backdrop, its grain, and a scrolling column of parts.</summary>
        VisualElement Screen(string name, out VisualElement column, bool wide = false)
        {
            var screen = new VisualElement { name = "screen-" + name };
            screen.AddToClassList("screen");
            // Before you are in a room the page behind is the browser's body colour (#050507).
            screen.AddToClassList("outside");
            var shade = new VisualElement { pickingMode = PickingMode.Ignore };
            shade.AddToClassList("screen-layer");
            shade.style.backgroundImage = ShadeFor(false);
            shade.AddToClassList("shade");
            shade.style.backgroundSize = new BackgroundSize(Length.Percent(100), Length.Percent(100));
            screen.Add(shade);
            var grain = new VisualElement { pickingMode = PickingMode.Ignore };
            grain.AddToClassList("screen-layer");
            grain.AddToClassList("grain");
            grain.style.backgroundImage = Grain;
            screen.Add(grain);
            var body = new ScrollView(ScrollViewMode.Vertical)
            {
                horizontalScrollerVisibility = ScrollerVisibility.Hidden,
                verticalScrollerVisibility = ScrollerVisibility.Auto,
            };
            body.AddToClassList("screen-body");
            if (wide) body.AddToClassList("wide");
            screen.Add(body);
            column = body.contentContainer;
            // style.css .screen-body padding: clamp(24px, 6vh, 64px) clamp(16px, 7vw, 104px).
            screen.RegisterCallback<GeometryChangedEvent>(e =>
            {
                float v = Mathf.Clamp(0.06f * e.newRect.height, 24, 64), hz = Mathf.Clamp(0.07f * e.newRect.width, 16, 104);
                var c = body.contentContainer.style;
                c.paddingTop = c.paddingBottom = v;
                c.paddingLeft = c.paddingRight = hz;
            });
            root.Add(screen);
            screens[name] = screen;
            return screen;
        }

        /// <summary>A line of text with the browser's classes; multi-line text gets its line height.</summary>
        static Label Text(VisualElement parent, string cls, string text, float lineHeight = 0)
        {
            var label = new Label { enableRichText = true };
            foreach (var c in cls.Split(' ')) if (c != "") label.AddToClassList(c);
            bool upper = Array.Exists(Upper, u => label.ClassListContains(u));
            string words = upper ? text.ToUpperInvariant() : text;
            label.text = lineHeight > 0 && words != "" ? "<line-height=" + lineHeight.ToString(System.Globalization.CultureInfo.InvariantCulture) + "px>" + words : words;
            if (lineHeight > 0)
            {
                label.userData = lineHeight;
                label.RegisterCallback<GeometryChangedEvent>(_ => Lead(label));
            }
            parent.Add(label);
            return label;
        }

        /// <summary>
        /// The browser's line boxes: the line-height tag spaces the lines after the first, and the
        /// label is made as tall as its lines at the browser's line height, with the text centred in
        /// it, so the first line sits in the middle of its line box as in CSS (Unity's own first line
        /// is about 1.47 of the font size, taller than some of the browser's line heights).
        /// </summary>
        static void Lead(Label label)
        {
            if (!(label.userData is float lineHeight)) return;
            float w = label.contentRect.width;
            if (float.IsNaN(w) || w <= 0) return;
            float h = 0;
            if (label.text != "")
            {
                float first = label.MeasureTextSize("X", 0, VisualElement.MeasureMode.Undefined, 0, VisualElement.MeasureMode.Undefined).y;
                float whole = label.MeasureTextSize(label.text, w, VisualElement.MeasureMode.Exactly, 0, VisualElement.MeasureMode.Undefined).y;
                h = Mathf.Max(1, Mathf.RoundToInt((whole - first) / lineHeight) + 1) * lineHeight;
                // A UI Toolkit height counts the padding and border (CSS's border-box), the
                // browser's line boxes do not: the walk hint's 10 px padding went otherwise.
                var s = label.resolvedStyle;
                h += s.paddingTop + s.paddingBottom + s.borderTopWidth + s.borderBottomWidth;
            }
            if (label.style.height != h) label.style.height = h;
            var align = label.resolvedStyle.unityTextAlign;
            var middle = align == TextAnchor.UpperCenter || align == TextAnchor.MiddleCenter || align == TextAnchor.LowerCenter ? TextAnchor.MiddleCenter
                : align == TextAnchor.UpperRight || align == TextAnchor.MiddleRight || align == TextAnchor.LowerRight ? TextAnchor.MiddleRight : TextAnchor.MiddleLeft;
            if (align != middle) label.style.unityTextAlign = middle;
        }

        /// <summary>A column's parts with the browser's gap between them (USS has no gap).</summary>
        static void Gap(VisualElement column, float gap)
        {
            gaps[column] = gap;
            regapDue = true;
        }

        /// <summary>Each column's gap, and each part's own bottom margin from the style sheet.</summary>
        static bool regapDue;
        static readonly Dictionary<VisualElement, float> gaps = new Dictionary<VisualElement, float>();
        static readonly Dictionary<VisualElement, float> ownMargin = new Dictionary<VisualElement, float>();

        /// <summary>The gap goes between the parts shown, as CSS's gap skips what is display: none.</summary>
        static void Regap(VisualElement column)
        {
            if (!gaps.TryGetValue(column, out float gap)) return;
            VisualElement last = null;
            foreach (var child in column.Children())
            {
                // A part never shown has no layout; it takes no gap, so it needs none.
                if (child.style.display == DisplayStyle.None && !ownMargin.ContainsKey(child)) continue;
                if (float.IsNaN(child.layout.width))
                {
                    // Not laid out yet: try again on the next frame.
                    regapDue = true;
                    return;
                }
                if (!ownMargin.ContainsKey(child)) ownMargin[child] = child.resolvedStyle.marginBottom;
                child.style.marginBottom = ownMargin[child];
                if (child.style.display == DisplayStyle.None) continue;
                if (last != null) last.style.marginBottom = ownMargin[last] + gap;
                last = child;
            }
        }

        /// <summary>After something in a column shows or hides.</summary>
        void RegapAll()
        {
            foreach (var column in gaps.Keys) Regap(column);
        }

        Button Primary(VisualElement parent, string text, Action click)
        {
            var b = new Button(click);
            b.AddToClassList("primary");
            var words = new Label(text) { pickingMode = PickingMode.Ignore };
            words.AddToClassList("primary-text");
            var arrow = new Label("→") { pickingMode = PickingMode.Ignore };
            arrow.AddToClassList("primary-arrow");
            b.Add(words);
            b.Add(arrow);
            parent.Add(b);
            return b;
        }

        Button BackButton(VisualElement parent, string text = "Back")
        {
            var b = new Button(Back) { text = "←  " + text.ToUpperInvariant() };
            b.AddToClassList("back");
            parent.Add(b);
            return b;
        }

        static Button Quiet(VisualElement parent, string text, Action click, bool small = false)
        {
            var b = new Button(click) { text = text };
            b.AddToClassList("quiet");
            if (small) b.AddToClassList("small");
            parent.Add(b);
            return b;
        }

        /// <summary>A labelled field: its name above a line to write on.</summary>
        static TextField Field(VisualElement parent, string name, string placeholder, int maxLength, bool code = false)
        {
            var field = new VisualElement();
            field.AddToClassList("field");
            Text(field, "field-name", name);
            var input = new TextField { maxLength = maxLength };
            input.AddToClassList("line-input");
            if (code) input.AddToClassList("code");
            input.textEdition.placeholder = placeholder;
            input.textEdition.hidePlaceholderOnFocus = false;
            field.Add(input);
            parent.Add(field);
            return input;
        }

        void Error(VisualElement parent, string screen)
        {
            var label = Text(parent, "error", "");
            label.style.display = DisplayStyle.None;
            errors[screen] = label;
        }

        // ---- The screens ----

        void BuildStart()
        {
            Screen("start", out var col);
            Text(col, "eyebrow", "A co-op horror night for 4 to 8 friends", 15);
            var mark = new VisualElement();
            mark.AddToClassList("wordmark");
            Text(mark, "wordmark-line", "Haunted");
            Text(mark, "wordmark-line em", "Lobby");
            col.Add(mark);
            var list = new VisualElement();
            list.AddToClassList("menu-list");
            MenuItem(list, "01", "Create a room", "Host a night and invite your friends", () => Go("create"));
            MenuItem(list, "02", "Join a room", "Got a code or a link from a friend?", () => Go("join"));
            MenuItem(list, "03", "Options", "Sound, keys and comfort", () => Go("options"));
            col.Add(list);

            photoWarning = new VisualElement();
            photoWarning.AddToClassList("photo-warning");
            Text(photoWarning, "photo-warning-title", "Photosensitivity warning", 17.25f);
            Text(photoWarning, "photo-warning-text", "This game has flickering lights and bright camera flashes. If flashing lights affect you, turn on photosensitivity mode. You can change it any time in Options.", 19.5f);
            var buttons = new VisualElement();
            buttons.AddToClassList("photo-warning-buttons");
            Quiet(buttons, "Turn it on", () => AnswerWarning(true), true);
            Quiet(buttons, "Continue", () => AnswerWarning(false), true);
            photoWarning.Add(buttons);
            col.Add(photoWarning);
            if (Options.PhotoWarningSeen) photoWarning.style.display = DisplayStyle.None;

            Error(col, "start");
            // The browser's line begins "No accounts, no downloads."; this version is a download.
            Text(col, "start-foot", "No accounts. The ghost hears your real microphone, so keep your voice down.", 18.75f);
            // Step F: a newer version on itch.io (Release.Check), shown once the answer comes.
            updateLine = Text(col, "start-foot update-line", "", 18.75f);
            updateLine.style.display = DisplayStyle.None;
            Gap(col, 16);
        }

        Label updateLine;

        /// <summary>Tests: the centre of the shown text or button, in screen pixels (y up), or null.</summary>
        public Vector2? ScreenPoint(string text)
        {
            string Plain(string t) => System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(t ?? "", "<[^>]+>", ""), @"\s+", " ").Trim();
            Func<VisualElement, bool> match = v => v.resolvedStyle.display != DisplayStyle.None &&
                (v is Label l && Plain(l.text) == Plain(text) || v is Button b && Plain(b.text) == Plain(text));
            var e = screens[shown].Query<VisualElement>().Where(match).First();
            // The open quality list lies over the screen, outside it.
            if (e == null && openList != null && openList.style.display == DisplayStyle.Flex)
            {
                var c2 = openList.Query<VisualElement>().Where(match).First()?.worldBound.center;
                return c2.HasValue ? new Vector2(c2.Value.x, UnityEngine.Screen.height - c2.Value.y) : (Vector2?)null;
            }
            if (e == null) return null;
            // Below the fold (the warning at 720 lines): scrolled to, as a player would.
            screens[shown].Q<ScrollView>(className: "screen-body")?.ScrollTo(e);
            var c = e.worldBound.center;
            return new Vector2(c.x, UnityEngine.Screen.height - c.y);
        }

        /// <summary>Tests: a point a share f along the shown screen's slider number i, in screen pixels (y up).</summary>
        public Vector2 RangePoint(int i, float f)
        {
            var slider = screens[shown].Query<VisualElement>(className: "range").ToList()[i];
            screens[shown].Q<ScrollView>(className: "screen-body")?.ScrollTo(slider);
            var r = slider.worldBound;
            return new Vector2(r.x + 8 + f * (r.width - 16), UnityEngine.Screen.height - r.center.y);
        }

        /// <summary>Tests: widths of a few letter pairs and of each letter alone, to see whether pairs are kerned.</summary>
        public string KerningLog()
        {
            // A laid-out paragraph on the shown screen (a fresh label has no style yet to measure with).
            var l = screens[shown].Query<Label>(className: "muted-line").First();
            if (l == null) return "Kerning: no paragraph on this screen";
            var sb = new System.Text.StringBuilder("Kerning:");
            foreach (var pair in new[] { "AV", "To", "Te", "yo", "ty", "LT" })
            {
                float Width(string t) => l.MeasureTextSize(t, 0, VisualElement.MeasureMode.Undefined, 0, VisualElement.MeasureMode.Undefined).x;
                sb.Append(" " + pair + " " + Width(pair).ToString("0.00") + " vs " + (Width(pair.Substring(0, 1)) + Width(pair.Substring(1))).ToString("0.00"));
            }
            // Spaces in capitals with letter-spacing (the eyebrow): "NOT READY" draws tight in Unity.
            var eyebrow = screens[shown].Query<Label>(className: "eyebrow").First();
            if (eyebrow != null)
            {
                float W(string t) => eyebrow.MeasureTextSize(t, 0, VisualElement.MeasureMode.Undefined, 0, VisualElement.MeasureMode.Undefined).x;
                sb.Append(" | eyebrow");
                foreach (var t in new[] { "T", "R", "M", " ", "TR", "T R", "M R", "MR", "T  R", "X" })
                    sb.Append(" [" + t + "] " + W(t).ToString("0.00"));
            }
            // The kerning records Unity made from the fonts, and the flag that drops letter-spacing.
            foreach (var fa in Resources.FindObjectsOfTypeAll<UnityEngine.TextCore.Text.FontAsset>())
            {
                var table = typeof(UnityEngine.TextCore.Text.FontAsset).GetProperty("fontFeatureTable", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic)?.GetValue(fa);
                var list = table?.GetType().GetProperty("glyphPairAdjustmentRecords", System.Reflection.BindingFlags.Instance | System.Reflection.BindingFlags.Public | System.Reflection.BindingFlags.NonPublic)?.GetValue(table) as System.Collections.IList;
                int flagged = 0;
                string sample = "";
                if (list != null)
                    foreach (var r in list)
                    {
                        var rec = (UnityEngine.TextCore.LowLevel.GlyphPairAdjustmentRecord)r;
                        if ((rec.featureLookupFlags & UnityEngine.TextCore.LowLevel.FontFeatureLookupFlags.IgnoreSpacingAdjustments) != 0) flagged++;
                        if (sample.Length < 120) sample += " " + rec.firstAdjustmentRecord.glyphIndex + "/" + rec.secondAdjustmentRecord.glyphIndex + ":" + rec.firstAdjustmentRecord.glyphValueRecord.xAdvance + ":" + rec.featureLookupFlags;
                    }
                Debug.Log("Kerning: font asset " + fa.name + " records " + (list == null ? "?" : list.Count.ToString()) + ", ignoring spacing " + flagged + sample);
            }
            // The room code's letter-spacing (0.2em at 84 px): "BXMRD" drew as "BXM R D".
            var code = new Label("BXMRD");
            code.AddToClassList("room-code");
            code.style.position = Position.Absolute;
            code.style.left = 700;
            code.style.top = 300;
            screens[shown].Add(code);
            code.schedule.Execute(() =>
            {
                float W(string t) => code.MeasureTextSize(t, 0, VisualElement.MeasureMode.Undefined, 0, VisualElement.MeasureMode.Undefined).x;
                var line = new System.Text.StringBuilder("Kerning: room code");
                foreach (var t in new[] { "B", "X", "M", "R", "D", "E", "N", "T", "BX", "XM", "MR", "RD", "EN", "NT", "TN", "BXMRD", "ENTNN", "HH", "H" })
                    line.Append(" [" + t + "] " + W(t).ToString("0.00"));
                Debug.Log(line.ToString());
            }).ExecuteLater(100);
            // Left drawn for the screenshot taken just after, then taken away.
            code.schedule.Execute(() => code.RemoveFromHierarchy()).ExecuteLater(3000);
            sb.Append(" | line \"default). From Valorant, multiply yours by 3.18.\" " + l.MeasureTextSize("default). From Valorant, multiply yours by 3.18.", 0, VisualElement.MeasureMode.Undefined, 0, VisualElement.MeasureMode.Undefined).x.ToString("0.00"));
            return sb.ToString();
        }

        /// <summary>Tests: the shown screen scrolled as far down as it goes.</summary>
        public void ScrollToEnd()
        {
            var body = screens[shown].Q<ScrollView>(className: "screen-body");
            if (body != null) body.scrollOffset = new Vector2(0, body.contentContainer.layout.height);
        }

        /// <summary>Tests: the centre of the shown screen's field number i, in screen pixels (y up).</summary>
        public Vector2 FieldPoint(int i)
        {
            var c = screens[shown].Query<TextField>().ToList()[i].worldBound.center;
            return new Vector2(c.x, UnityEngine.Screen.height - c.y);
        }

        /// <summary>Tests: logs where the panel sees each pointer press and key.</summary>
        public void LogPointers()
        {
            root.RegisterCallback<PointerDownEvent>(e => Debug.Log("Menu input: pointer down at " + e.position + " on " + (e.target as VisualElement)?.name + " " + string.Join(".", ((VisualElement)e.target).GetClasses())), TrickleDown.TrickleDown);
            root.RegisterCallback<KeyDownEvent>(e => Debug.Log("Menu input: key " + e.keyCode + " char " + (int)e.character + " focus " + string.Join(".", (root.focusController?.focusedElement as VisualElement)?.GetClasses() ?? new string[0])), TrickleDown.TrickleDown);
        }

        /// <summary>Tests: the shown screen's fields, top to bottom.</summary>
        public string[] FieldValues() => screens[shown].Query<TextField>().ToList().ConvertAll(f => f.value).ToArray();

        /// <summary>Tests: the error on the shown screen, or "".</summary>
        public string ShownError => errors.TryGetValue(shown, out var l) && l.style.display != DisplayStyle.None ? l.text : "";

        /// <summary>The first-launch warning is up.</summary>
        public bool WarningShown => photoWarning.style.display != DisplayStyle.None;

        /// <summary>Tests: takes the warning away without answering it.</summary>
        public void HideWarning()
        {
            photoWarning.style.display = DisplayStyle.None;
            RegapAll();
        }

        /// <summary>
        /// Tests: where each piece of text, field and button on the shown screen sits, as JSON lines
        /// (class, text, x, y, width, height in pixels, font size, letter spacing), to set beside the
        /// browser's getBoundingClientRect.
        /// </summary>
        public string Dump()
        {
            var sb = new System.Text.StringBuilder("[\n");
            var ci = System.Globalization.CultureInfo.InvariantCulture;
            bool first = true;
            screens[shown].Query<VisualElement>().ForEach(e =>
            {
                bool box = e.ClassListContains("range") || e.ClassListContains("group") || e.ClassListContains("field") || e.ClassListContains("setting") || e.ClassListContains("key-row") || e.ClassListContains("check")
                    || e.ClassListContains("player") || e.ClassListContains("avatar") || e.ClassListContains("tag") || e.ClassListContains("segmented") || e.ClassListContains("seg")
                    || e.ClassListContains("tabs") || e.ClassListContains("set-group") || e.ClassListContains("room-head") || e.ClassListContains("chip") || e.ClassListContains("look-hint");
                if (!(e is Label || e is TextField || e is Button || box) || e.resolvedStyle.display == DisplayStyle.None) return;
                var r = e.worldBound;
                if (r.width <= 0 || r.height <= 0) return;
                string text = e is Label l ? System.Text.RegularExpressions.Regex.Replace(l.text, "<[^>]+>", "") : e is TextField f ? f.value : e is Button bt ? bt.text : "";
                string cls = string.Join(".", e.GetClasses());
                if (!first) sb.Append(",\n");
                first = false;
                sb.AppendFormat(ci, " {{\"el\":\"{0}.{1}\",\"text\":\"{2}\",\"x\":{3:0.0},\"y\":{4:0.0},\"w\":{5:0.0},\"h\":{6:0.0},\"size\":{7:0.##},\"ls\":{8:0.##}}}",
                    e.GetType().Name, cls, (text ?? "").Replace("\\", "\\\\").Replace("\"", "\\\""), r.x, r.y, r.width, r.height, e.resolvedStyle.fontSize, e.resolvedStyle.letterSpacing);
            });
            return sb.Append("\n]\n").ToString();
        }

        void AnswerWarning(bool on)
        {
            if (on) { Options.Photosensitive = true; Options.Notify(); }
            Options.PhotoWarningSeen = true;
            photoWarning.style.display = DisplayStyle.None;
            RegapAll();
        }

        static void MenuItem(VisualElement list, string num, string title, string sub, Action click)
        {
            var b = new Button(click);
            b.AddToClassList("menu-item");
            Text(b, "menu-num", num).pickingMode = PickingMode.Ignore;
            var text = new VisualElement { pickingMode = PickingMode.Ignore };
            text.AddToClassList("menu-text");
            Text(text, "menu-text-strong", title).pickingMode = PickingMode.Ignore;
            Text(text, "menu-text-small", sub).pickingMode = PickingMode.Ignore;
            b.Add(text);
            list.Add(b);
        }

        void BuildCreate()
        {
            Screen("create", out var col);
            BackButton(col);
            Text(col, "eyebrow", "01 · Host", 15);
            Text(col, "screen-title", "Create a room");
            Text(col, "lead", "You get a 5-letter code and a link to send your friends. You choose the settings.", 23.25f);
            createName = Field(col, "Your name", "e.g. Rafi", NameMax);
            enterButtons.Add(Primary(col, "Create room", OnCreate));
            Error(col, "create");
            Gap(col, 16);
            OnEnter(createName, OnCreate);
        }

        // ---- Options (step E2): index.html's #screen-options, with main.ts's wiring ----

        static readonly Color Dim = new Color32(143, 137, 123, 255);
        /// <summary>The checked box's tick: the primary button's dark ink on brass.</summary>
        static readonly Color Ink = new Color32(21, 17, 10, 255);
        /// <summary>Redraws each control from Options (the warning may have turned photosensitivity on).</summary>
        readonly List<Action> optionViews = new List<Action>();
        Label qualityNote;
        VisualElement keyRows;
        string listeningAction;
        Button listeningButton;
        /// <summary>A key heard from the keyboard itself: the window's own key message for it is swallowed too.</summary>
        int heardFrame = -10;
        VisualElement openList;

        void BuildOptions()
        {
            Screen("options", out var col);
            BackButton(col);
            Text(col, "eyebrow", "Your choices on this computer", 15);
            Text(col, "screen-title", "Options");

            var sound = Group(col, "Sound");
            Range(sound, "Sound volume", 0, 100, 5, () => Options.Volume, v => v + "%", v => Options.Volume = (int)v);

            var comfort = Group(col, "Comfort");
            Check(comfort, "Photosensitivity mode", () => Options.Photosensitive, on => Options.Photosensitive = on);
            Text(comfort, "muted-line", "Flickering lights become a slow dimming and camera flashes become a soft glow.", 20.25f);
            Range(comfort, "Jump-scare volume", 0, 100, 5, () => Options.ScareVolume, v => v + "%", v => Options.ScareVolume = (int)v);
            Range(comfort, "Screen shake", 0, 100, 5, () => Options.Shake, v => v + "%", v => Options.Shake = (int)v);

            var controls = Group(col, "Controls");
            // main.ts: String(Math.round(v * 100) / 100), in a box where it can also be typed.
            Range(controls, "Mouse sensitivity", Options.SensitivityMin, Options.SensitivityMax, 0.05, () => Options.Sensitivity,
                v => Math.Round(v, 2).ToString("0.##", System.Globalization.CultureInfo.InvariantCulture), v => Options.Sensitivity = v, true);
            Text(controls, "muted-line", "The same scale as Counter-Strike (2.5 is its default). From Valorant, multiply yours by 3.18.", 20.25f);
            Range(controls, "Field of view", Options.FovMin, Options.FovMax, 1, () => Options.Fov, v => v + "°", v => Options.Fov = (int)v);

            var graphics = Group(col, "Graphics");
            Select(graphics, "Quality", new[] { "auto", "high", "low" }, new[] { "Auto", "High", "Low" }, () => Options.Quality, v => Options.Quality = v);
            qualityNote = Text(graphics, "muted-line", "", 20.25f);
            optionViews.Add(ShowQualityNote);
            Check(graphics, "Show FPS counter", () => Options.ShowFps, on => Options.ShowFps = on);
            // The speed test comes in step E6.
            BuildOptionsMic(col);

            var keys = Group(col, "Keys");
            Text(keys, "muted-line", "Click a key to change it, then press the new one. Esc cancels.", 20.25f);
            var table = new VisualElement();
            table.AddToClassList("controls");
            KeyRow(table, "Mouse", "Look");
            KeyRow(table, "Mouse button", "Flashlight on / off; with the camera raised, take the photo; at a task, your hand (point, hold to grab, move to work)");
            keyRows = new VisualElement();
            table.Add(keyRows);
            DrawKeyRows();
            KeyRow(table, "Esc", "Free the mouse and open the room menu");
            keys.Add(table);
            Quiet(keys, "Reset all keys", () =>
            {
                StopListening();
                Options.Keys.Reset();
                DrawKeyRows();
            }, true).AddToClassList("keys-reset");
            Gap(col, 16);

            // Listening for a new key: the window's key messages (and a test's) come as KeyDownEvents.
            root.RegisterCallback<KeyDownEvent>(e =>
            {
                if (listeningButton == null && Time.frameCount > heardFrame + 1) return;
                e.StopImmediatePropagation();
                root.focusController?.IgnoreEvent(e);
                if (listeningButton == null || e.keyCode == KeyCode.None) return;
                Heard(KeyInput.CodeOf(e.keyCode));
            }, TrickleDown.TrickleDown);
            root.RegisterCallback<NavigationMoveEvent>(e =>
            {
                if (listeningButton == null && Time.frameCount > heardFrame + 1) return;
                e.StopImmediatePropagation();
                root.focusController?.IgnoreEvent(e);
            }, TrickleDown.TrickleDown);
            // A click anywhere but the open quality list closes it, as a select's list does.
            root.RegisterCallback<PointerDownEvent>(e =>
            {
                if (openList == null || openList.style.display == DisplayStyle.None) return;
                if (e.target is VisualElement t && (openList.Contains(t) || t.ClassListContains("select"))) return;
                openList.style.display = DisplayStyle.None;
            }, TrickleDown.TrickleDown);
            // Scrolling moves the box away from its list: the list closes, as a select's does.
            root.RegisterCallback<WheelEvent>(_ =>
            {
                if (openList != null) openList.style.display = DisplayStyle.None;
            }, TrickleDown.TrickleDown);
        }

        /// <summary>Each frame while listening: a key from the keyboard (Shift alone, say, never reaches the window as a character).</summary>
        void PollKeys()
        {
            if (listeningButton == null) return;
            var k = UnityEngine.InputSystem.Keyboard.current;
            if (k == null) return;
            foreach (var key in k.allKeys)
            {
                if (key == null || !key.wasPressedThisFrame) continue;
                heardFrame = Time.frameCount;
                Heard(KeyInput.CodeOf(key.keyCode));
                return;
            }
        }

        void Heard(string code)
        {
            if (code == null || listeningButton == null) return;
            if (code != "Escape" && !Options.Keys.Set(listeningAction, code))
            {
                listeningButton.text = "Not that key";
                return;
            }
            StopListening();
            DrawKeyRows();
        }

        void StopListening()
        {
            if (listeningButton == null) return;
            listeningButton.RemoveFromClassList("listening");
            listeningButton.text = KeyBindings.KeyName(Options.Keys.Code(listeningAction));
            listeningButton = null;
            listeningAction = null;
        }

        /// <summary>Tests: whether a key button is waiting for its new key.</summary>
        public bool Listening => listeningButton != null;

        void DrawKeyRows()
        {
            keyRows.Clear();
            foreach (var a in KeyBindings.Actions)
            {
                string action = a[0];
                var row = new VisualElement();
                row.AddToClassList("key-row");
                var cell = new VisualElement();
                cell.AddToClassList("key-cell");
                Button b = null;
                b = new Button(() =>
                {
                    StopListening();
                    listeningAction = action;
                    listeningButton = b;
                    b.AddToClassList("listening");
                    b.text = "Press a key";
                }) { text = KeyBindings.KeyName(Options.Keys.Code(action)) };
                b.AddToClassList("key-button");
                cell.Add(b);
                row.Add(cell);
                Text(row, "key-what", a[1], 18.85f);
                keyRows.Add(row);
            }
        }

        static void KeyRow(VisualElement table, string key, string what)
        {
            var row = new VisualElement();
            row.AddToClassList("key-row");
            var cell = new VisualElement();
            cell.AddToClassList("key-cell");
            Text(cell, "key-fixed", key, 16.675f);
            row.Add(cell);
            Text(row, "key-what", what, 18.85f);
            table.Add(row);
        }

        void ShowQualityNote()
        {
            // main.ts applyQuality's note. Unity changes texture detail at once, so it never adds
            // "Texture detail changes the next time you open the game."
            string q = Options.Quality, picked = Options.AutoQuality;
            string text = q != "auto" ? "" : picked != null ? "Auto chose " + (picked == "high" ? "High" : "Low") + " for this computer." : "Auto tests this computer the first time you walk the hotel.";
            qualityNote.text = text == "" ? "" : "<line-height=20.25px>" + text;
            // An empty paragraph keeps its place (and the gaps round it) but no height.
            Lead(qualityNote);
        }

        /// <summary>A group: a line above, a small title, its parts 10 px apart.</summary>
        static VisualElement Group(VisualElement parent, string title)
        {
            var g = new VisualElement();
            g.AddToClassList("group");
            Text(g, "group-title", title);
            parent.Add(g);
            Gap(g, 10);
            return g;
        }

        /// <summary>A setting's row: its name, and the control on the right.</summary>
        static VisualElement Setting(VisualElement parent, string name)
        {
            var row = new VisualElement();
            row.AddToClassList("setting");
            Text(row, "setting-name", name);
            parent.Add(row);
            return row;
        }

        /// <summary>A checkbox at the end of a setting's row; the whole row toggles it, as a label does.</summary>
        void Check(VisualElement parent, string name, Func<bool> get, Action<bool> set)
        {
            var row = Setting(parent, name);
            var box = new VisualElement { pickingMode = PickingMode.Ignore };
            box.AddToClassList("check");
            box.generateVisualContent += ctx =>
            {
                if (!box.ClassListContains("on")) return;
                var p = ctx.painter2D;
                p.strokeColor = Ink;
                p.lineWidth = 1.8f;
                p.lineCap = LineCap.Round;
                p.lineJoin = LineJoin.Round;
                p.BeginPath();
                p.MoveTo(new Vector2(2.6f, 5.9f));
                p.LineTo(new Vector2(4.9f, 8.3f));
                p.LineTo(new Vector2(8.8f, 3.2f));
                p.Stroke();
            };
            row.Add(box);
            Action view = () => { box.EnableInClassList("on", get()); box.MarkDirtyRepaint(); };
            row.RegisterCallback<ClickEvent>(_ =>
            {
                set(!get());
                view();
                Options.Notify();
            });
            optionViews.Add(view);
            view();
        }

        /// <summary>
        /// A slider with its name and value above (or a box to type it in): Chrome's range input in
        /// brass, an 8 px track, filled up to a 16 px round thumb.
        /// </summary>
        void Range(VisualElement parent, string name, double min, double max, double step, Func<double> get, Func<double, string> show, Action<double> set, bool typed = false)
        {
            var field = new VisualElement();
            field.AddToClassList("range-field");
            var head = new VisualElement();
            head.AddToClassList("field-head");
            Text(head, "range-name", name);
            Label output = null;
            TextField box = null;
            if (typed)
            {
                box = new TextField();
                box.AddToClassList("number-box");
                head.Add(box);
            }
            else output = Text(head, "output", "");
            field.Add(head);

            var slider = new VisualElement { focusable = true };
            slider.AddToClassList("range");
            var track = new VisualElement { pickingMode = PickingMode.Ignore };
            track.AddToClassList("range-track");
            var fill = new VisualElement { pickingMode = PickingMode.Ignore };
            fill.AddToClassList("range-fill");
            var thumb = new VisualElement { pickingMode = PickingMode.Ignore };
            thumb.AddToClassList("range-thumb");
            slider.Add(track);
            slider.Add(fill);
            slider.Add(thumb);
            field.Add(slider);
            parent.Add(field);
            Gap(field, 6);

            double value = get();
            Action place = () =>
            {
                float w = slider.resolvedStyle.width;
                if (float.IsNaN(w)) return;
                float left = (float)((value - min) / (max - min)) * (w - 16);
                thumb.style.left = left;
                fill.style.width = left + 8;
            };
            Action view = () =>
            {
                value = get();
                if (output != null) output.text = show(value);
                if (box != null) box.SetValueWithoutNotify(show(value));
                place();
            };
            Action<double> change = v =>
            {
                v = Math.Min(max, Math.Max(min, v));
                if (v == value) return;
                value = v;
                set(v);
                view();
                Options.Notify();
            };
            // The value a point on the track stands for, on the slider's steps.
            Func<float, double> at = x =>
            {
                float w = slider.resolvedStyle.width;
                double f = Mathf.Clamp01((x - 8) / Mathf.Max(1, w - 16));
                return Math.Round(Math.Round(f * (max - min) / step) * step + min, 6);
            };
            slider.RegisterCallback<GeometryChangedEvent>(_ => place());
            slider.RegisterCallback<PointerDownEvent>(e =>
            {
                if (e.button != 0) return;
                slider.CapturePointer(e.pointerId);
                slider.Focus();
                change(at(e.localPosition.x));
            });
            slider.RegisterCallback<PointerMoveEvent>(e =>
            {
                if (slider.HasPointerCapture(e.pointerId)) change(at(e.localPosition.x));
            });
            slider.RegisterCallback<PointerUpEvent>(e =>
            {
                if (slider.HasPointerCapture(e.pointerId)) slider.ReleasePointer(e.pointerId);
            });
            // Arrow keys step it, as a focused range does.
            slider.RegisterCallback<KeyDownEvent>(e =>
            {
                int dir = e.keyCode == KeyCode.RightArrow || e.keyCode == KeyCode.UpArrow ? 1 : e.keyCode == KeyCode.LeftArrow || e.keyCode == KeyCode.DownArrow ? -1 : 0;
                if (dir == 0) return;
                change(Math.Round(value + dir * step, 6));
                e.StopPropagation();
            });
            if (box != null)
            {
                // main.ts: a typed value is kept within the limits; anything else puts the old one back.
                Action typedIn = () =>
                {
                    double v;
                    if (double.TryParse(box.value.Trim(), System.Globalization.NumberStyles.Float, System.Globalization.CultureInfo.InvariantCulture, out v) && !double.IsNaN(v) && !double.IsInfinity(v)) change(v);
                    view();
                };
                box.RegisterCallback<FocusOutEvent>(_ => typedIn());
                box.RegisterCallback<KeyDownEvent>(e =>
                {
                    if (e.keyCode == KeyCode.Return || e.keyCode == KeyCode.KeypadEnter) typedIn();
                }, TrickleDown.TrickleDown);
            }
            optionViews.Add(view);
            view();
        }

        /// <summary>A setting's list to choose from, drawn as the browser's select: a box with a chevron, its list below.</summary>
        Button Select(VisualElement parent, string name, string[] values, string[] labels, Func<string> get, Action<string> set, List<Action> views = null, Action notify = null)
        {
            var row = Setting(parent, name);
            var button = new Button();
            button.AddToClassList("select");
            var shown = new Label { pickingMode = PickingMode.Ignore };
            shown.AddToClassList("select-text");
            button.Add(shown);
            var chevron = new VisualElement { pickingMode = PickingMode.Ignore };
            chevron.AddToClassList("select-chevron");
            // style.css: an SVG path M1 1l4 4 4-4, stroke #8f897b, 1.4 wide, in a 10 x 6 box.
            chevron.generateVisualContent += ctx =>
            {
                var p = ctx.painter2D;
                p.strokeColor = Dim;
                p.lineWidth = 1.4f;
                p.BeginPath();
                p.MoveTo(new Vector2(1, 1));
                p.LineTo(new Vector2(5, 5));
                p.LineTo(new Vector2(9, 1));
                p.Stroke();
            };
            button.Add(chevron);
            row.Add(button);

            var list = new VisualElement();
            list.AddToClassList("select-list");
            list.style.display = DisplayStyle.None;
            Action view = () =>
            {
                int i = Array.IndexOf(values, get());
                shown.text = labels[Math.Max(0, i)];
                foreach (var child in list.Children()) child.EnableInClassList("chosen", (string)child.userData == get());
            };
            for (int i = 0; i < values.Length; i++)
            {
                string v = values[i];
                var option = new Button(() =>
                {
                    list.style.display = DisplayStyle.None;
                    if (v != get()) { set(v); (notify ?? Options.Notify)(); }
                    foreach (var f in views ?? optionViews) f();
                }) { text = labels[i], userData = v };
                option.AddToClassList("select-option");
                list.Add(option);
            }
            button.clicked += () =>
            {
                if (list.style.display == DisplayStyle.Flex) { list.style.display = DisplayStyle.None; return; }
                if (openList != null) openList.style.display = DisplayStyle.None;
                openList = list;
                // Laid over everything, just under the box, as wide as it.
                var r = button.worldBound;
                list.style.left = r.x;
                // Above the box when there is no room below it, as a select's list opens.
                float height = values.Length * 26 + 6;
                list.style.top = r.yMax + height <= root.worldBound.height ? r.yMax : r.y - height;
                list.style.width = r.width;
                list.style.display = DisplayStyle.Flex;
                list.BringToFront();
            };
            root.Add(list);
            (views ?? optionViews).Add(view);
            view();
            return button;
        }

        void BuildJoin()
        {
            Screen("join", out var col);
            BackButton(col);
            Text(col, "eyebrow", "02 · Join", 15);
            Text(col, "screen-title", "Join a room");
            Text(col, "lead", "Type the code your friend sent you.", 23.25f);
            joinCode = Field(col, "Room code", "KQXRT", CodeLength, true);
            joinCode.RegisterValueChangedCallback(e => { string up = (e.newValue ?? "").ToUpperInvariant(); if (up != e.newValue) joinCode.SetValueWithoutNotify(up); });
            joinName = Field(col, "Your name", "e.g. Rafi", NameMax);
            enterButtons.Add(Primary(col, "Join room", OnJoin));
            Error(col, "join");
            Gap(col, 16);
            OnEnter(joinCode, OnJoin);
            OnEnter(joinName, OnJoin);
        }

        static void OnEnter(TextField field, Action action) =>
            field.RegisterCallback<KeyDownEvent>(e => { if (e.keyCode == KeyCode.Return || e.keyCode == KeyCode.KeypadEnter) action(); }, TrickleDown.TrickleDown);

        // ---- Making and joining (main.ts readName, the Create and Join buttons) ----

        int NameMax => (int)Json.Num(Json.Obj(config, "room"), "nameMaxLength");
        int CodeLength => (int)Json.Num(Json.Obj(config, "room"), "codeLength");

        /// <summary>roomCode.ts cleanPlayerName: trimmed, 1 to nameMaxLength characters; else an error.</summary>
        string ReadName(TextField input)
        {
            string name = (input.value ?? "").Trim();
            if (name.Length == 0 || name.Length > NameMax)
            {
                ShowError("Type a name (1 to " + NameMax + " characters).");
                input.Focus();
                return null;
            }
            PlayerPrefs.SetString("playerName", name);
            PlayerPrefs.Save();
            createName.SetValueWithoutNotify(name);
            joinName.SetValueWithoutNotify(name);
            return name;
        }

        void OnCreate()
        {
            if (!enterButtons[0].enabledSelf) return;
            string name = ReadName(createName);
            if (name != null) { ShowError(""); Create?.Invoke(name); }
        }

        void OnJoin()
        {
            if (!enterButtons[1].enabledSelf) return;
            string name = ReadName(joinName);
            if (name == null) return;
            string code = (joinCode.value ?? "").Trim().ToUpperInvariant();
            if (!ValidCode(code))
            {
                ShowError("Room codes are 5 letters, like KQXRT.");
                joinCode.Focus();
                return;
            }
            ShowError("");
            Join?.Invoke(code, name);
        }

        /// <summary>roomCode.ts isValidRoomCode.</summary>
        bool ValidCode(string code)
        {
            string alphabet = Json.Text(Json.Obj(config, "room"), "codeAlphabet");
            if (code.Length != CodeLength) return false;
            foreach (char c in code) if (alphabet.IndexOf(c) < 0) return false;
            return true;
        }

        /// <summary>lobbyView.ts joinErrorText: a join error in words a player understands (FR-L9).</summary>
        public string JoinErrorText(string message)
        {
            message = message ?? "";
            int max = (int)Json.Num(Json.Obj(config, "players"), "max");
            var ignore = System.Text.RegularExpressions.RegexOptions.IgnoreCase;
            if (System.Text.RegularExpressions.Regex.IsMatch(message, "full|locked|maxClients", ignore))
                return "This room is full (" + max + " players) or its night has started.";
            if (System.Text.RegularExpressions.Regex.IsMatch(message, "not found|invalid|no rooms", ignore))
                return "No room has that code. Check the code and try again.";
            return message != "" ? message : "Could not connect to the server.";
        }

        // ---- The backdrop (style.css .screen and .screen::before) ----

        static Texture2D shade, roomShade, grain;

        /// <summary>
        /// The screens' shade (style.css .screen): a dark gradient from the left (0.97 to 0.3 cover of
        /// #08070a) over a vignette (an ellipse at 75% 45%, clear to 30% then to 0.7 black at its
        /// edge), as one colour and cover, in sRGB, for a 16:9 window. In a room the gradient is
        /// darker (body.in-room .screen), as the hotel is behind it.
        /// </summary>
        static Texture2D ShadeFor(bool inRoom)
        {
            {
                if (!inRoom && shade != null) return shade;
                if (inRoom && roomShade != null) return roomShade;
                const int W = 640, H = 360;
                var px = new Color32[W * H];
                float cx = 0.75f * W, cy = 0.45f * H;
                float rx = Mathf.Sqrt(2) * Mathf.Max(cx, W - cx), ry = Mathf.Sqrt(2) * Mathf.Max(cy, H - cy);
                float[] ink = { 8, 7, 10 };
                for (int y = 0; y < H; y++)
                    for (int x = 0; x < W; x++)
                    {
                        float u = (x + 0.5f) / W;
                        // In a room: 0.98 to 0.94 at 55% to 0.84, over the hotel.
                        float a1 = inRoom ? (u < 0.55f ? Mathf.Lerp(0.98f, 0.94f, u / 0.55f) : Mathf.Lerp(0.94f, 0.84f, (u - 0.55f) / 0.45f))
                            : u < 0.34f ? Mathf.Lerp(0.97f, 0.9f, u / 0.34f) : u < 0.68f ? Mathf.Lerp(0.9f, 0.55f, (u - 0.34f) / 0.34f) : Mathf.Lerp(0.55f, 0.3f, (u - 0.68f) / 0.32f);
                        float dx = (x + 0.5f - cx) / rx, dy = (y + 0.5f - cy) / ry;
                        float t = Mathf.Sqrt(dx * dx + dy * dy);
                        float a2 = t <= 0.3f ? 0 : Mathf.Min(1, (t - 0.3f) / 0.7f) * 0.7f;
                        float a = a1 + a2 * (1 - a1), k = a > 0 ? a1 / a : 1;
                        px[(H - 1 - y) * W + x] = new Color32((byte)Mathf.RoundToInt(ink[0] * k), (byte)Mathf.RoundToInt(ink[1] * k), (byte)Mathf.RoundToInt(ink[2] * k), (byte)Mathf.RoundToInt(a * 255));
                    }
                var tex = new Texture2D(W, H, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
                tex.SetPixels32(px);
                tex.Apply();
                if (inRoom) roomShade = tex; else shade = tex;
                return tex;
            }
        }

        /// <summary>
        /// The film grain (style.css .screen::before: feTurbulence at 0.07), a 160 px tile. Matched to
        /// what the browser draws over its dark menus: +6.3 levels on average, spread 1.8, each pixel
        /// and colour its own; here a 0.035 cover of a colour near 186.
        /// </summary>
        static Texture2D Grain
        {
            get
            {
                if (grain != null) return grain;
                const int N = 160;
                var rng = new System.Random(7);
                var px = new Color32[N * N];
                byte cover = 9;
                float mean = 6.3f / (cover / 255f) + 6, spread = 1.8f / (cover / 255f);
                byte Level()
                {
                    double u1 = 1 - rng.NextDouble(), u2 = rng.NextDouble();
                    double n = Math.Sqrt(-2 * Math.Log(u1)) * Math.Cos(2 * Math.PI * u2);
                    return (byte)Mathf.Clamp(Mathf.RoundToInt(mean + (float)n * spread), 0, 255);
                }
                for (int i = 0; i < px.Length; i++) px[i] = new Color32(Level(), Level(), Level(), cover);
                grain = new Texture2D(N, N, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Repeat, filterMode = FilterMode.Point };
                grain.SetPixels32(px);
                grain.Apply();
                return grain;
            }
        }
    }
}
