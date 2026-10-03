import type { CategorySlug } from "@/lib/exercises/categories";
import type { ConditionRecommendationInputDTO } from "@/lib/conditions/types";
import type { PreviousExercisePerformanceDTO } from "@/lib/workouts/types";
import type { ProgressionDecision } from "./progression";

// Mirrors the Prisma `EquipmentType` enum values as a plain string union, so this pure layer never imports the
// Prisma client. Only the BODYWEIGHT value is actually branched on (target.ts), but the precise union catches
// typos at the call site better than a bare `string` would.
export type EquipmentType = "BARBELL" | "DUMBBELL" | "MACHINE" | "CABLE" | "BODYWEIGHT" | "OTHER";

export type MuscleRole = "PRIMARY" | "SECONDARY";

// One Exercise <-> Muscle relation, as the engine needs it. `muscleIsActive` rides along explicitly (rather than
// the caller pre-filtering inactive muscles out) so the engine can defend itself independently of the query
// layer (Phase 5B), per the "safety must not depend on query layer alone" requirement.
export type ExerciseMuscleLinkDTO = {
  muscleName: string;
  role: MuscleRole;
  muscleIsActive: boolean;
};

// A candidate Exercise the engine may recommend. Deliberately NOT the Prisma model and NOT ExerciseSummaryDTO
// (components/UI DTO): this shape carries the isActive/muscleIsActive flags the engine needs to defend itself,
// which the UI-facing DTOs intentionally omit (their queries already filter those out at the source).
export type ExerciseCandidateDTO = {
  exerciseId: string;
  exerciseName: string;
  equipmentType: EquipmentType;
  isActive: boolean;
  muscles: readonly ExerciseMuscleLinkDTO[];
  // Phase 5F-3B: this Exercise's Recommendation target-weight progression step (Exercise.weightIncrementKg).
  // null = no safe basis to auto-increase it, never "0kg" — same convention as targetWeightKg itself.
  weightIncrementKg: number | null;
};

// Phase 5F-3B: the previous Recommendation Target actually generated for this Exercise, plus the
// ProgressionDecision computed by comparing it to what was actually performed (lib/workouts/
// recommendation-evaluation.ts + lib/recommendations/progression.ts) — a plain data snapshot, not the decision
// logic itself. Absent from RecommendationContext.previousRecommendationByExerciseId (not even undefined) means
// "no valid previous Recommendation for this Exercise" (none exists, or it could not be matched/evaluated);
// target.ts falls back to its existing latest-performance-based target in that case.
export type PreviousRecommendationContext = {
  previousTargetWeightKg: number | null;
  progressionDecision: ProgressionDecision;
};

// Everything the pure engine needs, and nothing it can reach into a database for. `today` is the JST calendar
// date (YYYY-MM-DD, same format as DailyConditionDTO.conditionDate / lib/date/jst.ts) as of when the caller
// built this context — the engine never reads the system clock itself.
export type RecommendationContext = {
  today: string;
  // Reused as-is from lib/conditions/types.ts: Phase 4 already shaped this exactly for Recommendation
  // (individual Muscle names, not UI categories), so it is not redefined here.
  condition: ConditionRecommendationInputDTO;
  exercises: readonly ExerciseCandidateDTO[];
  // Muscle.name -> JST calendar date (YYYY-MM-DD) of the most recent COMPLETED performance of any exercise that
  // trains it as PRIMARY. A muscle absent from this map has no such performance in whatever lookback window
  // Phase 5B's query used (including "never trained") — the engine treats "absent" and "never" identically.
  lastTrainedAtByMuscle: Readonly<Partial<Record<string, string>>>;
  // Exercise.id -> most recent COMPLETED WORKING-set performance of that exact exercise. Reuses the shape of
  // lib/workouts/queries.ts#getPreviousExercisePerformance 1:1 (Record<exerciseId, PreviousExercisePerformanceDTO>)
  // so Phase 5B can pass that existing query's result straight through without remapping.
  previousPerformanceByExerciseId: Readonly<Record<string, PreviousExercisePerformanceDTO>>;
  // Phase 5F-3B: Exercise.id -> previous Recommendation Target + ProgressionDecision, for Exercises whose most
  // recent Recommendation-linked COMPLETED Workout could be matched and evaluated. An Exercise absent here falls
  // back to the existing latest-performance-based target (see target.ts#resolveTargetWeightKg).
  previousRecommendationByExerciseId: Readonly<Record<string, PreviousRecommendationContext>>;
};

export type RecommendedExercise = {
  exerciseId: string;
  exerciseName: string;
  category: CategorySlug;
  // null = no basis to propose a number (no history yet, or a BODYWEIGHT exercise). Never guessed.
  targetWeightKg: number | null;
  targetRepsMin: number;
  targetRepsMax: number;
  targetSets: number;
  restSeconds: number;
  // true when a SECONDARY muscle's soreness penalized this exercise's ranking. reasons.ts uses this to decide
  // whether the "無理のない範囲で" caveat belongs in the recommendation text.
  secondarySorenessNoted: boolean;
};

export type WorkoutRecommendation = {
  kind: "WORKOUT";
  selectedCategories: readonly CategorySlug[];
  exercises: readonly RecommendedExercise[];
  recommendationReason: string;
  reducedLoad: boolean;
};

// No exercises, no targets, no reducedLoad: those fields would be meaningless for a rest day, so RestRecommendation
// simply does not have them (the discriminated union, not a WORKOUT shape with empty/zero placeholders).
export type RestRecommendation = {
  kind: "REST";
  recommendationReason: string;
};

export type RecommendationResult = WorkoutRecommendation | RestRecommendation;
