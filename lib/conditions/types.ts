import type { CategorySlug } from "@/lib/exercises/categories";

// Client input for the save action: allowlisted category keys, never raw Muscle IDs (see validation.ts).
export type SorenessCategoryInput = { category: CategorySlug; sorenessLevel: number };
export type SaveDailyConditionInput = {
  sleepHours: number; fatigueLevel: number; availableMinutes: number; soreness: SorenessCategoryInput[];
};

// Today's condition as the UI needs it. sleepHours is a Decimal-as-string (same convention as
// WorkoutSet.weightKg elsewhere); fatigue/availableMinutes stay nullable to match the DB, even though this
// app's own saveDailyCondition always writes all three together.
export type DailyConditionDTO = {
  id: string;
  conditionDate: string; // YYYY-MM-DD, the JST calendar date
  sleepHours: string | null;
  fatigueLevel: number | null;
  availableMinutes: number | null;
  sorenessByCategory: Partial<Record<CategorySlug, number>>;
};

export type ActionResult<T> = { ok: true; data: T } | {
  ok: false; code: "VALIDATION" | "MUSCLE_UNAVAILABLE" | "FAILED";
  message: string; fieldErrors?: Record<string, string[]>;
};

// Phase 5 Recommendation input. Kept separate from DailyConditionDTO: Recommendation needs individual Muscle
// names (to compare against Exercise.PRIMARY muscles), not the UI's category grouping. Not consumed yet.
export type ConditionRecommendationInputDTO = {
  conditionDate: string;
  sleepHours: string | null;
  fatigueLevel: number | null;
  availableMinutes: number | null;
  sorenessByMuscle: Record<string, number>; // Muscle.name -> sorenessLevel (1-5)
};
