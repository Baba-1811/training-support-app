import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ auth: vi.fn(), exercise: { findMany: vi.fn(), findFirst: vi.fn() } }));
vi.mock("@/lib/auth/require-user", () => ({ requireUser: mocks.auth }));
vi.mock("@/lib/prisma", () => ({ prisma: { exercise: mocks.exercise } }));
import { getExercise, listExercises } from "@/lib/exercises/queries";

const id = "33333333-3333-4333-8333-333333333333";
const row = {
  id, name: "Bench Press", equipmentType: "BARBELL", description: "d", instructions: "i", tips: "t",
  exerciseMuscles: [
    { role: "SECONDARY", muscle: { name: "Triceps" } },
    { role: "PRIMARY", muscle: { name: "Chest" } },
    { role: "SECONDARY", muscle: { name: "Front Deltoid" } },
  ],
};

beforeEach(() => {
  vi.resetAllMocks();
  mocks.auth.mockResolvedValue({ id: "11111111-1111-4111-8111-111111111111" });
});

describe("listExercises", () => {
  it("checks authentication itself, even without the protected layout", async () => {
    mocks.exercise.findMany.mockResolvedValue([]);
    await listExercises();
    expect(mocks.auth).toHaveBeenCalled();
  });

  it("does not query when unauthenticated", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(listExercises()).rejects.toThrow("REDIRECT");
    expect(mocks.exercise.findMany).not.toHaveBeenCalled();
  });

  it("loads active exercises with their active muscles in ONE query (no N+1)", async () => {
    mocks.exercise.findMany.mockResolvedValue([row, { ...row, id: "x", name: "Squat" }]);
    await listExercises();
    expect(mocks.exercise.findMany).toHaveBeenCalledTimes(1);
    expect(mocks.exercise.findFirst).not.toHaveBeenCalled();
    const args = mocks.exercise.findMany.mock.calls[0][0];
    expect(args.where).toEqual({ isActive: true });
    expect(args.select.exerciseMuscles).toEqual({
      where: { muscle: { isActive: true } }, select: { role: true, muscle: { select: { name: true } } },
    });
  });

  it("splits PRIMARY and SECONDARY muscles into plain DTOs (no userId, no Prisma extras)", async () => {
    mocks.exercise.findMany.mockResolvedValue([row]);
    expect(await listExercises()).toEqual([{
      id, name: "Bench Press", equipmentType: "BARBELL", primaryMuscles: ["Chest"], secondaryMuscles: ["Front Deltoid", "Triceps"],
    }]);
  });

  it("returns an exercise with no muscles as empty lists", async () => {
    mocks.exercise.findMany.mockResolvedValue([{ ...row, exerciseMuscles: [] }]);
    expect(await listExercises()).toMatchObject([{ primaryMuscles: [], secondaryMuscles: [] }]);
  });
});

describe("getExercise", () => {
  it("checks authentication itself", async () => {
    mocks.auth.mockRejectedValue(new Error("REDIRECT"));
    await expect(getExercise(id)).rejects.toThrow("REDIRECT");
    expect(mocks.exercise.findFirst).not.toHaveBeenCalled();
  });

  it("loads one ACTIVE exercise with its muscles in one query", async () => {
    mocks.exercise.findFirst.mockResolvedValue(row);
    const detail = await getExercise(id);
    expect(mocks.exercise.findFirst).toHaveBeenCalledTimes(1);
    expect(mocks.exercise.findMany).not.toHaveBeenCalled();
    const args = mocks.exercise.findFirst.mock.calls[0][0];
    expect(args.where).toEqual({ id, isActive: true });
    expect(args.select).toMatchObject({ description: true, instructions: true, tips: true });
    expect(detail).toEqual({
      id, name: "Bench Press", equipmentType: "BARBELL", description: "d", instructions: "i", tips: "t",
      primaryMuscles: ["Chest"], secondaryMuscles: ["Front Deltoid", "Triceps"],
    });
  });

  it("returns null for an inactive or unknown exercise (the query itself filters isActive)", async () => {
    mocks.exercise.findFirst.mockResolvedValue(null);
    expect(await getExercise(id)).toBeNull();
    expect(mocks.exercise.findFirst.mock.calls[0][0].where.isActive).toBe(true);
  });

  it.each(["", "not-a-uuid", "1234", "../etc/passwd"])("returns null without querying for a malformed id %j", async (bad) => {
    expect(await getExercise(bad)).toBeNull();
    expect(mocks.exercise.findFirst).not.toHaveBeenCalled();
  });

  it("keeps null text columns as null so the page can omit those sections", async () => {
    mocks.exercise.findFirst.mockResolvedValue({ ...row, description: null, instructions: null, tips: null });
    expect(await getExercise(id)).toMatchObject({ description: null, instructions: null, tips: null });
  });
});
