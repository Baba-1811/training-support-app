import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => {
  const model = () => ({ findFirst: vi.fn(), findUnique: vi.fn(), aggregate: vi.fn(), create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() });
  return { auth: vi.fn(), session: model(), exercise: model(), entry: model(), set: model(), lock: vi.fn(), transaction: vi.fn(), revalidate: vi.fn() };
});
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: {
  workoutSession: mocks.session, workoutExercise: mocks.entry, workoutSet: mocks.set, exercise: mocks.exercise,
  $transaction: mocks.transaction,
} }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "REDIRECT") throw error; } }));
import * as actions from "@/app/(protected)/workouts/actions";
import { getWorkout } from "@/lib/workouts/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const exerciseId = "33333333-3333-4333-8333-333333333333";
const entryId = "44444444-4444-4444-8444-444444444444";
const setId = "55555555-5555-4555-8555-555555555555";
const values = { weightKg: "60", reps: "10", rir: "2", setType: "WORKING" };
const cases = [
  [actions.startWorkout, { title: "" }], [actions.updateWorkoutTitle, { sessionId, title: "変更" }],
  [actions.addExercise, { sessionId, exerciseId }], [actions.deleteWorkoutExercise, { workoutExerciseId: entryId }],
  [actions.createSet, { workoutExerciseId: entryId, setNumber: 1, ...values }],
  [actions.updateSet, { setId, ...values }], [actions.deleteSet, { setId }], [actions.finishWorkout, { sessionId }],
] as const;

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.session.create.mockResolvedValue({ id: sessionId });
  mocks.session.findFirst.mockResolvedValue({ id: sessionId, title: null, status: "IN_PROGRESS", startedAt: new Date(), completedAt: null, exercises: [] });
  mocks.entry.findFirst.mockResolvedValue({ id: entryId, workoutSessionId: sessionId });
  mocks.set.findFirst.mockResolvedValue({ workoutExercise: { workoutSessionId: sessionId } });
  mocks.set.findUnique.mockResolvedValue(null);
  mocks.exercise.findFirst.mockResolvedValue({ id: exerciseId });
  mocks.entry.aggregate.mockResolvedValue({ _max: { exerciseOrder: 5 } });
  mocks.lock.mockResolvedValue([{ status: "IN_PROGRESS", completedAt: null }]);
  for (const model of [mocks.session, mocks.entry, mocks.set]) {
    model.updateMany.mockResolvedValue({ count: 1 }); model.deleteMany.mockResolvedValue({ count: 1 });
  }
  mocks.transaction.mockImplementation(async (callback) => callback({
    workoutSession: mocks.session, workoutExercise: mocks.entry, workoutSet: mocks.set,
    exercise: mocks.exercise, $queryRaw: mocks.lock,
  }));
});
describe("workout server actions", () => {
  it.each(cases)("requires authentication before %s", async (action, input) => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(action(input)).rejects.toThrow("REDIRECT");
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.session.create).not.toHaveBeenCalled();
  });
  it.each(cases)("rejects injected userId for %s", async (action, input) => {
    expect(await action({ ...input, userId: owner })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.transaction).not.toHaveBeenCalled(); expect(mocks.session.create).not.toHaveBeenCalled();
  });
  it("creates only a session with server-owned identity and time", async () => {
    expect(await actions.startWorkout({ title: " " })).toEqual({ ok: true, data: { sessionId } });
    expect(mocks.session.create).toHaveBeenCalledWith({ data: { userId: owner, title: null, startedAt: expect.any(Date), status: "IN_PROGRESS" }, select: { id: true } });
    expect(mocks.set.create).not.toHaveBeenCalled();
  });
  it.each(cases.slice(1))("does not expose missing versus unowned resources for %s", async (action, input) => {
    mocks.lock.mockResolvedValue([]);
    expect(await action(input)).toMatchObject({ ok: false, code: "NOT_FOUND", message: "記録が見つかりません。" });
    expect(mocks.lock.mock.calls[0].slice(1)).toEqual([sessionId, owner]);
    expect(mocks.set.create).not.toHaveBeenCalled(); expect(mocks.session.updateMany).not.toHaveBeenCalled();
  });
  it("scopes the child lookup to the owner", async () => {
    mocks.entry.findFirst.mockResolvedValue(null);
    expect(await actions.createSet({ workoutExerciseId: entryId, setNumber: 1, ...values })).toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.entry.findFirst.mock.calls[0][0].where).toEqual({ id: entryId, workoutSession: { userId: owner } });
    mocks.set.findFirst.mockResolvedValue(null);
    expect(await actions.deleteSet({ setId })).toMatchObject({ code: "NOT_FOUND" });
    expect(mocks.set.findFirst.mock.calls[0][0].where).toEqual({ id: setId, workoutExercise: { workoutSession: { userId: owner } } });
  });
  it("adds an exercise without saving blank sets and preserves order gaps", async () => {
    expect(await actions.addExercise({ sessionId, exerciseId })).toMatchObject({ ok: true });
    expect(mocks.entry.create).toHaveBeenCalledWith({ data: { workoutSessionId: sessionId, exerciseId, exerciseOrder: 6 } });
    expect(mocks.set.create).not.toHaveBeenCalled();
    expect(mocks.session.updateMany).toHaveBeenCalledWith({ where: { id: sessionId, userId: owner }, data: { updatedAt: expect.any(Date) } });
  });
  it("creates a confirmed set with server time", async () => {
    expect(await actions.createSet({ workoutExerciseId: entryId, setNumber: 3, ...values })).toMatchObject({ ok: true });
    expect(mocks.set.create).toHaveBeenCalledWith({ data: { ...values, reps: 10, workoutExerciseId: entryId, setNumber: 3, completed: true, completedAt: expect.any(Date) } });
  });
  it("handles identical retries without creating another set", async () => {
    mocks.set.findUnique.mockResolvedValue({ completed: true, weightKg: "60.00", reps: 10, rir: "2.0", setType: "WORKING" });
    expect(await actions.createSet({ workoutExerciseId: entryId, setNumber: 1, ...values })).toMatchObject({ ok: true });
    expect(mocks.set.create).not.toHaveBeenCalled();
    expect(await actions.createSet({ workoutExerciseId: entryId, setNumber: 1, ...values, reps: "11" })).toMatchObject({ code: "CONFLICT" });
  });
  it.each(["COMPLETED", "CANCELLED"])("rejects new rows when %s", async (status) => {
    mocks.lock.mockResolvedValue([{ status, completedAt: new Date() }]);
    expect(await actions.addExercise({ sessionId, exerciseId })).toMatchObject({ code: "INVALID_STATE" });
    expect(await actions.createSet({ workoutExerciseId: entryId, setNumber: 1, ...values })).toMatchObject({ code: "INVALID_STATE" });
    expect(mocks.entry.create).not.toHaveBeenCalled(); expect(mocks.set.create).not.toHaveBeenCalled();
  });
  it("allows completed corrections and keeps timestamps and ownership filters", async () => {
    mocks.lock.mockResolvedValue([{ status: "COMPLETED", completedAt: new Date("2026-09-21") }]);
    expect(await actions.updateSet({ setId, ...values, setType: "WARMUP", rir: "" })).toMatchObject({ ok: true });
    expect(mocks.set.updateMany).toHaveBeenCalledWith({ where: { id: setId, completed: true, workoutExercise: { workoutSessionId: sessionId, workoutSession: { userId: owner } } }, data: { weightKg: "60", reps: 10, rir: null, setType: "WARMUP" } });
    expect(await actions.updateWorkoutTitle({ sessionId, title: "訂正" })).toMatchObject({ ok: true });
    expect(await actions.deleteSet({ setId })).toMatchObject({ ok: true });
    expect(await actions.deleteWorkoutExercise({ workoutExerciseId: entryId })).toMatchObject({ ok: true });
    expect(mocks.entry.deleteMany).toHaveBeenCalledWith({ where: { id: entryId, workoutSessionId: sessionId, workoutSession: { userId: owner } } });
  });
  it.each(cases.slice(1))("rejects edits to cancelled sessions for %s", async (action, input) => {
    mocks.lock.mockResolvedValue([{ status: "CANCELLED", completedAt: null }]);
    expect(await action(input)).toMatchObject({ code: "INVALID_STATE" });
  });
  it("finishes an empty session once without saving drafts", async () => {
    expect(await actions.finishWorkout({ sessionId })).toMatchObject({ ok: true });
    expect(mocks.session.updateMany).toHaveBeenCalledWith({ where: { id: sessionId, userId: owner, status: "IN_PROGRESS" }, data: { status: "COMPLETED", completedAt: expect.any(Date) } });
    expect(mocks.set.create).not.toHaveBeenCalled();
    mocks.session.updateMany.mockClear();
    mocks.lock.mockResolvedValue([{ status: "COMPLETED", completedAt: new Date("2026-09-21") }]);
    expect(await actions.finishWorkout({ sessionId })).toMatchObject({ ok: true });
    expect(mocks.session.updateMany).not.toHaveBeenCalled();
  });
  it("checks detail reads even without a protected layout", async () => {
    await getWorkout(sessionId);
    expect(mocks.auth).toHaveBeenCalled();
    expect(mocks.session.findFirst.mock.calls[0][0].where).toEqual({ id: sessionId, userId: owner });
  });
});
