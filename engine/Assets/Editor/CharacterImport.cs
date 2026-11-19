using System;
using System.Collections.Generic;
using System.IO;
using System.Linq;
using Haunted.Game;
using Haunted.Sim;
using UnityEditor;
using UnityEngine;

namespace Haunted.Editor
{
    /// <summary>
    /// Step D3 of docs/plans/engine-port.md: brings the browser's people into Unity. First run
    /// `npx tsx tools/engine-rooms.ts --characters` (it writes engine/Assets/Hotel/Characters), then
    /// this (CommandRunner "ImportCharacters"). It prepares the shared animations as the browser does
    /// (client/src/characterModels.ts prepareClip) and lists every character, Low copy and held hand
    /// in Assets/Hotel/Resources/CharacterArt.asset for the game.
    /// </summary>
    public static class CharacterImport
    {
        const string Folder = "Assets/Hotel/Characters";
        const string Clips = Folder + "/Clips";
        /// <summary>characterModels.ts CLIPS and LOOPS.</summary>
        static readonly string[] ClipNames = { "idle", "walk", "run", "crouch-idle", "crouch-walk", "crawl", "downed-idle", "knocked-down", "dying" };
        static readonly HashSet<string> Loops = new HashSet<string> { "idle", "walk", "run", "crouch-idle", "crouch-walk", "crawl", "downed-idle" };
        const string Hips = "mixamorig:Hips";
        /// <summary>characterModels.ts KNOCKED_DOWN_SEC: the fall to the floor; the rest of the clip is lying still.</summary>
        const float KnockedDownSec = 2.7f;

        [MenuItem("Haunted/Import characters")]
        public static void Import()
        {
            if (!File.Exists(Folder + "/anims.gltf")) throw new FileNotFoundException("Run npx tsx tools/engine-rooms.ts --characters first: " + Folder + "/anims.gltf is missing");
            AssetDatabase.Refresh();
            HotelTextures.Recheck();

            var art = ScriptableObject.CreateInstance<CharacterArt>();
            foreach (var c in (List<object>)Json.Parse(File.ReadAllText("Assets/Resources/Data/characters.json")))
            {
                string id = (string)((Dictionary<string, object>)c)["id"];
                var model = AssetDatabase.LoadAssetAtPath<GameObject>(Folder + "/" + id + ".gltf");
                if (model == null)
                {
                    Debug.LogWarning("Characters: " + id + " is not imported (run tools/engine-rooms.ts --characters)");
                    continue;
                }
                art.characters.Add(new CharacterModelArt
                {
                    id = id,
                    model = model,
                    low = AssetDatabase.LoadAssetAtPath<GameObject>(Folder + "/low/" + id + ".gltf"),
                    held = AssetDatabase.LoadAssetAtPath<GameObject>(Folder + "/held_" + id + ".gltf"),
                });
            }
            art.heldTorch = AssetDatabase.LoadAssetAtPath<GameObject>(Folder + "/held_torch.gltf");
            art.heldLens = LensGlass();

            // characterModels.ts: the animations were made on another body, whose hips sit at another height.
            var anims = AssetDatabase.LoadAssetAtPath<GameObject>(Folder + "/anims.gltf");
            var animHips = anims != null ? anims.GetComponentsInChildren<Transform>(true).FirstOrDefault(t => t.name == Hips) : null;
            art.animHipsM = animHips != null ? animHips.localPosition.magnitude : 0;

            Directory.CreateDirectory(Clips);
            var source = AssetDatabase.LoadAllAssetsAtPath(Folder + "/anims.gltf").OfType<AnimationClip>().ToDictionary(a => a.name);
            foreach (var name in ClipNames)
            {
                AnimationClip clip;
                if (!source.TryGetValue(name, out clip))
                {
                    Debug.LogWarning("Characters: anims.gltf has no clip " + name + " (it has " + string.Join(", ", source.Keys) + ")");
                    continue;
                }
                string path = Clips + "/" + name + ".anim";
                AssetDatabase.DeleteAsset(path);
                var ready = Prepare(clip, Loops.Contains(name), name == "knocked-down" ? KnockedDownSec : float.PositiveInfinity);
                AssetDatabase.CreateAsset(ready, path);
                art.clips.Add(ready);
            }

            Directory.CreateDirectory("Assets/Hotel/Resources");
            AssetDatabase.DeleteAsset("Assets/Hotel/Resources/CharacterArt.asset");
            AssetDatabase.CreateAsset(art, "Assets/Hotel/Resources/CharacterArt.asset");
            AssetDatabase.SaveAssets();
            Debug.Log("Characters: " + art.characters.Count + " imported (" + art.characters.Count(c => c.low != null) + " Low, " + art.characters.Count(c => c.held != null) + " held), plain hand " + (art.heldTorch != null) + ", " + art.clips.Count + " clips");
            if (art.clips.Count > 0)
                foreach (var b in AnimationUtility.GetCurveBindings(art.clips[0]).Take(4)) Debug.Log("Characters: clip binding " + b.path + " " + b.propertyName);
        }

