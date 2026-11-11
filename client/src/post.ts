import * as THREE from "three";
import { EffectComposer } from "three/examples/jsm/postprocessing/EffectComposer.js";
import { RenderPass } from "three/examples/jsm/postprocessing/RenderPass.js";
import { UnrealBloomPass } from "three/examples/jsm/postprocessing/UnrealBloomPass.js";
import { OutputPass } from "three/examples/jsm/postprocessing/OutputPass.js";
import { ShaderPass } from "three/examples/jsm/postprocessing/ShaderPass.js";
import { SMAAPass } from "three/examples/jsm/postprocessing/SMAAPass.js";
import { GTAOPass } from "three/examples/jsm/postprocessing/GTAOPass.js";

/** High: full resolution (up to 1.5x on sharp screens) and ambient occlusion. Low: 720p, no AO. */
export type QualityLevel = "high" | "low";

// The finished picture (Phase 8 plan, 4.5): filmic tone mapping, a soft glow around lamps and
// bulbs, then edge smoothing, film grain and a vignette. Looks only, so these are not game
// numbers (shared/config.ts holds those).

/** Filmic tone mapping keeps the bright cores of lamps from clipping to flat white. */
const TONE_MAPPING = THREE.AgXToneMapping;
const EXPOSURE = 1.0;
/** Only things brighter than this glow (lamp bulbs and flames, not lit walls). */
// 2.5: only lamps, bulbs and flames glow; at 1.0 any wall the torch lit bloomed into a haze (owner, 2026-11-10).
const BLOOM_THRESHOLD = 2.5;
const BLOOM_STRENGTH = 0.55;
const BLOOM_RADIUS = 0.45;
/** Film grain, as a share of full brightness; stronger in the dark, like real film. */
const GRAIN = 0.035;
/** How dark the corners get (0 is none) and how far out from the middle the darkening starts. */
const VIGNETTE_DARKNESS = 0.45;
const VIGNETTE_START = 0.45;
/**
 * Ambient occlusion (High only): soft contact shadows where things meet, which matters most for
 * what moves (the lamps' shadows are already baked).
 */
const AO_RADIUS_M = 0.35;
const AO_INTENSITY = 0.6;
/**
 * The occlusion is worked out at this fraction of the screen's width and height and then blurred
 * up: it is soft anyway, and at full size it cost about half of a High frame (2026-11-11).
 */
const AO_SCALE = 0.5;
const HIGH_MAX_PIXEL_RATIO = 1.5;
/** Low renders this many lines high and scales up. */
const LOW_LINES = 720;

const GrainVignetteShader = {
  name: "GrainVignetteShader",
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    time: { value: 0 },
    grain: { value: GRAIN },
    darkness: { value: VIGNETTE_DARKNESS },
    start: { value: VIGNETTE_START },
  },
  vertexShader: /* glsl */ `
    varying vec2 vUv;
    void main() {
      vUv = uv;
      gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    }`,
  fragmentShader: /* glsl */ `
    uniform sampler2D tDiffuse;
    uniform float time;
    uniform float grain;
    uniform float darkness;
    uniform float start;
    varying vec2 vUv;
    float hash(vec2 p) {
      p = fract(p * vec2(443.897, 441.423));
      p += dot(p, p.yx + 19.19);
      return fract((p.x + p.y) * p.x);
    }
    void main() {
      vec4 c = texture2D(tDiffuse, vUv);
      float luma = dot(c.rgb, vec3(0.2126, 0.7152, 0.0722));
      float n = hash(gl_FragCoord.xy + fract(time) * 1000.0) - 0.5;
      c.rgb += n * grain * (1.0 - 0.6 * luma);
      float d = length(vUv - 0.5) * 1.4142;
      c.rgb *= 1.0 - darkness * smoothstep(start, 1.0, d);
      gl_FragColor = vec4(max(c.rgb, 0.0), c.a);
    }`,
};

export class PostProcessing {
  private composer: EffectComposer;
  private grain: ShaderPass;
  private ao: GTAOPass;
  private level: QualityLevel = "high";

  /**
   * `overlay` is drawn over the world with its own depth: what you hold, so it never sinks into a
   * wall. It is seen through `overlayCamera` (its own fixed lens), or the world's camera if none.
   */
  constructor(
    private renderer: THREE.WebGLRenderer,
    scene: THREE.Scene,
    camera: THREE.Camera,
    overlay?: THREE.Scene,
    overlayCamera: THREE.Camera = camera,
  ) {
    renderer.toneMapping = TONE_MAPPING;
    renderer.toneMappingExposure = EXPOSURE;
    // Render in high precision so the darks don't band and the bloom sees true brightness.
    const target = new THREE.WebGLRenderTarget(1, 1, { type: THREE.HalfFloatType });
    this.composer = new EffectComposer(renderer, target);
    this.composer.addPass(new RenderPass(scene, camera));
    this.ao = new GTAOPass(scene, camera, 1, 1);
    this.ao.blendIntensity = AO_INTENSITY;
    this.ao.updateGtaoMaterial({ radius: AO_RADIUS_M });
    const fullSize = this.ao.setSize.bind(this.ao);
    this.ao.setSize = (w: number, h: number) => fullSize(Math.max(1, Math.round(w * AO_SCALE)), Math.max(1, Math.round(h * AO_SCALE)));
    this.composer.addPass(this.ao);
    if (overlay) {
      const held = new RenderPass(overlay, overlayCamera);
      held.clear = false;
      held.clearDepth = true;
      this.composer.addPass(held);
    }
    this.composer.addPass(new UnrealBloomPass(new THREE.Vector2(1, 1), BLOOM_STRENGTH, BLOOM_RADIUS, BLOOM_THRESHOLD));
    this.composer.addPass(new OutputPass()); // tone mapping and sRGB
    this.composer.addPass(new SMAAPass());
    this.grain = new ShaderPass(GrainVignetteShader);
    this.composer.addPass(this.grain);
  }

  setQuality(level: QualityLevel) {
    this.level = level;
    this.ao.enabled = level === "high";
  }

  /** Sets the renderer's resolution for the quality level, then sizes every pass to match. */
  setSize(w: number, h: number) {
    const ratio = this.level === "high" ? Math.min(window.devicePixelRatio, HIGH_MAX_PIXEL_RATIO) : Math.min(1, LOW_LINES / h);
    this.renderer.setPixelRatio(ratio);
    this.renderer.setSize(w, h, false);
    this.composer.setPixelRatio(ratio);
    this.composer.setSize(w, h);
  }

  render(seconds: number) {
    this.grain.uniforms.time!.value = seconds;
    this.renderer.info.reset(); // counted over every pass of the frame (the FPS counter)
    this.composer.render();
  }
}
