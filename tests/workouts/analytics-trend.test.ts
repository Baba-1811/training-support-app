import { describe, expect, it } from "vitest";
import { buildExerciseAnalytics } from "@/lib/workouts/analytics";
import { buildExerciseTrends, filterPointsByPeriod, periodStart, summarizeTrend } from "@/lib/workouts/analytics-trend";
import { formatChartDate } from "@/lib/workouts/analytics-format";
import type { AnalyticsSet, ExerciseTrendRecord, TrendPoint } from "@/lib/workouts/types";

const set = (weightKg: string, reps: number, over: Partial<AnalyticsSet> = {}): AnalyticsSet =>
  ({ weightKg, reps, setType: "WORKING", completed: true, ...over });
const record = (exerciseId: string, sessionId: string, startedAt: string, sets: AnalyticsSet[], exerciseName = exerciseId): ExerciseTrendRecord =>
  ({ exerciseId, exerciseName, sessionId, startedAt, sets });
const point = (sessionId: string, startedAt: string, e1rmKg = 100, volumeKg = 1000): TrendPoint =>
  ({ sessionId, startedAt, e1rmKg, volumeKg, workingSetCount: 1 });

describe("buildExerciseTrends", () => {
  it("computes per-workout max e1RM and volume (sum of weight x reps)", () => {
    const [trend] = buildExerciseTrends([record("bench", "s1", "2026-09-01T00:00:00Z", [set("60.00", 10), set("70.00", 5)])]);
    expect(trend.points).toHaveLength(1);
    expect(trend.points[0].e1rmKg).toBeCloseTo(Math.max(60 * (1 + 10 / 30), 70 * (1 + 5 / 30)));
    expect(trend.points[0].volumeKg).toBe(60 * 10 + 70 * 5);
    expect(trend.points[0].sessionId).toBe("s1");
  });

  it("matches the Phase 1 definition exactly (no separate e1RM / volume implementation)", () => {
    const sets = [set("62.50", 8), set("65.00", 6), set("40.00", 12, { setType: "WARMUP" })];
    const [trend] = buildExerciseTrends([record("bench", "s1", "2026-09-01T00:00:00Z", sets)]);
    const phase1 = buildExerciseAnalytics(sets, [], "2026-09-02T00:00:00Z").current!;
    expect(trend.points[0]).toMatchObject({ e1rmKg: phase1.e1rmKg, volumeKg: phase1.volumeKg, workingSetCount: phase1.workingSetCount });
  });

  it("excludes WARMUP and completed=false sets", () => {
    const [trend] = buildExerciseTrends([record("bench", "s1", "2026-09-01T00:00:00Z", [
      set("60.00", 10), set("100.00", 10, { setType: "WARMUP" }), set("120.00", 10, { completed: false }),
    ])]);
    expect(trend.points[0].e1rmKg).toBeCloseTo(60 * (1 + 10 / 30));
    expect(trend.points[0].volumeKg).toBe(600);
    expect(trend.points[0].workingSetCount).toBe(1);
  });

  it("omits a workout with no analyzable set, and an exercise with no analyzable workout", () => {
    const trends = buildExerciseTrends([
      record("bench", "s1", "2026-09-01T00:00:00Z", [set("60.00", 10, { completed: false })]),
      record("bench", "s2", "2026-09-05T00:00:00Z", [set("60.00", 10)]),
      record("squat", "s3", "2026-09-05T00:00:00Z", [set("80.00", 5, { setType: "WARMUP" })]),
    ]);
    expect(trends.map((t) => t.exerciseId)).toEqual(["bench"]);
    expect(trends[0].points.map((p) => p.sessionId)).toEqual(["s2"]);
  });

  it("merges the same exercise appearing twice in one workout into one point", () => {
    const [trend] = buildExerciseTrends([
      record("bench", "s1", "2026-09-01T00:00:00Z", [set("60.00", 10)]),
      record("bench", "s1", "2026-09-01T00:00:00Z", [set("80.00", 5)]),
    ]);
    expect(trend.points).toHaveLength(1);
    expect(trend.points[0].volumeKg).toBe(600 + 400);
    expect(trend.points[0].e1rmKg).toBeCloseTo(80 * (1 + 5 / 30));
    expect(trend.points[0].workingSetCount).toBe(2);
  });

  it("separates exercises", () => {
    const trends = buildExerciseTrends([
      record("bench", "s1", "2026-09-01T00:00:00Z", [set("60.00", 10)]),
      record("squat", "s1", "2026-09-01T00:00:00Z", [set("100.00", 5)]),
    ]);
    const bench = trends.find((t) => t.exerciseId === "bench")!;
    const squat = trends.find((t) => t.exerciseId === "squat")!;
    expect(bench.points[0].volumeKg).toBe(600);
    expect(squat.points[0].volumeKg).toBe(500);
  });

  it("sorts points oldest to newest regardless of input order", () => {
    const [trend] = buildExerciseTrends([
      record("bench", "c", "2026-09-20T00:00:00Z", [set("60.00", 10)]),
      record("bench", "a", "2026-09-01T00:00:00Z", [set("60.00", 10)]),
      record("bench", "b", "2026-09-10T00:00:00Z", [set("60.00", 10)]),
    ]);
    expect(trend.points.map((p) => p.sessionId)).toEqual(["a", "b", "c"]);
  });

  it("keeps same-day workouts as separate points instead of summing them by day", () => {
    const [trend] = buildExerciseTrends([
      record("bench", "am", "2026-09-24T00:00:00Z", [set("60.00", 10)]),
      record("bench", "pm", "2026-09-24T09:00:00Z", [set("70.00", 8)]),
    ]);
    expect(trend.points.map((p) => p.sessionId)).toEqual(["am", "pm"]);
    expect(trend.points[0].volumeKg).toBe(600);
    expect(trend.points[1].volumeKg).toBe(560);
  });

  it("lists the most recently performed exercise first (initial selection)", () => {
    const trends = buildExerciseTrends([
      record("bench", "s1", "2026-09-20T00:00:00Z", [set("60.00", 10)], "ベンチプレス"),
      record("squat", "s2", "2026-09-22T00:00:00Z", [set("100.00", 5)], "スクワット"),
      record("bench", "s0", "2026-09-01T00:00:00Z", [set("60.00", 10)], "ベンチプレス"),
    ]);
    expect(trends.map((t) => t.exerciseId)).toEqual(["squat", "bench"]);
    expect(trends[1].name).toBe("ベンチプレス");
  });

  it("returns nothing (empty state) when there are no records", () => {
    expect(buildExerciseTrends([])).toEqual([]);
  });

  it("handles Decimal weights without rounding the calculation", () => {
    const [trend] = buildExerciseTrends([record("bench", "s1", "2026-09-01T00:00:00Z", [set("62.50", 8), set("62.50", 8)])]);
    expect(trend.points[0].volumeKg).toBe(1000);
    expect(trend.points[0].e1rmKg).toBeCloseTo(62.5 * (1 + 8 / 30), 10);
  });
});

