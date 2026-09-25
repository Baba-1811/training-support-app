import { readFileSync } from "node:fs";
import { join } from "node:path";

// prisma/seed.ts runs main() on import, so the tests read its source to stay in sync with the seeded catalog.
const source = readFileSync(join(process.cwd(), "prisma", "seed.ts"), "utf8");

export const seededMuscles = [...source.matchAll(/^ {4}\{ name: "([^"]+)", bodyRegion: "([^"]+)" \},$/gm)].map((match) => match[1]);
export const seededExercises = [...source.matchAll(/^ {6}name: "([^"]+)",$/gm)].map((match) => match[1]);
export const seededRelations = [...source.matchAll(/\["([^"]+)", "([^"]+)", MuscleRole\.(PRIMARY|SECONDARY)\]/g)]
  .map((match) => ({ exercise: match[1], muscle: match[2], role: match[3] as "PRIMARY" | "SECONDARY" }));

export const primaryMusclesOf = (exercise: string) =>
  seededRelations.filter((relation) => relation.exercise === exercise && relation.role === "PRIMARY").map((relation) => relation.muscle);
