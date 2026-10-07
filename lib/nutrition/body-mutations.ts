import "server-only";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";
import { jstMeasurementInstant } from "@/lib/date/jst";
import type { createBodyMeasurementSchema } from "./body-validation";

// BodyMeasurement is INSERT-only raw history, like NutritionTarget: re-entering a weight for the same day adds a
// row (never update/upsert/delete). measuredAt is a timestamptz, so the viewed JST date becomes 12:00 JST of that day
// (not UTC midnight); same-day rows share it and the read query orders by measuredAt, createdAt, id DESC to pick the
// latest. userId is the one the Server Action got from requireUser(), never client input.
export async function createBodyMeasurementForUser(userId: string, input: z.output<typeof createBodyMeasurementSchema>): Promise<string> {
  const row = await prisma.bodyMeasurement.create({
    data: {
      userId, measuredAt: jstMeasurementInstant(input.date), weightKg: input.weightKg.toFixed(2),
      bodyFatPercent: input.bodyFatPercent === null ? null : input.bodyFatPercent.toFixed(2),
    },
    select: { id: true },
  });
  return row.id;
}
