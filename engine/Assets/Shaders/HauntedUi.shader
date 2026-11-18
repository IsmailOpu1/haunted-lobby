// The menus over the finished picture, blended in sRGB as a browser blends its page over the
// canvas (HauntedUi.cs). _HauntedUi holds the menus drawn in gamma space, premultiplied.
Shader "Hidden/Haunted/Ui"
{
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" }
        ZWrite Off ZTest Always Cull Off Blend Off

        Pass
        {
            Name "Menus"
            HLSLPROGRAM
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/Runtime/Utilities/Blit.hlsl"
            #pragma vertex Vert
            #pragma fragment Frag

            TEXTURE2D(_HauntedUi);
            float _HauntedUiFlip;

            half4 Frag(Varyings i) : SV_Target
            {
                float3 picture = saturate(SAMPLE_TEXTURE2D_X(_BlitTexture, sampler_PointClamp, i.texcoord).rgb);
                float2 uv = i.texcoord;
                if (_HauntedUiFlip > 0.5) uv.y = 1 - uv.y;
                float4 ui = SAMPLE_TEXTURE2D(_HauntedUi, sampler_PointClamp, uv);
                float3 page = ui.rgb + LinearToSRGB(picture) * (1 - ui.a);
                return half4(SRGBToLinear(page), 1);
            }
            ENDHLSL
        }
    }
}
