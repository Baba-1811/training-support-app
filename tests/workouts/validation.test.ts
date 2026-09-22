import { describe, expect, it } from "vitest";
import { createSetSchema, startWorkoutSchema, updateSetSchema } from "@/lib/workouts/validation";
const id = "11111111-1111-4111-8111-111111111111";
const valid = { workoutExerciseId: id, setNumber: 1, weightKg: "60.25", reps: "10", rir: "", setType: "WORKING" };
describe("workout inputs", () => {
  it("normalizes optional title and RIR without turning blank weight into zero", () => {
    expect(startWorkoutSchema.parse({ title: "  " })).toEqual({ title: null });
    expect(createSetSchema.parse(valid)).toMatchObject({ rir: null, reps: 10 });
    expect(createSetSchema.safeParse({ ...valid, weightKg: "" }).success).toBe(false);
  });
  it.each([
    { weightKg: " " }, { weightKg: "-1" }, { weightKg: "NaN" }, { weightKg: "Infinity" },
    { weightKg: "10000" }, { weightKg: "60.123" }, { reps: "0" }, { reps: "-1" },
    { reps: "1.5" }, { reps: "" }, { reps: "2147483648" }, { rir: "10.1" },
    { rir: "-0.1" }, { rir: "1.25" }, { setType: "OTHER" }, { setNumber: 0 },
    { userId: id }, { completed: false }, { completedAt: "2026-01-01" }, { workoutExerciseId: "bad" },
  ])("rejects invalid or injected input %j", (patch) => {
    expect(createSetSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });
  it.each(["0", "10", "9.5"])("accepts RIR %s", (rir) => {
    expect(createSetSchema.safeParse({ ...valid, rir, weightKg: "0", setType: "WARMUP" }).success).toBe(true);
  });
  it("bounds title length and rejects FK changes on updates", () => {
    expect(startWorkoutSchema.safeParse({ title: "a".repeat(101) }).success).toBe(false);
    expect(updateSetSchema.safeParse({ ...valid, setId: id }).success).toBe(false);
  });
});
