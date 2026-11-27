using System.IO;
using UnityEditor;
using UnityEditor.SceneManagement;
using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.Universal;

namespace Haunted.Editor
{
    /// <summary>
    /// Sets the project up and builds it from the command line, so nothing depends on clicks in the
    /// editor (Claude does the Unity work by script):
    ///   Unity.exe -batchmode -quit -projectPath engine -executeMethod Haunted.Editor.ProjectSetup.Setup
    ///   Unity.exe -batchmode -quit -projectPath engine -executeMethod Haunted.Editor.ProjectSetup.BuildWindows
    /// Setup is safe to run again: it only makes what is missing.
    /// </summary>
    public static class ProjectSetup
    {
        const string SettingsDir = "Assets/Settings";
        const string PipelinePath = SettingsDir + "/URP.asset";
        const string RendererPath = SettingsDir + "/URP Renderer.asset";
        const string MaterialPath = "Assets/Resources/Materials/GreyBox.mat";
        const string ScenePath = "Assets/Scenes/Main.unity";
        public const string BuildPath = "Build/Windows/Haunted Lobby.exe";

        [MenuItem("Haunted/Set up project")]
        public static void Setup()
        {
            Directory.CreateDirectory(SettingsDir);
            NameRenderingLayers();
            Directory.CreateDirectory(Path.GetDirectoryName(MaterialPath));
            Directory.CreateDirectory(Path.GetDirectoryName(ScenePath));

            // URP with its forward renderer, used by every quality level.
            var pipeline = AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath);
            if (pipeline == null)
            {
                var rendererData = ScriptableObject.CreateInstance<UniversalRendererData>();
                AssetDatabase.CreateAsset(rendererData, RendererPath);
                pipeline = UniversalRenderPipelineAsset.Create(rendererData);
                AssetDatabase.CreateAsset(pipeline, PipelinePath);
            }
            pipeline.supportsHDR = true;
            // Half floats per colour, as the browser's post.ts targets: the default 32-bit picture
            // (R11G11B10) keeps 5 or 6 bits a colour and drew torch-lit surfaces about 3% darker.
            pipeline.hdrColorBufferPrecision = HDRColorBufferPrecision._64Bits;
            pipeline.msaaSampleCount = 4;
            pipeline.shadowDistance = 30;
            pipeline.maxAdditionalLightsCount = 8;
            EditorUtility.SetDirty(pipeline);
            GraphicsSettings.defaultRenderPipeline = pipeline;
            for (int i = 0; i < QualitySettings.names.Length; i++)
            {
                QualitySettings.SetQualityLevel(i, false);
                QualitySettings.renderPipeline = pipeline;
            }

            AddPost();

