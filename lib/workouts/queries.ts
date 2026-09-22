import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import type { WorkoutDTO } from "./types";

export async function getWorkout(id: string): Promise<WorkoutDTO | null> {
  const user = await requireUser();
  const session = await prisma.workoutSession.findFirst({
    where: { id, userId: user.id },
    include: { exercises: {
      orderBy: { exerciseOrder: "asc" },
      include: { exercise: { select: { name: true } }, sets: { orderBy: { setNumber: "asc" } } },
    } },
  });
  if (!session) return null;
  return {
    id: session.id, title: session.title, status: session.status,
    startedAt: session.startedAt.toISOString(), completedAt: session.completedAt?.toISOString() ?? null,
    exercises: session.exercises.map((entry) => ({
      id: entry.id, exerciseId: entry.exerciseId, name: entry.exercise.name, exerciseOrder: entry.exerciseOrder,
      sets: entry.sets.map((set) => ({
        id: set.id, setNumber: set.setNumber, weightKg: set.weightKg.toString(), reps: set.reps,
        rir: set.rir?.toString() ?? null, setType: set.setType, completed: set.completed,
      })),
    })),
  };
}
