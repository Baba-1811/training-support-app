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

// Phase 5E-2: Recommendation Target as a Set-input aid. The weight/reps default logic itself is unit-tested
// directly (tests/workouts/recommendation-target.test.ts#recommendedInitialWeightKg,
// recommendation-target-format.test.ts#formatRecommendationRepsGuide); these guards check the wiring in
// workout-editor.tsx, the one file with no DOM-rendering test in this project (see this file's own header note).
describe("Phase 5E-2: Set input defaults wired without changing DB write timing or row-generation shape", () => {
  const editorSource = read("components", "workouts", "workout-editor.tsx");

  it("seeds a brand-new blank row's weight from the pure helper, keyed off the row's own Set number", () => {
    expect(editorSource).toMatch(/import \{ recommendedInitialWeightKg \} from "@\/lib\/workouts\/recommendation-target"/);
    expect(editorSource).toMatch(/recommendedInitialWeightKg\(setNumber, exercise\.recommendationTarget\?\.targetWeightKg \?\? null\)/);
  });

  it("every blank row is still created as WORKING with empty reps (no actual auto-fill, no WARMUP auto-seed)", () => {
    expect(editorSource).toMatch(/weightKg,\s*reps:\s*"",\s*rir:\s*"",\s*setType:\s*"WORKING"/);
  });

  it("blank-row generation is still gated to IN_PROGRESS only (COMPLETED never gets a new draft to seed)", () => {
    expect(editorSource).toMatch(/if \(workout\.status === "IN_PROGRESS"\) \{/);
  });

  it("the provisional row count is still a fixed 3, never driven by recommendationTarget.targetSets", () => {
    expect(editorSource).toMatch(/Math\.max\(1, 3 - exercise\.sets\.length\)/);
    expect(editorSource).not.toMatch(/recommendationTarget[?.]*\.targetSets/);
  });

  it("WorkoutSet is still only ever created/updated from the ✓ (onSave) handler", () => {
    const onSaveBlock = editorSource.slice(editorSource.indexOf("onSave={"), editorSource.indexOf("onDelete={"));
    expect(onSaveBlock).toMatch(/actions\.createSet/);
    expect(onSaveBlock).toMatch(/actions\.updateSet/);
    expect(editorSource.match(/actions\.createSet/g)).toHaveLength(1);
    expect(editorSource.match(/actions\.updateSet/g)).toHaveLength(1);
  });

  it("the reps input only ever gets a placeholder guide, never a value, and only for unsaved WORKING rows", () => {
    expect(editorSource).toMatch(/formatRecommendationRepsGuide/);
    expect(editorSource).toMatch(/!row\.id && row\.setType === "WORKING" && exercise\.recommendationTarget/);
    expect(editorSource).not.toMatch(/reps:\s*String\(.*targetReps/);
  });

  it("recommendedInitialWeightKg/formatRecommendationRepsGuide never call requireUser or touch Prisma", () => {
    for (const path of ["lib/workouts/recommendation-target.ts", "lib/workouts/recommendation-target-format.ts"]) {
      const source = read(...path.split("/"));
      expect(source, path).not.toMatch(/requireUser/);
      expect(source, path).not.toMatch(/prisma\./);
    }
  });
});
