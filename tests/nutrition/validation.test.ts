import { describe, expect, it } from "vitest";
import { createNutritionEntrySchema, deleteNutritionEntrySchema, updateNutritionEntrySchema } from "@/lib/nutrition/validation";

const valid = { entryDate: "2026-09-28", mealType: "LUNCH", name: "鶏胸肉", calories: "220", proteinGrams: "35.0", fatGrams: "5", carbsGrams: "" };
const create = (over: Record<string, unknown> = {}) => createNutritionEntrySchema.safeParse({ ...valid, ...over });
const id = "11111111-1111-4111-8111-111111111111";

describe("createNutritionEntrySchema", () => {
  it("accepts valid input, converting text to numbers and the date to UTC midnight", () => {
    const result = create();
    expect(result.success).toBe(true);
    if (result.success) expect(result.data).toEqual({
      entryDate: new Date("2026-09-28T00:00:00.000Z"), mealType: "LUNCH", name: "鶏胸肉", calories: 220,
      proteinGrams: 35, fatGrams: 5, carbsGrams: null,
    });
  });

  it("accepts calories only (all macros omitted / empty -> null, not 0)", () => {
    const result = createNutritionEntrySchema.safeParse({ entryDate: "2026-09-28", mealType: "SNACK", name: "x", calories: 0 });
    expect(result.success && [result.data.proteinGrams, result.data.fatGrams, result.data.carbsGrams]).toEqual([null, null, null]);
    const empty = create({ proteinGrams: "", fatGrams: "  ", carbsGrams: null });
    expect(empty.success && [empty.data.proteinGrams, empty.data.fatGrams, empty.data.carbsGrams]).toEqual([null, null, null]);
  });

  it("keeps an explicit 0 macro as 0", () => {
    const result = create({ proteinGrams: "0" });
    expect(result.success && result.data.proteinGrams).toBe(0);
  });

  it("trims the name", () => {
    const result = create({ name: "  卵  " });
    expect(result.success && result.data.name).toBe("卵");
  });

  it.each([["", "empty"], ["   ", "whitespace only"], ["a".repeat(101), "101 chars"]])("rejects name %j (%s)", (name) => {
    expect(create({ name }).success).toBe(false);
  });

  it("accepts a 100-char name", () => {
    expect(create({ name: "a".repeat(100) }).success).toBe(true);
  });

  it.each(["-1", "1.5", "abc", "", " ", "1e3", "20001", "NaN", "Infinity"])("rejects calories %j", (calories) => {
    expect(create({ calories }).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.5, 20001])("rejects numeric calories %s", (calories) => {
    expect(create({ calories }).success).toBe(false);
  });

  it("accepts calories 0 and the max", () => {
    expect(create({ calories: "0" }).success).toBe(true);
    expect(create({ calories: "20000" }).success).toBe(true);
  });

  it.each(["-1", "-0.1", "1.25", "abc", "1e2", "10000", "9999.95", "NaN", "Infinity"])("rejects macro %j", (value) => {
    expect(create({ proteinGrams: value }).success).toBe(false);
  });

  it.each([Number.NaN, Number.POSITIVE_INFINITY, -1, 1.25, 10000])("rejects numeric macro %s", (value) => {
    expect(create({ fatGrams: value }).success).toBe(false);
  });

  it("accepts the Decimal(5,1) max 9999.9 and 1-decimal values", () => {
    expect(create({ carbsGrams: "9999.9" }).success).toBe(true);
    expect(create({ carbsGrams: 12.3 }).success).toBe(true);
  });

  it("rejects an invalid meal type", () => {
    expect(create({ mealType: "BRUNCH" }).success).toBe(false);
    expect(create({ mealType: "breakfast" }).success).toBe(false);
  });

  it.each(["2026-9-28", "2026-02-30", "2026-13-01", "20260928", "2026-09-28T00:00:00Z", "", "today"])("rejects entryDate %j", (entryDate) => {
    expect(create({ entryDate }).success).toBe(false);
  });

  it("rejects a client-supplied userId (strict) and a missing date", () => {
    expect(create({ userId: id }).success).toBe(false);
    expect(createNutritionEntrySchema.safeParse({ ...valid, entryDate: undefined }).success).toBe(false);
  });
});

describe("updateNutritionEntrySchema", () => {
  const { entryDate: _entryDate, ...fields } = valid;
  void _entryDate;

  it("accepts valid input with an id", () => {
    expect(updateNutritionEntrySchema.safeParse({ id, ...fields }).success).toBe(true);
  });

  it("rejects a bad id, userId and entryDate", () => {
    expect(updateNutritionEntrySchema.safeParse({ id: "x", ...fields }).success).toBe(false);
    expect(updateNutritionEntrySchema.safeParse({ id, ...fields, userId: id }).success).toBe(false);
    expect(updateNutritionEntrySchema.safeParse({ id, ...fields, entryDate: "2026-09-28" }).success).toBe(false);
  });
});

describe("deleteNutritionEntrySchema", () => {
  it("requires exactly a uuid id", () => {
    expect(deleteNutritionEntrySchema.safeParse({ id }).success).toBe(true);
    expect(deleteNutritionEntrySchema.safeParse({ id: "nope" }).success).toBe(false);
    expect(deleteNutritionEntrySchema.safeParse({ id, userId: id }).success).toBe(false);
  });
});
