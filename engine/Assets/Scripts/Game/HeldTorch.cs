using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;
using Object = UnityEngine.Object;

namespace Haunted.Game
{
    /// <summary>
    /// The torch in your hand (client/src/heldFlashlight.ts): an old nickel-plated torch held low and
    /// to the right in your hand and sleeve (the plain hand until you are dealt a character, then the
    /// character's own), swaying with your steps and lagging a little behind your view. HauntedHeld
    /// draws it over the world. As in the browser's own little scene it is lit only by the night fill,
    /// a light of the beam bouncing back, and a soft studio (three's scene.environment: it shines in
    /// the metal and lights the hand and sleeve too), fading with the lamps; the hotel's lights never
    /// reach it (its rendering layer is its own). The beam comes out
    /// of its lens. Looks only: none of this is a game number.
    /// </summary>
    public class HeldTorch
    {
        /// <summary>Where the torch sits in front of your eye (right, down, forward; Unity's z forward).</summary>
        static readonly Vector3 Hold = new Vector3(0.19f, -0.23f, 0.42f);
        /// <summary>Turned in a little toward the middle of the view, and the lens tipped up a touch (three's angles).</summary>
        const float HoldYawRad = 0.08f, HoldPitchRad = 0.04f;
        /// <summary>Walking: one sway cycle for every two steps of about this length.</summary>
        const float StepM = 0.75f, BobSideM = 0.012f, BobUpM = 0.009f, BobMaxScale = 1.7f, WalkSpeedMps = 2.2f;
        /// <summary>How far it lags behind turning your view, and how fast it catches up.</summary>
        const float LagRadPerRad = 0.25f, LagMaxRad = 0.06f, LagReturnPerSec = 10;
        /// <summary>Its glass glows while it is on (the bloom picks this up).</summary>
        const int LensGlow = 0xffe2b0;
        const float LensGlowIntensity = 3;
        /// <summary>The beam bouncing back off what it hits, from ahead and below (three's numbers; Unity's light is π less).</summary>
        const int BounceColour = 0xffe8c8;
        const float BounceIntensity = 0.35f, BounceRangeM = 2;
        static readonly Vector3 BounceAt = new Vector3(0.12f, -0.45f, 1.1f);
        /// <summary>
        /// The studio's strength, on every piece: heldFlashlight.ts asks the hand and sleeve for a
        /// quarter of it (SKIN_STUDIO_SCALE as envMapIntensity), but three puts scene.environmentIntensity
        /// in place of a material's own envMapIntensity whenever the scene's environment lights it
        /// (WebGLRenderer setProgram), so the browser's hand takes it all. The hand is toned and warmed.
        /// </summary>
        const float StudioIntensity = 0.25f;
        static readonly Color SkinTint = new Color(0.55f, 0.47f, 0.4f);

        /// <summary>The rendering layer the held torch's lights and pieces share, and no other.</summary>
        const uint HeldLight = 1u << HauntedHeld.HeldRenderingLayer;
        static readonly int BaseColorFactor = Shader.PropertyToID("baseColorFactor");
        static readonly int EmissiveFactor = Shader.PropertyToID("emissiveFactor");

        /// <summary>How far down the studio's picture is read for the hand's light (128 px faces: 16 px).</summary>
        const int StudioMip = 3;
        readonly Transform root, hold;
        readonly Light bounce;
        /// <summary>The probe that takes the studio, and the two that show it to the torch and to the hand.</summary>
        readonly ReflectionProbe studio, shown;
        GameObject model;
        readonly List<Material> lens = new List<Material>();
        readonly List<Material> made = new List<Material>();
        string wearing;
        Vector3 lensLocal = new Vector3(0, 0, 0.12f);
        float phase, lagYaw, lagPitch;
        double lastYaw, lastPitch;
        Vector3 lastPos;
        bool started, studioTaken, studioAsked;
        int studioRender;
        /// <summary>The studio's light on a surface facing each way (three's irradiance from scene.environment), and the night fill's.</summary>
        SphericalHarmonicsL2 studioLight, fill;
        bool studioRead;
        readonly List<Renderer> pieces = new List<Renderer>();
        readonly MaterialPropertyBlock block = new MaterialPropertyBlock();
        readonly List<SphericalHarmonicsL2> shOne = new List<SphericalHarmonicsL2> { new SphericalHarmonicsL2() };

