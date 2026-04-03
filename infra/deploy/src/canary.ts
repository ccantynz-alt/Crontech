export interface DeploymentConfig {
  service: string;
  version: string;
  strategy: "direct" | "canary" | "blue-green";
  canaryPercent?: number;
  soakTimeMs?: number;
  rollbackOnErrorRate?: number;
}

export interface DeploymentStatus {
  id: string;
  service: string;
  version: string;
  strategy: string;
  phase:
    | "deploying"
    | "canary"
    | "soaking"
    | "promoting"
    | "rolling-back"
    | "complete"
    | "failed";
  canaryPercent: number;
  errorRate: number;
  startedAt: string;
  completedAt?: string | undefined;
}

const ARCHITECTURE_PATTERNS: readonly string[] = [
  "infra",
  "migration",
  "database",
  "schema",
  "architecture",
  "breaking",
];

const FEATURE_PATTERNS: readonly string[] = [
  "feat",
  "feature",
  "component",
  "route",
  "endpoint",
  "api",
  "ui",
];

const CONFIG_PATTERNS: readonly string[] = [
  "config",
  "env",
  "flag",
  "toggle",
  "copy",
  "text",
  "style",
  "css",
];

function matchesAny(value: string, patterns: readonly string[]): boolean {
  const lower = value.toLowerCase();
  return patterns.some((pattern) => lower.includes(pattern));
}

export function classifyDeploymentRisk(
  changes: string[],
): "low" | "medium" | "high" {
  let risk: "low" | "medium" | "high" = "low";

  for (const change of changes) {
    if (matchesAny(change, ARCHITECTURE_PATTERNS)) {
      return "high";
    }
    if (matchesAny(change, FEATURE_PATTERNS)) {
      risk = "medium";
    }
    if (risk === "low" && matchesAny(change, CONFIG_PATTERNS)) {
      risk = "low";
    }
  }

  return risk;
}

export function recommendStrategy(
  risk: "low" | "medium" | "high",
): DeploymentConfig["strategy"] {
  switch (risk) {
    case "low":
      return "direct";
    case "medium":
      return "canary";
    case "high":
      return "blue-green";
  }
}

let deploymentCounter = 0;

export function createDeployment(config: DeploymentConfig): DeploymentStatus {
  deploymentCounter += 1;
  const id = `deploy-${config.service}-${deploymentCounter.toString().padStart(4, "0")}`;

  const canaryPercent =
    config.strategy === "canary" ? (config.canaryPercent ?? 5) : 0;

  const phase: DeploymentStatus["phase"] =
    config.strategy === "direct" ? "complete" : "deploying";

  const status: DeploymentStatus = {
    id,
    service: config.service,
    version: config.version,
    strategy: config.strategy,
    phase,
    canaryPercent: config.strategy === "direct" ? 100 : canaryPercent,
    errorRate: 0,
    startedAt: new Date().toISOString(),
  };
  if (config.strategy === "direct") {
    status.completedAt = new Date().toISOString();
  }
  return status;
}

const DEFAULT_ERROR_RATE_THRESHOLD = 0.05;

export function shouldRollback(status: DeploymentStatus): boolean {
  const threshold = DEFAULT_ERROR_RATE_THRESHOLD;
  return status.errorRate > threshold;
}

export function promoteCanary(status: DeploymentStatus): DeploymentStatus {
  if (status.phase === "failed" || status.phase === "rolling-back") {
    return {
      ...status,
      phase: "failed",
    };
  }

  return {
    ...status,
    phase: "complete",
    canaryPercent: 100,
    completedAt: new Date().toISOString(),
  };
}
