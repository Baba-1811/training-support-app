import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), dailyCondition: { findUnique: vi.fn() }, jstDateOnly: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { dailyCondition: mocks.dailyCondition } }));
vi.mock("@/lib/date/jst", () => ({ jstDateOnly: mocks.jstDateOnly }));
import { getTodayCondition, getTodayConditionForRecommendation } from "@/lib/conditions/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const today = new Date("2026-09-28T00:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.jstDateOnly.mockReturnValue(today);
});

describe("getTodayCondition", () => {
  it("requires authentication before reading", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getTodayCondition()).rejects.toThrow("REDIRECT");
    expect(mocks.dailyCondition.findUnique).not.toHaveBeenCalled();
  });

  it("returns null (未入力) when today has no DailyCondition yet", async () => {
    mocks.dailyCondition.findUnique.mockResolvedValue(null);
    await expect(getTodayCondition()).resolves.toBeNull();
  });

  it("scopes to the authenticated owner and the server's JST today, and loads MuscleCondition + Muscle in ONE query (no N+1)", async () => {
    mocks.dailyCondition.findUnique.mockResolvedValue(null);
    await getTodayCondition();
    expect(mocks.dailyCondition.findUnique).toHaveBeenCalledTimes(1);
    const args = mocks.dailyCondition.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ userId_conditionDate: { userId: owner, conditionDate: today } });
    expect(args.select.muscleConditions).toEqual({ select: { sorenessLevel: true, muscle: { select: { name: true } } } });
  });

  it("converts Decimal/Date to a plain DTO and restores UI categories from Muscle rows", async () => {
    mocks.dailyCondition.findUnique.mockResolvedValue({
      id: "cc", conditionDate: today, sleepHours: { toString: () => "7.5" }, fatigueLevel: 3, availableMinutes: 60,
      muscleConditions: [
        { sorenessLevel: 4, muscle: { name: "Quadriceps" } }, { sorenessLevel: 4, muscle: { name: "Hamstrings" } },
        { sorenessLevel: 4, muscle: { name: "Glutes" } }, { sorenessLevel: 4, muscle: { name: "Calves" } },
      ],
    });
    expect(await getTodayCondition()).toEqual({
      id: "cc", conditionDate: "2026-09-28", sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60,
      sorenessByCategory: { legs: 4 },
    });
  });

  it("returns 筋肉痛なし as an empty sorenessByCategory, not a missing/zero entry", async () => {
    mocks.dailyCondition.findUnique.mockResolvedValue({
      id: "cc", conditionDate: today, sleepHours: null, fatigueLevel: null, availableMinutes: null, muscleConditions: [],
    });
    expect(await getTodayCondition()).toMatchObject({ sleepHours: null, sorenessByCategory: {} });
  });
});

describe("getTodayConditionForRecommendation", () => {
  it("requires authentication before reading", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getTodayConditionForRecommendation()).rejects.toThrow("REDIRECT");
    expect(mocks.dailyCondition.findUnique).not.toHaveBeenCalled();
  });

  it("returns null when no Condition was entered today (distinct from the engine's own REST result)", async () => {
    mocks.dailyCondition.findUnique.mockResolvedValue(null);
    await expect(getTodayConditionForRecommendation()).resolves.toBeNull();
  });

  it("scopes to the authenticated owner and the server's JST today, in ONE query (no N+1)", async () => {
    mocks.dailyCondition.findUnique.mockResolvedValue(null);
    await getTodayConditionForRecommendation();
    expect(mocks.dailyCondition.findUnique).toHaveBeenCalledTimes(1);
    const args = mocks.dailyCondition.findUnique.mock.calls[0][0];
    expect(args.where).toEqual({ userId_conditionDate: { userId: owner, conditionDate: today } });
    expect(args.select.muscleConditions).toEqual({ select: { sorenessLevel: true, muscle: { select: { name: true } } } });
  });

  it("converts to ConditionRecommendationInputDTO via toRecommendationInput (individual Muscle names, not UI categories)", async () => {
    mocks.dailyCondition.findUnique.mockResolvedValue({
      conditionDate: today, sleepHours: { toString: () => "7.5" }, fatigueLevel: 3, availableMinutes: 60,
      muscleConditions: [{ sorenessLevel: 4, muscle: { name: "Quadriceps" } }, { sorenessLevel: 2, muscle: { name: "Chest" } }],
    });
    expect(await getTodayConditionForRecommendation()).toEqual({
      conditionDate: "2026-09-28", sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60,
      sorenessByMuscle: { Quadriceps: 4, Chest: 2 },
    });
  });
});
