import { z } from "zod";
import { checkGitHubReleases, type CollectorResult } from "./collectors/github-monitor.js";
import { checkNpmVersions, type NpmCollectorResult } from "./collectors/npm-monitor.js";
import {
  checkHackerNews,
  checkArxiv,
  type HnCollectorResult,
  type ArxivCollectorResult,
} from "./collectors/tech-news.js";
import { analyzeThreat, type ThreatAnalysis } from "./analyzers/threat-analyzer.js";
import { findOpportunities, type OpportunityResult } from "./analyzers/opportunity-finder.js";
import { sendSlackAlert } from "./alerts/slack-webhook.js";
import { DeadManSwitch } from "./alerts/dead-man-switch.js";

// --- Zod Schemas ---

export const SentinelCycleResultSchema = z.object({
  github: z.custom<CollectorResult>(),
  npm: z.custom<NpmCollectorResult>(),
  hackerNews: z.custom<HnCollectorResult>(),
  arxiv: z.custom<ArxivCollectorResult>(),
  threats: z.array(z.custom<ThreatAnalysis>()),
  opportunities: z.custom<OpportunityResult>(),
  cycleStartedAt: z.string().datetime(),
  cycleCompletedAt: z.string().datetime(),
  durationMs: z.number(),
});

export type SentinelCycleResult = z.infer<typeof SentinelCycleResultSchema>;

// --- Global dead man switch instance ---

const deadManSwitch = new DeadManSwitch();

/**
 * Run a single Sentinel intelligence cycle.
 *
 * 1. Collect data from all sources (GitHub, npm, HN, ArXiv)
 * 2. Analyze threats from GitHub releases
 * 3. Find opportunities across all releases
 * 4. Send alerts for critical/high threats
 * 5. Check in with the dead man's switch
 */
export async function runSentinelCycle(): Promise<SentinelCycleResult> {
  const cycleStartedAt = new Date().toISOString();
  const startTime = Date.now();

  // Step 1: Run all collectors in parallel
  const [github, npm, hackerNews, arxiv] = await Promise.all([
    checkGitHubReleases(),
    checkNpmVersions(),
    checkHackerNews(100),
    checkArxiv(["cs.AI", "cs.LG", "cs.CL"]),
  ]);

  // Check in collectors with dead man's switch
  deadManSwitch.checkin("github");
  deadManSwitch.checkin("npm");
  deadManSwitch.checkin("hackernews");
  deadManSwitch.checkin("arxiv");

  // Step 2: Analyze threats from GitHub releases
  const threats: ThreatAnalysis[] = [];

  for (const release of github.releases) {
    const analysis = await analyzeThreat({
      repo: release.repo,
      version: release.tagName,
      notes: release.body ?? release.name ?? "",
    });
    threats.push(analysis);
  }

  // Step 3: Find opportunities
  const releaseInfos = github.releases.map((r) => ({
    repo: r.repo,
    version: r.tagName,
  }));
  const opportunities = findOpportunities(releaseInfos);

  // Step 4: Send alerts for critical/high threats
  const criticalThreats = threats.filter(
    (t) => t.threatLevel === "critical" || t.threatLevel === "high",
  );

  for (const threat of criticalThreats) {
    const severity =
      threat.threatLevel === "critical" ? "critical" : "warning";
    await sendSlackAlert(
      "#sentinel-critical",
      `*${threat.repo}* released *${threat.version}*\n\n${threat.summary}\n\n*Impact:* ${threat.impactAreas.join(", ")}\n*Response:* ${threat.recommendedResponse}`,
      severity,
    );
  }

  // Step 5: Send daily digest if there are results
  const totalReleases = github.releases.length;
  const totalPackages = npm.packages.length;
  const totalStories = hackerNews.stories.length;
  const totalPapers = arxiv.papers.length;

  if (totalReleases + totalPackages + totalStories + totalPapers > 0) {
    await sendSlackAlert(
      "#sentinel-daily",
      `*Sentinel Cycle Complete*\n\n` +
        `- GitHub releases tracked: ${totalReleases}\n` +
        `- npm packages checked: ${totalPackages}\n` +
        `- HN stories (100+ pts): ${totalStories}\n` +
        `- ArXiv papers: ${totalPapers}\n` +
        `- Threats identified: ${threats.length} (${criticalThreats.length} critical/high)\n` +
        `- Opportunities found: ${opportunities.opportunities.length}`,
      "info",
    );
  }

  const cycleCompletedAt = new Date().toISOString();
  const durationMs = Date.now() - startTime;

  return {
    github,
    npm,
    hackerNews,
    arxiv,
    threats,
    opportunities,
    cycleStartedAt,
    cycleCompletedAt,
    durationMs,
  };
}

/**
 * Start continuous Sentinel monitoring.
 *
 * Runs a collection cycle at the specified interval.
 * Also starts the dead man's switch to monitor collector health.
 */
export function startSentinel(intervalHours: number = 6): {
  stop: () => void;
  deadManSwitch: DeadManSwitch;
} {
  z.number().positive().parse(intervalHours);

  const intervalMs = intervalHours * 60 * 60 * 1000;

  // Start the dead man's switch (checks every minute)
  deadManSwitch.startMonitoring(60_000);

  // Run first cycle immediately
  void runSentinelCycle().catch((err: unknown) => {
    const msg = err instanceof Error ? err.message : String(err);
    console.error(`[Sentinel] Cycle failed: ${msg}`);
    void sendSlackAlert(
      "#sentinel-critical",
      `Sentinel cycle failed: ${msg}`,
      "critical",
    );
  });

  // Schedule recurring cycles
  const timer = setInterval(() => {
    void runSentinelCycle().catch((err: unknown) => {
      const msg = err instanceof Error ? err.message : String(err);
      console.error(`[Sentinel] Cycle failed: ${msg}`);
      void sendSlackAlert(
        "#sentinel-critical",
        `Sentinel cycle failed: ${msg}`,
        "critical",
      );
    });
  }, intervalMs);

  return {
    stop: (): void => {
      clearInterval(timer);
      deadManSwitch.stopMonitoring();
    },
    deadManSwitch,
  };
}

// Re-export everything for convenience
export { checkGitHubReleases } from "./collectors/github-monitor.js";
export { checkNpmVersions } from "./collectors/npm-monitor.js";
export { checkHackerNews, checkArxiv } from "./collectors/tech-news.js";
export { analyzeThreat } from "./analyzers/threat-analyzer.js";
export { findOpportunities } from "./analyzers/opportunity-finder.js";
export { sendSlackAlert } from "./alerts/slack-webhook.js";
export { DeadManSwitch } from "./alerts/dead-man-switch.js";
