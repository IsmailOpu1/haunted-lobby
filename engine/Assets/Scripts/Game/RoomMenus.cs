using System;
using System.Collections.Generic;
using System.Linq;
using UnityEngine;
using UnityEngine.UIElements;
using Haunted.Sim;

namespace Haunted.Game
{
    /// <summary>
    /// The room page and the room settings page (step E3): index.html's #screen-room and
    /// #screen-settings, with lobbyView.ts and main.ts's wiring. Once you are in a room these are
    /// home: the hotel stays behind them, "Walk around the hotel" takes you into it and Esc brings
    /// the page back. Everything comes from the room state, so everyone sees the same; the host
    /// changes the settings and removes players.
    /// </summary>
    public partial class Menus
    {
        /// <summary>The screen Back ends on: Start, or the room once you are in one (screens.ts setRoot).</summary>
        string home = "start";

        /// <summary>A message to the room (type, body or null).</summary>
        public Action<string, Dictionary<string, object>> Send;
        /// <summary>"Walk around the hotel" / "Back to the night": the page steps aside and the mouse is held.</summary>
        public Action Walk;
        /// <summary>Leave the room (a second click confirms).</summary>
        public Action Leave;
        /// <summary>Mute only changes what you hear (PRD FR-V6).</summary>
        public Func<string, bool> IsMuted;
        public Func<string, bool> ToggleMute;

        Label stageChip, roomCode, playerCount, readyHint, startHint, settingsCode, settingsCode2, summary, settingsNote, lookHint, logSign;
        Button copyCode, walk, leaveButton, readyButton, startButton, openSettings, tabBasic, tabAdvanced;
        VisualElement roomSide, playerList, youBox, startBox, photosBox, photoList, logList, presetBox, basicPanel, advancedPanel;
        ScrollView logScroll;
        Label custom, mapLine;
        readonly List<KeyValuePair<string, Button>> presetButtons = new List<KeyValuePair<string, Button>>();
        readonly List<Button> settingSelects = new List<Button>();
        readonly List<Action> settingViews = new List<Action>();
        Dictionary<string, object> settingsNow;
        string playersKey = "", settingsKey = "", hintKey = "";
        int logShown, photosShown;
        bool logOpen;
        GameState roomState;
        string sessionId = "";
        Night roomNight;

        static readonly Dictionary<string, string> StageText = new Dictionary<string, string>
        {
            { "waiting", "Lobby" }, { "countdown", "Starting" }, { "intro", "Starting" }, { "night", "Night in progress" },
        };

        static readonly Color Ok = new Color32(147, 207, 136, 255);
        static readonly Color Line = new Color(236 / 255f, 230 / 255f, 216 / 255f, 0.12f);

        /// <summary>
        /// In a room: the pages darken over the hotel (body.in-room .screen) and Back ends on the
        /// room; out of one, Start again.
        /// </summary>
        public bool InRoom
        {
            get => home == "room";
            set
            {
                home = value ? "room" : "start";
                foreach (var kv in screens)
                {
                    kv.Value.EnableInClassList("outside", !value);
                    var shade = kv.Value.Q(className: "shade");
                    // The title screens keep their own, centred shade (MenusStart).
                    if (shade != null) shade.style.backgroundImage = titleLists.ContainsKey(kv.Key) ? TitleVignette : ShadeFor(value);
                }
                playersKey = settingsKey = hintKey = "";
                logShown = photosShown = 0;
                logList.Clear();
                photoList.Clear();
                photosBox.style.display = DisplayStyle.None;
                roomState = null;
                roomNight = null;
                Reset(home);
            }
        }

        static VisualElement Box(VisualElement parent, string cls)
        {
            var e = new VisualElement();
            foreach (var c in cls.Split(' ')) if (c != "") e.AddToClassList(c);
            parent.Add(e);
            return e;
        }

        /// <summary>A group's title with something on its right (style.css .group-title: space-between).</summary>
        static Label GroupHead(VisualElement group, string title, string rightClass)
        {
            var head = Box(group, "group-head");
            Text(head, "group-title", title);
            return Text(head, rightClass, "");
        }

