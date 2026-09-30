import { describe, expect, it } from "vitest";
import {
  PRIMARY_SORENESS_EXCLUDE_AT, PRIMARY_SORENESS_PENALTY, SECONDARY_SORENESS_PENALTY, RECENCY_SCORE,
  MAX_EXERCISES_BY_MINUTES, DEFAULT_AVAILABLE_MINUTES, REDUCED_LOAD_SLEEP_HOURS_THRESHOLD, REDUCED_LOAD_FATIGUE_LEVEL_THRESHOLD,
  isPrimarySorenessExcluded, primarySorenessPenalty, secondarySorenessPenalty,
  daysSince, toJstDateOnly, recencyBucket, categoryScore, isReducedLoad, resolveMaxExercises,
} from "@/lib/recommendations/rules";

describe("PRIMARY soreness", () => {
  it.each([1, 2, 3])("level %d never excludes", (level) => expect(isPrimarySorenessExcluded(level)).toBe(false));
  it.each([4, 5])("level %d excludes (level 4 is treated the same as 5, not just 5)", (level) => expect(isPrimarySorenessExcluded(level)).toBe(true));
  it("undefined (no soreness entered) never excludes", () => expect(isPrimarySorenessExcluded(undefined)).toBe(false));

  it("penalty is 0 at level 1 and for an absent entry (no MuscleCondition row = not sore)", () => {
    expect(primarySorenessPenalty(1)).toBe(0);
    expect(primarySorenessPenalty(undefined)).toBe(0);
  });
  it("penalty strictly worsens from level 2 to level 3", () => {
    expect(primarySorenessPenalty(2)).toBeLessThan(0);
    expect(primarySorenessPenalty(3)).toBeLessThan(primarySorenessPenalty(2));
  });
  it("PRIMARY_SORENESS_EXCLUDE_AT matches the documented threshold (4)", () => {
    expect(PRIMARY_SORENESS_EXCLUDE_AT).toBe(4);
    expect(Object.keys(PRIMARY_SORENESS_PENALTY).map(Number).sort()).toEqual([1, 2, 3]);
  });
});

describe("SECONDARY soreness", () => {
  it("never excludes anything by itself (only rules.ts scoring, no exclusion function exists for SECONDARY)", () => {
    expect(secondarySorenessPenalty(4)).toBeLessThan(0);
    expect(secondarySorenessPenalty(5)).toBeLessThan(0);
  });
  it("penalty is 0 at level 1 and for an absent entry", () => {
    expect(secondarySorenessPenalty(1)).toBe(0);
    expect(secondarySorenessPenalty(undefined)).toBe(0);
  });
  it("penalty monotonically worsens from level 2 through 5", () => {
    const levels = [2, 3, 4, 5].map((level) => secondarySorenessPenalty(level));
    for (let i = 1; i < levels.length; i++) expect(levels[i]).toBeLessThan(levels[i - 1]);
  });
  it("covers every documented level 1-5", () => {
    expect(Object.keys(SECONDARY_SORENESS_PENALTY).map(Number).sort()).toEqual([1, 2, 3, 4, 5]);
  });
});

describe("daysSince: JST calendar-date arithmetic, never wall-clock", () => {
  it("0 for the same calendar date", () => expect(daysSince("2026-09-28", "2026-09-28")).toBe(0));
  it("1 for yesterday", () => expect(daysSince("2026-09-28", "2026-09-27")).toBe(1));
  it("7 for a week ago", () => expect(daysSince("2026-09-28", "2026-09-21")).toBe(7));
  it("is stable across a month boundary", () => expect(daysSince("2026-10-01", "2026-09-29")).toBe(2));
  it("is stable across a year boundary", () => expect(daysSince("2027-01-01", "2026-12-30")).toBe(2));
});

describe("toJstDateOnly", () => {
  it("converts a UTC instant to its JST calendar date", () => {
    // 2026-09-27T20:00:00Z is 2026-09-28 05:00 JST.
    expect(toJstDateOnly("2026-09-27T20:00:00.000Z")).toBe("2026-09-28");
  });
  it("does not roll over when the JST time stays within the same calendar day", () => {
    // 2026-09-28T10:00:00Z is 2026-09-28 19:00 JST, still the same day.
    expect(toJstDateOnly("2026-09-28T10:00:00.000Z")).toBe("2026-09-28");
  });
});

