"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import {
  createNutritionEntryForUser, createNutritionTargetForUser, deleteNutritionEntryForUser, updateNutritionEntryForUser, NutritionError,
} from "@/lib/nutrition/mutations";
import { createNutritionEntrySchema, createNutritionTargetSchema, deleteNutritionEntrySchema, updateNutritionEntrySchema } from "@/lib/nutrition/validation";
import type { NutritionActionResult } from "@/lib/nutrition/types";

// Authenticates once, validates server-side, then runs the owner-scoped mutation with that user.id.
async function perform<S extends z.ZodType>(
  schema: S, input: unknown, operation: (userId: string, data: z.output<S>) => Promise<string>,
): Promise<NutritionActionResult> {
  const user = await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return {
    ok: false, code: "VALIDATION", message: "入力内容を確認してください。",
    fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
  };
  try {
    const id = await operation(user.id, parsed.data);
    revalidatePath("/nutrition");
    return { ok: true, data: { id } };
  } catch (error) {
    if (error instanceof NutritionError) return { ok: false, code: "NOT_FOUND", message: "記録が見つかりません。再読み込みしてください。" };
    unstable_rethrow(error);
    console.error("NUTRITION_OPERATION_FAILED");
    return { ok: false, code: "FAILED", message: "保存できませんでした。時間をおいて再試行してください。" };
  }
}

export async function createNutritionEntry(input: unknown) { return perform(createNutritionEntrySchema, input, createNutritionEntryForUser); }
export async function updateNutritionEntry(input: unknown) { return perform(updateNutritionEntrySchema, input, updateNutritionEntryForUser); }
export async function deleteNutritionEntry(input: unknown) { return perform(deleteNutritionEntrySchema, input, deleteNutritionEntryForUser); }
export async function createNutritionTarget(input: unknown) { return perform(createNutritionTargetSchema, input, createNutritionTargetForUser); }
