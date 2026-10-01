import { readFileSync } from "node:fs";
import { join } from "node:path";
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

// Home has no tsx-rendering test infra (vitest.config.mts only runs "tests/**/*.test.ts", environment: "node"),
// so this checks the page's wiring the same way tests/navigation.test.ts checks routes: from the source text,
// not by rendering.
describe("Home page wiring (today's Recommendation)", () => {
  const homeSource = readFileSync(join(process.cwd(), "app", "(protected)", "page.tsx"), "utf8");
  const cardSource = readFileSync(join(process.cwd(), "components", "home", "recommendation-card.tsx"), "utf8");
  const buttonSource = readFileSync(join(process.cwd(), "components", "home", "start-from-recommendation-button.tsx"), "utf8");

  it("Home fetches today's Recommendation via the existing Phase 5B query", () => {
    expect(homeSource).toMatch(/getTodayRecommendation/);
    expect(homeSource).toMatch(/@\/lib\/recommendations\/queries/);
  });

  it("Home renders the Recommendation card", () => {
    expect(homeSource).toMatch(/<RecommendationCard\b/);
  });

  it("the Recommendation card stays a Server Component (no unnecessary \"use client\")", () => {
    expect(cardSource).not.toMatch(/use client/);
  });

  it("the Recommendation card never calls Prisma or the Workout mutation layer directly (Phase 5D: only the small Client Start button does, via the Server Action)", () => {
    for (const forbidden of ["createWorkout(", "createWorkoutWithExercise(", "createWorkoutFromRecommendation", "prisma.workoutPlan", "@/lib/prisma"]) {
      expect(cardSource, forbidden).not.toContain(forbidden);
    }
    expect(cardSource).toMatch(/<StartFromRecommendationButton\b/);
  });

  it("the Start button is its own Client Component and sends no Recommendation payload to the server", () => {
    expect(buttonSource).toMatch(/use client/);
    expect(buttonSource).toMatch(/startWorkoutFromRecommendation\(\{\}\)/);
  });
});

// Auth call amplification fix: before this fix, Home called requireUser() once directly and then again inside
// each of its five queries (getTodayRecommendation() alone fanned out into four more internally) — up to nine
// logical requireUser() calls for one render. Home now authenticates exactly once and passes that user.id into
// every internal *ForUser query directly, so this checks the structural fix itself (not just that the queries
// behave correctly in isolation, which tests/workouts/queries-for-user.test.ts, tests/conditions/queries-for-user.test.ts
// and tests/recommendations/queries.test.ts already cover).
describe("Home auth call count (Auth bug fix)", () => {
  const homeSource = readFileSync(join(process.cwd(), "app", "(protected)", "page.tsx"), "utf8");

  it("calls requireUser() exactly once", () => {
    expect(homeSource.match(/requireUser\(\)/g)).toHaveLength(1);
  });

  it("passes that one confirmed user.id into every query, using the *ForUser variants rather than the public wrappers", () => {
    for (const call of [
      "listCompletedWorkoutsForUser(user.id", "listExerciseTrendsForUser(user.id)", "listInProgressWorkoutsForUser(user.id)",
      "getTodayConditionForUser(user.id)", "getTodayRecommendationForUser(user.id)",
    ]) {
      expect(homeSource, call).toContain(call);
    }
    // The bare public wrappers (which each call requireUser() again) must not also be called from Home. Each
    // "(" immediately follows the short name only in the bare wrapper call, never in the longer *ForUser(...)
    // call, so a plain substring check (not a regex) is enough to tell them apart.
    for (const forbidden of ["listCompletedWorkouts(", "listExerciseTrends(", "listInProgressWorkouts(", "getTodayCondition(", "getTodayRecommendation("]) {
      expect(homeSource, forbidden).not.toContain(forbidden);
    }
  });
});
