import { beforeEach, describe, expect, it, vi } from "vitest";
import { Prisma } from "@/app/generated/prisma/client";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  bodyMeasurement: { findMany: vi.fn() },
  nutritionEntry: { findMany: vi.fn() },
}));
vi.mock("server-only", () => ({}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { bodyMeasurement: mocks.bodyMeasurement, nutritionEntry: mocks.nutritionEntry } }));
import { jstDateString } from "@/lib/date/jst";
import { buildNutritionAnalytics, buildWeightAnalytics, type BodyMeasurementRow } from "@/lib/nutrition/analytics";
import { getNutritionAnalytics, getNutritionAnalyticsForUser, getWeightAnalyticsForUser } from "@/lib/nutrition/analytics-queries";
import type { NutritionEntryRow } from "@/lib/nutrition/dto";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "33333333-3333-4333-8333-333333333333";
const D = (v: string) => new Prisma.Decimal(v);

let seq = 0;
const m = (measuredAt: string, weight: string, over: Partial<BodyMeasurementRow> = {}): BodyMeasurementRow => ({
  id: `id-${String(++seq).padStart(3, "0")}`, measuredAt: new Date(measuredAt), createdAt: new Date(measuredAt),
  weightKg: D(weight), bodyFatPercent: null, ...over,
});
const e = (entryDate: string, calories: number, id = `e-${++seq}`): NutritionEntryRow => ({
  id, entryDate: new Date(`${entryDate}T00:00:00.000Z`), mealType: "LUNCH", name: "x", calories,
  proteinGrams: null, fatGrams: null, carbsGrams: null, createdAt: new Date("2026-10-01T00:00:00Z"),
});

describe("jstDateString", () => {
  it("groups by the JST day, not the UTC day", () => {
    expect(jstDateString(new Date("2026-10-05T15:30:00Z"))).toBe("2026-10-06"); // 00:30 JST
    expect(jstDateString(new Date("2026-10-05T14:59:59.999Z"))).toBe("2026-10-05"); // 23:59:59 JST
    expect(jstDateString(new Date("2026-10-06T03:00:00Z"))).toBe("2026-10-06");
  });
});

describe("buildWeightAnalytics", () => {
  it("0 rows: empty, no change", () => {
    expect(buildWeightAnalytics([], 30)).toEqual({
      days: 30, points: [], measurementDays: 0, first: null, latest: null, changeKg: null, latestBodyFat: null,
    });
  });

  it("1 row: a point but changeKg is null (nothing to compare), not 0", () => {
    const r = buildWeightAnalytics([m("2026-10-06T03:00:00Z", "65.40")], 30);
    expect(r.measurementDays).toBe(1);
    expect(r.changeKg).toBeNull();
    expect(r.first).toEqual(r.latest);
  });

  it("several days: chronological order, first/latest, negative change, Decimal -> number", () => {
    const r = buildWeightAnalytics([m("2026-10-03T03:00:00Z", "64.90"), m("2026-10-01T03:00:00Z", "65.40"), m("2026-10-02T03:00:00Z", "65.10")], 30);
    expect(r.points.map((p) => [p.date, p.weightKg])).toEqual([["2026-10-01", 65.4], ["2026-10-02", 65.1], ["2026-10-03", 64.9]]);
    expect([r.first?.weightKg, r.latest?.weightKg, r.changeKg, r.measurementDays]).toEqual([65.4, 64.9, -0.5, 3]);
    expect(r.points[0].t).toBe(new Date("2026-10-01T03:00:00Z").getTime());
  });

  it("positive and zero change (no float drift)", () => {
    expect(buildWeightAnalytics([m("2026-10-01T03:00:00Z", "65.10"), m("2026-10-02T03:00:00Z", "65.90")], 30).changeKg).toBe(0.8);
    expect(buildWeightAnalytics([m("2026-10-01T03:00:00Z", "65.10"), m("2026-10-02T03:00:00Z", "65.10")], 30).changeKg).toBe(0);
  });

  it("several rows in one JST day -> ONE point: the latest measuredAt", () => {
    const r = buildWeightAnalytics([m("2026-10-06T03:00:00Z", "65.00"), m("2026-10-06T10:00:00Z", "64.50"), m("2026-10-06T00:00:00Z", "66.00")], 30);
    expect(r.points).toHaveLength(1);
    expect(r.points[0].weightKg).toBe(64.5);
  });

  it("same measuredAt: newest createdAt wins, then id", () => {
    const at = "2026-10-06T03:00:00Z";
    const byCreated = buildWeightAnalytics([
      m(at, "65.00", { createdAt: new Date("2026-10-06T04:00:00Z") }), m(at, "64.00", { createdAt: new Date("2026-10-06T05:00:00Z") }),
    ], 30);
    expect(byCreated.points[0].weightKg).toBe(64);
    const byId = buildWeightAnalytics([m(at, "65.00", { id: "a" }), m(at, "64.00", { id: "b" })], 30);
    expect(byId.points[0].weightKg).toBe(64);
    // input order must not matter
    expect(buildWeightAnalytics([m(at, "64.00", { id: "b" }), m(at, "65.00", { id: "a" })], 30).points[0].weightKg).toBe(64);
  });

  it("groups across the UTC day boundary by JST date", () => {
    // 2026-10-05T15:30Z = 10/06 00:30 JST; 2026-10-06T14:00Z = 10/06 23:00 JST -> same JST day
    const r = buildWeightAnalytics([m("2026-10-05T15:30:00Z", "65.00"), m("2026-10-06T14:00:00Z", "64.00"), m("2026-10-05T14:00:00Z", "66.00")], 30);
    expect(r.points.map((p) => [p.date, p.weightKg])).toEqual([["2026-10-05", 66], ["2026-10-06", 64]]);
  });

  it("body fat: null stays null (not 0), 0 stays 0, latestBodyFat is the newest day that recorded it", () => {
    const r = buildWeightAnalytics([
      m("2026-10-01T03:00:00Z", "65", { bodyFatPercent: D("15.20") }),
      m("2026-10-02T03:00:00Z", "65", { bodyFatPercent: D("0.00") }),
      m("2026-10-03T03:00:00Z", "65"),
    ], 30);
    expect(r.points.map((p) => p.bodyFatPercent)).toEqual([15.2, 0, null]);
    expect(r.latestBodyFat).toEqual({ date: "2026-10-02", percent: 0 });
  });
});

