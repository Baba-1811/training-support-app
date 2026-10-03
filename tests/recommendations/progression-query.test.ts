import { describe, expect, it, vi } from "vitest";

// Only the pure reducer is under test here; queries.ts still has module-level imports (prisma, requireUser)
// that must not throw at import time in a test environment with no DATABASE_URL (same mocking requirement as
// tests/recommendations/queries.test.ts).
vi.mock("@/lib/prisma", () => ({ prisma: {} }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: vi.fn() }));

import { reducePreviousRecommendationProgress } from "@/lib/recommendations/queries";

const benchPressId = "11111111-1111-4111-8111-111111111111";
const squatId = "22222222-2222-4222-8222-222222222222";
const workoutPlanId = "33333333-3333-4333-8333-333333333333";

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

describe("reducePreviousRecommendationProgress", () => {
  it("matches target + actual via exerciseOrder and produces INCREASE for an EXCEEDED result", () => {
    const result = reducePreviousRecommendationProgress(
      [{ exerciseId: benchPressId, exerciseOrder: 1, workoutExerciseId: "we-1", workoutPlanId }],
      [planRow()],
      [set("we-1", 1, 65, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10)],
    );
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "INCREASE" });
  });

  it("X. duplicate Exercise (two rows in the same session) still pairs each row's own target with its own actual via exerciseOrder", () => {
    const result = reducePreviousRecommendationProgress(
      [
        { exerciseId: benchPressId, exerciseOrder: 1, workoutExerciseId: "we-1", workoutPlanId },
      ],
      [
        planRow({ exerciseId: benchPressId, exerciseOrder: 1, targetWeightKg: 60 }),
        planRow({ exerciseId: benchPressId, exerciseOrder: 2, targetWeightKg: 40 }),
      ],
      [set("we-1", 1, 60, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10)],
    );
    // order 1's target (60) is used, never order 2's (40), even though both belong to the same Exercise/plan.
    expect(result[benchPressId]?.previousTargetWeightKg).toBe(60);
  });

  it("Y. exerciseOrder matches but exerciseId does not -> no context produced (defensive guard, same as matchRecommendationTarget)", () => {
    const result = reducePreviousRecommendationProgress(
      [{ exerciseId: squatId, exerciseOrder: 1, workoutExerciseId: "we-1", workoutPlanId }],
      [planRow({ exerciseId: benchPressId, exerciseOrder: 1 })],
      [set("we-1", 1, 60, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10)],
    );
    expect(result[squatId]).toBeUndefined();
  });

  it("no matching WorkoutPlanExercise at all -> no context produced (falls back to latest-performance elsewhere)", () => {
    const result = reducePreviousRecommendationProgress(
      [{ exerciseId: benchPressId, exerciseOrder: 5, workoutExerciseId: "we-1", workoutPlanId }],
      [planRow({ exerciseOrder: 1 })],
      [],
    );
    expect(result[benchPressId]).toBeUndefined();
  });

  it("Z. WARMUP sets are excluded from the evaluation feeding the decision", () => {
    const result = reducePreviousRecommendationProgress(
      [{ exerciseId: benchPressId, exerciseOrder: 1, workoutExerciseId: "we-1", workoutPlanId }],
      [planRow()],
      [set("we-1", 1, 20, 20, { setType: "WARMUP" }), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10), set("we-1", 4, 60, 10)],
    );
    // Only 3 completed WORKING sets count toward the required 3 -> ACHIEVED (not EXCEEDED from the WARMUP row).
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "MAINTAIN" });
  });

  it("AA. completed=false sets are excluded -> NOT_PERFORMED when the only sets are unconfirmed", () => {
    const result = reducePreviousRecommendationProgress(
      [{ exerciseId: benchPressId, exerciseOrder: 1, workoutExerciseId: "we-1", workoutPlanId }],
      [planRow()],
      [set("we-1", 1, 60, 10, { completed: false })],
    );
    expect(result[benchPressId]).toEqual({ previousTargetWeightKg: 60, progressionDecision: "INSUFFICIENT_DATA" });
  });

  it("is deterministic: same input always produces the same (deep-equal) result", () => {
    const latestRows = [{ exerciseId: benchPressId, exerciseOrder: 1, workoutExerciseId: "we-1", workoutPlanId }];
    const planRows = [planRow()];
    const setRows = [set("we-1", 1, 60, 10), set("we-1", 2, 60, 10), set("we-1", 3, 60, 10)];
    expect(reducePreviousRecommendationProgress(latestRows, planRows, setRows))
      .toEqual(reducePreviousRecommendationProgress(latestRows, planRows, setRows));
  });

  it("returns {} for no rows", () => {
    expect(reducePreviousRecommendationProgress([], [], [])).toEqual({});
  });
});
