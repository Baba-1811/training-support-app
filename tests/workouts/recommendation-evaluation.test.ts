import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRecommendedExercise, evaluateWorkoutRecommendations } from "@/lib/workouts/recommendation-evaluation";
import type { SetDTO, WorkoutDTO, WorkoutRecommendationTargetDTO } from "@/lib/workouts/types";

const target = (overrides: Partial<WorkoutRecommendationTargetDTO> = {}): WorkoutRecommendationTargetDTO => ({
  targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: 90,
  ...overrides,
});

const set = (setNumber: number, weightKg: number, reps: number, overrides: Partial<SetDTO> = {}): SetDTO => ({
  id: `set-${setNumber}`, setNumber, weightKg: String(weightKg), reps, rir: null, setType: "WORKING", completed: true,
  ...overrides,
});

describe("evaluateRecommendedExercise", () => {
  it("1: all required sets in range -> ACHIEVED", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10), set(2, 60, 9), set(3, 60, 8)] });
    expect(result?.status).toBe("ACHIEVED");
    expect(result?.achievedSetCount).toBe(3);
    expect(result?.meetsOrExceedsSetCount).toBe(true);
  });

  it("2: reps above target max while meeting required sets -> EXCEEDED, ABOVE_TARGET preserved", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 13), set(2, 60, 12), set(3, 60, 10)] });
    expect(result?.sets[0].repsStatus).toBe("ABOVE_TARGET");
    expect(result?.sets[0].meetsOrExceedsTarget).toBe(true);
    expect(result?.status).toBe("EXCEEDED");
  });

  it("3: one set under target weight -> that set not achieved, exercise PARTIAL", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 55, 10), set(2, 60, 10), set(3, 60, 10)] });
    expect(result?.sets[0].weightStatus).toBe("BELOW_TARGET");
    expect(result?.sets[0].meetsOrExceedsTarget).toBe(false);
    expect(result?.status).toBe("PARTIAL");
  });

  it("4: 2 of 3 target sets completed -> completionRate 2/3, PARTIAL", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10), set(2, 60, 10)] });
    expect(result?.setCompletionRate).toBeCloseTo(2 / 3);
    expect(result?.status).toBe("PARTIAL");
  });

  it("5: zero completed WORKING sets -> NOT_PERFORMED", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [] });
    expect(result?.status).toBe("NOT_PERFORMED");
    expect(result?.completedWorkingSets).toBe(0);
  });

  it("6: WARMUP sets only -> NOT_PERFORMED, excluded from counts", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10, { setType: "WARMUP" })] });
    expect(result?.status).toBe("NOT_PERFORMED");
    expect(result?.completedWorkingSets).toBe(0);
    expect(result?.sets).toHaveLength(0);
  });

  it("7: completed=false sets only -> NOT_PERFORMED, excluded from counts", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10, { completed: false })] });
    expect(result?.status).toBe("NOT_PERFORMED");
    expect(result?.completedWorkingSets).toBe(0);
  });

  it("8: targetWeightKg=null -> weight N/A (never 0kg-as-failed), status from reps/sets only", () => {
    const result = evaluateRecommendedExercise({
      target: target({ targetWeightKg: null }),
      sets: [set(1, 0, 10), set(2, 0, 10), set(3, 0, 10)],
    });
    expect(result?.sets.every((s) => s.weightStatus === "NOT_APPLICABLE")).toBe(true);
    expect(result?.sets.every((s) => s.meetsOrExceedsTarget)).toBe(true);
    expect(result?.status).toBe("ACHIEVED");
  });

  it("9: reps 7 (below min 8) -> BELOW_TARGET", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 7)] });
    expect(result?.sets[0].repsStatus).toBe("BELOW_TARGET");
  });

  it("10: reps 8 (at min) -> IN_TARGET", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 8)] });
    expect(result?.sets[0].repsStatus).toBe("IN_TARGET");
  });

  it("11: reps 12 (at max) -> IN_TARGET", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 12)] });
    expect(result?.sets[0].repsStatus).toBe("IN_TARGET");
  });

  it("12: reps 13 (above max) -> ABOVE_TARGET", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 13)] });
    expect(result?.sets[0].repsStatus).toBe("ABOVE_TARGET");
  });

  it("13: targetSets=3, actual=4 all in-range -> completedWorkingSets=4, rate capped at 1, still ACHIEVED (not EXCEEDED from extra set alone)", () => {
    const result = evaluateRecommendedExercise({
      target: target(), sets: [set(1, 60, 10), set(2, 60, 10), set(3, 60, 10), set(4, 60, 10)],
    });
    expect(result?.completedWorkingSets).toBe(4);
    expect(result?.setCompletionRate).toBe(1);
    expect(result?.status).toBe("ACHIEVED");
  });

  it("14: a required set above target weight -> EXCEEDED", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 62.5, 10), set(2, 60, 10), set(3, 60, 10)] });
    expect(result?.status).toBe("EXCEEDED");
  });

  it("15: a required set above target max reps -> EXCEEDED", () => {
    const result = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 13), set(2, 60, 10), set(3, 60, 10)] });
    expect(result?.status).toBe("EXCEEDED");
  });

  it("17: no Recommendation Target -> null (not a zeroed-out result)", () => {
    expect(evaluateRecommendedExercise({ target: null, sets: [set(1, 60, 10)] })).toBeNull();
  });

  it("is deterministic: same input always produces the same (deep-equal) result", () => {
    const input = { target: target(), sets: [set(1, 60, 10), set(2, 55, 13), set(3, 62.5, 7)] };
    expect(evaluateRecommendedExercise(input)).toEqual(evaluateRecommendedExercise(input));
  });

  it("never imports Prisma, React or the auth layer (pure domain module)", () => {
    const source = readFileSync(join(process.cwd(), "lib", "workouts", "recommendation-evaluation.ts"), "utf8");
    const importLines = source.split("\n").filter((line) => line.trimStart().startsWith("import "));
    for (const line of importLines) {
      expect(line).not.toMatch(/["']react["']/i);
      expect(line).not.toMatch(/prisma/i);
      expect(line).not.toMatch(/require-user/i);
    }
    expect(source).not.toMatch(/requireUser\(/);
    expect(source).not.toMatch(/Date\.now\(/);
  });

  describe("required-sets selection (first N completed WORKING sets, never a best-N pick)", () => {
    it("16: an early miss is not offset by later extra sets meeting target", () => {
      const result = evaluateRecommendedExercise({
        target: target(),
        sets: [set(1, 55, 7), set(2, 60, 10), set(3, 60, 10), set(4, 60, 10)],
      });
      expect(result?.completedWorkingSets).toBe(4);
      expect(result?.setCompletionRate).toBe(1);
      expect(result?.achievedSetCount).toBe(2); // only sets 2-3 of the required 1-3 group
      expect(result?.meetsOrExceedsSetCount).toBe(false);
      expect(result?.status).toBe("PARTIAL");
    });
  });
});

describe("evaluateWorkoutRecommendations", () => {
  const baseExercise = {
    id: "we-1", exerciseId: "ex-bench", name: "Bench Press", exerciseOrder: 1, muscles: [] as string[],
  };

  it("evaluates each WorkoutExercise independently, keyed by its own id (duplicate-Exercise safe)", () => {
    const workout: Pick<WorkoutDTO, "exercises"> = {
      exercises: [
        { ...baseExercise, id: "we-1", exerciseOrder: 1, recommendationTarget: target({ targetWeightKg: 60 }), sets: [set(1, 60, 10), set(2, 60, 10), set(3, 60, 10)] },
        { ...baseExercise, id: "we-2", exerciseOrder: 2, recommendationTarget: target({ targetWeightKg: 40 }), sets: [set(1, 30, 10)] },
      ],
    };
    const result = evaluateWorkoutRecommendations(workout);
    expect(result["we-1"]?.status).toBe("ACHIEVED");
    expect(result["we-2"]?.status).toBe("PARTIAL");
  });

  it("is null for an Exercise with no Recommendation Target", () => {
    const workout: Pick<WorkoutDTO, "exercises"> = {
      exercises: [{ ...baseExercise, recommendationTarget: null, sets: [set(1, 60, 10)] }],
    };
    expect(evaluateWorkoutRecommendations(workout)["we-1"]).toBeNull();
  });
});
