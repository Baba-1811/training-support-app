import { categoryImage, categoryLabel, type CategorySlug } from "@/lib/exercises/categories";
import type { RecommendedExercise, WeightTargetExplanation } from "./types";

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

// Phase 5F-3C: turns the machine-readable WeightTargetExplanation (target.ts#resolveWeightTarget) into a short
// supporting line for Home — never recomputes PROGRESSED/MAINTAINED/etc. itself, only formats what was already
// decided. null means "say nothing" (NO_WEIGHT_TARGET, or a formatting precondition that cannot actually fail
// given how resolveWeightTarget builds this value) rather than an empty/placeholder string, so the caller can
// simply skip rendering the line.
export function formatWeightTargetExplanation(
  explanation: WeightTargetExplanation, targetWeightKg: number | null,
): string | null {
  switch (explanation.reason) {
    case "PROGRESSED": {
      const previous = formatTargetWeight(explanation.previousTargetWeightKg);
      const next = formatTargetWeight(targetWeightKg);
      return previous !== null && next !== null ? `前回の目安を上回ったため、${previous} → ${next}` : null;
    }
    case "MAINTAINED": {
      const previous = formatTargetWeight(explanation.previousTargetWeightKg);
      if (previous === null) return null;
      if (explanation.previousEvaluationStatus === "ACHIEVED") return `前回の目安を達成。今回は${previous}を継続`;
      if (explanation.previousEvaluationStatus === "PARTIAL") return `今回は前回と同じ${previous}を目安に設定`;
      // NOT_PERFORMED, or DECREASE's v1-unreachable-but-still-safe case: hold without over-explaining why.
      return `前回の目安${previous}を継続`;
    }
    case "LATEST_PERFORMANCE": {
      const weight = formatTargetWeight(targetWeightKg);
      return weight !== null ? `前回の実績をもとに${weight}を設定` : null;
    }
    case "NO_HISTORY":
      return "重量はトレーニング実績から調整されます";
    case "NO_WEIGHT_TARGET":
      // BODYWEIGHT etc.: weight recommendation does not apply here at all, so there is nothing to explain —
      // never "データ不足" (that would misstate NO_WEIGHT_TARGET as NO_HISTORY).
      return null;
  }
}
