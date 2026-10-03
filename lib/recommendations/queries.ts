import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { jstDateOnly } from "@/lib/date/jst";
import { getTodayConditionForRecommendationForUser } from "@/lib/conditions/queries";
import { getLatestExercisePerformanceForUser } from "@/lib/workouts/queries";
import { matchRecommendationTarget, type PlanExerciseSnapshot } from "@/lib/workouts/recommendation-target";
import { evaluateRecommendedExercise } from "@/lib/workouts/recommendation-evaluation";
import type { SetDTO, WorkoutRecommendationTargetDTO } from "@/lib/workouts/types";
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

type CandidateRecommendationRow = { exerciseId: string; exerciseOrder: number; workoutExerciseId: string; workoutPlanId: string; startedAt: Date };
type PlanExerciseRow = PlanExerciseSnapshot & { workoutPlanId: string };
type RecommendationSetRow = { workoutExerciseId: string; setNumber: number; weightKg: string; reps: number; setType: "WORKING" | "WARMUP"; completed: boolean };

type ValidPreviousRecommendationRow = { exerciseId: string; workoutExerciseId: string; exerciseOrder: number; startedAt: Date; target: WorkoutRecommendationTargetDTO };

// Validity before recency (Phase 5F-4): a candidateRow only becomes a contender at all once it has a matching
// WorkoutPlanExercise (matchRecommendationTarget — exerciseOrder primary, exerciseId consistency guard, the
// exact Phase 5E-1 rule, never re-implemented here). Filtering first and picking "latest among valid" second —
// rather than picking the single newest candidateRow and then checking whether THAT ONE happens to be valid —
// is what fixes Phase 5F-3B's gap: a newer but invalid row (e.g. this Exercise was added ad hoc to a
// Recommendation Workout, past the Plan's own Exercise list) no longer hides an older, genuinely valid pair.
function selectValidPreviousRecommendationRows(
  candidateRows: readonly CandidateRecommendationRow[], planRows: readonly PlanExerciseRow[],
): readonly ValidPreviousRecommendationRow[] {
  const valid: ValidPreviousRecommendationRow[] = [];
  for (const row of candidateRows) {
    const plansInThisPlan = planRows.filter((plan) => plan.workoutPlanId === row.workoutPlanId);
    const target = matchRecommendationTarget({ exerciseId: row.exerciseId, exerciseOrder: row.exerciseOrder }, plansInThisPlan);
    if (target) valid.push({ exerciseId: row.exerciseId, workoutExerciseId: row.workoutExerciseId, exerciseOrder: row.exerciseOrder, startedAt: row.startedAt, target });
  }
  return valid;
}

// Latest-among-valid, per Exercise: primary key is WorkoutSession.startedAt (newer wins). Two valid rows can
// only tie on startedAt when they belong to the SAME Session (the same Exercise recommended/performed twice in
// one Workout — Phase 5E/5F's duplicate-Exercise case), since distinct Sessions practically never share the
// exact same instant; the deterministic tie-break is then exerciseOrder DESC (the higher slot wins — an
// arbitrary but fixed, tested choice, see tests/recommendations/progression-query.test.ts).
function isNewerValidRow(candidate: ValidPreviousRecommendationRow, current: ValidPreviousRecommendationRow): boolean {
  const candidateTime = candidate.startedAt.getTime();
  const currentTime = current.startedAt.getTime();
  if (candidateTime !== currentTime) return candidateTime > currentTime;
  return candidate.exerciseOrder > current.exerciseOrder;
}

function selectLatestValidPreviousRecommendationRow(
  validRows: readonly ValidPreviousRecommendationRow[],
): Record<string, ValidPreviousRecommendationRow> {
  const latestByExercise: Record<string, ValidPreviousRecommendationRow> = {};
  for (const row of validRows) {
    const current = latestByExercise[row.exerciseId];
    if (!current || isNewerValidRow(row, current)) latestByExercise[row.exerciseId] = row;
  }
  return latestByExercise;
}

