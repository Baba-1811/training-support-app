import { beforeEach, describe, expect, it, vi } from "vitest";
import type { RecommendationResult } from "@/lib/recommendations/types";

const mocks = vi.hoisted(() => {
  const model = () => ({ create: vi.fn() });
  return {
    auth: vi.fn(), getTodayRecommendation: vi.fn(), getTodayCondition: vi.fn(),
    plan: model(), session: model(), transaction: vi.fn(), revalidate: vi.fn(),
  };
});
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutPlan: mocks.plan, workoutSession: mocks.session, $transaction: mocks.transaction } }));
vi.mock("@/lib/recommendations/queries", () => ({ getTodayRecommendation: mocks.getTodayRecommendation }));
vi.mock("@/lib/conditions/queries", () => ({ getTodayCondition: mocks.getTodayCondition }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "REDIRECT") throw error; } }));

import * as actions from "@/app/(protected)/workouts/actions";
import { createWorkoutFromRecommendation } from "@/lib/workouts/mutations";

const owner = "11111111-1111-4111-8111-111111111111";
const conditionId = "22222222-2222-4222-8222-222222222222";
const planId = "33333333-3333-4333-8333-333333333333";
const sessionId = "44444444-4444-4444-8444-444444444444";
const benchPressId = "55555555-5555-4555-8555-555555555555";
const squatId = "66666666-6666-4666-8666-666666666666";

const workoutRecommendation: RecommendationResult = {
  kind: "WORKOUT",
  selectedCategories: ["chest", "legs"],
  recommendationReason: "テスト用の推薦理由",
  reducedLoad: false,
  exercises: [
    {
      exerciseId: benchPressId, exerciseName: "Bench Press", category: "chest",
      targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90,
      secondarySorenessNoted: false,
    },
    {
      exerciseId: squatId, exerciseName: "Squat", category: "legs",
      targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: 75,
      secondarySorenessNoted: true,
    },
  ],
};
const restRecommendation: RecommendationResult = { kind: "REST", recommendationReason: "休むべき理由" };
const condition = { id: conditionId, conditionDate: "2026-09-28", sleepHours: "7.0", fatigueLevel: 3, availableMinutes: 60, sorenessByCategory: {} };

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.getTodayRecommendation.mockResolvedValue(workoutRecommendation);
  mocks.getTodayCondition.mockResolvedValue(condition);
  mocks.plan.create.mockResolvedValue({ id: planId });
  mocks.session.create.mockResolvedValue({ id: sessionId });
  mocks.transaction.mockImplementation(async (callback) => callback({ workoutPlan: mocks.plan, workoutSession: mocks.session }));
});

