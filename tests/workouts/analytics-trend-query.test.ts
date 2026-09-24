import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  entry: { findMany: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutExercise: mocks.entry } }));
import { listExerciseTrends } from "@/lib/workouts/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const bench = "33333333-3333-4333-8333-333333333333";
const squat = "44444444-4444-4444-8444-444444444444";

const row = (exerciseId: string, name: string, sessionId: string, startedAt: string, weightKg: string, reps: number) => ({
  exerciseId, exercise: { name }, workoutSession: { id: sessionId, startedAt: new Date(startedAt) },
  sets: [{ weightKg, reps, setType: "WORKING", completed: true }],
});

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
});

describe("listExerciseTrends", () => {
  it("requires authentication before reading anything", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(listExerciseTrends()).rejects.toThrow("REDIRECT");
    expect(mocks.entry.findMany).not.toHaveBeenCalled();
  });

  it("scopes to the authenticated user's COMPLETED sessions that have a completed WORKING set", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    await listExerciseTrends();
    const args = mocks.entry.findMany.mock.calls[0][0];
    expect(args.where).toEqual({
      workoutSession: { userId: owner, status: "COMPLETED" },
      sets: { some: { completed: true, setType: "WORKING" } },
    });
    expect(JSON.stringify(args.where)).not.toMatch(/IN_PROGRESS|CANCELLED/);
  });

  it("only loads completed WORKING sets", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    await listExerciseTrends();
    expect(mocks.entry.findMany.mock.calls[0][0].select.sets.where).toEqual({ completed: true, setType: "WORKING" });
  });

  it("uses the id of the authenticated user only (takes no user input)", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    expect(listExerciseTrends.length).toBe(0);
    await listExerciseTrends();
    expect(mocks.entry.findMany.mock.calls[0][0].where.workoutSession.userId).toBe(owner);
  });

  it("loads every exercise with a single query (no N+1)", async () => {
    mocks.entry.findMany.mockResolvedValue([
      row(bench, "ベンチプレス", "a", "2026-09-01T00:00:00Z", "60.00", 10),
      row(bench, "ベンチプレス", "b", "2026-09-10T00:00:00Z", "62.50", 10),
      row(squat, "スクワット", "c", "2026-09-12T00:00:00Z", "100.00", 5),
    ]);
    const trends = await listExerciseTrends();
    expect(mocks.entry.findMany).toHaveBeenCalledTimes(1);
    expect(trends.map((t) => t.exerciseId)).toEqual([squat, bench]);
    expect(trends[1].points.map((p) => p.sessionId)).toEqual(["a", "b"]);
  });

  it("converts Decimal weights explicitly and derives e1RM / volume without storing them", async () => {
    mocks.entry.findMany.mockResolvedValue([{
      ...row(bench, "ベンチプレス", "a", "2026-09-01T00:00:00Z", "0", 1),
      sets: [{ weightKg: { toString: () => "62.50" }, reps: 8, setType: "WORKING", completed: true }],
    }]);
    const [trend] = await listExerciseTrends();
    expect(trend.name).toBe("ベンチプレス");
    expect(trend.points[0].volumeKg).toBe(500);
    expect(trend.points[0].e1rmKg).toBeCloseTo(62.5 * (1 + 8 / 30), 10);
    expect(trend.points[0].startedAt).toBe("2026-09-01T00:00:00.000Z");
  });

  it("returns an empty list when the user has no analyzable records", async () => {
    mocks.entry.findMany.mockResolvedValue([]);
    expect(await listExerciseTrends()).toEqual([]);
  });
});
