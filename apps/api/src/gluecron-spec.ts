// ── GlueCron API — OpenAPI 3.1 Spec ──────────────────────────────────
// Static, hand-authored machine-readable description of the GlueCron
// tRPC procedure surface. Consumed by GlueCron's SDK generator, API
// docs, and integration tests.
//
// All procedures are served under the tRPC batch transport at:
//   POST /trpc/gluecron.<procedure>
// with the standard tRPC v11 request envelope.
//
// Authentication: every call must include
//   X-Service-Key: <GLUECRON_SERVICE_KEY>
// in the request headers. Missing or incorrect key returns HTTP 401.

export const gluecronSpec = {
  openapi: "3.1.0",

  info: {
    title: "GlueCron Machine-to-Machine API",
    version: "1.0.0",
    description:
      "tRPC procedures that allow GlueCron to programmatically scale, deploy, invoke, and query the Crontech platform. All procedures are protected by a service API key supplied via the X-Service-Key request header.",
    contact: {
      name: "Crontech Platform",
      url: "https://crontech.ai",
    },
  },

  servers: [
    {
      url: "https://api.crontech.ai",
      description: "Production",
    },
    {
      url: "http://localhost:9000",
      description: "Local development (orchestrator direct)",
    },
  ],

  security: [{ serviceKey: [] }],

  components: {
    securitySchemes: {
      serviceKey: {
        type: "apiKey",
        in: "header",
        name: "X-Service-Key",
        description:
          "Service API key. Must match the GLUECRON_SERVICE_KEY environment variable on the API server.",
      },
    },

    schemas: {
      // ── Shared error shape ────────────────────────────────────────
      TRPCError: {
        type: "object",
        required: ["error"],
        properties: {
          error: {
            type: "object",
            required: ["message", "code"],
            properties: {
              message: { type: "string" },
              code: { type: "string" },
              data: {
                type: "object",
                properties: {
                  code: { type: "string" },
                  httpStatus: { type: "integer" },
                },
              },
            },
          },
        },
      },

      // ── gluecron.health ───────────────────────────────────────────
      HealthOutput: {
        type: "object",
        required: ["status", "queueDepth", "checkedAt"],
        properties: {
          status: {
            type: "string",
            enum: ["ok", "degraded"],
            description:
              "ok = all internal services reachable; degraded = one or more services unavailable.",
          },
          queueDepth: {
            type: "integer",
            minimum: 0,
            description: "Number of deploy jobs currently in the queued state.",
          },
          checkedAt: {
            type: "string",
            format: "date-time",
            description: "ISO-8601 timestamp of when this health check was performed.",
          },
        },
      },

      // ── gluecron.listRegions ──────────────────────────────────────
      Region: {
        type: "object",
        required: ["id", "url", "healthy", "workerCount"],
        properties: {
          id: {
            type: "string",
            description: "Unique region identifier (kebab-case).",
          },
          url: {
            type: "string",
            format: "uri",
            description: "Internal region-orchestrator endpoint for this region.",
          },
          healthy: {
            type: "boolean",
            description: "true when the region's currentLoad is below its capacity ceiling.",
          },
          workerCount: {
            type: "integer",
            minimum: 0,
            description: "Number of running workers in this region.",
          },
        },
      },

      ListRegionsOutput: {
        type: "object",
        required: ["regions"],
        properties: {
          regions: {
            type: "array",
            items: { $ref: "#/components/schemas/Region" },
          },
        },
      },

      // ── gluecron.scale input ──────────────────────────────────────
      ScaleInput: {
        type: "object",
        required: ["regionId", "delta"],
        properties: {
          regionId: {
            type: "string",
            minLength: 1,
            description: "Region in which to adjust the worker count.",
          },
          delta: {
            type: "integer",
            description: "Number of workers to add (positive) or remove (negative). 0 is a no-op.",
          },
        },
      },

      ScaleOutput: {
        type: "object",
        required: ["regionId", "newWorkerCount"],
        properties: {
          regionId: {
            type: "string",
            description: "Region that was scaled.",
          },
          newWorkerCount: {
            type: "integer",
            minimum: 0,
            description: "Worker count in the region after the scale operation completes.",
          },
        },
      },

      // ── gluecron.deploy input ─────────────────────────────────────
      DeployInput: {
        type: "object",
        required: ["projectId", "ref", "environment"],
        properties: {
          projectId: {
            type: "string",
            minLength: 1,
            description: "Crontech project identifier.",
          },
          ref: {
            type: "string",
            minLength: 1,
            description: "Git ref (branch name, tag, or commit SHA) to deploy.",
          },
          environment: {
            type: "string",
            enum: ["production", "preview"],
            description: "Target deployment environment.",
          },
        },
      },

      DeployOutput: {
        type: "object",
        required: ["deployId", "queued"],
        properties: {
          deployId: {
            type: "string",
            description:
              "Opaque deploy job identifier. Formed as <projectId>-<environment>-<timestamp>.",
          },
          queued: {
            type: "boolean",
            description:
              "true when the orchestrator accepted the job; false when the orchestrator was unreachable (the deployId is still recorded).",
          },
        },
      },

      // ── gluecron.invoke input ─────────────────────────────────────
      InvokeInput: {
        type: "object",
        required: ["workerId", "payload"],
        properties: {
          workerId: {
            type: "string",
            minLength: 1,
            description: "Bundle/worker identifier as registered with the edge runtime.",
          },
          payload: {
            description:
              "Arbitrary JSON payload forwarded to the bundle's fetch handler as the request body.",
          },
        },
      },

      InvokeOutput: {
        type: "object",
        required: ["result", "latencyMs"],
        properties: {
          result: {
            description: "JSON response body returned by the edge bundle.",
          },
          latencyMs: {
            type: "integer",
            minimum: 0,
            description:
              "Round-trip latency in milliseconds from the tRPC server to the edge runtime and back.",
          },
        },
      },

      // ── gluecron.queueDepth ───────────────────────────────────────
      QueueDepthOutput: {
        type: "object",
        required: ["total", "byRegion"],
        properties: {
          total: {
            type: "integer",
            minimum: 0,
            description: "Total number of queued deploy jobs across all regions.",
          },
          byRegion: {
            type: "object",
            additionalProperties: {
              type: "integer",
              minimum: 0,
            },
            description: "Map of region identifier to queued-job count for that region.",
          },
        },
      },
    },
  },

  paths: {
    // tRPC exposes procedures through a unified POST endpoint.
    // Each path below documents a single procedure using the tRPC v11
    // HTTP transport convention:  POST /trpc/<procedure>
    // For query procedures, input is passed as the JSON `input` field.
    // For mutation procedures, the full body is the tRPC envelope.

    "/trpc/gluecron.health": {
      post: {
        operationId: "gluecron_health",
        summary: "Platform health check",
        description:
          "Returns the overall API status, current deploy queue depth, and the timestamp of the check. A `degraded` status means one or more internal services (orchestrator, edge runtime) were unreachable at check time.",
        tags: ["gluecron"],
        security: [{ serviceKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "tRPC query envelope (no input required).",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Health check result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["result"],
                  properties: {
                    result: {
                      type: "object",
                      required: ["data"],
                      properties: {
                        data: { $ref: "#/components/schemas/HealthOutput" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid X-Service-Key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
          "500": {
            description: "GLUECRON_SERVICE_KEY not configured on the server",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
        },
      },
    },

    "/trpc/gluecron.listRegions": {
      post: {
        operationId: "gluecron_listRegions",
        summary: "List registered regions",
        description:
          "Returns all regions registered with the region-orchestrator, including per-region health (load vs capacity) and current worker counts from the worker-runtime. Returns an empty list when the region-orchestrator is unreachable.",
        tags: ["gluecron"],
        security: [{ serviceKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "tRPC query envelope (no input required).",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Region list",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["result"],
                  properties: {
                    result: {
                      type: "object",
                      required: ["data"],
                      properties: {
                        data: { $ref: "#/components/schemas/ListRegionsOutput" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid X-Service-Key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
        },
      },
    },

    "/trpc/gluecron.scale": {
      post: {
        operationId: "gluecron_scale",
        summary: "Scale workers in a region",
        description:
          "Adjusts the number of workers running in the specified region by `delta`. Positive delta signals scale-up intent (GlueCron issues the actual POST /workers registrations). Negative delta stops the most-recently-added workers in the region via the worker-runtime. Returns the new target worker count.",
        tags: ["gluecron"],
        security: [{ serviceKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["input"],
                properties: {
                  input: { $ref: "#/components/schemas/ScaleInput" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Scale result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["result"],
                  properties: {
                    result: {
                      type: "object",
                      required: ["data"],
                      properties: {
                        data: { $ref: "#/components/schemas/ScaleOutput" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid X-Service-Key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
        },
      },
    },

    "/trpc/gluecron.deploy": {
      post: {
        operationId: "gluecron_deploy",
        summary: "Enqueue a deploy job",
        description:
          "Submits a deploy job for the given project + ref to the orchestrator. The orchestrator handles the full pipeline: clone → framework detection → sandboxed install + build → start → Caddy route. Returns a deployId for tracking. `queued: false` means the orchestrator was unreachable but the deployId is still recorded for retry.",
        tags: ["gluecron"],
        security: [{ serviceKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["input"],
                properties: {
                  input: { $ref: "#/components/schemas/DeployInput" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Deploy enqueue result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["result"],
                  properties: {
                    result: {
                      type: "object",
                      required: ["data"],
                      properties: {
                        data: { $ref: "#/components/schemas/DeployOutput" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid X-Service-Key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
        },
      },
    },

    "/trpc/gluecron.invoke": {
      post: {
        operationId: "gluecron_invoke",
        summary: "Invoke an edge worker",
        description:
          "Dispatches a request to the edge runtime for the given workerId (bundle ID). The payload is forwarded as the JSON body to the bundle's fetch handler. Returns the bundle's response and the round-trip latency. Throws INTERNAL_SERVER_ERROR if the edge runtime returns a non-2xx response.",
        tags: ["gluecron"],
        security: [{ serviceKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                required: ["input"],
                properties: {
                  input: { $ref: "#/components/schemas/InvokeInput" },
                },
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Invocation result",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["result"],
                  properties: {
                    result: {
                      type: "object",
                      required: ["data"],
                      properties: {
                        data: { $ref: "#/components/schemas/InvokeOutput" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid X-Service-Key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
          "500": {
            description: "Edge runtime returned an error or was unreachable",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
        },
      },
    },

    "/trpc/gluecron.queueDepth": {
      post: {
        operationId: "gluecron_queueDepth",
        summary: "Queue depth per region",
        description:
          "Returns the current number of queued deploy jobs across the orchestrator, broken down by inferred region. Region is inferred from the deployment domain naming convention (<projectId>.<region>.crontech.ai). Returns zeroed output if the orchestrator is unreachable.",
        tags: ["gluecron"],
        security: [{ serviceKey: [] }],
        requestBody: {
          required: true,
          content: {
            "application/json": {
              schema: {
                type: "object",
                description: "tRPC query envelope (no input required).",
              },
            },
          },
        },
        responses: {
          "200": {
            description: "Queue depth",
            content: {
              "application/json": {
                schema: {
                  type: "object",
                  required: ["result"],
                  properties: {
                    result: {
                      type: "object",
                      required: ["data"],
                      properties: {
                        data: { $ref: "#/components/schemas/QueueDepthOutput" },
                      },
                    },
                  },
                },
              },
            },
          },
          "401": {
            description: "Missing or invalid X-Service-Key",
            content: {
              "application/json": {
                schema: { $ref: "#/components/schemas/TRPCError" },
              },
            },
          },
        },
      },
    },
  },

  tags: [
    {
      name: "gluecron",
      description:
        "Machine-to-machine procedures for GlueCron to interact with the Crontech platform. All procedures require X-Service-Key authentication.",
    },
  ],
} as const;
