// ── BLK-029 — Airalo Partner API client ───────────────────────────────
// Thin HTTP client for the Airalo Partner API (REST over HTTPS with an
// OAuth client-credentials bearer token). Exposes a typed surface —
// `listPackages`, `getPackage`, `submitOrder`, `listOrders`, `getEsims`
// — so the tRPC router, admin CLIs, and tests never have to think about
// the raw wire format.
//
// Dependency-injected fetch (per CLAUDE.md §0.4.1 iron rules: Zod at the
// boundary, TS strict, no singletons in the request path). Tests pass a
// custom `fetchImpl` to swap the network layer entirely.
//
// Token caching: the access token is cached in memory inside the client
// instance until ~30s before its advertised expiry. A brand-new client
// fetches a fresh token lazily on first use.

import {
  AiraloEsimsResponseSchema,
  AiraloOrderListResponseSchema,
  AiraloOrderResponseSchema,
  AiraloPackagesResponseSchema,
  AiraloTokenResponseSchema,
  type AiraloEsim,
  type AiraloInstallInfo,
  type AiraloOrder,
  type AiraloPackageSummary,
} from "./airalo-types";

// ── Config ────────────────────────────────────────────────────────────

export interface AiraloConfig {
  /** Partner client id. `AIRALO_CLIENT_ID` in the environment. */
  clientId: string;
  /** Partner client secret. `AIRALO_CLIENT_SECRET` in the environment. */
  clientSecret: string;
  /** API base URL (no trailing slash). Defaults to the v2 partner API. */
  baseUrl: string;
}

export interface AiraloClientDeps {
  fetchImpl?: typeof fetch;
  /** Override the current time — used so tests can control token expiry. */
  now?: () => number;
}