        public HeldTorch(Transform camera)
        {
            root = new GameObject("Held torch").transform;
            root.SetParent(camera, false);
            hold = new GameObject("Hold").transform;
            hold.SetParent(root, false);
            var b = new GameObject("Bounce");
            b.transform.SetParent(root, false);
            b.transform.localPosition = BounceAt;
            bounce = b.AddComponent<Light>();
            bounce.type = LightType.Point;
            bounce.color = Shapes.Hex(BounceColour);
            bounce.range = BounceRangeM;
            bounce.shadows = LightShadows.None;
            bounce.intensity = 0;
            b.AddComponent<UniversalAdditionalLightData>().renderingLayers = HeldLight;
            HauntedLightDecay.Set(bounce, 2);
            studio = Studio.Make(new Vector3(0, -2000, 0));
            // Unity uses only the probes in view, so the studio is shown from a tiny probe just in
            // front of the eye (nothing else has its middle there).
            shown = Studio.Copy("Studio reflection (held)", root, new Vector3(0, 0, 0.3f));
            Wear("");
        }

        /// <summary>Puts the torch in the hand of the character you were dealt ("": the plain hand); without its art, the hand you had stays.</summary>
        public void Wear(string character)
        {
            character = character ?? "";
            if (character == wearing) return;
            var art = CharacterArt.Load();
            if (art == null) return;
            var c = character == "" ? null : art.Of(character);
            var source = c != null && c.held != null ? c.held : character == "" ? art.heldTorch : null;
            if (source == null) return;
            wearing = character;
            if (model != null) Object.Destroy(model);
            foreach (var m in made) Object.Destroy(m);
            made.Clear();
            lens.Clear();
            pieces.Clear();
            model = Object.Instantiate(source, hold, false);
            model.name = "Held " + (character == "" ? "torch" : character);
            hold.localRotation = Quaternion.identity;
            hold.localPosition = Vector3.zero;
            // glTFast turns the model's +z lens to Unity's +z already: no half turn as in three.
            // Measured from the meshes, which (unlike a renderer's bounds) are there while it is hidden.
            var lensAt = Vector3.zero;
            int lenses = 0;
            // heldFlashlight.ts tints a skin material once for every mesh that wears it, and three's
            // meshes share one material per glTF material (the nurse's hand and coat: tinted twice);
            // Unity gives each piece its own copy, so each copy takes the tint as often.
            var wearers = new Dictionary<Material, int>();
            foreach (var r in model.GetComponentsInChildren<Renderer>(true))
                foreach (var m in r.sharedMaterials)
                    if (m != null) wearers[m] = wearers.TryGetValue(m, out int n) ? n + 1 : 1;
            foreach (var r in model.GetComponentsInChildren<Renderer>(true))
            {
                r.gameObject.layer = HauntedHeld.HeldLayer;
                r.renderingLayerMask = HeldLight;
                r.shadowCastingMode = ShadowCastingMode.Off;
                r.receiveShadows = false;
                // Its diffuse light (the studio's and the night fill's) is given each frame (Update).
                r.lightProbeUsage = LightProbeUsage.CustomProvided;
                r.reflectionProbeUsage = ReflectionProbeUsage.Simple;
                r.allowOcclusionWhenDynamic = false;
                var sources = r.sharedMaterials;
                var materials = r.materials;
                // The lens glass made ready to glow (CharacterImport), in place of the glTF's own.
                for (int i = 0; i < materials.Length; i++)
                    if (art.heldLens != null && materials[i].name.ToLowerInvariant().Contains("glass"))
                    {
                        Object.Destroy(materials[i]);
                        materials[i] = new Material(art.heldLens) { name = "torch_lens_glass" };
                    }
                // Which glTF material each (possibly doubled) part wears, for the tint below.
                var split = Characters.BackThenFront(r, materials);
                if (split.Length != materials.Length)
                {
                    var worn = new List<Material>();
                    for (int i = 0, j = 0; i < split.Length; i++)
                    {
                        worn.Add(sources[j]);
                        if (split[i] == materials[j]) j++;
                    }
                    sources = worn.ToArray();
                    materials = split;
                }
                r.materials = materials;
                made.AddRange(materials);
                for (int i = 0; i < materials.Length; i++)
                {
                    var m = materials[i];
                    string name = m.name.ToLowerInvariant();
                    if (name.StartsWith("skin") || name.StartsWith("wool"))
                    {
                        if (m.HasProperty(BaseColorFactor))
                        {
                            int times = sources[i] != null && wearers.TryGetValue(sources[i], out int n) ? n : 1;
                            var col = m.GetColor(BaseColorFactor).linear;
                            for (int k = 0; k < times; k++) col = new Color(col.r * SkinTint.r, col.g * SkinTint.g, col.b * SkinTint.b, col.a);
                            m.SetColor(BaseColorFactor, col.gamma);
                        }
                    }
                    if (name.Contains("glass"))
                    {
                        lens.Add(m);
                        var filter = r.GetComponent<MeshFilter>();
                        if (filter != null && filter.sharedMesh != null)
                        {
                            lensAt += hold.InverseTransformPoint(r.transform.TransformPoint(filter.sharedMesh.bounds.center));
                            lenses++;
                        }
                    }
                }
                r.probeAnchor = shown.transform;
                pieces.Add(r);
            }
            if (lenses > 0) lensLocal = lensAt / lenses;
        }

