// ── OpenTelemetry SDK Setup ──────────────────────────────────────
// Initializes tracing + metrics. MUST be imported before any other
// application code so auto-instrumentation hooks can patch modules.

import { NodeSDK } from "@opentelemetry/sdk-node";
import { Resource } from "@opentelemetry/resources";
import {
  ATTR_SERVICE_NAME,
  ATTR_SERVICE_VERSION,
} from "@opentelemetry/semantic-conventions";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { BatchSpanProcessor, ConsoleSpanExporter } from "@opentelemetry/sdk-trace-base";
import { PeriodicExportingMetricReader, ConsoleMetricExporter } from "@opentelemetry/sdk-metrics";

const isDev = process.env.NODE_ENV !== "production";

const otlpEndpoint =
  process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318";

const serviceName =
  process.env.OTEL_SERVICE_NAME ?? "back-to-the-future-api";

const resource = new Resource({
  [ATTR_SERVICE_NAME]: serviceName,
  [ATTR_SERVICE_VERSION]: process.env.npm_package_version ?? "0.0.1",
  "deployment.environment": isDev ? "development" : "production",
});

// Trace exporter: OTLP in production, console in dev
const traceExporter = isDev
  ? new ConsoleSpanExporter()
  : new OTLPTraceExporter({ url: `${otlpEndpoint}/v1/traces` });

// Metric exporter: OTLP in production, console in dev
const metricReader = new PeriodicExportingMetricReader({
  exporter: isDev
    ? new ConsoleMetricExporter()
    : new OTLPMetricExporter({ url: `${otlpEndpoint}/v1/metrics` }),
  exportIntervalMillis: isDev ? 60_000 : 15_000,
});

const sdk = new NodeSDK({
  resource,
  spanProcessors: [new BatchSpanProcessor(traceExporter)],
  metricReader,
});

sdk.start();

/**
 * Gracefully flush and shut down the OpenTelemetry SDK.
 * Call this on process exit to ensure all pending telemetry is exported.
 */
export async function shutdown(): Promise<void> {
  try {
    await sdk.shutdown();
  } catch (err) {
    console.error("OpenTelemetry SDK shutdown error:", err);
  }
}
