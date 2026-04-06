import { z } from "zod";
import { router, publicProcedure } from "../init";
import {
  getAllFlags,
  getFlag,
  isFeatureEnabled,
  type FeatureFlag,
} from "../../feature-flags";

export const featureFlagsRouter = router({
  getAll: publicProcedure.query(({ ctx }): Array<FeatureFlag & { evaluatedEnabled: boolean }> => {
    const flags = getAllFlags();
    const userId = ctx.userId ?? undefined;
    return flags.map((flag) => ({
      ...flag,
      evaluatedEnabled: isFeatureEnabled(flag.key, userId),
    }));
  }),

  isEnabled: publicProcedure
    .input(z.object({ key: z.string() }))
    .query(({ input, ctx }): { key: string; enabled: boolean } => {
      const userId = ctx.userId ?? undefined;
      return {
        key: input.key,
        enabled: isFeatureEnabled(input.key, userId),
      };
    }),

  evaluate: publicProcedure
    .input(z.object({
      flagKey: z.string(),
      userId: z.string().optional(),
    }))
    .query(({ input }): { key: string; enabled: boolean; flag: FeatureFlag | null } => {
      const flag = getFlag(input.flagKey) ?? null;
      const enabled = isFeatureEnabled(input.flagKey, input.userId);
      return { key: input.flagKey, enabled, flag };
    }),
});
