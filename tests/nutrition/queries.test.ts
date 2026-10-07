import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/app/generated/prisma/client";

// The ForUser queries must never call requireUser(); the public dashboard calls it exactly once.
const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  nutritionEntry: { findMany: vi.fn() },
  nutritionTarget: { findFirst: vi.fn() },
  bodyMeasurement: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({
  prisma: {
    nutritionEntry: mocks.nutritionEntry, nutritionTarget: mocks.nutritionTarget, bodyMeasurement: mocks.bodyMeasurement,
  },
}));
import {
  getBodyWeightForDateForUser, getCurrentNutritionTargetForUser, getNutritionDashboard, getNutritionDashboardForUser,
  getNutritionEntriesForUser, getNutritionHomeForUser, getRecentBodyWeightsForUser,
} from "@/lib/nutrition/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const date = new Date("2026-09-28T00:00:00.000Z");
// The JST day 2026-09-28 is [2026-09-27T15:00Z, 2026-09-28T15:00Z).
const dayStart = new Date("2026-09-27T15:00:00.000Z");
const dayEnd = new Date("2026-09-28T15:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.nutritionEntry.findMany.mockResolvedValue([]);
  mocks.nutritionTarget.findFirst.mockResolvedValue(null);
  mocks.bodyMeasurement.findFirst.mockResolvedValue(null);
  mocks.bodyMeasurement.findMany.mockResolvedValue([]);
});

describe("getNutritionEntriesForUser", () => {
  it("scopes by userId + the DATE, and orders by createdAt, id", async () => {
    await getNutritionEntriesForUser(owner, date);
    const args = mocks.nutritionEntry.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ userId: owner, entryDate: date });
    expect(args.orderBy).toEqual([{ createdAt: "asc" }, { id: "asc" }]);
  });

  it("uses the given user, not another", async () => {
    await getNutritionEntriesForUser(other, date);
    expect(mocks.nutritionEntry.findMany.mock.calls[0][0].where.userId).toBe(other);
  });

  it("returns meal-ordered DTOs with numbers", async () => {
    const base = { entryDate: date, name: "n", calories: 100, fatGrams: null, carbsGrams: null };
    mocks.nutritionEntry.findMany.mockResolvedValue([
      { ...base, id: "d", mealType: "DINNER", proteinGrams: new Prisma.Decimal("20.5"), createdAt: new Date("2026-09-28T01:00:00Z") },
      { ...base, id: "b", mealType: "BREAKFAST", proteinGrams: null, createdAt: new Date("2026-09-28T02:00:00Z") },
    ]);
    const result = await getNutritionEntriesForUser(owner, date);
    expect(result.map((e) => e.id)).toEqual(["b", "d"]);
    expect(result[1].proteinGrams).toBe(20.5);
  });
});

describe("getCurrentNutritionTargetForUser", () => {
  it("returns null when no target exists", async () => {
    await expect(getCurrentNutritionTargetForUser(owner, date)).resolves.toBeNull();
  });

  it("selects effectiveFrom <= date (future targets excluded, same-day included), latest effectiveFrom then createdAt", async () => {
    await getCurrentNutritionTargetForUser(owner, date);
    const args = mocks.nutritionTarget.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ userId: owner, effectiveFrom: { lte: date } });
    expect(args.orderBy).toEqual([{ effectiveFrom: "desc" }, { createdAt: "desc" }]);
  });

  it("uses the given user, not another", async () => {
    await getCurrentNutritionTargetForUser(other, date);
    expect(mocks.nutritionTarget.findFirst.mock.calls[0][0].where.userId).toBe(other);
  });

  it("maps the row to a number-based DTO", async () => {
    mocks.nutritionTarget.findFirst.mockResolvedValue({
      id: "t", targetCalories: 2500, targetProtein: new Prisma.Decimal("160.0"), targetFat: null, targetCarbs: null,
      effectiveFrom: new Date("2026-09-28T00:00:00.000Z"), createdAt: new Date(),
    });
    await expect(getCurrentNutritionTargetForUser(owner, date)).resolves.toEqual({
      id: "t", targetCalories: 2500, targetProtein: 160, targetFat: null, targetCarbs: null, effectiveFrom: "2026-09-28",
    });
  });
});

