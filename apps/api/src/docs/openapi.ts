// ── OpenAPI Specification ─────────────────────────────────────────
// Defines the OpenAPI 3.1 spec for all non-tRPC Hono routes.
// tRPC endpoints have their own end-to-end type safety and are
// excluded from this document.

import { z } from "zod";

// ── Shared Schemas ───────────────────────────────────────────────

const ErrorResponseSchema = z.object({
  error: z.string(),
  details: z.unknown().optional(),
});

const MessageSchema = z.object({
  role: z.enum(["user", "assistant", "system"]),
  content: z.string(),
});

const ComputeTierSchema = z.enum(["client", "edge", "cloud"]).default("cloud");

// ── Health ───────────────────────────────────────────────────────

const HealthResponseSchema = z.object({
  status: z.literal("ok"),
  timestamp: z.string().datetime(),
});

// ── AI: Site Builder ─────────────────────────────────────────────

const SiteBuilderInputSchema = z.object({
  messages: z
    .array(MessageSchema)
    .min(1, "At least one message is required"),
  computeTier: ComputeTierSchema,
  maxTokens: z.number().int().min(1).max(16384).default(4096),
  temperature: z.number().min(0).max(2).default(0.7),
});

// ── SSE ──────────────────────────────────────────────────────────

const RoomUsersResponseSchema = z.object({
  roomId: z.string(),
  users: z.array(
    z.object({
      id: z.string(),
      name: z.string().optional(),
    }),
  ),
  count: z.number().int(),
});

const RealtimeStatsResponseSchema = z.object({
  rooms: z.number().int(),
  users: z.number().int(),
  timestamp: z.string().datetime(),
});

// ── Auth: Registration ───────────────────────────────────────────

const RegisterOptionsInputSchema = z.object({
  email: z.string().email(),
  displayName: z.string().min(1).max(255),
});

const RegisterOptionsResponseSchema = z.object({
  options: z.object({}).passthrough().describe("PublicKeyCredentialCreationOptionsJSON"),
  userId: z.string().uuid(),
});

const RegisterVerifyInputSchema = z.object({
  userId: z.string().uuid(),
  response: z.object({}).passthrough().describe("RegistrationResponseJSON from WebAuthn API"),
});

const RegisterVerifyResponseSchema = z.object({
  verified: z.boolean(),
  token: z.string(),
});

// ── Auth: Login ──────────────────────────────────────────────────

const LoginOptionsInputSchema = z
  .object({
    email: z.string().email().optional(),
  })
  .optional();

const LoginOptionsResponseSchema = z.object({
  options: z.object({}).passthrough().describe("PublicKeyCredentialRequestOptionsJSON"),
  userId: z.string().uuid().nullable(),
});

const LoginVerifyInputSchema = z.object({
  userId: z.string().uuid().nullable(),
  response: z.object({}).passthrough().describe("AuthenticationResponseJSON from WebAuthn API"),
});

const LoginVerifyResponseSchema = z.object({
  verified: z.boolean(),
  token: z.string(),
  userId: z.string().uuid(),
});

// ── Auth: Logout ─────────────────────────────────────────────────

const LogoutResponseSchema = z.object({
  success: z.boolean(),
});

// ── OpenAPI Document ─────────────────────────────────────────────

