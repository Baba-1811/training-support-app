import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
import { getTodayRecommendationForUser } from "@/lib/recommendations/queries";
import { getTodayConditionForUser } from "@/lib/conditions/queries";
import { jstDateOnly } from "@/lib/date/jst";
import type { z } from "zod";
import type * as schemas from "./validation";

export class WorkoutError extends Error {
  constructor(public code: "NOT_FOUND" | "INVALID_STATE" | "CONFLICT") { super(code); }
}
type Command =
  | { kind: "title"; input: z.output<typeof schemas.updateWorkoutTitleSchema> }
  | { kind: "addExercise"; input: z.output<typeof schemas.addExerciseSchema> }
  | { kind: "deleteExercise"; input: z.output<typeof schemas.deleteWorkoutExerciseSchema> }
  | { kind: "createSet"; input: z.output<typeof schemas.createSetSchema> }
  | { kind: "updateSet"; input: z.output<typeof schemas.updateSetSchema> }
  | { kind: "deleteSet"; input: z.output<typeof schemas.deleteSetSchema> }
  | { kind: "finish"; input: z.output<typeof schemas.finishWorkoutSchema> };

export async function createWorkout(input: z.output<typeof schemas.startWorkoutSchema>) {
  const user = await requireUser();
  return prisma.workoutSession.create({
    data: { userId: user.id, title: input.title, startedAt: new Date(), status: "IN_PROGRESS" },
    select: { id: true },
  });
}

// Exercise Library "この種目でトレーニング" when nothing is in progress: the session and its first exercise are created
// in one transaction (one nested create), so a failure can never leave an empty session behind. The owner comes
// from requireUser(), never from the caller; only an active exercise is accepted.
export async function createWorkoutWithExercise(input: z.output<typeof schemas.startWorkoutWithExerciseSchema>) {
  const user = await requireUser();
  return prisma.$transaction(async (tx) => {
    const exercise = await tx.exercise.findFirst({ where: { id: input.exerciseId, isActive: true }, select: { id: true } });
    if (!exercise) throw new WorkoutError("NOT_FOUND");
    return tx.workoutSession.create({
      data: {
        userId: user.id, startedAt: new Date(), status: "IN_PROGRESS",
        exercises: { create: { exerciseId: exercise.id, exerciseOrder: 1 } },
      },
      select: { id: true },
    });
  });
}

// Recommendation -> WorkoutPlan snapshot -> WorkoutSession (Phase 5D). The client sends no Recommendation
// payload at all (see startFromRecommendationSchema): this re-authenticates and re-runs the Recommendation
// itself, so what gets persisted is always the latest server-side recomputation, never whatever Home happened to
// render earlier. Only a WORKOUT result is ever persisted — null (no Condition) and REST both refuse via
// INVALID_STATE, matching Home's own CTA rule (no Start CTA for either state).
//
// Auth call amplification fix: requireUser() is called exactly once here, and that same user.id is passed into
// both *ForUser reads below — previously, getTodayRecommendation() and getTodayCondition() each re-authenticated
// on their own, for a total of three requireUser() calls in this one Action.
export async function createWorkoutFromRecommendation() {
  const user = await requireUser();
  const recommendation = await getTodayRecommendationForUser(user.id);
  if (!recommendation || recommendation.kind !== "WORKOUT" || recommendation.exercises.length === 0) {
    throw new WorkoutError("INVALID_STATE");
  }
  // Separate from the Engine's own Condition read (getTodayConditionForRecommendationForUser, which has no DB id
  // by design): only here, for the Plan's sourceConditionId, do we need the actual DailyCondition row. A WORKOUT
  // result already implies today's Condition exists, so a null here would mean the two reads disagreed about
  // "today" — defended against rather than assumed away.
  const condition = await getTodayConditionForUser(user.id);
  if (!condition) throw new WorkoutError("INVALID_STATE");

  const exercises = recommendation.exercises;
  // Two top-level creates, each with its own nested array create (same "no per-row follow-up query" pattern as
  // createWorkoutWithExercise above), both inside one transaction: a WorkoutSession is never left pointing at a
  // Plan that failed to finish, and a Plan never exists without the Session it was started for.
  return prisma.$transaction(async (tx) => {
    const plan = await tx.workoutPlan.create({
      data: {
        userId: user.id, sourceConditionId: condition.id, plannedDate: jstDateOnly(), status: "ACCEPTED",
        recommendationReason: recommendation.recommendationReason,
        exercises: { create: exercises.map((exercise, index) => ({
          exerciseId: exercise.exerciseId, exerciseOrder: index + 1,
          targetWeightKg: exercise.targetWeightKg, targetRepsMin: exercise.targetRepsMin,
          targetRepsMax: exercise.targetRepsMax, targetSets: exercise.targetSets, restSeconds: exercise.restSeconds,
        })) },
      },
      select: { id: true },
    });
    // No WorkoutSet here, ever: the existing Workout UI only creates a set once the user actually enters and
    // confirms it (mutateWorkout's "createSet" case). Recommendation targets live in WorkoutPlanExercise only.
    return tx.workoutSession.create({
      data: {
        userId: user.id, workoutPlanId: plan.id, startedAt: new Date(), status: "IN_PROGRESS",
        exercises: { create: exercises.map((exercise, index) => ({ exerciseId: exercise.exerciseId, exerciseOrder: index + 1 })) },
      },
      select: { id: true },
    });
  });
}

