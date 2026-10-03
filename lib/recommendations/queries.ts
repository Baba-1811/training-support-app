import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { jstDateOnly } from "@/lib/date/jst";
import { getTodayConditionForRecommendationForUser } from "@/lib/conditions/queries";
import { getLatestExercisePerformanceForUser } from "@/lib/workouts/queries";
import { matchRecommendationTarget, type PlanExerciseSnapshot } from "@/lib/workouts/recommendation-target";
import { evaluateRecommendedExercise } from "@/lib/workouts/recommendation-evaluation";
import type { SetDTO } from "@/lib/workouts/types";
import { toJstDateOnly } from "./rules";
import { recommendWorkout } from "./engine";
import { decideProgression } from "./progression";
import type { ExerciseCandidateDTO, ExerciseMuscleLinkDTO, PreviousRecommendationContext, RecommendationResult } from "./types";

const LOOKBACK_DAYS = 30;

// Recommendation candidates: every active Exercise with its PRIMARY/SECONDARY Muscle relations, ONE query (the
// muscles ride along in a nested select, so there is no per-exercise follow-up). Exercise activity is filtered
// at the DB (isActive: true, same as lib/exercises/queries.ts#listExercises). Muscle activity is deliberately
// NOT filtered here — every relation is returned with `muscleIsActive` so the Phase 5A engine's own independent
// active-muscle check is exercised against real data, instead of a value that would always be true by
// construction if this query pre-filtered it away. Result order is whatever Postgres returns; the engine does
// not depend on candidate order (see lib/recommendations/engine.ts's category/tie-break logic).
export async function listRecommendationCandidates(): Promise<ExerciseCandidateDTO[]> {
  await requireUser();
  return listRecommendationCandidatesInternal();
}

// Internal variant: no requireUser() of its own. Unlike the other *ForUser query variants in this codebase,
// this one takes no userId either — the Exercise Library is not owner-scoped data, so `requireUser()` here was
// only ever an auth GATE (any signed-in user may read it), never an ownership filter. getTodayRecommendationForUser
// already runs behind one requireUser() call made by its own caller, so gating again here would just be a second
// Supabase Auth API call for the same already-authenticated request (the Auth call amplification this file fixes).
async function listRecommendationCandidatesInternal(): Promise<ExerciseCandidateDTO[]> {
  const exercises = await prisma.exercise.findMany({
    where: { isActive: true },
    select: {
      id: true, name: true, equipmentType: true, weightIncrementKg: true,
      exerciseMuscles: { select: { role: true, muscle: { select: { name: true, isActive: true } } } },
    },
  });
  return exercises.map((exercise) => ({
    exerciseId: exercise.id,
    exerciseName: exercise.name,
    equipmentType: exercise.equipmentType,
    isActive: true, // guaranteed by the where-clause above; carried through explicitly rather than assumed by the engine
    weightIncrementKg: exercise.weightIncrementKg === null ? null : Number(exercise.weightIncrementKg),
    muscles: exercise.exerciseMuscles.map((relation): ExerciseMuscleLinkDTO => ({
      muscleName: relation.muscle.name, role: relation.role, muscleIsActive: relation.muscle.isActive,
    })),
  }));
}

type MuscleTrainingRow = { muscleName: string; startedAt: Date };

// Pure: the most recent JST calendar date each muscle was trained as PRIMARY, from raw (muscle, startedAt) rows
// in any order. Exported so it is unit-testable without a database — the DB query below only has to fetch rows
// and hand them here.
export function reduceLastTrainedAtByMuscle(rows: readonly MuscleTrainingRow[]): Partial<Record<string, string>> {
  const latestByMuscle: Record<string, Date> = {};
  for (const row of rows) {
    const current = latestByMuscle[row.muscleName];
    if (!current || row.startedAt > current) latestByMuscle[row.muscleName] = row.startedAt;
  }
  return Object.fromEntries(
    Object.entries(latestByMuscle).map(([muscleName, startedAt]) => [muscleName, toJstDateOnly(startedAt.toISOString())]),
  );
}

// Muscle.name -> JST calendar date (YYYY-MM-DD) of the most recent COMPLETED performance that trains it as
// PRIMARY, within a 30-day lookback anchored to the caller's own `today` (never a fresh "now" computed here —
// the boundary must agree with whatever the engine later treats as "today"). A muscle absent from the result has
// no such performance in that window; per the RecommendationContext contract this reads identically to "never
// trained", which is intentional (see lib/recommendations/types.ts). ONE query; grouping is the pure reducer above.
export async function getLastTrainedAtByMuscle(today: Date): Promise<Partial<Record<string, string>>> {
  const user = await requireUser();
  return getLastTrainedAtByMuscleForUser(user.id, today);
}

