/**
 * Subdomain routing middleware for multi-tenant Hono app.
 *
 * Extracts the subdomain from the Host header (e.g. "zoobicon.crontech.ai"
 * → "zoobicon"), looks up the corresponding tenant, and sets `tenantSlug`
 * and `tenantId` on the Hono context for downstream handlers.
 *
 * Also supports custom domains: if the Host does not match a known base
 * domain pattern, the middleware checks the `customDomain` column.
 *
 * Tenant lookups are cached in-memory with a 5-minute TTL to avoid a DB
 * query per request.
 */

import { db } from "@back-to-the-future/db";
import { tenants } from "@back-to-the-future/db/schema";
import { eq } from "drizzle-orm";
import { createMiddleware } from "hono/factory";

// ── Hono env type for tenant context ─────────────────────────────────

export interface TenantEnv {
  Variables: {
    tenantSlug: string | null;
    tenantId: string | null;
  };
}

// ── Types ────────────────────────────────────────────────────────────

interface CachedTenant {
  id: string;
  slug: string;
  expiresAt: number;
}

// ── In-memory cache ──────────────────────────────────────────────────

const CACHE_TTL_MS = 5 * 60 * 1000; // 5 minutes

/** slug → CachedTenant */
const slugCache = new Map<string, CachedTenant>();

/** customDomain → CachedTenant */
const domainCache = new Map<string, CachedTenant>();

/** Special sentinel for "looked up but not found" to avoid repeated DB misses. */
const NOT_FOUND_SENTINEL: CachedTenant = { id: "", slug: "", expiresAt: 0 };

function getCachedBySlug(slug: string): CachedTenant | undefined {
  const entry = slugCache.get(slug);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    slugCache.delete(slug);
    return undefined;
  }
  return entry;
}

function getCachedByDomain(domain: string): CachedTenant | undefined {
  const entry = domainCache.get(domain);
  if (!entry) return undefined;
  if (Date.now() > entry.expiresAt) {
    domainCache.delete(domain);
    return undefined;
  }
  return entry;
}

