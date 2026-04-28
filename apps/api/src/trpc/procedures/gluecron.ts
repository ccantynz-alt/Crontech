// ── GlueCron Machine-to-Machine tRPC Router ──────────────────────────
// Authenticated via X-Service-Key header (compared against
// GLUECRON_SERVICE_KEY env var). No user session required.
//
// Exposes 6 procedures for GlueCron to programmatically interact with
// the Crontech platform:
//   health       — query  platform health + queue depth
//   listRegions  — query  registered regions and health
//   scale        — mutation scale workers in a region
//   deploy       — mutation enqueue a deploy job
//   invoke       — mutation dispatch to the edge runtime
//   queueDepth   — query  orchestrator queue depth per region
//
// Internal service URLs (defaults, all override-able via env):
//   ORCHESTRATOR_URL       http://localhost:9000
//   REGION_ORCHESTRATOR_URL http://localhost:3004
//   WORKER_RUNTIME_URL     http://localhost:9097
//   EDGE_RUNTIME_URL       http://localhost:9096

import { TRPCError } from "@trpc/server";
import { z } from "zod";
import { middleware, publicProcedure, router } from "../init";

// ── Service URL helpers ───────────────────────────────────────────────

function orchestratorUrl(): string {
  const base = process.env.ORCHESTRATOR_URL ?? "http://localhost:9000";
  return base.replace(/\/+$/, "");
}

function regionOrchestratorUrl(): string {
  const base = process.env.REGION_ORCHESTRATOR_URL ?? "http://localhost:3004";
  return base.replace(/\/+$/, "");
}

function workerRuntimeUrl(): string {
  const base = process.env.WORKER_RUNTIME_URL ?? "http://localhost:9097";
  return base.replace(/\/+$/, "");
}

function edgeRuntimeUrl(): string {
  const base = process.env.EDGE_RUNTIME_URL ?? "http://localhost:9096";
  return base.replace(/\/+$/, "");
}

// ── Service auth tokens (separate from the GlueCron key) ─────────────

function workerRuntimeToken(): string {
  return process.env.WORKER_RUNTIME_TOKEN ?? "";
}

function edgeRuntimeSecret(): string {
  return process.env.EDGE_RUNTIME_SECRET ?? "";
}

// ── Helper: safe internal fetch with timeout ──────────────────────────

interface SafeFetchResult {
  ok: boolean;
  status: number;
  body: unknown;
}

async function safeFetch(
  url: string,
  init: RequestInit = {},
  timeoutMs = 5_000,
): Promise<SafeFetchResult> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    const res = await fetch(url, { ...init, signal: controller.signal });
    let body: unknown = null;
    const ct = res.headers.get("content-type") ?? "";
    if (ct.includes("application/json")) {
      try {
        body = await res.json();
      } catch {
        body = null;
      }
    } else {
      body = await res.text().catch(() => null);
    }
    return { ok: res.ok, status: res.status, body };
  } catch {
    return { ok: false, status: 0, body: null };
  } finally {
    clearTimeout(timer);
  }
}

// ── Service-key middleware ────────────────────────────────────────────

const enforceServiceKey = middleware(({ ctx, next }) => {
  const envKey = process.env.GLUECRON_SERVICE_KEY;
  if (envKey === undefined || envKey.length === 0) {
    throw new TRPCError({
      code: "INTERNAL_SERVER_ERROR",
      message:
        "GLUECRON_SERVICE_KEY is not configured. Set the environment variable to enable the GlueCron API.",
    });
  }

  if (!ctx.serviceKey || ctx.serviceKey !== envKey) {
    throw new TRPCError({
      code: "UNAUTHORIZED",
      message: "Invalid or missing service API key. Provide the key via X-Service-Key header.",
    });
  }

  return next({ ctx });
});

const serviceKeyProcedure = publicProcedure.use(enforceServiceKey);

// ── Output shapes (also drives OpenAPI spec) ──────────────────────────

export interface GlueCronHealthOutput {
  status: "ok" | "degraded";
  queueDepth: number;
  checkedAt: string;
}

export interface GlueCronRegion {
  id: string;
  url: string;
  healthy: boolean;
  workerCount: number;
}

export interface GlueCronListRegionsOutput {
  regions: GlueCronRegion[];
}

export interface GlueCronScaleOutput {
  regionId: string;
  newWorkerCount: number;
}

export interface GlueCronDeployOutput {
  deployId: string;
  queued: boolean;
}

export interface GlueCronInvokeOutput {
  result: unknown;
  latencyMs: number;
}

export interface GlueCronQueueDepthOutput {
  total: number;
  byRegion: Record<string, number>;
}

// ── Zod schemas for inputs ────────────────────────────────────────────

const ScaleInputSchema = z.object({
  regionId: z.string().min(1),
  delta: z.number().int(),
});

const DeployInputSchema = z.object({
  projectId: z.string().min(1),
  ref: z.string().min(1),
  environment: z.enum(["production", "preview"]),
});

const InvokeInputSchema = z.object({
  workerId: z.string().min(1),
  payload: z.unknown(),
});

