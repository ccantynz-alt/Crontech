import type { Release } from "../types.js";

/** Competitor repositories to monitor for new releases. */
export const TRACKED_REPOS: readonly string[] = [
  "vercel/next.js",
  "remix-run/remix",
  "sveltejs/kit",
  "QwikDev/qwik",
  "withastro/astro",
  "honojs/hono",
  "solidjs/solid",
  "trpc/trpc",
] as const;

interface GitHubRelease {
  tag_name: string;
  name: string | null;
  published_at: string | null;
  html_url: string;
}

/**
 * Fetch the latest release for each tracked GitHub repository.
 *
 * Uses the public GitHub API (no authentication required for public repos).
 * Failed fetches for individual repos are logged and skipped so one
 * unavailable repo does not block the rest.
 */
export async function checkGitHubReleases(
  repos: readonly string[] = TRACKED_REPOS,
): Promise<Release[]> {
  const results: Release[] = [];

  for (const repo of repos) {
    try {
      const response = await fetch(
        `https://api.github.com/repos/${repo}/releases/latest`,
        {
          headers: {
            Accept: "application/vnd.github+json",
            "User-Agent": "back-to-the-future-sentinel",
          },
        },
      );

      if (!response.ok) {
        console.warn(
          `[sentinel] GitHub releases: ${repo} returned ${response.status.toString()}`,
        );
        continue;
      }

      const data = (await response.json()) as GitHubRelease;

      results.push({
        repo,
        tag: data.tag_name,
        name: data.name ?? data.tag_name,
        publishedAt: data.published_at ?? new Date().toISOString(),
        url: data.html_url,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[sentinel] GitHub releases: failed to fetch ${repo} — ${message}`,
      );
    }
  }

  return results;
}
