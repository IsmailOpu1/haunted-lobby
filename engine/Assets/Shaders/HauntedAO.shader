// The browser's ambient occlusion on High (client/src/post.ts: three's GTAOPass, radius 0.35, mixed
// in at 0.6, worked out at half the screen's size): soft contact shadows where things meet. Run by
// HauntedAO.cs. Pass 0 draws the scene's view-space normals and distances (three's MeshNormalMaterial
// pass, normal maps ignored), pass 1 is three's GTAOShader, pass 2 its PoissonDenoiseShader, pass 3
// its GTAOBlendShader (multiplying the picture), pass 4 shows the occlusion alone (-aoOnly).
Shader "Hidden/Haunted/AO"
{
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" }

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

        // xyz: the view-space normal; w: the distance in front of the camera (_AOFar where nothing is).
        TEXTURE2D(_AONormals);
        TEXTURE2D(_AONoise);
        // sampler_PointClamp, sampler_PointRepeat and sampler_LinearClamp: core's GlobalSamplers.hlsl.
        // The camera's projection as three's (OpenGL convention), and the occlusion's size in pixels.
        float4x4 _AOProjection;
        float2 _AOResolution;
        float _AOFar;

        // three's getViewPosition, from a distance instead of a depth-buffer value.
        float3 ViewPosition(float2 uv, float distance)
        {
            float2 ndc = uv * 2 - 1;
            return float3((ndc.x + _AOProjection[0][2]) * distance / _AOProjection[0][0],
                          (ndc.y + _AOProjection[1][2]) * distance / _AOProjection[1][1],
                          -distance);
        }

        float4 NormalAndDistance(float2 uv)
        {
            return SAMPLE_TEXTURE2D_LOD(_AONormals, sampler_PointClamp, uv, 0);
        }

        bool Nothing(float distance)
        {
            return distance >= _AOFar * 0.999;
        }
        ENDHLSL

        Pass
        {
            Name "Normals"
            Cull Back
            ZWrite On
            ZTest LEqual

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_instancing

            struct Attributes
            {
                float4 positionOS : POSITION;
                float3 normalOS : NORMAL;
                UNITY_VERTEX_INPUT_INSTANCE_ID
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float3 normalVS : TEXCOORD0;
                float distance : TEXCOORD1;
            };

            Varyings Vert(Attributes input)
            {
                UNITY_SETUP_INSTANCE_ID(input);
                Varyings output;
                float3 positionWS = TransformObjectToWorld(input.positionOS.xyz);
                output.positionCS = TransformWorldToHClip(positionWS);
                // Unity's view space is OpenGL's, as three's: x right, y up, looking down -z.
                output.normalVS = TransformWorldToViewNormal(TransformObjectToWorldNormal(input.normalOS), false);
                output.distance = -TransformWorldToView(positionWS).z;
                return output;
            }

            float4 Frag(Varyings input) : SV_Target
            {
                return float4(normalize(input.normalVS), input.distance);
            }
            ENDHLSL
        }

        Pass
        {
            Name "GTAO"
            ZWrite Off ZTest Always Cull Off Blend Off

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #pragma vertex Vert
            #pragma fragment Frag
            float _AORadius;
            float _AODistanceExponent;
            float _AOThickness;
            float _AODistanceFallOff;
            float _AOScale;
            // three's SAMPLES 16: 3 directions of 6 steps each way.
            #define DIRECTIONS 3
            #define STEPS 6

            float3 SceneUvAndDistance(float3 viewPos)
            {
                float4 clip = mul(_AOProjection, float4(viewPos, 1));
                float2 uv = clip.xy / clip.w * 0.5 + 0.5;
                return float3(uv, NormalAndDistance(uv).w);
            }

            float4 Frag(Varyings input) : SV_Target
            {
                float2 uv = input.texcoord;
                float4 nd = NormalAndDistance(uv);
                if (Nothing(nd.w)) discard;
                float3 viewPos = ViewPosition(uv, nd.w);
                float3 viewNormal = nd.xyz;

                float radiusToUse = _AORadius;
                float2 noiseUv = uv * _AOResolution / 5.0;
                float4 noiseTexel = SAMPLE_TEXTURE2D_LOD(_AONoise, sampler_PointRepeat, noiseUv, 0);
                float3 randomVec = noiseTexel.xyz * 2.0 - 1.0;
                float3 tangent = normalize(float3(randomVec.xy, 0));
                float3 bitangent = float3(-tangent.y, tangent.x, 0);
                // GLSL's mat3(a, b, c) takes columns.
                float3x3 kernelMatrix = transpose(float3x3(tangent, bitangent, float3(0, 0, 1)));

                float ao = 0;
                for (int i = 0; i < DIRECTIONS; ++i)
                {
                    float angle = float(i) / float(DIRECTIONS) * PI;
                    float4 sampleDir = float4(cos(angle), sin(angle), 0, 0.5 + 0.5 * noiseTexel.w);
                    sampleDir.xyz = normalize(mul(kernelMatrix, sampleDir.xyz));

                    float3 viewDir = normalize(-viewPos);
                    float3 sliceBitangent = normalize(cross(sampleDir.xyz, viewDir));
                    float3 sliceTangent = cross(sliceBitangent, viewDir);
                    float3 normalInSlice = normalize(viewNormal - sliceBitangent * dot(viewNormal, sliceBitangent));
                    float3 tangentToNormalInSlice = cross(normalInSlice, sliceBitangent);
                    float2 cosHorizons = float2(dot(viewDir, tangentToNormalInSlice), dot(viewDir, -tangentToNormalInSlice));

                    for (int j = 0; j < STEPS; ++j)
                    {
                        float3 sampleViewOffset = sampleDir.xyz * radiusToUse * sampleDir.w * pow(float(j + 1) / float(STEPS), _AODistanceExponent);

                        float3 s = SceneUvAndDistance(viewPos + sampleViewOffset);
                        float3 viewDelta = ViewPosition(s.xy, s.z) - viewPos;
                        if (abs(viewDelta.z) < _AOThickness)
                        {
                            float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
                            cosHorizons.x += max(0, (sampleCosHorizon - cosHorizons.x) * lerp(1.0, 2.0 / float(j + 2), _AODistanceFallOff));
                        }

                        s = SceneUvAndDistance(viewPos - sampleViewOffset);
                        viewDelta = ViewPosition(s.xy, s.z) - viewPos;
                        if (abs(viewDelta.z) < _AOThickness)
                        {
                            float sampleCosHorizon = dot(viewDir, normalize(viewDelta));
                            cosHorizons.y += max(0, (sampleCosHorizon - cosHorizons.y) * lerp(1.0, 2.0 / float(j + 2), _AODistanceFallOff));
                        }
                    }

                    float2 sinHorizons = sqrt(1.0 - cosHorizons * cosHorizons);
                    float nx = dot(normalInSlice, sliceTangent);
                    float ny = dot(normalInSlice, viewDir);
                    float nxb = 0.5 * (acos(cosHorizons.y) - acos(cosHorizons.x) + sinHorizons.x * cosHorizons.x - sinHorizons.y * cosHorizons.y);
                    float nyb = 0.5 * (2.0 - cosHorizons.x * cosHorizons.x - cosHorizons.y * cosHorizons.y);
                    ao += nx * nxb + ny * nyb;
                }
                ao = saturate(ao / float(DIRECTIONS));
                ao = pow(ao, _AOScale);
                return float4(ao, ao, ao, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "Denoise"
            ZWrite Off ZTest Always Cull Off Blend Off

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #pragma vertex Vert
            #pragma fragment Frag
            float _PDLumaPhi;
            float _PDDepthPhi;
            float _PDNormalPhi;
            float _PDRadius;
            float2 _PDNoiseSize;
            // three's default disk: 16 samples on 2 rings, radius growing evenly (exponent 1).
            #define SAMPLES 16
            #define RINGS 2

            float Luma(float3 a) { return dot(float3(0.2125, 0.7154, 0.0721), a); }

            float4 Frag(Varyings input) : SV_Target
            {
                float2 uv = input.texcoord;
                float4 nd = NormalAndDistance(uv);
                if (Nothing(nd.w) || dot(nd.xyz, nd.xyz) == 0) discard;
                float3 viewNormal = nd.xyz;
                float3 center = SAMPLE_TEXTURE2D_LOD(_BlitTexture, sampler_LinearClamp, uv, 0).rgb;
                float3 viewPos = ViewPosition(uv, nd.w);

                float2 noiseUv = uv * _AOResolution / _PDNoiseSize;
                float noise = SAMPLE_TEXTURE2D_LOD(_AONoise, sampler_PointRepeat, noiseUv, 0).r;
                float2 noiseVec = float2(sin(noise * 2 * PI), cos(noise * 2 * PI));

                float totalWeight = 1;
                float3 denoised = center;
                for (int i = 0; i < SAMPLES; i++)
                {
                    float angle = 2 * PI * RINGS * i / SAMPLES;
                    float3 sampleDir = float3(cos(angle), sin(angle), i / float(SAMPLES - 1));
                    float2 d = sampleDir.xy * (1 + sampleDir.z * (_PDRadius - 1)) / _AOResolution;
                    // three's mat2(x, -y, x, y) (columns) times d.
                    float2 offset = float2(noiseVec.x * d.x + noiseVec.x * d.y, -noiseVec.y * d.x + noiseVec.y * d.y);
                    float2 sampleUv = uv + offset;

                    float3 neighbour = SAMPLE_TEXTURE2D_LOD(_BlitTexture, sampler_LinearClamp, sampleUv, 0).rgb;
                    float4 snd = NormalAndDistance(sampleUv);
                    float3 viewPosSample = ViewPosition(sampleUv, snd.w);
                    float normalSimilarity = pow(max(dot(viewNormal, snd.xyz), 0), _PDNormalPhi);
                    float lumaSimilarity = max(1 - abs(Luma(neighbour) - Luma(center)) / _PDLumaPhi, 0);
                    float depthSimilarity = max(1 - abs(dot(viewPos - viewPosSample, viewNormal)) / _PDDepthPhi, 0);
                    float w = lumaSimilarity * depthSimilarity * normalSimilarity;
                    denoised += w * neighbour;
                    totalWeight += w;
                }
                if (totalWeight > 0) denoised /= totalWeight;
                return float4(denoised, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "Blend"
            ZWrite Off ZTest Always Cull Off
            // The picture times the occlusion (three: DstColor, Zero).
            Blend DstColor Zero
            ColorMask RGB

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #pragma vertex Vert
            #pragma fragment Frag
            float _AOIntensity;

            float4 Frag(Varyings input) : SV_Target
            {
                float3 ao = SAMPLE_TEXTURE2D_LOD(_BlitTexture, sampler_LinearClamp, input.texcoord, 0).rgb;
                return float4(lerp(1.0, ao, _AOIntensity), 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "Show"
            ZWrite Off ZTest Always Cull Off Blend Off

            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #pragma vertex Vert
            #pragma fragment Frag

            float4 Frag(Varyings input) : SV_Target
            {
                float3 ao = SAMPLE_TEXTURE2D_LOD(_BlitTexture, sampler_LinearClamp, input.texcoord, 0).rgb;
                return float4(ao, 1);
            }
            ENDHLSL
        }
    }
}
