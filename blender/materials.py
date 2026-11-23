"""PBR material library - poly haven texture sets plus procedural materials.

Every scanned material gets a macro variation layer (big noise on colour and roughness) so the
tiling never shows, plus imperfection layers where they make sense.
"""
import math
import os

import bpy

from lib.common import PH, kelvin

_cache = {}


def _map(base, *names):
    """first texture file that exists among the name variants (poly haven naming differs per set)"""
    for n in names:
        for ext in ("jpg", "exr", "png"):
            p = f"{base}{n}_2k.{ext}"
            if os.path.exists(p):
                return p
    raise FileNotFoundError(f"{base}{names}")


def _tree(name):
    mat = bpy.data.materials.new(name)
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    out.location = (900, 0)
    bsdf = nt.nodes.new("ShaderNodeBsdfPrincipled")
    bsdf.location = (500, 0)
    nt.links.new(bsdf.outputs[0], out.inputs["Surface"])
    return mat, nt, bsdf, out


def _set(bsdf, **inputs):
    for key, value in inputs.items():
        name = key.replace("_", " ")
        if name in bsdf.inputs:
            bsdf.inputs[name].default_value = value


def _node(nt, kind, loc, **props):
    n = nt.nodes.new(kind)
    n.location = loc
    for k, v in props.items():
        setattr(n, k, v)
    return n


def _image(nt, path, loc, non_color=False, vector=None, interp="Cubic"):
    img = bpy.data.images.load(path, check_existing=True)
    if non_color:
        img.colorspace_settings.name = "Non-Color"
    tex = _node(nt, "ShaderNodeTexImage", loc, image=img, interpolation=interp)
    if vector is not None:
        nt.links.new(vector, tex.inputs["Vector"])
    return tex


def _macro(nt, vector_out, scale, loc):
    """big soft noise to break up tiling (0..1, centred ~0.5)"""
    noise = _node(nt, "ShaderNodeTexNoise", loc)
    noise.inputs["Scale"].default_value = scale
    noise.inputs["Detail"].default_value = 3.0
    noise.inputs["Roughness"].default_value = 0.55
    nt.links.new(vector_out, noise.inputs["Vector"])
    return noise


