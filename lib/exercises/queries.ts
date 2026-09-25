import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { exerciseIdSchema } from "./validation";
import type { ExerciseDetailDTO, ExerciseSummaryDTO } from "./types";

// Exercise / Muscle are shared master data (no owner), so nothing here is user-scoped. Authentication is still checked
// here rather than left to the protected layout, like every other read in this app. Both reads are ONE query each:
// the muscles ride along in a nested select, so there is no per-exercise follow-up query (no N+1).
const muscleSelect = {
  where: { muscle: { isActive: true } },
  select: { role: true, muscle: { select: { name: true } } },
} as const;

type MuscleRelation = { role: "PRIMARY" | "SECONDARY"; muscle: { name: string } };

function splitMuscles(relations: readonly MuscleRelation[]) {
  const names = (role: MuscleRelation["role"]) => relations
    .filter((relation) => relation.role === role).map((relation) => relation.muscle.name).sort();
  return { primaryMuscles: names("PRIMARY"), secondaryMuscles: names("SECONDARY") };
}

// Every active exercise. The category filter is applied to this list by the caller (categories.ts): the catalog is tiny.
export async function listExercises(): Promise<ExerciseSummaryDTO[]> {
  await requireUser();
  const exercises = await prisma.exercise.findMany({
    where: { isActive: true },
    select: { id: true, name: true, equipmentType: true, exerciseMuscles: muscleSelect },
    orderBy: { name: "asc" },
  });
  return exercises.map((exercise) => ({
    id: exercise.id, name: exercise.name, equipmentType: exercise.equipmentType,
    ...splitMuscles(exercise.exerciseMuscles),
  }));
}

// One active exercise, or null when the id is malformed, unknown or inactive (the page turns null into notFound()).
export async function getExercise(id: string): Promise<ExerciseDetailDTO | null> {
  await requireUser();
  if (!exerciseIdSchema.safeParse(id).success) return null;
  const exercise = await prisma.exercise.findFirst({
    where: { id, isActive: true },
    select: {
      id: true, name: true, equipmentType: true, description: true, instructions: true, tips: true,
      exerciseMuscles: muscleSelect,
    },
  });
  if (!exercise) return null;
  return {
    id: exercise.id, name: exercise.name, equipmentType: exercise.equipmentType,
    description: exercise.description, instructions: exercise.instructions, tips: exercise.tips,
    ...splitMuscles(exercise.exerciseMuscles),
  };
}
