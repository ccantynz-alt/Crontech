// ── Three-Tier Compute Router ──────────────────────────────────────
// Routes AI workloads to the cheapest tier that meets requirements.
// Client GPU ($0/token) → Edge (sub-50ms) → Cloud (full power)

export type ComputeTier = "client" | "edge" | "cloud";

export interface DeviceCapabilities {
  hasWebGPU: boolean;
  vramMB: number;
  hardwareConcurrency: number;
  deviceMemoryGB: number;
  connectionType: "4g" | "3g" | "2g" | "slow-2g" | "wifi" | "ethernet" | "unknown";
}

export interface ModelRequirements {
  parametersBillion: number;
  minVRAMMB: number;
  latencyMaxMs: number;
}

export function computeTierRouter(
  device: DeviceCapabilities,
  model: ModelRequirements,
): ComputeTier {
  // Tier 1: Client GPU — free, fastest, models under 2B params
  if (
    device.hasWebGPU &&
    device.vramMB >= model.minVRAMMB &&
    model.parametersBillion <= 2 &&
    model.latencyMaxMs >= 10
  ) {
    return "client";
  }

  // Tier 2: Edge — sub-50ms, lightweight inference
  if (model.parametersBillion <= 7 && model.latencyMaxMs >= 50) {
    return "edge";
  }

  // Tier 3: Cloud — full power, heavy inference
  return "cloud";
}
