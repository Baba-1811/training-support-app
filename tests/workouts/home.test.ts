import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  session: { findMany: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutSession: mocks.session } }));
import { listCompletedWorkouts, listInProgressWorkouts } from "@/lib/workouts/queries";
import { buildGrowthSnapshot } from "@/lib/workouts/analytics-trend";
import type { ExerciseTrend, TrendPoint } from "@/lib/workouts/types";

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
});

// Home and the Analytics "recent workouts" section both call listCompletedWorkouts(limit).
describe("listCompletedWorkouts with a limit (Home / Analytics recent workouts)", () => {
  it("bounds the query with take while keeping the owner + COMPLETED + newest-first scope", async () => {
    mocks.session.findMany.mockResolvedValue([]);
    await listCompletedWorkouts(3);
    expect(mocks.session.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.session.findMany.mock.calls[0][0]).toMatchObject({
      where: { userId: owner, status: "COMPLETED" }, orderBy: { startedAt: "desc" }, take: 3,
    });
  });

  it("stays unbounded without a limit (the /history page keeps every workout)", async () => {
    mocks.session.findMany.mockResolvedValue([]);
    await listCompletedWorkouts();
    expect(mocks.session.findMany.mock.calls[0][0]).not.toHaveProperty("take");
  });

  it("loads exercises and set flags in the same query (no per-workout follow-up query)", async () => {
    mocks.session.findMany.mockResolvedValue([]);
    await listCompletedWorkouts(3);
    expect(mocks.session.findMany.mock.calls[0][0].include.exercises.include.sets).toEqual({ select: { setType: true, completed: true } });
  });

  it("requires authentication before reading", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(listCompletedWorkouts(3)).rejects.toThrow("REDIRECT");
    expect(mocks.session.findMany).not.toHaveBeenCalled();
  });

  it("returns an empty list (the empty state) when the user has no completed workout", async () => {
    mocks.session.findMany.mockResolvedValue([]);
    await expect(listCompletedWorkouts(3)).resolves.toEqual([]);
  });
});

describe("listInProgressWorkouts", () => {
  it("scopes to the authenticated owner and IN_PROGRESS only, selecting just what the resume card needs", async () => {
    mocks.session.findMany.mockResolvedValue([]);
    await listInProgressWorkouts();
    expect(mocks.session.findMany.mock.calls[0][0]).toEqual({
      where: { userId: owner, status: "IN_PROGRESS" }, orderBy: { startedAt: "desc" },
      select: { id: true, title: true, startedAt: true },
    });
  });

  it("serializes dates for the client", async () => {
    mocks.session.findMany.mockResolvedValue([{ id: sessionId, title: null, startedAt: new Date("2026-09-24T01:00:00Z") }]);
    await expect(listInProgressWorkouts()).resolves.toEqual([{ id: sessionId, title: null, startedAt: "2026-09-24T01:00:00.000Z" }]);
  });

  it("requires authentication before reading", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(listInProgressWorkouts()).rejects.toThrow("REDIRECT");
    expect(mocks.session.findMany).not.toHaveBeenCalled();
  });
});

const point = (sessionId: string, startedAt: string, e1rmKg: number, volumeKg: number): TrendPoint =>
  ({ sessionId, startedAt, e1rmKg, volumeKg, workingSetCount: 3 });
const trend = (name: string, points: TrendPoint[]): ExerciseTrend => ({ exerciseId: name, name, points });

describe("buildGrowthSnapshot (Home growth snapshot)", () => {
  it("is null when there is nothing to analyse (empty state)", () => {
    expect(buildGrowthSnapshot([])).toBeNull();
  });

  it("uses the most recently performed exercise (first trend) and its latest workout", () => {
    const snapshot = buildGrowthSnapshot([
      trend("ベンチプレス", [point("a", "2026-09-10T00:00:00Z", 80, 1000), point("b", "2026-09-20T00:00:00Z", 85, 1200)]),
      trend("スクワット", [point("c", "2026-09-01T00:00:00Z", 100, 2000)]),
    ]);
    expect(snapshot?.name).toBe("ベンチプレス");
    expect(snapshot?.latest.sessionId).toBe("b");
  });

  it("compares the latest workout with the one before it, not with the oldest", () => {
    const snapshot = buildGrowthSnapshot([trend("ベンチプレス", [
      point("a", "2026-08-01T00:00:00Z", 60, 500), point("b", "2026-09-10T00:00:00Z", 80, 1000), point("c", "2026-09-20T00:00:00Z", 85, 1200),
    ])]);
    expect(snapshot?.comparison).toEqual({ e1rmDeltaKg: 5, volumeDeltaKg: 200 });
  });

  it("reports no comparison (not a zero change) when the exercise has a single workout", () => {
    const snapshot = buildGrowthSnapshot([trend("ベンチプレス", [point("a", "2026-09-10T00:00:00Z", 80, 1000)])]);
    expect(snapshot?.latest.e1rmKg).toBe(80);
    expect(snapshot?.comparison).toBeNull();
  });

  it("keeps a negative change negative", () => {
    const snapshot = buildGrowthSnapshot([trend("ベンチプレス", [
      point("a", "2026-09-10T00:00:00Z", 85, 1200), point("b", "2026-09-20T00:00:00Z", 80, 1000),
    ])]);
    expect(snapshot?.comparison).toEqual({ e1rmDeltaKg: -5, volumeDeltaKg: -200 });
  });
});
