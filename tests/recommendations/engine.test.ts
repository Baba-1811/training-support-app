import { describe, expect, it } from "vitest";
import { recommendWorkout, evaluateCategories } from "@/lib/recommendations/engine";
import type { WorkoutRecommendation } from "@/lib/recommendations/types";
import { makeContext, makeExercise, makePreviousPerformance, standardCatalog } from "./fixtures";
import { seededExercises } from "../exercises/seed-data";

const asWorkout = (result: ReturnType<typeof recommendWorkout>): WorkoutRecommendation => {
  if (result.kind !== "WORKOUT") throw new Error(`expected WORKOUT, got ${result.kind}`);
  return result;
};

describe("A. Determinism", () => {
  it("the same context always produces the same result", () => {
    const context = makeContext({ exercises: standardCatalog() });
    expect(recommendWorkout(context)).toEqual(recommendWorkout(context));
  });
});

describe("B. Cold start", () => {
  it("history 0 -> WORKOUT, deterministic category selection, null weight, 8-12 reps", () => {
    const context = makeContext({ exercises: standardCatalog() }); // no lastTrainedAtByMuscle, no previousPerformance
    const result = asWorkout(recommendWorkout(context));
    // All 6 categories tie at score 3 (no soreness, never trained); fixed category order + 60min budget (4)
    // picks the first 4: chest, back, shoulders, arms. Within arms, Dumbbell Curl beats Triceps Pushdown on the
    // final name tie-break (both have no secondary muscles and neither was ever performed).
    expect(result.selectedCategories).toEqual(["chest", "back", "shoulders", "arms"]);
    expect(result.exercises.map((e) => e.exerciseId)).toEqual(["Bench Press", "Lat Pulldown", "Shoulder Press", "Dumbbell Curl"]);
    for (const exercise of result.exercises) {
      expect(exercise.targetWeightKg).toBeNull();
      expect(exercise.targetRepsMin).toBe(8);
      expect(exercise.targetRepsMax).toBe(12);
      expect(exercise.targetSets).toBe(3);
    }
    expect(result.recommendationReason).toContain("まだトレーニング記録がない");
  });
});

describe("C. availableMinutes budget", () => {
  it.each([[30, 2], [45, 3], [60, 4], [90, 5]] as const)("%d minutes -> max %d exercises", (minutes, max) => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, availableMinutes: minutes } });
    const result = asWorkout(recommendWorkout(context));
    expect(result.exercises.length).toBe(max);
  });
});

describe("D. availableMinutes = null", () => {
  it("falls back to the 45-minute budget (3 exercises)", () => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, availableMinutes: null } });
    expect(asWorkout(recommendWorkout(context)).exercises.length).toBe(3);
  });
});

describe("E. sleep < 6h", () => {
  it("triggers reducedLoad", () => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, sleepHours: "5.5" } });
    const result = asWorkout(recommendWorkout(context));
    expect(result.reducedLoad).toBe(true);
    expect(result.exercises.every((e) => e.targetSets === 2)).toBe(true);
    expect(result.exercises.length).toBe(3); // 60min budget (4) - 1 for reducedLoad
  });
});

describe("F. fatigue >= 4", () => {
  it("triggers reducedLoad", () => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, fatigueLevel: 4 } });
    const result = asWorkout(recommendWorkout(context));
    expect(result.reducedLoad).toBe(true);
    expect(result.exercises.every((e) => e.targetSets === 2)).toBe(true);
  });
});

describe("G. sleep AND fatigue both bad", () => {
  it("does not reduce twice: budget drops by exactly 1, sets floor at 2", () => {
    const context = makeContext({
      exercises: standardCatalog(), condition: { ...makeContext().condition, sleepHours: "4", fatigueLevel: 5 },
    });
    const result = asWorkout(recommendWorkout(context));
    expect(result.reducedLoad).toBe(true);
    expect(result.exercises.length).toBe(3); // 4 - 1, not 4 - 2
    expect(result.exercises.every((e) => e.targetSets === 2)).toBe(true);
  });
});

