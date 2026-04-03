import { gzipSync } from "node:zlib";
import { readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Glob } from "bun";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface BudgetEntry {
  name: string;
  pattern?: string;
  patterns?: string[];
  maxSize: string;
  maxSizeBytes: number;
  compression: string;
}

interface BudgetConfig {
  budgets: BudgetEntry[];
}

interface FileSize {
  file: string;
  raw: number;
  gzipped: number;
}

interface BudgetResult {
  name: string;
  maxBytes: number;
  actualBytes: number;
  pass: boolean;
  files: FileSize[];
}

// ---------------------------------------------------------------------------
// Constants
// ---------------------------------------------------------------------------

const WEB_APP_DIR = join(import.meta.dir, "..", "apps", "web");
const CONFIG_PATH = join(WEB_APP_DIR, "bundlesize.config.json");

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function loadConfig(): BudgetConfig {
  const raw = readFileSync(CONFIG_PATH, "utf-8");
  return JSON.parse(raw) as BudgetConfig;
}

async function collectFiles(pattern: string, cwd: string): Promise<string[]> {
  const glob = new Glob(pattern);
  const files: string[] = [];
  for await (const path of glob.scan({ cwd, absolute: true })) {
    files.push(path);
  }
  return files;
}

function gzipSize(filePath: string): number {
  const content = readFileSync(filePath);
  return gzipSync(content, { level: 9 }).length;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  const kb = bytes / 1024;
  return `${kb.toFixed(2)} KB`;
}

// ---------------------------------------------------------------------------
// Main
// ---------------------------------------------------------------------------

async function run(): Promise<void> {
  const config = loadConfig();
  const results: BudgetResult[] = [];
  let hasFailure = false;

  for (const budget of config.budgets) {
    const patterns = budget.patterns ?? (budget.pattern ? [budget.pattern] : []);
    const allFiles: FileSize[] = [];

    for (const pat of patterns) {
      const matched = await collectFiles(pat, WEB_APP_DIR);
      for (const file of matched) {
        const raw = readFileSync(file).length;
        const gzipped = gzipSize(file);
        allFiles.push({
          file: relative(WEB_APP_DIR, file),
          raw,
          gzipped,
        });
      }
    }

    const totalGzipped = allFiles.reduce((sum, f) => sum + f.gzipped, 0);
    const pass = totalGzipped <= budget.maxSizeBytes;

    if (!pass) {
      hasFailure = true;
    }

    results.push({
      name: budget.name,
      maxBytes: budget.maxSizeBytes,
      actualBytes: totalGzipped,
      pass,
      files: allFiles,
    });
  }

  // ---------------------------------------------------------------------------
  // Output: Markdown summary table
  // ---------------------------------------------------------------------------

  console.log("\n## Bundle Size Report\n");
  console.log("| Budget | Max | Actual (gzip) | Status |");
  console.log("|--------|-----|---------------|--------|");

  for (const r of results) {
    const status = r.pass ? "PASS ✅" : "FAIL ❌";
    console.log(
      `| ${r.name} | ${formatBytes(r.maxBytes)} | ${formatBytes(r.actualBytes)} | ${status} |`,
    );
  }

  // ---------------------------------------------------------------------------
  // Output: Per-file breakdown
  // ---------------------------------------------------------------------------

  console.log("\n### File Breakdown\n");
  console.log("| File | Raw | Gzipped |");
  console.log("|------|-----|---------|");

  const seen = new Set<string>();
  for (const r of results) {
    for (const f of r.files) {
      if (seen.has(f.file)) continue;
      seen.add(f.file);
      console.log(`| ${f.file} | ${formatBytes(f.raw)} | ${formatBytes(f.gzipped)} |`);
    }
  }

  if (seen.size === 0) {
    console.log("| (no build output files found) | — | — |");
  }

  console.log("");

  // ---------------------------------------------------------------------------
  // Write to GitHub Actions step summary if available
  // ---------------------------------------------------------------------------

  const summaryPath = process.env["GITHUB_STEP_SUMMARY"];
  if (summaryPath) {
    const summaryLines: string[] = [];
    summaryLines.push("## Bundle Size Report\n");
    summaryLines.push("| Budget | Max | Actual (gzip) | Status |");
    summaryLines.push("|--------|-----|---------------|--------|");
    for (const r of results) {
      const status = r.pass ? "PASS ✅" : "FAIL ❌";
      summaryLines.push(
        `| ${r.name} | ${formatBytes(r.maxBytes)} | ${formatBytes(r.actualBytes)} | ${status} |`,
      );
    }
    const { appendFileSync } = await import("node:fs");
    appendFileSync(summaryPath, summaryLines.join("\n") + "\n");
  }

  // ---------------------------------------------------------------------------
  // Exit
  // ---------------------------------------------------------------------------

  if (hasFailure) {
    console.error("Bundle size check FAILED. One or more budgets exceeded.\n");
    process.exit(1);
  }

  console.log("Bundle size check PASSED. All budgets within limits.\n");
}

run().catch((err: unknown) => {
  console.error("Bundle size check encountered an error:", err);
  process.exit(1);
});
