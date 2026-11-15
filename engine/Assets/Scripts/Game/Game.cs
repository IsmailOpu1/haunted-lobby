using System;
using System.Collections.Generic;
using System.Globalization;
using System.IO;
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
        LocalPlayer me;
        RemotePlayers others;
        Voice voice;
        MapInfo map;
        Night night;
        Hud hud;
        Items items;
        float voiceToneHz;
        double nextVoiceLog;
        Client client;
        Room<GameState> room;
        Material baseMaterial;

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
        bool shotTaken, autoReady;
        int startWith;
        double nightSince = -1, endSince = -1;
        readonly List<KeyValuePair<double, string[]>> nightSends = new List<KeyValuePair<double, string[]>>();
        readonly List<KeyValuePair<double, string>> nightShots = new List<KeyValuePair<double, string>>();

        void Awake()
        {
            Application.targetFrameRate = -1;
            QualitySettings.vSyncCount = 1;
            config = Json.Parse(Resources.Load<TextAsset>("Data/config").text);
            world = GameData.LoadWorld(Resources.Load<TextAsset>("Data/map").text, Resources.Load<TextAsset>("Data/world").text);
            baseMaterial = Resources.Load<Material>("Materials/GreyBox");
            if (baseMaterial == null) baseMaterial = new Material(Shader.Find("Universal Render Pipeline/Lit"));

            SetUpLight();
            hotel = new Hotel(world, Json.Num(Json.Obj(config, "body"), "radiusM"), baseMaterial);
            map = new MapInfo(Resources.Load<TextAsset>("Data/map").text);
            items = new Items(world, map, config, baseMaterial);
            others = new RemotePlayers(world, config, baseMaterial);
            ReadCommandLine();
        }

        void SetUpLight()
        {
            // Close to the browser's grey box: a black fog from 1 to 18 m, a dim fill, and the torch.
            RenderSettings.fog = true;
            RenderSettings.fogMode = FogMode.Linear;
            RenderSettings.fogColor = Color.black;
            RenderSettings.fogStartDistance = 1;
            RenderSettings.fogEndDistance = 18;
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
            for (int i = 0; i + 2 < args.Length; i++)
            {
                if (args[i] != "-debugAtNight" && args[i] != "-shotAtNight" && args[i] != "-sendAtNight") continue;
                double at = double.Parse(args[i + 1], CultureInfo.InvariantCulture);
                if (args[i] == "-debugAtNight") nightSends.Add(new KeyValuePair<double, string[]>(at, new[] { "debug", args[i + 2] }));
                if (args[i] == "-shotAtNight") nightShots.Add(new KeyValuePair<double, string>(at, args[i + 2]));
                if (args[i] == "-sendAtNight" && i + 3 < args.Length) nightSends.Add(new KeyValuePair<double, string[]>(at, new[] { args[i + 2], args[i + 3] }));
            }
            if (arg("-voiceTone") != null) voiceToneHz = float.Parse(arg("-voiceTone"), CultureInfo.InvariantCulture);
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
            if (script == "walk") me.Script = WalkScript;
            room.OnStateChange += (state, first) => OnState(state);
            room.OnLeave += code => { status = "Left the room (" + code + ")"; Debug.Log(status); };
            room.OnError += (code, message) => Debug.LogError("Room error " + code + ": " + message);
            night = new Night(room, map, config);
            night.Flashed += (by, x, z) => items.Flash(by == room.SessionId, x, z);
            hud = new Hud(night, () => room.State, () => room.SessionId, (type, msg) => { if (msg == null) room.Send(type); else room.Send(type, msg); }, config);
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
            foreach (var kv in state.doors) hotel.SetDoorOpen(kv.Key, kv.Value.open);
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
                    me.FlashlightOn = p.flashlightOn;
                    continue;
                }
                ids.Add(kv.Key);
                bool visible = p.connected && string.IsNullOrEmpty(p.hidingSpot) && p.health != "dead";
                others.Push(kv.Key, p.name, now, p.x, p.z, p.yaw, p.pitch, p.crouching, p.flashlightOn, visible);
            }
            others.Keep(ids);
            night.OnState();
            items.OnState(state);
            if (state.stage == "night" && nightSince < 0) nightSince = now;
            if (state.stage == "waiting") { nightSince = -1; endSince = -1; }
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
            if (room != null && me != null)
            {
                HandleKeys();
                me.Update(Time.deltaTime, now, input => room.Send("input", new Dictionary<string, object>
                {
                    { "seq", input.Seq }, { "forward", input.Forward }, { "right", input.Right },
                    { "run", input.Run }, { "crouch", input.Crouch }, { "yaw", input.Yaw }, { "pitch", input.Pitch },
                }));
                others.Update(now, me.Camera);
                hud.Prompt = night.PromptAt(me.State.X, me.State.Z);
                UpdateItems(now);
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

        void HandleKeys()
        {
            var k = Keyboard.current;
            var mouse = Mouse.current;
            lockedThisFrame = false;
            // The lobby and the end screen keep the mouse for their buttons.
            bool menu = room.State == null || room.State.stage == "waiting" || night.End != null;
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
            }
            hud.ShowTasks = k.tabKey.isPressed;
            var mine = night.Me;
            if (Cursor.lockState != CursorLockMode.Locked) return;
            // The browser's default keys (client/src/keys.ts): 1 flashlight (or a click), 2 raises the
            // Spirit Camera (then a click takes the photo), 3 pours salt, G drops the relic.
            bool click = mouse != null && mouse.leftButton.wasPressedThisFrame && !lockedThisFrame;
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
            hud.SoundCue = !whisper.HasValue ? null
                : best <= Json.Num(search, "veryCloseM") ? "A music box plays, very close"
                : best <= Json.Num(search, "closeM") ? "A music box plays close by"
                : "A faint music box";
            hud.ScreenFlashUntil = items.ScreenFlashUntil;
            var mine = night.Me;
            if (mine == null || mine.cameraShots <= 0 || mine.health != "alive") hud.CameraRaised = false;
        }

        void RunTestSchedule(double now)
        {
            double t = now - inRoomSince;
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
                    if (body != null && body.Count > 0) room.Send(nightSends[i].Value[0], body);
                    else room.Send(nightSends[i].Value[0]);
                    Debug.Log("Sent " + nightSends[i].Value[0] + " " + nightSends[i].Value[1]);
                    nightSends.RemoveAt(i);
                }
                for (int i = nightShots.Count - 1; i >= 0; i--)
                {
                    if (now - nightSince < nightShots[i].Key) continue;
                    ScreenCapture.CaptureScreenshot(nightShots[i].Value);
                    Debug.Log("Screenshot " + nightShots[i].Value + " (prompt: " + hud.Prompt + ", cue: " + hud.SoundCue + ")");
                    nightShots.RemoveAt(i);
                }
            }
            if (night.End != null && endSince < 0) endSince = now;
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
            try { if (room != null) await room.Leave(); } catch (Exception) { }
            Application.Quit();
        }

        void OnGUI()
        {
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
            if (room != null) room.Leave();
        }
    }
}
