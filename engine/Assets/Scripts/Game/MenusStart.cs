using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.UIElements;
using Haunted.Sim;

namespace Haunted.Game
{
    /// <summary>
    /// The title screen as a game's (owner, 2026-11-27: "start game, options, about, quit game", an
    /// animated horror background, "modern"): everything centred over the hotel (TitleBackdrop),
    /// the name large, four choices that light up in brass with a rule growing out either side,
    /// picked with the mouse or the arrow keys and Enter, and one line under them saying what the
    /// choice does. Start game opens a second list (Create a room, Join a room); About says what
    /// the game is, how a night goes and who made what. Esc goes back on every screen outside a room.
    /// </summary>
    public partial class Menus
    {
        /// <summary>A list of choices on a title screen, with the one picked and its hint line.</summary>
        class TitleList
        {
            public readonly List<Button> Items = new List<Button>();
            public readonly List<string> Hints = new List<string>();
            public Label Hint;
            public int Picked = -1;
        }

        readonly Dictionary<string, TitleList> titleLists = new Dictionary<string, TitleList>();
        /// <summary>Start's choices and hint, hidden while the photosensitivity warning is up.</summary>
        readonly List<VisualElement> hiddenByWarning = new List<VisualElement>();

        /// <summary>Whether a title screen (Start, Start game, About) is shown.</summary>
        public bool TitleShown => visible && titleLists.ContainsKey(shown);

        void BuildStart()
        {
            var col = TitleScreen("start");
            Text(col, "eyebrow title-eyebrow", "A co-op horror night for 4 to 8 friends");
            var mark = new VisualElement();
            mark.AddToClassList("title-mark");
            // On one line, as a game's logo.
            Text(mark, "title-word", "Haunted");
            Text(mark, "title-word em", "Lobby");
            col.Add(mark);

            photoWarning = new VisualElement();
            photoWarning.AddToClassList("photo-warning");
            photoWarning.AddToClassList("title-warning");
            Text(photoWarning, "photo-warning-title", "Photosensitivity warning", 17.25f);
            Text(photoWarning, "photo-warning-text", "This game has flickering lights and bright camera flashes. If flashing lights affect you, turn on photosensitivity mode. You can change it any time in Options.", 19.5f);
            var buttons = new VisualElement();
            buttons.AddToClassList("photo-warning-buttons");
            Quiet(buttons, "Turn it on", () => AnswerWarning(true), true);
            Quiet(buttons, "Continue", () => AnswerWarning(false), true);
            photoWarning.Add(buttons);
            col.Add(photoWarning);
            if (Options.PhotoWarningSeen) photoWarning.style.display = DisplayStyle.None;

            TitleItems(col, "start",
                ("Start game", "Host a night, or join your friends with a code", () => Go("play")),
                ("Options", "Sound, keys, comfort and the speed test", () => Go("options")),
                ("About", "What this is, how a night goes, and who made it", () => Go("about")),
                ("Quit game", "Back to the desktop", Quit));

            // While the warning is up it stands where the choices are; they come once it is answered.
            hiddenByWarning.Add(col.Q(className: "title-list"));
            hiddenByWarning.Add(titleLists["start"].Hint);

            Error(col, "start");
            Text(col, "start-foot title-foot", "No accounts. The ghost hears your real microphone, so keep your voice down.", 18.75f);
            // Step F: a newer version on itch.io (Release.Check), shown once the answer comes.
            updateLine = Text(col, "start-foot title-foot update-line", "", 18.75f);
            updateLine.style.display = DisplayStyle.None;
            Text(col, "title-version", "Version " + Release.Version);
            Gap(col, 14);
        }

        /// <summary>Start game: make a room or join one, each on its own screen as before.</summary>
        void BuildPlay()
        {
            var col = TitleScreen("play");
            Text(col, "eyebrow title-eyebrow", "Start game");
            Text(col, "title-heading", "Who hosts tonight?");
            TitleItems(col, "play",
                ("Create a room", "Host a night and invite your friends", () => Go("create")),
                ("Join a room", "Got a code from a friend?", () => Go("join")),
                ("Back", "To the title", Back));
            Gap(col, 14);
        }