describe("getBodyWeightForDateForUser", () => {
  it("returns null when nothing was measured that day", async () => {
    await expect(getBodyWeightForDateForUser(owner, date)).resolves.toBeNull();
  });

  it("filters by the JST day's instant range (not UTC midnight), owner-scoped, latest measurement first", async () => {
    await getBodyWeightForDateForUser(owner, date);
    const args = mocks.bodyMeasurement.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ userId: owner, measuredAt: { gte: dayStart, lt: dayEnd } });
    expect(args.orderBy).toEqual([{ measuredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }]);
  });

  it("uses the given user, not another", async () => {
    await getBodyWeightForDateForUser(other, date);
    expect(mocks.bodyMeasurement.findFirst.mock.calls[0][0].where.userId).toBe(other);
  });

  it("converts Decimal weight to number", async () => {
    mocks.bodyMeasurement.findFirst.mockResolvedValue({
      id: "w", weightKg: new Prisma.Decimal("68.25"), measuredAt: new Date("2026-09-28T00:00:00.000Z"),
    });
    await expect(getBodyWeightForDateForUser(owner, date)).resolves.toEqual({
      id: "w", measuredAt: "2026-09-28T00:00:00.000Z", weightKg: 68.25, bodyFatPercent: null,
    });
  });
});

describe("getRecentBodyWeightsForUser", () => {
  it("returns [] when there are no measurements", async () => {
    await expect(getRecentBodyWeightsForUser(owner, date)).resolves.toEqual([]);
  });

  it("defaults to the last 30 JST days through the end of the day, newest 100, owner-scoped", async () => {
    await getRecentBodyWeightsForUser(owner, date);
    const args = mocks.bodyMeasurement.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      userId: owner, measuredAt: { gte: new Date("2026-08-29T15:00:00.000Z"), lt: dayEnd },
    });
    expect(args.orderBy).toEqual([{ measuredAt: "desc" }, { createdAt: "desc" }, { id: "desc" }]);
    expect(args.take).toBe(100);
  });

  it("honours days/limit options", async () => {
    await getRecentBodyWeightsForUser(other, date, { days: 7, limit: 5 });
    const args = mocks.bodyMeasurement.findMany.mock.calls[0][0];
    expect(args.where.userId).toBe(other);
    expect(args.where.measuredAt.gte).toEqual(new Date("2026-09-21T15:00:00.000Z"));
    expect(args.take).toBe(5);
  });

  it("returns oldest -> newest as numbers", async () => {
    mocks.bodyMeasurement.findMany.mockResolvedValue([
      { id: "new", weightKg: new Prisma.Decimal("70.10"), measuredAt: new Date("2026-09-28T01:00:00Z") },
      { id: "old", weightKg: new Prisma.Decimal("71.00"), measuredAt: new Date("2026-09-20T01:00:00Z") },
    ]);
    const result = await getRecentBodyWeightsForUser(owner, date);
    expect(result.map((w) => w.id)).toEqual(["old", "new"]);
    expect(result.map((w) => w.weightKg)).toEqual([71, 70.1]);
  });
});

describe("getNutritionDashboardForUser / getNutritionDashboard", () => {
  it("never calls requireUser() from the ForUser variant, and queries every source with the given user and date", async () => {
    await getNutritionDashboardForUser(other, date);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.nutritionEntry.findMany.mock.calls[0][0].where).toEqual({ userId: other, entryDate: date });
    expect(mocks.nutritionTarget.findFirst.mock.calls[0][0].where.userId).toBe(other);
    expect(mocks.bodyMeasurement.findFirst.mock.calls[0][0].where.userId).toBe(other);
    expect(mocks.bodyMeasurement.findMany.mock.calls[0][0].where.userId).toBe(other);
  });

  it("composes entries, summary, target, weight and recent weights", async () => {
    mocks.nutritionEntry.findMany.mockResolvedValue([
      { id: "1", entryDate: date, mealType: "LUNCH", name: "a", calories: 300, proteinGrams: new Prisma.Decimal("20.0"), fatGrams: null, carbsGrams: null, createdAt: new Date() },
      { id: "2", entryDate: date, mealType: "DINNER", name: "b", calories: 500, proteinGrams: new Prisma.Decimal("30.5"), fatGrams: null, carbsGrams: null, createdAt: new Date() },
    ]);
    const weightRow = { id: "w", weightKg: new Prisma.Decimal("70.00"), measuredAt: new Date("2026-09-28T01:00:00Z") };
    mocks.bodyMeasurement.findFirst.mockResolvedValue(weightRow);
    mocks.bodyMeasurement.findMany.mockResolvedValue([weightRow]);
    const result = await getNutritionDashboardForUser(owner, date);
    expect(result.date).toBe("2026-09-28");
    expect(result.entries).toHaveLength(2);
    expect(result.summary).toEqual({ calories: 800, proteinGrams: 50.5, fatGrams: null, carbsGrams: null });
    expect(result.target).toBeNull();
    expect(result.weight?.weightKg).toBe(70);
    expect(result.recentWeights).toHaveLength(1);
  });

  it("the public variant authenticates once and passes that user.id to every query", async () => {
    await getNutritionDashboard(date);
    expect(mocks.auth).toHaveBeenCalledTimes(1);
    expect(mocks.nutritionEntry.findMany.mock.calls[0][0].where.userId).toBe(owner);
    expect(mocks.nutritionTarget.findFirst.mock.calls[0][0].where.userId).toBe(owner);
    expect(mocks.bodyMeasurement.findFirst.mock.calls[0][0].where.userId).toBe(owner);
    expect(mocks.bodyMeasurement.findMany.mock.calls[0][0].where.userId).toBe(owner);
  });

  it("reads nothing when authentication fails", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getNutritionDashboard(date)).rejects.toThrow("REDIRECT");
    expect(mocks.nutritionEntry.findMany).not.toHaveBeenCalled();
    expect(mocks.bodyMeasurement.findFirst).not.toHaveBeenCalled();
  });
});

