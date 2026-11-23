import { Effect, EffectAttribute } from "postprocessing";
import { Uniform, Vector2 } from "three";

/**
 * evidence board cursor: a magnifying glass that enlarges the finished frame under it with barrel
 * falloff, a bit of colour fringe at the rim, brass ring and handle. its own EffectPass at the end
 * of the stack so it magnifies the graded image
 */
export class MagnifierEffect extends Effect {
  constructor() {
    super(
      "MagnifierEffect",
      /* glsl */ `
      uniform vec2 center;
      uniform float radius;
      uniform float zoom;
      uniform float strength;
      uniform float aspect;

      float capsule(vec2 p, vec2 a, vec2 b, float r) {
        vec2 pa = p - a, ba = b - a;
        float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
        return length(pa - ba * h) - r;
      }

      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        outputColor = inputColor;
        if (strength <= 0.001) return;
        vec2 d = uv - center;
        d.x *= aspect;
        float r = length(d);
        vec3 col = inputColor.rgb;
        if (r < radius) {
          float k = r / radius;
          // strongest in the middle, easing to 1x at the rim (thick lens)
          float z = mix(zoom, 1.0, pow(k, 3.0));
          vec2 off = (uv - center) / z;
          float fringe = smoothstep(0.6, 1.0, k) * 0.012;
          col = vec3(
            texture2D(inputBuffer, center + off * (1.0 + fringe)).r,
            texture2D(inputBuffer, center + off).g,
            texture2D(inputBuffer, center + off * (1.0 - fringe)).b
          );
          // glass: soft highlight up-left, a bit darker towards the rim
          vec2 n = d / radius;
          col *= mix(1.0, 0.82, pow(k, 6.0));
          col += vec3(0.07) * smoothstep(0.55, 0.0, length(n - vec2(-0.35, 0.35)));
        }
        // brass ring + wooden handle down to the right
        float ring = smoothstep(radius - 0.004, radius - 0.001, r) * (1.0 - smoothstep(radius + 0.006, radius + 0.009, r));
        vec3 brass = mix(vec3(0.24, 0.17, 0.08), vec3(0.62, 0.48, 0.24), smoothstep(-0.5, 0.8, dot(normalize(d + 1e-6), vec2(-0.6, 0.8))));
        col = mix(col, brass, ring);
        vec2 dir = normalize(vec2(0.62, -0.78));
        float handle = capsule(d, dir * (radius + 0.008), dir * (radius + 0.13), 0.011);
        float h = 1.0 - smoothstep(-0.0015, 0.0015, handle);
        vec3 wood = mix(vec3(0.07, 0.035, 0.02), vec3(0.2, 0.11, 0.06), smoothstep(0.011, -0.011, handle));
        col = mix(col, wood, h);
        outputColor = vec4(mix(inputColor.rgb, col, strength), inputColor.a);
      }`,
      {
        attributes: EffectAttribute.CONVOLUTION,
        uniforms: new Map<string, Uniform>([
          ["center", new Uniform(new Vector2(0.5, 0.5))],
          ["radius", new Uniform(0.11)],
          ["zoom", new Uniform(1.9)],
          ["strength", new Uniform(0)],
          ["aspect", new Uniform(16 / 9)],
        ]),
      },
    );
  }
  get center(): Vector2 {
    return this.uniforms.get("center")!.value;
  }
  set strength(v: number) {
    this.uniforms.get("strength")!.value = v;
  }
  get strength() {
    return this.uniforms.get("strength")!.value;
  }
  set aspect(v: number) {
    this.uniforms.get("aspect")!.value = v;
  }
}