describe("periodStart (calendar months, Asia/Tokyo calendar)", () => {
  it("ALL has no cutoff", () => {
    expect(periodStart("ALL", new Date("2026-09-24T03:00:00Z"))).toBeNull();
  });

  it("1M / 3M step back whole calendar months keeping day and time of day", () => {
    const now = new Date("2026-09-24T03:00:00Z"); // 9/24 12:00 JST
    expect(periodStart("1M", now)?.toISOString()).toBe("2026-08-24T03:00:00.000Z");
    expect(periodStart("3M", now)?.toISOString()).toBe("2026-06-24T03:00:00.000Z");
  });

  it("is not a fixed 30 / 90 day window", () => {
    const now = new Date("2026-09-24T03:00:00Z");
    const oneMonthDays = (now.getTime() - periodStart("1M", now)!.getTime()) / 86_400_000;
    expect(oneMonthDays).toBe(31); // August has 31 days
    const marchNow = new Date("2026-03-24T03:00:00Z");
    expect((marchNow.getTime() - periodStart("1M", marchNow)!.getTime()) / 86_400_000).toBe(28); // February 2026
  });

  it("clamps to the last day of a shorter target month", () => {
    expect(periodStart("1M", new Date("2026-03-31T03:00:00Z"))?.toISOString()).toBe("2026-02-28T03:00:00.000Z");
    expect(periodStart("3M", new Date("2026-05-31T03:00:00Z"))?.toISOString()).toBe("2026-02-28T03:00:00.000Z");
    expect(periodStart("1M", new Date("2028-03-31T03:00:00Z"))?.toISOString()).toBe("2028-02-29T03:00:00.000Z"); // leap year
  });

  it("crosses year boundaries", () => {
    expect(periodStart("1M", new Date("2026-01-15T03:00:00Z"))?.toISOString()).toBe("2025-12-15T03:00:00.000Z");
    expect(periodStart("3M", new Date("2026-02-10T03:00:00Z"))?.toISOString()).toBe("2025-11-10T03:00:00.000Z");
  });

  it("uses the JST calendar date, not UTC, near midnight", () => {
    // 2026-03-31 20:00Z is already 4/1 05:00 JST, so one month back is 3/1 05:00 JST (= 2/28 20:00Z), not UTC's 2/28.
    expect(periodStart("1M", new Date("2026-03-31T20:00:00Z"))?.toISOString()).toBe("2026-02-28T20:00:00.000Z");
    // 2026-04-01 20:00Z is 4/2 05:00 JST, so one month back is 3/2 05:00 JST (= 3/1 20:00Z).
    expect(periodStart("1M", new Date("2026-04-01T20:00:00Z"))?.toISOString()).toBe("2026-03-01T20:00:00.000Z");
  });
});

