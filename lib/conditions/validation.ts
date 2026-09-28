import { z } from "zod";
import { SORENESS_CATEGORIES, type CategorySlug } from "@/lib/exercises/categories";

export const AVAILABLE_MINUTES = [30, 45, 60, 90] as const;

// DB CHECK: sleepHours IS NULL OR sleepHours BETWEEN 0 AND 24. The stepper UI only ever produces 0.5 steps.
const sleepHours = z.number().min(0, "0〜24時間で入力してください。").max(24, "0〜24時間で入力してください。")
  .refine((value) => Number.isInteger(value * 2), "0.5時間単位で入力してください。");
// DB CHECK: fatigueLevel IS NULL OR fatigueLevel BETWEEN 1 AND 5.
const fatigueLevel = z.number().int().min(1).max(5);
const availableMinutes = z.union(AVAILABLE_MINUTES.map((value) => z.literal(value)) as [
  z.ZodLiteral<number>, ...z.ZodLiteral<number>[],
]);
// DB CHECK: sorenessLevel BETWEEN 1 AND 5 (NOT NULL — "no soreness" is the absence of an entry, not 0).
const sorenessLevel = z.number().int().min(1).max(5);
const category = z.enum(SORENESS_CATEGORIES as [CategorySlug, ...CategorySlug[]]);

const sorenessEntrySchema = z.strictObject({ category, sorenessLevel });

// Client sends category keys + a level, never Muscle IDs: an allowlisted, server-expandable input
// (see lib/conditions/mutations.ts) rather than trusting an arbitrary Muscle ID array.
// userId and conditionDate are intentionally absent (and rejected by strictObject if sent): userId comes
// from requireUser(), conditionDate is the server's JST "today" (lib/date/jst.ts).
export const saveDailyConditionSchema = z.strictObject({
  sleepHours, fatigueLevel, availableMinutes,
  soreness: z.array(sorenessEntrySchema).max(SORENESS_CATEGORIES.length)
    .refine((entries) => new Set(entries.map((entry) => entry.category)).size === entries.length,
      "同じ部位を複数回指定できません。"),
});
