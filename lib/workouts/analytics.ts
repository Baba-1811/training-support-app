import { estimatedOneRepMax } from "./calculations";
import type {
  AnalyticsSet, ExerciseAnalyticsDTO, ExerciseHistoryRecord, PerformanceComparison, PerformanceSummary, RecordStatus, WorkoutDTO,
} from "./types";

// e1RM is a floating-point Epley value, so mathematically equal results can differ by noise.
const EPSILON = 1e-9;

function parseWeightKg(value: string): number | null {
  if (value.trim() === "") return null;
  const weight = Number(value);
  return Number.isFinite(weight) && weight >= 0 ? weight : null;
}

// The single definition of an analyzable set: completed WORKING only. Warmups and unconfirmed rows never count.
// Used for both confirmed history and the provisional numbers of an in-progress workout.
export function summarizePerformance(sets: readonly AnalyticsSet[]): PerformanceSummary | null {
  let e1rmKg: number | null = null;
  let volumeKg = 0;
  let workingSetCount = 0;
  for (const set of sets) {
    if (!set.completed || set.setType !== "WORKING") continue;
    const weight = parseWeightKg(set.weightKg);
    if (weight === null) continue;
    const e1rm = estimatedOneRepMax(weight, set.reps);
    if (e1rm === null) continue;
    if (e1rmKg === null || e1rm > e1rmKg) e1rmKg = e1rm;
    volumeKg += weight * set.reps;
    workingSetCount += 1;
  }
  return e1rmKg === null ? null : { e1rmKg, volumeKg, workingSetCount };
}

const snap = (delta: number) => (Math.abs(delta) < EPSILON ? 0 : delta);

export function comparePerformance(current: PerformanceSummary, previous: PerformanceSummary): PerformanceComparison {
  return { e1rmDeltaKg: snap(current.e1rmKg - previous.e1rmKg), volumeDeltaKg: snap(current.volumeKg - previous.volumeKg) };
}

// A session may hold the same exercise more than once; treat those as one workout's performance.
function summarizeBySession(history: readonly ExerciseHistoryRecord[]): Array<PerformanceSummary & { startedAt: string }> {
  const grouped = new Map<string, { startedAt: string; sets: AnalyticsSet[] }>();
  for (const record of history) {
    const entry = grouped.get(record.sessionId);
    if (entry) entry.sets.push(...record.sets);
    else grouped.set(record.sessionId, { startedAt: record.startedAt, sets: [...record.sets] });
  }
  const result: Array<PerformanceSummary & { startedAt: string }> = [];
  for (const { startedAt, sets } of grouped.values()) {
    const summary = summarizePerformance(sets);
    if (summary) result.push({ ...summary, startedAt });
  }
  return result;
}

const maxE1rm = (summaries: ReadonlyArray<PerformanceSummary>): number | null =>
  summaries.reduce<number | null>((best, item) => (best === null || item.e1rmKg > best ? item.e1rmKg : best), null);

// `history` must already be scoped to the owner's other COMPLETED sessions for this exercise; the current
// session is not part of it. Sessions starting before `currentStartedAt` are "past"; the newest of those
// that has an analyzable set is the previous workout.
export function buildExerciseAnalytics(
  currentSets: readonly AnalyticsSet[], history: readonly ExerciseHistoryRecord[], currentStartedAt: string,
): ExerciseAnalyticsDTO {
  const current = summarizePerformance(currentSets);
  const started = new Date(currentStartedAt).getTime();
  const sessions = summarizeBySession(history);
  const past = sessions.filter((item) => new Date(item.startedAt).getTime() < started);
  const previous = past.reduce<(typeof past)[number] | null>(
    (latest, item) => (latest === null || new Date(item.startedAt).getTime() > new Date(latest.startedAt).getTime() ? item : latest), null);
  const previousBestE1rmKg = maxE1rm(past);
  const allTimeBest = maxE1rm(sessions);
  const personalBestE1rmKg = current === null ? allTimeBest : allTimeBest === null ? current.e1rmKg : Math.max(allTimeBest, current.e1rmKg);
  let recordStatus: RecordStatus = "NONE";
  if (current !== null) {
    if (previousBestE1rmKg === null) recordStatus = "FIRST_RECORD";
    else if (current.e1rmKg > previousBestE1rmKg + EPSILON) recordStatus = "NEW_BEST";
  }
  return {
    current, previous,
    comparison: current && previous ? comparePerformance(current, previous) : null,
    previousBestE1rmKg, personalBestE1rmKg, recordStatus,
  };
}

// Keyed by WorkoutExercise id. `historyByExercise` is keyed by Exercise id.
export function buildWorkoutAnalytics(
  workout: Pick<WorkoutDTO, "startedAt" | "exercises">, historyByExercise: Record<string, ExerciseHistoryRecord[]>,
): Record<string, ExerciseAnalyticsDTO> {
  return Object.fromEntries(workout.exercises.map((exercise) => [
    exercise.id, buildExerciseAnalytics(exercise.sets, historyByExercise[exercise.exerciseId] ?? [], workout.startedAt),
  ]));
}
