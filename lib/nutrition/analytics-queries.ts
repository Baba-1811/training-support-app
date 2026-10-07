import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { jstDateOnly, jstDayRange } from "@/lib/date/jst";
import { buildNutritionAnalytics, buildWeightAnalytics, type NutritionAnalyticsDTO, type WeightAnalyticsDTO } from "./analytics";

// Same conventions as queries.ts: `date` is a JST calendar date anchored at UTC midnight, every query is scoped by
// userId, and *ForUser never calls requireUser(). Each period is read with ONE query (no per-day queries) and
// aggregated in app code (analytics.ts).

const DAY_MS = 24 * 60 * 60 * 1000;
export const WEIGHT_ANALYTICS_DAYS = 30;
export const NUTRITION_ANALYTICS_DAYS = 7;

export async function getWeightAnalyticsForUser(userId: string, date: Date, days = WEIGHT_ANALYTICS_DAYS): Promise<WeightAnalyticsDTO> {
  const from = jstDayRange(new Date(date.getTime() - (days - 1) * DAY_MS)).start;
  const { end } = jstDayRange(date);
  const rows = await prisma.bodyMeasurement.findMany({
    where: { userId, measuredAt: { gte: from, lt: end } },
    select: { id: true, measuredAt: true, createdAt: true, weightKg: true, bodyFatPercent: true },
  });
  return buildWeightAnalytics(rows, days);
}

export async function getNutritionAnalyticsForUser(userId: string, date: Date, days = NUTRITION_ANALYTICS_DAYS): Promise<NutritionAnalyticsDTO> {
  const rows = await prisma.nutritionEntry.findMany({
    where: { userId, entryDate: { gte: new Date(date.getTime() - (days - 1) * DAY_MS), lte: date } },
  });
  return buildNutritionAnalytics(rows, date, days);
}

// Authenticates once, then runs the two independent reads with that userId.
export async function getNutritionAnalytics(date: Date = jstDateOnly()) {
  const user = await requireUser();
  const [weight, nutrition] = await Promise.all([
    getWeightAnalyticsForUser(user.id, date),
    getNutritionAnalyticsForUser(user.id, date),
  ]);
  return { date: date.toISOString().slice(0, 10), weight, nutrition };
}
