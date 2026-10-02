import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 5F-2 wiring/regression guards. The pure calculation/formatting logic is unit-tested directly
// (tests/workouts/recommendation-evaluation-format.test.ts, recommendation-evaluation.test.ts); this file
// checks the things that only become visible once every piece is wired together into workout-editor.tsx, and
// the things this Phase explicitly must NOT do — same convention as recommendation-target-integration.test.ts
// (this project runs no tsx-rendering tests: vitest.config.mts only includes "tests/**/*.test.ts").
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");
const editorSource = () => read("components", "workouts", "workout-editor.tsx");

describe("A/B/C: Recommendation Result is gated on COMPLETED + at least one evaluated Exercise", () => {
  it("evaluation only runs for a COMPLETED Workout (IN_PROGRESS/CANCELLED get an empty evaluation map)", () => {
    expect(editorSource()).toMatch(/workout\.status === "COMPLETED" \? evaluateWorkoutRecommendations\(workout\) : \{\}/);
  });

  it("the card itself is gated on the summary having at least one evaluated Exercise (hidden for a normal Workout)", () => {
    expect(editorSource()).toMatch(/recommendationSummary\.totalExercises > 0 && <RecommendationResultCard/);
  });

  it("imports the card and the Phase 5F-1 evaluation module rather than reimplementing evaluation inline", () => {
    const source = editorSource();
    expect(source).toMatch(/from "\.\/recommendation-result-card"/);
    expect(source).toMatch(/from "@\/lib\/workouts\/recommendation-evaluation"/);
    expect(source).toMatch(/from "@\/lib\/workouts\/recommendation-evaluation-format"/);
  });
});

describe("O: COMPLETED/History re-open reproduces the same result (no DB-stored evaluation)", () => {
  it("the evaluation is derived from the `workout` state on every render, not from a one-time snapshot", () => {
    // `workout` (not `initialWorkout`) is what evaluateWorkoutRecommendations reads, so reopening a COMPLETED
    // Workout fresh from History (where `workout` === the server's own getWorkout() result) recomputes the
    // identical evaluation from the same WorkoutPlanExercise snapshot + WorkoutSet actuals.
    expect(editorSource()).toMatch(/evaluateWorkoutRecommendations\(workout\)/);
  });

  it("recommendation-evaluation.ts and recommendation-evaluation-format.ts never write to a database", () => {
    for (const path of ["lib/workouts/recommendation-evaluation.ts", "lib/workouts/recommendation-evaluation-format.ts"]) {
      const source = read(...path.split("/"));
      for (const forbidden of [".create(", ".update(", ".upsert(", "requireUser(", "prisma."]) {
        expect(source, `${path} should not contain "${forbidden}"`).not.toContain(forbidden);
      }
    }
  });
});

describe("P: RecommendationTargetCard (今日の目安 / この日の目安) is not removed", () => {
  it("still renders the Recommendation Target card for every Exercise", () => {
    const source = editorSource();
    expect(source).toMatch(/<RecommendationTargetCard\b/);
    expect(source).toMatch(/from "\.\/recommendation-target-card"/);
  });
});

describe("Q: Analytics untouched", () => {
  it("analytics.ts / analytics-trend.ts never import the Recommendation Evaluation modules", () => {
    for (const path of ["lib/workouts/analytics.ts", "lib/workouts/analytics-trend.ts"]) {
      const source = read(...path.split("/"));
      expect(source, path).not.toMatch(/recommendation-evaluation/);
    }
  });

  it("the existing ExerciseAnalytics rendering block is still present, unreplaced", () => {
    expect(editorSource()).toMatch(/<ExerciseAnalytics analytics=\{analytics\[exercise\.id\]\}/);
  });
});

describe("R: Phase 5E-2 Set input assistance untouched", () => {
  it("recommendedInitialWeightKg / formatRecommendationRepsGuide wiring is still present", () => {
    const source = editorSource();
    expect(source).toMatch(/recommendedInitialWeightKg\(setNumber, exercise\.recommendationTarget\?\.targetWeightKg \?\? null\)/);
    expect(source).toMatch(/formatRecommendationRepsGuide/);
  });
});

describe("S: no new Prisma query / query count unchanged", () => {
  it("the Recommendation Result modules never import Prisma (the client-side evaluation needs none)", () => {
    for (const path of ["lib/workouts/recommendation-evaluation.ts", "lib/workouts/recommendation-evaluation-format.ts", "components/workouts/recommendation-result-card.tsx"]) {
      const source = read(...path.split("/"));
      const importLines = source.split("\n").filter((line) => line.trimStart().startsWith("import "));
      for (const line of importLines) expect(line, path).not.toMatch(/prisma/i);
      expect(source, path).not.toContain("prisma.");
    }
  });

  it("queries.ts#getWorkout is untouched by this Phase (still the sole source of the Recommendation Target + actual Sets)", () => {
    const source = read("lib", "workouts", "queries.ts");
    expect(source).not.toMatch(/recommendation-evaluation/);
  });

  it("the Workout detail page (app/(protected)/workouts/[id]/page.tsx) adds no new query for this Phase", () => {
    const source = read("app", "(protected)", "workouts", "[id]", "page.tsx");
    expect(source).not.toMatch(/recommendation-evaluation/);
  });
});

describe("T: Auth untouched", () => {
  it("the new modules never call requireUser (pure client-side evaluation, no re-authentication)", () => {
    for (const path of ["lib/workouts/recommendation-evaluation.ts", "lib/workouts/recommendation-evaluation-format.ts", "components/workouts/recommendation-result-card.tsx"]) {
      const source = read(...path.split("/"));
      expect(source).not.toContain("requireUser(");
    }
  });

  it("lib/auth/** and lib/supabase/proxy.ts are not referenced by the new modules", () => {
    for (const path of ["lib/workouts/recommendation-evaluation.ts", "lib/workouts/recommendation-evaluation-format.ts", "components/workouts/recommendation-result-card.tsx"]) {
      const source = read(...path.split("/"));
      expect(source).not.toMatch(/lib\/auth/);
      expect(source).not.toMatch(/supabase/);
    }
  });
});

describe("Recommendation Algorithm untouched", () => {
  it("engine/rules/target/reasons are not referenced by the new Phase 5F-2 modules", () => {
    for (const path of ["lib/workouts/recommendation-evaluation.ts", "lib/workouts/recommendation-evaluation-format.ts", "components/workouts/recommendation-result-card.tsx"]) {
      const source = read(...path.split("/"));
      expect(source).not.toMatch(/recommendations\/(engine|rules|target|reasons)/);
    }
  });
});

describe("UI does not re-derive EXCEEDED/ACHIEVED itself", () => {
  it("recommendation-result-card.tsx only formats the given status, it never compares weight/reps to target itself", () => {
    const source = read("components", "workouts", "recommendation-result-card.tsx");
    expect(source).not.toMatch(/targetWeightKg\s*[<>]=?/);
    expect(source).not.toMatch(/targetRepsM(in|ax)\s*[<>]=?/);
  });
});