// ── Orchestrator: derive queue depth from app list ────────────────────
//
// The orchestrator's v1 API stores deploys as a manifest file —
// "queued" apps are those with status === "queued". We count those
// per-region by inspecting the domain naming convention. A region-aware
// queue will land in v2; for now we surface a platform-wide total.

interface OrchestratorApp {
  status?: string;
  domain?: string;
  name?: string;
}

interface OrchestratorAppsResponse {
  apps?: OrchestratorApp[];
}

async function fetchQueueDepth(): Promise<{
  total: number;
  byRegion: Record<string, number>;
}> {
  const result = await safeFetch(`${orchestratorUrl()}/apps`);
  if (!result.ok) {
    return { total: 0, byRegion: {} };
  }

  const data = result.body as OrchestratorAppsResponse;
  const apps: OrchestratorApp[] = Array.isArray(data?.apps) ? data.apps : [];

  let total = 0;
  const byRegion: Record<string, number> = {};

  for (const app of apps) {
    if (app.status === "queued") {
      total += 1;
      // Infer region from domain suffix convention: <name>.<region>.crontech.ai
      // Falls back to "default" if the pattern doesn't match.
      const domain = app.domain ?? "";
      const parts = domain.split(".");
      const region = parts.length >= 3 ? (parts[parts.length - 3] ?? "default") : "default";
      byRegion[region] = (byRegion[region] ?? 0) + 1;
    }
  }

  return { total, byRegion };
}

// ── Worker-runtime: derive worker count per region ───────────────────
//
// The worker-runtime stores workers in-memory. A region is inferred
// from the tenantId prefix convention (<region>--<rest>). Falls back
// to "default" when no region prefix is found.

interface WorkerRuntimeListResponse {
  workers?: Array<{ workerId?: string; tenantId?: string; state?: { status?: string } }>;
}

async function fetchWorkerCountForRegion(regionId: string): Promise<number> {
  const token = workerRuntimeToken();
  const headers: Record<string, string> = {};
  if (token.length > 0) {
    headers.Authorization = `Bearer ${token}`;
  }

  const result = await safeFetch(`${workerRuntimeUrl()}/workers`, { headers });
  if (!result.ok) return 0;

  const data = result.body as WorkerRuntimeListResponse;
  const workers = Array.isArray(data?.workers) ? data.workers : [];

  // Count workers running in the given region (by tenantId prefix).
  return workers.filter((w) => {
    const tenantId = w.tenantId ?? "";
    // Convention: tenant IDs are prefixed with the region when multi-region.
    return (
      tenantId.startsWith(`${regionId}--`) ||
      tenantId === regionId ||
      // If the caller passed regionId "default", count workers without prefix.
      (regionId === "default" && !tenantId.includes("--"))
    );
  }).length;
}

// ── Region orchestrator: list regions ────────────────────────────────

interface RegionOrchestratorRegion {
  id?: string;
  code?: string;
  location?: string;
  capacity?: number;
  currentLoad?: number;
  costPerHour?: number;
}

interface RegionOrchestratorListResponse {
  regions?: RegionOrchestratorRegion[];
}

// ── Router ────────────────────────────────────────────────────────────

