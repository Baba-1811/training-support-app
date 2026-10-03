import { describe, expect, it } from "vitest";
import {
  resolveTargetWeightKg, resolveTargetReps, resolveTargetSets, resolveRestSeconds, resolveProgressedTargetWeightKg,
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

  // Phase 5F-3B: a "valid" previous Recommendation (its own target weight was non-null) takes priority over the
  // latest-performance fallback, and progresses from the PLANNED number, never from `previous`'s actual weight.
  describe("with a previous Recommendation context", () => {
    it("T. no previous Recommendation (undefined) -> falls back to latest-performance, unchanged from before", () => {
      const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "50", reps: 10 }]);
      expect(resolveTargetWeightKg("BARBELL", previous, undefined)).toBe(50);
    });

    it("U. no previous Recommendation and no performance either -> null (no invented starting weight)", () => {
      expect(resolveTargetWeightKg("BARBELL", null, undefined)).toBeNull();
    });

    it("V/M. ACHIEVED (MAINTAIN) holds the previous PLANNED target, ignoring a higher actual max", () => {
      const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "65", reps: 10 }]);
      const result = resolveTargetWeightKg("BARBELL", previous, { previousTargetWeightKg: 60, progressionDecision: "MAINTAIN", weightIncrementKg: 2.5 });
      expect(result).toBe(60);
    });

    it("W. EXCEEDED (INCREASE) progresses from the previous PLANNED target + increment, not actual max + increment", () => {
      const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "65", reps: 10 }]);
      const result = resolveTargetWeightKg("BARBELL", previous, { previousTargetWeightKg: 60, progressionDecision: "INCREASE", weightIncrementKg: 2.5 });
      expect(result).toBe(62.5);
      expect(result).not.toBe(67.5);
    });

    it("a previous Recommendation whose own target was null is not 'valid' -> still falls back to latest-performance", () => {
      const previous = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "50", reps: 10 }]);
      const result = resolveTargetWeightKg("BARBELL", previous, { previousTargetWeightKg: null, progressionDecision: "INCREASE", weightIncrementKg: 2.5 });
      expect(result).toBe(50);
    });

    it("BODYWEIGHT stays null even with a previous Recommendation context present", () => {
      const result = resolveTargetWeightKg("BODYWEIGHT", null, { previousTargetWeightKg: null, progressionDecision: "INCREASE", weightIncrementKg: 2.5 });
      expect(result).toBeNull();
    });
  });
});

describe("resolveProgressedTargetWeightKg", () => {
  it("F. INCREASE + increment -> previousTarget + increment", () => {
    expect(resolveProgressedTargetWeightKg({ previousTargetWeightKg: 60, progressionDecision: "INCREASE", weightIncrementKg: 2.5 })).toBe(62.5);
  });

  it("G. MAINTAIN -> previousTarget held", () => {
    expect(resolveProgressedTargetWeightKg({ previousTargetWeightKg: 60, progressionDecision: "MAINTAIN", weightIncrementKg: 2.5 })).toBe(60);
  });

  it("H. INSUFFICIENT_DATA -> previousTarget held", () => {
    expect(resolveProgressedTargetWeightKg({ previousTargetWeightKg: 60, progressionDecision: "INSUFFICIENT_DATA", weightIncrementKg: 2.5 })).toBe(60);
  });

  it("I. DECREASE -> safe v1 behavior is to hold previousTarget, never subtract", () => {
    expect(resolveProgressedTargetWeightKg({ previousTargetWeightKg: 60, progressionDecision: "DECREASE", weightIncrementKg: 2.5 })).toBe(60);
  });

  it("J. INCREASE + increment=null -> previousTarget held (never guesses an increment)", () => {
    expect(resolveProgressedTargetWeightKg({ previousTargetWeightKg: 60, progressionDecision: "INCREASE", weightIncrementKg: null })).toBe(60);
  });

  it("K. previousTargetWeightKg=null -> null regardless of decision (never invents a first number)", () => {
    expect(resolveProgressedTargetWeightKg({ previousTargetWeightKg: null, progressionDecision: "INCREASE", weightIncrementKg: 2.5 })).toBeNull();
    expect(resolveProgressedTargetWeightKg({ previousTargetWeightKg: null, progressionDecision: "MAINTAIN", weightIncrementKg: null })).toBeNull();
  });

  it("rounds to the DB's own 2-decimal scale rather than carrying a floating-point artifact", () => {
    const result = resolveProgressedTargetWeightKg({ previousTargetWeightKg: 57.15, progressionDecision: "INCREASE", weightIncrementKg: 2.5 });
    expect(result).toBe(59.65);
  });

  it("is deterministic: same input always produces the same result", () => {
    const input = { previousTargetWeightKg: 60, progressionDecision: "INCREASE" as const, weightIncrementKg: 2.5 };
    expect(resolveProgressedTargetWeightKg(input)).toBe(resolveProgressedTargetWeightKg(input));
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
