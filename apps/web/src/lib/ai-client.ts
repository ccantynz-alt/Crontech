// ── Client-side AI integration ──────────────────────────────────────
// Provides unified AI access that routes through compute tiers.

const API_URL = import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export async function streamSiteBuilderChat(
  messages: Array<{ role: string; content: string }>,
  onToken: (token: string) => void,
  onDone: () => void,
  onError: (error: string) => void,
): Promise<void> {
  try {
    const res = await fetch(`${API_URL}/api/ai/chat`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ messages }),
    });

    if (!res.ok) {
      onError(`AI request failed: ${res.status}`);
      return;
    }

    const reader = res.body?.getReader();
    if (!reader) {
      onError("No response stream");
      return;
    }

    const decoder = new TextDecoder();
    let done = false;
    while (!done) {
      const { value, done: readerDone } = await reader.read();
      done = readerDone;
      if (value) {
        onToken(decoder.decode(value, { stream: true }));
      }
    }
    onDone();
  } catch (err) {
    onError(err instanceof Error ? err.message : "AI request failed");
  }
}

export async function generateUI(
  description: string,
): Promise<{ success: boolean; ui?: { layout: unknown }; error?: string }> {
  try {
    const res = await fetch(`${API_URL}/api/ai/generate-ui`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ description }),
    });

    if (!res.ok) {
      return { success: false, error: `Request failed: ${res.status}` };
    }

    const data = await res.json();
    return { success: true, ui: data as { layout: unknown } };
  } catch (err) {
    return { success: false, error: err instanceof Error ? err.message : "Failed" };
  }
}
