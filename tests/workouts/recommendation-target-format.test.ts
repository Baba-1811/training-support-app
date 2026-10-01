import { describe, expect, it } from "vitest";
import {
  formatRecommendationRepsAndSets, formatRecommendationRest, formatRecommendationWeight, recommendationTargetLabel,
} from "@/lib/workouts/recommendation-target-format";
import type { WorkoutRecommendationTargetDTO } from "@/lib/workouts/types";

const target = (overrides: Partial<WorkoutRecommendationTargetDTO> = {}): WorkoutRecommendationTargetDTO => ({
  targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90,
  ...overrides,
});

describe("formatRecommendationWeight", () => {
  it("formats a known weight as kg", () => {
    expect(formatRecommendationWeight(target({ targetWeightKg: 62.5 }))).toBe("62.5kg");
  });

  it("is null (omit the row, never \"— kg\") when there is no proposed weight", () => {
    expect(formatRecommendationWeight(target({ targetWeightKg: null }))).toBeNull();
  });
});

describe("formatRecommendationRepsAndSets", () => {
  it("shows a range when min and max differ", () => {
    expect(formatRecommendationRepsAndSets(target({ targetRepsMin: 8, targetRepsMax: 12 }))).toBe("8–12回 × 3セット");
  });

  it("collapses to a single number when min and max are equal", () => {
    expect(formatRecommendationRepsAndSets(target({ targetRepsMin: 10, targetRepsMax: 10 }))).toBe("10回 × 3セット");
  });

  it("falls back to just the set count when reps are entirely absent", () => {
    expect(formatRecommendationRepsAndSets(target({ targetRepsMin: null, targetRepsMax: null }))).toBe("3セット");
  });

  it("shows the one rep bound that exists when only one side is set", () => {
    expect(formatRecommendationRepsAndSets(target({ targetRepsMin: null, targetRepsMax: 12 }))).toBe("12回 × 3セット");
    expect(formatRecommendationRepsAndSets(target({ targetRepsMin: 8, targetRepsMax: null }))).toBe("8回 × 3セット");
  });
});

describe("formatRecommendationRest", () => {
  it("formats rest seconds when present", () => {
    expect(formatRecommendationRest(target({ restSeconds: 90 }))).toBe("休憩90秒");
  });

  it("is null (no placeholder) when rest is absent", () => {
    expect(formatRecommendationRest(target({ restSeconds: null }))).toBeNull();
  });
});

describe("recommendationTargetLabel", () => {
  it("reads as today's target while the Workout is in progress", () => {
    expect(recommendationTargetLabel(false)).toBe("今日の目安");
  });

  it("reads as that day's target once the Workout is history (COMPLETED)", () => {
    expect(recommendationTargetLabel(true)).toBe("この日の目安");
  });
});
