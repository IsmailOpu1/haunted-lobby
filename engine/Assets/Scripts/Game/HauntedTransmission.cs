using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace Haunted.Game
{
    /// <summary>
    /// What the rooms' glass sees through it, as three.js makes it (renderTransmissionPass): before
    /// the see-through things are drawn, the opaque world goes into a mipmapped half-float picture the
    /// size of the screen (no tone mapping); the glass's back faces are drawn into a copy of it; each
    /// is then made into mip levels, so rough glass can read a blurred picture. HauntedGlass reads
    /// them as _HauntedTransmissionOpaque (its back faces) and _HauntedTransmission (on screen).
    /// Step D2 of docs/plans/engine-port.md; ProjectSetup adds this to the URP renderer.
    /// </summary>
    public class HauntedTransmission : ScriptableRendererFeature
    {
        static readonly int OpaqueId = Shader.PropertyToID("_HauntedTransmissionOpaque");
        static readonly int BehindId = Shader.PropertyToID("_HauntedTransmission");
        static readonly ShaderTagId BackTag = new ShaderTagId("HauntedGlassBack");

        Pass pass;
        BlackPass black;

        public override void Create()
        {
            pass = new Pass();
            black = new BlackPass();
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            var type = renderingData.cameraData.cameraType;
            // Reflection probes and previews see glass over black, never another camera's picture.
            if (type == CameraType.Game || type == CameraType.SceneView) renderer.EnqueuePass(pass);
            else renderer.EnqueuePass(black);
        }

        class CopyData
        {
            public TextureHandle source;
        }

        class BackData
        {
            public TextureHandle source;
            public RendererListHandle glass;
        }

        class Pass : ScriptableRenderPass
        {
            public Pass()
            {
                renderPassEvent = RenderPassEvent.BeforeRenderingTransparents;
                // URP's copy of the opaque world (full size: ProjectSetup turns its downsampling off)
                // and its depth, which the back faces are kept in front of.
                ConfigureInput(ScriptableRenderPassInput.Color | ScriptableRenderPassInput.Depth);
            }

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                var opaque = resources.cameraOpaqueTexture;
                if (!opaque.IsValid()) return;
                var desc = graph.GetTextureDesc(opaque);
                desc.colorFormat = GraphicsFormat.R16G16B16A16_SFloat;
                desc.msaaSamples = MSAASamples.None;
                desc.depthBufferBits = DepthBits.None;
                desc.useMipMap = true;
                desc.autoGenerateMips = true;
                desc.filterMode = FilterMode.Trilinear;
                desc.wrapMode = TextureWrapMode.Clamp;
                desc.clearBuffer = false;

                desc.name = "Transmission opaque";
                var world = graph.CreateTexture(desc);
                using (var builder = graph.AddRasterRenderPass<CopyData>("Transmission opaque", out var data))
                {
                    data.source = opaque;
                    builder.UseTexture(opaque);
                    builder.SetRenderAttachment(world, 0);
                    builder.SetGlobalTextureAfterPass(world, OpaqueId);
                    builder.SetRenderFunc((CopyData d, RasterGraphContext context) =>
                        Blitter.BlitTexture(context.cmd, d.source, new Vector4(1, 1, 0, 0), 0, false));
                }

                desc.name = "Transmission";
                var behind = graph.CreateTexture(desc);
                var rendering = frameData.Get<UniversalRenderingData>();
                var camera = frameData.Get<UniversalCameraData>();
                var lights = frameData.Get<UniversalLightData>();
                var drawing = RenderingUtils.CreateDrawingSettings(BackTag, rendering, camera, lights, SortingCriteria.CommonTransparent);
                var filter = new FilteringSettings(RenderQueueRange.transparent);
                var list = graph.CreateRendererList(new RendererListParams(rendering.cullResults, drawing, filter));
                using (var builder = graph.AddRasterRenderPass<BackData>("Transmission back faces", out var data))
                {
                    data.source = world;
                    data.glass = list;
                    builder.UseTexture(world);
                    builder.UseRendererList(list);
                    // The opaque picture above and the scene depth, read as globals by the glass.
                    builder.UseAllGlobalTextures(true);
                    builder.SetRenderAttachment(behind, 0);
                    builder.SetGlobalTextureAfterPass(behind, BehindId);
                    builder.SetRenderFunc((BackData d, RasterGraphContext context) =>
                    {
                        Blitter.BlitTexture(context.cmd, d.source, new Vector4(1, 1, 0, 0), 0, false);
                        context.cmd.DrawRendererList(d.glass);
                    });
                }
            }
        }

        /// <summary>For cameras without the pictures: both globals black.</summary>
        class BlackPass : ScriptableRenderPass
        {
            RTHandle blackHandle;

            public BlackPass()
            {
                renderPassEvent = RenderPassEvent.BeforeRenderingTransparents;
            }

            class Data { }

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                blackHandle ??= RTHandles.Alloc(Texture2D.blackTexture);
                var tex = graph.ImportTexture(blackHandle);
                using (var builder = graph.AddUnsafePass<Data>("Transmission black", out _))
                {
                    builder.AllowPassCulling(false);
                    builder.UseTexture(tex);
                    builder.SetGlobalTextureAfterPass(tex, OpaqueId);
                    builder.SetGlobalTextureAfterPass(tex, BehindId);
                    builder.SetRenderFunc((Data d, UnsafeGraphContext context) => { });
                }
            }
        }
    }
}