function cacheSlug(slug: string, id: string): void {
  slugCache.set(slug, { id, slug, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheDomain(domain: string, id: string, slug: string): void {
  domainCache.set(domain, { id, slug, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheSlugNotFound(slug: string): void {
  slugCache.set(slug, { ...NOT_FOUND_SENTINEL, expiresAt: Date.now() + CACHE_TTL_MS });
}

function cacheDomainNotFound(domain: string): void {
  domainCache.set(domain, { ...NOT_FOUND_SENTINEL, expiresAt: Date.now() + CACHE_TTL_MS });
}

/** Invalidate all cached entries for a given tenant slug. */
export function invalidateTenantCache(slug: string): void {
  slugCache.delete(slug);
  // Also remove any domain cache entries that reference this slug
  for (const [domain, entry] of domainCache.entries()) {
    if (entry.slug === slug) {
      domainCache.delete(domain);
    }
  }
}

// ── Base domains (bare domains that are NOT subdomains) ──────────────

const BASE_DOMAINS = ["crontech.ai", "crontech.dev", "localhost"];

// ── Reserved system subdomains ───────────────────────────────────────
// These are platform-owned subdomains, NOT tenant slugs. They must
// NEVER trigger a tenant DB lookup, because:
//   1. There is no tenant row matching them, so the lookup is wasted.
//   2. If the DB query throws (transient connection issue, schema
//      drift, etc.) the error bubbles to the global 500 handler and
//      takes down EVERY request to the system subdomain — including
//      api.crontech.ai/api/health.
// On 2026-04-26 this exact failure mode was the root cause of the
// "API responds 500 with requestId on every endpoint" outage that
// blocked deploys for 24+ hours. The deploy succeeded, the box was
// up, but `api.crontech.ai` → subdomain `api` → DB lookup → throw
// → 500 wall.
const RESERVED_SYSTEM_SUBDOMAINS = new Set([
  "api",
  "www",
  "admin",
  "app",
  "static",
  "cdn",
  "assets",
  "ws",
  "mail",
  "smtp",
  "imap",
  "ftp",
  "ns",
  "ns1",
  "ns2",
  "mx",
  "blog",
  "docs",
  "status",
]);

// ── Middleware ────────────────────────────────────────────────────────

export const subdomainRouter = createMiddleware<TenantEnv>(
  async (c, next): Promise<Response | undefined> => {
    const host = (c.req.header("host") ?? "").replace(/:\d+$/, ""); // strip port

    // Skip IP addresses (v4 simple check)
    if (/^\d{1,3}(\.\d{1,3}){3}$/.test(host)) {
      await next();
      return;
    }

    // Try to extract subdomain from known base domains
    let subdomain: string | null = null;

    for (const base of BASE_DOMAINS) {
      if (host === base) {
        // Bare domain — no subdomain
        await next();
        return;
      }
      if (host.endsWith(`.${base}`)) {
        subdomain = host.replace(`.${base}`, "");
        break;
      }
    }

    if (subdomain) {
      // Reserved platform subdomains (api, www, admin, …) are never
      // tenant slugs — pass through immediately without a DB lookup.
      // See RESERVED_SYSTEM_SUBDOMAINS above for the 2026-04-26
      // outage analysis.
      if (RESERVED_SYSTEM_SUBDOMAINS.has(subdomain)) {
        await next();
        return;
      }

      // Look up tenant by slug
      const cached = getCachedBySlug(subdomain);
      if (cached) {
        if (cached.id === "") {
          return c.json({ error: "TENANT_NOT_FOUND" }, 404);
        }
        c.set("tenantSlug", cached.slug);
        c.set("tenantId", cached.id);
        await next();
        return;
      }

      // DB lookup — wrapped so a transient DB failure does NOT propagate
      // to the global 500 handler and take down every request.
      let tenant: { id: string; slug: string } | undefined;
      try {
        const rows = await db
          .select({ id: tenants.id, slug: tenants.slug })
          .from(tenants)
          .where(eq(tenants.slug, subdomain))
          .limit(1);
        tenant = rows[0];
      } catch (err) {
        // DB unreachable / schema drift / etc — degrade gracefully:
        // pass through as if no tenant matched. The downstream route
        // will respond normally; only tenant-context features (like
        // per-tenant theming or rate-limit scoping) lose their
        // attribution until the DB recovers.
        console.error(
          `[subdomain] tenant lookup failed for slug='${subdomain}', passing through:`,
          err instanceof Error ? err.message : err,
        );
        await next();
        return;
      }

      if (!tenant) {
        cacheSlugNotFound(subdomain);
        return c.json({ error: "TENANT_NOT_FOUND" }, 404);
      }

      cacheSlug(tenant.slug, tenant.id);
      c.set("tenantSlug", tenant.slug);
      c.set("tenantId", tenant.id);
      await next();
      return;
    }

    // No subdomain matched — check custom domain
    const cachedDomain = getCachedByDomain(host);
    if (cachedDomain) {
      if (cachedDomain.id === "") {
        // Not a known custom domain — pass through (main app)
        await next();
        return;
      }
      c.set("tenantSlug", cachedDomain.slug);
      c.set("tenantId", cachedDomain.id);
      await next();
      return;
    }

    // DB lookup by custom domain — wrapped for the same reason as the
    // slug branch above. Without this, a transient DB failure on the
    // platform's main domain (crontech.ai) returned 500 to every
    // single visitor before the 2026-04-26 fix.
    let domainTenant: { id: string; slug: string } | undefined;
    try {
      const domainRows = await db
        .select({ id: tenants.id, slug: tenants.slug })
        .from(tenants)
        .where(eq(tenants.customDomain, host))
        .limit(1);
      domainTenant = domainRows[0];
    } catch (err) {
      console.error(
        `[subdomain] custom-domain lookup failed for host='${host}', passing through:`,
        err instanceof Error ? err.message : err,
      );
      await next();
      return;
    }

    if (domainTenant) {
      cacheDomain(host, domainTenant.id, domainTenant.slug);
      c.set("tenantSlug", domainTenant.slug);
      c.set("tenantId", domainTenant.id);
      await next();
      return;
    }

    // Unknown host — not a custom domain, just pass through (main app)
    cacheDomainNotFound(host);
    await next();
    return undefined;
  },
);
