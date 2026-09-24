import { beforeEach, describe, expect, it, vi } from "vitest";
import type { WorkoutDTO } from "@/lib/workouts/types";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  entry: { findMany: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutExercise: mocks.entry } }));
import { getWorkoutAnalytics } from "@/lib/workouts/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const bench = "33333333-3333-4333-8333-333333333333";
const squat = "44444444-4444-4444-8444-444444444444";

const set = (weightKg: string, reps: number) => ({ id: `s-${weightKg}-${reps}`, setNumber: 1, weightKg, reps, rir: null, setType: "WORKING" as const, completed: true });
const workout = (status: WorkoutDTO["status"] = "COMPLETED"): WorkoutDTO => ({
  id: sessionId, title: null, startedAt: "2026-09-21T00:00:00.000Z", completedAt: "2026-09-21T01:00:00.000Z", status,
  exercises: [
    { id: "we-1", exerciseId: bench, name: "ベンチプレス", exerciseOrder: 1, muscles: [], sets: [set("60.00", 10)] },
    { id: "we-2", exerciseId: squat, name: "スクワット", exerciseOrder: 2, muscles: [], sets: [set("80.00", 5)] },
  ],
});
const past = (exerciseId: string, id: string, startedAt: string, weightKg: string, reps: number) => ({
  exerciseId, workoutSession: { id, startedAt: new Date(startedAt) },
  sets: [{ weightKg, reps, setType: "WORKING", completed: true }],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
});

describe("getWorkoutAnalytics", () => {
  it("requires authentication before reading anything", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getWorkoutAnalytics(workout())).rejects.toThrow("REDIRECT");
    expect(mocks.entry.findMany).not.toHaveBeenCalled();
  });

  it("scopes to the authenticated owner, COMPLETED sessions only, excluding the current session", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    await getWorkoutAnalytics(workout());
    expect(mocks.entry.findMany.mock.calls[0][0].where).toEqual({
      exerciseId: { in: [bench, squat] },
      workoutSession: { userId: owner, status: "COMPLETED", id: { not: sessionId } },
    });
  });

  it("only requests completed WORKING sets", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    await getWorkoutAnalytics(workout());
    expect(mocks.entry.findMany.mock.calls[0][0].select.sets.where).toEqual({ completed: true, setType: "WORKING" });
  });

  it("loads history for every exercise in a single query (no N+1) and deduplicates exercise ids", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    const base = workout();
    base.exercises.push({ ...base.exercises[0], id: "we-3", exerciseOrder: 3 });
    await getWorkoutAnalytics(base);
    expect(mocks.entry.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.entry.findMany.mock.calls[0][0].where.exerciseId.in).toEqual([bench, squat]);
  });

  it("derives previous, comparison and personal best per exercise without mixing exercises", async () => {
    mocks.entry.findMany.mockResolvedValue([
      past(bench, "a", "2026-09-10T00:00:00Z", "55.00", 10),
      past(bench, "b", "2026-09-18T00:00:00Z", "57.50", 10),
      past(squat, "c", "2026-09-12T00:00:00Z", "90.00", 5),
    ]);
    const result = await getWorkoutAnalytics(workout());
    expect(result["we-1"].previous?.startedAt).toBe("2026-09-18T00:00:00.000Z");
    expect(result["we-1"].comparison?.volumeDeltaKg).toBe(600 - 575);
    expect(result["we-1"].recordStatus).toBe("NEW_BEST");
    expect(result["we-2"].previous?.startedAt).toBe("2026-09-12T00:00:00.000Z");
    expect(result["we-2"].recordStatus).toBe("NONE");
    expect(result["we-2"].personalBestE1rmKg).toBeCloseTo(90 * (1 + 5 / 30));
  });

  it("reports FIRST_RECORD when the owner has no other completed history", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    const result = await getWorkoutAnalytics(workout());
    expect(result["we-1"]).toMatchObject({ previous: null, comparison: null, recordStatus: "FIRST_RECORD" });
  });

  it("returns nothing for a workout that is not COMPLETED (no confirmed analysis for IN_PROGRESS/CANCELLED)", async () => {
    expect(await getWorkoutAnalytics(workout("IN_PROGRESS"))).toEqual({});
    expect(await getWorkoutAnalytics(workout("CANCELLED"))).toEqual({});
    expect(mocks.entry.findMany).not.toHaveBeenCalled();
  });
});
