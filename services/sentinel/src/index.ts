import {
  checkGitHubReleases,
  TRACKED_REPOS,
} from "./collectors/github-releases.js";
import {
  checkNpmVersions,
  TRACKED_PACKAGES,
} from "./collectors/npm-versions.js";
import { fetchTechNews } from "./collectors/tech-news.js";
import { DeadManSwitch } from "./collectors/dead-man-switch.js";
import { AlertDispatcher } from "./alerts/dispatcher.js";
import {
  analyzeReleases,
  analyzePackageVersions,
  analyzeTechNews,
} from "./analyzers/threat-analyzer.js";
import {
  generateWeeklyBrief,
  formatBriefForAlert,
} from "./analyzers/weekly-brief.js";
import { SentinelConfigSchema } from "./schemas/index.js";
import type { SentinelConfig, IntelligenceItem } from "./schemas/index.js";

function timestamp(): string {
  return new Date().toISOString();
}

/**
 * The Sentinel competitive intelligence engine.
 *
 * Orchestrates collectors (GitHub, npm, HN, ArXiv), threat analysis,
 * alerting (Slack, Discord), the dead-man's switch, and weekly brief
 * generation. Runs continuously as a long-lived process.
 */
export class Sentinel {
  private readonly config: SentinelConfig;
  private readonly dispatcher: AlertDispatcher;
  private readonly deadManSwitch: DeadManSwitch;
  private readonly weeklyIntelligence: IntelligenceItem[] = [];
  private readonly cleanupFns: Array<() => void> = [];
  private weeklyBriefTimer: ReturnType<typeof setInterval> | null = null;

  constructor(config?: Partial<SentinelConfig>) {
    this.config = SentinelConfigSchema.parse(config ?? {});

    const dispatcherConfig: Record<string, string> = {};
    if (this.config.slackWebhookUrl) {
      dispatcherConfig["slackWebhookUrl"] = this.config.slackWebhookUrl;
    }
    if (this.config.discordWebhookUrl) {
      dispatcherConfig["discordWebhookUrl"] = this.config.discordWebhookUrl;
    }
    this.dispatcher = new AlertDispatcher(dispatcherConfig as ConstructorParameters<typeof AlertDispatcher>[0]);

    this.deadManSwitch = new DeadManSwitch({
      maxSilenceMs: this.config.deadManMaxSilenceMs,
      checkIntervalMs: this.config.deadManCheckIntervalMs,
    });

    // Register all collectors with the dead-man's switch.
    this.deadManSwitch.registerCollector("github-releases");
    this.deadManSwitch.registerCollector("npm-versions");
    this.deadManSwitch.registerCollector("tech-news");

    // Wire dead-man's switch alerts to the dispatcher.
    this.deadManSwitch.onAlert((unhealthy) => {
      const names = unhealthy.map((s) => s.collectorName).join(", ");
      const failures = unhealthy
        .map(
          (s) =>
            `${s.collectorName}: ${s.consecutiveFailures.toString()} consecutive failures, last success: ${s.lastSuccessAt ?? "never"}`,
        )
        .join("\n");

      void this.dispatcher.critical(
        "Dead-Man's Switch Alert: Collector(s) Unresponsive",
        `The following collector(s) have gone silent: ${names}\n\n${failures}`,
      );
    });
  }

