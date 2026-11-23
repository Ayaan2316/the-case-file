import { BlendFunction, Effect } from "postprocessing";
import { Uniform, Vector3 } from "three";

/**
 * SinCityRed: almost black and white but keeps saturated reds (yarn, pins, stamps).
 * my own shader, runs on linear HDR before tone mapping
 */
export class SinCityRedEffect extends Effect {
  constructor() {
    super(
      "SinCityRedEffect",
      /* glsl */ `
      uniform float intensity;
      vec3 rgb2hsv(vec3 c) {
        vec4 K = vec4(0.0, -1.0 / 3.0, 2.0 / 3.0, -1.0);
        vec4 p = mix(vec4(c.bg, K.wz), vec4(c.gb, K.xy), step(c.b, c.g));
        vec4 q = mix(vec4(p.xyw, c.r), vec4(c.r, p.yzx), step(p.x, c.r));
        float d = q.x - min(q.w, q.y);
        return vec3(abs(q.z + (q.w - q.y) / (6.0 * d + 1e-10)), d / (q.x + 1e-10), q.x);
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = inputColor.rgb;
        if (intensity <= 0.0) { outputColor = inputColor; return; }
        vec3 hsv = rgb2hsv(c);
        float hue = hsv.x * 360.0;
        // red band ~340-8 deg, saturated enough to read as evidence red. kept it narrower than 15 deg
        // because warm lit cork sits at ~18 deg and has to go grey while the yarn (~1 deg) stays red
        float band = max(smoothstep(336.0, 346.0, hue), 1.0 - smoothstep(6.0, 11.0, hue));
        float keep = band * smoothstep(0.45, 0.6, hsv.y);
        float l = dot(c, vec3(0.2126, 0.7152, 0.0722));
        vec3 mono = vec3(pow(max(l, 0.0), 1.12));
        vec3 red = c * vec3(1.18, 0.92, 0.92);
        outputColor = vec4(mix(c, mix(mono, red, keep), intensity), inputColor.a);
      }`,
      { blendFunction: BlendFunction.NORMAL, uniforms: new Map([["intensity", new Uniform(0)]]) },
    );
  }
  set intensity(v: number) {
    this.uniforms.get("intensity")!.value = v;
  }
}

/** rough blackbody RGB (linear), same as kelvin() in blender/lib/common.py */
export function kelvin(t: number): [number, number, number] {
  const k = t / 100;
  const r = k <= 66 ? 255 : 329.698727446 * Math.pow(k - 60, -0.1332047592);
  const g = k <= 66 ? 99.4708025861 * Math.log(k) - 161.1195681661 : 288.1221695283 * Math.pow(k - 60, -0.0755148492);
  const b = k >= 66 ? 255 : k <= 19 ? 0 : 138.5177312231 * Math.log(k - 10) - 305.0447927307;
  return [r, g, b].map((c) => {
    const s = Math.min(Math.max(c, 0), 255) / 255;
    return s <= 0.04045 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  }) as [number, number, number];
}

// blender's own blackbody (cycles Blackbody node, also a light's Temperature), linear rec.709
// at unit luminance, 1500-8000K every 250K. rendered headless off an emission plane
const BLACKBODY: [number, number, number][] = [
  [2.6195, 0.6143, 0.0521],
  [2.291, 0.7122, 0.0492],
  [2.0965, 0.7604, 0.1446],
  [1.9019, 0.8104, 0.2225],
  [1.7442, 0.8495, 0.2993],
  [1.6325, 0.8744, 0.3811],
  [1.5447, 0.8929, 0.4571],
  [1.4657, 0.9092, 0.5285],
  [1.415, 0.9188, 0.5826],
  [1.3812, 0.9234, 0.6365],
  [1.348, 0.9281, 0.6877],
  [1.3183, 0.9322, 0.7347],
  [1.2929, 0.9355, 0.7769],
  [1.2681, 0.9387, 0.8181],
  [1.2434, 0.9417, 0.8607],
  [1.2239, 0.9434, 0.9017],
  [1.2058, 0.9447, 0.9416],
  [1.1881, 0.946, 0.981],
  [1.1713, 0.9473, 1.0173],
  [1.1547, 0.9484, 1.0558],
  [1.1394, 0.9502, 1.0827],
  [1.1262, 0.9516, 1.1084],
  [1.1136, 0.9528, 1.1326],
  [1.0996, 0.9549, 1.1535],
  [1.0887, 0.9558, 1.1763],
  [1.078, 0.9568, 1.1985],
  [1.0679, 0.9577, 1.219],
];

/**
 * a blender light's colour for its temperature. kelvin() is a looser fit (35% short on blue at
 * 3000K) - white balance keeps using it because the grade was tuned with it, but live lights
 * and highlights have to match what cycles baked
 */
