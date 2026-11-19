using System;
using System.Collections.Generic;
using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// client/src/footsteps.ts: turns one body's movement into footsteps, one every stride of
    /// distance travelled (sound only; the movement rules are in the config). Used for your own
    /// steps and others' (HouseSounds) and the hunting ghost's (Haunting).
    /// </summary>
    public class StepTracker
    {
        /// <summary>Distance covered per footstep, in metres.</summary>
        static readonly Dictionary<string, double> StrideM = new Dictionary<string, double>
        {
            { "walk", 0.75 }, { "run", 1.0 }, { "crouch", 0.55 }, { "crawl", 0.45 }, { "ghost", 1.1 },
        };
        /// <summary>Jumps longer than this are teleports (hiding, reappearing), not walking.</summary>
        const double TeleportM = 2;

        double lastX, lastZ;
        bool hasLast;
        double travelled;
        /// <summary>Smoothed speed in m/s, used to tell walking from running.</summary>
        public double Speed;

        /// <summary>Which kind of step a player is making, from how fast they move and their state.</summary>
        public static string PlayerKind(double speed, bool crouching, bool downed, double walk, double run)
        {
            if (downed) return "crawl";
            if (crouching) return "crouch";
            return speed > (walk + run) / 2 ? "run" : "walk";
        }

        /// <summary>Returns true when this movement (on the ground: x and z) completes a step.</summary>
        public bool Update(double x, double z, double dt, string kind)
        {
            if (!hasLast)
            {
                lastX = x; lastZ = z; hasLast = true;
                return false;
            }
            double d = Math.Sqrt((x - lastX) * (x - lastX) + (z - lastZ) * (z - lastZ));
            lastX = x; lastZ = z;
            if (d > TeleportM)
            {
                travelled = 0;
                return false;
            }
            if (dt > 0) Speed += (d / dt - Speed) * Math.Min(1, dt * 8);
            travelled += d;
            double stride = StrideM[kind];
            if (travelled < stride) return false;
            travelled %= stride;
            return true;
        }

        public void Reset()
        {
            hasLast = false;
            travelled = 0;
            Speed = 0;
        }
    }
}
