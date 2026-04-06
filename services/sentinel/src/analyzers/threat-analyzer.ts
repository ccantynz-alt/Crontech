import type { IntelligenceItem } from "../collectors/types";

export interface ThreatAnalysis {
  item: IntelligenceItem;
  threatLevel: "none" | "low" | "medium" | "high" | "critical";
  impact: string;
  recommendation: string;
}

const CRITICAL_KEYWORDS = ["webgpu", "browser inference", "solid", "crdt", "edge ai"];
const HIGH_KEYWORDS = ["web framework", "ai sdk", "real-time", "collaboration"];

export function analyzeThreat(item: IntelligenceItem): ThreatAnalysis {
  const text = `${item.title} ${item.description}`.toLowerCase();

  let threatLevel: ThreatAnalysis["threatLevel"] = "none";
  let impact = "No direct impact on our platform.";
  let recommendation = "Monitor only.";

  for (const kw of CRITICAL_KEYWORDS) {
    if (text.includes(kw)) {
      threatLevel = "high";
      impact = `Directly relevant to our ${kw} capabilities.`;
      recommendation = `Review immediately. Assess if this affects our competitive position.`;
      break;
    }
  }

  if (threatLevel === "none") {
    for (const kw of HIGH_KEYWORDS) {
      if (text.includes(kw)) {
        threatLevel = "medium";
        impact = `Potentially relevant to our ${kw} strategy.`;
        recommendation = "Include in weekly review.";
        break;
      }
    }
  }

  if (item.severity === "critical") {
    threatLevel = "critical";
    recommendation = "Immediate review required. Major competitor release.";
  }

  return { item, threatLevel, impact, recommendation };
}

export function analyzeThreats(items: IntelligenceItem[]): ThreatAnalysis[] {
  return items.map(analyzeThreat).filter((a) => a.threatLevel !== "none");
}
