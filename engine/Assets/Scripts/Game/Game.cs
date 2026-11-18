using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
using System.Linq;
using System.Threading.Tasks;
using Colyseus;
using Haunted.Sim;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Haunted.Game
{
    /// <summary>
    /// The Unity version of the game (docs/plans/engine-port.md): join the same game server as the
    /// browser version, walk the hotel, and play the night (step C: Night holds what the server says,
    /// Hud shows it). A plain menu for now (step E brings the real menus).
    ///
    /// Command line, for unattended tests:
    ///   -server ws://localhost:2567  -name Rafi  -create | -join KQXRT
    ///   -codeFile path     write the room code there once in the room
    ///   -script walk       walk a fixed loop instead of reading the keys
    ///   -shot path -shotAt 12   save a screenshot after 12 s in the room
    ///   -quitAt 20         quit after 20 s in the room
    ///   -teleportAt 40 -20 -17   at 40 s in the room, ask a debug server to move us to x -20, z -17
    ///   -startWith 3       as host on a debug server, start the night (no countdown) once 3 players are in
    ///   -ready             press Ready on joining
    ///   -debugAtNight 30 '{"down":true}'   30 s into the night, send this debug message (may repeat)
    ///   -sendAtNight 12 pourSalt '{}'   12 s into the night, send this message as if a key were pressed (may repeat)
    ///   -shotAtNight 14 path   save a screenshot 14 s into the night (may repeat)
    ///   -rematchAfter 10   as host, press Rematch 10 s after the end screen
    /// </summary>
    public class Game : MonoBehaviour
    {
        const string RoomName = "haunted";

        object config;
        WorldData world;
        Hotel hotel;
        HeldTorch held;
        LocalPlayer me;
        RemotePlayers others;
        Voice voice;
        MapInfo map;
        Night night;
        Hud hud;
        Items items;
        Stations stations;
        Doors doors;
        Haunting haunting;
        HouseSounds house;
        /// <summary>-soundTest DIR: the levels test (step D4).</summary>
        SoundTest soundTest;
        // game.ts BELL_CUE_SEC, SLAM_CUE_SEC and CUE_FLOOR_DIFF_M: how long the bell's and a slammed
        // door's subtitles stay up, and how far above or below you a sound is on another floor.
        const double BellCueSec = 4, SlamCueSec = 3;
        const float CueFloorDiffM = 1.5f;
        Vector3 bellCueAt, slamCueAt;
        double bellCueUntil = -1, slamCueUntil = -1;
        /// <summary>The nearest hidden relic within whisper range (its music box), and how far it is from your feet.</summary>
        Vector3? whisperAt;
        double whisperM;
        MeetingScreen meetingScreen;
        /// <summary>The possessed's power wheel (hold R): open, and where the mouse has moved since it opened.</summary>
        bool wheelOpen;
        Vector2 wheelMouse;
        /// <summary>Tests: a power the wheel picks by itself, and when it lets go.</summary>
        string wheelTestKind;
        double wheelTestRelease = -1;
        bool askPossessed;
        bool flashlightWas;
        string endShot;
        readonly HandsWork hands = new HandsWork();
        string openStation;
        /// <summary>Where the open task stands on this side ("none", "open", "finished", "left"), so taskClosed can say the right thing.</summary>
        string taskState = "none";
        double handsNoiseAt = double.NegativeInfinity;
        bool wasMeeting;
        float voiceToneHz;
        double nextVoiceLog;
        Client client;
        Room<GameState> room;
        Material baseMaterial;
        DressedRooms dressed;
        /// <summary>Your torch dims up close, as the browser's (flashlight.ts BeamAdaptation).</summary>
        BeamAdaptation beam;
        RoomTour tour;

        string serverUrl = "ws://localhost:2567";
        string playerName = "Unity";
        string joinCode = "";
        string status = "";
        bool busy;
        double inRoomSince = -1;

        // Unattended test options.
        string codeFile, shotPath;
        double shotAt = -1, quitAt = -1, teleportAt = -1, rematchAfter = -1;
        float teleportX, teleportZ;
        bool shotTaken, autoReady, left;
        int startWith;
        double nightSince = -1, endSince = -1;
        readonly List<KeyValuePair<double, string[]>> nightSends = new List<KeyValuePair<double, string[]>>();
        List<string> handsTest;
        string handsShots = ".";
        HandsBot bot;
        readonly List<KeyValuePair<double, string>> nightShots = new List<KeyValuePair<double, string>>();

        void Awake()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 1;
            config = Json.Parse(Resources.Load<TextAsset>("Data/config").text);
            world = GameData.LoadWorld(Resources.Load<TextAsset>("Data/map").text, Resources.Load<TextAsset>("Data/world").text);
            baseMaterial = Resources.Load<Material>("Materials/GreyBox");
            if (baseMaterial == null) baseMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit"));
            Shapes.Load(baseMaterial);

            // The dressed rooms (step D) when engine/Assets/Hotel has been made; the grey box without them.
            var art = HotelArt.Load();
            dressed = art != null ? new DressedRooms(art) : null;
            SetUpLight();
            map = new MapInfo(Resources.Load<TextAsset>("Data/map").text);
            hotel = new Hotel(world, Json.Num(Json.Obj(config, "body"), "radiusM"), baseMaterial, Stations.Replaces(map), dressed);
            // A frame from now, once everything this sets up stands and before any player arrives.
            if (dressed != null) StartCoroutine(dressed.CaptureReflections());
            items = new Items(world, map, config, baseMaterial);
            others = new RemotePlayers(world, config, baseMaterial);
            HandsConfig.Load(config);
            stations = new Stations(world, map, config, dressed != null ? dressed.Drawn : null, art);
            doors = new Doors(world, map, art, dressed);
            haunting = new Haunting(world, map, config);
            house = new HouseSounds(config, Time.realtimeSinceStartupAsDouble);
            ReadCommandLine();
        }

        // game.ts DARK_AMBIENT and BLACKOUT_AMBIENT: the dressed hotel's faint fill, and in a blackout.
        const float DarkAmbient = 0.04f, BlackoutAmbient = 0.005f;
        bool blackoutLit, forceBlackout;

        /// <summary>
        /// The browser's hemisphere fill at this strength: sky b8c0d0 over ground 202020; three divides
        /// it by pi for a diffuse surface, Unity doesn't.
        /// </summary>
        static void SetFill(float strength)
        {
            float fill = strength / Mathf.PI;
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Trilight;
            // Worked out in linear light; Unity reads these colours as sRGB, hence .gamma.
            Color sky = new Color(0xb8 / 255f, 0xc0 / 255f, 0xd0 / 255f).linear, ground = new Color(0x20 / 255f, 0x20 / 255f, 0x20 / 255f).linear;
            RenderSettings.ambientSkyColor = (sky * fill).gamma;
            RenderSettings.ambientEquatorColor = ((sky + ground) * (fill / 2)).gamma;
            RenderSettings.ambientGroundColor = (ground * fill).gamma;
            // The same fill on lightmapped surfaces, as three adds it (the patched URP's SampleLightmap).
            Shader.SetGlobalVector("_HauntedFillSky", sky * fill);
            Shader.SetGlobalVector("_HauntedFillGround", ground * fill);
            fillSky = sky * fill;
            fillGround = ground * fill;
        }

        /// <summary>The fill SetFill last set (the held torch's own little scene takes it too).</summary>
        static Color fillSky, fillGround;

        /// <summary>
        /// game.ts on the blackout: the lamps fade out (DressedRooms) and the fill drops at once to
        /// BLACKOUT_AMBIENT; fixing the fuse box brings both back. -blackout forces it (a test aid).
        /// </summary>
        void UpdateBlackout(float dt)
        {
            if (dressed == null) return;
            bool blackout = forceBlackout || (room != null && night != null && night.Blackout);
            if (blackout != blackoutLit)
            {
                blackoutLit = blackout;
                dressed.SetPower(!blackout);
                SetFill(blackout ? BlackoutAmbient : DarkAmbient);
            }
            dressed.Update(dt);
        }

        void SetUpLight()
        {
            // Close to the browser's grey box: a black fog from 1 to 18 m, a dim fill, and the torch.
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Color.black;
            RenderSettings.fogStartDistance = 1;
            RenderSettings.fogEndDistance = 18;
            if (dressed != null)
            {
                // The dressed hotel is lit by its baked lightmaps, the torch and the browser's faint fill
                // (game.ts DARK_AMBIENT: a 0.04 hemisphere, sky b8c0d0 over ground 202020; three divides
                // it by pi for a diffuse surface, Unity doesn't). No moonlight: the bake has it.
                SetFill(DarkAmbient);
                // No sky to reflect: Unity's default reflects its bright built-in sky on every shiny
                // surface. The browser's rooms reflect only themselves (dressedRooms.ts probes, step D2).
                RenderSettings.skybox = null;
                var black = new Cubemap(1, TextureFormat.RGBA32, false);
                foreach (CubemapFace face in System.Enum.GetValues(typeof(CubemapFace)))
                    if (face != CubemapFace.Unknown) black.SetPixel(face, 0, 0, Color.black);
                black.Apply();
                RenderSettings.defaultReflectionMode = UnityEngine.Rendering.DefaultReflectionMode.Custom;
                RenderSettings.customReflectionTexture = black;
                return;
            }
            RenderSettings.ambientMode = UnityEngine.Rendering.AmbientMode.Flat;
            RenderSettings.ambientLight = new Color(0.32f, 0.3f, 0.28f);
            var sun = new GameObject("Moonlight").AddComponent<Light>();
            sun.type = LightType.Directional;
            sun.color = new Color(0.7f, 0.75f, 0.9f);
            sun.intensity = 0.35f;
            sun.transform.rotation = Quaternion.Euler(55, 30, 0);
        }

        void ReadCommandLine()
        {
            var args = Environment.GetCommandLineArgs();
            Func<string, string> arg = key =>
            {
                int i = Array.IndexOf(args, key);
                return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
            };
            serverUrl = arg("-server") ?? serverUrl;
            playerName = arg("-name") ?? playerName;
            codeFile = arg("-codeFile");
            shotPath = arg("-shot");
            if (arg("-shotAt") != null) shotAt = double.Parse(arg("-shotAt"), CultureInfo.InvariantCulture);
            if (arg("-quitAt") != null) quitAt = double.Parse(arg("-quitAt"), CultureInfo.InvariantCulture);
            int teleportArg = Array.IndexOf(args, "-teleportAt");
            if (teleportArg >= 0 && teleportArg + 3 < args.Length)
            {
                teleportAt = double.Parse(args[teleportArg + 1], CultureInfo.InvariantCulture);
                teleportX = float.Parse(args[teleportArg + 2], CultureInfo.InvariantCulture);
                teleportZ = float.Parse(args[teleportArg + 3], CultureInfo.InvariantCulture);
            }
            if (arg("-startWith") != null) startWith = int.Parse(arg("-startWith"), CultureInfo.InvariantCulture);
            if (arg("-rematchAfter") != null) rematchAfter = double.Parse(arg("-rematchAfter"), CultureInfo.InvariantCulture);
            autoReady = Array.IndexOf(args, "-ready") >= 0;
            askPossessed = Array.IndexOf(args, "-possessed") >= 0;
            for (int i = 0; i + 2 < args.Length; i++)
            {
                if (args[i] == "-handsTest" && i + 1 < args.Length)
                    handsTest = args[i + 1] == "mine" ? new List<string> { "mine" }
                        : args[i + 1] == "all"
                        ? map.Tasks.Select(t => t.Id).Concat(new[] { "relic-library", "relic-courtyard-1", "relic-kitchen" }).ToList()
                        : args[i + 1].Split(',').ToList();
                if (args[i] == "-handsShots" && i + 1 < args.Length) handsShots = args[i + 1];
                if (args[i] == "-shotAtEnd" && i + 1 < args.Length) endShot = args[i + 1];
                if (args[i] != "-debugAtNight" && args[i] != "-shotAtNight" && args[i] != "-sendAtNight") continue;
                double at = double.Parse(args[i + 1], CultureInfo.InvariantCulture);
                if (args[i] == "-debugAtNight") nightSends.Add(new KeyValuePair<double, string[]>(at, new[] { "debug", args[i + 2] }));
                if (args[i] == "-shotAtNight") nightShots.Add(new KeyValuePair<double, string>(at, args[i + 2]));
                if (args[i] == "-sendAtNight" && i + 3 < args.Length) nightSends.Add(new KeyValuePair<double, string[]>(at, new[] { args[i + 2], args[i + 3] }));
            }
            if (arg("-voiceTone") != null) voiceToneHz = float.Parse(arg("-voiceTone"), CultureInfo.InvariantCulture);
            // Test aid: the picture shows only the bloom (HauntedPost), to see what glows.
            // "-bloomOnly 2": everything counts as bright, to check the glow reaches the picture.
            if (Array.IndexOf(args, "-bloomOnly") >= 0) Shader.SetGlobalFloat("_HauntedBloomOnly", arg("-bloomOnly") == "2" ? 2 : 1);
            // Graphics quality (HauntedQuality): "-quality low" or High; the menus come in step E.
            HauntedQuality.Apply(HauntedQuality.Parse(arg("-quality")));
            // Test aid: the picture shows only the ambient occlusion (HauntedAO).
            // Test aid: the lamps out, as in the ghost's Blackout.
            forceBlackout = Array.IndexOf(args, "-blackout") >= 0;
            HauntedAO.ShowOnly = Array.IndexOf(args, "-aoOnly") >= 0;
            HauntedAO.Off = Array.IndexOf(args, "-noAO") >= 0;
            // Test aid: the torch in this character's hand alone, looking straight ahead (as the
            // browser's held scene, to compare the two).
            heldTest = arg("-heldTest");
            // Test aid: "-cast Rafi=nurse,Mim=detective": draw these players as these characters (to
            // set Unity's picture beside a browser night that was dealt otherwise). The server's deal stands.
            if (arg("-cast") != null)
                foreach (var pair in arg("-cast").Split(','))
                {
                    var bits = pair.Split('=');
                    if (bits.Length == 2) cast[bits[0]] = bits[1];
                }
            if (arg("-bloomScale") != null) HauntedPost.BloomScale = float.Parse(arg("-bloomScale"), System.Globalization.CultureInfo.InvariantCulture);
            if (arg("-bloomThreshold") != null) HauntedPost.ThresholdNow = float.Parse(arg("-bloomThreshold"), System.Globalization.CultureInfo.InvariantCulture);
            Shader.SetGlobalFloat("_HauntedHdrOut", Array.IndexOf(args, "-hdrOut") >= 0 ? 1 : 0);
            if (arg("-exposure") != null) HauntedPost.ExposureScale = float.Parse(arg("-exposure"), System.Globalization.CultureInfo.InvariantCulture);
            if (arg("-soundTest") != null) soundTest = new SoundTest(arg("-soundTest"));
            if (arg("-recordSound") != null) soundTest = new SoundTest(arg("-recordSound"), true);
            if (arg("-roomShots") != null)
            {
                // The room-by-room picture test (RoomTour): no server, no HUD.
                tour = gameObject.AddComponent<RoomTour>();
                tour.Dir = arg("-roomShots");
                tour.World = world;
                tour.EyeHeightM = (float)Json.Num(Json.Obj(config, "movement"), "eyeHeightM");
                tour.Only = arg("-rooms");
                tour.Ready = () => dressed == null || dressed.ReflectionsReady;
                if (Array.IndexOf(args, "-torch") >= 0) tour.Flashlight = Json.Obj(config, "flashlight");
                if (Array.IndexOf(args, "-closeUps") >= 0) tour.Map = map;
                // As in the browser's tour, taken in a room: a night's relics, none placed yet.
                doors.SetSlots(0, (int)Json.Num(Json.Obj(config, "relics"), "count"));
                return;
            }
            string script = arg("-script");
            if (Array.IndexOf(args, "-create") >= 0) Connect(null, script);
            else if (arg("-join") != null) Connect(arg("-join"), script);
        }

        async void Connect(string code, string script)
        {
            busy = true;
            status = code == null ? "Creating a room..." : "Joining " + code + "...";
            try
            {
                client = new Client(serverUrl);
                var options = new Dictionary<string, object> { { "name", playerName } };
                room = code == null
                    ? await client.Create<GameState>(RoomName, options)
                    : await client.JoinById<GameState>(code.Trim().ToUpperInvariant(), options);
                OnJoined(script);
            }
            catch (Exception e)
            {
                status = "Could not join: " + e.Message;
                Debug.LogError(status);
                busy = false;
            }
        }

        void OnJoined(string script)
        {
            status = "";
            busy = false;
            var move = GameData.LoadMovement(config);
            me = new LocalPlayer(hotel, move, config);
            held = new HeldTorch(me.Camera.transform);
            if (script == "walk") me.Script = WalkScript;
            room.OnStateChange += (state, first) => OnState(state);
            room.OnLeave += code => { status = "Left the room (" + code + ")"; Debug.Log(status); };
            room.OnError += (code, message) => Debug.LogError("Room error " + code + ": " + message);
            night = new Night(room, map, config);
            night.Flashed += (by, x, z) => items.Flash(by == room.SessionId, x, z);
            ListenForTasks();
            hud = new Hud(night, () => room.State, () => room.SessionId, (type, msg) => { if (msg == null) room.Send(type); else room.Send(type, msg); }, config);
            meetingScreen = new MeetingScreen(night, config, (type, msg) => room.Send(type, msg));
            hud.Meeting = meetingScreen;
            ListenForGhost();
            StartVoice();
            room.Send("tasksRequest");
            if (autoReady) room.Send("ready", new Dictionary<string, object> { { "ready", true } });
            if (room.State != null) OnState(room.State);
            inRoomSince = Time.realtimeSinceStartupAsDouble;
            Debug.Log("In room " + room.RoomId + " as " + room.SessionId);
            if (codeFile != null) File.WriteAllText(codeFile, room.RoomId);
        }

        /// <summary>
        /// Asks for the voice pass once the handlers are in place, as the browser does: the server
        /// answers with where and how to join LiveKit, or that voice is off on this server.
        /// </summary>
        void StartVoice()
        {
            voice = new Voice(this) { TestToneHz = voiceToneHz };
            bool answered = false;
            room.OnMessage<Dictionary<string, object>>("voice", msg =>
            {
                if (answered) return;
                answered = true;
                object url, token;
                if (msg != null && msg.TryGetValue("url", out url) && msg.TryGetValue("token", out token)) voice.Connect((string)url, (string)token);
                else Debug.Log("Voice is off on this server");
            });
            room.OnMessage<Dictionary<string, object>>("voiceMix", msg =>
            {
                var mix = new Dictionary<string, float[]>();
                foreach (var kv in msg)
                {
                    var list = kv.Value as System.Collections.IList;
                    if (list == null || list.Count < 3) continue;
                    mix[kv.Key] = new[] { Convert.ToSingle(list[0], CultureInfo.InvariantCulture), Convert.ToSingle(list[1], CultureInfo.InvariantCulture), Convert.ToSingle(list[2], CultureInfo.InvariantCulture) };
                }
                voice.SetMix(mix);
            });
            room.Send("voiceRequest");
        }

        /// <summary>For tests: walk forward, turn, walk on, and look around, so others can see us move.</summary>
        MoveInput WalkScript(double time)
        {
            double t = time - inRoomSince;
            double phase = t % 8;
            var input = new MoveInput { Forward = phase < 6 ? 1 : 0, Yaw = me.Yaw, Pitch = 0 };
            if (phase >= 6) input.Yaw = me.Yaw + 1.5 * (1.0 / 20);
            return input;
        }

        void OnState(GameState state)
        {
            double now = Time.realtimeSinceStartupAsDouble;
            foreach (var kv in state.doors)
            {
                hotel.SetDoorOpen(kv.Key, kv.Value.open);
                doors.SetOpen(kv.Key, kv.Value.open);
            }
            int placed = 0;
            foreach (var kv in state.relics) if (kv.Value.status == "placed" || kv.Value.status == "crumbled") placed++;
            if (state.relics.Count > 0) doors.SetSlots(placed, state.relics.Count);
            var ids = new HashSet<string>();
            foreach (var kv in state.players)
            {
                var p = kv.Value;
                if (kv.Key == room.SessionId)
                {
                    me.Mode = !string.IsNullOrEmpty(state.meeting) ? MoveMode.Frozen
                        : p.health == "dead" ? MoveMode.Wisp
                        : p.health == "downed" ? MoveMode.Crawl
                        : !string.IsNullOrEmpty(p.hidingSpot) ? MoveMode.Frozen
                        : !string.IsNullOrEmpty(p.relic) ? MoveMode.Carry
                        : MoveMode.Normal;
                    if (!me.Ready) { me.Yaw = p.yaw; me.Pitch = p.pitch; }
                    me.Reconcile(p.x, p.z, p.stamina, p.regenWait, p.crouching, p.lastSeq);
                    if (p.flashlightOn != flashlightWas) Debug.Log("Flashlight " + (p.flashlightOn ? "on" : "off"));
                    flashlightWas = p.flashlightOn;
                    me.FlashlightOn = p.flashlightOn;
                    continue;
                }
                ids.Add(kv.Key);
                // remotePlayers.ts: the dead lie where they fell until the body is gone; a hider is out of sight.
                bool dead = p.health == "dead";
                bool visible = p.connected && string.IsNullOrEmpty(p.hidingSpot) && !(dead && p.bodyGone);
                double x = dead ? p.bodyX : p.x, z = dead ? p.bodyZ : p.z;
                others.Push(kv.Key, now, x, z, p.yaw, p.pitch, p.crouching && !dead, new RemotePlayers.Latest
                {
                    Name = p.name ?? "", Health = p.health ?? "alive", Character = Cast(p.name, p.character) ?? "",
                    Colour = Characters.ColourOf(Cast(p.name, p.character)), FlashlightOn = p.flashlightOn && p.health == "alive",
                    Visible = visible, X = x, Z = z,
                });
            }
            others.Keep(ids);
            night.OnState();
            items.OnState(state);
            stations.OnState(state);
            // A meeting stops anything in your hands; a new night forgets the old one's work.
            bool meeting = !string.IsNullOrEmpty(state.meeting);
            if (meeting && !wasMeeting)
            {
                // Everyone stops; let go of the mouse so you can vote; anything in your hands stops (game.ts updateMeeting).
                if (taskState == "open") LeaveTask();
                CloseWheel(false);
                meetingScreen.Begin();
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                Debug.Log("Meeting: " + state.meetingCaller + (string.IsNullOrEmpty(state.meetingBody) ? " rang the bell" : " reported " + state.meetingBody));
            }
            wasMeeting = meeting;
            haunting.OnState(state, room.SessionId, BasementOpen(state));
            if (state.stage == "waiting" && nightSince >= 0) haunting.Reset();
            if (state.stage == "waiting" && taskState != "none") { taskState = "none"; if (hands.Active) StopHands(); }
            if (state.stage == "night" && nightSince < 0) nightSince = now;
            if (state.stage == "waiting") { nightSince = -1; endSince = -1; }
            if (askPossessed && state.stage == "waiting")
            {
                // Test: ask to be the possessed this night (debug servers only).
                askPossessed = false;
                room.Send("debug", new Dictionary<string, object> { { "possessed", true } });
            }
            if (startWith > 0 && state.stage == "waiting" && state.host == room.SessionId && state.players.Count >= startWith)
            {
                startWith = -startWith;
                room.Send("debug", new Dictionary<string, object> { { "startNow", true } });
                Debug.Log("Starting the night with " + state.players.Count + " players");
            }
        }

        void Update()
        {
            double now = Time.realtimeSinceStartupAsDouble;
            stations.Update(Time.timeAsDouble);
            UpdateBlackout(Time.deltaTime);
            doors.Update(Time.deltaTime);
            if (room != null && me != null)
            {
                HandleKeys();
                me.Update(Time.deltaTime, now, input => room.Send("input", new Dictionary<string, object>
                {
                    { "seq", input.Seq }, { "forward", input.Forward }, { "right", input.Right },
                    { "run", input.Run }, { "crouch", input.Crouch }, { "yaw", input.Yaw }, { "pitch", input.Pitch },
                }));
                if (night.End != null && hands.Active) StopHands();
                var feet = me.Camera.transform.position - Vector3.up * (float)Json.Num(Json.Obj(config, "movement"), "eyeHeightM");
                if (beam == null) beam = new BeamAdaptation(dressed?.Root);
                float flicker = haunting.Update(now, Time.deltaTime, feet, me.Camera);
                PlaySounds(now, Time.deltaTime);
                me.Brightness = flicker * beam.Update(Time.deltaTime, me.Camera);
                // game.ts: the torch in your hand, not while working a task, holding up the camera, or as a Wisp.
                var mine = night.Me;
                if (mine != null) held.Wear(heldTest ?? Cast(mine.name, mine.character));
                held.Fill(fillSky, fillGround);
                me.BeamFrom = held.Update(Time.deltaTime, me.Camera.transform.position, me.Yaw, me.Pitch,
                    (mine == null || mine.health != "dead") && !hands.Active && !hud.CameraRaised, flashlightWas, flicker, dressed != null ? dressed.Power : 1);
                if (night.End != null || (night.Me != null && night.Me.health != "alive")) CloseWheel(false);
                if (bot != null) bot.Frame();
                UpdateHands(Time.deltaTime);
                others.Reveal(Recognises);
                others.Update(now, me.Camera);
                hud.Prompt = night.PromptAt(me.State.X, me.State.Z);
                UpdateItems(now);
                UpdateCues(now);
                hud.WheelOpen = wheelOpen;
                hud.WheelSelected = wheelOpen ? PowerHud.Pick(wheelMouse) : null;
                if (voice != null)
                {
                    voice.Update(others.PositionOf);
                    if (now >= nextVoiceLog)
                    {
                        nextVoiceLog = now + 2;
                        foreach (var id in others.Ids) Debug.Log("Voice level from " + id + ": " + voice.HeardLevel(id).ToString("0.000", CultureInfo.InvariantCulture) + " (" + voice.SpeakerCount + " heard)");
                    }
                }
                RunTestSchedule(now);
            }
        }

        void LateUpdate()
        {
            if (others != null) others.LateUpdate();
            if (heldTest != null && me != null)
            {
                me.Camera.transform.rotation = Quaternion.identity;
                me.Camera.cullingMask = HauntedHeld.HeldMask;
                me.Camera.clearFlags = CameraClearFlags.SolidColor;
                me.Camera.backgroundColor = Color.black;
            }
        }
        /// <summary>-heldTest: whose hand to show alone (a test aid).</summary>
        string heldTest;
        /// <summary>-cast: characters drawn in place of the dealt ones, by player name (a test aid).</summary>
        readonly Dictionary<string, string> cast = new Dictionary<string, string>();
        string Cast(string name, string character) => name != null && cast.TryGetValue(name, out var c) ? c : character;

        /// <summary>Whether you can tell who another player is right now (GDD 22.2; game.ts recognises).</summary>
        bool Recognises(string id)
        {
            var other = others.StateOf(id);
            if (other == null || me == null || room?.State == null) return false;
            var f = Json.Obj(config, "flashlight");
            double darkVisionM = Json.Num(f, "darkVisionM"), nameRevealM = Json.Num(f, "nameRevealM");
            double halfRad = Json.Num(f, "coneHalfAngleDeg") * Math.PI / 180;
            double myX = me.State.X, myZ = me.State.Z;
            // Measured in the drawn world, so a floor above is further than its plan says (levels.ts worldDistance).
            float distM = Vector3.Distance(Coords.Place(world, myX, myZ), Coords.Place(world, other.X, other.Z));
            bool meeting = !string.IsNullOrEmpty(room.State.meeting);
            if (meeting || distM <= darkVisionM) return true;
            if (!flashlightWas || distM > nameRevealM) return false;
            double toward = Math.Atan2(-(other.X - myX), -(other.Z - myZ));
            double d = toward - me.Yaw;
            if (Math.Abs(Math.Atan2(Math.Sin(d), Math.Cos(d))) > halfRad) return false;
            return hotel.Collision.LineOfSight(myX, myZ, other.X, other.Z, Json.Num(Json.Obj(config, "movement"), "eyeHeightM"));
        }

        void HandleKeys()
        {
            var k = Keyboard.current;
            var mouse = Mouse.current;
            lockedThisFrame = false;
            // The lobby and the end screen keep the mouse for their buttons.
            bool menu = room.State == null || room.State.stage == "waiting" || night.End != null || !string.IsNullOrEmpty(room.State.meeting);
            if (menu && Cursor.lockState == CursorLockMode.Locked) { Cursor.lockState = CursorLockMode.None; Cursor.visible = true; }
            if (!menu && mouse != null && mouse.leftButton.wasPressedThisFrame && Cursor.lockState != CursorLockMode.Locked)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
                lockedThisFrame = true;
            }
            if (k == null) return;
            if (k.escapeKey.wasPressedThisFrame)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
                if (taskState == "open") LeaveTask();
                CloseWheel(false);
            }
            hud.ShowTasks = k.tabKey.isPressed;
            // The power wheel (GDD 14.2, input.ts): R opens it, letting go uses the power the mouse points at.
            if (k.rKey.wasPressedThisFrame && Cursor.lockState == CursorLockMode.Locked) OpenWheel();
            if (k.rKey.wasReleasedThisFrame && wheelOpen && wheelTestKind == null) CloseWheel(true);
            var mine = night.Me;
            if (Cursor.lockState != CursorLockMode.Locked) return;
            // The browser's default keys (client/src/keys.ts): 1 flashlight (or a click), 2 raises the
            // Spirit Camera (then a click takes the photo), 3 pours salt, G drops the relic.
            bool click = mouse != null && mouse.leftButton.wasPressedThisFrame && !lockedThisFrame;
            if (hands.Active)
            {
                // Working (client/src/input.ts): the button grabs, E or a step stops, 1 still works the flashlight.
                if (click) { hands.Press(true); me.HandDown = true; }
                if (mouse != null && mouse.leftButton.wasReleasedThisFrame && me.HandDown) { hands.Press(false); me.HandDown = false; }
                if (k.digit1Key.wasPressedThisFrame) room.Send("flashlight");
                bool stop = k.eKey.wasPressedThisFrame || k.wKey.wasPressedThisFrame || k.aKey.wasPressedThisFrame || k.sKey.wasPressedThisFrame || k.dKey.wasPressedThisFrame;
                if (stop && taskState == "open") LeaveTask();
                if (k.eKey.wasReleasedThisFrame) room.Send("use", new Dictionary<string, object> { { "down", false } });
                return;
            }
            if (k.digit2Key.wasPressedThisFrame) hud.CameraRaised = !hud.CameraRaised && mine != null && mine.cameraShots > 0;
            if (click && hud.CameraRaised)
            {
                if (mine != null && mine.cameraShots > 0) room.Send("photo");
                hud.CameraRaised = false;
            }
            else if (click || k.digit1Key.wasPressedThisFrame) room.Send("flashlight");
            if (k.digit3Key.wasPressedThisFrame) room.Send("pourSalt");
            if (k.gKey.wasPressedThisFrame && mine != null && !string.IsNullOrEmpty(mine.relic)) room.Send("dropRelic");
            if (k.eKey.wasPressedThisFrame) room.Send("use", new Dictionary<string, object> { { "down", true } });
            if (k.eKey.wasReleasedThisFrame) room.Send("use", new Dictionary<string, object> { { "down", false } });
        }

        bool lockedThisFrame;

        /// <summary>The ghost, hunts, sounds from the house and the powers' effects (step C4).</summary>
        void ListenForGhost()
        {
            me.WheelMove = (dx, dy) => wheelMouse += new Vector2((float)dx, (float)dy);
            night.GhostMoved += m => haunting.Push(m, Time.realtimeSinceStartupAsDouble);
            night.Hunted += phase => haunting.Hunt(phase, Time.realtimeSinceStartupAsDouble);
            night.EyesGlow += id => others.GlowEyes(id, Time.realtimeSinceStartupAsDouble + Json.Num(Json.Obj(Json.Obj(config, "powers"), "summon"), "eyeGlowSec"));
            night.SoundAt += (kind, x, z) =>
            {
                var at = Coords.Place(world, x, z);
                // audio.ts: where each is heard from, and how far it carries.
                double t = Time.realtimeSinceStartupAsDouble;
                if (kind == "bellRing") { TaskSounds.PlayAt("bell", at, 4, 1); bellCueAt = at; bellCueUntil = t + BellCueSec; }
                else if (kind == "doorSlam") { TaskSounds.PlayAt("slam", at, 6, 1); slamCueAt = at; slamCueUntil = t + SlamCueSec; }
                else if (kind == "powerWhisper") TaskSounds.PlayAt("whisper", at, 1, 1.5f);
                else TaskSounds.PlayAt("thud", at);
                Debug.Log("Heard " + kind + " at " + x.ToString("0.0", CultureInfo.InvariantCulture) + ", " + z.ToString("0.0", CultureInfo.InvariantCulture));
            };
        }

        /// <summary>Every relic slot on the basement door is filled (a crumbled relic was placed first).</summary>
        static bool BasementOpen(GameState s)
        {
            if (s.relics.Count == 0) return false;
            foreach (var kv in s.relics) if (kv.Value.status != "placed" && kv.Value.status != "crumbled") return false;
            return true;
        }

        void OpenWheel()
        {
            var mine = night.Me;
            if (night.Role != "possessed" || mine == null || mine.health != "alive" || night.End != null || !string.IsNullOrEmpty(room.State.meeting)) return;
            wheelOpen = true;
            wheelMouse = Vector2.zero;
            me.WheelOpen = true;
        }

        void CloseWheel(bool use)
        {
            if (!wheelOpen) return;
            string picked = use ? PowerHud.Pick(wheelMouse) : null;
            wheelOpen = false;
            me.WheelOpen = false;
            wheelTestKind = null;
            if (picked != null) UsePower(picked);
        }

        /// <summary>Slam Door takes the door you look at, Summon the player you look at. The server checks the rest.</summary>
        void UsePower(string kind)
        {
            var powers = Json.Obj(config, "powers");
            string target = kind == "slamDoor" ? AimedDoor(Json.Num(Json.Obj(powers, "slamDoor"), "rangeM"))
                : kind == "summon" ? AimedPlayer(Json.Num(Json.Obj(powers, "summon"), "targetRangeM")) : null;
            var body = new Dictionary<string, object> { { "kind", kind } };
            if (target != null) body["target"] = target;
            room.Send("power", body);
            Debug.Log("Power " + kind + (target != null ? " at " + target : ""));
        }

        // game.ts: how far off the crosshair a door or a player may be.
        const double AimDoorRad = 35 * Math.PI / 180, AimPlayerRad = 20 * Math.PI / 180;

        /// <summary>How far off the crosshair a point is, in radians (facing yaw looks along -sin, -cos), and how far away.</summary>
        double Aim(double x, double z, out double dist)
        {
            double dx = x - me.State.X, dz = z - me.State.Z;
            dist = Math.Sqrt(dx * dx + dz * dz);
            double a = Math.Atan2(-dx, -dz) - me.Yaw;
            return Math.Abs(Math.Atan2(Math.Sin(a), Math.Cos(a)));
        }

        string AimedDoor(double range)
        {
            string best = null;
            double bestOff = double.MaxValue;
            foreach (var door in map.Doors)
            {
                if (door.Id == map.RelicDoor) continue;
                double dist, off = Aim(door.At.X, door.At.Z, out dist);
                if (dist <= range && off <= AimDoorRad && off < bestOff) { best = door.Id; bestOff = off; }
            }
            return best;
        }

        string AimedPlayer(double range)
        {
            string best = null;
            double bestOff = double.MaxValue;
            foreach (var kv in room.State.players)
            {
                var p = kv.Value;
                if (kv.Key == room.SessionId || p.health != "alive" || !string.IsNullOrEmpty(p.hidingSpot)) continue;
                double dist, off = Aim(p.x, p.z, out dist);
                if (dist <= range && off <= AimPlayerRad && off < bestOff) { best = kv.Key; bestOff = off; }
            }
            return best;
        }

        /// <summary>Hands-on work's messages (client/src/game.ts): open, found, closed, and noisy tasks of others.</summary>
        void ListenForTasks()
        {
            stations.SetSeed(room.RoomId);
            me.HandMove = (dx, dy) => hands.Move(dx, dy);
            night.TaskOpened += (id, kind) =>
            {
                openStation = id;
                taskState = "open";
                StartHands(id, kind);
            };
            night.SearchFound += id =>
            {
                if (id != openStation || !hands.Active) return;
                hands.Found();
                taskState = "open";
                night.ShowBanner("Something is down there. Keep digging.", 3);
            };
            night.TaskClosed += (id, reason) =>
            {
                // Places to search use the same flow as tasks.
                bool relic = map.RelicSpots.Any(s => s.Id == id || (s.Places != null && s.Places.Any(p => p.Id == id)));
                var def = map.TaskById(id);
                string what = relic ? "Search" : "Task";
                if (hands.Active) StopHands();
                if (reason == "empty") night.ShowBanner("Nothing here.", 2);
                else if (reason == "done") night.ShowBanner(relic ? "You found a relic. Take it to the basement door." : "Done: " + (def != null ? def.Name : "Task"), 3);
                else if (taskState == "open") night.ShowBanner(what + " cancelled. Start it again with E.", 3);
                else if (taskState == "finished") night.ShowBanner(what + " not accepted. Try it again.", 3);
                taskState = "none";
            };
            night.TaskNoise += (x, z, kind) => TaskSounds.PlayAt(TaskSounds.NoiseOf(kind), Coords.Place(world, x, z));
        }

        /// <summary>Starts hands-on work on a station or a place to search (GDD 26.5).</summary>
        void StartHands(string id, string kind)
        {
            var model = stations.Hands(id);
            if (model == null || model.Kind != kind)
            {
                // No parts to work on: give it up rather than leave you stuck.
                Debug.LogWarning("No hands-on parts for " + id + " (" + kind + ")");
                LeaveTask();
                return;
            }
            double cooldown = Json.Num(Json.Obj(config, "tasks"), "noiseCooldownSec");
            var task = HandsTask.Create(model, new HandsEvents
            {
                Play = (sound, pitch) => TaskSounds.Play(sound, pitch),
                Noise = () =>
                {
                    double t = Time.realtimeSinceStartupAsDouble;
                    if (t - handsNoiseAt < cooldown) return;
                    handsNoiseAt = t;
                    room.Send("taskNoise");
                },
            });
            stations.SetBusy(id);
            hands.Start(task, me.Yaw, me.Pitch);
            me.Working = true;
            // The how-to stays up the whole time you work: playtests showed a once-only hint is easily missed.
            hud.WorkHint = task.Hint + "  (E or a step to stop)";
            Debug.Log("Working on " + id + " (" + kind + ")");
        }

        void StopHands()
        {
            hands.Stop();
            stations.SetBusy(null);
            me.Working = false;
            me.HandDown = false;
            hud.WorkHint = null;
        }

        /// <summary>You stopped working: tell the server.</summary>
        void LeaveTask()
        {
            taskState = "left";
            room.Send("taskCancel");
            StopHands();
        }

        void UpdateHands(float dt)
        {
            if (hands.Active && hands.Frame(dt, me.Yaw, me.Pitch, me.Camera) && taskState == "open")
            {
                taskState = "finished";
                room.Send("taskDone", new Dictionary<string, object> { { "stationId", openStation } });
                Debug.Log("Task done on this side: " + openStation);
            }
        }

        /// <summary>
        /// The house's sounds each frame (HouseSounds): the ambience and creaks round your ears, and
        /// the footsteps, yours and others' (game.ts playFootsteps).
        /// </summary>
        void PlaySounds(double now, float dt)
        {
            var ears = me.Camera.transform;
            TaskSounds.Ears = ears;
            house.Update(now, dt, ears.position, haunting.Silent, haunting.Hunting);
            var mine = night.Me;
            bool walking = mine != null && mine.health != "dead" && string.IsNullOrEmpty(mine.hidingSpot);
            house.MySteps(dt, ears.position, walking, me.State.Crouching, mine != null && mine.health == "downed");
            others.ForEachWalker((id, feet, crouching, health, hidden) => house.TheirSteps(id, dt, feet, crouching, health, hidden));
            house.KeepOnly(others.Ids);
            if (soundTest != null && (now > 10 || soundTest.RecordOnly)) soundTest.Frame(now, ears, house);
        }

        /// <summary>
        /// The sound subtitles (game.ts updateWhereabouts): the music box, the bell, a slammed door,
        /// then the ghost, each with an arrow toward it and "above" or "below" on another floor.
        /// </summary>
        void UpdateCues(double now)
        {
            hud.SoundCues.Clear();
            var ears = me.Camera.transform;
            float floor = Coords.Place(world, me.State.X, me.State.Z).y;
            if (whisperAt.HasValue)
            {
                var search = Json.Obj(Json.Obj(config, "relics"), "search");
                double close = Json.Num(search, "closeM");
                string text = whisperM <= Json.Num(search, "veryCloseM") ? "A music box plays, very close"
                    : whisperM <= close ? "A music box plays close by" : "A faint music box";
                var cue = Cue(text, whisperAt.Value, ears, floor);
                // From afar a rough arrow (eight ways) points the way; up close there is none, so you
                // must listen and search (GDD 26.5).
                const float Eighth = Mathf.PI / 4;
                cue.Angle = whisperM <= close ? (float?)null : Mathf.Round(cue.Angle.Value / Eighth) * Eighth;
                hud.SoundCues.Add(cue);
            }
            if (now < bellCueUntil) hud.SoundCues.Add(Cue("The bell rings", bellCueAt, ears, floor));
            if (now < slamCueUntil) hud.SoundCues.Add(Cue("A door slams", slamCueAt, ears, floor));
            // While it hunts you hear its heavy steps from where it is; otherwise only your heart tells you it is close.
            if (haunting.Cue != null)
                hud.SoundCues.Add(haunting.CueAt.HasValue ? Cue(haunting.Cue, haunting.CueAt.Value, ears, floor) : new SoundCue { Text = haunting.Cue });
        }

        /// <summary>cues.ts directionTo: the turn from where you look to the sound (clockwise), and whether it is on another floor.</summary>
        static SoundCue Cue(string text, Vector3 at, Transform ears, float floor)
        {
            var ahead = ears.forward;
            ahead.y = 0;
            ahead.Normalize();
            var right = Vector3.Cross(Vector3.up, ahead);
            var d = at - ears.position;
            float dy = at.y - floor;
            return new SoundCue
            {
                Text = text,
                Angle = Mathf.Atan2(Vector3.Dot(d, right), Vector3.Dot(d, ahead)),
                Vertical = dy > CueFloorDiffM ? "above" : dy < -CueFloorDiffM ? "below" : null,
            };
        }

        /// <summary>
        /// Items each frame: dropped relics, flashes, and the music box of the nearest hidden relic
        /// within whisper range (client/src/game.ts nearestHiddenRelic and whisperCue).
        /// </summary>
        void UpdateItems(double now)
        {
            items.SetDropped(night.RelicsNear);
            var relics = Json.Obj(config, "relics");
            var search = Json.Obj(relics, "search");
            var feet = me.Camera.transform.position - Vector3.up * (float)Json.Num(Json.Obj(config, "movement"), "eyeHeightM");
            Vector3? whisper = null;
            float best = (float)Json.Num(relics, "whisperM");
            foreach (var r in night.RelicsNear)
            {
                if (!r.Hidden) continue;
                var at = Coords.Place(world, r.X, r.Z);
                float d = Vector3.Distance(at, feet);
                if (d <= best) { best = d; whisper = at; }
            }
            items.Update(now, whisper, whisper.HasValue ? 1 - best / Json.Num(relics, "whisperM") : 0);
            whisperAt = whisper;
            whisperM = best;
            hud.ScreenFlashUntil = items.ScreenFlashUntil;
            var mine = night.Me;
            if (mine == null || mine.cameraShots <= 0 || mine.health != "alive") hud.CameraRaised = false;
        }

        void RunTestSchedule(double now)
        {
            double t = now - inRoomSince;
            if (handsTest != null && bot == null && nightSince >= 0 && now - nightSince > 4)
            {
                bot = new HandsBot
                {
                    Send = (type, body) => room.Send(type, body), Shot = path => { ScreenCapture.CaptureScreenshot(path); Debug.Log("Screenshot " + path); },
                    Hands = hands, Me = me, Map = map, Stations = stations, ShotDir = handsShots,
                    Carrying = () => night.Me != null ? night.Me.relic : "",
                    RelicStatus = id => { Relic r; return room.State.relics.TryGetValue(id, out r) ? r.status : "?"; },
                };
                // The relic door, from the map data.
                var mapJson = (Dictionary<string, object>)Json.Parse(Resources.Load<TextAsset>("Data/map").text);
                foreach (var o in (List<object>)mapJson["doors"])
                {
                    var d = (Dictionary<string, object>)o;
                    if ((string)d["id"] != (string)mapJson["relicDoor"]) continue;
                    bot.DoorX = Convert.ToDouble(d["x"], CultureInfo.InvariantCulture);
                    bot.DoorZ = Convert.ToDouble(d["z"], CultureInfo.InvariantCulture);
                    bot.DoorAlongX = (string)d["axis"] == "x";
                }
                if (handsTest.Count == 1 && handsTest[0] == "mine")
                {
                    // Your own tasks, as dealt; the server checks each one.
                    bot.Mine = true;
                    handsTest = night.Tasks.Where(task => !task.Done).Select(task => task.StationId).ToList();
                    Debug.Log("Doing my tasks: " + string.Join(", ", handsTest.ToArray()));
                }
                StartCoroutine(bot.Run(handsTest));
            }
            if (shotPath != null && !shotTaken && shotAt >= 0 && t >= shotAt)
            {
                shotTaken = true;
                ScreenCapture.CaptureScreenshot(shotPath);
                Debug.Log("Screenshot saved to " + shotPath + " with " + others.Count + " other players in view list");
            }
            if (teleportAt >= 0 && t >= teleportAt)
            {
                teleportAt = -1;
                room.Send("debug", new Dictionary<string, object> { { "teleport", new Dictionary<string, object> { { "x", teleportX }, { "z", teleportZ } } } });
                Debug.Log("Asked to move to " + teleportX + ", " + teleportZ);
            }
            if (nightSince >= 0)
            {
                for (int i = nightSends.Count - 1; i >= 0; i--)
                {
                    if (now - nightSince < nightSends[i].Key) continue;
                    var body = Json.Parse(nightSends[i].Value[1]) as Dictionary<string, object>;
                    if (nightSends[i].Value[0] == "_wheel")
                    {
                        // Opens the wheel and moves the mouse toward the power, as a player would, then lets go.
                        OpenWheel();
                        wheelTestKind = (string)body["kind"];
                        int slot = Array.IndexOf(PowerHud.WheelOrder, wheelTestKind);
                        double a = slot * Math.PI * 2 / PowerHud.WheelOrder.Length;
                        wheelMouse = new Vector2((float)Math.Sin(a), -(float)Math.Cos(a)) * 80;
                        wheelTestRelease = now + 1.5;
                    }
                    else if (nightSends[i].Value[0] == "_turn")
                    {
                        // Look the other way (a Summoned ghost comes from behind).
                        me.Yaw += Math.PI;
                    }
                    else if (nightSends[i].Value[0] == "_vote" || nightSends[i].Value[0] == "_ouija")
                    {
                        // Votes for (or, dead, pushes the planchette to) a player by name.
                        string target = (string)body["name"];
                        if (target != "skip" && target != "unknown") foreach (var kv in room.State.players) if (kv.Value.name == target) target = kv.Key;
                        room.Send(nightSends[i].Value[0].Substring(1), new Dictionary<string, object> { { "target", target } });
                    }
                    else if (body != null && body.Count > 0) room.Send(nightSends[i].Value[0], body);
                    else room.Send(nightSends[i].Value[0]);
                    Debug.Log("Sent " + nightSends[i].Value[0] + " " + nightSends[i].Value[1]);
                    nightSends.RemoveAt(i);
                }
                for (int i = nightShots.Count - 1; i >= 0; i--)
                {
                    if (now - nightSince < nightShots[i].Key) continue;
                    ScreenCapture.CaptureScreenshot(nightShots[i].Value);
                    Debug.Log("Screenshot " + nightShots[i].Value + " (prompt: " + hud.Prompt + ", cues: " + string.Join(" | ", hud.SoundCues.Select(c => c.Text + (c.Angle.HasValue ? " @" + (c.Angle.Value * Mathf.Rad2Deg).ToString("0", CultureInfo.InvariantCulture) : "") + (c.Vertical != null ? " " + c.Vertical : ""))) + ")");
                    nightShots.RemoveAt(i);
                }
            }
            if (wheelTestRelease >= 0 && now >= wheelTestRelease)
            {
                wheelTestRelease = -1;
                CloseWheel(true);
            }
            if (night.End != null && endSince < 0) endSince = now;
            if (endShot != null && endSince >= 0 && now - endSince >= 2)
            {
                // Test: the end screen, two seconds in.
                ScreenCapture.CaptureScreenshot(endShot);
                Debug.Log("End screen saved to " + endShot);
                endShot = null;
            }
            if (rematchAfter >= 0 && endSince >= 0 && now - endSince >= rematchAfter && room.State.host == room.SessionId)
            {
                rematchAfter = -1;
                room.Send("rematch");
                Debug.Log("Rematch");
            }
            if (quitAt >= 0 && t >= quitAt) Quit();
        }

        async void Quit()
        {
            quitAt = -1;
            left = true;
            try { if (room != null) await room.Leave(); } catch (Exception) { }
            Application.Quit();
        }

        void OnGUI()
        {
            if (tour != null) return;
            var style = new GUIStyle(GUI.skin.label) { fontSize = 18 };
            if (room == null)
            {
                GUILayout.BeginArea(new Rect(40, 40, 420, 400), GUI.skin.box);
                GUILayout.Label("Haunted Lobby (Unity, step A)", style);
                GUILayout.Label("Server");
                serverUrl = GUILayout.TextField(serverUrl);
                GUILayout.Label("Your name");
                playerName = GUILayout.TextField(playerName, 16);
                GUI.enabled = !busy;
                if (GUILayout.Button("Create a room", GUILayout.Height(32))) Connect(null, null);
                GUILayout.Label("Room code");
                joinCode = GUILayout.TextField(joinCode, 8);
                if (GUILayout.Button("Join", GUILayout.Height(32))) Connect(joinCode, null);
                GUI.enabled = true;
                GUILayout.Label(status);
                GUILayout.EndArea();
                return;
            }
            hud.Draw(room.RoomId);
            if (status != "") GUI.Label(new Rect(16, Screen.height - 70, 900, 30), status, style);
        }

        void OnApplicationQuit()
        {
            if (voice != null) voice.Disconnect();
            // Once only: Quit() has already left and waited for it.
            if (room != null && !left) { left = true; room.Leave(); }
        }
    }
}