        /// <summary>
        /// Follows the view with sway and lag; returns where the beam starts in the camera's space.
        /// yaw and pitch are the view's (the sim's, three's sense); show: drawn at all; on: the
        /// beam is lit; brightness: the beam now, 0 to 1; lamps: the hotel's lamps, 1 lit to 0.
        /// </summary>
        public Vector3 Update(float dt, Vector3 eye, double yaw, double pitch, bool show, bool on, float brightness, float lamps)
        {
            if (!studioTaken)
            {
                studioTaken = true;
                studioRender = studio.RenderProbe();
            }
            else if (!studioAsked && studio.IsFinishedRendering(studioRender) && studio.realtimeTexture != null)
            {
                studioAsked = true;
                ReadStudio(studio.realtimeTexture);
            }
            if (shown.customBakedTexture == null && studio.realtimeTexture != null) shown.customBakedTexture = studio.realtimeTexture;
            float speed = started && dt > 0 ? new Vector2(eye.x - lastPos.x, eye.z - lastPos.z).magnitude / dt : 0;
            lastPos = eye;
            // A teleport (a respawn, the meeting) is not a step.
            float walking = speed < 20 ? speed : 0;
            phase += walking / StepM * Mathf.PI * dt;
            float scale = Mathf.Min(walking / WalkSpeedMps, BobMaxScale);
            var sway = new Vector3(Mathf.Sin(phase) * BobSideM * scale, -Mathf.Abs(Mathf.Cos(phase)) * BobUpM * scale, 0);
            if (started)
            {
                double dYaw = System.Math.Atan2(System.Math.Sin(yaw - lastYaw), System.Math.Cos(yaw - lastYaw));
                lagYaw = Mathf.Clamp(lagYaw - (float)dYaw * LagRadPerRad, -LagMaxRad, LagMaxRad);
                lagPitch = Mathf.Clamp(lagPitch - (float)(pitch - lastPitch) * LagRadPerRad, -LagMaxRad, LagMaxRad);
            }
            started = true;
            lastYaw = yaw;
            lastPitch = pitch;
            float back = Mathf.Exp(-LagReturnPerSec * dt);
            lagYaw *= back;
            lagPitch *= back;

            root.gameObject.SetActive(show);
            hold.localPosition = Hold + sway;
            // three's yaw and pitch turn the other way in Unity's mirrored space.
            hold.localRotation = Quaternion.Euler(-(HoldPitchRad + lagPitch) * Mathf.Rad2Deg, -(HoldYawRad + lagYaw) * Mathf.Rad2Deg, 0);

            float glow = on ? brightness : 0;
            var g = Shapes.Hex(LensGlow).linear * (LensGlowIntensity * glow);
            foreach (var m in lens) if (m.HasProperty(EmissiveFactor)) m.SetVector(EmissiveFactor, new Vector4(g.r, g.g, g.b, 1));
            bounce.intensity = BounceIntensity * glow / Mathf.PI;
            // Unity takes a probe's intensity as sRGB in a linear project (0.25 came out 0.25^2.2):
            // given as the sRGB of the strength it should be.
            shown.intensity = Mathf.LinearToGammaSpace(StudioIntensity * lamps);
            shOne[0] = studioRead ? studioLight * (StudioIntensity * lamps) + fill : fill;
            for (int i = 0; i < pieces.Count; i++)
            {
                if (pieces[i] == null) continue;
                pieces[i].GetPropertyBlock(block);
                block.CopySHCoefficientArraysFrom(shOne);
                pieces[i].SetPropertyBlock(block);
            }
            return hold.localPosition + hold.localRotation * lensLocal;
        }