def scanned(tex_id, *, tile=1.0, hue=0.5, sat=1.0, val=1.0, tint=None, rough_mult=1.0,
            rough_add=0.0, normal=1.0, disp=0.0, macro=0.18, macro_scale=0.35, coat=0.0,
            name=None, rotate=0.0, dust=0.0):
    """poly haven texture set on the `UVMap` layer (metres / tile, see world_uvs)"""
    key = (tex_id, tile, hue, sat, val, tint, rough_mult, rough_add, normal, disp, macro, coat, rotate, dust, name)
    if key in _cache:
        return _cache[key]
    base = os.path.join(PH, "textures", tex_id, "textures", f"{tex_id}_")
    mat, nt, bsdf, out = _tree(name or f"ph_{tex_id}")

    uv = _node(nt, "ShaderNodeUVMap", (-1600, 0), uv_map="UVMap")
    mapping = _node(nt, "ShaderNodeMapping", (-1400, 0))
    mapping.inputs["Rotation"].default_value[2] = math.radians(rotate)
    nt.links.new(uv.outputs[0], mapping.inputs["Vector"])
    vec = mapping.outputs[0]

    diff = _image(nt, _map(base, "diff", "albedo", "col"), (-900, 300), vector=vec)
    color = diff.outputs["Color"]
    hsv = _node(nt, "ShaderNodeHueSaturation", (-600, 300))
    hsv.inputs["Hue"].default_value = hue
    hsv.inputs["Saturation"].default_value = sat
    hsv.inputs["Value"].default_value = val
    nt.links.new(color, hsv.inputs["Color"])
    color = hsv.outputs["Color"]
    if tint:
        mul = _node(nt, "ShaderNodeMix", (-400, 300), data_type="RGBA", blend_type="MULTIPLY")
        mul.inputs["Factor"].default_value = 1.0
        nt.links.new(color, mul.inputs["A"])
        mul.inputs["B"].default_value = (*tint, 1)
        color = mul.outputs["Result"]

    rough_img = _image(nt, _map(base, "rough"), (-900, 0), non_color=True, vector=vec)
    rough = _node(nt, "ShaderNodeMath", (-600, 0), operation="MULTIPLY_ADD")
    rough.inputs[1].default_value = rough_mult
    rough.inputs[2].default_value = rough_add
    nt.links.new(rough_img.outputs["Color"], rough.inputs[0])
    rough_out = rough.outputs[0]

    if macro > 0:
        tc = _node(nt, "ShaderNodeTexCoord", (-1400, -500))
        m = _macro(nt, tc.outputs["Object"], macro_scale, (-1200, -500))
        ramp = _node(nt, "ShaderNodeMapRange", (-1000, -500))
        ramp.inputs["To Min"].default_value = 1.0 - macro
        ramp.inputs["To Max"].default_value = 1.0 + macro * 0.6
        nt.links.new(m.outputs["Fac"], ramp.inputs["Value"])
        cmul = _node(nt, "ShaderNodeMix", (-250, 300), data_type="RGBA", blend_type="MULTIPLY")
        cmul.inputs["Factor"].default_value = 1.0
        nt.links.new(color, cmul.inputs["A"])
        comb = _node(nt, "ShaderNodeCombineColor", (-450, 150))
        for i in range(3):
            nt.links.new(ramp.outputs[0], comb.inputs[i])
        nt.links.new(comb.outputs[0], cmul.inputs["B"])
        color = cmul.outputs["Result"]
        rmul = _node(nt, "ShaderNodeMath", (-250, 0), operation="MULTIPLY")
        nt.links.new(rough_out, rmul.inputs[0])
        nt.links.new(ramp.outputs[0], rmul.inputs[1])
        rough_out = rmul.outputs[0]

    if dust > 0:
        # dust on upward facing surfaces
        geo = _node(nt, "ShaderNodeNewGeometry", (-700, 650))
        sep = _node(nt, "ShaderNodeSeparateXYZ", (-550, 650))
        nt.links.new(geo.outputs["Normal"], sep.inputs[0])
        dn = _node(nt, "ShaderNodeTexNoise", (-550, 850))
        dn.inputs["Scale"].default_value = 40.0
        dmask = _node(nt, "ShaderNodeMath", (-350, 700), operation="MULTIPLY")
        nt.links.new(sep.outputs["Z"], dmask.inputs[0])
        nt.links.new(dn.outputs["Fac"], dmask.inputs[1])
        dclamp = _node(nt, "ShaderNodeMapRange", (-200, 700))
        dclamp.inputs["From Min"].default_value = 0.45
        dclamp.inputs["From Max"].default_value = 0.9
        dclamp.inputs["To Max"].default_value = dust
        nt.links.new(dmask.outputs[0], dclamp.inputs["Value"])
        dmix = _node(nt, "ShaderNodeMix", (0, 300), data_type="RGBA")
        nt.links.new(dclamp.outputs[0], dmix.inputs["Factor"])
        nt.links.new(color, dmix.inputs["A"])
        dmix.inputs["B"].default_value = (0.32, 0.30, 0.27, 1)
        color = dmix.outputs["Result"]
        rmix = _node(nt, "ShaderNodeMix", (0, 0), data_type="FLOAT")
        nt.links.new(dclamp.outputs[0], rmix.inputs["Factor"])
        nt.links.new(rough_out, rmix.inputs["A"])
        rmix.inputs["B"].default_value = 0.9
        rough_out = rmix.outputs["Result"]

    nt.links.new(color, bsdf.inputs["Base Color"])
    nt.links.new(rough_out, bsdf.inputs["Roughness"])

    nor = _image(nt, _map(base, "nor_gl"), (-900, -300), non_color=True, vector=vec)
    nmap = _node(nt, "ShaderNodeNormalMap", (-500, -300))
    nmap.inputs["Strength"].default_value = normal
    nt.links.new(nor.outputs["Color"], nmap.inputs["Color"])
    nt.links.new(nmap.outputs[0], bsdf.inputs["Normal"])
    if coat:
        _set(bsdf, Coat_Weight=coat, Coat_Roughness=0.08)

    disp_path = base + "disp_2k.png"
    if disp > 0 and os.path.exists(disp_path):
        dimg = _image(nt, disp_path, (-900, -650), non_color=True, vector=vec)
        dnode = _node(nt, "ShaderNodeDisplacement", (500, -500))
        dnode.inputs["Scale"].default_value = disp
        dnode.inputs["Midlevel"].default_value = 0.5
        nt.links.new(dimg.outputs["Color"], dnode.inputs["Height"])
        nt.links.new(dnode.outputs[0], out.inputs["Displacement"])
        mat.displacement_method = "BOTH"
    _cache[key] = mat
    return mat


