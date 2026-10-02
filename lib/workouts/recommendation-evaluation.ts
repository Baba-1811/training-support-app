import type { SetDTO, WorkoutDTO, WorkoutRecommendationTargetDTO } from "./types";

// Phase 5F-1: pure "Recommendation Target vs Actual" evaluation. No Prisma, no requireUser, no React, no
// wall-clock or network reads — every value here is derived only from its own arguments, so the same
// (target, sets) pair always produces the same evaluation. WorkoutPlanExercise (planned) and WorkoutSet
// (actual) are read but never written back to; this module only ever produces a derived result, nothing persisted.

// e1RM-style float noise guard (same magnitude as analytics.ts's own EPSILON), used only for the
// Decimal-derived weight comparisons below.
const EPSILON = 1e-9;

// null = BODYWEIGHT etc. (no meaningful target weight to compare against), never "failed".
export type WeightTargetStatus = "ACHIEVED" | "BELOW_TARGET" | "NOT_APPLICABLE";
// Exceeding the rep range is a result to keep distinct from falling short of it, not a synonym for "failed".
export type RepsTargetStatus = "BELOW_TARGET" | "IN_TARGET" | "ABOVE_TARGET";

export type RecommendedSetEvaluation = {
  setNumber: number;
  weightKg: number;
  reps: number;
  weightStatus: WeightTargetStatus;
  repsStatus: RepsTargetStatus;
  // Weight ACHIEVED-or-N/A and reps IN_TARGET-or-ABOVE_TARGET. A rep count above the target max still counts
  // as meeting the target here; whether that makes the whole Exercise EXCEEDED is decided at exercise level.
  meetsOrExceedsTarget: boolean;
};

export type RecommendedExerciseStatus = "NOT_PERFORMED" | "PARTIAL" | "ACHIEVED" | "EXCEEDED";

export type RecommendedExerciseEvaluation = {
  plannedSets: number;
  // Every completed WORKING set actually performed, uncapped — an extra 4th set against a 3-set target is
  // still counted here as 4, even though setCompletionRate below is capped at 1.
  completedWorkingSets: number;
  // min(completedWorkingSets / plannedSets, 1): a display-ready achievement ratio, never above 100%.
  setCompletionRate: number;
  targetWeightKg: number | null;
  targetRepsMin: number | null;
  targetRepsMax: number | null;
  // Every completed WORKING set, setNumber ascending (not just the required ones below).
  sets: readonly RecommendedSetEvaluation[];
  // Among the first `plannedSets` completed WORKING sets (the "required" sets, see evaluateRecommendedExercise),
  // how many individually meet or exceed target.
  achievedSetCount: number;
  meetsOrExceedsSetCount: boolean;
  status: RecommendedExerciseStatus;
};

function evaluateWeight(targetWeightKg: number | null, actualWeightKg: number): WeightTargetStatus {
  if (targetWeightKg === null) return "NOT_APPLICABLE";
  return actualWeightKg >= targetWeightKg - EPSILON ? "ACHIEVED" : "BELOW_TARGET";
}

function evaluateReps(targetRepsMin: number | null, targetRepsMax: number | null, actualReps: number): RepsTargetStatus {
  if (targetRepsMin !== null && actualReps < targetRepsMin) return "BELOW_TARGET";
  if (targetRepsMax !== null && actualReps > targetRepsMax) return "ABOVE_TARGET";
  return "IN_TARGET";
}

// target === null (no Recommendation for this Exercise, or a normal/Exercise-Library-started Workout) means
// there is nothing to evaluate against — returns null rather than a zeroed-out result.
export function evaluateRecommendedExercise(args: {
  target: WorkoutRecommendationTargetDTO | null;
  sets: readonly SetDTO[];
}): RecommendedExerciseEvaluation | null {
  const { target, sets } = args;
  if (!target) return null;

  // WARMUP and completed=false are excluded entirely: not compared to target, not counted toward set totals.
  const workingSets = sets
    .filter((set) => set.setType === "WORKING" && set.completed)
    .slice()
    .sort((a, b) => a.setNumber - b.setNumber);

  const evaluatedSets: RecommendedSetEvaluation[] = workingSets.map((set) => {
    const weightKg = Number(set.weightKg);
    const weightStatus = evaluateWeight(target.targetWeightKg, weightKg);
    const repsStatus = evaluateReps(target.targetRepsMin, target.targetRepsMax, set.reps);
    return {
      setNumber: set.setNumber, weightKg, reps: set.reps, weightStatus, repsStatus,
      meetsOrExceedsTarget: weightStatus !== "BELOW_TARGET" && repsStatus !== "BELOW_TARGET",
    };
  });

  const plannedSets = target.targetSets;
  const completedWorkingSets = evaluatedSets.length;
  const setCompletionRate = plannedSets > 0 ? Math.min(completedWorkingSets / plannedSets, 1) : (completedWorkingSets > 0 ? 1 : 0);

  // The "required" sets for achievement purposes are the first `plannedSets` completed WORKING sets in
  // setNumber order — never a best-N pick. A later set cannot paper over an earlier miss (see this module's
  // own tests: Set1 below target, Sets 2-4 fine, still does not reach ACHIEVED).
  const requiredSets = evaluatedSets.slice(0, plannedSets);
  const achievedSetCount = requiredSets.filter((set) => set.meetsOrExceedsTarget).length;
  const meetsOrExceedsSetCount = achievedSetCount >= plannedSets;

  let status: RecommendedExerciseStatus;
  if (completedWorkingSets === 0) {
    status = "NOT_PERFORMED";
  } else if (!meetsOrExceedsSetCount) {
    status = "PARTIAL";
  } else {
    // EXCEEDED requires every required set to already meet target AND at least one of those required sets to
    // clear it, not just tie it: a heavier-than-target weight or a rep count above the target max. An extra
    // set beyond plannedSets (even an impressive one) is deliberately not considered here.
    const exceeds = requiredSets.some((set) =>
      (target.targetWeightKg !== null && set.weightKg > target.targetWeightKg + EPSILON) || set.repsStatus === "ABOVE_TARGET");
    status = exceeds ? "EXCEEDED" : "ACHIEVED";
  }

  return {
    plannedSets, completedWorkingSets, setCompletionRate,
    targetWeightKg: target.targetWeightKg, targetRepsMin: target.targetRepsMin, targetRepsMax: target.targetRepsMax,
    sets: evaluatedSets, achievedSetCount, meetsOrExceedsSetCount, status,
  };
}

// Convenience over an already-loaded WorkoutDTO (getWorkout already carries both the Recommendation Target
// snapshot and the actual WorkoutSets per exercise — see queries.ts#getWorkout / recommendation-target.ts): no
// new Prisma query, just reshaping data this module's caller already has. Keyed by WorkoutExercise id, so two
// WorkoutExercise rows sharing one Exercise (see recommendation-target.ts's own comment on this) each get their
// own independent evaluation, matched the same way their Recommendation Targets already are.
export function evaluateWorkoutRecommendations(
  workout: Pick<WorkoutDTO, "exercises">,
): Record<string, RecommendedExerciseEvaluation | null> {
  return Object.fromEntries(workout.exercises.map((exercise) =>
    [exercise.id, evaluateRecommendedExercise({ target: exercise.recommendationTarget, sets: exercise.sets })]));
}
