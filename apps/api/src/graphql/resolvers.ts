import type {
  GQLUser,
  GQLProject,
  GQLComponent,
  GQLSearchResult,
  CreateProjectInput,
  UpdateProjectInput,
} from "./schema";

// ── Mock Data ───────────────────────────────────────────────────────

const MOCK_USER: GQLUser = {
  id: "usr_001",
  email: "ada@example.com",
  displayName: "Ada Lovelace",
  role: "ADMIN",
  createdAt: new Date("2025-01-01T00:00:00Z"),
  updatedAt: new Date("2025-06-15T12:00:00Z"),
};

const MOCK_PROJECTS: readonly GQLProject[] = [
  {
    id: "prj_001",
    name: "Marketing Site",
    description: "AI-generated marketing landing page",
    ownerId: "usr_001",
    createdAt: new Date("2025-02-01T00:00:00Z"),
    updatedAt: new Date("2025-06-10T08:30:00Z"),
  },
  {
    id: "prj_002",
    name: "Dashboard",
    description: null,
    ownerId: "usr_001",
    createdAt: new Date("2025-03-15T00:00:00Z"),
    updatedAt: new Date("2025-06-14T16:45:00Z"),
  },
] as const;

const MOCK_COMPONENTS: readonly GQLComponent[] = [
  {
    id: "cmp_001",
    projectId: "prj_001",
    name: "HeroSection",
    schemaRef: "ui/hero-section",
    props: JSON.stringify({ headline: "Build the Future", cta: "Get Started" }),
    createdAt: new Date("2025-02-02T00:00:00Z"),
    updatedAt: new Date("2025-06-10T08:30:00Z"),
  },
  {
    id: "cmp_002",
    projectId: "prj_001",
    name: "FeatureGrid",
    schemaRef: "ui/feature-grid",
    props: JSON.stringify({ columns: 3 }),
    createdAt: new Date("2025-02-03T00:00:00Z"),
    updatedAt: new Date("2025-06-09T10:00:00Z"),
  },
] as const;

// ── Resolver Context ────────────────────────────────────────────────

/** Shared context injected into every resolver via graphql-yoga. */
export interface GraphQLContext {
  // TODO: Add authenticated user from passkey/session middleware
  // readonly currentUser: GQLUser | null;

  // TODO: Add Drizzle DB client
  // readonly db: ReturnType<typeof import("@back-to-the-future/db").createClient>;

  // TODO: Add Qdrant client for vector search
  // readonly qdrant: QdrantClient;
}

// ── Helper ──────────────────────────────────────────────────────────

function findProjectById(id: string): GQLProject | undefined {
  return MOCK_PROJECTS.find((p) => p.id === id);
}

// ── Resolvers ───────────────────────────────────────────────────────

