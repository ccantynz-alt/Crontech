import type { AlertPayload, AlertSeverity } from "../schemas/index.js";
import { sendSlackAlert } from "./slack.js";
import { sendDiscordAlert, buildDiscordMessage } from "./discord.js";

interface DispatcherConfig {
  slackWebhookUrl?: string;
  discordWebhookUrl?: string;
}

/**
 * Unified alert dispatcher that routes alerts to Slack, Discord, or both.
 *
 * Provides a single interface for the entire sentinel system to send alerts
 * regardless of the downstream target. Handles failures gracefully -- if
 * one target fails, the other still receives the alert.
 */
export class AlertDispatcher {
  private readonly config: DispatcherConfig;

  constructor(config: DispatcherConfig) {
    this.config = config;
  }

  /**
   * Dispatch an alert to the configured targets.
   */
  async dispatch(payload: AlertPayload): Promise<void> {
    const errors: string[] = [];
    const channel = payload.channel ?? this.defaultChannel(payload.severity);

    const shouldSlack =
      payload.target === "slack" || payload.target === "both";
    const shouldDiscord =
      payload.target === "discord" || payload.target === "both";

    if (shouldSlack && this.config.slackWebhookUrl) {
      try {
        await sendSlackAlert(this.config.slackWebhookUrl, {
          channel,
          text: `*${payload.title}*\n${payload.body}`,
          severity: payload.severity,
        });
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        errors.push(`Slack: ${message}`);
      }
    }

    if (shouldDiscord && this.config.discordWebhookUrl) {
      try {
        const discordMsg = buildDiscordMessage({
          title: payload.title,
          body: payload.body,
          severity: payload.severity,
        });
        await sendDiscordAlert(this.config.discordWebhookUrl, discordMsg);
      } catch (error: unknown) {
        const message =
          error instanceof Error ? error.message : String(error);
        errors.push(`Discord: ${message}`);
      }
    }

    if (errors.length > 0) {
      console.error(
        `[sentinel] Alert dispatch partial failure: ${errors.join("; ")}`,
      );
    }
  }

  /**
   * Convenience method for critical alerts (sent to both targets).
   */
  async critical(title: string, body: string): Promise<void> {
    await this.dispatch({
      target: "both",
      severity: "critical",
      title,
      body,
      channel: "#sentinel-critical",
    });
  }

  /**
   * Convenience method for informational alerts.
   */
  async info(title: string, body: string): Promise<void> {
    await this.dispatch({
      target: "both",
      severity: "info",
      title,
      body,
      channel: "#sentinel-daily",
    });
  }

  /**
   * Convenience method for weekly digest alerts.
   */
  async weekly(title: string, body: string): Promise<void> {
    await this.dispatch({
      target: "both",
      severity: "weekly",
      title,
      body,
      channel: "#sentinel-weekly",
    });
  }

  /**
   * Map severity to default Slack channel.
   */
  private defaultChannel(severity: AlertSeverity): string {
    switch (severity) {
      case "critical":
        return "#sentinel-critical";
      case "info":
        return "#sentinel-daily";
      case "weekly":
        return "#sentinel-weekly";
      default:
        return "#sentinel-daily";
    }
  }
}
