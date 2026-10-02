import { formatRestSeconds, formatTargetWeight } from "@/lib/recommendations/display";
import type { WorkoutRecommendationTargetDTO } from "./types";

// Display-only formatting for the WorkoutPlanExercise snapshot (Phase 5E-1). Weight and "present" rest-seconds
// formatting are the exact Phase 5C-1 helpers (lib/recommendations/display.ts) — same null convention, same
// "— kg" is never shown, the row is omitted instead. Reps/sets get their own nullable-aware formatting here
// because WorkoutPlanExercise.targetRepsMin/Max/restSeconds are nullable in the schema, unlike the Engine's own
// RecommendedExercise (always non-null there), so Phase 5C-1's combined reps+sets formatter does not fit as-is.

export function formatRecommendationWeight(target: Pick<WorkoutRecommendationTargetDTO, "targetWeightKg">): string | null {
  return formatTargetWeight(target.targetWeightKg);
}

function formatRepsRange(targetRepsMin: number | null, targetRepsMax: number | null): string | null {
  if (targetRepsMin === null && targetRepsMax === null) return null;
  if (targetRepsMin === null) return `${targetRepsMax}`;
  if (targetRepsMax === null) return `${targetRepsMin}`;
  return targetRepsMin === targetRepsMax ? `${targetRepsMin}` : `${targetRepsMin}–${targetRepsMax}`;
}

function formatRecommendationReps(target: Pick<WorkoutRecommendationTargetDTO, "targetRepsMin" | "targetRepsMax">): string | null {
  const range = formatRepsRange(target.targetRepsMin, target.targetRepsMax);
  return range === null ? null : `${range}回`;
}

// Phase 5E-2: placeholder/guide text for an unsaved WORKING Set's reps input (components/workouts/set-row.tsx).
// reps is always actual-performed, never auto-filled (see workout-editor.tsx) — this is only ever shown as a
// placeholder, the same way an empty input shows "回", never set as the input's value.
export function formatRecommendationRepsGuide(target: Pick<WorkoutRecommendationTargetDTO, "targetRepsMin" | "targetRepsMax">): string | null {
  const range = formatRepsRange(target.targetRepsMin, target.targetRepsMax);
  return range === null ? null : `目安 ${range}`;
}

// targetSets is never null (schema: `targetSets Int`, always written by createWorkoutFromRecommendation), so
// this always has a count to show; reps may still be absent (e.g. a future write path that cannot propose one).
export function formatRecommendationRepsAndSets(
  target: Pick<WorkoutRecommendationTargetDTO, "targetRepsMin" | "targetRepsMax" | "targetSets">,
): string {
  const reps = formatRecommendationReps(target);
  const sets = `${target.targetSets}セット`;
  return reps ? `${reps} × ${sets}` : sets;
}

export function formatRecommendationRest(target: Pick<WorkoutRecommendationTargetDTO, "restSeconds">): string | null {
  return target.restSeconds === null ? null : formatRestSeconds(target.restSeconds);
}

// IN_PROGRESS reads naturally as "today's" target; once a Workout is history (COMPLETED), "today" would be
// wrong, so the label switches to refer to that day instead. CANCELLED sessions never reach this (the
// Recommendation Target card is not rendered for them — see components/workouts/recommendation-target-card.tsx).
export function recommendationTargetLabel(completed: boolean): string {
  return completed ? "この日の目安" : "今日の目安";
}
