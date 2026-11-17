// The finished picture, as the browser makes it (client/src/post.ts): three's UnrealBloomPass (only
// what is brighter than the threshold glows), AgX tone mapping, then film grain and a vignette. Run
// by HauntedPost.cs; pass 0 keeps the bright parts, pass 1 blurs one way, pass 2 puts it together.
Shader "Hidden/Haunted/Post"
{
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" }
        ZWrite Off ZTest Always Cull Off Blend Off

        HLSLINCLUDE
        #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
        #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"

        // three's luminance(): linear sRGB (Rec. 709) weights.
        static const float3 Luma = float3(0.2126, 0.7152, 0.0722);
        ENDHLSL

        Pass
        {
            Name "Bright"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            float _Threshold;
            float _SmoothWidth;
            float _HauntedBloomOnly;

            // three's LuminosityHighPassShader: black below the threshold, the colour above it.
            half4 Frag(Varyings i) : SV_Target
            {
                float3 c = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, i.texcoord).rgb;
                // Test aid (-bloomOnly 2): everything glows, to check the glow reaches the picture.
                if (_HauntedBloomOnly > 1.5) return float4(c, 1);
                float a = smoothstep(_Threshold, _Threshold + _SmoothWidth, dot(c, Luma));
                return float4(c * a, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "Blur"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            // One texel of the target, times the direction (x or y).
            float4 _Step;
            float _CenterWeight;
            float _Pairs;
            float _Offsets[11];
            float _Weights[11];

            // three's separable blur: Gaussian taps, two merged into each bilinear fetch.
            half4 Frag(Varyings i) : SV_Target
            {
                float3 sum = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, i.texcoord).rgb * _CenterWeight;
                for (int k = 0; k < 11; k++)
                {
                    if (k >= (int)_Pairs) break;
                    float2 o = _Step.xy * _Offsets[k];
                    sum += (SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, i.texcoord + o).rgb
                          + SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, i.texcoord - o).rgb) * _Weights[k];
                }
                return float4(sum, 1);
            }
            ENDHLSL
        }

        Pass
        {
            Name "Final"
            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            TEXTURE2D_X(_Bloom0);
            TEXTURE2D_X(_Bloom1);
            TEXTURE2D_X(_Bloom2);
            TEXTURE2D_X(_Bloom3);
            TEXTURE2D_X(_Bloom4);
            // Each blur level's share: 3 x strength x the factor bent by the radius (UnrealBloomPass).
            float _BloomFactors[5];
            float _Exposure;
            float _Grain;
            float _Darkness;
            float _Start;
            float _HauntedBloomOnly;

            // GLSL's mat3(c0, c1, c2) * v, written out (its vectors are columns).
            float3 Columns(float3 c0, float3 c1, float3 c2, float3 v) { return c0 * v.x + c1 * v.y + c2 * v.z; }

            float3 AgxContrast(float3 x)
            {
                float3 x2 = x * x;
                float3 x4 = x2 * x2;
                return 15.5 * x4 * x2 - 40.14 * x4 * x + 31.96 * x4 - 6.868 * x2 * x + 0.4298 * x2 + 0.1191 * x - 0.00232;
            }

            // three's AgXToneMapping (tonemapping_pars_fragment), the same numbers: linear sRGB in and out.
            float3 Agx(float3 color)
            {
                const float minEv = -12.47393;
                const float maxEv = 4.026069;
                color *= _Exposure;
                color = Columns(float3(0.6274, 0.0691, 0.0164), float3(0.3293, 0.9195, 0.0880), float3(0.0433, 0.0113, 0.8956), color);
                color = Columns(float3(0.856627153315983, 0.137318972929847, 0.11189821299995),
                                float3(0.0951212405381588, 0.761241990602591, 0.0767994186031903),
                                float3(0.0482516061458583, 0.101439036467562, 0.811302368396859), color);
                color = max(color, 1e-10);
                color = log2(color);
                color = saturate((color - minEv) / (maxEv - minEv));
                color = AgxContrast(color);
                color = Columns(float3(1.1271005818144368, -0.1413297634984383, -0.14132976349843826),
                                float3(-0.11060664309660323, 1.157823702216272, -0.11060664309660294),
                                float3(-0.016493938717834573, -0.016493938717834257, 1.2519364065950405), color);
                color = pow(max(0, color), 2.2);
                color = Columns(float3(1.6605, -0.1246, -0.0182), float3(-0.5876, 1.1329, -0.1006), float3(-0.0728, -0.0083, 1.1187), color);
                return saturate(color);
            }

            float Hash(float2 p)
            {
                p = frac(p * float2(443.897, 441.423));
                p += dot(p, p.yx + 19.19);
                return frac((p.x + p.y) * p.x);
            }

            half4 Frag(Varyings i) : SV_Target
            {
                float2 uv = i.texcoord;
                float3 c = SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_LinearClamp, uv).rgb;
                float3 bloom = _BloomFactors[0] * SAMPLE_TEXTURE2D_X(_Bloom0, sampler_LinearClamp, uv).rgb
                   + _BloomFactors[1] * SAMPLE_TEXTURE2D_X(_Bloom1, sampler_LinearClamp, uv).rgb
                   + _BloomFactors[2] * SAMPLE_TEXTURE2D_X(_Bloom2, sampler_LinearClamp, uv).rgb
                   + _BloomFactors[3] * SAMPLE_TEXTURE2D_X(_Bloom3, sampler_LinearClamp, uv).rgb
                   + _BloomFactors[4] * SAMPLE_TEXTURE2D_X(_Bloom4, sampler_LinearClamp, uv).rgb;
                // Test aid (Game's -bloomOnly): the glow by itself, plain.
                if (_HauntedBloomOnly > 0.5) return float4(saturate(bloom), 1);
                c = Agx(c + bloom);
                // The browser adds grain and the vignette to the finished (sRGB) picture.
                float3 s = LinearToSRGB(c);
                float n = Hash(i.positionCS.xy + frac(_Time.y) * 1000.0) - 0.5;
                s += n * _Grain * (1.0 - 0.6 * dot(s, Luma));
                float d = length(uv - 0.5) * 1.4142;
                s *= 1.0 - _Darkness * smoothstep(_Start, 1.0, d);
                return float4(SRGBToLinear(max(s, 0)), 1);
            }
            ENDHLSL
        }
    }
}
