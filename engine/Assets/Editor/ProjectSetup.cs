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

            AssetDatabase.SaveAssets();
            Debug.Log("Haunted setup done: URP, material, scene, player settings");
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

        [MenuItem("Haunted/Build for Windows")]
        public static void BuildWindows()
        {
            Setup();
            var options = new BuildPlayerOptions
            {
                scenes = new[] { ScenePath },
                locationPathName = BuildPath,
                target = BuildTarget.StandaloneWindows64,
                options = BuildOptions.None,
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
