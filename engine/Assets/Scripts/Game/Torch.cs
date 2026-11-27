using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering.Universal;

namespace Haunted.Game
{
    /// <summary>
    /// A player's torch beam, as the browser's client/src/flashlight.ts draws it (step D2 of
    /// docs/plans/engine-port.md): a warm white spot reaching config.flashlight.coneM, its edge soft
    /// over the outer half of its angle, fading with distance as three's decay 1.2 (the patched URP's
    /// HauntedLightDecay), and no shadows (the browser's casts none).
    /// </summary>
    public static class Torch
    {
        // flashlight.ts: SpotLight(0xfff2d6, 30, coneM, half angle, penumbra 0.5, decay 1.2).
        static readonly Color32 Colour = new Color32(0xff, 0xf2, 0xd6, 0xff);
        const float ThreeIntensity = 30;
        const float Penumbra = 0.5f;
        public const float Decay = 1.2f;
        /// <summary>three's lights are π brighter than Unity's at the same number (three divides by π for diffuse).</summary>
        public const float Intensity = ThreeIntensity / Mathf.PI;

        /// <summary>
        /// A torch under parent at `at` (parent's space), aimed at `aim`; off until switched on.
        /// rangeM and halfAngleDeg are config.flashlight.coneM and coneHalfAngleDeg.
        /// </summary>
        public static Light Make(Transform parent, Vector3 at, Vector3 aim, double rangeM, double halfAngleDeg)
        {
            var go = new GameObject("Torch");
            go.transform.SetParent(parent, false);
            go.transform.localPosition = at;
            go.transform.localRotation = Quaternion.LookRotation(aim - at);
            var light = go.AddComponent<Light>();
            light.type = LightType.Spot;
            light.color = Colour;
            light.intensity = Intensity;
            light.range = (float)rangeM;
            // Unity's angles are the whole cone; three's penumbra softens the outer part of the half angle.
            light.spotAngle = (float)(2 * halfAngleDeg);
            light.innerSpotAngle = (float)(2 * halfAngleDeg * (1 - Penumbra));
            light.shadows = LightShadows.None;
            light.enabled = false;
            HauntedLightDecay.Set(light, Decay);
            return light;
        }
    }

    /// <summary>
    /// flashlight.ts BeamAdaptation: up close your own beam would blow out what it hits, so, like
    /// eyes adjusting, it dims when something is nearer than NearM down the middle of the beam, to
    /// what it would light at NearM. Checks what you look at every few frames: the dressed rooms'
    /// simple pieces exactly and their detailed ones by the box around them (as the browser), and
    /// everything else drawn (doors, players, grey boxes) exactly.
    /// </summary>
    public class BeamAdaptation
    {
        /// <summary>2.5 m: at 1.6 m a wall or the clock a step away still glared (owner, 2026-11-10).</summary>
        const float NearM = 2.5f;
        /// <summary>It never dims below this, so the beam still reads as on.</summary>
        const float Min = 0.2f;
        const float RatePerSec = 6;
        const int EveryFrames = 3;
        const int ExactMaxTriangles = 2000;
        /// <summary>How often the list of other things drawn is looked at again (players come and go).</summary>
        const float OthersEverySec = 1;

        readonly List<MeshFilter> exact = new List<MeshFilter>();
        readonly List<Bounds> boxed = new List<Bounds>();
        readonly Transform dressedRoot;
        readonly Dictionary<Mesh, (Vector3[] v, int[] t)> meshes = new Dictionary<Mesh, (Vector3[], int[])>();
        readonly List<MeshFilter> others = new List<MeshFilter>();
        float othersAge = float.MaxValue;
        int frame;
        float target = 1, level = 1;

        public BeamAdaptation(GameObject dressed)
        {
            dressedRoot = dressed != null ? dressed.transform : null;
            if (dressed == null) return;
            foreach (var f in dressed.GetComponentsInChildren<MeshFilter>(true))
            {
                var mesh = f.sharedMesh;
                var r = f.GetComponent<MeshRenderer>();
                if (mesh == null || r == null) continue;
                if (mesh.isReadable && Triangles(mesh) <= ExactMaxTriangles) exact.Add(f);
                else boxed.Add(r.bounds);
            }
        }

