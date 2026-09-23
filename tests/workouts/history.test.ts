import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  session: { findMany: vi.fn() },
  entry: { findFirst: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutSession: mocks.session, workoutExercise: mocks.entry } }));
import { listCompletedWorkouts, getPreviousExercisePerformance } from "@/lib/workouts/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const exerciseId = "33333333-3333-4333-8333-333333333333";
const otherExerciseId = "44444444-4444-4444-8444-444444444444";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
});

describe("listCompletedWorkouts", () => {
  it("requires authentication before reading history", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(listCompletedWorkouts()).rejects.toThrow("REDIRECT");
    expect(mocks.session.findMany).not.toHaveBeenCalled();
  });

  it("only ever scopes the query to the authenticated owner (no other user's history is reachable)", async () => {
    mocks.session.findMany.mockResolvedValue([]);
    await listCompletedWorkouts();
    expect(mocks.session.findMany.mock.calls[0][0].where.userId).toBe(owner);
  });

  it("targets only COMPLETED sessions (IN_PROGRESS and CANCELLED are excluded), newest first", async () => {
    mocks.session.findMany.mockResolvedValue([]);
    await listCompletedWorkouts();
    expect(mocks.session.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: owner, status: "COMPLETED" },
      orderBy: { startedAt: "desc" },
    });
  });

  it("counts only completed WORKING sets, excluding WARMUP and unconfirmed rows", async () => {
    mocks.session.findMany.mockResolvedValue([{
      id: sessionId, title: null,
      startedAt: new Date("2026-09-20T01:00:00Z"), completedAt: new Date("2026-09-20T02:00:00Z"),
      exercises: [{
        exercise: { name: "ベンチプレス" },
        sets: [
          { setType: "WORKING", completed: true },
          { setType: "WORKING", completed: true },
          { setType: "WORKING", completed: false },
          { setType: "WARMUP", completed: true },
        ],
      }],
    }]);
    const result = await listCompletedWorkouts();
    expect(result).toEqual([{
      id: sessionId, title: null, startedAt: "2026-09-20T01:00:00.000Z", completedAt: "2026-09-20T02:00:00.000Z",
      exerciseNames: ["ベンチプレス"], workingSetCount: 2,
    }]);
  });
});

describe("getPreviousExercisePerformance", () => {
  it("requires authentication before reading previous performance", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getPreviousExercisePerformance(sessionId, "2026-09-21T00:00:00Z", [exerciseId])).rejects.toThrow("REDIRECT");
    expect(mocks.entry.findFirst).not.toHaveBeenCalled();
  });

  it("scopes to the owner, only COMPLETED sessions, excludes the current session, and searches strictly before startedAt", async () => {
    mocks.entry.findFirst.mockResolvedValue(null);
    await getPreviousExercisePerformance(sessionId, "2026-09-21T00:00:00Z", [exerciseId]);
    expect(mocks.entry.findFirst.mock.calls[0][0]).toMatchObject({
      where: { exerciseId, workoutSession: {
        userId: owner, status: "COMPLETED",
        id: { not: sessionId }, startedAt: { lt: new Date("2026-09-21T00:00:00Z") },
      } },
      orderBy: { workoutSession: { startedAt: "desc" } },
    });
  });

  it("only asks for completed WORKING sets, ordered by set number", async () => {
    mocks.entry.findFirst.mockResolvedValue(null);
    await getPreviousExercisePerformance(sessionId, "2026-09-21T00:00:00Z", [exerciseId]);
    expect(mocks.entry.findFirst.mock.calls[0][0].select.sets).toMatchObject({
      where: { completed: true, setType: "WORKING" }, orderBy: { setNumber: "asc" },
    });
  });

  it("returns the most recent prior WORKING sets for the exercise", async () => {
    mocks.entry.findFirst.mockResolvedValue({
      workoutSession: { startedAt: new Date("2026-09-18T00:00:00Z") },
      sets: [{ weightKg: "60.00", reps: 10 }, { weightKg: "60.00", reps: 9 }],
    });
    const result = await getPreviousExercisePerformance(sessionId, "2026-09-21T00:00:00Z", [exerciseId]);
    expect(result).toEqual({
      [exerciseId]: { startedAt: "2026-09-18T00:00:00.000Z", sets: [{ weightKg: "60.00", reps: 10 }, { weightKg: "60.00", reps: 9 }] },
    });
  });

  it("reports null when no prior completed record exists for the exercise", async () => {
    mocks.entry.findFirst.mockResolvedValue(null);
    const result = await getPreviousExercisePerformance(sessionId, "2026-09-21T00:00:00Z", [exerciseId]);
    expect(result).toEqual({ [exerciseId]: null });
  });

  it("looks up each exercise independently and never mixes another exercise's record in", async () => {
    mocks.entry.findFirst.mockImplementation(async ({ where }: { where: { exerciseId: string } }) =>
      where.exerciseId === exerciseId
        ? { workoutSession: { startedAt: new Date("2026-09-18T00:00:00Z") }, sets: [{ weightKg: "60.00", reps: 10 }] }
        : null);
    const result = await getPreviousExercisePerformance(sessionId, "2026-09-21T00:00:00Z", [exerciseId, otherExerciseId]);
    expect(result[exerciseId]?.sets).toEqual([{ weightKg: "60.00", reps: 10 }]);
    expect(result[otherExerciseId]).toBeNull();
    expect(mocks.entry.findFirst).toHaveBeenCalledTimes(2);
  });

  it("deduplicates a repeated exercise id into a single lookup", async () => {
    mocks.entry.findFirst.mockResolvedValue(null);
    await getPreviousExercisePerformance(sessionId, "2026-09-21T00:00:00Z", [exerciseId, exerciseId]);
    expect(mocks.entry.findFirst).toHaveBeenCalledTimes(1);
  });
});