        /// <summary>A row's gap between its children (CSS gap; USS has none), set once they are all in.</summary>
        static void HGap(VisualElement row, float gap)
        {
            var cells = row.Children().ToList();
            for (int i = 0; i < cells.Count; i++) cells[i].style.marginRight = i < cells.Count - 1 ? gap : 0;
        }

        static void SetPrimaryText(Button b, string text) => b.Q<Label>(className: "primary-text").text = text;

        void BuildRoom()
        {
            Screen("room", out var col, true);

            var head = Box(col, "room-head");
            var id = Box(head, "room-id");
            var eyebrow = Box(id, "eyebrow-row");
            Text(eyebrow, "eyebrow", "Room", 15);
            stageChip = Text(eyebrow, "chip", "");
            roomCode = Text(id, "room-code", "");
            var share = Box(id, "share-buttons");
            copyCode = Quiet(share, "Copy code", CopyCode, true);
            // No "Copy invite link": a download has no page for a link to open (GDD 26.16).
            var tools = Box(head, "room-tools");
            walk = Quiet(tools, "Walk around the hotel", () => Walk?.Invoke(), true);
            Quiet(tools, "Options", () => Go("options"), true);
            leaveButton = Quiet(tools, "Leave room", ArmLeave, true);
            leaveButton.AddToClassList("danger");
            HGap(share, 8);
            HGap(tools, 8);
            // .room-code: clamp(48px, 7vw, 84px), line-height 0.95.
            root.RegisterCallback<GeometryChangedEvent>(e =>
            {
                float size = Mathf.Clamp(0.07f * e.newRect.width, 48, 84);
                roomCode.style.fontSize = size;
                roomCode.style.height = size * 0.95f;
            });

            var grid = Box(col, "room-grid");
            var players = Box(grid, "group players-group");
            playerCount = GroupHead(players, "Players", "count");
            playerList = Box(players, "players");
            Gap(players, 10);

            roomSide = Box(grid, "room-side");
            youBox = Box(roomSide, "group");
            readyButton = Primary(youBox, "I'm ready", OnReady);
            readyButton.AddToClassList("ready");
            readyHint = Text(youBox, "error", "");
            readyHint.style.display = DisplayStyle.None;
            Text(youBox, "hint", "Your character is dealt at random when the night starts.", 18.125f);
            Gap(youBox, 10);

            startBox = Box(roomSide, "group start-box");
            startButton = Primary(startBox, "Start the night", () => Send?.Invoke("start", null));
            startHint = Text(startBox, "hint", "", 18.125f);
            Gap(startBox, 10);

            var settings = Box(roomSide, "group");
            settingsCode = GroupHead(settings, "Settings", "code-chip");
            summary = Text(settings, "summary-line", "", 31.2f);
            openSettings = Quiet(settings, "See all settings", () => Go("settings"));
            Gap(settings, 10);

            photosBox = Box(roomSide, "group");
            Text(photosBox, "group-title", "Developed photos");
            photoList = Box(photosBox, "photo-list");
            photosBox.style.display = DisplayStyle.None;
            Gap(photosBox, 10);

            // A <details>: its title opens and closes it, with + and − at the end.
            var logBox = Box(roomSide, "group log-box");
            var logHead = new Button(() => { logOpen = !logOpen; ShowLog(); });
            logHead.AddToClassList("log-head");
            Text(logHead, "group-title", "Room log").pickingMode = PickingMode.Ignore;
            logSign = Text(logHead, "group-title log-sign", "+");
            logSign.pickingMode = PickingMode.Ignore;
            logBox.Add(logHead);
            logScroll = new ScrollView(ScrollViewMode.Vertical) { horizontalScrollerVisibility = ScrollerVisibility.Hidden };
            logScroll.AddToClassList("log");
            logList = logScroll.contentContainer;
            logBox.Add(logScroll);
            Gap(logBox, 10);

            lookHint = Text(col, "look-hint", "", 17.25f);
            DashedBorder(lookHint);
            Gap(col, 16);
            ShowLog();
        }

