import { z } from "zod";
import { parseJstDateString } from "@/lib/date/jst";

export const MEAL_TYPES = ["BREAKFAST", "LUNCH", "DINNER", "SNACK"] as const;

// DB: calories Int with CHECK >= 0; the app caps it well below Int range to catch typos (e.g. an extra digit).
export const MAX_CALORIES = 20000;
// DB: Decimal(5,1) holds at most 9999.9.
export const MAX_MACRO_GRAMS = 9999.9;

const NAME_ERROR = "食品・料理名を100文字以内で入力してください。";
const CALORIES_ERROR = `カロリーは0〜${MAX_CALORIES}の整数で入力してください。`;
const MACRO_ERROR = `0〜${MAX_MACRO_GRAMS}gの小数1桁までで入力してください。`;

// The form sends raw field text; "" (and null/undefined) mean "not entered". Strict decimal text only —
// Number("") === 0 and Number("1e3") would otherwise let junk through.
const calories = z.preprocess((value) => {
  if (typeof value === "string") { const text = value.trim(); return /^\d{1,9}$/.test(text) ? Number(text) : Number.NaN; }
  return value;
}, z.number(CALORIES_ERROR).int(CALORIES_ERROR).min(0, CALORIES_ERROR).max(MAX_CALORIES, CALORIES_ERROR));

// "" / null / undefined -> null (NOT 0): a missing macro stays distinguishable from a recorded 0.
const macro = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    return /^\d{1,4}(\.\d)?$/.test(text) ? Number(text) : Number.NaN;
  }
  return value;
}, z.number(MACRO_ERROR).min(0, MACRO_ERROR).max(MAX_MACRO_GRAMS, MACRO_ERROR)
  .refine((v) => Math.abs(v * 10 - Math.round(v * 10)) < 1e-9, MACRO_ERROR).nullable());

const fields = {
  mealType: z.enum(MEAL_TYPES, "食事の種類を選択してください。"),
  name: z.string(NAME_ERROR).trim().min(1, NAME_ERROR).max(100, NAME_ERROR),
  calories,
  proteinGrams: macro,
  fatGrams: macro,
  carbsGrams: macro,
};

// A "YYYY-MM-DD" JST calendar date, converted without new Date(string) (shared by entryDate / effectiveFrom).
const jstDate = z.string("日付が正しくありません。").transform((value, ctx) => {
  const date = parseJstDateString(value);
  if (!date) { ctx.addIssue({ code: "custom", message: "日付が正しくありません。" }); return z.NEVER; }
  return date;
});

// userId is intentionally absent (strictObject rejects it): it always comes from requireUser().
export const createNutritionEntrySchema = z.strictObject({ entryDate: jstDate, ...fields });

// NutritionTarget is INSERT-only history: this input always becomes a NEW row (see mutations.ts). effectiveFrom is
// the JST date being viewed; calories required, P/F/C optional (blank -> null, 0 stays 0).
export const createNutritionTargetSchema = z.strictObject({
  effectiveFrom: jstDate, targetCalories: calories, targetProtein: macro, targetFat: macro, targetCarbs: macro,
});

// entryDate is not editable; to move an entry to another day, delete + add.
export const updateNutritionEntrySchema = z.strictObject({ id: z.uuid("記録が正しくありません。"), ...fields });

export const deleteNutritionEntrySchema = z.strictObject({ id: z.uuid("記録が正しくありません。") });
