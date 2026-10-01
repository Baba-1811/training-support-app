import { describe, expect, it } from "vitest";
import { AuthApiError, AuthRetryableFetchError } from "@supabase/supabase-js";
import { isTransientAuthFailure } from "@/lib/auth/classify-error";

describe("isTransientAuthFailure", () => {
  it("is transient for a 429 rate limit (the reported bug's exact shape)", () => {
    expect(isTransientAuthFailure(new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit"))).toBe(true);
  });

  it("is transient for a 5xx Auth API failure", () => {
    expect(isTransientAuthFailure(new AuthApiError("Internal server error", 500, "unexpected_failure"))).toBe(true);
    expect(isTransientAuthFailure(new AuthApiError("Service unavailable", 503, "unexpected_failure"))).toBe(true);
  });

  it("is transient for a network-level failure (no response at all)", () => {
    expect(isTransientAuthFailure(new AuthRetryableFetchError("fetch failed", 0))).toBe(true);
  });

  it("is NOT transient for a genuinely invalid/missing session (401/400)", () => {
    expect(isTransientAuthFailure(new AuthApiError("Invalid JWT", 401, "bad_jwt"))).toBe(false);
    expect(isTransientAuthFailure(new AuthApiError("Invalid credentials", 400, "invalid_credentials"))).toBe(false);
  });

  it("is NOT transient for null, undefined, or a plain Error (no session at all / unrelated failure)", () => {
    expect(isTransientAuthFailure(null)).toBe(false);
    expect(isTransientAuthFailure(undefined)).toBe(false);
    expect(isTransientAuthFailure(new Error("expired"))).toBe(false);
  });
});