        void BuildSettings()
        {
            Screen("settings", out var col, true);
            BackButton(col, "Back to the room");
            var eyebrow = Box(col, "eyebrow-row");
            Text(eyebrow, "eyebrow", "Room settings", 15);
            settingsCode2 = Text(eyebrow, "code-chip eyebrow-chip", "");
            Text(col, "screen-title", "Settings");
            // style.css .lead's max-width of 40ch is in Menus.uss as 360 px: Chrome rounds the zero's
            // advance at 15 px to 9 px, where Unity's measure gave 10 (400 px).
            settingsNote = Text(col, "lead", "", 23.25f);

            presetBox = Box(col, "segmented");
            foreach (var p in RoomSettings.Presets)
            {
                string preset = p.Key;
                var b = new Button(() => Send?.Invoke("settings", new Dictionary<string, object> { { "preset", preset } })) { text = p.Value };
                b.AddToClassList("seg");
                presetBox.Add(b);
                presetButtons.Add(new KeyValuePair<string, Button>(preset, b));
            }
            custom = Text(presetBox, "seg custom", "Custom");
            custom.tooltip = "Shown when the settings match no preset";
            HGap(presetBox, 3);

            var tabs = Box(col, "tabs");
            tabBasic = new Button(() => ShowTab(true)) { text = "BASIC" };
            tabAdvanced = new Button(() => ShowTab(false)) { text = "ADVANCED" };
            foreach (var t in new[] { tabBasic, tabAdvanced }) { t.AddToClassList("tab"); tabs.Add(t); }
            HGap(tabs, 24);

            basicPanel = Box(col, "settings-grid basic");
            var mapRow = Box(basicPanel, "setting map-line");
            Text(mapRow, "setting-name", "Map");
            mapLine = Text(mapRow, "setting-name map-name sans-500", "Marrow Hotel");
            foreach (var row in RoomSettings.Basic) SettingRow(basicPanel, row);

            advancedPanel = Box(col, "settings-grid advanced");
            foreach (var g in RoomSettings.Advanced)
            {
                var block = Box(advancedPanel, "set-group");
                Text(block, "set-title", g.Key);
                foreach (var row in g.Value) SettingRow(block, row);
            }
            // grid-template-columns: repeat(auto-fill, minmax(300px, 1fr)); gap: 4px 48px.
            advancedPanel.RegisterCallback<GeometryChangedEvent>(e => FlowAdvanced(e.newRect.width));
            ShowTab(true);
            Gap(col, 16);
        }

        void FlowAdvanced(float width)
        {
            if (float.IsNaN(width) || width <= 0) return;
            int cols = Mathf.Max(1, Mathf.FloorToInt((width + 48) / (300 + 48)));
            float w = Mathf.Floor((width - 48 * (cols - 1)) / cols * 100) / 100;
            int i = 0;
            foreach (var block in advancedPanel.Children())
            {
                block.style.width = w;
                block.style.marginRight = i % cols == cols - 1 ? 0 : 48;
                block.style.marginTop = i >= cols ? 4 : 0;
                i++;
            }
        }

        void ShowTab(bool basic)
        {
            tabBasic.EnableInClassList("on", basic);
            tabAdvanced.EnableInClassList("on", !basic);
            basicPanel.style.display = basic ? DisplayStyle.Flex : DisplayStyle.None;
            advancedPanel.style.display = basic ? DisplayStyle.None : DisplayStyle.Flex;
            if (openList != null) openList.style.display = DisplayStyle.None;
            regapDue = true;
        }

        /// <summary>One setting: its name and its list, which the host changes and everyone else reads.</summary>
        void SettingRow(VisualElement parent, RoomSettings.Row row)
        {
            var options = RoomSettings.Options(row.Key);
            var values = Enumerable.Range(0, options.Count).Select(i => i.ToString()).ToArray();
            var labels = options.Select(o => RoomSettings.OptionText(o, row.Unit)).ToArray();
            string key = row.Key;
            var select = Select(parent, row.Label, values, labels,
                () => settingsNow != null && settingsNow.ContainsKey(key) ? RoomSettings.IndexOf(key, settingsNow[key]).ToString() : "0",
                v => Send?.Invoke("settings", new Dictionary<string, object> { { "change", new Dictionary<string, object> { { key, options[int.Parse(v)] } } } }),
                settingViews, () => { });
            settingSelects.Add(select);
        }

        void CopyCode()
        {
            GUIUtility.systemCopyBuffer = roomCode.text;
            copyCode.text = "Code copied";
            copyCode.schedule.Execute(() => copyCode.text = "Copy code").ExecuteLater(2000);
        }

