using System.Collections.Generic;
using Haunted.Sim;
using UnityEngine;
using UnityEngine.InputSystem;

namespace Haunted.Game
{
    /// <summary>
    /// Your own body and view, as the browser's game.ts does it: every fixed step reads the keys,
    /// moves you at once with the C# movement (client-side prediction), and sends the same input to
    /// the server. When the server's state arrives, start from where it says you are and replay the
    /// inputs it has not applied yet; small differences glide away instead of jumping.
    /// </summary>
    public class LocalPlayer
    {
        // The browser version's view (client/src/input.ts and game.ts).
        const double DegPerCountPerSensitivity = 0.022;
        public double Sensitivity = 2.5;
        const double MaxPitch = Mathf.PI / 2 - 0.05;
        const float HorizontalFovDeg = 90;
        const float MaxVerticalFovDeg = 75;
        const float CorrectionFadePerSec = 20;
        const float SnapDistanceM = 2;

        readonly Hotel hotel;
        readonly MovementConfig move;
        readonly double simDt;
        readonly float eyeHeight, crouchEyeHeight, downedEyeHeight;
        public readonly Camera Camera;
        readonly Light flashlight;

        int seq;
        double accumulator;
        public double Yaw, Pitch;
        MoveState predicted, previous;
        bool hasPrediction;
        readonly List<MoveInput> pending = new List<MoveInput>();
        Vector3 correction;
        float eyeNow;

        /// <summary>Set by Game from the server state: how you may move now.</summary>
        public MoveMode Mode = MoveMode.Normal;
        /// <summary>Scripted input for unattended tests (-script); null when a person plays.</summary>
        public System.Func<double, MoveInput> Script;
        /// <summary>Working with your hands (GDD 26.5): you stand still and the view narrows toward the work.</summary>
        public bool Working;
        /// <summary>While working with the button held, the mouse moves your hands (pixels, right and down positive) instead of the view.</summary>
        public bool HandDown;
        public System.Action<double, double> HandMove;
        // game.ts: how much the view narrows while you work, and how fast it gets there.
        const float WorkZoom = 0.77f;
        const float FovLerpPerSec = 6;
        bool fovSet;

        public LocalPlayer(Hotel hotel, MovementConfig move, object config)
        {
            this.hotel = hotel;
            this.move = move;
            simDt = 1.0 / Json.Num(Json.Obj(config, "net"), "tickRate");
            var m = Json.Obj(config, "movement");
            eyeHeight = (float)Json.Num(m, "eyeHeightM");
            crouchEyeHeight = (float)Json.Num(m, "crouchEyeHeightM");
            downedEyeHeight = (float)Json.Num(m, "downedEyeHeightM");
            eyeNow = eyeHeight;

            var cam = new GameObject("Player view");
            Camera = cam.AddComponent<Camera>();
            Camera.nearClipPlane = 0.05f;
            Camera.farClipPlane = 60;
            // Night: black past the fog, as the browser (game.ts scene.background); no daytime sky over open rooms.
            Camera.clearFlags = CameraClearFlags.SolidColor;
            Camera.backgroundColor = Color.black;
            // Not the held torch's studio; the torch itself is drawn by HauntedHeld.
            Camera.cullingMask = HauntedHeld.WorldMask | HauntedHeld.HeldMask;
            cam.AddComponent<AudioListener>();
            // The held torch, as the browser's: from the lens, low and to the right in front of the
            // eyes, aimed at where you look BeamAimM ahead.
            var f = Json.Obj(config, "flashlight");
            flashlight = Torch.Make(cam.transform, TorchAt, Vector3.forward * BeamAimM, Json.Num(f, "coneM"), Json.Num(f, "coneHalfAngleDeg"));
        }

        public bool FlashlightOn { set { flashlight.enabled = value; } }

        /// <summary>Where the beam starts now, in the camera's space (the held torch's lens, HeldTorch), still aimed BeamAimM ahead.</summary>
        public Vector3 BeamFrom
        {
            set
            {
                flashlight.transform.localPosition = value;
                flashlight.transform.localRotation = Quaternion.LookRotation(Vector3.forward * BeamAimM - value);
            }
        }

        /// <summary>The flashlight's brightness, 0 to 1: it flickers and dies near the ghost (GDD 8.1).</summary>
        public float Brightness { set { flashlight.intensity = Torch.Intensity * value; } }

        /// <summary>
        /// Where the beam starts: the held torch's lens at rest, in camera space (Unity's z forward), as
        /// the browser measures it (heldFlashlight.ts: HOLD plus the model's lens, read off the live
        /// light: 0.18, -0.225, -0.539 in three's space). It aims BeamAimM ahead of the eyes (game.ts).
        /// </summary>
        public static readonly Vector3 TorchAt = new Vector3(0.18f, -0.225f, 0.539f);
        public const float BeamAimM = 8;

        /// <summary>The possessed's power wheel is open: the mouse picks a power instead of turning your head.</summary>
        public bool WheelOpen;
        /// <summary>The mouse while the wheel is open, in pixels, screen y growing downward.</summary>
        public System.Action<double, double> WheelMove;

