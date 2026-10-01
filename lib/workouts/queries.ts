import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { buildWorkoutAnalytics } from "./analytics";
import { buildExerciseTrends } from "./analytics-trend";
import { matchRecommendationTarget, type PlanExerciseSnapshot } from "./recommendation-target";
import type {
  ExerciseAnalyticsDTO, ExerciseHistoryRecord, ExerciseTrend, PreviousExercisePerformanceDTO, PreviousSetDTO, WorkoutDTO, WorkoutHistorySummaryDTO,
} from "./types";

export async function getWorkout(id: string): Promise<WorkoutDTO | null> {
  const user = await requireUser();
  const session = await prisma.workoutSession.findFirst({
    where: { id, userId: user.id },
    include: {
      exercises: {
        orderBy: { exerciseOrder: "asc" },
        include: {
          exercise: { select: { name: true, exerciseMuscles: {
            where: { role: "PRIMARY" },
            select: { muscle: { select: { name: true } } },
            orderBy: { muscle: { name: "asc" } },
          } } },
          sets: { orderBy: { setNumber: "asc" } },
        },
      },
      // Phase 5E-1: the Recommendation Target snapshot, read-only. Rides along in this same findFirst (one more
      // relation on an already-owner-scoped query), not a per-exercise follow-up — null for a normal/Exercise
      // Library-started Workout, where workoutPlanId (and so this relation) is null.
      workoutPlan: { select: { exercises: { select: {
        exerciseId: true, exerciseOrder: true, targetWeightKg: true, targetRepsMin: true, targetRepsMax: true, targetSets: true, restSeconds: true,
      } } } },
    },
  });
  if (!session) return null;
  const planExercises: PlanExerciseSnapshot[] | null = session.workoutPlan?.exercises.map((row) => ({
    exerciseId: row.exerciseId, exerciseOrder: row.exerciseOrder,
    targetWeightKg: row.targetWeightKg === null ? null : Number(row.targetWeightKg),
    targetRepsMin: row.targetRepsMin, targetRepsMax: row.targetRepsMax, targetSets: row.targetSets, restSeconds: row.restSeconds,
  })) ?? null;
  return {
    id: session.id, title: session.title, status: session.status,
    startedAt: session.startedAt.toISOString(), completedAt: session.completedAt?.toISOString() ?? null,
    exercises: session.exercises.map((entry) => ({
      id: entry.id, exerciseId: entry.exerciseId, name: entry.exercise.name, exerciseOrder: entry.exerciseOrder,
      muscles: entry.exercise.exerciseMuscles.map((relation) => relation.muscle.name),
      recommendationTarget: matchRecommendationTarget(entry, planExercises),
      sets: entry.sets.map((set) => ({
        id: set.id, setNumber: set.setNumber, weightKg: set.weightKg.toString(), reps: set.reps,
        rir: set.rir?.toString() ?? null, setType: set.setType, completed: set.completed,
      })),
    })),
  };
}

// History: completed sessions only, newest first. IN_PROGRESS/CANCELLED are never analysis targets.
// `limit` (Home / Analytics "recent workouts") bounds the query itself; the shape and ownership scope are the same.
export async function listCompletedWorkouts(limit?: number): Promise<WorkoutHistorySummaryDTO[]> {
  const user = await requireUser();
  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id, status: "COMPLETED" },
    orderBy: { startedAt: "desc" },
    ...(limit === undefined ? {} : { take: limit }),
    include: { exercises: {
      orderBy: { exerciseOrder: "asc" },
      include: { exercise: { select: { name: true } }, sets: { select: { setType: true, completed: true } } },
    } },
  });
  return sessions.map((session) => ({
    id: session.id, title: session.title, startedAt: session.startedAt.toISOString(),
    completedAt: (session.completedAt ?? session.startedAt).toISOString(),
    exerciseNames: session.exercises.map((entry) => entry.exercise.name),
    workingSetCount: session.exercises.reduce((total, entry) =>
      total + entry.sets.filter((set) => set.setType === "WORKING" && set.completed).length, 0),
  }));
}

