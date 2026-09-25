import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() });
  return { auth: vi.fn(), session: model(), exercise: model(), entry: model(), lock: vi.fn(), transaction: vi.fn(), revalidate: vi.fn() };
});
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  workoutSession: mocks.session, workoutExercise: mocks.entry, exercise: mocks.exercise, $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "REDIRECT") throw error; } }));
import * as actions from "@/app/(protected)/workouts/actions";

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const exerciseId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.exercise.findFirst.mockResolvedValue({ id: exerciseId });
  mocks.session.create.mockResolvedValue({ id: sessionId });
  mocks.session.findFirst.mockResolvedValue({ id: sessionId, title: null, status: "IN_PROGRESS", startedAt: new Date(), completedAt: null, exercises: [] });
  mocks.session.updateMany.mockResolvedValue({ count: 1 });
  mocks.entry.aggregate.mockResolvedValue({ _max: { exerciseOrder: 2 } });
  mocks.lock.mockResolvedValue([{ status: "IN_PROGRESS", completedAt: null }]);
  mocks.transaction.mockImplementation(async (callback) => callback({
    workoutSession: mocks.session, workoutExercise: mocks.entry, exercise: mocks.exercise, $queryRaw: mocks.lock,
  }));
});

// Exercise Library, no unfinished workout: one server call makes the session AND its first exercise.
describe("startWorkoutWithExercise (no IN_PROGRESS workout)", () => {
  it("creates the session with the first exercise in a single transaction and a single nested create", async () => {
    expect(await actions.startWorkoutWithExercise({ exerciseId })).toEqual({ ok: true, data: { sessionId } });
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.session.create).toHaveBeenCalledTimes(1);
    expect(mocks.session.create).toHaveBeenCalledWith({
      data: {
        userId: owner, startedAt: expect.any(Date), status: "IN_PROGRESS",
        exercises: { create: { exerciseId, exerciseOrder: 1 } },
      },
      select: { id: true },
    });
    // The exercise is never attached by a separate follow-up write that could fail on its own.
    expect(mocks.entry.create).not.toHaveBeenCalled();
  });

  it("checks the exercise inside the same transaction and only accepts an active one", async () => {
    await actions.startWorkoutWithExercise({ exerciseId });
    expect(mocks.exercise.findFirst).toHaveBeenCalledWith({ where: { id: exerciseId, isActive: true }, select: { id: true } });
  });

  it("rejects an inactive or unknown exercise without creating anything", async () => {
    mocks.exercise.findFirst.mockResolvedValue(null);
    expect(await actions.startWorkoutWithExercise({ exerciseId })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(mocks.session.create).not.toHaveBeenCalled();
  });

  it("leaves no partial workout when the write fails (the transaction is not swallowed)", async () => {
    mocks.session.create.mockRejectedValue(new Error("db down"));
    const spy = vi.spyOn(console, "error").mockImplementation(() => undefined);
    expect(await actions.startWorkoutWithExercise({ exerciseId })).toMatchObject({ ok: false, code: "FAILED" });
    expect(mocks.session.create).toHaveBeenCalledTimes(1);
    expect(mocks.entry.create).not.toHaveBeenCalled();
    spy.mockRestore();
  });

  it("requires authentication before touching the database", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(actions.startWorkoutWithExercise({ exerciseId })).rejects.toThrow("REDIRECT");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.session.create).not.toHaveBeenCalled();
  });

  it("takes the owner from the server session, and rejects any userId / sessionId sent by the client", async () => {
    for (const extra of [{ userId: owner }, { userId: "99999999-9999-4999-8999-999999999999" }, { sessionId }]) {
      expect(await actions.startWorkoutWithExercise({ exerciseId, ...extra })).toMatchObject({ ok: false, code: "VALIDATION" });
    }
    expect(mocks.session.create).not.toHaveBeenCalled();
    await actions.startWorkoutWithExercise({ exerciseId });
    expect(mocks.session.create.mock.calls[0][0].data.userId).toBe(owner);
  });

  it.each([undefined, null, "", "not-a-uuid", 123, { id: exerciseId }])("rejects an invalid exerciseId %j", async (bad) => {
    expect(await actions.startWorkoutWithExercise({ exerciseId: bad })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await actions.startWorkoutWithExercise(undefined)).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});

// Exercise Library, a workout is in progress: the existing addExercise is reused as it is.
describe("adding to the existing IN_PROGRESS workout (addExercise reused)", () => {
  it("appends after the last exercise of that session, ownership-locked", async () => {
    expect(await actions.addExercise({ sessionId, exerciseId })).toMatchObject({ ok: true });
    expect(mocks.lock.mock.calls[0].slice(1)).toEqual([sessionId, owner]);
    expect(mocks.entry.create).toHaveBeenCalledWith({ data: { workoutSessionId: sessionId, exerciseId, exerciseOrder: 3 } });
    expect(mocks.session.create).not.toHaveBeenCalled(); // never a second IN_PROGRESS workout
  });

  it("keeps the current behaviour for an exercise already in the workout: it is added again", async () => {
    // addExercise has never de-duplicated; the library must not change that. Two calls -> two entries.
    await actions.addExercise({ sessionId, exerciseId });
    await actions.addExercise({ sessionId, exerciseId });
    expect(mocks.entry.create).toHaveBeenCalledTimes(2);
  });

  it("does not expose someone else's (or a missing) workout", async () => {
    mocks.lock.mockResolvedValue([]);
    expect(await actions.addExercise({ sessionId, exerciseId })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(mocks.entry.create).not.toHaveBeenCalled();
  });

  it("rejects an inactive exercise", async () => {
    mocks.exercise.findFirst.mockResolvedValue(null);
    expect(await actions.addExercise({ sessionId, exerciseId })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(mocks.exercise.findFirst).toHaveBeenCalledWith({ where: { id: exerciseId, isActive: true }, select: { id: true } });
    expect(mocks.entry.create).not.toHaveBeenCalled();
  });

  it("refuses a workout that is no longer in progress", async () => {
    mocks.lock.mockResolvedValue([{ status: "COMPLETED", completedAt: new Date() }]);
    expect(await actions.addExercise({ sessionId, exerciseId })).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect(mocks.entry.create).not.toHaveBeenCalled();
  });
});
