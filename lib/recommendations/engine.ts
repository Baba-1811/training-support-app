import { SORENESS_CATEGORIES, exerciseCategories, muscleCategory, type CategorySlug } from "@/lib/exercises/categories";
import {
  categoryScore, daysSince, toJstDateOnly, recencyBucket, isPrimarySorenessExcluded, secondarySorenessPenalty,
  isReducedLoad, resolveMaxExercises, type RecencyBucket,
} from "./rules";
import { resolveWeightTarget, resolveTargetReps, resolveTargetSets, resolveRestSeconds } from "./target";
import { buildWorkoutReason, buildRestReason } from "./reasons";
import type {
  RecommendationContext, RecommendationResult, RecommendedExercise, ExerciseCandidateDTO, EquipmentType,
} from "./types";

// ============================================================
// Internal exercise view
// ============================================================
// The engine only ever reasons about active Exercises whose active PRIMARY muscles map to a known category.
// Built once per recommendWorkout() call so downstream steps never re-check isActive/muscleIsActive themselves.
type UsableExercise = {
  exerciseId: string;
  exerciseName: string;
  equipmentType: EquipmentType;
  weightIncrementKg: number | null;
  primaryMuscles: readonly string[];
  secondaryMuscles: readonly string[];
  categories: readonly CategorySlug[];
};

function toUsableExercise(exercise: ExerciseCandidateDTO): UsableExercise | null {
  if (!exercise.isActive) return null; // inactive Exercise: never a candidate, regardless of the query layer.
  const primaryMuscles = exercise.muscles
    .filter((link) => link.role === "PRIMARY" && link.muscleIsActive)
    .map((link) => link.muscleName);
  const secondaryMuscles = exercise.muscles
    .filter((link) => link.role === "SECONDARY" && link.muscleIsActive)
    .map((link) => link.muscleName);
  const categories = exerciseCategories(primaryMuscles);
  // An Exercise whose only PRIMARY muscles are inactive (or unmapped) belongs to no category, so it can never
  // be recommended — this is the "inactive PRIMARY muscle" defense independent of the query layer.
  if (categories.length === 0) return null;
  return {
    exerciseId: exercise.exerciseId, exerciseName: exercise.exerciseName, equipmentType: exercise.equipmentType,
    weightIncrementKg: exercise.weightIncrementKg, primaryMuscles, secondaryMuscles, categories,
  };
}

function buildUsableExercises(exercises: readonly ExerciseCandidateDTO[]): UsableExercise[] {
  const usable: UsableExercise[] = [];
  for (const exercise of exercises) {
    const built = toUsableExercise(exercise);
    if (built) usable.push(built);
  }
  return usable;
}

function sorenessOf(sorenessByMuscle: Readonly<Record<string, number>>, muscleName: string): number | undefined {
  return sorenessByMuscle[muscleName];
}

function primaryMusclesInCategory(exercise: UsableExercise, category: CategorySlug): string[] {
  return exercise.primaryMuscles.filter((muscle) => muscleCategory(muscle) === category);
}

// The most cautious (= most recent) reading among a category's actually-trainable muscles, mirroring
// lib/conditions/dto.ts's "MAX soreness wins" caution: if any relevant muscle was trained recently, the whole
// category is treated as recently trained rather than averaging it away. null = none of them have ever been
// trained (or fell outside Phase 5B's lookback window) — both read as "never" here, deliberately.
function categoryRecencyDays(muscles: readonly string[], context: RecommendationContext): number | null {
  let min: number | null = null;
  for (const muscle of muscles) {
    const lastTrainedAt = context.lastTrainedAtByMuscle[muscle];
    if (lastTrainedAt === undefined) continue;
    const days = daysSince(context.today, lastTrainedAt);
    if (min === null || days < min) min = days;
  }
  return min;
}

function worstSorenessAmong(muscles: readonly string[], sorenessByMuscle: Readonly<Record<string, number>>): number | undefined {
  let worst: number | undefined;
  for (const muscle of muscles) {
    const level = sorenessOf(sorenessByMuscle, muscle);
    if (level === undefined) continue;
    if (worst === undefined || level > worst) worst = level;
  }
  return worst;
}

// ============================================================
// Category evaluation (section 28: kept explicit and inspectable for tests/debugging)
// ============================================================
type InternalCategoryEvaluation = {
  category: CategorySlug;
  eligible: boolean;
  score: number;
  recencyBucketValue: RecencyBucket;
  // true only when this category HAD at least one candidate Exercise and every one of them was hard-excluded
  // by PRIMARY soreness — never true for a category with no Exercise inventory at all, so the reason text never
  // blames "筋肉痛" for what is actually a data/inventory gap.
  excludedByPrimarySoreness: boolean;
  candidates: readonly UsableExercise[];
};

