export type AlertPriority = "critical" | "daily" | "weekly";

export interface AlertMessage {
  priority: AlertPriority;
  title: string;
  body: string;
  url?: string;
  timestamp: string;
}

export async function sendSlackAlert(message: AlertMessage): Promise<void> {
  const webhookUrl = process.env["SLACK_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.log(`[sentinel:slack] No webhook configured. Alert: ${message.title}`);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        text: `*[${message.priority.toUpperCase()}]* ${message.title}`,
        blocks: [
          {
            type: "section",
            text: { type: "mrkdwn", text: `*${message.title}*\n${message.body}` },
          },
          ...(message.url
            ? [{ type: "section", text: { type: "mrkdwn", text: `<${message.url}|View details>` } }]
            : []),
        ],
      }),
    });
  } catch (err) {
    console.error(`[sentinel:slack] Failed to send alert:`, err);
  }
}

export async function sendDiscordAlert(message: AlertMessage): Promise<void> {
  const webhookUrl = process.env["DISCORD_WEBHOOK_URL"];
  if (!webhookUrl) {
    console.log(`[sentinel:discord] No webhook configured. Alert: ${message.title}`);
    return;
  }

  try {
    await fetch(webhookUrl, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        content: `**[${message.priority.toUpperCase()}]** ${message.title}`,
        embeds: [
          {
            title: message.title,
            description: message.body,
            url: message.url,
            timestamp: message.timestamp,
            color: message.priority === "critical" ? 0xff0000 : message.priority === "daily" ? 0xffaa00 : 0x0099ff,
          },
        ],
      }),
    });
  } catch (err) {
    console.error(`[sentinel:discord] Failed to send alert:`, err);
  }
}
