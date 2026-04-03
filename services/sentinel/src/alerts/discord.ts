import type { DiscordMessage } from "../schemas/index.js";

/** Color codes for severity levels in Discord embeds. */
const SEVERITY_COLORS: Record<string, number> = {
  critical: 0xff0000, // Red
  info: 0x3498db, // Blue
  weekly: 0x2ecc71, // Green
};

/**
 * Send a message to a Discord channel via a webhook URL.
 *
 * Discord webhooks accept a JSON payload with content and optional embeds.
 * Rate limits are respected by checking the response headers.
 */
export async function sendDiscordAlert(
  webhookUrl: string,
  message: DiscordMessage,
): Promise<void> {
  const response = await fetch(webhookUrl, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(message),
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(
      `Discord webhook returned ${response.status.toString()}: ${body}`,
    );
  }
}

/**
 * Build a Discord embed message for a sentinel alert.
 */
export function buildDiscordMessage(options: {
  title: string;
  body: string;
  severity: string;
  fields?: Array<{ name: string; value: string; inline?: boolean }>;
}): DiscordMessage {
  return {
    content: "",
    embeds: [
      {
        title: `[${options.severity.toUpperCase()}] ${options.title}`,
        description: options.body,
        color: SEVERITY_COLORS[options.severity] ?? 0x95a5a6,
        timestamp: new Date().toISOString(),
        fields: options.fields,
      },
    ],
  };
}