describe("H/I/J. PRIMARY soreness levels 1-3 penalize but never exclude", () => {
  it("level 1 leaves the category as a normal candidate (no penalty)", () => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, sorenessByMuscle: { Chest: 1 } } });
    const evaluation = evaluateCategories(context).find((c) => c.category === "chest")!;
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.score).toBe(evaluateCategories(makeContext({ exercises: standardCatalog() })).find((c) => c.category === "chest")!.score);
    expect(asWorkout(recommendWorkout(context)).selectedCategories).toContain("chest");
  });

  it("level 2 applies a light penalty", () => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, sorenessByMuscle: { Chest: 2 } } });
    const evaluation = evaluateCategories(context).find((c) => c.category === "chest")!;
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.score).toBeLessThan(3); // 3 is the no-soreness/never-trained baseline score
  });

  it("level 3 applies a stronger penalty, enough to drop chest out of a 4-exercise budget", () => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, sorenessByMuscle: { Chest: 3 } } });
    const evaluation = evaluateCategories(context).find((c) => c.category === "chest")!;
    expect(evaluation.eligible).toBe(true);
    const level2Score = evaluateCategories(makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, sorenessByMuscle: { Chest: 2 } } }))
      .find((c) => c.category === "chest")!.score;
    expect(evaluation.score).toBeLessThan(level2Score);
    // With 5 other undamaged categories tied above it and a 4-exercise budget, chest (deprioritized) misses the cut.
    expect(asWorkout(recommendWorkout(context)).selectedCategories).not.toContain("chest");
  });
});

describe("K/L. PRIMARY soreness 4/5 excludes the category", () => {
  it.each([4, 5])("level %d excludes chest entirely, even though it is the only chest Exercise", (level) => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, sorenessByMuscle: { Chest: level } } });
    const evaluation = evaluateCategories(context).find((c) => c.category === "chest")!;
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.candidateExerciseIds).toEqual([]);
    const result = asWorkout(recommendWorkout(context));
    expect(result.selectedCategories).not.toContain("chest");
    expect(result.exercises.find((e) => e.exerciseId === "Bench Press")).toBeUndefined();
  });

  it("mentions the excluded category by name in the reason once cold start no longer masks it", () => {
    const context = makeContext({
      exercises: standardCatalog(),
      condition: { ...makeContext().condition, sorenessByMuscle: { Chest: 4 } },
      lastTrainedAtByMuscle: { Lats: "2026-09-21" }, // any recorded history disables the cold-start template
    });
    const reason = asWorkout(recommendWorkout(context)).recommendationReason;
    expect(reason).toContain("胸");
    expect(reason).toContain("強い筋肉痛");
  });
});

describe("M/N. SECONDARY soreness penalizes the Exercise, never hard-excludes the category", () => {
  it.each([4, 5])("SECONDARY level %d: chest stays eligible, Bench Press is noted but still recommendable", (level) => {
    const context = makeContext({ exercises: standardCatalog(), condition: { ...makeContext().condition, sorenessByMuscle: { Triceps: level } } });
    const evaluation = evaluateCategories(context).find((c) => c.category === "chest")!;
    expect(evaluation.eligible).toBe(true);
    expect(evaluation.candidateExerciseIds).toContain("Bench Press");
    const result = asWorkout(recommendWorkout(context));
    const benchPress = result.exercises.find((e) => e.exerciseId === "Bench Press");
    expect(benchPress).toBeDefined();
    expect(benchPress!.secondarySorenessNoted).toBe(true);
    expect(result.recommendationReason).toContain("無理のない範囲で");
  });
});

describe("O. All categories unavailable -> REST", () => {
  it("returns REST without inventing a workout when every category's PRIMARY muscles are badly sore", () => {
    const context = makeContext({
      exercises: standardCatalog(),
      condition: {
        ...makeContext().condition,
        sorenessByMuscle: {
          Chest: 5, Lats: 5, "Front Deltoid": 5, Biceps: 5, Triceps: 5,
          Quadriceps: 5, Glutes: 5, Hamstrings: 5, Calves: 5, Abs: 5,
        },
      },
    });
    const result = recommendWorkout(context);
    expect(result.kind).toBe("REST");
    expect(result.recommendationReason).toContain("休養");
  });
});

