using System;

// Player movement (GDD Section 6): shared/src/sim/movement.ts, line for line. The server runs the
// TypeScript one (authoritative); this one predicts your own movement in the Unity client, so both
// must agree exactly. engine/Tools/MovementCheck.cs holds it to 780 steps of the TypeScript code.
// Written in plain C# 5 so Windows' built-in compiler can check it without Unity.
namespace Haunted.Sim
{
    /// <summary>One fixed simulation step of player input.</summary>
    public struct MoveInput
    {
        /// <summary>Increases by one every step, so the server can confirm which inputs it applied.</summary>
        public int Seq;
        /// <summary>-1 back, 0, 1 forward.</summary>
        public double Forward;
        /// <summary>-1 left, 0, 1 right.</summary>
        public double Right;
        public bool Run;
        public bool Crouch;
        /// <summary>Look direction in radians. Yaw 0 looks toward -z (north).</summary>
        public double Yaw;
        public double Pitch;
    }

    public struct MoveState
    {
        public double X;
        public double Z;
        /// <summary>Seconds of running left.</summary>
        public double Stamina;
        /// <summary>Seconds until stamina starts refilling.</summary>
        public double RegenWait;
        public bool Crouching;
    }

    /// <summary>
    /// Normal: walk, run and crouch. Carry: the same while carrying a relic, relicSlowPct slower.
    /// Crawl: downed, slow and no running. Frozen: hidden or in a meeting, no movement (stamina still
    /// recovers). Wisp: dead, floating at wisps.speed through walls.
    /// </summary>
    public enum MoveMode { Normal, Carry, Crawl, Frozen, Wisp }

    /// <summary>The numbers movement needs, from config.json (config.movement and config.wisps.speed).</summary>
    public class MovementConfig
    {
        public double Walk, Run, Crouch, Crawl, StaminaSec, StaminaRegenDelaySec, StaminaRefillSec, RelicSlowPct, WispSpeed;
    }

    /// <summary>Moves a body by a desired delta and returns where it really ends up (walls stop it).</summary>
    public delegate void CollideFn(double fromX, double fromZ, double dx, double dz, out double toX, out double toZ);

    public static class Movement
    {
        public static MoveState Initial(double x, double z, MovementConfig m)
        {
            return new MoveState { X = x, Z = z, Stamina = m.StaminaSec, RegenWait = 0, Crouching = false };
        }

        public static MoveState Step(MoveState state, MoveInput input, double dt, CollideFn collide, MovementConfig m, MoveMode mode)
        {
            bool moving = mode != MoveMode.Frozen && (input.Forward != 0 || input.Right != 0);
            bool upright = mode == MoveMode.Normal || mode == MoveMode.Carry;
            bool crouching = upright && input.Crouch;
            bool running = upright && moving && input.Run && !crouching && state.Stamina > 0;

            double baseSpeed = mode == MoveMode.Wisp ? m.WispSpeed : mode == MoveMode.Crawl ? m.Crawl : crouching ? m.Crouch : running ? m.Run : m.Walk;
            double speed = mode == MoveMode.Carry ? baseSpeed * (1 - m.RelicSlowPct / 100) : baseSpeed;

            // Forward is where the camera looks (yaw 0 = -z). Right is 90 degrees clockwise from it.
            double sin = Math.Sin(input.Yaw);
            double cos = Math.Cos(input.Yaw);
            double dx = input.Forward * -sin + input.Right * cos;
            double dz = input.Forward * -cos + input.Right * -sin;
            double len = moving ? Hypot(dx, dz) : 0;
            if (len > 0)
            {
                dx = (dx / len) * speed * dt;
                dz = (dz / len) * speed * dt;
            }

            double stamina = state.Stamina;
            double regenWait = state.RegenWait;
            if (running)
            {
                stamina -= dt;
                // Floating-point leftovers (like 1e-15 s) must not allow an extra running step.
                if (stamina < 1e-9) stamina = 0;
                regenWait = m.StaminaRegenDelaySec;
            }
            else if (regenWait > 0)
            {
                regenWait -= dt;
                // Same floating-point guard as stamina: the wait must end on the exact step.
                if (regenWait < 1e-9) regenWait = 0;
            }
            else
            {
                stamina = Math.Min(m.StaminaSec, stamina + (m.StaminaSec / m.StaminaRefillSec) * dt);
            }

            double x = state.X, z = state.Z;
            if (len > 0) collide(state.X, state.Z, dx, dz, out x, out z);
            return new MoveState { X = x, Z = z, Stamina = stamina, RegenWait = regenWait, Crouching = crouching };
        }

        /// <summary>Wraps an angle into the range -PI..PI.</summary>
        public static double NormalizeAngle(double a)
        {
            return Math.Atan2(Math.Sin(a), Math.Cos(a));
        }

        /// <summary>Math.hypot for two values (no overflow at game sizes).</summary>
        static double Hypot(double a, double b)
        {
            return Math.Sqrt(a * a + b * b);
        }
    }
}