        /// <summary>About: the game in a few lines, a night's shape, the controls, and the credits.</summary>
        void BuildAbout()
        {
            var col = TitleScreen("about");
            Text(col, "eyebrow title-eyebrow", "About");
            Text(col, "title-heading", "Haunted Lobby");
            var page = new VisualElement();
            page.AddToClassList("about-page");
            AboutPart(page, "The game", "A co-op horror night for 4 to 8 friends in an old hotel. A ghost hunts you through the dark, one of you is secretly possessed, and the ghost hears your real microphone: talk, and it comes.");
            AboutPart(page, "A night", "Do the hotel's tasks, gather the relics, open the basement and finish the ritual before dawn. The possessed wins by stopping it. Every sabotage leaves a clue: catch it on the spirit camera and call a meeting. Hide when the ghost hunts.");
            aboutControls = AboutPart(page, "Controls", "");
            AboutPart(page, "Made with", "Unity, Colyseus and LiveKit. The hotel's furniture and textures are from Poly Haven (CC0); every outside asset and its licence is listed in docs/ASSETS.md.");
            col.Add(page);
            TitleItems(col, "about", ("Back", "To the title", Back));
            Gap(col, 14);
        }

        static Label AboutPart(VisualElement page, string title, string words)
        {
            var part = new VisualElement();
            part.AddToClassList("about-part");
            Text(part, "eyebrow about-title", title);
            var text = Text(part, "about-text", words, 21);
            page.Add(part);
            return text;
        }

        Label aboutControls;

        /// <summary>About's controls line, with the keys as they are bound now (Show calls it).</summary>
        void AboutShown()
        {
            aboutControls.text = "<line-height=21px>Move with " + KeyList("forward", "left", "back", "right") + ", run with " + KeyList("run")
                + ", crouch with " + KeyList("crouch") + ". Every key can be changed in Options.";
        }

        /// <summary>The keys bound to some actions, as "W, A, S and D".</summary>
        static string KeyList(params string[] actions)
        {
            var names = new List<string>();
            foreach (var a in actions)
            {
                string code = Options.Keys.Code(a);
                if (code != null) names.Add(KeyBindings.KeyName(code));
            }
            if (names.Count == 0) return "the keys in Options";
            return names.Count == 1 ? names[0] : string.Join(", ", names.GetRange(0, names.Count - 1)) + " and " + names[names.Count - 1];
        }

        /// <summary>A title screen: centred over the hotel, darker towards the edges.</summary>
        VisualElement TitleScreen(string name)
        {
            var screen = Screen(name, out var col);
            screen.AddToClassList("title-screen");
            var shade = screen.Q(className: "shade");
            if (shade != null) shade.style.backgroundImage = TitleVignette;
            var body = screen.Q<ScrollView>(className: "screen-body");
            body.AddToClassList("title-body");
            body.verticalScrollerVisibility = ScrollerVisibility.Hidden;
            col.AddToClassList("title-column");
            return col;
        }

        /// <summary>The choices, large and centred; each lights up when pointed at or picked with the keys.</summary>
        void TitleItems(VisualElement col, string screen, params (string title, string hint, Action click)[] items)
        {
            var list = new TitleList();
            var box = new VisualElement();
            box.AddToClassList("title-list");
            for (int i = 0; i < items.Length; i++)
            {
                int index = i;
                var b = new Button(items[i].click);
                b.AddToClassList("title-item");
                var left = new VisualElement { pickingMode = PickingMode.Ignore };
                left.AddToClassList("title-rule");
                b.Add(left);
                var words = new Label(items[i].title.ToUpperInvariant()) { pickingMode = PickingMode.Ignore };
                words.AddToClassList("title-item-text");
                b.Add(words);
                var right = new VisualElement { pickingMode = PickingMode.Ignore };
                right.AddToClassList("title-rule");
                b.Add(right);
                b.RegisterCallback<PointerEnterEvent>(_ => Pick(list, index));
                b.RegisterCallback<FocusInEvent>(_ => Pick(list, index));
                box.Add(b);
                list.Items.Add(b);
                list.Hints.Add(items[i].hint);
            }
            col.Add(box);
            list.Hint = Text(col, "title-hint", " ");
            titleLists[screen] = list;
            Pick(list, 0);
        }