describe("buildNutritionAnalytics", () => {
  const end = new Date("2026-10-07T00:00:00.000Z");

  it("0 rows: every day null, no average", () => {
    const r = buildNutritionAnalytics([], end, 7);
    expect(r.daily).toHaveLength(7);
    expect(r.daily.every((d) => d.calories === null && d.entryCount === 0)).toBe(true);
    expect([r.loggedDays, r.averageCalories]).toEqual([0, null]);
  });

  it("covers the N JST dates ending on the end date, oldest -> newest", () => {
    const r = buildNutritionAnalytics([], end, 7);
    expect([r.daily[0].date, r.daily[6].date]).toEqual(["2026-10-01", "2026-10-07"]);
  });

  it("sums same-day entries; missing days stay null (never 0 kcal) and are excluded from the average", () => {
    const r = buildNutritionAnalytics([e("2026-10-07", 500), e("2026-10-07", 700), e("2026-10-05", 1000)], end, 7);
    expect(r.daily.find((d) => d.date === "2026-10-07")).toEqual({ date: "2026-10-07", calories: 1200, entryCount: 2 });
    expect(r.daily.find((d) => d.date === "2026-10-06")?.calories).toBeNull();
    expect([r.loggedDays, r.averageCalories]).toEqual([2, 1100]);
  });

  it("distinguishes a logged 0 kcal day from an unlogged day", () => {
    const r = buildNutritionAnalytics([e("2026-10-07", 0)], end, 7);
    expect(r.daily[6].calories).toBe(0);
    expect(r.loggedDays).toBe(1);
    expect(r.daily[5].calories).toBeNull();
  });
});

describe("analytics queries", () => {
  const date = new Date("2026-10-07T00:00:00.000Z");
  beforeEach(() => {
    vi.resetAllMocks();
    mocks.auth.mockResolvedValue({ id: owner });
    mocks.bodyMeasurement.findMany.mockResolvedValue([]);
    mocks.nutritionEntry.findMany.mockResolvedValue([]);
  });

  it("weight: ONE owner-scoped query over the JST instant range of the 30 days", async () => {
    await getWeightAnalyticsForUser(other, date);
    expect(mocks.bodyMeasurement.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.bodyMeasurement.findMany.mock.calls[0][0].where).toEqual({
      userId: other, measuredAt: { gte: new Date("2026-09-07T15:00:00.000Z"), lt: new Date("2026-10-07T15:00:00.000Z") },
    });
  });

  it("nutrition: ONE owner-scoped query over the 7 DATEs", async () => {
    await getNutritionAnalyticsForUser(other, date);
    expect(mocks.nutritionEntry.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.nutritionEntry.findMany.mock.calls[0][0].where).toEqual({
      userId: other, entryDate: { gte: new Date("2026-10-01T00:00:00.000Z"), lte: date },
    });
  });

  it("requireUser supplies the userId for both reads (2 queries total)", async () => {
    await getNutritionAnalytics(date);
    expect(mocks.bodyMeasurement.findMany.mock.calls[0][0].where.userId).toBe(owner);
    expect(mocks.nutritionEntry.findMany.mock.calls[0][0].where.userId).toBe(owner);
    expect(mocks.bodyMeasurement.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.nutritionEntry.findMany).toHaveBeenCalledTimes(1);
  });

  it("unauthenticated: nothing is read", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getNutritionAnalytics(date)).rejects.toThrow("REDIRECT");
    expect(mocks.bodyMeasurement.findMany).not.toHaveBeenCalled();
    expect(mocks.nutritionEntry.findMany).not.toHaveBeenCalled();
  });
});