function buildCategoryEvaluations(
  context: RecommendationContext, usableExercises: readonly UsableExercise[],
): InternalCategoryEvaluation[] {
  const sorenessByMuscle = context.condition.sorenessByMuscle;
  return SORENESS_CATEGORIES.map((category) => {
    const inCategory = usableExercises.filter((exercise) => exercise.categories.includes(category));
    const candidates = inCategory.filter(
      (exercise) => !exercise.primaryMuscles.some((muscle) => isPrimarySorenessExcluded(sorenessOf(sorenessByMuscle, muscle))),
    );
    const relevantMuscles = [...new Set(candidates.flatMap((exercise) => primaryMusclesInCategory(exercise, category)))];
    const recencyDays = categoryRecencyDays(relevantMuscles, context);
    const worstPrimarySorenessLevel = worstSorenessAmong(relevantMuscles, sorenessByMuscle);
    return {
      category,
      eligible: candidates.length > 0,
      score: categoryScore(worstPrimarySorenessLevel, recencyDays),
      recencyBucketValue: recencyBucket(recencyDays),
      excludedByPrimarySoreness: inCategory.length > 0 && candidates.length === 0,
      candidates,
    };
  });
}

// Public, debug-friendly view of category evaluation (section 28): enough to answer "why was chest ranked above
// back" in a test, without exposing internal UsableExercise objects or bloating RecommendationResult itself.
export type CategoryEvaluation = {
  category: CategorySlug;
  eligible: boolean;
  score: number;
  recencyBucket: RecencyBucket;
  candidateExerciseIds: readonly string[];
};

export function evaluateCategories(context: RecommendationContext): CategoryEvaluation[] {
  const usableExercises = buildUsableExercises(context.exercises);
  return buildCategoryEvaluations(context, usableExercises).map((evaluation) => ({
    category: evaluation.category,
    eligible: evaluation.eligible,
    score: evaluation.score,
    recencyBucket: evaluation.recencyBucketValue,
    candidateExerciseIds: evaluation.candidates.map((exercise) => exercise.exerciseId),
  }));
}

// ============================================================
// Exercise ranking within a category (section 23)
// ============================================================
type RankedExercise = { exercise: UsableExercise; secondaryScore: number; lastPerformedDays: number | null };

// "Older (or never performed) first": null sorts before every finite value, larger day counts sort before
// smaller ones. Written as explicit branches rather than subtracting two possibly-Infinity sentinels, which
// would produce NaN (Infinity - Infinity) and silently break the sort.
function compareOlderFirst(a: number | null, b: number | null): number {
  if (a === null && b === null) return 0;
  if (a === null) return -1;
  if (b === null) return 1;
  return b - a;
}

function rankExercises(candidates: readonly UsableExercise[], context: RecommendationContext): RankedExercise[] {
  const sorenessByMuscle = context.condition.sorenessByMuscle;
  const ranked = candidates.map((exercise) => {
    const secondaryScore = exercise.secondaryMuscles.reduce(
      (sum, muscle) => sum + secondarySorenessPenalty(sorenessOf(sorenessByMuscle, muscle)), 0,
    );
    const previous = context.previousPerformanceByExerciseId[exercise.exerciseId];
    const lastPerformedDays = previous ? daysSince(context.today, toJstDateOnly(previous.startedAt)) : null;
    return { exercise, secondaryScore, lastPerformedDays };
  });
  return ranked.sort((a, b) =>
    (b.secondaryScore - a.secondaryScore) || // least SECONDARY-soreness penalty first
    compareOlderFirst(a.lastPerformedDays, b.lastPerformedDays) || // longest-idle (or never performed) first
    a.exercise.exerciseName.localeCompare(b.exercise.exerciseName), // final tie-break: Exercise.name, not seed order
  );
}

// ============================================================
// Exercise selection across categories (sections 9, 24)
// ============================================================
type Selection = { category: CategorySlug; exercise: UsableExercise; secondarySorenessNoted: boolean };

