// Unit tests for LaunchChecklist counts logic.
//
// Rendering-side behaviour (HUD visibility, styles, localStorage) is
// covered by component tests elsewhere; this file pins down the pure
// accounting function so the "% live" badge cannot regress silently.

import { describe, expect, test } from "bun:test";
import {
  LAUNCH_PHASES,
  computeCounts,
  type ChecklistPhase,
} from "./LaunchChecklist";

describe("computeCounts", () => {
  test("returns zero when no items are done", () => {
    const c = computeCounts(LAUNCH_PHASES, new Set());
    expect(c.doneCount).toBe(0);
    expect(c.total).toBeGreaterThan(0);
    expect(c.pct).toBe(0);
  });

  test("returns 100% when every item is done", () => {
    const all = new Set<string>();
    for (const p of LAUNCH_PHASES) for (const it of p.items) all.add(it.id);
    const c = computeCounts(LAUNCH_PHASES, all);
    expect(c.doneCount).toBe(c.total);
    expect(c.pct).toBe(100);
  });

  test("rounds partial percentages correctly", () => {
    const phases: readonly ChecklistPhase[] = [
      {
        id: "T",
        title: "T",
        subtitle: "test",
        items: [
          { id: "t1", label: "one" },
          { id: "t2", label: "two" },
          { id: "t3", label: "three" },
        ],
      },
    ];
    expect(computeCounts(phases, new Set(["t1"])).pct).toBe(33);
    expect(computeCounts(phases, new Set(["t1", "t2"])).pct).toBe(67);
  });

  test("ignores ids that aren't in the phase list", () => {
    const c = computeCounts(LAUNCH_PHASES, new Set(["nonexistent"]));
    expect(c.doneCount).toBe(0);
  });

  test("empty phases return 0% without division by zero", () => {
    const c = computeCounts([], new Set());
    expect(c.total).toBe(0);
    expect(c.pct).toBe(0);
  });

  test("Phase A is fully enumerated (6 items)", () => {
    const phaseA = LAUNCH_PHASES.find((p) => p.id === "A");
    expect(phaseA).toBeDefined();
    expect(phaseA?.items.length).toBe(6);
  });
});