        /// <summary>
        /// A copy of the held torch's lens glass with glTFast's glow turned on (black until the game
        /// lights it), saved as its own material so the build has the shader for a glowing lens.
        /// </summary>
        static Material LensGlass()
        {
            var glass = AssetDatabase.LoadAllAssetsAtPath(Folder + "/held_torch.gltf").OfType<Material>()
                .FirstOrDefault(m => m.name.ToLowerInvariant().Contains("glass"));
            const string path = Folder + "/held_lens.mat";
            AssetDatabase.DeleteAsset(path);
            if (glass == null)
            {
                Debug.LogWarning("Characters: held_torch.gltf has no glass material for the lens");
                return null;
            }
            var lens = new Material(glass) { name = "held_lens" };
            lens.EnableKeyword("_EMISSIVE");
            lens.SetVector("emissiveFactor", new Vector4(0, 0, 0, 1));
            AssetDatabase.CreateAsset(lens, path);
            Debug.Log("Characters: held lens from " + glass.name + ", keywords " + string.Join(" ", lens.shaderKeywords));
            return lens;
        }

        /// <summary>
        /// Poses the first character with each prepared clip (as the game does: a legacy Animation
        /// on a fresh copy) and logs how tall it stands and where its hips are, to check the clips.
        /// </summary>
        [MenuItem("Haunted/Check characters")]
        public static void Check()
        {
            var art = AssetDatabase.LoadAssetAtPath<CharacterArt>("Assets/Hotel/Resources/CharacterArt.asset");
            var body = new GameObject("Check body");
            var copy = UnityEngine.Object.Instantiate(art.characters[0].model, body.transform, false);
            copy.name = "Armature"; // as RemotePlayers.CharacterBody.Make
            var animation = body.AddComponent<Animation>();
            foreach (var clip in art.clips) animation.AddClip(clip, clip.name);
            var bones = body.GetComponentsInChildren<Transform>(true);
            var hips = bones.First(t => t.name == Hips);
            var top = bones.First(t => t.name == "mixamorig:HeadTop_End");
            var skin = body.GetComponentInChildren<SkinnedMeshRenderer>();
            Debug.Log("Check path " + AnimationUtility.CalculateTransformPath(hips, body.transform) + "; anims path " + AnimationUtility.CalculateTransformPath(AssetDatabase.LoadAssetAtPath<GameObject>(Folder + "/anims.gltf").GetComponentsInChildren<Transform>(true).First(t => t.name == Hips), AssetDatabase.LoadAssetAtPath<GameObject>(Folder + "/anims.gltf").transform));
            foreach (var b in AnimationUtility.GetCurveBindings(art.clips[0]).Take(3)) Debug.Log("Check curve " + b.path + " " + b.propertyName + " " + b.type.Name + " " + AnimationUtility.GetEditorCurve(art.clips[0], b).Evaluate(0.5f));
            Debug.Log("Check rest: hips " + hips.localPosition.ToString("F2") + " top " + top.position.ToString("F2") + " parent scale " + hips.parent.lossyScale.ToString("F3") + " skin root " + (skin.rootBone != null ? skin.rootBone.name : "none") + " bounds " + skin.bounds.size.ToString("F2"));
            foreach (var clip in art.clips)
            {
                clip.SampleAnimation(body, Mathf.Min(0.5f, clip.length));
                Debug.Log("Check " + clip.name + ": hips " + hips.localPosition.ToString("F2") + " top " + top.position.ToString("F2") + " armature scale " + hips.parent.localScale.ToString("F3"));
            }
            foreach (var b in AnimationUtility.GetCurveBindings(art.clips[0]).Select(b => b.path + " " + b.propertyName).Where(p => !p.Contains("Rotation")).Take(10)) Debug.Log("Check binding " + b);
            UnityEngine.Object.DestroyImmediate(body);
            var held = UnityEngine.Object.Instantiate(art.heldTorch);
            foreach (var f in held.GetComponentsInChildren<MeshFilter>(true))
                Debug.Log("Check held " + f.name + " centre " + held.transform.InverseTransformPoint(f.transform.TransformPoint(f.sharedMesh.bounds.center)).ToString("F3") + " size " + f.sharedMesh.bounds.size.ToString("F3") + " node " + f.transform.localPosition.ToString("F3") + " " + f.transform.localEulerAngles.ToString("F0") + " " + f.transform.lossyScale.ToString("F3"));
            UnityEngine.Object.DestroyImmediate(held);
        }

