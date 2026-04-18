// ── BLK-029 — eSIM router tests ───────────────────────────────────────
// Exercises the tRPC `esim` router against the test sqlite DB with a
// mocked Airalo client so we never hit the real partner API. Per the
// BLK-029 brief the coverage contract is:
//
//   1. listPackages — filters by country + region + dataGb and applies
//      the configured markup percentage to every returned row.
//   2. purchase — admin-gated, fetches wholesale, applies markup,
//      calls /orders, and writes a row with correct cost/markup.
//   3. Markup math — retail = wholesale * (1 + markup%) within µ$ prec.
//   4. Airalo API failure — submitOrder failure bubbles up as
//      BAD_GATEWAY and no row is written.
//   5. Admin-only purchase — viewers get FORBIDDEN.
//
// We mock at the client-method level (not raw fetch) so router logic is
// what's under test. The HTTP + Zod decoding for the client itself lives
// in a separate unit test when that's added.

import { describe, test, expect, afterEach, beforeEach } from "bun:test";
import { eq } from "drizzle-orm";
import {
  db,
  users,
  sessions,
  scopedDb,
  esimOrders,
} from "@back-to-the-future/db";
import { appRouter } from "../router";
import { createSession } from "../../auth/session";
import type { TRPCContext } from "../context";
import {
  __setEsimTestHooks,
  __resetEsimTestHooks,
} from "./esim";
import type { AiraloClient } from "../../esim/airalo-client";
import type {
  AiraloInstallInfo,
  AiraloOrder,
  AiraloPackageSummary,
} from "../../esim/airalo-types";

// ── Test harness ──────────────────────────────────────────────────────

function ctxFor(userId: string, sessionToken: string): TRPCContext {
  return {
    db,
    userId,
    sessionToken,
    csrfToken: null,
    scopedDb: scopedDb(db, userId),
  };
}

async function createUser(role: "admin" | "viewer"): Promise<string> {
  const id = crypto.randomUUID();
  await db.insert(users).values({
    id,
    email: `esim-${role}-${Date.now()}-${Math.random().toString(36).slice(2, 8)}@example.com`,
    displayName: `eSIM Test ${role}`,
    role,
  });
  return id;
}

async function cleanupUser(userId: string): Promise<void> {
  await db.delete(esimOrders).where(eq(esimOrders.userId, userId));
  await db.delete(sessions).where(eq(sessions.userId, userId));
  await db.delete(users).where(eq(users.id, userId));
}

// ── Fake Airalo client ────────────────────────────────────────────────

interface FakeClientState {
  packages: AiraloPackageSummary[];
  submitOrderResult:
    | { kind: "ok"; value: AiraloOrder }
    | { kind: "err"; error: Error }
    | null;
  installInfo: AiraloInstallInfo | null;
  submitOrderCalls: Array<{
    packageId: string;
    quantity?: number;
    description?: string;
  }>;
  listPackagesCalls: Array<{ type?: string; country?: string }>;
}

function emptyState(): FakeClientState {
  return {
    packages: [],
    submitOrderResult: null,
    installInfo: null,
    submitOrderCalls: [],
    listPackagesCalls: [],
  };
}

function makeFakeClient(state: FakeClientState): AiraloClient {
  const impl = {
    async getAccessToken(): Promise<string> {
      return "fake-token";
    },
    async listPackages(filter: {
      type?: "global" | "local";
      country?: string;
    } = {}): Promise<AiraloPackageSummary[]> {
      const call: { type?: string; country?: string } = {};
      if (filter.type !== undefined) call.type = filter.type;
      if (filter.country !== undefined) call.country = filter.country;
      state.listPackagesCalls.push(call);
      return state.packages.filter((p) => {
        if (filter.country && p.countryCode) {
          if (p.countryCode.toLowerCase() !== filter.country.toLowerCase()) {
            return false;
          }
        }
        if (filter.type && p.type.toLowerCase() !== filter.type.toLowerCase()) {
          return false;
        }
        return true;
      });
    },
    async getPackage(id: string): Promise<AiraloPackageSummary | null> {
      return state.packages.find((p) => p.id === id) ?? null;
    },
    async submitOrder(input: {
      packageId: string;
      quantity?: number;
      description?: string;
    }): Promise<AiraloOrder> {
      const call: {
        packageId: string;
        quantity?: number;
        description?: string;
      } = { packageId: input.packageId };
      if (input.quantity !== undefined) call.quantity = input.quantity;
      if (input.description !== undefined) call.description = input.description;
      state.submitOrderCalls.push(call);
      const r = state.submitOrderResult;
      if (!r) return { id: "stub-order" };
      if (r.kind === "err") throw r.error;
      return r.value;
    },
    async listOrders(): Promise<AiraloOrder[]> {
      return [];
    },
    async getInstallInfo(): Promise<AiraloInstallInfo | null> {
      return state.installInfo;
    },
  };
  return impl as unknown as AiraloClient;
}