  /**
   * Run the GitHub release collector and analyze results.
   */
  private async runGitHubCheck(): Promise<void> {
    console.log(`[${timestamp()}] [sentinel] Running GitHub release check...`);
    try {
      const releases = await checkGitHubReleases(TRACKED_REPOS);
      this.deadManSwitch.recordSuccess("github-releases");

      for (const release of releases) {
        console.log(
          `[${timestamp()}] [sentinel] ${release.repo} -- ${release.tag} (${release.publishedAt})`,
        );
      }

      // Analyze and store intelligence
      const intelligence = analyzeReleases(releases);
      this.weeklyIntelligence.push(...intelligence);

      // Alert on critical/high items immediately
      const urgent = intelligence.filter(
        (i) => i.threatLevel === "critical" || i.threatLevel === "high",
      );
      for (const item of urgent) {
        await this.dispatcher.critical(item.title, item.summary);
      }

      // Daily digest
      if (releases.length > 0) {
        const summary = releases
          .map((r) => `* ${r.repo} -> ${r.tag}`)
          .join("\n");
        await this.dispatcher.info(
          "GitHub Release Check",
          `${releases.length.toString()} release(s) found:\n${summary}`,
        );
      }

      console.log(
        `[${timestamp()}] [sentinel] GitHub check complete -- ${releases.length.toString()} releases found.`,
      );
    } catch (error: unknown) {
      this.deadManSwitch.recordFailure("github-releases");
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[${timestamp()}] [sentinel] GitHub check failed: ${message}`,
      );
    }
  }

  /**
   * Run the npm version collector and analyze results.
   */
  private async runNpmCheck(): Promise<void> {
    console.log(`[${timestamp()}] [sentinel] Running npm version check...`);
    try {
      const versions = await checkNpmVersions(TRACKED_PACKAGES);
      this.deadManSwitch.recordSuccess("npm-versions");

      for (const pkg of versions) {
        console.log(
          `[${timestamp()}] [sentinel] ${pkg.name} -- v${pkg.version} (${pkg.publishedAt})`,
        );
      }

      // Analyze and store intelligence
      const intelligence = analyzePackageVersions(versions);
      this.weeklyIntelligence.push(...intelligence);

      // Alert on critical/high items immediately
      const urgent = intelligence.filter(
        (i) => i.threatLevel === "critical" || i.threatLevel === "high",
      );
      for (const item of urgent) {
        await this.dispatcher.critical(item.title, item.summary);
      }

      if (versions.length > 0) {
        const summary = versions
          .map((v) => `* ${v.name} -> v${v.version}`)
          .join("\n");
        await this.dispatcher.info(
          "npm Version Check",
          `${versions.length.toString()} package(s) found:\n${summary}`,
        );
      }

      console.log(
        `[${timestamp()}] [sentinel] npm check complete -- ${versions.length.toString()} packages found.`,
      );
    } catch (error: unknown) {
      this.deadManSwitch.recordFailure("npm-versions");
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[${timestamp()}] [sentinel] npm check failed: ${message}`,
      );
    }
  }

  /**
   * Run the tech news collector (HN + ArXiv) and analyze results.
   */
  private async runTechNewsCheck(): Promise<void> {
    console.log(`[${timestamp()}] [sentinel] Running tech news check...`);
    try {
      const items = await fetchTechNews({
        hnMinScore: this.config.hnMinScore,
        arxivCategories: this.config.arxivCategories,
      });
      this.deadManSwitch.recordSuccess("tech-news");

      const hnCount = items.filter((i) => i.source === "hackernews").length;
      const arxivCount = items.filter((i) => i.source === "arxiv").length;

      console.log(
        `[${timestamp()}] [sentinel] Tech news: ${hnCount.toString()} HN items, ${arxivCount.toString()} ArXiv papers`,
      );

      // Analyze and store intelligence
      const intelligence = analyzeTechNews(items);
      this.weeklyIntelligence.push(...intelligence);

      // Alert on critical/high items immediately
      const urgent = intelligence.filter(
        (i) => i.threatLevel === "critical" || i.threatLevel === "high",
      );
      for (const item of urgent) {
        await this.dispatcher.critical(item.title, item.summary);
      }

      if (items.length > 0) {
        const hnSummary = items
          .filter((i) => i.source === "hackernews")
          .slice(0, 5)
          .map((i) => {
            if (i.source === "hackernews") {
              return `* [HN ${i.item.score.toString()}pts] ${i.item.title}`;
            }
            return "";
          })
          .filter(Boolean)
          .join("\n");

        const arxivSummary = items
          .filter((i) => i.source === "arxiv")
          .slice(0, 5)
          .map((i) => {
            if (i.source === "arxiv") {
              return `* [ArXiv] ${i.item.title}`;
            }
            return "";
          })
          .filter(Boolean)
          .join("\n");

        const combined = [hnSummary, arxivSummary].filter(Boolean).join("\n");
        await this.dispatcher.info(
          "Tech News Scan",
          `${items.length.toString()} item(s) found:\n${combined}`,
        );
      }

      console.log(
        `[${timestamp()}] [sentinel] Tech news check complete.`,
      );
    } catch (error: unknown) {
      this.deadManSwitch.recordFailure("tech-news");
      const message = error instanceof Error ? error.message : String(error);
      console.error(
        `[${timestamp()}] [sentinel] Tech news check failed: ${message}`,
      );
    }
  }

  /**
   * Generate and send the weekly intelligence brief.
   */
  private async generateAndSendWeeklyBrief(): Promise<void> {
    console.log(
      `[${timestamp()}] [sentinel] Generating weekly intelligence brief...`,
    );

    const now = new Date();
    const oneWeekAgo = new Date(now.getTime() - 7 * 24 * 60 * 60 * 1000);

    const brief = generateWeeklyBrief(
      this.weeklyIntelligence,
      oneWeekAgo,
      now,
    );
    const formatted = formatBriefForAlert(brief);

    await this.dispatcher.weekly("Weekly Intelligence Brief", formatted);

    // Clear the intelligence buffer for the next week.
    this.weeklyIntelligence.length = 0;

    console.log(
      `[${timestamp()}] [sentinel] Weekly brief sent. ${brief.competitorActivity.length.toString()} competitor items, ${brief.technologyTrends.length.toString()} trend items.`,
    );
  }

  /**
   * Start the Sentinel system. Runs all collectors immediately, then
   * schedules recurring checks. Returns a cleanup function.
   */
  start(): () => void {
    console.log(`[${timestamp()}] [sentinel] Starting Sentinel system...`);
    console.log(
      `[${timestamp()}] [sentinel] GitHub interval: ${(this.config.githubIntervalMs / 1000 / 60).toFixed(0)} min`,
    );
    console.log(
      `[${timestamp()}] [sentinel] npm interval: ${(this.config.npmIntervalMs / 1000 / 60).toFixed(0)} min`,
    );
    console.log(
      `[${timestamp()}] [sentinel] Tech news interval: ${(this.config.techNewsIntervalMs / 1000 / 60).toFixed(0)} min`,
    );
    console.log(
      `[${timestamp()}] [sentinel] Weekly brief day: ${this.config.weeklyBriefCronDay.toString()} (0=Sun, 1=Mon, ...)`,
    );

    // Run initial checks immediately.
    void this.runGitHubCheck();
    void this.runNpmCheck();
    void this.runTechNewsCheck();

    // Schedule recurring checks.
    const githubTimer = setInterval(() => {
      void this.runGitHubCheck();
    }, this.config.githubIntervalMs);

    const npmTimer = setInterval(() => {
      void this.runNpmCheck();
    }, this.config.npmIntervalMs);

    const techNewsTimer = setInterval(() => {
      void this.runTechNewsCheck();
    }, this.config.techNewsIntervalMs);

    // Start dead-man's switch.
    const stopDeadMan = this.deadManSwitch.start();
    this.cleanupFns.push(stopDeadMan);

    // Schedule weekly brief: check every hour if it is the right day and hour.
    this.weeklyBriefTimer = setInterval(() => {
      const now = new Date();
      // Fire at 9 AM on the configured day.
      if (
        now.getDay() === this.config.weeklyBriefCronDay &&
        now.getHours() === 9 &&
        now.getMinutes() < 60
      ) {
        void this.generateAndSendWeeklyBrief();
      }
    }, 60 * 60 * 1000);

    console.log(`[${timestamp()}] [sentinel] Sentinel system is running.`);

    return (): void => {
      clearInterval(githubTimer);
      clearInterval(npmTimer);
      clearInterval(techNewsTimer);
      if (this.weeklyBriefTimer !== null) {
        clearInterval(this.weeklyBriefTimer);
      }
      for (const cleanup of this.cleanupFns) {
        cleanup();
      }
      console.log(`[${timestamp()}] [sentinel] Sentinel system stopped.`);
    };
  }

  /**
   * Manually trigger a weekly brief generation (for testing or on-demand).
   */
  async triggerWeeklyBrief(): Promise<void> {
    await this.generateAndSendWeeklyBrief();
  }

  /**
   * Get the current dead-man's switch statuses.
   */
  getCollectorStatuses(): ReturnType<DeadManSwitch["getStatuses"]> {
    return this.deadManSwitch.getStatuses();
  }
}