describe("recencyBucket", () => {
  it.each([
    [null, "never"], [0, "today"], [1, "1"], [2, "2"], [3, "3-6"], [6, "3-6"], [7, "7+"], [30, "7+"],
  ] as const)("%s days -> %s", (days, bucket) => expect(recencyBucket(days)).toBe(bucket));
  it("clamps a negative day count to today rather than a nonsensical bucket", () => expect(recencyBucket(-1)).toBe("today"));
  it("never and 7+ score identically (both mean nothing holds this category back)", () => {
    expect(RECENCY_SCORE.never).toBe(RECENCY_SCORE["7+"]);
  });
  it("scores strictly increase (get more favorable) as the gap grows, with no single 3-day cliff", () => {
    const order: Array<keyof typeof RECENCY_SCORE> = ["today", "1", "2", "3-6", "7+"];
    for (let i = 1; i < order.length; i++) expect(RECENCY_SCORE[order[i]]).toBeGreaterThan(RECENCY_SCORE[order[i - 1]]);
  });
});

describe("categoryScore", () => {
  it("combines PRIMARY soreness penalty and recency score", () => {
    expect(categoryScore(undefined, 7)).toBe(primarySorenessPenalty(undefined) + RECENCY_SCORE["7+"]);
    expect(categoryScore(3, 0)).toBe(primarySorenessPenalty(3) + RECENCY_SCORE.today);
  });
  it("never trained + no soreness scores highest among realistic inputs", () => {
    const coldStart = categoryScore(undefined, null);
    expect(coldStart).toBeGreaterThan(categoryScore(undefined, 0));
    expect(coldStart).toBeGreaterThan(categoryScore(3, 7));
  });
});

describe("isReducedLoad", () => {
  it("true when sleepHours is below the threshold", () => {
    expect(isReducedLoad({ sleepHours: "5.5", fatigueLevel: 3 })).toBe(true);
  });
  it("false when sleepHours is exactly at the threshold", () => {
    expect(isReducedLoad({ sleepHours: String(REDUCED_LOAD_SLEEP_HOURS_THRESHOLD), fatigueLevel: 3 })).toBe(false);
  });
  it("true when fatigueLevel is at or above the threshold", () => {
    expect(isReducedLoad({ sleepHours: "7.5", fatigueLevel: REDUCED_LOAD_FATIGUE_LEVEL_THRESHOLD })).toBe(true);
    expect(isReducedLoad({ sleepHours: "7.5", fatigueLevel: REDUCED_LOAD_FATIGUE_LEVEL_THRESHOLD - 1 })).toBe(false);
  });
  it("both sleep and fatigue triggering does not change the (boolean) outcome — no double reduction here", () => {
    expect(isReducedLoad({ sleepHours: "4", fatigueLevel: 5 })).toBe(true);
  });
  it("a null sleepHours never triggers reduced load by itself", () => {
    expect(isReducedLoad({ sleepHours: null, fatigueLevel: 3 })).toBe(false);
  });
  it("a null fatigueLevel never triggers reduced load by itself", () => {
    expect(isReducedLoad({ sleepHours: "7.5", fatigueLevel: null })).toBe(false);
  });
  it("both null is not reduced load", () => {
    expect(isReducedLoad({ sleepHours: null, fatigueLevel: null })).toBe(false);
  });
});

describe("resolveMaxExercises: availableMinutes is a budget, not a quota", () => {
  it.each([[30, 2], [45, 3], [60, 4], [90, 5]] as const)("%d minutes -> max %d", (minutes, max) => {
    expect(resolveMaxExercises(minutes, false)).toBe(max);
  });
  it("falls back to the 45-minute budget when availableMinutes is null", () => {
    expect(resolveMaxExercises(null, false)).toBe(MAX_EXERCISES_BY_MINUTES[DEFAULT_AVAILABLE_MINUTES]);
  });
  it("reducedLoad lowers the budget by exactly one", () => {
    expect(resolveMaxExercises(60, true)).toBe(3);
    expect(resolveMaxExercises(90, true)).toBe(4);
  });
  it("never drops below 1, even reduced at the smallest budget", () => {
    expect(resolveMaxExercises(30, true)).toBe(1);
  });
});
