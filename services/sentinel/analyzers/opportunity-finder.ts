import { z } from "zod";

// --- Zod Schemas ---

export const ReleaseInfoSchema = z.object({
  repo: z.string(),
  version: z.string(),
});

export type ReleaseInfo = z.infer<typeof ReleaseInfoSchema>;

export const OpportunitySchema = z.object({
  type: z.enum(["adopt", "exploit_gap", "accelerate", "monitor"]),
  title: z.string(),
  description: z.string(),
  relatedRepos: z.array(z.string()),
  priority: z.enum(["critical", "high", "medium", "low"]),
  actionItems: z.array(z.string()),
});

export type Opportunity = z.infer<typeof OpportunitySchema>;

export const OpportunityResultSchema = z.object({
  opportunities: z.array(OpportunitySchema),
  analyzedAt: z.string().datetime(),
});

export type OpportunityResult = z.infer<typeof OpportunityResultSchema>;

// --- Our known capabilities (what we already have) ---

const OUR_CAPABILITIES = new Set([
  "solidjs",
  "hono",
  "trpc",
  "webgpu",
  "crdt",
  "yjs",
  "edge-first",
  "ai-native",
  "client-side-inference",
  "three-tier-compute",
  "drizzle",
  "turso",
  "passkeys",
  "tailwind-v4",
  "biome",
  "bun",
]);

// --- Gap patterns: features competitors lack that we have or plan ---

const COMPETITOR_GAPS: Record<string, string[]> = {
  "vercel/next.js": [
    "No WebGPU integration",
    "No CRDT primitives",
    "No client-side AI inference",
    "React virtual DOM overhead",
    "No edge-native data layer",
  ],
  "remix-run/remix": [
    "No AI integration",
    "No real-time collaboration",
    "No WebGPU",
    "Limited edge compute story",
  ],
  "sveltejs/kit": [
    "No AI layer",
    "No WebGPU",
    "No CRDT collaboration",
    "Smaller ecosystem",
  ],
  "QwikDev/qwik": [
    "Small ecosystem",
    "No AI integration",
    "No WebGPU",
    "No real-time features",
  ],
  "withastro/astro": [
    "Content-focused only",
    "No real-time",
    "No AI native",
    "No app-like interactivity",
  ],
};

/**
 * Detect version bump significance from version string.
 */
function isSignificantRelease(version: string): boolean {
  // Major versions and .0 minors are significant
  const match = version.match(/(\d+)\.(\d+)\.(\d+)/);
  if (!match) return false;
  const minor = match[2];
  const patch = match[3];
  return patch === "0" || minor === "0";
}

/**
 * Analyze a batch of releases to identify opportunities we can exploit.
 * Identifies features to adopt, gaps to exploit, and areas to accelerate.
 */
export function findOpportunities(
  releases: ReleaseInfo[],
): OpportunityResult {
  const validated = z.array(ReleaseInfoSchema).parse(releases);
  const opportunities: Opportunity[] = [];

  // Check for dependency updates we should adopt
  const dependencyRepos = [
    "honojs/hono",
    "solidjs/solid",
    "trpc/trpc",
    "vercel/ai",
  ];
  const dependencyReleases = validated.filter((r) =>
    dependencyRepos.some((dep) => r.repo.includes(dep.split("/")[1] ?? "")),
  );

  if (dependencyReleases.length > 0) {
    opportunities.push({
      type: "adopt",
      title: "Dependency updates available",
      description: `${dependencyReleases.length} of our core dependencies have new releases. Update to maintain compatibility and gain new features.`,
      relatedRepos: dependencyReleases.map((r) => r.repo),
      priority: "high",
      actionItems: dependencyReleases.map(
        (r) => `Update ${r.repo} to ${r.version} and run full test suite`,
      ),
    });
  }

  // Check competitor releases for gaps we can exploit
  for (const release of validated) {
    const gaps = COMPETITOR_GAPS[release.repo];
    if (gaps && gaps.length > 0) {
      const isSignificant = isSignificantRelease(release.version);

      if (isSignificant) {
        opportunities.push({
          type: "exploit_gap",
          title: `${release.repo} major release still missing key features`,
          description: `${release.repo} released ${release.version} but still lacks: ${gaps.join(", ")}. These are areas where we maintain clear advantage.`,
          relatedRepos: [release.repo],
          priority: "medium",
          actionItems: [
            `Verify our advantage in: ${gaps.slice(0, 3).join(", ")}`,
            `Consider publishing benchmark comparisons for ${release.repo} ${release.version}`,
          ],
        });
      }
    }
  }

  // Check if multiple frameworks are converging on something we lack
  const allRepos = validated.map((r) => r.repo);
  const frameworkCount = allRepos.filter(
    (r) =>
      r.includes("next") ||
      r.includes("remix") ||
      r.includes("svelte") ||
      r.includes("qwik") ||
      r.includes("astro"),
  ).length;

  if (frameworkCount >= 3) {
    opportunities.push({
      type: "accelerate",
      title: "Multiple competitor frameworks releasing simultaneously",
      description: `${frameworkCount} competitor frameworks have new releases. The ecosystem is accelerating. We must maintain our 80%+ lead.`,
      relatedRepos: allRepos,
      priority: "high",
      actionItems: [
        "Run full competitive benchmark against latest versions",
        "Identify any new features across competitors that we should adopt",
        "Update sentinel threat analysis with new data",
      ],
    });
  }

  // Always include a monitoring recommendation if we have releases
  if (validated.length > 0 && opportunities.length === 0) {
    opportunities.push({
      type: "monitor",
      title: "Routine ecosystem activity",
      description: `${validated.length} tracked repos have new releases. No immediate action required but continue monitoring.`,
      relatedRepos: validated.map((r) => r.repo),
      priority: "low",
      actionItems: [
        "Review release notes for any relevant features",
        "Check if any releases affect our dependency chain",
      ],
    });
  }

  return OpportunityResultSchema.parse({
    opportunities,
    analyzedAt: new Date().toISOString(),
  });
}
