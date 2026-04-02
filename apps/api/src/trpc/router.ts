import { z } from "zod";
import { router, publicProcedure } from "./init";
import { authRouter } from "./procedures/auth";

export const appRouter = router({
  health: publicProcedure.query(() => {
    return { status: "ok" as const };
  }),

  hello: publicProcedure
    .input(z.object({ name: z.string() }))
    .query(({ input }) => {
      return { greeting: `Hello, ${input.name}!` };
    }),

  auth: authRouter,
});

export type AppRouter = typeof appRouter;
