import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 5E-1 regression/integration guards. Most of the feature's logic is already unit-tested where it lives
// (tests/workouts/recommendation-target.test.ts, get-workout.test.ts, recommendation-target-format.test.ts);
// this file checks the things that only become visible once every piece (Commits 1-3) is wired together, and
// the things this Phase explicitly must NOT do, the same way tests/workouts/home.test.ts guards Phase 5C-1/5D's
// own "must not" list from source text (this project runs no tsx-rendering tests: vitest.config.mts only
// includes "tests/**/*.test.ts", environment: "node").
const read = (...parts: string[]) => readFileSync(join(process.cwd(), ...parts), "utf8");

describe("Workout editor wiring (IN_PROGRESS vs COMPLETED label)", () => {
  const editorSource = read("components", "workouts", "workout-editor.tsx");

  it("renders the Recommendation Target card for every exercise, keyed off the Session's own status", () => {
    expect(editorSource).toMatch(/<RecommendationTargetCard\b/);
    expect(editorSource).toMatch(/target=\{exercise\.recommendationTarget\}/);
    expect(editorSource).toMatch(/completed=\{workout\.status === "COMPLETED"\}/);
  });

  it("imports the card from its own file rather than re-implementing the target display inline", () => {
    expect(editorSource).toMatch(/from "\.\/recommendation-target-card"/);
  });
});

describe("No input auto-fill / no WorkoutSet writes added by this Phase", () => {
  const files = [
    "lib/workouts/recommendation-target.ts", "lib/workouts/recommendation-target-format.ts",
    "components/workouts/recommendation-target-card.tsx",
  ].map((path) => [path, read(...path.split("/"))] as const);

  it.each(files)("%s never creates, updates or writes a WorkoutSet", (path, source) => {
    for (const forbidden of ["workoutSet", "createSet", "updateSet", ".create(", ".update(", "prisma."]) {
      expect(source, `${path} should not contain "${forbidden}"`).not.toContain(forbidden);
    }
  });

  it("the card never sets a form/input value (display only, no auto-fill)", () => {
    const cardSource = read("components", "workouts", "recommendation-target-card.tsx");
    for (const forbidden of ["useState", "onChange", "defaultValue", "<input"]) {
      expect(cardSource, forbidden).not.toContain(forbidden);
    }
  });
});

describe("Analytics stays Recommendation-Target-free", () => {
  it("analytics.ts / analytics-trend.ts never import the Recommendation Target modules", () => {
    for (const path of ["lib/workouts/analytics.ts", "lib/workouts/analytics-trend.ts"]) {
      const source = read(...path.split("/"));
      expect(source, path).not.toMatch(/recommendation-target/);
    }
  });
});

describe("Phase 5D persistence untouched by this Phase", () => {
  it("lib/workouts/mutations.ts (createWorkoutFromRecommendation) never imports the new read/display modules", () => {
    const source = read("lib", "workouts", "mutations.ts");
    expect(source).not.toMatch(/recommendation-target/);
  });
});
