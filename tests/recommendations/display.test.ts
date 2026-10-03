import { describe, expect, it } from "vitest";
import {
  formatRestSeconds, formatTargetRepsAndSets, formatTargetWeight, formatWeightTargetExplanation, joinCategoryLabels,
  primaryRecommendedCategory, recommendedCategoryImage,
} from "@/lib/recommendations/display";
import { categoryImage } from "@/lib/exercises/categories";
import type { WeightTargetExplanation } from "@/lib/recommendations/types";

describe("primaryRecommendedCategory / recommendedCategoryImage (Home representative image, v1)", () => {
  it("picks the first (most-prioritized) category, per the engine's selectedCategories ordering", () => {
    expect(primaryRecommendedCategory(["back", "chest"])).toBe("back");
    expect(recommendedCategoryImage(["back", "chest"])).toBe(categoryImage("back"));
  });

  it("falls back to the full-body image when there is no category (defensive; WORKOUT always has at least one)", () => {
    expect(primaryRecommendedCategory([])).toBeNull();
    expect(recommendedCategoryImage([])).toBe(categoryImage("all"));
  });
});

describe("joinCategoryLabels", () => {
  it("joins every selected category's Japanese label with ・, most-prioritized first", () => {
    expect(joinCategoryLabels(["back", "chest"])).toBe("背中・胸");
  });

  it("is empty for no categories", () => {
    expect(joinCategoryLabels([])).toBe("");
  });
});

describe("formatTargetWeight", () => {
  it("formats a known weight as kg", () => {
    expect(formatTargetWeight(60)).toBe("60kg");
  });

  it("is null (omit the row) when there is no history-based number to propose", () => {
    expect(formatTargetWeight(null)).toBeNull();
  });
});

describe("formatTargetRepsAndSets", () => {
  it("formats the reps range and set count", () => {
    expect(formatTargetRepsAndSets({ targetRepsMin: 8, targetRepsMax: 10, targetSets: 3 })).toBe("8–10回 × 3セット");
  });
});

describe("formatRestSeconds", () => {
  it("formats rest seconds", () => {
    expect(formatRestSeconds(90)).toBe("休憩90秒");
  });
});

describe("formatWeightTargetExplanation (Phase 5F-3C)", () => {
  const explanation = (overrides: Partial<WeightTargetExplanation> = {}): WeightTargetExplanation => ({
    reason: "PROGRESSED", previousTargetWeightKg: 60, weightIncrementKg: 2.5, progressionDecision: "INCREASE", previousEvaluationStatus: "EXCEEDED",
    ...overrides,
  });

  it("K. PROGRESSED: includes both the previous (60kg) and next (62.5kg) weight", () => {
    const text = formatWeightTargetExplanation(explanation(), 62.5);
    expect(text).toContain("60kg");
    expect(text).toContain("62.5kg");
  });

  it("L. MAINTAINED + ACHIEVED: wording makes clear this is a continuation", () => {
    const text = formatWeightTargetExplanation(explanation({ reason: "MAINTAINED", progressionDecision: "MAINTAIN", previousEvaluationStatus: "ACHIEVED" }), 60);
    expect(text).toBe("前回の目安を達成。今回は60kgを継続");
  });

  it("MAINTAINED + PARTIAL: distinct wording from ACHIEVED, despite sharing the MAINTAIN decision", () => {
    const text = formatWeightTargetExplanation(explanation({ reason: "MAINTAINED", progressionDecision: "MAINTAIN", previousEvaluationStatus: "PARTIAL" }), 60);
    expect(text).toBe("今回は前回と同じ60kgを目安に設定");
    expect(text).not.toBe("前回の目安を達成。今回は60kgを継続");
  });

  it("MAINTAINED + NOT_PERFORMED (INSUFFICIENT_DATA): conservative wording, no achievement claim", () => {
    const text = formatWeightTargetExplanation(
      explanation({ reason: "MAINTAINED", progressionDecision: "INSUFFICIENT_DATA", previousEvaluationStatus: "NOT_PERFORMED" }), 60,
    );
    expect(text).toBe("前回の目安60kgを継続");
  });

  it("M. LATEST_PERFORMANCE: wording makes clear this is based on actual history, not a Recommendation", () => {
    const text = formatWeightTargetExplanation(
      explanation({ reason: "LATEST_PERFORMANCE", previousTargetWeightKg: null, weightIncrementKg: null, progressionDecision: null, previousEvaluationStatus: null }), 50,
    );
    expect(text).toBe("前回の実績をもとに50kgを設定");
  });

  it("N. NO_HISTORY: never shows 0kg or any invented weight", () => {
    const text = formatWeightTargetExplanation(
      explanation({ reason: "NO_HISTORY", previousTargetWeightKg: null, weightIncrementKg: null, progressionDecision: null, previousEvaluationStatus: null }), null,
    );
    expect(text).not.toContain("0kg");
    expect(text).not.toBeNull();
  });

  it("O. NO_WEIGHT_TARGET (BODYWEIGHT): no explanation at all, never a 0kg placeholder", () => {
    const text = formatWeightTargetExplanation(
      explanation({ reason: "NO_WEIGHT_TARGET", previousTargetWeightKg: null, weightIncrementKg: null, progressionDecision: null, previousEvaluationStatus: null }), null,
    );
    expect(text).toBeNull();
  });

  it("P. a clean (already-rounded) decimal reads naturally, e.g. 62.5kg, never 62.50kg", () => {
    const text = formatWeightTargetExplanation(explanation(), 62.5);
    expect(text).toContain("62.5kg");
    expect(text).not.toContain("62.50kg");
  });
});
