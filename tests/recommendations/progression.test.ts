import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { evaluateRecommendedExercise } from "@/lib/workouts/recommendation-evaluation";
import { decideProgression, decideWorkoutProgression } from "@/lib/recommendations/progression";
import type { SetDTO, WorkoutRecommendationTargetDTO } from "@/lib/workouts/types";

const target = (overrides: Partial<WorkoutRecommendationTargetDTO> = {}): WorkoutRecommendationTargetDTO => ({
  targetWeightKg: 60, targetRepsMin: 8, targetRepsMax: 12, targetSets: 3, restSeconds: 90,
  ...overrides,
});

const set = (setNumber: number, weightKg: number, reps: number, overrides: Partial<SetDTO> = {}): SetDTO => ({
  id: `set-${setNumber}`, setNumber, weightKg: String(weightKg), reps, rir: null, setType: "WORKING", completed: true,
  ...overrides,
});

const exceeded = () => evaluateRecommendedExercise({ target: target(), sets: [set(1, 65, 10), set(2, 60, 10), set(3, 60, 10)] })!;
const achieved = () => evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10), set(2, 60, 9), set(3, 60, 8)] })!;
const partial = () => evaluateRecommendedExercise({ target: target(), sets: [set(1, 60, 10)] })!;
const notPerformed = () => evaluateRecommendedExercise({ target: target(), sets: [] })!;

describe("decideProgression", () => {
  it("A: EXCEEDED -> INCREASE", () => {
    expect(exceeded().status).toBe("EXCEEDED");
    expect(decideProgression(exceeded())).toEqual({ decision: "INCREASE", reason: "PREVIOUS_EXCEEDED" });
  });

  it("B: ACHIEVED -> MAINTAIN", () => {
    expect(achieved().status).toBe("ACHIEVED");
    expect(decideProgression(achieved())).toEqual({ decision: "MAINTAIN", reason: "PREVIOUS_ACHIEVED" });
  });

  it("C: PARTIAL -> MAINTAIN", () => {
    expect(partial().status).toBe("PARTIAL");
    expect(decideProgression(partial())).toEqual({ decision: "MAINTAIN", reason: "PREVIOUS_PARTIAL" });
  });

  it("D: NOT_PERFORMED -> INSUFFICIENT_DATA", () => {
    expect(notPerformed().status).toBe("NOT_PERFORMED");
    expect(decideProgression(notPerformed())).toEqual({ decision: "INSUFFICIENT_DATA", reason: "NO_PERFORMANCE_DATA" });
  });

  it("E: PARTIAL never decides DECREASE (a one-off bad day is not evidence the load is wrong)", () => {
    expect(decideProgression(partial()).decision).not.toBe("DECREASE");
  });

  it("F: NOT_PERFORMED never decides DECREASE (no performance data is not evidence the load is too heavy)", () => {
    expect(decideProgression(notPerformed()).decision).not.toBe("DECREASE");
  });

  it("G: ACHIEVED never decides INCREASE (meeting the range is not proof the load was too light)", () => {
    expect(decideProgression(achieved()).decision).not.toBe("INCREASE");
  });

  it("I: targetWeightKg=null can still EXCEED (via reps) and the policy still returns INCREASE, with no kg value", () => {
    const bodyweightExceeded = evaluateRecommendedExercise({
      target: target({ targetWeightKg: null }), sets: [set(1, 0, 15), set(2, 0, 10), set(3, 0, 10)],
    })!;
    expect(bodyweightExceeded.status).toBe("EXCEEDED");
    const result = decideProgression(bodyweightExceeded);
    expect(result).toEqual({ decision: "INCREASE", reason: "PREVIOUS_EXCEEDED" });
    expect(result).not.toHaveProperty("targetWeightKg");
    expect(result).not.toHaveProperty("weightKg");
    expect(result).not.toHaveProperty("kg");
  });

  it("J: never returns a concrete kg value — the result is exactly {decision, reason}", () => {
    for (const evaluation of [exceeded(), achieved(), partial(), notPerformed()]) {
      expect(Object.keys(decideProgression(evaluation)).sort()).toEqual(["decision", "reason"]);
    }
  });

  it("is deterministic: same input always produces the same (deep-equal) result", () => {
    const evaluation = exceeded();
    expect(decideProgression(evaluation)).toEqual(decideProgression(evaluation));
  });
});