def principled(name, color=(0.5, 0.5, 0.5), rough=0.5, metal=0.0, **extra):
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1), Roughness=rough, Metallic=metal, **extra)
    return mat


def _noise_rough(nt, bsdf, base, spread, scale=60.0, stretch=None, loc=(-400, -200)):
    """roughness variation: fingerprints, smudges, brushing"""
    tc = _node(nt, "ShaderNodeTexCoord", (loc[0] - 600, loc[1]))
    vec = tc.outputs["Object"]
    if stretch:
        mp = _node(nt, "ShaderNodeMapping", (loc[0] - 400, loc[1]))
        mp.inputs["Scale"].default_value = stretch
        nt.links.new(vec, mp.inputs["Vector"])
        vec = mp.outputs[0]
    n = _node(nt, "ShaderNodeTexNoise", (loc[0] - 200, loc[1]))
    n.inputs["Scale"].default_value = scale
    n.inputs["Detail"].default_value = 8
    nt.links.new(vec, n.inputs["Vector"])
    r = _node(nt, "ShaderNodeMapRange", loc)
    r.inputs["To Min"].default_value = max(0.0, base - spread)
    r.inputs["To Max"].default_value = base + spread
    nt.links.new(n.outputs["Fac"], r.inputs["Value"])
    nt.links.new(r.outputs[0], bsdf.inputs["Roughness"])
    return n


def powder_coat(name="black_powder_coat", color=(0.028, 0.028, 0.03), rough=0.42):
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1))
    _noise_rough(nt, bsdf, rough, 0.08, scale=120)
    return mat


def brushed_metal(name="brushed_steel", color=(0.56, 0.57, 0.58), rough=0.28, aniso=0.65):
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1), Metallic=1.0, Anisotropic=aniso)
    _noise_rough(nt, bsdf, rough, 0.07, scale=40, stretch=(1, 1, 120))
    return mat


def polished_metal(name, color, rough=0.12, spread=0.06):
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1), Metallic=1.0)
    _noise_rough(nt, bsdf, rough, spread, scale=25)
    return mat


def brass():
    return polished_metal("brass", (0.80, 0.56, 0.26), 0.22, 0.1)


def gold_leaf():
    return polished_metal("gold_leaf", (0.95, 0.70, 0.30), 0.18, 0.08)


def chrome():
    return polished_metal("chrome", (0.86, 0.86, 0.87), 0.06, 0.04)


def steel_tumbler():
    return polished_metal("stainless_tumbler", (0.72, 0.72, 0.73), 0.1, 0.05)


def glass(name="glass", rough=0.0, tint=(1, 1, 1), ior=1.45):
    mat = principled(name, tint, rough, 0.0, Transmission_Weight=1.0, IOR=ior)
    return mat


def frosted_glass():
    mat, nt, bsdf, _ = _tree("frosted_glass")
    _set(bsdf, Base_Color=(0.92, 0.92, 0.9, 1), Transmission_Weight=1.0, IOR=1.5)
    _noise_rough(nt, bsdf, 0.42, 0.08, scale=300)
    return mat


def bakelite():
    return principled("bakelite", (0.03, 0.026, 0.024), 0.18, Coat_Weight=1.0, Coat_Roughness=0.04)


