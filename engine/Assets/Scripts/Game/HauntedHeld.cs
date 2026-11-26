using UnityEngine;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace Haunted.Game
{
    /// <summary>
    /// The torch in your hand drawn in its own pass over the world, as post.ts draws heldFlashlight.ts's
    /// scene: after the world (and its ambient occlusion), before the bloom, against a depth of its
    /// own so it never sinks into a wall you stand against, through the browser's held camera (75°
    /// high whatever the view's own angle). Its pieces are on HeldLayer, which URP's own opaque and
    /// see-through drawing leaves out (ProjectSetup). Step D3 of docs/plans/engine-port.md.
    /// </summary>
    public class HauntedHeld : ScriptableRendererFeature
    {
        /// <summary>The Unity layer of the held torch and hand.</summary>
        public const int HeldLayer = 31;
        /// <summary>The Unity layer of the little studio the torch's metal reflects (HeldTorch).</summary>
        public const int StudioLayer = 30;
        /// <summary>
        /// The Unity layer of the names over players' heads (RemotePlayers). Drawn with the world, but
        /// left out of the occlusion's normals (HauntedAO): the name's quad would darken a box behind it.
        /// </summary>
        public const int LabelLayer = 29;
        /// <summary>game.ts HELD_FOV_DEG: the held camera's vertical angle.</summary>
        public const float HeldFovDeg = 75;
        /// <summary>game.ts: the held camera's near plane (m).</summary>
        const float HeldNearM = 0.05f;

        /// <summary>
        /// The rendering layer the held torch's pieces and its own lights share (the hotel's are on 0).
        /// ProjectSetup names it: URP drops light layers the project hasn't named.
        /// </summary>
        public const int HeldRenderingLayer = 1;
        public const string HeldRenderingLayerName = "Held torch";

        public static int HeldMask => 1 << HeldLayer;
        /// <summary>Everything a view of the world draws: not the hand (drawn here) nor the studio.</summary>
        public static int WorldMask => ~((1 << HeldLayer) | (1 << StudioLayer));

        /// <summary>Made on first use: Unity won't make shader tags while it loads the renderer's assets.</summary>
        static System.Collections.Generic.List<ShaderTagId> tags;

        Pass pass;

        public override void Create()
        {
            pass = new Pass();
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            var type = renderingData.cameraData.cameraType;
            if (type == CameraType.Game) renderer.EnqueuePass(pass);
        }

        class Data
        {
            public RendererListHandle opaque, clear;
            public Matrix4x4 view, held, own;
            public TextureHandle color;
        }

        class Pass : ScriptableRenderPass
        {
            public Pass()
            {
                // After HauntedAO (AfterRenderingTransparents), before HauntedPost's bloom.
                renderPassEvent = RenderPassEvent.AfterRenderingTransparents + 1;
            }

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                var rendering = frameData.Get<UniversalRenderingData>();
                var camera = frameData.Get<UniversalCameraData>();
                var lights = frameData.Get<UniversalLightData>();
                if ((camera.camera.cullingMask & HeldMask) == 0 || !resources.activeDepthTexture.IsValid()) return;
                tags ??= new System.Collections.Generic.List<ShaderTagId> { new ShaderTagId("UniversalForward"), new ShaderTagId("UniversalForwardOnly"), new ShaderTagId("SRPDefaultUnlit") };
                var opaque = graph.CreateRendererList(new RendererListParams(rendering.cullResults,
                    RenderingUtils.CreateDrawingSettings(tags, rendering, camera, lights, SortingCriteria.CommonOpaque),
                    new FilteringSettings(RenderQueueRange.opaque, HeldMask)));
                var clear = graph.CreateRendererList(new RendererListParams(rendering.cullResults,
                    RenderingUtils.CreateDrawingSettings(tags, rendering, camera, lights, SortingCriteria.CommonTransparent),
                    new FilteringSettings(RenderQueueRange.transparent, HeldMask)));
                // A depth of its own, cleared to far as Unity clears new pictures (the world's stays as it is).
                var depthDesc = graph.GetTextureDesc(resources.activeDepthTexture);
                depthDesc.name = "Held torch depth";
                depthDesc.clearBuffer = true;
                var depth = graph.CreateTexture(depthDesc);
                using (var builder = graph.AddRasterRenderPass<Data>("Held torch", out var data))
                {
                    data.opaque = opaque;
                    data.clear = clear;
                    // As URP's RenderObjects pass overrides the camera's angle; whether the picture is
                    // upside down is known only as the pass runs.
                    var cam = camera.camera;
                    data.view = camera.GetViewMatrix();
                    data.own = camera.GetProjectionMatrix();
                    data.held = Matrix4x4.Perspective(HeldFovDeg, cam.aspect, HeldNearM, cam.farClipPlane);
                    data.color = resources.activeColorTexture;
                    builder.UseRendererList(opaque);
                    builder.UseRendererList(clear);
                    builder.SetRenderAttachment(resources.activeColorTexture, 0);
                    builder.SetRenderAttachmentDepth(depth, AccessFlags.Write);
                    builder.AllowGlobalStateModification(true);
                    builder.AllowPassCulling(false);
                    builder.SetRenderFunc((Data d, RasterGraphContext context) =>
                    {
                        bool flipped = context.GetTextureUVOrigin(d.color) == TextureUVOrigin.BottomLeft;
                        RenderingUtils.SetViewAndProjectionMatrices(context.cmd, d.view, GL.GetGPUProjectionMatrix(d.held, flipped), false);
                        context.cmd.DrawRendererList(d.opaque);
                        context.cmd.DrawRendererList(d.clear);
                        RenderingUtils.SetViewAndProjectionMatrices(context.cmd, d.view, GL.GetGPUProjectionMatrix(d.own, flipped), false);
                    });
                }
            }
        }
    }
}
