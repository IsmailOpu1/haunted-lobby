using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace Haunted.Game
{
    /// <summary>
    /// The menus over the picture, blended as a browser blends a page over its canvas (step E).
    /// Unity blends UI in linear light, which draws light text on the dark menus heavier than Chrome
    /// and the film grain brighter; so the menus are drawn into a texture in gamma space (Menus.cs,
    /// PanelSettings.forceGammaRendering), and this pass lays that texture over the finished picture
    /// in sRGB: picture to sRGB, the menus over it (premultiplied), back to linear for Unity's output.
    /// ProjectSetup adds it to the URP renderer, after HauntedPost.
    /// </summary>
    public class HauntedUi : ScriptableRendererFeature
    {
        /// <summary>The menus' texture (premultiplied, gamma), or null when no menu is up.</summary>
        public static RenderTexture Texture;

        public Shader shader;
        Pass pass;

        public override void Create()
        {
            if (shader == null) shader = Shader.Find("Hidden/Haunted/Ui");
            if (shader == null) return;
            pass?.Dispose();
            pass = new Pass(shader);
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            if (pass == null || Texture == null) return;
            if (renderingData.cameraData.cameraType == CameraType.Game) renderer.EnqueuePass(pass);
        }

        protected override void Dispose(bool disposing)
        {
            pass?.Dispose();
            pass = null;
        }

        class Pass : ScriptableRenderPass
        {
            static readonly int UiId = Shader.PropertyToID("_HauntedUi");
            readonly Material material;

            class DrawData
            {
                public TextureHandle source;
                public Material material;
            }

            public Pass(Shader shader)
            {
                renderPassEvent = RenderPassEvent.AfterRenderingPostProcessing;
                requiresIntermediateTexture = true;
                material = CoreUtils.CreateEngineMaterial(shader);
            }

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                if (resources.isActiveTargetBackBuffer || Texture == null) return;
                var source = resources.activeColorTexture;
                var desc = graph.GetTextureDesc(source);
                desc.msaaSamples = MSAASamples.None;
                desc.depthBufferBits = DepthBits.None;
                desc.clearBuffer = false;
                desc.name = "Haunted menus";
                var result = graph.CreateTexture(desc);
                using (var builder = graph.AddRasterRenderPass<DrawData>("Haunted menus", out var data))
                {
                    data.source = source;
                    data.material = material;
                    builder.UseTexture(source);
                    builder.SetRenderAttachment(result, 0);
                    builder.AllowGlobalStateModification(true);
                    builder.SetRenderFunc((DrawData d, RasterGraphContext context) =>
                    {
                        d.material.SetTexture(UiId, Texture);
                        Blitter.BlitTexture(context.cmd, d.source, new Vector4(1, 1, 0, 0), d.material, 0);
                    });
                }
                resources.cameraColor = result;
            }

            public void Dispose() => CoreUtils.Destroy(material);
        }
    }
}
