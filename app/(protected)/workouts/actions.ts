"use server";
import { z } from "zod";
import { revalidatePath } from "next/cache";
import { unstable_rethrow } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { createWorkout, createWorkoutWithExercise, mutateWorkout, WorkoutError } from "@/lib/workouts/mutations";
import { getWorkout } from "@/lib/workouts/queries";
import * as schemas from "@/lib/workouts/validation";
import type { ActionResult } from "@/lib/workouts/types";

async function perform<S extends z.ZodType, T>(schema: S, input: unknown, operation: (data: z.output<S>) => Promise<T>): Promise<ActionResult<T>> {
  await requireUser();
  const parsed = schema.safeParse(input);
  if (!parsed.success) return {
    ok: false, code: "VALIDATION", message: "入力内容を確認してください。",
    fieldErrors: z.flattenError(parsed.error).fieldErrors as Record<string, string[]>,
  };
  try { return { ok: true, data: await operation(parsed.data) }; }
  catch (error) {
    if (error instanceof WorkoutError) return { ok: false, code: error.code, message: {
      NOT_FOUND: "記録が見つかりません。", INVALID_STATE: "この状態では操作できません。", CONFLICT: "記録が更新されています。再読み込みして確認してください。",
    }[error.code] };
    unstable_rethrow(error);
    console.error("WORKOUT_OPERATION_FAILED");
    return { ok: false, code: "FAILED", message: "保存できませんでした。時間をおいて再試行してください。" };
  }
}
async function updated(command: Parameters<typeof mutateWorkout>[0]) {
  const sessionId = await mutateWorkout(command);
  revalidatePath(`/workouts/${sessionId}`);
  const workout = await getWorkout(sessionId);
  if (!workout) throw new WorkoutError("NOT_FOUND");
  return workout;
}
export async function startWorkout(input: unknown) {
  return perform(schemas.startWorkoutSchema, input, async (data) => ({ sessionId: (await createWorkout(data)).id }));
}
export async function startWorkoutWithExercise(input: unknown) {
  return perform(schemas.startWorkoutWithExerciseSchema, input, async (data) => ({ sessionId: (await createWorkoutWithExercise(data)).id }));
}
export async function updateWorkoutTitle(input: unknown) { return perform(schemas.updateWorkoutTitleSchema, input, (data) => updated({ kind: "title", input: data })); }
export async function addExercise(input: unknown) { return perform(schemas.addExerciseSchema, input, (data) => updated({ kind: "addExercise", input: data })); }
export async function deleteWorkoutExercise(input: unknown) { return perform(schemas.deleteWorkoutExerciseSchema, input, (data) => updated({ kind: "deleteExercise", input: data })); }
export async function createSet(input: unknown) { return perform(schemas.createSetSchema, input, (data) => updated({ kind: "createSet", input: data })); }
export async function updateSet(input: unknown) { return perform(schemas.updateSetSchema, input, (data) => updated({ kind: "updateSet", input: data })); }
export async function deleteSet(input: unknown) { return perform(schemas.deleteSetSchema, input, (data) => updated({ kind: "deleteSet", input: data })); }
export async function finishWorkout(input: unknown) { return perform(schemas.finishWorkoutSchema, input, (data) => updated({ kind: "finish", input: data })); }
