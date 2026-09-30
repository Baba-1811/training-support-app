import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  session: { findMany: vi.fn() },
  entry: { findFirst: vi.fn(), findMany: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutSession: mocks.session, workoutExercise: mocks.entry } }));
import {
  listCompletedWorkouts, getPreviousExercisePerformance, getLatestExercisePerformance, reduceLatestExercisePerformance,
} from "@/lib/workouts/queries";

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

describe("getLatestExercisePerformance", () => {
  it("does not query the database at all for an empty exerciseIds list", async () => {
    const result = await getLatestExercisePerformance([]);
    expect(result).toEqual({});
    expect(mocks.entry.findMany).not.toHaveBeenCalled();
  });

  it("requires authentication before reading", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getLatestExercisePerformance([exerciseId])).rejects.toThrow("REDIRECT");
    expect(mocks.entry.findMany).not.toHaveBeenCalled();
  });

  it.each([1, 10])("issues exactly 2 bulk queries total for %d Exercise id(s) — never one query per Exercise", async (n) => {
    const ids = Array.from({ length: n }, (_, i) => `exercise-${i}`);
    mocks.entry.findMany.mockImplementation(async (args: { distinct?: string[] }) =>
      args.distinct
        ? ids.map((id) => ({ exerciseId: id, workoutSessionId: `session-${id}`, workoutSession: { startedAt: new Date("2026-09-18T00:00:00Z") } }))
        : ids.map((id) => ({ exerciseId: id, sets: [] })));
    await getLatestExercisePerformance(ids);
    expect(mocks.entry.findMany).toHaveBeenCalledTimes(2);
  });

  it("deduplicates a repeated exercise id before querying", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    await getLatestExercisePerformance([exerciseId, exerciseId]);
    expect(mocks.entry.findMany.mock.calls[0][0].where.exerciseId).toEqual({ in: [exerciseId] });
  });

  it("1st query: picks the latest COMPLETED session per Exercise via distinct + orderBy, owner-scoped, and skips the 2nd query when nobody has history", async () => {
    mocks.entry.findMany.mockResolvedValue([]); // no history at all -> short-circuits before the 2nd query
    const result = await getLatestExercisePerformance([exerciseId]);
    expect(result).toEqual({});
    expect(mocks.entry.findMany).toHaveBeenCalledTimes(1);
    const args = mocks.entry.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ exerciseId: { in: [exerciseId] }, workoutSession: { userId: owner, status: "COMPLETED" } });
    expect(args.distinct).toEqual(["exerciseId"]);
    expect(args.orderBy).toEqual({ workoutSession: { startedAt: "desc" } });
  });

  it("2nd query targets exact (Exercise, session) pairs via OR — never a broad any-exercise-in-any-session filter — and only completed WORKING sets", async () => {
    mocks.entry.findMany
      .mockResolvedValueOnce([{ exerciseId, workoutSessionId: sessionId, workoutSession: { startedAt: new Date("2026-09-18T00:00:00Z") } }])
      .mockResolvedValueOnce([]);
    await getLatestExercisePerformance([exerciseId]);
    const args = mocks.entry.findMany.mock.calls[1][0];
    expect(args.where).toEqual({ workoutSession: { userId: owner, status: "COMPLETED" }, OR: [{ exerciseId, workoutSessionId: sessionId }] });
    expect(args.select.sets).toMatchObject({ where: { completed: true, setType: "WORKING" }, orderBy: { setNumber: "asc" } });
  });

  it("converts Decimal weight and Date to the same primitive DTO shape as getPreviousExercisePerformance", async () => {
    mocks.entry.findMany
      .mockResolvedValueOnce([{ exerciseId, workoutSessionId: sessionId, workoutSession: { startedAt: new Date("2026-09-18T00:00:00Z") } }])
      .mockResolvedValueOnce([{ exerciseId, sets: [{ weightKg: { toString: () => "60.00" }, reps: 10 }] }]);
    const result = await getLatestExercisePerformance([exerciseId]);
    expect(result).toEqual({ [exerciseId]: { startedAt: "2026-09-18T00:00:00.000Z", sets: [{ weightKg: "60.00", reps: 10 }] } });
  });

  it("uses only the latest session's sets, never mixing an older session in (e.g. keeps 9/20, not 9/01)", async () => {
    mocks.entry.findMany
      .mockResolvedValueOnce([{ exerciseId, workoutSessionId: "session-0920", workoutSession: { startedAt: new Date("2026-09-20T00:00:00Z") } }])
      .mockResolvedValueOnce([{ exerciseId, sets: [{ weightKg: "65.00", reps: 6 }, { weightKg: "65.00", reps: 6 }] }]);
    const result = await getLatestExercisePerformance([exerciseId]);
    expect(result[exerciseId]).toEqual({ startedAt: "2026-09-20T00:00:00.000Z", sets: [{ weightKg: "65.00", reps: 6 }, { weightKg: "65.00", reps: 6 }] });
  });

  it("merges sets from two WorkoutExercise rows of the same Exercise within its latest session (schema allows this; see summarizeSessions precedent)", async () => {
    mocks.entry.findMany
      .mockResolvedValueOnce([{ exerciseId, workoutSessionId: sessionId, workoutSession: { startedAt: new Date("2026-09-18T00:00:00Z") } }])
      .mockResolvedValueOnce([
        { exerciseId, sets: [{ weightKg: "60.00", reps: 8 }] },
        { exerciseId, sets: [{ weightKg: "62.50", reps: 6 }] },
      ]);
    const result = await getLatestExercisePerformance([exerciseId]);
    expect(result[exerciseId]?.sets).toEqual([{ weightKg: "60.00", reps: 8 }, { weightKg: "62.50", reps: 6 }]);
  });

  it("omits an Exercise with no completed history, while still returning others that do", async () => {
    mocks.entry.findMany
      .mockResolvedValueOnce([{ exerciseId, workoutSessionId: sessionId, workoutSession: { startedAt: new Date("2026-09-18T00:00:00Z") } }])
      .mockResolvedValueOnce([{ exerciseId, sets: [{ weightKg: "60.00", reps: 8 }] }]);
    const result = await getLatestExercisePerformance([exerciseId, otherExerciseId]);
    expect(exerciseId in result).toBe(true);
    expect(otherExerciseId in result).toBe(false);
  });
});