        /// <summary>The server's word on where you are, after your last input it applied.</summary>
        public void Reconcile(double x, double z, double stamina, double regenWait, bool crouching, uint lastSeq)
        {
            pending.RemoveAll(i => i.Seq <= lastSeq);
            var s = new MoveState { X = x, Z = z, Stamina = stamina, RegenWait = regenWait, Crouching = crouching };
            foreach (var input in pending) s = Movement.Step(s, input, simDt, hotel.Collision.Collide, move, Mode);
            if (!hasPrediction)
            {
                previous = s;
                hasPrediction = true;
            }
            else
            {
                // Keep the view where it was and glide away the difference.
                Vector3 was = Coords.Place(hotel.World, predicted.X, predicted.Z);
                Vector3 now = Coords.Place(hotel.World, s.X, s.Z);
                Vector3 err = was - now;
                if (err.magnitude > SnapDistanceM) correction = Vector3.zero;
                else correction += err;
            }
            predicted = s;
        }

        public bool Ready { get { return hasPrediction; } }
        public MoveState State { get { return predicted; } }

        void Look()
        {
            var mouse = Mouse.current;
            if (mouse == null || Cursor.lockState != CursorLockMode.Locked) return;
            Vector2 d = mouse.delta.ReadValue();
            if (WheelOpen)
            {
                if (WheelMove != null) WheelMove(d.x, -d.y);
                return;
            }
            if (Working && HandDown)
            {
                if (HandMove != null) HandMove(d.x, -d.y);
                return;
            }
            double turn = Sensitivity * DegPerCountPerSensitivity * Mathf.Deg2Rad;
            Yaw -= d.x * turn;
            // Input System's y grows upward; the browser's movementY grows downward.
            Pitch += d.y * turn;
            Pitch = System.Math.Max(-MaxPitch, System.Math.Min(MaxPitch, Pitch));
        }

        MoveInput ReadKeys(double time)
        {
            if (Script != null) return Script(time);
            var k = Keyboard.current;
            var input = new MoveInput { Yaw = Yaw, Pitch = Pitch };
            if (k == null || Working) return input;
            input.Forward = (k.wKey.isPressed ? 1 : 0) - (k.sKey.isPressed ? 1 : 0);
            input.Right = (k.dKey.isPressed ? 1 : 0) - (k.aKey.isPressed ? 1 : 0);
            input.Run = k.leftShiftKey.isPressed;
            input.Crouch = k.leftCtrlKey.isPressed || k.cKey.isPressed;
            return input;
        }

        /// <summary>Called every frame: steps the simulation at the server's rate and moves the view.</summary>
        public void Update(float dt, double time, System.Action<MoveInput> send)
        {
            if (!hasPrediction) return;
            Look();
            accumulator += dt;
            while (accumulator >= simDt)
            {
                accumulator -= simDt;
                var input = ReadKeys(time);
                if (Script != null) { Yaw = input.Yaw; Pitch = input.Pitch; }
                input.Seq = ++seq;
                // The server keeps yaw in -PI..PI and pitch within straight up and down; predict with the same.
                input.Yaw = Movement.NormalizeAngle(input.Yaw);
                input.Forward = System.Math.Sign(input.Forward);
                input.Right = System.Math.Sign(input.Right);
                previous = predicted;
                predicted = Movement.Step(predicted, input, simDt, hotel.Collision.Collide, move, Mode);
                pending.Add(input);
                send(input);
            }
            UpdateCamera(dt);
        }

        void UpdateCamera(float dt)
        {
            float alpha = (float)(accumulator / simDt);
            correction *= Mathf.Exp(-CorrectionFadePerSec * dt);
            // Blend in real 3D: on the stairs' middle step the simulation jumps between floor areas.
            Vector3 a = Coords.Place(hotel.World, previous.X, previous.Z);
            Vector3 b = Coords.Place(hotel.World, predicted.X, predicted.Z);
            float wantEye = Mode == MoveMode.Crawl ? downedEyeHeight : predicted.Crouching ? crouchEyeHeight : eyeHeight;
            eyeNow = Mathf.MoveTowards(eyeNow, wantEye, 4 * dt);
            Camera.transform.position = Vector3.Lerp(a, b, alpha) + correction + Vector3.up * eyeNow;
            Camera.transform.rotation = Coords.Look(Yaw, Pitch);
            float aspect = Camera.aspect;
            float upDown = 2 * Mathf.Atan(Mathf.Tan(HorizontalFovDeg * Mathf.Deg2Rad / 2) / aspect) * Mathf.Rad2Deg;
            float fov = Mathf.Min(MaxVerticalFovDeg, upDown) * (Working ? WorkZoom : 1);
            if (!fovSet) { Camera.fieldOfView = fov; fovSet = true; }
            else if (Mathf.Abs(Camera.fieldOfView - fov) > 0.05f) Camera.fieldOfView += (fov - Camera.fieldOfView) * Mathf.Min(1, FovLerpPerSec * dt);
        }
    }
}
