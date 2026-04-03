import type {
  IntelligenceItem,
  ThreatLevel,
  WeeklyBrief,
} from "../schemas/index.js";

/**
 * Threat level priority for sorting. Higher number = more severe.
 */
const THREAT_PRIORITY: Record<ThreatLevel, number> = {
  low: 0,
  medium: 1,
  high: 2,
  critical: 3,
};

/**
 * Determine the overall threat level from a collection of intelligence items.
 * Uses the highest individual threat level found.
 */
function computeOverallThreat(items: readonly IntelligenceItem[]): ThreatLevel {
  let maxPriority = 0;
  for (const item of items) {
    const priority = THREAT_PRIORITY[item.threatLevel] ?? 0;
    if (priority > maxPriority) {
      maxPriority = priority;
    }
  }

  if (maxPriority >= 3) return "critical";
  if (maxPriority >= 2) return "high";
  if (maxPriority >= 1) return "medium";
  return "low";
}

/**
 * Generate actionable recommendations based on intelligence items.
 */
function generateRecommendations(
  items: readonly IntelligenceItem[],
): string[] {
  const recommendations: string[] = [];
  const criticalItems = items.filter((i) => i.threatLevel === "critical");
  const highItems = items.filter((i) => i.threatLevel === "high");
  const actionableItems = items.filter((i) => i.actionRequired);

  if (criticalItems.length > 0) {
    recommendations.push(
      `URGENT: ${criticalItems.length.toString()} critical threat(s) detected. Immediate review of: ${criticalItems.map((i) => i.title).join(", ")}`,
    );
  }

  if (highItems.length > 0) {
    recommendations.push(
      `Review ${highItems.length.toString()} high-priority item(s) for competitive impact assessment.`,
    );
  }

  // Group by source for source-specific recommendations
  const sourceGroups = new Map<string, IntelligenceItem[]>();
  for (const item of items) {
    const sourceKey = item.source.split(":")[0] ?? item.source;
    const existing = sourceGroups.get(sourceKey) ?? [];
    existing.push(item);
    sourceGroups.set(sourceKey, existing);
  }

  const githubItems = sourceGroups.get("github") ?? [];
  if (githubItems.length > 0) {
    const repos = [
      ...new Set(githubItems.map((i) => i.source.replace("github:", ""))),
    ];
    recommendations.push(
      `${githubItems.length.toString()} GitHub release(s) from: ${repos.join(", ")}. Review changelogs for new capabilities entering our whitespace.`,
    );
  }

  const arxivItems = sourceGroups.get("arxiv") ?? [];
  if (arxivItems.length > 0) {
    const highRelevance = arxivItems.filter((i) => i.relevance > 0.5);
    if (highRelevance.length > 0) {
      recommendations.push(
        `${highRelevance.length.toString()} highly relevant ArXiv paper(s). Evaluate for potential integration into our AI pipeline.`,
      );
    }
  }

  // Collect suggested actions from actionable items
  for (const item of actionableItems) {
    if (item.suggestedAction) {
      recommendations.push(item.suggestedAction);
    }
  }

  if (recommendations.length === 0) {
    recommendations.push(
      "No immediate threats detected. Continue monitoring. Maintain current development velocity.",
    );
  }

  return recommendations;
}

/**
 * Build a threat assessment details string.
 */
function buildThreatDetails(items: readonly IntelligenceItem[]): string {
  const byLevel: Record<ThreatLevel, number> = {
    critical: 0,
    high: 0,
    medium: 0,
    low: 0,
  };

  for (const item of items) {
    const level = item.threatLevel;
    if (level in byLevel) {
      (byLevel as Record<string, number>)[level] = ((byLevel as Record<string, number>)[level] ?? 0) + 1;
    }
  }

  const parts: string[] = [];
  if (byLevel.critical > 0) {
    parts.push(`${String(byLevel.critical)} critical`);
  }
  if (byLevel.high > 0) {
    parts.push(`${String(byLevel.high)} high`);
  }
  if (byLevel.medium > 0) {
    parts.push(`${String(byLevel.medium)} medium`);
  }
  if (byLevel.low > 0) {
    parts.push(`${String(byLevel.low)} low`);
  }

  return `${items.length.toString()} total intelligence items: ${parts.join(", ")}.`;
}

/**
 * Generate a weekly intelligence brief from collected intelligence items.
 *
 * This function synthesizes all intelligence gathered during the week into
 * a structured brief with executive summary, threat assessment, categorized
 * activity, and actionable recommendations.
 */
