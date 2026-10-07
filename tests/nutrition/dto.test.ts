import { describe, expect, it } from "vitest";
import { Prisma } from "@/app/generated/prisma/client";
import {
  decimalToNumber, summarizeNutrition, toBodyWeightDTO, toNutritionEntryDTOs, toNutritionTargetDTO,
  type NutritionEntryRow,
} from "@/lib/nutrition/dto";
import type { NutritionEntryDTO } from "@/lib/nutrition/types";

const entry = (over: Partial<NutritionEntryDTO> = {}): NutritionEntryDTO => ({
  id: "e", entryDate: "2026-09-28", mealType: "LUNCH", name: "x", calories: 0,
  proteinGrams: null, fatGrams: null, carbsGrams: null, ...over,
});

describe("summarizeNutrition", () => {
  it("is zero calories and null macros with no entries", () => {
    expect(summarizeNutrition([])).toEqual({ calories: 0, proteinGrams: null, fatGrams: null, carbsGrams: null });
  });

  it("returns a single entry as is", () => {
    expect(summarizeNutrition([entry({ calories: 500, proteinGrams: 30, fatGrams: 10.5, carbsGrams: 60 })]))
      .toEqual({ calories: 500, proteinGrams: 30, fatGrams: 10.5, carbsGrams: 60 });
  });

  it("sums calories and macros across entries", () => {
    const summary = summarizeNutrition([
      entry({ calories: 400, proteinGrams: 20, fatGrams: 5, carbsGrams: 50 }),
      entry({ calories: 650, proteinGrams: 35, fatGrams: 20, carbsGrams: 70 }),
    ]);
    expect(summary).toEqual({ calories: 1050, proteinGrams: 55, fatGrams: 25, carbsGrams: 120 });
  });

  it("sums only the recorded values per macro; a macro nobody recorded stays null (not 0)", () => {
    const summary = summarizeNutrition([
      entry({ calories: 100, proteinGrams: 10 }),
      entry({ calories: 200, proteinGrams: null, fatGrams: 4 }),
    ]);
    expect(summary).toEqual({ calories: 300, proteinGrams: 10, fatGrams: 4, carbsGrams: null });
  });

  it("keeps an explicitly recorded 0 as 0", () => {
    expect(summarizeNutrition([entry({ proteinGrams: 0 })]).proteinGrams).toBe(0);
  });

  it("does not accumulate floating point error on 1-decimal values", () => {
    const summary = summarizeNutrition([0.1, 0.2, 0.7, 10.3, 5.6].map((grams) => entry({ proteinGrams: grams })));
    expect(summary.proteinGrams).toBe(16.9);
  });
});

describe("decimalToNumber", () => {
  it("converts Prisma.Decimal to a plain number and keeps null", () => {
    expect(decimalToNumber(new Prisma.Decimal("12.3"))).toBe(12.3);
    expect(typeof decimalToNumber(new Prisma.Decimal("70.55"))).toBe("number");
    expect(decimalToNumber(null)).toBeNull();
  });
});

describe("toNutritionEntryDTOs", () => {
  const row = (over: Partial<NutritionEntryRow>): NutritionEntryRow => ({
    id: "a", entryDate: new Date("2026-09-28T00:00:00.000Z"), mealType: "LUNCH", name: "n", calories: 1,
    proteinGrams: null, fatGrams: null, carbsGrams: null, createdAt: new Date("2026-09-28T03:00:00.000Z"), ...over,
  });

  it("orders BREAKFAST, LUNCH, DINNER, SNACK regardless of input order", () => {
    const result = toNutritionEntryDTOs([
      row({ id: "1", mealType: "SNACK" }), row({ id: "2", mealType: "DINNER" }),
      row({ id: "3", mealType: "BREAKFAST" }), row({ id: "4", mealType: "LUNCH" }),
    ]);
    expect(result.map((r) => r.mealType)).toEqual(["BREAKFAST", "LUNCH", "DINNER", "SNACK"]);
  });

  it("orders within a meal by createdAt ASC, then id", () => {
    const result = toNutritionEntryDTOs([
      row({ id: "c", createdAt: new Date("2026-09-28T05:00:00.000Z") }),
      row({ id: "b", createdAt: new Date("2026-09-28T04:00:00.000Z") }),
      row({ id: "a", createdAt: new Date("2026-09-28T04:00:00.000Z") }),
    ]);
    expect(result.map((r) => r.id)).toEqual(["a", "b", "c"]);
  });

  it("converts Decimals to numbers and the date to YYYY-MM-DD", () => {
    const [dto] = toNutritionEntryDTOs([row({
      proteinGrams: new Prisma.Decimal("25.5"), fatGrams: null, carbsGrams: new Prisma.Decimal("40.0"),
    })]);
    expect(dto).toMatchObject({ entryDate: "2026-09-28", proteinGrams: 25.5, fatGrams: null, carbsGrams: 40 });
  });
});

describe("toNutritionTargetDTO / toBodyWeightDTO", () => {
  it("converts target Decimals and keeps nullable macros null", () => {
    expect(toNutritionTargetDTO({
      id: "t", targetCalories: 2400, targetProtein: new Prisma.Decimal("150.0"), targetFat: null,
      targetCarbs: new Prisma.Decimal("300.5"), effectiveFrom: new Date("2026-09-01T00:00:00.000Z"),
    })).toEqual({
      id: "t", targetCalories: 2400, targetProtein: 150, targetFat: null, targetCarbs: 300.5, effectiveFrom: "2026-09-01",
    });
  });

  it("converts body weight to number and measuredAt to ISO", () => {
    expect(toBodyWeightDTO({ id: "w", measuredAt: new Date("2026-09-28T01:00:00.000Z"), weightKg: new Prisma.Decimal("70.55") }))
      .toEqual({ id: "w", measuredAt: "2026-09-28T01:00:00.000Z", weightKg: 70.55, bodyFatPercent: null });
  });

  it("converts body fat to number, keeping null (not 0) when absent and 0 when recorded as 0", () => {
    const base = { id: "w", measuredAt: new Date("2026-09-28T01:00:00.000Z"), weightKg: new Prisma.Decimal("70.55") };
    expect(toBodyWeightDTO({ ...base, bodyFatPercent: new Prisma.Decimal("15.20") }).bodyFatPercent).toBe(15.2);
    expect(toBodyWeightDTO({ ...base, bodyFatPercent: new Prisma.Decimal("0.00") }).bodyFatPercent).toBe(0);
    expect(toBodyWeightDTO({ ...base, bodyFatPercent: null }).bodyFatPercent).toBeNull();
  });
});
