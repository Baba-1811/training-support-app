import { describe, expect, it, vi } from "vitest";

// Only the pure reducer is under test here; queries.ts still has module-level imports (prisma, requireUser)
// that must not throw at import time in a test environment with no DATABASE_URL (same mocking requirement as
// tests/recommendations/queries.test.ts).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

import { reducePreviousRecommendationProgress } from "@/lib/recommendations/queries";
import { resolveWeightTarget } from "@/lib/recommendations/target";
import { formatWeightTargetExplanation } from "@/lib/recommendations/display";

const benchPressId = "11111111-1111-4111-8111-111111111111";
const squatId = "22222222-2222-4222-8222-222222222222";
const workoutPlanId = "33333333-3333-4333-8333-333333333333";
const olderWorkoutPlanId = "44444444-4444-4444-8444-444444444444";

const newer = new Date("2026-09-28T00:00:00Z");
const older = new Date("2026-09-10T00:00:00Z");

const candidate = (overrides: Partial<{
  exerciseId: string; exerciseOrder: number; workoutExerciseId: string; workoutPlanId: string; startedAt: Date;
}> = {}) => ({
  exerciseId: benchPressId, exerciseOrder: 1, workoutExerciseId: "we-1", workoutPlanId, startedAt: newer,
  ...overrides,
});

const planRow = (overrides: Partial<{
  workoutPlanId: string; exerciseId: string; exerciseOrder: number;
  targetWeightKg: number | null; targetRepsMin: number | null; targetRepsMax: number | null; targetSets: number; restSeconds: number | null;
}> = {}) => ({
  workoutPlanId, exerciseId: benchPressId, exerciseOrder: 1,
  targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: 90,
  ...overrides,
});

const set = (workoutExerciseId: string, setNumber: number, weightKg: number, reps: number, overrides: Partial<{ setType: "WORKING" | "WARMUP"; completed: boolean }> = {}) => ({
  workoutExerciseId, setNumber, weightKg: String(weightKg), reps, setType: "WORKING" as const, completed: true, ...overrides,
});

describe("reducePreviousRecommendationProgress — baseline", () => {
  it("matches target + actual via exerciseOrder and produces INCREASE for an EXCEEDED result", () => {
    const result = reducePreviousRecommendationProgress(
      [candidate()],
      [planRow()],
      [set("we-1", 1, 65, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10)],
    );
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "INCREASE", previousEvaluationStatus: "EXCEEDED" });
  });

  it("I. exerciseOrder matches but exerciseId does not -> no context produced (defensive guard, same as matchRecommendationTarget)", () => {
    const result = reducePreviousRecommendationProgress(
      [candidate({ exerciseId: squatId, exerciseOrder: 1 })],
      [planRow({ exerciseId: benchPressId, exerciseOrder: 1 })],
      [set("we-1", 1, 60, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10)],
    );
    expect(result[squatId]).toBeUndefined();
  });

  it("J. no matching WorkoutPlanExercise at all -> no context produced (falls back to latest-performance elsewhere)", () => {
    const result = reducePreviousRecommendationProgress(
      [candidate({ exerciseOrder: 5 })],
      [planRow({ exerciseOrder: 1 })],
      [],
    );
    expect(result[benchPressId]).toBeUndefined();
  });

  it("Z. WARMUP sets are excluded from the evaluation feeding the decision", () => {
    const result = reducePreviousRecommendationProgress(
      [candidate()],
      [planRow()],
      [set("we-1", 1, 20, 20, { setType: "WARMUP" }), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10), set("we-1", 4, 60, 10)],
    );
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "MAINTAIN", previousEvaluationStatus: "ACHIEVED" });
  });

  it("AA. completed=false sets are excluded -> NOT_PERFORMED when the only sets are unconfirmed", () => {
    const result = reducePreviousRecommendationProgress(
      [candidate()],
      [planRow()],
      [set("we-1", 1, 60, 10, { completed: false })],
    );
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "INSUFFICIENT_DATA", previousEvaluationStatus: "NOT_PERFORMED" });
  });

  it("is deterministic: same input always produces the same (deep-equal) result", () => {
    const candidateRows = [candidate()];
    const planRows = [planRow()];
    const setRows = [set("we-1", 1, 60, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10)];
    expect(reducePreviousRecommendationProgress(candidateRows, planRows, setRows))
      .toEqual(reducePreviousRecommendationProgress(candidateRows, planRows, setRows));
  });

  it("returns {} for no rows", () => {
    expect(reducePreviousRecommendationProgress([], [], [])).toEqual({});
  });
});

