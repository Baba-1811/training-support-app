import { notFound } from "next/navigation";
import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";
import { getWorkout, getPreviousExercisePerformance, getWorkoutAnalytics } from "@/lib/workouts/queries";
import { workoutIdSchema } from "@/lib/workouts/validation";
import { WorkoutEditor } from "@/components/workouts/workout-editor";

export default async function WorkoutPage({ params }: { params: Promise<{ id: string }> }) {
  await requireUser();
  const { id } = await params;
  if (!workoutIdSchema.safeParse(id).success) notFound();
  const workout = await getWorkout(id);
  if (!workout) notFound();
  const active = workout.status === "IN_PROGRESS";
  const exercises = active ? await prisma.exercise.findMany({
    where: { isActive: true }, select: { id: true, name: true }, orderBy: { name: "asc" },
  }) : [];
  const previousPerformance = active ? await getPreviousExercisePerformance(
    workout.id, workout.startedAt, workout.exercises.map((exercise) => exercise.exerciseId),
  ) : {};
  const analytics = workout.status === "COMPLETED" ? await getWorkoutAnalytics(workout) : {};
  return <WorkoutEditor initialWorkout={workout} availableExercises={exercises} previousPerformance={previousPerformance} analytics={analytics} />;
}