function selectExercises(
  sortedCategories: readonly InternalCategoryEvaluation[], maxExercises: number, context: RecommendationContext,
): Selection[] {
  const usedExerciseIds = new Set<string>();
  const rankedByCategory = new Map(sortedCategories.map((c) => [c.category, rankExercises(c.candidates, context)]));
  const selections: Selection[] = [];

  const pickFrom = (category: CategorySlug): boolean => {
    const ranked = rankedByCategory.get(category);
    const pick = ranked?.find((candidate) => !usedExerciseIds.has(candidate.exercise.exerciseId));
    if (!pick) return false;
    usedExerciseIds.add(pick.exercise.exerciseId);
    selections.push({ category, exercise: pick.exercise, secondarySorenessNoted: pick.secondaryScore < 0 });
    return true;
  };

  // Base pass: one Exercise per category, covering as many distinct categories as the budget and eligible
  // categories allow (never more categories than are actually eligible).
  const baseCategoryCount = Math.min(maxExercises, sortedCategories.length);
  for (let i = 0; i < baseCategoryCount; i++) pickFrom(sortedCategories[i].category);

  // Leftover budget only exists when there were fewer eligible categories than the budget allowed (e.g. only
  // legs is eligible but the budget is 4): fill it with additional Exercises from categories that still have
  // unused candidates, walking the same priority order. Stops as soon as a full pass adds nothing — the budget
  // is a ceiling, never a quota to force-fill with duplicates or ineligible Exercises.
  let leftover = maxExercises - selections.length;
  while (leftover > 0) {
    let addedThisRound = false;
    for (const { category } of sortedCategories) {
      if (leftover <= 0) break;
      if (pickFrom(category)) { leftover -= 1; addedThisRound = true; }
    }
    if (!addedThisRound) break;
  }

  return selections;
}

function buildRecommendedExercise(
  selection: Selection, reducedLoad: boolean, context: RecommendationContext,
): RecommendedExercise {
  const previous = context.previousPerformanceByExerciseId[selection.exercise.exerciseId] ?? null;
  const previousRecommendation = context.previousRecommendationByExerciseId[selection.exercise.exerciseId];
  const { targetRepsMin, targetRepsMax } = resolveTargetReps(previous);
  const { targetWeightKg, explanation: weightTargetExplanation } = resolveWeightTarget(
    selection.exercise.equipmentType, previous,
    previousRecommendation && { ...previousRecommendation, weightIncrementKg: selection.exercise.weightIncrementKg },
  );
  return {
    exerciseId: selection.exercise.exerciseId,
    exerciseName: selection.exercise.exerciseName,
    category: selection.category,
    targetWeightKg,
    weightTargetExplanation,
    targetRepsMin,
    targetRepsMax,
    targetSets: resolveTargetSets(reducedLoad),
    restSeconds: resolveRestSeconds(context.condition.availableMinutes),
    secondarySorenessNoted: selection.secondarySorenessNoted,
  };
}

// ============================================================
// Entry point
// ============================================================
// recommendWorkout(context) -> RecommendationResult, and nothing else: no Prisma, no requireUser(), no
// Date.now(), no Math.random(). The same context always produces the same result.
export function recommendWorkout(context: RecommendationContext): RecommendationResult {
  const usableExercises = buildUsableExercises(context.exercises);
  const evaluations = buildCategoryEvaluations(context, usableExercises);
  const eligible = evaluations.filter((evaluation) => evaluation.eligible);

  if (eligible.length === 0) {
    return { kind: "REST", recommendationReason: buildRestReason() };
  }

  const categoryIndex = new Map(SORENESS_CATEGORIES.map((category, index) => [category, index]));
  const sorted = [...eligible].sort((a, b) =>
    (b.score - a.score) || (categoryIndex.get(a.category)! - categoryIndex.get(b.category)!),
  );

  const reducedLoad = isReducedLoad(context.condition);
  const maxExercises = resolveMaxExercises(context.condition.availableMinutes, reducedLoad);
  const selections = selectExercises(sorted, maxExercises, context);
  const exercises = selections.map((selection) => buildRecommendedExercise(selection, reducedLoad, context));

  const selectedCategorySet = new Set(exercises.map((exercise) => exercise.category));
  // Priority order (from `sorted`), not exercise-array order, so the reason text and selectedCategories read
  // "most-prioritized first" even when a category contributed more than one Exercise.
  const selectedCategories = sorted.filter((c) => selectedCategorySet.has(c.category)).map((c) => c.category);
  const prioritizedCategories = sorted
    .filter((c) => selectedCategorySet.has(c.category) && (c.recencyBucketValue === "7+" || c.recencyBucketValue === "never"))
    .map((c) => c.category);
  const excludedCategories = evaluations.filter((c) => c.excludedByPrimarySoreness).map((c) => c.category);
  // Cold start = nothing in the lookback window has ever been trained, for any muscle — not just for the
  // categories that happened to be selected.
  const coldStart = Object.keys(context.lastTrainedAtByMuscle).length === 0;
  const hasSecondarySorenessNote = exercises.some((exercise) => exercise.secondarySorenessNoted);

  const recommendationReason = buildWorkoutReason({
    coldStart, reducedLoad, excludedCategories, prioritizedCategories, hasSecondarySorenessNote,
  });

  return { kind: "WORKOUT", selectedCategories, exercises, recommendationReason, reducedLoad };
}
