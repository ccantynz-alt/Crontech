/**
 * Video effect definitions with both WebGPU (WGSL) and Canvas2D fallback implementations.
 * Each effect is self-contained and can be applied independently.
 */

export interface VideoEffectParams {
  readonly value: number;
}

export interface VideoEffectDefinition {
  readonly id: string;
  readonly name: string;
  readonly description: string;
  readonly defaultParams: VideoEffectParams;
  readonly min: number;
  readonly max: number;
  /** Canvas2D fallback: mutates imageData pixels in-place */
  apply(imageData: ImageData, params: VideoEffectParams): void;
}

// ---- Canvas2D effect implementations ----

function applyBrightness(imageData: ImageData, params: VideoEffectParams): void {
  const data = imageData.data;
  const offset = (params.value / 100) * 255;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(0, Math.min(255, (data[i] as number) + offset));
    data[i + 1] = Math.max(0, Math.min(255, (data[i + 1] as number) + offset));
    data[i + 2] = Math.max(0, Math.min(255, (data[i + 2] as number) + offset));
  }
}

function applyContrast(imageData: ImageData, params: VideoEffectParams): void {
  const data = imageData.data;
  const factor = (params.value + 100) / 100;
  const contrastFactor = factor * factor;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = Math.max(
      0,
      Math.min(255, (((data[i] as number) / 255 - 0.5) * contrastFactor + 0.5) * 255),
    );
    data[i + 1] = Math.max(
      0,
      Math.min(255, (((data[i + 1] as number) / 255 - 0.5) * contrastFactor + 0.5) * 255),
    );
    data[i + 2] = Math.max(
      0,
      Math.min(255, (((data[i + 2] as number) / 255 - 0.5) * contrastFactor + 0.5) * 255),
    );
  }
}

function applySaturation(imageData: ImageData, params: VideoEffectParams): void {
  const data = imageData.data;
  const factor = (params.value + 100) / 100;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] as number;
    const g = data[i + 1] as number;
    const b = data[i + 2] as number;
    const luma = 0.2126 * r + 0.7152 * g + 0.0722 * b;
    data[i] = Math.max(0, Math.min(255, luma + (r - luma) * factor));
    data[i + 1] = Math.max(0, Math.min(255, luma + (g - luma) * factor));
    data[i + 2] = Math.max(0, Math.min(255, luma + (b - luma) * factor));
  }
}

function applyBlur(imageData: ImageData, params: VideoEffectParams): void {
  const { width, height, data } = imageData;
  const radius = Math.max(1, Math.min(20, Math.round(params.value)));
  // Copy source data since we read from it while writing
  const src = new Uint8ClampedArray(data);

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      let r = 0;
      let g = 0;
      let b = 0;
      let count = 0;

      for (let dy = -radius; dy <= radius; dy++) {
        for (let dx = -radius; dx <= radius; dx++) {
          const sx = Math.max(0, Math.min(width - 1, x + dx));
          const sy = Math.max(0, Math.min(height - 1, y + dy));
          const si = (sy * width + sx) * 4;
          r += src[si] as number;
          g += src[si + 1] as number;
          b += src[si + 2] as number;
          count++;
        }
      }

      const di = (y * width + x) * 4;
      data[di] = r / count;
      data[di + 1] = g / count;
      data[di + 2] = b / count;
      // alpha untouched
    }
  }
}

function applySharpen(imageData: ImageData, params: VideoEffectParams): void {
  const { width, height, data } = imageData;
  const amount = params.value / 100;
  const src = new Uint8ClampedArray(data);

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const ci = (y * width + x) * 4;
      const ti = ((y - 1) * width + x) * 4;
      const bi = ((y + 1) * width + x) * 4;
      const li = (y * width + (x - 1)) * 4;
      const ri = (y * width + (x + 1)) * 4;

      for (let c = 0; c < 3; c++) {
        const center = src[ci + c] as number;
        const avg =
          ((src[ti + c] as number) +
            (src[bi + c] as number) +
            (src[li + c] as number) +
            (src[ri + c] as number)) /
          4;
        data[ci + c] = Math.max(0, Math.min(255, center + (center - avg) * amount));
      }
    }
  }
}

