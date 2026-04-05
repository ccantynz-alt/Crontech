import { describe, test, expect } from "bun:test";

describe("UI package exports", () => {
  test("module exports are defined", async () => {
    const mod = await import("./index");
    expect(mod).toBeDefined();
  });
});
