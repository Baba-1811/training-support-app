import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { jstDateOnly } from "@/lib/date/jst";
import { restoreSorenessByCategory } from "./dto";
import type { DailyConditionDTO } from "./types";

// Today's condition (JST calendar day), or null if not entered yet. ONE query: MuscleCondition + Muscle ride
// along in a nested select, so there is no per-muscle follow-up query (no N+1). findUnique on
// (userId, conditionDate) already scopes to the authenticated owner — there is no other user's row it could
// return. Prisma's Decimal/Date values never leave this function; everything here becomes a plain DTO.
export async function getTodayCondition(): Promise<DailyConditionDTO | null> {
  const user = await requireUser();
  const conditionDate = jstDateOnly();
  const condition = await prisma.dailyCondition.findUnique({
    where: { userId_conditionDate: { userId: user.id, conditionDate } },
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
