import { z } from "zod";

// --- Zod Schemas ---

export const SeveritySchema = z.enum(["critical", "warning", "info"]);
export type Severity = z.infer<typeof SeveritySchema>;

export const SlackAlertInputSchema = z.object({
  channel: z.string().min(1),
  message: z.string().min(1),
  severity: SeveritySchema,
});

export const SlackAlertResultSchema = z.object({
  success: z.boolean(),
  channel: z.string(),
  severity: SeveritySchema,
  sentAt: z.string().datetime(),
  error: z.string().nullable(),
});

export type SlackAlertResult = z.infer<typeof SlackAlertResultSchema>;

// --- Severity to Slack formatting ---

const SEVERITY_CONFIG: Record<
  Severity,
  { emoji: string; color: string; label: string }
> = {
  critical: { emoji: ":rotating_light:", color: "#FF0000", label: "CRITICAL" },
  warning: { emoji: ":warning:", color: "#FFA500", label: "WARNING" },
  info: { emoji: ":information_source:", color: "#0088FF", label: "INFO" },
};

/**
 * Send an alert to a Slack channel via incoming webhook.
 *
 * Requires SLACK_WEBHOOK_URL environment variable.
 * The channel parameter is included in the message for routing context
 * (actual channel routing is determined by the webhook configuration).
 */
export async function sendSlackAlert(
  channel: string,
  message: string,
  severity: Severity,
): Promise<SlackAlertResult> {
  const validated = SlackAlertInputSchema.parse({ channel, message, severity });

  const webhookUrl = process.env["SLACK_WEBHOOK_URL"];

  if (!webhookUrl) {
    return SlackAlertResultSchema.parse({
      success: false,
      channel: validated.channel,
      severity: validated.severity,
      sentAt: new Date().toISOString(),
      error:
        "SLACK_WEBHOOK_URL environment variable is not set. Alert not sent.",
    });
  }

  const config = SEVERITY_CONFIG[validated.severity];

  const payload = {
    channel: validated.channel,
    username: "Sentinel Intelligence",
    icon_emoji: ":satellite:",
    attachments: [
      {
        color: config.color,
        blocks: [
          {
            type: "header",
            text: {
              type: "plain_text",
              text: `${config.emoji} Sentinel ${config.label}`,
              emoji: true,
            },
          },
          {
            type: "section",
            text: {
              type: "mrkdwn",
              text: validated.message,
            },
          },
          {
            type: "context",
            elements: [
              {
                type: "mrkdwn",
                text: `Channel: ${validated.channel} | ${new Date().toISOString()}`,
              },
            ],
          },
        ],
      },
    ],
  };

  try {
    const response = await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    });

    if (!response.ok) {
      const text = await response.text();
      return SlackAlertResultSchema.parse({
        success: false,
        channel: validated.channel,
        severity: validated.severity,
        sentAt: new Date().toISOString(),
        error: `Slack webhook error: ${response.status} - ${text}`,
      });
    }

    return SlackAlertResultSchema.parse({
      success: true,
      channel: validated.channel,
      severity: validated.severity,
      sentAt: new Date().toISOString(),
      error: null,
    });
  } catch (err) {
    const errorMessage =
      err instanceof Error ? err.message : String(err);
    return SlackAlertResultSchema.parse({
      success: false,
      channel: validated.channel,
      severity: validated.severity,
      sentAt: new Date().toISOString(),
      error: `Failed to send Slack alert: ${errorMessage}`,
    });
  }
}