export async function mutateWorkout(command: Command): Promise<string> {
  const user = await requireUser();
  return prisma.$transaction(async (tx) => {
    const input = command.input;
    let sessionId: string;
    if ("sessionId" in input) sessionId = input.sessionId;
    else if ("workoutExerciseId" in input) {
      const entry = await tx.workoutExercise.findFirst({
        where: { id: input.workoutExerciseId, workoutSession: { userId: user.id } },
        select: { workoutSessionId: true },
      });
      if (!entry) throw new WorkoutError("NOT_FOUND");
      sessionId = entry.workoutSessionId;
    } else {
      const set = await tx.workoutSet.findFirst({
        where: { id: input.setId, workoutExercise: { workoutSession: { userId: user.id } } },
        select: { workoutExercise: { select: { workoutSessionId: true } } },
      });
      if (!set) throw new WorkoutError("NOT_FOUND");
      sessionId = set.workoutExercise.workoutSessionId;
    }
    // Every writer locks the owned parent, including finish, before changing child rows.
    const sessions = await tx.$queryRaw<Array<{ status: string; completedAt: Date | null }>>`
      SELECT "status", "completedAt" FROM "WorkoutSession"
      WHERE "id" = ${sessionId}::uuid AND "userId" = ${user.id}::uuid FOR UPDATE`;
    const session = sessions[0];
    if (!session) throw new WorkoutError("NOT_FOUND");
    if (session.status === "CANCELLED") throw new WorkoutError("INVALID_STATE");
    if ((command.kind === "addExercise" || command.kind === "createSet") && session.status !== "IN_PROGRESS") {
      throw new WorkoutError("INVALID_STATE");
    }
    const now = new Date();
    let changed = true;
    switch (command.kind) {
      case "title":
        await tx.workoutSession.updateMany({ where: { id: sessionId, userId: user.id }, data: { title: command.input.title } });
        break;
      case "addExercise": {
        const exercise = await tx.exercise.findFirst({ where: { id: command.input.exerciseId, isActive: true }, select: { id: true } });
        if (!exercise) throw new WorkoutError("NOT_FOUND");
        const last = await tx.workoutExercise.aggregate({ where: { workoutSessionId: sessionId }, _max: { exerciseOrder: true } });
        await tx.workoutExercise.create({ data: {
          workoutSessionId: sessionId, exerciseId: exercise.id, exerciseOrder: (last._max.exerciseOrder ?? 0) + 1,
        } });
        break;
      }
      case "deleteExercise": {
        const deleted = await tx.workoutExercise.deleteMany({ where: {
          id: command.input.workoutExerciseId, workoutSessionId: sessionId, workoutSession: { userId: user.id },
        } });
        if (!deleted.count) throw new WorkoutError("NOT_FOUND");
        break;
      }
      case "createSet": {
        const values = command.input;
        const parent = await tx.workoutExercise.findFirst({ where: {
          id: values.workoutExerciseId, workoutSessionId: sessionId, workoutSession: { userId: user.id },
        }, select: { id: true } });
        if (!parent) throw new WorkoutError("NOT_FOUND");
        const existing = await tx.workoutSet.findUnique({ where: {
          workoutExerciseId_setNumber: { workoutExerciseId: parent.id, setNumber: values.setNumber },
        } });
        if (existing) {
          if (!existing.completed || Number(existing.weightKg) !== Number(values.weightKg) || existing.reps !== values.reps ||
            existing.setType !== values.setType || (existing.rir === null ? null : Number(existing.rir)) !== (values.rir === null ? null : Number(values.rir))) {
            throw new WorkoutError("CONFLICT");
          }
          changed = false;
        } else await tx.workoutSet.create({ data: { ...values, completed: true, completedAt: now } });
        break;
      }
      case "updateSet": {
        const { setId, ...values } = command.input;
        const updated = await tx.workoutSet.updateMany({ where: {
          id: setId, completed: true,
          workoutExercise: { workoutSessionId: sessionId, workoutSession: { userId: user.id } },
        }, data: values });
        if (!updated.count) throw new WorkoutError("NOT_FOUND");
        break;
      }
      case "deleteSet": {
        const deleted = await tx.workoutSet.deleteMany({ where: {
          id: command.input.setId,
          workoutExercise: { workoutSessionId: sessionId, workoutSession: { userId: user.id } },
        } });
        if (!deleted.count) throw new WorkoutError("NOT_FOUND");
        break;
      }
      case "finish":
        if (session.status === "COMPLETED") changed = false;
        else await tx.workoutSession.updateMany({
          where: { id: sessionId, userId: user.id, status: "IN_PROGRESS" },
          data: { status: "COMPLETED", completedAt: session.completedAt ?? now },
        });
        break;
    }
    if (changed) await tx.workoutSession.updateMany({ where: { id: sessionId, userId: user.id }, data: { updatedAt: now } });
    return sessionId;
  });
}
