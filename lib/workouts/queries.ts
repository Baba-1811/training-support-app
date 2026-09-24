import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { buildWorkoutAnalytics } from "./analytics";
import { buildExerciseTrends } from "./analytics-trend";
import type {
  ExerciseAnalyticsDTO, ExerciseHistoryRecord, ExerciseTrend, PreviousExercisePerformanceDTO, WorkoutDTO, WorkoutHistorySummaryDTO,
} from "./types";

export async function getWorkout(id: string): Promise<WorkoutDTO | null> {
  const user = await requireUser();
  const session = await prisma.workoutSession.findFirst({
    where: { id, userId: user.id },
    include: { exercises: {
      orderBy: { exerciseOrder: "asc" },
      include: {
        exercise: { select: { name: true, exerciseMuscles: {
          where: { role: "PRIMARY" },
          select: { muscle: { select: { name: true } } },
          orderBy: { muscle: { name: "asc" } },
        } } },
        sets: { orderBy: { setNumber: "asc" } },
      },
    } },
  });
  if (!session) return null;
  return {
    id: session.id, title: session.title, status: session.status,
    startedAt: session.startedAt.toISOString(), completedAt: session.completedAt?.toISOString() ?? null,
    exercises: session.exercises.map((entry) => ({
      id: entry.id, exerciseId: entry.exerciseId, name: entry.exercise.name, exerciseOrder: entry.exerciseOrder,
      muscles: entry.exercise.exerciseMuscles.map((relation) => relation.muscle.name),
      sets: entry.sets.map((set) => ({
        id: set.id, setNumber: set.setNumber, weightKg: set.weightKg.toString(), reps: set.reps,
        rir: set.rir?.toString() ?? null, setType: set.setType, completed: set.completed,
      })),
    })),
  };
}

// History: completed sessions only, newest first. IN_PROGRESS/CANCELLED are never analysis targets.
export async function listCompletedWorkouts(): Promise<WorkoutHistorySummaryDTO[]> {
  const user = await requireUser();
  const sessions = await prisma.workoutSession.findMany({
    where: { userId: user.id, status: "COMPLETED" },
    orderBy: { startedAt: "desc" },
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
