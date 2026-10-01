import { isAuthApiError, isAuthRetryableFetchError } from "@supabase/supabase-js";

// A rate limit (429, code "over_request_rate_limit"), a 5xx from Supabase's Auth API, or a network-level
// failure (isAuthRetryableFetchError) means the Auth service could not answer the question, not that the
// answer was "no". These must never be classified the same way as a genuinely missing/invalid session: see
// lib/auth/require-user.ts and lib/supabase/proxy.ts, the two places that ask Supabase "is this user signed
// in?" and must not mistake "I don't know, try again" for "no, redirect to /login".
//
// This still never grants access on a transient failure (no fail-open): both call sites keep redirecting away
// from protected data, just to a different destination (a "try again shortly" page instead of /login), and
// Home/Server Actions still cannot run without a confirmed user either way.
export function isTransientAuthFailure(error: unknown): boolean {
  if (isAuthRetryableFetchError(error)) return true;
  if (isAuthApiError(error)) return error.status === 429 || error.status >= 500;
  return false;
}
