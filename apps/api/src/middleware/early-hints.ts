import type { MiddlewareHandler } from "hono";

/**
 * Early Hints (HTTP 103) middleware.
 *
 * For GET requests that accept HTML, sends Link headers hinting the browser
 * to preload critical resources (CSS, JS) before the full response is ready.
 * This shaves round-trip time off resource fetching.
 *
 * Only applies when:
 * - Request method is GET
 * - Accept header includes text/html
 *
 * In production on Cloudflare, Early Hints are handled natively by the CDN.
 * This middleware ensures the correct Link headers are present for both
 * Cloudflare's Early Hints feature and direct Bun.serve deployments.
 */
export const earlyHintsMiddleware: MiddlewareHandler = async (c, next) => {
  const isGet = c.req.method === "GET";
  const acceptsHtml = c.req.header("accept")?.includes("text/html") ?? false;

  if (isGet && acceptsHtml) {
    // Set Link headers that Cloudflare (or other CDNs) can use for 103 Early Hints.
    // These also serve as standard preload hints in the final response.
    c.header(
      "Link",
      [
        "</styles.css>; rel=preload; as=style",
        "</app.js>; rel=preload; as=script",
      ].join(", "),
    );
  }

  await next();
};
