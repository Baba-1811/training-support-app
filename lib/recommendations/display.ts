import { categoryImage, categoryLabel, type CategorySlug } from "@/lib/exercises/categories";
import type { RecommendedExercise } from "./types";

// Home display helpers for RecommendationResult (Phase 5C-1). Pure and React-free so they are unit-testable
// without rendering: the Home card (components/home/recommendation-card.tsx) only formats, never computes.

// v1 image rule: `selectedCategories` is already ordered "most-prioritized first" by the engine (see
// engine.ts's `recommendWorkout`, which builds it from the sorted category list). Rather than generating a
// composite image for multiple categories, this shows only the top-priority one's existing asset.
export function primaryRecommendedCategory(selectedCategories: readonly CategorySlug[]): CategorySlug | null {
  return selectedCategories[0] ?? null;
}

export function recommendedCategoryImage(selectedCategories: readonly CategorySlug[]): string {
  const category = primaryRecommendedCategory(selectedCategories);
  return category ? categoryImage(category) : categoryImage("all");
}

// All selected categories, for the text summary (unlike the image, text can list every category without a new asset).
export function joinCategoryLabels(selectedCategories: readonly CategorySlug[]): string {
  return selectedCategories.map((category) => categoryLabel(category)).join("・");
}

// null = no history-based number to propose (BODYWEIGHT exercise, or no previous performance) — omit the row
// entirely rather than showing a placeholder like "— kg".
export function formatTargetWeight(targetWeightKg: number | null): string | null {
  return targetWeightKg === null ? null : `${targetWeightKg}kg`;
}

export function formatTargetRepsAndSets(exercise: Pick<RecommendedExercise, "targetRepsMin" | "targetRepsMax" | "targetSets">): string {
  return `${exercise.targetRepsMin}–${exercise.targetRepsMax}回 × ${exercise.targetSets}セット`;
}

export function formatRestSeconds(restSeconds: number): string {
  return `休憩${restSeconds}秒`;
}