            // One lit material the hotel copies for each colour (kept in Resources so builds include the shader).
            if (AssetDatabase.LoadAssetAtPath<Material>(MaterialPath) == null)
            {
                var mat = new Material(Shader.Find("Universal Render Pipeline/Lit"));
                mat.SetFloat("_Smoothness", 0.15f);
                AssetDatabase.CreateAsset(mat, MaterialPath);
            }
            // The task stations' looks (Shapes.cs copies these): a lit one that can glow under the
            // crosshair, see-through glass, and unlit ones for flames, paper and fog. Each is an asset
            // so the build keeps its shader variant (emission, transparency).
            MakeMaterial("Glow", "Universal Render Pipeline/Lit", false, m => { m.SetFloat("_Smoothness", 0.15f); m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", KeepEmission); m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None; });
            // Glass can glow under the crosshair too (the vase, the jugs).
            MakeMaterial("Clear", "Universal Render Pipeline/Lit", true, m => { m.SetFloat("_Smoothness", 0.8f); m.EnableKeyword("_EMISSION"); m.SetColor("_EmissionColor", KeepEmission); m.globalIlluminationFlags = MaterialGlobalIlluminationFlags.None; });
            MakeMaterial("Unlit", "Universal Render Pipeline/Unlit", false, m => { });
            MakeMaterial("UnlitClear", "Universal Render Pipeline/Unlit", true, m => { });
            // The names over players' heads, hidden by what is nearer (Assets/Shaders/HauntedLabel).
            MakeMaterial("Label", "Haunted/Label", false, m => { });

            // The one scene: an object that runs the game. Everything else is built from data at run time.
            if (!File.Exists(ScenePath))
            {
                var scene = EditorSceneManager.NewScene(NewSceneSetup.EmptyScene, NewSceneMode.Single);
                new GameObject("Game").AddComponent<Haunted.Game.Game>();
                EditorSceneManager.SaveScene(scene, ScenePath);
            }
            EditorBuildSettings.scenes = new[] { new EditorBuildSettingsScene(ScenePath, true) };

            PlayerSettings.companyName = "Haunted Lobby";
            PlayerSettings.productName = "Haunted Lobby";
            PlayerSettings.colorSpace = ColorSpace.Linear;
            PlayerSettings.runInBackground = true;
            PlayerSettings.fullScreenMode = FullScreenMode.Windowed;
            PlayerSettings.defaultScreenWidth = 1280;
            PlayerSettings.defaultScreenHeight = 720;
            PlayerSettings.resizableWindow = true;
            // Mono builds with what the editor ships. IL2CPP (faster, harder to tamper with) needs
            // Visual Studio's C++ tools, which this PC lacks; switch at the release step (F).
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.Mono2x);

            // Keys and mouse come from the Input System package (raw mouse counts, like the browser's
            // pointer lock). 1 = Input System only; the setting has no scripting API of its own.
            var playerSettings = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/ProjectSettings.asset")[0]);
            var inputHandler = playerSettings.FindProperty("activeInputHandler");
            if (inputHandler != null && inputHandler.intValue != 1)
            {
                inputHandler.intValue = 1;
                playerSettings.ApplyModifiedProperties();
                Debug.Log("Input System set as the input handler (takes effect when the editor next starts)");
            }

            MakePanel();
            AssetDatabase.SaveAssets();
            Debug.Log("Haunted setup done: URP, material, scene, player settings");
        }

        const string PanelPath = "Assets/UI/Resources/UI/Panel.asset";

        /// <summary>
        /// The menus' panel (step E, Menus.cs): Unity's default theme under Menus.uss, at one pixel a
        /// pixel whatever the window's size, as the browser's menus are.
        /// </summary>
        static void MakePanel()
        {
            var panel = AssetDatabase.LoadAssetAtPath<UnityEngine.UIElements.PanelSettings>(PanelPath);
            if (panel == null)
            {
                panel = ScriptableObject.CreateInstance<UnityEngine.UIElements.PanelSettings>();
                AssetDatabase.CreateAsset(panel, PanelPath);
            }
            panel.themeStyleSheet = AssetDatabase.LoadAssetAtPath<UnityEngine.UIElements.ThemeStyleSheet>("Assets/UI/Resources/UI/Theme.tss");
            panel.scaleMode = UnityEngine.UIElements.PanelScaleMode.ConstantPixelSize;
            panel.scale = 1;
            panel.sortingOrder = 100;
            EditorUtility.SetDirty(panel);
        }

        /// <summary>
        /// The editor turns emission off on a material whose emission is pure black, and the build then
        /// leaves the glowing shader out; this is far too dark to see but keeps it on.
        /// </summary>
        static readonly Color KeepEmission = new Color(0.001f, 0.001f, 0.001f);

        /// <summary>Makes (or brings up to date) Assets/Resources/Materials/name.mat; clear ones blend by alpha.</summary>
        static void MakeMaterial(string name, string shader, bool clear, System.Action<Material> setUp)
        {
            string path = "Assets/Resources/Materials/" + name + ".mat";
            var mat = AssetDatabase.LoadAssetAtPath<Material>(path);
            bool made = mat == null;
            if (made) mat = new Material(Shader.Find(shader));
            if (clear)
            {
                mat.SetFloat("_Surface", 1);
                mat.SetFloat("_Blend", 0);
                mat.SetFloat("_SrcBlend", (float)BlendMode.SrcAlpha);
                mat.SetFloat("_DstBlend", (float)BlendMode.OneMinusSrcAlpha);
                mat.SetFloat("_SrcBlendAlpha", (float)BlendMode.One);
                mat.SetFloat("_DstBlendAlpha", (float)BlendMode.OneMinusSrcAlpha);
                mat.SetFloat("_ZWrite", 0);
                mat.EnableKeyword("_SURFACE_TYPE_TRANSPARENT");
                mat.SetOverrideTag("RenderType", "Transparent");
                mat.SetShaderPassEnabled("ShadowCaster", false);
                mat.renderQueue = (int)RenderQueue.Transparent;
            }
            setUp(mat);
            if (made) AssetDatabase.CreateAsset(mat, path);
            else EditorUtility.SetDirty(mat);
        }

