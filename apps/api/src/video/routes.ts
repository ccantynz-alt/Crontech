// ── Video Processing Routes ──────────────────────────────────────────
// Server-side video processing endpoints.
// Upload, status, and render are placeholder implementations that will
// be backed by Modal.com GPU workers for heavy lifting.

import { Hono } from "hono";
import { z } from "zod";

// ── Schemas ──────────────────────────────────────────────────────────

const VideoEffectSchema = z.object({
  type: z.enum(["fade", "dissolve", "cut", "slide", "zoom"]),
  duration: z.number(),
  params: z.record(z.string(), z.number()).optional(),
});

const VideoClipSchema = z.object({
  id: z.string(),
  src: z.string(),
  startTime: z.number(),
  duration: z.number(),
  effects: z.array(VideoEffectSchema),
});

const VideoTimelineSchema = z.object({
  clips: z.array(VideoClipSchema),
  totalDuration: z.number(),
  fps: z.number(),
  width: z.number(),
  height: z.number(),
});

const RenderRequestSchema = z.object({
  timeline: VideoTimelineSchema,
  outputFormat: z.enum(["mp4", "webm"]).default("webm"),
  quality: z.enum(["draft", "preview", "final"]).default("preview"),
});

// ── In-memory job store (placeholder) ────────────────────────────────

interface VideoJob {
  id: string;
  type: "upload" | "render";
  status: "queued" | "processing" | "completed" | "failed";
  progress: number;
  createdAt: string;
  error?: string;
}

const jobs = new Map<string, VideoJob>();

function generateJobId(): string {
  return `job-${Date.now()}-${Math.random().toString(36).slice(2, 9)}`;
}

// ── Routes ───────────────────────────────────────────────────────────

export const videoRoutes = new Hono();

/**
 * POST /video/upload
 * Placeholder for video upload. Returns a mock job ID.
 */
videoRoutes.post("/upload", async (c) => {
  const jobId = generateJobId();

  const job: VideoJob = {
    id: jobId,
    type: "upload",
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Simulate processing in the background
  setTimeout(() => {
    const existing = jobs.get(jobId);
    if (existing) {
      existing.status = "processing";
      existing.progress = 50;
    }
  }, 1000);

  setTimeout(() => {
    const existing = jobs.get(jobId);
    if (existing) {
      existing.status = "completed";
      existing.progress = 100;
    }
  }, 3000);

  return c.json({ jobId, status: "queued" }, 201);
});

/**
 * GET /video/status/:jobId
 * Returns the processing status of a video job.
 */
videoRoutes.get("/status/:jobId", (c) => {
  const jobId = c.req.param("jobId");
  const job = jobs.get(jobId);

  if (!job) {
    return c.json({ error: "Job not found" }, 404);
  }

  return c.json({
    id: job.id,
    type: job.type,
    status: job.status,
    progress: job.progress,
    createdAt: job.createdAt,
    error: job.error,
  });
});

/**
 * POST /video/render
 * Accepts a VideoTimeline and queues a server-side render job.
 * Returns a job ID that can be polled via /video/status/:jobId.
 */
videoRoutes.post("/render", async (c) => {
  const body = await c.req.json();
  const parsed = RenderRequestSchema.safeParse(body);

  if (!parsed.success) {
    return c.json(
      { error: "Invalid render request", details: parsed.error.flatten() },
      400,
    );
  }

  const jobId = generateJobId();
  const { timeline } = parsed.data;

  const job: VideoJob = {
    id: jobId,
    type: "render",
    status: "queued",
    progress: 0,
    createdAt: new Date().toISOString(),
  };

  jobs.set(jobId, job);

  // Simulate render progress — will be replaced with Modal.com GPU worker dispatch
  const clipCount = timeline.clips.length;
  const stepMs = 500;

  if (clipCount > 0) {
    for (let i = 1; i <= clipCount; i++) {
      setTimeout(() => {
        const existing = jobs.get(jobId);
        if (existing) {
          existing.status = "processing";
          existing.progress = Math.round((i / clipCount) * 100);
          if (i === clipCount) {
            existing.status = "completed";
          }
        }
      }, stepMs * i);
    }
  } else {
    setTimeout(() => {
      const existing = jobs.get(jobId);
      if (existing) {
        existing.status = "completed";
        existing.progress = 100;
      }
    }, 200);
  }

  return c.json(
    {
      jobId,
      status: "queued",
      clipCount,
      estimatedDuration: `${clipCount * 0.5}s`,
    },
    202,
  );
});
