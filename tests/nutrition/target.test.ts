import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  nutritionTarget: { create: vi.fn(), update: vi.fn(), updateMany: vi.fn(), upsert: vi.fn(), delete: vi.fn(), deleteMany: vi.fn() },
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { nutritionTarget: mocks.nutritionTarget } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "REDIRECT") throw error; } }));
import { createNutritionTarget } from "@/app/(protected)/nutrition/actions";
import { createNutritionTargetSchema } from "@/lib/nutrition/validation";

const owner = "11111111-1111-4111-8111-111111111111";
const targetId = "22222222-2222-4222-8222-222222222222";
const valid = { effectiveFrom: "2026-10-06", targetCalories: "2200", targetProtein: "150", targetFat: "60.5", targetCarbs: "" };
const parse = (over: Record<string, unknown> = {}) => createNutritionTargetSchema.safeParse({ ...valid, ...over });

describe("createNutritionTargetSchema", () => {
  it("accepts calories only (macros omitted -> null)", () => {
    const result = createNutritionTargetSchema.safeParse({ effectiveFrom: "2026-10-06", targetCalories: "2000" });
    expect(result.success && result.data).toEqual({
      effectiveFrom: new Date("2026-10-06T00:00:00.000Z"), targetCalories: 2000, targetProtein: null, targetFat: null, targetCarbs: null,
    });
  });

  it("accepts calories + PFC, blank macro -> null", () => {
    const result = parse();
    expect(result.success && result.data).toEqual({
      effectiveFrom: new Date("2026-10-06T00:00:00.000Z"), targetCalories: 2200, targetProtein: 150, targetFat: 60.5, targetCarbs: null,
    });
  });

  it("keeps a macro of 0 as 0, distinct from blank", () => {
    const result = parse({ targetProtein: "0", targetFat: "" });
    expect(result.success && [result.data.targetProtein, result.data.targetFat]).toEqual([0, null]);
  });

  it.each(["-1", "1.5", "", "abc", "1e3", "20001", "NaN", "Infinity"])("rejects calories %j", (targetCalories) => {
    expect(parse({ targetCalories }).success).toBe(false);
  });

  it.each(["-1", "1.25", "10000", "1e2", "NaN", "Infinity", "abc"])("rejects macro %j", (value) => {
    expect(parse({ targetProtein: value }).success).toBe(false);
    expect(parse({ targetFat: value }).success).toBe(false);
    expect(parse({ targetCarbs: value }).success).toBe(false);
  });

  it("accepts the Decimal(5,1) max", () => {
    expect(parse({ targetCarbs: "9999.9" }).success).toBe(true);
  });

  it.each(["2026-02-30", "2026-10-6", "", "tomorrow", "2026-10-06T00:00:00Z"])("rejects effectiveFrom %j", (effectiveFrom) => {
    expect(parse({ effectiveFrom }).success).toBe(false);
  });

  it("rejects userId and unknown fields (strict)", () => {
    expect(parse({ userId: owner }).success).toBe(false);
    expect(parse({ id: targetId }).success).toBe(false);
  });
});

describe("createNutritionTarget (Server Action)", () => {
  beforeEach(() => {
    vi.resetAllMocks();
    vi.spyOn(console, "error").mockImplementation(() => {});
    mocks.auth.mockResolvedValue({ id: owner });
    mocks.nutritionTarget.create.mockResolvedValue({ id: targetId });
  });

  it("requires authentication before touching the database", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(createNutritionTarget(valid)).rejects.toThrow("REDIRECT");
    expect(mocks.nutritionTarget.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("INSERTs a new row for the authenticated user with the validated JST date, then revalidates", async () => {
    await expect(createNutritionTarget(valid)).resolves.toEqual({ ok: true, data: { id: targetId } });
    expect(mocks.nutritionTarget.create).toHaveBeenCalledTimes(1);
    expect(mocks.nutritionTarget.create.mock.calls[0][0].data).toEqual({
      userId: owner, effectiveFrom: new Date("2026-10-06T00:00:00.000Z"), targetCalories: 2200,
      targetProtein: "150.0", targetFat: "60.5", targetCarbs: null,
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/nutrition");
  });

  it("never updates, upserts or deletes existing targets (INSERT-only history), even when re-saving the same day", async () => {
    await createNutritionTarget(valid);
    await createNutritionTarget({ ...valid, targetCalories: "2400" });
    expect(mocks.nutritionTarget.create).toHaveBeenCalledTimes(2);
    for (const op of ["update", "updateMany", "upsert", "delete", "deleteMany"] as const) {
      expect(mocks.nutritionTarget[op]).not.toHaveBeenCalled();
    }
  });

  it("rejects an injected userId without writing", async () => {
    const result = await createNutritionTarget({ ...valid, userId: "99999999-9999-4999-8999-999999999999" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.nutritionTarget.create).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input without writing or revalidating", async () => {
    const result = await createNutritionTarget({ ...valid, targetCalories: "-1", targetFat: "1.25", effectiveFrom: "bad" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    if (!result.ok) expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["targetCalories", "targetFat", "effectiveFrom"]));
    expect(mocks.nutritionTarget.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("hides raw Prisma errors", async () => {
    mocks.nutritionTarget.create.mockRejectedValue(new Error("P2003 secret"));
    expect(await createNutritionTarget(valid)).toEqual({ ok: false, code: "FAILED", message: "保存できませんでした。時間をおいて再試行してください。" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});
