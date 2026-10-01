import type { WorkoutRecommendationTargetDTO } from "./types";

// WorkoutPlanExercise, as fetched for matching: numbers already converted from Prisma Decimal (see
// queries.ts#getWorkout), never the raw Prisma row.
export type PlanExerciseSnapshot = {
  exerciseId: string; exerciseOrder: number;
  targetWeightKg: number | null; targetRepsMin: number | null; targetRepsMax: number | null;
  targetSets: number; restSeconds: number | null;
};

// WorkoutPlanExercise <-> WorkoutExercise, matched by exerciseOrder — the same "index + 1" sequence
// createWorkoutFromRecommendation (lib/workouts/mutations.ts) assigns to both when it creates the Plan and the
// Session together, and the only thing either side has a uniqueness guarantee on
// (@@unique([workoutPlanId, exerciseOrder]) / @@unique([workoutSessionId, exerciseOrder])). exerciseId is
// deliberately NOT the matching key: the schema allows the same Exercise to appear more than once in one
// Session (no unique constraint on (workoutSessionId, exerciseId) — see getLatestExercisePerformance's own
// comment on the same fact), so keying by exerciseId alone could attach one Exercise's target to the wrong one
// of several same-Exercise rows. exerciseId is still cross-checked as an integrity guard: a mismatch (which
// never happens from this app's own write path) yields no target rather than a wrongly-attached one.
export function matchRecommendationTarget(
  exercise: { exerciseId: string; exerciseOrder: number },
  planExercises: readonly PlanExerciseSnapshot[] | null,
): WorkoutRecommendationTargetDTO | null {
  const plan = planExercises?.find((row) => row.exerciseOrder === exercise.exerciseOrder);
  if (!plan || plan.exerciseId !== exercise.exerciseId) return null;
  return {
    targetWeightKg: plan.targetWeightKg, targetRepsMin: plan.targetRepsMin, targetRepsMax: plan.targetRepsMax,
    targetSets: plan.targetSets, restSeconds: plan.restSeconds,
  };
}
