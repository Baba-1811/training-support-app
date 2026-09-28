import { muscleCategory, type CategorySlug } from "@/lib/exercises/categories";
import type { ConditionRecommendationInputDTO } from "./types";

export type MuscleSorenessRow = { muscleName: string; sorenessLevel: number };

// Restore the UI's 6 categories from individual Muscle rows. saveDailyCondition always writes every Muscle in
// a category with the same sorenessLevel, so a normal read has one consistent value per category. If rows
// ever disagree (e.g. data touched outside this app), the MAX level wins: understating soreness is the unsafe
// direction for a future Recommendation (it could send an overtrained muscle back into a workout), so this
// never averages or guesses — it just picks the more cautious reading.
export function restoreSorenessByCategory(rows: readonly MuscleSorenessRow[]): Partial<Record<CategorySlug, number>> {
  const result: Partial<Record<CategorySlug, number>> = {};
  for (const row of rows) {
    const slug = muscleCategory(row.muscleName);
    if (!slug) continue; // a Muscle the category map doesn't know: ignored, never breaks the screen
    result[slug] = Math.max(result[slug] ?? 0, row.sorenessLevel);
  }
  return result;
}

// Phase 5 Recommendation input: individual Muscle names (not UI categories), so it can be compared directly
// against Exercise.PRIMARY muscles. Not consumed yet.
export function toRecommendationInput(condition: {
  conditionDate: string; sleepHours: string | null; fatigueLevel: number | null; availableMinutes: number | null;
  muscleConditions: readonly MuscleSorenessRow[];
}): ConditionRecommendationInputDTO {
  return {
    conditionDate: condition.conditionDate, sleepHours: condition.sleepHours, fatigueLevel: condition.fatigueLevel,
    availableMinutes: condition.availableMinutes,
    sorenessByMuscle: Object.fromEntries(condition.muscleConditions.map((row) => [row.muscleName, row.sorenessLevel])),
  };
}
