# Haunted Lobby's changes to URP 17.3.0

This is Unity's Universal Render Pipeline 17.3.0, copied from the package cache (without its
samples and tests) so the game can match the browser's three.js lighting (docs/plans/engine-port.md,
step D2). Every change is marked "Haunted Lobby" in the code. To move to a newer URP, copy the new
package here the same way and make these changes again.

1. **Light decay** (three.js `light.decay`).
   - `Runtime/HauntedLightDecay.cs` (new) holds each light's decay; the game sets the torch's (1.2) and the camera flash's (1.5).
   - `Runtime/UniversalRenderPipelineCore.cs` `InitializeLightConstants_Common` puts it in the y of each point or spot light's distance attenuation. URP's shaders never read that y.
   - `ShaderLibrary/RealtimeLights.hlsl` `DistanceAttenuation` uses it: `1 / max(d^decay, 0.01)`, the same as three. A decay of 2 keeps Unity's own `1 / d²`.
2. **Probe light on lightmapped surfaces** (three.js's envMap irradiance).
   - three lights a surface that has an envMap by that map at its blurriest, as well as by its lightmap. Unity's reflection probes only shine.
   - `ShaderLibrary/GlobalIllumination.hlsl` `HauntedProbeLight` adds the surface's probe, at its roughest mip, to the baked light of anything lightmapped. It is scaled by the global `_HauntedProbeDiffuse`.
   - Something that moves and is not lightmapped (a door) gets the same when its renderer is on rendering layer 7, as three's `lightMovable` gives it its room's envMap (`DressedRooms.LightMovable`).
   - The game sets that global to 1, and to 0 while the probes are taken (three's are blank then).
3. **Spot edge** (three.js's penumbra).
   - `ShaderLibrary/RealtimeLights.hlsl` `AngleAttenuation` returns `smoothstep` of URP's 0-to-1 edge, as three does between the outer and inner cone, instead of its square.
   - The torch sets its inner angle to three's `angle × (1 − penumbra)`.
4. **three.js's roughness** (`lights_physical_fragment`).
   - three never lets roughness go under 0.0525, and adds how fast the surface's own normal turns across the pixel (`geometryRoughness`), so small curved shiny things (bottles, knobs) shine more broadly and more dimly.
   - `ShaderLibrary/Lighting.hlsl` `HauntedThreeSmoothness` does the same to the smoothness at the top of `UniversalFragmentPBR`; `HauntedGeometryNormal` takes the normal before any normal map. The glass shader (`Assets/Resources/Shaders/HauntedGlass.shader`) uses it too.
5. **three.js's direct shine** (`BRDF_GGX`).
   - URP's direct light shines by its "minimalist" Cook-Torrance, which is twice three's GGX where you look along the light (the torch's case), so a lit glint bloomed far wider than in the browser.
   - `ShaderLibrary/BRDF.hlsl` `HauntedDirectSpecular` is three's: Schlick Fresnel (three's exp2 form, f90 1), height-correlated Smith visibility and the GGX distribution, times pi because Unity's lights are three's intensity over pi. `DirectBRDF` and `Lighting.hlsl` `LightingPhysicallyBased` use it. The clear coat and deferred paths are unchanged.
6. **three.js's diffuse colour.**
   - URP takes 4% off every metallic-workflow surface's diffuse colour (`OneMinusReflectivityMetallic`); three's is albedo × (1 − metalness).
   - `ShaderLibrary/BRDF.hlsl` `InitializeBRDFData` sets it so. Reflectivity is unchanged.
7. **Blackout** (three.js's `lightMapIntensity`).
   - `ShaderLibrary/GlobalIllumination.hlsl` `SampleLightmap` multiplies the baked lightmap by the global `_HauntedLamps`: the lamps' power, 1 lit, fading to 0 in the ghost's Blackout (`DressedRooms.Update`, as dressedRooms.ts). The game sets it to 1 at start.
8. **The night fill on lightmapped surfaces** (three.js's hemisphere light).
   - three adds game.ts's faint hemisphere fill (sky b8c0d0 over ground 202020) to every surface, lightmapped or not. URP gives lightmapped surfaces no ambient light, so with the torch off the dressed rooms' dark corners were 7 to 14% darker.
   - `ShaderLibrary/GlobalIllumination.hlsl` `SampleLightmap` adds `lerp(_HauntedFillGround, _HauntedFillSky, 0.5 n.y + 0.5)` to the lightmap, as three's `getHemisphereLightIrradiance`. The game sets both globals with the Trilight ambient (`Game.SetFill`), already divided by pi, and drops them in a blackout.
9. **three.js's fog curve** (`fog_fragment`).
   - three's linear `Fog` keeps `1 - smoothstep(near, far, depth)` of the colour, not Unity's straight line: at 2 m it keeps 99% where Unity kept 94%, at 5 m 86% against 76%.
   - `ShaderLibrary/ShaderVariablesFunctions.hlsl` `ComputeFogIntensity` (both versions) turns Unity's straight-line factor into three's smoothstep, per pixel, as three does; the depth it starts from interpolates exactly.
   - URP counts fog depth from the near plane, three from the eye, so `Game.SetUpLight` brings the fog's start and end 0.05 m (the camera's near plane) closer.
10. **three.js's direct diffuse** (`RE_Direct_Physical`, glTF's fresnel_mix).
   - three (0.186) takes off the direct diffuse what the shine reflects: `(1 - F)`, Schlick from the dielectric 0.04 to 1 at the half vector. With the torch beside the eye that is 4%, which before bloom made torch-lit surfaces 2 to 4% brighter in Unity and the glow round a close spot wider.
   - `ShaderLibrary/BRDF.hlsl` `HauntedDirectDiffuse`, used by `DirectBRDF` and `Lighting.hlsl` `LightingPhysicallyBased` when shine is on. Without shine (three's Lambert: GreyBox, Glow) the diffuse is whole, as three's Lambert.
   - three's like term on indirect light (the lightmaps) is left out: with the torch off the rooms already match.