// Internal, owner-scoped variant: no requireUser() of its own (same reasoning as lib/workouts/queries.ts's
// *ForUser variants — the caller, getTodayRecommendationForUser, already authenticated once for this request).
async function getLastTrainedAtByMuscleForUser(userId: string, today: Date): Promise<Partial<Record<string, string>>> {
  const lookbackStart = new Date(today.getTime() - LOOKBACK_DAYS * 24 * 60 * 60 * 1000);
  const entries = await prisma.workoutExercise.findMany({
    where: { workoutSession: { userId, status: "COMPLETED", startedAt: { gte: lookbackStart } } },
    select: {
      workoutSession: { select: { startedAt: true } },
      exercise: { select: { exerciseMuscles: { where: { role: "PRIMARY" }, select: { muscle: { select: { name: true } } } } } },
    },
  });
  const rows: MuscleTrainingRow[] = entries.flatMap((entry) =>
    entry.exercise.exerciseMuscles.map((relation) => ({ muscleName: relation.muscle.name, startedAt: entry.workoutSession.startedAt })));
  return reduceLastTrainedAtByMuscle(rows);
}

type LatestRecommendationRow = { exerciseId: string; exerciseOrder: number; workoutExerciseId: string; workoutPlanId: string };
type PlanExerciseRow = PlanExerciseSnapshot & { workoutPlanId: string };
type RecommendationSetRow = { workoutExerciseId: string; setNumber: number; weightKg: string; reps: number; setType: "WORKING" | "WARMUP"; completed: boolean };

// Pure (Phase 5F-3B): reuses the exact Phase 5E-1 matching rule (matchRecommendationTarget — exerciseOrder
// primary, exerciseId consistency guard) and the Phase 5F-1/5F-3A evaluation/progression pipeline, rather than
// re-implementing EXCEEDED/ACHIEVED/etc. at the query layer. `latestRows` is at most one row per exerciseId (the
// most recent Recommendation-linked COMPLETED WorkoutExercise); an exerciseId is simply absent from the result
// when no matching WorkoutPlanExercise is found for it (not a "valid previous Recommendation" — see
// target.ts#resolveTargetWeightKg, which then falls back to the latest-performance-based target instead).
export function reducePreviousRecommendationProgress(
  latestRows: readonly LatestRecommendationRow[], planRows: readonly PlanExerciseRow[], setRows: readonly RecommendationSetRow[],
): Record<string, PreviousRecommendationContext> {
  const result: Record<string, PreviousRecommendationContext> = {};
  for (const row of latestRows) {
    const plansInThisPlan = planRows.filter((plan) => plan.workoutPlanId === row.workoutPlanId);
    const target = matchRecommendationTarget({ exerciseId: row.exerciseId, exerciseOrder: row.exerciseOrder }, plansInThisPlan);
    if (!target) continue;
    const sets: SetDTO[] = setRows
      .filter((set) => set.workoutExerciseId === row.workoutExerciseId)
      .map((set) => ({
        id: `${set.workoutExerciseId}-${set.setNumber}`, setNumber: set.setNumber, weightKg: set.weightKg, reps: set.reps,
        rir: null, setType: set.setType, completed: set.completed,
      }));
    const evaluation = evaluateRecommendedExercise({ target, sets });
    if (!evaluation) continue; // unreachable (target is non-null here); kept so a future signature change fails safe.
    result[row.exerciseId] = {
      previousTargetWeightKg: target.targetWeightKg,
      progressionDecision: decideProgression(evaluation).decision,
      previousEvaluationStatus: evaluation.status,
    };
  }
  return result;
}

