import { describe, expect, it } from "vitest";
import { saveDailyConditionSchema } from "@/lib/conditions/validation";

const valid = { sleepHours: 7, fatigueLevel: 3, availableMinutes: 60, soreness: [{ category: "legs", sorenessLevel: 4 }] };

describe("saveDailyConditionSchema", () => {
  it("accepts a fully valid input, including no soreness at all", () => {
    expect(saveDailyConditionSchema.safeParse(valid).success).toBe(true);
    expect(saveDailyConditionSchema.safeParse({ ...valid, soreness: [] }).success).toBe(true);
  });

  it.each([0, 0.5, 7.5, 23.5, 24])("accepts sleepHours %s (0.5 steps within DB CHECK 0-24)", (sleepHours) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, sleepHours }).success).toBe(true);
  });
  it.each([-0.5, 24.5, 7.1, 0.25, NaN, Infinity])("rejects sleepHours %s", (sleepHours) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, sleepHours }).success).toBe(false);
  });

  it.each([1, 2, 3, 4, 5])("accepts fatigueLevel %s", (fatigueLevel) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, fatigueLevel }).success).toBe(true);
  });
  it.each([0, 6, 1.5, -1])("rejects fatigueLevel %s", (fatigueLevel) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, fatigueLevel }).success).toBe(false);
  });

  it.each([30, 45, 60, 90])("accepts availableMinutes %s (the allowlist)", (availableMinutes) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, availableMinutes }).success).toBe(true);
  });
  it.each([0, 15, 61, 120, -30])("rejects availableMinutes %s (not in the allowlist)", (availableMinutes) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, availableMinutes }).success).toBe(false);
  });

  it.each(["chest", "back", "shoulders", "arms", "legs", "abs"])("accepts soreness category %s", (category) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, soreness: [{ category, sorenessLevel: 1 }] }).success).toBe(true);
  });
  it("rejects an unknown soreness category", () => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, soreness: [{ category: "traps", sorenessLevel: 1 }] }).success).toBe(false);
  });
  it.each([1, 2, 3, 4, 5])("accepts sorenessLevel %s", (sorenessLevel) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, soreness: [{ category: "legs", sorenessLevel }] }).success).toBe(true);
  });
  it.each([0, 6, -1])("rejects sorenessLevel %s (0 especially: soreness=0 is never stored)", (sorenessLevel) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, soreness: [{ category: "legs", sorenessLevel }] }).success).toBe(false);
  });

  it("rejects a duplicate category", () => {
    expect(saveDailyConditionSchema.safeParse({
      ...valid, soreness: [{ category: "legs", sorenessLevel: 2 }, { category: "legs", sorenessLevel: 4 }],
    }).success).toBe(false);
  });

  it.each([
    { userId: "11111111-1111-4111-8111-111111111111" },
    { conditionDate: "2026-09-28" },
    { extra: "field" },
  ])("rejects an injected/unknown top-level field %j", (patch) => {
    expect(saveDailyConditionSchema.safeParse({ ...valid, ...patch }).success).toBe(false);
  });

  it("rejects a Muscle ID smuggled in through a soreness entry (category + level only)", () => {
    expect(saveDailyConditionSchema.safeParse({
      ...valid, soreness: [{ category: "legs", sorenessLevel: 1, muscleId: "11111111-1111-4111-8111-111111111111" }],
    }).success).toBe(false);
  });
});