describe("P/Q/R. targetWeightKg", () => {
  it("P. is null with no previous performance for the selected exercise", () => {
    const context = makeContext({ exercises: standardCatalog(), lastTrainedAtByMuscle: { Chest: "2026-09-20" } });
    const benchPress = asWorkout(recommendWorkout(context)).exercises.find((e) => e.exerciseId === "Bench Press");
    expect(benchPress?.targetWeightKg).toBeNull();
  });

  it("Q. is the heaviest completed WORKING set weight from last time, with a conservative reps range", () => {
    const context = makeContext({
      exercises: standardCatalog(),
      previousPerformanceByExerciseId: {
        "Bench Press": makePreviousPerformance("2026-09-20T00:00:00Z", [
          { weightKg: "60", reps: 8 }, { weightKg: "60", reps: 8 }, { weightKg: "55", reps: 10 },
        ]),
      },
    });
    const benchPress = asWorkout(recommendWorkout(context)).exercises.find((e) => e.exerciseId === "Bench Press")!;
    expect(benchPress.targetWeightKg).toBe(60);
    expect(benchPress.targetRepsMin).toBe(8);
    expect(benchPress.targetRepsMax).toBe(10);
  });

  it("R. is always null for a BODYWEIGHT exercise, even with recorded history", () => {
    const context = makeContext({
      exercises: [makeExercise({ name: "Calf Raise", equipmentType: "BODYWEIGHT", primaryMuscles: ["Calves"] })],
      previousPerformanceByExerciseId: {
        "Calf Raise": makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "0", reps: 15 }]),
      },
    });
    const result = asWorkout(recommendWorkout(context));
    expect(result.exercises).toHaveLength(1);
    expect(result.exercises[0].targetWeightKg).toBeNull();
  });
});