function applyGrayscale(imageData: ImageData, _params: VideoEffectParams): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const luma =
      0.2126 * (data[i] as number) +
      0.7152 * (data[i + 1] as number) +
      0.0722 * (data[i + 2] as number);
    data[i] = luma;
    data[i + 1] = luma;
    data[i + 2] = luma;
  }
}

function applySepia(imageData: ImageData, _params: VideoEffectParams): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    const r = data[i] as number;
    const g = data[i + 1] as number;
    const b = data[i + 2] as number;
    data[i] = Math.min(255, r * 0.393 + g * 0.769 + b * 0.189);
    data[i + 1] = Math.min(255, r * 0.349 + g * 0.686 + b * 0.168);
    data[i + 2] = Math.min(255, r * 0.272 + g * 0.534 + b * 0.131);
  }
}

function applyInvert(imageData: ImageData, _params: VideoEffectParams): void {
  const data = imageData.data;
  for (let i = 0; i < data.length; i += 4) {
    data[i] = 255 - (data[i] as number);
    data[i + 1] = 255 - (data[i + 1] as number);
    data[i + 2] = 255 - (data[i + 2] as number);
  }
}

// ---- Effect registry ----

export const brightnessEffect: VideoEffectDefinition = {
  id: "brightness",
  name: "Brightness",
  description: "Adjust brightness level",
  defaultParams: { value: 0 },
  min: -100,
  max: 100,
  apply: applyBrightness,
};

export const contrastEffect: VideoEffectDefinition = {
  id: "contrast",
  name: "Contrast",
  description: "Adjust contrast level",
  defaultParams: { value: 0 },
  min: -100,
  max: 100,
  apply: applyContrast,
};

export const saturationEffect: VideoEffectDefinition = {
  id: "saturation",
  name: "Saturation",
  description: "Adjust color saturation",
  defaultParams: { value: 0 },
  min: -100,
  max: 100,
  apply: applySaturation,
};

export const blurEffect: VideoEffectDefinition = {
  id: "blur",
  name: "Blur",
  description: "Apply Gaussian blur",
  defaultParams: { value: 0 },
  min: 0,
  max: 20,
  apply: applyBlur,
};

export const sharpenEffect: VideoEffectDefinition = {
  id: "sharpen",
  name: "Sharpen",
  description: "Enhance edge sharpness",
  defaultParams: { value: 0 },
  min: 0,
  max: 100,
  apply: applySharpen,
};

export const grayscaleEffect: VideoEffectDefinition = {
  id: "grayscale",
  name: "Grayscale",
  description: "Convert to grayscale",
  defaultParams: { value: 0 },
  min: 0,
  max: 0,
  apply: applyGrayscale,
};

export const sepiaEffect: VideoEffectDefinition = {
  id: "sepia",
  name: "Sepia",
  description: "Apply sepia tone",
  defaultParams: { value: 0 },
  min: 0,
  max: 0,
  apply: applySepia,
};

export const invertEffect: VideoEffectDefinition = {
  id: "invert",
  name: "Invert",
  description: "Invert colors",
  defaultParams: { value: 0 },
  min: 0,
  max: 0,
  apply: applyInvert,
};

/** All available effects indexed by ID */
export const effectRegistry: Record<string, VideoEffectDefinition> = {
  brightness: brightnessEffect,
  contrast: contrastEffect,
  saturation: saturationEffect,
  blur: blurEffect,
  sharpen: sharpenEffect,
  grayscale: grayscaleEffect,
  sepia: sepiaEffect,
  invert: invertEffect,
};

/** Ordered list of all available effects */
export const allEffects: readonly VideoEffectDefinition[] = [
  brightnessEffect,
  contrastEffect,
  saturationEffect,
  blurEffect,
  sharpenEffect,
  grayscaleEffect,
  sepiaEffect,
  invertEffect,
];
