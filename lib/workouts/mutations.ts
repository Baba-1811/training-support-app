import "server-only";
import { prisma } from "@/lib/prisma";
import { requireUser } from "@/lib/auth/require-user";
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
