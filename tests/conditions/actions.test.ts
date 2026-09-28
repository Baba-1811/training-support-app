import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  dailyCondition: { upsert: vi.fn() },
  muscle: { findMany: vi.fn() },
  muscleCondition: { deleteMany: vi.fn(), createMany: vi.fn() },
  transaction: vi.fn(),
  revalidate: vi.fn(),
  jstDateOnly: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  dailyCondition: mocks.dailyCondition, muscle: mocks.muscle, muscleCondition: mocks.muscleCondition, $transaction: mocks.transaction,
} }));
vi.mock("@/lib/date/jst", () => ({ jstDateOnly: mocks.jstDateOnly }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "REDIRECT") throw error; } }));
import { saveDailyCondition } from "@/app/(protected)/condition/actions";

const owner = "11111111-1111-4111-8111-111111111111";
const conditionId = "22222222-2222-4222-8222-222222222222";
const today = new Date("2026-09-28T00:00:00.000Z");
const valid = { sleepHours: 7.5, fatigueLevel: 3, availableMinutes: 60, soreness: [{ category: "legs", sorenessLevel: 4 }] };
const legMuscles = ["Quadriceps", "Hamstrings", "Glutes", "Calves"];

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.jstDateOnly.mockReturnValue(today);
  mocks.dailyCondition.upsert.mockResolvedValue({ id: conditionId });
  mocks.muscle.findMany.mockImplementation(async ({ where }: { where: { name: { in: string[] } } }) =>
    where.name.in.map((name) => ({ id: `${name}-id`, name })));
  mocks.muscleCondition.deleteMany.mockResolvedValue({ count: 0 });
  mocks.muscleCondition.createMany.mockResolvedValue({ count: 0 });
  mocks.transaction.mockImplementation(async (callback: (tx: unknown) => unknown) => callback({
    dailyCondition: mocks.dailyCondition, muscle: mocks.muscle, muscleCondition: mocks.muscleCondition,
  }));
});

describe("saveDailyCondition (Server Action)", () => {
  it("requires authentication before touching the database", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(saveDailyCondition(valid)).rejects.toThrow("REDIRECT");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects an injected userId without ever starting a transaction", async () => {
    const result = await saveDailyCondition({ ...valid, userId: owner });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("rejects a client-supplied conditionDate; the server always decides JST today itself", async () => {
    const result = await saveDailyCondition({ ...valid, conditionDate: "2026-01-01" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("upserts on (userId, conditionDate) using the authenticated owner and the server's JST today, not the input", async () => {
    const result = await saveDailyCondition(valid);
    expect(result).toMatchObject({ ok: true, data: { id: conditionId } });
    expect(mocks.dailyCondition.upsert).toHaveBeenCalledWith(expect.objectContaining({
      where: { userId_conditionDate: { userId: owner, conditionDate: today } },
      create: expect.objectContaining({ userId: owner, conditionDate: today, sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60 }),
      update: expect.objectContaining({ sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60 }),
    }));
  });

  it("keeps saving to the same row on a repeated call the same day (upsert, never a second DailyCondition)", async () => {
    await saveDailyCondition(valid);
    await saveDailyCondition({ ...valid, fatigueLevel: 5 });
    expect(mocks.dailyCondition.upsert).toHaveBeenCalledTimes(2);
    const wheres = mocks.dailyCondition.upsert.mock.calls.map((call) => call[0].where);
    expect(wheres[0]).toEqual(wheres[1]);
  });

  it("expands a category into every one of its Muscle names with the same sorenessLevel", async () => {
    await saveDailyCondition(valid);
    expect(mocks.muscle.findMany).toHaveBeenCalledWith({ where: { name: { in: expect.arrayContaining(legMuscles) }, isActive: true }, select: { id: true, name: true } });
    expect(mocks.muscleCondition.createMany).toHaveBeenCalledWith({
      data: expect.arrayContaining(legMuscles.map((name) => ({ dailyConditionId: conditionId, muscleId: `${name}-id`, sorenessLevel: 4 }))),
    });
    expect(mocks.muscleCondition.createMany.mock.calls[0][0].data).toHaveLength(4);
  });

  it("replaces MuscleCondition completely: deleteMany before createMany, both scoped to this DailyCondition", async () => {
    await saveDailyCondition(valid);
    expect(mocks.muscleCondition.deleteMany).toHaveBeenCalledWith({ where: { dailyConditionId: conditionId } });
    const deleteOrder = mocks.muscleCondition.deleteMany.mock.invocationCallOrder[0];
    const createOrder = mocks.muscleCondition.createMany.mock.invocationCallOrder[0];
    expect(deleteOrder).toBeLessThan(createOrder);
  });

  it("clearing every category (筋肉痛なし) deletes the rows and never calls createMany", async () => {
    await saveDailyCondition({ ...valid, soreness: [] });
    expect(mocks.muscleCondition.deleteMany).toHaveBeenCalledWith({ where: { dailyConditionId: conditionId } });
    expect(mocks.muscleCondition.createMany).not.toHaveBeenCalled();
  });

  it("fails the whole save when a requested Muscle is missing or inactive (no partial save)", async () => {
    mocks.muscle.findMany.mockResolvedValue([
      { id: "Quadriceps-id", name: "Quadriceps" }, { id: "Hamstrings-id", name: "Hamstrings" }, { id: "Glutes-id", name: "Glutes" },
    ]); // Calves missing/inactive
    const result = await saveDailyCondition(valid);
    expect(result).toMatchObject({ ok: false, code: "MUSCLE_UNAVAILABLE" });
    expect(mocks.muscleCondition.deleteMany).not.toHaveBeenCalled();
    expect(mocks.muscleCondition.createMany).not.toHaveBeenCalled();
  });

  it("runs the DailyCondition upsert and MuscleCondition replace in one transaction (atomicity)", async () => {
    await saveDailyCondition(valid);
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
  });

  it("revalidates Home and /condition after a successful save", async () => {
    await saveDailyCondition(valid);
    expect(mocks.revalidate).toHaveBeenCalledWith("/");
    expect(mocks.revalidate).toHaveBeenCalledWith("/condition");
  });

  it("rejects invalid input (e.g. an unknown category) before ever starting a transaction", async () => {
    const result = await saveDailyCondition({ ...valid, soreness: [{ category: "traps", sorenessLevel: 1 }] });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
