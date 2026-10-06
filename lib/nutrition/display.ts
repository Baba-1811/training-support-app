import type { MealType, NutritionEntryDTO } from "./types";

export const MEAL_LABELS: Readonly<Record<MealType, string>> = {
  BREAKFAST: "朝食", LUNCH: "昼食", DINNER: "夕食", SNACK: "間食",
};
export const MEAL_SECTIONS: readonly MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

// null (not recorded) is "—", never "0g"; a recorded 0 is "0g".
export function formatGrams(value: number | null): string {
  return value === null ? "—" : `${Number.isInteger(value) ? value : value.toFixed(1)}g`;
}

export function formatKcal(value: number): string {
  return `${value.toLocaleString("en-US")} kcal`;
}

// "P 35g / F 5g / C —" for an entry row.
export function formatMacros(entry: Pick<NutritionEntryDTO, "proteinGrams" | "fatGrams" | "carbsGrams">): string {
  return `P ${formatGrams(entry.proteinGrams)} / F ${formatGrams(entry.fatGrams)} / C ${formatGrams(entry.carbsGrams)}`;
}

export function groupEntriesByMeal(entries: readonly NutritionEntryDTO[]): Record<MealType, NutritionEntryDTO[]> {
  const grouped: Record<MealType, NutritionEntryDTO[]> = { BREAKFAST: [], LUNCH: [], DINNER: [], SNACK: [] };
  for (const entry of entries) grouped[entry.mealType].push(entry);
  return grouped;
}

// Progress toward a target. null when there is nothing meaningful to show: no target, a target of 0, or no value
// recorded. ratio is capped at 1 for the bar width; `over` marks exceeding the target (the number is still shown).
export function progress(current: number | null, target: number | null): { ratio: number; over: boolean } | null {
  if (current === null || target === null || !(target > 0)) return null;
  return { ratio: Math.min(1, Math.max(0, current / target)), over: current > target };
}
