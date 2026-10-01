"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { saveDailyConditionForUser as persistDailyConditionForUser, ConditionError } from "@/lib/conditions/mutations";
import { saveDailyConditionSchema } from "@/lib/conditions/validation";
import type { ActionResult } from "@/lib/conditions/types";

export async function saveDailyCondition(input: unknown): Promise<ActionResult<{ id: string }>> {
  const user = await requireUser();
  const parsed = saveDailyConditionSchema.safeParse(input);
  if (!parsed.success) return {
    ok: false, code: "VALIDATION", message: "入力内容を確認してください。",
    fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
  };
  try {
    const id = await persistDailyConditionForUser(user.id, parsed.data);
    revalidatePath("/");
    revalidatePath("/condition");
    return { ok: true, data: { id } };
  } catch (error) {
    if (error instanceof ConditionError) {
      return { ok: false, code: "MUSCLE_UNAVAILABLE", message: "選択した部位の一部が利用できないため保存できませんでした。" };
    }
    unstable_rethrow(error);
    console.error("CONDITION_SAVE_FAILED");
    return { ok: false, code: "FAILED", message: "保存できませんでした。時間をおいて再試行してください。" };
  }
}