export const resolvers = {
  // ── Scalar ──────────────────────────────────────────────────────
  DateTime: {
    // graphql-yoga serialises scalars via these hooks
    serialize(value: unknown): string {
      if (value instanceof Date) {
        return value.toISOString();
      }
      return String(value);
    },
    parseValue(value: unknown): Date {
      if (typeof value === "string" || typeof value === "number") {
        return new Date(value);
      }
      throw new TypeError("DateTime scalar requires a string or number value");
    },
  },

  // ── Queries ─────────────────────────────────────────────────────
  Query: {
    user(
      _parent: unknown,
      args: { readonly id: string },
      _ctx: GraphQLContext,
    ): GQLUser | null {
      // TODO: Replace with Drizzle query against `users` table
      // e.g. db.select().from(users).where(eq(users.id, args.id)).get()
      if (args.id === MOCK_USER.id) {
        return MOCK_USER;
      }
      return null;
    },

    projects(
      _parent: unknown,
      args: { readonly limit?: number | undefined; readonly offset?: number | undefined },
      _ctx: GraphQLContext,
    ): readonly GQLProject[] {
      // TODO: Replace with Drizzle query with limit/offset
      // e.g. db.select().from(projects).limit(limit).offset(offset).all()
      const start = args.offset ?? 0;
      const end = start + (args.limit ?? 50);
      return MOCK_PROJECTS.slice(start, end);
    },

    project(
      _parent: unknown,
      args: { readonly id: string },
      _ctx: GraphQLContext,
    ): GQLProject | null {
      // TODO: Replace with Drizzle query
      return findProjectById(args.id) ?? null;
    },

    searchContent(
      _parent: unknown,
      args: { readonly query: string; readonly limit?: number | undefined },
      _ctx: GraphQLContext,
    ): readonly GQLSearchResult[] {
      // TODO: Replace with Qdrant vector search via embeddings
      // 1. Generate embedding for args.query using Transformers.js / AI SDK
      // 2. Search Qdrant with the embedding vector
      // 3. Map results to GQLSearchResult
      const limit = args.limit ?? 10;

      const stubResults: readonly GQLSearchResult[] = [
        {
          id: "prj_001",
          type: "PROJECT",
          title: "Marketing Site",
          excerpt: `Matched "${args.query}" in project description`,
          score: 0.92,
        },
        {
          id: "cmp_001",
          type: "COMPONENT",
          title: "HeroSection",
          excerpt: `Matched "${args.query}" in component props`,
          score: 0.85,
        },
      ];

      return stubResults.slice(0, limit);
    },
  },

  // ── Mutations ───────────────────────────────────────────────────
  Mutation: {
    createProject(
      _parent: unknown,
      args: { readonly input: CreateProjectInput },
      _ctx: GraphQLContext,
    ): GQLProject {
      // TODO: Replace with Drizzle insert
      // TODO: Emit audit log via createAuditEntry
      // TODO: Auto-index new project in Qdrant for semantic search
      const now = new Date();
      return {
        id: `prj_${Date.now()}`,
        name: args.input.name,
        description: args.input.description ?? null,
        ownerId: "usr_001", // TODO: Use ctx.currentUser.id
        createdAt: now,
        updatedAt: now,
      };
    },

    updateProject(
      _parent: unknown,
      args: { readonly id: string; readonly input: UpdateProjectInput },
      _ctx: GraphQLContext,
    ): GQLProject {
      // TODO: Replace with Drizzle update
      // TODO: Emit audit log
      // TODO: Re-index updated project in Qdrant
      const existing = findProjectById(args.id);
      if (!existing) {
        throw new Error(`Project not found: ${args.id}`);
      }
      return {
        ...existing,
        name: args.input.name ?? existing.name,
        description:
          args.input.description !== undefined
            ? args.input.description ?? null
            : existing.description,
        updatedAt: new Date(),
      };
    },

    deleteProject(
      _parent: unknown,
      args: { readonly id: string },
      _ctx: GraphQLContext,
    ): boolean {
      // TODO: Replace with Drizzle delete
      // TODO: Emit audit log
      // TODO: Remove project vectors from Qdrant
      const existing = findProjectById(args.id);
      if (!existing) {
        throw new Error(`Project not found: ${args.id}`);
      }
      return true;
    },
  },

  // ── Subscriptions ───────────────────────────────────────────────
  Subscription: {
    projectUpdated: {
      subscribe(
        _parent: unknown,
        args: { readonly projectId: string },
        _ctx: GraphQLContext,
      ): AsyncIterable<{ readonly projectUpdated: GQLProject }> {
        // TODO: Replace with real pub/sub via WebSocket/Durable Objects
        // This stub yields the requested project once then completes.
        const project = findProjectById(args.projectId);
        async function* generate(): AsyncGenerator<
          { readonly projectUpdated: GQLProject },
          void,
          unknown
        > {
          if (project) {
            yield { projectUpdated: { ...project, updatedAt: new Date() } };
          }
        }
        return generate();
      },
    },
  },

  // ── Field Resolvers ─────────────────────────────────────────────
  User: {
    projects(
      parent: GQLUser,
      _args: Record<string, never>,
      _ctx: GraphQLContext,
    ): readonly GQLProject[] {
      // TODO: Replace with Drizzle query filtered by parent.id
      return MOCK_PROJECTS.filter((p) => p.ownerId === parent.id);
    },
  },

  Project: {
    owner(
      parent: GQLProject,
      _args: Record<string, never>,
      _ctx: GraphQLContext,
    ): GQLUser | null {
      // TODO: Replace with Drizzle query
      if (parent.ownerId === MOCK_USER.id) {
        return MOCK_USER;
      }
      return null;
    },

    components(
      parent: GQLProject,
      _args: Record<string, never>,
      _ctx: GraphQLContext,
    ): readonly GQLComponent[] {
      // TODO: Replace with Drizzle query filtered by parent.id
      return MOCK_COMPONENTS.filter((c) => c.projectId === parent.id);
    },
  },
} as const;
