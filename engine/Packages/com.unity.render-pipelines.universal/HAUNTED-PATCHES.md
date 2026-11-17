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
   - The game sets that global to 1, and to 0 while the probes are taken (three's are blank then).
3. **Spot edge** (three.js's penumbra).
   - `ShaderLibrary/RealtimeLights.hlsl` `AngleAttenuation` returns `smoothstep` of URP's 0-to-1 edge, as three does between the outer and inner cone, instead of its square.
   - The torch sets its inner angle to three's `angle × (1 − penumbra)`.
