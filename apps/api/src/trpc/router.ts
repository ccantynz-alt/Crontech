import { z } from "zod";
import { router, publicProcedure } from "./init";
import { usersRouter } from "./procedures/users";
import { auditRouter } from "./procedures/audit";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello, ${input.name}!` };
    }),

  users: usersRouter,
  audit: auditRouter,
});

export type AppRouter = typeof appRouter;