        void ArmLeave()
        {
            // A second click confirms, like Remove.
            if (leaveButton.ClassListContains("armed")) { Leave?.Invoke(); return; }
            leaveButton.AddToClassList("armed");
            leaveButton.text = "Click again to leave";
            leaveButton.schedule.Execute(() => { leaveButton.RemoveFromClassList("armed"); leaveButton.text = "Leave room"; }).ExecuteLater(3000);
        }

        void OnReady()
        {
            if (roomNight != null) roomNight.LobbyRefusal = "";
            Player me = null;
            if (roomState != null) roomState.players.TryGetValue(sessionId, out me);
            Send?.Invoke("ready", new Dictionary<string, object> { { "ready", !(me != null && me.ready) } });
        }

        /// <summary>The room's code, shown once you join (main.ts roomCodeText).</summary>
        public string RoomCode { set => roomCode.text = value; }

        /// <summary>
        /// Each frame in a room: the pages follow the room state (lobbyView.ts and main.ts
        /// onStateChange), a part rebuilt only when what it shows has changed, so a click or a
        /// "Sure?" is never lost to the state's constant updates.
        /// </summary>
        public void UpdateRoom(GameState s, string me, Night night)
        {
            roomState = s;
            sessionId = me;
            roomNight = night;
            if (s == null) return;
            bool lobby = s.stage == "waiting";
            bool isHost = s.host == me;
            var players = Json.Obj(config, "players");
            var key = new System.Text.StringBuilder();
            foreach (var kv in s.players)
                key.Append(kv.Key).Append('|').Append(kv.Value.name).Append('|').Append(kv.Value.character).Append('|').Append(kv.Value.ready).Append('|').Append(kv.Value.connected).Append(';');
            key.Append(s.host).Append('|').Append(s.stage).Append('|').Append(s.winner);
            if (key.ToString() != playersKey)
            {
                playersKey = key.ToString();
                bool over = !string.IsNullOrEmpty(s.winner);
                string chip = over ? "Night over" : StageText.TryGetValue(s.stage ?? "", out var t) ? t : "";
                stageChip.text = chip.ToUpperInvariant();
                stageChip.EnableInClassList("starting", !over && (s.stage == "countdown" || s.stage == "intro"));
                stageChip.EnableInClassList("night", !over && s.stage == "night");
                stageChip.style.display = chip == "" ? DisplayStyle.None : DisplayStyle.Flex;
                playerCount.text = s.players.Count + " / " + (int)Json.Num(players, "max");
                playerList.Clear();
                foreach (var kv in s.players) playerList.Add(PlayerRow(kv.Key, kv.Value, me, s.host, isHost && lobby, lobby));
                if (playerList.childCount > 0) playerList[playerList.childCount - 1].AddToClassList("last");
                Player mine;
                s.players.TryGetValue(me, out mine);
                // The host's Start counts as their Ready (GDD 26.14), so only guests get the button.
                youBox.style.display = isHost || (s.stage != "waiting" && s.stage != "countdown") ? DisplayStyle.None : DisplayStyle.Flex;
                bool ready = mine != null && mine.ready;
                SetPrimaryText(readyButton, ready ? "Ready ✓  (press to cancel)" : "I'm ready");
                readyButton.EnableInClassList("is-ready", ready);
                startBox.style.display = lobby ? DisplayStyle.Flex : DisplayStyle.None;
                startButton.style.display = isHost ? DisplayStyle.Flex : DisplayStyle.None;
                // Once the night is on, the page is a pause menu: the button takes you back into it.
                bool playing = s.stage == "night" || s.stage == "intro";
                walk.text = playing ? "Back to the night" : "Walk around the hotel";
                walk.EnableInClassList("go", playing);
                FirstGroupLine();
                regapDue = true;
            }

            string skey = s.settings + "|" + isHost + "|" + lobby;
            if (!string.IsNullOrEmpty(s.settings) && skey != settingsKey)
            {
                settingsKey = skey;
                settingsNow = RoomSettings.Parse(s.settings);
                settingsCode.text = settingsCode2.text = s.settingsCode ?? "";
                summary.text = "<line-height=31.2px>" + RoomSettings.Summary(settingsNow);
                bool canEdit = isHost && lobby;
                openSettings.text = canEdit ? "Change settings" : "See all settings";
                string preset = RoomSettings.PresetOf(settingsNow);
                foreach (var p in presetButtons)
                {
                    p.Value.EnableInClassList("on", p.Key == preset);
                    p.Value.SetEnabled(canEdit);
                }
                custom.EnableInClassList("on", preset == "custom");
                foreach (var sel in settingSelects) sel.SetEnabled(canEdit);
                if (!canEdit && openList != null) openList.style.display = DisplayStyle.None;
                foreach (var view in settingViews) view();
                settingsNote.text = "<line-height=23.25px>" + (isHost
                    ? lobby ? "You are the host. Pick a preset, or change anything: everyone sees it at once." : "Settings are locked for this night."
                    : "Only the host can change the settings. You see them as they change.");
                regapDue = true;
            }

            // The hints under Ready and Start (a refusal for 4 s), and the line at the bottom.
            double now = Time.realtimeSinceStartupAsDouble;
            bool refused = lobby && night != null && night.StartRefusal != null && now - night.StartRefusalAt < 4;
            string start = refused ? night.StartRefusal
                : isHost ? "You are the host. Start when everyone else is Ready (" + (int)Json.Num(players, "min") + " to " + (int)Json.Num(players, "max") + " players). Pressing Start counts as your Ready."
                : "Do the mic check and press Ready. The host starts the night.";
            bool nightOn = s.stage == "night" || s.stage == "intro";
            string look = LookHintText(nightOn ? "The night goes on while this page is open. Esc brings it back." : "Walk around the hotel while you wait. Esc brings this page back.");
            string lobbyRefusal = night != null ? night.LobbyRefusal ?? "" : "";
            string hkey = (lobby ? start : "") + "|" + look + "|" + lobbyRefusal;
            if (hkey != hintKey)
            {
                hintKey = hkey;
                if (lobby) startHint.text = "<line-height=18.125px>" + start;
                lookHint.text = "<line-height=17.25px>" + look;
                lookHint.EnableInClassList("warn", micNeeded);
                lookHint.MarkDirtyRepaint();
                readyHint.text = lobbyRefusal;
                readyHint.style.display = lobbyRefusal != "" ? DisplayStyle.Flex : DisplayStyle.None;
                regapDue = true;
            }

            if (night != null && night.RoomLog.Count != logShown)
            {
                for (int i = logShown; i < night.RoomLog.Count; i++) Text(logList, "log-line", night.RoomLog[i], 20);
                logShown = night.RoomLog.Count;
                logScroll.schedule.Execute(() => logScroll.scrollOffset = new Vector2(0, logList.layout.height));
            }
            if (night != null && night.Developed.Count != photosShown)
            {
                if (night.Developed.Count < photosShown) { photoList.Clear(); photosShown = 0; }
                for (int i = photosShown; i < night.Developed.Count; i++) photoList.Add(PhotoCard(night.Developed[i]));
                photosShown = night.Developed.Count;
                photosBox.style.display = photosShown > 0 ? DisplayStyle.Flex : DisplayStyle.None;
                FirstGroupLine();
                regapDue = true;
            }
        }

