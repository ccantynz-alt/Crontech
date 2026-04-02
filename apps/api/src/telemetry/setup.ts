// ── OpenTelemetry SDK Setup ──────────────────────────────────────
// Initializes tracing + metrics. Gracefully degrades if OTel
// packages have compatibility issues with the current runtime.

let _shutdown: (() => Promise<void>) | null = null;

try {
  const { NodeSDK } = await import("@opentelemetry/sdk-node");
  const resources = await import("@opentelemetry/resources");
  const semconv = await import("@opentelemetry/semantic-conventions");
  const { BatchSpanProcessor, ConsoleSpanExporter } = await import(
    "@opentelemetry/sdk-trace-base"
  );
  const { PeriodicExportingMetricReader, ConsoleMetricExporter } = await import(
    "@opentelemetry/sdk-metrics"
  );

  const isDev = process.env.NODE_ENV !== "production";
  const serviceName =
    process.env.OTEL_SERVICE_NAME ?? "back-to-the-future-api";

  // Resource construction — handle varying export shapes across versions
  const Resource = resources.Resource ?? resources.default?.Resource;
  const resource = Resource
    ? new Resource({
        [semconv.ATTR_SERVICE_NAME ?? "service.name"]: serviceName,
        [semconv.ATTR_SERVICE_VERSION ?? "service.version"]:
          process.env.npm_package_version ?? "0.0.1",
        "deployment.environment": isDev ? "development" : "production",
      })
    : undefined;

  const traceExporter = new ConsoleSpanExporter();

  const metricReader = new PeriodicExportingMetricReader({
    exporter: new ConsoleMetricExporter(),
    exportIntervalMillis: 60_000,
  });

  const sdk = new NodeSDK({
    resource,
    spanProcessors: [new BatchSpanProcessor(traceExporter)],
    metricReader,
  });

  sdk.start();

  _shutdown = async () => {
    try {
      await sdk.shutdown();
    } catch (err) {
      console.error("OpenTelemetry SDK shutdown error:", err);
    }
  };
} catch {
  console.warn("[telemetry] OpenTelemetry setup skipped — packages not compatible with current runtime");
}

export async function shutdown(): Promise<void> {
  if (_shutdown) await _shutdown();
}