        static void Pick(TitleList list, int index)
        {
            if (index == list.Picked) return;
            list.Picked = index;
            for (int i = 0; i < list.Items.Count; i++) list.Items[i].EnableInClassList("on", i == index);
            list.Hint.text = list.Hints[index];
        }

        /// <summary>Each frame: arrows or W/S move the pick, Enter or Space takes it; Esc goes back outside a room.</summary>
        void TickTitle()
        {
            var showChoices = WarningShown ? DisplayStyle.None : DisplayStyle.Flex;
            foreach (var e in hiddenByWarning)
                if (e.style.display != showChoices) { e.style.display = showChoices; regapDue = true; }
            if (!visible || Listening || heardFrame == Time.frameCount || openedFrame >= Time.frameCount - 1) return;
            var k = UnityEngine.InputSystem.Keyboard.current;
            if (k == null) return;
            bool typing = root.focusController?.focusedElement is TextField || root.focusController?.focusedElement is TextElement && (root.focusController.focusedElement as VisualElement)?.GetFirstAncestorOfType<TextField>() != null;
            if (titleLists.TryGetValue(shown, out var list) && !(shown == "start" && WarningShown))
            {
                int n = list.Items.Count;
                if (k.downArrowKey.wasPressedThisFrame || k.sKey.wasPressedThisFrame) Pick(list, (list.Picked + 1) % n);
                else if (k.upArrowKey.wasPressedThisFrame || k.wKey.wasPressedThisFrame) Pick(list, (list.Picked + n - 1) % n);
                else if (k.enterKey.wasPressedThisFrame || k.numpadEnterKey.wasPressedThisFrame || k.spaceKey.wasPressedThisFrame)
                {
                    using (var e = NavigationSubmitEvent.GetPooled()) { e.target = list.Items[list.Picked]; list.Items[list.Picked].SendEvent(e); }
                    return;
                }
            }
            // Esc: one step back on the screens before a room (in a room the game has its own Esc).
            if (k.escapeKey.wasPressedThisFrame && home == "start" && shown != "start" && (!typing || shown == "create" || shown == "join"))
                Back();
        }

        /// <summary>Quit game: the window closes (in the editor, play stops).</summary>
        static void Quit()
        {
#if UNITY_EDITOR
            UnityEditor.EditorApplication.isPlaying = false;
#else
            Application.Quit();
#endif
        }

        static Texture2D titleVignette;

        /// <summary>
        /// Over the hotel behind a title screen: dark in the middle where the words are, darker still
        /// at the edges, so the words read and the corridor shows round them like a view through a door.
        /// </summary>
        static Texture2D TitleVignette
        {
            get
            {
                if (titleVignette != null) return titleVignette;
                const int w = 320, h = 180;
                titleVignette = new Texture2D(w, h, TextureFormat.RGBA32, false) { wrapMode = TextureWrapMode.Clamp, filterMode = FilterMode.Bilinear };
                var px = new Color32[w * h];
                // A shader's smoothstep(edge0, edge1, x): Unity's Mathf.SmoothStep eases between its first two numbers instead.
                float Smooth(float edge0, float edge1, float x) => Mathf.SmoothStep(0, 1, Mathf.InverseLerp(edge0, edge1, x));
                for (int y = 0; y < h; y++)
                    for (int x = 0; x < w; x++)
                    {
                        float dx = (x + 0.5f) / w * 2 - 1, dy = (y + 0.5f) / h * 2 - 1;
                        float r = Mathf.Sqrt(dx * dx + dy * dy * 1.3f);
                        // 0.58 in a band behind the words, 0.25 either side of them, 0.88 at the corners.
                        float middle = Mathf.Lerp(0.58f, 0.25f, Smooth(0.15f, 0.6f, Mathf.Abs(dx)));
                        float a = Mathf.Lerp(middle, 0.88f, Smooth(0.75f, 1.5f, r));
                        px[y * w + x] = new Color32(5, 5, 7, (byte)Mathf.RoundToInt(a * 255));
                    }
                titleVignette.SetPixels32(px);
                titleVignette.Apply();
                return titleVignette;
            }
        }
    }
}
