import { describe, expect, it } from "vitest";
import { matchRecommendationTarget, recommendedInitialWeightKg, type PlanExerciseSnapshot } from "@/lib/workouts/recommendation-target";

const benchPressId = "11111111-1111-4111-8111-111111111111";
const squatId = "22222222-2222-4222-8222-222222222222";

const planExercise = (overrides: Partial<PlanExerciseSnapshot> = {}): PlanExerciseSnapshot => ({
  exerciseId: benchPressId, exerciseOrder: 1,
  targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90,
  ...overrides,
});

describe("matchRecommendationTarget", () => {
  it("is null for a normal Workout (no WorkoutPlan at all)", () => {
    expect(matchRecommendationTarget({ exerciseId: benchPressId, exerciseOrder: 1 }, null)).toBeNull();
  });

  it("matches by exerciseOrder and returns every snapshot field", () => {
    const plans = [planExercise()];
    expect(matchRecommendationTarget({ exerciseId: benchPressId, exerciseOrder: 1 }, plans)).toEqual({
      targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90,
    });
  });

  it("keeps targetWeightKg/restSeconds null rather than inventing a placeholder", () => {
    const plans = [planExercise({ targetWeightKg: null, restSeconds: null })];
    expect(matchRecommendationTarget({ exerciseId: benchPressId, exerciseOrder: 1 }, plans)).toEqual({
      targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: null,
    });
  });

  it("is null when this WorkoutExercise's order has no corresponding WorkoutPlanExercise", () => {
    const plans = [planExercise({ exerciseOrder: 1 })];
    expect(matchRecommendationTarget({ exerciseId: squatId, exerciseOrder: 2 }, plans)).toBeNull();
  });

  it("matches the same exerciseId's two different orders to their own distinct targets (duplicate-exercise Session)", () => {
    const plans = [
      planExercise({ exerciseId: benchPressId, exerciseOrder: 1, targetWeightKg: 60 }),
      planExercise({ exerciseId: benchPressId, exerciseOrder: 2, targetWeightKg: 40, restSeconds: 60 }),
    ];
    expect(matchRecommendationTarget({ exerciseId: benchPressId, exerciseOrder: 1 }, plans)?.targetWeightKg).toBe(60);
    expect(matchRecommendationTarget({ exerciseId: benchPressId, exerciseOrder: 2 }, plans)?.targetWeightKg).toBe(40);
  });

  it("refuses the match (defensively) when the order lines up but the exerciseId does not", () => {
    const plans = [planExercise({ exerciseId: benchPressId, exerciseOrder: 1 })];
    expect(matchRecommendationTarget({ exerciseId: squatId, exerciseOrder: 1 }, plans)).toBeNull();
  });
});

describe("recommendedInitialWeightKg (Phase 5E-2 Set input default)", () => {
  it("proposes the target weight for Set 1 (string, matching the input's own value type)", () => {
    expect(recommendedInitialWeightKg(1, 60)).toBe("60");
  });

  it("keeps decimal weights exact", () => {
    expect(recommendedInitialWeightKg(1, 62.5)).toBe("62.5");
  });

  it("never invents a weight (e.g. 0) when targetWeightKg is null (BODYWEIGHT etc.)", () => {
    expect(recommendedInitialWeightKg(1, null)).toBe("");
  });

  it("is blank for a normal Workout with no Recommendation Target at all", () => {
    expect(recommendedInitialWeightKg(1, null)).toBe("");
  });

  it("never proposes a value for Set 2 or later, even when a target weight exists", () => {
    expect(recommendedInitialWeightKg(2, 60)).toBe("");
    expect(recommendedInitialWeightKg(3, 60)).toBe("");
  });
});
