/**
 * GraphQL schema for Back to the Future external API.
 *
 * Uses graphql-yoga's `createSchema` which accepts SDL strings
 * and returns a fully executable GraphQLSchema. TypeScript codegen
 * types are layered on top via the resolver type definitions below.
 */

// ── SDL Type Definitions ────────────────────────────────────────────

const typeDefs = /* GraphQL */ `
  scalar DateTime

  type User {
    id: ID!
    email: String!
    displayName: String!
    role: UserRole!
    createdAt: DateTime!
    updatedAt: DateTime!
    projects: [Project!]!
  }

  enum UserRole {
    ADMIN
    EDITOR
    VIEWER
  }

  type Project {
    id: ID!
    name: String!
    description: String
    ownerId: ID!
    owner: User!
    components: [Component!]!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type Component {
    id: ID!
    projectId: ID!
    name: String!
    schemaRef: String!
    props: String!
    createdAt: DateTime!
    updatedAt: DateTime!
  }

  type SearchResult {
    id: ID!
    type: SearchResultType!
    title: String!
    excerpt: String!
    score: Float!
  }

  enum SearchResultType {
    PROJECT
    COMPONENT
    USER
  }

  # ── Inputs ──────────────────────────────────────────────────────

  input CreateProjectInput {
    name: String!
    description: String
  }

  input UpdateProjectInput {
    name: String
    description: String
  }

  # ── Queries ─────────────────────────────────────────────────────

  type Query {
    user(id: ID!): User
    projects(limit: Int, offset: Int): [Project!]!
    project(id: ID!): Project
    searchContent(query: String!, limit: Int): [SearchResult!]!
  }

  # ── Mutations ───────────────────────────────────────────────────

  type Mutation {
    createProject(input: CreateProjectInput!): Project!
    updateProject(id: ID!, input: UpdateProjectInput!): Project!
    deleteProject(id: ID!): Boolean!
  }

  # ── Subscriptions ───────────────────────────────────────────────

  type Subscription {
    projectUpdated(projectId: ID!): Project!
  }
`;

// ── TypeScript Types (mirroring the SDL) ────────────────────────────

export interface GQLUser {
  readonly id: string;
  readonly email: string;
  readonly displayName: string;
  readonly role: "ADMIN" | "EDITOR" | "VIEWER";
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface GQLProject {
  readonly id: string;
  readonly name: string;
  readonly description: string | null;
  readonly ownerId: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface GQLComponent {
  readonly id: string;
  readonly projectId: string;
  readonly name: string;
  readonly schemaRef: string;
  readonly props: string;
  readonly createdAt: Date;
  readonly updatedAt: Date;
}

export interface GQLSearchResult {
  readonly id: string;
  readonly type: "PROJECT" | "COMPONENT" | "USER";
  readonly title: string;
  readonly excerpt: string;
  readonly score: number;
}

export interface CreateProjectInput {
  readonly name: string;
  readonly description?: string | undefined;
}

export interface UpdateProjectInput {
  readonly name?: string | undefined;
  readonly description?: string | undefined;
}

export { typeDefs };
