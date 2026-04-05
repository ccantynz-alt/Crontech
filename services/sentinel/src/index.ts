import { githubReleasesCollector } from "./collectors/github-releases";
import { npmRegistryCollector } from "./collectors/npm-registry";
import { hackernewsCollector } from "./collectors/hackernews";
import { arxivCollector } from "./collectors/arxiv";
import { analyzeThreats } from "./analyzers/threat-analyzer";
import { findOpportunities } from "./analyzers/opportunity-finder";
import { scoutTech } from "./analyzers/tech-scout";
import { type AlertMessage, sendSlackAlert, sendDiscordAlert } from "./alerts/types";
import { reportSuccess, runDeadMansSwitch } from "./dead-mans-switch";
import type { Collector, CollectorResult, IntelligenceItem } from "./collectors/types";

const collectors: Collector[] = [
  githubReleasesCollector,
  npmRegistryCollector,
  hackernewsCollector,
  arxivCollector,
];

async function runCollector(collector: Collector): Promise<CollectorResult> {
  console.log(`[sentinel] Running collector: ${collector.name}`);
  try {
    const result = await collector.collect();
    if (result.success) {
      reportSuccess(collector.name, collector.intervalMs);
    }
    console.log(
      `[sentinel] ${collector.name}: ${result.items.length} items in ${result.durationMs}ms${result.error ? ` (errors: ${result.error})` : ""}`,
    );
    return result;
  } catch (err) {
    console.error(`[sentinel] ${collector.name} failed:`, err);
    return {
      source: collector.name,
      items: [],
      collectedAt: new Date().toISOString(),
      success: false,
      error: err instanceof Error ? err.message : "Unknown error",
      durationMs: 0,
    };
  }
}

async function processIntelligence(items: IntelligenceItem[]): Promise<void> {
  if (items.length === 0) return;

  const threats = analyzeThreats(items);
  const opportunities = findOpportunities(items);
  const techScouting = scoutTech(items);

  console.log(`[sentinel] Analysis: ${threats.length} threats, ${opportunities.length} opportunities, ${techScouting.length} tech signals`);

  // Send critical alerts immediately
  for (const threat of threats) {
    if (threat.threatLevel === "critical" || threat.threatLevel === "high") {
      const alert: AlertMessage = {
        priority: "critical",
        title: threat.item.title,
        body: `${threat.impact}\n\nRecommendation: ${threat.recommendation}`,
        url: threat.item.url,
        timestamp: new Date().toISOString(),
      };
      await sendSlackAlert(alert);
      await sendDiscordAlert(alert);
    }
  }
}

async function runAllCollectors(): Promise<void> {
  const results = await Promise.allSettled(collectors.map(runCollector));
  const allItems: IntelligenceItem[] = [];

  for (const result of results) {
    if (result.status === "fulfilled") {
      allItems.push(...result.value.items);
    }
  }

  await processIntelligence(allItems);
}

function startScheduler(): void {
  console.log("[sentinel] Starting Sentinel competitive intelligence system");
  console.log(`[sentinel] Monitoring ${collectors.length} sources`);

  // Run immediately on start
  void runAllCollectors();

  // Schedule each collector independently
  for (const collector of collectors) {
    setInterval(() => {
      void runCollector(collector).then((result) => {
        if (result.items.length > 0) {
          void processIntelligence(result.items);
        }
      });
    }, collector.intervalMs);
  }

  // Dead man's switch check every 30 minutes
  setInterval(() => {
    void runDeadMansSwitch();
  }, 30 * 60 * 1000);

  console.log("[sentinel] All collectors scheduled. System is active.");
}

startScheduler();