// Phase 5F-4: validity must be decided across ALL candidate rows for an Exercise before picking the latest —
// never "pick the newest row, then check if it happens to be valid" (that premature reduction is exactly
// Phase 5F-3B's bug).
describe("A/B. same-session duplicate Exercise — deterministic selection rule", () => {
  it("A. both order=1 and order=4 are valid in the same session -> the documented rule (higher exerciseOrder wins on a startedAt tie) picks order=4", () => {
    const result = reducePreviousRecommendationProgress(
      [
        candidate({ exerciseOrder: 1, workoutExerciseId: "we-1" }),
        candidate({ exerciseOrder: 4, workoutExerciseId: "we-4" }),
      ],
      [
        planRow({ exerciseOrder: 1, targetWeightKg: 60 }),
        planRow({ exerciseOrder: 4, targetWeightKg: 80 }),
      ],
      [
        set("we-1", 1, 60, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10),
        set("we-4", 1, 80, 10), set("we-4", 2, 80, 10), set("we-4", 3, 80, 10),
      ],
    );
    // order=4's own target (80) is used, not order=1's (60) — confirms order=4 was the one selected.
    expect(result[benchPressId]?.previousTargetWeightKg).toBe(80);
  });

  it("B. order=1 is invalid (Plan says a different Exercise at that order), order=4 is valid -> order=4 is used, not discarded as 'no history'", () => {
    const result = reducePreviousRecommendationProgress(
      [
        candidate({ exerciseOrder: 1, workoutExerciseId: "we-1" }), // invalid: Plan order=1 is Squat, not Bench
        candidate({ exerciseOrder: 4, workoutExerciseId: "we-4" }), // valid: Plan order=4 is Bench
      ],
      [
        planRow({ exerciseId: squatId, exerciseOrder: 1, targetWeightKg: 50 }),
        planRow({ exerciseId: benchPressId, exerciseOrder: 4, targetWeightKg: 60 }),
      ],
      [set("we-4", 1, 60, 10), set("we-4", 2, 60, 10), set("we-4", 3, 60, 10)],
    );
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "MAINTAIN", previousEvaluationStatus: "ACHIEVED" });
  });
});

describe("C/D. cross-session recency — validity before recency", () => {
  it("C. the newest session's candidate is invalid, an older session's is valid -> the older valid pair is used, not 'no history'", () => {
    const result = reducePreviousRecommendationProgress(
      [
        candidate({ workoutExerciseId: "we-newer", workoutPlanId, startedAt: newer, exerciseOrder: 2 }), // invalid: no Plan row at order=2 below
        candidate({ workoutExerciseId: "we-older", workoutPlanId: olderWorkoutPlanId, startedAt: older, exerciseOrder: 1 }), // valid
      ],
      [planRow({ workoutPlanId: olderWorkoutPlanId, exerciseOrder: 1, targetWeightKg: 55 })],
      [set("we-older", 1, 55, 10), set("we-older", 2, 55, 10), set("we-older", 3, 55, 10)],
    );
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 55, progressionDecision: "MAINTAIN", previousEvaluationStatus: "ACHIEVED" });
  });

  it("D. both sessions are valid -> the newer one wins", () => {
    const result = reducePreviousRecommendationProgress(
      [
        candidate({ workoutExerciseId: "we-newer", workoutPlanId, startedAt: newer, exerciseOrder: 1 }),
        candidate({ workoutExerciseId: "we-older", workoutPlanId: olderWorkoutPlanId, startedAt: older, exerciseOrder: 1 }),
      ],
      [
        planRow({ workoutPlanId, exerciseOrder: 1, targetWeightKg: 65 }),
        planRow({ workoutPlanId: olderWorkoutPlanId, exerciseOrder: 1, targetWeightKg: 55 }),
      ],
      [
        set("we-newer", 1, 65, 10), set("we-newer", 2, 65, 10), set("we-newer", 3, 65, 10),
        set("we-older", 1, 55, 10), set("we-older", 2, 55, 10), set("we-older", 3, 55, 10),
      ],
    );
    expect(result[benchPressId]?.previousTargetWeightKg).toBe(65);
  });
});

describe("H. sets isolation", () => {
  it("the selected row's own sets are used; the other duplicate's sets never leak in", () => {
    const result = reducePreviousRecommendationProgress(
      [
        candidate({ exerciseOrder: 1, workoutExerciseId: "we-1" }),
        candidate({ exerciseOrder: 4, workoutExerciseId: "we-4" }),
      ],
      [
        planRow({ exerciseOrder: 1, targetWeightKg: 60 }),
        planRow({ exerciseOrder: 4, targetWeightKg: 60 }),
      ],
      [
        set("we-1", 1, 60, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10), // order=1 actual: 60kg
        set("we-4", 1, 100, 10), set("we-4", 2, 100, 10), set("we-4", 3, 100, 10), // order=4 actual: 100kg
      ],
    );
    // Selection rule picks order=4 (per A's documented tie-break) -> EXCEEDED from its own 100kg actual,
    // never a status that would only make sense if order=1's 60kg sets had been mixed in.
    expect(result[benchPressId]?.previousEvaluationStatus).toBe("EXCEEDED");
  });
});

describe("K/L. Progression + Explainability integration (older valid pair, newer invalid candidate present)", () => {
  it("resolves to the correct next target and a PROGRESSED 60 -> 62.5 explanation, from the older valid pair alone", () => {
    const progression = reducePreviousRecommendationProgress(
      [
        candidate({ workoutExerciseId: "we-newer", workoutPlanId, startedAt: newer, exerciseOrder: 3 }), // invalid
        candidate({ workoutExerciseId: "we-older", workoutPlanId: olderWorkoutPlanId, startedAt: older, exerciseOrder: 1 }), // valid, target 60, EXCEEDED
      ],
      [planRow({ workoutPlanId: olderWorkoutPlanId, exerciseOrder: 1, targetWeightKg: 60 })],
      [set("we-older", 1, 65, 13), set("we-older", 2, 60, 12), set("we-older", 3, 60, 12)],
    );
    expect(progression[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "INCREASE", previousEvaluationStatus: "EXCEEDED" });

    const { targetWeightKg, explanation } = resolveWeightTarget("BARBELL", null, { ...progression[benchPressId], weightIncrementKg: 2.5 });
    expect(targetWeightKg).toBe(62.5);
    expect(formatWeightTargetExplanation(explanation, targetWeightKg)).toBe("前回の目安を上回ったため、60kg → 62.5kg");
  });
});
