// ── Video Director Specialist Agent ──────────────────────────────
// Plans video compositions from user descriptions.
// Produces: scene list, transitions, timing, asset requirements.
// All output validated via Zod schemas.

import { generateObject, streamText } from "ai";
import { z } from "zod";
import { getModelForTier, getDefaultModel } from "../../providers";
import {
  VideoProjectSchema,
  type AgentConfig,
} from "../types";

// ── Input Schema ────────────────────────────────────────────────

export const VideoDirectorInputSchema = z.object({
  description: z
    .string()
    .describe("Natural language description of the desired video"),
  duration: z
    .enum(["short", "medium", "long"])
    .default("short")
    .describe("Target duration: short (15-30s), medium (30-90s), long (90s+)"),
  purpose: z
    .enum(["social", "ad", "explainer", "tutorial", "presentation", "promo", "other"])
    .default("other")
    .describe("Primary purpose of the video"),
  aspectRatio: z
    .enum(["16:9", "9:16", "1:1", "4:5"])
    .default("16:9")
    .describe("Target aspect ratio"),
  style: z
    .object({
      mood: z.string().optional(),
      colorPalette: z.array(z.string()).optional(),
      fontFamily: z.string().optional(),
      pace: z.enum(["slow", "moderate", "fast", "dynamic"]).optional(),
    })
    .optional()
    .describe("Visual style preferences"),
  assets: z
    .object({
      availableMedia: z
        .array(
          z.object({
            type: z.enum(["video", "image", "audio"]),
            description: z.string(),
            src: z.string().optional(),
          }),
        )
        .optional(),
      voiceover: z.boolean().optional(),
      music: z.boolean().optional(),
    })
    .optional()
    .describe("Available assets and requirements"),
});

export type VideoDirectorInput = z.infer<typeof VideoDirectorInputSchema>;

// ── Extended Output Schema ──────────────────────────────────────

export const VideoDirectorOutputSchema = z.object({
  project: VideoProjectSchema,
  assetRequirements: z.array(
    z.object({
      type: z.enum(["video", "image", "audio", "text-overlay", "shape"]),
      description: z.string(),
      required: z.boolean(),
      suggestion: z.string().optional(),
    }),
  ),
  productionNotes: z.array(z.string()),
  estimatedRenderTime: z
    .string()
    .describe("Estimated render time (e.g., '30 seconds for WebGPU, 2 minutes for CPU')"),
});

export type VideoDirectorOutput = z.infer<typeof VideoDirectorOutputSchema>;

// ── System Prompt ───────────────────────────────────────────────

const VIDEO_DIRECTOR_SYSTEM_PROMPT = `You are the Video Director agent for the Cronix platform.
Your job is to plan video compositions that will be rendered via WebGPU in the browser.

## Capabilities
- Scene composition with layered assets (video, image, text overlay, shapes)
- Transitions: cut, fade, dissolve, wipe, slide
- Precise timing control (millisecond granularity)
- Multi-track audio (voiceover + music)
- Text overlays with positioning and timing

## Resolution Presets by Aspect Ratio
- 16:9: 1920x1080 (landscape)
- 9:16: 1080x1920 (portrait/stories)
- 1:1: 1080x1080 (square)
- 4:5: 1080x1350 (portrait feed)

## Duration Guidelines
- short: 15000-30000ms (social clips, ads)
- medium: 30000-90000ms (explainers, promos)
- long: 90000-300000ms (tutorials, presentations)

## Scene Design Rules
1. Every scene needs at least one visual asset.
2. Text overlays should be concise (max 10 words on screen at once).
3. Transitions should match the mood (fast pace = cuts, slow pace = dissolves/fades).
4. Each scene should have a clear purpose in the narrative.
5. Keep total asset count manageable for WebGPU rendering.
6. Position coordinates are relative (0-1 range, where 0,0 is top-left).

## Timing Rules
1. Minimum scene duration: 2000ms (2 seconds)
2. Text must be readable: minimum 3000ms for short text, 5000ms for longer
3. Scene durations should sum to total project duration
4. Asset start/end times are relative to scene start

## Production Best Practices
- Open with a hook (first 3 seconds are critical)
- Use visual variety (don't repeat the same layout)
- End with a clear call-to-action
- Match transitions to content flow
- Use consistent color palette across scenes
`;

