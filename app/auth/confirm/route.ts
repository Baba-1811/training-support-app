import { NextResponse, type NextRequest } from "next/server";
import { createClient } from "@/lib/supabase/server";
import { ensureProfile, reportProfileFailure } from "@/lib/auth/profile";
import { appUrl } from "@/lib/auth/app-url";

const MAX_PARAM_LENGTH = 1024;

// Supported links:
// - PKCE (current, default Supabase email): /auth/confirm?code=...
//   Supabase's /auth/v1/verify has already confirmed the email and redirects here with a
//   one-time code. It can only be exchanged by the browser that started signup (verifier cookie).
// - Token hash (custom email template / custom SMTP): /auth/confirm?token_hash=...&type=email
// Only what Auth verifies is trusted: no user id or email is ever read from the URL.
export async function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  function finish(path: string) {
    const response = NextResponse.redirect(new URL(path, appUrl()), 303);
    response.headers.set("Cache-Control", "private, no-store");
    response.headers.set("Referrer-Policy", "no-referrer");
    return response;
  }
  // Supabase reports failed/expired links as error, error_code and error_description.
  if (params.has("error") || params.has("error_code") || params.has("error_description")) {
    return finish("/auth/error");
  }
  // Never guess which method was intended.
  if (params.has("code") && params.has("token_hash")) return finish("/auth/error");
  const code = params.get("code");
  const tokenHash = params.get("token_hash");
  const usesCode = params.has("code");
  if (usesCode ? !code || code.length > MAX_PARAM_LENGTH
    : !tokenHash || tokenHash.length > MAX_PARAM_LENGTH || params.get("type") !== "email") {
    return finish("/auth/error");
  }

  const supabase = await createClient(true);
  let user;
  try {
    const { error } = usesCode
      ? await supabase.auth.exchangeCodeForSession(code!)
      : await supabase.auth.verifyOtp({ token_hash: tokenHash!, type: "email" });
    if (error) return finish("/auth/error");
    // Re-verify with the Auth server instead of trusting the exchange/verify response or the URL.
    const result = await supabase.auth.getUser();
    if (result.error) return finish("/auth/error");
    user = result.data.user;
  } catch {
    return finish("/auth/error");
  }
  if (!user?.email_confirmed_at) return finish("/auth/error");
  try {
    await ensureProfile(user, true);
  } catch {
    reportProfileFailure();
    return finish("/auth/profile-error");
  }
  return finish("/");
}
