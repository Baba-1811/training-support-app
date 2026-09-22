import { beforeEach, describe, expect, it, vi } from "vitest";
import type { User } from "@supabase/supabase-js";
const db = vi.hoisted(() => ({ findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }));
vi.mock("@/lib/prisma", () => ({ prisma: { user: db } }));
import { ensureProfile } from "@/lib/auth/profile";
const user = {
  id: "auth-uuid", email: "owner@example.com", user_metadata: { name: "太郎" },
app_metadata: {}, aud: "authenticated", created_at: "2026-09-21T00:00:00Z",
} satisfies User;
describe("profile synchronization", () => {
  beforeEach(() => { vi.resetAllMocks(); });
  it("creates with Auth UUID and the existing required fields", async () => {
    db.findUnique.mockResolvedValue(null);
    await ensureProfile(user);
    expect(db.create).toHaveBeenCalledWith({ data: {
      id: user.id, email: user.email, name: "太郎", trainingLevel: "BEGINNER",
    } });
  });
  it("preserves an existing profile on duplicate signup", async () => {
    const existing = { id: user.id, email: user.email, name: "変更済み", trainingLevel: "ADVANCED" };
    db.findUnique.mockResolvedValue(existing);
    expect(await ensureProfile(user)).toBe(existing);
    expect(db.create).not.toHaveBeenCalled();
    expect(db.update).not.toHaveBeenCalled();
  });
  it("syncs confirmed email by UUID only", async () => {
    db.findUnique.mockResolvedValue({ id: user.id, email: "old@example.com" });
    await ensureProfile(user, true);
    expect(db.update).toHaveBeenCalledWith({ where: { id: user.id }, data: { email: user.email } });
  });
  it("recovers from a transient create failure on a later request", async () => {
    db.findUnique.mockResolvedValue(null);
    db.create.mockRejectedValueOnce(new Error("offline")).mockResolvedValueOnce({ id: user.id });
    await expect(ensureProfile(user)).rejects.toThrow("offline");
    await expect(ensureProfile(user, true)).resolves.toEqual({ id: user.id });
  });
  it("accepts the winner of concurrent creates for the same UUID", async () => {
    const winner = { id: user.id, email: user.email };
    db.findUnique.mockResolvedValueOnce(null).mockResolvedValueOnce(winner);
    db.create.mockRejectedValue({ code: "P2002" });
    expect(await ensureProfile(user)).toBe(winner);
  });
  it("does not link an existing different UUID by matching email", async () => {
    db.findUnique.mockResolvedValue(null);
    db.create.mockRejectedValue({ code: "P2002" });
    await expect(ensureProfile(user)).rejects.toEqual({ code: "P2002" });
    expect(db.findUnique.mock.calls.every(([args]) => args.where.id === user.id)).toBe(true);
    expect(db.update).not.toHaveBeenCalled();
  });
  it("fails closed when a verified email conflicts with another profile", async () => {
    db.findUnique.mockResolvedValue({ id: user.id, email: "old@example.com" });
    db.update.mockRejectedValue({ code: "P2002" });
    await expect(ensureProfile(user, true)).rejects.toEqual({ code: "P2002" });
  });
  it("handles invalid metadata without accepting permissions from metadata", async () => {
    db.findUnique.mockResolvedValue(null);
    await ensureProfile({ ...user, user_metadata: { name: {}, trainingLevel: "ADVANCED", role: "admin" } });
    expect(db.create.mock.calls[0][0].data).toMatchObject({ name: "ユーザー", trainingLevel: "BEGINNER" });
  });
});
