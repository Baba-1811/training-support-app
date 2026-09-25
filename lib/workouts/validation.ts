import { z } from "zod";

const id = z.string().uuid("IDを確認してください。");
const title = z.string().trim().max(100, "タイトルは100文字以内です。")
  .nullable().optional().transform((value) => value || null);
const decimal = (max: number, places: number) => z.string()
  .trim().regex(new RegExp(`^\\d+(?:\\.\\d{1,${places}})?$`), "数値と小数桁を確認してください。")
  .refine((value) => Number.isFinite(Number(value)) && Number(value) <= max, `0〜${max}で入力してください。`);
const setValues = {
  weightKg: decimal(9999.99, 2),
  reps: z.string().trim().regex(/^\d+$/, "回数は整数で入力してください。")
    .transform(Number).pipe(z.number().int().min(1).max(2147483647)),
  rir: z.preprocess((value) => typeof value === "string" && !value.trim() ? null : value,
    decimal(10, 1).nullable().optional()).transform((value) => value ?? null),
  setType: z.enum(["WORKING", "WARMUP"]),
};
export const startWorkoutSchema = z.strictObject({ title });
export const startWorkoutWithExerciseSchema = z.strictObject({ exerciseId: id });
export const updateWorkoutTitleSchema = z.strictObject({ sessionId: id, title });
export const addExerciseSchema = z.strictObject({ sessionId: id, exerciseId: id });
export const deleteWorkoutExerciseSchema = z.strictObject({ workoutExerciseId: id });
export const createSetSchema = z.strictObject({
  workoutExerciseId: id, setNumber: z.number().int().min(1).max(2147483647), ...setValues,
});
export const updateSetSchema = z.strictObject({ setId: id, ...setValues });
export const deleteSetSchema = z.strictObject({ setId: id });
export const finishWorkoutSchema = z.strictObject({ sessionId: id });
export const workoutIdSchema = id;
