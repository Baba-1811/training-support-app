import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), session: { findFirst: vi.fn() } }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutSession: mocks.session } }));
import { getWorkout } from "@/lib/workouts/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const sessionId = "22222222-2222-4222-8222-222222222222";
const benchPressId = "33333333-3333-4333-8333-333333333333";
const squatId = "44444444-4444-4444-8444-444444444444";

function baseSession(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    id: sessionId, title: null, status: "IN_PROGRESS" as const,
    startedAt: new Date("2026-09-28T01:00:00Z"), completedAt: null,
    exercises: [{
      id: "we-1", exerciseId: benchPressId, exerciseOrder: 1,
      exercise: { name: "Bench Press", exerciseMuscles: [] },
      sets: [],
    }],
    workoutPlan: null,
    ...overrides,
  };
}

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
});

describe("getWorkout: Recommendation Target read model (Phase 5E-1)", () => {
  it("still issues exactly one query, with workoutPlan riding along as a nested relation (no N+1)", async () => {
    mocks.session.findFirst.mockResolvedValue(baseSession());
    await getWorkout(sessionId);
    expect(mocks.session.findFirst).toHaveBeenCalledTimes(1);
    const call = mocks.session.findFirst.mock.calls[0][0];
    expect(call.where).toEqual({ id: sessionId, userId: owner });
    expect(call.include.workoutPlan.select.exercises.select).toEqual({
      exerciseId: true, exerciseOrder: true, targetWeightKg: true, targetRepsMin: true, targetRepsMax: true, targetSets: true, restSeconds: true,
    });
  });

  it("is null for a normal Workout (workoutPlanId null -> workoutPlan null)", async () => {
    mocks.session.findFirst.mockResolvedValue(baseSession({ workoutPlan: null }));
    const workout = await getWorkout(sessionId);
    expect(workout!.exercises[0].recommendationTarget).toBeNull();
  });

  it("attaches the matching WorkoutPlanExercise snapshot, converting Decimal weight to a number", async () => {
    mocks.session.findFirst.mockResolvedValue(baseSession({
      workoutPlan: { exercises: [{
        exerciseId: benchPressId, exerciseOrder: 1,
        targetWeightKg: { toString: () => "60", valueOf: () => 60 }, // Decimal-like, as Number() would read it
        targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90,
      }] },
    }));
    const workout = await getWorkout(sessionId);
    expect(workout!.exercises[0].recommendationTarget).toEqual({
      targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90,
    });
  });

  it("keeps a null targetWeightKg null instead of coercing it to 0", async () => {
    mocks.session.findFirst.mockResolvedValue(baseSession({
      workoutPlan: { exercises: [{
        exerciseId: benchPressId, exerciseOrder: 1,
        targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: null,
      }] },
    }));
    const workout = await getWorkout(sessionId);
    expect(workout!.exercises[0].recommendationTarget).toEqual({
      targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: null,
    });
  });

  it("keeps each WorkoutExercise's own target distinct when the same Exercise appears twice in one Session", async () => {
    mocks.session.findFirst.mockResolvedValue(baseSession({
      exercises: [
        { id: "we-1", exerciseId: benchPressId, exerciseOrder: 1, exercise: { name: "Bench Press", exerciseMuscles: [] }, sets: [] },
        { id: "we-2", exerciseId: benchPressId, exerciseOrder: 2, exercise: { name: "Bench Press", exerciseMuscles: [] }, sets: [] },
      ],
      workoutPlan: { exercises: [
        { exerciseId: benchPressId, exerciseOrder: 1, targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90 },
        { exerciseId: benchPressId, exerciseOrder: 2, targetWeightKg: 40, targetRepsMin: 10, targetRepsMax: 12, targetSets: 2, restSeconds: 60 },
      ] },
    }));
    const workout = await getWorkout(sessionId);
    expect(workout!.exercises[0].recommendationTarget?.targetWeightKg).toBe(60);
    expect(workout!.exercises[1].recommendationTarget?.targetWeightKg).toBe(40);
  });

  it("ignores an unrelated Exercise's WorkoutPlanExercise row (order mismatch)", async () => {
    mocks.session.findFirst.mockResolvedValue(baseSession({
      exercises: [{ id: "we-1", exerciseId: squatId, exerciseOrder: 1, exercise: { name: "Squat", exerciseMuscles: [] }, sets: [] }],
      workoutPlan: { exercises: [
        { exerciseId: benchPressId, exerciseOrder: 2, targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90 },
      ] },
    }));
    const workout = await getWorkout(sessionId);
    expect(workout!.exercises[0].recommendationTarget).toBeNull();
  });
});