describe("reduceLatestExercisePerformance (pure)", () => {
  it("pairs each Exercise's latest session date with its matching sets", () => {
    const result = reduceLatestExercisePerformance(
      [{ exerciseId, startedAt: new Date("2026-09-18T00:00:00Z") }],
      [{ exerciseId, weightKg: "60.00", reps: 8 }],
    );
    expect(result).toEqual({ [exerciseId]: { startedAt: "2026-09-18T00:00:00.000Z", sets: [{ weightKg: "60.00", reps: 8 }] } });
  });

  it("merges multiple set rows for the same Exercise (duplicate same-session WorkoutExercise rows)", () => {
    const result = reduceLatestExercisePerformance(
      [{ exerciseId, startedAt: new Date("2026-09-18T00:00:00Z") }],
      [{ exerciseId, weightKg: "60.00", reps: 8 }, { exerciseId, weightKg: "62.50", reps: 6 }],
    );
    expect(result[exerciseId]?.sets).toEqual([{ weightKg: "60.00", reps: 8 }, { weightKg: "62.50", reps: 6 }]);
  });

  it("gives an Exercise with a latest session but zero qualifying sets an empty array, not an absent entry", () => {
    const result = reduceLatestExercisePerformance([{ exerciseId, startedAt: new Date("2026-09-18T00:00:00Z") }], []);
    expect(result).toEqual({ [exerciseId]: { startedAt: "2026-09-18T00:00:00.000Z", sets: [] } });
  });

  it("omits an Exercise entirely when it has no latest-session entry at all", () => {
    expect(reduceLatestExercisePerformance([], [{ exerciseId, weightKg: "60.00", reps: 8 }])).toEqual({});
  });

  it("keeps multiple Exercises independent", () => {
    const result = reduceLatestExercisePerformance(
      [{ exerciseId, startedAt: new Date("2026-09-18T00:00:00Z") }, { exerciseId: otherExerciseId, startedAt: new Date("2026-09-20T00:00:00Z") }],
      [{ exerciseId, weightKg: "60.00", reps: 8 }, { exerciseId: otherExerciseId, weightKg: "100.00", reps: 5 }],
    );
    expect(Object.keys(result).sort()).toEqual([exerciseId, otherExerciseId].sort());
  });

  it("is independent of the order rows arrive in", () => {
    const latestSessions = [
      { exerciseId, startedAt: new Date("2026-09-18T00:00:00Z") },
      { exerciseId: otherExerciseId, startedAt: new Date("2026-09-20T00:00:00Z") },
    ];
    const setRows = [{ exerciseId, weightKg: "60.00", reps: 8 }, { exerciseId: otherExerciseId, weightKg: "100.00", reps: 5 }];
    expect(reduceLatestExercisePerformance([...latestSessions].reverse(), [...setRows].reverse()))
      .toEqual(reduceLatestExercisePerformance(latestSessions, setRows));
  });
});
