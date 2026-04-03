import { Hono } from "hono";
// @ts-expect-error -- graphql-yoga not yet installed; run: bun add graphql-yoga graphql
import { createYoga, createSchema } from "graphql-yoga";
import { typeDefs } from "./schema";
import { resolvers, type GraphQLContext } from "./resolvers";

/**
 * GraphQL sub-router for external consumers.
 *
 * - POST /graphql  -- execute queries / mutations
 * - GET  /graphql  -- GraphiQL interactive playground
 *
 * Uses graphql-yoga which natively supports Hono's Request/Response model,
 * streaming subscriptions via SSE, and the GraphiQL IDE out of the box.
 */

const graphqlRouter = new Hono();

const schema = createSchema({
  typeDefs,
  resolvers,
});

const yoga = createYoga<GraphQLContext>({
  schema,
  // Enable GraphiQL playground on GET requests
  graphiql: true,
  // Prefix must match where the router is mounted in the main app
  graphqlEndpoint: "/api/graphql",
  // Disable yoga's own CORS -- the main Hono app handles CORS globally
  cors: false,
});

// Handle both GET (GraphiQL) and POST (query execution) via yoga
graphqlRouter.all("/*", async (c) => {
  // TODO: Extract authenticated user from session and inject into context
  // const currentUser = c.get("user") ?? null;
  // TODO: Inject Drizzle DB client from c.env or module scope
  // TODO: Inject Qdrant client for vector search resolvers

  const response = await yoga.handle(c.req.raw, {} satisfies GraphQLContext);
  return response;
});

export { graphqlRouter };
