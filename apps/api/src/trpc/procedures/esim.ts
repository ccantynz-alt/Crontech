// ── BLK-029 — eSIM reseller procedures ────────────────────────────────
// tRPC surface for Crontech's eSIM reseller (Airalo Partner API). Customers
// browse data plans by country/region/size, an admin places the purchase
// (v1 — until Stripe wiring lands in a later block), the install bundle
// (QR + LPA string) gets surfaced back for the customer to scan.
//
// Procedures exposed:
//   • listPackages({ countryCode?, region?, dataGb? })    — public
//   • getPackage({ id })                                  — public
//   • purchase({ packageId, customerEmail })              — admin
//   • listMyEsims()                                       — authenticated
//   • getInstallInfo({ orderId })                         — authenticated
//
// Non-scope (owned by other blocks):
//   • Stripe checkout wiring — revenue-affecting is a separate block.
//   • Live-hitting Airalo in tests — the test file injects a fake client.
//   • SMS / domain / DNS work — orthogonal agents.

import { z } from "zod";
import { TRPCError } from "@trpc/server";
import { desc, eq } from "drizzle-orm";
import { esimOrders } from "@back-to-the-future/db";
import {
  router,
  publicProcedure,
  protectedProcedure,
  adminProcedure,
} from "../init";
import type { TRPCContext } from "../context";
import {
  AiraloClient,
  AiraloError,
  applyMarkup,
  configFromEnv,
  dollarsToMicrodollars,
  markupPercentFromEnv,
  type AiraloClientDeps,
  type AiraloConfig,
} from "../../esim/airalo-client";
import type { AiraloPackageSummary } from "../../esim/airalo-types";

// ── Client factory (dependency-injected for tests) ────────────────────

type ClientFactory = (
  config?: AiraloConfig,
  deps?: AiraloClientDeps,
) => AiraloClient;

interface RouterTestHooks {
  clientFactory: ClientFactory | undefined;
  markupPercent: number | undefined;
}

const testHooks: RouterTestHooks = {
  clientFactory: undefined,
  markupPercent: undefined,
};

/** Test-only: swap the Airalo client factory (e.g. to mock fetch). */
export function __setEsimTestHooks(hooks: {
  clientFactory?: ClientFactory;
  markupPercent?: number;
}): void {
  testHooks.clientFactory = hooks.clientFactory;
  testHooks.markupPercent = hooks.markupPercent;
}

/** Test-only: reset hooks between tests. */
export function __resetEsimTestHooks(): void {
  testHooks.clientFactory = undefined;
  testHooks.markupPercent = undefined;
}

function makeClient(): AiraloClient {
  if (testHooks.clientFactory) return testHooks.clientFactory();
  return new AiraloClient(configFromEnv());
}

function currentMarkupPercent(): number {
  return testHooks.markupPercent ?? markupPercentFromEnv();
}

// ── Helpers ───────────────────────────────────────────────────────────

