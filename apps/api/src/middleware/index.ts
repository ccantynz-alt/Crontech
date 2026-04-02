// Barrel export for all API middleware

export {
  cacheMiddleware,
  cacheStrategy,
  cacheStatic,
  cacheDynamic,
  cachePrivate,
  noCache,
} from "./cache";
export type { CacheOptions } from "./cache";

export { compressMiddleware } from "./compress";
export { etagMiddleware } from "./etag";
export { securityHeaders } from "./security-headers";
export { serverTimingMiddleware, addServerTiming } from "./timing";
export type { ServerTimingMetric } from "./timing";
export { corsMiddleware } from "./cors";
export { requestIdMiddleware } from "./request-id";
export {
  rateLimiter,
  apiRateLimit,
  authRateLimit,
  aiRateLimit,
} from "./rate-limit";
export { loggerMiddleware } from "./logger";
export { earlyHintsMiddleware } from "./early-hints";
