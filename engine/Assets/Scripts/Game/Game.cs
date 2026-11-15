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
    /// Step A of docs/plans/engine-port.md: join the same game server as the browser version, walk the
    /// grey-box hotel, and see everyone else walk. A plain menu for now (step E brings the real menus).
    ///
    /// Command line, for unattended tests:
    ///   -server ws://localhost:2567  -name Rafi  -create | -join KQXRT
    ///   -codeFile path     write the room code there once in the room
    ///   -script walk       walk a fixed loop instead of reading the keys
    ///   -shot path -shotAt 12   save a screenshot after 12 s in the room
    ///   -quitAt 20         quit after 20 s in the room
    ///   -teleportAt 40 -20 -17   at 40 s in the room, ask a debug server to move us to x -20, z -17
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
        double shotAt = -1, quitAt = -1, teleportAt = -1;
        float teleportX, teleportZ;
        bool shotTaken;

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
            StartVoice();
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
            if (mouse != null && mouse.leftButton.wasPressedThisFrame && Cursor.lockState != CursorLockMode.Locked)
            {
                Cursor.lockState = CursorLockMode.Locked;
                Cursor.visible = false;
            }
            if (k == null) return;
            if (k.escapeKey.wasPressedThisFrame)
            {
                Cursor.lockState = CursorLockMode.None;
                Cursor.visible = true;
            }
            if (k.fKey.wasPressedThisFrame) room.Send("flashlight");
            if (k.eKey.wasPressedThisFrame) room.Send("use", new Dictionary<string, object> { { "down", true } });
            if (k.eKey.wasReleasedThisFrame) room.Send("use", new Dictionary<string, object> { { "down", false } });
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
            GUI.Label(new Rect(16, 12, 900, 30), "Room " + room.RoomId + "   players: " + (others.Count + 1) + (Cursor.lockState == CursorLockMode.Locked ? "" : "   (click to look around, Esc to free the mouse)"), style);
            if (status != "") GUI.Label(new Rect(16, 40, 900, 30), status, style);
        }

        void OnApplicationQuit()
        {
            if (voice != null) voice.Disconnect();
            if (room != null) room.Leave();
        }
    }
}