def enamel(name, color, rough=0.25):
    return principled(name, color, rough, Coat_Weight=0.6, Coat_Roughness=0.1)


def rubber(name="rubber", color=(0.032, 0.032, 0.032)):
    return principled(name, color, 0.75)


def plastic(name, color, rough=0.4):
    return principled(name, color, rough)


def green_glass_shade():
    mat, nt, bsdf, _ = _tree("bankers_green_glass")
    _set(bsdf, Base_Color=(0.01, 0.16, 0.05, 1), Roughness=0.06, Coat_Weight=1.0,
         Coat_Roughness=0.02, Transmission_Weight=0.25)
    return mat


def paper(name="paper", color=(0.80, 0.76, 0.66), rough=0.8):
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1), Subsurface_Weight=0.15, Subsurface_Radius=(0.02, 0.02, 0.02),
         Subsurface_Scale=0.005, Sheen_Weight=0.15)
    _noise_rough(nt, bsdf, rough, 0.06, scale=200)
    return mat


def manila():
    mat, nt, bsdf, _ = _tree("manila")
    tc = _node(nt, "ShaderNodeTexCoord", (-1000, 300))
    n = _node(nt, "ShaderNodeTexNoise", (-800, 300))
    n.inputs["Scale"].default_value = 18
    n.inputs["Detail"].default_value = 10
    nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
    ramp = _node(nt, "ShaderNodeValToRGB", (-550, 300))
    ramp.color_ramp.elements[0].color = (0.50, 0.36, 0.18, 1)
    ramp.color_ramp.elements[1].color = (0.62, 0.47, 0.25, 1)
    nt.links.new(n.outputs["Fac"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    _set(bsdf, Sheen_Weight=0.2, Subsurface_Weight=0.05)
    _noise_rough(nt, bsdf, 0.78, 0.06, scale=150, loc=(-300, -250))
    return mat


def image_paper(name, image_path, rough=0.55):
    """photo / printed stuff, an image on paper (polaroids, labels)"""
    mat, nt, bsdf, _ = _tree(name)
    img = bpy.data.images.load(image_path, check_existing=True)
    tex = _node(nt, "ShaderNodeTexImage", (-400, 200), image=img)
    nt.links.new(tex.outputs["Color"], bsdf.inputs["Base Color"])
    _set(bsdf, Roughness=rough, Coat_Weight=0.3, Coat_Roughness=0.15)
    return mat


def ink(name="ink_red", color=(0.42, 0.02, 0.03), alpha_noise=True):
    """stamped ink with patchy coverage, over paper"""
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1), Roughness=0.7)
    if alpha_noise:
        tc = _node(nt, "ShaderNodeTexCoord", (-900, -300))
        n = _node(nt, "ShaderNodeTexNoise", (-700, -300))
        n.inputs["Scale"].default_value = 220
        n.inputs["Detail"].default_value = 6
        nt.links.new(tc.outputs["Object"], n.inputs["Vector"])
        r = _node(nt, "ShaderNodeMapRange", (-500, -300))
        r.inputs["From Min"].default_value = 0.35
        r.inputs["From Max"].default_value = 0.55
        nt.links.new(n.outputs["Fac"], r.inputs["Value"])
        nt.links.new(r.outputs[0], bsdf.inputs["Alpha"])
    return mat


def emission(name, color, strength):
    mat, nt, bsdf, out = _tree(name)
    _set(bsdf, Base_Color=(0, 0, 0, 1), Emission_Color=(*color, 1), Emission_Strength=strength)
    return mat


def led_strip(strength=12.0, temp=2700):
    return emission(f"led_{temp}k", kelvin(temp), strength)


def neon(name, color, strength=28.0):
    """glass tube with a hot core (emission) and a thin glossy skin"""
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1), Roughness=0.15, Emission_Color=(*color, 1),
         Emission_Strength=strength, Coat_Weight=0.5)
    return mat


