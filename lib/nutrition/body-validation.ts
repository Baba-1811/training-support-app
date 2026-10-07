import { z } from "zod";
import { jstDate } from "./validation";

// DB: weightKg Decimal(5,2) -> at most 999.99; bodyFatPercent Decimal(5,2) nullable. The app range is the DB range
// for weight (no arbitrary "realistic" cap) and the meaningful 0-100 for body fat.
export const MAX_WEIGHT_KG = 999.99;
export const MAX_BODY_FAT_PERCENT = 100;

const WEIGHT_ERROR = `体重は0より大きく${MAX_WEIGHT_KG}kg以下の小数2桁までで入力してください。`;
const BODY_FAT_ERROR = `体脂肪率は0〜${MAX_BODY_FAT_PERCENT}%の小数2桁までで入力してください。`;

// Strict decimal text only (no exponent / sign / NaN / Infinity); Number("") === 0 would otherwise let blanks through.
const DECIMAL_TEXT = /^\d{1,3}(\.\d{1,2})?$/;

const weightKg = z.preprocess((value) => {
  if (typeof value === "string") { const text = value.trim(); return DECIMAL_TEXT.test(text) ? Number(text) : Number.NaN; }
  return value;
}, z.number(WEIGHT_ERROR).gt(0, WEIGHT_ERROR).max(MAX_WEIGHT_KG, WEIGHT_ERROR));

// "" / null / undefined -> null (NOT 0): an unentered body fat stays distinguishable from a recorded 0.
const bodyFatPercent = z.preprocess((value) => {
  if (value === undefined || value === null) return null;
  if (typeof value === "string") {
    const text = value.trim();
    if (text === "") return null;
    return DECIMAL_TEXT.test(text) ? Number(text) : Number.NaN;
  }
  return value;
}, z.number(BODY_FAT_ERROR).min(0, BODY_FAT_ERROR).max(MAX_BODY_FAT_PERCENT, BODY_FAT_ERROR).nullable());

// BodyMeasurement is INSERT-only raw history: this input always becomes a NEW row. `date` is the JST date being
// viewed; the stored measuredAt is derived from it (see createBodyMeasurementForUser). userId is rejected (strict).
export const createBodyMeasurementSchema = z.strictObject({ date: jstDate, weightKg, bodyFatPercent });
