import "server-only";
import { cache } from "react";
import { redirect } from "next/navigation";
import { createClient } from "@/lib/supabase/server";
import { isTransientAuthFailure } from "./classify-error";
import { ensureProfile, reportProfileFailure } from "./profile";

export const requireUser = cache(async () => {
  const supabase = await createClient();
  const { data: { user }, error } = await supabase.auth.getUser();
  if (error) {
    // A rate limit or a Supabase outage is not "you are signed out": redirecting to /login here would be
    // both wrong and misleading (the session may be perfectly valid). Still fail-closed — this never returns a
    // user, so no protected data is reachable either way — just to a different page than "please log in".
    if (isTransientAuthFailure(error)) redirect("/auth/service-unavailable");
    redirect("/login");
  }
  if (!user) redirect("/login");
  if (!user.email_confirmed_at) redirect("/check-email");
  try {
    return await ensureProfile(user, true);
  } catch {
    reportProfileFailure();
    redirect("/auth/profile-error");
  }
});