// Most recent completed performance of the same exercise, strictly before the current session and
// excluding it explicitly (COMPLETED sessions already can't be the in-progress current one, but this
// keeps the guarantee independent of that timing coincidence). WARMUP and unconfirmed sets are excluded.
export async function getPreviousExercisePerformance(
  currentSessionId: string, currentStartedAt: string, exerciseIds: string[],
): Promise<Record<string, PreviousExercisePerformanceDTO>> {
  const user = await requireUser();
  const uniqueIds = [...new Set(exerciseIds)];
  const entries = await Promise.all(uniqueIds.map(async (exerciseId) => {
    const previous = await prisma.workoutExercise.findFirst({
      where: { exerciseId, workoutSession: {
        userId: user.id, status: "COMPLETED",
        id: { not: currentSessionId }, startedAt: { lt: new Date(currentStartedAt) },
      } },
      orderBy: { workoutSession: { startedAt: "desc" } },
      select: {
        workoutSession: { select: { startedAt: true } },
        sets: { where: { completed: true, setType: "WORKING" }, orderBy: { setNumber: "asc" }, select: { weightKg: true, reps: true } },
      },
    });
    const value: PreviousExercisePerformanceDTO = previous ? {
      startedAt: previous.workoutSession.startedAt.toISOString(),
      sets: previous.sets.map((set) => ({ weightKg: set.weightKg.toString(), reps: set.reps })),
    } : null;
    return [exerciseId, value] as const;
  }));
  return Object.fromEntries(entries);
}

type LatestSessionRow = { exerciseId: string; startedAt: Date };
type LatestSetRow = { exerciseId: string; weightKg: string; reps: number };

// Pure: assembles the final Record from (a) each Exercise's latest COMPLETED session (one row per Exercise) and
// (b) every completed WORKING set recorded for that Exercise within that exact session — which can come from more
// than one WorkoutExercise row of the same Exercise in that session (see getLatestExercisePerformance's comment).
// Exported so this shaping is unit-testable without a database: row order, several Exercises, several sessions,
// duplicate same-session Exercises and "no history" are all plain-data concerns, not query concerns.
export function reduceLatestExercisePerformance(
  latestSessions: readonly LatestSessionRow[], setRows: readonly LatestSetRow[],
): Record<string, PreviousExercisePerformanceDTO> {
  const setsByExercise = new Map<string, PreviousSetDTO[]>();
  for (const row of setRows) {
    const sets = setsByExercise.get(row.exerciseId) ?? [];
    sets.push({ weightKg: row.weightKg, reps: row.reps });
    setsByExercise.set(row.exerciseId, sets);
  }
  const result: Record<string, PreviousExercisePerformanceDTO> = {};
  for (const { exerciseId, startedAt } of latestSessions) {
    result[exerciseId] = { startedAt: startedAt.toISOString(), sets: setsByExercise.get(exerciseId) ?? [] };
  }
  return result;
}

// Most recent COMPLETED performance of every given Exercise, bulk-fetched in a FIXED number of queries rather
// than one per Exercise — used by Recommendation (Phase 5), which needs "everyone's last performance" at once
// and must not have its query count grow as the Exercise catalog grows (unlike getPreviousExercisePerformance
// above, which is deliberately scoped to a single in-progress workout and stays per-exercise for that reason).
// An Exercise with no completed history is simply absent from the returned Record: the Recommendation engine
// treats "absent" as "no history", so no null/placeholder entry is created for it.
//
// Two queries, not one: Prisma's `distinct` can pick exactly one row per Exercise (a "latest per group" query,
// ordered by workoutSession.startedAt desc — no unbounded fetch of full history, and no arbitrary day cutoff,
// since an old previous performance is still meaningful here unlike lastTrainedAt's 30-day window) but cannot
// also gather sibling rows for the same key. The schema allows the same Exercise to appear as more than one
// WorkoutExercise within a single Session (no unique constraint on (workoutSessionId, exerciseId), only on
// (workoutSessionId, exerciseOrder); the existing addExercise mutation does not prevent it either).
// lib/workouts/analytics.ts#summarizeSessions already treats that case as "one workout's performance" ("a session
// may hold the same exercise more than once"); this function follows that same precedent by merging every
// qualifying set from the session, rather than arbitrarily keeping only one of the duplicate rows the way
// getPreviousExercisePerformance's single findFirst would.
export async function getLatestExercisePerformance(exerciseIds: string[]): Promise<Record<string, PreviousExercisePerformanceDTO>> {
  const user = await requireUser();
  const uniqueIds = [...new Set(exerciseIds)];
  if (uniqueIds.length === 0) return {};

  // Query 1: which session is "latest" for each Exercise (fixed cost regardless of catalog size).
  const latestSessionRows = await prisma.workoutExercise.findMany({
    where: { exerciseId: { in: uniqueIds }, workoutSession: { userId: user.id, status: "COMPLETED" } },
    distinct: ["exerciseId"],
    orderBy: { workoutSession: { startedAt: "desc" } },
    select: { exerciseId: true, workoutSessionId: true, workoutSession: { select: { startedAt: true } } },
  });
  if (latestSessionRows.length === 0) return {};

  // Query 2: every completed WORKING set for exactly those (Exercise, session) pairs — an exact-pair OR, not a
  // broad "any of these exercises in any of these sessions" filter, so an Exercise never picks up sets from a
  // session that happens to be some OTHER Exercise's latest, not its own. Still owner/COMPLETED-scoped again here
  // rather than trusting query 1's result alone.
  const setRows = await prisma.workoutExercise.findMany({
    where: {
      workoutSession: { userId: user.id, status: "COMPLETED" },
      OR: latestSessionRows.map((row) => ({ exerciseId: row.exerciseId, workoutSessionId: row.workoutSessionId })),
    },
    orderBy: { exerciseOrder: "asc" }, // deterministic order when the same Exercise has two rows in one session
    select: {
      exerciseId: true,
      sets: { where: { completed: true, setType: "WORKING" }, orderBy: { setNumber: "asc" }, select: { weightKg: true, reps: true } },
    },
  });

  const latestSessions: LatestSessionRow[] = latestSessionRows.map((row) => ({ exerciseId: row.exerciseId, startedAt: row.workoutSession.startedAt }));
  const flatSetRows: LatestSetRow[] = setRows.flatMap((row) =>
    row.sets.map((set) => ({ exerciseId: row.exerciseId, weightKg: set.weightKg.toString(), reps: set.reps })));
  return reduceLatestExercisePerformance(latestSessions, flatSetRows);
}