describe("getNutritionHomeForUser", () => {
  const entry = (id: string, calories: number) => ({
    id, entryDate: date, mealType: "LUNCH", name: id, calories, proteinGrams: null, fatGrams: null, carbsGrams: null, createdAt: new Date(),
  });

  it("nothing recorded: 0 items, 0 kcal, no target, no weight", async () => {
    await expect(getNutritionHomeForUser(owner, date)).resolves.toEqual({
      date: "2026-09-28", entryCount: 0, calories: 0, targetCalories: null, weight: null,
    });
  });

  it("counts entries (items, not meals), sums calories, and carries the effective target and today's weight", async () => {
    mocks.nutritionEntry.findMany.mockResolvedValue([entry("a", 600), entry("b", 450), entry("c", 800)]);
    mocks.nutritionTarget.findFirst.mockResolvedValue({
      id: "t", targetCalories: 2200, targetProtein: null, targetFat: null, targetCarbs: null, effectiveFrom: new Date("2026-09-01T00:00:00Z"),
    });
    mocks.bodyMeasurement.findFirst.mockResolvedValue({
      id: "w", weightKg: new Prisma.Decimal("65.40"), bodyFatPercent: null, measuredAt: new Date("2026-09-28T03:00:00Z"),
    });
    const result = await getNutritionHomeForUser(owner, date);
    expect([result.entryCount, result.calories, result.targetCalories]).toEqual([3, 1850, 2200]);
    expect(result.weight).toMatchObject({ weightKg: 65.4, bodyFatPercent: null });
  });

  it("a target of 0 is passed through as 0 (the card decides not to divide by it)", async () => {
    mocks.nutritionTarget.findFirst.mockResolvedValue({
      id: "t", targetCalories: 0, targetProtein: null, targetFat: null, targetCarbs: null, effectiveFrom: new Date("2026-09-01T00:00:00Z"),
    });
    expect((await getNutritionHomeForUser(owner, date)).targetCalories).toBe(0);
  });

  it("is owner-scoped, reuses the current-target and day-weight semantics, and neither authenticates nor reads 30-day weights", async () => {
    await getNutritionHomeForUser(other, date);
    expect(mocks.auth).not.toHaveBeenCalled();
    expect(mocks.nutritionEntry.findMany.mock.calls[0][0].where).toEqual({ userId: other, entryDate: date });
    expect(mocks.nutritionTarget.findFirst.mock.calls[0][0]).toMatchObject({
      where: { userId: other, effectiveFrom: { lte: date } }, orderBy: [{ effectiveFrom: "desc" }, { createdAt: "desc" }],
    });
    expect(mocks.bodyMeasurement.findFirst.mock.calls[0][0].where).toEqual({ userId: other, measuredAt: { gte: dayStart, lt: dayEnd } });
    expect(mocks.nutritionEntry.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.nutritionTarget.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.bodyMeasurement.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.bodyMeasurement.findMany).not.toHaveBeenCalled();
  });
});
