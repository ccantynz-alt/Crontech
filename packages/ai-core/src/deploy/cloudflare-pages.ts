// ── Cloudflare Pages Deployment ──────────────────────────────────────
// Deploys AI-generated sites to Cloudflare Pages via Direct Upload API.
// No git integration needed. No self-hosted servers. Pure Cloudflare.

import { z } from "zod";

// ── Zod Schemas ─────────────────────────────────────────────────────

export const DeployConfigSchema = z.object({
  /** Cloudflare Pages project name */
  projectName: z.string().min(1).max(58).regex(/^[a-z0-9][a-z0-9-]*[a-z0-9]$/, {
    message: "Project name must be lowercase alphanumeric with hyphens, cannot start/end with hyphen",
  }),
  /** Map of file paths to file contents (the bundled site output) */
  files: z.record(z.string(), z.string()),
  /** Optional branch name for preview deploys */
  branch: z.string().optional(),
});

export type DeployConfig = z.infer<typeof DeployConfigSchema>;

export const DeployResultSchema = z.object({
  id: z.string(),
  url: z.string().url(),
  projectName: z.string(),
  environment: z.enum(["production", "preview"]),
  createdAt: z.string(),
});

export type DeployResult = z.infer<typeof DeployResultSchema>;

export const DeploymentStatusSchema = z.object({
  id: z.string(),
  projectName: z.string(),
  status: z.enum(["active", "idle", "building", "failure"]),
  url: z.string().url().optional(),
  createdAt: z.string(),
  modifiedAt: z.string(),
});

export type DeploymentStatus = z.infer<typeof DeploymentStatusSchema>;

// ── Environment ─────────────────────────────────────────────────────

const EnvSchema = z.object({
  CLOUDFLARE_API_TOKEN: z.string().min(1),
  CLOUDFLARE_ACCOUNT_ID: z.string().min(1),
});

function getEnv(): z.infer<typeof EnvSchema> {
  return EnvSchema.parse({
    CLOUDFLARE_API_TOKEN: process.env.CLOUDFLARE_API_TOKEN,
    CLOUDFLARE_ACCOUNT_ID: process.env.CLOUDFLARE_ACCOUNT_ID,
  });
}

// ── Cloudflare API Base ─────────────────────────────────────────────

const CF_API_BASE = "https://api.cloudflare.com/client/v4";

interface CloudflareApiResponse<T> {
  success: boolean;
  errors: Array<{ code: number; message: string }>;
  messages: Array<{ code: number; message: string }>;
  result: T;
}

async function cfFetch<T>(
  path: string,
  options: RequestInit = {},
): Promise<T> {
  const env = getEnv();
  const url = `${CF_API_BASE}${path}`;

  const response = await fetch(url, {
    ...options,
    headers: {
      Authorization: `Bearer ${env.CLOUDFLARE_API_TOKEN}`,
      ...options.headers,
    },
  });

  if (!response.ok) {
    const text = await response.text();
    throw new CloudflareDeployError(
      `Cloudflare API error (${response.status}): ${text}`,
      response.status,
    );
  }

  const json = (await response.json()) as CloudflareApiResponse<T>;

  if (!json.success) {
    const errorMessages = json.errors.map((e) => e.message).join(", ");
    throw new CloudflareDeployError(
      `Cloudflare API failure: ${errorMessages}`,
      response.status,
    );
  }

  return json.result;
}

// ── Error Class ─────────────────────────────────────────────────────

export class CloudflareDeployError extends Error {
  constructor(
    message: string,
    public readonly statusCode: number,
  ) {
    super(message);
    this.name = "CloudflareDeployError";
  }
}

// ── Create Project ──────────────────────────────────────────────────

/**
 * Creates a new Cloudflare Pages project configured for Direct Upload.
 */
export async function createProject(
  name: string,
): Promise<{ projectName: string; subdomain: string }> {
  const env = getEnv();
  const sanitizedName = name.toLowerCase().replace(/[^a-z0-9-]/g, "-").replace(/^-+|-+$/g, "").slice(0, 58);

  if (sanitizedName.length < 1) {
    throw new CloudflareDeployError("Project name is invalid after sanitization", 400);
  }

  interface CreateProjectResult {
    name: string;
    subdomain: string;
  }

  const result = await cfFetch<CreateProjectResult>(
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        name: sanitizedName,
        production_branch: "main",
      }),
    },
  );

  return {
    projectName: result.name,
    subdomain: result.subdomain,
  };
}