        /// <summary>
        /// The night fill as game.ts's HemisphereLight lights a diffuse surface (already divided by pi):
        /// ground below to sky above, straight across the middle. Game sets it with the hotel's.
        /// </summary>
        public void Fill(Color sky, Color ground)
        {
            fill = new SphericalHarmonicsL2();
            for (int c = 0; c < 3; c++)
            {
                // Unity's coefficients carry the basis's constants: the value is c0 + c1 y + ...
                fill[c, 0] = (sky[c] + ground[c]) / 2;
                fill[c, 1] = (sky[c] - ground[c]) / 2;
            }
        }

        const float Y0 = 0.282095f, Y1 = 0.488603f, Y2a = 1.092548f, Y2b = 0.315392f, Y2c = 0.546274f;

        /// <summary>
        /// Reads the studio's picture back once and works out how it lights a surface facing each way
        /// (three's irradiance from the environment): its light in spherical harmonics, cosine-weighted
        /// and divided by pi, as Unity's light probes hold it.
        /// </summary>
        void ReadStudio(RenderTexture cube)
        {
            int mip = Mathf.Max(0, Mathf.Min(cube.mipmapCount - 1, StudioMip));
            int size = Mathf.Max(1, cube.width >> mip);
            AsyncGPUReadback.Request(cube, mip, 0, size, 0, size, 0, 6, TextureFormat.RGBAFloat, request =>
            {
                if (request.hasError) { Debug.LogWarning("Held torch: the studio could not be read back"); return; }
                var sh = new SphericalHarmonicsL2();
                float weight = 0, top = 0, bottom = 0;
                for (int face = 0; face < 6; face++)
                {
                    var data = request.GetData<Color>(face);
                    for (int y = 0; y < size; y++)
                        for (int x = 0; x < size; x++)
                        {
                            float u = 2 * (x + 0.5f) / size - 1, v = 2 * (y + 0.5f) / size - 1;
                            var dir = Direction(face, u, v).normalized;
                            float dw = 4f / (size * size) / Mathf.Pow(1 + u * u + v * v, 1.5f);
                            var col = data[y * size + x];
                            Add(ref sh, dir, col, dw);
                            weight += dw;
                            float lum = (col.r + col.g + col.b) / 3 * dw;
                            if (face != 2 && face != 3) { if (dir.y > 0) top += lum; else bottom += lum; }
                        }
                }
                // Cosine-weighted (pi, 2pi/3, pi/4 by band) and divided by pi; then each times its basis
                // constant, as Unity keeps them (its shader adds c0 + c1 y + c2 z + ...).
                float[] folded = { Y0, Y1, Y1, Y1, Y2a, Y2a, Y2b, Y2a, Y2c };
                for (int c = 0; c < 3; c++)
                    for (int i = 0; i < 9; i++)
                        sh[c, i] *= folded[i] * (i == 0 ? 1 : i < 4 ? 2f / 3 : 0.25f);
                studioLight = sh;
                studioRead = true;
                Debug.Log("Held torch: studio read (" + size + " px faces, solid angle " + weight.ToString("F2") + "), facing up " + Evaluate(sh, Vector3.up).ToString("F3") + ", down " + Evaluate(sh, Vector3.down).ToString("F3") + ", sides' upper half " + top.ToString("F2") + " lower " + bottom.ToString("F2"));
            });
        }

