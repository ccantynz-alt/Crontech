// ── Telemetry Barrel Export ───────────────────────────────────────
export { shutdown } from "./setup";
export { telemetryMiddleware } from "./middleware";
export { traceAICall, type AISpanAttributes } from "./ai-tracer";