// ── Deploy to Cloudflare Pages ──────────────────────────────────────

/**
 * Deploys a set of static files to Cloudflare Pages via Direct Upload API.
 * Uses multipart/form-data to upload files and create a deployment in one call.
 */
export async function deployToCloudflarePages(
  config: DeployConfig,
): Promise<DeployResult> {
  const validated = DeployConfigSchema.parse(config);
  const env = getEnv();

  // Build multipart form data with all files
  const formData = new FormData();

  // Add manifest -- maps file paths to content hashes
  // Cloudflare Direct Upload expects files as form fields with path as key
  for (const [filePath, content] of Object.entries(validated.files)) {
    const normalizedPath = filePath.startsWith("/") ? filePath.slice(1) : filePath;
    const blob = new Blob([content], { type: getMimeType(normalizedPath) });
    formData.append(normalizedPath, blob, normalizedPath);
  }

  // Add branch if specified (for preview deploys)
  if (validated.branch) {
    formData.append("branch", validated.branch);
  }

  interface DeploymentResult {
    id: string;
    url: string;
    environment: "production" | "preview";
    created_on: string;
  }

  const result = await cfFetch<DeploymentResult>(
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${validated.projectName}/deployments`,
    {
      method: "POST",
      body: formData,
      // Do not set Content-Type -- fetch sets it with the boundary for FormData
    },
  );

  const deployResult: DeployResult = {
    id: result.id,
    url: result.url,
    projectName: validated.projectName,
    environment: result.environment,
    createdAt: result.created_on,
  };

  return DeployResultSchema.parse(deployResult);
}

// ── Set Custom Domain ───────────────────────────────────────────────

/**
 * Sets a custom domain for a Cloudflare Pages project.
 */
export async function setCustomDomain(
  projectName: string,
  domain: string,
): Promise<void> {
  const env = getEnv();

  const DomainSchema = z.string().min(1).regex(/^[a-zA-Z0-9][a-zA-Z0-9.-]+[a-zA-Z]{2,}$/);
  DomainSchema.parse(domain);

  await cfFetch<unknown>(
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/domains`,
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name: domain }),
    },
  );
}

// ── Get Deployment Status ───────────────────────────────────────────

/**
 * Checks the status of a deployment by its ID.
 * Requires the project name to be known -- we look across all projects if needed.
 */
export async function getDeploymentStatus(
  deploymentId: string,
  projectName?: string,
): Promise<DeploymentStatus> {
  const env = getEnv();

  if (!projectName) {
    throw new CloudflareDeployError(
      "projectName is required to check deployment status",
      400,
    );
  }

  interface DeploymentDetail {
    id: string;
    project_name: string;
    latest_stage: {
      name: string;
      status: "active" | "idle" | "building" | "failure";
    };
    url: string;
    created_on: string;
    modified_on: string;
  }

  const result = await cfFetch<DeploymentDetail>(
    `/accounts/${env.CLOUDFLARE_ACCOUNT_ID}/pages/projects/${projectName}/deployments/${deploymentId}`,
  );

  const status: DeploymentStatus = {
    id: result.id,
    projectName: result.project_name,
    status: result.latest_stage.status,
    url: result.url || undefined,
    createdAt: result.created_on,
    modifiedAt: result.modified_on,
  };

  return DeploymentStatusSchema.parse(status);
}

// ── Helpers ─────────────────────────────────────────────────────────

function getMimeType(filePath: string): string {
  const ext = filePath.split(".").pop()?.toLowerCase();
  const mimeMap: Record<string, string> = {
    html: "text/html",
    css: "text/css",
    js: "application/javascript",
    mjs: "application/javascript",
    json: "application/json",
    png: "image/png",
    jpg: "image/jpeg",
    jpeg: "image/jpeg",
    gif: "image/gif",
    svg: "image/svg+xml",
    ico: "image/x-icon",
    woff: "font/woff",
    woff2: "font/woff2",
    ttf: "font/ttf",
    txt: "text/plain",
    xml: "application/xml",
    webp: "image/webp",
    avif: "image/avif",
    map: "application/json",
  };
  return mimeMap[ext ?? ""] ?? "application/octet-stream";
}
