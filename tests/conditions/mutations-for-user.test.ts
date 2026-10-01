import { beforeEach, describe, expect, it, vi } from "vitest";

// Auth call amplification fix: saveDailyConditionForUser (lib/conditions/mutations.ts) must never call
// requireUser() — it trusts the userId the Condition Server Action already confirmed once (see
// app/(protected)/condition/actions.ts).
const mocks = vi.hoisted(() => ({
  dailyCondition: { upsert: vi.fn() }, muscle: { findMany: vi.fn() },
  muscleCondition: { deleteMany: vi.fn(), createMany: vi.fn() },
  transaction: vi.fn(), jstDateOnly: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(() => { throw new Error("requireUser() should not be called by a ForUser variant"); }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: {
  dailyCondition: mocks.dailyCondition, muscle: mocks.muscle, muscleCondition: mocks.muscleCondition, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/date/jst", () => ({ jstDateOnly: mocks.jstDateOnly }));
import { saveDailyConditionForUser } from "@/lib/conditions/mutations";

const owner = "11111111-1111-4111-8111-111111111111";
const conditionId = "22222222-2222-4222-8222-222222222222";
const today = new Date("2026-09-28T00:00:00.000Z");
const valid = { sleepHours: 7.5, fatigueLevel: 3, availableMinutes: 60, soreness: [] as { category: "legs"; sorenessLevel: number }[] };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.jstDateOnly.mockReturnValue(today);
  mocks.dailyCondition.upsert.mockResolvedValue({ id: conditionId });
  mocks.muscleCondition.deleteMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    dailyCondition: mocks.dailyCondition, muscle: mocks.muscle, muscleCondition: mocks.muscleCondition,
  }));
});

describe("saveDailyConditionForUser", () => {
  it("never calls requireUser() — it trusts the given userId", async () => {
    await expect(saveDailyConditionForUser(owner, valid)).resolves.toBe(conditionId);
    expect(mocks.dailyCondition.upsert.mock.calls[0][0].where).toEqual({ userId_conditionDate: { userId: owner, conditionDate: today } });
  });
});
