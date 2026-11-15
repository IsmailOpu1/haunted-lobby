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
            PlayerSettings.SetScriptingBackend(UnityEditor.Build.NamedBuildTarget.Standalone, ScriptingImplementation.IL2CPP);

            AssetDatabase.SaveAssets();
            Debug.Log("Haunted setup done: URP, material, scene, player settings");
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
            if (report.summary.result != UnityEditor.Build.Reporting.BuildResult.Succeeded) EditorApplication.Exit(1);
        }
    }
}
