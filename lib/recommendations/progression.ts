import type { RecommendedExerciseEvaluation, RecommendedExerciseStatus } from "@/lib/workouts/recommendation-evaluation";

// Phase 5F-3A: pure "previous Recommendation Evaluation -> next-time adjustment direction" policy. No Prisma,
// no requireUser, no React, no wall-clock reads. Direction only: this module never computes a next
// targetWeightKg (that is Phase 5F-3B), never adjusts for EquipmentType, and is not wired into
// lib/recommendations/engine.ts yet — it only imports the Phase 5F-1 evaluation's *type*, never its functions,
// so it cannot alter that evaluation's own semantics. Condition (sleep/fatigue/soreness/availableMinutes) is
// deliberately not an input here either: how Progression and Condition combine is a later Phase's design, and
// mixing them in now would make this policy's own rule harder to reason about and test in isolation.

export type ProgressionDecision = "INCREASE" | "MAINTAIN" | "DECREASE" | "INSUFFICIENT_DATA";

export type ProgressionReason = "PREVIOUS_EXCEEDED" | "PREVIOUS_ACHIEVED" | "PREVIOUS_PARTIAL" | "NO_PERFORMANCE_DATA";

export type ProgressionPolicyResult = { decision: ProgressionDecision; reason: ProgressionReason };

// v1 is deliberately conservative:
// - EXCEEDED is the only status that increases (the Phase 5F-1 definition already requires clearing, not just
//   tying, the required sets' weight/reps — see recommendation-evaluation.ts).
// - ACHIEVED merely means the recommended range was met, not that the load was clearly too light, so it holds
//   rather than increases (future double-progression / consecutive-ACHIEVED rules may change this, not v1).
// - PARTIAL and NOT_PERFORMED can both come from a one-off bad day (sleep, fatigue, soreness, time) rather than
//   the load being wrong, so neither decreases from a single Workout's result. DECREASE stays in
//   ProgressionDecision for a future Phase that looks at multi-Workout history; this table deliberately never
//   produces it.
const POLICY_BY_STATUS: Readonly<Record<RecommendedExerciseStatus, ProgressionPolicyResult>> = {
  EXCEEDED: { decision: "INCREASE", reason: "PREVIOUS_EXCEEDED" },
  ACHIEVED: { decision: "MAINTAIN", reason: "PREVIOUS_ACHIEVED" },
  PARTIAL: { decision: "MAINTAIN", reason: "PREVIOUS_PARTIAL" },
  NOT_PERFORMED: { decision: "INSUFFICIENT_DATA", reason: "NO_PERFORMANCE_DATA" },
};

export function decideProgression(evaluation: RecommendedExerciseEvaluation): ProgressionPolicyResult {
  return POLICY_BY_STATUS[evaluation.status];
}

// Convenience over evaluateWorkoutRecommendations' own output shape (Record<WorkoutExercise id, evaluation |
// null>). An Exercise with no Recommendation Target (evaluation === null) is outside this policy's scope
// entirely — not the same as NOT_PERFORMED/INSUFFICIENT_DATA — so it stays null rather than being coerced into
// a decision.
export function decideWorkoutProgression(
  evaluations: Readonly<Record<string, RecommendedExerciseEvaluation | null>>,
): Record<string, ProgressionPolicyResult | null> {
  return Object.fromEntries(
    Object.entries(evaluations).map(([id, evaluation]) => [id, evaluation === null ? null : decideProgression(evaluation)]),
  );
}
