import { jstDateString, jstMeasurementInstant, parseJstDateString } from "@/lib/date/jst";
import { decimalToNumber, summarizeNutrition, toNutritionEntryDTOs, type NutritionEntryRow } from "./dto";

// Pure aggregation for /nutrition/analytics (no DB, no server-only): raw rows in, UI DTOs out. A day with no record
// is "no data" (null / absent), never 0 kg or 0 kcal.

const DAY_MS = 24 * 60 * 60 * 1000;

type DecimalLike = { toString(): string };

export type BodyMeasurementRow = {
  id: string; measuredAt: Date; createdAt: Date; weightKg: DecimalLike; bodyFatPercent: DecimalLike | null;
};

export type DailyWeightPoint = {
  date: string; // YYYY-MM-DD, the JST day
  t: number; // chart x value: 12:00 JST of that day (same instant a logged-for-that-day measurement uses)
  weightKg: number;
  bodyFatPercent: number | null; // null = not recorded (never 0)
};

export type WeightAnalyticsDTO = {
  days: number; // length of the period in JST days
  points: DailyWeightPoint[]; // one per JST day that has a measurement, oldest -> newest
  measurementDays: number;
  first: DailyWeightPoint | null;
  latest: DailyWeightPoint | null;
  changeKg: number | null; // latest - first; null when fewer than 2 measured days ("nothing to compare")
  latestBodyFat: { date: string; percent: number } | null; // newest day that recorded body fat
};

// Newest first by the same rule as the day's-weight read query: measuredAt, createdAt, id (all DESC).
function compareNewestFirst(a: BodyMeasurementRow, b: BodyMeasurementRow): number {
  return b.measuredAt.getTime() - a.measuredAt.getTime()
    || b.createdAt.getTime() - a.createdAt.getTime()
    || (a.id < b.id ? 1 : a.id > b.id ? -1 : 0);
}

// Raw measurements (any order, several per day) -> one point per JST day: that day's latest measurement.
export function buildWeightAnalytics(rows: readonly BodyMeasurementRow[], days: number): WeightAnalyticsDTO {
  const latestByDay = new Map<string, BodyMeasurementRow>();
  for (const row of [...rows].sort(compareNewestFirst)) {
    const date = jstDateString(row.measuredAt);
    if (!latestByDay.has(date)) latestByDay.set(date, row);
  }
  const points: DailyWeightPoint[] = [...latestByDay.entries()]
    .sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0))
    .map(([date, row]) => ({
      date, t: jstMeasurementInstant(parseJstDateString(date)!).getTime(),
      weightKg: decimalToNumber(row.weightKg), bodyFatPercent: decimalToNumber(row.bodyFatPercent),
    }));
  const first = points[0] ?? null;
  const latest = points[points.length - 1] ?? null;
  const withBodyFat = [...points].reverse().find((p) => p.bodyFatPercent !== null);
  return {
    days, points, measurementDays: points.length, first, latest,
    changeKg: first && latest && points.length >= 2 ? Math.round((latest.weightKg - first.weightKg) * 100) / 100 : null,
    latestBodyFat: withBodyFat ? { date: withBodyFat.date, percent: withBodyFat.bodyFatPercent! } : null,
  };
}

export type DailyCaloriesPoint = {
  date: string; // YYYY-MM-DD
  calories: number | null; // null = nothing logged that day; 0 = entries logged that sum to 0 kcal
  entryCount: number;
};

export type NutritionAnalyticsDTO = {
  days: number;
  daily: DailyCaloriesPoint[]; // every JST day of the period, oldest -> newest
  loggedDays: number;
  averageCalories: number | null; // mean over logged days only; null when none
};

// `endDate` is a JST calendar date anchored at UTC midnight; the period is the `days` JST dates ending on it.
export function buildNutritionAnalytics(rows: readonly NutritionEntryRow[], endDate: Date, days: number): NutritionAnalyticsDTO {
  const byDay = new Map<string, NutritionEntryRow[]>();
  for (const row of rows) {
    const key = row.entryDate.toISOString().slice(0, 10);
    byDay.set(key, [...(byDay.get(key) ?? []), row]);
  }
  const daily: DailyCaloriesPoint[] = [];
  for (let i = days - 1; i >= 0; i--) {
    const date = new Date(endDate.getTime() - i * DAY_MS).toISOString().slice(0, 10);
    const dayRows = byDay.get(date);
    // Same summing as the daily summary on /nutrition.
    daily.push(dayRows
      ? { date, calories: summarizeNutrition(toNutritionEntryDTOs(dayRows)).calories, entryCount: dayRows.length }
      : { date, calories: null, entryCount: 0 });
  }
  const logged = daily.filter((d) => d.calories !== null);
  return {
    days, daily, loggedDays: logged.length,
    averageCalories: logged.length ? Math.round(logged.reduce((s, d) => s + d.calories!, 0) / logged.length) : null,
  };
}
