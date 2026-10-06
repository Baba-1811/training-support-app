import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { jstDateOnly, jstDayRange } from "@/lib/date/jst";
import { summarizeNutrition, toBodyWeightDTO, toNutritionEntryDTOs, toNutritionTargetDTO } from "./dto";
import type { BodyWeightDTO, NutritionDashboardDTO, NutritionEntryDTO, NutritionTargetDTO } from "./types";

// Every date argument here is a JST calendar date anchored at UTC midnight (what jstDateOnly() returns), the
// same convention as the other *ForUser queries. Every query is scoped by userId; the *ForUser variants never
// call requireUser() — userId must come from a single requireUser() result, never from client input.

const DAY_MS = 24 * 60 * 60 * 1000;
export const RECENT_WEIGHT_DAYS = 30;
export const RECENT_WEIGHT_LIMIT = 100;

// The day's entries (NutritionEntry.entryDate is a DATE, so it matches the anchored date exactly).
export async function getNutritionEntriesForUser(userId: string, date: Date): Promise<NutritionEntryDTO[]> {
  const rows = await prisma.nutritionEntry.findMany({
    where: { userId, entryDate: date },
    orderBy: [{ createdAt: "asc" }, { id: "asc" }], // meal ordering is applied in toNutritionEntryDTOs
  });
  return toNutritionEntryDTOs(rows);
}

// NutritionTarget is INSERT-only history: the current target is the latest effectiveFrom <= date (ties: the
// most recently created). Future targets never apply before their effectiveFrom. null = no target set.
export async function getCurrentNutritionTargetForUser(userId: string, date: Date): Promise<NutritionTargetDTO | null> {
  const row = await prisma.nutritionTarget.findFirst({
    where: { userId, effectiveFrom: { lte: date } },
    orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
  });
  return row ? toNutritionTargetDTO(row) : null;
}

// The day's weight: BodyMeasurement.measuredAt is a timestamptz, so "that day" is the JST day's instant range.
// Several measurements in a day -> the latest measuredAt wins (createdAt, id as deterministic tie-breaks).
export async function getBodyWeightForDateForUser(userId: string, date: Date): Promise<BodyWeightDTO | null> {
  const { start, end } = jstDayRange(date);
  const row = await prisma.bodyMeasurement.findFirst({
    where: { userId, measuredAt: { gte: start, lt: end } },
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
  });
  return row ? toBodyWeightDTO(row) : null;
}

// Weight trend ending at the end of `date`'s JST day: the last `days` JST days (inclusive), newest `limit`
// measurements, returned oldest -> newest (chart-ready). Every measurement is returned, not one per day.
export async function getRecentBodyWeightsForUser(
  userId: string, date: Date, options: { days?: number; limit?: number } = {},
): Promise<BodyWeightDTO[]> {
  const { days = RECENT_WEIGHT_DAYS, limit = RECENT_WEIGHT_LIMIT } = options;
  const { start, end } = jstDayRange(date);
  const rows = await prisma.bodyMeasurement.findMany({
    where: { userId, measuredAt: { gte: new Date(start.getTime() - (days - 1) * DAY_MS), lt: end } },
    orderBy: [{ measuredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }],
    take: limit,
  });
  return rows.reverse().map(toBodyWeightDTO);
}

export async function getNutritionDashboardForUser(userId: string, date: Date = jstDateOnly()): Promise<NutritionDashboardDTO> {
  const [entries, target, weight, recentWeights] = await Promise.all([
    getNutritionEntriesForUser(userId, date),
    getCurrentNutritionTargetForUser(userId, date),
    getBodyWeightForDateForUser(userId, date),
    getRecentBodyWeightsForUser(userId, date),
  ]);
  return { date: date.toISOString().slice(0, 10), entries, summary: summarizeNutrition(entries), target, weight, recentWeights };
}

// Authenticates once, then fans out the independent reads with that userId.
export async function getNutritionDashboard(date?: Date): Promise<NutritionDashboardDTO> {
  const user = await requireUser();
  return getNutritionDashboardForUser(user.id, date);
}
