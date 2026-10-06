import type { BodyWeightDTO, MealType, NutritionEntryDTO, NutritionSummaryDTO, NutritionTargetDTO } from "./types";

type DecimalLike = { toString(): string };

// Prisma Decimal (or null) -> number. Decimal(5,1)/(5,2) columns are well within double precision.
export function decimalToNumber(value: DecimalLike): number;
export function decimalToNumber(value: DecimalLike | null): number | null;
export function decimalToNumber(value: DecimalLike | null): number | null {
  return value === null ? null : Number(value.toString());
}

const dateString = (date: Date) => date.toISOString().slice(0, 10);

// Explicit order — not the DB enum's declaration order.
export const MEAL_ORDER: readonly MealType[] = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"];

export type NutritionEntryRow = {
  id: string; entryDate: Date; mealType: MealType; name: string; calories: number;
  proteinGrams: DecimalLike | null; fatGrams: DecimalLike | null; carbsGrams: DecimalLike | null;
  createdAt: Date;
};

// Meal order, then createdAt ASC, then id (stable tie-break) — fully deterministic.
export function toNutritionEntryDTOs(rows: readonly NutritionEntryRow[]): NutritionEntryDTO[] {
  return [...rows]
    .sort((a, b) =>
      MEAL_ORDER.indexOf(a.mealType) - MEAL_ORDER.indexOf(b.mealType)
      || a.createdAt.getTime() - b.createdAt.getTime()
      || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    .map((row) => ({
      id: row.id, entryDate: dateString(row.entryDate), mealType: row.mealType, name: row.name, calories: row.calories,
      proteinGrams: decimalToNumber(row.proteinGrams), fatGrams: decimalToNumber(row.fatGrams),
      carbsGrams: decimalToNumber(row.carbsGrams),
    }));
}

// Sums in integer tenths so 0.1 + 0.2 style float drift never shows. null = no entry recorded this macro.
function sumMacro(values: readonly (number | null)[]): number | null {
  let tenths = 0;
  let any = false;
  for (const value of values) {
    if (value === null) continue;
    tenths += Math.round(value * 10);
    any = true;
  }
  return any ? tenths / 10 : null;
}

export function summarizeNutrition(entries: readonly NutritionEntryDTO[]): NutritionSummaryDTO {
  return {
    calories: entries.reduce((sum, entry) => sum + entry.calories, 0),
    proteinGrams: sumMacro(entries.map((entry) => entry.proteinGrams)),
    fatGrams: sumMacro(entries.map((entry) => entry.fatGrams)),
    carbsGrams: sumMacro(entries.map((entry) => entry.carbsGrams)),
  };
}

export function toNutritionTargetDTO(row: {
  id: string; targetCalories: number; targetProtein: DecimalLike | null; targetFat: DecimalLike | null;
  targetCarbs: DecimalLike | null; effectiveFrom: Date;
}): NutritionTargetDTO {
  return {
    id: row.id, targetCalories: row.targetCalories, targetProtein: decimalToNumber(row.targetProtein),
    targetFat: decimalToNumber(row.targetFat), targetCarbs: decimalToNumber(row.targetCarbs),
    effectiveFrom: dateString(row.effectiveFrom),
  };
}

export function toBodyWeightDTO(row: { id: string; measuredAt: Date; weightKg: DecimalLike }): BodyWeightDTO {
  return { id: row.id, measuredAt: row.measuredAt.toISOString(), weightKg: decimalToNumber(row.weightKg) };
}
