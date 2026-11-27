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
    ///   -unityShutdown     on quitting, leave D3D12's teardown to Unity (shows the old crash)
    ///   -debugAtNight 30 '{"down":true}'   30 s into the night, send this debug message (may repeat)
    ///   -sendAtNight 12 pourSalt '{}'   12 s into the night, send this message as if a key were pressed (may repeat)
    ///   -sendAtNight 12 _face '{"yaw":1.57,"pitch":0}'   12 s into the night, look that way (radians)
    ///   -shotAtNight 14 path   save a screenshot 14 s into the night (may repeat)
    ///   -rematchAfter 10   as host, press Rematch 10 s after the end screen
    ///   -nightUi           with -create or -join: the night's screens in the menus' panel, as with the menus (step E5)
    ///   -labelPng Rafi path   save the name label's picture for "Rafi" (may repeat)
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
        /// <summary>game.ts's black fog, from 1 to 18 m, and the camera's near plane (both cameras' 0.05 m).</summary>
        const float FogNearM = 1, FogFarM = 18;
        public const float CameraNearM = 0.05f;
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

        Menus menus;
        Camera menuCamera;
        /// <summary>
        /// Came in through the menus, so the room page (step E3) is home in the room; test runs that
        /// join from the command line keep the plain HUD lobby. Whether the page is open now, and how
        /// the room let us go (a close code to act on in Update, as the room page does main.ts onLeave).
        /// </summary>
        bool roomPage, pageUp;
        int? leftWith;

        // The live server (Data/release.json, set in Start: Unity loads nothing in a constructor); test runs pass -server.
        string serverUrl;
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
        /// <summary>Test aid (-sendAtNight SEC _tab {}): Tab held from then on, for the floor plan.</summary>
        bool tabTest;

        void Awake()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 1;
            Application.wantsToQuit += WantsToQuit;
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
            // URP measures fog depth from the near plane (0.05 m, as the browser's camera), three from the
            // eye: start and end come that much closer. The curve is three's smoothstep (URP patch 9).
            RenderSettings.fogStartDistance = FogNearM - CameraNearM;
            RenderSettings.fogEndDistance = FogFarM - CameraNearM;
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
            serverUrl = arg("-server") ?? Release.Server;
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
                // Test aid: save a name's label picture (NameLabel) to compare with the browser's canvas.
                if (args[i] == "-labelPng")
                {
                    float widthM;
                    var pic = NameLabel.Bake(args[i + 1], out widthM, true);
                    System.IO.File.WriteAllBytes(args[i + 2], pic.EncodeToPNG());
                    Debug.Log("Label " + args[i + 1] + ": " + pic.width + " x " + pic.height + " px, " + widthM.ToString("0.000", CultureInfo.InvariantCulture) + " m");
                }
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
            // Graphics quality (HauntedQuality): the Options choice, or what Auto chose; a test's
            // "-quality low" or "-quality high" overrides it for that run and keeps Auto from testing.
            qualityForced = arg("-quality") != null;
            HauntedQuality.Apply(qualityForced ? HauntedQuality.Parse(arg("-quality")) : Options.QualityLevel);
            Options.ApplyVolume();
            Options.Changed += ApplyOptions;
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
            // -hdrOut: the light before bloom, up to 4 (or -hdrRange X) in the picture (HauntedPost).
            Shader.SetGlobalFloat("_HauntedHdrOut", Array.IndexOf(args, "-hdrOut") < 0 ? 0 : arg("-hdrRange") != null ? float.Parse(arg("-hdrRange"), System.Globalization.CultureInfo.InvariantCulture) : 4);
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
            // -nightUi: a test that goes straight into a room still draws the night in the menus' panel (step E5).
            if (Array.IndexOf(args, "-nightUi") >= 0 && (Array.IndexOf(args, "-create") >= 0 || arg("-join") != null)) menus = new Menus(config) { Visible = false };
            if (Array.IndexOf(args, "-create") >= 0) Connect(null, script);
            else if (arg("-join") != null) Connect(arg("-join"), script);
            else ShowMenus(arg("-menuShots"));
        }

        /// <summary>The speed test while it runs (SpeedTest), else null.</summary>
        SpeedTest speedTest;

        /// <summary>
        /// Options' speed test (step E6): outside a room only, as the browser's (it moves the view
        /// round the hotel). The menus hide while it runs and come back with its result; the verdict
        /// becomes Auto quality's choice for this computer, and the result is saved as speed-test.txt.
        /// done hears the result (null if stopped or refused).
        /// </summary>
        void StartSpeedTest(Action<SpeedTest.Result> done = null)
        {
            if (speedTest != null) return;
            if (room != null)
            {
                menus.SpeedNote("Leave the room first: the test moves the view round the hotel.");
                done?.Invoke(null);
                return;
            }
            menus.Visible = false;
            // The backdrop's torch and figure go too: the test times the hotel alone.
            if (menuCamera != null) menuCamera.gameObject.SetActive(false);
            speedTest = gameObject.AddComponent<SpeedTest>();
            speedTest.World = world;
            speedTest.EyeHeightM = (float)Json.Num(Json.Obj(config, "movement"), "eyeHeightM");
            speedTest.Flashlight = Json.Obj(config, "flashlight");
            speedTest.HorizontalFovDeg = Options.Fov;
            speedTest.Ready = () => dressed == null || dressed.ReflectionsReady;
            speedTest.Progress = (what, fraction, fps) => menus.SpeedProgress(what, fraction, fps);
            speedTest.Finished = result =>
            {
                speedTest = null;
                if (menuCamera != null) menuCamera.gameObject.SetActive(true);
                string saved = null, note = null;
                if (result != null)
                {
                    try
                    {
                        saved = System.IO.Path.Combine(Application.persistentDataPath, "speed-test.txt");
                        System.IO.File.WriteAllText(saved, result.Text + "\n");
                    }
                    catch (Exception e) { Debug.LogWarning("Speed test: could not save the result: " + e.Message); saved = null; }
                    string pick = result.Recommended == HauntedQuality.Level.High ? "high" : "low";
                    string name = pick == "high" ? "High" : "Low";
                    Options.AutoQuality = pick;
                    note = Options.Quality == "auto" ? "Measured just now. Auto quality follows this result."
                        : "Your Quality is set to " + (Options.Quality == "high" ? "High" : "Low") + "; Auto would use " + name + " here.";
                    Debug.Log("Speed test result:\n" + result.Text);
                }
                menus.SpeedDone(result, saved, note);
                menus.Visible = true;
                done?.Invoke(result);
            };
        }

        /// <summary>
        /// Test aid "-speedTest FILE": from the Start screen, opens Options and runs the speed test
        /// as its button does, writes the result to FILE and quits ("-speedShots DIR": a picture
        /// partway through and one of the result). Gives up after 15 minutes.
        /// </summary>
        System.Collections.IEnumerator SpeedTestRun(string file, string shots)
        {
            const float LimitSec = 900;
            yield return new WaitForSecondsRealtime(2);
            if (menus.WarningShown) menus.HideWarning();
            menus.Go("options");
            bool over = false;
            SpeedTest.Result got = null;
            float started = Time.realtimeSinceStartup;
            StartSpeedTest(r => { got = r; over = true; });
            bool shotTaken = false, escTest = Array.IndexOf(Environment.GetCommandLineArgs(), "-speedEsc") >= 0;
            string autoWas = Options.AutoQuality;
            var levelWas = HauntedQuality.Current;
            int vSyncWas = QualitySettings.vSyncCount;
            while (!over && Time.realtimeSinceStartup - started < LimitSec)
            {
                // -speedEsc: Esc pressed 10 s in, as a player would; the test stops and nothing changes.
                if (escTest && Time.realtimeSinceStartup - started > 10)
                {
                    escTest = false;
                    var keys = UnityEngine.InputSystem.InputSystem.AddDevice<Keyboard>("Test keyboard");
                    UnityEngine.InputSystem.InputSystem.QueueStateEvent(keys, new UnityEngine.InputSystem.LowLevel.KeyboardState(UnityEngine.InputSystem.Key.Escape));
                    // Frames as well as time before the release: the test's first frames at High are
                    // slow, and a press and release landing in one update is no press at all.
                    int pressedFrame = Time.frameCount;
                    yield return new WaitForSecondsRealtime(0.1f);
                    while (Time.frameCount < pressedFrame + 3) yield return null;
                    UnityEngine.InputSystem.InputSystem.QueueStateEvent(keys, new UnityEngine.InputSystem.LowLevel.KeyboardState());
                    yield return Until(() => over, 5);
                    yield return new WaitForSecondsRealtime(1);
                    bool ok = over && got == null && menus.Visible && menus.Current == "options" && Options.AutoQuality == autoWas
                        && HauntedQuality.Current == levelWas && QualitySettings.vSyncCount == vSyncWas
                        && menus.ScreenPoint("Speed test stopped. Nothing was changed.") != null;
                    Debug.Log("Speed test Esc: " + (ok ? "ok" : "FAIL") + " (stopped " + over + ", on " + menus.Current + ", auto " + Options.AutoQuality + " was " + autoWas
                        + ", quality " + HauntedQuality.Current + " was " + levelWas + ", vsync " + QualitySettings.vSyncCount + " was " + vSyncWas + ")");
                    UnityEngine.InputSystem.InputSystem.RemoveDevice(keys);
                    if (shots != null)
                    {
                        System.IO.Directory.CreateDirectory(shots);
                        yield return new WaitForEndOfFrame();
                        var s = ScreenCapture.CaptureScreenshotAsTexture();
                        System.IO.File.WriteAllBytes(System.IO.Path.Combine(shots, "speed-stopped.png"), s.EncodeToPNG());
                        Destroy(s);
                    }
                    Application.Quit();
                    yield break;
                }
                if (shots != null && !shotTaken && Time.realtimeSinceStartup - started > 25)
                {
                    shotTaken = true;
                    System.IO.Directory.CreateDirectory(shots);
                    yield return new WaitForEndOfFrame();
                    var shot = ScreenCapture.CaptureScreenshotAsTexture();
                    System.IO.File.WriteAllBytes(System.IO.Path.Combine(shots, "speed-running.png"), shot.EncodeToPNG());
                    Destroy(shot);
                }
                yield return null;
            }
            if (!over && speedTest != null) speedTest.Stop();
            System.IO.File.WriteAllText(file, got != null ? got.Text + "\n" : "Speed test did not finish.\n");
            Debug.Log("Speed test run: " + (got != null ? "done in " + (Time.realtimeSinceStartup - started).ToString("0", CultureInfo.InvariantCulture) + " s" : "FAILED"));
            if (shots != null)
            {
                yield return new WaitForSecondsRealtime(1.5f);
                menus.ScrollToSpeedResult();
                yield return new WaitForSecondsRealtime(0.8f);
                yield return new WaitForEndOfFrame();
                var shot = ScreenCapture.CaptureScreenshotAsTexture();
                System.IO.File.WriteAllBytes(System.IO.Path.Combine(shots, "speed-result.png"), shot.EncodeToPNG());
                Destroy(shot);
            }
            Application.Quit();
        }

        /// <summary>
        /// Before a room: the hotel behind the menus, a torch creeping down a corridor (TitleBackdrop;
        /// owner, 2026-11-27: an animated horror background). The browser had black (#050507).
        /// </summary>
        void MakeMenuCamera()
        {
            menuCamera = new GameObject("Menu camera").AddComponent<Camera>();
            menuCamera.clearFlags = CameraClearFlags.SolidColor;
            menuCamera.backgroundColor = new Color32(5, 5, 7, 255);
            menuCamera.cullingMask = 0;
            var backdrop = menuCamera.gameObject.AddComponent<TitleBackdrop>();
            backdrop.WobbleAllowed = () => Options.PhotoWarningSeen && !Options.Photosensitive;
            backdrop.Begin(menuCamera, world, config, baseMaterial);
        }

        /// <summary>
        /// -titleShots DIR (a test aid): the title screen over the backdrop at moments of its walk (the
        /// empty corridor, the figure far, a dip, the figure near, gone), then Start game and About; quits.
        /// </summary>
        System.Collections.IEnumerator TitleShots(string dir)
        {
            Directory.CreateDirectory(dir);
            if (menus.WarningShown)
            {
                yield return new WaitForSecondsRealtime(2);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, "title-warning.png"));
                yield return null;
                menus.HideWarning();
            }
            var backdrop = menuCamera.GetComponent<TitleBackdrop>();
            foreach (float at in new[] { 7f, 18f, 25.9f, 30f, 44f })
            {
                backdrop.SkipTo(at);
                yield return new WaitForSecondsRealtime(0.6f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, "title-" + at.ToString("0.0", CultureInfo.InvariantCulture) + "s.png"));
                yield return null;
                // The backdrop alone, to judge its light.
                menus.Visible = false;
                yield return null;
                yield return null;
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, "backdrop-" + at.ToString("0.0", CultureInfo.InvariantCulture) + "s.png"));
                yield return null;
                menus.Visible = true;
            }
            backdrop.SkipTo(19);
            foreach (var screen in new[] { "play", "about", "create", "join", "options" })
            {
                menus.Reset("start");
                menus.Go(screen);
                yield return new WaitForSecondsRealtime(1.2f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, "title-" + screen + ".png"));
                yield return null;
                // Each of Options' tabs.
                for (int tab = 1; screen == "options" && menus.OpenTabForTest(tab); tab++)
                {
                    yield return new WaitForSecondsRealtime(0.6f);
                    ScreenCapture.CaptureScreenshot(Path.Combine(dir, "title-options-" + tab + ".png"));
                    yield return null;
                }
            }
            yield return new WaitForSecondsRealtime(1);
            Debug.Log("Title shots saved to " + dir);
            Application.Quit();
        }

        /// <summary>The menus (step E) when no test option says what to do: Start, Create, Join.</summary>
        void ShowMenus(string shotsDir)
        {
            MakeMenuCamera();
            menus = new Menus(config);
            StartCoroutine(Release.Check());
            menus.Create = name => { playerName = name; Connect(null, null); };
            menus.Join = (code, name) => { playerName = name; Connect(code, null); };
            menus.SpeedTestStart = () => StartSpeedTest();
            // Under test the window is often not in front (the desk is in use): the Input System would
            // switch the test's own mouse and keyboard off with the focus, and their clicks and Esc go nowhere.
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-speedEsc") >= 0 || Array.IndexOf(Environment.GetCommandLineArgs(), "-menuInput") >= 0)
                UnityEngine.InputSystem.InputSystem.settings.backgroundBehavior = UnityEngine.InputSystem.InputSettings.BackgroundBehavior.IgnoreFocus;
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-speedTest") is int st && st >= 0 && st + 1 < Environment.GetCommandLineArgs().Length)
                StartCoroutine(SpeedTestRun(Environment.GetCommandLineArgs()[st + 1], Array.IndexOf(Environment.GetCommandLineArgs(), "-speedShots") is int sh && sh >= 0 ? Environment.GetCommandLineArgs()[sh + 1] : null));
            if (shotsDir != null) StartCoroutine(MenuShots(shotsDir));
            if (TestArg("-titleShots") is string titleDir) StartCoroutine(TitleShots(titleDir));
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-menuInput") >= 0) StartCoroutine(MenuInput());
        }

        /// <summary>
        /// -menuInput: the menus driven by queued Input System events (a mouse and the keyboard, as a
        /// player's input arrives): the warning answered, a made-up code joined (an error), back,
        /// a room created by name. Logs each check as "Menu input:" and quits.
        /// </summary>
        [System.Runtime.InteropServices.DllImport("user32.dll")]
        static extern bool PostMessage(IntPtr window, uint message, IntPtr w, IntPtr l);

        System.Collections.IEnumerator MenuInput()
        {
            var mouse = UnityEngine.InputSystem.InputSystem.AddDevice<UnityEngine.InputSystem.Mouse>("Test mouse");
            // A mouse of its own: the window runs unfocused under test, and the Input System parks
            // the real one while it is. The real ones are switched off too: a window opening under
            // the desk's cursor makes that mouse the current one, and its place would take the clicks.
            foreach (var device in UnityEngine.InputSystem.InputSystem.devices.ToArray())
                if (device is UnityEngine.InputSystem.Mouse && device != mouse) UnityEngine.InputSystem.InputSystem.DisableDevice(device);
            mouse.MakeCurrent();
            int failed = 0;
            menus.LogPointers();
            void Check(string what, bool ok) { if (!ok) failed++; Debug.Log("Menu input: " + (ok ? "ok   " : "FAIL ") + what); }
            System.Collections.IEnumerator Click(string text, int field = -1)
            {
                var p = field >= 0 ? menus.FieldPoint(field) : menus.ScreenPoint(text);
                // Again once a scroll (or the tab it opened) has been laid out.
                yield return new WaitForSecondsRealtime(0.2f);
                p = field >= 0 ? menus.FieldPoint(field) : menus.ScreenPoint(text);
                Check("found \"" + text + "\"", p != null);
                if (p == null) yield break;
                Debug.Log("Menu input: click state focused " + Application.isFocused + ", test mouse enabled " + mouse.enabled + ", current " + (UnityEngine.InputSystem.Mouse.current == mouse) + ", frame " + Time.frameCount + ", dt " + Time.unscaledDeltaTime.ToString("0.000"));
                UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, new UnityEngine.InputSystem.LowLevel.MouseState { position = p.Value });
                yield return new WaitForSecondsRealtime(0.15f);
                // Frames as well as time between the press and the release: on a slow frame both
                // would land in one update and UI Toolkit would see no press.
                int frame = Time.frameCount;
                UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, new UnityEngine.InputSystem.LowLevel.MouseState { position = p.Value }.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Left, true));
                yield return new WaitForSecondsRealtime(0.1f);
                while (Time.frameCount < frame + 3) yield return null;
                UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, new UnityEngine.InputSystem.LowLevel.MouseState { position = p.Value });
                yield return new WaitForSecondsRealtime(0.6f);
            }
            // Typing reaches UI Toolkit as the window's own key messages, so the test posts those.
            var window = System.Diagnostics.Process.GetCurrentProcess().MainWindowHandle;
            System.Collections.IEnumerator Type(string text)
            {
                foreach (char c in text) { PostMessage(window, 0x0102, (IntPtr)c, (IntPtr)1); yield return new WaitForSecondsRealtime(0.05f); }
                yield return new WaitForSecondsRealtime(0.3f);
            }
            System.Collections.IEnumerator PressEnter()
            {
                PostMessage(window, 0x0100, (IntPtr)0x0D, (IntPtr)0x001C0001);
                yield return new WaitForSecondsRealtime(0.05f);
                PostMessage(window, 0x0101, (IntPtr)0x0D, unchecked((IntPtr)(int)0xC01C0001));
                yield return new WaitForSecondsRealtime(0.4f);
            }

            yield return new WaitForSecondsRealtime(1.5f);
            // The panel takes up a new mouse with its first event; this one only wakes it.
            UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, new UnityEngine.InputSystem.LowLevel.MouseState { position = new Vector2(1, 1) });
            yield return new WaitForSecondsRealtime(0.3f);
            if (menus.WarningShown)
            {
                yield return Click("Continue");
                Check("warning answered", !menus.WarningShown);
            }
            if (Array.IndexOf(Environment.GetCommandLineArgs(), "-story8") >= 0)
            {
                yield return Story8(Click, Type, Check);
                Debug.Log("Menu input: " + (failed == 0 ? "all passed" : failed + " failed"));
                Application.Quit();
                yield break;
            }
            yield return OptionsInput(mouse, window, Click, Type, PressEnter, Check);
            string joinCode = TestArg("-roomJoin");
            if (joinCode != null)
            {
                yield return RoomJoinInput(joinCode, Click, Type, PressEnter, Check);
                Debug.Log("Menu input: " + (failed == 0 ? "all passed" : failed + " failed"));
                Application.Quit();
                yield break;
            }
            // The title screen (owner, 2026-11-27): Start game opens Create and Join.
            yield return Click("START GAME");
            Check("start game list", menus.Current == "play");
            yield return Click("JOIN A ROOM");
            Check("join screen", menus.Current == "join");
            yield return Type("qqzzw");
            Check("code typed and upper-cased: " + string.Join("|", menus.FieldValues()), menus.FieldValues()[0] == "QQZZW");
            string saved = menus.FieldValues()[1];
            yield return Click("the name field", 1);
            yield return Type(saved == "" ? "Tester" : "");
            string name = saved == "" ? "Tester" : saved;
            Check("name typed: " + string.Join("|", menus.FieldValues()), menus.FieldValues()[1] == name);
            yield return PressEnter();
            float until = Time.realtimeSinceStartup + 10;
            while (menus.ShownError == "" && Time.realtimeSinceStartup < until) yield return null;
            Check("no such room: \"" + menus.ShownError + "\"", menus.ShownError != "" && room == null);
            yield return Click("BACK");
            Check("back to the start game list", menus.Current == "play");
            yield return Click("CREATE A ROOM");
            Check("create screen, name kept: " + string.Join("|", menus.FieldValues()), menus.Current == "create");
            if (menus.FieldValues()[0] == "") yield return Type(name);
            yield return Click("Create room");
            until = Time.realtimeSinceStartup + 15;
            while (room == null && Time.realtimeSinceStartup < until) yield return null;
            Check("room created as " + playerName + (room != null ? " (" + room.RoomId + ")" : ""), room != null && playerName == name);
            yield return RoomHostInput(mouse, name, Click, Check);
            Debug.Log("Menu input: " + (failed == 0 ? "all passed" : failed + " failed"));
            Application.Quit();
        }

        /// <summary>
        /// -menuInput -story8 (step E6, PRD Phase 7's done-when with a Unity host): through the real
        /// menus, makes a room, waits for 8 players (tools/playtest.ts e6 brings 7 bots, given the code
        /// by -codeFile), and plays two nights without restarting anything: Ready and Start, the night,
        /// its end screen, Rematch, a settings change (the Hardcore preset), Ready and Start again, the
        /// second night (new characters, the tasks afresh, Hardcore's night length), its end screen,
        /// and Leave. The bots end each night by dawn (a debug server's nightTime) and report what they see.
        /// </summary>
        System.Collections.IEnumerator Story8(Func<string, int, System.Collections.IEnumerator> click,
            Func<string, System.Collections.IEnumerator> type, Action<string, bool> check)
        {
            yield return click("START GAME", -1);
            yield return click("CREATE A ROOM", -1);
            if (menus.FieldValues()[0] == "") yield return type("Unity");
            yield return click("Create room", -1);
            yield return Until(() => room?.State?.players != null && menus.Current == "room", 20);
            check("room made: " + room?.RoomId, room != null && menus.Current == "room");
            // The speed test from inside a room is refused with a line (the room page has Options).
            yield return click("Options", -1);
            yield return click("Run the speed test", -1);
            yield return new WaitForSecondsRealtime(0.5f);
            check("speed test refused in a room", menus.Current == "options" && menus.Visible && menus.ScreenPoint("Leave the room first: the test moves the view round the hotel.") != null);
            yield return click("BACK", -1);
            check("back to the room page", menus.Current == "room");
            yield return Until(() => room.State.players.Count >= 8, 180);
            check("8 players in: " + string.Join(" / ", menus.PlayerRows()), room.State.players.Count == 8);
            bool OthersReady() { int n = 0; foreach (var kv in room.State.players) if (kv.Key != room.SessionId && kv.Value.ready) n++; return n == 7; }
            yield return Until(OthersReady, 60);
            check("the 7 others ready", OthersReady());
            yield return RoomShot("story-room-8");

            string characterWas = null;
            double lengthWas = 0;
            for (int n = 1; n <= 2; n++)
            {
                string tag = "night " + n + ": ";
                // The host has no Ready: Start counts as theirs.
                check(tag + "Start offered to the host", menus.ScreenPoint("Start the night") != null);
                yield return click("Start the night", -1);
                yield return Until(() => room.State.stage == "night" && night.End == null, 90);
                check(tag + "started (" + room.State.stage + ")", room.State.stage == "night" && night.End == null);
                yield return new WaitForSecondsRealtime(2);
                yield return RoomShot("story-started-" + n);
                // The room page stays up over the night's start until you go back to it (as the browser's).
                yield return click("Back to the night", -1);
                yield return new WaitForSecondsRealtime(1.5f);
                var mine = night.Me;
                check(tag + "the HUD is up, the room page and end screen away", !menus.Visible && !menus.EndUp && menus.NightBarUp);
                check(tag + "7 others drawn: " + others.Ids.Count(), others.Ids.Count() == 7);
                check(tag + "tasks afresh: " + room.State.tasksDone + "/" + room.State.tasksTotal + ", mine " + night.Tasks.Count, room.State.tasksDone == 0 && room.State.tasksTotal > 0 && night.Tasks.Count > 0);
                check(tag + "alive, as " + mine?.character + " (" + night.Role + ")", mine != null && mine.health == "alive" && !string.IsNullOrEmpty(mine.character));
                if (n == 1) { characterWas = mine?.character; lengthWas = room.State.nightLength; }
                else
                {
                    check(tag + "settings in effect: night " + lengthWas + " s -> " + room.State.nightLength + " s, code " + room.State.settingsCode,
                        room.State.settingsCode.StartsWith("HRD") && room.State.nightLength != lengthWas);
                    // Dealt afresh at random (HauntedRoom dealRoles), so the same one comes again one night in eight.
                    check(tag + "a character dealt again: " + characterWas + " -> " + mine?.character, mine != null && !string.IsNullOrEmpty(mine.character));
                }
                yield return RoomShot("story-night-" + n);
                yield return Until(() => night.End != null, 240);
                yield return new WaitForSecondsRealtime(2);
                check(tag + "ended: " + night.End?.Winner + " (" + night.End?.Reason + "), end screen up", night.End != null && menus.EndUp && menus.Visible == false);
                yield return RoomShot("story-end-" + n);
                if (n == 2) break;

                yield return click("Rematch", -1);
                yield return Until(() => room.State.stage == "waiting" && menus.Current == "room" && menus.Visible, 20);
                yield return new WaitForSecondsRealtime(1);
                check("rematch: back in the room, 8 players", room.State.stage == "waiting" && menus.Current == "room" && room.State.players.Count == 8);
                check("rematch: end screen and HUD gone, night cleared", !menus.EndUp && !menus.NightBarUp && night.End == null && night.Tasks.Count == 0);
                yield return RoomShot("story-rematch");
                yield return click("Change settings", -1);
                yield return click("Hardcore", -1);
                yield return Until(() => room.State.settingsCode.StartsWith("HRD"), 5);
                yield return new WaitForSecondsRealtime(0.5f);
                check("Hardcore chosen: shown " + menus.SettingsShown + ", server " + room.State.settingsCode,
                    room.State.settingsCode.StartsWith("HRD") && menus.SettingsShown.StartsWith(room.State.settingsCode));
                yield return click("BACK TO THE ROOM", -1);
                yield return Until(OthersReady, 60);
                check("the 7 others ready again", OthersReady());
            }
            yield return click("Leave", -1);
            yield return Until(() => room == null && menus.Current == "start", 10);
            check("left from the end screen: the start screen", room == null && menus.Current == "start" && menus.Visible);
        }

        static string TestArg(string key)
        {
            var args = Environment.GetCommandLineArgs();
            int i = Array.IndexOf(args, key);
            return i >= 0 && i + 1 < args.Length ? args[i + 1] : null;
        }

        System.Collections.IEnumerator ClickAt(UnityEngine.InputSystem.Mouse mouse, Vector2 p)
        {
            UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, new UnityEngine.InputSystem.LowLevel.MouseState { position = p });
            yield return new WaitForSecondsRealtime(0.15f);
            UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, new UnityEngine.InputSystem.LowLevel.MouseState { position = p }.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Left, true));
            yield return new WaitForSecondsRealtime(0.1f);
            UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, new UnityEngine.InputSystem.LowLevel.MouseState { position = p });
            yield return new WaitForSecondsRealtime(0.6f);
        }

        /// <summary>-pageShots DIR: the screen as it is now, saved as DIR/unity-NAME.png and .json (its layout) for the browser comparison.</summary>
        System.Collections.IEnumerator RoomShot(string name)
        {
            string dir = TestArg("-pageShots");
            if (dir == null) yield break;
            Directory.CreateDirectory(dir);
            yield return new WaitForSecondsRealtime(0.6f);
            ScreenCapture.CaptureScreenshot(Path.Combine(dir, "unity-" + name + ".png"));
            File.WriteAllText(Path.Combine(dir, "unity-" + name + ".json"), menus.Dump());
            yield return new WaitForSecondsRealtime(0.4f);
        }

        static System.Collections.IEnumerator Until(Func<bool> done, float sec)
        {
            float end = Time.realtimeSinceStartup + sec;
            while (!done() && Time.realtimeSinceStartup < end) yield return null;
        }

        /// <summary>
        /// -menuInput's room pass as host (step E3): the room page with its players (-roomPlayers N:
        /// wait for that many, e.g. tools/playtest.ts e3 bots and a browser player, given the code by
        /// -codeFile), the Hardcore preset, the match length changed by hand, back to the room, the
        /// first other player removed (Remove, then Sure?), a walk into the hotel and Esc back, Leave
        /// (twice), and a new room made after it.
        /// </summary>
        System.Collections.IEnumerator RoomHostInput(UnityEngine.InputSystem.Mouse mouse, string name,
            Func<string, int, System.Collections.IEnumerator> click, Action<string, bool> check)
        {
            yield return Until(() => (menus.Current == "room" || menus.Current == "mic") && room?.State?.players != null, 5);
            // Step E4: with voice on, the mic check opens by itself; it is done with the test tone (-voiceTone).
            yield return Until(() => menus.Current == "mic", voice != null ? 15 : 0);
            if (menus.Current == "mic")
            {
                check("mic check opened by itself", true);
                yield return RoomShot("mic");
                if (!micOptional)
                {
                    // A real server: later is allowed, but the room page says what is missing, and the
                    // check is found again under Options (main.ts showLookHint, #options-mic).
                    yield return click("Do it later", -1);
                    yield return new WaitForSecondsRealtime(0.5f);
                    check("room says the mic check is missing", menus.Current == "room" && menus.ScreenPoint("Do the mic check before you play.") != null);
                    yield return RoomShot("room-mic-needed");
                    yield return click("Options", -1);
                    yield return click("Test your mic or check it again", -1);
                    check("mic check from Options", menus.Current == "mic");
                }
                yield return click("Start mic check", -1);
                yield return Until(() => micChecked, 20);
                yield return new WaitForSecondsRealtime(0.5f);
                check("mic check done", micChecked && menus.ScreenPoint("Continue to the room") != null);
                yield return RoomShot("mic-done");
                yield return click("Continue to the room", -1);
                if (menus.Current == "options") yield return click("BACK", -1);
                check("look hint back to walking", menus.ScreenPoint("Walk around the hotel while you wait. Esc brings this page back.") != null);
            }
            check("room page shown: code " + room?.RoomId, menus.Visible && menus.Current == "room");
            yield return new WaitForSecondsRealtime(1);
            check("you in the list: " + string.Join(" / ", menus.PlayerRows()), menus.PlayerRows().Any(r => r.Contains(name)));
            int want = int.Parse(TestArg("-roomPlayers") ?? "1", CultureInfo.InvariantCulture);
            yield return Until(() => room.State.players.Count >= want, 180);
            // The others press Ready as they come in.
            yield return new WaitForSecondsRealtime(3);
            check(want + " in the room: " + string.Join(" / ", menus.PlayerRows()), menus.PlayerRows().Length >= want);
            yield return RoomShot("room-host");
            yield return click("Change settings", -1);
            check("settings screen", menus.Current == "settings");
            yield return RoomShot("settings-host");
            yield return click("ADVANCED", -1);
            yield return RoomShot("settings-advanced");
            yield return click("BASIC", -1);
            yield return click("Hardcore", -1);
            yield return Until(() => room.State.settingsCode.StartsWith("HRD"), 5);
            yield return new WaitForSecondsRealtime(0.3f);
            check("Hardcore: shown " + menus.SettingsShown + ", server " + room.State.settingsCode,
                room.State.settingsCode.StartsWith("HRD") && menus.SettingsShown.StartsWith(room.State.settingsCode));
            yield return new WaitForSecondsRealtime(2);
            yield return click("10 min", -1);
            yield return click("20 min", -1);
            yield return Until(() => room.State.settingsCode.StartsWith("CUS-20"), 5);
            yield return new WaitForSecondsRealtime(0.3f);
            check("match length 20 by hand: shown " + menus.SettingsShown + ", server " + room.State.settingsCode,
                room.State.settingsCode.StartsWith("CUS-20") && menus.SettingsShown.StartsWith(room.State.settingsCode));
            yield return new WaitForSecondsRealtime(2);
            yield return click("BACK TO THE ROOM", -1);
            check("back to the room, summary " + menus.SettingsShown, menus.Current == "room" && menus.SettingsShown.Contains("Custom · 20 min"));
            if (want > 1)
            {
                int before = room.State.players.Count;
                var rows = menus.PlayerRows();
                var p = menus.KickPoint(0);
                check("a Remove button", p != null);
                if (p != null)
                {
                    yield return ClickAt(mouse, p.Value);
                    check("Remove asks \"Sure?\"", menus.ScreenPoint("Sure?") != null && room.State.players.Count == before);
                    yield return ClickAt(mouse, menus.KickPoint(0) ?? p.Value);
                    yield return Until(() => room.State.players.Count == before - 1, 10);
                    yield return new WaitForSecondsRealtime(0.5f);
                    check("removed one: " + string.Join(" / ", rows) + "  ->  " + string.Join(" / ", menus.PlayerRows()),
                        room.State.players.Count == before - 1 && menus.PlayerRows().Length == before - 1);
                }
                yield return new WaitForSecondsRealtime(2);
            }
            // Into the hotel and back with Esc (a keyboard of the test's own, as the mouse).
            yield return click("Walk around the hotel", -1);
            yield return new WaitForSecondsRealtime(0.5f);
            check("walking: mouse held, page away", Cursor.lockState == CursorLockMode.Locked && !menus.Visible && hud.PageUp == false);
            var keys = UnityEngine.InputSystem.InputSystem.AddDevice<Keyboard>("Test keyboard");
            UnityEngine.InputSystem.InputSystem.QueueStateEvent(keys, new UnityEngine.InputSystem.LowLevel.KeyboardState(UnityEngine.InputSystem.Key.Escape));
            yield return new WaitForSecondsRealtime(0.1f);
            UnityEngine.InputSystem.InputSystem.QueueStateEvent(keys, new UnityEngine.InputSystem.LowLevel.KeyboardState());
            yield return new WaitForSecondsRealtime(0.5f);
            check("Esc: the page is back", Cursor.lockState != CursorLockMode.Locked && menus.Visible && menus.Current == "room");
            UnityEngine.InputSystem.InputSystem.RemoveDevice(keys);
            yield return click("Leave room", -1);
            check("Leave asks again", menus.ScreenPoint("Click again to leave") != null && room != null);
            yield return RoomShot("room-leave");
            yield return click("Click again to leave", -1);
            check("left: the start screen, no room", room == null && menus.Visible && menus.Current == "start" && menuCamera != null);
            yield return new WaitForSecondsRealtime(1);
            yield return click("START GAME", -1);
            yield return click("CREATE A ROOM", -1);
            yield return click("Create room", -1);
            // A new room asks for the mic check again (main.ts reloads the page on leaving).
            yield return Until(() => room != null && (menus.Current == "room" || menus.Current == "mic"), 15);
            yield return new WaitForSecondsRealtime(voice != null ? 4 : 1);
            check("a new room after leaving: " + room?.RoomId + ", " + string.Join(" / ", menus.PlayerRows()) + ", on " + menus.Current,
                room != null && (menus.Current == "room" || (voice != null && menus.Current == "mic")) && menus.PlayerRows().Length == 1);
            yield return new WaitForSecondsRealtime(1);
        }

        /// <summary>
        /// -menuInput -roomJoin CODE (step E3): joins a browser host's room through the Join screen,
        /// logs each settings change it is shown, and waits (4 minutes at most) to be removed: back at
        /// Start with the host's reason.
        /// </summary>
        System.Collections.IEnumerator RoomJoinInput(string code, Func<string, int, System.Collections.IEnumerator> click,
            Func<string, System.Collections.IEnumerator> type, Func<System.Collections.IEnumerator> enter, Action<string, bool> check)
        {
            yield return click("START GAME", -1);
            yield return click("JOIN A ROOM", -1);
            yield return type(code.ToLowerInvariant());
            if (menus.FieldValues()[1] == "")
            {
                yield return click("the name field", 1);
                yield return type("Unity");
            }
            yield return enter();
            yield return Until(() => room != null && menus.Current == "room" && room.State?.players != null, 15);
            yield return new WaitForSecondsRealtime(1.5f);
            check("in the browser host's room " + code + ": " + string.Join(" / ", menus.PlayerRows()), room != null && menus.Current == "room");
            check("a guest sees the settings, not changes them", menus.ScreenPoint("See all settings") != null && menus.ScreenPoint("Change settings") == null);
            yield return RoomShot("room-guest");
            yield return click("See all settings", -1);
            yield return RoomShot("settings-guest");
            yield return click("BACK TO THE ROOM", -1);
            string seen = menus.SettingsShown;
            Debug.Log("Menu input: settings shown " + seen);
            int changes = 0;
            float end = Time.realtimeSinceStartup + 240;
            while (room != null && Time.realtimeSinceStartup < end)
            {
                if (menus.SettingsShown != seen) { seen = menus.SettingsShown; changes++; Debug.Log("Menu input: settings shown " + seen); }
                yield return null;
            }
            check(changes + " settings changes seen", changes > 0);
            yield return new WaitForSecondsRealtime(0.5f);
            check("removed: start screen saying \"" + menus.ShownError + "\"",
                room == null && menus.Current == "start" && menus.ShownError == "The host removed you from the room.");
        }

        /// <summary>
        /// -menuInput's Options pass (step E2): a slider dragged, a box ticked, the sensitivity typed,
        /// Low then High chosen, a key refused and one rebound, the keys reset. What the player had is put back.
        /// </summary>
        System.Collections.IEnumerator OptionsInput(UnityEngine.InputSystem.Mouse mouse, IntPtr window,
            Func<string, int, System.Collections.IEnumerator> click, Func<string, System.Collections.IEnumerator> type,
            Func<System.Collections.IEnumerator> enter, Action<string, bool> check)
        {
            int volume = Options.Volume;
            bool photo = Options.Photosensitive;
            double sensitivity = Options.Sensitivity;
            string quality = Options.Quality;
            void Key(int vk, int scan)
            {
                PostMessage(window, 0x0100, (IntPtr)vk, (IntPtr)(0x00000001 | scan << 16));
                PostMessage(window, 0x0101, (IntPtr)vk, unchecked((IntPtr)(int)(0xC0000001 | (uint)scan << 16)));
            }
            void Move(Vector2 p, bool down)
            {
                var state = new UnityEngine.InputSystem.LowLevel.MouseState { position = p };
                if (down) state = state.WithButton(UnityEngine.InputSystem.LowLevel.MouseButton.Left, true);
                UnityEngine.InputSystem.InputSystem.QueueStateEvent(mouse, state);
            }
            yield return click("OPTIONS", -1);
            check("options screen", menus.Current == "options");
            // Pressed at 30 %, dragged to 50 %, let go: the slider follows the held button.
            menus.RangePoint(0, 0.3f);
            yield return new WaitForSecondsRealtime(0.3f);
            Move(menus.RangePoint(0, 0.3f), false);
            yield return new WaitForSecondsRealtime(0.15f);
            Move(menus.RangePoint(0, 0.3f), true);
            yield return new WaitForSecondsRealtime(0.2f);
            check("volume pressed at 30%: " + Options.Volume, Options.Volume == 30);
            Move(menus.RangePoint(0, 0.5f), true);
            yield return new WaitForSecondsRealtime(0.2f);
            Move(menus.RangePoint(0, 0.5f), false);
            yield return new WaitForSecondsRealtime(0.3f);
            check("volume dragged to 50%: " + Options.Volume + ", heard at " + AudioListener.volume, Options.Volume == 50 && Mathf.Approximately(AudioListener.volume, 0.5f));
            yield return click("Photosensitivity mode", -1);
            check("photosensitivity toggled", Options.Photosensitive != photo);
            yield return click("Photosensitivity mode", -1);
            check("photosensitivity back", Options.Photosensitive == photo);
            yield return click("the sensitivity box", 0);
            // Clear the box (Backspace and Delete as key messages), then type.
            for (int i = 0; i < 8; i++)
            {
                Key(0x08, 0x0E);
                Key(0x2E, 0x153);
                yield return new WaitForSecondsRealtime(0.05f);
            }
            yield return type("3.18");
            yield return enter();
            check("sensitivity typed: " + Options.Sensitivity, Math.Abs(Options.Sensitivity - 3.18) < 1e-9);
            yield return click(Options.Quality == "auto" ? "Auto" : Options.Quality == "high" ? "High" : "Low", -1);
            yield return click("Low", -1);
            check("quality Low: " + Options.Quality + ", drawing " + HauntedQuality.Current, Options.Quality == "low" && HauntedQuality.Current == HauntedQuality.Level.Low);
            yield return click("Low", -1);
            yield return click("High", -1);
            check("quality High: drawing " + HauntedQuality.Current, Options.Quality == "high" && HauntedQuality.Current == HauntedQuality.Level.High);
            // Rebinding: use (E) waits for a key; L is a debug key and is refused; F is taken.
            yield return click("E", -1);
            check("listening for a key", menus.Listening);
            Key(0x4C, 0x26);
            yield return new WaitForSecondsRealtime(0.4f);
            check("L refused, still listening", menus.Listening && Options.Keys.Code("use") == "KeyE" && menus.ScreenPoint("Not that key") != null);
            Key(0x46, 0x21);
            yield return new WaitForSecondsRealtime(0.4f);
            check("use bound to F: " + Options.Keys.Code("use") + ", hint \"" + Options.Keys.Hint("Hold E  Hide") + "\"", !menus.Listening && Options.Keys.Code("use") == "KeyF" && Options.Keys.Hint("Hold E  Hide") == "Hold F  Hide");
            yield return click("Reset all keys", -1);
            check("keys reset", Options.Keys.Code("use") == "KeyE" && menus.ScreenPoint("F") == null);
            // Put back what this player had.
            Options.Volume = volume;
            Options.Photosensitive = photo;
            Options.Sensitivity = sensitivity;
            Options.Quality = quality;
            Options.Notify();
            yield return click("BACK", -1);
            check("back to start from options", menus.Current == "start");
        }

        /// <summary>
        /// -menuShots DIR: each menu screen in turn, saved as DIR/unity-NAME.png, then quits. For step
        /// E's comparison with the browser (delete PlayerPrefs' photoWarningSeen to see the warning).
        /// </summary>
        System.Collections.IEnumerator MenuShots(string dir)
        {
            Directory.CreateDirectory(dir);
            if (menus.WarningShown)
            {
                yield return new WaitForSecondsRealtime(1.2f);
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, "unity-warning.png"));
                File.WriteAllText(Path.Combine(dir, "unity-warning.json"), menus.Dump());
                yield return null;
                yield return null;
                menus.HideWarning();
            }
            foreach (var screen in new[] { "start", "play", "about", "create", "join", "options", "options-end" })
            {
                if (screen == "start") menus.Reset("start");
                else if (screen == "options-end") menus.ScrollToEnd();
                else { menus.Reset("start"); menus.Go(screen); }
                yield return new WaitForSecondsRealtime(1.2f);
                if (screen == "options") Debug.Log(menus.KerningLog());
                ScreenCapture.CaptureScreenshot(Path.Combine(dir, "unity-" + screen + ".png"));
                File.WriteAllText(Path.Combine(dir, "unity-" + screen + ".json"), menus.Dump());
                yield return null;
                yield return null;
            }
            // The last picture is written a moment after it is asked for.
            yield return new WaitForSecondsRealtime(1);
            Debug.Log("Menu shots saved to " + dir);
            Application.Quit();
        }

        async void Connect(string code, string script)
        {
            busy = true;
            if (menus != null) menus.SetBusy(true);
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
                if (menus != null) { status = ""; menus.SetBusy(false); menus.ShowError(menus.JoinErrorText(e.Message)); }
            }
        }

        void OnJoined(string script)
        {
            status = "";
            busy = false;
            if (menuCamera != null) { Destroy(menuCamera.gameObject); menuCamera = null; }
            var move = GameData.LoadMovement(config);
            me = new LocalPlayer(hotel, move, config);
            ApplyOptions();
            held = new HeldTorch(me.Camera.transform);
            if (script == "walk") me.Script = WalkScript;
            var joined = room;
            room.OnStateChange += (state, first) => { if (room == joined) OnState(state); };
            room.OnLeave += code =>
            {
                Debug.Log("Left the room (" + code + ")");
                if (room != joined) return;
                status = "Left the room (" + code + ")";
                if (roomPage) leftWith = code;
            };
            room.OnError += (code, message) => Debug.LogError("Room error " + code + ": " + message);
            night = new Night(room, map, config) { MyName = playerName };
            night.Flashed += (by, x, z) => items.Flash(by == room.SessionId, x, z);
            ListenForTasks();
            hud = new Hud(night, () => room.State, () => room.SessionId, (type, msg) => { if (msg == null) room.Send(type); else room.Send(type, msg); }, config);
            meetingScreen = new MeetingScreen(night, config, (type, msg) => room.Send(type, msg));
            hud.Meeting = meetingScreen;
            // Step E5: the night's screens in the menus' panel (a run without menus keeps Hud's plain ones).
            hud.Ui = menus;
            hud.World = world;
            hud.Here = () => me != null ? new Vector2((float)me.State.X, (float)me.State.Z) : (Vector2?)null;
            hud.StaminaLeft = () => me != null && move.StaminaSec > 0 ? me.State.Stamina / move.StaminaSec : 1;
            hud.Facing = () => me != null ? me.Yaw : 0;
            if (menus != null) menus.SetFloorPlan(world, map.Walls);
            if (menus != null)
            {
                menus.ForgetRoom();
                menus.ShowNight(true);
                menus.EndRematch = () => { if (room != null) room.Send("rematch"); };
                menus.EndLeave = LeaveRoom;
            }
            EnterRoomPage();
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
        bool micOptional, micChecked;

        void ShowVoice(Menus.MicState state, string error = null)
        {
            Debug.Log("Voice: " + state + (error != null ? " (" + error + ")" : ""));
            if (menus != null && roomPage) menus.SetVoice(state, error, micOptional);
        }

        void StartVoice()
        {
            voice = new Voice(this) { TestToneHz = voiceToneHz };
            bool answered = false;
            room.OnMessage<Dictionary<string, object>>("voice", msg =>
            {
                if (answered) return;
                answered = true;
                object url, token, optional;
                if (msg != null && msg.TryGetValue("url", out url) && msg.TryGetValue("token", out token))
                {
                    micOptional = msg.TryGetValue("micOptional", out optional) && optional is bool && (bool)optional;
                    voice.Connect((string)url, (string)token);
                }
                else
                {
                    Debug.Log("Voice is off on this server");
                    ShowVoice(Menus.MicState.Off);
                }
            });
            // Step E4 (game.ts attach, main.ts setVoice): the mic check before Ready.
            micChecked = false;
            voice.StatusChanged += state =>
            {
                switch (state)
                {
                    case Voice.State.Connecting: ShowVoice(Menus.MicState.Connecting); break;
                    case Voice.State.NoMic: ShowVoice(Menus.MicState.NoMic); break;
                    case Voice.State.Failed: ShowVoice(Menus.MicState.Failed); break;
                    case Voice.State.On: ShowVoice(micChecked ? Menus.MicState.Ready : Menus.MicState.NeedsCheck); break;
                }
            };
            room.OnMessage<Dictionary<string, object>>("micCheck", msg =>
            {
                object ok, reason;
                if (msg != null && msg.TryGetValue("ok", out ok) && ok is bool && (bool)ok)
                {
                    micChecked = true;
                    ShowVoice(Menus.MicState.Ready);
                }
                else ShowVoice(Menus.MicState.NeedsCheck, msg != null && msg.TryGetValue("reason", out reason) ? reason as string : null);
                Debug.Log("Mic check: " + (micChecked ? "done" : "not heard"));
            });
            if (menus != null)
            {
                menus.StartMicCheck = () => { room.Send("micCheck"); ShowVoice(Menus.MicState.Checking); };
                menus.MicLevel = () => voice != null ? voice.MicLevel() : 0;
            }
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
                    if (p.health == "downed" && healthWas == "alive") me.Shake(DownedShakeSec, DownedShakeRad);
                    healthWas = p.health;
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
            if (menus != null) menus.Tick();
            CountFrames(Time.unscaledDeltaTime);
            stations.Update(Time.timeAsDouble);
            UpdateBlackout(Time.deltaTime);
            doors.Update(Time.deltaTime);
            if (leftWith.HasValue)
            {
                // main.ts onLeave: removed by the host, or the connection lost: back to Start, saying why.
                int code = leftWith.Value;
                leftWith = null;
                string reason = night != null && night.KickedReason != null ? night.KickedReason
                    : code != 4000 ? "Lost the connection to the room. If the server restarted, that night is lost." : null;
                LeaveRoomPage(reason);
            }
            if (room != null && me != null)
            {
                if (roomPage) UpdateRoomPage();
                HandleKeys();
                MeasureForAuto(Time.unscaledDeltaTime);
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
            bool menu = room.State == null || night.End != null || !string.IsNullOrEmpty(room.State.meeting)
                || (roomPage ? pageUp : room.State.stage == "waiting");
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
            // The player's keys (Options.Keys, keys.ts); the mouse button and Esc stay fixed.
            hud.ShowTasks = KeyInput.Held("status") || tabTest;
            // The power wheel (GDD 14.2, input.ts): its key opens it, letting go uses the power the mouse points at.
            if (KeyInput.Pressed("powers") && Cursor.lockState == CursorLockMode.Locked && !hands.Active) OpenWheel();
            if (KeyInput.Released("powers") && wheelOpen && wheelTestKind == null) CloseWheel(true);
            var mine = night.Me;
            if (Cursor.lockState != CursorLockMode.Locked) return;
            // The flashlight's key (or a click), the camera's raises the Spirit Camera (then a click
            // takes the photo), salt pours a line, drop lets go of the relic.
            bool click = mouse != null && mouse.leftButton.wasPressedThisFrame && !lockedThisFrame;
            if (hands.Active)
            {
                // Working (client/src/input.ts): the button grabs, use or a step stops, the flashlight still works.
                if (click) { hands.Press(true); me.HandDown = true; }
                if (mouse != null && mouse.leftButton.wasReleasedThisFrame && me.HandDown) { hands.Press(false); me.HandDown = false; }
                if (KeyInput.Pressed("flashlight")) room.Send("flashlight");
                bool stop = KeyInput.Pressed("use") || KeyInput.Pressed("forward") || KeyInput.Pressed("back") || KeyInput.Pressed("left") || KeyInput.Pressed("right");
                if (stop && taskState == "open") LeaveTask();
                if (KeyInput.Released("use")) room.Send("use", new Dictionary<string, object> { { "down", false } });
                return;
            }
            // game.ts onFloorKey: a Wisp floats to the floor above or below (GDD 17).
            bool wisp = mine != null && mine.health == "dead" && string.IsNullOrEmpty(room.State.meeting);
            if (wisp && KeyInput.Pressed("floatUp")) room.Send("wispFloor", new Dictionary<string, object> { { "dir", 1 } });
            if (wisp && KeyInput.Pressed("crouch")) room.Send("wispFloor", new Dictionary<string, object> { { "dir", -1 } });
            if (KeyInput.Pressed("camera")) hud.CameraRaised = !hud.CameraRaised && mine != null && mine.cameraShots > 0;
            if (click && hud.CameraRaised)
            {
                if (mine != null && mine.cameraShots > 0) room.Send("photo");
                hud.CameraRaised = false;
            }
            else if (click || KeyInput.Pressed("flashlight")) room.Send("flashlight");
            if (KeyInput.Pressed("salt")) room.Send("pourSalt");
            if (KeyInput.Pressed("drop") && mine != null && !string.IsNullOrEmpty(mine.relic)) room.Send("dropRelic");
            if (KeyInput.Pressed("use")) room.Send("use", new Dictionary<string, object> { { "down", true } });
            if (KeyInput.Released("use")) room.Send("use", new Dictionary<string, object> { { "down", false } });
        }

        bool lockedThisFrame;

        // Screen shake (game.ts, GDD 23): a short jolt when a hunt starts, a harder one when you are knocked down.
        const float HuntShakeSec = 0.6f, HuntShakeRad = 0.012f, DownedShakeSec = 0.8f, DownedShakeRad = 0.03f;
        /// <summary>Your health at the last update, to shake the view when you are knocked down.</summary>
        string healthWas = "";
        /// <summary>A test chose the quality ("-quality"): Options and Auto leave it alone.</summary>
        bool qualityForced;

        // game.ts: Auto lets the hotel settle, then counts frames; at this rate or better it keeps High.
        const double AutoSettleSec = 2, AutoMeasureSec = 5, AutoHighFps = 55;
        // game.ts FPS_COUNTER_SEC: the counter's average is over this long.
        const double FpsCounterSec = 0.5;
        double autoSec, fpsSec;
        int autoFrames, fpsFrames;
        bool fpsShown;
        /// <summary>Test aid "-showFps": the counter for this run, without changing the player's choice.</summary>
        static readonly bool fpsTest = Array.IndexOf(Environment.GetCommandLineArgs(), "-showFps") >= 0;
        Unity.Profiling.ProfilerRecorder drawCalls, triangles;

        /// <summary>
        /// Auto quality (game.ts measureFrame): the first time you are in the hotel, a few seconds'
        /// frame rate chooses High or Low for this computer, remembered from then on.
        /// </summary>
        void MeasureForAuto(double dt)
        {
            if (qualityForced || Options.Quality != "auto" || Options.AutoQuality != null || !me.Ready) return;
            autoSec += dt;
            if (autoSec > AutoSettleSec) autoFrames++;
            if (autoSec < AutoSettleSec + AutoMeasureSec) return;
            double rate = autoFrames / AutoMeasureSec;
            Options.AutoQuality = rate >= AutoHighFps ? "high" : "low";
            Debug.Log("Auto quality: " + rate.ToString("0.#", CultureInfo.InvariantCulture) + " frames a second, so " + Options.AutoQuality);
            autoSec = 0;
            autoFrames = 0;
            HauntedQuality.Apply(Options.QualityLevel);
        }

        /// <summary>The FPS counter (Options): frames a second, draw calls and triangles, twice a second.</summary>
        void CountFrames(double dt)
        {
            if (menus == null)
            {
                // A test that went straight into a room has no menus: the counter needs their panel.
                if (!(Options.ShowFps || fpsTest)) return;
                menus = new Menus(config) { Visible = false };
            }
            if ((Options.ShowFps || fpsTest) != fpsShown)
            {
                fpsShown = Options.ShowFps || fpsTest;
                fpsSec = 0;
                fpsFrames = 0;
                if (fpsShown && !drawCalls.Valid)
                {
                    drawCalls = Unity.Profiling.ProfilerRecorder.StartNew(Unity.Profiling.ProfilerCategory.Render, "Draw Calls Count");
                    triangles = Unity.Profiling.ProfilerRecorder.StartNew(Unity.Profiling.ProfilerCategory.Render, "Triangles Count");
                }
                menus.Fps = fpsShown ? "" : null;
            }
            if (!fpsShown) return;
            fpsSec += dt;
            fpsFrames++;
            if (fpsSec < FpsCounterSec) return;
            string text = Math.Round(fpsFrames / fpsSec) + " FPS";
            if (drawCalls.Valid) text += " · " + drawCalls.LastValue + " draws";
            if (triangles.Valid) text += " · " + Math.Round(triangles.LastValue / 1000.0) + "k triangles";
            menus.Fps = text;
            fpsSec = 0;
            fpsFrames = 0;
        }

        /// <summary>The Options screen changed something (or you just arrived): the night takes it up.</summary>
        void ApplyOptions()
        {
            if (!qualityForced && HauntedQuality.Current != Options.QualityLevel) HauntedQuality.Apply(Options.QualityLevel);
            // Choosing Auto again starts its count afresh (game.ts setQuality).
            if (Options.Quality != "auto") { autoSec = 0; autoFrames = 0; }
            if (me == null) return;
            me.Sensitivity = Options.Sensitivity;
            me.HorizontalFovDeg = Options.Fov;
        }

        /// <summary>The ghost, hunts, sounds from the house and the powers' effects (step C4).</summary>
        void ListenForGhost()
        {
            me.WheelMove = (dx, dy) => wheelMouse += new Vector2((float)dx, (float)dy);
            night.GhostMoved += m => haunting.Push(m, Time.realtimeSinceStartupAsDouble);
            night.Hunted += phase =>
            {
                haunting.Hunt(phase, Time.realtimeSinceStartupAsDouble);
                if (phase == "start") me.Shake(HuntShakeSec, HuntShakeRad);
            };
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
            hud.ScreenFlashAt = items.ScreenFlashAt;
            hud.ScreenFlashGentle = items.ScreenFlashGentle;
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
                    else if (nightSends[i].Value[0] == "_face")
                    {
                        // Look a given way (radians), to take a shot from where a player stood.
                        me.Yaw = Json.Num(body, "yaw");
                        if (body.ContainsKey("pitch")) me.Pitch = Json.Num(body, "pitch");
                    }
                    else if (nightSends[i].Value[0] == "_tab") tabTest = true;
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

        /// <summary>
        /// In the room (main.ts enterLobby): the room page is home, over the hotel. Its buttons send to
        /// the room; Walk holds the mouse, Leave goes back to Start.
        /// </summary>
        void EnterRoomPage()
        {
            roomPage = menus != null && menus.Create != null;
            if (!roomPage) return;
            menus.SetBusy(false);
            menus.InRoom = true;
            menus.RoomCode = room.RoomId;
            menus.MicInRoom(true);
            menus.Send = (type, body) => { if (room == null) return; if (body == null) room.Send(type); else room.Send(type, body); };
            menus.Walk = () =>
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
                lockedThisFrame = true;
            };
            menus.Leave = LeaveRoom;
            menus.IsMuted = id => voice != null && voice.IsMuted(id);
            menus.ToggleMute = id => voice != null && voice.ToggleMute(id);
            hud.RoomPage = true;
            pageUp = true;
            menus.Visible = true;
        }

        /// <summary>
        /// Each frame: the page is open unless you are looking around (the mouse held), at a meeting,
        /// on the end screen or at the role reveal (style.css body.looking, .meeting, .ended,
        /// .revealing); it follows the room state either way.
        /// </summary>
        void UpdateRoomPage()
        {
            var s = room.State;
            bool up = Cursor.lockState != CursorLockMode.Locked && night.End == null
                && (s == null || (string.IsNullOrEmpty(s.meeting) && s.stage != "intro"));
            if (up != pageUp || menus.Visible != up)
            {
                pageUp = up;
                menus.Visible = up;
            }
            hud.PageUp = up;
            menus.UpdateRoom(s, room.SessionId, night);
        }

        /// <summary>Leave room (a second click confirmed it): gone at once, the slot freed (no 60 s hold).</summary>
        async void LeaveRoom()
        {
            var r = room;
            LeaveRoomPage(null);
            try { if (r != null) await r.Leave(true); } catch (Exception) { }
        }

        /// <summary>
        /// Out of the room, back to Start (main.ts reloads its page): everything the room made goes,
        /// the hotel waits behind black again, and the reason shows if there is one.
        /// </summary>
        void LeaveRoomPage(string reason)
        {
            if (menus != null) { menus.MicInRoom(false); menus.ShowNight(false); menus.ForgetRoom(); }
            room = null;
            client = null;
            if (voice != null) { voice.Disconnect(); voice = null; }
            if (wheelOpen) { wheelOpen = false; wheelTestKind = null; }
            if (hands.Active) StopHands();
            taskState = "none";
            openStation = null;
            wasMeeting = false;
            flashlightWas = false;
            nightSince = endSince = -1;
            haunting.Reset();
            others.Keep(new HashSet<string>());
            if (me != null) { Destroy(me.Camera.gameObject); me = null; }
            held = null;
            night = null;
            hud = null;
            meetingScreen = null;
            Cursor.lockState = CursorLockMode.None;
            Cursor.visible = true;
            MakeMenuCamera();
            roomPage = pageUp = false;
            menus.InRoom = false;
            menus.Visible = true;
            menus.SetBusy(false);
            if (reason != null) menus.ShowError(reason);
            Debug.Log("Back at the start" + (reason != null ? ": " + reason : ""));
        }

        void OnGUI()
        {
            if (tour != null) return;
            var style = new GUIStyle(GUI.skin.label) { fontSize = 18 };
            if (room == null && menus != null) return;
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

        /// <summary>How long a quit waits for the server to let us go (WantsToQuit).</summary>
        const int LeaveTimeoutMs = 2000;

        /// <summary>
        /// Any quit (the window closed too): leave the room first and wait for it, so the server sees
        /// us go rather than lose us (OnApplicationQuit may end the process at once).
        /// </summary>
        bool WantsToQuit()
        {
            if (room == null || left) return true;
            LeaveThenQuit();
            return false;
        }

        async void LeaveThenQuit()
        {
            left = true;
            try { await Task.WhenAny(room.Leave(), Task.Delay(LeaveTimeoutMs)); } catch (Exception) { }
            Application.Quit();
        }

        void OnApplicationQuit()
        {
            if (voice != null) voice.Disconnect();
            if (room != null && !left) { left = true; room.Leave(); }
            if (soundTest != null) soundTest.SaveRecording();
            // Unity's D3D12 teardown saves its pipeline library (dx12_pso_cache_lib.bin) and crashed
            // doing so (D3D12Core CLibrary::Serialize under ~GfxDeviceD3D12), about one quit in two
            // after a night with others in it. With the game's own work done, the process ends here
            // instead; the cost is that new pipelines are not saved for the next launch.
            // -unityShutdown leaves the teardown to Unity (to show the crash).
            if (!Application.isEditor && SystemInfo.graphicsDeviceType == UnityEngine.Rendering.GraphicsDeviceType.Direct3D12
                && Array.IndexOf(Environment.GetCommandLineArgs(), "-unityShutdown") < 0)
            {
                Debug.Log("Quitting: ending the process before Unity's D3D12 teardown");
                TerminateProcess(GetCurrentProcess(), 0);
            }
        }

        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        static extern IntPtr GetCurrentProcess();
        [System.Runtime.InteropServices.DllImport("kernel32.dll")]
        static extern bool TerminateProcess(IntPtr process, uint exitCode);
    }
}