describe("filterPointsByPeriod", () => {
  const now = new Date("2026-09-24T03:00:00Z");
  const points = [
    point("old", "2026-05-01T00:00:00Z"),
    point("three-months-edge", "2026-06-24T03:00:00Z"),
    point("before-three", "2026-06-24T02:59:59Z"),
    point("one-month-edge", "2026-08-24T03:00:00Z"),
    point("before-one", "2026-08-24T02:59:59Z"),
    point("recent", "2026-09-20T00:00:00Z"),
  ];

  it("ALL keeps everything", () => {
    expect(filterPointsByPeriod(points, "ALL", now)).toHaveLength(points.length);
  });

  it("1M keeps points at or after the cutoff (inclusive boundary)", () => {
    expect(filterPointsByPeriod(points, "1M", now).map((p) => p.sessionId)).toEqual(["one-month-edge", "recent"]);
  });

  it("3M keeps points at or after the cutoff (inclusive boundary)", () => {
    expect(filterPointsByPeriod(points, "3M", now).map((p) => p.sessionId))
      .toEqual(["three-months-edge", "one-month-edge", "before-one", "recent"]);
  });

  it("returns an empty list when nothing falls in the period", () => {
    expect(filterPointsByPeriod([point("old", "2026-01-01T00:00:00Z")], "1M", now)).toEqual([]);
  });
});

describe("summarizeTrend", () => {
  it("uses the newest point as current and newest - oldest as the change", () => {
    const summary = summarizeTrend([
      point("mid", "2026-09-10T00:00:00Z", 90, 1500),
      point("new", "2026-09-20T00:00:00Z", 93.3, 1680),
      point("old", "2026-09-01T00:00:00Z", 80, 1400),
    ]);
    expect(summary.latest?.sessionId).toBe("new");
    expect(summary.oldest?.sessionId).toBe("old");
    expect(summary.pointCount).toBe(3);
    expect(summary.comparison?.e1rmDeltaKg).toBeCloseTo(13.3, 10);
    expect(summary.comparison?.volumeDeltaKg).toBe(280);
  });

  it("supports negative and zero changes", () => {
    expect(summarizeTrend([point("a", "2026-09-01T00:00:00Z", 100, 1000), point("b", "2026-09-02T00:00:00Z", 90, 1200)]).comparison)
      .toEqual({ e1rmDeltaKg: -10, volumeDeltaKg: 200 });
    expect(summarizeTrend([point("a", "2026-09-01T00:00:00Z", 100, 1000), point("b", "2026-09-02T00:00:00Z", 100, 1000)]).comparison)
      .toEqual({ e1rmDeltaKg: 0, volumeDeltaKg: 0 });
  });

  it("has no change (null, not 0) with a single point", () => {
    const summary = summarizeTrend([point("a", "2026-09-01T00:00:00Z")]);
    expect(summary.latest?.sessionId).toBe("a");
    expect(summary.comparison).toBeNull();
    expect(summary.pointCount).toBe(1);
  });

  it("is empty with no points", () => {
    expect(summarizeTrend([])).toEqual({ pointCount: 0, latest: null, oldest: null, comparison: null });
  });
});

describe("formatChartDate", () => {
  it("shows the Asia/Tokyo calendar date", () => {
    expect(formatChartDate("2026-09-24T03:00:00Z")).toBe("9/24");
    // 15:30Z on 9/23 is 00:30 JST on 9/24.
    expect(formatChartDate("2026-09-23T15:30:00Z")).toBe("9/24");
    expect(formatChartDate(Date.parse("2026-09-23T14:59:00Z"))).toBe("9/23");
  });
});
