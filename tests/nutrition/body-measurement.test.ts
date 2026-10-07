import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  bodyMeasurement: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { bodyMeasurement: mocks.bodyMeasurement } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "REDIRECT") throw error; } }));
import { createBodyMeasurement } from "@/app/(protected)/nutrition/actions";
import { createBodyMeasurementSchema } from "@/lib/nutrition/body-validation";

const owner = "11111111-1111-4111-8111-111111111111";
const rowId = "22222222-2222-4222-8222-222222222222";
const valid = { date: "2026-10-06", weightKg: "65.4", bodyFatPercent: "15.2" };
const parse = (over: Record<string, unknown> = {}) => createBodyMeasurementSchema.safeParse({ ...valid, ...over });

describe("createBodyMeasurementSchema", () => {
  it("accepts weight + body fat and converts the date to the JST date (UTC midnight anchor)", () => {
    const result = parse();
    expect(result.success && result.data).toEqual({ date: new Date("2026-10-06T00:00:00.000Z"), weightKg: 65.4, bodyFatPercent: 15.2 });
  });

  it.each(["65", "65.4", "65.45", "0.01", "999.99", " 70 "])("accepts weight %j", (weightKg) => {
    expect(parse({ weightKg }).success).toBe(true);
  });

  it.each(["", "  ", "0", "0.00", "-1", "-65.4", "65.456", "1000", "1e2", "6.5e1", "NaN", "Infinity", "abc", "65,4", "+65"])("rejects weight %j", (weightKg) => {
    expect(parse({ weightKg }).success).toBe(false);
  });

  it("rejects a missing weight", () => {
    expect(createBodyMeasurementSchema.safeParse({ date: "2026-10-06" }).success).toBe(false);
  });

  it("body fat blank/omitted -> null, 0 stays 0, decimals and 100 accepted", () => {
    expect(parse({ bodyFatPercent: "" }).data?.bodyFatPercent).toBeNull();
    expect(createBodyMeasurementSchema.safeParse({ date: "2026-10-06", weightKg: "65" }).data?.bodyFatPercent).toBeNull();
    expect(parse({ bodyFatPercent: "0" }).data?.bodyFatPercent).toBe(0);
    expect(parse({ bodyFatPercent: "12.34" }).data?.bodyFatPercent).toBe(12.34);
    expect(parse({ bodyFatPercent: "100" }).success).toBe(true);
  });

  it.each(["-1", "100.01", "101", "1.234", "1e1", "NaN", "Infinity", "abc"])("rejects body fat %j", (bodyFatPercent) => {
    expect(parse({ bodyFatPercent }).success).toBe(false);
  });

  it.each(["2026-02-30", "2026-10-6", "", "tomorrow", "2026-10-06T00:00:00Z"])("rejects date %j", (date) => {
    expect(parse({ date }).success).toBe(false);
  });

  it("rejects userId, measuredAt and unknown fields (strict)", () => {
    expect(parse({ userId: owner }).success).toBe(false);
    expect(parse({ measuredAt: "2026-10-06T00:00:00Z" }).success).toBe(false);
    expect(parse({ id: rowId }).success).toBe(false);
  });
});

describe("createBodyMeasurement (Server Action)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.auth.mockResolvedValue({ id: owner });
    mocks.bodyMeasurement.create.mockResolvedValue({ id: rowId });
  });

  it("requires authentication before touching the database", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(createBodyMeasurement(valid)).rejects.toThrow("REDIRECT");
    expect(mocks.bodyMeasurement.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("INSERTs for the authenticated user at 12:00 JST of the viewed date, then revalidates", async () => {
    await expect(createBodyMeasurement(valid)).resolves.toEqual({ ok: true, data: { id: rowId } });
    expect(mocks.bodyMeasurement.create).toHaveBeenCalledTimes(1);
    expect(mocks.bodyMeasurement.create.mock.calls[0][0].data).toEqual({
      userId: owner, measuredAt: new Date("2026-10-06T03:00:00.000Z"), weightKg: "65.40", bodyFatPercent: "15.20",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/nutrition");
  });

  it("stores a blank body fat as null and a recorded 0 as 0.00", async () => {
    await createBodyMeasurement({ ...valid, bodyFatPercent: "" });
    await createBodyMeasurement({ ...valid, bodyFatPercent: "0" });
    expect(mocks.bodyMeasurement.create.mock.calls[0][0].data.bodyFatPercent).toBeNull();
    expect(mocks.bodyMeasurement.create.mock.calls[1][0].data.bodyFatPercent).toBe("0.00");
  });

  it("same-day re-entry INSERTs another row and never updates, upserts or deletes (INSERT-only history)", async () => {
    await createBodyMeasurement(valid);
    await createBodyMeasurement({ ...valid, weightKg: "65.0" });
    expect(mocks.bodyMeasurement.create).toHaveBeenCalledTimes(2);
    for (const op of ["update", "updateMany", "upsert", "delete", "deleteMany"] as const) {
      expect(mocks.bodyMeasurement[op]).not.toHaveBeenCalled();
    }
  });

  it("rejects an injected userId without writing", async () => {
    const result = await createBodyMeasurement({ ...valid, userId: "99999999-9999-4999-8999-999999999999" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.bodyMeasurement.create).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input without writing or revalidating", async () => {
    const result = await createBodyMeasurement({ date: "bad", weightKg: "0", bodyFatPercent: "101" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    if (!result.ok) expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["date", "weightKg", "bodyFatPercent"]));
    expect(mocks.bodyMeasurement.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("hides raw Prisma errors behind a generic message", async () => {
    mocks.bodyMeasurement.create.mockRejectedValue(new Error("P2002 Unique constraint failed on secret_table"));
    const result = await createBodyMeasurement(valid);
    expect(result).toEqual({ ok: false, code: "FAILED", message: "保存できませんでした。時間をおいて再試行してください。" });
    expect(JSON.stringify(result)).not.toContain("secret_table");
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