        /// <summary>
        /// Puts the browser's finished picture (Haunted.Game.HauntedPost: bloom, AgX, grain, vignette)
        /// on the URP renderer, once. The renderer keeps a list of its features' file ids beside the
        /// features themselves, so both are written.
        /// </summary>
        static void AddPost()
        {
            var renderer = AssetDatabase.LoadAssetAtPath<UniversalRendererData>(RendererPath);
            var shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/Shaders/HauntedPost.shader");
            var post = renderer.rendererFeatures.Find(f => f is Haunted.Game.HauntedPost) as Haunted.Game.HauntedPost;
            if (post == null)
            {
                post = ScriptableObject.CreateInstance<Haunted.Game.HauntedPost>();
                post.name = "Haunted post";
                AssetDatabase.AddObjectToAsset(post, renderer);
                renderer.rendererFeatures.Add(post);
            }
            post.shader = shader;
            EditorUtility.SetDirty(post);
            // The menus over the finished picture, blended as a browser blends (HauntedUi, step E).
            var ui = renderer.rendererFeatures.Find(f => f is Haunted.Game.HauntedUi) as Haunted.Game.HauntedUi;
            if (ui == null)
            {
                ui = ScriptableObject.CreateInstance<Haunted.Game.HauntedUi>();
                ui.name = "Haunted menus";
                AssetDatabase.AddObjectToAsset(ui, renderer);
                renderer.rendererFeatures.Add(ui);
            }
            ui.shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/Shaders/HauntedUi.shader");
            EditorUtility.SetDirty(ui);
            // The rooms' glass (HauntedGlass) reads what is behind it from HauntedTransmission's
            // pictures; drawn before the bloom, as three draws transmission inside the scene.
            if (!renderer.rendererFeatures.Exists(f => f is Haunted.Game.HauntedTransmission))
            {
                var glass = ScriptableObject.CreateInstance<Haunted.Game.HauntedTransmission>();
                glass.name = "Haunted transmission";
                AssetDatabase.AddObjectToAsset(glass, renderer);
                renderer.rendererFeatures.Add(glass);
            }
            // High quality's ambient occlusion (HauntedAO), drawn before the bloom as in three.
            var ao = renderer.rendererFeatures.Find(f => f is Haunted.Game.HauntedAO) as Haunted.Game.HauntedAO;
            if (ao == null)
            {
                ao = ScriptableObject.CreateInstance<Haunted.Game.HauntedAO>();
                ao.name = "Haunted ambient occlusion";
                AssetDatabase.AddObjectToAsset(ao, renderer);
                renderer.rendererFeatures.Add(ao);
            }
            ao.shader = AssetDatabase.LoadAssetAtPath<Shader>("Assets/Shaders/HauntedAO.shader");
            // The torch in your hand, drawn over the world after the ambient occlusion (HauntedHeld):
            // URP's own drawing leaves its layer out, and the studio its metal reflects is never drawn.
            if (!renderer.rendererFeatures.Exists(f => f is Haunted.Game.HauntedHeld))
            {
                var held = ScriptableObject.CreateInstance<Haunted.Game.HauntedHeld>();
                held.name = "Haunted held torch";
                AssetDatabase.AddObjectToAsset(held, renderer);
                renderer.rendererFeatures.Add(held);
            }
            // Not the hand (HauntedHeld draws it); the studio it reflects is left to the cameras'
            // own masks, as its probe must see it.
            renderer.opaqueLayerMask = ~Haunted.Game.HauntedHeld.HeldMask;
            renderer.transparentLayerMask = ~Haunted.Game.HauntedHeld.HeldMask;
            // Low quality's 1K textures: the group HotelImport puts every texture over 1024 pixels in.
            // HauntedQuality sets how many sizes it skips at run time.
            if (!TextureMipmapLimitGroups.HasGroup(Haunted.Game.HauntedQuality.LargeTextures))
                TextureMipmapLimitGroups.CreateGroup(Haunted.Game.HauntedQuality.LargeTextures);
            // A feature made by CreateInstance starts switched off.
            foreach (var f in renderer.rendererFeatures)
            {
                f.SetActive(true);
                EditorUtility.SetDirty(f);
            }
            // Its copy of the opaque world at full size, as three's transmission target.
            var pipeline = new SerializedObject(AssetDatabase.LoadAssetAtPath<UniversalRenderPipelineAsset>(PipelinePath));
            pipeline.FindProperty("m_OpaqueDownsampling").intValue = (int)Downsampling.None;
            // Rendering layers on lights: the held torch is lit by its own bounce light alone, as the
            // browser's held scene (HeldTorch), never by the hotel's.
            pipeline.FindProperty("m_SupportsLightLayers").boolValue = true;
            pipeline.ApplyModifiedProperties();
            EditorUtility.SetDirty(renderer);
            AssetDatabase.SaveAssets();
            var data = new SerializedObject(renderer);
            var map = data.FindProperty("m_RendererFeatureMap");
            map.arraySize = renderer.rendererFeatures.Count;
            for (int i = 0; i < renderer.rendererFeatures.Count; i++)
            {
                AssetDatabase.TryGetGUIDAndLocalFileIdentifier(renderer.rendererFeatures[i], out string _, out long id);
                map.GetArrayElementAtIndex(i).longValue = id;
            }
            data.ApplyModifiedProperties();
            renderer.SetDirty();
        }