        void RoomShown()
        {
            playersKey = settingsKey = hintKey = "";
            if (roomState != null) UpdateRoom(roomState, sessionId, roomNight);
        }

        /// <summary>
        /// style.css: no line above the side's first group, nor above a group that follows a hidden
        /// one (.room-side .group:first-child, .room-side .group.hidden + .group). So the room log
        /// has none while the photos are hidden.
        /// </summary>
        void FirstGroupLine()
        {
            bool afterHidden = true;
            foreach (var g in roomSide.Children())
            {
                g.EnableInClassList("first", afterHidden);
                afterHidden = g.style.display == DisplayStyle.None;
            }
        }

        void ShowLog()
        {
            logSign.text = logOpen ? "−" : "+";
            // Closed, the list stays in the box at no height, as a closed <details> keeps its content
            // slot in Chrome: the group's 10 px gap still comes before it.
            logScroll.style.height = logOpen ? new StyleLength(StyleKeyword.Auto) : new StyleLength(0f);
            logScroll.style.visibility = logOpen ? Visibility.Visible : Visibility.Hidden;
            regapDue = true;
        }

        /// <summary>lobbyView.ts playerRow: a badge, the name with its tags, Ready, and Mute and Remove.</summary>
        VisualElement PlayerRow(string id, Player p, string me, string host, bool canKick, bool lobby)
        {
            var row = new VisualElement();
            row.AddToClassList("player");
            if (!p.connected) row.AddToClassList("away");
            string colour = Characters.ColourOf(p.character);
            string character = Characters.NameOf(p.character);
            // A round badge with the first letter; the character's colour once one is dealt.
            var cell = Box(row, "avatar-cell");
            var avatar = Box(cell, "avatar");
            string name = p.name ?? "";
            Text(avatar, "avatar-letter", (name.Trim().Length > 0 ? name.Trim().Substring(0, 1) : "?").ToUpperInvariant()).pickingMode = PickingMode.Ignore;
            Color c;
            if (colour != null && ColorUtility.TryParseHtmlString(colour, out c))
            {
                avatar.AddToClassList("coloured");
                avatar.style.backgroundColor = c;
            }
            avatar.tooltip = character ?? "Character dealt when the night starts";
            var who = Box(row, "who");
            Text(who, "player-name", name);
            var tags = Box(who, "tags");
            if (id == me) Text(tags, "tag", "You");
            if (id == host) Text(tags, "tag", "Host");
            if (!p.connected) Text(tags, "tag warn", "Reconnecting…");
            if (character != null) Text(tags, "tag char", character.StartsWith("The ") ? character.Substring(4) : character);
            HGap(tags, 4);
            if (lobby && id != host)
            {
                var mark = Box(row, "ready-mark-box");
                if (p.ready) ReadyDot(mark);
                Text(mark, "ready-mark" + (p.ready ? " on" : ""), p.ready ? "Ready" : "Not ready");
            }
            if (id != me)
            {
                var actions = Box(row, "row-actions");
                var mute = new Button { text = IsMuted != null && IsMuted(id) ? "Unmute" : "Mute" };
                mute.clicked += () => mute.text = ToggleMute != null && ToggleMute(id) ? "Unmute" : "Mute";
                mute.AddToClassList("row-btn");
                actions.Add(mute);
                if (canKick)
                {
                    // A second click confirms (GDD 26.14).
                    var kick = new Button { text = "Remove" };
                    kick.AddToClassList("row-btn");
                    kick.AddToClassList("kick");
                    kick.clicked += () =>
                    {
                        if (kick.ClassListContains("armed")) Send?.Invoke("kick", new Dictionary<string, object> { { "target", id } });
                        else { kick.AddToClassList("armed"); kick.text = "Sure?"; }
                    };
                    actions.Add(kick);
                }
                HGap(actions, 4);
            }
            // What Chrome draws: "#players li" (flex, gap 6px, wrap) outranks ".screen .player"'s grid,
            // so the mark and the buttons follow the name rather than standing at the right.
            HGap(row, 6);
            return row;
        }

