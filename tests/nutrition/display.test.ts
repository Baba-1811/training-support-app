import { describe, expect, it } from "vitest";
import { MEAL_LABELS, MEAL_SECTIONS, formatGrams, formatKcal, formatMacros, groupEntriesByMeal, progress } from "@/lib/nutrition/display";
import type { NutritionEntryDTO } from "@/lib/nutrition/types";

const entry = (over: Partial<NutritionEntryDTO>): NutritionEntryDTO => ({
  id: "e", entryDate: "2026-09-28", mealType: "LUNCH", name: "x", calories: 1, proteinGrams: null, fatGrams: null, carbsGrams: null, ...over,
});

describe("labels / order", () => {
  it("shows Japanese labels in BREAKFAST, LUNCH, DINNER, SNACK order", () => {
    expect(MEAL_SECTIONS.map((m) => MEAL_LABELS[m])).toEqual(["朝食", "昼食", "夕食", "間食"]);
  });
});

describe("formatting", () => {
  it("shows — for null and 0g for a recorded 0", () => {
    expect(formatGrams(null)).toBe("—");
    expect(formatGrams(0)).toBe("0g");
    expect(formatGrams(35)).toBe("35g");
    expect(formatGrams(5.5)).toBe("5.5g");
  });

  it("formats an entry's macros without turning null into 0", () => {
    expect(formatMacros({ proteinGrams: 35, fatGrams: 5.5, carbsGrams: null })).toBe("P 35g / F 5.5g / C —");
    expect(formatMacros({ proteinGrams: null, fatGrams: null, carbsGrams: null })).toBe("P — / F — / C —");
  });

  it("formats kcal with thousands separators", () => {
    expect(formatKcal(1620)).toBe("1,620 kcal");
  });
});

describe("groupEntriesByMeal", () => {
  it("returns every meal, empty when there are no entries", () => {
    expect(groupEntriesByMeal([])).toEqual({ BREAKFAST: [], LUNCH: [], DINNER: [], SNACK: [] });
  });

  it("groups entries by meal keeping their order", () => {
    const grouped = groupEntriesByMeal([entry({ id: "1", mealType: "SNACK" }), entry({ id: "2", mealType: "LUNCH" }), entry({ id: "3", mealType: "SNACK" })]);
    expect(grouped.SNACK.map((e) => e.id)).toEqual(["1", "3"]);
    expect(grouped.LUNCH.map((e) => e.id)).toEqual(["2"]);
    expect(grouped.BREAKFAST).toEqual([]);
  });
});

describe("progress", () => {
  it("is null without a target, with a zero target, or without a recorded value", () => {
    expect(progress(500, null)).toBeNull();
    expect(progress(500, 0)).toBeNull();
    expect(progress(null, 100)).toBeNull();
  });

  it("computes the ratio under target", () => {
    expect(progress(500, 2000)).toEqual({ ratio: 0.25, over: false });
    expect(progress(0, 2000)).toEqual({ ratio: 0, over: false });
  });

  it("caps the bar at 100% and flags over-target", () => {
    expect(progress(2500, 2000)).toEqual({ ratio: 1, over: true });
    expect(progress(2000, 2000)).toEqual({ ratio: 1, over: false });
  });
});
