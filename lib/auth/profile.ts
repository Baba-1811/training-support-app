import "server-only";
import type { User as AuthUser } from "@supabase/supabase-js";
import { prisma } from "@/lib/prisma";
import { nameSchema } from "./validation";

// Only accept users returned by Auth, never an ID from form data.
export async function ensureProfile(user: AuthUser, syncEmail = false) {
  if (!user.email) throw new Error("Auth email is missing");
  const name = nameSchema.safeParse(user.user_metadata?.name);
  const email = user.email;
  const existing = await prisma.user.findUnique({ where: { id: user.id } });
  if (existing) {
    if (syncEmail && existing.email !== email) {
      // Email collisions fail; never attach another UUID's records.
      return prisma.user.update({ where: { id: user.id }, data: { email } });
    }
    return existing;
  }
  try {
    return await prisma.user.create({
      data: { id: user.id, email, name: name.success ? name.data : "ユーザー", trainingLevel: "BEGINNER" },
    });
  } catch (error) {
    // Confirmation/login may concurrently observe a missing profile.
    if (typeof error === "object" && error && "code" in error && error.code === "P2002") {
      const winner = await prisma.user.findUnique({ where: { id: user.id } });
      if (winner && winner.email === email) return winner;
    }
    throw error;
  }
}
export function reportProfileFailure() {
  // Raw Prisma errors may contain personal information or connection details.
  console.error("AUTH_PROFILE_SYNC_FAILED: check DB availability and User UUID/email conflicts");
}
