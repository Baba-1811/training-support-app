export type MealType = "BREAKFAST" | "LUNCH" | "DINNER" | "SNACK";

// Prisma Decimal columns are converted to number at the query boundary (see dto.ts); no Prisma type reaches the UI.
export type NutritionEntryDTO = {
  id: string;
  entryDate: string; // YYYY-MM-DD, the JST calendar date
  mealType: MealType;
  name: string;
  calories: number;
  proteinGrams: number | null;
  fatGrams: number | null;
  carbsGrams: number | null;
};

// Derived from NutritionEntry rows on read; never stored. A macro is null when NO entry recorded it (not
// recorded), and a number (possibly 0) once at least one entry did.
export type NutritionSummaryDTO = {
  calories: number;
  proteinGrams: number | null;
  fatGrams: number | null;
  carbsGrams: number | null;
};

export type NutritionTargetDTO = {
  id: string;
  targetCalories: number;
  targetProtein: number | null;
  targetFat: number | null;
  targetCarbs: number | null;
  effectiveFrom: string; // YYYY-MM-DD
};

export type BodyWeightDTO = {
  id: string;
  measuredAt: string; // ISO instant
  weightKg: number;
};

export type NutritionActionResult =
  | { ok: true; data: { id: string } }
  | { ok: false; code: "VALIDATION" | "NOT_FOUND" | "FAILED"; message: string; fieldErrors?: Record<string, string[]> };

export type NutritionDashboardDTO = {
  date: string; // YYYY-MM-DD, the JST calendar date shown
  entries: NutritionEntryDTO[];
  summary: NutritionSummaryDTO;
  target: NutritionTargetDTO | null;
  weight: BodyWeightDTO | null; // the day's weight (latest measurement of that JST day)
  recentWeights: BodyWeightDTO[]; // oldest -> newest
};
