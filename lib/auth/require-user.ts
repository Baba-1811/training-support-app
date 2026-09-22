import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile, reportProfileFailure } from "./profile";

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error || !user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/check-email");
  try {
    return await ensureProfile(user, true);
  } catch {
    reportProfileFailure();
    redirect("/auth/profile-error");
  }
});
