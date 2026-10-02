import { formatRecommendationRepsAndSets, formatRecommendationWeight } from "./recommendation-target-format";
import type { RecommendedExerciseEvaluation, RecommendedExerciseStatus, RecommendedSetEvaluation } from "./recommendation-evaluation";

// Phase 5F-2: UI-facing display/summary helpers for the Phase 5F-1 evaluation. Pure and React-free, same
// convention as recommendation-target-format.ts — domain status values and set-level facts are never
// recomputed here, only formatted or counted.

export function formatRecommendationEvaluationStatus(status: RecommendedExerciseStatus): string {
  return {
    NOT_PERFORMED: "未実施", PARTIAL: "一部達成", ACHIEVED: "目標達成", EXCEEDED: "目標以上",
  }[status];
}

// Each completed WORKING set shown with its own weight, setNumber ascending (already guaranteed by
// evaluateRecommendedExercise) — never a single shared weight for sets that may differ (e.g. "60kg×10 / 9 / 8"
// would misrepresent a session where only the first set was actually 60kg). null when nothing was performed.
export function formatRecommendationActualSets(sets: readonly RecommendedSetEvaluation[]): string | null {
  if (sets.length === 0) return null;
  return sets.map((set) => `${set.weightKg}kg×${set.reps}`).join(" / ");
}

// targetWeightKg=null (BODYWEIGHT etc.) omits the weight entirely rather than showing "0kg" — reuses the same
// display rule formatRecommendationWeight already applies to the Recommendation Target card.
export function formatRecommendationPlannedSummary(
  evaluation: Pick<RecommendedExerciseEvaluation, "targetWeightKg" | "targetRepsMin" | "targetRepsMax" | "plannedSets">,
): string {
  const weight = formatRecommendationWeight({ targetWeightKg: evaluation.targetWeightKg });
  const repsAndSets = formatRecommendationRepsAndSets({
    targetRepsMin: evaluation.targetRepsMin, targetRepsMax: evaluation.targetRepsMax, targetSets: evaluation.plannedSets,
  });
  return weight !== null ? `${weight} × ${repsAndSets}` : repsAndSets;
}

export type WorkoutRecommendationEvaluationSummary = {
  totalExercises: number;
  achievedCount: number;
  exceededCount: number;
  partialCount: number;
  notPerformedCount: number;
  // ACHIEVED + EXCEEDED — what "3種目中2種目達成" means. Kept as its own explicit field rather than letting
  // callers guess whether "achieved" already includes EXCEEDED.
  metOrExceededCount: number;
};

// `evaluations` is exactly evaluateWorkoutRecommendations(workout)'s values: one entry per WorkoutExercise,
// null for one with no Recommendation Target. Those nulls are not "NOT_PERFORMED" and are excluded from every
// count here, including totalExercises — a normal/Exercise-Library-added Exercise within an otherwise
// Recommendation Workout is simply not part of what this summary evaluates.
export function summarizeWorkoutRecommendationEvaluation(
  evaluations: ReadonlyArray<RecommendedExerciseEvaluation | null>,
): WorkoutRecommendationEvaluationSummary {
  const present = evaluations.filter((evaluation): evaluation is RecommendedExerciseEvaluation => evaluation !== null);
  const countOf = (status: RecommendedExerciseStatus) => present.filter((evaluation) => evaluation.status === status).length;
  const achievedCount = countOf("ACHIEVED");
  const exceededCount = countOf("EXCEEDED");
  return {
    totalExercises: present.length, achievedCount, exceededCount,
    partialCount: countOf("PARTIAL"), notPerformedCount: countOf("NOT_PERFORMED"),
    metOrExceededCount: achievedCount + exceededCount,
  };
}