        /// <summary>
        /// The glow of box-shadow 0 0 8px round the 6 px dot: the dot blurred by a Gaussian of sigma
        /// 4 (half the blur radius, as browsers draw it). Its alpha peaks near 0.24 and is 0.01 by
        /// 11 px. Entry r is the alpha of the disk of radius r, from the outside in, so that the
        /// stacked disks give the blurred alpha in each 1 px ring.
        /// </summary>
        static readonly float[] GlowAlpha = MakeGlow(3f, 4f, 12);

        static float[] MakeGlow(float radius, float sigma, int rings)
        {
            float Blurred(float at)
            {
                const int n = 40;
                float h = 2 * radius / n, sum = 0;
                for (int i = 0; i < n; i++)
                    for (int j = 0; j < n; j++)
                    {
                        float x = -radius + (i + 0.5f) * h, y = -radius + (j + 0.5f) * h;
                        if (x * x + y * y <= radius * radius) sum += Mathf.Exp(-((x - at) * (x - at) + y * y) / (2 * sigma * sigma)) * h * h;
                    }
                return sum / (2 * Mathf.PI * sigma * sigma);
            }
            var alpha = new float[rings];
            float outside = 0;
            for (int r = rings - 1; r > 0; r--)
            {
                float want = Blurred(r - 0.5f);
                alpha[r] = 1 - (1 - want) / (1 - outside);
                outside = want;
            }
            return alpha;
        }

