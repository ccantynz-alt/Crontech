import {
  checkGitHubReleases,
  TRACKED_REPOS,
} from "./collectors/github-releases.js";
import {
  checkNpmVersions,
  TRACKED_PACKAGES,
} from "./collectors/npm-versions.js";
import { sendSlackAlert } from "./alerts/slack.js";
import type { SentinelConfig } from "./types.js";

/** Default configuration — check GitHub every 6 hours, npm every hour. */
const DEFAULT_CONFIG: SentinelConfig = {
  githubIntervalMs: 6 * 60 * 60 * 1000,
  npmIntervalMs: 60 * 60 * 1000,
  slackWebhookUrl: process.env["SLACK_WEBHOOK_URL"],
};

function timestamp(): string {
  return new Date().toISOString();
}

async function runGitHubCheck(config: SentinelConfig): Promise<void> {
  console.log(`[${timestamp()}] [sentinel] Running GitHub release check…`);
  const releases = await checkGitHubReleases(TRACKED_REPOS);

  for (const release of releases) {
    console.log(
      `[${timestamp()}] [sentinel] ${release.repo} — ${release.tag} (${release.publishedAt})`,
    );
  }

  if (releases.length > 0 && config.slackWebhookUrl) {
    const summary = releases
      .map((r) => `• ${r.repo} → ${r.tag}`)
      .join("\n");
    await sendSlackAlert(config.slackWebhookUrl, {
      channel: "#sentinel-daily",
      text: `GitHub release check:\n${summary}`,
      severity: "info",
    });
  }

  console.log(
    `[${timestamp()}] [sentinel] GitHub check complete — ${releases.length.toString()} releases found.`,
  );
}

async function runNpmCheck(config: SentinelConfig): Promise<void> {
  console.log(`[${timestamp()}] [sentinel] Running npm version check…`);
  const versions = await checkNpmVersions(TRACKED_PACKAGES);

  for (const pkg of versions) {
    console.log(
      `[${timestamp()}] [sentinel] ${pkg.name} — v${pkg.version} (${pkg.publishedAt})`,
    );
  }

  if (versions.length > 0 && config.slackWebhookUrl) {
    const summary = versions
      .map((v) => `• ${v.name} → v${v.version}`)
      .join("\n");
    await sendSlackAlert(config.slackWebhookUrl, {
      channel: "#sentinel-daily",
      text: `npm version check:\n${summary}`,
      severity: "info",
    });
  }

  console.log(
    `[${timestamp()}] [sentinel] npm check complete — ${versions.length.toString()} packages found.`,
  );
}

/**
 * Start the Sentinel competitive intelligence system.
 *
 * Runs an initial check immediately, then schedules recurring checks
 * using `setInterval`. Returns a cleanup function that clears all timers.
 */
export function startSentinel(
  config: SentinelConfig = DEFAULT_CONFIG,
): () => void {
  console.log(`[${timestamp()}] [sentinel] Starting Sentinel system…`);
  console.log(
    `[${timestamp()}] [sentinel] GitHub check interval: ${(config.githubIntervalMs / 1000 / 60).toString()} minutes`,
  );
  console.log(
    `[${timestamp()}] [sentinel] npm check interval: ${(config.npmIntervalMs / 1000 / 60).toString()} minutes`,
  );

  // Run initial checks immediately (fire and forget — errors are logged inside).
  void runGitHubCheck(config);
  void runNpmCheck(config);

  // Schedule recurring checks.
  const githubTimer = setInterval(() => {
    void runGitHubCheck(config);
  }, config.githubIntervalMs);

  const npmTimer = setInterval(() => {
    void runNpmCheck(config);
  }, config.npmIntervalMs);

  console.log(`[${timestamp()}] [sentinel] Sentinel system is running.`);

  return (): void => {
    clearInterval(githubTimer);
    clearInterval(npmTimer);
    console.log(`[${timestamp()}] [sentinel] Sentinel system stopped.`);
  };
}

// When executed directly, start the sentinel and keep the process alive.
startSentinel();