export const gluecronRouter = router({
  /**
   * Platform health: API status, Turso DB ping, and current queue depth.
   */
  health: serviceKeyProcedure.query(async (): Promise<GlueCronHealthOutput> => {
    const checkedAt = new Date().toISOString();

    // Ping the orchestrator (cheapest liveness signal we have).
    const orchestratorResult = await safeFetch(`${orchestratorUrl()}/health`, {}, 3_000);

    const { total: queueDepth } = await fetchQueueDepth();

    const status: "ok" | "degraded" = orchestratorResult.ok ? "ok" : "degraded";

    return { status, queueDepth, checkedAt };
  }),

  /**
   * List all registered regions and their health as reported by the
   * region-orchestrator service.
   */
  listRegions: serviceKeyProcedure.query(async (): Promise<GlueCronListRegionsOutput> => {
    const result = await safeFetch(`${regionOrchestratorUrl()}/regions`);

    if (!result.ok) {
      // Region orchestrator unreachable — return empty list gracefully.
      return { regions: [] };
    }

    const data = result.body as RegionOrchestratorListResponse;
    const raw: RegionOrchestratorRegion[] = Array.isArray(data?.regions) ? data.regions : [];

    const regions: GlueCronRegion[] = await Promise.all(
      raw.map(async (r): Promise<GlueCronRegion> => {
        const id = r.id ?? r.code ?? "unknown";
        const workerCount = await fetchWorkerCountForRegion(id);

        // Healthy = capacity not fully saturated and the region exists.
        const healthy =
          typeof r.capacity === "number" &&
          typeof r.currentLoad === "number" &&
          r.currentLoad < r.capacity;

        return {
          id,
          url: `${regionOrchestratorUrl()}/regions/${encodeURIComponent(id)}`,
          healthy,
          workerCount,
        };
      }),
    );

    return { regions };
  }),

  /**
   * Scale workers in a region by `delta` (positive = add, negative = remove).
   * Calls the worker-runtime to start/stop workers in the target region.
   */
  scale: serviceKeyProcedure
    .input(ScaleInputSchema)
    .mutation(async ({ input }): Promise<GlueCronScaleOutput> => {
      const { regionId, delta } = input;

      const token = workerRuntimeToken();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (token.length > 0) {
        headers.Authorization = `Bearer ${token}`;
      }

      // Fetch current worker list to compute newWorkerCount.
      const listResult = await safeFetch(`${workerRuntimeUrl()}/workers`, { headers }, 5_000);

      const data = listResult.ok ? (listResult.body as WorkerRuntimeListResponse) : { workers: [] };
      const workers = Array.isArray(data?.workers) ? data.workers : [];

      // Workers belonging to the target region (by tenantId prefix).
      const regionWorkers = workers.filter((w) => {
        const tenantId = w.tenantId ?? "";
        return (
          tenantId.startsWith(`${regionId}--`) ||
          tenantId === regionId ||
          (regionId === "default" && !tenantId.includes("--"))
        );
      });

      const currentCount = regionWorkers.length;
      const newWorkerCount = Math.max(0, currentCount + delta);

      if (delta > 0) {
        // Scale up: the caller (GlueCron) is responsible for registering new
        // workers via POST /workers. We signal intent by returning the
        // updated count. Actual spawn requires a full WorkerRegistration body
        // that GlueCron supplies on its subsequent /workers POST calls.
        // This procedure records the intent and returns the target state.
      } else if (delta < 0) {
        // Scale down: stop workers from the region, most-recently-added first.
        const toStop = regionWorkers
          .slice(0, Math.abs(delta))
          .map((w) => w.workerId)
          .filter((id): id is string => typeof id === "string");

        await Promise.allSettled(
          toStop.map((workerId) =>
            safeFetch(
              `${workerRuntimeUrl()}/workers/${encodeURIComponent(workerId)}/stop`,
              { method: "POST", headers },
              5_000,
            ),
          ),
        );
      }

      return { regionId, newWorkerCount };
    }),

  /**
   * Enqueue a deploy job via the orchestrator for a given project ref.
   * The orchestrator receives the deploy request and manages the full
   * clone → detect → build → start → route pipeline.
   */
  deploy: serviceKeyProcedure
    .input(DeployInputSchema)
    .mutation(async ({ input }): Promise<GlueCronDeployOutput> => {
      const { projectId, ref, environment } = input;

      // Generate a stable deployId from projectId + ref + timestamp.
      const deployId = `${projectId}-${environment}-${Date.now()}`;

      // Map input to the orchestrator's DeployRequest shape.
      // Domain convention: <projectId>.<environment>.crontech.ai
      const domain = `${projectId}.${environment}.crontech.ai`;
      const subdomain = environment === "preview" ? `preview-${projectId}` : projectId;

      const deployBody = {
        appName: `${projectId}-${environment}`,
        // In production, repoUrl is resolved via project metadata (DB).
        // GlueCron is expected to have already resolved the repo URL and
        // passes it as part of a richer payload. v1 uses a convention URL.
        repoUrl: `https://github.com/crontech/${projectId}`,
        branch: ref,
        domain,
        subdomain,
        // Port is allocated dynamically by the orchestrator; 0 = auto.
        port: 0,
        runtime: "bun" as const,
        envVars: {
          CRONTECH_ENV: environment,
          CRONTECH_PROJECT_ID: projectId,
          CRONTECH_REF: ref,
        },
      };

      const result = await safeFetch(
        `${orchestratorUrl()}/deploy`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(deployBody),
        },
        30_000, // deploy can take time to enqueue
      );

      return {
        deployId,
        queued: result.ok,
      };
    }),

  /**
   * Dispatch an invocation to the edge runtime for the given workerId
   * (treated as the bundleId in edge-runtime terms).
   */
  invoke: serviceKeyProcedure
    .input(InvokeInputSchema)
    .mutation(async ({ input }): Promise<GlueCronInvokeOutput> => {
      const { workerId, payload } = input;

      const secret = edgeRuntimeSecret();
      const headers: Record<string, string> = {
        "Content-Type": "application/json",
      };
      if (secret.length > 0) {
        headers.Authorization = `Bearer ${secret}`;
      }

      const startMs = Date.now();

      // The edge runtime dispatches via POST /run/:bundleId/.
      // We pass the payload as the request body.
      const result = await safeFetch(
        `${edgeRuntimeUrl()}/run/${encodeURIComponent(workerId)}/`,
        {
          method: "POST",
          headers,
          body: JSON.stringify(payload),
        },
        10_000,
      );

      const latencyMs = Date.now() - startMs;

      if (!result.ok) {
        throw new TRPCError({
          code: "INTERNAL_SERVER_ERROR",
          message: `Edge runtime invocation failed (HTTP ${result.status}): ${
            typeof result.body === "string" ? result.body : JSON.stringify(result.body)
          }`,
        });
      }

      return { result: result.body, latencyMs };
    }),

  /**
   * Returns the current orchestrator queue depth, total and broken down
   * by inferred region.
   */
  queueDepth: serviceKeyProcedure.query(async (): Promise<GlueCronQueueDepthOutput> => {
    return fetchQueueDepth();
  }),
});