        static long Triangles(Mesh mesh)
        {
            long n = 0;
            for (int i = 0; i < mesh.subMeshCount; i++) n += (long)mesh.GetIndexCount(i) / 3;
            return n;
        }

        /// <summary>The beam's brightness now (Min to 1), from the camera that holds it.</summary>
        public float Update(float dt, Camera camera)
        {
            if (frame++ % EveryFrames == 0)
            {
                othersAge += dt * EveryFrames;
                if (othersAge >= OthersEverySec) FindOthers(camera);
                var ray = new Ray(camera.transform.position, camera.transform.forward);
                float nearest = float.PositiveInfinity;
                foreach (var f in exact) nearest = Mathf.Min(nearest, Hit(f, ray, nearest));
                foreach (var f in others) nearest = Mathf.Min(nearest, Hit(f, ray, nearest));
                foreach (var box in boxed)
                {
                    // A box you stand inside says nothing about what is in front of you.
                    if (box.Contains(ray.origin) || !box.IntersectRay(ray, out float d)) continue;
                    nearest = Mathf.Min(nearest, d);
                }
                // Lit in proportion to distance^-decay, so this keeps it at what NearM would give.
                target = nearest < NearM ? Mathf.Max(Min, Mathf.Pow(nearest / NearM, Torch.Decay)) : 1;
            }
            level += (target - level) * (1 - Mathf.Exp(-RatePerSec * dt));
            return level;
        }

        void FindOthers(Camera camera)
        {
            othersAge = 0;
            others.Clear();
            foreach (var f in Object.FindObjectsByType<MeshFilter>(FindObjectsSortMode.None))
            {
                var t = f.transform;
                if (f.sharedMesh == null || !f.sharedMesh.isReadable) continue;
                if (dressedRoot != null && t.IsChildOf(dressedRoot)) continue;
                if (t.IsChildOf(camera.transform)) continue; // your own hands and what they hold
                others.Add(f);
            }
        }

        /// <summary>The distance to f's mesh along the ray, if drawn and nearer than both NearM and `within`.</summary>
        float Hit(MeshFilter f, Ray ray, float within)
        {
            if (f == null) return float.PositiveInfinity;
            var r = f.GetComponent<MeshRenderer>();
            if (r == null || !r.enabled || !f.gameObject.activeInHierarchy) return float.PositiveInfinity;
            float limit = Mathf.Min(NearM, within);
            if (!r.bounds.IntersectRay(ray, out float boxD) || boxD > limit) return float.PositiveInfinity;
            var mesh = f.sharedMesh;
            if (!meshes.TryGetValue(mesh, out var data)) meshes[mesh] = data = (mesh.vertices, mesh.triangles);
            var toLocal = f.transform.worldToLocalMatrix;
            var toWorld = f.transform.localToWorldMatrix;
            var o = toLocal.MultiplyPoint3x4(ray.origin);
            var d = toLocal.MultiplyVector(ray.direction);
            float best = float.PositiveInfinity;
            var v = data.v;
            var t = data.t;
            for (int i = 0; i + 2 < t.Length; i += 3)
            {
                if (!RayTriangle(o, d, v[t[i]], v[t[i + 1]], v[t[i + 2]], out float s)) continue;
                float world = Vector3.Distance(ray.origin, toWorld.MultiplyPoint3x4(o + d * s));
                if (world < best) best = world;
            }
            return best <= limit ? best : float.PositiveInfinity;
        }

        /// <summary>Möller–Trumbore, both faces (three's raycast of a double-sided material).</summary>
        static bool RayTriangle(Vector3 o, Vector3 d, Vector3 a, Vector3 b, Vector3 c, out float s)
        {
            s = 0;
            var e1 = b - a;
            var e2 = c - a;
            var p = Vector3.Cross(d, e2);
            float det = Vector3.Dot(e1, p);
            if (Mathf.Abs(det) < 1e-9f) return false;
            float inv = 1 / det;
            var q = o - a;
            float u = Vector3.Dot(q, p) * inv;
            if (u < 0 || u > 1) return false;
            var r = Vector3.Cross(q, e1);
            float w = Vector3.Dot(d, r) * inv;
            if (w < 0 || u + w > 1) return false;
            s = Vector3.Dot(e2, r) * inv;
            return s > 0;
        }
    }
}
