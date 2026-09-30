import type { EquipmentType } from "./types";
import type { PreviousExercisePerformanceDTO } from "@/lib/workouts/types";

// PreviousExercisePerformanceDTO is itself `{ startedAt; sets } | null`; the local helpers below only ever run
// after a null/undefined check, so they take the non-null shape directly instead of re-checking internally.
type PerformanceRecord = NonNullable<PreviousExercisePerformanceDTO>;

// ============================================================
// targetSets / restSeconds
// ============================================================
export const NORMAL_TARGET_SETS = 3;
export const REDUCED_TARGET_SETS = 2;

// Fixed at 2 vs. 3 for v1: no per-availableMinutes scaling (4/5 sets) yet — kept simple until there is a reason
// to differentiate further.
export function resolveTargetSets(reducedLoad: boolean): number {
  return reducedLoad ? REDUCED_TARGET_SETS : NORMAL_TARGET_SETS;
}

export const DEFAULT_AVAILABLE_MINUTES_FOR_REST = 45;
export const REST_SECONDS_BY_MINUTES: Readonly<Record<number, number>> = {
  30: 60,
  45: 75,
  60: 90,
  90: 90,
};

// restSeconds depends only on the time budget, never on reducedLoad (a lighter day still needs the same rest
// between sets) and never on a compound/isolation guess (the schema has no such field to read).
export function resolveRestSeconds(availableMinutes: number | null): number {
  const minutes = availableMinutes ?? DEFAULT_AVAILABLE_MINUTES_FOR_REST;
  return REST_SECONDS_BY_MINUTES[minutes] ?? REST_SECONDS_BY_MINUTES[DEFAULT_AVAILABLE_MINUTES_FOR_REST];
}

// ============================================================
// targetWeightKg
// ============================================================
// v1 never raises weight automatically: there is no plate-increment or per-equipment step size in the schema,
// so "the heaviest completed WORKING set weight, held" is the only defensible number to propose.
function maxCompletedWeightKg(previous: PerformanceRecord): number | null {
  let max: number | null = null;
  for (const set of previous.sets) {
    const weight = Number(set.weightKg);
    if (!Number.isFinite(weight)) continue;
    if (max === null || weight > max) max = weight;
  }
  return max;
}

export function resolveTargetWeightKg(
  equipmentType: EquipmentType, previous: PreviousExercisePerformanceDTO | null | undefined,
): number | null {
  // BODYWEIGHT never gets a weight target, even if history has a (0kg) weight recorded — "null" means "no
  // meaningful number", not "0".
  if (equipmentType === "BODYWEIGHT") return null;
  if (!previous || previous.sets.length === 0) return null;
  return maxCompletedWeightKg(previous);
}

// ============================================================
// targetReps
// ============================================================
export const COLD_START_REPS_MIN = 8;
export const COLD_START_REPS_MAX = 12;
export const REPS_PROGRESSION_STEP = 2;
export const MAX_TARGET_REPS = 15;

export type TargetRepsRange = { targetRepsMin: number; targetRepsMax: number };

// Representative reps = the lowest rep count among the sets tied for the heaviest completed weight: the
// "worst case at top weight" from last time, so the new range never assumes a better performance than was
// actually shown. E.g. 60kg x8, 60kg x8, 55kg x10 -> heaviest is 60kg, its reps are {8, 8} -> representative = 8.
function representativeReps(previous: PerformanceRecord, maxWeightKg: number): number {
  let representative: number | null = null;
  for (const set of previous.sets) {
    if (Number(set.weightKg) !== maxWeightKg) continue;
    if (representative === null || set.reps < representative) representative = set.reps;
  }
  // maxWeightKg was derived from these same sets, so at least one always matches; this satisfies the compiler
  // without asserting non-null on data this function does not fully control.
  return representative ?? COLD_START_REPS_MIN;
}

// Conservative progression only: previous 8 reps -> target 8-10, never straight to 12. Capped at MAX_TARGET_REPS
// so an already-high rep count is not pushed past a sensible ceiling.
export function resolveTargetReps(previous: PreviousExercisePerformanceDTO | null | undefined): TargetRepsRange {
  if (!previous || previous.sets.length === 0) return { targetRepsMin: COLD_START_REPS_MIN, targetRepsMax: COLD_START_REPS_MAX };
  const maxWeightKg = maxCompletedWeightKg(previous);
  // Every set here is a completed WORKING set (per RecommendationContext's contract), so reps >= 1 always; a
  // null max weight cannot occur when sets.length > 0, but the fallback keeps this function total.
  if (maxWeightKg === null) return { targetRepsMin: COLD_START_REPS_MIN, targetRepsMax: COLD_START_REPS_MAX };
  const representative = representativeReps(previous, maxWeightKg);
  return { targetRepsMin: representative, targetRepsMax: Math.min(representative + REPS_PROGRESSION_STEP, MAX_TARGET_REPS) };
}
