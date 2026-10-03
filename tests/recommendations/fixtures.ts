// Small test-only builders for lib/recommendations/*.test.ts. Not production code, not itself a test file
// (no `*.test.ts` suffix, same convention as tests/exercises/seed-data.ts).
import type { ExerciseCandidateDTO, RecommendationContext, EquipmentType } from "@/lib/recommendations/types";
import type { PreviousExercisePerformanceDTO } from "@/lib/workouts/types";

export function makeExercise(options: {
  name: string;
  id?: string;
  equipmentType?: EquipmentType;
  isActive?: boolean;
  primaryMuscles?: readonly string[];
  secondaryMuscles?: readonly string[];
  // Muscle names (from primaryMuscles/secondaryMuscles) to mark as muscleIsActive: false.
  inactiveMuscles?: readonly string[];
  // Phase 5F-3B: null (no safe auto-increment) unless a test opts in.
  weightIncrementKg?: number | null;
}): ExerciseCandidateDTO {
  const inactive = new Set(options.inactiveMuscles ?? []);
  const link = (role: "PRIMARY" | "SECONDARY") => (muscleName: string) => ({ muscleName, role, muscleIsActive: !inactive.has(muscleName) });
  return {
    exerciseId: options.id ?? options.name,
    exerciseName: options.name,
    equipmentType: options.equipmentType ?? "BARBELL",
    isActive: options.isActive ?? true,
    weightIncrementKg: options.weightIncrementKg ?? null,
    muscles: [...(options.primaryMuscles ?? []).map(link("PRIMARY")), ...(options.secondaryMuscles ?? []).map(link("SECONDARY"))],
  };
}

export function makePreviousPerformance(
  startedAt: string, sets: ReadonlyArray<{ weightKg: string; reps: number }>,
): PreviousExercisePerformanceDTO {
  return { startedAt, sets: [...sets] };
}

export function makeContext(overrides: Partial<RecommendationContext> = {}): RecommendationContext {
  return {
    today: "2026-09-28",
    condition: {
      conditionDate: "2026-09-28", sleepHours: "7.5", fatigueLevel: 3, availableMinutes: 60, sorenessByMuscle: {},
    },
    exercises: [],
    lastTrainedAtByMuscle: {},
    previousPerformanceByExerciseId: {},
    previousRecommendationByExerciseId: {},
    ...overrides,
  };
}

// The seeded catalog (prisma/seed.ts), rebuilt as ExerciseCandidateDTOs: one exercise per current category
// (chest/back/shoulders/abs), two for arms, four for legs — matching the Phase 5 investigation's documented
// inventory. Kept here (rather than re-deriving from tests/exercises/seed-data.ts) so engine.test.ts has a fixed,
// readable catalog; tests/exercises/seed-data.ts remains the source of truth checked separately (see the
// "matches the seeded catalog" test in engine.test.ts).
export function standardCatalog(): ExerciseCandidateDTO[] {
  return [
    makeExercise({ name: "Bench Press", equipmentType: "BARBELL", primaryMuscles: ["Chest"], secondaryMuscles: ["Triceps", "Front Deltoid"] }),
    makeExercise({ name: "Lat Pulldown", equipmentType: "MACHINE", primaryMuscles: ["Lats"], secondaryMuscles: ["Biceps"] }),
    makeExercise({ name: "Shoulder Press", equipmentType: "DUMBBELL", primaryMuscles: ["Front Deltoid"], secondaryMuscles: ["Side Deltoid", "Triceps"] }),
    makeExercise({ name: "Dumbbell Curl", equipmentType: "DUMBBELL", primaryMuscles: ["Biceps"] }),
    makeExercise({ name: "Triceps Pushdown", equipmentType: "CABLE", primaryMuscles: ["Triceps"] }),
    makeExercise({ name: "Squat", equipmentType: "BARBELL", primaryMuscles: ["Quadriceps", "Glutes"], secondaryMuscles: ["Hamstrings"] }),
    makeExercise({ name: "Deadlift", equipmentType: "BARBELL", primaryMuscles: ["Glutes", "Hamstrings"], secondaryMuscles: ["Lats"] }),
    makeExercise({ name: "Calf Raise", equipmentType: "BODYWEIGHT", primaryMuscles: ["Calves"] }),
    makeExercise({ name: "Leg Press", equipmentType: "MACHINE", primaryMuscles: ["Quadriceps", "Glutes"], secondaryMuscles: ["Hamstrings"] }),
    makeExercise({ name: "Crunch", equipmentType: "BODYWEIGHT", primaryMuscles: ["Abs"] }),
  ];
}
