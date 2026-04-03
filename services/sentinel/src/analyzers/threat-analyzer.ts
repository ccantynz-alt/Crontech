import type {
  Release,
  PackageVersion,
  TechNewsItem,
  IntelligenceItem,
  ThreatLevel,
} from "../schemas/index.js";

/**
 * Competitor repositories that represent direct threats to our market position.
 * Releases from these repos are automatically elevated in threat level.
 */
const DIRECT_COMPETITORS: ReadonlySet<string> = new Set([
  "vercel/next.js",
  "remix-run/remix",
  "sveltejs/kit",
  "QwikDev/qwik",
  "withastro/astro",
  "solidjs/solid",
]);

/**
 * Keywords in release notes / titles that indicate a major capability change.
 */
const HIGH_THREAT_KEYWORDS: readonly string[] = [
  "webgpu",
  "ai",
  "edge",
  "crdt",
  "real-time",
  "collaboration",
  "streaming",
  "agent",
  "inference",
  "vector",
  "gpu",
  "llm",
] as const;

/**
 * Assess the threat level of a GitHub release.
 */
function assessReleaseThreat(release: Release): ThreatLevel {
  const isDirectCompetitor = DIRECT_COMPETITORS.has(release.repo);
  const nameAndTag = `${release.name} ${release.tag}`.toLowerCase();
  const hasHighThreatKeyword = HIGH_THREAT_KEYWORDS.some((kw) =>
    nameAndTag.includes(kw),
  );

  if (isDirectCompetitor && hasHighThreatKeyword) return "critical";
  if (isDirectCompetitor) return "high";
  if (hasHighThreatKeyword) return "medium";
  return "low";
}

/**
 * Assess the threat level of an npm package version bump.
 * Major version bumps from tracked packages are higher threat.
 */
function assessPackageThreat(pkg: PackageVersion): ThreatLevel {
  const isMajor = pkg.version.startsWith("0.") === false && pkg.version.split(".")[0] !== "0";
  // Crude major version detection: if version has no pre-release tag and
  // minor+patch are 0, it is likely a major bump.
  const parts = pkg.version.split(".");
  const isLikelyMajorBump =
    parts[1] === "0" && parts[2] === "0" && isMajor;

  if (isLikelyMajorBump) return "high";
  return "low";
}

/**
 * Assess the threat level of a tech news item.
 */
function assessNewsThreat(item: TechNewsItem): ThreatLevel {
  if (item.source === "hackernews") {
    if (item.item.score > 500) return "high";
    if (item.item.score > 200) return "medium";
    return "low";
  }

  // ArXiv papers: assess based on category relevance
  if (item.source === "arxiv") {
    const categories = item.item.categories;
    const hasAI = categories.some(
      (c: string) => c === "cs.AI" || c === "cs.LG" || c === "cs.CL",
    );
    const titleLower = item.item.title.toLowerCase();
    const hasHighThreatKeyword = HIGH_THREAT_KEYWORDS.some((kw) =>
      titleLower.includes(kw),
    );

    if (hasAI && hasHighThreatKeyword) return "high";
    if (hasAI) return "medium";
    return "low";
  }

  return "low";
}

/**
 * Compute a relevance score (0-1) based on keyword matches in the title.
 */
function computeRelevance(text: string): number {
  const lower = text.toLowerCase();
  const matches = HIGH_THREAT_KEYWORDS.filter((kw) =>
    lower.includes(kw),
  ).length;
  return Math.min(matches / 3, 1);
}

/**
 * Analyze GitHub releases and produce intelligence items.
 */
export function analyzeReleases(
  releases: readonly Release[],
): IntelligenceItem[] {
  return releases.map((release) => {
    const threatLevel = assessReleaseThreat(release);
    return {
      source: `github:${release.repo}`,
      title: `${release.repo} released ${release.tag}`,
      summary: `New release: ${release.name} (${release.tag}) published at ${release.publishedAt}. URL: ${release.url}`,
      threatLevel,
      relevance: computeRelevance(`${release.name} ${release.tag}`),
      actionRequired: threatLevel === "critical" || threatLevel === "high",
      suggestedAction:
        threatLevel === "critical"
          ? `Immediate review required: ${release.repo} may be entering our whitespace.`
          : undefined,
    };
  });
}

/**
 * Analyze npm package versions and produce intelligence items.
 */
export function analyzePackageVersions(
  packages: readonly PackageVersion[],
): IntelligenceItem[] {
  return packages.map((pkg) => {
    const threatLevel = assessPackageThreat(pkg);
    return {
      source: `npm:${pkg.name}`,
      title: `${pkg.name} v${pkg.version}`,
      summary: `New version published at ${pkg.publishedAt}.`,
      threatLevel,
      relevance: computeRelevance(pkg.name),
      actionRequired: threatLevel === "high",
      suggestedAction:
        threatLevel === "high"
          ? `Major version bump for ${pkg.name}. Review changelog for breaking changes and new capabilities.`
          : undefined,
    };
  });
}

/**
 * Analyze tech news items and produce intelligence items.
 */
export function analyzeTechNews(
  items: readonly TechNewsItem[],
): IntelligenceItem[] {
  return items.map((item) => {
    const threatLevel = assessNewsThreat(item);

    if (item.source === "hackernews") {
      return {
        source: "hackernews",
        title: item.item.title,
        summary: `HN score: ${item.item.score.toString()}, ${(item.item.descendants ?? 0).toString()} comments. ${item.item.url ?? ""}`,
        threatLevel,
        relevance: computeRelevance(item.item.title),
        actionRequired: threatLevel === "high" || threatLevel === "critical",
        suggestedAction:
          threatLevel === "high"
            ? "High-visibility discussion in our competitive space. Review for strategic implications."
            : undefined,
      };
    }

    // ArXiv
    return {
      source: "arxiv",
      title: item.item.title,
      summary: `Authors: ${item.item.authors.slice(0, 3).join(", ")}${item.item.authors.length > 3 ? " et al." : ""}. Categories: ${item.item.categories.join(", ")}`,
      threatLevel,
      relevance: computeRelevance(item.item.title),
      actionRequired: threatLevel === "high" || threatLevel === "critical",
      suggestedAction:
        threatLevel === "high"
          ? "Potentially relevant research. Evaluate for integration or competitive impact."
          : undefined,
    };
  });
}
