import { jstDateOnly } from "@/lib/date/jst";
import type { ConditionRecommendationInputDTO } from "@/lib/conditions/types";

// ============================================================
// Soreness rules
// ============================================================
// PRIMARY Muscle soreness decides whether an Exercise (and, transitively, a category with no remaining
// candidate) can be recommended at all. Levels 4 ("強い") and 5 ("かなり強い") are both a hard exclude: a user
// who reports "強い" soreness must never be routed back into that muscle group just because no other candidate
// exists — see Phase 5 investigation section 10, revised from an earlier draft that only excluded level 5.
export const PRIMARY_SORENESS_EXCLUDE_AT = 4;

// Levels 1-3 never exclude, but still shift a category's score down as soreness rises, so a "あり" (3) category
// is only picked over a fresher one when nothing less sore is eligible.
export const PRIMARY_SORENESS_PENALTY: Readonly<Record<number, number>> = {
  1: 0,
  2: -1,
  3: -3,
};

// SECONDARY Muscle soreness never excludes a category or an Exercise — it only penalizes that Exercise's rank
// among its category's candidates, because the sore muscle is not the one doing the primary work. The scale is
// steeper than PRIMARY's (levels 2-5 vs. 2-3) since SECONDARY soreness has more room to express "how much this
// should be deprioritized" without ever having to become a hard exclude.
export const SECONDARY_SORENESS_PENALTY: Readonly<Record<number, number>> = {
  1: 0,
  2: -1,
  3: -2,
  4: -3,
  5: -4,
};

export function isPrimarySorenessExcluded(level: number | undefined): boolean {
  return level !== undefined && level >= PRIMARY_SORENESS_EXCLUDE_AT;
}

// Level 1 and "no entry at all" (the Muscle was never marked sore) both mean "no penalty" — the app's own
// convention is that an unselected category has no MuscleCondition row, not a level-0 one.
export function primarySorenessPenalty(level: number | undefined): number {
  if (level === undefined) return PRIMARY_SORENESS_PENALTY[1];
  // Levels 4/5 are excluded before scoring ever runs (see isPrimarySorenessExcluded); this fallback only
  // protects against being called out of order and never changes engine.ts's actual behavior.
  return PRIMARY_SORENESS_PENALTY[level] ?? PRIMARY_SORENESS_PENALTY[3];
}

export function secondarySorenessPenalty(level: number | undefined): number {
  if (level === undefined) return SECONDARY_SORENESS_PENALTY[1];
  return SECONDARY_SORENESS_PENALTY[level] ?? SECONDARY_SORENESS_PENALTY[5];
}

// ============================================================
// Recency rules
// ============================================================
// Degrees of "how long ago", not a single "3+ days = bonus" cliff: the gap between yesterday and a week ago
// reads as a spectrum. "never" scores the same as "7+" (both mean "nothing to hold this category back").
export type RecencyBucket = "today" | "1" | "2" | "3-6" | "7+" | "never";

export const RECENCY_SCORE: Readonly<Record<RecencyBucket, number>> = {
  today: -5,
  "1": -3,
  "2": -1,
  "3-6": 1,
  "7+": 3,
  never: 3,
};

// `today` and `lastTrainedAt` are both JST calendar dates (YYYY-MM-DD). Both sides are parsed as UTC midnight of
// that calendar day and diffed in whole days — no reliance on wall-clock time or a timezone offset at the
// moment this function runs, so it cannot be unstable at a timezone boundary the way `Date` subtraction of two
// arbitrary instants could be.
function parseDateOnly(value: string): number {
  const [year, month, day] = value.split("-").map(Number);
  return Date.UTC(year, month - 1, day);
}

export function daysSince(today: string, dateOnly: string): number {
  return Math.round((parseDateOnly(today) - parseDateOnly(dateOnly)) / 86_400_000);
}

// The JST calendar date (YYYY-MM-DD) of a fixed ISO instant, e.g. a WorkoutSession.startedAt already captured in
// the context. Reuses lib/date/jst.ts's existing offset math instead of re-deriving it; always passed an
// explicit Date built from that fixed instant, never the implicit `new Date()` default (the engine must not
// read the system clock).
export function toJstDateOnly(iso: string): string {
  return jstDateOnly(new Date(iso)).toISOString().slice(0, 10);
}

// `days === null` means "no record" (never trained / absent from the lookback window); negative values
// (a lastTrainedAt after `today`, which should not happen but is not this function's job to validate) are
// clamped to "today" rather than producing a nonsensical bucket.
export function recencyBucket(days: number | null): RecencyBucket {
  if (days === null) return "never";
  if (days <= 0) return "today";
  if (days === 1) return "1";
  if (days === 2) return "2";
  if (days <= 6) return "3-6";
  return "7+";
}

// A category's score: how sore its worst-affected relevant PRIMARY muscle is, plus how long it has been since
// that category was last trained. Categories with no relevant muscle data yet (cold start) score using "never".
export function categoryScore(worstPrimarySorenessLevel: number | undefined, recencyDays: number | null): number {
  return primarySorenessPenalty(worstPrimarySorenessLevel) + RECENCY_SCORE[recencyBucket(recencyDays)];
}

// ============================================================
// Reduced-load rule
// ============================================================
// Sleep and fatigue never decide WHICH body part is trained — only how much of it. Null values are "unknown",
// not "bad": a missing sleepHours/fatigueLevel never triggers reduced load by itself.
export const REDUCED_LOAD_SLEEP_HOURS_THRESHOLD = 6;
export const REDUCED_LOAD_FATIGUE_LEVEL_THRESHOLD = 4;

export function isReducedLoad(condition: Pick<ConditionRecommendationInputDTO, "sleepHours" | "fatigueLevel">): boolean {
  const sleepHours = condition.sleepHours === null ? null : Number(condition.sleepHours);
  const sleepTooLow = sleepHours !== null && Number.isFinite(sleepHours) && sleepHours < REDUCED_LOAD_SLEEP_HOURS_THRESHOLD;
  const fatigueTooHigh = condition.fatigueLevel !== null && condition.fatigueLevel >= REDUCED_LOAD_FATIGUE_LEVEL_THRESHOLD;
  return sleepTooLow || fatigueTooHigh; // OR, not additive: meeting both conditions still only halves the load once.
}

// ============================================================
// availableMinutes budget
// ============================================================
// availableMinutes is a budget (an upper bound on how much to propose), never a quota to fill. 45 minutes is the
// fallback for a null value because it is the middle option of the app's own 30/45/60/90 stepper.
export const DEFAULT_AVAILABLE_MINUTES = 45;

export const MAX_EXERCISES_BY_MINUTES: Readonly<Record<number, number>> = {
  30: 2,
  45: 3,
  60: 4,
  90: 5,
};

const MINIMUM_EXERCISES = 1;

// reducedLoad lowers the exercise budget by one (never below the minimum) rather than touching targetSets twice
// for the same underlying "today is a lighter day" signal.
export function resolveMaxExercises(availableMinutes: number | null, reducedLoad: boolean): number {
  const minutes = availableMinutes ?? DEFAULT_AVAILABLE_MINUTES;
  const base = MAX_EXERCISES_BY_MINUTES[minutes] ?? MAX_EXERCISES_BY_MINUTES[DEFAULT_AVAILABLE_MINUTES];
  return Math.max(MINIMUM_EXERCISES, reducedLoad ? base - 1 : base);
}
