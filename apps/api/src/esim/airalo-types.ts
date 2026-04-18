// ── BLK-029 — Airalo Partner API Zod contracts ─────────────────────────
// Zod schemas for every request / response shape that crosses the wire
// between Crontech and the Airalo Partner API (REST over HTTPS). The wire
// format is JSON; these schemas sit at the boundary (per CLAUDE.md §0.4.1
// iron rules) so the rest of the code base only consumes typed, validated
// data.
//
// Airalo's real responses carry more fields than we use. We stay PERMISSIVE
// on unknown keys (`.passthrough()` where appropriate) but STRICT on the
// load-bearing fields: package id, price, data volume, validity, QR + LPA
// install strings. A silent rename on the Airalo side should raise a loud
// parse error rather than corrupt downstream cost / markup accounting.

import { z } from "zod";

// ── OAuth token response ──────────────────────────────────────────────
// POST /token with client_credentials. Airalo returns a bearer token + an
// expires_in count in seconds; we cache in memory until expiry (see
// airalo-client.ts).

export const AiraloTokenResponseSchema = z
  .object({
    access_token: z.string().min(1),
    token_type: z.string().optional(),
    expires_in: z.number().int().positive(),
  })
  .passthrough();

export type AiraloTokenResponse = z.infer<typeof AiraloTokenResponseSchema>;

// ── Packages ──────────────────────────────────────────────────────────
// GET /packages returns a nested structure: { data: Operator[] }, where
// each Operator lists packages. We flatten at the client boundary into
// AiraloPackage[] so callers never have to walk the nested tree. The raw
// schema is kept here for the validator and for anyone who needs the
// original shape.

/** Minimum per-package fields we rely on for pricing and display. */
export const AiraloPackageSchema = z
  .object({
    id: z.string().min(1),
    type: z.string().optional(),
    price: z.union([z.string(), z.number()]),
    amount: z.union([z.string(), z.number()]).optional(),
    day: z.union([z.string(), z.number()]).optional(),
    is_unlimited: z.boolean().optional(),
    title: z.string().optional(),
    data: z.string().optional(),
    short_info: z.string().optional(),
    voice: z.union([z.string(), z.number(), z.null()]).optional(),
    text: z.union([z.string(), z.number(), z.null()]).optional(),
  })
  .passthrough();

export type AiraloPackage = z.infer<typeof AiraloPackageSchema>;

/** A single operator (= regional/country SIM provider) on Airalo. */
export const AiraloOperatorSchema = z
  .object({
    id: z.union([z.string(), z.number()]).optional(),
    title: z.string().optional(),
    slug: z.string().optional(),
    type: z.string().optional(),
    countries: z
      .array(
        z
          .object({
            country_code: z.string().optional(),
            title: z.string().optional(),
          })
          .passthrough(),
      )
      .optional(),
    packages: z.array(AiraloPackageSchema).default([]),
  })
  .passthrough();

export type AiraloOperator = z.infer<typeof AiraloOperatorSchema>;

/** Top-level `GET /packages` response envelope. */
export const AiraloPackagesResponseSchema = z
  .object({
    data: z.array(AiraloOperatorSchema).default([]),
    meta: z
      .object({
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AiraloPackagesResponse = z.infer<
  typeof AiraloPackagesResponseSchema
>;

// ── Flattened package shape (our domain object) ───────────────────────
// This is what callers of the client actually consume. Comes from
// walking Operator[] → Package[] and attaching country / operator context.

export const AiraloPackageSummarySchema = z.object({
  id: z.string(),
  title: z.string(),
  operatorTitle: z.string(),
  countryCode: z.string().nullable(),
  dataGb: z.number().nonnegative(),
  validityDays: z.number().int().nonnegative(),
  priceUsd: z.number().nonnegative(),
  isUnlimited: z.boolean(),
  type: z.string(),
});

export type AiraloPackageSummary = z.infer<typeof AiraloPackageSummarySchema>;

// ── Order submit ──────────────────────────────────────────────────────
// POST /orders — body { package_id, quantity, description } → returns
// the Airalo order id plus (in the v2 response) the eSIM install bundle.

export const AiraloOrderRequestSchema = z.object({
  package_id: z.string().min(1),
  quantity: z.number().int().min(1).max(50),
  description: z.string().optional(),
});

export type AiraloOrderRequest = z.infer<typeof AiraloOrderRequestSchema>;

/** A single eSIM contained in an order response. */
export const AiraloEsimSchema = z
  .object({
    iccid: z.string().optional(),
    qrcode: z.string().optional(),
    qrcode_url: z.string().optional(),
    lpa: z.string().optional(),
    lpa_code: z.string().optional(),
    matching_id: z.string().optional(),
    confirmation_code: z.string().optional(),
    smdp_address: z.string().optional(),
  })
  .passthrough();

export type AiraloEsim = z.infer<typeof AiraloEsimSchema>;

export const AiraloOrderSchema = z
  .object({
    id: z.union([z.string(), z.number()]),
    code: z.string().optional(),
    package_id: z.string().optional(),
    quantity: z.number().int().optional(),
    type: z.string().optional(),
    description: z.string().optional(),
    esims: z.array(AiraloEsimSchema).optional(),
    created_at: z.string().optional(),
  })
  .passthrough();

export type AiraloOrder = z.infer<typeof AiraloOrderSchema>;

export const AiraloOrderResponseSchema = z
  .object({
    data: AiraloOrderSchema,
    meta: z
      .object({
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
  })
  .passthrough();

export type AiraloOrderResponse = z.infer<typeof AiraloOrderResponseSchema>;

// ── List orders ───────────────────────────────────────────────────────

export const AiraloOrderListResponseSchema = z
  .object({
    data: z.array(AiraloOrderSchema).default([]),
  })
  .passthrough();

export type AiraloOrderListResponse = z.infer<
  typeof AiraloOrderListResponseSchema
>;

// ── Install info (QR + LPA) ───────────────────────────────────────────
// GET /orders/{id}/esims → { data: AiraloEsim[] }. We expose a single
// install info record since our V1 quantity is always 1.

export const AiraloEsimsResponseSchema = z
  .object({
    data: z.array(AiraloEsimSchema).default([]),
  })
  .passthrough();

export type AiraloEsimsResponse = z.infer<typeof AiraloEsimsResponseSchema>;

export const AiraloInstallInfoSchema = z.object({
  iccid: z.string().nullable(),
  lpaString: z.string().nullable(),
  qrCodeDataUrl: z.string().nullable(),
  smdpAddress: z.string().nullable(),
  matchingId: z.string().nullable(),
});

export type AiraloInstallInfo = z.infer<typeof AiraloInstallInfoSchema>;

// ── Error envelopes ───────────────────────────────────────────────────
// Airalo returns `{ data: { ... }, meta: { message: "..." } }` on success
// and a structured error body we surface as OpensrsError-style failures.

export const AiraloErrorResponseSchema = z
  .object({
    meta: z
      .object({
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
    data: z
      .object({
        message: z.string().optional(),
      })
      .passthrough()
      .optional(),
    message: z.string().optional(),
    error: z.string().optional(),
  })
  .passthrough();

export type AiraloErrorResponse = z.infer<typeof AiraloErrorResponseSchema>;