        /// <summary>Which way a cube face's texel looks (Unity's cubemap faces: +x, -x, +y, -y, +z, -z; v down the face).</summary>
        static Vector3 Direction(int face, float u, float v)
        {
            switch (face)
            {
                case 0: return new Vector3(1, -v, -u);
                case 1: return new Vector3(-1, -v, u);
                case 2: return new Vector3(u, 1, v);
                case 3: return new Vector3(u, -1, -v);
                case 4: return new Vector3(u, -v, 1);
                default: return new Vector3(-u, -v, -1);
            }
        }

        static void Add(ref SphericalHarmonicsL2 sh, Vector3 d, Color col, float dw)
        {
            float[] basis =
            {
                Y0, Y1 * d.y, Y1 * d.z, Y1 * d.x,
                Y2a * d.x * d.y, Y2a * d.y * d.z, Y2b * (3 * d.z * d.z - 1), Y2a * d.x * d.z, Y2c * (d.x * d.x - d.y * d.y),
            };
            for (int i = 0; i < 9; i++)
            {
                sh[0, i] += col.r * basis[i] * dw;
                sh[1, i] += col.g * basis[i] * dw;
                sh[2, i] += col.b * basis[i] * dw;
            }
        }

        static Color Evaluate(SphericalHarmonicsL2 sh, Vector3 d)
        {
            var outs = new Color[1];
            sh.Evaluate(new[] { d }, outs);
            return outs[0];
        }

        /// <summary>
        /// The soft room three's heldFlashlight.ts lights its metal with (RoomEnvironment): grey walls
        /// lit by one lamp, a few grey boxes, and six glowing panels. Built at a thirtieth of its size
        /// (so the hotel's fog, from 1 m, never reaches into it) far below the hotel on StudioLayer,
        /// taken once by a probe that sees only it.
        /// </summary>
        static class Studio
        {
            const float Scale = 1f / 30;

            public static ReflectionProbe Make(Vector3 at)
            {
                var root = new GameObject("Held torch studio").transform;
                root.position = at;
                var lit = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                lit.SetColor("_BaseColor", Color.white);
                lit.SetFloat("_Smoothness", 0);
                lit.SetFloat("_Metallic", 0);
                // RoomEnvironment's room (seen from inside) and boxes.
                var room = Box(root, lit, new Vector3(-0.757f, 13.219f, 0.717f), new Vector3(31.713f, 28.305f, 28.591f), 0);
                Inside(room);
                Box(root, lit, new Vector3(-10.906f, 2.009f, 1.846f), new Vector3(2.328f, 7.905f, 4.651f), -0.195f);
                Box(root, lit, new Vector3(-5.607f, -0.754f, -0.758f), new Vector3(1.970f, 1.534f, 3.955f), 0.994f);
                Box(root, lit, new Vector3(6.167f, 0.857f, 7.803f), new Vector3(3.927f, 6.285f, 3.687f), 0.561f);
                Box(root, lit, new Vector3(-2.017f, 0.018f, 6.124f), new Vector3(2.002f, 4.566f, 2.064f), 0.333f);
                Box(root, lit, new Vector3(2.291f, -0.756f, -2.621f), new Vector3(1.546f, 1.552f, 1.496f), -0.286f);
                Box(root, lit, new Vector3(-2.193f, -0.369f, -5.547f), new Vector3(3.875f, 3.487f, 2.986f), 0.516f);
                // Its area lights: white panels glowing this many times over.
                Panel(root, 50, new Vector3(-16.116f, 14.37f, 8.208f), new Vector3(0.1f, 2.428f, 2.739f));
                Panel(root, 50, new Vector3(-16.109f, 18.021f, -8.207f), new Vector3(0.1f, 2.425f, 2.751f));
                Panel(root, 17, new Vector3(14.904f, 12.198f, -1.832f), new Vector3(0.15f, 4.265f, 6.331f));
                Panel(root, 43, new Vector3(-0.462f, 8.89f, 14.520f), new Vector3(4.38f, 5.441f, 0.088f));
                Panel(root, 20, new Vector3(3.235f, 11.486f, -12.541f), new Vector3(2.5f, 2.0f, 0.1f));
                Panel(root, 100, new Vector3(0, 20, 0), new Vector3(1, 0.1f, 1));
                // Its lamp: PointLight(white, 900, 28, decay 2), Unity's π less, the room a thirtieth the size.
                var l = new GameObject("Studio lamp");
                l.transform.SetParent(root, false);
                l.transform.localPosition = Three(new Vector3(0.418f, 16.199f, 0.300f)) * Scale;
                var lamp = l.AddComponent<Light>();
                lamp.type = LightType.Point;
                lamp.color = Color.white;
                lamp.intensity = 900 / Mathf.PI * Scale * Scale;
                lamp.range = 28 * Scale;
                lamp.shadows = LightShadows.None;
                HauntedLightDecay.Set(lamp, 2);

                var p = new GameObject("Studio reflection");
                p.transform.SetParent(root, false);
                // RoomEnvironment sits 3.5 below where three takes it from.
                p.transform.localPosition = new Vector3(0, 3.5f * Scale, 0);
                var probe = p.AddComponent<ReflectionProbe>();
                probe.mode = ReflectionProbeMode.Realtime;
                probe.refreshMode = ReflectionProbeRefreshMode.ViaScripting;
                probe.timeSlicingMode = ReflectionProbeTimeSlicingMode.NoTimeSlicing;
                probe.resolution = 128;
                probe.hdr = true;
                probe.nearClipPlane = 0.002f;
                probe.farClipPlane = 2;
                probe.size = Vector3.one * 0.5f;
                probe.importance = 100;
                probe.cullingMask = 1 << HauntedHeld.StudioLayer;
                probe.clearFlags = ReflectionProbeClearFlags.SolidColor;
                probe.backgroundColor = Color.black;
                return probe;
            }

