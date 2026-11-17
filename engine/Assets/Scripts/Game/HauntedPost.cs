using System;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace Haunted.Game
{
    /// <summary>
    /// The browser's finished picture in Unity (step D2 of docs/plans/engine-port.md): the same
    /// bloom (three's UnrealBloomPass: a bright pass at half size, five levels each blurred both ways
    /// at half the size of the last, summed back on), AgX tone mapping, film grain and a vignette,
    /// with client/src/post.ts's numbers. URP's own post effects stay off: it has no AgX and its bloom
    /// spreads differently. ProjectSetup adds this to the URP renderer.
    /// </summary>
    public class HauntedPost : ScriptableRendererFeature
    {
        // post.ts: looks only, so not game numbers (shared/config.ts holds those).
        public const float Exposure = 1.0f;
        public const float BloomThreshold = 2.5f;
        public const float BloomStrength = 0.55f;
        public const float BloomRadius = 0.45f;
        public const float Grain = 0.035f;
        public const float VignetteDarkness = 0.45f;
        public const float VignetteStart = 0.45f;

        public Shader shader;
        Pass pass;

        public override void Create()
        {
            if (shader == null) shader = Shader.Find("Hidden/Haunted/Post");
            if (shader == null) return;
            pass?.Dispose();
            pass = new Pass(shader);
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            if (pass == null) return;
            var type = renderingData.cameraData.cameraType;
            if (type == CameraType.Game || type == CameraType.SceneView) renderer.EnqueuePass(pass);
        }

        protected override void Dispose(bool disposing)
        {
            pass?.Dispose();
            pass = null;
        }

        class Pass : ScriptableRenderPass, IDisposable
        {
            const int Levels = 5;
            /// <summary>UnrealBloomPass: the blur kernel of each level, and each level's weight.</summary>
            static readonly int[] Kernels = { 6, 10, 14, 18, 22 };
            static readonly float[] Factors = { 1.0f, 0.8f, 0.6f, 0.4f, 0.2f };
            const float SmoothWidth = 0.01f;
            const int MaxPairs = 11;
            const int BrightPass = 0, BlurPass = 1, FinalPass = 2;

            static readonly int StepId = Shader.PropertyToID("_Step");
            static readonly int[] BloomIds =
            {
                Shader.PropertyToID("_Bloom0"), Shader.PropertyToID("_Bloom1"), Shader.PropertyToID("_Bloom2"),
                Shader.PropertyToID("_Bloom3"), Shader.PropertyToID("_Bloom4"),
            };

            readonly Material bright, final;
            readonly Material[] across = new Material[Levels], down = new Material[Levels];

            class DrawData
            {
                public TextureHandle source;
                public Material material;
                public int pass;
                public readonly TextureHandle[] levels = new TextureHandle[Levels];
            }

            public Pass(Shader shader)
            {
                renderPassEvent = RenderPassEvent.BeforeRenderingPostProcessing;
                // Work on the HDR picture, never straight on the screen.
                requiresIntermediateTexture = true;
                bright = CoreUtils.CreateEngineMaterial(shader);
                bright.SetFloat("_Threshold", BloomThreshold);
                bright.SetFloat("_SmoothWidth", SmoothWidth);
                for (int i = 0; i < Levels; i++)
                {
                    across[i] = Blur(shader, Kernels[i]);
                    down[i] = Blur(shader, Kernels[i]);
                }
                final = CoreUtils.CreateEngineMaterial(shader);
                var shares = new float[Levels];
                for (int i = 0; i < Levels; i++) shares[i] = 3f * BloomStrength * Mathf.Lerp(Factors[i], 1.2f - Factors[i], BloomRadius);
                final.SetFloatArray("_BloomFactors", shares);
                final.SetFloat("_Exposure", Exposure);
                final.SetFloat("_Grain", Grain);
                final.SetFloat("_Darkness", VignetteDarkness);
                final.SetFloat("_Start", VignetteStart);
            }

            /// <summary>UnrealBloomPass._getSeparableBlurMaterial: Gaussian weights, taps merged in pairs.</summary>
            static Material Blur(Shader shader, int kernel)
            {
                var m = CoreUtils.CreateEngineMaterial(shader);
                float sigma = kernel / 3f;
                var c = new float[kernel];
                for (int i = 0; i < kernel; i++) c[i] = 0.39894f * Mathf.Exp(-0.5f * i * i / (sigma * sigma)) / sigma;
                var offsets = new float[MaxPairs];
                var weights = new float[MaxPairs];
                int pairs = 0;
                for (int i = 1; i < kernel; i += 2)
                {
                    float wa = c[i], wb = i + 1 < kernel ? c[i + 1] : 0;
                    float w = wa + wb;
                    offsets[pairs] = (i * wa + (i + 1) * wb) / w;
                    weights[pairs] = w;
                    pairs++;
                }
                m.SetFloat("_CenterWeight", c[0]);
                m.SetFloat("_Pairs", pairs);
                m.SetFloatArray("_Offsets", offsets);
                m.SetFloatArray("_Weights", weights);
                return m;
            }

            /// <summary>JavaScript's Math.round (halves go up), as the browser sizes its levels.</summary>
            static int Round(float v) => (int)Math.Floor(v + 0.5f);

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                if (resources.isActiveTargetBackBuffer) return;
                var source = resources.activeColorTexture;
                var picture = graph.GetTextureDesc(source);
                picture.msaaSamples = MSAASamples.None;
                picture.depthBufferBits = DepthBits.None;
                picture.clearBuffer = false;

                var level = picture;
                level.colorFormat = GraphicsFormat.R16G16B16A16_SFloat;
                level.filterMode = FilterMode.Bilinear;
                level.wrapMode = TextureWrapMode.Clamp;
                int w = Round(picture.width / 2f), h = Round(picture.height / 2f);
                level.width = w;
                level.height = h;
                level.name = "Bloom bright";
                var input = graph.CreateTexture(level);
                Draw(graph, "Bloom bright", source, input, bright, BrightPass);

                var levels = new TextureHandle[Levels];
                for (int i = 0; i < Levels; i++)
                {
                    level.width = w;
                    level.height = h;
                    across[i].SetVector(StepId, new Vector4(1f / w, 0));
                    down[i].SetVector(StepId, new Vector4(0, 1f / h));
                    level.name = "Bloom across " + i;
                    var a = graph.CreateTexture(level);
                    Draw(graph, level.name, input, a, across[i], BlurPass);
                    level.name = "Bloom down " + i;
                    var d = graph.CreateTexture(level);
                    Draw(graph, level.name, a, d, down[i], BlurPass);
                    levels[i] = input = d;
                    w = Math.Max(1, Round(w / 2f));
                    h = Math.Max(1, Round(h / 2f));
                }

                picture.name = "Haunted post";
                var result = graph.CreateTexture(picture);
                using (var builder = graph.AddRasterRenderPass<DrawData>("Haunted post", out var data))
                {
                    data.source = source;
                    data.material = final;
                    data.pass = FinalPass;
                    builder.UseTexture(source);
                    for (int i = 0; i < Levels; i++)
                    {
                        data.levels[i] = levels[i];
                        builder.UseTexture(levels[i]);
                    }
                    builder.SetRenderAttachment(result, 0);
                    builder.SetRenderFunc((DrawData d, RasterGraphContext context) =>
                    {
                        for (int i = 0; i < Levels; i++) d.material.SetTexture(BloomIds[i], ((RTHandle)d.levels[i]).rt);
                        Blitter.BlitTexture(context.cmd, d.source, new Vector4(1, 1, 0, 0), d.material, d.pass);
                    });
                }
                resources.cameraColor = result;
            }

            static void Draw(RenderGraph graph, string name, TextureHandle from, TextureHandle to, Material material, int pass)
            {
                using (var builder = graph.AddRasterRenderPass<DrawData>(name, out var data))
                {
                    data.source = from;
                    data.material = material;
                    data.pass = pass;
                    builder.UseTexture(from);
                    builder.SetRenderAttachment(to, 0);
                    builder.SetRenderFunc((DrawData d, RasterGraphContext context) =>
                        Blitter.BlitTexture(context.cmd, d.source, new Vector4(1, 1, 0, 0), d.material, d.pass));
                }
            }

            public void Dispose()
            {
                CoreUtils.Destroy(bright);
                CoreUtils.Destroy(final);
                for (int i = 0; i < Levels; i++)
                {
                    CoreUtils.Destroy(across[i]);
                    CoreUtils.Destroy(down[i]);
                }
            }
        }
    }
}
