import { beforeEach, describe, expect, it, vi } from "vitest";

// Auth call amplification fix: these internal *ForUser variants (lib/workouts/queries.ts) must never call
// requireUser() themselves — they trust the userId the caller already confirmed once with requireUser() (see
// app/(protected)/page.tsx). Mocking require-user to a function that throws if invoked makes any accidental
// re-authentication inside these variants fail the test loudly instead of silently passing via a mocked resolve.
const mocks = vi.hoisted(() => ({
  session: { findMany: vi.fn() },
  entry: { findMany: vi.fn() },
}));
vi.mock("@/lib/auth/require-user", () => ({
  requireUser: vi.fn(() => { throw new Error("requireUser() should not be called by a ForUser variant"); }),
}));
vi.mock("@/lib/prisma", () => ({ prisma: { workoutSession: mocks.session, workoutExercise: mocks.entry } }));
import {
  getLatestExercisePerformanceForUser, listCompletedWorkoutsForUser, listExerciseTrendsForUser, listInProgressWorkoutsForUser,
} from "@/lib/workouts/queries";

const owner = "11111111-1111-4111-8111-111111111111";
const other = "99999999-9999-4999-8999-999999999999";

beforeEach(() => {
  vi.resetAllMocks();
  mocks.session.findMany.mockResolvedValue([]);
  mocks.entry.findMany.mockResolvedValue([]);
});

describe("listCompletedWorkoutsForUser", () => {
  it("never calls requireUser() — it trusts the given userId", async () => {
    await expect(listCompletedWorkoutsForUser(owner)).resolves.toEqual([]);
  });

  it("scopes strictly to the given userId, not any other", async () => {
    await listCompletedWorkoutsForUser(owner);
    expect(mocks.session.findMany.mock.calls[0][0].where).toMatchObject({ userId: owner });
    mocks.session.findMany.mockClear();
    await listCompletedWorkoutsForUser(other);
    expect(mocks.session.findMany.mock.calls[0][0].where).toMatchObject({ userId: other });
  });
});

describe("listInProgressWorkoutsForUser", () => {
  it("never calls requireUser() — it trusts the given userId", async () => {
    await expect(listInProgressWorkoutsForUser(owner)).resolves.toEqual([]);
    expect(mocks.session.findMany.mock.calls[0][0].where).toMatchObject({ userId: owner });
  });
});

describe("listExerciseTrendsForUser", () => {
  it("never calls requireUser() — it trusts the given userId", async () => {
    await expect(listExerciseTrendsForUser(owner)).resolves.toEqual([]);
    expect(mocks.entry.findMany.mock.calls[0][0].where.workoutSession).toMatchObject({ userId: owner });
  });
});

describe("getLatestExercisePerformanceForUser", () => {
  it("never calls requireUser() — it trusts the given userId", async () => {
    await expect(getLatestExercisePerformanceForUser(owner, ["exercise-1"])).resolves.toEqual({});
    expect(mocks.entry.findMany.mock.calls[0][0].where.workoutSession).toMatchObject({ userId: owner });
  });

  it("returns {} immediately (no query at all) for an empty exercise list", async () => {
    await expect(getLatestExercisePerformanceForUser(owner, [])).resolves.toEqual({});
    expect(mocks.entry.findMany).not.toHaveBeenCalled();
  });
});