// Phase 5F-3B: Progression wired into the Engine via RecommendationContext.previousRecommendationByExerciseId.
// `previousPerformanceByExerciseId` below is deliberately given a DIFFERENT (higher) actual max than the
// previous planned target in every case, to prove the engine progresses from the PLANNED number, never from
// the incidental actual (sections 20/21/M/V/W of the Phase 5F-3B brief).
describe("S-W. Weight progression integration", () => {
  const benchPress = () => makeExercise({ name: "Bench Press", equipmentType: "BARBELL", primaryMuscles: ["Chest"], weightIncrementKg: 2.5 });
  const actualHigherThanPlanned = makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "65", reps: 10 }]);

  it("N/W. EXCEEDED -> INCREASE -> previous planned target (60) + increment (2.5) = 62.5, not actual (65) + increment", () => {
    const context = makeContext({
      exercises: [benchPress()],
      previousPerformanceByExerciseId: { "Bench Press": actualHigherThanPlanned },
      previousRecommendationByExerciseId: { "Bench Press": { previousTargetWeightKg: 60, progressionDecision: "INCREASE" } },
    });
    const result = asWorkout(recommendWorkout(context));
    expect(result.exercises[0].targetWeightKg).toBe(62.5);
    expect(result.exercises[0].targetWeightKg).not.toBe(67.5);
  });

  it("O/V. ACHIEVED -> MAINTAIN -> holds the previous planned target (60), ignoring the higher actual (65)", () => {
    const context = makeContext({
      exercises: [benchPress()],
      previousPerformanceByExerciseId: { "Bench Press": actualHigherThanPlanned },
      previousRecommendationByExerciseId: { "Bench Press": { previousTargetWeightKg: 60, progressionDecision: "MAINTAIN" } },
    });
    expect(asWorkout(recommendWorkout(context)).exercises[0].targetWeightKg).toBe(60);
  });

  it("P. PARTIAL (-> MAINTAIN) -> holds the previous planned target (60), never auto-decreases to 55", () => {
    const context = makeContext({
      exercises: [benchPress()],
      previousRecommendationByExerciseId: { "Bench Press": { previousTargetWeightKg: 60, progressionDecision: "MAINTAIN" } },
    });
    expect(asWorkout(recommendWorkout(context)).exercises[0].targetWeightKg).toBe(60);
  });

  it("Q. NOT_PERFORMED (-> INSUFFICIENT_DATA) -> holds the previous planned target (60)", () => {
    const context = makeContext({
      exercises: [benchPress()],
      previousRecommendationByExerciseId: { "Bench Press": { previousTargetWeightKg: 60, progressionDecision: "INSUFFICIENT_DATA" } },
    });
    expect(asWorkout(recommendWorkout(context)).exercises[0].targetWeightKg).toBe(60);
  });

  it("R2. increment=null + EXCEEDED -> holds the previous planned target (60), never guesses an increment", () => {
    const context = makeContext({
      exercises: [makeExercise({ name: "Bench Press", equipmentType: "BARBELL", primaryMuscles: ["Chest"], weightIncrementKg: null })],
      previousRecommendationByExerciseId: { "Bench Press": { previousTargetWeightKg: 60, progressionDecision: "INCREASE" } },
    });
    expect(asWorkout(recommendWorkout(context)).exercises[0].targetWeightKg).toBe(60);
  });

  it("S. BODYWEIGHT + EXCEEDED -> targetWeightKg stays null (no weighted-bodyweight progression)", () => {
    const context = makeContext({
      exercises: [makeExercise({ name: "Calf Raise", equipmentType: "BODYWEIGHT", primaryMuscles: ["Calves"], weightIncrementKg: null })],
      previousRecommendationByExerciseId: { "Calf Raise": { previousTargetWeightKg: null, progressionDecision: "INCREASE" } },
    });
    expect(asWorkout(recommendWorkout(context)).exercises[0].targetWeightKg).toBeNull();
  });

  it("T. no previous Recommendation, but a latest performance exists -> existing fallback (50) unchanged", () => {
    const context = makeContext({
      exercises: [benchPress()],
      previousPerformanceByExerciseId: { "Bench Press": makePreviousPerformance("2026-09-20T00:00:00Z", [{ weightKg: "50", reps: 10 }]) },
    });
    expect(asWorkout(recommendWorkout(context)).exercises[0].targetWeightKg).toBe(50);
  });

  it("U. no previous Recommendation and no performance -> null (no invented starting weight)", () => {
    const context = makeContext({ exercises: [benchPress()] });
    expect(asWorkout(recommendWorkout(context)).exercises[0].targetWeightKg).toBeNull();
  });

  it("AD. EXCEEDED progression still composes with a normal (non-reduced) Condition's targetSets", () => {
    const context = makeContext({
      exercises: [benchPress()],
      previousRecommendationByExerciseId: { "Bench Press": { previousTargetWeightKg: 60, progressionDecision: "INCREASE" } },
    });
    const exercise = asWorkout(recommendWorkout(context)).exercises[0];
    expect(exercise.targetWeightKg).toBe(62.5);
    expect(exercise.targetSets).toBe(3); // NORMAL_TARGET_SETS, Condition-driven, untouched by Progression
  });

  it("AE. EXCEEDED progression still composes with a reduced-load Condition's targetSets (sleep < 6h)", () => {
    const context = makeContext({
      exercises: [benchPress()],
      condition: { ...makeContext().condition, sleepHours: "5" },
      previousRecommendationByExerciseId: { "Bench Press": { previousTargetWeightKg: 60, progressionDecision: "INCREASE" } },
    });
    const exercise = asWorkout(recommendWorkout(context)).exercises[0];
    expect(exercise.targetWeightKg).toBe(62.5); // weight progression unaffected by today's Condition
    expect(exercise.targetSets).toBe(2); // REDUCED_TARGET_SETS — existing Condition rule still applies
  });
});

