// ── GPU Device Capabilities Detection ───────────────────────────────
// Bridges the low-level WebGPU detection (webgpu-detect.ts) with the
// ai-core DeviceCapabilities type used by the three-tier compute router.
// Returns a single typed object that the compute router consumes.

import type { DeviceCapabilities } from "@cronix/ai-core";
import { detectWebGPU, getComputeTier } from "./webgpu-detect";
import type { GPUCapabilities, GPUComputeTier, GraphicsBackend } from "./webgpu-detect";

// ── Extended Device Info ────────────────────────────────────────────

export interface ExtendedDeviceCapabilities extends DeviceCapabilities {
  /** The underlying graphics backend in use */
  graphicsBackend: GraphicsBackend;
  /** GPU compute tier classification: high, medium, low, none */
  gpuComputeTier: GPUComputeTier;
  /** Full GPU capabilities for advanced queries */
  gpuCapabilities: GPUCapabilities;
  /** Whether float16 shader support is available */
  supportsFloat16: boolean;
  /** Maximum texture dimension */
  maxTextureSize: number;
}

// ── Connection Type Detection ──────────────────────────────────────

function detectConnectionType(): DeviceCapabilities["connectionType"] {
  if (typeof navigator === "undefined") return "unknown";

  if ("connection" in navigator) {
    const conn = (navigator as Navigator & {
      connection?: { effectiveType?: string; type?: string };
    }).connection;

    const etype = conn?.effectiveType;
    if (etype === "4g" || etype === "3g" || etype === "2g" || etype === "slow-2g") {
      return etype;
    }

    // Check physical connection type for wifi/ethernet
    const connType = conn?.type;
    if (connType === "wifi") return "wifi";
    if (connType === "ethernet") return "ethernet";
  }

  return "unknown";
}

// ── Device Memory Detection ────────────────────────────────────────

function detectDeviceMemoryGB(): number {
  if (typeof navigator === "undefined") return 2;
  return (navigator as Navigator & { deviceMemory?: number }).deviceMemory ?? 2;
}

// ── Main Detection Function ────────────────────────────────────────

/**
 * Detect full device capabilities for the three-tier compute model.
 * Returns a typed `ExtendedDeviceCapabilities` object that includes
 * both the ai-core `DeviceCapabilities` fields and additional GPU info.
 *
 * Fallback chain: WebGPU -> WebGL2 -> WebGL -> CPU-only
 *
 * @returns Promise resolving to device capabilities
 */
export async function detectGPUCapabilities(): Promise<ExtendedDeviceCapabilities> {
  const gpuCaps = await detectWebGPU();
  const gpuTier = getComputeTier(gpuCaps);
  const connectionType = detectConnectionType();
  const deviceMemoryGB = detectDeviceMemoryGB();

  return {
    // ai-core DeviceCapabilities fields
    hasWebGPU: gpuCaps.supported,
    vramMB: gpuCaps.estimatedVRAMMB,
    hardwareConcurrency: typeof navigator !== "undefined" ? navigator.hardwareConcurrency : 1,
    deviceMemoryGB,
    connectionType,

    // Extended fields
    graphicsBackend: gpuCaps.backend,
    gpuComputeTier: gpuTier,
    gpuCapabilities: gpuCaps,
    supportsFloat16: gpuCaps.supportsFloat16,
    maxTextureSize: gpuCaps.maxTextureSize,
  };
}
