import type { EquipmentType, PreviousRecommendationContext, WeightTargetExplanation } from "./types";
import type { PreviousExercisePerformanceDTO } from "@/lib/workouts/types";
import type { ProgressionDecision } from "./progression";

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
// Fallback only (no previous Recommendation to progress from): "the heaviest completed WORKING set weight,
// held" — the only defensible number when there is nothing planned to compare against.
function maxCompletedWeightKg(previous: PerformanceRecord): number | null {
  let max: number | null = null;
  for (const set of previous.sets) {
    const weight = Number(set.weightKg);
    if (!Number.isFinite(weight)) continue;
    if (max === null || weight > max) max = weight;
  }
  return max;
}

// Decimal(6,2) is the column's scale (see prisma/schema.prisma#WorkoutPlanExercise.targetWeightKg): rounding
// the sum to 2 decimal places here keeps the result exactly what Postgres will store, instead of occasionally
// persisting a JS floating-point artifact (e.g. 57.15 + 2.5 as a non-terminating binary fraction).
function roundToWeightScale(value: number): number {
  return Math.round(value * 100) / 100;
}

// Phase 5F-3B: previous PLANNED target (never the actual's incidental weight) + the Phase 5F-3A
// ProgressionDecision -> next target. A pure, total function of its three inputs:
// - previousTargetWeightKg=null (no previous plan, or a BODYWEIGHT Exercise) -> null; progression never
//   invents a first number.
// - INCREASE with a known weightIncrementKg -> previousTarget + increment, rounded to the DB's own scale.
// - INCREASE with weightIncrementKg=null, or MAINTAIN/INSUFFICIENT_DATA/DECREASE in any case -> previousTarget
//   held exactly. DECREASE has no v1 subtraction rule (see progression.ts); holding is the deliberate, safe
//   behavior rather than guessing a decrement.
export function resolveProgressedTargetWeightKg(args: {
  previousTargetWeightKg: number | null;
  progressionDecision: ProgressionDecision;
  weightIncrementKg: number | null;
}): number | null {
  const { previousTargetWeightKg, progressionDecision, weightIncrementKg } = args;
  if (previousTargetWeightKg === null) return null;
  if (progressionDecision === "INCREASE" && weightIncrementKg !== null) {
    return roundToWeightScale(previousTargetWeightKg + weightIncrementKg);
  }
  return previousTargetWeightKg;
}

// Phase 5F-3C: no-previous-Recommendation-context fields, shared by every branch below that has no previous
// Recommendation to report (so each only has to state what differs: `reason` and, for LATEST_PERFORMANCE,
// nothing else).
const NO_PREVIOUS_RECOMMENDATION = { previousTargetWeightKg: null, weightIncrementKg: null, progressionDecision: null, previousEvaluationStatus: null } as const;

// Phase 5F-3C: targetWeightKg and its explanation, from ONE resolution — never two separately-maintained
// computations that could drift. `reason` is derived from comparing the resulting targetWeightKg to the
// previous one, not from re-switching on progressionDecision: this is what makes INCREASE+increment=null (and
// the unreachable-in-v1 DECREASE) fall out as MAINTAINED automatically, with no special-casing by decision name.
//
// Priority: (1) BODYWEIGHT is always null/NO_WEIGHT_TARGET. (2) A "valid" previous Recommendation — one whose
// own target weight was itself non-null — progresses from that PLANNED number via
// resolveProgressedTargetWeightKg, never from `previous`'s actual weight (Phase 5F-3B's core rule: planned-vs-
// actual evaluation already happened upstream; this only applies its resulting decision). (3) Otherwise, the
// pre-5F-3B latest-performance fallback. A previousRecommendation whose own previousTargetWeightKg is null
// (e.g. the Exercise had no history yet when that earlier Recommendation was built) is treated the same as "no
// previous Recommendation" here, so a user who has since actually performed the Exercise still gets the
// (2)-skipping, (3) latest-performance number instead of being stuck at null.
export function resolveWeightTarget(
  equipmentType: EquipmentType,
  previous: PreviousExercisePerformanceDTO | null | undefined,
  previousRecommendation?: (PreviousRecommendationContext & { weightIncrementKg: number | null }) | null,
): { targetWeightKg: number | null; explanation: WeightTargetExplanation } {
  // BODYWEIGHT never gets a weight target, even if history has a (0kg) weight recorded — "null" means "no
  // meaningful number", not "0". Weight recommendation itself does not apply, which NO_HISTORY would misstate
  // as "data is missing" rather than "not applicable".
  if (equipmentType === "BODYWEIGHT") {
    return { targetWeightKg: null, explanation: { reason: "NO_WEIGHT_TARGET", ...NO_PREVIOUS_RECOMMENDATION } };
  }
  if (previousRecommendation && previousRecommendation.previousTargetWeightKg !== null) {
    const { previousTargetWeightKg, progressionDecision, weightIncrementKg, previousEvaluationStatus } = previousRecommendation;
    const targetWeightKg = resolveProgressedTargetWeightKg(previousRecommendation);
    const progressed = targetWeightKg !== null && targetWeightKg > previousTargetWeightKg;
    return {
      targetWeightKg,
      explanation: { reason: progressed ? "PROGRESSED" : "MAINTAINED", previousTargetWeightKg, weightIncrementKg, progressionDecision, previousEvaluationStatus },
    };
  }
  if (!previous || previous.sets.length === 0) {
    return { targetWeightKg: null, explanation: { reason: "NO_HISTORY", ...NO_PREVIOUS_RECOMMENDATION } };
  }
  return { targetWeightKg: maxCompletedWeightKg(previous), explanation: { reason: "LATEST_PERFORMANCE", ...NO_PREVIOUS_RECOMMENDATION } };
}

// Thin wrapper kept for every existing caller/test that only needs the number — same signature and behavior as
// before Phase 5F-3C, since it now simply reads the one field it always returned out of resolveWeightTarget.
export function resolveTargetWeightKg(
  equipmentType: EquipmentType,
  previous: PreviousExercisePerformanceDTO | null | undefined,
  previousRecommendation?: (PreviousRecommendationContext & { weightIncrementKg: number | null }) | null,
): number | null {
  return resolveWeightTarget(equipmentType, previous, previousRecommendation).targetWeightKg;
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