/** Construct config from the standard Airalo environment variables. */
export function configFromEnv(): AiraloConfig {
  const clientId = process.env["AIRALO_CLIENT_ID"] ?? "";
  const clientSecret = process.env["AIRALO_CLIENT_SECRET"] ?? "";
  const baseUrl =
    process.env["AIRALO_BASE_URL"] ?? "https://partners-api.airalo.com/v2";
  return {
    clientId,
    clientSecret,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

// ── AiraloError ───────────────────────────────────────────────────────
// Thrown whenever the API returns a non-2xx response OR the HTTP layer
// fails. Callers (tRPC router) translate this into BAD_GATEWAY.

export class AiraloError extends Error {
  public readonly action: string;
  public readonly status: number | undefined;
  public readonly bodySnippet: string | undefined;

  constructor(
    message: string,
    action: string,
    status?: number,
    bodySnippet?: string,
  ) {
    super(message);
    this.name = "AiraloError";
    this.action = action;
    if (status !== undefined) this.status = status;
    if (bodySnippet !== undefined) this.bodySnippet = bodySnippet;
  }
}

// ── Markup helpers (shared between client + router) ───────────────────

/**
 * Apply the configured markup percentage to a wholesale cost. All money
 * is expressed in microdollars (1 USD = 1_000_000 µ$) so we never round
 * floating-point dollars mid-calculation. Matches the domain registrar's
 * helper signature so callers have one mental model across resellers.
 */
export function applyMarkup(
  wholesaleMicrodollars: number,
  markupPercent: number,
): { retailMicrodollars: number; markupMicrodollars: number } {
  const markup = Math.round(
    (wholesaleMicrodollars * markupPercent) / 100,
  );
  return {
    retailMicrodollars: wholesaleMicrodollars + markup,
    markupMicrodollars: markup,
  };
}

/** Parse an Airalo USD value ("8.50" or 8.5) into microdollars. */
export function dollarsToMicrodollars(value: string | number): number {
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.round(n * 1_000_000);
}

export function markupPercentFromEnv(): number {
  const raw = process.env["ESIM_MARKUP_PERCENT"];
  const parsed = raw ? Number.parseFloat(raw) : Number.NaN;
  if (!Number.isFinite(parsed) || parsed < 0) return 25;
  return parsed;
}

// ── Flatteners ────────────────────────────────────────────────────────
// The Airalo packages endpoint returns an Operator[] tree. Callers want a
// flat list of buyable packages. These helpers do the walk + normalise
// into our domain shape once at the client boundary.

function parseNumber(
  value: string | number | null | undefined,
): number {
  if (value === null || value === undefined) return 0;
  const n = typeof value === "number" ? value : Number.parseFloat(value);
  if (!Number.isFinite(n) || n < 0) return 0;
  return n;
}

function parseDataGb(
  dataField: string | undefined,
  amountField: string | number | undefined,
  isUnlimited: boolean,
): number {
  if (isUnlimited) return 0;
  if (typeof dataField === "string") {
    const match = dataField.match(/([0-9]+(?:\.[0-9]+)?)\s*(GB|MB|G|M)?/i);
    if (match?.[1]) {
      const raw = Number.parseFloat(match[1]);
      const unit = (match[2] ?? "GB").toUpperCase();
      if (!Number.isFinite(raw) || raw < 0) return 0;
      if (unit === "MB" || unit === "M") return raw / 1024;
      return raw;
    }
  }
  if (typeof amountField === "number") return amountField;
  if (typeof amountField === "string") {
    const n = Number.parseFloat(amountField);
    if (Number.isFinite(n) && n >= 0) return n;
  }
  return 0;
}

function firstCountryCode(
  countries: ReadonlyArray<{ country_code?: string | undefined }> | undefined,
): string | null {
  if (!countries || countries.length === 0) return null;
  const first = countries[0]?.country_code;
  return typeof first === "string" && first.length > 0 ? first : null;
}

// ── Client ────────────────────────────────────────────────────────────

interface TokenState {
  token: string;
  /** Millisecond unix timestamp at which we must refresh. */
  refreshAt: number;
}

export class AiraloClient {
  private readonly config: AiraloConfig;
  private readonly fetchImpl: typeof fetch;
  private readonly now: () => number;
  private tokenState: TokenState | null = null;

  constructor(config: AiraloConfig, deps: AiraloClientDeps = {}) {
    this.config = config;
    this.fetchImpl = deps.fetchImpl ?? fetch;
    this.now = deps.now ?? (() => Date.now());
  }

  // ── Token handling ────────────────────────────────────────────────

  /**
   * Return a valid bearer token, fetching a fresh one if the cached
   * token is missing or within 30 seconds of its advertised expiry.
   */
  async getAccessToken(): Promise<string> {
    const nowMs = this.now();
    if (this.tokenState && this.tokenState.refreshAt > nowMs) {
      return this.tokenState.token;
    }
    const res = await this.fetchImpl(`${this.config.baseUrl}/token`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      body: JSON.stringify({
        client_id: this.config.clientId,
        client_secret: this.config.clientSecret,
        grant_type: "client_credentials",
      }),
    });
    if (!res.ok) {
      const snippet = await safeReadSnippet(res);
      throw new AiraloError(
        `Airalo token exchange failed with HTTP ${res.status}.`,
        "token",
        res.status,
        snippet,
      );
    }
    const json = await res.json();
    const parsed = AiraloTokenResponseSchema.parse(json);
    // Refresh 30s before advertised expiry to dodge clock skew.
    const ttlMs = Math.max(0, (parsed.expires_in - 30) * 1000);
    this.tokenState = {
      token: parsed.access_token,
      refreshAt: nowMs + ttlMs,
    };
    return parsed.access_token;
  }

  private async request(
    path: string,
    init: RequestInit & { action: string },
  ): Promise<unknown> {
    const token = await this.getAccessToken();
    const headers: Record<string, string> = {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
      ...((init.headers as Record<string, string> | undefined) ?? {}),
    };
    if (init.body !== undefined && headers["Content-Type"] === undefined) {
      headers["Content-Type"] = "application/json";
    }
    const res = await this.fetchImpl(`${this.config.baseUrl}${path}`, {
      ...init,
      headers,
    });
    if (!res.ok) {
      const snippet = await safeReadSnippet(res);
      throw new AiraloError(
        `Airalo ${init.action} request failed with HTTP ${res.status}.`,
        init.action,
        res.status,
        snippet,
      );
    }
    return res.json();
  }

  // ── Typed wrappers ────────────────────────────────────────────────

  /**
   * List buyable packages. `filter.type` narrows to global or local, and
   * `filter.country` narrows to a single country code. We flatten the
   * Operator[] tree into a plain AiraloPackageSummary[] at the boundary.
   */
  async listPackages(filter: {
    type?: "global" | "local";
    country?: string;
    limit?: number;
  } = {}): Promise<AiraloPackageSummary[]> {
    const query = new URLSearchParams();
    if (filter.type) query.set("filter[type]", filter.type);
    if (filter.country) query.set("filter[country]", filter.country);
    if (filter.limit) query.set("limit", String(filter.limit));
    const qs = query.toString();
    const path = `/packages${qs ? `?${qs}` : ""}`;
    const raw = await this.request(path, { method: "GET", action: "listPackages" });
    const parsed = AiraloPackagesResponseSchema.parse(raw);
    const flat: AiraloPackageSummary[] = [];
    for (const operator of parsed.data) {
      const operatorTitle = operator.title ?? operator.slug ?? "Unknown operator";
      const operatorType = operator.type ?? "local";
      const countryCode = firstCountryCode(operator.countries);
      for (const pkg of operator.packages) {
        const isUnlimited = pkg.is_unlimited ?? false;
        flat.push({
          id: pkg.id,
          title: pkg.title ?? pkg.short_info ?? pkg.id,
          operatorTitle,
          countryCode,
          dataGb: parseDataGb(pkg.data, pkg.amount, isUnlimited),
          validityDays: Math.round(parseNumber(pkg.day)),
          priceUsd: parseNumber(pkg.price),
          isUnlimited,
          type: pkg.type ?? operatorType,
        });
      }
    }
    return flat;
  }

  /**
   * Fetch a single package by id. Airalo doesn't have a dedicated
   * detail endpoint in v2 — we scan the full list + pull the matching
   * record out. This is fine because the list response is already
   * cached-friendly + cheap.
   */
  async getPackage(id: string): Promise<AiraloPackageSummary | null> {
    const all = await this.listPackages();
    return all.find((p) => p.id === id) ?? null;
  }

  /** Submit a purchase order for `quantity` copies of a package. */
  async submitOrder(input: {
    packageId: string;
    quantity?: number;
    description?: string;
  }): Promise<AiraloOrder> {
    const body: {
      package_id: string;
      quantity: number;
      description?: string;
    } = {
      package_id: input.packageId,
      quantity: input.quantity ?? 1,
    };
    if (input.description !== undefined) body.description = input.description;
    const raw = await this.request("/orders", {
      method: "POST",
      body: JSON.stringify(body),
      action: "submitOrder",
    });
    const parsed = AiraloOrderResponseSchema.parse(raw);
    return parsed.data;
  }

  /** List every order we've ever placed for this partner account. */
  async listOrders(): Promise<AiraloOrder[]> {
    const raw = await this.request("/orders", {
      method: "GET",
      action: "listOrders",
    });
    const parsed = AiraloOrderListResponseSchema.parse(raw);
    return parsed.data;
  }

  /**
   * Fetch the install bundle (QR code + LPA activation string) for a
   * previously-placed order. We normalise to a single record since every
   * Crontech purchase buys exactly one eSIM for v1.
   */
  async getInstallInfo(orderId: string): Promise<AiraloInstallInfo | null> {
    const raw = await this.request(
      `/orders/${encodeURIComponent(orderId)}/esims`,
      { method: "GET", action: "getInstallInfo" },
    );
    const parsed = AiraloEsimsResponseSchema.parse(raw);
    const first: AiraloEsim | undefined = parsed.data[0];
    if (!first) return null;
    return {
      iccid: first.iccid ?? null,
      lpaString: first.lpa_code ?? first.lpa ?? null,
      qrCodeDataUrl: first.qrcode ?? first.qrcode_url ?? null,
      smdpAddress: first.smdp_address ?? null,
      matchingId: first.matching_id ?? null,
    };
  }
}

// ── Internals ─────────────────────────────────────────────────────────

async function safeReadSnippet(res: Response): Promise<string> {
  try {
    const text = await res.text();
    return text.slice(0, 500);
  } catch {
    return "";
  }
}
