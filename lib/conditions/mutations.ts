import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { jstDateOnly } from "@/lib/date/jst";
import { categoryMuscles } from "@/lib/exercises/categories";
import type { z } from "zod";
import type { saveDailyConditionSchema } from "./validation";

export class ConditionError extends Error {
  constructor(public code: "MUSCLE_UNAVAILABLE") { super(code); }
}

// One create-or-update for the day: DailyCondition upserts on (userId, conditionDate) — the first save of the
// day INSERTs, every later save that same JST day UPDATEs the same row, never a second one. MuscleCondition is
// always a full replace (deleteMany + createMany) in the same transaction: at most 12 rows, so a diff-update
// would only add complexity. A category the user cleared simply has no entry in `input.soreness`, so its
// Muscle rows are deleted, never written back with sorenessLevel=0 (the DB CHECK does not allow 0).
export async function saveDailyCondition(input: z.output<typeof saveDailyConditionSchema>): Promise<string> {
  const user = await requireUser();
  return saveDailyConditionForUser(user.id, input);
}

// Internal, owner-scoped variant: no requireUser() of its own. For a caller that has already authenticated once
// in this request (e.g. the Condition Server Action, see app/(protected)/condition/actions.ts) and wants to
// reuse that same user.id instead of triggering a second Supabase Auth API call for the same request. userId
// must always come from requireUser()'s own result, never from client input.
export async function saveDailyConditionForUser(userId: string, input: z.output<typeof saveDailyConditionSchema>): Promise<string> {
  const conditionDate = jstDateOnly();
  return prisma.$transaction(async (tx) => {
    const condition = await tx.dailyCondition.upsert({
      where: { userId_conditionDate: { userId, conditionDate } },
      create: {
        userId, conditionDate,
        sleepHours: input.sleepHours.toFixed(1), fatigueLevel: input.fatigueLevel, availableMinutes: input.availableMinutes,
      },
      update: {
        sleepHours: input.sleepHours.toFixed(1), fatigueLevel: input.fatigueLevel, availableMinutes: input.availableMinutes,
      },
      select: { id: true },
    });

    // Expand each selected category into its individual Muscle names (categories.ts is the single source of
    // truth shared with the Exercise Library) before touching MuscleCondition.
    const requested = input.soreness.flatMap((entry) =>
      categoryMuscles(entry.category).map((name) => ({ name, sorenessLevel: entry.sorenessLevel })));

    if (requested.length > 0) {
      const names = [...new Set(requested.map((row) => row.name))];
      // Every expected Muscle must exist and be active, or the whole save fails — Phase 5 needs complete,
      // trustworthy soreness data, never a silent partial save (e.g. 脚 saved as only 3 of its 4 muscles).
      const muscles = await tx.muscle.findMany({ where: { name: { in: names }, isActive: true }, select: { id: true, name: true } });
      if (muscles.length !== names.length) throw new ConditionError("MUSCLE_UNAVAILABLE");
      const idByName = new Map(muscles.map((muscle) => [muscle.name, muscle.id]));
      await tx.muscleCondition.deleteMany({ where: { dailyConditionId: condition.id } });
      await tx.muscleCondition.createMany({
        data: requested.map((row) => ({ dailyConditionId: condition.id, muscleId: idByName.get(row.name)!, sorenessLevel: row.sorenessLevel })),
      });
    } else {
      await tx.muscleCondition.deleteMany({ where: { dailyConditionId: condition.id } });
    }

    return condition.id;
  });
}
