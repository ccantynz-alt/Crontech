import { z } from "zod";

// --- Zod Schemas ---

export const NpmPackageInfoSchema = z.object({
  name: z.string(),
  latestVersion: z.string(),
  description: z.string().nullable(),
  lastPublished: z.string().nullable(),
  homepage: z.string().nullable(),
});

export type NpmPackageInfo = z.infer<typeof NpmPackageInfoSchema>;

export const NpmCollectorResultSchema = z.object({
  success: z.boolean(),
  packages: z.array(NpmPackageInfoSchema),
  errors: z.array(
    z.object({
      package: z.string(),
      error: z.string(),
    }),
  ),
  collectedAt: z.string().datetime(),
});

export type NpmCollectorResult = z.infer<typeof NpmCollectorResultSchema>;

// Registry response schema (partial - only what we need)
const NpmRegistryResponseSchema = z.object({
  name: z.string(),
  description: z.string().optional(),
  "dist-tags": z.object({
    latest: z.string(),
  }),
  time: z.record(z.string(), z.string()).optional(),
  homepage: z.string().optional(),
});

// --- Default tracked packages ---

export const TRACKED_PACKAGES: readonly string[] = [
  "next",
  "@remix-run/react",
  "@sveltejs/kit",
  "@builder.io/qwik",
  "astro",
  "hono",
  "solid-js",
  "@trpc/server",
  "ai",
  "langchain",
  "@langchain/core",
  "drizzle-orm",
  "tailwindcss",
  "zod",
  "@anthropic-ai/sdk",
  "openai",
] as const;

// --- Core functions ---

/**
 * Fetch package info from npm registry for a single package.
 */
async function fetchNpmPackage(
  packageName: string,
): Promise<NpmPackageInfo> {
  const url = `https://registry.npmjs.org/${encodeURIComponent(packageName)}`;

  const response = await fetch(url, {
    headers: {
      Accept: "application/json",
      "User-Agent": "btf-sentinel/1.0",
    },
  });

  if (!response.ok) {
    throw new Error(
      `npm registry error for ${packageName}: ${response.status} ${response.statusText}`,
    );
  }

  const raw: unknown = await response.json();
  const parsed = NpmRegistryResponseSchema.parse(raw);

  const latestVersion = parsed["dist-tags"].latest;
  const lastPublished = parsed.time?.[latestVersion] ?? null;

  return {
    name: parsed.name,
    latestVersion,
    description: parsed.description ?? null,
    lastPublished,
    homepage: parsed.homepage ?? null,
  };
}

/**
 * Check npm registry for latest versions of tracked packages.
 * Gracefully handles errors per-package without failing the batch.
 */
export async function checkNpmVersions(
  packages: string[] = [...TRACKED_PACKAGES],
): Promise<NpmCollectorResult> {
  const results: NpmPackageInfo[] = [];
  const errors: Array<{ package: string; error: string }> = [];

  const settled = await Promise.allSettled(
    packages.map((pkg) => fetchNpmPackage(pkg)),
  );

  for (let i = 0; i < settled.length; i++) {
    const result = settled[i];
    const pkg = packages[i];
    if (result === undefined || pkg === undefined) {
      continue;
    }
    if (result.status === "fulfilled") {
      results.push(result.value);
    } else {
      const errorMessage =
        result.reason instanceof Error
          ? result.reason.message
          : String(result.reason);
      errors.push({ package: pkg, error: errorMessage });
    }
  }

  return NpmCollectorResultSchema.parse({
    success: errors.length === 0,
    packages: results,
    errors,
    collectedAt: new Date().toISOString(),
  });
}
