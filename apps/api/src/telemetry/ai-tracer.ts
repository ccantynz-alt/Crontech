// ── AI Tracer ────────────────────────────────────────────────────
// Utility for tracing AI operations (LLM calls, tool invocations,
// generative UI, RAG pipelines). Records model, token usage, latency,
// and tool call metadata as span attributes.

import { trace, SpanKind, SpanStatusCode } from "@opentelemetry/api";

const tracer = trace.getTracer("cronix-ai", "0.0.1");

/** Attributes that can be recorded on an AI span. */
export interface AISpanAttributes {
  /** The model identifier (e.g. "gpt-4o", "llama-3.1-8b") */
  model?: string;
  /** Compute tier used: client | edge | cloud */
  computeTier?: string;
  /** Number of prompt/input tokens */
  promptTokens?: number;
  /** Number of completion/output tokens */
  completionTokens?: number;
  /** Total tokens (prompt + completion) */
  totalTokens?: number;
  /** Number of tool calls the model made */
  toolCalls?: number;
  /** Names of tools invoked */
  toolNames?: string[];
  /** Temperature setting */
  temperature?: number;
  /** Max output tokens requested */
  maxTokens?: number;
  /** Arbitrary extra attributes */
  [key: string]: string | number | boolean | string[] | undefined;
}

/**
 * Wraps an AI operation in an OpenTelemetry span.
 *
 * Usage:
 * ```ts
 * const result = await traceAICall("ai.chat", { model: "gpt-4o" }, async (span) => {
 *   const res = await streamText({ model, messages });
 *   span.setAttribute("ai.completion_tokens", res.usage?.completionTokens ?? 0);
 *   return res;
 * });
 * ```
 *
 * @param name   Span name (e.g. "ai.chat", "ai.generate-ui", "ai.site-builder")
 * @param attrs  Initial attributes to set on the span
 * @param fn     The async function to execute within the span context.
 *               Receives the active span so callers can add attributes mid-flight.
 */
export async function traceAICall<T>(
  name: string,
  attrs: AISpanAttributes,
  fn: (span: ReturnType<typeof tracer.startSpan>) => Promise<T>,
): Promise<T> {
  const span = tracer.startSpan(name, {
    kind: SpanKind.CLIENT,
    attributes: buildAttributes(attrs),
  });

  const start = performance.now();

  try {
    const result = await fn(span);

    const latencyMs = performance.now() - start;
    span.setAttribute("ai.latency_ms", Math.round(latencyMs * 100) / 100);
    span.setStatus({ code: SpanStatusCode.OK });

    return result;
  } catch (err) {
    const latencyMs = performance.now() - start;
    span.setAttribute("ai.latency_ms", Math.round(latencyMs * 100) / 100);

    const message = err instanceof Error ? err.message : "AI call failed";
    span.setStatus({ code: SpanStatusCode.ERROR, message });
    span.recordException(err instanceof Error ? err : new Error(message));

    throw err;
  } finally {
    span.end();
  }
}

/** Convert AISpanAttributes to flat OTel-compatible attribute map. */
function buildAttributes(
  attrs: AISpanAttributes,
): Record<string, string | number | boolean> {
  const out: Record<string, string | number | boolean> = {};

  if (attrs.model != null) out["ai.model"] = attrs.model;
  if (attrs.computeTier != null) out["ai.compute_tier"] = attrs.computeTier;
  if (attrs.promptTokens != null) out["ai.prompt_tokens"] = attrs.promptTokens;
  if (attrs.completionTokens != null)
    out["ai.completion_tokens"] = attrs.completionTokens;
  if (attrs.totalTokens != null) out["ai.total_tokens"] = attrs.totalTokens;
  if (attrs.toolCalls != null) out["ai.tool_calls"] = attrs.toolCalls;
  if (attrs.toolNames != null)
    out["ai.tool_names"] = attrs.toolNames.join(",");
  if (attrs.temperature != null) out["ai.temperature"] = attrs.temperature;
  if (attrs.maxTokens != null) out["ai.max_tokens"] = attrs.maxTokens;

  // Pass through any extra keys
  for (const [key, value] of Object.entries(attrs)) {
    if (
      value != null &&
      !["model", "computeTier", "promptTokens", "completionTokens", "totalTokens", "toolCalls", "toolNames", "temperature", "maxTokens"].includes(key)
    ) {
      if (typeof value === "string" || typeof value === "number" || typeof value === "boolean") {
        out[`ai.${key}`] = value;
      }
    }
  }

  return out;
}