// Confirmed analytics for a COMPLETED workout. `workout` must come from getWorkout (ownership-checked);
// history is still scoped to the authenticated user here. One query covers every exercise (no N+1);
// e1RM / volume / best / previous are all derived in analytics.ts and never stored.
export async function getWorkoutAnalytics(workout: WorkoutDTO): Promise<Record<string, ExerciseAnalyticsDTO>> {
  const user = await requireUser();
  if (workout.status !== "COMPLETED") return {};
  const exerciseIds = [...new Set(workout.exercises.map((entry) => entry.exerciseId))];
  const historyByExercise: Record<string, ExerciseHistoryRecord[]> = {};
  if (exerciseIds.length > 0) {
    const entries = await prisma.workoutExercise.findMany({
      where: { exerciseId: { in: exerciseIds }, workoutSession: { userId: user.id, status: "COMPLETED", id: { not: workout.id } } },
      select: {
        exerciseId: true,
        workoutSession: { select: { id: true, startedAt: true } },
        sets: { where: { completed: true, setType: "WORKING" }, select: { weightKg: true, reps: true, setType: true, completed: true } },
      },
    });
    for (const entry of entries) {
      (historyByExercise[entry.exerciseId] ??= []).push({
        sessionId: entry.workoutSession.id, startedAt: entry.workoutSession.startedAt.toISOString(),
        sets: entry.sets.map((set) => ({ weightKg: set.weightKg.toString(), reps: set.reps, setType: set.setType, completed: set.completed })),
      });
    }
  }
  return buildWorkoutAnalytics(workout, historyByExercise);
}

// In-progress workouts of the owner, newest first, so the record tab can offer to resume one
// (the editor has no other way back once the user navigates away). Ids and timestamps only.
export async function listInProgressWorkouts(): Promise<Array<{ id: string; title: string | null; startedAt: string }>> {
  const user = await requireUser();
  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id, status: "IN_PROGRESS" },
    orderBy: { startedAt: "desc" },
    select: { id: true, title: true, startedAt: true },
  });
  return sessions.map((session) => ({ id: session.id, title: session.title, startedAt: session.startedAt.toISOString() }));
}

// Growth trends for the /analytics page. The owner's COMPLETED sessions only, and only entries that have at
// least one completed WORKING set. One query for every exercise (no per-exercise N+1); grouping into
// exercises / workouts and all e1RM / volume math happens in analytics-trend.ts. The period filter is applied
// on the client from this full series, so this query has no date bound. Existing indexes cover it:
// WorkoutSession(userId, startedAt), WorkoutExercise(workoutSessionId, exerciseId), WorkoutSet(workoutExerciseId, setNumber).
export async function listExerciseTrends(): Promise<ExerciseTrend[]> {
  const user = await requireUser();
  const entries = await prisma.workoutExercise.findMany({
    where: {
      workoutSession: { userId: user.id, status: "COMPLETED" },
      sets: { some: { completed: true, setType: "WORKING" } },
    },
    select: {
      exerciseId: true,
      exercise: { select: { name: true } },
      workoutSession: { select: { id: true, startedAt: true } },
      sets: { where: { completed: true, setType: "WORKING" }, select: { weightKg: true, reps: true, setType: true, completed: true } },
    },
  });
  return buildExerciseTrends(entries.map((entry) => ({
    exerciseId: entry.exerciseId, exerciseName: entry.exercise.name,
    sessionId: entry.workoutSession.id, startedAt: entry.workoutSession.startedAt.toISOString(),
    sets: entry.sets.map((set) => ({ weightKg: set.weightKg.toString(), reps: set.reps, setType: set.setType, completed: set.completed })),
  })));
}
