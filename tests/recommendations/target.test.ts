import { describe, expect, it } from "vitest";
import {
  resolveTargetWeightKg, resolveTargetReps, resolveTargetSets, resolveRestSeconds,
  COLD_START_REPS_MIN, COLD_START_REPS_MAX, MAX_TARGET_REPS, NORMAL_TARGET_SETS, REDUCED_TARGET_SETS,
} from "@/lib/recommendations/target";
import { makePreviousPerformance } from "./fixtures";

describe("resolveTargetWeightKg", () => {
  it("is null with no previous performance", () => {
    expect(resolveTargetWeightKg("BARBELL", null)).toBeNull();
    expect(resolveTargetWeightKg("BARBELL", undefined)).toBeNull();
  });
  it("is null when the previous performance has no sets", () => {
    expect(resolveTargetWeightKg("BARBELL", makePreviousPerformance("2026-09-20T00:00:00Z", []))).toBeNull();
  });
  it("is the heaviest completed WORKING set weight from last time", () => {
    const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [
      { weightKg: "60", reps: 8 }, { weightKg: "60", reps: 8 }, { weightKg: "55", reps: 10 },
    ]);
    expect(resolveTargetWeightKg("BARBELL", previous)).toBe(60);
  });
  it("never raises the weight beyond what was actually lifted (no auto-progression)", () => {
    const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "60", reps: 12 }]);
    expect(resolveTargetWeightKg("BARBELL", previous)).toBe(60);
  });
  it("is always null for BODYWEIGHT, even with recorded (0kg) history", () => {
    const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "0", reps: 15 }]);
    expect(resolveTargetWeightKg("BODYWEIGHT", previous)).toBeNull();
  });
});

describe("resolveTargetReps", () => {
  it("is the cold-start 8-12 range with no previous performance", () => {
    expect(resolveTargetReps(null)).toEqual({ targetRepsMin: COLD_START_REPS_MIN, targetRepsMax: COLD_START_REPS_MAX });
    expect(resolveTargetReps(undefined)).toEqual({ targetRepsMin: 8, targetRepsMax: 12 });
  });
  it("uses the lowest reps among the sets tied for the heaviest weight as the representative value", () => {
    // 60kg x8, 60kg x8, 55kg x10 -> heaviest is 60kg, its reps are {8, 8} -> representative = 8.
    const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [
      { weightKg: "60", reps: 8 }, { weightKg: "60", reps: 8 }, { weightKg: "55", reps: 10 },
    ]);
    expect(resolveTargetReps(previous)).toEqual({ targetRepsMin: 8, targetRepsMax: 10 });
  });
  it("takes the minimum (not the max) when the heaviest weight was hit at different rep counts", () => {
    const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [
      { weightKg: "60", reps: 9 }, { weightKg: "60", reps: 6 },
    ]);
    expect(resolveTargetReps(previous)).toEqual({ targetRepsMin: 6, targetRepsMax: 8 });
  });
  it("is conservative: previous 8 reps proposes 8-10, never jumps straight to 12", () => {
    const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "60", reps: 8 }]);
    const result = resolveTargetReps(previous);
    expect(result.targetRepsMax).toBe(10);
    expect(result.targetRepsMax).toBeLessThan(12);
  });
  it("caps targetRepsMax at 15 even for an already-high rep count", () => {
    const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "20", reps: 14 }]);
    expect(resolveTargetReps(previous)).toEqual({ targetRepsMin: 14, targetRepsMax: MAX_TARGET_REPS });
  });
});

describe("resolveTargetSets", () => {
  it("is 3 normally", () => expect(resolveTargetSets(false)).toBe(NORMAL_TARGET_SETS));
  it("is 2 under reduced load, never below the 2-set floor", () => expect(resolveTargetSets(true)).toBe(REDUCED_TARGET_SETS));
});

describe("resolveRestSeconds", () => {
  it.each([[30, 60], [45, 75], [60, 90], [90, 90]] as const)("%d minutes -> %ds rest", (minutes, seconds) => {
    expect(resolveRestSeconds(minutes)).toBe(seconds);
  });
  it("falls back to the 45-minute rest (75s) when availableMinutes is null", () => {
    expect(resolveRestSeconds(null)).toBe(75);
  });
  it("does not shorten regardless of reducedLoad (resolveRestSeconds has no such parameter)", () => {
    expect(resolveRestSeconds.length).toBe(1);
  });
});