export function blackbody(t: number): [number, number, number] {
  const x = Math.min(Math.max((t - 1500) / 250, 0), BLACKBODY.length - 1);
  const i = Math.min(Math.floor(x), BLACKBODY.length - 2);
  const f = x - i;
  return [0, 1, 2].map((c) => BLACKBODY[i][c] * (1 - f) + BLACKBODY[i + 1][c] * f) as [number, number, number];
}

/**
 * white balance + exposure before tone mapping. the blender stills used a 3700K view white balance,
 * this copies it so practicals look warm and moonlight looks blue. `flash` = lightning exposure kick.
 *
 * then blender's "AgX - Medium High Contrast": contrast 1.2 around mid grey in AgX log space
 * (log2 stops, pivot 0.18), so x' = 0.18 * (x / 0.18)^1.2 in linear
 */
export class WhiteBalanceEffect extends Effect {
  constructor(temperature = 3700, contrast = 1.2) {
    const [r, g, b] = kelvin(temperature);
    const wb = new Vector3(g / r, 1, g / b);
    super(
      "WhiteBalanceEffect",
      /* glsl */ `
      uniform vec3 wb;
      uniform float exposure;
      uniform float contrast;
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 c = max(inputColor.rgb * wb * exposure, 0.0);
        outputColor = vec4(0.18 * pow(c / 0.18, vec3(contrast)), inputColor.a);
      }`,
      {
        uniforms: new Map<string, Uniform>([
          ["wb", new Uniform(wb)],
          ["exposure", new Uniform(1)],
          ["contrast", new Uniform(contrast)],
        ]),
      },
    );
  }
  set exposure(v: number) {
    this.uniforms.get("exposure")!.value = v;
  }
}

/**
 * maps three's AgX onto blender's (`pnpm blender probe_agx.py`): the stills' AgX + medium high
 * contrast vs three's AgX after our contrast, on a grey ramp. blender's AgX has a different sigmoid,
 * three shows mid grey ~10 levels brighter and crushes the last stops. blender's value as a function
 * of three's, sampled evenly in sqrt(three's) because the toe needs the resolution
 */
const AGX_TO_BLENDER = [
  0.0, 0.0022, 0.0097, 0.0183, 0.0274, 0.037, 0.047, 0.0566, 0.0672, 0.0791, 0.0919, 0.1067, 0.1226, 0.1402, 0.1602,
  0.1816, 0.2063, 0.2338, 0.2639, 0.2987, 0.3375, 0.3804, 0.4284, 0.4805, 0.5339, 0.5877, 0.641, 0.6936, 0.7457,
  0.7982, 0.8533, 0.9164, 0.9997,
];

/** where black lands (darkest pixels around sRGB 6-10) */
const TOE = 6 / 255;

/**
 * display space grade after AgX, on the sRGB value the screen shows (three hands over linear and
 * the output pass encodes it, this decodes it again so it lands as graded): blender's AgX curve
 * (above), a subtle teal shadow / amber highlight split (my own LUT, kept light so it matches the
 * cycles stills) and a toe lifting black to TOE, gone by sRGB 64 so the lit image keeps cycles' levels
 */
export class SplitToneEffect extends Effect {
  constructor() {
    super(
      "SplitToneEffect",
      /* glsl */ `
      const float AGX_TO_BLENDER[${AGX_TO_BLENDER.length}] = float[](${AGX_TO_BLENDER.map((v) => v.toFixed(4)).join(", ")});
      float toBlender(float s) {
        float x = sqrt(clamp(s, 0.0, 1.0)) * ${(AGX_TO_BLENDER.length - 1).toFixed(1)};
        int i = min(int(x), ${AGX_TO_BLENDER.length - 2});
        return mix(AGX_TO_BLENDER[i], AGX_TO_BLENDER[i + 1], x - float(i));
      }
      vec3 encodeSRGB(vec3 c) {
        return mix(12.92 * c, 1.055 * pow(c, vec3(1.0 / 2.4)) - 0.055, step(0.0031308, c));
      }
      vec3 decodeSRGB(vec3 s) {
        return mix(s / 12.92, pow((s + 0.055) / 1.055, vec3(2.4)), step(0.04045, s));
      }
      void mainImage(const in vec4 inputColor, const in vec2 uv, out vec4 outputColor) {
        vec3 s = encodeSRGB(clamp(inputColor.rgb, 0.0, 1.0));
        s = vec3(toBlender(s.r), toBlender(s.g), toBlender(s.b));
        float l = dot(s, vec3(0.2126, 0.7152, 0.0722));
        s += vec3(-0.002, 0.003, 0.007) * (1.0 - smoothstep(0.0, 0.45, l));
        s += vec3(0.008, 0.003, -0.005) * smoothstep(0.7, 1.0, l);
        float toe = max(1.0 - l / 0.25, 0.0);
        s += ${TOE.toFixed(5)} * toe * toe;
        outputColor = vec4(decodeSRGB(clamp(s, 0.0, 1.0)), inputColor.a);
      }`,
    );
  }
}
