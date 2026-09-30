import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  exercise: { findMany: vi.fn() },
  workoutExercise: { findMany: vi.fn() },
  getTodayConditionForRecommendation: vi.fn(),
  getLatestExercisePerformance: vi.fn(),
  recommendWorkout: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { exercise: mocks.exercise, workoutExercise: mocks.workoutExercise } }));
vi.mock("@/lib/conditions/queries", () => ({ getTodayConditionForRecommendation: mocks.getTodayConditionForRecommendation }));
vi.mock("@/lib/workouts/queries", () => ({ getLatestExercisePerformance: mocks.getLatestExercisePerformance }));
// lib/recommendations/queries.ts imports this as "./engine"; Vitest mocks by resolved module identity, so the
// alias form below intercepts it just the same. lib/date/jst is deliberately left unmocked (see the
// getTodayRecommendation describe block): its pure, already-tested logic runs for real throughout this file.
vi.mock("@/lib/recommendations/engine", () => ({ recommendWorkout: mocks.recommendWorkout }));

import {
  listRecommendationCandidates, reduceLastTrainedAtByMuscle, getLastTrainedAtByMuscle, getTodayRecommendation,
} from "@/lib/recommendations/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const benchPressId = "22222222-2222-4222-8222-222222222222";
const squatId = "33333333-3333-4333-8333-333333333333";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
});

describe("listRecommendationCandidates", () => {
  it("requires authentication before reading", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(listRecommendationCandidates()).rejects.toThrow("REDIRECT");
    expect(mocks.exercise.findMany).not.toHaveBeenCalled();
  });

  it("filters to active Exercises only, in ONE query (no per-exercise follow-up)", async () => {
    mocks.exercise.findMany.mockResolvedValue([]);
    await listRecommendationCandidates();
    expect(mocks.exercise.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.exercise.findMany.mock.calls[0][0].where).toEqual({ isActive: true });
  });

  it("preserves PRIMARY and SECONDARY roles, and maps every field to the ExerciseCandidateDTO shape", async () => {
    mocks.exercise.findMany.mockResolvedValue([{
      id: benchPressId, name: "Bench Press", equipmentType: "BARBELL",
      exerciseMuscles: [
        { role: "PRIMARY", muscle: { name: "Chest", isActive: true } },
        { role: "SECONDARY", muscle: { name: "Triceps", isActive: true } },
      ],
    }]);
    expect(await listRecommendationCandidates()).toEqual([{
      exerciseId: benchPressId, exerciseName: "Bench Press", equipmentType: "BARBELL", isActive: true,
      muscles: [
        { muscleName: "Chest", role: "PRIMARY", muscleIsActive: true },
        { muscleName: "Triceps", role: "SECONDARY", muscleIsActive: true },
      ],
    }]);
  });

  it("does NOT filter out an inactive Muscle relation — it is carried through as muscleIsActive: false", async () => {
    mocks.exercise.findMany.mockResolvedValue([{
      id: benchPressId, name: "Bench Press", equipmentType: "BARBELL",
      exerciseMuscles: [{ role: "PRIMARY", muscle: { name: "Chest", isActive: false } }],
    }]);
    const result = await listRecommendationCandidates();
    expect(result[0].muscles).toEqual([{ muscleName: "Chest", role: "PRIMARY", muscleIsActive: false }]);
  });
});

describe("reduceLastTrainedAtByMuscle (pure)", () => {
  it("picks the most recent date per muscle", () => {
    const result = reduceLastTrainedAtByMuscle([
      { muscleName: "Chest", startedAt: new Date("2026-09-20T00:00:00Z") },
      { muscleName: "Chest", startedAt: new Date("2026-09-25T00:00:00Z") },
      { muscleName: "Chest", startedAt: new Date("2026-09-22T00:00:00Z") },
    ]);
    expect(result).toEqual({ Chest: "2026-09-25" });
  });

  it("tracks multiple muscles independently", () => {
    const result = reduceLastTrainedAtByMuscle([
      { muscleName: "Chest", startedAt: new Date("2026-09-20T00:00:00Z") },
      { muscleName: "Lats", startedAt: new Date("2026-09-21T00:00:00Z") },
    ]);
    expect(result).toEqual({ Chest: "2026-09-20", Lats: "2026-09-21" });
  });

  it("converts to the JST calendar date, not the raw UTC date", () => {
    // 2026-09-27T20:00:00Z is 2026-09-28 05:00 JST.
    const result = reduceLastTrainedAtByMuscle([{ muscleName: "Chest", startedAt: new Date("2026-09-27T20:00:00.000Z") }]);
    expect(result).toEqual({ Chest: "2026-09-28" });
  });

  it("is deterministic regardless of row order", () => {
    const rows = [
      { muscleName: "Chest", startedAt: new Date("2026-09-20T00:00:00Z") },
      { muscleName: "Chest", startedAt: new Date("2026-09-25T00:00:00Z") },
      { muscleName: "Lats", startedAt: new Date("2026-09-18T00:00:00Z") },
    ];
    expect(reduceLastTrainedAtByMuscle(rows)).toEqual(reduceLastTrainedAtByMuscle([...rows].reverse()));
  });

  it("returns {} for no rows", () => expect(reduceLastTrainedAtByMuscle([])).toEqual({}));
});

