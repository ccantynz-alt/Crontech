import type { PackageVersion } from "../types.js";

/** Key npm packages to monitor for new versions. */
export const TRACKED_PACKAGES: readonly string[] = [
  "next",
  "remix",
  "svelte",
  "@sveltejs/kit",
  "qwik",
  "astro",
  "hono",
  "solid-js",
  "@trpc/server",
  "ai",
] as const;

interface NpmRegistryResponse {
  "dist-tags": {
    latest: string;
  };
  time: Record<string, string>;
}

/**
 * Fetch the latest published version for each tracked npm package.
 *
 * Uses the public npm registry API (no authentication required).
 * Failed fetches for individual packages are logged and skipped.
 */
export async function checkNpmVersions(
  packages: readonly string[] = TRACKED_PACKAGES,
): Promise<PackageVersion[]> {
  const results: PackageVersion[] = [];

  for (const name of packages) {
    try {
      const encodedName = encodeURIComponent(name).replace("%40", "@");
      const response = await fetch(
        `https://registry.npmjs.org/${encodedName}`,
        {
          headers: {
            Accept: "application/json",
          },
        },
      );

      if (!response.ok) {
        console.warn(
          `[sentinel] npm versions: ${name} returned ${response.status.toString()}`,
        );
        continue;
      }

      const data = (await response.json()) as NpmRegistryResponse;
      const latestVersion = data["dist-tags"].latest;
      const publishedAt =
        data.time[latestVersion] ?? new Date().toISOString();

      results.push({
        name,
        version: latestVersion,
        publishedAt,
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error ? error.message : String(error);
      console.error(
        `[sentinel] npm versions: failed to fetch ${name} — ${message}`,
      );
    }
  }

  return results;
}
