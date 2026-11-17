using System;
using System.Collections.Generic;
using UnityEngine;
using UnityEngine.Experimental.Rendering;
using UnityEngine.Rendering;
using UnityEngine.Rendering.RenderGraphModule;
using UnityEngine.Rendering.Universal;

namespace Haunted.Game
{
    /// <summary>
    /// The browser's ambient occlusion on High (client/src/post.ts: three's GTAOPass), step D2 of
    /// docs/plans/engine-port.md. At half the picture's size: the scene's view-space normals and
    /// distances (three draws them with MeshNormalMaterial), three's GTAO over them, its Poisson
    /// denoise, then the picture times mix(1, occlusion, 0.6). After the see-through things and
    /// before the bloom, as three's composer. ProjectSetup adds this to the URP renderer.
    /// </summary>
    public class HauntedAO : ScriptableRendererFeature
    {
        // post.ts: looks only, so not game numbers (shared/config.ts holds those).
        public const float Radius = 0.35f;
        public const float Intensity = 0.6f;
        /// <summary>The occlusion's size as a share of the picture's width and height.</summary>
        public const float Scale = 0.5f;
        // three's GTAOShader and GTAOPass defaults, which post.ts leaves as they are.
        const float DistanceExponent = 1, Thickness = 1, DistanceFallOff = 1, AOScale = 1;
        const float LumaPhi = 10, DepthPhi = 2, NormalPhi = 3, DenoiseRadius = 8;
        const int DenoiseNoiseSize = 64;

        /// <summary>Test aid (-aoOnly): the picture is the occlusion alone.</summary>
        public static bool ShowOnly;
        /// <summary>Test aid (-noAO): High without the occlusion, to see what it changes.</summary>
        public static bool Off;

        public Shader shader;
        Pass pass;

        public override void Create()
        {
            if (shader == null) shader = Shader.Find("Hidden/Haunted/AO");
            if (shader == null) return;
            pass?.Dispose();
            pass = new Pass(shader);
        }

        public override void AddRenderPasses(ScriptableRenderer renderer, ref RenderingData renderingData)
        {
            if (pass == null || Off || !HauntedQuality.AmbientOcclusion) return;
            var type = renderingData.cameraData.cameraType;
            if (type == CameraType.Game || type == CameraType.SceneView) renderer.EnqueuePass(pass);
        }

        protected override void Dispose(bool disposing)
        {
            pass?.Dispose();
            pass = null;
        }

        class NormalsData
        {
            public RendererListHandle scene;
        }

        class BlitData
        {
            public TextureHandle source, normals;
            public Material material;
            public int pass;
        }

        class Pass : ScriptableRenderPass, IDisposable
        {
            const int NormalsPass = 0, GtaoPass = 1, DenoisePass = 2, BlendPass = 3, ShowPass = 4;
            static readonly int ProjectionId = Shader.PropertyToID("_AOProjection");
            static readonly int ResolutionId = Shader.PropertyToID("_AOResolution");
            static readonly int FarId = Shader.PropertyToID("_AOFar");
            static readonly int NormalsId = Shader.PropertyToID("_AONormals");
            static readonly int NoiseId = Shader.PropertyToID("_AONoise");
            static readonly List<ShaderTagId> Tags = new List<ShaderTagId>
            {
                new ShaderTagId("UniversalForward"), new ShaderTagId("UniversalForwardOnly"), new ShaderTagId("SRPDefaultUnlit"),
            };

            // One material per pass: a command buffer reads a material's values when it runs.
            readonly Material normals, gtao, denoise, blend;
            readonly Texture2D gtaoNoise, denoiseNoise;

