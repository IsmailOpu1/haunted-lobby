using UnityEngine;

namespace Haunted.Game
{
    /// <summary>
    /// The ghost's body (GDD 26, its look after the art pass): a too-tall starved figure in a torn
    /// shroud, wet black hair over its face, one cold eye showing (tools/art/blender/build_ghost.py
    /// makes Resources/Ghost/ghost.glb and ghost-low.glb). It moves with the players' own clips on
    /// the same skeleton, but wrong: the clip steps on in jerks, like stop motion, with now and then a
    /// longer hold; it walks hunched; its head hangs to one side and snaps round to look at you. With
    /// Options.Photosensitive the steps and the turns are smooth.
    /// </summary>
    public class GhostBody
    {
        // Seconds between the clip's steps, and how often a step holds longer.
        const float StepMinSec = 0.05f, StepMaxSec = 0.12f, HoldChance = 0.08f, HoldSec = 0.3f;
        // RemotePlayers.ClipSpeedMps: the speed each clip was made at, and the clip rate's limits.
        const float WalkClipMps = 1.6f, RunClipMps = 4.2f, RateMin = 0.5f, RateMax = 1.9f, MovingMps = 0.2f;
        // The hunch (degrees forward at each bone) and the head's hang to one side.
        const float SpineHunchDeg = 9, ChestHunchDeg = 10, NeckHunchDeg = 6, HeadHangDeg = 22;
        // The head lifts to look at you, up to this far (degrees), so its eye finds yours.
        const float HeadLiftMaxDeg = 30;
        // The eyes' light (linear, above the bloom's threshold, so it glows).
        static readonly Color EyeLight = new Color(0.78f, 0.9f, 1f) * 7;
        static readonly int EmissiveFactor = Shader.PropertyToID("emissiveFactor");
        // The head turns to you as far as this, picks a new aim this often, and turns this fast (degrees a second).
        const float HeadTurnMaxDeg = 80, AimMinSec = 0.5f, AimMaxSec = 1.5f, SnapDegPerSec = 1100, SmoothDegPerSec = 120;
        // Now and then a twitch of the head (degrees, seconds); never with Photosensitive.
        const float TwitchChancePerSec = 0.35f, TwitchDeg = 14, TwitchSec = 0.09f;
        const float SpeedSmoothingPerSec = 6;

        public readonly bool Low;
        public Transform Root { get { return body.Root.transform; } }
        readonly CharacterBody body;
        readonly Transform spine, chest, neck, head;
        /// <summary>Which way the face looks, in the root's own space (level).</summary>
        readonly Vector3 front;
        string clip = "";
        float clipTime, nextStep, speed;
        Vector3 lastAt;
        bool placed;
        float headYaw, aimYaw, nextAim, twitchLeft, twitchRoll;

        GhostBody(CharacterBody body, bool low)
        {
            this.body = body;
            Low = low;
            foreach (var t in body.Root.GetComponentsInChildren<Transform>(true))
            {
                if (t.name == "mixamorig:Spine1") spine = t;
                else if (t.name == "mixamorig:Spine2") chest = t;
                else if (t.name == "mixamorig:Neck") neck = t;
                else if (t.name == "mixamorig:Head") head = t;
            }
            // The face looks from the head toward the eyes (the glowing points).
            front = Vector3.forward;
            foreach (var r in body.Root.GetComponentsInChildren<Renderer>(true))
                if (r.name.Contains("Eyes") && head != null)
                {
                    var d = body.Root.transform.InverseTransformPoint(r.bounds.center) - body.Root.transform.InverseTransformPoint(head.position);
                    d.y = 0;
                    if (d.sqrMagnitude > 1e-6f) front = d.normalized;
                    // glTF keeps a glow to 1; the eyes burn brighter than that.
                    foreach (var m in r.materials)
                        if (m.HasProperty(EmissiveFactor)) m.SetVector(EmissiveFactor, EyeLight);
                }
        }

        /// <summary>The ghost's body (its Low copy for Low), or null without its model or the players' clips.</summary>
        public static GhostBody Make(float heightM, bool low)
        {
            var model = (low ? Resources.Load<GameObject>("Ghost/ghost-low") : null) ?? Resources.Load<GameObject>("Ghost/ghost");
            var body = CharacterBody.FromModel(model, "Ghost" + (low ? " (Low)" : ""), heightM);
            return body == null ? null : new GhostBody(body, low);
        }

