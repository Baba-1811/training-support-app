import { describe, expect, it } from "vitest";
import {
  buildExerciseAnalytics, buildWorkoutAnalytics, comparePerformance, summarizePerformance,
} from "@/lib/workouts/analytics";
import { formatE1rm, formatE1rmDelta, formatVolume, formatVolumeDelta } from "@/lib/workouts/analytics-format";
import type { AnalyticsSet, ExerciseHistoryRecord } from "@/lib/workouts/types";

const work = (weightKg: string, reps: number, extra: Partial<AnalyticsSet> = {}): AnalyticsSet =>
  ({ weightKg, reps, setType: "WORKING", completed: true, ...extra });
const record = (sessionId: string, startedAt: string, sets: AnalyticsSet[]): ExerciseHistoryRecord => ({ sessionId, startedAt, sets });
const NOW = "2026-09-21T00:00:00Z";

describe("summarizePerformance", () => {
  it("uses the Epley e1RM of the best set as the representative value", () => {
    const summary = summarizePerformance([work("60", 10), work("60", 8), work("55", 10)]);
    expect(summary?.e1rmKg).toBeCloseTo(80); // 60 * (1 + 10/30)
  });

  it("sums weight x reps for Volume", () => {
    expect(summarizePerformance([work("60", 10), work("60", 9), work("60", 8)])).toMatchObject({ volumeKg: 1620, workingSetCount: 3 });
  });

  it("excludes WARMUP sets from both e1RM and Volume", () => {
    const summary = summarizePerformance([work("100", 10, { setType: "WARMUP" }), work("60", 10)]);
    expect(summary?.e1rmKg).toBeCloseTo(80);
    expect(summary?.volumeKg).toBe(600);
    expect(summary?.workingSetCount).toBe(1);
  });

  it("excludes sets that are not completed", () => {
    const summary = summarizePerformance([work("100", 10, { completed: false }), work("60", 10)]);
    expect(summary?.e1rmKg).toBeCloseTo(80);
    expect(summary?.volumeKg).toBe(600);
  });

  it("returns null when there is nothing analyzable", () => {
    expect(summarizePerformance([])).toBeNull();
    expect(summarizePerformance([work("60", 10, { completed: false }), work("60", 10, { setType: "WARMUP" })])).toBeNull();
  });

  it("handles decimal weights without rounding", () => {
    const summary = summarizePerformance([work("62.50", 8), work("17.5", 12)]);
    expect(summary?.e1rmKg).toBeCloseTo(62.5 * (1 + 8 / 30));
    expect(summary?.volumeKg).toBe(62.5 * 8 + 17.5 * 12);
  });

  it("skips sets with unusable values", () => {
    expect(summarizePerformance([work("", 10), work("abc", 10), work("60", 0)])).toBeNull();
  });
});

describe("comparePerformance", () => {
  const perf = (e1rmKg: number, volumeKg: number) => ({ e1rmKg, volumeKg, workingSetCount: 3 });
  it("reports positive deltas", () => {
    expect(comparePerformance(perf(80, 1620), perf(77.5, 1500))).toEqual({ e1rmDeltaKg: 2.5, volumeDeltaKg: 120 });
  });
  it("reports negative deltas", () => {
    expect(comparePerformance(perf(80, 1300), perf(81.5, 1500))).toEqual({ e1rmDeltaKg: -1.5, volumeDeltaKg: -200 });
  });
  it("reports 0 for equal values, including floating-point noise", () => {
    expect(comparePerformance(perf(80, 1500), perf(80, 1500))).toEqual({ e1rmDeltaKg: 0, volumeDeltaKg: 0 });
    expect(comparePerformance(perf(0.1 + 0.2, 1), perf(0.3, 1)).e1rmDeltaKg).toBe(0);
  });
});

