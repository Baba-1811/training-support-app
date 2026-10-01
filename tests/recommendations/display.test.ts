import { describe, expect, it } from "vitest";
import {
  formatRestSeconds, formatTargetRepsAndSets, formatTargetWeight, joinCategoryLabels, primaryRecommendedCategory,
  recommendedCategoryImage,
} from "@/lib/recommendations/display";
import { categoryImage } from "@/lib/exercises/categories";

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
