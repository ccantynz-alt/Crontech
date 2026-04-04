import { z } from "zod";

// --- Zod Schemas ---

export const GitHubReleaseSchema = z.object({
  repo: z.string().regex(/^[^/]+\/[^/]+$/, "Must be in owner/repo format"),
  tagName: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  publishedAt: z.string().datetime({ offset: true }).nullable(),
  htmlUrl: z.string().url(),
  prerelease: z.boolean(),
  draft: z.boolean(),
});

export type GitHubRelease = z.infer<typeof GitHubReleaseSchema>;

export const GitHubReleaseResponseSchema = z.object({
  tag_name: z.string(),
  name: z.string().nullable(),
  body: z.string().nullable(),
  published_at: z.string().nullable(),
  html_url: z.string(),
  prerelease: z.boolean(),
  draft: z.boolean(),
});

export const CollectorResultSchema = z.object({
  success: z.boolean(),
  releases: z.array(GitHubReleaseSchema),
  errors: z.array(
    z.object({
      repo: z.string(),
      error: z.string(),
    }),
  ),
  collectedAt: z.string().datetime(),
});

export type CollectorResult = z.infer<typeof CollectorResultSchema>;

// --- Default tracked repos ---

export const TRACKED_REPOS: readonly string[] = [
  "vercel/next.js",
  "remix-run/remix",
  "sveltejs/kit",
  "QwikDev/qwik",
  "withastro/astro",
  "honojs/hono",
  "solidjs/solid",
  "trpc/trpc",
  "vercel/ai",
  "langchain-ai/langchainjs",
] as const;

// --- Core function ---

/**
 * Fetches the latest release for a single GitHub repo.
 * Uses the GitHub API v3. Optionally authenticated via GITHUB_TOKEN env var.
 */
async function fetchLatestRelease(
  repo: string,
): Promise<GitHubRelease | null> {
  const token = process.env["GITHUB_TOKEN"];
  const headers: Record<string, string> = {
    Accept: "application/vnd.github+json",
    "User-Agent": "btf-sentinel/1.0",
  };

  if (token) {
    headers["Authorization"] = `Bearer ${token}`;
  }

  const url = `https://api.github.com/repos/${repo}/releases/latest`;

  const response = await fetch(url, { headers });

  if (response.status === 404) {
    // No releases found for this repo
    return null;
  }

  if (!response.ok) {
    const text = await response.text();
    throw new Error(
      `GitHub API error for ${repo}: ${response.status} ${response.statusText} - ${text}`,
    );
  }

  const raw: unknown = await response.json();
  const parsed = GitHubReleaseResponseSchema.parse(raw);

  return {
    repo,
    tagName: parsed.tag_name,
    name: parsed.name,
    body: parsed.body,
    publishedAt: parsed.published_at,
    htmlUrl: parsed.html_url,
    prerelease: parsed.prerelease,
    draft: parsed.draft,
  };
}

/**
 * Check GitHub releases for a list of repos.
 * Returns latest release info for each repo that has releases.
 * Gracefully handles errors per-repo without failing the entire batch.
 */
export async function checkGitHubReleases(
  repos: string[] = [...TRACKED_REPOS],
): Promise<CollectorResult> {
  const releases: GitHubRelease[] = [];
  const errors: Array<{ repo: string; error: string }> = [];

  const results = await Promise.allSettled(
    repos.map(async (repo) => {
      const release = await fetchLatestRelease(repo);
      return { repo, release };
    }),
  );

  for (const result of results) {
    if (result.status === "fulfilled") {
      if (result.value.release !== null) {
        releases.push(result.value.release);
      }
    } else {
      // Extract repo from the error - Promise.allSettled loses context
      const errorMessage =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      // Try to extract repo name from error message
      const repoMatch = errorMessage.match(
        /for ([^:]+):/,
      );
      const repo = repoMatch?.[1] ?? "unknown";
      errors.push({ repo, error: errorMessage });
    }
  }

  return CollectorResultSchema.parse({
    success: errors.length === 0,
    releases,
    errors,
    collectedAt: new Date().toISOString(),
  });
}