def cork():
    mat, nt, bsdf, _ = _tree("cork")
    tc = _node(nt, "ShaderNodeTexCoord", (-1100, 0))
    vor = _node(nt, "ShaderNodeTexVoronoi", (-850, 200))
    vor.inputs["Scale"].default_value = 260
    nt.links.new(tc.outputs["Object"], vor.inputs["Vector"])
    noise = _node(nt, "ShaderNodeTexNoise", (-850, -100))
    noise.inputs["Scale"].default_value = 90
    noise.inputs["Detail"].default_value = 12
    nt.links.new(tc.outputs["Object"], noise.inputs["Vector"])
    mix = _node(nt, "ShaderNodeMix", (-600, 100), data_type="FLOAT")
    mix.inputs["Factor"].default_value = 0.5
    nt.links.new(vor.outputs["Distance"], mix.inputs["A"])
    nt.links.new(noise.outputs["Fac"], mix.inputs["B"])
    ramp = _node(nt, "ShaderNodeValToRGB", (-400, 200))
    ramp.color_ramp.elements[0].position = 0.25
    ramp.color_ramp.elements[0].color = (0.16, 0.08, 0.035, 1)
    ramp.color_ramp.elements[1].color = (0.46, 0.28, 0.13, 1)
    nt.links.new(mix.outputs["Result"], ramp.inputs["Fac"])
    nt.links.new(ramp.outputs["Color"], bsdf.inputs["Base Color"])
    bump = _node(nt, "ShaderNodeBump", (-200, -200))
    bump.inputs["Strength"].default_value = 0.35
    bump.inputs["Distance"].default_value = 0.002
    nt.links.new(mix.outputs["Result"], bump.inputs["Height"])
    nt.links.new(bump.outputs[0], bsdf.inputs["Normal"])
    _set(bsdf, Roughness=0.85)
    return mat


def felt(name="fedora_felt", color=(0.05, 0.045, 0.04)):
    mat, nt, bsdf, _ = _tree(name)
    _set(bsdf, Base_Color=(*color, 1), Roughness=0.85, Sheen_Weight=0.6, Sheen_Roughness=0.4,
         Sheen_Tint=(0.5, 0.48, 0.45, 1))
    return mat


def pcb(name="pcb_black"):
    return principled(name, (0.03, 0.032, 0.035), 0.3, Coat_Weight=0.8, Coat_Roughness=0.12)


def plastic_bag():
    mat, nt, bsdf, _ = _tree("evidence_bag")
    _set(bsdf, Base_Color=(0.95, 0.95, 0.95, 1), Transmission_Weight=1.0, IOR=1.4,
         Thin_Film_Thickness=0.0)
    _noise_rough(nt, bsdf, 0.12, 0.08, scale=30)
    return mat


def volume_haze(density=0.006, color=(0.8, 0.82, 0.88), toward_x=None):
    """thin scattering haze. toward_x=(from, to, extra) ramps density up along the object's local X
    (cube coords -0.5..0.5), e.g. thicker near a window
    """
    mat = bpy.data.materials.new("fx_haze")
    mat.use_nodes = True
    nt = mat.node_tree
    nt.nodes.clear()
    out = nt.nodes.new("ShaderNodeOutputMaterial")
    vol = nt.nodes.new("ShaderNodeVolumePrincipled")
    vol.inputs["Density"].default_value = density
    if toward_x:
        tc = nt.nodes.new("ShaderNodeTexCoord")
        sep = nt.nodes.new("ShaderNodeSeparateXYZ")
        nt.links.new(tc.outputs["Object"], sep.inputs[0])
        rng_ = nt.nodes.new("ShaderNodeMapRange")
        rng_.interpolation_type = "SMOOTHSTEP"
        rng_.inputs["From Min"].default_value = toward_x[0]
        rng_.inputs["From Max"].default_value = toward_x[1]
        rng_.inputs["To Min"].default_value = density
        rng_.inputs["To Max"].default_value = density + toward_x[2]
        nt.links.new(sep.outputs["X"], rng_.inputs["Value"])
        nt.links.new(rng_.outputs[0], vol.inputs["Density"])
    vol.inputs["Color"].default_value = (*color, 1)
    vol.inputs["Anisotropy"].default_value = 0.45
    nt.links.new(vol.outputs[0], out.inputs["Volume"])
    return mat