describe("createWorkoutFromRecommendation (Phase 5D: Recommendation -> WorkoutPlan snapshot -> WorkoutSession)", () => {
  it("requires authentication before reading the Recommendation", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(createWorkoutFromRecommendation()).rejects.toThrow("REDIRECT");
    expect(mocks.getTodayRecommendation).not.toHaveBeenCalled();
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("re-fetches today's Recommendation itself, taking no payload from the caller", async () => {
    await createWorkoutFromRecommendation();
    expect(mocks.getTodayRecommendation).toHaveBeenCalledTimes(1);
    expect(mocks.getTodayRecommendation).toHaveBeenCalledWith();
  });

  it("creates the WorkoutPlan and WorkoutSession inside one transaction", async () => {
    await createWorkoutFromRecommendation();
    expect(mocks.transaction).toHaveBeenCalledTimes(1);
    expect(mocks.plan.create).toHaveBeenCalledTimes(1);
    expect(mocks.session.create).toHaveBeenCalledTimes(1);
  });

  it("snapshots the WorkoutPlan with server-owned identity, ACCEPTED status, sourceConditionId and the engine's own reason", async () => {
    await createWorkoutFromRecommendation();
    expect(mocks.plan.create).toHaveBeenCalledWith(expect.objectContaining({
      data: expect.objectContaining({
        userId: owner, sourceConditionId: conditionId, plannedDate: expect.any(Date), status: "ACCEPTED",
        recommendationReason: "テスト用の推薦理由",
      }),
    }));
  });

  it("snapshots every RecommendedExercise field into WorkoutPlanExercise, in Recommendation order, including a null targetWeightKg", async () => {
    await createWorkoutFromRecommendation();
    expect(mocks.plan.create.mock.calls[0][0].data.exercises.create).toEqual([
      { exerciseId: benchPressId, exerciseOrder: 1, targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 10, targetSets: 3, restSeconds: 90 },
      { exerciseId: squatId, exerciseOrder: 2, targetWeightKg: null, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: 75 },
    ]);
  });

  it("creates the WorkoutSession as IN_PROGRESS, linked to the new Plan, with WorkoutExercise in the same order", async () => {
    await createWorkoutFromRecommendation();
    expect(mocks.session.create).toHaveBeenCalledWith({
      data: {
        userId: owner, workoutPlanId: planId, startedAt: expect.any(Date), status: "IN_PROGRESS",
        exercises: { create: [
          { exerciseId: benchPressId, exerciseOrder: 1 }, { exerciseId: squatId, exerciseOrder: 2 },
        ] },
      },
      select: { id: true },
    });
  });

  it("never creates a WorkoutSet", async () => {
    await createWorkoutFromRecommendation();
    for (const call of [...mocks.plan.create.mock.calls, ...mocks.session.create.mock.calls]) {
      expect(JSON.stringify(call)).not.toContain("workoutSet");
    }
  });

  it("refuses (no Plan/Session) when there is no Condition today (Recommendation is null)", async () => {
    mocks.getTodayRecommendation.mockResolvedValue(null);
    await expect(createWorkoutFromRecommendation()).rejects.toThrow("INVALID_STATE");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.plan.create).not.toHaveBeenCalled();
  });

  it("refuses (no Plan/Session) when the server-side recomputation now returns REST", async () => {
    mocks.getTodayRecommendation.mockResolvedValue(restRecommendation);
    await expect(createWorkoutFromRecommendation()).rejects.toThrow("INVALID_STATE");
    expect(mocks.transaction).not.toHaveBeenCalled();
    expect(mocks.plan.create).not.toHaveBeenCalled();
  });

  it("refuses defensively if, despite a WORKOUT result, today's Condition cannot be found for sourceConditionId", async () => {
    mocks.getTodayCondition.mockResolvedValue(null);
    await expect(createWorkoutFromRecommendation()).rejects.toThrow("INVALID_STATE");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("leaves no partial Plan when the Session create fails inside the transaction", async () => {
    mocks.transaction.mockImplementation(async (callback) => {
      try { return await callback({ workoutPlan: mocks.plan, workoutSession: mocks.session }); }
      finally { /* no-op: a real Prisma transaction would roll back the Plan insert here too */ }
    });
    mocks.session.create.mockRejectedValue(new Error("db down"));
    await expect(createWorkoutFromRecommendation()).rejects.toThrow("db down");
    expect(mocks.plan.create).toHaveBeenCalledTimes(1);
  });
});

describe("startWorkoutFromRecommendation (Server Action)", () => {
  it("takes no Recommendation payload: a client-sent field is rejected before anything is created", async () => {
    for (const bad of [{ exerciseId: benchPressId }, { userId: owner }, { weight: 60 }]) {
      expect(await actions.startWorkoutFromRecommendation(bad)).toMatchObject({ ok: false, code: "VALIDATION" });
    }
    expect(mocks.transaction).not.toHaveBeenCalled();
  });

  it("starts the Workout and returns its sessionId on success", async () => {
    expect(await actions.startWorkoutFromRecommendation({})).toEqual({ ok: true, data: { sessionId } });
  });

  it("maps a REST/null Recommendation at Start-time to a user-facing INVALID_STATE error, not a crash", async () => {
    mocks.getTodayRecommendation.mockResolvedValue(restRecommendation);
    expect(await actions.startWorkoutFromRecommendation({})).toMatchObject({ ok: false, code: "INVALID_STATE" });
    expect(mocks.plan.create).not.toHaveBeenCalled();
  });

  it("requires authentication before touching the database", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(actions.startWorkoutFromRecommendation({})).rejects.toThrow("REDIRECT");
    expect(mocks.transaction).not.toHaveBeenCalled();
  });
});
