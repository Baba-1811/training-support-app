import { beforeEach, describe, expect, it, vi } from "vitest";

// Auth call amplification fix: these internal *ForUser variants (lib/conditions/queries.ts) must never call
// requireUser() — they trust the userId the caller already confirmed once (see app/(protected)/page.tsx).
const mocks = vi.hoisted(() => ({ dailyCondition: { findUnique: vi.fn() }, jstDateOnly: vi.fn() }));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(() => { throw new Error("requireUser() should not be called by a ForUser variant"); }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { dailyCondition: mocks.dailyCondition } }));
vi.mock("@/lib/date/jst", () => ({ jstDateOnly: mocks.jstDateOnly }));
import { getTodayConditionForRecommendationForUser, getTodayConditionForUser } from "@/lib/conditions/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";
const today = new Date("2026-09-28T00:00:00.000Z");

beforeEach(() => {
  vi.resetAllMocks();
  mocks.jstDateOnly.mockReturnValue(today);
  mocks.dailyCondition.findUnique.mockResolvedValue(null);
});

describe("getTodayConditionForUser", () => {
  it("never calls requireUser() — it trusts the given userId", async () => {
    await expect(getTodayConditionForUser(owner)).resolves.toBeNull();
    expect(mocks.dailyCondition.findUnique.mock.calls[0][0].where).toEqual({ userId_conditionDate: { userId: owner, conditionDate: today } });
  });

  it("scopes strictly to the given userId, not any other", async () => {
    await getTodayConditionForUser(other);
    expect(mocks.dailyCondition.findUnique.mock.calls[0][0].where.userId_conditionDate.userId).toBe(other);
  });
});

describe("getTodayConditionForRecommendationForUser", () => {
  it("never calls requireUser() — it trusts the given userId", async () => {
    await expect(getTodayConditionForRecommendationForUser(owner)).resolves.toBeNull();
    expect(mocks.dailyCondition.findUnique.mock.calls[0][0].where).toEqual({ userId_conditionDate: { userId: owner, conditionDate: today } });
  });
});
