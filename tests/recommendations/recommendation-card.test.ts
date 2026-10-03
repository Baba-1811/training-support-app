import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

// Phase 5F-3C: wiring guards for the weight-target explanation in the Home Recommendation card. The underlying
// wording logic (PROGRESSED/MAINTAINED/LATEST_PERFORMANCE/etc.) is already fully covered at the pure level
// (tests/recommendations/display.test.ts#formatWeightTargetExplanation) and the domain level
// (tests/recommendations/target.test.ts#resolveWeightTarget); this file only checks that the card actually
// wires that pure helper in, once, uniformly for every Exercise — and that the REST/null branches and the
// "この内容で始める" CTA are untouched by this Phase (this project has no tsx-rendering test infra — see
// tests/workouts/home.test.ts's own header note — so these are source-text checks, same convention).
const cardSource = readFileSync(join(process.cwd(), "components", "home", "recommendation-card.tsx"), "utf8");

describe("Q/R/S. weight target explanation wiring (WORKOUT Recommendation)", () => {
  it("imports and calls the pure formatWeightTargetExplanation helper, never re-deciding PROGRESSED/MAINTAINED/etc. itself", () => {
    expect(cardSource).toMatch(/formatWeightTargetExplanation/);
    expect(cardSource).toMatch(/from "@\/lib\/recommendations\/display"/);
    // No re-implementation of the domain comparison in the component itself.
    expect(cardSource).not.toMatch(/\.reason\s*===\s*"PROGRESSED"/);
    expect(cardSource).not.toMatch(/progressionDecision\s*===\s*"INCREASE"/);
  });

  it("passes the Exercise's own weightTargetExplanation + targetWeightKg straight through (single source of truth)", () => {
    expect(cardSource).toMatch(/formatWeightTargetExplanation\(exercise\.weightTargetExplanation,\s*exercise\.targetWeightKg\)/);
  });

  it("T. renders the explanation line only when there is one — BODYWEIGHT/NO_WEIGHT_TARGET (null) shows nothing, not an empty line", () => {
    expect(cardSource).toMatch(/weightExplanation !== null &&/);
  });

  it("the explanation line is visually secondary to the target line (smaller/lighter text, rendered after it)", () => {
    const targetLineIndex = cardSource.indexOf("formatTargetRepsAndSets(exercise)");
    const explanationLineIndex = cardSource.indexOf("weightExplanation !== null");
    expect(targetLineIndex).toBeGreaterThan(-1);
    expect(explanationLineIndex).toBeGreaterThan(targetLineIndex);
    expect(cardSource).toMatch(/text-\[11px\][^<]*\{weightExplanation\}/);
  });
});

describe("U. REST Recommendation unaffected", () => {
  it("the REST branch renders only its own existing fields, no weight-target explanation logic", () => {
    const restBranch = cardSource.slice(cardSource.indexOf('kind === "REST"'), cardSource.indexOf('categorySummary ='));
    expect(restBranch).not.toMatch(/weightTargetExplanation/);
    expect(restBranch).not.toMatch(/formatWeightTargetExplanation/);
  });
});

describe("V. condition未入力/null Recommendation unaffected", () => {
  it("the null-Recommendation branch (recommendation === null) is untouched", () => {
    const nullBranch = cardSource.slice(cardSource.indexOf("recommendation === null"), cardSource.indexOf('kind === "REST"'));
    expect(nullBranch).not.toMatch(/weightTargetExplanation/);
    expect(nullBranch).not.toMatch(/formatWeightTargetExplanation/);
  });
});

describe("W. Workout start CTA unaffected", () => {
  it("still renders StartFromRecommendationButton, unchanged by this Phase", () => {
    expect(cardSource).toMatch(/<StartFromRecommendationButton\s*\/>/);
  });
});
