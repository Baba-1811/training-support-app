import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import type { PreviousExercisePerformanceDTO, WorkoutDTO, WorkoutHistorySummaryDTO } from "./types";

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
