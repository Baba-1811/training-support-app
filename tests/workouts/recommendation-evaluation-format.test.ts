import { describe, expect, it } from "vitest";
import { evaluateRecommendedExercise } from "@/lib/workouts/recommendation-evaluation";
import {
  formatRecommendationActualSets, formatRecommendationEvaluationStatus, formatRecommendationPlannedSummary,
  summarizeWorkoutRecommendationEvaluation,
} from "@/lib/workouts/recommendation-evaluation-format";
import type { RecommendedExerciseEvaluation } from "@/lib/workouts/recommendation-evaluation";
import type { SetDTO, WorkoutRecommendationTargetDTO } from "@/lib/workouts/types";

const target = (overrides: Partial<WorkoutRecommendationTargetDTO> = {}): WorkoutRecommendationTargetDTO => ({
  targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: 90,
  ...overrides,
});

const set = (setNumber: number, weightKg: number, reps: number, overrides: Partial<SetDTO> = {}): SetDTO => ({
  id: `set-${setNumber}`, setNumber, weightKg: String(weightKg), reps, rir: null, setType: "WORKING", completed: true,
  ...overrides,
});

describe("formatRecommendationEvaluationStatus", () => {
  it("D: ACHIEVED -> 目標達成", () => expect(formatRecommendationEvaluationStatus("ACHIEVED")).toBe("目標達成"));
  it("E: EXCEEDED -> 目標以上", () => expect(formatRecommendationEvaluationStatus("EXCEEDED")).toBe("目標以上"));
  it("F: PARTIAL -> 一部達成", () => expect(formatRecommendationEvaluationStatus("PARTIAL")).toBe("一部達成"));
  it("G: NOT_PERFORMED -> 未実施", () => expect(formatRecommendationEvaluationStatus("NOT_PERFORMED")).toBe("未実施"));
});

describe("summarizeWorkoutRecommendationEvaluation", () => {
  it("H: 3 exercises (ACHIEVED, EXCEEDED, PARTIAL) -> total=3, metOrExceeded=2", () => {
    const achieved = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10), set(2, 60, 10), set(3, 60, 10)] })!;
    const exceeded = evaluateRecommendedExercise({ target: target(), sets: [set(1, 65, 10), set(2, 60, 10), set(3, 60, 10)] })!;
    const partial = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10)] })!;
    const summary = summarizeWorkoutRecommendationEvaluation([achieved, exceeded, partial]);
    expect(summary.totalExercises).toBe(3);
    expect(summary.achievedCount).toBe(1);
    expect(summary.exceededCount).toBe(1);
    expect(summary.partialCount).toBe(1);
    expect(summary.notPerformedCount).toBe(0);
    expect(summary.metOrExceededCount).toBe(2);
  });

  it("excludes null entries (no Recommendation Target) from every count, including totalExercises", () => {
    const achieved = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10), set(2, 60, 10), set(3, 60, 10)] })!;
    const summary = summarizeWorkoutRecommendationEvaluation([achieved, null, null]);
    expect(summary.totalExercises).toBe(1);
    expect(summary.metOrExceededCount).toBe(1);
  });

  it("is deterministic for an empty list (a normal Workout, all null)", () => {
    const summary = summarizeWorkoutRecommendationEvaluation([null, null]);
    expect(summary).toEqual({
      totalExercises: 0, achievedCount: 0, exceededCount: 0, partialCount: 0, notPerformedCount: 0, metOrExceededCount: 0,
    });
  });
});

describe("formatRecommendationPlannedSummary", () => {
  it("I: targetWeightKg=60, 8-12 reps, 3 sets -> '60kg × 8–12回 × 3セット'", () => {
    const evaluation = evaluateRecommendedExercise({ target: target(), sets: [] })!;
    expect(formatRecommendationPlannedSummary(evaluation)).toBe("60kg × 8–12回 × 3セット");
  });

  it("K: targetWeightKg=null -> weight omitted, never shown as 0kg", () => {
    const evaluation = evaluateRecommendedExercise({ target: target({ targetWeightKg: null }), sets: [] })!;
    const formatted = formatRecommendationPlannedSummary(evaluation);
    expect(formatted).toBe("8–12回 × 3セット");
    expect(formatted).not.toContain("0kg");
  });
});

describe("formatRecommendationActualSets", () => {
  it("I: 60x10, 60x9, 60x8 -> '60kg×10 / 60kg×9 / 60kg×8'", () => {
    const evaluation = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10), set(2, 60, 9), set(3, 60, 8)] })!;
    expect(formatRecommendationActualSets(evaluation.sets)).toBe("60kg×10 / 60kg×9 / 60kg×8");
  });

  it("J: different weights per set -> each shown individually, never collapsed into one shared weight", () => {
    const evaluation = evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10), set(2, 60, 9), set(3, 55, 8)] })!;
    const formatted = formatRecommendationActualSets(evaluation.sets);
    expect(formatted).toBe("60kg×10 / 60kg×9 / 55kg×8");
    expect(formatted).not.toBe("60kg × 10/9/8");
  });

  it("L: WARMUP sets excluded", () => {
    const evaluation = evaluateRecommendedExercise({
      target: target(), sets: [set(1, 60, 10, { setType: "WARMUP" }), set(2, 60, 10)],
    })!;
    expect(formatRecommendationActualSets(evaluation.sets)).toBe("60kg×10");
  });

  it("M: completed=false sets excluded", () => {
    const evaluation = evaluateRecommendedExercise({
      target: target(), sets: [set(1, 60, 10, { completed: false }), set(2, 60, 9)],
    })!;
    expect(formatRecommendationActualSets(evaluation.sets)).toBe("60kg×9");
  });

  it("N: setNumber ascending regardless of input order", () => {
    const evaluation = evaluateRecommendedExercise({ target: target(), sets: [set(3, 55, 8), set(1, 60, 10), set(2, 60, 9)] })!;
    expect(formatRecommendationActualSets(evaluation.sets)).toBe("60kg×10 / 60kg×9 / 55kg×8");
  });

  it("is null when nothing was performed", () => {
    const evaluation: RecommendedExerciseEvaluation = evaluateRecommendedExercise({ target: target(), sets: [] })!;
    expect(formatRecommendationActualSets(evaluation.sets)).toBeNull();
  });
});