// Pure (Phase 5F-3B, hardened in 5F-4): reuses the exact Phase 5E-1 matching rule (matchRecommendationTarget)
// and the Phase 5F-1/5F-3A evaluation/progression pipeline, rather than re-implementing EXCEEDED/ACHIEVED/etc.
// at the query layer. `candidateRows` may hold many rows per exerciseId (every Recommendation-linked COMPLETED
// WorkoutExercise, not pre-narrowed to "the newest one") — see selectValidPreviousRecommendationRows/
// selectLatestValidPreviousRecommendationRow above for why validity must be decided before recency. An
// exerciseId is simply absent from the result when it has no valid pair at all (not "a previous Recommendation
// with no data" — see target.ts#resolveTargetWeightKg, which then falls back to the latest-performance-based
// target instead). `setRows` may include sets for non-winning candidateRows too (the caller fetches them in
// one batch alongside the winners, to keep this a fixed 3-query shape); only the winning workoutExerciseId's
// sets are ever read here, so a different WorkoutExercise's actual never leaks into this Exercise's evaluation.
export function reducePreviousRecommendationProgress(
  candidateRows: readonly CandidateRecommendationRow[], planRows: readonly PlanExerciseRow[], setRows: readonly RecommendationSetRow[],
): Record<string, PreviousRecommendationContext> {
  const validRows = selectValidPreviousRecommendationRows(candidateRows, planRows);
  const latestByExercise = selectLatestValidPreviousRecommendationRow(validRows);

  const result: Record<string, PreviousRecommendationContext> = {};
  for (const [exerciseId, row] of Object.entries(latestByExercise)) {
    const sets: SetDTO[] = setRows
      .filter((set) => set.workoutExerciseId === row.workoutExerciseId)
      .map((set) => ({
        id: `${set.workoutExerciseId}-${set.setNumber}`, setNumber: set.setNumber, weightKg: set.weightKg, reps: set.reps,
        rir: null, setType: set.setType, completed: set.completed,
      }));
    const evaluation = evaluateRecommendedExercise({ target: row.target, sets });
    if (!evaluation) continue; // unreachable (row.target is non-null here); kept so a future signature change fails safe.
    result[exerciseId] = {
      previousTargetWeightKg: row.target.targetWeightKg,
      progressionDecision: decideProgression(evaluation).decision,
      previousEvaluationStatus: evaluation.status,
    };
  }
  return result;
}

// Internal, owner-scoped (no requireUser() of its own — same reasoning as the other *ForUser variants in this
// file). THREE fixed queries regardless of candidate count (no N+1), and regardless of how many Recommendation
// Workouts this user has ever done for these Exercises (no "latest N" cap either — a magic limit would simply
// reintroduce Phase 5F-3B's bug one level deeper, by letting a 6th-oldest valid pair get silently dropped):
// (1) EVERY Recommendation-linked COMPLETED WorkoutExercise for these Exercises — `workoutPlanId: { not: null }`
// and `status: "COMPLETED"` exclude both a normal/Exercise-Library Workout and any IN_PROGRESS/CANCELLED one
// (so today's own in-flight Workout, which cannot be COMPLETED yet, is never picked up as its own "previous");
// scoped to `userId`, so another user's history is never visible. This is bounded by one user's own
// Recommendation-Workout history for a handful of candidate Exercises — not an unbounded or cross-user scan —
// which is the deliberate trade-off this Phase makes: correctness (never silently skip a valid older pair) over
// the premature "just the newest row" reduction Phase 5F-3B used. (2) every WorkoutPlanExercise belonging to
// those rows' WorkoutPlans. (3) every actual WorkoutSet for those exact WorkoutExercise rows, fetched in the
// same batch as (2) (both depend only on (1)'s candidateRows, not on each other) rather than only after
// validity/recency is resolved — selectLatestValidPreviousRecommendationRow then picks, in memory, which single
// WorkoutExercise's sets are actually used per Exercise.
async function getPreviousRecommendationProgressForUser(
  userId: string, exerciseIds: string[],
): Promise<Record<string, PreviousRecommendationContext>> {
  const uniqueIds = [...new Set(exerciseIds)];
  if (uniqueIds.length === 0) return {};

  const candidateRows = await prisma.workoutExercise.findMany({
    where: { exerciseId: { in: uniqueIds }, workoutSession: { userId, status: "COMPLETED", workoutPlanId: { not: null } } },
    select: { id: true, exerciseId: true, exerciseOrder: true, workoutSession: { select: { startedAt: true, workoutPlanId: true } } },
  });
  if (candidateRows.length === 0) return {};

  const workoutPlanIds = [...new Set(candidateRows.map((row) => row.workoutSession.workoutPlanId!))];
  const [planRows, setRows] = await Promise.all([
    prisma.workoutPlanExercise.findMany({
      where: { workoutPlanId: { in: workoutPlanIds } },
      select: { workoutPlanId: true, exerciseId: true, exerciseOrder: true, targetWeightKg: true, targetRepsMin: true, targetRepsMax: true, targetSets: true, restSeconds: true },
    }),
    prisma.workoutSet.findMany({
      where: { workoutExerciseId: { in: candidateRows.map((row) => row.id) } },
      select: { workoutExerciseId: true, setNumber: true, weightKg: true, reps: true, setType: true, completed: true },
    }),
  ]);

  return reducePreviousRecommendationProgress(
    candidateRows.map((row) => ({
      exerciseId: row.exerciseId, exerciseOrder: row.exerciseOrder, workoutExerciseId: row.id,
      workoutPlanId: row.workoutSession.workoutPlanId!, startedAt: row.workoutSession.startedAt,
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
