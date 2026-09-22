import { requireUser } from "@/lib/auth/require-user";
import { prisma } from "@/lib/prisma";

export default async function Home() {
  await requireUser();
  const exercises = await prisma.exercise.findMany({
    where: {
      isActive: true,
    },
    orderBy: {
      name: "asc",
    },
    include: {
      exerciseMuscles: {
        include: {
          muscle: true,
        },
      },
    },
  });

  return (
    <main className="min-h-screen p-6">
      <h1 className="mb-6 text-2xl font-bold">
        Training Support
      </h1>

      <h2 className="mb-4 text-xl font-semibold">
        Exercise List
      </h2>

      <div className="space-y-4">
        {exercises.map((exercise) => (
          <div
            key={exercise.id}
            className="rounded-lg border p-4"
          >
            <h3 className="font-semibold">
              {exercise.name}
            </h3>

            <p className="text-sm">
              {exercise.description}
            </p>

            <div className="mt-2 text-sm">
              {exercise.exerciseMuscles.map((relation) => (
                <span
                  key={relation.muscleId}
                  className="mr-2"
                >
                  {relation.muscle.name} ({relation.role})
                </span>
              ))}
            </div>
          </div>
        ))}
      </div>
    </main>
  );
}