// ── Suite ─────────────────────────────────────────────────────────────

describe("esim router", () => {
  const createdUsers: string[] = [];
  let state: FakeClientState;

  beforeEach(() => {
    state = emptyState();
    __setEsimTestHooks({
      clientFactory: () => makeFakeClient(state),
      markupPercent: 25,
    });
  });

  afterEach(async () => {
    __resetEsimTestHooks();
    for (const id of createdUsers.splice(0)) await cleanupUser(id);
  });

  async function adminCaller(): Promise<ReturnType<typeof appRouter.createCaller>> {
    const userId = await createUser("admin");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    return appRouter.createCaller(ctxFor(userId, token));
  }

  function publicCaller(): ReturnType<typeof appRouter.createCaller> {
    return appRouter.createCaller({
      db,
      userId: null,
      sessionToken: null,
      csrfToken: null,
      scopedDb: null,
    });
  }

  // ── 1. listPackages with filter ─────────────────────────────────────

  test("listPackages returns all catalogued plans with markup applied", async () => {
    state.packages = [
      {
        id: "pkg-us-1",
        title: "USA 1GB / 7 days",
        operatorTitle: "Change",
        countryCode: "US",
        dataGb: 1,
        validityDays: 7,
        priceUsd: 4.5,
        isUnlimited: false,
        type: "local",
      },
      {
        id: "pkg-global-10",
        title: "Global 10GB / 30 days",
        operatorTitle: "Discover Global",
        countryCode: null,
        dataGb: 10,
        validityDays: 30,
        priceUsd: 35,
        isUnlimited: false,
        type: "global",
      },
    ];

    const caller = publicCaller();
    const out = await caller.esim.listPackages({});
    expect(out.packages).toHaveLength(2);

    const us = out.packages.find((p) => p.id === "pkg-us-1");
    expect(us).toBeDefined();
    // 4.50 USD → 4_500_000 µ$. 25% markup = 1_125_000. Retail = 5_625_000.
    expect(us?.wholesaleMicrodollars).toBe(4_500_000);
    expect(us?.markupMicrodollars).toBe(1_125_000);
    expect(us?.retailMicrodollars).toBe(5_625_000);
    expect(us?.markupPercent).toBe(25);
    expect(us?.currency).toBe("USD");
  });

  test("listPackages filters by country, region, and minimum data volume", async () => {
    state.packages = [
      {
        id: "pkg-us-1",
        title: "US 1GB",
        operatorTitle: "Change",
        countryCode: "US",
        dataGb: 1,
        validityDays: 7,
        priceUsd: 4.5,
        isUnlimited: false,
        type: "local",
      },
      {
        id: "pkg-us-10",
        title: "US 10GB",
        operatorTitle: "Change",
        countryCode: "US",
        dataGb: 10,
        validityDays: 30,
        priceUsd: 26,
        isUnlimited: false,
        type: "local",
      },
      {
        id: "pkg-global-10",
        title: "Global 10GB",
        operatorTitle: "Discover Global",
        countryCode: null,
        dataGb: 10,
        validityDays: 30,
        priceUsd: 35,
        isUnlimited: false,
        type: "global",
      },
    ];

    const caller = publicCaller();
    const us5plus = await caller.esim.listPackages({
      countryCode: "US",
      region: "local",
      dataGb: 5,
    });
    expect(us5plus.packages).toHaveLength(1);
    expect(us5plus.packages[0]?.id).toBe("pkg-us-10");

    // Confirm we forwarded the right filter to Airalo for caching efficiency.
    const lastCall = state.listPackagesCalls.at(-1);
    expect(lastCall?.country).toBe("US");
    expect(lastCall?.type).toBe("local");
  });

  // ── 2. Markup math (explicit case) ──────────────────────────────────

  test("listPackages honours a custom markup percent via the test hook", async () => {
    state.packages = [
      {
        id: "pkg-1",
        title: "Test",
        operatorTitle: "Op",
        countryCode: "JP",
        dataGb: 3,
        validityDays: 15,
        priceUsd: 10,
        isUnlimited: false,
        type: "local",
      },
    ];
    __setEsimTestHooks({
      clientFactory: () => makeFakeClient(state),
      markupPercent: 50,
    });
    const caller = publicCaller();
    const out = await caller.esim.listPackages({});
    // 10 USD = 10_000_000 µ$. 50% = 5_000_000. Retail = 15_000_000.
    expect(out.packages[0]?.wholesaleMicrodollars).toBe(10_000_000);
    expect(out.packages[0]?.markupMicrodollars).toBe(5_000_000);
    expect(out.packages[0]?.retailMicrodollars).toBe(15_000_000);
  });

  // ── 3. purchase — admin happy path ──────────────────────────────────

  test("purchase fetches the wholesale price, calls Airalo, and writes a row", async () => {
    state.packages = [
      {
        id: "pkg-us-10",
        title: "US 10GB",
        operatorTitle: "Change",
        countryCode: "US",
        dataGb: 10,
        validityDays: 30,
        priceUsd: 20,
        isUnlimited: false,
        type: "local",
      },
    ];
    state.submitOrderResult = {
      kind: "ok",
      value: {
        id: "airalo-order-123",
        esims: [
          {
            iccid: "8900000000000000001",
            qrcode: "LPA:1$smdp.airalo.com$ABCDEF",
            lpa_code: "LPA:1$smdp.airalo.com$ABCDEF",
          },
        ],
      },
    };

    const caller = await adminCaller();
    const out = await caller.esim.purchase({
      packageId: "pkg-us-10",
      customerEmail: "buyer@example.com",
    });

    expect(out.airaloOrderId).toBe("airalo-order-123");
    expect(out.wholesaleMicrodollars).toBe(20_000_000);
    expect(out.markupMicrodollars).toBe(5_000_000);
    expect(out.retailMicrodollars).toBe(25_000_000);
    expect(out.iccid).toBe("8900000000000000001");
    expect(out.lpaString).toBe("LPA:1$smdp.airalo.com$ABCDEF");

    const rows = await db
      .select()
      .from(esimOrders)
      .where(eq(esimOrders.airaloOrderId, "airalo-order-123"));
    expect(rows).toHaveLength(1);
    const row = rows[0];
    expect(row?.packageId).toBe("pkg-us-10");
    expect(row?.countryCode).toBe("US");
    expect(row?.dataGb).toBe(10);
    expect(row?.validityDays).toBe(30);
    expect(row?.costMicrodollars).toBe(20_000_000);
    expect(row?.markupMicrodollars).toBe(5_000_000);
    expect(row?.status).toBe("active");
    expect(state.submitOrderCalls).toHaveLength(1);
    expect(state.submitOrderCalls[0]?.packageId).toBe("pkg-us-10");
    expect(state.submitOrderCalls[0]?.quantity).toBe(1);
  });

  // ── 4. Airalo API failure ───────────────────────────────────────────

  test("purchase surfaces an Airalo failure as BAD_GATEWAY and writes no row", async () => {
    state.packages = [
      {
        id: "pkg-fail",
        title: "Fail",
        operatorTitle: "Op",
        countryCode: "US",
        dataGb: 1,
        validityDays: 7,
        priceUsd: 5,
        isUnlimited: false,
        type: "local",
      },
    ];
    const { AiraloError } = await import("../../esim/airalo-client");
    state.submitOrderResult = {
      kind: "err",
      error: new AiraloError(
        "Insufficient partner balance.",
        "submitOrder",
        402,
      ),
    };

    const caller = await adminCaller();
    let caught: unknown;
    try {
      await caller.esim.purchase({
        packageId: "pkg-fail",
        customerEmail: "buyer@example.com",
      });
    } catch (err) {
      caught = err;
    }
    expect(caught).toBeDefined();
    const code = (caught as { code?: string }).code;
    expect(code).toBe("BAD_GATEWAY");

    const rows = await db
      .select()
      .from(esimOrders)
      .where(eq(esimOrders.packageId, "pkg-fail"));
    expect(rows).toHaveLength(0);
  });

  // ── 5. Admin gating ─────────────────────────────────────────────────

  test("purchase is admin-gated — viewers get FORBIDDEN", async () => {
    state.packages = [
      {
        id: "pkg-forbidden",
        title: "Forbidden",
        operatorTitle: "Op",
        countryCode: "US",
        dataGb: 1,
        validityDays: 7,
        priceUsd: 5,
        isUnlimited: false,
        type: "local",
      },
    ];

    const userId = await createUser("viewer");
    createdUsers.push(userId);
    const token = await createSession(userId, db);
    const caller = appRouter.createCaller(ctxFor(userId, token));

    let caught: unknown;
    try {
      await caller.esim.purchase({
        packageId: "pkg-forbidden",
        customerEmail: "buyer@example.com",
      });
    } catch (err) {
      caught = err;
    }
    const code = (caught as { code?: string }).code;
    expect(code).toBe("FORBIDDEN");
  });

  // ── 6. listMyEsims ──────────────────────────────────────────────────

  test("listMyEsims returns only the caller's eSIM orders", async () => {
    state.packages = [
      {
        id: "pkg-mine",
        title: "Mine",
        operatorTitle: "Op",
        countryCode: "JP",
        dataGb: 5,
        validityDays: 15,
        priceUsd: 12,
        isUnlimited: false,
        type: "local",
      },
    ];
    state.submitOrderResult = {
      kind: "ok",
      value: {
        id: "mine-1",
        esims: [{ iccid: "89001", qrcode: "LPA:1$smdp$MINE", lpa_code: "LPA:1$smdp$MINE" }],
      },
    };
    const caller = await adminCaller();
    await caller.esim.purchase({
      packageId: "pkg-mine",
      customerEmail: "me@example.com",
    });

    const list = await caller.esim.listMyEsims();
    expect(list).toHaveLength(1);
    expect(list[0]?.packageId).toBe("pkg-mine");
    expect(list[0]?.airaloOrderId).toBe("mine-1");
    expect(list[0]?.status).toBe("active");
  });

  // ── 7. getInstallInfo ───────────────────────────────────────────────

  test("getInstallInfo returns the stored QR + LPA for the caller", async () => {
    state.packages = [
      {
        id: "pkg-install",
        title: "Install",
        operatorTitle: "Op",
        countryCode: "JP",
        dataGb: 5,
        validityDays: 15,
        priceUsd: 12,
        isUnlimited: false,
        type: "local",
      },
    ];
    state.submitOrderResult = {
      kind: "ok",
      value: {
        id: "install-1",
        esims: [
          {
            iccid: "89001",
            qrcode: "LPA:1$smdp$INSTALL",
            lpa_code: "LPA:1$smdp$INSTALL",
          },
        ],
      },
    };
    const caller = await adminCaller();
    const purchased = await caller.esim.purchase({
      packageId: "pkg-install",
      customerEmail: "install@example.com",
    });

    const info = await caller.esim.getInstallInfo({ orderId: purchased.id });
    expect(info.orderId).toBe(purchased.id);
    expect(info.lpaString).toBe("LPA:1$smdp$INSTALL");
    expect(info.qrCodeDataUrl).toBe("LPA:1$smdp$INSTALL");
    expect(info.iccid).toBe("89001");
  });
});