describe("V/W/X. Recency priority and tie-break", () => {
  const twoCategoryCatalog = [
    makeExercise({ name: "Bench Press", primaryMuscles: ["Chest"] }),
    makeExercise({ name: "Lat Pulldown", primaryMuscles: ["Lats"] }),
  ];
  // 30min + reducedLoad (sleep 5h) => max 1 exercise, so the winner is unambiguous.
  const singleSlotCondition = { conditionDate: "2026-09-28", sleepHours: "5", fatigueLevel: 3, availableMinutes: 30 as const, sorenessByMuscle: {} };

  it("V. a category idle for 7 days beats one trained yesterday", () => {
    const context = makeContext({
      exercises: twoCategoryCatalog, condition: singleSlotCondition,
      lastTrainedAtByMuscle: { Chest: "2026-09-27", Lats: "2026-09-21" }, // 1 day vs. 7 days before today (09-28)
    });
    expect(asWorkout(recommendWorkout(context)).selectedCategories).toEqual(["back"]);
  });

  it("W. never trained outranks a category trained 3 days ago", () => {
    const context = makeContext({
      exercises: twoCategoryCatalog, condition: singleSlotCondition,
      lastTrainedAtByMuscle: { Lats: "2026-09-25" }, // Chest absent = never trained; Lats = 3 days ago
    });
    expect(asWorkout(recommendWorkout(context)).selectedCategories).toEqual(["chest"]);
  });

  it("X. an exact tie resolves by fixed category display order (chest before back)", () => {
    const context = makeContext({ exercises: twoCategoryCatalog, condition: singleSlotCondition }); // both never trained
    expect(asWorkout(recommendWorkout(context)).selectedCategories).toEqual(["chest"]);
  });
});

describe("Y/Z. active filtering, independent of the query layer", () => {
  it("Y. an inactive Exercise is never recommended, even as a category's only candidate", () => {
    const context = makeContext({ exercises: [makeExercise({ name: "Bench Press", primaryMuscles: ["Chest"], isActive: false })] });
    const evaluation = evaluateCategories(context).find((c) => c.category === "chest")!;
    expect(evaluation.eligible).toBe(false);
    expect(evaluation.candidateExerciseIds).toEqual([]);
    expect(recommendWorkout(context).kind).toBe("REST");
  });

  it("Z. an Exercise whose only PRIMARY muscle is inactive is never recommended", () => {
    const context = makeContext({
      exercises: [makeExercise({ name: "Bench Press", primaryMuscles: ["Chest"], inactiveMuscles: ["Chest"] })],
    });
    const evaluation = evaluateCategories(context).find((c) => c.category === "chest")!;
    expect(evaluation.eligible).toBe(false);
    expect(recommendWorkout(context).kind).toBe("REST");
  });
});

describe("AA/AB. duplicate prevention and maxExercises as a ceiling, not a quota", () => {
  it("never recommends the same Exercise twice and does not pad an under-filled budget", () => {
    // Only one Exercise exists at all (legs), so only legs is eligible; a 90-minute (max 5) budget must not be
    // force-filled with the same Exercise repeated.
    const context = makeContext({
      exercises: [makeExercise({ name: "Calf Raise", equipmentType: "BODYWEIGHT", primaryMuscles: ["Calves"] })],
      condition: { ...makeContext().condition, availableMinutes: 90 },
    });
    const result = asWorkout(recommendWorkout(context));
    expect(result.exercises).toHaveLength(1);
    expect(new Set(result.exercises.map((e) => e.exerciseId)).size).toBe(result.exercises.length);
  });

  it("can add a 2nd exercise from the same category when budget is left over and more candidates exist", () => {
    // Only legs has candidates (4 of them); a 60-minute (max 4) budget with a single eligible category should
    // fill the leftover slots from legs rather than stopping at 1.
    const legsOnly = standardCatalog().filter((exercise) =>
      ["Squat", "Deadlift", "Calf Raise", "Leg Press"].includes(exercise.exerciseName));
    const context = makeContext({ exercises: legsOnly, condition: { ...makeContext().condition, availableMinutes: 60 } });
    const result = asWorkout(recommendWorkout(context));
    expect(result.exercises.length).toBeGreaterThan(1);
    expect(result.exercises.every((e) => e.category === "legs")).toBe(true);
    expect(new Set(result.exercises.map((e) => e.exerciseId)).size).toBe(result.exercises.length);
  });
});

describe("AC. does not break the existing category/label/helper contracts", () => {
  it("the fixture catalog used by these tests matches the real seeded catalog's Exercise names", () => {
    expect(standardCatalog().map((e) => e.exerciseName).sort()).toEqual([...seededExercises].sort());
  });

  it("every category still has at least one eligible candidate in the real catalog (a full-body cold-start plan is possible)", () => {
    const evaluations = evaluateCategories(makeContext({ exercises: standardCatalog() }));
    expect(evaluations.every((e) => e.eligible)).toBe(true);
  });
});