// ── Video Director Agent Function ───────────────────────────────

/**
 * Run the Video Director agent to plan a video composition.
 * Returns a complete video project with scenes, timing, and asset requirements.
 */
export async function runVideoDirector(
  input: VideoDirectorInput,
  config: AgentConfig,
): Promise<VideoDirectorOutput> {
  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  const resolution = getResolution(input.aspectRatio);
  const durationRange = getDurationRange(input.duration);

  const styleStr = input.style ? `\nStyle: ${JSON.stringify(input.style)}` : "";
  const assetsStr = input.assets
    ? `\nAvailable assets: ${JSON.stringify(input.assets)}`
    : "";

  const { object } = await generateObject({
    model,
    schema: VideoDirectorOutputSchema,
    system: VIDEO_DIRECTOR_SYSTEM_PROMPT,
    prompt: `Plan a video composition for the following:

Description: ${input.description}
Purpose: ${input.purpose}
Target duration: ${input.duration} (${durationRange.min}-${durationRange.max}ms)
Resolution: ${resolution.width}x${resolution.height} (${input.aspectRatio})${styleStr}${assetsStr}

Create a complete video project with:
1. Scene list with transitions and timing
2. Asset placement and timing within each scene
3. Audio track requirements
4. Asset requirements (what media is needed)
5. Production notes for the rendering pipeline`,
    temperature: config.temperature ?? 0.6,
  });

  config.onEvent?.({
    type: "complete",
    finalOutput: JSON.stringify(object),
    timestamp: Date.now(),
  });

  return object;
}

/**
 * Stream the Video Director analysis as text.
 */
export function streamVideoDirector(
  input: VideoDirectorInput,
  config: AgentConfig,
): ReturnType<typeof streamText> {
  const model = config.providerEnv
    ? getModelForTier(config.computeTier, config.providerEnv)
    : getDefaultModel();

  const resolution = getResolution(input.aspectRatio);
  const durationRange = getDurationRange(input.duration);

  const styleStr = input.style ? `\nStyle: ${JSON.stringify(input.style)}` : "";
  const assetsStr = input.assets
    ? `\nAvailable assets: ${JSON.stringify(input.assets)}`
    : "";

  return streamText({
    model,
    system: VIDEO_DIRECTOR_SYSTEM_PROMPT,
    prompt: `Plan a video composition for the following:

Description: ${input.description}
Purpose: ${input.purpose}
Target duration: ${input.duration} (${durationRange.min}-${durationRange.max}ms)
Resolution: ${resolution.width}x${resolution.height} (${input.aspectRatio})${styleStr}${assetsStr}

Describe each scene in detail including: visual composition, text overlays, transitions, timing, and required assets.`,
    maxOutputTokens: config.maxTokens ?? 4096,
    temperature: config.temperature ?? 0.6,
  });
}

// ── Helpers ─────────────────────────────────────────────────────

function getResolution(aspectRatio: string): { width: number; height: number } {
  switch (aspectRatio) {
    case "16:9":
      return { width: 1920, height: 1080 };
    case "9:16":
      return { width: 1080, height: 1920 };
    case "1:1":
      return { width: 1080, height: 1080 };
    case "4:5":
      return { width: 1080, height: 1350 };
    default:
      return { width: 1920, height: 1080 };
  }
}

function getDurationRange(duration: string): { min: number; max: number } {
  switch (duration) {
    case "short":
      return { min: 15000, max: 30000 };
    case "medium":
      return { min: 30000, max: 90000 };
    case "long":
      return { min: 90000, max: 300000 };
    default:
      return { min: 15000, max: 30000 };
  }
}