function zodToJsonSchema(schema: z.ZodTypeAny): Record<string, unknown> {
  // Lightweight Zod-to-JSON-Schema conversion for OpenAPI.
  // Handles the subset of Zod types used in our API schemas.
  if (schema instanceof z.ZodObject) {
    const shape = schema.shape as Record<string, z.ZodTypeAny>;
    const properties: Record<string, unknown> = {};
    const required: string[] = [];

    for (const [key, value] of Object.entries(shape)) {
      properties[key] = zodToJsonSchema(value);
      if (!(value instanceof z.ZodOptional) && !(value instanceof z.ZodDefault)) {
        required.push(key);
      }
    }

    const result: Record<string, unknown> = {
      type: "object",
      properties,
    };
    if (required.length > 0) {
      result.required = required;
    }
    return result;
  }

  if (schema instanceof z.ZodArray) {
    return {
      type: "array",
      items: zodToJsonSchema(schema.element),
    };
  }

  if (schema instanceof z.ZodString) {
    return { type: "string" };
  }

  if (schema instanceof z.ZodNumber) {
    return { type: "number" };
  }

  if (schema instanceof z.ZodBoolean) {
    return { type: "boolean" };
  }

  if (schema instanceof z.ZodLiteral) {
    return { type: typeof schema.value, enum: [schema.value] };
  }

  if (schema instanceof z.ZodEnum) {
    return { type: "string", enum: schema.options };
  }

  if (schema instanceof z.ZodDefault) {
    const inner = zodToJsonSchema(schema._def.innerType);
    return { ...inner, default: schema._def.defaultValue() };
  }

  if (schema instanceof z.ZodOptional) {
    return zodToJsonSchema(schema.unwrap());
  }

  if (schema instanceof z.ZodNullable) {
    const inner = zodToJsonSchema(schema.unwrap());
    return { ...inner, nullable: true };
  }

  if (schema instanceof z.ZodUnknown) {
    return {};
  }

  if (schema._def?.description) {
    return { type: "object", description: schema._def.description };
  }

  return { type: "object" };
}

function jsonContent(schema: z.ZodTypeAny): Record<string, unknown> {
  return {
    "application/json": {
      schema: zodToJsonSchema(schema),
    },
  };
}

function sseContent(): Record<string, unknown> {
  return {
    "text/event-stream": {
      schema: { type: "string", description: "Server-Sent Events stream" },
    },
  };
}

