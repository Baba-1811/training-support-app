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
export type WorkoutHistorySummaryDTO = {
  id: string; title: string | null; startedAt: string; completedAt: string;
  exerciseNames: string[]; workingSetCount: number;
};
export type PreviousSetDTO = { weightKg: string; reps: number };
export type PreviousExercisePerformanceDTO = { startedAt: string; sets: PreviousSetDTO[] } | null;

// Analytics (derived values only; nothing here is persisted).
export type AnalyticsSet = { weightKg: string; reps: number; setType: "WORKING" | "WARMUP"; completed: boolean };
// One past COMPLETED session's sets for a single exercise.
export type ExerciseHistoryRecord = { sessionId: string; startedAt: string; sets: AnalyticsSet[] };
export type PerformanceSummary = { e1rmKg: number; volumeKg: number; workingSetCount: number };
export type PerformanceComparison = { e1rmDeltaKg: number; volumeDeltaKg: number };
export type RecordStatus = "NEW_BEST" | "FIRST_RECORD" | "NONE";
export type ExerciseAnalyticsDTO = {
  current: PerformanceSummary | null;
  previous: (PerformanceSummary & { startedAt: string }) | null;
  comparison: PerformanceComparison | null;
  // Best e1RM strictly before the current session (null = no earlier record).
  previousBestE1rmKg: number | null;
  // All-time best e1RM across the user's COMPLETED sessions, including the current one.
  personalBestE1rmKg: number | null;
  recordStatus: RecordStatus;
};

// Analytics Phase 2: per-exercise growth over time. Derived values only; nothing here is persisted.
export type TrendPeriod = "1M" | "3M" | "ALL";
// One COMPLETED workout's performance for one exercise (same-exercise entries within a workout are merged).
export type TrendPoint = PerformanceSummary & { sessionId: string; startedAt: string };
export type ExerciseTrend = { exerciseId: string; name: string; points: TrendPoint[] };
// A WorkoutExercise row of a past COMPLETED session, as loaded for the trend page.
export type ExerciseTrendRecord = ExerciseHistoryRecord & { exerciseId: string; exerciseName: string };
export type TrendSummary = {
  pointCount: number;
  latest: TrendPoint | null;
  oldest: TrendPoint | null;
  // latest - oldest within the period; null when there is nothing to compare (fewer than two points).
  comparison: PerformanceComparison | null;
};