describe("decideWorkoutProgression", () => {
  it("H: an Exercise with no Recommendation Target (evaluation === null) stays null, not INSUFFICIENT_DATA", () => {
    const result = decideWorkoutProgression({ "we-1": exceeded(), "we-2": null });
    expect(result["we-1"]).toEqual({ decision: "INCREASE", reason: "PREVIOUS_EXCEEDED" });
    expect(result["we-2"]).toBeNull();
  });

  it("maps every entry of evaluateWorkoutRecommendations' own output shape", () => {
    const result = decideWorkoutProgression({ "we-1": achieved(), "we-2": partial(), "we-3": notPerformed() });
    expect(result["we-1"]?.decision).toBe("MAINTAIN");
    expect(result["we-2"]?.decision).toBe("MAINTAIN");
    expect(result["we-3"]?.decision).toBe("INSUFFICIENT_DATA");
  });
});

describe("K/L/M/N: architecture guards", () => {
  const progressionSource = readFileSync(join(process.cwd(), "lib", "recommendations", "progression.ts"), "utf8");

  it("K: never imports Prisma, requireUser, React or the auth layer", () => {
    const importLines = progressionSource.split("\n").filter((line) => line.trimStart().startsWith("import "));
    for (const line of importLines) {
      expect(line).not.toMatch(/["']react["']/i);
      expect(line).not.toMatch(/prisma/i);
      expect(line).not.toMatch(/require-user/i);
    }
    expect(progressionSource).not.toContain("requireUser(");
    expect(progressionSource).not.toContain("prisma.");
  });

  it("L: imports only the Phase 5F-1 evaluation's TYPE, never its functions — cannot alter its semantics", () => {
    expect(progressionSource).toMatch(/import type \{ RecommendedExerciseEvaluation, RecommendedExerciseStatus \} from "@\/lib\/workouts\/recommendation-evaluation"/);
    expect(progressionSource).not.toContain("evaluateRecommendedExercise(");
    expect(progressionSource).not.toContain("evaluateWorkoutRecommendations(");
  });

  it("M: does not reference the Phase 5F-2 UI/format modules (no coupling, nothing to change there)", () => {
    expect(progressionSource).not.toMatch(/recommendation-evaluation-format/);
    expect(progressionSource).not.toMatch(/recommendation-result-card/);
  });

  it("N: not referenced by the Recommendation Engine yet (no connection wired this Phase)", () => {
    for (const path of ["lib/recommendations/engine.ts", "lib/recommendations/rules.ts", "lib/recommendations/target.ts", "lib/recommendations/reasons.ts"]) {
      const source = readFileSync(join(process.cwd(), ...path.split("/")), "utf8");
      expect(source, path).not.toMatch(/recommendations\/progression|decideProgression|decideWorkoutProgression/);
    }
  });

  it("never mixes Condition into the decision (sleep/fatigue/soreness/availableMinutes stay out of this Phase)", () => {
    const importLines = progressionSource.split("\n").filter((line) => line.trimStart().startsWith("import "));
    for (const line of importLines) expect(line).not.toMatch(/condition/i);
    for (const identifier of ["condition.sleepHours", "condition.fatigueLevel", "condition.sorenessByMuscle", "condition.availableMinutes"]) {
      expect(progressionSource).not.toContain(identifier);
    }
  });

  it("never computes a concrete weight adjustment (no +2.5kg / percentage increment logic)", () => {
    expect(progressionSource).not.toMatch(/targetWeightKg\s*[-+*/]/);
    expect(progressionSource).not.toMatch(/\b2\.5\b/);
  });
});
