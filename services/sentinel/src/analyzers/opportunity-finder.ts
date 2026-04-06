import type { IntelligenceItem } from "../collectors/types";

export interface Opportunity {
  item: IntelligenceItem;
  opportunityType: "integration" | "differentiation" | "acquisition" | "improvement";
  description: string;
  actionable: boolean;
}

export function findOpportunities(items: IntelligenceItem[]): Opportunity[] {
  const opportunities: Opportunity[] = [];

  for (const item of items) {
    const text = `${item.title} ${item.description}`.toLowerCase();

    if (text.includes("deprecated") || text.includes("end of life")) {
      opportunities.push({
        item,
        opportunityType: "differentiation",
        description: `Competitor technology being deprecated. Opportunity to capture users migrating away.`,
        actionable: true,
      });
    }

    if (text.includes("breaking change") || text.includes("migration")) {
      opportunities.push({
        item,
        opportunityType: "acquisition",
        description: `Breaking changes creating user churn. Target displaced users.`,
        actionable: true,
      });
    }

    if (text.includes("new api") || text.includes("new feature")) {
      opportunities.push({
        item,
        opportunityType: "integration",
        description: `New capability available for potential integration.`,
        actionable: false,
      });
    }
  }

  return opportunities;
}
