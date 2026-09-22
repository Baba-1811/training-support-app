import { describe, expect, it } from "vitest";
import { estimatedOneRepMax, workoutTitle } from "@/lib/workouts/calculations";

describe("workout calculations", () => {
  it("uses Epley without rounding the stored inputs", () => {
    expect(estimatedOneRepMax(60, 10)).toBe(80);
    expect(estimatedOneRepMax(62.5, 8)).toBeCloseTo(79.16666667);
    expect(estimatedOneRepMax(0, 12)).toBe(0);
  });
  it.each([[NaN, 5], [Infinity, 5], [-1, 5], [50, 0], [50, 1.5], [50, Infinity]])("rejects invalid values %s / %s", (weight, reps) => {
    expect(estimatedOneRepMax(weight, reps)).toBeNull();
  });
  it("uses Tokyo's calendar day for default titles", () => {
    expect(workoutTitle(null, "2026-09-21T15:01:00Z")).toBe("9月22日のトレーニング");
    expect(workoutTitle("脚の日", "2026-09-21T15:01:00Z")).toBe("脚の日");
  });
});