export const openApiDocument = {
  openapi: "3.1.0",
  info: {
    title: "Back to the Future API",
    version: "0.0.1",
    description:
      "API documentation for the Back to the Future platform. " +
      "This covers non-tRPC HTTP routes. tRPC endpoints use end-to-end " +
      "type safety and are not included here.",
    contact: {
      name: "Back to the Future Team",
    },
  },
  servers: [
    {
      url: "/api",
      description: "API base path",
    },
  ],
  tags: [
    { name: "Health", description: "Service health checks" },
    { name: "AI", description: "AI-powered endpoints (streaming)" },
    { name: "Realtime", description: "Server-Sent Events and room management" },
    { name: "Auth", description: "Passkey / WebAuthn authentication (via tRPC)" },
  ],
  paths: {
    "/health": {
      get: {
        operationId: "getHealth",
        summary: "Health check",
        description: "Returns the current health status of the API server.",
        tags: ["Health"],
        responses: {
          "200": {
            description: "Service is healthy",
            content: jsonContent(HealthResponseSchema),
          },
        },
      },
    },

    "/ai/site-builder": {
      post: {
        operationId: "postAiSiteBuilder",
        summary: "AI site builder agent",
        description:
          "Multi-step AI agent with tool calling and streaming. " +
          "The agent can search content, generate components, and analyze code. " +
          "Response is streamed as text via AI SDK stream protocol.",
        tags: ["AI"],
        requestBody: {
          required: true,
          content: jsonContent(SiteBuilderInputSchema),
        },
        responses: {
          "200": {
            description: "Streamed AI text response",
            content: {
              "text/plain": {
                schema: {
                  type: "string",
                  description: "AI SDK text stream (tokens streamed as they arrive)",
                },
              },
            },
          },
          "400": {
            description: "Invalid input",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },

    "/realtime/events/{roomId}": {
      get: {
        operationId: "getSSEEvents",
        summary: "Subscribe to room events via SSE",
        description:
          "Opens a Server-Sent Events stream for the given room. " +
          "Receives real-time updates including user presence, cursor positions, " +
          "and collaboration events. Keep-alive pings are sent every 15 seconds.",
        tags: ["Realtime"],
        parameters: [
          {
            name: "roomId",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 255 },
            description: "The room ID to subscribe to",
          },
        ],
        responses: {
          "200": {
            description: "SSE stream opened successfully",
            content: sseContent(),
          },
          "400": {
            description: "Invalid room ID",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },

    "/realtime/rooms/{roomId}/users": {
      get: {
        operationId: "getRoomUsers",
        summary: "List users in a room",
        description:
          "Returns the list of users currently connected to the specified room.",
        tags: ["Realtime"],
        parameters: [
          {
            name: "roomId",
            in: "path",
            required: true,
            schema: { type: "string", minLength: 1, maxLength: 255 },
            description: "The room ID to query",
          },
        ],
        responses: {
          "200": {
            description: "Room user list",
            content: jsonContent(RoomUsersResponseSchema),
          },
          "400": {
            description: "Invalid room ID",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },

    "/realtime/stats": {
      get: {
        operationId: "getRealtimeStats",
        summary: "Realtime server stats",
        description:
          "Returns the number of active rooms and total connected users.",
        tags: ["Realtime"],
        responses: {
          "200": {
            description: "Server statistics",
            content: jsonContent(RealtimeStatsResponseSchema),
          },
        },
      },
    },

    "/auth/register/options": {
      post: {
        operationId: "postAuthRegisterOptions",
        summary: "Start passkey registration",
        description:
          "Generates WebAuthn registration options for the given user. " +
          "Creates the user if they do not exist. Returns a challenge that " +
          "must be signed by the authenticator and sent to /auth/register/verify. " +
          "Note: This endpoint is served via tRPC (auth.register.start mutation).",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: jsonContent(RegisterOptionsInputSchema),
        },
        responses: {
          "200": {
            description: "Registration options with challenge",
            content: jsonContent(RegisterOptionsResponseSchema),
          },
          "400": {
            description: "Invalid input",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },

    "/auth/register/verify": {
      post: {
        operationId: "postAuthRegisterVerify",
        summary: "Verify passkey registration",
        description:
          "Verifies the signed WebAuthn registration response and stores " +
          "the new credential. Returns a session token on success. " +
          "Note: This endpoint is served via tRPC (auth.register.finish mutation).",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: jsonContent(RegisterVerifyInputSchema),
        },
        responses: {
          "200": {
            description: "Registration verified, session created",
            content: jsonContent(RegisterVerifyResponseSchema),
          },
          "400": {
            description: "Challenge expired or verification failed",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },

    "/auth/login/options": {
      post: {
        operationId: "postAuthLoginOptions",
        summary: "Start passkey login",
        description:
          "Generates WebAuthn authentication options. Optionally accepts " +
          "an email to scope to a specific user's credentials. " +
          "Returns a challenge for the authenticator. " +
          "Note: This endpoint is served via tRPC (auth.login.start mutation).",
        tags: ["Auth"],
        requestBody: {
          required: false,
          content: jsonContent(LoginOptionsInputSchema),
        },
        responses: {
          "200": {
            description: "Authentication options with challenge",
            content: jsonContent(LoginOptionsResponseSchema),
          },
          "404": {
            description: "User or credentials not found",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },

    "/auth/login/verify": {
      post: {
        operationId: "postAuthLoginVerify",
        summary: "Verify passkey login",
        description:
          "Verifies the signed WebAuthn authentication response. " +
          "Returns a session token and user ID on success. " +
          "Note: This endpoint is served via tRPC (auth.login.finish mutation).",
        tags: ["Auth"],
        requestBody: {
          required: true,
          content: jsonContent(LoginVerifyInputSchema),
        },
        responses: {
          "200": {
            description: "Authentication verified, session created",
            content: jsonContent(LoginVerifyResponseSchema),
          },
          "400": {
            description: "Challenge expired or verification failed",
            content: jsonContent(ErrorResponseSchema),
          },
          "401": {
            description: "Authentication verification failed",
            content: jsonContent(ErrorResponseSchema),
          },
          "404": {
            description: "Credential not found",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },

    "/auth/logout": {
      post: {
        operationId: "postAuthLogout",
        summary: "End session",
        description:
          "Destroys the current session. Requires a valid session token. " +
          "Note: This endpoint is served via tRPC (auth.logout mutation).",
        tags: ["Auth"],
        security: [{ bearerAuth: [] }],
        responses: {
          "200": {
            description: "Session destroyed",
            content: jsonContent(LogoutResponseSchema),
          },
          "401": {
            description: "Not authenticated",
            content: jsonContent(ErrorResponseSchema),
          },
        },
      },
    },
  },

  components: {
    securitySchemes: {
      bearerAuth: {
        type: "http",
        scheme: "bearer",
        description: "Session token returned by login or registration",
      },
    },
  },
} as const;