export function generateWeeklyBrief(
  allItems: readonly IntelligenceItem[],
  periodStart: Date,
  periodEnd: Date,
): WeeklyBrief {
  // Sort items by threat level (highest first), then by relevance
  const sorted = [...allItems].sort((a, b) => {
    const threatDiff =
      (THREAT_PRIORITY[b.threatLevel] ?? 0) - (THREAT_PRIORITY[a.threatLevel] ?? 0);
    if (threatDiff !== 0) return threatDiff;
    return b.relevance - a.relevance;
  });

  const overallThreat = computeOverallThreat(sorted);
  const recommendations = generateRecommendations(sorted);

  // Separate competitor activity from technology trends
  const competitorActivity = sorted.filter(
    (i) =>
      i.source.startsWith("github:") || i.source.startsWith("npm:"),
  );
  const technologyTrends = sorted.filter(
    (i) => i.source === "hackernews" || i.source === "arxiv",
  );

  // Build executive summary
  const criticalCount = sorted.filter(
    (i) => i.threatLevel === "critical",
  ).length;
  const highCount = sorted.filter((i) => i.threatLevel === "high").length;

  let executiveSummary: string;
  if (criticalCount > 0) {
    executiveSummary = `ALERT: ${criticalCount.toString()} critical threat(s) detected this week. ${highCount.toString()} high-priority items require attention. Immediate review recommended.`;
  } else if (highCount > 0) {
    executiveSummary = `${highCount.toString()} high-priority item(s) detected this week. ${sorted.length.toString()} total intelligence items collected across all sources. Review recommended within 48 hours.`;
  } else {
    executiveSummary = `${sorted.length.toString()} intelligence items collected. No critical or high-priority threats detected. Competitive landscape stable. Continue current trajectory.`;
  }

  return {
    generatedAt: new Date().toISOString(),
    periodStart: periodStart.toISOString(),
    periodEnd: periodEnd.toISOString(),
    executiveSummary,
    threatAssessment: {
      overall: overallThreat,
      details: buildThreatDetails(sorted),
    },
    competitorActivity,
    technologyTrends,
    recommendations,
  };
}

/**
 * Format a weekly brief as a human-readable string suitable for
 * Slack/Discord delivery.
 */
export function formatBriefForAlert(brief: WeeklyBrief): string {
  const lines: string[] = [];

  lines.push("=== WEEKLY INTELLIGENCE BRIEF ===");
  lines.push(`Period: ${brief.periodStart.slice(0, 10)} to ${brief.periodEnd.slice(0, 10)}`);
  lines.push(`Generated: ${brief.generatedAt.slice(0, 19)}`);
  lines.push("");
  lines.push(`EXECUTIVE SUMMARY: ${brief.executiveSummary}`);
  lines.push("");
  lines.push(
    `THREAT LEVEL: ${brief.threatAssessment.overall.toUpperCase()}`,
  );
  lines.push(brief.threatAssessment.details);
  lines.push("");

  if (brief.competitorActivity.length > 0) {
    lines.push(
      `COMPETITOR ACTIVITY (${brief.competitorActivity.length.toString()} items):`,
    );
    for (const item of brief.competitorActivity.slice(0, 10)) {
      const marker =
        item.threatLevel === "critical"
          ? "[!!!]"
          : item.threatLevel === "high"
            ? "[!!]"
            : item.threatLevel === "medium"
              ? "[!]"
              : "[-]";
      lines.push(`  ${marker} ${item.title}`);
    }
    if (brief.competitorActivity.length > 10) {
      lines.push(
        `  ... and ${(brief.competitorActivity.length - 10).toString()} more`,
      );
    }
    lines.push("");
  }

  if (brief.technologyTrends.length > 0) {
    lines.push(
      `TECHNOLOGY TRENDS (${brief.technologyTrends.length.toString()} items):`,
    );
    for (const item of brief.technologyTrends.slice(0, 10)) {
      lines.push(`  - ${item.title} (${item.source})`);
    }
    if (brief.technologyTrends.length > 10) {
      lines.push(
        `  ... and ${(brief.technologyTrends.length - 10).toString()} more`,
      );
    }
    lines.push("");
  }

  lines.push(`RECOMMENDATIONS (${brief.recommendations.length.toString()}):`);
  for (const rec of brief.recommendations) {
    lines.push(`  > ${rec}`);
  }

  return lines.join("\n");
}