describe("buildExerciseAnalytics", () => {
  const current = [work("60", 10), work("60", 9), work("60", 8)];

  it("compares against the most recent earlier COMPLETED workout", () => {
    const result = buildExerciseAnalytics(current, [
      record("a", "2026-09-10T00:00:00Z", [work("50", 10)]),
      record("b", "2026-09-18T00:00:00Z", [work("55", 10), work("55", 10)]),
    ], NOW);
    expect(result.previous?.startedAt).toBe("2026-09-18T00:00:00Z");
    expect(result.comparison?.e1rmDeltaKg).toBeCloseTo(80 - 55 * (1 + 10 / 30));
    expect(result.comparison?.volumeDeltaKg).toBe(1620 - 1100);
  });

  it("skips an earlier session with no analyzable sets when picking the previous workout", () => {
    const result = buildExerciseAnalytics(current, [
      record("a", "2026-09-10T00:00:00Z", [work("50", 10)]),
      record("b", "2026-09-18T00:00:00Z", [work("90", 5, { completed: false })]),
    ], NOW);
    expect(result.previous?.startedAt).toBe("2026-09-10T00:00:00Z");
  });

  it("ignores later sessions for previous/previousBest but still counts them in the all-time best", () => {
    const result = buildExerciseAnalytics(current, [
      record("a", "2026-09-10T00:00:00Z", [work("50", 10)]),
      record("later", "2026-10-01T00:00:00Z", [work("100", 10)]),
    ], NOW);
    expect(result.previous?.startedAt).toBe("2026-09-10T00:00:00Z");
    expect(result.previousBestE1rmKg).toBeCloseTo(50 * (1 + 10 / 30));
    expect(result.personalBestE1rmKg).toBeCloseTo(100 * (1 + 10 / 30));
    expect(result.recordStatus).toBe("NEW_BEST");
  });

  it("merges the same exercise appearing twice in one past session", () => {
    const result = buildExerciseAnalytics(current, [
      record("a", "2026-09-10T00:00:00Z", [work("50", 10)]),
      record("a", "2026-09-10T00:00:00Z", [work("50", 10)]),
    ], NOW);
    expect(result.previous?.volumeKg).toBe(1000);
    expect(result.previous?.workingSetCount).toBe(2);
  });

  it("flags a new personal best only when strictly above every earlier record", () => {
    const result = buildExerciseAnalytics([work("60", 10)], [record("a", "2026-09-10T00:00:00Z", [work("55", 10)])], NOW);
    expect(result.recordStatus).toBe("NEW_BEST");
    expect(result.previousBestE1rmKg).toBeCloseTo(55 * (1 + 10 / 30));
    expect(result.personalBestE1rmKg).toBeCloseTo(80);
  });

  it("does not treat an equal e1RM as a new best", () => {
    const result = buildExerciseAnalytics([work("60", 10)], [record("a", "2026-09-10T00:00:00Z", [work("60", 10)])], NOW);
    expect(result.recordStatus).toBe("NONE");
  });

  it("does not treat an equal e1RM reached by a different weight/reps mix as a new best", () => {
    // 60 x 15 and 45 x 30 both give an e1RM of 90.
    const result = buildExerciseAnalytics([work("45", 30)], [record("a", "2026-09-10T00:00:00Z", [work("60", 15)])], NOW);
    expect(result.recordStatus).toBe("NONE");
  });

  it("does not flag a lower e1RM", () => {
    const result = buildExerciseAnalytics([work("50", 10)], [record("a", "2026-09-10T00:00:00Z", [work("60", 10)])], NOW);
    expect(result.recordStatus).toBe("NONE");
    expect(result.personalBestE1rmKg).toBeCloseTo(80);
  });

  it("reports FIRST_RECORD with null previous data and no comparison when there is no history", () => {
    const result = buildExerciseAnalytics(current, [], NOW);
    expect(result).toMatchObject({
      previous: null, comparison: null, previousBestE1rmKg: null, recordStatus: "FIRST_RECORD",
    });
    expect(result.personalBestE1rmKg).toBeCloseTo(80);
  });

  it("does not report a record or comparison when the current workout has no analyzable sets", () => {
    const result = buildExerciseAnalytics([work("60", 10, { completed: false })], [record("a", "2026-09-10T00:00:00Z", [work("55", 10)])], NOW);
    expect(result.current).toBeNull();
    expect(result.comparison).toBeNull();
    expect(result.recordStatus).toBe("NONE");
    expect(result.personalBestE1rmKg).toBeCloseTo(55 * (1 + 10 / 30));
  });

  it("does not use history sets that are WARMUP or unconfirmed", () => {
    const result = buildExerciseAnalytics(current, [
      record("a", "2026-09-10T00:00:00Z", [work("200", 10, { setType: "WARMUP" }), work("200", 10, { completed: false })]),
    ], NOW);
    expect(result.previous).toBeNull();
    expect(result.recordStatus).toBe("FIRST_RECORD");
  });
});

describe("buildWorkoutAnalytics", () => {
  const ex1 = "ex-1";
  const ex2 = "ex-2";
  const workout = {
    startedAt: NOW,
    exercises: [
      { id: "we-1", exerciseId: ex1, name: "A", exerciseOrder: 1, muscles: [], sets: [
        { id: "s1", setNumber: 1, weightKg: "60.00", reps: 10, rir: null, setType: "WORKING" as const, completed: true }] },
      { id: "we-2", exerciseId: ex2, name: "B", exerciseOrder: 2, muscles: [], sets: [
        { id: "s2", setNumber: 1, weightKg: "20.00", reps: 10, rir: null, setType: "WORKING" as const, completed: true }] },
    ],
  };

  it("never mixes another exercise's history in", () => {
    const result = buildWorkoutAnalytics(workout, {
      [ex1]: [record("a", "2026-09-10T00:00:00Z", [work("55", 10)])],
      [ex2]: [],
    });
    expect(result["we-1"].previous).not.toBeNull();
    expect(result["we-2"].previous).toBeNull();
    expect(result["we-2"].recordStatus).toBe("FIRST_RECORD");
  });

  it("does not compare against the current workout itself (history excludes it by construction)", () => {
    // With no other sessions, the current workout is a first record rather than "equal to itself".
    const result = buildWorkoutAnalytics(workout, {});
    expect(result["we-1"].recordStatus).toBe("FIRST_RECORD");
    expect(result["we-1"].previous).toBeNull();
  });
});

describe("formatting", () => {
  it("formats e1RM with one decimal and Volume with separators", () => {
    expect(formatE1rm(80)).toBe("80.0 kg");
    expect(formatE1rm(79.16666667)).toBe("79.2 kg");
    expect(formatVolume(1620)).toBe("1,620 kg");
    expect(formatVolume(562.5)).toBe("562.5 kg");
  });
  it("signs deltas and avoids a signed zero", () => {
    expect(formatE1rmDelta(2.5)).toBe("+2.5 kg");
    expect(formatE1rmDelta(-1.5)).toBe("-1.5 kg");
    expect(formatE1rmDelta(0)).toBe("0.0 kg");
    expect(formatE1rmDelta(-0.01)).toBe("0.0 kg");
    expect(formatVolumeDelta(120)).toBe("+120 kg");
    expect(formatVolumeDelta(-200)).toBe("-200 kg");
    expect(formatVolumeDelta(1200)).toBe("+1,200 kg");
  });
});
