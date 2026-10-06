import "server-only";
import { prisma } from "@/lib/prisma";
import type { z } from "zod";
import type { createNutritionEntrySchema, deleteNutritionEntrySchema, updateNutritionEntrySchema } from "./validation";

export class NutritionError extends Error {
  constructor(public code: "NOT_FOUND") { super(code); }
}

// No requireUser() here: these take the userId the Server Action already got from its single requireUser() call
// (never from client input). Update/delete are constrained by id AND userId in the same statement, so another
// user's entry is simply "not found" — there is no read-then-check window.

// Decimal(5,1) columns take a fixed 1-decimal string; null stays null (not 0).
const grams = (value: number | null) => (value === null ? null : value.toFixed(1));

export async function createNutritionEntryForUser(userId: string, input: z.output<typeof createNutritionEntrySchema>): Promise<string> {
  const row = await prisma.nutritionEntry.create({
    data: {
      userId, entryDate: input.entryDate, mealType: input.mealType, name: input.name, calories: input.calories,
      proteinGrams: grams(input.proteinGrams), fatGrams: grams(input.fatGrams), carbsGrams: grams(input.carbsGrams),
    },
    select: { id: true },
  });
  return row.id;
}

export async function updateNutritionEntryForUser(userId: string, input: z.output<typeof updateNutritionEntrySchema>): Promise<string> {
  const result = await prisma.nutritionEntry.updateMany({
    where: { id: input.id, userId },
    data: {
      mealType: input.mealType, name: input.name, calories: input.calories,
      proteinGrams: grams(input.proteinGrams), fatGrams: grams(input.fatGrams), carbsGrams: grams(input.carbsGrams),
    },
  });
  if (result.count === 0) throw new NutritionError("NOT_FOUND");
  return input.id;
}

export async function deleteNutritionEntryForUser(userId: string, input: z.output<typeof deleteNutritionEntrySchema>): Promise<string> {
  const result = await prisma.nutritionEntry.deleteMany({ where: { id: input.id, userId } });
  if (result.count === 0) throw new NutritionError("NOT_FOUND");
  return input.id;
}