describe("getLastTrainedAtByMuscle", () => {
  const today = new Date("2026-09-28T00:00:00.000Z");

  it("requires authentication before reading", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getLastTrainedAtByMuscle(today)).rejects.toThrow("REDIRECT");
    expect(mocks.workoutExercise.findMany).not.toHaveBeenCalled();
  });

  it("scopes to the owner, COMPLETED sessions only, and a 30-day window anchored to the given `today` (ONE query)", async () => {
    mocks.workoutExercise.findMany.mockResolvedValue([]);
    await getLastTrainedAtByMuscle(today);
    expect(mocks.workoutExercise.findMany).toHaveBeenCalledTimes(1);
    const { where } = mocks.workoutExercise.findMany.mock.calls[0][0];
    expect(where.workoutSession.userId).toBe(owner);
    expect(where.workoutSession.status).toBe("COMPLETED");
    expect(where.workoutSession.startedAt.gte).toEqual(new Date("2026-08-29T00:00:00.000Z")); // today - 30 days
  });

  it("selects only PRIMARY ExerciseMuscle relations", async () => {
    mocks.workoutExercise.findMany.mockResolvedValue([]);
    await getLastTrainedAtByMuscle(today);
    const { select } = mocks.workoutExercise.findMany.mock.calls[0][0];
    expect(select.exercise.select.exerciseMuscles.where).toEqual({ role: "PRIMARY" });
  });

  it("maps rows through to the muscle -> JST date result", async () => {
    mocks.workoutExercise.findMany.mockResolvedValue([{
      workoutSession: { startedAt: new Date("2026-09-25T00:00:00Z") },
      exercise: { exerciseMuscles: [{ muscle: { name: "Chest" } }, { muscle: { name: "Front Deltoid" } }] },
    }]);
    expect(await getLastTrainedAtByMuscle(today)).toEqual({ Chest: "2026-09-25", "Front Deltoid": "2026-09-25" });
  });

  it("returns {} when there is no COMPLETED history in the window", async () => {
    mocks.workoutExercise.findMany.mockResolvedValue([]);
    expect(await getLastTrainedAtByMuscle(today)).toEqual({});
  });
});

describe("getTodayRecommendation", () => {
  beforeEach(() => vi.useFakeTimers().setSystemTime(new Date("2026-09-28T03:00:00.000Z"))); // 2026-09-28 JST
  afterEach(() => vi.useRealTimers());

  it("returns null (and never calls the engine or the latest-performance query) when no Condition was entered today", async () => {
    mocks.getTodayConditionForRecommendation.mockResolvedValue(null);
    mocks.exercise.findMany.mockResolvedValue([]);
    mocks.workoutExercise.findMany.mockResolvedValue([]);
    const result = await getTodayRecommendation();
    expect(result).toBeNull();
    expect(mocks.getLatestExercisePerformance).not.toHaveBeenCalled();
    expect(mocks.recommendWorkout).not.toHaveBeenCalled();
  });

  it("builds the RecommendationContext correctly and returns the engine's result as-is", async () => {
    const condition = { conditionDate: "2026-09-28", sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60, sorenessByMuscle: {} };
    mocks.getTodayConditionForRecommendation.mockResolvedValue(condition);
    mocks.exercise.findMany.mockResolvedValue([
      { id: benchPressId, name: "Bench Press", equipmentType: "BARBELL", exerciseMuscles: [{ role: "PRIMARY", muscle: { name: "Chest", isActive: true } }] },
      { id: squatId, name: "Squat", equipmentType: "BARBELL", exerciseMuscles: [{ role: "PRIMARY", muscle: { name: "Quadriceps", isActive: true } }] },
    ]);
    mocks.workoutExercise.findMany.mockResolvedValue([{
      workoutSession: { startedAt: new Date("2026-09-25T00:00:00Z") },
      exercise: { exerciseMuscles: [{ muscle: { name: "Chest" } }] },
    }]);
    const previousPerformanceByExerciseId = { [benchPressId]: { startedAt: "2026-09-25T00:00:00.000Z", sets: [{ weightKg: "60.00", reps: 8 }] } };
    mocks.getLatestExercisePerformance.mockResolvedValue(previousPerformanceByExerciseId);
    const engineResult = { kind: "REST", recommendationReason: "test" };
    mocks.recommendWorkout.mockReturnValue(engineResult);

    const result = await getTodayRecommendation();

    expect(mocks.getLatestExercisePerformance).toHaveBeenCalledWith([benchPressId, squatId]);
    expect(mocks.recommendWorkout).toHaveBeenCalledWith({
      today: "2026-09-28",
      condition,
      exercises: [
        { exerciseId: benchPressId, exerciseName: "Bench Press", equipmentType: "BARBELL", isActive: true, muscles: [{ muscleName: "Chest", role: "PRIMARY", muscleIsActive: true }] },
        { exerciseId: squatId, exerciseName: "Squat", equipmentType: "BARBELL", isActive: true, muscles: [{ muscleName: "Quadriceps", role: "PRIMARY", muscleIsActive: true }] },
      ],
      lastTrainedAtByMuscle: { Chest: "2026-09-25" },
      previousPerformanceByExerciseId,
    });
    expect(result).toBe(engineResult); // passed through unchanged, not re-shaped
  });
});
