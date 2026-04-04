// ── Deploy Routes ────────────────────────────────────────────────────
// Hono routes for the Cloudflare Pages deployment pipeline.
// POST /deploy/create  — Create a new site project on Cloudflare Pages
// POST /deploy/build   — Generate, bundle, and deploy a site from PageLayout
// GET  /deploy/status/:id — Check deployment status
// POST /deploy/domain  — Set a custom domain

import { Hono } from "hono";
import { z } from "zod";
import {
  createProject,
  deployToCloudflarePages,
  getDeploymentStatus,
  setCustomDomain,
  generateSiteFiles,
  bundleSite,
  CloudflareDeployError,
} from "@back-to-the-future/ai-core";
import { PageLayoutSchema } from "@back-to-the-future/ai-core";

export const deployRoutes = new Hono();

// ── Input Schemas ───────────────────────────────────────────────────

const CreateProjectInput = z.object({
  name: z.string().min(1).max(58),
});

const BuildAndDeployInput = z.object({
  layout: PageLayoutSchema,
  projectName: z.string().min(1),
  branch: z.string().optional(),
});

const StatusInput = z.object({
  projectName: z.string().min(1),
});

const CustomDomainInput = z.object({
  projectName: z.string().min(1),
  domain: z.string().min(1),
});

// ── POST /deploy/create ─────────────────────────────────────────────

deployRoutes.post("/create", async (c) => {
  try {
    const body = await c.req.json();
    const input = CreateProjectInput.parse(body);

    const result = await createProject(input.name);
    return c.json(result, 201);
  } catch (error) {
    return handleError(c, error);
  }
});

// ── POST /deploy/build ──────────────────────────────────────────────

deployRoutes.post("/build", async (c) => {
  try {
    const body = await c.req.json();
    const input = BuildAndDeployInput.parse(body);

    // Step 1: Generate SolidJS source files from component tree
    const siteFiles = generateSiteFiles(input.layout);

    // Step 2: Bundle the source files into deployable static assets
    const bundled = await bundleSite(siteFiles);

    // Step 3: Deploy to Cloudflare Pages
    const deployResult = await deployToCloudflarePages({
      projectName: input.projectName,
      files: bundled.files,
      branch: input.branch,
    });

    return c.json({
      deployment: deployResult,
      stats: {
        totalSize: bundled.totalSize,
        fileCount: bundled.fileCount,
      },
    }, 201);
  } catch (error) {
    return handleError(c, error);
  }
});

// ── GET /deploy/status/:id ──────────────────────────────────────────

deployRoutes.get("/status/:id", async (c) => {
  try {
    const deploymentId = c.req.param("id");
    const projectName = c.req.query("projectName");

    const input = StatusInput.parse({ projectName });

    const status = await getDeploymentStatus(deploymentId, input.projectName);
    return c.json(status);
  } catch (error) {
    return handleError(c, error);
  }
});

// ── POST /deploy/domain ─────────────────────────────────────────────

deployRoutes.post("/domain", async (c) => {
  try {
    const body = await c.req.json();
    const input = CustomDomainInput.parse(body);

    await setCustomDomain(input.projectName, input.domain);
    return c.json({ success: true, projectName: input.projectName, domain: input.domain });
  } catch (error) {
    return handleError(c, error);
  }
});

// ── Error Handler ───────────────────────────────────────────────────

function handleError(c: { json: (data: unknown, status: number) => Response }, error: unknown): Response {
  if (error instanceof z.ZodError) {
    return c.json(
      { error: "Validation error", details: error.issues.map((i) => `${i.path.join(".")}: ${i.message}`) },
      400,
    );
  }

  if (error instanceof CloudflareDeployError) {
    return c.json(
      { error: error.message },
      error.statusCode >= 400 && error.statusCode < 600 ? (error.statusCode as 400) : 500,
    );
  }

  const message = error instanceof Error ? error.message : "Internal server error";
  return c.json({ error: message }, 500);
}
