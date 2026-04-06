const MAX_RETRIES = 3;
const BACKOFF_BASE_MS = 1000;

export async function fetchWithRetry(
  url: string,
  init?: RequestInit,
  retries = MAX_RETRIES,
): Promise<Response> {
  let lastError: Error | null = null;

  for (let attempt = 0; attempt <= retries; attempt++) {
    try {
      const response = await fetch(url, init);
      if (response.status === 429 && attempt < retries) {
        const retryAfter = response.headers.get("retry-after");
        const waitMs = retryAfter
          ? Number(retryAfter) * 1000
          : BACKOFF_BASE_MS * 2 ** attempt;
        await sleep(waitMs);
        continue;
      }
      return response;
    } catch (err) {
      lastError = err instanceof Error ? err : new Error(String(err));
      if (attempt < retries) {
        await sleep(BACKOFF_BASE_MS * 2 ** attempt);
      }
    }
  }

  throw lastError ?? new Error(`Failed to fetch ${url} after ${retries} retries`);
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
