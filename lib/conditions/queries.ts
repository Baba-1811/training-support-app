import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { jstDateOnly } from "@/lib/date/jst";
import { restoreSorenessByCategory, toRecommendationInput } from "./dto";
import type { ConditionRecommendationInputDTO, DailyConditionDTO } from "./types";

// Today's condition (JST calendar day), or null if not entered yet. ONE query: MuscleCondition + Muscle ride
// along in a nested select, so there is no per-muscle follow-up query (no N+1). findUnique on
// (userId, conditionDate) already scopes to the authenticated owner — there is no other user's row it could
// return. Prisma's Decimal/Date values never leave this function; everything here becomes a plain DTO.
export async function getTodayCondition(): Promise<DailyConditionDTO | null> {
  const user = await requireUser();
  return getTodayConditionForUser(user.id);
}

// Internal, owner-scoped variant: no requireUser() of its own. For a caller that has already authenticated once
// in this request (e.g. Home, see app/(protected)/page.tsx) and wants to pass that same user.id into several
// queries without each one re-triggering a Supabase Auth API call. userId must always come from requireUser()'s
// own result, never from client input.
export async function getTodayConditionForUser(userId: string): Promise<DailyConditionDTO | null> {
  const conditionDate = jstDateOnly();
  const condition = await prisma.dailyCondition.findUnique({
    where: { userId_conditionDate: { userId, conditionDate } },
    select: {
      id: true, conditionDate: true, sleepHours: true, fatigueLevel: true, availableMinutes: true,
      muscleConditions: { select: { sorenessLevel: true, muscle: { select: { name: true } } } },
    },
  });
  if (!condition) return null;
  return {
    id: condition.id,
    conditionDate: condition.conditionDate.toISOString().slice(0, 10),
    sleepHours: condition.sleepHours?.toString() ?? null,
    fatigueLevel: condition.fatigueLevel,
    availableMinutes: condition.availableMinutes,
    sorenessByCategory: restoreSorenessByCategory(
      condition.muscleConditions.map((row) => ({ muscleName: row.muscle.name, sorenessLevel: row.sorenessLevel })),
    ),
  };
}

// Same query as getTodayCondition(), shaped for the Recommendation engine (Phase 5) instead of the UI: individual
// Muscle names via toRecommendationInput(), not the UI's category grouping. null = no Condition entered today —
// distinct from the engine's own { kind: "REST" } result, which means a Condition exists but rest is recommended.
export async function getTodayConditionForRecommendation(): Promise<ConditionRecommendationInputDTO | null> {
  const user = await requireUser();
  return getTodayConditionForRecommendationForUser(user.id);
}

// Internal, owner-scoped variant: no requireUser() of its own (see getTodayConditionForUser's comment on why).
export async function getTodayConditionForRecommendationForUser(userId: string): Promise<ConditionRecommendationInputDTO | null> {
  const conditionDate = jstDateOnly();
  const condition = await prisma.dailyCondition.findUnique({
    where: { userId_conditionDate: { userId, conditionDate } },
    select: {
      conditionDate: true, sleepHours: true, fatigueLevel: true, availableMinutes: true,
      muscleConditions: { select: { sorenessLevel: true, muscle: { select: { name: true } } } },
    },
  });
  if (!condition) return null;
  return toRecommendationInput({
    conditionDate: condition.conditionDate.toISOString().slice(0, 10),
    sleepHours: condition.sleepHours?.toString() ?? null,
    fatigueLevel: condition.fatigueLevel,
    availableMinutes: condition.availableMinutes,
    muscleConditions: condition.muscleConditions.map((row) => ({ muscleName: row.muscle.name, sorenessLevel: row.sorenessLevel })),
  });
}
