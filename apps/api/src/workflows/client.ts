import { Inngest } from "inngest";

/**
 * Inngest client for Cronix durable workflows.
 * Used across all workflow functions for AI pipelines, video processing,
 * and site building.
 */
export const inngest = new Inngest({
  id: "cronix",
});