// Internal, owner-scoped (no requireUser() of its own — same reasoning as the other *ForUser variants in this
// file). THREE fixed queries regardless of candidate count (no N+1): (1) the single most recent
// Recommendation-linked COMPLETED WorkoutExercise per exerciseId — `workoutPlanId: { not: null }` and
// `status: "COMPLETED"` exclude both a normal/Exercise-Library Workout and any IN_PROGRESS/CANCELLED one (so
// today's own in-flight Workout, which cannot be COMPLETED yet, is never picked up as its own "previous");
// (2) every WorkoutPlanExercise belonging to those rows' WorkoutPlans, matched to its own WorkoutExercise by
// exerciseOrder (reducePreviousRecommendationProgress, not here); (3) every actual WorkoutSet for those exact
// WorkoutExercise rows. The `exerciseOrder: "desc"` tiebreak only disambiguates the rare case of the same
// Exercise appearing twice within one session (deterministic test behavior); either duplicate's own target and
// actual are still correctly paired by exerciseOrder regardless of which one this picks.
async function getPreviousRecommendationProgressForUser(
  userId: string, exerciseIds: string[],
): Promise<Record<string, PreviousRecommendationContext>> {
  const uniqueIds = [...new Set(exerciseIds)];
  if (uniqueIds.length === 0) return {};

  const latestRows = await prisma.workoutExercise.findMany({
    where: { exerciseId: { in: uniqueIds }, workoutSession: { userId, status: "COMPLETED", workoutPlanId: { not: null } } },
    distinct: ["exerciseId"],
    orderBy: [{ workoutSession: { startedAt: "desc" } }, { exerciseOrder: "desc" }],
    select: { id: true, exerciseId: true, exerciseOrder: true, workoutSession: { select: { workoutPlanId: true } } },
  });
  if (latestRows.length === 0) return {};

  const workoutPlanIds = [...new Set(latestRows.map((row) => row.workoutSession.workoutPlanId!))];
  const [planRows, setRows] = await Promise.all([
    prisma.workoutPlanExercise.findMany({
      where: { workoutPlanId: { in: workoutPlanIds } },
      select: { workoutPlanId: true, exerciseId: true, exerciseOrder: true, targetWeightKg: true, targetRepsMin: true, targetRepsMax: true, targetSets: true, restSeconds: true },
    }),
    prisma.workoutSet.findMany({
      where: { workoutExerciseId: { in: latestRows.map((row) => row.id) } },
      select: { workoutExerciseId: true, setNumber: true, weightKg: true, reps: true, setType: true, completed: true },
    }),
  ]);

  return reducePreviousRecommendationProgress(
    latestRows.map((row) => ({
      exerciseId: row.exerciseId, exerciseOrder: row.exerciseOrder, workoutExerciseId: row.id, workoutPlanId: row.workoutSession.workoutPlanId!,
    })),
    planRows.map((row) => ({ ...row, targetWeightKg: row.targetWeightKg === null ? null : Number(row.targetWeightKg) })),
    setRows.map((row) => ({ ...row, weightKg: row.weightKg.toString() })),
  );
}

// DB -> RecommendationContext -> recommendWorkout() -> RecommendationResult. Read/compose only: nothing here
// persists a WorkoutPlan (that is a later phase). null means no Condition was entered today (distinct from the
// engine's own { kind: "REST" } result, which means a Condition exists but rest is recommended — see
// getTodayConditionForRecommendation's own comment).
export async function getTodayRecommendation(): Promise<RecommendationResult | null> {
  const user = await requireUser();
  return getTodayRecommendationForUser(user.id);
}

// Internal, owner-scoped variant: no requireUser() of its own, and none of the internal helpers it calls
// (listRecommendationCandidatesInternal, getLastTrainedAtByMuscleForUser, getTodayConditionForRecommendationForUser,
// getLatestExercisePerformanceForUser) re-authenticate either. Before this split, a single getTodayRecommendation()
// call amplified into five separate requireUser() calls (itself + four internal queries), each a real Supabase
// Auth API round trip when called outside the per-request React cache() that normally dedupes requireUser() — see
// app/(protected)/page.tsx, which calls requireUser() once and passes that user.id to every Home query, this one
// included. userId must always come from requireUser()'s own result, never from client input.
export async function getTodayRecommendationForUser(userId: string): Promise<RecommendationResult | null> {
  const today = jstDateOnly();
  const todayString = today.toISOString().slice(0, 10);

  const [condition, exercises, lastTrainedAtByMuscle] = await Promise.all([
    getTodayConditionForRecommendationForUser(userId),
    listRecommendationCandidatesInternal(),
    getLastTrainedAtByMuscleForUser(userId, today),
  ]);
  if (!condition) return null;

  // Both depend on the candidate list above, so neither can join the Promise.all above: only run once we know
  // which Exercises are actually in play, and never for a Condition-less day (would be wasted work).
  const exerciseIds = exercises.map((exercise) => exercise.exerciseId);
  const [previousPerformanceByExerciseId, previousRecommendationByExerciseId] = await Promise.all([
    getLatestExercisePerformanceForUser(userId, exerciseIds),
    getPreviousRecommendationProgressForUser(userId, exerciseIds),
  ]);

  return recommendWorkout({
    today: todayString, condition, exercises, lastTrainedAtByMuscle, previousPerformanceByExerciseId, previousRecommendationByExerciseId,
  });
}