// ---------------------------------------------------------------------------
// Re-export everything for external consumption.
// ---------------------------------------------------------------------------
export { checkGitHubReleases, TRACKED_REPOS } from "./collectors/github-releases.js";
export { checkNpmVersions, TRACKED_PACKAGES } from "./collectors/npm-versions.js";
export {
  fetchHackerNewsTop,
  fetchArxivPapers,
  fetchTechNews,
} from "./collectors/tech-news.js";
export { DeadManSwitch } from "./collectors/dead-man-switch.js";
export { sendSlackAlert } from "./alerts/slack.js";
export { sendDiscordAlert, buildDiscordMessage } from "./alerts/discord.js";
export { AlertDispatcher } from "./alerts/dispatcher.js";
export {
  analyzeReleases,
  analyzePackageVersions,
  analyzeTechNews,
} from "./analyzers/threat-analyzer.js";
export {
  generateWeeklyBrief,
  formatBriefForAlert,
} from "./analyzers/weekly-brief.js";
export * from "./schemas/index.js";

// ---------------------------------------------------------------------------
// Direct execution: start the sentinel with environment-based config.
// ---------------------------------------------------------------------------
const sentinel = new Sentinel({
  slackWebhookUrl: process.env["SLACK_WEBHOOK_URL"],
  discordWebhookUrl: process.env["DISCORD_WEBHOOK_URL"],
});
sentinel.start();
