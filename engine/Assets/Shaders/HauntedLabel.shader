// A name over a player's head, as remotePlayers.ts draws it: a sprite that something nearer hides
// (three tests a sprite against the depth like anything else), fogged as the hotel is, drawn after
// the see-through things (renderOrder 10). Unity's own text shader draws over everything, so a name
// would show through walls. Takes a TextMesh's font picture (its alpha) and its colour (given as
// sRGB, as the browser's canvas is). Used by RemotePlayers.cs through Resources/Materials/Label.
Shader "Haunted/Label"
{
    Properties
    {
        _MainTex ("Font", 2D) = "white" {}
    }
    SubShader
    {
        Tags { "RenderPipeline" = "UniversalPipeline" "Queue" = "Transparent+10" "RenderType" = "Transparent" "IgnoreProjector" = "True" }
        Pass
        {
            Tags { "LightMode" = "UniversalForward" }
            Blend SrcAlpha OneMinusSrcAlpha
            ZWrite Off
            ZTest LEqual
            Cull Off

            HLSLPROGRAM
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile_fog
            #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
            #include "Packages/com.unity.render-pipelines.core/ShaderLibrary/Color.hlsl"

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
                output.color = float4(SRGBToLinear(input.color.rgb), input.color.a);
                output.uv = input.uv;
                output.fog = ComputeFogFactor(output.positionCS.z);
                return output;
            }

            float4 Frag(Varyings input) : SV_Target
            {
                float alpha = SAMPLE_TEXTURE2D(_MainTex, sampler_MainTex, input.uv).a * input.color.a;
                return float4(MixFog(input.color.rgb, input.fog), alpha);
            }
            ENDHLSL
        }
    }
}
