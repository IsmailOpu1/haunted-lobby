// Words in the hotel (Shapes.Text: the roses' tags, the guest book, the piano's card, the clue
// cards), as the browser draws them: on a canvas texture with MeshBasicMaterial, so tested against
// the depth like anything else, fogged as the hotel is, and seen from the front only. Unity's own
// text shader draws over everything (its depth test is a global the GUI sets), so a tag showed
// through the upper floor, back to front (the owner's playtest). Takes the font's texture (its
// alpha is the letters) and the TextMesh's colour, an sRGB colour as three's.
// Used through Resources/Materials/WorldText.
Shader "Haunted/WorldText"
{
    Properties
    {
        _MainTex ("Font", 2D) = "white" {}
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "Queue" = "Transparent" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Tags { "LightMode" = "UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            ZTest LEqual
            Cull Back

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"

            TEXTURE2D(_MainTex);
            SAMPLER(sampler_MainTex);

            struct Attributes
            {
                float4 positionOS : POSITION;
                float4 color : COLOR;
                float2 uv : TEXCOORD0;
            };

            struct Varyings
            {
                float4 positionCS : SV_POSITION;
                float4 color : COLOR;
                float2 uv : TEXCOORD0;
                float fog : TEXCOORD1;
            };

            Varyings Vert(Attributes input)
            {
                Varyings output;
                output.positionCS = TransformObjectToHClip(input.positionOS.xyz);
                // A vertex colour is not converted for the linear colour space, as a material's is.
                output.color = float4(SRGBToLinear(input.color.rgb), input.color.a);
                output.uv = input.uv;
                output.fog = ComputeFogFactor(output.positionCS.z);
                return output;
            }

            float4 Frag(Varyings input) : SV_Target
            {
                float letters = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv).a;
                return float4(MixFog(input.color.rgb, input.fog), letters * input.color.a);
            }
            ENDHLSL
        }
    }
}