            public Pass(Shader shader)
            {
                renderPassEvent = RenderPassEvent.AfterRenderingTransparents;
                requiresIntermediateTexture = true;
                normals = CoreUtils.CreateEngineMaterial(shader);
                gtao = CoreUtils.CreateEngineMaterial(shader);
                denoise = CoreUtils.CreateEngineMaterial(shader);
                blend = CoreUtils.CreateEngineMaterial(shader);
                gtaoNoise = MagicSquareNoise(5);
                denoiseNoise = RandomNoise(DenoiseNoiseSize);
                gtao.SetTexture(NoiseId, gtaoNoise);
                gtao.SetFloat("_AORadius", Radius);
                gtao.SetFloat("_AODistanceExponent", DistanceExponent);
                gtao.SetFloat("_AOThickness", Thickness);
                gtao.SetFloat("_AODistanceFallOff", DistanceFallOff);
                gtao.SetFloat("_AOScale", AOScale);
                denoise.SetTexture(NoiseId, denoiseNoise);
                denoise.SetFloat("_PDLumaPhi", LumaPhi);
                denoise.SetFloat("_PDDepthPhi", DepthPhi);
                denoise.SetFloat("_PDNormalPhi", NormalPhi);
                denoise.SetFloat("_PDRadius", DenoiseRadius);
                denoise.SetVector("_PDNoiseSize", new Vector4(DenoiseNoiseSize, DenoiseNoiseSize));
                blend.SetFloat("_AOIntensity", Intensity);
            }

            /// <summary>three's generateMagicSquareNoise(5): directions spread evenly, in a magic square's order.</summary>
            static Texture2D MagicSquareNoise(int size)
            {
                var square = MagicSquare(size);
                var tex = new Texture2D(size, size, TextureFormat.RGBA32, false, true) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Repeat, name = "GTAO noise" };
                var data = new Color32[square.Length];
                for (int i = 0; i < square.Length; i++)
                {
                    double angle = 2 * Math.PI * square[i] / square.Length;
                    // A Uint8Array keeps the whole part.
                    data[i] = new Color32((byte)((Math.Cos(angle) * 0.5 + 0.5) * 255), (byte)((Math.Sin(angle) * 0.5 + 0.5) * 255), 127, 255);
                }
                tex.SetPixels32(data);
                tex.Apply(false, true);
                return tex;
            }

            /// <summary>three's generateMagicSquare (the Siamese method).</summary>
            static int[] MagicSquare(int size)
            {
                int n = size % 2 == 0 ? size + 1 : size;
                var square = new int[n * n];
                int i = n / 2, j = n - 1;
                for (int num = 1; num <= n * n;)
                {
                    if (i == -1 && j == n)
                    {
                        j = n - 2;
                        i = 0;
                    }
                    else
                    {
                        if (j == n) j = 0;
                        if (i < 0) i = n - 1;
                    }
                    if (square[i * n + j] != 0)
                    {
                        j -= 2;
                        i++;
                        continue;
                    }
                    square[i * n + j] = num++;
                    j++;
                    i--;
                }
                return square;
            }

            /// <summary>The denoise's turn per pixel (three uses simplex noise with a random seed; only red is read).</summary>
            static Texture2D RandomNoise(int size)
            {
                var random = new System.Random(1);
                var tex = new Texture2D(size, size, TextureFormat.RGBA32, false, true) { filterMode = FilterMode.Point, wrapMode = TextureWrapMode.Repeat, name = "AO denoise noise" };
                var data = new Color32[size * size];
                for (int i = 0; i < data.Length; i++) data[i] = new Color32((byte)random.Next(256), (byte)random.Next(256), (byte)random.Next(256), (byte)random.Next(256));
                tex.SetPixels32(data);
                tex.Apply(false, true);
                return tex;
            }

            /// <summary>JavaScript's Math.round (halves go up), as the browser sizes its targets.</summary>
            static int Round(float v) => (int)Math.Floor(v + 0.5f);

