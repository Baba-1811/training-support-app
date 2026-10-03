import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 5F-3B: DB/schema/seed guards (A-E of the brief). schema.prisma and prisma/seed.ts are not imported
// directly — seed.ts builds a real PrismaClient/PrismaPg connection at module load time (see its top-level
// `new PrismaClient(...)`), which a unit test must never trigger — so these are source-text checks, the same
// convention this project already uses for concerns no other test infra covers (see
// tests/workouts/recommendation-target-integration.test.ts).
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("A/B: Exercise.weightIncrementKg schema", () => {
  const schema = read("prisma", "schema.prisma");

  it("A. is a nullable Decimal on Exercise", () => {
    expect(schema).toMatch(/model Exercise \{[\s\S]*?weightIncrementKg\s+Decimal\?\s+@db\.Decimal\(6, 2\)[\s\S]*?\n\}/);
  });

  it("is declared inside the Exercise model, not some other model", () => {
    const exerciseModel = schema.match(/model Exercise \{[\s\S]*?\n\}/)?.[0] ?? "";
    expect(exerciseModel).toContain("weightIncrementKg");
  });
});

describe("B. migration CHECK constraint", () => {
  const migration = read("prisma", "migrations", "20261003021349_exercise_weight_increment", "migration.sql");

  it("adds the column as a nullable DECIMAL(6,2)", () => {
    expect(migration).toMatch(/ALTER TABLE "Exercise" ADD COLUMN\s+"weightIncrementKg" DECIMAL\(6,2\);/);
    expect(migration).not.toMatch(/"weightIncrementKg" DECIMAL\(6,2\) NOT NULL/);
  });

  it("enforces > 0 when non-null at the DB level, matching this project's existing CHECK constraint style", () => {
    expect(migration).toMatch(/ADD CONSTRAINT "Exercise_weightIncrementKg_check"\s*\nCHECK \("weightIncrementKg" IS NULL OR "weightIncrementKg" > 0\);/);
  });
});

describe("C/D: seed metadata", () => {
  const seed = read("prisma", "seed.ts");

  // Extracts the object literal text between `name: "<exerciseName>"` and the next exercise/array boundary, so
  // each assertion reads that Exercise's own declared weightIncrementKg, not just "the value appears somewhere".
  function weightIncrementFor(exerciseName: string): string {
    const pattern = new RegExp(`name:\\s*"${exerciseName}"[\\s\\S]*?weightIncrementKg:\\s*([^,\\n]+),`);
    const match = seed.match(pattern);
    if (!match) throw new Error(`weightIncrementKg not found for "${exerciseName}" in seed.ts`);
    return match[1].trim();
  }

  it("C. both BODYWEIGHT Exercises (Calf Raise, Crunch) seed weightIncrementKg: null", () => {
    expect(weightIncrementFor("Calf Raise")).toBe("null");
    expect(weightIncrementFor("Crunch")).toBe("null");
  });

  it("D. every Exercise seeds the expected weightIncrementKg value", () => {
    expect(weightIncrementFor("Bench Press")).toBe("2.5");
    expect(weightIncrementFor("Squat")).toBe("2.5");
    expect(weightIncrementFor("Deadlift")).toBe("2.5");
    expect(weightIncrementFor("Lat Pulldown")).toBe("5");
    expect(weightIncrementFor("Shoulder Press")).toBe("null"); // DUMBBELL, left unresolved deliberately
    expect(weightIncrementFor("Dumbbell Curl")).toBe("2");
    expect(weightIncrementFor("Triceps Pushdown")).toBe("5");
    expect(weightIncrementFor("Leg Press")).toBe("5");
  });

  it("every seeded Exercise declares weightIncrementKg (none silently omitted)", () => {
    const names = ["Bench Press", "Squat", "Deadlift", "Lat Pulldown", "Shoulder Press", "Dumbbell Curl", "Triceps Pushdown", "Calf Raise", "Leg Press", "Crunch"];
    for (const name of names) expect(() => weightIncrementFor(name), name).not.toThrow();
  });
});

describe("E. existing Exercise metadata is unmodified", () => {
  const seed = read("prisma", "seed.ts");

  it("still seeds exactly the same 10 Exercises, with their equipmentType unchanged", () => {
    const expectedEquipment: Record<string, string> = {
      "Bench Press": "BARBELL", Squat: "BARBELL", Deadlift: "BARBELL", "Lat Pulldown": "MACHINE",
      "Shoulder Press": "DUMBBELL", "Dumbbell Curl": "DUMBBELL", "Triceps Pushdown": "CABLE",
      "Calf Raise": "BODYWEIGHT", "Leg Press": "MACHINE", Crunch: "BODYWEIGHT",
    };
    for (const [name, equipmentType] of Object.entries(expectedEquipment)) {
      const pattern = new RegExp(`name:\\s*"${name}"[\\s\\S]*?equipmentType:\\s*EquipmentType\\.${equipmentType}`);
      expect(seed, name).toMatch(pattern);
    }
  });

  it("the ExerciseMuscle relations array is untouched (still 21 (Exercise, Muscle, role) rows)", () => {
    const relationsBlock = seed.match(/const relations = \[([\s\S]*?)\] as const;/)?.[1] ?? "";
    const rows = relationsBlock.match(/\[\s*"/g) ?? [];
    expect(rows.length).toBe(21);
  });
});
