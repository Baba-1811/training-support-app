// Plain DTOs handed to components (never Prisma models). Muscle names are the DB names; labels are applied in the UI.
export type ExerciseSummaryDTO = {
  id: string; name: string; equipmentType: string;
  primaryMuscles: string[]; secondaryMuscles: string[];
};
export type ExerciseDetailDTO = ExerciseSummaryDTO & {
  description: string | null; instructions: string | null; tips: string | null;
};
