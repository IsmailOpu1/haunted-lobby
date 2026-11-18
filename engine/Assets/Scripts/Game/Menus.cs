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
    public class Menus
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

        const float ManropeLine = (2132f + 600f) / 2000f;
        static readonly string[] Upper ={ "eyebrow", "field-name", "back", "photo-warning-title" };

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
            root.pickingMode = PickingMode.Ignore;

            BuildStart();
            BuildCreate();
            BuildJoin();
            string name = PlayerPrefs.GetString("playerName", "");
            createName.value = joinName.value = name;
            Reset("start");
            Visible = true;
        }

        readonly PanelSettings panel;

        /// <summary>Each frame: the menus' texture follows the window's size.</summary>
        public void Tick()
        {
            var rt = panel.targetTexture;
            if (rt == null || rt.width != UnityEngine.Screen.width || rt.height != UnityEngine.Screen.height) Resize();
            // Gaps once the columns are laid out (a panel's scheduler skips what was built before
            // it joined the panel).
            if (regapDue) { regapDue = false; RegapAll(); }
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
            get => root.style.display != DisplayStyle.None;
            set
            {
                root.style.display = value ? DisplayStyle.Flex : DisplayStyle.None;
                HauntedUi.Texture = value ? panel.targetTexture : null;
            }
        }

        /// <summary>Opens a screen as a new step (Back returns from it).</summary>
        public void Go(string name)
        {
            if (!screens.ContainsKey(name) || name == shown) return;
            history.Add(shown);
            Show(name);
        }

        /// <summary>One step back, to the start screen at the bottom.</summary>
        public void Back()
        {
            string to = history.Count > 0 ? history[history.Count - 1] : "start";
            if (history.Count > 0) history.RemoveAt(history.Count - 1);
            Show(to == "" ? "start" : to);
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
            foreach (var kv in screens) kv.Value.style.display = kv.Key == name ? DisplayStyle.Flex : DisplayStyle.None;
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
            shade.style.backgroundImage = Shade;
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
                // The line-height tag spaces the lines after the first; the browser also centres the
                // first line in its line box, so half the leading goes above and below (Manrope's
                // ascent plus descent is 1.366 of its size).
                EventCallback<GeometryChangedEvent> lead = null;
                lead = _ =>
                {
                    label.UnregisterCallback(lead);
                    float half = Mathf.Max(0, (lineHeight - ManropeLine * label.resolvedStyle.fontSize) / 2);
                    label.style.paddingTop = half;
                    label.style.paddingBottom = half;
                };
                label.RegisterCallback(lead);
            }
            parent.Add(label);
            return label;
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
            if (PlayerPrefs.HasKey("photoWarningSeen")) photoWarning.style.display = DisplayStyle.None;

            Error(col, "start");
            // The browser's line begins "No accounts, no downloads."; this version is a download.
            Text(col, "start-foot", "No accounts. The ghost hears your real microphone, so keep your voice down.", 18.75f);
            Gap(col, 16);
        }

        /// <summary>Tests: the centre of the shown text or button, in screen pixels (y up), or null.</summary>
        public Vector2? ScreenPoint(string text)
        {
            string Plain(string t) => System.Text.RegularExpressions.Regex.Replace(System.Text.RegularExpressions.Regex.Replace(t ?? "", "<[^>]+>", ""), @"\s+", " ").Trim();
            var e = screens[shown].Query<VisualElement>().Where(v => v.resolvedStyle.display != DisplayStyle.None &&
                (v is Label l && Plain(l.text) == Plain(text) || v is Button b && Plain(b.text) == Plain(text))).First();
            if (e == null) return null;
            // Below the fold (the warning at 720 lines): scrolled to, as a player would.
            screens[shown].Q<ScrollView>(className: "screen-body")?.ScrollTo(e);
            var c = e.worldBound.center;
            return new Vector2(c.x, UnityEngine.Screen.height - c.y);
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
                if (!(e is Label || e is TextField || e is Button) || e.resolvedStyle.display == DisplayStyle.None) return;
                var r = e.worldBound;
                if (r.width <= 0 || r.height <= 0) return;
                string text = e is Label l ? System.Text.RegularExpressions.Regex.Replace(l.text, "<[^>]+>", "") : e is TextField f ? f.value : ((Button)e).text;
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
            if (on) PlayerPrefs.SetInt("photosensitive", 1);
            PlayerPrefs.SetString("photoWarningSeen", "1");
            PlayerPrefs.Save();
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

        static Texture2D shade, grain;

        /// <summary>
        /// The screens' shade (style.css .screen): a dark gradient from the left (0.97 to 0.3 cover of
        /// #08070a) over a vignette (an ellipse at 75% 45%, clear to 30% then to 0.7 black at its
        /// edge), as one colour and cover, in sRGB, for a 16:9 window.
        /// </summary>
        static Texture2D Shade
        {
            get
            {
                if (shade != null) return shade;
                const int W = 640, H = 360;
                var px = new Color32[W * H];
                float cx = 0.75f * W, cy = 0.45f * H;
                float rx = Mathf.Sqrt(2) * Mathf.Max(cx, W - cx), ry = Mathf.Sqrt(2) * Mathf.Max(cy, H - cy);
                float[] ink = { 8, 7, 10 };
                for (int y = 0; y < H; y++)
                    for (int x = 0; x < W; x++)
                    {
                        float u = (x + 0.5f) / W;
                        float a1 = u < 0.34f ? Mathf.Lerp(0.97f, 0.9f, u / 0.34f) : u < 0.68f ? Mathf.Lerp(0.9f, 0.55f, (u - 0.34f) / 0.34f) : Mathf.Lerp(0.55f, 0.3f, (u - 0.68f) / 0.32f);
                        float dx = (x + 0.5f - cx) / rx, dy = (y + 0.5f - cy) / ry;
                        float t = Mathf.Sqrt(dx * dx + dy * dy);
                        float a2 = t <= 0.3f ? 0 : Mathf.Min(1, (t - 0.3f) / 0.7f) * 0.7f;
                        float a = a1 + a2 * (1 - a1), k = a > 0 ? a1 / a : 1;
                        px[(H - 1 - y) * W + x] = new Color32((byte)Mathf.RoundToInt(ink[0] * k), (byte)Mathf.RoundToInt(ink[1] * k), (byte)Mathf.RoundToInt(ink[2] * k), (byte)Mathf.RoundToInt(a * 255));
                    }
                shade = new Texture2D(W, H, TextureFormat.RGBA32, false, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
                shade.SetPixels32(px);
                shade.Apply();
                return shade;
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