        /// <summary>
        /// characterModels.ts prepareClip: no scale tracks; of the position tracks only the hips' (bones
        /// keep their own lengths), less any drift across the floor (its local x and y; z is height),
        /// and for a repeating clip any drift up or down too, so it loops cleanly. The hips are scaled to
        /// each body's legs as it plays. `endSec` trims the clip.
        /// </summary>
        static AnimationClip Prepare(AnimationClip clip, bool loop, float endSec)
        {
            var ready = new AnimationClip { name = clip.name, legacy = true, frameRate = clip.frameRate };
            foreach (var binding in AnimationUtility.GetCurveBindings(clip))
            {
                string property = binding.propertyName;
                bool position = property.IndexOf("Position", StringComparison.OrdinalIgnoreCase) >= 0;
                if (property.IndexOf("Scale", StringComparison.OrdinalIgnoreCase) >= 0) continue;
                bool hips = binding.path == Hips || binding.path.EndsWith("/" + Hips, StringComparison.Ordinal);
                if (position && !hips) continue;
                var curve = AnimationUtility.GetEditorCurve(clip, binding);
                if (endSec < clip.length) curve = Trim(curve, endSec);
                if (position)
                {
                    char axis = property[property.Length - 1];
                    if (axis == 'x' || axis == 'y' || (loop && axis == 'z')) RemoveDrift(curve);
                }
                ready.SetCurve(binding.path, binding.type, property, curve);
            }
            ready.wrapMode = loop ? WrapMode.Loop : WrapMode.ClampForever;
            ready.EnsureQuaternionContinuity();
            return ready;
        }

        static AnimationCurve Trim(AnimationCurve curve, float endSec)
        {
            var keys = curve.keys.Where(k => k.time < endSec).ToList();
            keys.Add(new Keyframe(endSec, curve.Evaluate(endSec)));
            return new AnimationCurve(keys.ToArray());
        }

        /// <summary>Takes away a straight line from the first key to the last, so the curve ends where it starts.</summary>
        static void RemoveDrift(AnimationCurve curve)
        {
            var keys = curve.keys;
            if (keys.Length < 2) return;
            float t0 = keys[0].time, span = keys[keys.Length - 1].time - t0;
            if (span <= 0) return;
            float slope = (keys[keys.Length - 1].value - keys[0].value) / span;
            for (int i = 0; i < keys.Length; i++)
            {
                var k = keys[i];
                k.value -= slope * (k.time - t0);
                if (!float.IsInfinity(k.inTangent)) k.inTangent -= slope;
                if (!float.IsInfinity(k.outTangent)) k.outTangent -= slope;
                keys[i] = k;
            }
            curve.keys = keys;
        }
    }
}
