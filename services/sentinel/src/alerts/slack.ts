import type { SlackMessage } from "../types.js";

/**
 * Send an alert to a Slack channel via an incoming webhook.
 *
 * The webhook URL is expected to be a full Slack incoming-webhook URL
 * (e.g. https://hooks.slack.com/services/T00/B00/xxx).
 *
 * Severity is included in the payload so downstream Slack workflows or
 * channel routing rules can filter on it.
 */
export async function sendSlackAlert(
  webhookUrl: string,
  message: SlackMessage,
): Promise<void> {
  const severityEmoji: Record<SlackMessage["severity"], string> = {
    critical: ":rotating_light:",
    info: ":information_source:",
    weekly: ":newspaper:",
  };

  const payload = {
    channel: message.channel,
    text: `${severityEmoji[message.severity]} *[${message.severity.toUpperCase()}]* ${message.text}`,
  };

  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(payload),
  });

  if (!response.ok) {
    throw new Error(
      `Slack webhook returned ${response.status.toString()}: ${await response.text()}`,
    );
  }
}