            /// <summary>A tiny probe here showing what the studio's took (Update gives it the picture).</summary>
            public static ReflectionProbe Copy(string name, Transform parent, Vector3 at)
            {
                var p = new GameObject(name);
                p.transform.SetParent(parent, false);
                p.transform.localPosition = at;
                var probe = p.AddComponent<ReflectionProbe>();
                probe.mode = ReflectionProbeMode.Custom;
                probe.size = Vector3.one * 0.01f;
                probe.importance = 100;
                probe.hdr = true;
                return probe;
            }

            /// <summary>three's (x, y, z) in Unity's mirrored space (Coords: z flipped).</summary>
            static Vector3 Three(Vector3 v) => new Vector3(v.x, v.y, -v.z);

            static GameObject Box(Transform root, Material material, Vector3 at, Vector3 size, float yawRad)
            {
                var box = GameObject.CreatePrimitive(PrimitiveType.Cube);
                Object.Destroy(box.GetComponent<Collider>());
                box.layer = HauntedHeld.StudioLayer;
                box.transform.SetParent(root, false);
                box.transform.localPosition = Three(at) * Scale;
                box.transform.localRotation = Quaternion.Euler(0, -yawRad * Mathf.Rad2Deg, 0);
                box.transform.localScale = size * Scale;
                var r = box.GetComponent<MeshRenderer>();
                r.sharedMaterial = material;
                r.shadowCastingMode = ShadowCastingMode.Off;
                r.lightProbeUsage = LightProbeUsage.Off;
                r.reflectionProbeUsage = ReflectionProbeUsage.Off;
                return box;
            }

            static void Panel(Transform root, float intensity, Vector3 at, Vector3 size)
            {
                var m = new Material(Shader.Find("Universal Render Pipeline/Unlit"));
                // Unity takes this colour as sRGB (even set as a vector: 100 came out 100^2.2), so it is
                // given as the sRGB of the glow it should be.
                m.SetColor("_BaseColor", new Color(intensity, intensity, intensity, 1).gamma);
                var panel = Box(root, m, at, size, 0);
                panel.GetComponent<MeshRenderer>().sharedMaterial = m;
            }

            /// <summary>The room is seen from inside: its faces turned round.</summary>
            static void Inside(GameObject box)
            {
                var filter = box.GetComponent<MeshFilter>();
                var mesh = Object.Instantiate(filter.sharedMesh);
                var tris = mesh.triangles;
                for (int i = 0; i < tris.Length; i += 3) (tris[i + 1], tris[i + 2]) = (tris[i + 2], tris[i + 1]);
                mesh.triangles = tris;
                var normals = mesh.normals;
                for (int i = 0; i < normals.Length; i++) normals[i] = -normals[i];
                mesh.normals = normals;
                filter.sharedMesh = mesh;
            }
        }
    }
}
