/**
 * WGSL Compute Shaders for video frame processing effects.
 * Each shader operates on RGBA pixel data stored as packed u32 values.
 */

/** Shared struct definition for params uniform buffer */
const PARAMS_STRUCT = /* wgsl */ `
struct Params {
  value: f32,
  width: u32,
  height: u32,
  _pad: u32,
};
`;

/** Shared bindings: input/output storage buffers + params uniform */
const BINDINGS = /* wgsl */ `
@group(0) @binding(0) var<storage, read> input: array<u32>;
@group(0) @binding(1) var<storage, read_write> output: array<u32>;
@group(0) @binding(2) var<uniform> params: Params;
`;

/** Helper functions for packing/unpacking RGBA from u32 */
const PIXEL_HELPERS = /* wgsl */ `
fn unpack_rgba(packed: u32) -> vec4<f32> {
  let r = f32(packed & 0xFFu) / 255.0;
  let g = f32((packed >> 8u) & 0xFFu) / 255.0;
  let b = f32((packed >> 16u) & 0xFFu) / 255.0;
  let a = f32((packed >> 24u) & 0xFFu) / 255.0;
  return vec4<f32>(r, g, b, a);
}

fn pack_rgba(color: vec4<f32>) -> u32 {
  let r = u32(clamp(color.r, 0.0, 1.0) * 255.0);
  let g = u32(clamp(color.g, 0.0, 1.0) * 255.0);
  let b = u32(clamp(color.b, 0.0, 1.0) * 255.0);
  let a = u32(clamp(color.a, 0.0, 1.0) * 255.0);
  return r | (g << 8u) | (b << 16u) | (a << 24u);
}
`;

export const brightnessShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  var color = unpack_rgba(input[idx]);
  let factor = params.value / 100.0;
  color = vec4<f32>(
    color.r + factor,
    color.g + factor,
    color.b + factor,
    color.a
  );
  output[idx] = pack_rgba(color);
}
`;

export const contrastShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  var color = unpack_rgba(input[idx]);
  let factor = (params.value + 100.0) / 100.0;
  let contrast_factor = factor * factor;
  color = vec4<f32>(
    (color.r - 0.5) * contrast_factor + 0.5,
    (color.g - 0.5) * contrast_factor + 0.5,
    (color.b - 0.5) * contrast_factor + 0.5,
    color.a
  );
  output[idx] = pack_rgba(color);
}
`;

export const saturationShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  var color = unpack_rgba(input[idx]);
  let factor = (params.value + 100.0) / 100.0;
  let luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  color = vec4<f32>(
    luma + (color.r - luma) * factor,
    luma + (color.g - luma) * factor,
    luma + (color.b - luma) * factor,
    color.a
  );
  output[idx] = pack_rgba(color);
}
`;

export const grayscaleShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  let color = unpack_rgba(input[idx]);
  let luma = 0.2126 * color.r + 0.7152 * color.g + 0.0722 * color.b;
  output[idx] = pack_rgba(vec4<f32>(luma, luma, luma, color.a));
}
`;

export const sepiaShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  let color = unpack_rgba(input[idx]);
  let r = color.r * 0.393 + color.g * 0.769 + color.b * 0.189;
  let g = color.r * 0.349 + color.g * 0.686 + color.b * 0.168;
  let b = color.r * 0.272 + color.g * 0.534 + color.b * 0.131;
  output[idx] = pack_rgba(vec4<f32>(r, g, b, color.a));
}
`;

export const invertShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  let color = unpack_rgba(input[idx]);
  output[idx] = pack_rgba(vec4<f32>(1.0 - color.r, 1.0 - color.g, 1.0 - color.b, color.a));
}
`;

export const sharpenShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  let w = params.width;
  let x = idx % w;
  let y = idx / w;
  let amount = params.value / 100.0;

  let center = unpack_rgba(input[idx]);

  // Skip edge pixels — copy directly
  if (x == 0u || y == 0u || x >= w - 1u || y >= params.height - 1u) {
    output[idx] = pack_rgba(center);
    return;
  }

  let top    = unpack_rgba(input[(y - 1u) * w + x]);
  let bottom = unpack_rgba(input[(y + 1u) * w + x]);
  let left   = unpack_rgba(input[y * w + (x - 1u)]);
  let right  = unpack_rgba(input[y * w + (x + 1u)]);

  // Unsharp mask: center + amount * (center - average_neighbors)
  let avg = (top + bottom + left + right) * 0.25;
  let sharpened = center + (center - avg) * amount;

  output[idx] = pack_rgba(vec4<f32>(sharpened.r, sharpened.g, sharpened.b, center.a));
}
`;

/**
 * Blur shader uses a two-pass box blur approximation.
 * For simplicity we do a single-pass box blur with kernel size derived from radius.
 * The blur radius is passed via params.value.
 */
export const blurShader: string = /* wgsl */ `
${PARAMS_STRUCT}
${BINDINGS}
${PIXEL_HELPERS}

@compute @workgroup_size(256)
fn main(@builtin(global_invocation_id) gid: vec3<u32>) {
  let idx = gid.x;
  let total = params.width * params.height;
  if (idx >= total) {
    return;
  }
  let w = params.width;
  let h = params.height;
  let x = i32(idx % w);
  let y = i32(idx / w);
  let radius = i32(clamp(params.value, 1.0, 20.0));

  var sum = vec4<f32>(0.0, 0.0, 0.0, 0.0);
  var count = 0.0;

  for (var dy = -radius; dy <= radius; dy = dy + 1) {
    for (var dx = -radius; dx <= radius; dx = dx + 1) {
      let sx = clamp(x + dx, 0, i32(w) - 1);
      let sy = clamp(y + dy, 0, i32(h) - 1);
      let sample_idx = u32(sy) * w + u32(sx);
      sum = sum + unpack_rgba(input[sample_idx]);
      count = count + 1.0;
    }
  }

  let avg = sum / count;
  let orig = unpack_rgba(input[idx]);
  output[idx] = pack_rgba(vec4<f32>(avg.r, avg.g, avg.b, orig.a));
}
`;

/** Map of effect IDs to their WGSL shader source */
export const shaderSources: Record<string, string> = {
  brightness: brightnessShader,
  contrast: contrastShader,
  saturation: saturationShader,
  grayscale: grayscaleShader,
  sepia: sepiaShader,
  invert: invertShader,
  sharpen: sharpenShader,
  blur: blurShader,
};
