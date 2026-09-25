import { describe, expect, it } from "vitest";
import {
  EXERCISE_CATEGORIES, exerciseCategories, filterByCategory, muscleCategory, parseCategoryFilter,
} from "@/lib/exercises/categories";
import { primaryMusclesOf, seededExercises, seededMuscles } from "./seed-data";

describe("category list", () => {
  it("is すべて / 胸 / 背中 / 肩 / 腕 / 脚 / 腹筋 with the agreed slugs", () => {
    expect(EXERCISE_CATEGORIES.map((category) => [category.slug, category.label])).toEqual([
      ["all", "すべて"], ["chest", "胸"], ["back", "背中"], ["shoulders", "肩"], ["arms", "腕"], ["legs", "脚"], ["abs", "腹筋"],
    ]);
  });
});

describe("Muscle -> category", () => {
  it.each([
    ["Chest", "chest"], ["Lats", "back"],
    ["Front Deltoid", "shoulders"], ["Side Deltoid", "shoulders"], ["Rear Deltoid", "shoulders"],
    ["Biceps", "arms"], ["Triceps", "arms"],
    ["Quadriceps", "legs"], ["Hamstrings", "legs"], ["Glutes", "legs"], ["Calves", "legs"],
    ["Abs", "abs"],
  ] as const)("%s -> %s", (muscle, slug) => expect(muscleCategory(muscle)).toBe(slug));

  it("maps every seeded muscle, so none is lost from the library", () => {
    expect(seededMuscles.length).toBeGreaterThan(0);
    for (const muscle of seededMuscles) expect(muscleCategory(muscle), muscle).not.toBeNull();
  });

  it("gives an unknown muscle no category instead of throwing", () => {
    expect(muscleCategory("Traps")).toBeNull();
    expect(exerciseCategories(["Traps"])).toEqual([]);
  });
});

describe("exercise category is decided by PRIMARY muscles only", () => {
  it("uses just the primary muscle names it is given (Bench Press: Chest primary -> 胸 only)", () => {
    // Secondary Triceps / Front Deltoid are not passed in, so they can never add 腕 / 肩.
    expect(exerciseCategories(["Chest"])).toEqual(["chest"]);
  });

  it("puts a multi-category primary exercise in each of them, once", () => {
    expect(exerciseCategories(["Quadriceps", "Glutes"])).toEqual(["legs"]);
    expect(exerciseCategories(["Chest", "Triceps", "Biceps"]).sort()).toEqual(["arms", "chest"]);
  });

  it("shows the seeded exercises only in their PRIMARY category", () => {
    const list = seededExercises.map((name) => ({ name, primaryMuscles: primaryMusclesOf(name) }));
    const names = (slug: Parameters<typeof filterByCategory>[1]) => filterByCategory(list, slug).map((item) => item.name);
    expect(names("chest")).toEqual(["Bench Press"]); // not under 腕 / 肩 despite Triceps / Front Deltoid secondaries
    expect(names("arms").sort()).toEqual(["Dumbbell Curl", "Triceps Pushdown"]);
    expect(names("shoulders")).toEqual(["Shoulder Press"]);
    expect(names("back")).toEqual(["Lat Pulldown"]); // Deadlift's Lats is only SECONDARY
    expect(names("abs")).toEqual(["Crunch"]);
    expect(names("legs").sort()).toEqual(["Calf Raise", "Deadlift", "Leg Press", "Squat"]);
  });

  it("gives every category at least one seeded exercise", () => {
    const list = seededExercises.map((name) => ({ name, primaryMuscles: primaryMusclesOf(name) }));
    for (const category of EXERCISE_CATEGORIES) expect(filterByCategory(list, category.slug).length, category.slug).toBeGreaterThan(0);
  });
});

describe("filterByCategory", () => {
  const list = [{ id: "a", primaryMuscles: ["Chest"] }, { id: "b", primaryMuscles: ["Abs"] }, { id: "c", primaryMuscles: [] }];
  it("all returns every exercise (including ones without a primary muscle) as a copy", () => {
    const result = filterByCategory(list, "all");
    expect(result).toEqual(list);
    expect(result).not.toBe(list);
  });
  it("a category returns only its own", () => expect(filterByCategory(list, "abs")).toEqual([list[1]]));
});

describe("parseCategoryFilter (?muscle=)", () => {
  it.each(["chest", "back", "shoulders", "arms", "legs", "abs"] as const)("accepts %s", (slug) => expect(parseCategoryFilter(slug)).toBe(slug));
  it("treats a missing value as all", () => expect(parseCategoryFilter(undefined)).toBe("all"));
  it.each(["", "CHEST", "all ", "unknown", "__proto__", "constructor", "../../etc"])("falls back to all for %j", (value) =>
    expect(parseCategoryFilter(value)).toBe("all"));
  it("falls back to all for a repeated parameter", () => expect(parseCategoryFilter(["chest", "legs"])).toBe("all"));
});