function newOrderId(): string {
  return `esim_${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
}

function translateAiraloError(err: unknown, fallbackMessage: string): never {
  if (err instanceof AiraloError) {
    throw new TRPCError({
      code: "BAD_GATEWAY",
      message: err.message,
      cause: err,
    });
  }
  if (err instanceof TRPCError) throw err;
  throw new TRPCError({
    code: "INTERNAL_SERVER_ERROR",
    message: fallbackMessage,
    cause: err instanceof Error ? err : undefined,
  });
}

/** True when `summary.countryCode` or any operator hint matches `code`. */
function matchesCountry(
  summary: AiraloPackageSummary,
  code: string | undefined,
): boolean {
  if (!code) return true;
  if (!summary.countryCode) return false;
  return summary.countryCode.toLowerCase() === code.toLowerCase();
}

/** True when `summary.type` equals the requested region classifier. */
function matchesRegion(
  summary: AiraloPackageSummary,
  region: string | undefined,
): boolean {
  if (!region) return true;
  return summary.type.toLowerCase() === region.toLowerCase();
}

/** Approximate data-size match — customers asking "5 GB" want ≥ 5 GB. */
function matchesDataGb(
  summary: AiraloPackageSummary,
  dataGb: number | undefined,
): boolean {
  if (dataGb === undefined) return true;
  if (summary.isUnlimited) return true;
  return summary.dataGb >= dataGb;
}

export interface PackageView {
  id: string;
  title: string;
  operatorTitle: string;
  countryCode: string | null;
  dataGb: number;
  validityDays: number;
  isUnlimited: boolean;
  type: string;
  wholesaleMicrodollars: number;
  retailMicrodollars: number;
  markupMicrodollars: number;
  markupPercent: number;
  currency: "USD";
}

function toPackageView(
  summary: AiraloPackageSummary,
  markupPercent: number,
): PackageView {
  const wholesaleMicrodollars = dollarsToMicrodollars(summary.priceUsd);
  const { retailMicrodollars, markupMicrodollars } = applyMarkup(
    wholesaleMicrodollars,
    markupPercent,
  );
  return {
    id: summary.id,
    title: summary.title,
    operatorTitle: summary.operatorTitle,
    countryCode: summary.countryCode,
    dataGb: summary.dataGb,
    validityDays: summary.validityDays,
    isUnlimited: summary.isUnlimited,
    type: summary.type,
    wholesaleMicrodollars,
    retailMicrodollars,
    markupMicrodollars,
    markupPercent,
    currency: "USD",
  };
}

// ── Input schemas ─────────────────────────────────────────────────────

const ListPackagesInputSchema = z.object({
  countryCode: z
    .string()
    .length(2, "Country must be an ISO-3166 two-letter code.")
    .optional(),
  region: z.enum(["global", "local"]).optional(),
  dataGb: z.number().nonnegative().optional(),
});

const GetPackageInputSchema = z.object({
  id: z.string().min(1),
});

const PurchaseInputSchema = z.object({
  packageId: z.string().min(1),
  customerEmail: z.string().email(),
  userId: z.string().optional(),
});

const InstallInfoInputSchema = z.object({
  orderId: z.string().min(1),
});

// ── Router ────────────────────────────────────────────────────────────

export const esimRouter = router({
  /**
   * Public: list buyable eSIM packages with markup applied. Filter by
   * two-letter country code, region (global | local), or minimum data
   * volume. Airalo's list endpoint is already tree-shaped by operator;
   * the client flattens it so we can filter per-package here.
   */
  listPackages: publicProcedure
    .input(ListPackagesInputSchema)
    .query(async ({ input }) => {
      const client = makeClient();
      const markupPercent = currentMarkupPercent();
      const filter: { type?: "global" | "local"; country?: string } = {};
      if (input.region) filter.type = input.region;
      if (input.countryCode) filter.country = input.countryCode;
      try {
        const summaries = await client.listPackages(filter);
        const filtered = summaries
          .filter(
            (s) =>
              matchesCountry(s, input.countryCode) &&
              matchesRegion(s, input.region) &&
              matchesDataGb(s, input.dataGb),
          )
          .map((s) => toPackageView(s, markupPercent));
        return { packages: filtered };
      } catch (err) {
        translateAiraloError(err, "Failed to list eSIM packages.");
      }
    }),

  /** Public: fetch a single package's pricing + metadata. */
  getPackage: publicProcedure
    .input(GetPackageInputSchema)
    .query(async ({ input }) => {
      const client = makeClient();
      const markupPercent = currentMarkupPercent();
      try {
        const summary = await client.getPackage(input.id);
        if (!summary) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: `We could not find an eSIM package with id ${input.id}.`,
          });
        }
        return toPackageView(summary, markupPercent);
      } catch (err) {
        translateAiraloError(err, "Failed to fetch the eSIM package.");
      }
    }),

  /**
   * Admin-only: submit a purchase order to Airalo, persist the sale with
   * wholesale + markup microdollars, and return the new row id. The
   * customer then calls `getInstallInfo` to collect their QR + LPA.
   */
  purchase: adminProcedure
    .input(PurchaseInputSchema)
    .mutation(async ({ input, ctx }) => {
      const client = makeClient();
      const markupPercent = currentMarkupPercent();

      // 1. Look up the package so we persist the correct wholesale figure.
      let summary: AiraloPackageSummary | null;
      try {
        summary = await client.getPackage(input.packageId);
      } catch (err) {
        translateAiraloError(err, "Failed to fetch the eSIM package before purchase.");
      }
      if (!summary) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `We could not find an eSIM package with id ${input.packageId}.`,
        });
      }

      const wholesaleMicrodollars = dollarsToMicrodollars(summary.priceUsd);
      const { retailMicrodollars, markupMicrodollars } = applyMarkup(
        wholesaleMicrodollars,
        markupPercent,
      );

      // 2. Place the order at Airalo.
      let airaloOrderId: string;
      let iccid: string | null = null;
      let lpaString: string | null = null;
      let qrCodeDataUrl: string | null = null;
      try {
        const order = await client.submitOrder({
          packageId: input.packageId,
          quantity: 1,
          description: `Crontech sale to ${input.customerEmail}`,
        });
        airaloOrderId = String(order.id);
        const first = order.esims?.[0];
        if (first) {
          iccid = first.iccid ?? null;
          lpaString = first.lpa_code ?? first.lpa ?? null;
          qrCodeDataUrl = first.qrcode ?? first.qrcode_url ?? null;
        }
      } catch (err) {
        translateAiraloError(err, "Airalo rejected the eSIM purchase.");
      }

      // 3. Persist the sale.
      const now = new Date();
      const row: typeof esimOrders.$inferInsert = {
        id: newOrderId(),
        userId: input.userId ?? ctx.userId,
        packageId: input.packageId,
        airaloOrderId,
        countryCode: summary.countryCode,
        dataGb: summary.dataGb,
        validityDays: summary.validityDays,
        costMicrodollars: wholesaleMicrodollars,
        markupMicrodollars,
        status: "active",
        iccid,
        lpaString,
        qrCodeDataUrl,
        purchasedAt: now,
      };
      await ctx.db.insert(esimOrders).values(row);

      return {
        id: row.id,
        airaloOrderId,
        packageId: input.packageId,
        customerEmail: input.customerEmail,
        wholesaleMicrodollars,
        retailMicrodollars,
        markupMicrodollars,
        markupPercent,
        iccid,
        lpaString,
        qrCodeDataUrl,
      };
    }),

  /**
   * Authenticated: list every eSIM order belonging to the caller, newest
   * first. We never leak Airalo order IDs belonging to other users.
   */
  listMyEsims: protectedProcedure.query(async ({ ctx }) => {
    const rows = await ctx.db
      .select()
      .from(esimOrders)
      .where(eq(esimOrders.userId, ctx.userId))
      .orderBy(desc(esimOrders.createdAt));
    return rows.map((r) => ({
      id: r.id,
      packageId: r.packageId,
      airaloOrderId: r.airaloOrderId,
      countryCode: r.countryCode,
      dataGb: r.dataGb,
      validityDays: r.validityDays,
      status: r.status,
      iccid: r.iccid,
      purchasedAt: r.purchasedAt.toISOString(),
      costMicrodollars: r.costMicrodollars,
      markupMicrodollars: r.markupMicrodollars,
    }));
  }),

  /**
   * Authenticated: fetch the install bundle (QR code + LPA string) for a
   * given order row. If the row is stale / missing the bundle, we refresh
   * from Airalo and persist. Only the order's owner can read it.
   */
  getInstallInfo: protectedProcedure
    .input(InstallInfoInputSchema)
    .query(async ({ input, ctx }) => {
      const rows = await ctx.db
        .select()
        .from(esimOrders)
        .where(eq(esimOrders.id, input.orderId))
        .limit(1);
      const row = rows[0];
      if (!row) {
        throw new TRPCError({
          code: "NOT_FOUND",
          message: `We could not find an eSIM order with id ${input.orderId}.`,
        });
      }
      if (row.userId !== ctx.userId) {
        throw new TRPCError({
          code: "FORBIDDEN",
          message: "You can only view install details for your own eSIMs.",
        });
      }

      if (row.lpaString && row.qrCodeDataUrl) {
        return {
          orderId: row.id,
          iccid: row.iccid,
          lpaString: row.lpaString,
          qrCodeDataUrl: row.qrCodeDataUrl,
        };
      }

      const client = makeClient();
      try {
        const info = await client.getInstallInfo(row.airaloOrderId);
        if (!info) {
          throw new TRPCError({
            code: "NOT_FOUND",
            message: "Airalo has not provisioned this eSIM yet. Try again shortly.",
          });
        }
        await ctx.db
          .update(esimOrders)
          .set({
            iccid: info.iccid,
            lpaString: info.lpaString,
            qrCodeDataUrl: info.qrCodeDataUrl,
            updatedAt: new Date(),
          })
          .where(eq(esimOrders.id, row.id));
        return {
          orderId: row.id,
          iccid: info.iccid,
          lpaString: info.lpaString,
          qrCodeDataUrl: info.qrCodeDataUrl,
        };
      } catch (err) {
        translateAiraloError(err, "Failed to fetch the eSIM install info.");
      }
    }),
});

export type EsimRouter = typeof esimRouter;
export type { TRPCContext };