        [MenuItem("Haunted/Build for Windows")]
        /// <summary>Names the held torch's rendering layer (URP gives a light no layer the project hasn't named).</summary>
        static void NameRenderingLayers()
        {
            var tags = new SerializedObject(AssetDatabase.LoadAllAssetsAtPath("ProjectSettings/TagManager.asset")[0]);
            var layers = tags.FindProperty("m_RenderingLayers");
            int i = Haunted.Game.HauntedHeld.HeldRenderingLayer;
            while (layers.arraySize <= i) layers.InsertArrayElementAtIndex(layers.arraySize);
            layers.GetArrayElementAtIndex(i).stringValue = Haunted.Game.HauntedHeld.HeldRenderingLayerName;
            tags.ApplyModifiedPropertiesWithoutUndo();
        }

        public const string ReleasePath = "Build/Release/Haunted Lobby/Haunted Lobby.exe";

        /// <summary>
        /// Step F: the build players download. Its data is LZ4HC-compressed (smaller to download,
        /// unpacked as it loads), and Burst's debug folder, which Unity marks DoNotShip, is left out.
        /// tools/engine-release.ps1 zips it for itch.io.
        /// </summary>
        public static void BuildRelease()
        {
            BuildWindows(ReleasePath, BuildOptions.CompressWithLz4HC);
            foreach (var dir in System.IO.Directory.GetDirectories(System.IO.Path.GetDirectoryName(ReleasePath), "*_DoNotShip"))
                System.IO.Directory.Delete(dir, true);
        }

        public static void BuildWindows() => BuildWindows(BuildPath, BuildOptions.None);

        /// <summary>
        /// A build for the tests, apart from the one the owner plays (Build/Windows), so a test build
        /// never overwrites the game while it is open: -buildPath "E:/HauntedLobby/test/build/Haunted Lobby.exe".
        /// </summary>
        public static void BuildTest()
        {
            var args = System.Environment.GetCommandLineArgs();
            int i = System.Array.IndexOf(args, "-buildPath");
            if (i < 0 || i + 1 >= args.Length) throw new System.ArgumentException("BuildTest needs -buildPath <exe path>");
            BuildWindows(args[i + 1], BuildOptions.None);
        }

        static void BuildWindows(string path, BuildOptions flags)
        {
            Setup();
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = path,
                target = BuildTarget.StandaloneWindows64,
                options = flags,
            };
            var report = BuildPipeline.BuildPlayer(options);
            Debug.Log("Build " + report.summary.result + ": " + report.summary.totalSize / (1024 * 1024) + " MB, " + report.summary.totalErrors + " errors, " + report.summary.totalTime);
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded)
            {
                if (Application.isBatchMode) EditorApplication.Exit(1);
                throw new System.Exception("Build " + report.summary.result + " with " + report.summary.totalErrors + " errors");
            }
        }
    }
}