        /// <summary>The green dot before "Ready" with its glow (box-shadow 0 0 8px var(--ok)).</summary>
        static void ReadyDot(VisualElement parent)
        {
            var dot = Box(parent, "ready-dot");
            dot.pickingMode = PickingMode.Ignore;
            dot.generateVisualContent += ctx =>
            {
                var p = ctx.painter2D;
                var centre = new Vector2(dot.contentRect.width / 2, dot.contentRect.height / 2);
                // Disks from the outside in, each one's alpha chosen so the layers add up to the
                // blurred dot's own alpha in its ring.
                for (int r = GlowAlpha.Length - 1; r > 3; r--)
                {
                    p.fillColor = new Color(Ok.r, Ok.g, Ok.b, GlowAlpha[r]);
                    p.BeginPath();
                    p.Arc(centre, r, 0, 360);
                    p.Fill();
                }
                p.fillColor = Ok;
                p.BeginPath();
                p.Arc(centre, 3, 0, 360);
                p.Fill();
            };
        }

        /// <summary>photoView.ts photoCard: the print on cream card with its caption.</summary>
        static VisualElement PhotoCard(Night.Photo photo)
        {
            var card = new VisualElement();
            card.AddToClassList("photo");
            var print = Box(card, "photo-print");
            print.style.backgroundImage = PhotoPrint.Print(photo);
            bool empty = photo.Subjects.Count == 0 && !photo.Ghost;
            Text(card, "photo-caption", photo.By + "'s photo, " + PhotoPrint.ClockTime(photo.NightTime) + (empty ? " (nobody in it)" : ""));
            return card;
        }

        /// <summary>A 1 px dashed line round a box (USS has no dashed borders): Chrome's 3 px dashes and gaps.</summary>
        static void DashedBorder(VisualElement e)
        {
            e.generateVisualContent += ctx =>
            {
                float w = e.layout.width, h = e.layout.height;
                if (float.IsNaN(w) || w <= 0) return;
                var p = ctx.painter2D;
                // .look-hint.warn: border-color rgba(201, 162, 75, 0.5).
                p.strokeColor = e.ClassListContains("warn") ? new Color(201 / 255f, 162 / 255f, 75 / 255f, 0.5f) : Line;
                p.lineWidth = 1;
                void Dashes(Vector2 a, Vector2 b)
                {
                    float len = Vector2.Distance(a, b);
                    var dir = (b - a) / len;
                    for (float t = 0; t < len; t += 6)
                    {
                        p.BeginPath();
                        p.MoveTo(a + dir * t);
                        p.LineTo(a + dir * Mathf.Min(len, t + 3));
                        p.Stroke();
                    }
                }
                Dashes(new Vector2(0, 0.5f), new Vector2(w, 0.5f));
                Dashes(new Vector2(w - 0.5f, 0), new Vector2(w - 0.5f, h));
                Dashes(new Vector2(w, h - 0.5f), new Vector2(0, h - 0.5f));
                Dashes(new Vector2(0.5f, h), new Vector2(0.5f, 0));
            };
        }

        /// <summary>Tests: the room page's rows, each player's words joined by "|".</summary>
        public string[] PlayerRows() => playerList.Children().Select(r => string.Join("|", r.Query<Label>().ToList().Select(l => l.text))).ToArray();

        /// <summary>Tests: the settings code and summary as this player sees them.</summary>
        public string SettingsShown => settingsCode.text + " · " + System.Text.RegularExpressions.Regex.Replace(summary.text, "<[^>]+>", "");

        /// <summary>Tests: the centre of the n-th "Remove" (or "Sure?") button, in screen pixels (y up), or null.</summary>
        public Vector2? KickPoint(int n)
        {
            var list = playerList.Query<Button>(className: "kick").ToList();
            if (n >= list.Count) return null;
            var c = list[n].worldBound.center;
            return new Vector2(c.x, UnityEngine.Screen.height - c.y);
        }
    }
}
