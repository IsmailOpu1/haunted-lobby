// The rooms' glass as the browser draws it (three.js MeshPhysicalMaterial with transmission, no
// volume): its diffuse light is swapped, by its transmission, for what lies behind it, blurred by
// its roughness, tinted by its colour and dimmed by what its surface reflects; its shine stays on
// top. What lies behind is HauntedTransmission's picture (the opaque world, then the glass's own
// back faces), as three's transmission render target. Properties carry glTFast's names, so
// DressedRooms copies a room material's over as they are. Lit by URP's own light functions, so
// the patched URP (HAUNTED-PATCHES.md) lights glass as it lights the rest of the room.
Shader "Haunted/Glass"
{
    Properties
    {
        baseColorFactor ("Base colour (linear)", Vector) = (1, 1, 1, 1)
        baseColorTexture ("Base colour", 2D) = "white" {}
        baseColorTexture_texCoord ("Base colour UV", Float) = 0
        metallicFactor ("Metallic", Float) = 1
        roughnessFactor ("Roughness", Float) = 1
        metallicRoughnessTexture ("Metal (B) roughness (G)", 2D) = "white" {}
        metallicRoughnessTexture_texCoord ("Metal/roughness UV", Float) = 0
        normalTexture ("Normal map (plain RGB)", 2D) = "bump" {}
        normalTexture_scale ("Normal scale", Float) = 1
        normalTexture_texCoord ("Normal UV", Float) = 0
        emissiveFactor ("Emissive", Vector) = (0, 0, 0, 0)
        emissiveTexture ("Emissive map", 2D) = "white" {}
        emissiveTexture_texCoord ("Emissive UV", Float) = 0
        occlusionTexture ("Occlusion", 2D) = "white" {}
        occlusionTexture_strength ("Occlusion strength", Float) = 1
        occlusionTexture_texCoord ("Occlusion UV", Float) = 0
        transmissionFactor ("Transmission", Float) = 1
        transmissionTexture ("Transmission (R)", 2D) = "white" {}
        [Enum(UnityEngine.Rendering.BlendMode)] _SrcBlend ("Src blend", Float) = 1
        [Enum(UnityEngine.Rendering.BlendMode)] _DstBlend ("Dst blend", Float) = 0
        _ZWrite ("Write depth", Float) = 1
    }

    HLSLINCLUDE
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Core.hlsl"
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/Lighting.hlsl"
    #include "Packages/com.unity.render-pipelines.universal/ShaderLibrary/DeclareDepthTexture.hlsl"

    TEXTURE2D(baseColorTexture); SAMPLER(samplerbaseColorTexture);
    TEXTURE2D(metallicRoughnessTexture); SAMPLER(samplermetallicRoughnessTexture);
    TEXTURE2D(normalTexture); SAMPLER(samplernormalTexture);
    TEXTURE2D(emissiveTexture); SAMPLER(sampleremissiveTexture);
    TEXTURE2D(occlusionTexture); SAMPLER(samplerocclusionTexture);
    TEXTURE2D(transmissionTexture); SAMPLER(samplertransmissionTexture);
    // HauntedTransmission: the opaque world (back faces read this one), and that with the glass's
    // back faces drawn in (front faces read this one). Both mipmapped, as three's.
    TEXTURE2D(_HauntedTransmissionOpaque);
    TEXTURE2D(_HauntedTransmission);
    // sampler_LinearClamp comes from URP's Core.hlsl.
    // 1 on Low quality (HauntedQuality): plain glass, as the browser's.
    float _HauntedPlainGlass;

    CBUFFER_START(UnityPerMaterial)
    float4 baseColorFactor;
    float4 baseColorTexture_ST;
    float baseColorTexture_texCoord;
    float metallicFactor;
    float roughnessFactor;
    float4 metallicRoughnessTexture_ST;
    float metallicRoughnessTexture_texCoord;
    float4 normalTexture_ST;
    float normalTexture_scale;
    float normalTexture_texCoord;
    float4 emissiveFactor;
    float4 emissiveTexture_ST;
    float emissiveTexture_texCoord;
    float4 occlusionTexture_ST;
    float occlusionTexture_strength;
    float occlusionTexture_texCoord;
    float transmissionFactor;
    float4 transmissionTexture_ST;
    float _SrcBlend;
    float _DstBlend;
    float _ZWrite;
    CBUFFER_END

    struct Attributes
    {
        float4 positionOS : POSITION;
        float3 normalOS : NORMAL;
        float4 tangentOS : TANGENT;
        float2 uv0 : TEXCOORD0;
        float2 uv1 : TEXCOORD1;
        float4 color : COLOR;
        UNITY_VERTEX_INPUT_INSTANCE_ID
    };

    struct Varyings
    {
        float4 uv : TEXCOORD0; // xy: glTF TEXCOORD_0, zw: TEXCOORD_1
        float3 positionWS : TEXCOORD1;
        float3 normalWS : TEXCOORD2;
        float4 tangentWS : TEXCOORD3;
        float4 color : TEXCOORD4;
        half fogFactor : TEXCOORD5;
        DECLARE_LIGHTMAP_OR_SH(staticLightmapUV, vertexSH, 6);
        float4 positionCS : SV_POSITION;
        UNITY_VERTEX_INPUT_INSTANCE_ID
        UNITY_VERTEX_OUTPUT_STEREO
    };

    Varyings Vert(Attributes input)
    {
        Varyings output = (Varyings)0;
        UNITY_SETUP_INSTANCE_ID(input);
        UNITY_TRANSFER_INSTANCE_ID(input, output);
        UNITY_INITIALIZE_VERTEX_OUTPUT_STEREO(output);
        VertexPositionInputs position = GetVertexPositionInputs(input.positionOS.xyz);
        VertexNormalInputs normal = GetVertexNormalInputs(input.normalOS, input.tangentOS);
        output.positionCS = position.positionCS;
        output.positionWS = position.positionWS;
        output.normalWS = normal.normalWS;
        output.tangentWS = float4(normal.tangentWS, input.tangentOS.w * GetOddNegativeScale());
        output.uv = float4(input.uv0, input.uv1);
        output.color = input.color;
        output.fogFactor = ComputeFogFactor(position.positionCS.z);
        OUTPUT_LIGHTMAP_UV(input.uv1, unity_LightmapST, output.staticLightmapUV);
        OUTPUT_SH(output.normalWS, output.vertexSH);
        return output;
    }

    float2 UvOf(Varyings input, float texCoord, float4 st)
    {
        float2 uv = texCoord > 0.5 ? input.uv.zw : input.uv.xy;
        return uv * st.xy + st.zw;
    }

    // three's DFGApprox (bsdfs): the split-sum environment BRDF's scale (x) and bias (y).
    float2 DFGApprox(float3 normal, float3 viewDir, float roughness)
    {
        float dotNV = saturate(dot(normal, viewDir));
        const float4 c0 = float4(-1, -0.0275, -0.572, 0.022);
        const float4 c1 = float4(1, 0.0425, 1.04, -0.04);
        float4 r = roughness * c0 + c1;
        float a004 = min(r.x * r.x, exp2(-9.28 * dotNV)) * r.x + r.y;
        return float2(-1.04, 1.04) * a004 + r.zw;
    }

    // three's textureBicubic (transmission_pars_fragment): B-spline taps on two mip levels, mixed.
    float W0(float a) { return (1.0 / 6.0) * (a * (a * (-a + 3.0) - 3.0) + 1.0); }
    float W1(float a) { return (1.0 / 6.0) * (a * a * (3.0 * a - 6.0) + 4.0); }
    float W2(float a) { return (1.0 / 6.0) * (a * (a * (-3.0 * a + 3.0) + 3.0) + 1.0); }
    float W3(float a) { return (1.0 / 6.0) * (a * a * a); }
    float G0(float a) { return W0(a) + W1(a); }
    float G1(float a) { return W2(a) + W3(a); }
    float H0(float a) { return -1.0 + W1(a) / (W0(a) + W1(a)); }
    float H1(float a) { return 1.0 + W3(a) / (W2(a) + W3(a)); }

    float2 LevelSize(Texture2D tex, float lod)
    {
        uint w, h, levels;
        tex.GetDimensions((uint)lod, w, h, levels);
        return float2(w, h);
    }

    float4 Bicubic(Texture2D tex, float2 uv, float4 texelSize, float lod)
    {
        uv = uv * texelSize.zw + 0.5;
        float2 iuv = floor(uv);
        float2 fuv = frac(uv);
        float g0x = G0(fuv.x), g1x = G1(fuv.x), h0x = H0(fuv.x), h1x = H1(fuv.x);
        float h0y = H0(fuv.y), h1y = H1(fuv.y);
        float2 p0 = (float2(iuv.x + h0x, iuv.y + h0y) - 0.5) * texelSize.xy;
        float2 p1 = (float2(iuv.x + h1x, iuv.y + h0y) - 0.5) * texelSize.xy;
        float2 p2 = (float2(iuv.x + h0x, iuv.y + h1y) - 0.5) * texelSize.xy;
        float2 p3 = (float2(iuv.x + h1x, iuv.y + h1y) - 0.5) * texelSize.xy;
        return G0(fuv.y) * (g0x * SAMPLE_TEXTURE2D_LOD(tex, sampler_LinearClamp, p0, lod) + g1x * SAMPLE_TEXTURE2D_LOD(tex, sampler_LinearClamp, p1, lod))
             + G1(fuv.y) * (g0x * SAMPLE_TEXTURE2D_LOD(tex, sampler_LinearClamp, p2, lod) + g1x * SAMPLE_TEXTURE2D_LOD(tex, sampler_LinearClamp, p3, lod));
    }

    float4 TextureBicubic(Texture2D tex, float2 uv, float lod)
    {
        float2 fSize = LevelSize(tex, floor(lod));
        float2 cSize = LevelSize(tex, floor(lod) + 1);
        float4 f = Bicubic(tex, uv, float4(1.0 / fSize, fSize), floor(lod));
        float4 c = Bicubic(tex, uv, float4(1.0 / cSize, cSize), ceil(lod));
        return lerp(f, c, frac(lod));
    }

    // URP's UniversalFragmentPBR, kept apart into diffuse and specular: the glass swaps its diffuse.
    void GlassLight(InputData inputData, SurfaceData surfaceData, out half3 diffuse, out half3 specular)
    {
        BRDFData brdf;
        InitializeBRDFData(surfaceData, brdf);
        BRDFData shine = brdf;
        shine.diffuse = 0;
        BRDFData noCoat = (BRDFData)0;
        half4 shadowMask = CalculateShadowMask(inputData);
        AmbientOcclusionFactor ao = CreateAmbientOcclusionFactor(inputData, surfaceData);
        uint meshRenderingLayers = GetMeshRenderingLayer();
        Light mainLight = GetMainLight(inputData, shadowMask, ao);
        MixRealtimeAndBakedGI(mainLight, inputData.normalWS, inputData.bakedGI);

        half3 all = GlobalIllumination(brdf, noCoat, 0, inputData.bakedGI, ao.indirectAmbientOcclusion, inputData.positionWS,
            inputData.normalWS, inputData.viewDirectionWS, inputData.normalizedScreenSpaceUV);
        half3 spec = GlobalIllumination(shine, noCoat, 0, inputData.bakedGI, ao.indirectAmbientOcclusion, inputData.positionWS,
            inputData.normalWS, inputData.viewDirectionWS, inputData.normalizedScreenSpaceUV);
#ifdef _LIGHT_LAYERS
        if (IsMatchingLightLayer(mainLight.layerMask, meshRenderingLayers))
#endif
        {
            all += LightingPhysicallyBased(brdf, noCoat, mainLight, inputData.normalWS, inputData.viewDirectionWS, 0, false);
            spec += LightingPhysicallyBased(shine, noCoat, mainLight, inputData.normalWS, inputData.viewDirectionWS, 0, false);
        }
#if defined(_ADDITIONAL_LIGHTS)
        uint pixelLightCount = GetAdditionalLightsCount();
#if USE_CLUSTER_LIGHT_LOOP
        [loop] for (uint lightIndex = 0; lightIndex < min(URP_FP_DIRECTIONAL_LIGHTS_COUNT, MAX_VISIBLE_LIGHTS); lightIndex++)
        {
            CLUSTER_LIGHT_LOOP_SUBTRACTIVE_LIGHT_CHECK
            Light light = GetAdditionalLight(lightIndex, inputData, shadowMask, ao);
#ifdef _LIGHT_LAYERS
            if (IsMatchingLightLayer(light.layerMask, meshRenderingLayers))
#endif
            {
                all += LightingPhysicallyBased(brdf, noCoat, light, inputData.normalWS, inputData.viewDirectionWS, 0, false);
                spec += LightingPhysicallyBased(shine, noCoat, light, inputData.normalWS, inputData.viewDirectionWS, 0, false);
            }
        }
#endif
        LIGHT_LOOP_BEGIN(pixelLightCount)
            Light light = GetAdditionalLight(lightIndex, inputData, shadowMask, ao);
#ifdef _LIGHT_LAYERS
            if (IsMatchingLightLayer(light.layerMask, meshRenderingLayers))
#endif
            {
                all += LightingPhysicallyBased(brdf, noCoat, light, inputData.normalWS, inputData.viewDirectionWS, 0, false);
                spec += LightingPhysicallyBased(shine, noCoat, light, inputData.normalWS, inputData.viewDirectionWS, 0, false);
            }
        LIGHT_LOOP_END
#endif
        specular = spec;
        diffuse = all - spec;
    }

    half4 Glass(Varyings input, bool front, Texture2D behind)
    {
        UNITY_SETUP_INSTANCE_ID(input);
        float4 base = baseColorFactor * input.color
            * SAMPLE_TEXTURE2D(baseColorTexture, samplerbaseColorTexture, UvOf(input, baseColorTexture_texCoord, baseColorTexture_ST));
        float4 mr = SAMPLE_TEXTURE2D(metallicRoughnessTexture, samplermetallicRoughnessTexture, UvOf(input, metallicRoughnessTexture_texCoord, metallicRoughnessTexture_ST));
        float metal = saturate(metallicFactor * mr.b);
        float roughness = saturate(roughnessFactor * mr.g);

        // Normal maps come as plain RGB (HotelTextures): x and y from red and green, as glTF's.
        float2 nxy = (SAMPLE_TEXTURE2D(normalTexture, samplernormalTexture, UvOf(input, normalTexture_texCoord, normalTexture_ST)).rg * 2 - 1) * normalTexture_scale;
        float3 normalTS = float3(nxy, sqrt(saturate(1 - dot(nxy, nxy))));
        // Double-sided, as three's: a back face looks the other way.
        float faceSign = front ? 1 : -1;
        float3 geometryNormal = normalize(input.normalWS) * faceSign;
        float3 tangent = input.tangentWS.xyz * faceSign;
        float3 bitangent = input.tangentWS.w * cross(geometryNormal, tangent);
        float3 normalWS = normalize(mul(normalTS, float3x3(tangent, bitangent, geometryNormal)));

        // Low quality (dressedRooms.ts plainGlassShader): no picture behind; the glass part (not the
        // metal) darkened to 0.3 and see-through to 0.3, drawn by its alpha (DressedRooms).
        float plain = _HauntedPlainGlass > 0.5 ? transmissionFactor * (1 - metal) : 0;
        base.rgb *= lerp(1.0, 0.3, plain);
        base.a *= lerp(1.0, 0.3, plain);

        float occlusion = 1 + occlusionTexture_strength
            * (SAMPLE_TEXTURE2D(occlusionTexture, samplerocclusionTexture, UvOf(input, occlusionTexture_texCoord, occlusionTexture_ST)).r - 1);
        float3 emission = emissiveFactor.rgb
            * SAMPLE_TEXTURE2D(emissiveTexture, sampleremissiveTexture, UvOf(input, emissiveTexture_texCoord, emissiveTexture_ST)).rgb;

        SurfaceData surface = (SurfaceData)0;
        surface.albedo = base.rgb;
        surface.metallic = metal;
        // three's roughness, as the patched URP gives every lit surface (HauntedThreeSmoothness).
        surface.smoothness = HauntedThreeSmoothness(1 - roughness, geometryNormal);
        surface.normalTS = normalTS;
        surface.occlusion = occlusion;
        surface.alpha = base.a;

        InputData inputData = (InputData)0;
        inputData.positionWS = input.positionWS;
        inputData.positionCS = input.positionCS;
        inputData.normalWS = normalWS;
        inputData.viewDirectionWS = GetWorldSpaceNormalizeViewDir(input.positionWS);
        inputData.shadowCoord = float4(0, 0, 0, 0);
        inputData.fogCoord = InitializeInputDataFog(float4(input.positionWS, 1), input.fogFactor);
        inputData.normalizedScreenSpaceUV = GetNormalizedScreenSpaceUV(input.positionCS);
        inputData.bakedGI = SAMPLE_GI(input.staticLightmapUV, input.vertexSH, normalWS);
        inputData.shadowMask = SAMPLE_SHADOWMASK(input.staticLightmapUV);

        half3 diffuse, specular;
        GlassLight(inputData, surface, diffuse, specular);

        // three's transmission: roughness as its lights see it (with the geometry's own curve), the
        // picture behind at the same spot (no thickness, so no bend), blurred by mip level
        // log2(width) x roughness (ior 1.5), tinted by the diffuse colour, less what the surface
        // reflects (its environment BRDF, f90 1).
        float threeRoughness = 1 - surface.smoothness;
        float3 specularColor = lerp(0.04, base.rgb, metal);
        float2 fab = DFGApprox(normalWS, inputData.viewDirectionWS, threeRoughness);
        float3 reflected = specularColor * fab.x + fab.y;
        float lod = log2(LevelSize(behind, 0).x) * threeRoughness;
        float3 seen = TextureBicubic(behind, inputData.normalizedScreenSpaceUV, lod).rgb;
        float3 transmitted = (1 - reflected) * seen * base.rgb * (1 - metal);
        float t = _HauntedPlainGlass > 0.5 ? 0
            : transmissionFactor * SAMPLE_TEXTURE2D(transmissionTexture, samplertransmissionTexture, UvOf(input, 0, transmissionTexture_ST)).r;
        diffuse = lerp(diffuse, transmitted, t);

        half3 color = diffuse + specular + emission;
        color = MixFog(color, inputData.fogCoord);
        // Opaque glass (alphaMode OPAQUE) blends One Zero, so its alpha does nothing.
        return half4(color, base.a);
    }
    ENDHLSL

    SubShader
    {
        Tags { "RenderType" = "Transparent" "Queue" = "Transparent" "RenderPipeline" = "UniversalPipeline" }

        // Into HauntedTransmission's picture: the back faces of the glass, over the opaque world (as
        // three draws double-sided glass's back faces into its transmission target). No depth
        // buffer there: each is kept only where it is nearer than the opaque world.
        Pass
        {
            Name "GlassBackInto"
            Tags { "LightMode" = "HauntedGlassBack" }
            Cull Front
            ZWrite Off
            ZTest Always
            Blend One Zero

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BLENDING
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BOX_PROJECTION
            #pragma multi_compile_fragment _ _LIGHT_COOKIES
            #pragma multi_compile _ _LIGHT_LAYERS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile _ LIGHTMAP_ON
            #pragma multi_compile_fragment _ LIGHTMAP_BICUBIC_SAMPLING
            #pragma multi_compile_fog
            #pragma multi_compile_instancing

            half4 Frag(Varyings input, bool front : SV_IsFrontFace) : SV_Target
            {
                float2 uv = GetNormalizedScreenSpaceUV(input.positionCS);
                float world = SampleSceneDepth(uv);
#if UNITY_REVERSED_Z
                clip(input.positionCS.z - world);
#else
                clip(world - input.positionCS.z);
#endif
                half4 c = Glass(input, front, _HauntedTransmissionOpaque);
                return half4(c.rgb, 1);
            }
            ENDHLSL
        }

        // On screen, back faces first (three draws double-sided blended glass back then front; for
        // the rest the depth buffer keeps the nearer face either way).
        Pass
        {
            Name "GlassBack"
            Tags { "LightMode" = "SRPDefaultUnlit" }
            Cull Front
            ZWrite [_ZWrite]
            Blend [_SrcBlend] [_DstBlend]

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BLENDING
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BOX_PROJECTION
            #pragma multi_compile_fragment _ _LIGHT_COOKIES
            #pragma multi_compile _ _LIGHT_LAYERS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile _ LIGHTMAP_ON
            #pragma multi_compile_fragment _ LIGHTMAP_BICUBIC_SAMPLING
            #pragma multi_compile_fog
            #pragma multi_compile_instancing

            half4 Frag(Varyings input, bool front : SV_IsFrontFace) : SV_Target
            {
                return Glass(input, front, _HauntedTransmission);
            }
            ENDHLSL
        }

        Pass
        {
            Name "GlassFront"
            Tags { "LightMode" = "UniversalForward" }
            Cull Back
            ZWrite [_ZWrite]
            Blend [_SrcBlend] [_DstBlend]

            HLSLPROGRAM
            #pragma target 4.5
            #pragma vertex Vert
            #pragma fragment Frag
            #pragma multi_compile _ _ADDITIONAL_LIGHTS_VERTEX _ADDITIONAL_LIGHTS
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BLENDING
            #pragma multi_compile_fragment _ _REFLECTION_PROBE_BOX_PROJECTION
            #pragma multi_compile_fragment _ _LIGHT_COOKIES
            #pragma multi_compile _ _LIGHT_LAYERS
            #pragma multi_compile _ _CLUSTER_LIGHT_LOOP
            #pragma multi_compile _ LIGHTMAP_ON
            #pragma multi_compile_fragment _ LIGHTMAP_BICUBIC_SAMPLING
            #pragma multi_compile_fog
            #pragma multi_compile_instancing

            half4 Frag(Varyings input, bool front : SV_IsFrontFace) : SV_Target
            {
                return Glass(input, front, _HauntedTransmission);
            }
            ENDHLSL
        }
    }
}