            public override void RecordRenderGraph(RenderGraph graph, ContextContainer frameData)
            {
                var resources = frameData.Get<UniversalResourceData>();
                if (resources.isActiveTargetBackBuffer) return;
                var cameraData = frameData.Get<UniversalCameraData>();
                var rendering = frameData.Get<UniversalRenderingData>();
                var lights = frameData.Get<UniversalLightData>();
                var camera = cameraData.camera;
                var color = resources.activeColorTexture;
                var picture = graph.GetTextureDesc(color);
                int w = Math.Max(1, Round(picture.width * Scale)), h = Math.Max(1, Round(picture.height * Scale));
                float far = camera.farClipPlane;
                foreach (var m in new[] { gtao, denoise, blend })
                {
                    m.SetMatrix(ProjectionId, camera.projectionMatrix);
                    m.SetVector(ResolutionId, new Vector4(w, h));
                    m.SetFloat(FarId, far);
                }

                // The scene's normals and distances, every mesh drawn with the normals pass.
                var normalsDesc = new TextureDesc(w, h)
                {
                    colorFormat = GraphicsFormat.R32G32B32A32_SFloat,
                    filterMode = FilterMode.Point,
                    wrapMode = TextureWrapMode.Clamp,
                    clearBuffer = true,
                    clearColor = new Color(0, 0, 0, far),
                    name = "AO normals",
                };
                var normalsTex = graph.CreateTexture(normalsDesc);
                var depthDesc = new TextureDesc(w, h)
                {
                    depthBufferBits = DepthBits.Depth32,
                    clearBuffer = true,
                    name = "AO depth",
                };
                var depthTex = graph.CreateTexture(depthDesc);
                var drawing = RenderingUtils.CreateDrawingSettings(Tags, rendering, cameraData, lights, SortingCriteria.CommonOpaque);
                drawing.overrideMaterial = normals;
                drawing.overrideMaterialPassIndex = NormalsPass;
                var list = graph.CreateRendererList(new RendererListParams(rendering.cullResults, drawing, new FilteringSettings(RenderQueueRange.all)));
                using (var builder = graph.AddRasterRenderPass<NormalsData>("AO normals", out var data))
                {
                    data.scene = list;
                    builder.UseRendererList(list);
                    builder.SetRenderAttachment(normalsTex, 0);
                    builder.SetRenderAttachmentDepth(depthTex, AccessFlags.Write);
                    builder.SetRenderFunc((NormalsData d, RasterGraphContext context) => context.cmd.DrawRendererList(d.scene));
                }

                var aoDesc = new TextureDesc(w, h)
                {
                    colorFormat = GraphicsFormat.R16G16B16A16_SFloat,
                    filterMode = FilterMode.Bilinear,
                    wrapMode = TextureWrapMode.Clamp,
                    clearBuffer = true,
                    clearColor = Color.white,
                    name = "AO",
                };
                var aoTex = graph.CreateTexture(aoDesc);
                Blit(graph, "AO", normalsTex, normalsTex, aoTex, gtao, GtaoPass, false);
                aoDesc.name = "AO denoised";
                var denoisedTex = graph.CreateTexture(aoDesc);
                Blit(graph, "AO denoise", aoTex, normalsTex, denoisedTex, denoise, DenoisePass, false);
                Blit(graph, "AO blend", denoisedTex, normalsTex, color, blend, ShowOnly ? ShowPass : BlendPass, true);
            }

            static void Blit(RenderGraph graph, string name, TextureHandle from, TextureHandle normalsTex, TextureHandle to, Material material, int pass, bool keep)
            {
                using (var builder = graph.AddRasterRenderPass<BlitData>(name, out var data))
                {
                    data.source = from;
                    data.normals = normalsTex;
                    data.material = material;
                    data.pass = pass;
                    builder.UseTexture(from);
                    if (!normalsTex.Equals(from)) builder.UseTexture(normalsTex);
                    // The picture is multiplied in place, so what is there must be kept.
                    builder.SetRenderAttachment(to, 0, keep ? AccessFlags.ReadWrite : AccessFlags.Write);
                    builder.SetRenderFunc((BlitData d, RasterGraphContext context) =>
                    {
                        d.material.SetTexture(NormalsId, ((RTHandle)d.normals).rt);
                        Blitter.BlitTexture(context.cmd, d.source, new Vector4(1, 1, 0, 0), d.material, d.pass);
                    });
                }
            }

            public void Dispose()
            {
                CoreUtils.Destroy(normals);
                CoreUtils.Destroy(gtao);
                CoreUtils.Destroy(denoise);
                CoreUtils.Destroy(blend);
                CoreUtils.Destroy(gtaoNoise);
                CoreUtils.Destroy(denoiseNoise);
            }
        }
    }
}
