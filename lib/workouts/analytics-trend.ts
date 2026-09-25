import { comparePerformance, summarizeSessions } from "./analytics";
import type { ExerciseTrend, ExerciseTrendRecord, PerformanceComparison, TrendPeriod, TrendPoint, TrendSummary } from "./types";

const JST_OFFSET_MS = 9 * 60 * 60 * 1000;
const PERIOD_MONTHS: Record<Exclude<TrendPeriod, "ALL">, number> = { "1M": 1, "3M": 3 };

const byStartedAt = (a: TrendPoint, b: TrendPoint) =>
  new Date(a.startedAt).getTime() - new Date(b.startedAt).getTime() || a.sessionId.localeCompare(b.sessionId);

// Group records by exercise, then by workout, and let summarizeSessions (the Phase 1 definition:
// completed WORKING sets only, max e1RM, sum of weight x reps) produce one point per workout.
// Records must already be scoped to the owner's COMPLETED sessions. Each series is oldest -> newest and
// the list is ordered by most recently performed exercise first. Workouts are never merged by day.
export function buildExerciseTrends(records: readonly ExerciseTrendRecord[]): ExerciseTrend[] {
  const byExercise = new Map<string, { name: string; records: ExerciseTrendRecord[] }>();
  for (const record of records) {
    const entry = byExercise.get(record.exerciseId);
    if (entry) entry.records.push(record);
    else byExercise.set(record.exerciseId, { name: record.exerciseName, records: [record] });
  }
  const trends: ExerciseTrend[] = [];
  for (const [exerciseId, { name, records: group }] of byExercise) {
    const points = summarizeSessions(group).sort(byStartedAt);
    if (points.length > 0) trends.push({ exerciseId, name, points });
  }
  const latest = (trend: ExerciseTrend) => new Date(trend.points[trend.points.length - 1].startedAt).getTime();
  return trends.sort((a, b) => latest(b) - latest(a) || a.name.localeCompare(b.name, "ja"));
}

// Home "growth snapshot": the most recently performed exercise, its latest workout and the change from the
// workout before it. Reuses summarizeTrend on the last two points, so the delta is the same Phase 1 comparison.
// `comparison` is null when the exercise has only one workout (nothing to compare, not "no change").
export function buildGrowthSnapshot(trends: readonly ExerciseTrend[]): { name: string; latest: TrendPoint; comparison: PerformanceComparison | null } | null {
  const trend = trends[0];
  if (!trend) return null;
  const { latest, comparison } = summarizeTrend(trend.points.slice(-2));
  return latest ? { name: trend.name, latest, comparison } : null;
}

// Calendar-month cutoff, computed on the Asia/Tokyo calendar (the app's display timezone; JST has no DST so a
// fixed offset is exact). The time of day is kept and the day of month is clamped to the target month's length
// (e.g. 3/31 minus one month = 2/28). The result is an absolute instant; it does not change how dates are shown.
export function periodStart(period: TrendPeriod, now: Date): Date | null {
  if (period === "ALL") return null;
  const jst = new Date(now.getTime() + JST_OFFSET_MS);
  const targetMonth = jst.getUTCMonth() - PERIOD_MONTHS[period];
  const lastDay = new Date(Date.UTC(jst.getUTCFullYear(), targetMonth + 1, 0)).getUTCDate();
  const shifted = Date.UTC(
    jst.getUTCFullYear(), targetMonth, Math.min(jst.getUTCDate(), lastDay),
    jst.getUTCHours(), jst.getUTCMinutes(), jst.getUTCSeconds(), jst.getUTCMilliseconds(),
  );
  return new Date(shifted - JST_OFFSET_MS);
}

// Inclusive lower bound: a workout started exactly at the cutoff is inside the period.
export function filterPointsByPeriod(points: readonly TrendPoint[], period: TrendPeriod, now: Date): TrendPoint[] {
  const start = periodStart(period, now);
  if (start === null) return [...points];
  return points.filter((point) => new Date(point.startedAt).getTime() >= start.getTime());
}

// "Current" = newest workout in the period; change = newest - oldest (same Phase 1 delta as previous comparison).
// Fewer than two points means there is nothing to compare, which is not the same as "no change".
export function summarizeTrend(points: readonly TrendPoint[]): TrendSummary {
  const sorted = [...points].sort(byStartedAt);
  const oldest = sorted[0] ?? null;
  const latest = sorted[sorted.length - 1] ?? null;
  return {
    pointCount: sorted.length, latest, oldest,
    comparison: sorted.length >= 2 && latest && oldest ? comparePerformance(latest, oldest) : null,
  };
}
