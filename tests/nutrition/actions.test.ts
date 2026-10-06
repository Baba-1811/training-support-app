import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
  auth: vi.fn(),
  nutritionEntry: { create: vi.fn(), updateMany: vi.fn(), deleteMany: vi.fn() },
  revalidate: vi.fn(),
}));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { nutritionEntry: mocks.nutritionEntry } }));
vi.mock("next/cache", () => ({ revalidatePath: mocks.revalidate }));
vi.mock("next/navigation", () => ({ unstable_rethrow: (error: unknown) => { if (error instanceof Error && error.message === "REDIRECT") throw error; } }));
import { createNutritionEntry, deleteNutritionEntry, updateNutritionEntry } from "@/app/(protected)/nutrition/actions";

const owner = "11111111-1111-4111-8111-111111111111";
const entryId = "22222222-2222-4222-8222-222222222222";
const fields = { mealType: "DINNER", name: "  鮭  ", calories: "300", proteinGrams: "25.5", fatGrams: "", carbsGrams: "0" };
const createInput = { entryDate: "2026-09-28", ...fields };

beforeEach(() => {
  vi.resetAllMocks();
  vi.spyOn(console, "error").mockImplementation(() => {});
  mocks.auth.mockResolvedValue({ id: owner });
  mocks.nutritionEntry.create.mockResolvedValue({ id: entryId });
  mocks.nutritionEntry.updateMany.mockResolvedValue({ count: 1 });
  mocks.nutritionEntry.deleteMany.mockResolvedValue({ count: 1 });
});

describe("authentication", () => {
  it.each([
    ["create", () => createNutritionEntry(createInput)],
    ["update", () => updateNutritionEntry({ id: entryId, ...fields })],
    ["delete", () => deleteNutritionEntry({ id: entryId })],
  ])("%s requires authentication before touching the database", async (_name, run) => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(run()).rejects.toThrow("REDIRECT");
    expect(mocks.nutritionEntry.create).not.toHaveBeenCalled();
    expect(mocks.nutritionEntry.updateMany).not.toHaveBeenCalled();
    expect(mocks.nutritionEntry.deleteMany).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("createNutritionEntry", () => {
  it("creates with the authenticated user, trimmed name, UTC-midnight date, 1-decimal macros and null for blank", async () => {
    await expect(createNutritionEntry(createInput)).resolves.toEqual({ ok: true, data: { id: entryId } });
    expect(mocks.nutritionEntry.create.mock.calls[0][0].data).toEqual({
      userId: owner, entryDate: new Date("2026-09-28T00:00:00.000Z"), mealType: "DINNER", name: "鮭", calories: 300,
      proteinGrams: "25.5", fatGrams: null, carbsGrams: "0.0",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/nutrition");
  });

  it("ignores/rejects a client-supplied userId", async () => {
    const result = await createNutritionEntry({ ...createInput, userId: "99999999-9999-4999-8999-999999999999" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.nutritionEntry.create).not.toHaveBeenCalled();
  });

  it("returns field errors for invalid input without writing or revalidating", async () => {
    const result = await createNutritionEntry({ ...createInput, name: "   ", calories: "-5" });
    expect(result).toMatchObject({ ok: false, code: "VALIDATION" });
    if (!result.ok) expect(Object.keys(result.fieldErrors ?? {})).toEqual(expect.arrayContaining(["name", "calories"]));
    expect(mocks.nutritionEntry.create).not.toHaveBeenCalled();
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("hides raw Prisma errors behind a generic message", async () => {
    mocks.nutritionEntry.create.mockRejectedValue(new Error("P2002 secret detail"));
    const result = await createNutritionEntry(createInput);
    expect(result).toEqual({ ok: false, code: "FAILED", message: "保存できませんでした。時間をおいて再試行してください。" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });
});

describe("updateNutritionEntry", () => {
  it("updates constrained by id AND the authenticated userId, never touching entryDate", async () => {
    await expect(updateNutritionEntry({ id: entryId, ...fields })).resolves.toEqual({ ok: true, data: { id: entryId } });
    const args = mocks.nutritionEntry.updateMany.mock.calls[0][0];
    expect(args.where).toEqual({ id: entryId, userId: owner });
    expect(args.data).toEqual({
      mealType: "DINNER", name: "鮭", calories: 300, proteinGrams: "25.5", fatGrams: null, carbsGrams: "0.0",
    });
    expect(mocks.revalidate).toHaveBeenCalledWith("/nutrition");
  });

  it("another user's or a missing entry (0 rows) is NOT_FOUND, with no revalidation", async () => {
    mocks.nutritionEntry.updateMany.mockResolvedValue({ count: 0 });
    const result = await updateNutritionEntry({ id: entryId, ...fields });
    expect(result).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects invalid input and a bad id before any write", async () => {
    expect(await updateNutritionEntry({ id: "bad", ...fields })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await updateNutritionEntry({ id: entryId, ...fields, proteinGrams: "1.25" })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.nutritionEntry.updateMany).not.toHaveBeenCalled();
  });

  it("hides raw Prisma errors", async () => {
    mocks.nutritionEntry.updateMany.mockRejectedValue(new Error("connection string leaked"));
    expect(await updateNutritionEntry({ id: entryId, ...fields })).toMatchObject({ ok: false, code: "FAILED" });
  });
});

describe("deleteNutritionEntry", () => {
  it("deletes constrained by id AND the authenticated userId, then revalidates", async () => {
    await expect(deleteNutritionEntry({ id: entryId })).resolves.toEqual({ ok: true, data: { id: entryId } });
    expect(mocks.nutritionEntry.deleteMany.mock.calls[0][0]).toEqual({ where: { id: entryId, userId: owner } });
    expect(mocks.revalidate).toHaveBeenCalledWith("/nutrition");
  });

  it("another user's or a missing entry is NOT_FOUND", async () => {
    mocks.nutritionEntry.deleteMany.mockResolvedValue({ count: 0 });
    expect(await deleteNutritionEntry({ id: entryId })).toMatchObject({ ok: false, code: "NOT_FOUND" });
    expect(mocks.revalidate).not.toHaveBeenCalled();
  });

  it("rejects an invalid id or an injected userId", async () => {
    expect(await deleteNutritionEntry({ id: "bad" })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(await deleteNutritionEntry({ id: entryId, userId: owner })).toMatchObject({ ok: false, code: "VALIDATION" });
    expect(mocks.nutritionEntry.deleteMany).not.toHaveBeenCalled();
  });

  it("hides raw Prisma errors", async () => {
    mocks.nutritionEntry.deleteMany.mockRejectedValue(new Error("boom"));
    expect(await deleteNutritionEntry({ id: entryId })).toMatchObject({ ok: false, code: "FAILED" });
  });
});
