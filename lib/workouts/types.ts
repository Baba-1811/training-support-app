export type SetDTO = {
  id: string; setNumber: number; weightKg: string; reps: number; rir: string | null;
  setType: "WORKING" | "WARMUP"; completed: boolean;
};
export type ExerciseDTO = {
  id: string; exerciseId: string; name: string; exerciseOrder: number; muscles: string[]; sets: SetDTO[];
};
export type WorkoutDTO = {
  id: string; title: string | null; startedAt: string; completedAt: string | null;
  status: "IN_PROGRESS" | "COMPLETED" | "CANCELLED"; exercises: ExerciseDTO[];
};
export type ActionResult<T> = { ok: true; data: T } | {
  ok: false; code: "VALIDATION" | "NOT_FOUND" | "INVALID_STATE" | "CONFLICT" | "FAILED";
  message: string; fieldErrors?: Record<string, string[]>;
};