        /// <summary>Each frame, before the animation runs: which clip, and how far it has stepped on.</summary>
        public void Update(float dt, bool hunting, bool smooth)
        {
            var at = body.Root.transform.position;
            if (placed && dt > 0)
            {
                var d = at - lastAt;
                d.y = 0;
                speed += (d.magnitude / dt - speed) * Mathf.Min(1, SpeedSmoothingPerSec * dt);
            }
            lastAt = at;
            placed = true;
            string want = speed < MovingMps ? "idle" : hunting ? "run" : "walk";
            var animation = body.Animation;
            if (want != clip && animation.GetClip(want) != null)
            {
                clip = want;
                animation.Play(want);
                clipTime = 0;
                nextStep = 0;
            }
            var state = animation[clip];
            if (state == null) return;
            float made = clip == "run" ? RunClipMps : clip == "walk" ? WalkClipMps : 0;
            float rate = made > 0 ? Mathf.Clamp(speed / made, RateMin, RateMax) : 1;
            clipTime += dt * rate;
            state.speed = 0;
            nextStep -= dt;
            if (smooth || nextStep <= 0)
            {
                state.time = clipTime;
                nextStep = Random.value < HoldChance ? HoldSec : Random.Range(StepMinSec, StepMaxSec);
            }
        }

        /// <summary>After the animation has posed the bones: the hips to its legs, the hunch, the head.</summary>
        public void AfterAnimation(Vector3 lookAt, float dt, bool smooth)
        {
            body.AfterAnimation();
            if (head == null) return;
            var root = body.Root.transform;
            var face = root.TransformDirection(front);
            var right = Vector3.Cross(Vector3.up, face).normalized;
            Bend(spine, right, SpineHunchDeg);
            Bend(chest, right, ChestHunchDeg);
            Bend(neck, right, NeckHunchDeg);
            // Where you are, as a turn from where it faces.
            var to = lookAt - head.position;
            to.y = 0;
            float want = to.sqrMagnitude > 1e-4f ? Mathf.Clamp(Vector3.SignedAngle(face, to, Vector3.up), -HeadTurnMaxDeg, HeadTurnMaxDeg) : 0;
            nextAim -= dt;
            if (smooth || nextAim <= 0)
            {
                aimYaw = want;
                nextAim = Random.Range(AimMinSec, AimMaxSec);
            }
            headYaw = Mathf.MoveTowards(headYaw, aimYaw, (smooth ? SmoothDegPerSec : SnapDegPerSec) * dt);
            if (!smooth)
            {
                twitchLeft -= dt;
                if (twitchLeft <= 0 && Random.value < TwitchChancePerSec * dt)
                {
                    twitchLeft = TwitchSec;
                    twitchRoll = Random.Range(-TwitchDeg, TwitchDeg);
                }
            }
            float roll = HeadHangDeg + (twitchLeft > 0 && !smooth ? twitchRoll : 0);
            var turned = Quaternion.AngleAxis(headYaw, Vector3.up) * face;
            // Up toward your eyes: the hunched neck and head come back by as much as it takes.
            var up = lookAt - head.position;
            float lift = Mathf.Clamp(Mathf.Atan2(up.y, new Vector2(up.x, up.z).magnitude) * Mathf.Rad2Deg + SpineHunchDeg + ChestHunchDeg + NeckHunchDeg, -HeadLiftMaxDeg, HeadLiftMaxDeg);
            var side = Vector3.Cross(Vector3.up, turned).normalized;
            head.rotation = Quaternion.AngleAxis(roll, turned) * Quaternion.AngleAxis(-lift, side) * Quaternion.AngleAxis(headYaw, Vector3.up) * head.rotation;
        }

        static void Bend(Transform bone, Vector3 axis, float deg)
        {
            if (bone != null) bone.rotation = Quaternion.AngleAxis(deg, axis) * bone.rotation;
        }

        public void SetActive(bool on)
        {
            if (body.Root.activeSelf != on) body.Root.SetActive(on);
            if (!on) placed = false;
        }

        public void Destroy()
        {
            body.Destroy();
        }
    }
}
