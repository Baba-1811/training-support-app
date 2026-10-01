import { beforeEach, describe, expect, it, vi } from "vitest";
import { NextRequest } from "next/server";
import type { CookieMethodsServer } from "@supabase/ssr";
import { AuthApiError } from "@supabase/supabase-js";
const mocks = vi.hoisted(() => ({
  create: vi.fn(), claims: vi.fn(), getAll: vi.fn(), set: vi.fn(),
}));
vi.mock("@supabase/ssr", () => ({ createServerClient: mocks.create }));
vi.mock("next/headers", () => ({ cookies: async () => ({ getAll: mocks.getAll, set: mocks.set }) }));
import { updateSession } from "@/lib/supabase/proxy";
import { createClient } from "@/lib/supabase/server";
function cookieMethods(): CookieMethodsServer {
  return mocks.create.mock.calls[0][2].cookies;
}
beforeEach(() => {
  vi.resetAllMocks();
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_URL", "https://example.supabase.co");
  vi.stubEnv("NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY", "test-public-key");
  mocks.getAll.mockReturnValue([]);
  mocks.create.mockReturnValue({ auth: { getClaims: mocks.claims } });
  mocks.claims.mockResolvedValue({ data: { claims: { sub: "user-id" } }, error: null });
});
describe("Proxy session cookies", () => {
  it("refreshes request and response cookies without sharing a client between requests", async () => {
    mocks.claims.mockImplementation(async () => {
      await cookieMethods().setAll!([{ name: "session", value: "refreshed", options: { path: "/", httpOnly: false } }],
        { "Cache-Control": "private, no-store" });
      return { data: { claims: { sub: "user-id" } }, error: null };
    });
    const req = new NextRequest("http://localhost:3000/");
    const result = await updateSession(req);
    expect(req.cookies.get("session")?.value).toBe("refreshed");
    expect(result.cookies.get("session")?.value).toBe("refreshed");
    expect(result.headers.get("cache-control")).toContain("no-store");
    await updateSession(new NextRequest("http://localhost:3000/"));
    expect(mocks.create).toHaveBeenCalledTimes(2);
  });
  it("keeps cookie deletion and no-store headers on unauthenticated redirects", async () => {
    mocks.claims.mockImplementation(async () => {
      await cookieMethods().setAll!([{ name: "session", value: "", options: { maxAge: 0, path: "/" } }], {});
      return { data: null, error: new Error("expired") };
    });
    const result = await updateSession(new NextRequest("http://localhost:3000/?private=secret"));
    expect(result.headers.get("location")).toBe("http://localhost:3000/login");
    expect(result.cookies.get("session")?.maxAge).toBe(0);
    expect(result.headers.get("cache-control")).toContain("no-store");
  });
  it.each(["/login", "/signup", "/check-email", "/auth/confirm", "/auth/error", "/auth/profile-error", "/auth/service-unavailable"])(
    "keeps public route %s reachable", async (path) => {
      mocks.claims.mockResolvedValue({ data: null, error: null });
      const result = await updateSession(new NextRequest("http://localhost:3000" + path));
      expect(result.headers.get("location")).toBeNull();
    },
  );
  // The reported Auth bug: Proxy's own getClaims() check hit the same 429 rate limit and forced every visitor
  // to /login. A transient Auth API failure here must not force that redirect — the authoritative, same-
  // classification check happens again in requireUser() once the request actually reaches a Server
  // Component/Action (see tests/auth/flows.test.ts's "server-side protection" describe block).
  it("does not redirect to /login on a transient Auth API failure (429) for a protected path", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: new AuthApiError("Request rate limit reached", 429, "over_request_rate_limit") });
    const result = await updateSession(new NextRequest("http://localhost:3000/"));
    expect(result.headers.get("location")).toBeNull();
  });
  it("still redirects to /login on a non-transient Auth API failure (invalid JWT)", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: new AuthApiError("Invalid JWT", 401, "bad_jwt") });
    const result = await updateSession(new NextRequest("http://localhost:3000/"));
    expect(result.headers.get("location")).toBe("http://localhost:3000/login");
  });
  it("does not allow unknown paths under a public prefix", async () => {
    mocks.claims.mockResolvedValue({ data: null, error: null });
    const result = await updateSession(new NextRequest("http://localhost:3000/auth/private"));
    expect(result.headers.get("location")).toContain("/login");
  });
});
describe("server client cookies", () => {
  it("writes all chunked cookies from actions/handlers", async () => {
    await createClient(true);
    await cookieMethods().setAll!([
      { name: "session.0", value: "a", options: { path: "/" } },
      { name: "session.1", value: "b", options: { path: "/" } },
    ], {});
    expect(mocks.set).toHaveBeenCalledTimes(2);
  });
  it("does not attempt cookie mutation during Server Component rendering", async () => {
    await createClient();
    await cookieMethods().setAll!([{ name: "session", value: "x", options: {} }], {});
    expect(mocks.set).not.toHaveBeenCalled();
  });
});
